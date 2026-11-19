// cover.js — the cover-art renderer for Vice Cover Studio.
//
// Everything in this file draws on a plain 2D canvas, offline, with no
// network and no third-party code. A "cover state" is a small plain object:
//
//   {
//     width, height,            // export size in pixels, e.g. 1920 x 1080
//     layout,                   // 'triptych' | 'duo' | 'hero' | 'quad'
//     grade,                    // 'sunset' | 'neon' | 'dusk' | 'noir'
//     title, subtitle,          // caption text, edited live in the editor
//     captionPosition,          // 'bottom' | 'top' | 'centre'
//     textColour,               // hex colour of the title lettering
//     grain,                    // true | false
//     panels: [                 // one entry per panel of the layout
//       { image, zoom, offsetX, offsetY }, ...
//     ]
//   }
//
// A panel's image is an HTMLImageElement (or an offscreen canvas) that the
// editor loaded from the user's own machine. zoom is a scale factor around
// 1.0; offsetX / offsetY pan the photo inside its panel in fractions of the
// panel size. All drawing is deterministic: the grain uses a seeded
// generator, so the same state always paints the same pixels.

export const LAYOUTS = {
  triptych: { panels: 3, label: 'Triptych poster' },
  duo: { panels: 2, label: 'Duo split' },
  hero: { panels: 1, label: 'Single hero' },
  quad: { panels: 4, label: 'Four grid' },
};

export const GRADES = {
  sunset: { label: 'Vice Sunset', filter: 'saturate(1.35) contrast(1.1) brightness(1.03)' },
  neon: { label: 'Neon Nights', filter: 'saturate(1.6) contrast(1.14) brightness(0.98)' },
  dusk: { label: 'Palm Dusk', filter: 'saturate(1.15) contrast(1.06) brightness(0.96)' },
  noir: { label: 'Mono Noir', filter: 'grayscale(1) contrast(1.18) brightness(1.02)' },
};

export const EXPORT_SIZES = [
  { key: '1080x1080', width: 1080, height: 1080, label: 'Square · 1080 × 1080' },
  { key: '1080x1350', width: 1080, height: 1350, label: 'Portrait · 1080 × 1350' },
  { key: '1920x1080', width: 1920, height: 1080, label: 'Landscape · 1920 × 1080' },
];

// A tiny deterministic generator, so grain and sparkle never change
// between two renders of the same cover.
export function seededRandom(seed) {
  let value = seed >>> 0;
  return function nextRandom() {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Cover-fit a photo inside a rectangle, honouring the panel zoom and pan.
export function fitPhotoToPanel(image, rect, zoom, offsetX, offsetY) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const rectRatio = rect.width / rect.height;
  let drawWidth;
  let drawHeight;
  if (imageRatio > rectRatio) {
    drawHeight = rect.height;
    drawWidth = drawHeight * imageRatio;
  } else {
    drawWidth = rect.width;
    drawHeight = drawWidth / imageRatio;
  }
  const scale = Math.max(1, zoom || 1);
  drawWidth *= scale;
  drawHeight *= scale;
  const x = rect.x + (rect.width - drawWidth) / 2 + (offsetX || 0) * rect.width;
  const y = rect.y + (rect.height - drawHeight) / 2 + (offsetY || 0) * rect.height;
  return { x, y, width: drawWidth, height: drawHeight };
}

// Panel rectangles for a layout. Triptych and duo use slanted dividers, the
// angled slices of a GTA-style poster; hero is one full-bleed panel and
// quad is a plain 2 x 2 grid. Each panel is a polygon (a list of points)
// plus its bounding rectangle, used for the cover-fit math.
export function panelShapes(layout, width, height) {
  const gutter = Math.max(6, Math.round(width * 0.006));
  const slant = Math.round(width * 0.045);
  if (layout === 'hero') {
    return [{ points: [[0, 0], [width, 0], [width, height], [0, height]], rect: { x: 0, y: 0, width, height } }];
  }
  if (layout === 'duo') {
    const split = Math.round(width * 0.52);
    return [
      { points: [[0, 0], [split, 0], [split - slant, height], [0, height]], rect: { x: 0, y: 0, width: split, height } },
      { points: [[split + gutter, 0], [width, 0], [width, height], [split - slant + gutter, height]], rect: { x: split + gutter, y: 0, width: width - split - gutter, height } },
    ];
  }
  if (layout === 'quad') {
    const halfW = Math.floor((width - gutter) / 2);
    const halfH = Math.floor((height - gutter) / 2);
    return [
      { points: [[0, 0], [halfW, 0], [halfW, halfH], [0, halfH]], rect: { x: 0, y: 0, width: halfW, height: halfH } },
      { points: [[halfW + gutter, 0], [width, 0], [width, halfH], [halfW + gutter, halfH]], rect: { x: halfW + gutter, y: 0, width: width - halfW - gutter, height: halfH } },
      { points: [[0, halfH + gutter], [halfW, halfH + gutter], [halfW, height], [0, height]], rect: { x: 0, y: halfH + gutter, width: halfW, height: height - halfH - gutter } },
      { points: [[halfW + gutter, halfH + gutter], [width, halfH + gutter], [width, height], [halfW + gutter, height]], rect: { x: halfW + gutter, y: halfH + gutter, width: width - halfW - gutter, height: height - halfH - gutter } },
    ];
  }
  // triptych (default): a tall centre panel with two slanted side panels.
  const centreWidth = Math.round(width * 0.46);
  const sideWidth = Math.floor((width - centreWidth - gutter * 2) / 2);
  const leftEdge = sideWidth + gutter;
  const rightEdge = leftEdge + centreWidth;
  return [
    { points: [[0, 0], [leftEdge, 0], [leftEdge - slant, height], [0, height]], rect: { x: 0, y: 0, width: leftEdge, height } },
    { points: [[leftEdge + gutter, 0], [rightEdge, 0], [rightEdge - slant, height], [leftEdge + gutter - slant, height]], rect: { x: leftEdge + gutter, y: 0, width: centreWidth, height } },
    { points: [[rightEdge + gutter, 0], [width, 0], [width, height], [rightEdge + gutter - slant, height]], rect: { x: rightEdge + gutter, y: 0, width: width - rightEdge - gutter, height } },
  ];
}

function tracePolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

// Draw one photo into one panel, clipped to the panel polygon.
export function drawPanelPhoto(ctx, image, shape, panel, grade) {
  if (!image) return;
  ctx.save();
  tracePolygon(ctx, shape.points);
  ctx.clip();
  ctx.filter = (GRADES[grade] || GRADES.sunset).filter;
  const fit = fitPhotoToPanel(image, shape.rect, panel.zoom, panel.offsetX, panel.offsetY);
  ctx.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  ctx.restore();
  ctx.filter = 'none';
}

// A warm sunset wash, a neon magenta/cyan wash, a purple dusk wash, or a
// cool silver wash, painted over the whole cover at low strength.
export function applySunsetGrade(ctx, width, height, grade) {
  ctx.save();
  if (grade === 'neon') {
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, 'rgba(255, 0, 128, 0.20)');
    wash.addColorStop(0.55, 'rgba(120, 0, 255, 0.10)');
    wash.addColorStop(1, 'rgba(0, 229, 255, 0.20)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  } else if (grade === 'dusk') {
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(88, 28, 135, 0.22)');
    wash.addColorStop(0.6, 'rgba(219, 39, 119, 0.10)');
    wash.addColorStop(1, 'rgba(8, 47, 73, 0.26)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  } else if (grade === 'noir') {
    const wash = ctx.createLinearGradient(0, 0, width, 0);
    wash.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    wash.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  } else {
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(255, 214, 64, 0.14)');
    wash.addColorStop(0.45, 'rgba(255, 122, 26, 0.06)');
    wash.addColorStop(1, 'rgba(190, 18, 90, 0.24)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  }
  // A low sun glow in the top corner, the poster's light source.
  const glow = ctx.createRadialGradient(width * 0.82, height * 0.08, 0, width * 0.82, height * 0.08, width * 0.55);
  const glowColour = grade === 'neon' ? '255, 0, 170' : grade === 'noir' ? '255, 255, 255' : '255, 170, 60';
  glow.addColorStop(0, `rgba(${glowColour}, 0.30)`);
  glow.addColorStop(1, `rgba(${glowColour}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function applyNeonGrade(ctx, width, height) {
  // Neon Nights gets a second pass: thin cyan and magenta edge light along
  // the top and bottom of the cover, like a sign buzzing over the poster.
  ctx.save();
  const top = ctx.createLinearGradient(0, 0, width, 0);
  top.addColorStop(0, '#ff2d78');
  top.addColorStop(0.5, '#ff9e00');
  top.addColorStop(1, '#00e5ff');
  ctx.fillStyle = top;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, width, Math.max(4, height * 0.008));
  ctx.fillStyle = '#00e5ff';
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, height - Math.max(4, height * 0.008), width, Math.max(4, height * 0.008));
  ctx.restore();
}

// The bold caption: a slanted colour bar behind the title, the title in
// heavy condensed capitals with a thick dark outline and a coloured offset
// shadow, then the subtitle tracked out underneath.
export function drawBoldCaption(ctx, state) {
  const { width, height, title, subtitle, captionPosition, textColour } = state;
  const safeTitle = (title || 'SUNSET HEIST').toUpperCase();
  const safeSubtitle = (subtitle || '').toUpperCase();
  const margin = Math.round(width * 0.045);
  const titleSize = Math.round(width * (safeTitle.length > 14 ? 0.072 : 0.088));
  const subSize = Math.round(width * 0.026);
  const barHeight = titleSize * 1.55;
  const blockHeight = barHeight + (safeSubtitle ? subSize * 2.1 : height * 0.01);
  let top;
  if (captionPosition === 'top') top = Math.round(height * 0.06);
  else if (captionPosition === 'centre') top = Math.round((height - blockHeight) / 2);
  else top = Math.round(height - blockHeight - height * 0.055);

  ctx.save();
  // Slanted bar behind the title.
  const slant = Math.round(titleSize * 0.35);
  const barWidth = Math.min(width - margin * 2, titleSize * 0.62 * safeTitle.length + margin);
  ctx.beginPath();
  ctx.moveTo(margin + slant, top);
  ctx.lineTo(margin + barWidth, top);
  ctx.lineTo(margin + barWidth - slant, top + barHeight);
  ctx.lineTo(margin, top + barHeight);
  ctx.closePath();
  const bar = ctx.createLinearGradient(margin, top, margin + barWidth, top);
  bar.addColorStop(0, '#ff2d78');
  bar.addColorStop(0.55, '#ff7a1a');
  bar.addColorStop(1, '#ffb300');
  ctx.fillStyle = bar;
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const titleFont = `900 ${titleSize}px Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
  ctx.font = titleFont;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(titleSize * 0.02)}px`;
  const titleY = top + barHeight / 2 + titleSize * 0.03;
  const titleX = margin + Math.round(titleSize * 0.28);
  // Coloured offset shadow, then a thick dark outline, then the fill.
  ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
  ctx.fillText(safeTitle, titleX + titleSize * 0.07, titleY + titleSize * 0.07);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10, 2, 20, 0.95)';
  ctx.lineWidth = Math.max(4, titleSize * 0.16);
  ctx.strokeText(safeTitle, titleX, titleY);
  ctx.fillStyle = textColour || '#ffffff';
  ctx.fillText(safeTitle, titleX, titleY);

  if (safeSubtitle) {
    ctx.font = `700 ${subSize}px 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(subSize * 0.32)}px`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = 'rgba(10, 2, 20, 0.9)';
    ctx.lineWidth = Math.max(2, subSize * 0.18);
    const subY = top + barHeight + subSize * 1.15;
    ctx.strokeText(safeSubtitle, margin + slant * 0.5, subY);
    ctx.fillText(safeSubtitle, margin + slant * 0.5, subY);
  }
  ctx.restore();
}

// Palm silhouettes along the bottom edge, drawn from the caption text so
// every cover gets its own skyline. Simple, original shapes — no artwork
// borrowed from any game.
export function drawPalmSilhouettes(ctx, width, height, seedText) {
  const random = seededRandom(hashText(seedText || 'palms'));
  ctx.save();
  ctx.fillStyle = 'rgba(8, 2, 18, 0.5)';
  const groundY = height;
  for (let i = 0; i < 4; i += 1) {
    const x = width * (0.05 + random() * 0.9);
    const trunkH = height * (0.09 + random() * 0.08);
    const lean = (random() - 0.5) * width * 0.025;
    const trunkW = Math.max(5, width * 0.007);
    const topX = x + lean;
    const topY = groundY - trunkH;
    // A gently curving trunk, thick enough to read at a glance.
    ctx.beginPath();
    ctx.moveTo(x - trunkW / 2, groundY);
    ctx.quadraticCurveTo(x + lean * 0.3 - trunkW / 2, groundY - trunkH * 0.6, topX - trunkW / 2, topY);
    ctx.lineTo(topX + trunkW / 2, topY);
    ctx.quadraticCurveTo(x + lean * 0.3 + trunkW / 2, groundY - trunkH * 0.6, x + trunkW / 2, groundY);
    ctx.closePath();
    ctx.fill();
    // Fronds: filled, drooping blades fanning out from the crown.
    for (let f = 0; f < 6; f += 1) {
      const angle = Math.PI * (0.98 + f * 0.2);
      const len = width * (0.045 + random() * 0.025);
      const tipX = topX + Math.cos(angle) * len;
      const tipY = topY + Math.sin(angle) * len * 0.55 + height * 0.035;
      const midX = topX + Math.cos(angle) * len * 0.55;
      const midY = topY + Math.sin(angle) * len * 0.3 - height * 0.018;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.quadraticCurveTo(midX + Math.cos(angle + 0.35) * len * 0.3, midY + height * 0.012, topX, topY);
      ctx.closePath();
      ctx.fill();
    }
    // A small coconut cluster under the crown.
    ctx.beginPath();
    ctx.arc(topX, topY + trunkH * 0.02, Math.max(3, width * 0.004), 0, Math.PI * 2);
    ctx.arc(topX + trunkW, topY + trunkH * 0.03, Math.max(3, width * 0.004), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGrainVignette(ctx, width, height, seedText) {
  const random = seededRandom(hashText(seedText || 'grain') ^ 0x9e3779b9);
  ctx.save();
  const dots = Math.round((width * height) / 2600);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < dots; i += 1) {
    ctx.fillRect(random() * width, random() * height, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let i = 0; i < dots; i += 1) {
    ctx.fillRect(random() * width, random() * height, 1.6, 1.6);
  }
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(5, 0, 15, 0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// The small corner badge that marks the cover as made offline.
export function drawOfflineBadge(ctx, width, height) {
  const label = 'MADE OFFLINE · NO UPLOAD';
  const size = Math.max(13, Math.round(width * 0.013));
  ctx.save();
  ctx.font = `700 ${size}px 'Arial Narrow', Arial, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.22)}px`;
  const textWidth = ctx.measureText(label).width;
  const padX = size;
  const padY = Math.round(size * 0.55);
  const x = width - textWidth - padX * 2 - Math.round(width * 0.03);
  const y = Math.round(height * 0.03);
  ctx.fillStyle = 'rgba(8, 2, 18, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, textWidth + padX * 2, size + padY * 2, size);
  ctx.fill();
  ctx.fillStyle = '#00e5ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padX, y + size / 2 + padY);
  ctx.restore();
}

// Paint a whole cover onto the canvas, at the state's export size.
export function drawCoverArt(canvas, state) {
  const width = state.width;
  const height = state.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0214';
  ctx.fillRect(0, 0, width, height);

  const shapes = panelShapes(state.layout, width, height);
  shapes.forEach((shape, index) => {
    const panel = (state.panels && state.panels[index]) || {};
    drawPanelPhoto(ctx, panel.image || null, shape, panel, state.grade);
  });

  // Thin black gutters between panels, then the grade wash.
  ctx.save();
  ctx.fillStyle = '#0a0214';
  shapes.forEach((shape) => {
    tracePolygon(ctx, shape.points);
    ctx.lineWidth = Math.max(4, width * 0.006);
    ctx.strokeStyle = '#0a0214';
    ctx.stroke();
  });
  ctx.restore();

  applySunsetGrade(ctx, width, height, state.grade);
  if (state.grade === 'neon') applyNeonGrade(ctx, width, height);
  drawPalmSilhouettes(ctx, width, height, state.title || 'palms');
  drawBoldCaption(ctx, state);
  if (state.grain !== false) drawGrainVignette(ctx, width, height, state.title || 'grain');
  drawOfflineBadge(ctx, width, height);
  return canvas;
}

// Render the state to an offscreen canvas and hand back a PNG blob —
// this is what the Export button and the screenshot flow both call.
export function exportCoverPNG(state) {
  const canvas = document.createElement('canvas');
  drawCoverArt(canvas, state);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The cover did not render to a PNG.'));
    }, 'image/png');
  });
}

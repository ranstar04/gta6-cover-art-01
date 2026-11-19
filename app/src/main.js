// main.js — the editor for Vice Cover Studio.
//
// The editor keeps one plain `coverState` object (see cover.js) and
// re-renders a live preview canvas on every change. Photos are read with
// FileReader on the user's own machine and never leave it: there is no
// upload, no fetch and no network request anywhere in this app.
//
// The editor also answers the deterministic screenshot queries the maker
// uses, so a screenshot always shows the same cover:
//   ?shot=cover&photo=pier&caption=Sunset%20Heist&size=1920x1080
//   ?shot=editor&photo=boulevard&caption=Boulevard%20Queen
// With ?shot=cover the page shows only the finished cover, full-window.

import {
  LAYOUTS,
  GRADES,
  EXPORT_SIZES,
  panelShapes,
  drawCoverArt,
  exportCoverPNG,
} from './cover.js';

const SAMPLE_PHOTOS = {
  boulevard: { src: 'samples/boulevard.jpg', label: 'Boulevard — sunset convertible' },
  pier: { src: 'samples/pier.jpg', label: 'Pier — fishing at noon' },
};

const DEFAULT_STATE = {
  width: 1920,
  height: 1080,
  layout: 'triptych',
  grade: 'sunset',
  title: 'Sunset Heist',
  subtitle: 'Vice Coast · Summer 2026',
  captionPosition: 'bottom',
  textColour: '#ffffff',
  grain: true,
  panels: [
    { photoKey: 'boulevard', zoom: 1.15, offsetX: 0, offsetY: 0 },
    { photoKey: 'pier', zoom: 1.1, offsetX: 0, offsetY: 0 },
    { photoKey: 'boulevard', zoom: 1.15, offsetX: -0.04, offsetY: 0 },
  ],
};

const state = structuredClone(DEFAULT_STATE);
const loadedImages = new Map(); // photoKey -> HTMLImageElement
let selectedPanel = 1;
let dragStart = null;

const $ = (id) => document.getElementById(id);
const previewCanvas = $('previewCanvas');
const previewWrap = $('previewWrap');

export function currentExportSize() {
  return EXPORT_SIZES.find((size) => size.width === state.width && size.height === state.height)
    || EXPORT_SIZES[2];
}

export function coverStateForRender() {
  const shapes = panelShapes(state.layout, state.width, state.height);
  return {
    width: state.width,
    height: state.height,
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    captionPosition: state.captionPosition,
    textColour: state.textColour,
    grain: state.grain,
    panels: shapes.map((shape, index) => {
      const panel = state.panels[index] || { photoKey: null, zoom: 1, offsetX: 0, offsetY: 0 };
      return {
        image: panel.photoKey ? loadedImages.get(panel.photoKey) || null : null,
        zoom: panel.zoom,
        offsetX: panel.offsetX,
        offsetY: panel.offsetY,
      };
    }),
  };
}

export function renderLivePreview() {
  if (!previewCanvas) return;
  drawCoverArt(previewCanvas, coverStateForRender());
  const zoomLabel = $('zoomValue');
  const panel = state.panels[selectedPanel] || {};
  if (zoomLabel) zoomLabel.textContent = `${Math.round((panel.zoom || 1) * 100)}%`;
}

function loadImage(photoKey, src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      loadedImages.set(photoKey, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Could not load ${src}.`));
    image.src = src;
  });
}

async function loadSamplePhoto(photoKey) {
  const sample = SAMPLE_PHOTOS[photoKey];
  if (!sample || loadedImages.has(photoKey)) return;
  await loadImage(photoKey, sample.src);
}

async function loadAllSamples() {
  await Promise.all(Object.keys(SAMPLE_PHOTOS).map(loadSamplePhoto));
}

// Read the user's own photos from their machine (input or drag-and-drop).
// Each file becomes a photo in the tray; nothing is uploaded anywhere.
export function loadUserPhotos(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  files.forEach((file) => {
    const reader = new FileReader();
    const photoKey = `user-${Date.now()}-${Math.round(Math.random() * 100000)}`;
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        loadedImages.set(photoKey, image);
        addPhotoToTray(photoKey, file.name);
        // Put the first uploaded photo straight into the selected panel.
        state.panels[selectedPanel] = { ...state.panels[selectedPanel], photoKey };
        syncPanelControls();
        renderLivePreview();
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  if (files.length === 0) {
    $('statusLine').textContent = 'That file was not an image — try a JPG or PNG photo.';
  }
}

function addPhotoToTray(photoKey, label) {
  const tray = $('photoTray');
  if (!tray) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tray-photo';
  button.textContent = label.length > 18 ? `${label.slice(0, 16)}…` : label;
  button.title = `Use ${label} in the selected panel`;
  button.addEventListener('click', () => {
    state.panels[selectedPanel] = { ...state.panels[selectedPanel], photoKey };
    syncPanelControls();
    renderLivePreview();
    document.querySelectorAll('.tray-photo').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
  });
  tray.appendChild(button);
}

export function selectPanel(index) {
  const count = panelShapes(state.layout, state.width, state.height).length;
  selectedPanel = Math.max(0, Math.min(count - 1, index));
  document.querySelectorAll('.panel-chip').forEach((chip, i) => {
    chip.classList.toggle('active', i === selectedPanel);
  });
  syncPanelControls();
  renderLivePreview();
}

export function setLayoutPreset(layout) {
  if (!LAYOUTS[layout]) return;
  state.layout = layout;
  // Keep one panel entry per panel of the new layout, reusing photos.
  const count = LAYOUTS[layout].panels;
  const nextPanels = [];
  for (let i = 0; i < count; i += 1) {
    nextPanels.push(state.panels[i] || { photoKey: 'boulevard', zoom: 1.1, offsetX: 0, offsetY: 0 });
  }
  state.panels = nextPanels;
  selectedPanel = Math.min(selectedPanel, count - 1);
  buildPanelChips();
  syncPanelControls();
  document.querySelectorAll('[data-layout]').forEach((el) => el.classList.toggle('active', el.dataset.layout === layout));
  renderLivePreview();
}

export function setColourGrade(grade) {
  if (!GRADES[grade]) return;
  state.grade = grade;
  document.querySelectorAll('[data-grade]').forEach((el) => el.classList.toggle('active', el.dataset.grade === grade));
  renderLivePreview();
}

export function setCaptionTitle(title) {
  state.title = title;
  renderLivePreview();
}

export function setCaptionSubtitle(subtitle) {
  state.subtitle = subtitle;
  renderLivePreview();
}

export function setExportSize(key) {
  const size = EXPORT_SIZES.find((entry) => entry.key === key);
  if (!size) return;
  state.width = size.width;
  state.height = size.height;
  document.querySelectorAll('[data-size]').forEach((el) => el.classList.toggle('active', el.dataset.size === key));
  renderLivePreview();
}

export function panPhotoByDrag(deltaX, deltaY) {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  const rect = panelShapes(state.layout, state.width, state.height)[selectedPanel].rect;
  panel.offsetX = Math.max(-0.6, Math.min(0.6, (panel.offsetX || 0) + deltaX / rect.width));
  panel.offsetY = Math.max(-0.6, Math.min(0.6, (panel.offsetY || 0) + deltaY / rect.height));
  renderLivePreview();
}

export function zoomPhotoSlider(zoom) {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  panel.zoom = Math.max(1, Math.min(2.5, Number(zoom) || 1));
  renderLivePreview();
}

function syncPanelControls() {
  const panel = state.panels[selectedPanel] || {};
  const zoom = $('zoomSlider');
  if (zoom) zoom.value = String(panel.zoom || 1);
  const zoomLabel = $('zoomValue');
  if (zoomLabel) zoomLabel.textContent = `${Math.round((panel.zoom || 1) * 100)}%`;
  const status = $('statusLine');
  if (status) {
    status.textContent = `Panel ${selectedPanel + 1} of ${panelShapes(state.layout, state.width, state.height).length} selected — drag the preview to move its photo, or pick a photo from the tray.`;
  }
}

function buildPanelChips() {
  const row = $('panelRow');
  if (!row) return;
  row.innerHTML = '';
  const count = panelShapes(state.layout, state.width, state.height).length;
  for (let i = 0; i < count; i += 1) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `panel-chip${i === selectedPanel ? ' active' : ''}`;
    chip.textContent = `Panel ${i + 1}`;
    chip.addEventListener('click', () => selectPanel(i));
    row.appendChild(chip);
  }
}

function buildTraySamples() {
  const tray = $('photoTray');
  if (!tray) return;
  Object.entries(SAMPLE_PHOTOS).forEach(([key, sample]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-photo';
    button.textContent = sample.label;
    button.title = `Use the sample photo: ${sample.label}`;
    button.addEventListener('click', () => {
      state.panels[selectedPanel] = { ...state.panels[selectedPanel], photoKey: key };
      document.querySelectorAll('.tray-photo').forEach((el) => el.classList.remove('active'));
      button.classList.add('active');
      syncPanelControls();
      renderLivePreview();
    });
    tray.appendChild(button);
  });
}

function bindControls() {
  document.querySelectorAll('[data-layout]').forEach((el) => {
    el.addEventListener('click', () => setLayoutPreset(el.dataset.layout));
  });
  document.querySelectorAll('[data-grade]').forEach((el) => {
    el.addEventListener('click', () => setColourGrade(el.dataset.grade));
  });
  document.querySelectorAll('[data-size]').forEach((el) => {
    el.addEventListener('click', () => setExportSize(el.dataset.size));
  });
  $('titleInput').addEventListener('input', (event) => setCaptionTitle(event.target.value));
  $('subtitleInput').addEventListener('input', (event) => setCaptionSubtitle(event.target.value));
  $('captionPosition').addEventListener('change', (event) => {
    state.captionPosition = event.target.value;
    renderLivePreview();
  });
  document.querySelectorAll('[data-text-colour]').forEach((el) => {
    el.addEventListener('click', () => {
      state.textColour = el.dataset.textColour;
      document.querySelectorAll('[data-text-colour]').forEach((dot) => dot.classList.toggle('active', dot === el));
      renderLivePreview();
    });
  });
  $('grainToggle').addEventListener('change', (event) => {
    state.grain = event.target.checked;
    renderLivePreview();
  });
  $('zoomSlider').addEventListener('input', (event) => zoomPhotoSlider(event.target.value));
  $('fillAllButton').addEventListener('click', () => {
    const key = state.panels[selectedPanel].photoKey;
    state.panels = state.panels.map((panel) => ({ ...panel, photoKey: key }));
    renderLivePreview();
    $('statusLine').textContent = 'One photo now fills every panel, each with its own crop.';
  });
  $('shuffleButton').addEventListener('click', () => {
    const grades = Object.keys(GRADES);
    const layouts = Object.keys(LAYOUTS);
    setColourGrade(grades[Math.floor(Math.random() * grades.length)]);
    setLayoutPreset(layouts[Math.floor(Math.random() * layouts.length)]);
    $('statusLine').textContent = 'Shuffled the look — tweak it, then export.';
  });
  $('resetButton').addEventListener('click', () => {
    Object.assign(state, structuredClone(DEFAULT_STATE));
    selectedPanel = 1;
    buildPanelChips();
    syncPanelControls();
    $('titleInput').value = state.title;
    $('subtitleInput').value = state.subtitle;
    renderLivePreview();
  });

  const fileInput = $('photoInput');
  $('uploadButton').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (event) => {
    loadUserPhotos(event.target.files);
    fileInput.value = '';
  });

  // Drag-and-drop onto the preview, and drag-to-pan the selected photo.
  previewWrap.addEventListener('dragover', (event) => event.preventDefault());
  previewWrap.addEventListener('drop', (event) => {
    event.preventDefault();
    loadUserPhotos(event.dataTransfer.files);
  });
  previewCanvas.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, y: event.clientY, moved: false };
    previewCanvas.setPointerCapture(event.pointerId);
  });
  previewCanvas.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const rect = previewCanvas.getBoundingClientRect();
    const scaleX = state.width / rect.width;
    const scaleY = state.height / rect.height;
    const dx = (event.clientX - dragStart.x) * scaleX;
    const dy = (event.clientY - dragStart.y) * scaleY;
    if (Math.abs(event.clientX - dragStart.x) + Math.abs(event.clientY - dragStart.y) > 4) dragStart.moved = true;
    if (dragStart.moved) {
      panPhotoByDrag(dx, dy);
      dragStart.x = event.clientX;
      dragStart.y = event.clientY;
    }
  });
  previewCanvas.addEventListener('pointerup', (event) => {
    if (dragStart && !dragStart.moved) {
      // A click (not a drag) picks the panel under the cursor.
      const rect = previewCanvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (state.width / rect.width);
      const y = (event.clientY - rect.top) * (state.height / rect.height);
      const shapes = panelShapes(state.layout, state.width, state.height);
      const hit = shapes.findIndex((shape) => x >= shape.rect.x && x <= shape.rect.x + shape.rect.width && y >= shape.rect.y && y <= shape.rect.y + shape.rect.height);
      if (hit >= 0) selectPanel(hit);
    }
    dragStart = null;
  });

  $('exportButton').addEventListener('click', async () => {
    const button = $('exportButton');
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      const blob = await exportCoverPNG(coverStateForRender());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vice-cover-${state.width}x${state.height}.png`;
      link.click();
      URL.revokeObjectURL(url);
      $('statusLine').textContent = `Exported ${state.width} × ${state.height} PNG — check your downloads.`;
    } catch (error) {
      $('statusLine').textContent = `Export failed: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Export PNG';
    }
  });
}

// Deterministic screenshot mode: ?shot=cover renders only the finished
// cover full-window; ?shot=editor shows the editor with a photo loaded.
// Both honour &photo=, &caption=, &layout=, &grade= and &size=.
async function applyShotQuery() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return false;
  const photo = params.get('photo');
  if (photo && SAMPLE_PHOTOS[photo]) {
    state.panels = state.panels.map((panel) => ({ ...panel, photoKey: photo }));
  }
  const caption = params.get('caption');
  if (caption) state.title = caption;
  const layout = params.get('layout');
  if (layout && LAYOUTS[layout]) state.layout = layout;
  const grade = params.get('grade');
  if (grade && GRADES[grade]) state.grade = grade;
  const size = params.get('size');
  if (size) setExportSize(size);
  await loadAllSamples();
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const coverCanvas = $('shotCanvas');
    drawCoverArt(coverCanvas, coverStateForRender());
    document.title = `Cover — ${state.title}`;
  } else {
    buildPanelChips();
    syncPanelControls();
    renderLivePreview();
  }
  return true;
}

async function startEditor() {
  buildTraySamples();
  buildPanelChips();
  bindControls();
  await loadAllSamples();
  const inShotMode = await applyShotQuery();
  if (!inShotMode) {
    syncPanelControls();
    renderLivePreview();
  }
  window.__viceCover = {
    state,
    renderLivePreview,
    exportCoverPNG: () => exportCoverPNG(coverStateForRender()),
    setLayoutPreset,
    setColourGrade,
    setExportSize,
  };
}

startEditor();

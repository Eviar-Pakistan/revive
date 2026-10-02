/**
 * Revive flow:
 * Home → Camera Kit → Analyze → Lux-style circles + moisture mask → Get a Revive
 */

const THRESHOLD =
  typeof window.REVIVE_MOISTURE_THRESHOLD === 'number'
    ? window.REVIVE_MOISTURE_THRESHOLD
    : 50;

const CIRCLE_DEFS = [
  {
    key: 'moisture',
    label: 'Moisture',
    color: '#0288d1',
    fill: '#0288d1',
    togglesMask: true,
  },
];

let lastBlob = null;
let lastDataUrl = null;
let lastResult = null;
let analyzing = false;
/** True when preview came from Camera Kit (mirrored) and we are not using Makeupar resize base */
let previewIsMirrored = false;
let activeMaskKey = null;
let lastMaskUrl = null;
let lastBaseSrc = null;

function csrfToken() {
  const el = document.querySelector('[name=csrfmiddlewaretoken]');
  return el ? el.value : '';
}

function goToPage(n) {
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.remove('active');
    p.hidden = true;
  });
  const page = document.getElementById('page' + n);
  if (page) {
    page.hidden = false;
    page.classList.add('active');
  }
}
window.goToPage = goToPage;

function showCameraAnalyzeUi() {
  const ui = document.getElementById('cameraAnalyzeUi');
  const hint = document.getElementById('cameraHint');
  if (ui) {
    ui.hidden = false;
    ui.setAttribute('aria-hidden', 'false');
  }
  if (hint) hint.textContent = 'Checking moisture…';
}
window.showCameraAnalyzeUi = showCameraAnalyzeUi;

function hideCameraAnalyzeUi() {
  const ui = document.getElementById('cameraAnalyzeUi');
  if (ui) {
    ui.hidden = true;
    ui.setAttribute('aria-hidden', 'true');
  }
}
window.hideCameraAnalyzeUi = hideCameraAnalyzeUi;

async function openCamera() {
  if (!window.ReviveCameraKit || !window.ReviveCameraKit.open) {
    alert('Camera Kit failed to load. Check MAKEUPAR_API_KEY and refresh.');
    return;
  }
  try {
    await window.ReviveCameraKit.open();
  } catch (err) {
    console.error('Camera Kit error:', err);
  }
}

function closeCamera() {
  if (window.ReviveCameraKit && window.ReviveCameraKit.close) {
    window.ReviveCameraKit.close();
  }
  hideCameraAnalyzeUi();
  const stage = document.getElementById('cameraStage');
  if (stage) stage.classList.remove('is-analyzing');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Map 0–100 moisture health → Lux-style 0–10 circle score (higher = better hydration). */
function scoreOutOf10(score100) {
  const n = Number(score100);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n / 10)));
}

function clearMoistureMask() {
  const mask = document.getElementById('resultMaskLayer');
  if (!mask) return;
  mask.hidden = true;
  mask.removeAttribute('src');
  mask.onload = null;
  mask.onerror = null;
}

function setMoistureLegend(visible) {
  const legend = document.getElementById('moistureLegend');
  if (!legend) return;
  legend.hidden = !visible;
  legend.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function syncCircleActive(key) {
  document.querySelectorAll('.concern-circle-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.key === key);
  });
}

function applyMoistureMask(maskUrl) {
  const mask = document.getElementById('resultMaskLayer');
  if (!mask) return;
  clearMoistureMask();
  if (!maskUrl) {
    setMoistureLegend(false);
    return;
  }

  mask.onload = function () {
    mask.hidden = false;
    setMoistureLegend(true);
  };
  mask.onerror = function () {
    console.warn('Moisture mask failed to load:', maskUrl);
    clearMoistureMask();
    setMoistureLegend(false);
    const hint = document.getElementById('analysisHint');
    if (hint) hint.textContent = 'Mask unavailable for this scan — scores still shown below';
  };
  mask.alt = 'Moisture mask';
  // Bust cache / help some CDNs
  mask.crossOrigin = 'anonymous';
  mask.src = maskUrl;
}

function setActiveMask(key) {
  activeMaskKey = key || null;
  syncCircleActive(activeMaskKey);

  const resultImg = document.getElementById('resultImg');
  if (resultImg && lastBaseSrc) {
    resultImg.src = lastBaseSrc;
  }

  if (key === 'moisture' && lastMaskUrl) {
    applyMoistureMask(lastMaskUrl);
    const hint = document.getElementById('analysisHint');
    if (hint) hint.textContent = 'Moisture mask on — tap again to hide';
  } else {
    clearMoistureMask();
    setMoistureLegend(false);
    const hint = document.getElementById('analysisHint');
    if (hint) {
      hint.textContent = lastMaskUrl
        ? 'Tap Moisture to view the hydration mask'
        : 'Scores ready — moisture mask was not returned for this scan';
    }
  }
}

function renderConcernCircles(moisture100, hasMask) {
  const el = document.getElementById('concernCircles');
  if (!el) return;
  el.innerHTML = '';
  el.hidden = false;

  const moistureScore = scoreOutOf10(moisture100);
  const moisturePct = Number.isFinite(Number(moisture100))
    ? Math.round(Number(moisture100))
    : null;

  CIRCLE_DEFS.forEach((def) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'concern-circle-btn';
    btn.dataset.key = def.key;
    btn.style.setProperty('--concern-color', def.color);
    btn.style.setProperty('--concern-fill', def.fill);
    btn.disabled = def.togglesMask && !hasMask;

    const sub = moisturePct != null ? moisturePct + '%' : moistureScore + ' / 10';

    btn.setAttribute(
      'aria-label',
      def.label +
        ' score ' +
        moistureScore +
        ' of 10' +
        (def.togglesMask && hasMask ? ', tap to toggle mask' : '')
    );

    btn.innerHTML =
      '<span class="concern-circle-ring">' +
      '<span class="concern-circle-score">' +
      moistureScore +
      '</span>' +
      '</span>' +
      '<span class="concern-circle-label">' +
      def.label +
      '</span>' +
      '<span class="concern-circle-sub">' +
      sub +
      '</span>';

    btn.addEventListener('click', () => {
      if (!def.togglesMask || !lastMaskUrl) return;
      if (activeMaskKey === 'moisture') setActiveMask(null);
      else setActiveMask('moisture');
    });

    el.appendChild(btn);
  });
}

async function analyzeBlob(blob, previewUrl, options) {
  if (analyzing) return;
  analyzing = true;
  showCameraAnalyzeUi();
  const opts = options || {};

  try {
    const form = new FormData();
    form.append('image', blob, 'selfie.jpg');

    const resp = await fetch('/api/analyze-moisture/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrfToken() },
      body: form,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Moisture analysis failed. Please try again.');
    }

    lastResult = data;
    lastBlob = blob;
    lastDataUrl = previewUrl;
    previewIsMirrored = !!opts.mirrored;
    closeCamera();
    showAnalysis(data, previewUrl);
  } catch (err) {
    hideCameraAnalyzeUi();
    const stage = document.getElementById('cameraStage');
    if (stage) stage.classList.remove('is-analyzing');
    alert(err.message || 'Analysis failed.');
  } finally {
    analyzing = false;
  }
}

/** Called by camera-kit.js after YMK faceDetectionCaptured (auto-capture). */
async function onCameraKitCaptured(file, dataUrl) {
  lastBlob = file;
  lastDataUrl = dataUrl;
  showCameraAnalyzeUi();
  try {
    await analyzeBlob(file, dataUrl, { mirrored: true });
  } catch (error) {
    console.error('Camera Kit analyze error:', error);
    alert('Error: ' + (error && error.message ? error.message : 'Moisture analysis failed'));
    hideCameraAnalyzeUi();
  }
}
window.onCameraKitCaptured = onCameraKitCaptured;

function showAnalysis(data, previewUrl) {
  const img = document.getElementById('resultImg');
  const preview = document.getElementById('analysisPreview');
  const getRevive = document.getElementById('btnGetRevive');
  const allSet = document.getElementById('analysisAllSet');

  // Prefer Makeupar resize_image so the moisture mask aligns to the same frame
  const baseUrl = data.base_image_url || previewUrl || '';
  const usingApiBase = !!(data.base_image_url);
  lastBaseSrc = baseUrl;
  lastMaskUrl = data.mask_url || null;

  if (img) img.src = baseUrl;

  if (preview) {
    // API base images are not mirrored; Camera Kit local preview is
    preview.classList.toggle('is-mirrored', previewIsMirrored && !usingApiBase);
  }

  const level = Number(data.moisture_level);
  lastResult = data;

  renderConcernCircles(level, !!lastMaskUrl);

  // >= threshold → hydrated enough: show "You're all set", hide Get a Revive
  // < threshold → recommend Revive CTA (page 4)
  const needsRevive = Number.isFinite(level) && level < THRESHOLD;
  if (getRevive) {
    getRevive.hidden = !needsRevive;
  }
  if (allSet) {
    allSet.hidden = needsRevive;
  }

  // Auto-show moisture mask when API returned one (Lux-style overlay)
  if (lastMaskUrl) {
    setActiveMask('moisture');
  } else {
    setActiveMask(null);
  }

  goToPage(3);
}

async function handleUpload(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const dataUrl = await blobToDataUrl(file);
  goToPage(2);
  showCameraAnalyzeUi();
  await analyzeBlob(file, dataUrl, { mirrored: false });
}

function resetAnalysisUi() {
  lastBlob = null;
  lastDataUrl = null;
  lastResult = null;
  lastMaskUrl = null;
  lastBaseSrc = null;
  activeMaskKey = null;
  clearMoistureMask();
  setMoistureLegend(false);
  const circles = document.getElementById('concernCircles');
  if (circles) {
    circles.innerHTML = '';
  }
  const getRevive = document.getElementById('btnGetRevive');
  const allSet = document.getElementById('analysisAllSet');
  if (getRevive) getRevive.hidden = false;
  if (allSet) allSet.hidden = true;
}

function wireUi() {
  const start = document.getElementById('btnTakeSelfie');
  const closeBtn = document.getElementById('btnCloseCamera');
  const uploadBtn = document.getElementById('btnUpload');
  const fileInput = document.getElementById('fileInput');
  const getRevive = document.getElementById('btnGetRevive');
  const retake = document.getElementById('btnRetake');
  const startOver = document.getElementById('btnStartOver');

  if (start) start.addEventListener('click', openCamera);
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeCamera();
      goToPage(1);
    });
  }
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      handleUpload(e).catch((err) => alert(err.message || 'Upload failed.'));
    });
  }
  if (getRevive) {
    getRevive.addEventListener('click', () => goToPage(4));
  }
  if (retake) {
    retake.addEventListener('click', () => {
      resetAnalysisUi();
      openCamera();
    });
  }
  if (startOver) {
    startOver.addEventListener('click', () => {
      resetAnalysisUi();
      goToPage(1);
    });
  }
}

document.addEventListener('DOMContentLoaded', wireUi);

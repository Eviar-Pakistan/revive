/**
 * Makeupar / Perfect Corp YMK Camera Kit for Revive.
 * Same SDK flow as Lux: quality checks + auto-capture.
 * Three parameters: Lighting · Look Straight · Face Position
 */
(function () {
  'use strict';

  var listenersBound = false;
  var kitOpen = false;
  var captureInFlight = false;
  var lastQuality = null;

  var QUALITY_OVERRIDES = {
    face_ratio_lower_threshold: 0.70,
    face_ratio_upper_threshold: 1,
    face_left_boundary_lower_threshold: 0,
    face_left_boundary_upper_threshold: 1,
    face_right_boundary_lower_threshold: 0,
    face_right_boundary_upper_threshold: 1,
    face_top_boundary_lower_threshold: 0,
    face_top_boundary_upper_threshold: 1,
    face_bottom_boundary_lower_threshold: 0,
    face_bottom_boundary_upper_threshold: 1,
    pitch_lower_threshold: -20,
    pitch_upper_threshold: 10,
    yaw_lower_threshold: -15,
    yaw_upper_threshold: 15,
    roll_lower_threshold: -15,
    roll_upper_threshold: 15,
    lighting_lower_threshold: 0.55,
    lighting_upper_threshold: 0.8,
    lighting_uneven_threshold: 0.2,
  };

  var BOOT_SETTLE_MS = 1400;
  var BOOT_MAX_MS = 12000;

  var bootObserver = null;
  var bootTimeoutTimer = null;
  var bootSettleTimer = null;
  var bootPoll = null;
  var bootActive = false;

  function ymkAvailable() {
    return typeof window.YMK !== 'undefined' && window.YMK;
  }

  function showCameraBootUi() {
    bootActive = true;
    clearTimeout(bootSettleTimer);
    bootSettleTimer = null;
    var stage = document.getElementById('cameraStage');
    if (stage) stage.classList.add('is-booting');
    var el = document.getElementById('cameraBootUi');
    if (el) {
      el.hidden = false;
      el.classList.add('is-active');
      el.setAttribute('aria-hidden', 'false');
    }
    watchForLiveVideo();
    clearTimeout(bootTimeoutTimer);
    bootTimeoutTimer = setTimeout(hideCameraBootUi, BOOT_MAX_MS);
  }

  function markCameraLive() {
    if (!bootActive || bootSettleTimer) return;
    bootSettleTimer = setTimeout(hideCameraBootUi, BOOT_SETTLE_MS);
  }

  function hideCameraBootUi() {
    bootActive = false;
    clearTimeout(bootTimeoutTimer);
    clearTimeout(bootSettleTimer);
    clearInterval(bootPoll);
    bootTimeoutTimer = null;
    bootSettleTimer = null;
    bootPoll = null;
    if (bootObserver) {
      bootObserver.disconnect();
      bootObserver = null;
    }
    var stage = document.getElementById('cameraStage');
    if (stage) stage.classList.remove('is-booting');
    var el = document.getElementById('cameraBootUi');
    if (!el) return;
    el.classList.remove('is-active');
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  }

  function kitVideoIsPlaying() {
    var module = document.getElementById('YMK-module');
    var video = module && module.querySelector('video');
    if (!video) return false;
    return video.readyState >= 2 && !video.paused && video.currentTime > 0;
  }

  function watchForLiveVideo() {
    var module = document.getElementById('YMK-module');
    if (!module) return;

    if (!bootObserver && typeof MutationObserver !== 'undefined') {
      bootObserver = new MutationObserver(function () {
        if (kitVideoIsPlaying()) markCameraLive();
      });
      bootObserver.observe(module, { childList: true, subtree: true });
    }

    clearInterval(bootPoll);
    bootPoll = setInterval(function () {
      if (kitVideoIsPlaying()) markCameraLive();
    }, 150);
  }

  function waitForYmk(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (ymkAvailable()) {
        resolve(window.YMK);
        return;
      }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ymkAvailable()) resolve(window.YMK);
        else reject(new Error('Camera Kit SDK failed to load. Check network or API key.'));
      }, timeoutMs || 12000);

      window.onYmkSdkReady = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(window.YMK);
      };

      var poll = setInterval(function () {
        if (ymkAvailable()) {
          clearInterval(poll);
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(window.YMK);
          }
        }
      }, 200);
    });
  }

  function updatePill() {
    /* Custom pills removed — Camera Kit renders Lighting / Look Straight / Face Position */
  }

  function positionStatus(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'good') return { ok: true, status: 'Good', hint: null };
    if (v === 'toosmall') return { ok: false, status: 'Come Closer', hint: 'Come closer — face must fill more of the frame' };
    if (v === 'outofboundary') return { ok: false, status: 'Out of Frame', hint: 'Center your face inside the frame' };
    return { ok: false, status: 'Not Good', hint: 'Adjust face position' };
  }

  function frontalStatus(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'good') return { ok: true, status: 'Good', hint: null };
    return { ok: false, status: 'Not Good', hint: 'Look straight at the camera' };
  }

  function lightingStatus(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'good') return { ok: true, status: 'Good', hint: null };
    if (v === 'ok') return { ok: true, status: 'OK', hint: null };
    return { ok: false, status: 'Not Good', hint: 'Increase light — face is too dark' };
  }

  function applyYmkQuality(q) {
    lastQuality = q || null;
    if (!q) return;

    var lighting = lightingStatus(q.lighting);
    var frontal = frontalStatus(q.frontal);
    var position = positionStatus(q.position);
    var hasFace = q.hasFace !== false;
    var allOk = hasFace && lighting.ok && frontal.ok && position.ok;

    var bottom = document.getElementById('cameraHint');
    if (bottom) {
      if (!hasFace) {
        bottom.textContent = 'Show your face in the frame';
      } else if (allOk) {
        bottom.textContent = 'Hold still — capture starts automatically';
      } else {
        bottom.textContent =
          lighting.hint || frontal.hint || position.hint ||
          'Follow Camera Kit checks — capture starts when ready';
      }
    }
  }

  function resetQualityPills() {
    /* no-op — Kit owns the three quality pillars */
  }

  function dataUrlToFile(dataUrl, filename) {
    var parts = String(dataUrl || '').split(',');
    var mimeMatch = parts[0] && parts[0].match(/:(.*?);/);
    var mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
    var binary = atob(parts[1] || '');
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename || 'revive-selfie.jpg', { type: mime });
  }

  function extractCapturedImage(result) {
    if (!result) return null;
    var images = result.images || result.image || null;
    if (!images) {
      if (typeof result === 'string') return result;
      if (result.dataUrl || result.base64) return result.dataUrl || result.base64;
      return null;
    }
    if (Array.isArray(images) && images.length) {
      var first = images[0];
      if (typeof first === 'string') return first;
      if (first && typeof first.image === 'string') return first.image;
      if (first && first.image instanceof Blob) return first.image;
      if (first instanceof Blob) return first;
    }
    if (typeof images === 'string') return images;
    return null;
  }

  function ensureDataUrl(image) {
    return new Promise(function (resolve, reject) {
      if (!image) {
        reject(new Error('No image from Camera Kit'));
        return;
      }
      if (typeof image === 'string') {
        if (image.indexOf('data:') === 0) {
          resolve(image);
          return;
        }
        resolve('data:image/jpeg;base64,' + image.replace(/^data:image\/\w+;base64,/, ''));
        return;
      }
      if (image instanceof Blob) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('Could not read Camera Kit image')); };
        reader.readAsDataURL(image);
        return;
      }
      reject(new Error('Unsupported Camera Kit image format'));
    });
  }

  function bindListeners() {
    if (listenersBound || !ymkAvailable()) return;
    listenersBound = true;

    YMK.addEventListener('faceQualityChanged', function (q) {
      markCameraLive();
      applyYmkQuality(q);
    });

    YMK.addEventListener('faceDetectionCaptured', function (result) {
      if (captureInFlight) return;
      captureInFlight = true;
      handleCapture(result).finally(function () {
        captureInFlight = false;
      });
    });
  }

  function handleCapture(result) {
    hideCameraBootUi();
    var stage = document.getElementById('cameraStage');
    if (stage) stage.classList.add('is-analyzing');
    if (typeof window.showCameraAnalyzeUi === 'function') {
      window.showCameraAnalyzeUi();
    }

    var raw = extractCapturedImage(result);
    return ensureDataUrl(raw)
      .then(function (dataUrl) {
        var file = dataUrlToFile(dataUrl, 'revive-selfie.jpg');
        if (typeof window.onCameraKitCaptured === 'function') {
          return window.onCameraKitCaptured(file, dataUrl);
        }
        throw new Error('Capture handler missing');
      })
      .catch(function (err) {
        console.error('Camera Kit capture error:', err);
        alert('Error: ' + (err && err.message ? err.message : 'Capture failed'));
        if (stage) stage.classList.remove('is-analyzing');
        if (typeof window.hideCameraAnalyzeUi === 'function') {
          window.hideCameraAnalyzeUi();
        }
      });
  }

  function moduleSize() {
    var stage = document.getElementById('cameraStage');
    var frame = document.querySelector('.camera-frame');
    var box = frame || stage;
    var w = box ? box.clientWidth : 0;
    var h = box ? box.clientHeight : 0;
    w = Math.max(320, Math.min(1920, w || Math.min(window.innerWidth - 16, 720)));
    h = Math.max(420, Math.min(1920, h || Math.min(window.innerHeight * 0.78, 900)));
    return { width: Math.round(w), height: Math.round(h) };
  }

  function clearYmkModule() {
    var el = document.getElementById('YMK-module');
    if (el) el.innerHTML = '';
  }

  function preflightCamera(retriesLeft) {
    var retries = typeof retriesLeft === 'number' ? retriesLeft : 3;
    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reject(new Error('This browser cannot access the camera. Please use Chrome or Edge, or upload a photo.'));
        return;
      }

      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }).then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setTimeout(function () { resolve(true); }, 120);
      }).catch(function (err) {
        var name = (err && err.name) || '';
        if ((name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') && retries > 0) {
          setTimeout(function () {
            preflightCamera(retries - 1).then(resolve, reject);
          }, 450);
          return;
        }
        if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          console.warn('preflightCamera soft-fail, continuing to Camera Kit', err);
          resolve(false);
          return;
        }
        var msg;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          msg = 'Camera permission was blocked. Allow camera access for this site, then try again.';
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          msg = 'No camera was found on this device. Please upload a photo instead.';
        } else {
          msg = 'Could not open the camera (' + (err && err.message ? err.message : name || 'unknown') + ').';
        }
        reject(new Error(msg));
      });
    });
  }

  function hideYmkInternalChrome() {
    var root = document.getElementById('YMK-module');
    if (!root) return;
    var nodes = root.querySelectorAll('img, button, div, span, a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var src = (el.getAttribute && el.getAttribute('src')) || '';
      var bg = '';
      try {
        bg = (el.style && el.style.backgroundImage) || '';
        if (!bg && window.getComputedStyle) {
          bg = window.getComputedStyle(el).backgroundImage || '';
        }
      } catch (e) { /* ignore */ }
      var blob = (src + ' ' + bg).toLowerCase();
      if (!/i-camera-flip|camera-flip/.test(blob)) continue;
      var target = el.closest ? (el.closest('button') || el.parentElement || el) : el;
      if (target) {
        target.style.setProperty('display', 'none', 'important');
        target.style.setProperty('visibility', 'hidden', 'important');
        target.style.setProperty('pointer-events', 'none', 'important');
        target.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function watchYmkChrome() {
    var root = document.getElementById('YMK-module');
    if (!root) return;
    hideYmkInternalChrome();
    if (root.__reviveCloseWatch) return;
    root.__reviveCloseWatch = true;
    var observer = new MutationObserver(function () {
      hideYmkInternalChrome();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class'],
    });
    var tries = 0;
    var timer = setInterval(function () {
      hideYmkInternalChrome();
      tries += 1;
      if (tries >= 20) clearInterval(timer);
    }, 250);
  }

  function initAndOpen() {
    var size = moduleSize();
    clearYmkModule();

    YMK.init({
      faceDetectionMode: 'skincare',
      imageFormat: 'base64',
      language: 'enu',
      width: size.width,
      height: size.height,
      hideFlipCameraButton: true,
      facingMode: 'user',
      disableCameraResolutionCheck: true,
      countingDuration: 800,
      qualityLevel: 'relaxed',
      qualityOverrides: QUALITY_OVERRIDES,
      videoQuality: '720p',
    });

    bindListeners();
    YMK.openCameraKit();
    kitOpen = true;
    watchYmkChrome();
  }

  function openCameraKitFlow() {
    var page = document.getElementById('page2');
    var hint = document.getElementById('cameraHint');
    if (!page) return Promise.reject(new Error('Camera page missing'));

    if (!window.REVIVE_CONFIG || !window.REVIVE_CONFIG.makeuparApiKey) {
      return Promise.reject(new Error(
        'Makeupar API key missing. Add MAKEUPAR_API_KEY to .env and restart the server.'
      ));
    }

    captureInFlight = false;
    resetQualityPills();
    showCameraBootUi();
    if (typeof window.goToPage === 'function') window.goToPage(2);
    if (hint) hint.textContent = 'Starting camera…';

    return waitForYmk(15000)
      .then(function () {
        try {
          if (ymkAvailable() && YMK.close) YMK.close();
        } catch (e) { /* ignore */ }
        kitOpen = false;
        clearYmkModule();
        return preflightCamera(3);
      })
      .then(function () {
        bindListeners();
        return new Promise(function (resolve, reject) {
          requestAnimationFrame(function () {
            setTimeout(function () {
              try {
                initAndOpen();
                if (hint) {
                  hint.textContent = 'Hold still when all three checks are Good — capture starts automatically';
                }
                resolve();
              } catch (e) {
                reject(e);
              }
            }, 250);
          });
        });
      })
      .catch(function (err) {
        console.error(err);
        hideCameraBootUi();
        alert((err && err.message) || 'Could not start Camera Kit. Please try again.');
        closeCameraKitFlow();
        if (typeof window.goToPage === 'function') window.goToPage(1);
        return Promise.reject(err);
      });
  }

  function closeCameraKitFlow() {
    hideCameraBootUi();
    try {
      if (ymkAvailable() && YMK.close) YMK.close();
    } catch (e) {
      console.warn('YMK.close failed', e);
    }
    kitOpen = false;
    clearYmkModule();
    var stage = document.getElementById('cameraStage');
    if (stage) stage.classList.remove('is-analyzing');
    resetQualityPills();
  }

  window.ReviveCameraKit = {
    open: openCameraKitFlow,
    close: closeCameraKitFlow,
    getLastQuality: function () { return lastQuality; },
    isOpen: function () { return kitOpen; },
  };

  // Lux-compatible alias so shared patterns work
  window.LuxCameraKit = window.ReviveCameraKit;

  if (ymkAvailable()) {
    window.__YMK_READY__ = true;
  }
})();

// ============================================================
// Barcode scanner helper (shared by pos.html and inventory.html)
//
//  1. Hardware scanners (USB / Bluetooth "keyboard" scanners):
//       Scanner.listenHardware(onScan)   -> POS only
//  2. Phone / laptop camera:
//       Scanner.openCamera({ title, continuous, onCode })
//
// Camera scanning uses the browser's built-in BarcodeDetector when
// available (Chrome on Android — works offline). Otherwise it lazy-loads
// the bundled ZXing library (js/vendor/zxing.min.js) — e.g. iPhone Safari.
// Camera access needs HTTPS (GitHub Pages / Netlify are fine).
// ============================================================
const Scanner = (() => {

  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

  // ---------- feedback: beep + toast ----------
  let audioCtx = null;
  function beep(ok = true) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = ok ? 1200 : 300;
      gain.gain.value = 0.08;
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25));
    } catch (e) { /* audio not available — ignore */ }
  }

  let toastTimer = null;
  function toast(message, type = 'ok') {
    let el = document.getElementById('scanner-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scanner-toast';
      el.style.cssText = 'position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:10001; ' +
        'padding:10px 16px; border-radius:10px; font-size:0.9rem; font-weight:600; max-width:90%; ' +
        'box-shadow:0 4px 14px rgba(0,0,0,0.25); color:#fff; text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = type === 'ok' ? '#065f46' : '#991b1b';
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2000);
  }

  // ---------- hardware (keyboard-wedge) scanners ----------
  // A scanner "types" the code very fast then presses Enter. We detect
  // that speed pattern so normal typing is never mistaken for a scan.
  // Only active when focus is on the page body or on the element ids in
  // `allowInputIds` (e.g. the POS search box), so typing in other fields
  // (customer phone, discount…) is never hijacked.
  function listenHardware(onScan, opts = {}) {
    const minLength = opts.minLength || 4;
    const maxGapMs = opts.maxGapMs || 80;
    const allowInputIds = opts.allowInputIds || [];
    let buffer = '';
    let lastKeyAt = 0;

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const t = e.target;
      const isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (isField && !allowInputIds.includes(t.id)) { buffer = ''; return; }

      if (e.key === 'Enter') {
        if (buffer.length >= minLength) {
          e.preventDefault();
          const code = buffer;
          buffer = '';
          const matched = onScan(code);
          // Matched: remove the scanned characters from the search box. If nothing
          // matched we leave them, in case someone just typed fast (and so the
          // list shows what was searched).
          if (matched !== false && isField && typeof t.value === 'string' && t.value.endsWith(code)) {
            t.value = t.value.slice(0, -code.length);
            t.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          buffer = '';
        }
        return;
      }

      if (e.key.length !== 1) return;            // ignore Shift, Tab, arrows…
      const now = performance.now();
      if (now - lastKeyAt > maxGapMs) buffer = ''; // too slow = human typing
      buffer += e.key;
      lastKeyAt = now;
    }, true);
  }

  // ---------- camera scanning ----------
  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/zxing.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the scanner library. Connect to the internet once so it can be saved for offline use.'));
      document.head.appendChild(s);
    });
  }

  async function openCamera({ title = 'Scan barcode', continuous = false, onCode }) {
    if (document.getElementById('scanner-overlay')) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Camera not available. Use https:// and allow camera access.', 'error');
      return;
    }

    // ----- overlay UI -----
    const overlay = document.createElement('div');
    overlay.id = 'scanner-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:10000; background:#000; display:flex; flex-direction:column;';
    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; color:#fff;">
        <strong>${title}</strong>
        <div style="display:flex; gap:8px;">
          <button id="scanner-torch" type="button" style="display:none; padding:8px 12px;">🔦</button>
          <button id="scanner-close" type="button" style="padding:8px 14px;">Close</button>
        </div>
      </div>
      <div style="position:relative; flex:1; min-height:0;">
        <video id="scanner-video" playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
        <div style="position:absolute; left:10%; right:10%; top:35%; height:30%; border:3px solid #22c55e; border-radius:12px; box-shadow:0 0 0 9999px rgba(0,0,0,0.35); pointer-events:none;"></div>
      </div>
      <div id="scanner-status" style="padding:14px; color:#fff; text-align:center; font-size:0.9rem;">Starting camera…</div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('#scanner-video');
    const statusEl = overlay.querySelector('#scanner-status');
    let stopped = false;
    let stream = null;
    let zxingReader = null;
    let lastCode = '', lastAt = 0;

    function stop() {
      stopped = true;
      try { if (zxingReader) zxingReader.reset(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      overlay.remove();
    }
    overlay.querySelector('#scanner-close').onclick = stop;

    function handle(code) {
      const now = Date.now();
      if (code === lastCode && now - lastAt < 2000) return;  // same barcode still in view
      lastCode = code; lastAt = now;
      const result = onCode(code);
      if (continuous) {
        statusEl.textContent = 'Last scan: ' + code + ' — keep scanning, or press Close';
      } else {
        if (result !== false) { beep(true); stop(); }
      }
    }

    try {
      // Prefer native detector
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const supported = await BarcodeDetector.getSupportedFormats();
          const formats = FORMATS.filter(f => supported.includes(f));
          if (formats.length) detector = new BarcodeDetector({ formats });
        } catch (e) { detector = null; }
      }

      if (detector) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        statusEl.textContent = 'Point the camera at the barcode';

        // Torch (flashlight) button, where supported
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) {
          const tb = overlay.querySelector('#scanner-torch');
          let on = false;
          tb.style.display = 'inline-block';
          tb.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); };
        }

        (async function tick() {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              if (found.length && found[0].rawValue) handle(found[0].rawValue);
            }
          } catch (e) { /* frame not ready — try again */ }
          if (!stopped) setTimeout(tick, 120);
        })();

      } else {
        // Fallback: ZXing (iPhone Safari, older browsers)
        statusEl.textContent = 'Loading scanner…';
        await loadZXing();
        if (stopped) return;
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.QR_CODE
        ]);
        zxingReader = new ZXing.BrowserMultiFormatReader(hints, 250);
        await zxingReader.decodeFromConstraints(
          { video: { facingMode: 'environment' }, audio: false },
          video,
          (result) => { if (result && !stopped) handle(result.getText()); }
        );
        statusEl.textContent = 'Point the camera at the barcode';
      }
    } catch (err) {
      console.error('Scanner error:', err);
      statusEl.textContent = (err && err.name === 'NotAllowedError')
        ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
        : 'Could not start the camera: ' + (err && err.message ? err.message : err);
    }
  }

  // Store-internal barcode for items that don't have one (e.g. clothes).
  // Starts with 29 (the range reserved for in-store codes).
  function generateCode() {
    const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return '29' + String(Date.now()).slice(-8) + rand;
  }

  return { listenHardware, openCamera, beep, toast, generateCode };
})();

// KR Track - Real-Time Inline Optical Camera Barcode Scanner
(function() {
  let activeStream = null;
  let isScanning = false;
  let lastScannedCode = '';
  let lastScanTimestamp = 0;
  let zxingReader = null;
  let audioCtx = null;

  function playSuccessBeep() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // A6
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // AudioContext may be restricted before user gesture
    }
  }

  window.stopInlineScanner = function() {
    isScanning = false;
    if (zxingReader) {
      try {
        zxingReader.reset();
      } catch (e) {}
      zxingReader = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      activeStream = null;
    }
  };

  window.startInlineScanner = function(container, onCodeCallback) {
    window.stopInlineScanner();
    if (!container) return;

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.borderRadius = '16px';
    container.style.backgroundColor = '#0A0E17';

    // 1. Check if mediaDevices is supported (requires HTTPS or localhost in modern browsers)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = window.location.protocol === 'http:';
      const httpsUrl = `https://${window.location.hostname}:8443${window.location.pathname}${window.location.search}${window.location.hash}`;
      
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:14px;text-align:center;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,94,58,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:8px;border:1px solid rgba(255,94,58,0.3);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5E3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div style="font-weight:800;font-size:12px;color:#FF5E3A;margin-bottom:4px;letter-spacing:0.5px;">CAMERA PERMISSION BLOCKED BY BROWSER</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-bottom:12px;line-height:1.4;max-width:320px;">
            Browsers restrict camera access on non-localhost HTTP.<br/>
            Switch to the secure <b>HTTPS Camera Server</b> below:
          </div>
          <a href="${httpsUrl}" target="_self" 
             style="background:linear-gradient(135deg,#00B8FF,#2875FF);color:#fff;padding:8px 18px;border-radius:10px;text-decoration:none;font-weight:800;font-size:11px;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(40,117,255,0.4);display:inline-flex;align-items:center;gap:6px;">
            <span>⚡ Open in Secure HTTPS Camera Mode</span>
          </a>
        </div>
      `;
      return;
    }

    // 2. Loading state inside viewfinder
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#00B8FF;font-family:sans-serif;z-index:2;background:#0A0E17;';
    loadingDiv.innerHTML = `
      <div style="width:28px;height:28px;border:3px solid rgba(0,184,255,0.2);border-top-color:#00B8FF;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:8px;"></div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.6px;color:#fff;">INITIALIZING OPTICAL SCANNER...</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px;">Please allow camera permission when prompted</div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    container.appendChild(loadingDiv);

    // 3. Create Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    container.appendChild(video);

    // 4. Viewfinder Reticle Overlay & Animated Laser
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
    overlay.innerHTML = `
      <!-- Corner Brackets -->
      <div style="position:absolute;top:12px;left:14px;width:18px;height:18px;border-top:2.5px solid #00B8FF;border-left:2.5px solid #00B8FF;border-top-left-radius:6px;"></div>
      <div style="position:absolute;top:12px;right:14px;width:18px;height:18px;border-top:2.5px solid #00B8FF;border-right:2.5px solid #00B8FF;border-top-right-radius:6px;"></div>
      <div style="position:absolute;bottom:12px;left:14px;width:18px;height:18px;border-bottom:2.5px solid #00B8FF;border-left:2.5px solid #00B8FF;border-bottom-left-radius:6px;"></div>
      <div style="position:absolute;bottom:12px;right:14px;width:18px;height:18px;border-bottom:2.5px solid #00B8FF;border-right:2.5px solid #00B8FF;border-bottom-right-radius:6px;"></div>
      <!-- Animated Neon Laser Beam -->
      <div class="kr-laser" style="position:absolute;left:16px;right:16px;height:2px;background:linear-gradient(90deg,transparent,#00B8FF 20%,#FFFFFF 50%,#00B8FF 80%,transparent);box-shadow:0 0 10px #00B8FF,0 0 20px rgba(0,184,255,0.8);animation:krLaser 2s ease-in-out infinite alternate;"></div>
      <style>
        @keyframes krLaser {
          0% { top: 14px; opacity: 0.8; }
          100% { top: calc(100% - 16px); opacity: 0.8; }
        }
      </style>
    `;
    container.appendChild(overlay);

    // 5. Request Camera Permission & Stream
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }).then(stream => {
      activeStream = stream;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
        loadingDiv.style.display = 'none';
        isScanning = true;
        initDetector(video, onCodeCallback);
      };
    }).catch(err => {
      console.warn('Camera getUserMedia error:', err);
      loadingDiv.innerHTML = `
        <div style="text-align:center;padding:12px;">
          <div style="font-size:22px;margin-bottom:6px;">📷</div>
          <div style="font-weight:800;font-size:12px;color:#FF5E3A;margin-bottom:4px;">CAMERA ACCESS DENIED</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.65);margin-bottom:10px;">Please click the camera lock icon in the address bar to Allow Camera.</div>
          <button id="retry-camera-btn" style="background:#2875FF;color:#fff;border:none;padding:6px 16px;border-radius:10px;font-weight:700;font-size:11px;cursor:pointer;">Retry Camera</button>
        </div>
      `;
      const btn = document.getElementById('retry-camera-btn');
      if (btn) {
        btn.onclick = () => window.startInlineScanner(container, onCodeCallback);
      }
    });

    function handleDetected(code) {
      if (!code || !code.trim()) return;
      const clean = code.trim();
      const now = Date.now();
      // Throttle: don't fire same code within 2 seconds
      if (clean === lastScannedCode && (now - lastScanTimestamp) < 2000) {
        return;
      }
      lastScannedCode = clean;
      lastScanTimestamp = now;

      // Visual flash effect on scan
      overlay.style.backgroundColor = 'rgba(16, 185, 129, 0.25)';
      setTimeout(() => { overlay.style.backgroundColor = 'transparent'; }, 300);

      playSuccessBeep();
      if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch(e) {}
      }

      if (typeof onCodeCallback === 'function') {
        onCodeCallback(clean);
      }
      if (window.onFlutterBarcodeScanned) {
        window.onFlutterBarcodeScanned(clean);
      }
    }

    function initDetector(videoEl, callback) {
      // Priority 1: Native BarcodeDetector API (fastest, hardware accelerated)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({
            formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf']
          });
          const scanLoop = async () => {
            if (!isScanning) return;
            try {
              if (videoEl.readyState >= 2) {
                const barcodes = await detector.detect(videoEl);
                if (barcodes && barcodes.length > 0) {
                  handleDetected(barcodes[0].rawValue);
                }
              }
            } catch (e) {}
            if (isScanning) {
              requestAnimationFrame(scanLoop);
            }
          };
          requestAnimationFrame(scanLoop);
          return;
        } catch (e) {
          console.warn('Native BarcodeDetector initialization error, falling back to ZXing:', e);
        }
      }

      // Priority 2: ZXing Library Fallback
      if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
        try {
          zxingReader = new window.ZXing.BrowserMultiFormatReader();
          zxingReader.decodeFromVideoElement(videoEl, (result, err) => {
            if (result) {
              handleDetected(result.getText());
            }
          });
          return;
        } catch (e) {
          console.warn('ZXing scanner error:', e);
        }
      }

      // Priority 3: Fallback canvas reader
      console.warn('Neither native BarcodeDetector nor ZXing available. Standing by.');
    }
  };
})();

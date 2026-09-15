import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  CameraOff, 
  QrCode, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Sparkles, 
  X, 
  Loader2, 
  Check, 
  Search, 
  RefreshCw,
  Clock,
  Building2,
  GraduationCap,
  Power,
  PowerOff,
  ScanLine
} from 'lucide-react';
import Barcode from 'react-barcode';
import { getApiBase } from '../../../services/apiBase';
import { 
  DisciplineCategory, 
  DisciplineStudent, 
  fetchDisciplineCategories, 
  fetchDisciplineStudents, 
  createDisciplineLog 
} from '../../../services/discipline';

function resolveProfileImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function StaffScannerPage({ onIncidentLogged }: { onIncidentLogged?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  // Ref mirror of isCameraActive for use inside rAF/async closures (state is stale there)
  const cameraActiveRef = useRef<boolean>(false);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);

  // Scanned Student & Categories State
  const [categories, setCategories] = useState<DisciplineCategory[]>([]);
  const [scannedStudent, setScannedStudent] = useState<DisciplineStudent | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<(number | string)[]>([]);
  const [remarks, setRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Success tick animation modal
  const [showSuccessTick, setShowSuccessTick] = useState<boolean>(false);
  const [lastLoggedStudentName, setLastLoggedStudentName] = useState<string>('');

  // Lock to avoid multi-triggering while scanning
  const scanLockRef = useRef<boolean>(false);

  // Keep a ref to handleBarcodeCaptured so scan loop always uses latest version
  const handleBarcodeCapturedRef = useRef<(val: string) => void>(() => {});

  // Load configured categories from DB
  useEffect(() => {
    fetchDisciplineCategories({ is_active: true })
      .then((cats) => setCategories(cats))
      .catch((e) => console.error('Failed to load categories:', e));
  }, []);

  // ── Global Hardware Barcode Reader Listener (HID USB / Bluetooth handheld scanners) ──
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if typing inside text inputs or textareas
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Hardware barcode scanners send rapid keystrokes (< 50ms interval) terminated by Enter
      if (e.key === 'Enter') {
        const scannedCode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';
        if (scannedCode.length >= 3) {
          e.preventDefault();
          // Use ref so we always call the latest version of handleBarcodeCaptured
          handleBarcodeCapturedRef.current(scannedCode);
        }
      } else if (e.key.length === 1) {
        if (diff > 120) {
          // Reset buffer if keystroke delay is large
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Only needs to run once - uses handleBarcodeCapturedRef which is always up to date
  }, []);

  // ── Auto-start camera on mount ──
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      // 1. Check if running on an insecure origin (HTTP on non-localhost), which WebKit/Safari strictly blocks
      const isSecureOrigin =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      // 2. Compatibility shim for Safari (iOS Safari & older macOS Safari)
      const getMedia =
        navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
        (navigator as any).webkitGetUserMedia?.bind(navigator) ||
        (navigator as any).mozGetUserMedia?.bind(navigator) ||
        (navigator as any).getUserMedia?.bind(navigator);

      if (!getMedia) {
        if (!isSecureOrigin) {
          throw new Error(
            'Safari restricts camera access to secure HTTPS origins. Please access this website using https:// or enable Camera permissions in Safari Settings.'
          );
        }
        throw new Error(
          'Camera access is not supported or blocked by Safari. Please check Settings > Safari > Camera and set to "Allow".'
        );
      }

      // Provide crisp constraints with continuous autofocus support
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          // @ts-ignore
          focusMode: { ideal: 'continuous' },
          advanced: [
            // @ts-ignore
            { focusMode: 'continuous' },
            // @ts-ignore
            { zoom: 1.0 }
          ]
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          stream = await new Promise((resolve, reject) => {
            getMedia({ video: { facingMode: 'environment' }, audio: false }, resolve, reject);
          });
        }
      } catch (e: any) {
        // Fallback for devices/Safari versions that reject advanced constraints
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } else {
            stream = await new Promise((resolve, reject) => {
              getMedia({ video: true, audio: false }, resolve, reject);
            });
          }
        } catch (fallbackErr: any) {
          if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
            throw new Error('Camera permission was denied. Please allow camera access in Safari Settings.');
          }
          if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
            throw new Error('No camera device found on this device.');
          }
          throw fallbackErr;
        }
      }

      // Try applying continuous focus mode if supported on the active track
      try {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await (videoTrack as any).applyConstraints({
              advanced: [{ focusMode: 'continuous' }]
            }).catch(() => {});
          }
        }
      } catch (_) {}

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      cameraActiveRef.current = true;
      setIsCameraActive(true);

      // Start BarcodeDetector or frame scanning
      startBarcodeScanning();
    } catch (err: any) {
      console.warn('Camera failed to start:', err);
      setCameraError(err.message || 'Unable to access camera device in Safari.');
      cameraActiveRef.current = false;
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    cameraActiveRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };


  // ── Continuous Barcode Scanning Loop ──
  const startBarcodeScanning = () => {
    // Check if native BarcodeDetector is supported in browser (Chrome/Edge/Android)
    const hasNativeBarcodeDetector = 'BarcodeDetector' in window;
    let detector: any = null;

    if (hasNativeBarcodeDetector) {
      try {
        // @ts-ignore
        detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'codabar', 'itf'],
        });
      } catch (e) {
        detector = null;
      }
    }

    // Initialize ZXing MultiFormatReader for iOS Chrome / Safari & browsers without BarcodeDetector
    let zxingReader: any = null;
    try {
      const ZXingObj = (window as any).ZXing;
      if (ZXingObj) {
        const hints = new Map();
        if (ZXingObj.DecodeHintType && ZXingObj.BarcodeFormat) {
          const formats = [
            ZXingObj.BarcodeFormat.CODE_128,
            ZXingObj.BarcodeFormat.CODE_39,
            ZXingObj.BarcodeFormat.EAN_13,
            ZXingObj.BarcodeFormat.EAN_8,
            ZXingObj.BarcodeFormat.UPC_A,
            ZXingObj.BarcodeFormat.QR_CODE,
            ZXingObj.BarcodeFormat.ITF,
          ].filter(Boolean);
          hints.set(ZXingObj.DecodeHintType.POSSIBLE_FORMATS, formats);
          hints.set(ZXingObj.DecodeHintType.TRY_HARDER, true);
        }

        if (ZXingObj.BrowserMultiFormatReader) {
          zxingReader = new ZXingObj.BrowserMultiFormatReader(hints);
        } else if (ZXingObj.MultiFormatReader) {
          zxingReader = new ZXingObj.MultiFormatReader();
          if (typeof zxingReader.setHints === 'function') {
            zxingReader.setHints(hints);
          }
        }
      }
    } catch (e) {
      zxingReader = null;
    }

    let lastScanTime = 0;
    let stopped = false;

    const scanLoop = async () => {
      // Stop the loop if camera was stopped
      if (stopped || !cameraActiveRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        animFrameRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      const now = Date.now();
      // Throttle scanning to ~10 fps while responsive - use cameraActiveRef (NOT isCameraActive state)
      if (now - lastScanTime > 100 && !scanLockRef.current) {
        lastScanTime = now;
        try {
          let detectedBarcode: string | null = null;

          if (detector) {
            // 1. Native BarcodeDetector (Chrome/Edge/Android)
            try {
              const barcodes = await detector.detect(video);
              if (barcodes && barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                if (rawValue && rawValue.trim().length >= 3) {
                  detectedBarcode = rawValue.trim();
                }
              }
            } catch (_) { /* fallback to zxing */ }
          }

          // 2. Fallback for iOS / Safari / iPhone Chrome via ZXing library
          if (!detectedBarcode) {
            const ZXingObj = (window as any).ZXing;
            if (ZXingObj) {
              const canvas = canvasRef.current;
              if (canvas && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  
                  // Method A: decodeFromCanvas if reader is available
                  if (zxingReader && typeof zxingReader.decodeFromCanvas === 'function') {
                    try {
                      const res = await zxingReader.decodeFromCanvas(canvas);
                      if (res && res.getText && res.getText()) {
                        detectedBarcode = res.getText().trim();
                      }
                    } catch (_) { /* ignore frame miss */ }
                  }

                  // Method B: Pure Bitmap binarizer
                  if (!detectedBarcode && ZXingObj.RGBLuminanceSource && ZXingObj.BinaryBitmap && ZXingObj.HybridBinarizer && ZXingObj.MultiFormatReader) {
                    try {
                      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                      const len = imageData.data.length;
                      const luminances = new Uint8ClampedArray(len / 4);
                      for (let i = 0; i < len; i += 4) {
                        luminances[i / 4] = (imageData.data[i] * 306 + imageData.data[i + 1] * 601 + imageData.data[i + 2] * 117) >> 10;
                      }
                      const luminanceSource = new ZXingObj.RGBLuminanceSource(luminances, canvas.width, canvas.height);
                      const binaryBitmap = new ZXingObj.BinaryBitmap(new ZXingObj.HybridBinarizer(luminanceSource));
                      const reader = new ZXingObj.MultiFormatReader();
                      const res = reader.decode(binaryBitmap);
                      if (res && res.getText && res.getText()) {
                        detectedBarcode = res.getText().trim();
                      }
                    } catch (_) { /* frame without barcode */ }
                  }
                }
              }
            }
          }

          if (detectedBarcode && detectedBarcode.length >= 3) {
            handleBarcodeCapturedRef.current(detectedBarcode);
            // After capturing, pause scanning for 2s to avoid duplicates
            lastScanTime = now + 2000;
          }
        } catch (e) {
          // Frame decode error - ignore and continue
        }
      }

      animFrameRef.current = requestAnimationFrame(scanLoop);
    };

    animFrameRef.current = requestAnimationFrame(scanLoop);

    return () => {
      stopped = true;
    };
  };

  // Audio feedback on successful scan - sleek, professional corporate POS/enterprise scanner chime
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Master output gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.45, now);
      masterGain.connect(ctx.destination);

      // Note 1: 1046.5 Hz (C6) -> crisp modern attack
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.7, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(masterGain);

      // Note 2: 1567.98 Hz (G6) -> uplifting corporate fifth interval confirmation
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1567.98, now + 0.05);
      gain2.gain.setValueAtTime(0, now + 0.05);
      gain2.gain.linearRampToValueAtTime(0.75, now + 0.065);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc2.connect(gain2);
      gain2.connect(masterGain);

      // Warm subtle body tone
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(523.25, now); // C5 harmonic
      gain3.gain.setValueAtTime(0.15, now);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc3.connect(gain3);
      gain3.connect(masterGain);

      osc1.start(now);
      osc1.stop(now + 0.15);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.28);
      osc3.start(now);
      osc3.stop(now + 0.19);
    } catch (e) {
      // Audio context may be restricted
    }
  };

  // ── Handle Detected Barcode Value ──
  const handleBarcodeCaptured = async (barcodeVal: string) => {
    const clean = String(barcodeVal || '').trim();
    if (!clean || scanLockRef.current) return;

    scanLockRef.current = true;
    setSearching(true);
    playBeep();

    try {
      // Lookup real student from DB
      const res = await fetchDisciplineStudents({ search: clean });
      if (res.results && res.results.length > 0) {
        // Match exact register number or primary match
        const cleanDigits = clean.replace(/[^0-9]/g, '');
        const matched = res.results.find(
          (s) =>
            s.reg_no.toLowerCase() === clean.toLowerCase() ||
            (cleanDigits && s.reg_no.replace(/[^0-9]/g, '').includes(cleanDigits)) ||
            s.username.toLowerCase() === clean.toLowerCase()
        ) || res.results[0];

        openStudentIncidentPopup(matched);
      } else {
        // If no student matched, create a fallback student object with the barcode
        openStudentIncidentPopup({
          id: 0,
          reg_no: clean,
          name: `Student (${clean})`,
          username: clean,
          department: 'General',
          section: '-',
          batch: '-',
        });
      }
    } catch (e) {
      console.error('Error looking up student:', e);
      scanLockRef.current = false;
    } finally {
      setSearching(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleBarcodeCaptured(manualInput.trim());
  };

  // Keep the ref always pointing to the latest handleBarcodeCaptured function
  // This allows scan loop and HID listener (which use stale closures) to always call the fresh version
  useEffect(() => {
    handleBarcodeCapturedRef.current = handleBarcodeCaptured;
  });

  const openStudentIncidentPopup = (student: DisciplineStudent) => {
    setScannedStudent(student);
    setSelectedCategoryIds([]);
    setRemarks('');
  };

  const handleClosePopup = () => {
    setScannedStudent(null);
    setSelectedCategoryIds([]);
    setRemarks('');
    // Release scanner lock after a brief delay
    setTimeout(() => {
      scanLockRef.current = false;
    }, 600);
  };

  const handleToggleCategory = (catId: number | string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  // ── Submit Incident to DB ──
  const handleSubmitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedStudent || selectedCategoryIds.length === 0) return;

    setSubmitting(true);
    try {
      // Find matching categories
      const selectedCats = categories.filter((c) => selectedCategoryIds.includes(c.id));
      const categoryTitles = selectedCats.map((c) => c.title).join(', ');
      const highestSeverity = selectedCats.some((c) => c.severity === 'CRITICAL')
        ? 'CRITICAL'
        : selectedCats.some((c) => c.severity === 'HIGH')
        ? 'HIGH'
        : selectedCats.some((c) => c.severity === 'MEDIUM')
        ? 'MEDIUM'
        : 'LOW';

      // Record incident in DB
      await createDisciplineLog({
        student: scannedStudent.id > 0 ? scannedStudent.id : null,
        reg_no: scannedStudent.reg_no,
        student_name: scannedStudent.name,
        username: scannedStudent.username,
        department_name: scannedStudent.department || '',
        section_name: scannedStudent.section || '',
        batch_name: scannedStudent.batch || '',
        category: selectedCats[0]?.id || null,
        category_title: categoryTitles,
        severity: highestSeverity,
        status: 'REPORTED',
        remarks: remarks.trim(),
      });

      // Show success tick popup animation
      setLastLoggedStudentName(scannedStudent.name || scannedStudent.reg_no);
      setScannedStudent(null);
      setSelectedCategoryIds([]);
      setRemarks('');
      setShowSuccessTick(true);

      if (onIncidentLogged) {
        onIncidentLogged();
      }

      setTimeout(() => {
        setShowSuccessTick(false);
        scanLockRef.current = false;
      }, 2200);
    } catch (err: any) {
      console.error('Failed to log incident:', err);
      const msg = err?.message || 'Failed to save discipline incident to database.';
      alert(msg);
      scanLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── LIVE CAMERA SCANNER VIEWPORT ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Barcode Camera Scanner</h2>
              <p className="text-xs text-slate-500">Scan student physical ID card barcode via camera</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCameraActive ? (
              <button
                onClick={stopCamera}
                className="px-3.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="px-3.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Start Camera</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative bg-slate-950 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[360px] overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            // @ts-ignore
            webkit-playsinline="true"
            className={`w-full max-h-[460px] object-contain transition-opacity duration-300 ${
              isCameraActive ? 'opacity-100' : 'opacity-0 absolute'
            }`}
          />

          {/* Offscreen Canvas for fallback frame extraction */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera Inactive Placeholder */}
          {!isCameraActive && (
            <div className="text-center p-8 space-y-4 max-w-sm">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                <Camera className="w-8 h-8 opacity-80" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">Camera is Stopped</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click 'Start Camera' above to begin real-time barcode scanning.
                </p>
              </div>
              {cameraError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          )}

          {/* Active Camera Target Overlay Guide - Minimal Clean Barcode Cropping Reticle */}
          {isCameraActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
              {/* Clean Barcode Frame Viewport (Cropped, zero blur, zero obstruction) */}
              <div className="relative w-72 sm:w-96 h-28 sm:h-36 border-2 border-emerald-400 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.65)] overflow-hidden">
                {/* Animated scanline */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />

                {/* Corner reticles */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MANUAL / USB SCANNER KEYBOARD EMULATION INPUT BAR ── */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
            <QrCode className="w-4 h-4 text-indigo-600" />
            <span>USB Hardware Barcode Gun / Manual Reg No Search:</span>
          </div>

          <form onSubmit={handleManualSearch} className="flex items-center gap-2 max-w-md w-full sm:w-auto">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Scan or enter Register Number / Barcode..."
              className="w-full sm:w-72 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition placeholder:font-sans placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={searching || !manualInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Lookup</span>
            </button>
          </form>
        </div>
      </div>

      {/* ── VERTICAL POPUP DIALOG FOR SCANNED STUDENT INCIDENT RECORDING ── */}
      {scannedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-hidden flex flex-col">
            {/* Modal Top Header with Distinct Light Milky Slate/Indigo Gradient Background & Responsive Layout */}
            <div className="bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-100/80 p-4 sm:p-5 border-b border-indigo-100/60 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                {/* Profile Avatar */}
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white border-2 border-indigo-200/90 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  {scannedStudent.profile_image_url ? (
                    <img
                      src={resolveProfileImageUrl(scannedStudent.profile_image_url)!}
                      alt={scannedStudent.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <User className="w-7 h-7 text-indigo-600" />
                  )}
                </div>

                {/* Student Info with perfect mobile text wrapping & alignment */}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug break-words">
                    {scannedStudent.name}
                  </h3>
                  
                  {/* Badges Container - Wrapped cleanly on small mobile screens */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                    <span className="text-[11px] sm:text-xs font-mono font-bold text-indigo-700 bg-white/90 px-2 py-0.5 rounded-md border border-indigo-200/80 shadow-2xs truncate max-w-[150px] sm:max-w-none">
                      @{scannedStudent.username || scannedStudent.reg_no}
                    </span>
                    <span className="text-[11px] font-mono text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                      {scannedStudent.reg_no}
                    </span>
                  </div>

                  {/* Academic Department & Section Details */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-600 mt-1.5 font-medium">
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate max-w-[130px] sm:max-w-none">{scannedStudent.department || 'General'}</span>
                    </span>
                    <span className="text-slate-300 hidden xs:inline">•</span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{scannedStudent.batch ? `Batch: ${scannedStudent.batch}` : ''} {scannedStudent.section ? `(Sec ${scannedStudent.section})` : ''}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClosePopup}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-white/80 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Selection Section (Checkboxes) & Form Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <form onSubmit={handleSubmitIncident} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select Violation Categories <span className="text-rose-500">*</span>
                </label>

                {categories.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No categories configured yet. You can add them in DC Admin Config.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const isChecked = selectedCategoryIds.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-xs font-medium cursor-pointer select-none transition ${
                            isChecked
                              ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleCategory(cat.id)}
                            className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{cat.title}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                  cat.severity === 'CRITICAL'
                                    ? 'bg-red-100 text-red-700'
                                    : cat.severity === 'HIGH'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {cat.severity}
                              </span>
                            </div>
                            {cat.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                {cat.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Remarks Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Staff Remarks / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add context e.g. location, period, or warning details..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClosePopup}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedCategoryIds.length === 0}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Record Incident to DB</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* ── SUCCESS TICK POPUP ANIMATION ── */}
      {showSuccessTick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            {/* Animated Tick Circle */}
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
              <Check className="w-10 h-10 stroke-[3]" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Incident Recorded!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Discipline log successfully saved in database for{' '}
                <span className="font-bold text-slate-800">{lastLoggedStudentName}</span>.
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Synced with Staff Logs</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

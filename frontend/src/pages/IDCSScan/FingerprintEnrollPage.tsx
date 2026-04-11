import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Fingerprint, Search, RotateCcw, Save, AlertCircle,
  CheckCircle2, Loader2, Usb,
} from 'lucide-react';
import { getApiBase } from '../../services/apiBase';

/* ═══════════════════════════════════════════════════════════════════════════
   USB Serial filters – same chips used for RFID / fingerprint USB bridges
   ═══════════════════════════════════════════════════════════════════════════ */
const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
  { usbVendorId: 0x1a86, usbProductId: 0x5523 }, // CH341
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 }, // CH9102
  { usbVendorId: 0x10c4, usbProductId: 0xea60 }, // CP210x
  { usbVendorId: 0x0403, usbProductId: 0x6001 }, // FT232RL
  { usbVendorId: 0x0403, usbProductId: 0x6015 }, // FT231XS
  { usbVendorId: 0x2341, usbProductId: 0x0043 }, // Arduino Uno
  { usbVendorId: 0x2341, usbProductId: 0x0001 }, // Arduino Uno (old)
];

const CHIP_NAMES: Record<string, string> = {
  '1a86:7523': 'CH340 USB-Serial',
  '1a86:5523': 'CH341 USB-Serial',
  '1a86:55d4': 'CH9102 USB-Serial',
  '10c4:ea60': 'CP210x USB-Serial',
  '0403:6001': 'FT232RL USB-Serial',
  '0403:6015': 'FT231XS USB-Serial',
  '2341:0043': 'Arduino Uno',
  '2341:0001': 'Arduino Uno (old)',
};

function getDeviceName(port: any): string {
  try {
    const info = port.getInfo?.();
    if (!info?.usbVendorId) return 'USB Serial Device';
    const vid = (info.usbVendorId as number).toString(16).padStart(4, '0');
    const pid = ((info.usbProductId ?? 0) as number).toString(16).padStart(4, '0');
    return CHIP_NAMES[`${vid}:${pid}`] || `USB Device (${vid.toUpperCase()}:${pid.toUpperCase()})`;
  } catch {
    return 'USB Serial Device';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scanner abstraction
   Supports: SecuGen WebAPI · Mantra MFS100 · Demo (simulated)
   ═══════════════════════════════════════════════════════════════════════════ */

type ScannerType = 'auto' | 'secugen' | 'mantra' | 'demo';
type ResolvedScannerType = Exclude<ScannerType, 'auto'>;

interface CaptureResult {
  template_b64: string;
  quality_score: number;
}

const SCANNER_DEFAULTS: Record<ResolvedScannerType, string> = {
  secugen: 'https://localhost:8443',
  mantra: 'https://127.0.0.1:11100',
  demo: '',
};

const SCANNER_LABELS: Record<ScannerType, string> = {
  auto: 'Auto-detect',
  secugen: 'SecuGen WebAPI',
  mantra: 'Mantra MFS100',
  demo: 'Demo (Simulated)',
};

async function captureFromScanner(
  type: ResolvedScannerType,
  url: string,
): Promise<CaptureResult> {
  /* ── Demo mode ─────────────────────────────────────────────── */
  if (type === 'demo') {
    await new Promise((r) => setTimeout(r, 1500));
    const bytes = new Uint8Array(256);
    crypto.getRandomValues(bytes);
    return {
      template_b64: btoa(String.fromCharCode(...bytes)),
      quality_score: Math.floor(Math.random() * 25) + 75,
    };
  }

  /* ── SecuGen WebAPI ────────────────────────────────────────── */
  if (type === 'secugen') {
    const res = await fetch(`${url}/SGIFPCapture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Timeout: 10000,
        Quality: 50,
        licstr: '',
        templateFormat: 'ISO',
      }),
    });
    const data = await res.json();
    if (data.ErrorCode !== 0)
      throw new Error(
        `Scanner error (code ${data.ErrorCode}). Place finger on sensor and try again.`,
      );
    const template = data.ISOTemplateBase64 || data.TemplateBase64;
    if (!template) {
      throw new Error('Scanner returned no template data.');
    }
    return {
      template_b64: template,
      quality_score: data.ImageQuality || 0,
    };
  }

  /* ── Mantra MFS100 (RD Service) ────────────────────────────── */
  if (type === 'mantra') {
    const pidXml =
      '<PidOptions ver="1.0"><Opts fCount="1" fType="2" iCount="0" iType="0" ' +
      'pCount="0" pType="0" format="0" pidVer="2.0" timeout="10000" ' +
      'otp="" wadh="" posh="" /></PidOptions>';
    const res = await fetch(`${url}/rd/capture`, {
      method: 'CAPTURE',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: pidXml,
    });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const resp = doc.querySelector('Resp');
    const errCode = resp?.getAttribute('errCode') || '1';
    if (errCode !== '0')
      throw new Error(
        `Mantra error: ${resp?.getAttribute('errInfo') || 'Unknown'}`,
      );
    const dataEl = doc.querySelector('Data');
    const template = dataEl?.textContent || '';
    if (!template) {
      throw new Error('Scanner returned no template data.');
    }
    return {
      template_b64: template,
      quality_score: parseInt(resp?.getAttribute('qScore') || '0', 10),
    };
  }

  throw new Error('Unknown scanner type');
}

async function probeScannerAvailable(
  type: ResolvedScannerType,
  url: string,
): Promise<boolean> {
  if (type === 'demo') return true;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, { signal: ctrl.signal, mode: 'no-cors' });
    clearTimeout(tid);
    return true;
  } catch {
    return false;
  }
}

async function detectScannerConnection(
  type: ScannerType,
  url: string,
): Promise<{ available: boolean; resolvedType: ResolvedScannerType | null; resolvedUrl: string }> {
  if (type === 'demo') {
    return { available: true, resolvedType: 'demo', resolvedUrl: '' };
  }

  if (type === 'secugen' || type === 'mantra') {
    const available = await probeScannerAvailable(type, url);
    return { available, resolvedType: available ? type : null, resolvedUrl: available ? url : '' };
  }

  const candidates: Array<{ type: ResolvedScannerType; url: string }> = [
    { type: 'secugen', url: SCANNER_DEFAULTS.secugen },
    { type: 'mantra', url: SCANNER_DEFAULTS.mantra },
  ];

  for (const candidate of candidates) {
    const available = await probeScannerAvailable(candidate.type, candidate.url);
    if (available) {
      return { available: true, resolvedType: candidate.type, resolvedUrl: candidate.url };
    }
  }

  return { available: false, resolvedType: null, resolvedUrl: '' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Finger configuration – 4 fingers to capture
   ═══════════════════════════════════════════════════════════════════════════ */

const FINGERS = [
  { key: 'R_THUMB', label: 'Right Thumb' },
  { key: 'R_INDEX', label: 'Right Index' },
  { key: 'L_THUMB', label: 'Left Thumb' },
  { key: 'L_INDEX', label: 'Left Index' },
] as const;

type FingerKey = (typeof FINGERS)[number]['key'];

type FingerStatus = 'empty' | 'capturing' | 'captured' | 'enrolled' | 'error';

interface FingerSlot {
  finger: FingerKey;
  label: string;
  status: FingerStatus;
  template_b64: string | null;
  quality_score: number | null;
  errorMsg: string | null;
}

interface UserInfo {
  user_id: number;
  user_name: string;
  user_type: string;
  identifier: string;
  department: string;
  profile_image: string;
  enrolled: boolean;
  count: number;
  fingers: string[];
}

const emptySlots = (): FingerSlot[] =>
  FINGERS.map((f) => ({
    finger: f.key,
    label: f.label,
    status: 'empty' as const,
    template_b64: null,
    quality_score: null,
    errorMsg: null,
  }));

/* ═══════════════════════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════════════════════ */

export default function FingerprintEnrollPage() {
  /* ── Scanner config ──────────────────────────────────────── */
  const [scannerType, setScannerType] = useState<ScannerType>('auto');
  const [scannerUrl, setScannerUrl] = useState('');
  const [scannerOnline, setScannerOnline] = useState<boolean | null>(null);
  const [scannerDetectedType, setScannerDetectedType] = useState<ResolvedScannerType | null>(null);
  const [deviceConnecting, setDeviceConnecting] = useState(false);

  /* ── USB Serial port state ───────────────────────────────── */
  const [usbPort, setUsbPort] = useState<any | null>(null);
  const [usbDeviceName, setUsbDeviceName] = useState('');
  const [usbError, setUsbError] = useState<string | null>(null);
  const serialSupported = typeof (navigator as any).serial !== 'undefined';
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  /* ── User lookup ─────────────────────────────────────────── */
  const [idType, setIdType] = useState<'reg_no' | 'staff_id'>('reg_no');
  const [idValue, setIdValue] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  /* ── Finger capture slots ────────────────────────────────── */
  const [slots, setSlots] = useState<FingerSlot[]>(emptySlots());

  /* ── Global state ────────────────────────────────────────── */
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const apiBase = getApiBase();
  const token = () => localStorage.getItem('access') || '';

  /* ── Select USB Port via Web Serial API ──────────────────── */
  const handleSelectPort = useCallback(async () => {
    setUsbError(null);
    try {
      let p: any;
      try {
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS });
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') return;
        // Fallback: unfiltered picker
        p = await (navigator as any).serial.requestPort();
      }
      setUsbPort(p);
      setUsbDeviceName(getDeviceName(p));

      // Auto-detect scanner type after port is selected
      setScannerOnline(null);
      setScannerDetectedType(null);
      setDeviceConnecting(true);
      try {
        const result = await detectScannerConnection('auto', '');
        setScannerType(result.resolvedType ? (result.resolvedType as ScannerType) : 'auto');
        setScannerOnline(result.available);
        setScannerDetectedType(result.resolvedType);
        if (result.resolvedUrl) setScannerUrl(result.resolvedUrl);
      } finally {
        setDeviceConnecting(false);
      }
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError')
        setUsbError('Could not select port: ' + (e?.message ?? String(e)));
    }
  }, []);

  /* ── Cleanup USB port on unmount ─────────────────────────── */
  useEffect(() => {
    return () => {
      try { readerRef.current?.cancel(); } catch {}
      try { usbPort?.close(); } catch {}
    };
  }, [usbPort]);

  /* ── User lookup ─────────────────────────────────────────── */
  const lookupUser = useCallback(async () => {
    const val = idValue.trim();
    if (!val) return;
    setLookingUp(true);
    setMessage(null);
    setUserInfo(null);
    setSlots(emptySlots());
    try {
      const param =
        idType === 'reg_no'
          ? `reg_no=${encodeURIComponent(val)}`
          : `staff_id=${encodeURIComponent(val)}`;
      const res = await fetch(
        `${apiBase}/api/idscan/fingerprint/status/?${param}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `User not found (${res.status})`);
      }
      const data: UserInfo = await res.json();
      setUserInfo(data);
      // Mark already-enrolled fingers
      setSlots((prev) =>
        prev.map((s) => ({
          ...s,
          status: data.fingers.includes(s.finger) ? 'enrolled' : 'empty',
        })),
      );
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Lookup failed' });
    } finally {
      setLookingUp(false);
    }
  }, [idType, idValue, apiBase]);

  /* ── Capture a single finger ─────────────────────────────── */
  const captureFinger = useCallback(
    async (fingerKey: FingerKey) => {
      const resolvedType: ResolvedScannerType | null =
        scannerType === 'auto' ? scannerDetectedType : scannerType;
      if (!resolvedType) {
        setMessage({
          type: 'error',
          text: 'No local fingerprint scanner bridge was detected. Install the vendor SDK/driver and refresh detection.',
        });
        return;
      }

      const resolvedUrl =
        resolvedType === 'demo'
          ? ''
          : scannerType === 'auto'
            ? SCANNER_DEFAULTS[resolvedType]
            : scannerUrl;

      setSlots((prev) =>
        prev.map((s) =>
          s.finger === fingerKey
            ? { ...s, status: 'capturing', errorMsg: null }
            : s,
        ),
      );
      setMessage(null);
      try {
        const result = await captureFromScanner(resolvedType, resolvedUrl);
        setSlots((prev) =>
          prev.map((s) =>
            s.finger === fingerKey
              ? {
                  ...s,
                  status: 'captured',
                  template_b64: result.template_b64,
                  quality_score: result.quality_score,
                  errorMsg: null,
                }
              : s,
          ),
        );
      } catch (e: any) {
        setSlots((prev) =>
          prev.map((s) =>
            s.finger === fingerKey
              ? {
                  ...s,
                  status: 'error',
                  errorMsg: e.message || 'Capture failed',
                }
              : s,
          ),
        );
      }
    },
    [scannerType, scannerUrl],
  );

  /* ── Save all newly captured fingers ─────────────────────── */
  const saveAll = useCallback(async () => {
    if (!userInfo) return;
    const toSave = slots.filter(
      (s) => s.status === 'captured' && s.template_b64,
    );
    if (toSave.length === 0) {
      setMessage({ type: 'info', text: 'No new captures to save.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    let successCount = 0;
    let lastError = '';

    for (const slot of toSave) {
      try {
        const body: Record<string, any> = {
          finger: slot.finger,
          template_b64: slot.template_b64,
          template_format: 'ISO_19794_2',
          quality_score: slot.quality_score,
          device_type: scannerType,
        };
        if (idType === 'reg_no') body.reg_no = idValue.trim();
        else body.staff_id = idValue.trim();

        const res = await fetch(
          `${apiBase}/api/idscan/fingerprint/enroll/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token()}`,
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Save failed (${res.status})`);
        }
        setSlots((prev) =>
          prev.map((s) =>
            s.finger === slot.finger ? { ...s, status: 'enrolled' } : s,
          ),
        );
        successCount++;
      } catch (e: any) {
        lastError = e.message;
        setSlots((prev) =>
          prev.map((s) =>
            s.finger === slot.finger
              ? { ...s, status: 'error', errorMsg: e.message }
              : s,
          ),
        );
      }
    }
    setSaving(false);
    if (successCount === toSave.length) {
      setSlots((prev) =>
        prev.map((s) =>
          s.status === 'enrolled'
            ? { ...s, template_b64: null, quality_score: null, errorMsg: null }
            : s,
        ),
      );
      setMessage({
        type: 'success',
        text: `All ${successCount} fingerprint(s) saved successfully.`,
      });
      lookupUser();
    } else {
      setMessage({
        type: 'error',
        text: `Saved ${successCount}/${toSave.length}. Error: ${lastError}`,
      });
    }
  }, [userInfo, slots, idType, idValue, scannerType, apiBase, lookupUser]);

  /* ── Reset ALL fingerprints for user ─────────────────────── */
  const resetAll = useCallback(async () => {
    if (!userInfo) return;
    if (
      !window.confirm(
        `Remove ALL fingerprints for ${userInfo.user_name || userInfo.identifier}?`,
      )
    )
      return;

    setResetting(true);
    setMessage(null);
    try {
      const body: Record<string, any> = {};
      if (idType === 'reg_no') body.reg_no = idValue.trim();
      else body.staff_id = idValue.trim();

      const res = await fetch(
        `${apiBase}/api/idscan/fingerprint/reset-all/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Reset failed (${res.status})`);
      }
      const data = await res.json();
      setSlots(emptySlots());
      setUserInfo((prev) =>
        prev ? { ...prev, enrolled: false, count: 0, fingers: [] } : null,
      );
      setMessage({
        type: 'success',
        text: data.detail || 'All fingerprints removed.',
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Reset failed' });
    } finally {
      setResetting(false);
    }
  }, [userInfo, idType, idValue, apiBase]);

  /* ── Derived counts ──────────────────────────────────────── */
  const capturedCount = slots.filter((s) => s.status === 'captured').length;
  const enrolledCount = slots.filter((s) => s.status === 'enrolled').length;
  const canSave = capturedCount > 0 && !saving;
  const canReset = enrolledCount > 0 && !resetting;
  const activeScannerLabel =
    scannerDetectedType
      ? SCANNER_LABELS[scannerDetectedType]
      : scannerType !== 'auto'
        ? SCANNER_LABELS[scannerType]
        : 'Not connected';

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Fingerprint className="w-7 h-7 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">
          Fingerprint Enrollment
        </h1>
      </div>

      {/* Web Serial not supported banner */}
      {!serialSupported && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          ⚠️ Web Serial API is not supported in this browser. Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         Step 1 – Connect Scanner
         ══════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
          <span className="text-sm font-semibold text-gray-700">Connect Scanner</span>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSelectPort}
              disabled={!serialSupported || deviceConnecting}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
            >
              {deviceConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Usb className="w-4 h-4" />
              )}
              Select USB Port
            </button>

            {usbPort && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-green-800 leading-tight">{usbDeviceName || 'Device connected'}</div>
                  <div className="text-xs text-green-600">
                    {activeScannerLabel}{scannerOnline === true ? ' · ready' : scannerOnline === false ? ' · scanner not detected' : ' · detecting...'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {usbError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
              {usbError}
            </div>
          )}

          {usbPort && scannerOnline === false && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              USB port connected but no fingerprint scanner bridge was detected. Ensure the vendor SDK service (SecuGen / Mantra) is running on this machine.
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
         Step 2 – Find User
         ══════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">2</span>
          Find User
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Identifier Type
            </label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={idType}
              onChange={(e) =>
                setIdType(e.target.value as 'reg_no' | 'staff_id')
              }
            >
              <option value="reg_no">Register Number</option>
              <option value="staff_id">Staff ID</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {idType === 'reg_no' ? 'Register Number' : 'Staff ID'}
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={idValue}
              onChange={(e) => setIdValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupUser()}
              placeholder={
                idType === 'reg_no'
                  ? 'e.g. 811722104001'
                  : 'e.g. KR001'
              }
            />
          </div>
          <button
            onClick={lookupUser}
            disabled={lookingUp || !idValue.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {lookingUp ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
        </div>
      </div>

      {/* ── Message banner ─────────────────────────────────────── */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         User info card
         ══════════════════════════════════════════════════════════ */}
      {userInfo && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-4">
            {userInfo.profile_image ? (
              <img
                src={userInfo.profile_image}
                alt=""
                className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                {(userInfo.user_name || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {userInfo.user_name || '—'}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-0.5">
                <span className="capitalize">
                  Type: <strong>{userInfo.user_type}</strong>
                </span>
                <span>
                  ID: <strong>{userInfo.identifier}</strong>
                </span>
                {userInfo.department && (
                  <span>
                    Dept: <strong>{userInfo.department}</strong>
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-gray-500 text-xs">Enrolled</p>
              <p className="text-2xl font-bold text-indigo-600">
                {userInfo.count}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         Step 2 – Capture fingerprints
         ══════════════════════════════════════════════════════════ */}
      {userInfo && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">3</span>
              Capture Fingerprints
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {slots.map((slot) => (
                <FingerCard
                  key={slot.finger}
                  slot={slot}
                  onCapture={() => captureFinger(slot.finger)}
                  disabled={
                    saving ||
                    resetting ||
                    (scannerOnline === false && scannerType !== 'demo')
                  }
                />
              ))}
            </div>
          </div>

          {/* ── Action buttons ─────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveAll}
              disabled={!canSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving
                ? 'Saving...'
                : `Save ${capturedCount} Fingerprint${capturedCount !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={resetAll}
              disabled={!canReset}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {resetting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {resetting ? 'Resetting...' : 'Reset All Fingerprints'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Finger Card sub-component
   ═══════════════════════════════════════════════════════════════════════════ */

function FingerCard({
  slot,
  onCapture,
  disabled,
}: {
  slot: FingerSlot;
  onCapture: () => void;
  disabled: boolean;
}) {
  const cfg: Record<
    FingerStatus,
    { bg: string; border: string; icon: React.ReactNode; label: string }
  > = {
    empty: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      icon: <Fingerprint className="w-10 h-10 text-gray-300" />,
      label: 'Not captured',
    },
    capturing: {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      icon: <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />,
      label: 'Place finger on scanner...',
    },
    captured: {
      bg: 'bg-blue-50',
      border: 'border-blue-400',
      icon: <Fingerprint className="w-10 h-10 text-blue-500" />,
      label: 'Captured (unsaved)',
    },
    enrolled: {
      bg: 'bg-green-50',
      border: 'border-green-400',
      icon: <CheckCircle2 className="w-10 h-10 text-green-500" />,
      label: 'Enrolled',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      icon: <AlertCircle className="w-10 h-10 text-red-400" />,
      label: 'Error',
    },
  };

  const c = cfg[slot.status];
  const isCapturing = slot.status === 'capturing';
  const canCapture = !isCapturing && !disabled;
  const btnLabel =
    slot.status === 'enrolled' || slot.status === 'captured'
      ? 'Re-capture'
      : slot.status === 'error'
        ? 'Retry'
        : 'Capture';

  return (
    <div
      className={`rounded-xl border-2 ${c.border} ${c.bg} p-5 flex flex-col items-center text-center transition-all`}
    >
      {c.icon}
      <p className="mt-2 font-semibold text-gray-800">{slot.label}</p>
      <p
        className={`text-xs mt-0.5 ${
          slot.status === 'error' ? 'text-red-600' : 'text-gray-500'
        }`}
      >
        {slot.status === 'error' ? slot.errorMsg : c.label}
      </p>
      {slot.quality_score != null && slot.status !== 'empty' && (
        <p className="text-xs text-gray-500 mt-1">
          Quality:{' '}
          <strong
            className={
              slot.quality_score >= 60 ? 'text-green-600' : 'text-amber-600'
            }
          >
            {slot.quality_score}%
          </strong>
        </p>
      )}
      <button
        onClick={onCapture}
        disabled={!canCapture}
        className={`mt-3 px-4 py-1.5 text-sm font-medium rounded-lg transition ${
          isCapturing
            ? 'bg-amber-200 text-amber-800 cursor-wait'
            : canCapture
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isCapturing ? 'Scanning...' : btnLabel}
      </button>
    </div>
  );
}

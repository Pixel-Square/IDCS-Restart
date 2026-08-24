import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Fingerprint, Search, RotateCcw, Save, AlertCircle,
  CheckCircle2, Loader2, Usb, X, Play, Scan, Sparkles, UserCheck, UserPlus,
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

type ScannerType = 'auto' | 'secugen' | 'mantra' | 'esp32_bridge' | 'demo';
type ResolvedScannerType = Exclude<ScannerType, 'auto'>;

interface CaptureResult {
  template_b64: string;
  quality_score: number;
  slot?: number;
  user_id?: string;
  slot_map?: Record<string, string>;
  esp32_output?: string;
}

const SCANNER_DEFAULTS: Record<ResolvedScannerType, string> = {
  secugen: 'https://localhost:8443',
  mantra: 'https://127.0.0.1:11100',
  esp32_bridge: '/fingerprint-bridge',
  demo: '',
};

const ESP32_BRIDGE_CANDIDATES = [
  'http://192.168.29.159',
  '/fingerprint-bridge',
  'http://localhost:8889',
  'http://127.0.0.1:8889',
  'http://0.0.0.0:8889',
];

const SCANNER_LABELS: Record<ScannerType, string> = {
  auto: 'Auto-detect',
  secugen: 'SecuGen WebAPI',
  mantra: 'Mantra MFS100',
  esp32_bridge: 'ESP32 Fingerprint Bridge',
  demo: 'Demo (Simulated)',
};

async function captureFromScanner(
  type: ResolvedScannerType,
  url: string,
  opts?: { userId?: string; mode?: 'C' | 'M'; slot?: number },
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
    if (resp?.getAttribute('errCode') !== '0') {
      throw new Error(resp?.getAttribute('errInfo') || 'Mantra capture failed.');
    }
    const pidData = doc.querySelector('Data');
    const template = pidData?.textContent?.trim();
    if (!template) {
      throw new Error('Scanner returned no template data.');
    }
    return {
      template_b64: template,
      quality_score: parseInt(resp?.getAttribute('qScore') || '0', 10),
    };
  }

  /* ── ESP32 HTTP Bridge ───────────────────────────────────── */
  if (type === 'esp32_bridge') {
    const statusRes = await fetch(`${url}/status`, { method: 'GET' });
    if (!statusRes.ok) {
      throw new Error(`Bridge status failed (${statusRes.status}).`);
    }
    const statusData = await statusRes.json().catch(() => ({}));
    if (!statusData?.connected) {
      const reconnectRes = await fetch(`${url}/reconnect`, { method: 'POST' });
      const reconnectData = await reconnectRes.json().catch(() => ({}));
      if (!reconnectRes.ok || !reconnectData?.connected) {
        throw new Error('Fingerprint bridge is running but no sensor is connected. Check USB cable/port and retry.');
      }
    }

    if (opts?.mode) {
      try {
        const modeRes = await fetch(`${url}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: opts.mode }),
        }).catch(() => null);
        if (modeRes && !modeRes.ok) {
          const modeData = await modeRes.json().catch(() => ({}));
          if (modeData?.error && modeRes.status !== 405) {
            console.warn(`Mode switch ${opts.mode} returned non-ok:`, modeData.error);
          }
        }
      } catch {
        // Non-blocking mode switch
      }
    }

    const captureRes = await fetch(`${url}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: String(opts?.userId || 'capture'),
        mode: opts?.mode,
        slot: opts?.slot,
      }),
    });
    const captureData = await captureRes.json().catch(() => ({}));
    if (!captureRes.ok || !captureData?.template_b64) {
      throw new Error(captureData?.error || `Bridge capture failed (${captureRes.status}).`);
    }
    return {
      template_b64: String(captureData.template_b64),
      quality_score: Number(captureData.quality_score ?? 0),
      slot: captureData.slot ?? undefined,
      user_id: captureData.user_id ?? undefined,
      slot_map: captureData.slot_map ?? undefined,
      esp32_output: captureData.esp32_output ?? undefined,
    };
  }

  throw new Error('Unknown scanner type');
}

async function probeScannerAvailable(
  type: ResolvedScannerType,
  url: string,
): Promise<boolean> {
  if (type === 'demo') return true;
  if (type === 'esp32_bridge') {
    try {
      const statusRes = await fetch(`${url}/status`, { method: 'GET' });
      if (statusRes.ok) {
        const statusData = await statusRes.json().catch(() => ({}));
        return typeof statusData?.connected === 'boolean' ? true : Boolean(statusData);
      }

      const reconnectRes = await fetch(`${url}/reconnect`, { method: 'POST' });
      if (!reconnectRes.ok) return false;
      const reconnectData = await reconnectRes.json().catch(() => ({}));
      return Boolean(reconnectData?.connected) || reconnectRes.ok;
    } catch {
      return false;
    }
  }
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

  if (type === 'secugen' || type === 'mantra' || type === 'esp32_bridge') {
    const available = await probeScannerAvailable(type, url);
    return { available, resolvedType: available ? type : null, resolvedUrl: available ? url : '' };
  }

  const candidates: Array<{ type: ResolvedScannerType; url: string }> = [
    ...ESP32_BRIDGE_CANDIDATES.map((u) => ({ type: 'esp32_bridge' as const, url: u })),
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
  slot?: number | null;
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

interface IdentifiedUser {
  user_id: number;
  user_name: string;
  user_type: string;
  identifier: string;
  department: string;
  profile_image: string;
  finger?: string;
}

interface MonitorEvent {
  at: string;
  status: 'matched' | 'unmatched' | 'error';
  text: string;
}

async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = await res.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail;
    if (Array.isArray(payload?.detail) && payload.detail.length) return String(payload.detail[0]);
    if (payload?.detail && typeof payload.detail === 'object') return JSON.stringify(payload.detail);
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
  } catch {}

  try {
    const raw = await res.text();
    if (!raw) return fallback;
    return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  } catch {
    return fallback;
  }
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
  const [autoEnrolling, setAutoEnrolling] = useState(false);
  const [activeFingerIndex, setActiveFingerIndex] = useState<number>(-1);
  const autoCancelRef = useRef(false);

  /* ── Global state ────────────────────────────────────────── */
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  /* ── Live monitoring state ──────────────────────────────── */
  const [monitoring, setMonitoring] = useState(false);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [lastIdentified, setLastIdentified] = useState<IdentifiedUser | null>(null);
  const [monitorEvents, setMonitorEvents] = useState<MonitorEvent[]>([]);
  const monitorActiveRef = useRef(false);
  const monitorConsecutiveErrorsRef = useRef(0);

  /* ── Test modal state ────────────────────────────────────── */
  const [showTestModal, setShowTestModal] = useState(false);
  const [testSearching, setTestSearching] = useState(false);
  const [testScanResult, setTestScanResult] = useState<{
    status: 'matched' | 'unregistered' | 'none';
    user: IdentifiedUser | null;
    slot?: number | null;
    timestamp?: string;
  }>({ status: 'none', user: null });
  const [testSearchStatus, setTestSearchStatus] = useState<string>('Waiting for finger on sensor...');
  const testActiveRef = useRef(false);

  /* ── Register New Fingerprint Modal State ────────────────── */
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUserForEnroll, setSelectedUserForEnroll] = useState<any | null>(null);

  const apiBase = getApiBase();
  const token = () => localStorage.getItem('access') || '';

  const resolveScannerForCapture = useCallback((): { type: ResolvedScannerType; url: string } | null => {
    const resolvedType: ResolvedScannerType | null =
      scannerType === 'auto' ? scannerDetectedType : scannerType;
    if (!resolvedType) return null;
    const resolvedUrl =
      resolvedType === 'demo'
        ? ''
        : scannerType === 'auto'
          ? SCANNER_DEFAULTS[resolvedType]
          : scannerUrl;
    return { type: resolvedType, url: resolvedUrl };
  }, [scannerDetectedType, scannerType, scannerUrl]);

  const runScannerDetection = useCallback(
    async (preferredType: ScannerType = 'auto', preferredUrl = '') => {
      setScannerOnline(null);
      setScannerDetectedType(null);
      setDeviceConnecting(true);
      try {
        const result = await detectScannerConnection(preferredType, preferredUrl);
        setScannerOnline(result.available);
        setScannerDetectedType(result.resolvedType);
        if (result.resolvedType) {
          setScannerType(result.resolvedType);
        }
        if (result.resolvedUrl) {
          setScannerUrl(result.resolvedUrl);
        }
        if (!result.available && window.location.protocol === 'https:') {
          setUsbError('Browser blocked local scanner access from HTTPS page. Allow Local network access for this site in browser Site settings, then retry detection.');
        } else if (result.available) {
          setUsbError(null);
        }
        return result.available;
      } finally {
        setDeviceConnecting(false);
      }
    },
    [],
  );

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
      await runScannerDetection('auto', '');
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError')
        setUsbError('Could not select port: ' + (e?.message ?? String(e)));
    }
  }, [runScannerDetection]);

  useEffect(() => {
    if (!usbPort) return;
    if (scannerOnline !== false) return;
    if (deviceConnecting) return;

    const id = window.setInterval(() => {
      if (deviceConnecting) return;
      runScannerDetection('auto', '').catch(() => {});
    }, 4000);

    return () => window.clearInterval(id);
  }, [usbPort, scannerOnline, deviceConnecting, runScannerDetection]);

  /* ── Cleanup USB port on unmount ─────────────────────────── */
  useEffect(() => {
    return () => {
      monitorActiveRef.current = false;
      try { readerRef.current?.cancel(); } catch {}
      try { usbPort?.close(); } catch {}
    };
  }, [usbPort]);

  const runMonitorOnce = useCallback(async () => {
    const resolved = resolveScannerForCapture();
    if (!resolved) {
      setMonitorError('No scanner detected. Connect scanner and retry monitoring.');
      return;
    }

    setMonitorBusy(true);
    try {
      const capture = await captureFromScanner(resolved.type, resolved.url, {
        userId: resolved.type === 'esp32_bridge' ? 'verify' : undefined,
        mode: resolved.type === 'esp32_bridge' ? 'M' : undefined,
      });
      if (!monitorActiveRef.current) return;

      const res = await fetch(`${apiBase}/api/idscan/fingerprint/identify/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ template_b64: capture.template_b64 }),
      });

      if (!monitorActiveRef.current) return;

      if (res.ok) {
        const data = await res.json();
        const identified: IdentifiedUser = {
          user_id: Number(data.user_id),
          user_name: String(data.user_name || ''),
          user_type: String(data.user_type || ''),
          identifier: String(data.identifier || ''),
          department: String(data.department || ''),
          profile_image: String(data.profile_image || ''),
          finger: String(data.finger || ''),
        };
        setLastIdentified(identified);
        setMonitorError(null);
        monitorConsecutiveErrorsRef.current = 0;
        setMonitorEvents((prev) => [
          { at: new Date().toLocaleTimeString(), status: 'matched' as const, text: `${identified.user_name} (${identified.identifier})` },
          ...prev,
        ].slice(0, 8));
        return;
      }

      if (res.status === 404) {
        const err = await res.json().catch(() => ({}));
        const unmatchedMsg = String(err?.detail || 'Finger detected but no enrolled match found');
        monitorConsecutiveErrorsRef.current = 0;
        setMonitorEvents((prev) => [
          { at: new Date().toLocaleTimeString(), status: 'unmatched' as const, text: unmatchedMsg },
          ...prev,
        ].slice(0, 8));
        return;
      }

      const err = await res.json().catch(() => ({}));
      const msg = String(err?.detail || `Identify failed (${res.status})`);
      setMonitorError(msg);
      monitorConsecutiveErrorsRef.current += 1;
      setMonitorEvents((prev) => [
        { at: new Date().toLocaleTimeString(), status: 'error' as const, text: msg },
        ...prev,
      ].slice(0, 8));

      if (monitorConsecutiveErrorsRef.current >= 5) {
        setMonitoring(false);
        setMonitorError('Monitoring auto-stopped after repeated errors. Please reconnect scanner and start monitoring again.');
      }
    } catch (e: any) {
      if (!monitorActiveRef.current) return;
      const msg = e?.message || 'Monitoring capture failed';
      setMonitorError(msg);
      monitorConsecutiveErrorsRef.current += 1;
      setMonitorEvents((prev) => [
        { at: new Date().toLocaleTimeString(), status: 'error' as const, text: msg },
        ...prev,
      ].slice(0, 8));

      if (monitorConsecutiveErrorsRef.current >= 5) {
        setMonitoring(false);
        setMonitorError('Monitoring auto-stopped after repeated errors. Please reconnect scanner and start monitoring again.');
      }
    } finally {
      if (monitorActiveRef.current) setMonitorBusy(false);
    }
  }, [apiBase, resolveScannerForCapture]);

  const refreshMonitoringSection = useCallback(() => {
    monitorActiveRef.current = false;
    monitorConsecutiveErrorsRef.current = 0;
    setMonitoring(false);
    setMonitorBusy(false);
    setMonitorError(null);
    setLastIdentified(null);
    setMonitorEvents([]);
  }, []);

  const startMonitoring = useCallback(async () => {
    const resolved = resolveScannerForCapture();
    if (!resolved) {
      setMonitorError('No scanner detected. Connect scanner and retry monitoring.');
      return;
    }

    if (resolved.type === 'esp32_bridge') {
      try {
        const modeRes = await fetch(`${resolved.url}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'M' }),
        }).catch(() => null);
        if (modeRes && !modeRes.ok) {
          const modeData = await modeRes.json().catch(() => ({}));
          if (modeData?.error && modeRes.status !== 405) {
            console.warn('Mode switch response:', modeData.error);
          }
        }
      } catch (e: any) {
        console.warn('Non-fatal mode switch issue:', e?.message);
      }
    }

    setMonitorError(null);
    setMonitoring(true);
  }, [resolveScannerForCapture]);

  const refreshCaptureSection = useCallback(() => {
    setMessage(null);
    setSlots((prev) => {
      if (!userInfo) return prev;
      return prev.map((slot) => ({
        ...slot,
        status: userInfo.fingers.includes(slot.finger) ? 'enrolled' : 'empty',
        template_b64: null,
        quality_score: null,
        errorMsg: null,
      }));
    });
  }, [userInfo]);

  useEffect(() => {
    if (!monitoring) {
      monitorActiveRef.current = false;
      setMonitorBusy(false);
      return;
    }

    monitorActiveRef.current = true;
    let cancelled = false;

    const loop = async () => {
      while (monitorActiveRef.current && !cancelled) {
        await runMonitorOnce();
        if (!monitorActiveRef.current || cancelled) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    };

    loop();

    return () => {
      cancelled = true;
      monitorActiveRef.current = false;
      setMonitorBusy(false);
    };
  }, [monitoring, runMonitorOnce]);

  /* ── Test Popup Search Loop ──────────────────────────────── */
  const openTestModal = useCallback(async () => {
    const resolved = resolveScannerForCapture();
    if (!resolved) {
      setMessage({ type: 'error', text: 'Please connect a fingerprint scanner first.' });
      return;
    }

    if (resolved.type === 'esp32_bridge') {
      try {
        await fetch(`${resolved.url}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'M' }),
        }).catch(() => null);
      } catch (e) {
        console.warn('Mode switch for test:', e);
      }
    }

    setTestScanResult({ status: 'none', user: null });
    setTestSearchStatus('Place finger on sensor to test search...');
    setShowTestModal(true);
  }, [resolveScannerForCapture]);

  const closeTestModal = useCallback(() => {
    testActiveRef.current = false;
    setShowTestModal(false);
    setTestSearching(false);
  }, []);

  useEffect(() => {
    if (!showTestModal) {
      testActiveRef.current = false;
      setTestSearching(false);
      return;
    }

    testActiveRef.current = true;
    let cancelled = false;

    const runTestLoop = async () => {
      while (testActiveRef.current && !cancelled) {
        const resolved = resolveScannerForCapture();
        if (!resolved) {
          setTestSearchStatus('Scanner disconnected.');
          break;
        }

        setTestSearching(true);

        try {
          const capture = await captureFromScanner(resolved.type, resolved.url, {
            userId: resolved.type === 'esp32_bridge' ? 'verify' : undefined,
            mode: resolved.type === 'esp32_bridge' ? 'M' : undefined,
          });

          if (!testActiveRef.current || cancelled) break;

          if (capture.template_b64) {
            setTestSearchStatus('Finger detected! Searching in database...');

            let isMatched = false;
            try {
              const res = await fetch(`${apiBase}/api/idscan/fingerprint/identify/`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token()}`,
                },
                body: JSON.stringify({
                  template_b64: capture.template_b64,
                  slot: capture.slot,
                  user_id: capture.user_id,
                  slot_map: capture.slot_map,
                }),
              });

              if (!testActiveRef.current || cancelled) break;

              if (res.ok) {
                const data = await res.json();
                const identified: IdentifiedUser = {
                  user_id: Number(data.user_id),
                  user_name: String(data.user_name || ''),
                  user_type: String(data.user_type || ''),
                  identifier: String(data.identifier || ''),
                  department: String(data.department || ''),
                  profile_image: String(data.profile_image || ''),
                  finger: String(data.finger || ''),
                };
                setTestScanResult({
                  status: 'matched',
                  user: identified,
                  slot: data.slot || null,
                  timestamp: new Date().toLocaleTimeString(),
                });
                setTestSearchStatus(`✓ Identified: ${identified.user_name} (Listening for next finger...)`);
                isMatched = true;
              }
            } catch (netErr) {
              console.warn('Identify network call error:', netErr);
            }

            if (!isMatched) {
              // Unregistered fingerprint detected on hardware
              setTestScanResult({
                status: 'unregistered',
                user: null,
                timestamp: new Date().toLocaleTimeString(),
              });
              setTestSearchStatus('⚠️ Fingerprint detected, but no matching user is registered in the database.');
            }
          }
        } catch (err: any) {
          // Scanner still waiting for next finger
        } finally {
          if (testActiveRef.current && !cancelled) {
            setTestSearching(false);
          }
        }

        if (!testActiveRef.current || cancelled) break;
        // Pause briefly before listening for the next test fingerprint
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    runTestLoop();

    return () => {
      cancelled = true;
      testActiveRef.current = false;
    };
  }, [showTestModal, apiBase, resolveScannerForCapture]);

  /* ── Live People Search for Registration Modal ──────────── */
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/idscan/people-search/?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('People search failed:', err);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, apiBase]);

  const selectUserForRegistration = useCallback(async (u: any) => {
    setSelectedUserForEnroll(u);
    const resolvedType = u.user_type === 'staff' ? 'staff_id' : 'reg_no';
    setIdType(resolvedType);
    setIdValue(u.identifier);

    // Initial state
    setUserInfo({
      user_id: u.user_id || u.id,
      user_type: u.user_type,
      identifier: u.identifier,
      user_name: u.user_name,
      department: u.department,
      profile_image: u.profile_image,
      enrolled: false,
      count: 0,
      fingers: [],
    });

    setSlots(emptySlots());
    setMessage(null);

    // Immediately fetch enrolled fingers status from backend
    try {
      const param =
        resolvedType === 'reg_no'
          ? `reg_no=${encodeURIComponent(u.identifier)}`
          : `staff_id=${encodeURIComponent(u.identifier)}`;
      const res = await fetch(
        `${apiBase}/api/idscan/fingerprint/status/?${param}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (res.ok) {
        const data: UserInfo = await res.json();
        setUserInfo(data);
        const enrolledFingers = data.fingers || [];
        setSlots((prev) =>
          prev.map((s) => ({
            ...s,
            status: enrolledFingers.includes(s.finger) ? 'enrolled' : 'empty',
          })),
        );
      }
    } catch (e) {
      console.warn('Auto status check on select failed:', e);
    }
  }, [apiBase]);

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

  /* ── Save single finger immediately to backend ──────────── */
  const saveSingleFingerToBackend = async (
    fingerKey: FingerKey,
    templateB64: string,
    qualityScore: number,
    slotNumber?: number | null,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!userInfo) return { success: false, error: 'No user selected' };
    try {
      const body: Record<string, any> = {
        finger: fingerKey,
        template_b64: templateB64,
        template_format: 'ISO_19794_2',
        quality_score: qualityScore,
        device_type: scannerType,
      };
      if (slotNumber !== undefined && slotNumber !== null) {
        body.slot_id = slotNumber;
        body.slot = slotNumber;
      }
      if (idType === 'reg_no') body.reg_no = idValue.trim();
      else body.staff_id = idValue.trim();

      const res = await fetch(`${apiBase}/api/idscan/fingerprint/enroll/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await readApiErrorMessage(res, `Save failed (${res.status})`);
        return { success: false, error: errorText };
      }
      return { success: true };
    } catch (err: any) {
      console.error('Error saving finger to backend:', err);
      return { success: false, error: err?.message || 'Save error' };
    }
  };

  /* ── Automated sequential capture ────────────────────────── */
  const stopAutoEnrollment = useCallback(() => {
    autoCancelRef.current = true;
    setAutoEnrolling(false);
    setActiveFingerIndex(-1);
  }, []);

  const startAutoEnrollment = useCallback(async () => {
    if (!userInfo) return;
    const resolved = resolveScannerForCapture();
    if (!resolved) {
      setMessage({ type: 'error', text: 'No scanner connected. Please connect scanner first.' });
      return;
    }

    autoCancelRef.current = false;
    setAutoEnrolling(true);
    setMessage(null);

    let enrolledCountAcc = 0;

    for (let i = 0; i < FINGERS.length; i++) {
      if (autoCancelRef.current) break;

      const f = FINGERS[i];
      setActiveFingerIndex(i);

      // Mark current as capturing
      setSlots((prev) =>
        prev.map((s) => (s.finger === f.key ? { ...s, status: 'capturing', errorMsg: null } : s)),
      );

      let captureSuccess = false;
      let lastError = '';

      // Try capturing with retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (autoCancelRef.current) break;

        try {
          const esp32CaptureUserId =
            resolved.type === 'esp32_bridge'
              ? String(userInfo.identifier || idValue.trim() || f.key || 'capture').trim()
              : undefined;

          const result = await captureFromScanner(resolved.type, resolved.url, {
            userId: esp32CaptureUserId,
            mode: resolved.type === 'esp32_bridge' ? 'C' : undefined,
            slot: i + 1,
          });

          if (result.template_b64) {
            setSlots((prev) =>
              prev.map((s) =>
                s.finger === f.key
                  ? {
                      ...s,
                      status: 'enrolled',
                      template_b64: result.template_b64,
                      quality_score: result.quality_score,
                      slot: result.slot ?? null,
                      errorMsg: null,
                    }
                  : s,
              ),
            );
            captureSuccess = true;
            enrolledCountAcc++;
            break;
          }
        } catch (err: any) {
          lastError = err?.message || 'Capture failed';
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (!captureSuccess && !autoCancelRef.current) {
        setSlots((prev) =>
          prev.map((s) =>
            s.finger === f.key ? { ...s, status: 'error', errorMsg: lastError || 'Capture failed' } : s,
          ),
        );
      }

      // Short breathing pause for user to switch finger
      if (!autoCancelRef.current && i < FINGERS.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    setAutoEnrolling(false);
    setActiveFingerIndex(-1);

    if (!autoCancelRef.current) {
      setMessage({
        type: 'info',
        text: `Captured ${enrolledCountAcc}/${FINGERS.length} fingers. Click "Save Fingerprints to Database" below to store.`,
      });
    }
  }, [userInfo, resolveScannerForCapture, idValue, idType, scannerType, apiBase]);

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

  const activeSlot = activeFingerIndex >= 0 ? slots[activeFingerIndex] : null;
  const enrolledCount = slots.filter((s) => s.status === 'enrolled').length;
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
    <div className="max-w-4xl mx-auto p-4 sm:p-6 relative">
      {/* Header with Test Button */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Fingerprint className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Fingerprint Enrollment
            </h1>
            <p className="text-xs text-gray-500">
              Enroll and test biometric verification with ESP32 & optical fingerprint scanner
            </p>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Register New Fingerprint Button */}
          <button
            type="button"
            onClick={() => {
              setShowRegisterModal(true);
              setSearchQuery('');
              setSearchResults([]);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-sm font-semibold rounded-xl shadow-md transition transform active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-indigo-200" />
            Register New Fingerprint
          </button>

          {/* Test Fingerprint Search Button */}
          <button
            type="button"
            onClick={openTestModal}
            disabled={deviceConnecting || (scannerOnline === false && scannerType !== 'demo')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-xl shadow-md transition transform active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-spin" />
            Test Fingerprint Search
          </button>
        </div>
      </div>

      {/* ── Register New Fingerprint Modal ────────────────────── */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Register New Fingerprint</h3>
                  <p className="text-xs text-gray-500">Search student or staff by name, register number, username, or staff ID</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Realtime Search Input */}
            <div className="relative mb-6">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Search User (Realtime)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type student name, reg no (e.g. 2403811714821042), staff ID, or username..."
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition shadow-xs"
                  autoFocus
                />
                {searchLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              {/* Realtime Dropdown Results */}
              {searchQuery.trim().length > 0 && (
                <div className="mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100 z-20">
                  {searchResults.length === 0 && !searchLoading ? (
                    <div className="p-4 text-center text-xs text-gray-500">
                      No matching student or staff found for "{searchQuery}".
                    </div>
                  ) : (
                    searchResults.map((u) => (
                      <button
                        key={`${u.user_type}-${u.identifier}`}
                        type="button"
                        onClick={() => selectUserForRegistration(u)}
                        className={`w-full p-3.5 text-left flex items-center justify-between gap-3 hover:bg-indigo-50/80 transition ${
                          selectedUserForEnroll?.identifier === u.identifier ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {u.profile_image ? (
                            <img src={u.profile_image} alt="" className="w-10 h-10 rounded-xl object-cover border border-gray-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {(u.user_name || '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate flex items-center gap-2">
                              {u.user_name}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold capitalize">
                                {u.user_type}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              ID: <strong className="text-gray-700">{u.identifier}</strong>
                              {u.department ? ` • ${u.department}` : ''}
                            </div>
                          </div>
                        </div>

                        <span className="text-xs font-semibold text-indigo-600 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 shrink-0">
                          Select User
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected User & Finger Guidance Section */}
            {selectedUserForEnroll && (
              <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 mb-6 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-3">
                    {selectedUserForEnroll.profile_image ? (
                      <img src={selectedUserForEnroll.profile_image} alt="" className="w-12 h-12 rounded-xl object-cover border border-indigo-200" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                        {(selectedUserForEnroll.user_name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">{selectedUserForEnroll.user_name}</h4>
                      <p className="text-xs text-gray-600">
                        {selectedUserForEnroll.identifier} • {selectedUserForEnroll.department || selectedUserForEnroll.user_type}
                      </p>
                    </div>
                  </div>

                  {!autoEnrolling ? (
                    <button
                      type="button"
                      onClick={startAutoEnrollment}
                      disabled={scannerOnline === false && scannerType !== 'demo'}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
                    >
                      <Fingerprint className="w-4 h-4 animate-pulse" />
                      Start Capturing All 4 Fingers
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopAutoEnrollment}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 text-xs font-semibold rounded-xl"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  )}
                </div>

                {/* Finger Step-by-Step Guidance */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {slots.map((slot, idx) => {
                    const isCur = autoEnrolling && activeFingerIndex === idx;
                    const isEnr = slot.status === 'enrolled';
                    const isErr = slot.status === 'error';

                    return (
                      <div
                        key={slot.finger}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          isEnr
                            ? 'bg-green-50 border-green-300'
                            : isCur
                              ? 'bg-indigo-100/90 border-indigo-600 ring-2 ring-indigo-300'
                              : isErr
                                ? 'bg-red-50 border-red-200'
                                : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex justify-center mb-1.5">
                          {isEnr ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : isCur ? (
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                          ) : isErr ? (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <Fingerprint className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div className="text-xs font-bold text-gray-800">{slot.label}</div>
                        <div className={`text-[10px] mt-0.5 font-medium ${
                          isEnr ? 'text-green-700' : isCur ? 'text-indigo-700' : isErr ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {isEnr ? '✓ Captured' : isCur ? 'Place now…' : isErr ? (slot.errorMsg || 'Failed') : `Step #${idx + 1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explicit Save Fingerprints to Database Button */}
                {slots.some((s) => s.status === 'enrolled' && s.template_b64) && !autoEnrolling && (
                  <div className="pt-3 border-t border-indigo-100 flex items-center justify-between gap-3 flex-wrap animate-in fade-in duration-300">
                    <p className="text-xs text-indigo-900 font-medium">
                      ✓ {slots.filter((s) => s.status === 'enrolled').length} fingers ready. Click to finalize database storage.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setSaving(true);
                        setMessage(null);
                        let savedCount = 0;
                        let lastSaveErr = '';

                        for (const slot of slots) {
                          if (slot.status === 'enrolled' && slot.template_b64) {
                            const res = await saveSingleFingerToBackend(
                              slot.finger,
                              slot.template_b64,
                              slot.quality_score || 80,
                              slot.slot,
                            );
                            if (res.success) {
                              savedCount++;
                            } else {
                              lastSaveErr = res.error || 'Failed to save finger';
                              setSlots((prev) =>
                                prev.map((s) =>
                                  s.finger === slot.finger ? { ...s, status: 'error', errorMsg: lastSaveErr } : s,
                                ),
                              );
                            }
                          }
                        }

                        setSaving(false);
                        if (savedCount > 0) {
                          setMessage({
                            type: 'success',
                            text: `🎉 Success! Stored ${savedCount} biometric fingerprint(s) for ${selectedUserForEnroll.user_name} into database.`,
                          });
                          lookupUser();
                        } else if (lastSaveErr) {
                          setMessage({
                            type: 'error',
                            text: lastSaveErr,
                          });
                        }
                      }}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md transition transform active:scale-95 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {saving ? 'Storing Fingerprints in Database...' : 'Save Fingerprints to Database'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <span className="text-xs text-gray-500">
                Templates are stored directly in the database and synced for live biometric verification.
              </span>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Test Search Popup Modal ─────────────────────────────── */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-xl w-full p-6 sm:p-8 relative overflow-hidden">
            {/* Background Decorative Rings */}
            <div className="absolute -top-16 -right-16 w-44 h-44 bg-indigo-100/60 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-emerald-100/60 rounded-full blur-2xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Scan className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Live Biometric Test Search</h3>
                  <p className="text-xs text-gray-500">Continuous background search & identification loop</p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeTestModal}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Animated Finger Placement Area */}
            <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-center text-white relative mb-6 shadow-inner border border-slate-800">
              <div className="relative inline-block mb-4">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-400/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                  <Fingerprint className={`w-14 h-14 ${testSearching ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1 shadow">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>

              <h4 className="text-lg font-bold text-white mb-1">
                {testSearching ? 'Scanning Fingerprint…' : 'Place Finger on Sensor'}
              </h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Hold any enrolled finger firmly on the sensor. Matches are identified in real-time while continuously listening for next scans.
              </p>

              <div className="mt-4 inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-medium text-emerald-300 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                {testSearchStatus}
              </div>
            </div>

            {/* Scan State Card Area */}
            {testScanResult.status === 'matched' && testScanResult.user ? (
              <div className="rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-4 shadow-md transition animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-4">
                  {testScanResult.user.profile_image ? (
                    <img
                      src={testScanResult.user.profile_image}
                      alt=""
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-300 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-sm">
                      {(testScanResult.user.user_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-gray-900 truncate">
                        {testScanResult.user.user_name}
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-xs capitalize">
                        {testScanResult.user.user_type}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-xs text-gray-700">
                      <div>
                        <span className="text-gray-500">ID / Reg No: </span>
                        <strong className="font-semibold text-gray-900">{testScanResult.user.identifier}</strong>
                      </div>
                      {testScanResult.user.department && (
                        <div>
                          <span className="text-gray-500">Dept: </span>
                          <strong className="font-semibold text-gray-900">{testScanResult.user.department}</strong>
                        </div>
                      )}
                      {testScanResult.user.finger && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Finger: </span>
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                            <UserCheck className="w-3 h-3 text-emerald-700" />
                            {testScanResult.user.finger}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between text-[11px] text-emerald-800">
                  <span className="font-medium">✓ Verified & matched in database ({testScanResult.timestamp})</span>
                  <span className="text-gray-500">Listening for next finger…</span>
                </div>
              </div>
            ) : testScanResult.status === 'unregistered' ? (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm transition animate-in slide-in-from-bottom-2 duration-300 text-left">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">Fingerprint Detected (Unregistered)</h4>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      A physical fingerprint was scanned on the sensor at {testScanResult.timestamp}, but no matching user profile was found enrolled in the database.
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 bg-amber-200/60 px-2.5 py-1 rounded-lg">
                      <Fingerprint className="w-3.5 h-3.5" />
                      Place another enrolled finger on the scanner to test...
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-center text-xs text-gray-400 bg-gray-50/60 flex flex-col items-center justify-center gap-1">
                <Fingerprint className="w-6 h-6 text-gray-300 animate-pulse" />
                <span>Place any finger on the scanner. Identified profile or scan info will stay here until the next finger is detected.</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeTestModal}
                className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition"
              >
                Close Popup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Web Serial not supported banner */}
      {!serialSupported && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          ⚠️ Web Serial API is not supported in this browser. Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         Step 1 – Connect Fingerprint Device
         ══════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
              1
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Connect Fingerprint Device</h2>
              <p className="text-[11px] text-gray-500">Connect your USB or WiFi ESP32 R305/R307 biometric scanner</p>
            </div>
          </div>

          {(usbPort || scannerOnline) && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-1.5 shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-xs font-bold text-green-800">{usbDeviceName || 'Scanner Connected & Ready'}</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSelectPort}
              disabled={!serialSupported || deviceConnecting}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
            >
              {deviceConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Usb className="w-4 h-4" />
              )}
              Select USB Port
            </button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="http://192.168.29.159"
                value={scannerUrl}
                onChange={(e) => setScannerUrl(e.target.value)}
                className="border border-gray-300 rounded-2xl px-4 py-2.5 text-xs font-mono w-60 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={() => runScannerDetection('esp32_bridge', scannerUrl || 'http://192.168.29.159')}
                disabled={deviceConnecting}
                className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl px-4 py-2.5 text-xs font-semibold border border-gray-300 transition shadow-xs"
              >
                Connect WiFi ESP32
              </button>
            </div>
          </div>

          {usbError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-600">
              {usbError}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
         Main Action Hub: Register User & Test Fingerprint
         ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Card 1: Register New Fingerprint */}
        <div className="rounded-3xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-indigo-50/30 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-md shadow-indigo-200">
              <UserPlus className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Register Users Fingerprints</h3>
            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              Search any student or staff in real-time by Name, Register Number, Staff ID, or Username, then sequentially register and save all 4 fingers directly to database.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowRegisterModal(true);
              setSearchQuery('');
              setSearchResults([]);
            }}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-2xl shadow-md transition transform active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Open Register User Window
          </button>
        </div>

        {/* Card 2: Test Fingerprint Search */}
        <div className="rounded-3xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-4 shadow-md shadow-emerald-200">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Test Fingerprint Verification</h3>
            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              Place any finger on the sensor. If registered, displays verified profile card. If unregistered, detects physical presence and reports unregistered notice.
            </p>
          </div>

          <button
            type="button"
            onClick={openTestModal}
            disabled={deviceConnecting || (scannerOnline === false && scannerType !== 'demo')}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-2xl shadow-md transition transform active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 animate-spin" />
            Launch Test Fingerprint Search
          </button>
        </div>
      </div>

      {/* ── Message banner ─────────────────────────────────────── */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-2xl text-sm flex items-start gap-2.5 ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0" />
          ) : message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}

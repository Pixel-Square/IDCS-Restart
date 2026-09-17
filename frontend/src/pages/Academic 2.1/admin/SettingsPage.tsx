/**
 * Academic 2.1 Admin Settings Page
 * Central settings page. Each setting is a standalone section.
 * Add new sections here as the system grows.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Bell, Bold, Code, Eye, Film, Italic, List, MessageSquare,
  Save, Send, Settings, ShieldCheck, Smile, Sparkles, Strikethrough, Tag, Type, Upload, Users
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

// ─── Android-style Toggle Switch Component ──────────────────────────────────
function AndroidSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
        checked ? 'bg-blue-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── Pass Mark Section ───────────────────────────────────────────────────────

interface PassMarkSetting {
  id: string;
  out_of: number;
  pass_mark: number;
  label: string;
  updated_at: string;
}

interface AcademicNotificationSetting {
  id: string;
  key: string;
  student_publish_enabled: boolean;
  notify_on_first_publish: boolean;
  notify_on_row_edits_only: boolean;
  notify_on_every_publish_click: boolean;
  notify_on_row_filled: boolean;
  first_publish_template: string;
  edited_rows_template: string;
  row_filled_template: string;
  every_publish_template: string;
  cqi_announce_enabled: boolean;
  cqi_announce_template: string;
  updated_at: string;
}

interface MyMarksSetting {
  id: string;
  key: string;
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  updated_at: string;
}

function PassMarkSection() {
  const [setting, setSetting]     = useState<PassMarkSetting | null>(null);
  const [outOf, setOutOf]         = useState<number>(100);
  const [passMark, setPassMark]   = useState<number>(50);
  const [label, setLabel]         = useState<string>('Default');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/pass-mark-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PassMarkSetting = await res.json();
      setSetting(data);
      setOutOf(data.out_of);
      setPassMark(data.pass_mark);
      setLabel(data.label || 'Default');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (passMark > outOf) { setError('Pass mark cannot exceed Out Of value'); return; }
    if (outOf <= 0 || passMark < 0) { setError('Invalid values'); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/pass-mark-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ out_of: outOf, pass_mark: passMark, label }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PassMarkSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        The <strong>Pass Mark</strong> and <strong>Out Of</strong> values set the pass threshold used in
        Result Analysis PDF reports. Students scoring ≥ Pass Mark are counted as passed.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            maxLength={100}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Default"
          />
        </div>
        {/* Out Of */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Out Of (Total Marks)</label>
          <input
            type="number"
            value={outOf}
            min={1}
            max={1000}
            onChange={e => setOutOf(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Pass Mark */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Pass Mark</label>
          <input
            type="number"
            value={passMark}
            min={0}
            max={outOf}
            onChange={e => setPassMark(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Preview */}
      <p className="text-xs text-gray-500">
        Preview: pass mark is <strong>{passMark}/{outOf}</strong> ({outOf > 0 ? Math.round((passMark / outOf) * 100) : 0}%)
        {setting?.updated_at && <span className="ml-3 text-gray-400">· Last saved: {new Date(setting.updated_at).toLocaleString()}</span>}
      </p>

      {error   && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}


function MyMarksSection() {
  const [setting, setSetting] = useState<MyMarksSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [viewingEnabled, setViewingEnabled] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [requireMobile, setRequireMobile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/my-marks-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MyMarksSetting = await res.json();
      setSetting(data);
      setViewingEnabled(Boolean(data.viewing_enabled));
      setRequirePhoto(Boolean(data.require_profile_photo));
      setRequireMobile(Boolean(data.require_mobile_number));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load My Marks settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/my-marks-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewing_enabled: viewingEnabled,
          require_profile_photo: requirePhoto,
          require_mobile_number: requireMobile,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MyMarksSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save My Marks settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Control whether students can open Academic 2.1 <strong>My Marks</strong> and whether their profile must include a photo and mobile number before access is granted.
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Viewing My Marks</div>
            <div className="text-xs text-gray-500 mt-1">Master switch for the student Academic 2.1 My Marks pages.</div>
          </div>
          <AndroidSwitch checked={viewingEnabled} onChange={setViewingEnabled} disabled={saving} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Profile photo required</div>
            <div className="text-xs text-gray-500 mt-1">Students must upload a profile photo before opening My Marks.</div>
          </div>
          <AndroidSwitch checked={requirePhoto} onChange={setRequirePhoto} disabled={saving} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Mobile number required</div>
            <div className="text-xs text-gray-500 mt-1">Students must add a mobile number before opening My Marks.</div>
          </div>
          <AndroidSwitch checked={requireMobile} onChange={setRequireMobile} disabled={saving} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {setting?.updated_at && <span>Last saved: {new Date(setting.updated_at).toLocaleString()}</span>}
      </p>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Rich WhatsApp Template Editor ─────────────────────────────────────────

interface RichTemplateEditorProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  tokens?: TokenDef[];
  isActive?: boolean;
  onFocus?: () => void;
  helperText?: string;
}

const COMMON_SYMBOLS = [
  { label: '• Bullet', char: '• ' },
  { label: '✓ Check', char: '✓ ' },
  { label: '➜ Arrow', char: '➜ ' },
  { label: '📌 Pin', char: '📌 ' },
  { label: '⚠️ Alert', char: '⚠️ ' },
  { label: '📊 Chart', char: '📊 ' },
  { label: '🎓 Cap', char: '🎓 ' },
  { label: '── Line', char: '\n━━━━━━━━━━━━━━━━━━━━\n' },
];

function RichTemplateEditor({
  label,
  value,
  onChange,
  placeholder = 'Sample will be used if empty',
  disabled = false,
  rows = 4,
  tokens = [],
  isActive = false,
  onFocus,
  helperText,
}: RichTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTokensDropdown, setShowTokensDropdown] = useState(false);
  const [showSymbolsDropdown, setShowSymbolsDropdown] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Wrap or unwrap selected text with format characters (e.g. *bold*, _italic_, ~strike~, `code`)
  const handleWrapSelection = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'text') => {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const original = el.value;

    const hasSelection = start !== end;
    const selectedText = hasSelection ? original.substring(start, end) : defaultPlaceholder;

    // Check if selectedText is already wrapped with prefix and suffix
    const isAlreadyWrapped =
      selectedText.startsWith(prefix) &&
      selectedText.endsWith(suffix) &&
      selectedText.length >= prefix.length + suffix.length;

    let newFullText: string;
    let newStart: number;
    let newEnd: number;

    if (isAlreadyWrapped) {
      // Toggle off: unwrap
      const unwrapped = selectedText.slice(prefix.length, -suffix.length);
      newFullText = original.substring(0, start) + unwrapped + original.substring(end);
      newStart = start;
      newEnd = start + unwrapped.length;
    } else {
      // Wrap
      const wrapped = `${prefix}${selectedText}${suffix}`;
      newFullText = original.substring(0, start) + wrapped + original.substring(end);
      newStart = start;
      newEnd = start + wrapped.length;
    }

    onChange(newFullText);

    // Keep highlight / selection around the affected area
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newStart, newEnd);
      }
    }, 10);
  };

  // Insert string (token, symbol, or text) at cursor position or replace selection
  const handleInsertAtCursor = (content: string) => {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) {
      const next = value ? (value.endsWith(' ') || value.endsWith('\n') ? value + content : value + ' ' + content) : content;
      onChange(next);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const original = el.value;

    const newFullText = original.substring(0, start) + content + original.substring(end);
    const newPos = start + content.length;

    onChange(newFullText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  // Helper to parse WhatsApp formatting for live preview
  const renderFormattedPreview = (raw: string) => {
    if (!raw.trim()) {
      return <span className="text-gray-400 italic">No template text provided (will use default template).</span>;
    }

    const lines = raw.split('\n');
    return (
      <div className="space-y-1 font-sans text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
        {lines.map((line, idx) => {
          // Token highlighting & bold / italic basic regex rendering for WhatsApp preview
          // Split by bold (*...*), italic (_..._), tokens ({...})
          const parts = line.split(/(\*[^*]+\*|_[^_]+_|{[a-zA-Z0-9_]+})/g);
          return (
            <div key={idx} className="min-h-[1.2em]">
              {parts.map((part, pIdx) => {
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                  return <strong key={pIdx} className="font-bold text-gray-900">{part.slice(1, -1)}</strong>;
                }
                if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
                  return <em key={pIdx} className="italic text-gray-800">{part.slice(1, -1)}</em>;
                }
                if (part.startsWith('{') && part.endsWith('}') && part.length > 2) {
                  return (
                    <span key={pIdx} className="inline-block bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-[11px] font-mono mx-0.5 border border-blue-200">
                      {part}
                    </span>
                  );
                }
                return <span key={pIdx}>{part}</span>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`border rounded-xl transition-all ${isActive ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 bg-white'}`}>
      {/* Top Header / Label Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 bg-gray-50/75 rounded-t-xl">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-gray-800">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
              showPreview ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Eye className="w-3 h-3" />
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Formatting & Actions Toolbar */}
      {!showPreview && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-1">
            {/* Bold (*text*) */}
            <button
              type="button"
              disabled={disabled}
              title="Bold: Select text and click to toggle *bold*"
              onClick={() => handleWrapSelection('*', '*', 'bold_text')}
              className="p-1.5 text-gray-700 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded border border-gray-200 bg-white transition-colors disabled:opacity-40 disabled:hover:bg-white"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>

            {/* Italic (_text_) */}
            <button
              type="button"
              disabled={disabled}
              title="Italic: Select text and click to toggle _italic_"
              onClick={() => handleWrapSelection('_', '_', 'italic_text')}
              className="p-1.5 text-gray-700 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded border border-gray-200 bg-white transition-colors disabled:opacity-40 disabled:hover:bg-white"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            {/* Strikethrough (~text~) */}
            <button
              type="button"
              disabled={disabled}
              title="Strikethrough: Select text and click to toggle ~strikethrough~"
              onClick={() => handleWrapSelection('~', '~', 'strike_text')}
              className="p-1.5 text-gray-700 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded border border-gray-200 bg-white transition-colors disabled:opacity-40 disabled:hover:bg-white"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            {/* Monospace (```text```) */}
            <button
              type="button"
              disabled={disabled}
              title="Monospace: Select text and click to toggle ```code```"
              onClick={() => handleWrapSelection('```', '```', 'monospace_text')}
              className="p-1.5 text-gray-700 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded border border-gray-200 bg-white transition-colors disabled:opacity-40 disabled:hover:bg-white"
            >
              <Code className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {/* Symbols dropdown */}
            <div className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setShowSymbolsDropdown(!showSymbolsDropdown);
                  setShowTokensDropdown(false);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-200 bg-white transition-colors disabled:opacity-40"
              >
                <Smile className="w-3.5 h-3.5 text-amber-600" />
                <span>Symbols</span>
              </button>

              {showSymbolsDropdown && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-30 grid grid-cols-1 divide-y divide-gray-50">
                  {COMMON_SYMBOLS.map((sym, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        handleInsertAtCursor(sym.char);
                        setShowSymbolsDropdown(false);
                      }}
                      className="flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-blue-50 text-gray-700 hover:text-blue-700 transition-colors"
                    >
                      <span className="font-medium">{sym.label}</span>
                      <span className="text-gray-400 font-mono text-[11px]">{sym.char.trim()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tokens quick dropdown / list */}
          {tokens.length > 0 && (
            <div className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setShowTokensDropdown(!showTokensDropdown);
                  setShowSymbolsDropdown(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors disabled:opacity-40"
              >
                <Tag className="w-3 h-3 text-blue-600" />
                <span>Insert Token</span>
              </button>

              {showTokensDropdown && (
                <div className="absolute right-0 top-full mt-1 w-56 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-30 divide-y divide-gray-50">
                  <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Available Tokens
                  </div>
                  {tokens.map((tok) => (
                    <button
                      key={tok.key}
                      type="button"
                      onClick={() => {
                        handleInsertAtCursor(tok.key);
                        setShowTokensDropdown(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-blue-50 text-gray-700 hover:text-blue-700 transition-colors font-mono"
                    >
                      <span className="text-blue-600">{tok.key}</span>
                      <span className="text-[10px] text-gray-400">{tok.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Body or Preview Body */}
      {showPreview ? (
        <div className="p-3 bg-emerald-50/40 rounded-b-xl min-h-[96px] border-t border-emerald-100">
          <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider mb-1 flex items-center gap-1">
            <span>WhatsApp Message Preview:</span>
          </div>
          <div className="bg-white border border-emerald-200/80 rounded-lg p-3 shadow-xs">
            {renderFormattedPreview(value)}
          </div>
        </div>
      ) : (
        <div className="p-2">
          <textarea
            ref={textareaRef}
            value={value}
            onFocus={onFocus}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full bg-transparent border-0 px-2 py-1 text-sm font-sans focus:outline-none focus:ring-0 text-gray-900 placeholder:text-gray-400 resize-y leading-relaxed disabled:text-gray-400"
          />
        </div>
      )}

      {helperText && (
        <div className="px-3 pb-2 pt-0.5 text-[11px] text-gray-500 border-t border-gray-50 bg-gray-50/30 rounded-b-xl">
          {helperText}
        </div>
      )}
    </div>
  );
}

// ─── Academic Notifications Section ─────────────────────────────────────────

type TokenDef = { key: string; label: string };

function AcademicNotificationsSection() {
  const [setting, setSetting] = useState<AcademicNotificationSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [studentEnabled, setStudentEnabled] = useState(false);
  const [firstEnabled, setFirstEnabled] = useState(true);
  const [editedEnabled, setEditedEnabled] = useState(true);
  const [everyEnabled, setEveryEnabled] = useState(false);
  const [rowFilledEnabled, setRowFilledEnabled] = useState(false);

  const [tplFirst, setTplFirst] = useState('');
  const [tplEdited, setTplEdited] = useState('');
  const [tplRowFilled, setTplRowFilled] = useState('');
  const [tplEvery, setTplEvery] = useState('');

  const [cqiAnnounceEnabled, setCqiAnnounceEnabled] = useState(false);
  const [tplCqiAnnounce, setTplCqiAnnounce] = useState('');

  const [activeTpl, setActiveTpl] = useState<'first' | 'edited' | 'row' | 'every' | 'cqi' | null>(null);

  const tokensCourse: TokenDef[] = useMemo(() => ([
    { key: '{course_code}', label: 'course_code' },
    { key: '{course_name}', label: 'course_name' },
    { key: '{class_name}', label: 'class_name' },
    { key: '{section}', label: 'section' },
    { key: '{exam_name}', label: 'exam_name' },
    { key: '{max_mark}', label: 'max_mark' },
    { key: '{faculty_name}', label: 'faculty_name' },
  ]), []);

  const tokensStudent: TokenDef[] = useMemo(() => ([
    { key: '{student_name}', label: 'student_name' },
    { key: '{register_number}', label: 'register_number' },
    { key: '{mark}', label: 'mark' },
  ]), []);

  const tokensCqi: TokenDef[] = useMemo(() => ([
    { key: '{co_attainments}', label: 'co_attainments' },
    { key: '{conditions}', label: 'conditions' },
    { key: '{satisfied_conditions}', label: 'satisfied_conditions' },
  ]), []);

  const insertToken = (tok: string) => {
    if (!activeTpl) return;
    const apply = (prev: string) => {
      if (!prev) return tok;
      if (prev.endsWith(' ') || prev.endsWith('\n')) return prev + tok;
      return prev + ' ' + tok;
    };
    if (activeTpl === 'first') setTplFirst(apply);
    if (activeTpl === 'edited') setTplEdited(apply);
    if (activeTpl === 'row') setTplRowFilled(apply);
    if (activeTpl === 'every') setTplEvery(apply);
    if (activeTpl === 'cqi') setTplCqiAnnounce(apply);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/academic-notification-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AcademicNotificationSetting = await res.json();
      setSetting(data);
      setStudentEnabled(Boolean(data.student_publish_enabled));
      setFirstEnabled(Boolean(data.notify_on_first_publish));
      setEditedEnabled(Boolean(data.notify_on_row_edits_only));
      setEveryEnabled(Boolean(data.notify_on_every_publish_click));
      setRowFilledEnabled(Boolean(data.notify_on_row_filled));
      setTplFirst(String(data.first_publish_template || ''));
      setTplEdited(String(data.edited_rows_template || ''));
      setTplRowFilled(String(data.row_filled_template || ''));
      setTplEvery(String(data.every_publish_template || ''));
      setCqiAnnounceEnabled(Boolean(data.cqi_announce_enabled));
      setTplCqiAnnounce(String(data.cqi_announce_template || ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/academic-notification-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_publish_enabled: studentEnabled,
          notify_on_first_publish: firstEnabled,
          notify_on_row_edits_only: editedEnabled,
          notify_on_every_publish_click: everyEnabled,
          notify_on_row_filled: rowFilledEnabled,
          first_publish_template: tplFirst,
          edited_rows_template: tplEdited,
          row_filled_template: tplRowFilled,
          every_publish_template: tplEvery,
          cqi_announce_enabled: cqiAnnounceEnabled,
          cqi_announce_template: tplCqiAnnounce,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AcademicNotificationSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Configure WhatsApp notification rules and message templates for Academic 2.1.
        Templates support token variables (listed at the bottom).
      </div>

      {/* Student academic notifications */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Student Academic Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Send WhatsApp messages when faculty publishes marks for exams inside a course or when a student row is first filled with a mark.</div>
          </div>
          <div className="flex items-center gap-2">
            <AndroidSwitch checked={studentEnabled} onChange={setStudentEnabled} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">First time published</span>
            <AndroidSwitch disabled={!studentEnabled} checked={firstEnabled} onChange={setFirstEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Edited rows only</span>
            <AndroidSwitch disabled={!studentEnabled} checked={editedEnabled} onChange={setEditedEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Every publish click</span>
            <AndroidSwitch disabled={!studentEnabled} checked={everyEnabled} onChange={setEveryEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Row filled</span>
            <AndroidSwitch disabled={!studentEnabled} checked={rowFilledEnabled} onChange={setRowFilledEnabled} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <RichTemplateEditor
            label="Message template — First time published"
            value={tplFirst}
            onFocus={() => setActiveTpl('first')}
            onChange={setTplFirst}
            rows={4}
            disabled={!studentEnabled || !firstEnabled}
            tokens={[...tokensCourse, ...tokensStudent]}
            isActive={activeTpl === 'first'}
          />

          <RichTemplateEditor
            label="Message template — Edited rows only"
            value={tplEdited}
            onFocus={() => setActiveTpl('edited')}
            onChange={setTplEdited}
            rows={4}
            disabled={!studentEnabled || !editedEnabled}
            tokens={[...tokensCourse, ...tokensStudent]}
            isActive={activeTpl === 'edited'}
          />

          <RichTemplateEditor
            label="Message template — Row filled"
            value={tplRowFilled}
            onFocus={() => setActiveTpl('row')}
            onChange={setTplRowFilled}
            rows={4}
            disabled={!studentEnabled || !rowFilledEnabled}
            tokens={[...tokensCourse, ...tokensStudent]}
            isActive={activeTpl === 'row'}
          />

          <RichTemplateEditor
            label="Message template — Every publish click"
            value={tplEvery}
            onFocus={() => setActiveTpl('every')}
            onChange={setTplEvery}
            rows={4}
            disabled={!studentEnabled || !everyEnabled}
            tokens={[...tokensCourse, ...tokensStudent]}
            isActive={activeTpl === 'every'}
          />
        </div>
      </div>

      {/* CQI announcement */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">CQI Announcement to Students</div>
            <div className="text-xs text-gray-500 mt-0.5">If enabled, faculty can announce CQI from the CQI Entry page header.</div>
          </div>
          <div className="flex items-center gap-2">
            <AndroidSwitch checked={cqiAnnounceEnabled} onChange={setCqiAnnounceEnabled} />
          </div>
        </div>

        <div>
          <RichTemplateEditor
            label="Message template — CQI announcement"
            value={tplCqiAnnounce}
            onFocus={() => setActiveTpl('cqi')}
            onChange={setTplCqiAnnounce}
            rows={5}
            disabled={!cqiAnnounceEnabled}
            tokens={[...tokensCourse, ...tokensCqi]}
            isActive={activeTpl === 'cqi'}
            helperText="Include condition titles by using {satisfied_conditions}. CO attainments can be included via {co_attainments}"
          />
        </div>
      </div>

      {/* Token variables list (grouped at bottom) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <div className="text-sm font-semibold text-gray-900">Token Variables</div>
        </div>
        <div className="text-xs text-gray-500">Click a token to insert into the last focused template.</div>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Course / Exam</div>
            <div className="flex flex-wrap gap-2">
              {tokensCourse.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Student</div>
            <div className="flex flex-wrap gap-2">
              {tokensStudent.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">CQI</div>
            <div className="flex flex-wrap gap-2">
              {tokensCqi.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {setting?.updated_at ? `Last saved: ${new Date(setting.updated_at).toLocaleString()}` : ''}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Faculty Request Section ─────────────────────────────────────────────────

interface FacultyRequestSetting {
  id: string;
  faculty_request_enabled: boolean;
  require_mobile_verification: boolean;
  require_profile_photo: boolean;
  notify_on_request_sent: boolean;
  notify_on_step_approved: boolean;
  notify_on_final_approved: boolean;
  notify_on_published: boolean;
  request_sent_template: string;
  step_approved_template: string;
  final_approved_template: string;
  published_template: string;
  updated_at: string;
}

function FacultyRequestSection() {
  const [setting, setSetting] = useState<FacultyRequestSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [requestEnabled, setRequestEnabled] = useState(false);
  const [requireMobile, setRequireMobile] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyOnSent, setNotifyOnSent] = useState(false);
  const [notifyOnStep, setNotifyOnStep] = useState(false);
  const [notifyOnFinal, setNotifyOnFinal] = useState(false);
  const [notifyOnPublished, setNotifyOnPublished] = useState(false);

  const [tplSent, setTplSent] = useState('');
  const [tplStep, setTplStep] = useState('');
  const [tplFinal, setTplFinal] = useState('');
  const [tplPublished, setTplPublished] = useState('');

  const [activeTpl, setActiveTpl] = useState<'sent' | 'step' | 'final' | 'published' | null>(null);

  const tokensRequest: { key: string; label: string }[] = useMemo(() => ([
    { key: '{faculty_name}', label: 'faculty_name' },
    { key: '{faculty_id}', label: 'faculty_id' },
    { key: '{mobile_number}', label: 'mobile_number' },
    { key: '{request_type}', label: 'request_type' },
    { key: '{request_date}', label: 'request_date' },
    { key: '{department}', label: 'department' },
  ]), []);

  const tokensApproval: { key: string; label: string }[] = useMemo(() => ([
    { key: '{step_name}', label: 'step_name' },
    { key: '{approved_by}', label: 'approved_by' },
    { key: '{approval_date}', label: 'approval_date' },
    { key: '{remarks}', label: 'remarks' },
  ]), []);

  const insertToken = (tok: string) => {
    if (!activeTpl) return;
    const apply = (prev: string) => {
      if (!prev) return tok;
      if (prev.endsWith(' ') || prev.endsWith('\n')) return prev + tok;
      return prev + ' ' + tok;
    };
    if (activeTpl === 'sent') setTplSent(apply);
    if (activeTpl === 'step') setTplStep(apply);
    if (activeTpl === 'final') setTplFinal(apply);
    if (activeTpl === 'published') setTplPublished(apply);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/faculty-request-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FacultyRequestSetting = await res.json();
      setSetting(data);
      setRequestEnabled(Boolean(data.faculty_request_enabled));
      setRequireMobile(Boolean(data.require_mobile_verification));
      setRequirePhoto(Boolean(data.require_profile_photo));
      setNotifyEnabled(Boolean(
        data.notify_on_request_sent ||
        data.notify_on_step_approved ||
        data.notify_on_final_approved ||
        data.notify_on_published
      ));
      setNotifyOnSent(Boolean(data.notify_on_request_sent));
      setNotifyOnStep(Boolean(data.notify_on_step_approved));
      setNotifyOnFinal(Boolean(data.notify_on_final_approved));
      setNotifyOnPublished(Boolean(data.notify_on_published));
      setTplSent(String(data.request_sent_template || ''));
      setTplStep(String(data.step_approved_template || ''));
      setTplFinal(String(data.final_approved_template || ''));
      setTplPublished(String(data.published_template || ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load faculty request settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/faculty-request-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_request_enabled: requestEnabled,
          require_mobile_verification: requireMobile,
          require_profile_photo: requirePhoto,
          notify_on_request_sent: notifyEnabled && notifyOnSent,
          notify_on_step_approved: notifyEnabled && notifyOnStep,
          notify_on_final_approved: notifyEnabled && notifyOnFinal,
          notify_on_published: notifyEnabled && notifyOnPublished,
          request_sent_template: tplSent,
          step_approved_template: tplStep,
          final_approved_template: tplFinal,
          published_template: tplPublished,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FacultyRequestSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save faculty request settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Configure faculty request settings, including verification requirements and WhatsApp notifications for request workflows.
      </div>

      {/* Main enable */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Faculty Request</div>
            <div className="text-xs text-gray-500 mt-0.5">Master switch — enables the faculty request feature system-wide.</div>
          </div>
          <AndroidSwitch checked={requestEnabled} onChange={setRequestEnabled} />
        </div>

        {/* Sub-settings */}
        <div className="space-y-3 pl-1">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-700 font-medium">Mobile number verification required</div>
              <div className="text-xs text-gray-500 mt-0.5">Faculty must have a verified mobile number to submit or edit a request.</div>
            </div>
            <AndroidSwitch disabled={!requestEnabled} checked={requireMobile} onChange={setRequireMobile} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-700 font-medium">Profile photo required</div>
              <div className="text-xs text-gray-500 mt-0.5">Faculty must have a profile photo uploaded to submit or edit a request.</div>
            </div>
            <AndroidSwitch disabled={!requestEnabled} checked={requirePhoto} onChange={setRequirePhoto} />
          </div>
        </div>
      </div>

      {/* Notifications section */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Send WhatsApp messages to faculty at key stages of the request workflow.</div>
          </div>
          <AndroidSwitch disabled={!requestEnabled} checked={notifyEnabled} onChange={setNotifyEnabled} />
        </div>

        {/* Notification toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pl-1">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700 font-medium">Request sent</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnSent} onChange={setNotifyOnSent} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700 font-medium">Step approved</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnStep} onChange={setNotifyOnStep} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700 font-medium">Final approval</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnFinal} onChange={setNotifyOnFinal} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700 font-medium">Published</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnPublished} onChange={setNotifyOnPublished} />
          </div>
        </div>

        {/* Message templates */}
        <div className="space-y-4 pl-1">
          <RichTemplateEditor
            label="Message template — Request sent"
            value={tplSent}
            onFocus={() => setActiveTpl('sent')}
            onChange={setTplSent}
            rows={4}
            disabled={!requestEnabled || !notifyEnabled || !notifyOnSent}
            tokens={[...tokensRequest, ...tokensApproval]}
            isActive={activeTpl === 'sent'}
          />

          <RichTemplateEditor
            label="Message template — Step approved"
            value={tplStep}
            onFocus={() => setActiveTpl('step')}
            onChange={setTplStep}
            rows={4}
            disabled={!requestEnabled || !notifyEnabled || !notifyOnStep}
            tokens={[...tokensRequest, ...tokensApproval]}
            isActive={activeTpl === 'step'}
          />

          <RichTemplateEditor
            label="Message template — Final approval"
            value={tplFinal}
            onFocus={() => setActiveTpl('final')}
            onChange={setTplFinal}
            rows={4}
            disabled={!requestEnabled || !notifyEnabled || !notifyOnFinal}
            tokens={[...tokensRequest, ...tokensApproval]}
            isActive={activeTpl === 'final'}
          />

          <RichTemplateEditor
            label="Message template — Published"
            value={tplPublished}
            onFocus={() => setActiveTpl('published')}
            onChange={setTplPublished}
            rows={4}
            disabled={!requestEnabled || !notifyEnabled || !notifyOnPublished}
            tokens={[...tokensRequest, ...tokensApproval]}
            isActive={activeTpl === 'published'}
          />
        </div>
      </div>

      {/* Token variables */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <div className="text-sm font-semibold text-gray-900">Token Variables</div>
        </div>
        <div className="text-xs text-gray-500">Click a token to insert into the last focused template.</div>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Faculty / Request</div>
            <div className="flex flex-wrap gap-2">
              {tokensRequest.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval / Published</div>
            <div className="flex flex-wrap gap-2">
              {tokensApproval.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {setting?.updated_at ? `Last saved: ${new Date(setting.updated_at).toLocaleString()}` : ''}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Preloader Section ───────────────────────────────────────────────────────

// ─── Publish Section ────────────────────────────────────────────────────────

interface PublishSetting {
  id: string;
  must_fill_all_cells: boolean;
  publish_progress_duration: number;
  updated_at: string;
}

function PublishSection() {
  const [setting, setSetting] = useState<PublishSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mustFill, setMustFill] = useState(false);
  const [duration, setDuration] = useState(4);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/publish-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PublishSetting = await res.json();
      setSetting(data);
      setMustFill(Boolean(data.must_fill_all_cells));
      setDuration(Math.max(1, Math.min(30, Number(data.publish_progress_duration) || 4)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load publish settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (duration < 1 || duration > 30) { setError('Duration must be between 1 and 30 seconds'); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/publish-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ must_fill_all_cells: mustFill, publish_progress_duration: duration }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PublishSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save publish settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Configure how mark publishing works for faculty — validation rules and UI timing.
      </div>

      {/* Sub-section: Faculty must fill all cells */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="w-1 h-4 rounded bg-blue-500" />
          Faculty must fill all cells
        </div>
        <p className="text-xs text-gray-500">
          When enabled, the Publish button will check for any empty mark cells (non-absent students).
          If empty cells are found, a warning popup is shown with row and cell counts. Clicking OK
          highlights those cells in red inside the mark entry table.
        </p>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-800">Require all cells filled before publish</div>
            <div className="text-xs text-gray-500">Faculty will see a warning popup if any cell is empty</div>
          </div>
          <AndroidSwitch checked={mustFill} onChange={setMustFill} disabled={saving} />
        </div>
      </div>

      {/* Sub-section: Progress duration */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="w-1 h-4 rounded bg-emerald-500" />
          Publish progress duration
        </div>
        <p className="text-xs text-gray-500">
          The number of seconds the "Publishing In Progress" animation plays before showing the success screen.
          The actual API call runs concurrently; the screen waits for whichever finishes last.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={duration}
            min={1}
            max={30}
            onChange={e => setDuration(Math.max(1, Math.min(30, Number(e.target.value) || 4)))}
            disabled={saving}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-sm text-gray-500">seconds (1–30)</span>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {setting?.updated_at && `Last saved: ${new Date(setting.updated_at).toLocaleString('en-IN')}`}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Publish Settings'}
        </button>
      </div>
    </div>
  );
}


const PRELOADER_KEY = 'acv2_preloader';

interface PreloaderCfg {
  enabled: boolean;
  type: 'gif' | 'mp4';
  source: 'url' | 'upload';
  url: string;
  dataUrl: string;
  fit: 'cover' | 'contain' | 'center';
}

const DEFAULT_PRELOADER_CFG: PreloaderCfg = {
  enabled: false,
  type: 'gif',
  source: 'url',
  url: '',
  dataUrl: '',
  fit: 'contain',
};

function PreloaderSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<PreloaderCfg>(() => {
    try {
      const raw = localStorage.getItem(PRELOADER_KEY);
      if (raw) return { ...DEFAULT_PRELOADER_CFG, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PRELOADER_CFG;
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const update = (patch: Partial<PreloaderCfg>) =>
    setCfg(prev => ({ ...prev, ...patch }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadWarning(null);

    // Base64 encoding inflates size by ~33%, so a 3.5 MB file → ~4.65 MB stored.
    // Hard-block anything above 3.5 MB to avoid silently hitting the 5 MB localStorage limit.
    const HARD_LIMIT_MB = 3.5;
    const WARN_LIMIT_MB = 2;
    const fileMB = file.size / 1024 / 1024;

    if (fileMB > HARD_LIMIT_MB) {
      setUploadWarning(
        `File is ${fileMB.toFixed(1)} MB — too large to store (max ${HARD_LIMIT_MB} MB for uploads). ` +
        `Host the file somewhere and use a URL instead.`,
      );
      // reset input and bail — don't load the file into state at all
      e.target.value = '';
      return;
    }

    if (fileMB > WARN_LIMIT_MB) {
      setUploadWarning(
        `File is ${fileMB.toFixed(1)} MB — close to browser storage limits. ` +
        `A URL is more reliable for larger media.`,
      );
    }

    const reader = new FileReader();
    reader.onload = ev => update({ dataUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
    // reset input so re-uploading same file triggers onChange
    e.target.value = '';
  };

  const handleSave = () => {
    setSaveError(null);
    try {
      localStorage.setItem(PRELOADER_KEY, JSON.stringify(cfg));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Failed to save — storage quota exceeded. Try using a URL instead of upload.');
    }
  };

  const handleClear = () => {
    localStorage.removeItem(PRELOADER_KEY);
    setCfg(DEFAULT_PRELOADER_CFG);
    setSaved(false);
    setSaveError(null);
  };

  const mediaSrc = cfg.source === 'url' ? cfg.url : cfg.dataUrl;
  const hasMedia = Boolean(mediaSrc);

  // Compute object-fit CSS value; 'center' mode uses natural size via flex centering
  const getObjectFit = (fit: PreloaderCfg['fit']): React.CSSProperties =>
    fit === 'center'
      ? {}
      : { objectFit: fit, width: '100%', height: '100%' };

  const centerWrapStyle: React.CSSProperties = cfg.fit === 'center'
    ? { display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', width: '100%', height: '100%' }
    : { width: '100%', height: '100%' };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Replace the default loading spinner on the <strong>Mark Entry</strong> page with a custom GIF or MP4.
        Settings are stored in the browser's local storage and apply immediately on the next page load.
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">Custom Preloader</div>
          <div className="text-xs text-gray-500 mt-1">Enable to replace the default spinner with your media.</div>
        </div>
        <AndroidSwitch checked={cfg.enabled} onChange={v => update({ enabled: v })} />
      </div>

      {/* Config panel */}
      <div className={`space-y-5 transition-opacity ${!cfg.enabled ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Preloader Type</label>
          <div className="flex gap-3">
            {(['gif', 'mp4'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => update({ type: t })}
                className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors ${
                  cfg.type === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Source */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Source</label>
          <div className="flex gap-3">
            {(['url', 'upload'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => update({ source: s })}
                className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors ${
                  cfg.source === s
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {s === 'url' ? 'URL' : 'Upload File'}
              </button>
            ))}
          </div>
        </div>

        {/* URL or File upload */}
        {cfg.source === 'url' ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {cfg.type === 'gif' ? 'GIF URL' : 'MP4 URL'}
            </label>
            <input
              type="url"
              value={cfg.url}
              onChange={e => update({ url: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={cfg.type === 'gif' ? 'https://example.com/loader.gif' : 'https://example.com/loader.mp4'}
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Upload {cfg.type === 'gif' ? 'GIF' : 'MP4'} File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={cfg.type === 'gif' ? 'image/gif' : 'video/mp4'}
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Choose file
              </button>
              {cfg.dataUrl && (
                <span className="text-xs text-green-600 font-medium">✓ File loaded</span>
              )}
              {cfg.dataUrl && (
                <button
                  type="button"
                  onClick={() => { update({ dataUrl: '' }); setUploadWarning(null); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            {uploadWarning && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 border ${
                uploadWarning.includes('too large')
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200'
              }`}>
                {uploadWarning.includes('too large') ? '✕' : '⚠'} {uploadWarning}
              </div>
            )}
          </div>
        )}

        {/* Fit mode */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Fit to Frame</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'cover' as const, label: 'Cover', desc: 'Fill & crop' },
              { value: 'contain' as const, label: 'Contain', desc: 'Fit fully inside' },
              { value: 'center' as const, label: 'Center', desc: 'Natural size' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ fit: opt.value })}
                className={`rounded-lg border-2 px-3 py-3 text-left transition-colors ${
                  cfg.fit === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`text-sm font-semibold ${cfg.fit === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Preview</label>
          <div
            className="rounded-xl border-2 border-dashed border-gray-300 overflow-hidden"
            style={{ height: '300px', background: '#f9fafb' }}
          >
            {/* Simulated layout frame */}
            <div className="h-full flex flex-col">
              {/* Simulated header bar */}
              <div className="h-7 bg-gray-200 border-b border-gray-300 shrink-0 flex items-center px-3 gap-2">
                <div className="w-14 h-2.5 bg-gray-400 rounded" />
                <div className="flex-1" />
                <div className="w-6 h-2.5 bg-gray-400 rounded" />
              </div>
              {/* Row: sidebar + content */}
              <div className="flex flex-1 min-h-0">
                {/* Simulated sidebar */}
                <div className="w-10 bg-gray-300 border-r border-gray-300 shrink-0 flex flex-col items-center pt-3 gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-5 h-1.5 bg-gray-400 rounded" />
                  ))}
                </div>
                {/* Preloader area */}
                <div className="flex-1 relative overflow-hidden bg-white">
                  {hasMedia ? (
                    <div style={centerWrapStyle}>
                      {cfg.type === 'mp4' ? (
                        <video
                          key={mediaSrc}
                          src={mediaSrc}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={getObjectFit(cfg.fit)}
                        />
                      ) : (
                        <img
                          key={mediaSrc}
                          src={mediaSrc}
                          alt="Preloader preview"
                          style={getObjectFit(cfg.fit)}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                      <Film className="w-10 h-10" />
                      <span className="text-xs text-gray-400">No media — set a URL or upload a file</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Grey areas simulate the header and sidebar. The white area shows how the preloader will fill the content frame.
          </p>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{saveError}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          Saved! The custom preloader will appear on the next Mark Entry page load.
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleClear}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Clear / Reset to Default
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Settings Section Wrapper ─────────────────────────────────────────────────

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100">
        <div className="mt-0.5 text-gray-500">{icon}</div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<'pass_mark' | 'my_marks' | 'academic_notifications' | 'faculty_request' | 'preloader' | 'publish'>('pass_mark');

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Settings className="w-6 h-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">System-wide configuration for Academic 2.1</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Left sidebar */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">Main Sections</div>
          <button
            type="button"
            onClick={() => setActive('pass_mark')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'pass_mark' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Pass Mark</div>
              <div className="text-xs text-gray-500 truncate">Result analysis threshold</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('academic_notifications')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'academic_notifications' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Bell className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Academic Notifications</div>
              <div className="text-xs text-gray-500 truncate">WhatsApp templates and rules</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('my_marks')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'my_marks' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Eye className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">My Marks</div>
              <div className="text-xs text-gray-500 truncate">Student viewing and requirements</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('faculty_request')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'faculty_request' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Users className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Faculty Request</div>
              <div className="text-xs text-gray-500 truncate">Request rules and notifications</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('preloader')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'preloader' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Film className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Preloader</div>
              <div className="text-xs text-gray-500 truncate">Custom loading animation</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('publish')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'publish' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Send className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Publish</div>
              <div className="text-xs text-gray-500 truncate">Cell validation &amp; progress timing</div>
            </div>
          </button>
        </div>

        {/* Right content */}
        <div className="space-y-6">
          {active === 'pass_mark' && (
            <SettingsSection
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Pass Mark"
              description="Configure the pass mark threshold used in result analysis PDF reports and dashboards."
            >
              <PassMarkSection />
            </SettingsSection>
          )}

          {active === 'academic_notifications' && (
            <SettingsSection
              icon={<Bell className="w-5 h-5" />}
              title="Academic Notifications"
              description="WhatsApp notification rules and message templates for student academic updates and CQI announcements."
            >
              <AcademicNotificationsSection />
            </SettingsSection>
          )}

          {active === 'my_marks' && (
            <SettingsSection
              icon={<Eye className="w-5 h-5" />}
              title="My Marks"
              description="Control whether students can view Academic 2.1 My Marks and which profile requirements must be completed first."
            >
              <MyMarksSection />
            </SettingsSection>
          )}

          {active === 'faculty_request' && (
            <SettingsSection
              icon={<Users className="w-5 h-5" />}
              title="Faculty Request"
              description="Configure faculty request feature settings, verification requirements, and WhatsApp notifications."
            >
              <FacultyRequestSection />
            </SettingsSection>
          )}

          {active === 'preloader' && (
            <SettingsSection
              icon={<Film className="w-5 h-5" />}
              title="Preloader"
              description="Customise the loading animation shown on the Mark Entry page when exam data is being fetched."
            >
              <PreloaderSection />
            </SettingsSection>
          )}

          {active === 'publish' && (
            <SettingsSection
              icon={<Send className="w-5 h-5" />}
              title="Publish"
              description="Control faculty publish behaviour — require all cells to be filled and set the publish progress animation duration."
            >
              <PublishSection />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'
import { _registerDialogSetter, AlertType, DialogPayload } from '../utils/dialog'

// ─── Icon & style maps ──────────────────────────────────────────────────────

const ICONS: Record<AlertType, React.ReactNode> = {
  success: <CheckCircle className="h-11 w-11 text-emerald-500" />,
  error: <XCircle className="h-11 w-11 text-red-500" />,
  warning: <AlertTriangle className="h-11 w-11 text-amber-500" />,
  info: <Info className="h-11 w-11 text-indigo-500" />,
}

const TITLES: Record<AlertType, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
}

const CONFIRM_BTN: Record<AlertType, string> = {
  success: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
  error: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  info: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface DialogState {
  open: boolean
  payload: DialogPayload | null
  /** true = faded-in, false = faded-out */
  visible: boolean
}

const EMPTY: DialogState = { open: false, payload: null, visible: false }

/**
 * Mount this once at the application root.
 * It renders a portal-based modal that replaces browser alert() / confirm().
 *
 * Example (main.tsx):
 *   <DialogProvider />
 */
export default function DialogProvider() {
  const [state, setState] = useState<DialogState>(EMPTY)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Register the global setter so dialog.ts can open this modal
  useEffect(() => {
    _registerDialogSetter((payload) => {
      // Clear any pending close animation
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }

      // Mount the dialog in a hidden state, then animate it in
      setState({ open: true, payload, visible: false })
      // Double rAF: first rAF ensures DOM paint, second triggers CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setState((prev) => ({ ...prev, visible: true }))
        })
      })
    })
  }, [])

  const handleClose = (result: boolean) => {
    setState((prev) => ({ ...prev, visible: false }))
    closeTimerRef.current = setTimeout(() => {
      const cb = state.payload?.resolve
      setState(EMPTY)
      cb?.(result)
    }, 200) // matches CSS transition duration
  }

  // Keyboard: Escape → cancel/close, Enter → confirm/ok
  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false)
      if (e.key === 'Enter') handleClose(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open])

  if (!state.open || !state.payload) return null

  const { payload, visible } = state
  const { variant, message, type } = payload

  const overlayStyle: React.CSSProperties = {
    transition: 'opacity 200ms ease',
    opacity: visible ? 1 : 0,
  }

  const cardStyle: React.CSSProperties = {
    transition: 'transform 200ms ease, opacity 200ms ease',
    transform: visible ? 'scale(1)' : 'scale(0.95)',
    opacity: visible ? 1 : 0,
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-desc"
    >
      {/* Backdrop — clicking it closes alert dialogs */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => variant === 'alert' && handleClose(true)}
      />

      {/* Dialog card */}
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={cardStyle}
      >
        {/* Body */}
        <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center gap-2">
          <div>{ICONS[type]}</div>
          <h2
            id="dialog-title"
            className="text-base font-semibold text-gray-900 mt-1"
          >
            {TITLES[type]}
          </h2>
          <p
            id="dialog-desc"
            className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap"
          >
            {message}
          </p>
        </div>

        {/* Actions */}
        <div
          className={`px-6 pb-6 flex gap-3 ${
            variant === 'confirm' ? 'justify-between' : 'justify-center'
          }`}
        >
          {variant === 'confirm' && (
            <button
              onClick={() => handleClose(false)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
            >
              Cancel
            </button>
          )}
          <button
            autoFocus
            onClick={() => handleClose(true)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${CONFIRM_BTN[type]}`}
          >
            {variant === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

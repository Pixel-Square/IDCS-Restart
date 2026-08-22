import React, { useEffect } from 'react'
import { AlertCircle, X } from 'lucide-react'

interface ErrorToastProps {
  message: string
  onClose: () => void
  /** Auto-dismiss after ms. Default 6000. Set 0 to disable. */
  autoDismissMs?: number
  title?: string
}

/**
 * ErrorToast — a centred modal overlay that shows an error message.
 * Replaces window.alert() for API / validation errors.
 */
export default function ErrorToast({ message, onClose, autoDismissMs = 6000, title = 'Error' }: ErrorToastProps) {
  useEffect(() => {
    if (!autoDismissMs) return
    const t = setTimeout(onClose, autoDismissMs)
    return () => clearTimeout(t)
  }, [autoDismissMs, onClose])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-red-100 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-red-50 border-b border-red-100">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertCircle className="text-red-600" size={20} />
          </div>
          <span className="font-semibold text-red-800 text-base flex-1">{title}</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

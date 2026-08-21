import React, { useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

export type PasswordConfirmOptions = {
  title: string
  message: string
  actionLabel?: string
  /** Perform the destructive action with the verified password.
   *  Throw an Error to keep the modal open and show its message (e.g. wrong password). */
  onConfirm: (password: string) => Promise<void>
}

/**
 * Password-gated confirmation for destructive actions.
 *
 * Usage:
 *   const passwordConfirm = usePasswordConfirm()
 *   ...
 *   passwordConfirm.ask({ title, message, onConfirm: async (password) => { ... } })
 *   ...
 *   {passwordConfirm.modal}
 */
export function usePasswordConfirm() {
  const [options, setOptions] = useState<PasswordConfirmOptions | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const ask = (opts: PasswordConfirmOptions) => {
    setOptions(opts)
    setPassword('')
    setError('')
    setBusy(false)
  }

  const close = () => {
    setOptions(null)
    setPassword('')
    setError('')
    setBusy(false)
  }

  const submit = async () => {
    if (!options || busy) return
    if (!password.trim()) {
      setError('Please enter your login password.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await options.onConfirm(password.trim())
      close()
    } catch (e: any) {
      setError(e?.message || 'Verification failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const modal = options ? (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
        <div className="px-5 py-4 border-b bg-red-50/70 flex items-center gap-3">
          <ShieldAlert className="text-red-600 shrink-0" size={20} />
          <h2 className="font-bold text-gray-800">{options.title}</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600 whitespace-pre-line mb-4">{options.message}</p>
          <label className="text-xs font-medium text-gray-500">Enter your login password</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            disabled={busy}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 disabled:bg-gray-50"
            placeholder="••••••••"
          />
          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={close}
              disabled={busy}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {options.actionLabel || 'Confirm Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null

  return { ask, modal }
}

/**
 * Global dialog service — replaces browser alert() and confirm() with
 * a styled UI dialog that matches the application's design system.
 *
 * Usage:
 *   import { showAlert, showConfirm } from '../utils/dialog'
 *
 *   await showAlert('Operation completed successfully')
 *   await showAlert('Something went wrong', 'error')
 *   const ok = await showConfirm('Are you sure you want to delete this?')
 */

export type AlertType = 'success' | 'error' | 'warning' | 'info'

export interface DialogPayload {
  variant: 'alert' | 'confirm'
  message: string
  type: AlertType
  resolve: (value: boolean) => void
}

// Module-level setter registered by DialogProvider
let _setter: ((payload: DialogPayload) => void) | null = null

export function _registerDialogSetter(setter: (payload: DialogPayload) => void): void {
  _setter = setter
}

/** Auto-detect icon type from message content */
function inferType(message: string): AlertType {
  if (/fail|error|cannot|unable|no permission|invalid|not found|blocked|rejected/i.test(message))
    return 'error'
  if (/success|saved|created|deleted|updated|assigned|published|completed|synced|reverted|approved|granted|locked|submitted|imported/i.test(message))
    return 'success'
  if (/select|please|required|must|enter|missing|pick|verify|fix|no section|no assign/i.test(message))
    return 'warning'
  return 'info'
}

/**
 * Show a styled alert dialog.
 * Falls back to window.alert() if the DialogProvider has not been mounted yet.
 */
export function showAlert(message: string, type?: AlertType): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!_setter) {
      window.alert(message)
      resolve()
      return
    }
    _setter({
      variant: 'alert',
      message,
      type: type ?? inferType(message),
      resolve: () => resolve(),
    })
  })
}

/**
 * Show a styled confirm dialog. Returns true if the user clicked Confirm.
 * Falls back to window.confirm() if the DialogProvider has not been mounted yet.
 */
export function showConfirm(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!_setter) {
      resolve(window.confirm(message))
      return
    }
    _setter({
      variant: 'confirm',
      message,
      type: 'warning',
      resolve,
    })
  })
}

/**
 * Alias so components can reference the dialog type with a clearer name.
 */
export type DialogType = AlertType

/**
 * Register separate alert and confirm handlers (used by AppDialog).
 * Internally wires up `_registerDialogSetter` so that `showAlert` and
 * `showConfirm` both route through the same registered handlers.
 */
export function registerDialogHandlers(
  alertHandler: (message: string, type?: AlertType) => Promise<void>,
  confirmHandler: (message: string) => Promise<boolean>,
): void {
  _registerDialogSetter((payload) => {
    if (payload.variant === 'confirm') {
      confirmHandler(payload.message).then(payload.resolve)
    } else {
      alertHandler(payload.message, payload.type).then(() => payload.resolve(true))
    }
  })
}

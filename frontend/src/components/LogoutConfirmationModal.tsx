import React, { useEffect, useRef } from 'react';
import { LogOut, TriangleAlert } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

type LogoutConfirmationModalProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function LogoutConfirmationModal({
  isOpen,
  onCancel,
  onConfirm,
}: LogoutConfirmationModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Close logout confirmation"
          className="absolute inset-0 bg-black/50"
          onClick={onCancel}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirmation-title"
          aria-describedby="logout-confirmation-message"
          className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <TriangleAlert className="h-7 w-7" aria-hidden="true" />
          </div>

          <h2 id="logout-confirmation-title" className="text-center text-xl font-bold text-gray-900">
            Confirm Logout
          </h2>
          <p id="logout-confirmation-message" className="mt-2 text-center text-sm text-gray-600">
            Are you sure you want to logout?
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

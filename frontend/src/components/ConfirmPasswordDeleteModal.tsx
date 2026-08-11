import React, { useState } from 'react';
import { AlertTriangle, Lock, X, Loader2 } from 'lucide-react';
import fetchWithAuth from '../services/fetchAuth';

interface Props {
  isOpen: boolean;
  title?: string;
  itemName?: string;
  itemType?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export default function ConfirmPasswordDeleteModal({
  isOpen,
  title,
  itemName,
  itemType = 'item',
  onClose,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (!confirmPassword) {
      setError('Please re-enter your password to confirm.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify superuser password
      const res = await fetchWithAuth('/api/accounts/verify-password/', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Incorrect password.');
      }

      // 2. Perform deletion
      await onConfirm();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to verify password.');
    } finally {
      setLoading(false);
    }
  };

  const displayName = itemName || title || itemType;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-red-50 p-6 border-b border-red-100 flex items-start gap-4">
          <div className="p-3 bg-red-100 rounded-xl flex-shrink-0 text-red-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Confirm Password to Delete</h3>
            <p className="text-xs text-red-700 mt-1">
              You are about to delete <span className="font-semibold">{displayName}</span>. This action is permanent and cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-red-100/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Security Check: Please enter and confirm your password twice to authorize this deletion.
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-gray-400" /> Enter Password
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your current password"
              className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-gray-400" /> Re-enter Password (Confirm)
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password to confirm"
              className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Verify & Delete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

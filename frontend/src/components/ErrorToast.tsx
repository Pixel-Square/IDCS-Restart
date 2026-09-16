import React from 'react';

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

export default function ErrorToast({ message, onClose }: ErrorToastProps) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg max-w-sm"
      role="alert"
    >
      <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 text-sm">{message}</div>
      <button onClick={onClose} className="text-red-400 hover:text-red-600 ml-1 font-bold text-base leading-none">×</button>
    </div>
  );
}

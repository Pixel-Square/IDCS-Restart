import React from 'react';
import { LazyErrorBoundary } from './LazyErrorBoundary';

interface LazySuspenseProps {
  children: React.ReactNode;
  loadingText?: string;
}

export function LazySuspenseWrapper({ children, loadingText = 'Loading...' }: LazySuspenseProps) {
  return (
    <LazyErrorBoundary>
      <React.Suspense fallback={<div className="p-6 text-center">{loadingText}</div>}>
        {children}
      </React.Suspense>
    </LazyErrorBoundary>
  );
}

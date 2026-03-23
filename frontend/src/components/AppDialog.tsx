import React from 'react';
import DialogProvider from './DialogProvider';

/**
 * Backwards-compatible wrapper.
 * The current dialog implementation lives in `DialogProvider`.
 */
export default function AppDialog() {
  return <DialogProvider />;
}

import React from 'react';
import { createPortal } from 'react-dom';

export function ModalPortal(props: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return <>{props.children}</>;
  return createPortal(<>{props.children}</>, document.body);
}

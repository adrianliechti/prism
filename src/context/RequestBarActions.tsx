import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRequestBarPortal } from './requestBarPortalContext';

export function RequestBarActions({ children }: { children: ReactNode }) {
  const { portalTarget } = useRequestBarPortal();
  if (!portalTarget) return null;
  return createPortal(children, portalTarget);
}

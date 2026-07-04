import { createContext, useContext } from 'react';

export interface RequestBarPortalContextValue {
  setPortalTarget: (el: HTMLElement | null) => void;
  portalTarget: HTMLElement | null;
}

export const RequestBarPortalContext = createContext<RequestBarPortalContextValue | null>(null);

export function useRequestBarPortal() {
  const ctx = useContext(RequestBarPortalContext);
  if (!ctx) throw new Error('useRequestBarPortal must be used within RequestBarPortalProvider');
  return ctx;
}

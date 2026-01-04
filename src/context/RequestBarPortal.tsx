import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface RequestBarPortalContextValue {
  setPortalTarget: (el: HTMLElement | null) => void;
  portalTarget: HTMLElement | null;
}

const RequestBarPortalContext = createContext<RequestBarPortalContextValue | null>(null);

export function RequestBarPortalProvider({ children }: { children: ReactNode }) {
  const [portalTarget, setPortalTargetState] = useState<HTMLElement | null>(null);

  const setPortalTarget = useCallback((el: HTMLElement | null) => {
    setPortalTargetState(el);
  }, []);

  return (
    <RequestBarPortalContext.Provider value={{ portalTarget, setPortalTarget }}>
      {children}
    </RequestBarPortalContext.Provider>
  );
}

export function useRequestBarPortal() {
  const ctx = useContext(RequestBarPortalContext);
  if (!ctx) throw new Error('useRequestBarPortal must be used within RequestBarPortalProvider');
  return ctx;
}

/** Renders children into the shared request bar actions slot */
export function RequestBarActions({ children }: { children: ReactNode }) {
  const { portalTarget } = useRequestBarPortal();
  if (!portalTarget) return null;
  return createPortal(children, portalTarget);
}

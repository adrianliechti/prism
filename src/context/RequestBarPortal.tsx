import { useState, useCallback, type ReactNode } from 'react';
import { RequestBarPortalContext } from './requestBarPortalContext';

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

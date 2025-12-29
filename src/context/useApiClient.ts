import { useContext } from 'react';
import { ApiClientContext } from './ApiClientContext';

export function useApiClient() {
  const context = useContext(ApiClientContext);
  if (!context) {
    throw new Error('useApiClient must be used within an ApiClientProvider');
  }
  return context;
}

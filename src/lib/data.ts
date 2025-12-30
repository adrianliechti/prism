const STORE_NAME = 'requests';

export interface DataEntry {
  id: string;
  updated?: string;
}

export async function listEntries(): Promise<DataEntry[]> {
  const response = await fetch(`/data/${STORE_NAME}`);
  if (!response.ok) {
    throw new Error(`Failed to list entries: ${response.statusText}`);
  }
  return response.json();
}

export async function setValue(key: string, value: unknown): Promise<void> {
  const response = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to save value: ${response.statusText}`);
  }
}

export async function getValue<T = unknown>(key: string): Promise<T | undefined> {
  const response = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(key)}`);
  
  if (response.status === 404) {
    return undefined;
  }
  
  if (!response.ok) {
    throw new Error(`Failed to get value: ${response.statusText}`);
  }
  
  return response.json();
}

export async function deleteValue(key: string): Promise<void> {
  const response = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete value: ${response.statusText}`);
  }
}
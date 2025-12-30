// Global configuration loaded from /config.json

export interface AIConfig {
  model?: string;
}

export interface AppConfig {
  ai?: AIConfig;
}

let config: AppConfig = {};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/config.json');

    if (response.ok) {
      const jsonConfig = await response.json();
      config = { ...config, ...jsonConfig };
    } else {
      console.warn('Failed to load config.json, using defaults');
    }

    return config;
  } catch (error) {
    console.warn('Error loading config:', error);
    return config;
  }
}

export function getConfig(): AppConfig {
  return config;
}

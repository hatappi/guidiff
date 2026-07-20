export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'guidiff-theme';

export function resolveTheme(stored: Theme | null, osPrefersDark: boolean): Theme {
  return stored ?? (osPrefersDark ? 'dark' : 'light');
}

export function loadStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function saveStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode etc.) — theme just won't persist
  }
}

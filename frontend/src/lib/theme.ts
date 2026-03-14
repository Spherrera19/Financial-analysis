export type Theme = 'system' | 'light' | 'dark' | 'pastel' | 'high-contrast';

export function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

export function loadTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) ?? 'system';
}

import { useState, useEffect } from 'react';

export type Theme = 'light' | 'sky' | 'dark';

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('precision-theme') as Theme;
    if (saved === 'dark' || saved === 'light' || saved === 'sky') return saved;
    // Detect browser/OS dark mode preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'sky');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'sky') root.classList.add('sky');
    localStorage.setItem('precision-theme', theme);
  }, [theme]);

  // Listen for OS-level dark mode changes (only if user hasn't manually set a preference)
  useEffect(() => {
    const saved = localStorage.getItem('precision-theme');
    if (saved) return; // user has explicit preference, don't override
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = (next: Theme) => setThemeState(next);

  // Kept for any old callers — cycles light -> sky -> dark -> light.
  const toggle = () => setThemeState(prev => prev === 'light' ? 'sky' : prev === 'sky' ? 'dark' : 'light');

  return { theme, setTheme, toggle, isDark: theme === 'dark', isSky: theme === 'sky' };
};
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

// The inline script in index.html reads this too, to apply a saved theme before first paint.
const STORAGE_KEY = 'theme'
// The browser UI color (<meta name="theme-color">), matching each palette's --background.
const THEME_COLORS: Record<Theme, string> = { dark: '#0d0d0d', light: '#f7f4ee' }

const listeners = new Set<() => void>()

/** The theme is the `dark` class on <html>; index.html starts without it, so light is default. */
function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Switches the whole site's theme and remembers the choice for the next visit. */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked; the choice then lasts until the page is closed.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current theme, re-rendering whenever it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme)
}

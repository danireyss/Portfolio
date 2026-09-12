import { useSyncExternalStore } from 'react'

// Remembered in this browser only. It just decides whether to show the admin UI; the admin API
// decides who may edit (anyone else gets 404s, and admin mode turns itself off).
const STORAGE_KEY = 'admin-mode'
const listeners = new Set<() => void>()

function isOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function setAdminMode(on: boolean) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'on')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked; admin mode then lasts until the page is closed.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether this browser is in admin mode: edit buttons and the admin bar show. */
export function useAdminMode(): boolean {
  return useSyncExternalStore(subscribe, isOn, () => false)
}

/** Leaves the app for another page, e.g. Google's sign-in. On its own so tests can replace it. */
export function goTo(url: string) {
  window.location.assign(url)
}

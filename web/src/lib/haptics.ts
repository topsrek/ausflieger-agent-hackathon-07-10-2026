/** Tiny haptic feedback where supported (Android Chrome). No-op elsewhere or before the first user gesture. */
export function haptic(pattern: number | number[] = 8): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

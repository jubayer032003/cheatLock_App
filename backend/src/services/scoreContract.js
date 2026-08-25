export function authoritativeSuspicionScore(session) {
  const value = Number(session?.suspicionScore);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

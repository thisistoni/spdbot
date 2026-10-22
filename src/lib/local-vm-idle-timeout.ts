// Mirrors localVm.idleTimeoutMinutes in server/config.ts; the server is the authority.
export const MIN_LOCAL_VM_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_LOCAL_VM_IDLE_TIMEOUT_MINUTES = 1_440;
export const DEFAULT_LOCAL_VM_IDLE_TIMEOUT_MINUTES = 480;

export function parseLocalVmIdleTimeoutMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= MIN_LOCAL_VM_IDLE_TIMEOUT_MINUTES && minutes <= MAX_LOCAL_VM_IDLE_TIMEOUT_MINUTES ? minutes : null;
}

export const IDLE_SECONDS = 240;
export const WARNING_SECONDS = 30;

export function visitClock(lastActivity: number, now: number, playing: boolean) {
  const remaining = IDLE_SECONDS + WARNING_SECONDS - Math.floor(Math.max(0, now - lastActivity) / 1000);
  return { remaining: Math.max(0, remaining), warning: !playing && remaining <= WARNING_SECONDS && remaining > 0, expired: !playing && remaining <= 0 };
}

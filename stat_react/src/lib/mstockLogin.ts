const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export const MSTOCK_SHOW_LOGIN_EVENT = 'mstock-show-login';
export const MSTOCK_LOGOUT_EVENT = 'mstock-logout';

export function openMstockLogin() {
  window.dispatchEvent(new Event(MSTOCK_SHOW_LOGIN_EVENT));
}

export async function logoutMstock(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${apiBase}/api/mstock/logout`, { method: 'POST' });
    const j = (await res.json()) as { message?: string };
    if (!res.ok) {
      return { ok: false, message: j?.message || `Logout failed (HTTP ${res.status})` };
    }
    window.dispatchEvent(new Event(MSTOCK_LOGOUT_EVENT));
    return { ok: true, message: j?.message || 'Logged out' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Logout failed' };
  }
}

/** True when server/UI text is asking the user to complete mStock SMS OTP login. */
export function isMstockLoginPrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /sms\s*otp|mstock:token|app login screen|log in with mstock|mstock_jwt_token|enter sms otp|complete sms otp/i.test(
    t,
  );
}

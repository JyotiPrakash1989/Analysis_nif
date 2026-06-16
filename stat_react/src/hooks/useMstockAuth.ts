import { useCallback, useEffect, useState } from 'react';
import { readJson } from '../lib/apiJson';
import { logoutMstock, MSTOCK_LOGOUT_EVENT, openMstockLogin } from '../lib/mstockLogin';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type MstockAuthStatus = {
  hasApiKey: boolean;
  authenticated: boolean;
  needsOtp: boolean;
  apiKeySuffix?: string;
  ipBlocked?: boolean;
};

export function useMstockAuth() {
  const [status, setStatus] = useState<MstockAuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/mstock/auth-status`);
      const j = await readJson<MstockAuthStatus>(res);
      if (res.ok && j) setStatus(j);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('mstock-auth-ok', onChange);
    window.addEventListener(MSTOCK_LOGOUT_EVENT, onChange);
    return () => {
      window.removeEventListener('mstock-auth-ok', onChange);
      window.removeEventListener(MSTOCK_LOGOUT_EVENT, onChange);
    };
  }, [refresh]);

  const login = useCallback(() => {
    setMessage(null);
    openMstockLogin();
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await logoutMstock();
    setMessage({ text: result.message, ok: result.ok });
    await refresh();
    setBusy(false);
  }, [refresh]);

  return { status, busy, message, refresh, login, logout };
}

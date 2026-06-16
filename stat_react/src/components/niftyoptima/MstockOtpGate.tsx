import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { readJson } from '../../lib/apiJson';
import { MSTOCK_LOGOUT_EVENT, MSTOCK_SHOW_LOGIN_EVENT } from '../../lib/mstockLogin';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

type AuthStatus = {
  hasApiKey: boolean;
  authenticated: boolean;
  needsOtp: boolean;
  serverReachable?: boolean;
};

type SessionErr = { message?: string; hint?: string; code?: string };

function formatLoginError(j: SessionErr): string {
  if (j.code === 'OTP_EXPIRED') {
    return j.hint || 'OTP expired. Click Send OTP again and enter the new code quickly.';
  }
  if (j.code === 'OTP_INVALID') {
    return j.hint || j.message || 'Invalid OTP. Try again or request a new OTP.';
  }
  if (j.code === 'API_KEY_INVALID') {
    return j.hint || j.message || 'API key not valid on mStock. Generate a new key on trade.mstock.com.';
  }
  const msg = j.message || 'Login failed';
  return j.hint ? `${msg} ${j.hint}` : msg;
}

type LoginFormProps = {
  status: AuthStatus;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  busy: boolean;
  message: string;
  otpSent: boolean;
  fromEnv: boolean;
  onRequestOtp: () => void;
  onSubmitOtp: () => void;
  onClose?: () => void;
};

function MstockLoginForm({
  status,
  username,
  setUsername,
  password,
  setPassword,
  otp,
  setOtp,
  busy,
  message,
  otpSent,
  fromEnv,
  onRequestOtp,
  onSubmitOtp,
  onClose,
}: LoginFormProps) {
  const serverDown = status.serverReachable === false;

  return (
    <div className="w-full max-w-md rounded-xl border border-nox-line bg-nox-surface p-6 shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">mStock login</h1>
          <p className="text-sm text-nox-muted mt-1">
            Enter SMS OTP to connect live NIFTY (valid until midnight).
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-nox-line px-2.5 py-1 text-xs text-nox-muted hover:text-white hover:bg-nox-bg"
            aria-label="Close login"
          >
            Close
          </button>
        ) : null}
      </div>

      {serverDown ? (
        <p className="text-sm text-rose-300">
          API server not reachable. In <code className="text-rose-200">stat_react</code> run{' '}
          <code className="text-rose-200">npm run dev</code> (starts API + Vite). Do not use{' '}
          <code className="text-rose-200">npm run vite</code> alone.
        </p>
      ) : !status.hasApiKey ? (
        <p className="text-sm text-rose-300">
          Server has no <code className="text-rose-200">MSTOCK_API_KEY</code> — open the{' '}
          <strong>Settings</strong> tab and save your API key (or set it in Render Environment).
        </p>
      ) : null}

      <div className="space-y-3">
        <label className="block text-xs text-nox-muted">
          Client ID / username
          <input
            className="mt-1 w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-2 text-sm text-white"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={busy || serverDown}
          />
        </label>
        <label className="block text-xs text-nox-muted">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-2 text-sm text-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={busy || serverDown}
          />
        </label>
        {fromEnv ? (
          <p className="text-[11px] text-cyan-200/90">
            Client ID and password loaded from <code className="text-cyan-100">.env</code>
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRequestOtp}
          disabled={busy || serverDown || !username.trim() || !password}
          className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 py-2 text-sm font-medium"
        >
          {busy ? 'Sending…' : 'Send OTP to mobile'}
        </button>
      </div>

      <div className="border-t border-nox-line pt-4 space-y-3">
        <label className="block text-xs text-nox-muted">
          OTP {otpSent ? '(check SMS)' : '(after Send OTP)'}
          <input
            className="mt-1 w-full rounded-lg border border-nox-line bg-nox-bg px-3 py-2 text-sm text-white tracking-widest"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder="123456"
            disabled={busy || serverDown}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRequestOtp}
            disabled={busy || serverDown || !username.trim() || !password}
            className="flex-1 rounded-lg border border-nox-line bg-nox-bg hover:bg-nox-surface disabled:opacity-50 py-2.5 text-sm font-medium"
          >
            Resend OTP
          </button>
          <button
            type="button"
            onClick={onSubmitOtp}
            disabled={busy || serverDown || otp.length < 4}
            className="flex-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white"
          >
            Continue
          </button>
        </div>
      </div>

      {message ? <p className="text-xs text-amber-300">{message}</p> : null}
    </div>
  );
}

type Props = {
  children: ReactNode;
  onAuthenticated?: () => void;
};

export function MstockOtpGate({ children, onAuthenticated }: Props) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [fromEnv, setFromEnv] = useState(false);
  const [loginOverlay, setLoginOverlay] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const health = await fetch(`${apiBase}/api/health`);
      if (!health.ok) {
        setStatus({
          hasApiKey: false,
          authenticated: false,
          needsOtp: true,
          serverReachable: false,
        });
        return null;
      }
      const res = await fetch(`${apiBase}/api/mstock/auth-status`);
      const j = await readJson<AuthStatus>(res);
      if (!res.ok || !j) {
        setStatus({
          hasApiKey: false,
          authenticated: false,
          needsOtp: true,
          serverReachable: true,
        });
        return null;
      }
      const next = { ...j, serverReachable: true };
      setStatus(next);
      if (next.authenticated) setLoginOverlay(false);
      return next;
    } catch {
      setStatus({
        hasApiKey: false,
        authenticated: false,
        needsOtp: true,
        serverReachable: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const open = () => setLoginOverlay(true);
    window.addEventListener(MSTOCK_SHOW_LOGIN_EVENT, open);
    return () => window.removeEventListener(MSTOCK_SHOW_LOGIN_EVENT, open);
  }, []);

  useEffect(() => {
    const onAuthChange = () => void loadStatus();
    window.addEventListener('mstock-auth-ok', onAuthChange);
    window.addEventListener(MSTOCK_LOGOUT_EVENT, onAuthChange);
    return () => {
      window.removeEventListener('mstock-auth-ok', onAuthChange);
      window.removeEventListener(MSTOCK_LOGOUT_EVENT, onAuthChange);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!apiBase) return;
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/mstock/login-hints`);
        const j = await readJson<{ username?: string; password?: string }>(res);
        if (!res.ok || !j) return;
        const u = String(j.username || '').trim();
        const p = String(j.password || '').trim();
        if (u && p) {
          setUsername(u);
          setPassword(p);
          setFromEnv(true);
        }
      } catch {
        /* optional pre-fill */
      }
    })();
  }, []);

  const requestOtp = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/api/mstock/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const j = await readJson<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message || `Could not send OTP (HTTP ${res.status})`);
      if (!j) throw new Error('Empty response from server — run npm run dev (API + Vite together)');
      setOtpSent(true);
      setMessage('OTP sent to your registered mobile. Enter it below.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Request OTP failed');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!otp.trim()) {
      setMessage('Enter the OTP from SMS');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/api/mstock/session-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestToken: otp.trim(), checksum: 'L' }),
      });
      const j = await readJson<SessionErr & { status?: boolean }>(res);
      if (!j) {
        throw new Error(
          res.ok
            ? 'Empty response from server'
            : `Server error (HTTP ${res.status}) — is the API running? Use npm run dev`,
        );
      }
      if (!res.ok) {
        throw new Error(formatLoginError(j));
      }
      setMessage('Connected. Loading live NIFTY & option chain…');
      try {
        const sync = await fetch(`${apiBase}/api/mstock/sync-session`, { method: 'POST' });
        const syncJson = await readJson<{
          barsLoaded?: number;
          optionChainLive?: boolean;
          message?: string;
        }>(sync);
        if (sync.ok && syncJson?.optionChainLive) {
          setMessage('Connected — live option chain and chart data loaded.');
        } else if (sync.ok) {
          setMessage('Connected — chart loaded; option chain may use modelled values until mStock responds.');
        }
      } catch {
        setMessage('Connected. Refreshing dashboard…');
      }
      const next = await loadStatus();
      if (next?.authenticated) {
        setLoginOverlay(false);
        onAuthenticated?.();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-nox-bg flex items-center justify-center text-nox-muted text-sm">
        Checking mStock session…
      </div>
    );
  }

  const gateActive = status.needsOtp;
  const overlayActive = loginOverlay && !gateActive;

  if (!gateActive && !overlayActive) {
    return <>{children}</>;
  }

  const formProps: LoginFormProps = {
    status,
    username,
    setUsername,
    password,
    setPassword,
    otp,
    setOtp,
    busy,
    message,
    otpSent,
    fromEnv,
    onRequestOtp: () => void requestOtp(),
    onSubmitOtp: () => void submitOtp(),
    onClose: overlayActive ? () => setLoginOverlay(false) : undefined,
  };

  if (gateActive) {
    return (
      <div className="min-h-screen bg-nox-bg text-slate-100 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <MstockLoginForm {...formProps} />
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <MstockLoginForm {...formProps} />
      </div>
    </>
  );
}

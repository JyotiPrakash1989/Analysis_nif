import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useEnvSettings, type EnvField } from '../hooks/useEnvSettings';
import { useMstockAuth } from '../hooks/useMstockAuth';

const CREDENTIAL_KEYS = new Set([
  'MSTOCK_API_KEY',
  'MSTOCK_APP_NAME',
  'MSTOCK_TOTP_SECRET',
  'MSTOCK_USERNAME',
  'MSTOCK_PASSWORD',
]);

function EnvFieldInput({
  field,
  draft,
  cleared,
  onChange,
  onClear,
}: {
  field: EnvField;
  draft: Record<string, string>;
  cleared: boolean;
  onChange: (key: string, value: string) => void;
  onClear: (key: string) => void;
}) {
  const showMasked = field.secret && field.isSet && !cleared && !draft[field.key];
  return (
    <label className="block space-y-1">
      <span className="text-xs text-nox-muted">
        {field.label}{' '}
        <code className="text-[10px] text-cyan-300/70">{field.key}</code>
      </span>
      <div className="flex gap-2">
        <input
          type={field.secret ? 'password' : 'text'}
          className="flex-1 rounded-lg bg-nox-bg border border-nox-line px-3 py-2 text-sm text-white"
          placeholder={showMasked ? `${field.masked} (leave blank to keep)` : field.secret ? 'Enter value' : ''}
          value={draft[field.key] ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          autoComplete={field.secret ? 'off' : 'on'}
        />
        {field.secret && field.isSet && (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-nox-line px-3 py-2 text-xs text-nox-muted hover:text-white"
            onClick={() => onClear(field.key)}
          >
            Clear
          </button>
        )}
      </div>
      <span className="text-[10px] text-nox-muted">
        {cleared
          ? 'Will be removed on save'
          : field.source === 'settings'
            ? 'Stored in settings file'
            : field.source === 'env'
              ? 'From server .env (save to persist on Render)'
              : 'Not set'}
      </span>
    </label>
  );
}

export function SettingsPage() {
  const { data, loading, saving, error, saveOk, refresh, save, importFromEnv } = useEnvSettings();
  const { status: auth, busy: authBusy, message: authMessage, login, logout } = useMstockAuth();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [clearKeys, setClearKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const f of data.fields) {
      if (!f.secret) next[f.key] = f.value;
    }
    setDraft(next);
    setClearKeys(new Set());
  }, [data]);

  const credentialFields = useMemo(() => {
    if (!data) return [];
    const order = data.credentialKeys?.length ? data.credentialKeys : [...CREDENTIAL_KEYS];
    const byKey = new Map(data.fields.map((f) => [f.key, f]));
    return order.map((key) => byKey.get(key)).filter((f): f is EnvField => Boolean(f));
  }, [data]);

  const otherGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, typeof data.fields>();
    for (const f of data.fields) {
      if (CREDENTIAL_KEYS.has(f.key)) continue;
      const list = map.get(f.group) || [];
      list.push(f);
      map.set(f.group, list);
    }
    return [...map.entries()];
  }, [data]);

  function onChange(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setClearKeys((s) => {
      const n = new Set(s);
      n.delete(key);
      return n;
    });
  }

  function onClear(key: string) {
    setClearKeys((s) => new Set(s).add(key));
    setDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const patch: Record<string, string> = { ...draft };
    for (const f of data?.fields || []) {
      if (f.secret) {
        const v = draft[f.key];
        if (v != null && v.trim() !== '') patch[f.key] = v.trim();
      }
    }
    await save(patch, [...clearKeys]);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Environment settings</h1>
        <p className="text-sm text-nox-muted mt-1">
          Store your mStock credentials here (same as repo <code className="text-cyan-300">.env</code> lines 2–6).
          Local <code className="text-cyan-300">.env</code> is not deployed to Render — save on this page instead.
        </p>
      </div>

      {loading && <p className="text-nox-muted text-sm">Loading…</p>}
      {error && <p className="text-rose-400 text-sm">{error}</p>}
      {saveOk && <p className="text-emerald-400 text-sm">{saveOk}</p>}

      <section className="rounded-xl border border-nox-line bg-nox-surface/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide">mStock session</h2>
        <p className="text-sm text-nox-muted">
          {auth == null
            ? 'Checking login status…'
            : auth.authenticated
              ? 'Connected — live NIFTY, option chain, and orders use your mStock session (valid until midnight).'
              : auth.hasApiKey
                ? 'Not logged in — use SMS OTP to connect live broker data.'
                : 'Save your mStock API key below, then log in with SMS OTP.'}
        </p>
        {auth?.apiKeySuffix ? (
          <p className="text-[11px] text-nox-muted">API key on server: ••••{auth.apiKeySuffix}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={login}
            disabled={authBusy}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            Log in with SMS OTP
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={authBusy || !auth?.authenticated}
            className="rounded-lg border border-nox-line bg-nox-bg hover:bg-nox-surface disabled:opacity-40 px-4 py-2 text-sm text-nox-muted hover:text-white disabled:hover:text-nox-muted"
          >
            {authBusy ? 'Working…' : 'Log out'}
          </button>
        </div>
        {authMessage ? (
          <p className={`text-xs ${authMessage.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {authMessage.text}
          </p>
        ) : null}
      </section>

      {!loading && data && (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
          <section className="rounded-xl border border-cyan-900/50 bg-nox-surface/80 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide">
                  mStock credentials (.env)
                </h2>
                <p className="text-xs text-nox-muted mt-1">
                  MSTOCK_API_KEY, MSTOCK_APP_NAME, MSTOCK_TOTP_SECRET, MSTOCK_USERNAME, MSTOCK_PASSWORD
                </p>
              </div>
              {data.importableFromEnv ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void importFromEnv()}
                  className="shrink-0 rounded-lg border border-cyan-700/60 bg-cyan-950/40 hover:bg-cyan-900/40 disabled:opacity-50 px-3 py-2 text-xs font-medium text-cyan-200"
                >
                  Import from .env
                </button>
              ) : null}
            </div>
            {credentialFields.map((f) => (
              <EnvFieldInput
                key={f.key}
                field={f}
                draft={draft}
                cleared={clearKeys.has(f.key)}
                onChange={onChange}
                onClear={onClear}
              />
            ))}
          </section>

          {otherGroups.map(([group, fields]) => (
            <section key={group} className="rounded-xl border border-nox-line bg-nox-surface/60 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide">{group}</h2>
              {fields.map((f) => (
                <EnvFieldInput
                  key={f.key}
                  field={f}
                  draft={draft}
                  cleared={clearKeys.has(f.key)}
                  onChange={onChange}
                  onClear={onClear}
                />
              ))}
            </section>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
            >
              {saving ? 'Saving…' : 'Save & apply'}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-nox-line px-4 py-2 text-sm text-nox-muted hover:text-white"
            >
              Reload
            </button>
          </div>

          <p className="text-[11px] text-nox-muted">
            Stored in <code className="text-cyan-300/80">{data.settingsFile}</code>. On first local run,
            credentials are copied from <code className="text-cyan-300/80">Nif/.env</code> automatically.
            After save, whitelist your server IP on trade.mstock.com, then use{' '}
            <strong className="text-slate-300">Log in with SMS OTP</strong> above.
          </p>
        </form>
      )}
    </div>
  );
}

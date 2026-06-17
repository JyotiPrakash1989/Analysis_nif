import { useCallback, useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_NIFTYOPTIMA_API ?? '';

export type EnvField = {
  key: string;
  label: string;
  secret?: boolean;
  group: string;
  value: string;
  isSet: boolean;
  masked: string;
  source: 'settings' | 'env' | 'unset';
};

export type EnvSettingsResponse = {
  fields: EnvField[];
  updatedAt: number | null;
  settingsFile: string;
  importableFromEnv?: boolean;
  credentialKeys?: string[];
};

export function useEnvSettings() {
  const [data, setData] = useState<EnvSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/settings/env`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as EnvSettingsResponse;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch: Record<string, string>, clearKeys: string[] = []) => {
      setSaving(true);
      setError(null);
      setSaveOk(null);
      try {
        const res = await fetch(`${apiBase}/api/settings/env`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch, clearKeys }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
        setData(j as EnvSettingsResponse);
        setSaveOk('Saved — mStock credentials stored on server.');
        window.dispatchEvent(new Event('mstock-auth-ok'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const importFromEnv = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      const res = await fetch(`${apiBase}/api/settings/env/import-from-env`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setData(j as EnvSettingsResponse);
      if (j.changed) {
        setSaveOk('Imported from .env — mStock credentials stored on server.');
        window.dispatchEvent(new Event('mstock-auth-ok'));
      } else {
        setSaveOk('Nothing to import — enter values below or set them in .env / Render Environment.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }, []);

  return { data, loading, saving, error, saveOk, refresh, save, importFromEnv };
}

import { useEffect, useState, type FormEvent } from 'react';
import { getAdminSettings, updateAdminSettings } from '../lib/api';
import { Button, ErrorBanner, Input, PageCard, SuccessBanner } from '../components/Ui';

export function SettingsPage() {
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const settings = await getAdminSettings();
      setEmail(settings.email);
      setLocation(settings.location ?? '');
      setRole(settings.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const updated = await updateAdminSettings({
        email,
        location,
        ...(password ? { password } : {}),
      });
      setEmail(updated.email);
      setLocation(updated.location ?? '');
      setPassword('');
      setToast('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="muted">Update your admin username, password, and location.</p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {toast ? <SuccessBanner message={toast} /> : null}

      <PageCard title="Account" subtitle={role ? `Role: ${role}` : undefined}>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Username (email)
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              New password
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" autoComplete="new-password" />
            </label>
            <label>
              Location
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Phoenix, AZ" />
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        )}
      </PageCard>
    </div>
  );
}

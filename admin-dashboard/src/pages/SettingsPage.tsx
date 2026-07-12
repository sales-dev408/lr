import { useEffect, useState, type FormEvent } from 'react';
import { getAdminMe, updateAdminMe } from '../lib/api';
import { Button, ErrorBanner, Input, PageCard, SuccessBanner } from '../components/Ui';

export function SettingsPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getAdminMe()
      .then((admin) => {
        setEmail(admin.email ?? '');
        setFullName(admin.fullName ?? '');
        setLocation(admin.location ?? '');
      })
      .catch(() => setError('Unable to load settings'));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const body: { email?: string; fullName?: string; location?: string; password?: string } = {};
      if (email) body.email = email;
      if (fullName) body.fullName = fullName;
      if (location) body.location = location;
      if (password) body.password = password;
      await updateAdminMe(body);
      setSuccess('Settings saved.');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="muted">Update your account information and password.</p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <PageCard title="Admin settings">
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Full name
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            Location
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label>
            New password (min 8 characters)
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save settings'}
          </Button>
        </form>
      </PageCard>
    </div>
  );
}

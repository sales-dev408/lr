import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, ErrorBanner, Input, PageCard } from '../components/Ui';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const auth = await loginAdmin({ email, password, ...(captchaToken ? { captchaToken } : {}) });
      login(auth);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-page">
      <PageCard title="Admin login" subtitle="Sign in to manage cards, vendors, and analytics.">
        {error ? <ErrorBanner message={error} /> : null}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email
            <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </label>
          <label>
            CAPTCHA token
            <Input value={captchaToken} onChange={(event) => setCaptchaToken(event.target.value)} placeholder="Optional in dev" />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </PageCard>
    </div>
  );
}

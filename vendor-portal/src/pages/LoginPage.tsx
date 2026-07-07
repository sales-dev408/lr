import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, loginVendor } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, ErrorBanner, Input, PageCard } from '../components/Ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const auth = await loginVendor({ email, password, ...(captchaToken ? { captchaToken } : {}) });
      login(auth);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    }
  }

  return (
    <div className="centered-page vendor-center">
      <PageCard title="Vendor login" subtitle="Sign in to redeem discounts and review analytics.">
        {error ? <ErrorBanner message={error} /> : null}
        <form className="form" onSubmit={submit}>
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input placeholder="CAPTCHA token" value={captchaToken} onChange={(e) => setCaptchaToken(e.target.value)} />
          <Button type="submit">Sign in</Button>
        </form>
        <p className="muted">
          New vendor? <Link to="/register">Create a pending registration</Link>.
        </p>
      </PageCard>
    </div>
  );
}

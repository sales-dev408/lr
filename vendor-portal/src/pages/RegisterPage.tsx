import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { registerVendor } from '../lib/api';
import { Button, ErrorBanner, Input, PageCard, Select } from '../components/Ui';

export function RegisterPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    location: '',
    city: '',
    category: '',
    posType: 'square',
    email: '',
    password: '',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const result = await registerVendor({
        ...form,
        location: form.location || undefined,
        city: form.city || undefined,
        category: form.category || undefined,
      });
      setMessage(`Registration submitted. Status: ${result.status}.`);
      setForm({ name: '', location: '', city: '', category: '', posType: 'square', email: '', password: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <div className="centered-page vendor-center">
      <PageCard title="Vendor registration" subtitle="New vendors are created as pending by default.">
        {error ? <ErrorBanner message={error} /> : null}
        {message ? <div className="banner banner-success">{message}</div> : null}
        <form className="form" onSubmit={submit}>
          <Input placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select value={form.posType} onChange={(e) => setForm({ ...form, posType: e.target.value })}>
            <option value="square">Square</option>
            <option value="stripe">Stripe</option>
            <option value="clover">Clover</option>
            <option value="toast">Toast</option>
            <option value="other">Other</option>
          </Select>
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Button type="submit">Submit registration</Button>
        </form>
        <p className="muted">
          Already have access? <Link to="/login">Back to login</Link>.
        </p>
      </PageCard>
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  approveVendor,
  createAdminVendor,
  getVendorActivity,
  listAdminVendors,
  rejectVendor,
  resetVendorPassword,
  updateAdminVendor,
} from '../lib/api';
import type { VendorActivityRecord, VendorRecord } from '../lib/types';
import { Button, EmptyState, ErrorBanner, Modal, PageCard, Select, Input, Badge } from '../components/Ui';
import { useAuth } from '../lib/auth';

const blankVendor = {
  name: '',
  location: '',
  city: '',
  category: '',
  posType: 'square',
  email: '',
  password: '',
  status: 'pending',
};

export function VendorsPage() {
  const { profile } = useAuth();
  const readOnly = profile?.role === 'analyst';
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [filters, setFilters] = useState({ status: '', city: '', category: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<VendorActivityRecord[]>([]);
  const [activityVendor, setActivityVendor] = useState<VendorRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<VendorRecord | null>(null);
  const [form, setForm] = useState(blankVendor);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminVendors({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.category ? { category: filters.category } : {}),
      });
      setVendors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load vendors');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filters.status, filters.city, filters.category]);

  const sorted = useMemo(() => vendors.slice().sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    try {
      const result = await createAdminVendor({
        ...form,
        password: form.password || undefined,
      });
      setToast(`Vendor created. Temp password: ${result.tempPassword}`);
      setForm(blankVendor);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !editing) return;
    try {
      await updateAdminVendor(editing.id, {
        name: editing.name,
        location: editing.location ?? null,
        city: editing.city ?? null,
        category: editing.category ?? null,
        posType: editing.pos_type,
        email: editing.email,
        status: editing.status,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleActivity(vendor: VendorRecord) {
    try {
      const rows = await getVendorActivity(vendor.id);
      setActivity(rows);
      setActivityVendor(vendor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity');
    }
  }

  async function handleStatusAction(action: 'approve' | 'reject', vendorId: string) {
    if (readOnly) return;
    try {
      if (action === 'approve') {
        await approveVendor(vendorId);
      } else {
        await rejectVendor(vendorId);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  async function handleResetPassword(vendorId: string) {
    if (readOnly) return;
    try {
      const result = await resetVendorPassword(vendorId);
      setToast(`Temporary password: ${result.tempPassword}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Vendors</h1>
          <p className="muted">Approve vendors, reset credentials, and review activity.</p>
        </div>
        <div className="filters">
          <Input placeholder="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} />
          <Input placeholder="City" value={filters.city} onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))} />
          <Input placeholder="Category" value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))} />
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {toast ? <div className="banner banner-success">{toast}</div> : null}

      <div className="grid-2">
        <PageCard title="Create vendor" subtitle={readOnly ? 'Read-only analyst mode' : 'Add a new participating business.'}>
          <form className="form" onSubmit={submitCreate}>
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <Input placeholder="Location" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
            <Input placeholder="City" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
            <Input placeholder="Category" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} />
            <Select value={form.posType} onChange={(e) => setForm((prev) => ({ ...prev, posType: e.target.value }))}>
              <option value="square">Square</option>
              <option value="stripe">Stripe</option>
              <option value="clover">Clover</option>
              <option value="toast">Toast</option>
              <option value="other">Other</option>
            </Select>
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <Input placeholder="Temp password (optional)" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
            <Select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Button type="submit" disabled={readOnly}>Create vendor</Button>
          </form>
        </PageCard>

        <PageCard title="Vendors list">
          {loading ? <div className="muted">Loading…</div> : null}
          {sorted.length === 0 ? <EmptyState title="No vendors" description="Use the create form to add vendors." /> : null}
          <div className="vendor-list">
            {sorted.map((vendor) => (
              <article key={vendor.id} className="list-row">
                <div>
                  <strong>{vendor.name}</strong>
                  <p className="muted">
                    {vendor.city ?? '—'} · {vendor.category ?? '—'} · {vendor.pos_type}
                  </p>
                  <Badge tone={vendor.status === 'approved' ? 'success' : vendor.status === 'rejected' ? 'danger' : 'warning'}>{vendor.status}</Badge>
                </div>
                <div className="row-actions">
                  <Button variant="secondary" disabled={readOnly} onClick={() => setEditing(vendor)}>
                    Edit
                  </Button>
                  <Button variant="secondary" disabled={readOnly} onClick={() => handleActivity(vendor)}>
                    Activity
                  </Button>
                  <Button variant="secondary" disabled={readOnly} onClick={() => handleStatusAction('approve', vendor.id)}>
                    Approve
                  </Button>
                  <Button variant="secondary" disabled={readOnly} onClick={() => handleStatusAction('reject', vendor.id)}>
                    Reject
                  </Button>
                  <Button variant="secondary" disabled={readOnly} onClick={() => handleResetPassword(vendor.id)}>
                    Reset password
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PageCard>
      </div>

      <Modal open={Boolean(editing)} title="Edit vendor" onClose={() => setEditing(null)}>
        {editing ? (
          <form className="form" onSubmit={submitUpdate}>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            <Input value={editing.city ?? ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            <Input value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            <Select value={editing.pos_type} onChange={(e) => setEditing({ ...editing, pos_type: e.target.value as VendorRecord['pos_type'] })}>
              <option value="square">Square</option>
              <option value="stripe">Stripe</option>
              <option value="clover">Clover</option>
              <option value="toast">Toast</option>
              <option value="other">Other</option>
            </Select>
            <Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as VendorRecord['status'] })}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Button type="submit" disabled={readOnly}>Save</Button>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(activityVendor)} title={`Activity: ${activityVendor?.name ?? ''}`} onClose={() => setActivityVendor(null)}>
        {activity.length === 0 ? <EmptyState title="No activity" description="Vendor activity will appear here after actions are taken." /> : null}
        {activity.length > 0 ? (
          <div className="activity-list">
            {activity.map((item) => (
              <div key={item.id} className="activity-row">
                <strong>{item.action}</strong>
                <p className="muted">{item.created_at}</p>
                <pre>{JSON.stringify(item.metadata, null, 2)}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

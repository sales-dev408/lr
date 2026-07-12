import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from 'react';
import { approveVendor, createAdminVendor, getBaseUrl, getVendorActivity, listAdminVendors, normalizePath, rejectVendor, updateAdminVendor } from '../lib/api';
import type { VendorActivityRecord, VendorPassResult, VendorRecord } from '../lib/types';
import { Button, EmptyState, ErrorBanner, Modal, PageCard, Select, Input, Badge } from '../components/Ui';
import { useAuth } from '../lib/auth';

const blankVendor = {
  name: '',
  location: '',
  category: 'Sports' as 'Sports' | 'Dining' | 'Entertainment',
  posType: '',
  discountType: 'percent' as 'fixed' | 'percent',
  discountAmount: '15',
  iconPng: '',
  logoPng: '',
  status: 'approved',
};

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function passUrl(passId: string): string {
  return `${getBaseUrl()}${normalizePath(`/vendor-passes/${passId}.pkpass`)}`;
}

export function VendorsPage() {
  const { profile } = useAuth();
  const readOnly = profile?.role === 'analyst';
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [filters, setFilters] = useState({ status: '', category: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<VendorActivityRecord[]>([]);
  const [activityVendor, setActivityVendor] = useState<VendorRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<VendorRecord | null>(null);
  const [form, setForm] = useState(blankVendor);
  const [created, setCreated] = useState<VendorPassResult | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminVendors({
        ...(filters.status ? { status: filters.status } : {}),
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
  }, [filters.status, filters.category]);

  const sorted = useMemo(() => vendors.slice().sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  async function handleFileChange(field: 'iconPng' | 'logoPng', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await readFileBase64(file);
      setForm((prev) => ({ ...prev, [field]: base64 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read image');
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    try {
      const result = await createAdminVendor({
        name: form.name,
        location: form.location,
        category: form.category,
        posType: form.posType,
        discountType: form.discountType,
        discountAmount: Number(form.discountAmount),
        iconPng: form.iconPng || undefined,
        logoPng: form.logoPng || undefined,
        status: form.status,
      });
      setCreated(result);
      setToast('Vendor created. Discount code and pass are ready below.');
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
        category: editing.category ?? null,
        posType: editing.pos_type,
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

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Vendors</h1>
          <p className="muted">Create vendors, generate discount codes, and download Apple Wallet passes.</p>
        </div>
        <div className="filters">
          <Input placeholder="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} />
          <Input placeholder="Category" value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))} />
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {toast ? <div className="banner banner-success">{toast}</div> : null}

      <div className="grid-2">
        <PageCard title="Create vendor" subtitle={readOnly ? 'Read-only analyst mode' : 'Add a new participating business and generate a pass.'}>
          <form className="form" onSubmit={submitCreate}>
            <Input placeholder="Vendor name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <Input placeholder="Address" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} required />
            <Select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as typeof prev.category }))}>
              <option value="Sports">Sports</option>
              <option value="Dining">Dining</option>
              <option value="Entertainment">Entertainment</option>
            </Select>
            <Input placeholder="POS system name" value={form.posType} onChange={(e) => setForm((prev) => ({ ...prev, posType: e.target.value }))} required />
            <Select value={form.discountType} onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as 'fixed' | 'percent' }))}>
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed amount ($)</option>
            </Select>
            <Input type="number" step="0.01" placeholder="Discount amount" value={form.discountAmount} onChange={(e) => setForm((prev) => ({ ...prev, discountAmount: e.target.value }))} required />
            <label>
              Icon PNG (optional)
              <input type="file" accept="image/png" onChange={(e) => void handleFileChange('iconPng', e)} />
            </label>
            <label>
              Logo PNG (optional)
              <input type="file" accept="image/png" onChange={(e) => void handleFileChange('logoPng', e)} />
            </label>
            <Select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
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
                    {vendor.location ?? '—'} · {vendor.category ?? '—'} · {vendor.pos_type}
                  </p>
                  <Badge tone={vendor.status === 'approved' ? 'success' : vendor.status === 'rejected' ? 'danger' : 'warning'}>{vendor.status}</Badge>
                  {vendor.discount_code ? <p className="muted">Code: {vendor.discount_code}</p> : null}
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
                  {vendor.vendor_pass_id ? (
                    <a className="btn btn-secondary" href={passUrl(vendor.vendor_pass_id)} download target="_blank" rel="noreferrer">
                      Download pass
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </PageCard>
      </div>

      {created ? (
        <PageCard title="Generated pass" subtitle="Share the discount code, embed code, and pass with the merchant.">
          <div className="form">
            <Input readOnly value={created.discountCode} onClick={(e) => e.currentTarget.select()} />
            <Input readOnly value={created.pkpassUrl} onClick={(e) => e.currentTarget.select()} />
            <label>
              Apple Wallet embed code
              <textarea className="textarea" readOnly rows={3} value={created.embedCode} onClick={(e) => e.currentTarget.select()} />
            </label>
            <p className="muted">{created.instructions}</p>
            <a className="btn btn-primary" href={created.pkpassUrl} download>
              Download .pkpass
            </a>
            <Button variant="secondary" onClick={() => setCreated(null)}>Dismiss</Button>
          </div>
        </PageCard>
      ) : null}

      <Modal open={Boolean(editing)} title="Edit vendor" onClose={() => setEditing(null)}>
        {editing ? (
          <form className="form" onSubmit={submitUpdate}>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            <Select value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              <option value="">—</option>
              <option value="Sports">Sports</option>
              <option value="Dining">Dining</option>
              <option value="Entertainment">Entertainment</option>
            </Select>
            <Input value={editing.pos_type} onChange={(e) => setEditing({ ...editing, pos_type: e.target.value })} />
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

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createAdminVendor, getVendorPass, listAdminVendors, updateAdminVendor } from '../lib/api';
import type { CreateVendorResult, VendorCategory, VendorPassResult, VendorRecord } from '../lib/types';
import { Button, EmptyState, ErrorBanner, Modal, PageCard, Select, Input, Badge, SuccessBanner } from '../components/Ui';
import { useAuth } from '../lib/auth';

const CATEGORIES: VendorCategory[] = ['Sports', 'Dining', 'Entertainment'];

const blankVendor = {
  name: '',
  address: '',
  category: 'Dining' as VendorCategory,
  posSystem: '',
  discountKind: 'percent' as 'percent' | 'fixed',
  discountValue: '',
  iconDataUrl: '',
  logoDataUrl: '',
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function VendorsPage() {
  const { profile } = useAuth();
  const readOnly = profile?.role === 'analyst';
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [filters, setFilters] = useState({ status: '', category: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VendorRecord | null>(null);
  const [form, setForm] = useState(blankVendor);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateVendorResult | null>(null);
  const [passView, setPassView] = useState<{ vendor: VendorRecord; pass: VendorPassResult } | null>(null);

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

  async function handleFile(event: ChangeEvent<HTMLInputElement>, key: 'iconDataUrl' | 'logoDataUrl') {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, [key]: dataUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read image');
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid discount amount.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createAdminVendor({
        name: form.name,
        address: form.address || undefined,
        category: form.category,
        posSystem: form.posSystem || undefined,
        discountType: form.discountKind,
        discountValue: value,
        ...(form.iconDataUrl ? { iconDataUrl: form.iconDataUrl } : {}),
        ...(form.logoDataUrl ? { logoDataUrl: form.logoDataUrl } : {}),
      });
      setResult(created);
      setForm(blankVendor);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !editing) return;
    try {
      await updateAdminVendor(editing.id, {
        name: editing.name,
        address: editing.address ?? undefined,
        category: (editing.category as VendorCategory | null) ?? undefined,
        posSystem: editing.pos_system ?? undefined,
        status: editing.status,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleViewPass(vendor: VendorRecord) {
    try {
      const pass = await getVendorPass(vendor.id);
      setPassView({ vendor, pass });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load pass');
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Vendors</h1>
          <p className="muted">Create vendors and issue their Apple Wallet discount passes.</p>
        </div>
        <div className="filters">
          <Select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Select value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid-2">
        <PageCard title="Create vendor" subtitle={readOnly ? 'Read-only analyst mode' : 'Add a business and generate its discount pass.'}>
          <form className="form" onSubmit={submitCreate}>
            <label>
              Vendor name
              <Input placeholder="Vendor name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </label>
            <label>
              Address
              <Input placeholder="Address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
            </label>
            <label>
              Category
              <Select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as VendorCategory }))}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              POS system name
              <Input placeholder="e.g. Square, Toast" value={form.posSystem} onChange={(e) => setForm((prev) => ({ ...prev, posSystem: e.target.value }))} />
            </label>
            <label>
              Discount amount
              <div className="inline-row">
                <Select value={form.discountKind} onChange={(e) => setForm((prev) => ({ ...prev, discountKind: e.target.value as 'percent' | 'fixed' }))}>
                  <option value="percent">%</option>
                  <option value="fixed">$</option>
                </Select>
                <Input type="number" min="0" step="0.01" placeholder="15" value={form.discountValue} onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))} required />
              </div>
            </label>
            <label>
              Icon PNG
              <Input type="file" accept="image/png" onChange={(e) => handleFile(e, 'iconDataUrl')} />
            </label>
            <label>
              Logo PNG
              <Input type="file" accept="image/png" onChange={(e) => handleFile(e, 'logoDataUrl')} />
            </label>
            <Button type="submit" disabled={readOnly || creating}>
              {creating ? 'Creating…' : 'Create vendor'}
            </Button>
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
                    {(vendor.address ?? vendor.location) ?? '—'} · {vendor.category ?? '—'}
                    {vendor.pos_system ? ` · ${vendor.pos_system}` : ''}
                  </p>
                  <Badge tone={vendor.status === 'approved' ? 'success' : vendor.status === 'rejected' ? 'danger' : 'warning'}>{vendor.status}</Badge>
                </div>
                <div className="row-actions">
                  <Button variant="secondary" disabled={readOnly} onClick={() => setEditing(vendor)}>
                    Edit
                  </Button>
                  <Button variant="secondary" onClick={() => handleViewPass(vendor)}>
                    View pass
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PageCard>
      </div>

      <Modal open={Boolean(result)} title="Vendor created" onClose={() => setResult(null)}>
        {result ? (
          <div className="stack">
            {result.card.reused ? (
              <SuccessBanner message={`Reused the existing "${result.card.name}" pass for this discount tier.`} />
            ) : (
              <SuccessBanner message={`New "${result.card.name}" discount pass generated.`} />
            )}
            <div>
              <p className="muted">Discount code (barcode + visible on pass)</p>
              <pre className="code-block">{result.discountCode}</pre>
            </div>
            <div>
              <p className="muted">Add to Apple Wallet</p>
              <a className="btn btn-primary" href={result.wallet.downloadUrl} target="_blank" rel="noreferrer">
                 Add to Apple Wallet
              </a>
            </div>
            <div>
              <p className="muted">Website embed code</p>
              <pre className="code-block">{result.wallet.embedHtml}</pre>
            </div>
            <div>
              <p className="muted">Merchant POS activation instructions</p>
              <pre className="code-block">{result.posInstructions}</pre>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(passView)} title={`Pass: ${passView?.vendor.name ?? ''}`} onClose={() => setPassView(null)}>
        {passView ? (
          <div className="stack">
            <div>
              <p className="muted">Discount code</p>
              <pre className="code-block">{passView.pass.discountCode}</pre>
            </div>
            <a className="btn btn-primary" href={passView.pass.wallet.downloadUrl} target="_blank" rel="noreferrer">
               Add to Apple Wallet
            </a>
            <div>
              <p className="muted">Website embed code</p>
              <pre className="code-block">{passView.pass.wallet.embedHtml}</pre>
            </div>
            <div>
              <p className="muted">POS instructions</p>
              <pre className="code-block">{passView.pass.posInstructions}</pre>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(editing)} title="Edit vendor" onClose={() => setEditing(null)}>
        {editing ? (
          <form className="form" onSubmit={submitUpdate}>
            <label>
              Name
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              Address
              <Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </label>
            <label>
              Category
              <Select value={editing.category ?? 'Dining'} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              POS system name
              <Input value={editing.pos_system ?? ''} onChange={(e) => setEditing({ ...editing, pos_system: e.target.value })} />
            </label>
            <label>
              Status
              <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as VendorRecord['status'] })}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </Select>
            </label>
            <Button type="submit" disabled={readOnly}>
              Save
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

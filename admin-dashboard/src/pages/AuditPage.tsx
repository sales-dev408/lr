import { PageCard } from '../components/Ui';

export function AuditPage() {
  return (
    <div className="stack">
      <PageCard title="Audit">
        <p className="muted">
          The current backend handoff exposes vendor activity logs, but not a dedicated audit endpoint yet.
          Use <code>/api/admin/vendors/:id/activity</code> for vendor-specific events.
        </p>
      </PageCard>
    </div>
  );
}

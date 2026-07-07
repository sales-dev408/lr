import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function PageCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card">
      {(title || subtitle) && (
        <header className="card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled,
  onClick,
  title,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button className={`btn btn-${variant}`} type={type} disabled={disabled} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="banner banner-error">{message}</div>;
}

export function SuccessBanner({ message }: { message: string }) {
  return <div className="banner banner-success">{message}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <Button variant="ghost" onClick={onClose}>
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ToastArea({ children }: { children: ReactNode }) {
  return <div className="toast-area">{children}</div>;
}

export function InfoCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className={`stat-value stat-${tone}`}>{value}</strong>
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}

export function TextCode({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <code style={style}>{children}</code>;
}

export function RangeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" className="range" {...props} />;
}

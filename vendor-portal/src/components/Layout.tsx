import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './Ui';

export function AppLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar vendor-sidebar">
        <div>
          <div className="brand">
            <span className="brand-mark vendor-mark">V</span>
            <div>
              <strong>Vendor Portal</strong>
              <p className="muted">Redeem and analytics console</p>
            </div>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              My cards
            </NavLink>
            <NavLink to="/analytics">Analytics</NavLink>
            <NavLink to="/pos-integration">POS integration</NavLink>
            <NavLink to="/redeem">Redeem</NavLink>
            <NavLink to="/pos-instructions">POS instructions</NavLink>
          </nav>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            <strong>{profile?.name}</strong>
            <p className="muted">{profile?.email}</p>
          </div>
          <Button variant="secondary" onClick={logout}>Logout</Button>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

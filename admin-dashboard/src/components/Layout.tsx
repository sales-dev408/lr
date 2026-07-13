import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './Ui';

export function AppLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <img className="brand-logo" src="/logo.png" alt="Light Rail Deals" />
            <div>
              <strong>Light Rail Deals</strong>
              <p className="muted">Admin console</p>
            </div>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Overview
            </NavLink>
            <NavLink to="/vendors">Vendors</NavLink>
            <NavLink to="/cards">Cards</NavLink>
            <NavLink to="/audit">Audit</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            <strong>{profile?.email}</strong>
            <p className="muted">Role: {profile?.role}</p>
          </div>
          <Button variant="secondary" onClick={logout}>
            Logout
          </Button>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

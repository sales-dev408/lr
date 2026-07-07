import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { AuditPage } from './pages/AuditPage';
import { CardsPage } from './pages/CardsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { VendorsPage } from './pages/VendorsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<OverviewPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

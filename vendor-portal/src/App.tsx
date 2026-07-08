import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CardsPage } from './pages/CardsPage';
import { DiscountEditPage } from './pages/DiscountEditPage';
import { LoginPage } from './pages/LoginPage';
import { PosIntegrationPage } from './pages/PosIntegrationPage';
import { PosInstructionsPage } from './pages/PosInstructionsPage';
import { RedeemPage } from './pages/RedeemPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<CardsPage />} />
        <Route path="/pos-integration" element={<PosIntegrationPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/redeem" element={<RedeemPage />} />
        <Route path="/pos-instructions" element={<PosInstructionsPage />} />
        <Route path="/discounts/:id/edit" element={<DiscountEditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

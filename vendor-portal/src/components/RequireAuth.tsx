import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { ReactElement } from 'react';

export function RequireAuth({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

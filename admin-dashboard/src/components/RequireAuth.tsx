import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { ReactElement } from 'react';

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactElement;
  roles?: Array<'owner' | 'admin' | 'analyst'>;
}) {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

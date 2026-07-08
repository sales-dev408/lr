import type { JwtClaims, Role } from './types.ts';
import { verifyJwt } from './jwt.ts';

export function authenticate(request: Request): JwtClaims | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return null;
  }

  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
}

export function requireRole(request: Request, roles: Role[]): JwtClaims | Response {
  const claims = authenticate(request);
  if (!claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (!roles.includes(claims.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  return claims;
}

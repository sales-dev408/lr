import { randomBytes } from 'node:crypto';

export function generateOpaqueToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateTempPassword(): string {
  return randomBytes(9).toString('base64url');
}

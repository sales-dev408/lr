import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtClaims, Role } from '../types.js';
import type { Secret, SignOptions } from 'jsonwebtoken';

export function signJwt(payload: { sub: string; role: Role; email?: string | null }): string {
  const options = { expiresIn: config.jwtExpiresIn } as SignOptions;
  return jwt.sign({ ...payload, sub: payload.sub }, config.jwtSecret as Secret, options);
}

export function verifyJwt(token: string): JwtClaims {
  return jwt.verify(token, config.jwtSecret) as JwtClaims;
}

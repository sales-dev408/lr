import { describe, expect, it } from 'vitest';
import { decryptPosToken, encryptPosToken } from './pos.js';

describe('POS token encryption', () => {
  it('round-trips tokens without exposing plaintext', () => {
    const secret = 'simulated-pos-token-value';
    const encrypted = encryptPosToken(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptPosToken(encrypted)).toBe(secret);
  });
});

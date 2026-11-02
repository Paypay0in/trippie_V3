import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PassportProfile } from '../types';

/**
 * The expiry date never leaves the device.
 *
 * A passport number is obviously sensitive and nobody would send one. An
 * expiry date looks harmless on its own, which is exactly why this test
 * exists: date plus nationality is identity-grade, and the entry-rules lookup
 * already sends the nationality. The two must not meet in a request.
 *
 * Asserted against the source rather than a mock, because the failure mode is
 * somebody adding a field to the request body in six months — a test that
 * only checks today's mock would pass while the new field sailed out.
 */
describe('passport expiry stays on the device', () => {
  it('is never read off a request body by the server', () => {
    /*
      Not a blanket /expir/i ban on server.ts: the place caches legitimately
      hold `expiresAt` TTLs, and a test that fails on those would be deleted by
      the next person rather than respected. What must never appear is the
      server reading an expiry OFF A REQUEST, or naming one in a prompt.
    */
    const server = readFileSync('server.ts', 'utf8');
    expect(server).not.toMatch(/req\.body\??\.[A-Za-z?.]*expir/i);
    expect(server).not.toMatch(/passport[A-Za-z]*Expir/i);
    expect(server).not.toMatch(/護照.{0,6}效期|效期.{0,6}護照/);
  });

  it('is not sent in the travel-rules request body', () => {
    /*
      The request is assembled in the service that calls the endpoint. Any key
      matching /expir/i in that file would be the date travelling out.
    */
    const client = readFileSync('services/travelRulesService.ts', 'utf8');
    expect(client).not.toMatch(/expir/i);
  });

  it('is not a column on the Supabase profile', () => {
    const auth = readFileSync('services/authService.ts', 'utf8');
    expect(auth).not.toMatch(/expir/i);
  });

  it('is not carried by trip sync', () => {
    for (const file of ['services/tripSync.ts', 'services/tripSyncMapping.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/expir/i);
    }
  });

  it('rides inside the one localStorage key the profile already uses, so deleting the profile deletes it', () => {
    const app = readFileSync('App.tsx', 'utf8');
    /*
      No separate storage key of its own. If the date were persisted
      separately, clearing the profile would leave it behind on the device —
      a passport date surviving the account that owned it.
    */
    expect(app).not.toMatch(/localStorage\.(setItem|getItem)\(\s*["'][^"']*expir/i);
    expect(app).toMatch(/localStorage\.setItem\("trippie_profile"/);
  });

  it('is optional on the type, so absence is representable', () => {
    const passport: PassportProfile = { id: 'p1', country: '台灣', countryCode: 'TW' };
    expect(passport.expiresOn).toBeUndefined();
  });
});

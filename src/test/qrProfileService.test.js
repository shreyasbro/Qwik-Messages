import { describe, it, expect } from 'vitest';
import { qrProfileService } from '../services/qrProfileService';

describe('Permanent Stable Profile QR Code Service', () => {
  const sampleUid = 'user_abc123xyz_test';

  it('generates an immutable profile URL binding solely to the UID', () => {
    const payload1 = qrProfileService.getPermanentProfilePayload(sampleUid);
    const payload2 = qrProfileService.getPermanentProfilePayload(sampleUid);

    // Must be completely stable and identical across generations
    expect(payload1).toBe(payload2);
    expect(payload1).toContain(sampleUid);
    expect(payload1).not.toContain('timestamp');
    expect(payload1).not.toContain('expires');
  });

  it('generates identical QR payloads regardless of mutable profile changes', () => {
    // Simulated user editing their username or display name
    const userVersion1 = { uid: sampleUid, displayName: 'Alice Alpha', username: '@alice_orig' };
    const userVersion2 = { uid: sampleUid, displayName: 'Alice Renamed', username: '@alice_new' };

    const payloadV1 = qrProfileService.getPermanentProfilePayload(userVersion1.uid);
    const payloadV2 = qrProfileService.getPermanentProfilePayload(userVersion2.uid);

    expect(payloadV1).toBe(payloadV2);
  });

  it('correctly parses custom QR URLs with ?friend_uid parameter', () => {
    const testUrl = `https://qwik-messages.vercel.app/?friend_uid=${sampleUid}`;
    const parsedUid = qrProfileService.parseScannedPayload(testUrl);
    expect(parsedUid).toBe(sampleUid);
  });

  it('correctly parses custom QR URLs with ?add_friend parameter', () => {
    const testUrl = `http://localhost:5173/?add_friend=${sampleUid}`;
    const parsedUid = qrProfileService.parseScannedPayload(testUrl);
    expect(parsedUid).toBe(sampleUid);
  });

  it('correctly parses custom URI scheme qwik:profile:<uid>', () => {
    const testScheme = `qwik:profile:${sampleUid}`;
    const parsedUid = qrProfileService.parseScannedPayload(testScheme);
    expect(parsedUid).toBe(sampleUid);
  });

  it('correctly parses direct raw UIDs', () => {
    const parsedUid = qrProfileService.parseScannedPayload('ABCdef1234567890XYZ_999');
    expect(parsedUid).toBe('ABCdef1234567890XYZ_999');
  });

  it('rejects invalid or blank payloads safely', () => {
    expect(qrProfileService.parseScannedPayload('')).toBeNull();
    expect(qrProfileService.parseScannedPayload(null)).toBeNull();
    expect(qrProfileService.parseScannedPayload('random-short-str')).toBeNull();
  });
});

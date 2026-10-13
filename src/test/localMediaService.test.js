import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeBlobHash,
  saveLocalMedia,
  getLocalMedia,
  clearLocalMediaCache,
  getLocalCacheStats,
} from '../services/localMediaService';

// Ensure browser crypto fallback if needed in node
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

describe('Local Media Detection and Storage Service', () => {
  beforeEach(async () => {
    try {
      await clearLocalMediaCache();
    } catch {
      // Ignore if not initialized
    }
  });

  it('computes distinct SHA-256 hashes for different contents', async () => {
    const blob1 = new Blob(['sample photo content 1'], { type: 'image/jpeg' });
    const blob2 = new Blob(['different content with same name'], { type: 'image/jpeg' });

    const hash1 = await computeBlobHash(blob1);
    const hash2 = await computeBlobHash(blob2);

    expect(hash1).toBeDefined();
    expect(hash2).toBeDefined();
    expect(hash1).not.toBe(hash2);
  });

  it('computes identical SHA-256 hashes for identical files regardless of filename', async () => {
    const rawBytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const file1 = new Blob([rawBytes], { type: 'image/png' });
    const file2 = new Blob([rawBytes], { type: 'image/png' });

    const hash1 = await computeBlobHash(file1);
    const hash2 = await computeBlobHash(file2);

    expect(hash1).toBe(hash2);
  });

  it('saves and reuses cached photo blob without downloading again', async () => {
    const photoBlob = new Blob(['image binary test content'], { type: 'image/jpeg' });
    const targetUrl = 'https://res.cloudinary.com/test/image/upload/sample_photo.jpg';

    const saveRes = await saveLocalMedia(targetUrl, photoBlob, {
      fileName: 'sample_photo.jpg',
      mimeType: 'image/jpeg',
      origin: 'downloaded',
    });

    expect(saveRes).toBeDefined();
    expect(saveRes.success).toBe(true);

    // Now query getLocalMedia
    const checkRes = await getLocalMedia({
      mediaUrl: targetUrl,
      fileName: 'sample_photo.jpg',
    });

    expect(checkRes.isAvailable).toBe(true);
    expect(checkRes.localUrl).toBeDefined();
    expect(checkRes.source).toBe('cache');
  });

  it('does NOT reuse media if only filename matches but contents/size differ', async () => {
    const originalBlob = new Blob(['original 12345'], { type: 'video/mp4' });
    const testUrl = 'https://res.cloudinary.com/test/video/upload/clip1.mp4';

    await saveLocalMedia(testUrl, originalBlob, {
      fileName: 'clip1.mp4',
      fileSize: originalBlob.size,
      mimeType: 'video/mp4',
    });

    // Query for a message with different URL and different hash
    const checkRes = await getLocalMedia({
      mediaUrl: 'https://res.cloudinary.com/test/video/upload/different_clip.mp4',
      fileName: 'clip1.mp4', // Same name, but different asset
      contentHash: 'some_other_hash_that_does_not_exist',
    });

    expect(checkRes.isAvailable).toBe(false);
  });

  it('reports correct cache statistics for stored media', async () => {
    const audioBlob = new Blob(['audio sound waves data'], { type: 'audio/mpeg' });
    const audioUrl = 'https://res.cloudinary.com/test/audio/upload/voice1.mp3';

    await saveLocalMedia(audioUrl, audioBlob, {
      fileName: 'voice1.mp3',
      mimeType: 'audio/mpeg',
    });

    const stats = await getLocalCacheStats();
    expect(stats.totalCount).toBeGreaterThanOrEqual(1);
    expect(stats.audioCount).toBeGreaterThanOrEqual(1);
    expect(stats.totalBytes).toBeGreaterThan(0);
  });
});

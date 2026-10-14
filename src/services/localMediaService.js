/**
 * Qwik-Messages Local Media Reuse & Storage Access Service
 * Provides smart local media detection, content-hash verification,
 * IndexedDB blob caching, and File System Access API integration.
 */

const DB_NAME = 'QwikLocalMediaDB';
const DB_VERSION = 1;
const STORE_MEDIA = 'media_items';
const STORE_FOLDERS = 'folder_handles';

// Active Object URLs to revoke on unload/cleanup
const activeObjectUrls = new Map();

// Map of in-flight downloads to prevent duplicate requests
const inFlightDownloads = new Map();

/**
 * Initialize IndexedDB with stores for media and directory handles
 */
const getDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // 1. Media Items Store
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        mediaStore.createIndex('contentHash', 'contentHash', { unique: false });
        mediaStore.createIndex('fileSize', 'fileSize', { unique: false });
        mediaStore.createIndex('mimeType', 'mimeType', { unique: false });
        mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 2. Folder Handles Store (Stores FileSystemDirectoryHandle)
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Compute SHA-256 Content Hash using Web Crypto API
 * Uses chunked sampling for files larger than 16MB for instant non-blocking performance
 */
export const computeBlobHash = async (blob) => {
  try {
    if (!blob || !(blob instanceof Blob)) return null;

    if (!window.crypto?.subtle) {
      // Fallback fast size+type string hash if crypto.subtle is unavailable (e.g. non-secure context)
      return `fallback_${blob.size}_${blob.type}_${Date.now()}`;
    }

    const maxFullHashBytes = 16 * 1024 * 1024; // 16MB
    let bufferToHash;

    if (blob.size <= maxFullHashBytes) {
      bufferToHash = await blob.arrayBuffer();
    } else {
      // Chunked hash: head 4MB + tail 4MB + byte size to ensure distinct hash while fast
      const head = await blob.slice(0, 4 * 1024 * 1024).arrayBuffer();
      const tail = await blob.slice(blob.size - 4 * 1024 * 1024, blob.size).arrayBuffer();
      const combined = new Uint8Array(head.byteLength + tail.byteLength + 8);
      combined.set(new Uint8Array(head), 0);
      combined.set(new Uint8Array(tail), head.byteLength);

      const view = new DataView(combined.buffer);
      view.setFloat64(head.byteLength + tail.byteLength, blob.size);
      bufferToHash = combined.buffer;
    }

    const digest = await crypto.subtle.digest('SHA-256', bufferToHash);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[LocalMediaService] Hash calculation notice:', err.message);
    return `size_${blob?.size || 0}`;
  }
};

/**
 * Save a media Blob / File into the local IndexedDB cache
 */
export const saveLocalMedia = async (identifier, blob, metadata = {}) => {
  if (!identifier || !blob) return null;

  try {
    const db = await getDB();
    const contentHash = metadata.contentHash || (await computeBlobHash(blob));

    const record = {
      id: String(identifier),
      url: metadata.url || (typeof identifier === 'string' && identifier.startsWith('http') ? identifier : null),
      contentHash: contentHash || null,
      fileName: metadata.fileName || 'media',
      fileSize: blob.size,
      mimeType: blob.type || metadata.mimeType || 'application/octet-stream',
      blob: blob,
      origin: metadata.origin || 'downloaded', // 'downloaded' | 'uploaded' | 'local_folder'
      timestamp: Date.now(),
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Provide immediate object URL
    const objectUrl = URL.createObjectURL(blob);
    activeObjectUrls.set(record.id, objectUrl);

    return {
      success: true,
      contentHash,
      objectUrl,
      fileSize: blob.size,
    };
  } catch (err) {
    console.error('[LocalMediaService] Failed to save media to cache:', err);
    return null;
  }
};

/**
 * Scan linked local folder for an identical media file
 * Checks file size and verifies content hash before reusing.
 */
const findMatchingFileInLinkedFolder = async (expectedSize, expectedHash, expectedName) => {
  try {
    if (!isFileSystemAccessSupported()) return null;

    const db = await getDB();
    const folderRecord = await new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const req = store.get('linked_media_folder');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!folderRecord || !folderRecord.handle) return null;

    const dirHandle = folderRecord.handle;

    // Verify permission
    const perm = await dirHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') return null;

    // Search directory entries
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();

        // 1. Size match check
        if (expectedSize && file.size !== expectedSize) continue;

        // 2. Name check as secondary filter
        if (expectedName && file.name.toLowerCase() !== expectedName.toLowerCase()) {
          // If name doesn't match and we have no expectedHash, continue
          if (!expectedHash) continue;
        }

        // 3. Reliable content verification: verify exact content hash
        if (expectedHash) {
          const fileHash = await computeBlobHash(file);
          if (fileHash === expectedHash) {
            return file;
          }
        } else if (expectedSize && expectedName && file.name === expectedName && file.size === expectedSize) {
          // Both exact name and exact size match
          return file;
        }
      }
    }

    return null;
  } catch (err) {
    console.warn('[LocalMediaService] Linked folder scan notice:', err.message);
    return null;
  }
};

/**
 * Check whether a message's media is already available locally on device.
 * Revalidates and returns a reusable local object URL if found.
 */
export const getLocalMedia = async (msg) => {
  if (!msg) return { isAvailable: false };

  const targetUrl = msg.mediaUrl || msg.imageUrl || msg.videoUrl || msg.audioUrl || msg.url;
  const msgId = msg.id || msg._id;
  const targetHash = msg.contentHash;
  const targetSize = typeof msg.fileSizeBytes === 'number' ? msg.fileSizeBytes : null;
  const targetName = msg.fileName || null;

  try {
    const db = await getDB();

    // 1. Direct Lookup by URL or Message ID
    let cached = await new Promise((resolve) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);

      let found = null;
      const checkKey = (key) => {
        return new Promise((res) => {
          if (!key) return res(null);
          const req = store.get(key);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      };

      (async () => {
        if (targetUrl) found = await checkKey(targetUrl);
        if (!found && msgId) found = await checkKey(msgId);
        if (!found && msg.mediaStoragePath) found = await checkKey(msg.mediaStoragePath);
        resolve(found);
      })();
    });

    // 2. Content Hash Index Lookup (if not found by direct ID)
    if (!cached && targetHash) {
      cached = await new Promise((resolve) => {
        const tx = db.transaction(STORE_MEDIA, 'readonly');
        const store = tx.objectStore(STORE_MEDIA);
        const index = store.index('contentHash');
        const req = index.get(targetHash);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }

    // If found in IndexedDB cache, revalidate blob
    if (cached && cached.blob) {
      if (cached.blob.size > 0) {
        let objectUrl = activeObjectUrls.get(cached.id);
        if (!objectUrl) {
          objectUrl = URL.createObjectURL(cached.blob);
          activeObjectUrls.set(cached.id, objectUrl);
        }

        return {
          isAvailable: true,
          localUrl: objectUrl,
          blob: cached.blob,
          source: 'cache',
          origin: cached.origin || 'downloaded',
          contentHash: cached.contentHash,
          fileSize: cached.fileSize,
        };
      }
    }

    // 3. Check authorized local device folder (File System Access API)
    if (targetSize || targetHash || targetName) {
      const matchedDeviceFile = await findMatchingFileInLinkedFolder(targetSize, targetHash, targetName);
      if (matchedDeviceFile) {
        // Cache the newly discovered local match into IndexedDB for instant future access
        const cacheResult = await saveLocalMedia(targetUrl || msgId, matchedDeviceFile, {
          contentHash: targetHash,
          fileName: matchedDeviceFile.name,
          mimeType: matchedDeviceFile.type,
          origin: 'local_folder',
        });

        const objectUrl = cacheResult?.objectUrl || URL.createObjectURL(matchedDeviceFile);

        return {
          isAvailable: true,
          localUrl: objectUrl,
          blob: matchedDeviceFile,
          source: 'device_folder',
          origin: 'local_folder',
          contentHash: cacheResult?.contentHash || targetHash,
          fileSize: matchedDeviceFile.size,
        };
      }
    }

    return { isAvailable: false };
  } catch (err) {
    console.warn('[LocalMediaService] Availability check notice:', err.message);
    return { isAvailable: false };
  }
};

/**
 * Download attachment and persist into the local media index.
 * Deduplicates concurrent downloads for the same asset.
 */
export const downloadAndCacheMedia = async (msg, onProgress) => {
  if (!msg) throw new Error('Missing message payload');
  const targetUrl = msg.mediaUrl || msg.imageUrl || msg.videoUrl || msg.audioUrl || msg.url;
  if (!targetUrl) throw new Error('No media URL available');

  const dedupeKey = targetUrl;

  // If download is already in progress, reuse the existing promise
  if (inFlightDownloads.has(dedupeKey)) {
    return inFlightDownloads.get(dedupeKey);
  }

  const downloadPromise = (async () => {
    try {
      if (onProgress) onProgress(15);

      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} downloading media`);

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      let rawBlob;

      // Stream progress tracking if ReadableStream is supported
      if (response.body && totalBytes > 0) {
        const reader = response.body.getReader();
        const chunks = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedBytes += value.length;
          if (onProgress) {
            const pct = Math.min(95, Math.round((receivedBytes / totalBytes) * 100));
            onProgress(pct);
          }
        }

        rawBlob = new Blob(chunks, {
          type: response.headers.get('content-type') || msg.mediaType || 'application/octet-stream',
        });
      } else {
        rawBlob = await response.blob();
      }

      if (onProgress) onProgress(98);

      // Save to IndexedDB local media index
      const saveResult = await saveLocalMedia(targetUrl, rawBlob, {
        fileName: msg.fileName,
        mimeType: rawBlob.type,
        mediaStoragePath: msg.mediaStoragePath,
        contentHash: msg.contentHash,
        origin: 'downloaded',
      });

      if (onProgress) onProgress(100);

      return {
        success: true,
        blob: rawBlob,
        localUrl: saveResult?.objectUrl || URL.createObjectURL(rawBlob),
        contentHash: saveResult?.contentHash,
      };
    } finally {
      inFlightDownloads.delete(dedupeKey);
    }
  })();

  inFlightDownloads.set(dedupeKey, downloadPromise);
  return downloadPromise;
};

/**
 * File System Access API: Check browser support
 */
export const isFileSystemAccessSupported = () => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

/**
 * Request user to pick and authorize a local folder for media reuse
 */
export const requestLinkMediaFolder = async () => {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  try {
    const dirHandle = await window.showDirectoryPicker({
      id: 'qwik_media_folder',
      mode: 'read',
      startIn: 'downloads',
    });

    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      store.put({
        id: 'linked_media_folder',
        handle: dirHandle,
        folderName: dirHandle.name,
        linkedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      success: true,
      folderName: dirHandle.name,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { cancelled: true };
    }
    throw err;
  }
};

/**
 * Get linked folder status
 */
export const getLinkedFolderStatus = async () => {
  try {
    if (!isFileSystemAccessSupported()) {
      return { supported: false, isLinked: false };
    }

    const db = await getDB();
    const folderRecord = await new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const req = store.get('linked_media_folder');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!folderRecord || !folderRecord.handle) {
      return { supported: true, isLinked: false };
    }

    const perm = await folderRecord.handle.queryPermission({ mode: 'read' });
    return {
      supported: true,
      isLinked: perm === 'granted',
      needsPermission: perm === 'prompt',
      folderName: folderRecord.folderName,
    };
  } catch (err) {
    return { supported: isFileSystemAccessSupported(), isLinked: false, error: err.message };
  }
};

/**
 * Re-request permission on an already stored folder handle (after page reload/prompt)
 */
export const reauthorizeLinkedFolder = async () => {
  try {
    const db = await getDB();
    const folderRecord = await new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const req = store.get('linked_media_folder');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!folderRecord || !folderRecord.handle) {
      return requestLinkMediaFolder();
    }

    const newPerm = await folderRecord.handle.requestPermission({ mode: 'read' });
    if (newPerm === 'granted') {
      return { success: true, folderName: folderRecord.folderName };
    }
    return { success: false, denied: true };
  } catch (err) {
    if (err.name === 'AbortError') return { cancelled: true };
    return requestLinkMediaFolder();
  }
};

/**
 * Unlink authorized media folder
 */
export const unlinkMediaFolder = async () => {
  try {
    const db = await getDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      store.delete('linked_media_folder');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Get total cache storage statistics
 */
export const getLocalCacheStats = async () => {
  try {
    const db = await getDB();
    const items = await new Promise((resolve) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const totalCount = items.length;
    let totalBytes = 0;
    let photoCount = 0;
    let videoCount = 0;
    let audioCount = 0;

    items.forEach((item) => {
      totalBytes += item.fileSize || item.blob?.size || 0;
      const mime = item.mimeType || '';
      if (mime.startsWith('image/')) photoCount++;
      else if (mime.startsWith('video/')) videoCount++;
      else if (mime.startsWith('audio/')) audioCount++;
    });

    let quotaInfo = null;
    if (navigator.storage?.estimate) {
      quotaInfo = await navigator.storage.estimate();
    }

    return {
      totalCount,
      totalBytes,
      photoCount,
      videoCount,
      audioCount,
      quotaUsed: quotaInfo?.usage || totalBytes,
      quotaTotal: quotaInfo?.quota || 0,
    };
  } catch (err) {
    return { totalCount: 0, totalBytes: 0, photoCount: 0, videoCount: 0, audioCount: 0 };
  }
};

/**
 * Clear local media cache
 */
export const clearLocalMediaCache = async () => {
  try {
    // Revoke all active object URLs to prevent memory leak
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls.clear();

    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return true;
  } catch (err) {
    console.error('[LocalMediaService] Failed to clear media cache:', err);
    return false;
  }
};

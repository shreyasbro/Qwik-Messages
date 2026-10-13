import { useState, useEffect, useRef, useCallback } from 'react';
import { getLocalMedia, downloadAndCacheMedia } from '../services/localMediaService';

export function useLocalMedia(msg, isSender = false) {
  const [isLocal, setIsLocal] = useState(Boolean(isSender));
  const [localUrl, setLocalUrl] = useState(null);
  const [source, setSource] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const objectUrlRef = useRef(null);

  const mediaUrl = msg?.mediaUrl || msg?.imageUrl || msg?.videoUrl || msg?.audioUrl || msg?.url;
  const msgId = msg?.id || msg?._id;

  // Check local availability on mount or when message identity changes
  useEffect(() => {
    let isCancelled = false;

    if (!mediaUrl && !msgId) {
      setIsLocal(false);
      setLocalUrl(null);
      return;
    }

    const checkAvailability = async () => {
      try {
        const result = await getLocalMedia(msg);
        if (isCancelled) return;

        if (result.isAvailable && result.localUrl) {
          setIsLocal(true);
          setLocalUrl(result.localUrl);
          setSource(result.source || 'cache');
          objectUrlRef.current = result.localUrl;
        } else if (isSender) {
          // Sender view fallback: always unblurred
          setIsLocal(true);
          setLocalUrl(mediaUrl);
          setSource('sender');
        } else {
          setIsLocal(false);
          setLocalUrl(null);
          setSource(null);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[useLocalMedia] Availability check notice:', err);
          if (isSender) {
            setIsLocal(true);
            setLocalUrl(mediaUrl);
          }
        }
      }
    };

    checkAvailability();

    return () => {
      isCancelled = true;
    };
  }, [mediaUrl, msgId, msg?.contentHash, isSender]);

  // Download media and cache locally
  const download = useCallback(
    async (e) => {
      if (e) e.stopPropagation();
      if (isDownloading || isLocal) return;

      setIsDownloading(true);
      setDownloadProgress(10);

      try {
        const result = await downloadAndCacheMedia(msg, (pct) => {
          setDownloadProgress(pct);
        });

        if (result?.localUrl) {
          setIsLocal(true);
          setLocalUrl(result.localUrl);
          setSource('cache');
          objectUrlRef.current = result.localUrl;
        }
      } catch (err) {
        console.error('[useLocalMedia] Download error:', err);
      } finally {
        setIsDownloading(false);
      }
    },
    [msg, isDownloading, isLocal]
  );

  return {
    isLocal,
    localUrl: localUrl || mediaUrl,
    source,
    isDownloading,
    downloadProgress,
    download,
  };
}

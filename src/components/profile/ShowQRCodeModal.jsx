import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { qrProfileService } from '../../services/qrProfileService';
import { userService } from '../../services/userService';
import { useChat } from '../../context/ChatContext';

export default function ShowQRCodeModal({ isOpen, onClose, currentUser, userProfile }) {
  const { setActiveChat } = useChat();

  // Mode: 'my_qr' (Show permanent QR) | 'scanner' (Camera scan) | 'confirm' (Scanned profile confirmation)
  const [activeTab, setActiveTab] = useState('my_qr');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  
  // Scanner state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualLinkInput, setManualLinkInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  // Scanned user confirmation state
  const [confirmedUser, setConfirmedUser] = useState(null);
  const [isAddingFriend, setIsAddingFriend] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const fileInputRef = useRef(null);

  const myUid = currentUser?.uid;
  const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Logged In User';
  const userUsername = userProfile?.username || '';
  const userAvatar = userService.resolveAvatar({
    displayName: userDisplayName,
    photoURL: currentUser?.photoURL || userProfile?.photoURL,
    customAvatarUrl: userProfile?.customAvatarUrl
  });

  // 1. GENERATE PERMANENT QR CODE (Stable, immutable account payload)
  useEffect(() => {
    if (!myUid || !isOpen) return;

    let isMounted = true;
    const permanentPayload = qrProfileService.getPermanentProfilePayload(myUid);

    QRCode.toDataURL(permanentPayload, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H'
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('Failed to generate permanent QR Code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [myUid, isOpen]);

  const isStartingCameraRef = useRef(false);

  // Clean up camera on tab change or modal close
  useEffect(() => {
    if (!isOpen || activeTab !== 'scanner') {
      stopCamera();
    } else if (isOpen && activeTab === 'scanner') {
      startCamera();
    }
  }, [isOpen, activeTab]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    isStartingCameraRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn('Error stopping track:', e);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setCameraError('');
    setCameraActive(false);

    // Stop any existing stream
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or secure context (HTTPS/localhost required).');
      }

      // Try preferred back/environment camera first, fall back to any available video device
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (envErr) {
        console.warn('Preferred environment camera failed, trying default camera:', envErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (!isStartingCameraRef.current) {
        // Stream acquired after unmount or tab switch away
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      // Ensure video element receives the stream and plays
      const videoEl = videoRef.current;
      if (!videoEl) {
        throw new Error('Video preview element not ready.');
      }

      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('autoplay', 'true');
      videoEl.muted = true;

      // Wait for loadedmetadata or canplay
      await new Promise((resolve) => {
        if (videoEl.readyState >= 1) {
          resolve();
        } else {
          videoEl.onloadedmetadata = () => {
            resolve();
          };
          // Timeout fallback in case loadedmetadata doesn't fire
          setTimeout(resolve, 800);
        }
      });

      try {
        await videoEl.play();
      } catch (playErr) {
        console.warn('video.play() warning:', playErr);
      }

      setCameraActive(true);
      isStartingCameraRef.current = false;
      animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
    } catch (err) {
      console.error('Camera initialization failed:', err);
      isStartingCameraRef.current = false;
      setCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was blocked. Please click the camera/lock icon in your browser URL bar, set Camera to "Allow", and reload.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device detected on this device. You can paste a friend link or upload a QR image below.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is currently in use by another application or tab. Please close other camera apps and retry.');
      } else {
        setCameraError(err.message || 'Unable to open camera preview.');
      }
    }
  };

  // Continuous frame scanner
  const scanVideoFrame = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      handleScannedData(code.data);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
  };

  // Process decoded scanned string (from camera or image file)
  const handleScannedData = async (rawString) => {
    stopCamera();
    setIsResolving(true);
    setResolveError('');

    const targetUid = qrProfileService.parseScannedPayload(rawString);
    if (!targetUid) {
      setIsResolving(false);
      setResolveError('The scanned QR code is not a valid Qwik Messages profile code.');
      return;
    }

    const res = await qrProfileService.resolveProfileByUid(targetUid, myUid);
    setIsResolving(false);

    if (!res.success) {
      setResolveError(res.error || 'Failed to locate user profile.');
      return;
    }

    setConfirmedUser(res.user);
    setActiveTab('confirm');
  };

  // Upload QR code image from gallery fallback
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          handleScannedData(code.data);
        } else {
          setResolveError('No valid QR code found in the selected image.');
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Manual Profile Link input submit
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualLinkInput.trim()) return;
    handleScannedData(manualLinkInput);
  };

  // Download QR as PNG
  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `qwik-profile-${userDisplayName.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy Profile Link
  const handleCopyLink = () => {
    if (!myUid) return;
    const profileUrl = qrProfileService.getPermanentProfilePayload(myUid);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(profileUrl);
      setCopyFeedback('Link Copied!');
      setTimeout(() => setCopyFeedback(''), 2500);
    }
  };

  // Native Web Share API
  const handleShareProfile = async () => {
    if (!myUid) return;
    const profileUrl = qrProfileService.getPermanentProfilePayload(myUid);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Connect with ${userDisplayName} on Qwik Messages`,
          text: `Scan my QR code or tap the link to chat with me on Qwik Messages:`,
          url: profileUrl,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  // Confirm friend addition from profile preview
  const handleAddFriendConfirmed = async () => {
    if (!confirmedUser) return;
    setIsAddingFriend(true);
    try {
      const activeRoom = await qrProfileService.confirmAndAddFriend(currentUser, confirmedUser);
      setActiveChat(activeRoom);
      onClose();
    } catch (err) {
      console.error('Add friend error:', err);
      alert(err.message || 'Failed to add friend.');
    } finally {
      setIsAddingFriend(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="w-full max-w-sm sm:max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col text-center">
        {/* Top Aesthetic Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400"></div>

        {/* Header with Title and Close Button */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-teal-400 text-lg">📱</span>
            <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
              {activeTab === 'my_qr' && 'Show QR to Friends'}
              {activeTab === 'scanner' && 'Scan Friend QR'}
              {activeTab === 'confirm' && 'Profile Found'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation Pill */}
        {activeTab !== 'confirm' && (
          <div className="flex bg-slate-900/90 p-1 rounded-2xl border border-slate-800 mb-5">
            <button
              onClick={() => {
                setActiveTab('my_qr');
                setResolveError('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'my_qr'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My QR Code
            </button>
            <button
              onClick={() => {
                setActiveTab('scanner');
                setResolveError('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'scanner'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Scan QR Code
            </button>
          </div>
        )}

        {/* VIEW 1: MY PERMANENT QR CODE */}
        {activeTab === 'my_qr' && (
          <div className="flex flex-col items-center">
            {/* User Identity Header */}
            <div className="flex items-center gap-3 mb-4 bg-slate-900/60 border border-slate-800/80 px-4 py-2.5 rounded-2xl w-full text-left">
              <img
                src={userAvatar}
                alt={userDisplayName}
                className="w-12 h-12 rounded-full object-cover border-2 border-teal-500/40 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-white truncate">{userDisplayName}</h3>
                {userUsername ? (
                  <p className="text-xs text-teal-400 font-bold truncate">@{userUsername.replace(/^@/, '')}</p>
                ) : (
                  <p className="text-xs text-slate-400 truncate">{currentUser?.email}</p>
                )}
              </div>
            </div>

            {/* Permanent QR Card (High contrast on pure white canvas for instant phone detection) */}
            <div className="relative p-4 bg-white rounded-3xl shadow-2xl border-4 border-teal-500/20 mb-4 group">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Permanent Profile QR Code"
                  className="w-56 h-56 object-contain rounded-xl select-none"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-500 text-xs animate-pulse">
                  Generating stable QR...
                </div>
              )}
            </div>

            {/* Permanent Helper Notice (No timers, no countdowns) */}
            <p className="text-[11px] text-slate-400 font-medium mb-4 max-w-xs">
              Your permanent QR code. Friends can scan this anytime with their camera to instantly connect with you.
            </p>

            {/* Actions: Download QR, Copy Link, Share */}
            <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-1">
              <button
                type="button"
                onClick={handleDownloadQR}
                className="flex-1 min-w-[100px] py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Download QR Image to device"
              >
                <span>💾</span> Download
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 min-w-[100px] py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Copy direct profile link"
              >
                <span>🔗</span> {copyFeedback || 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={handleShareProfile}
                className="flex-1 min-w-[100px] py-2.5 px-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md"
                title="Share via system share dialog"
              >
                <span>📤</span> Share
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: CAMERA QR SCANNER */}
        {activeTab === 'scanner' && (
          <div className="flex flex-col items-center w-full">
            {/* Viewfinder Container */}
            <div className="relative w-full aspect-square max-w-[260px] bg-black rounded-3xl overflow-hidden border-2 border-slate-800 flex items-center justify-center mb-4">
              {/* Target Scan Reticle Overlay */}
              <div className="absolute inset-4 border-2 border-dashed border-teal-400/80 rounded-2xl pointer-events-none z-10 animate-pulse"></div>

              {/* Video Preview Element (Always mounted while scanner tab is open) */}
              <video
                ref={videoRef}
                className={`w-full h-full object-cover transition-opacity duration-300 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                autoPlay
                playsInline
                muted
              />

              {/* Status Overlay: Visible when camera preview is not yet active or errored */}
              {!cameraActive && (
                <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center bg-slate-950/90 z-20">
                  {cameraError ? (
                    <div className="space-y-2.5 max-w-[220px]">
                      <span className="text-2xl block">📷</span>
                      <p className="text-xs text-rose-400 font-semibold leading-relaxed">{cameraError}</p>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Retry Camera
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-slate-400">
                      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="text-xs font-medium">Opening camera preview...</p>
                    </div>
                  )}
                </div>
              )}
              {/* Offscreen Canvas for jsQR processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Error or Resolution Feedback */}
            {isResolving && (
              <p className="text-xs text-teal-400 font-bold mb-3 animate-pulse">
                Resolving latest profile details...
              </p>
            )}
            {resolveError && (
              <div className="w-full bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs p-2.5 rounded-xl mb-3 font-medium">
                ⚠️ {resolveError}
              </div>
            )}

            {/* Fallbacks: Upload QR Image or Paste Link */}
            <div className="w-full space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Or use alternative method:</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-teal-400 hover:text-teal-300 font-bold underline cursor-pointer"
                >
                  Upload QR Image
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Manual Link Input */}
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste profile link or friend code..."
                  value={manualLinkInput}
                  onChange={(e) => setManualLinkInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500 font-medium"
                />
                <button
                  type="submit"
                  disabled={!manualLinkInput.trim() || isResolving}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Find
                </button>
              </form>
            </div>
          </div>
        )}

        {/* VIEW 3: SCANNED PROFILE CONFIRMATION */}
        {activeTab === 'confirm' && confirmedUser && (
          <div className="flex flex-col items-center">
            {/* User Profile Card */}
            <div className="w-full bg-slate-900/60 border border-slate-800 p-5 rounded-3xl mb-5 flex flex-col items-center text-center">
              <div className="relative mb-3">
                <img
                  src={userService.resolveAvatar(confirmedUser)}
                  alt={confirmedUser.displayName}
                  className="w-20 h-20 rounded-full object-cover border-4 border-teal-500/40 shadow-xl"
                />
              </div>

              <h3 className="text-base font-black text-white tracking-wide">
                {confirmedUser.displayName}
              </h3>

              {confirmedUser.username && (
                <p className="text-xs text-teal-400 font-bold mt-0.5">
                  @{confirmedUser.username.replace(/^@/, '')}
                </p>
              )}

              <p className="text-xs text-slate-400 mt-2 line-clamp-2 px-2 italic">
                &ldquo;{confirmedUser.bio}&rdquo;
              </p>
            </div>

            <p className="text-xs text-slate-300 font-semibold mb-5">
              Would you like to connect and start messaging?
            </p>

            {/* Confirm Actions */}
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setConfirmedUser(null);
                  setActiveTab('scanner');
                }}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Scan Another
              </button>
              <button
                type="button"
                onClick={handleAddFriendConfirmed}
                disabled={isAddingFriend}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isAddingFriend ? 'Connecting...' : 'Add Friend'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

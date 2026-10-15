import React, { useState } from 'react';

export default function VerifyLockModal({ isOpen, onClose, onVerified, targetSecret, lockType = 'pin' }) {
  const [inputVal, setInputVal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleVerify = (e) => {
    e.preventDefault();
    setError('');

    if (inputVal === targetSecret) {
      setIsVerifying(true);
      onVerified();
      setIsVerifying(false);
      setInputVal('');
      onClose();
    } else {
      setError(`Incorrect ${lockType === 'pin' ? '4-digit PIN' : 'Password'}. Try again.`);
      setInputVal('');
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setInputVal('');
          setError('');
          onClose();
        }
      }}
      className="fixed inset-0 z-[600] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 text-center"
      >
        {/* Shield Icon */}
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 mx-auto shadow-lg shadow-teal-500/10">
          <svg className="w-6 h-6 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div>
          <h3 className="text-base font-black text-white">Security Verification</h3>
          <p className="text-xs text-gray-400 mt-1">
            Enter your current {lockType === 'pin' ? '4-digit PIN' : 'Password'} to turn off App Lock
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="relative max-w-[200px] mx-auto">
            <input
              type={showPassword ? 'text' : 'password'}
              maxLength={lockType === 'pin' ? 4 : 32}
              value={inputVal}
              onChange={(e) => setInputVal(lockType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
              placeholder={lockType === 'pin' ? '••••' : 'Password'}
              className={`w-full text-center py-2.5 bg-gray-900 border border-gray-800 rounded-2xl text-white outline-none focus:border-teal-500 transition-all shadow-inner ${
                lockType === 'pin' ? 'text-2xl font-black tracking-[0.6em]' : 'text-xs font-semibold px-4'
              }`}
              autoFocus
            />
            {lockType === 'password' && (
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2.5 top-3 text-gray-400 hover:text-white text-[10px] font-bold cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            )}
          </div>

          {error && (
            <div className="p-2 rounded-xl bg-red-950/40 border border-red-500/30 text-[11px] font-bold text-red-400 animate-shake">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setInputVal('');
                setError('');
                onClose();
              }}
              className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying || !inputVal}
              className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-gray-950 text-xs font-black transition-transform active:scale-95 disabled:opacity-40 cursor-pointer shadow-lg shadow-red-500/20"
            >
              Turn Off Lock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SpecificContactsModal({ isOpen, onClose, title, currentAllowed = [], onSave, currentUserUid }) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUids, setSelectedUids] = useState(new Set(currentAllowed));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedUids(new Set(currentAllowed));

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('../firebaseConfig');
        const { userService } = await import('../services/userService');
        const snap = await getDocs(collection(db, 'users'));
        const usersList = [];
        snap.forEach((d) => {
          if (d.id !== currentUserUid) {
            const data = d.data();
            const dName = data.displayName || data.name || data.username || 'User';
            usersList.push({
              uid: d.id,
              displayName: dName,
              email: data.email || '',
              photoURL: userService.resolveAvatar({ ...data, displayName: dName, uid: d.id }),
            });
          }
        });
        setAllUsers(usersList);
      } catch (err) {
        console.warn('Failed to load users for specific privacy:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentAllowed, currentUserUid]);

  if (!isOpen) return null;

  const toggleUser = (uid) => {
    const next = new Set(selectedUids);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    setSelectedUids(next);
  };

  const handleSaveSelection = () => {
    onSave(Array.from(selectedUids));
    onClose();
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[700] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-800/80">
          <div>
            <h3 className="text-sm font-black text-white">{title}</h3>
            <p className="text-[10px] text-gray-400">Select contacts who can view this info</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-500 animate-pulse font-bold">Loading contacts...</div>
          ) : allUsers.length > 0 ? (
            allUsers.map((u) => {
              const isSelected = selectedUids.has(u.uid);
              return (
                <div
                  key={u.uid}
                  onClick={() => toggleUser(u.uid)}
                  className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-teal-950/40 border-teal-500/50 text-white'
                      : 'bg-gray-900/60 border-gray-800/80 text-gray-300 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-700 bg-gray-800 shrink-0" />
                    <div className="min-w-0 pr-2 text-left">
                      <h5 className="text-xs font-bold truncate">{u.displayName}</h5>
                      <span className="text-[10px] text-gray-500 truncate block">{u.email}</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                    isSelected ? 'bg-teal-500 border-teal-400 text-gray-950 font-black' : 'border-gray-700 bg-gray-900'
                  }`}>
                    {isSelected && '✓'}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-gray-500">No other users found.</div>
          )}
        </div>

        <div className="flex gap-2.5 pt-2 border-t border-gray-800/80">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSelection}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
          >
            Save ({selectedUids.size})
          </button>
        </div>
      </div>
    </div>
  );
}

export function AudioMessagePlayer({ audioUrl, isSender, durationText }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => console.warn('Audio play notice:', e.message));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    const seekTime = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[210px] max-w-[280px] select-none">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 cursor-pointer shadow-md ${
          isSender
            ? 'bg-teal-400 text-gray-950 hover:bg-teal-300'
            : 'bg-teal-500 text-gray-950 hover:bg-teal-400'
        }`}
      >
        {isPlaying ? (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Track & Time */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-gray-700/80 rounded-lg appearance-none cursor-pointer accent-teal-400"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-gray-300">
          <span>{formatSeconds(currentTime)}</span>
          <span>{duration ? formatSeconds(duration) : durationText || 'Voice Note'}</span>
        </div>
      </div>
    </div>
  );
}

export function AudioRecorder({ onCancel, onSendAudio }) {
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    let streamInstance = null;

    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamInstance = stream;

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '',
        });

        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(100);

        // Timer
        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('Microphone access error:', err);
        setErrorMsg('Microphone access denied. Allow mic permission in browser.');
      }
    };

    startRecording();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamInstance) {
        streamInstance.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStopAndSend = () => {
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;
    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result;
        onSendAudio(base64Audio, recordingTime);
      };
    };

    recorder.stop();
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    onCancel();
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full flex items-center justify-between bg-gray-900 border border-teal-500/40 rounded-2xl px-4 py-2.5 animate-in fade-in duration-200 shadow-lg shadow-teal-500/10">
      {/* Left: Pulsing Recording Dot & Timer */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
        <span className="text-xs font-mono font-black text-red-400">
          {formatTimer(recordingTime)}
        </span>
        <span className="text-[11px] text-gray-400 hidden sm:inline font-medium">
          Recording audio note...
        </span>
      </div>

      {errorMsg && (
        <span className="text-[10px] text-red-400 font-bold px-2 truncate max-w-[180px]">
          {errorMsg}
        </span>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Cancel Button */}
        <button
          type="button"
          onClick={handleCancel}
          className="p-2 rounded-xl bg-gray-800 hover:bg-red-950/80 text-gray-400 hover:text-red-400 transition-colors cursor-pointer border border-gray-700"
          title="Cancel recording"
        >
          <svg className="w-4 h-4 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        {/* Send Audio Button */}
        <button
          type="button"
          onClick={handleStopAndSend}
          className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black flex items-center gap-1.5 transition-transform active:scale-95 shadow-md shadow-teal-500/20 cursor-pointer"
        >
          <span>Send</span>
          <svg className="w-3.5 h-3.5 fill-current rotate-90" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';

export default function VoiceMessagePlayer({
  src,
  isOwn = false,
  timestamp = '11:19 PM',
  status = 'read',
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // 28 Dynamic Waveform Amplitude Heights (WhatsApp Visual Match)
  const waveformPattern = useMemo(() => [
    25, 45, 75, 30, 90, 60, 100, 45, 80, 55, 
    90, 70, 35, 85, 60, 95, 40, 70, 30, 85, 
    50, 90, 40, 65, 35, 80, 55, 30
  ], []);

  // Format Seconds to M:SS
  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || secs === 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Play / Pause Toggle
  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn('Audio play interrupted:', err));
    }
  };

  // Speed Multiplier (1x -> 1.5x -> 2x -> 1x)
  const toggleSpeed = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    audioRef.current.playbackRate = nextSpeed;
    setSpeed(nextSpeed);
  };

  // Click on Waveform to Seek
  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = newProgress * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Audio Event Listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(audio.duration || 0);
      setIsLoaded(true);
    };
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`w-full min-w-[260px] sm:min-w-[310px] max-w-[360px] p-3 rounded-3xl transition-all select-none shadow-lg ${
        isOwn
          ? 'bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-600 text-white rounded-br-sm shadow-teal-950/40 border border-teal-400/30'
          : 'bg-[#1f2c34] text-gray-100 rounded-bl-sm border border-gray-800 shadow-black/50'
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* TOP CONTROLS ROW */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-90 cursor-pointer ${
            isOwn
              ? 'bg-white text-teal-900 hover:bg-gray-100 shadow-teal-950/40'
              : 'bg-teal-400 text-gray-950 hover:bg-teal-300 shadow-teal-500/30'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Center: Waveform Visualizer & Timers */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {/* Interactive Waveform Canvas */}
          <div
            onClick={handleSeek}
            className="relative w-full h-6 flex items-center justify-between cursor-pointer py-1 group/wave"
          >
            {waveformPattern.map((h, i) => {
              const barProgress = (i / waveformPattern.length) * 100;
              const isPassed = progressPercent >= barProgress;
              return (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`w-[3px] rounded-full transition-all duration-75 ${
                    isPassed
                      ? isOwn
                        ? 'bg-white'
                        : 'bg-teal-400 shadow-sm shadow-teal-400/50'
                      : isOwn
                      ? 'bg-white/30 group-hover/wave:bg-white/45'
                      : 'bg-gray-700 group-hover/wave:bg-gray-600'
                  } ${isPlaying && isPassed ? 'scale-y-110' : ''}`}
                />
              );
            })}
          </div>

          {/* Time & Speed Controls */}
          <div className="flex items-center justify-between text-[11px] font-bold tracking-tight">
            <span className={isOwn ? 'text-teal-50' : 'text-gray-300'}>
              {isPlaying ? formatTime(currentTime) : formatTime(duration)}
            </span>

            <button
              type="button"
              onClick={toggleSpeed}
              className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black cursor-pointer transition-all active:scale-95 ${
                isOwn
                  ? 'bg-black/25 hover:bg-black/40 text-white border border-white/20'
                  : 'bg-gray-800 hover:bg-gray-700 text-teal-400 border border-teal-500/20'
              }`}
            >
              {speed}x
            </button>
          </div>
        </div>

        {/* Right Mic Badge with Pulse */}
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-2xl flex items-center justify-center border shadow-inner ${
              isOwn
                ? 'bg-black/20 text-teal-200 border-white/15'
                : 'bg-teal-500/15 text-teal-400 border-teal-500/30'
            }`}
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
            </svg>
          </div>
          {isPlaying && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-teal-300 rounded-full animate-ping" />
          )}
        </div>
      </div>

      {/* BOTTOM METADATA: TIMESTAMP & STATUS BLUE TICKS */}
      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] font-semibold opacity-90">
        <span className={isOwn ? 'text-teal-100' : 'text-gray-400'}>{timestamp}</span>
        {isOwn && (
          <span className="text-white">
            <svg className="w-3.5 h-3.5 stroke-[2.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';

export default function WhatsAppVoiceNote({
  src,
  isOwn = false,
  timestamp = '11:19 PM',
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Format seconds to M:SS
  const formatTime = (timeInSec) => {
    if (isNaN(timeInSec) || timeInSec === 0) return '0:00';
    const mins = Math.floor(timeInSec / 60);
    const secs = Math.floor(timeInSec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const toggleSpeed = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    audioRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const newTime = Number(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration || 0);
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

  // 24 procedural waveform bars heights simulating voice audio frequencies
  const waveformBars = [35, 60, 25, 80, 50, 95, 40, 70, 50, 90, 65, 35, 80, 55, 90, 45, 65, 30, 75, 45, 85, 40, 60, 30];

  return (
    <div
      className={`w-full min-w-[270px] sm:min-w-[310px] max-w-[360px] px-3.5 py-3 rounded-3xl transition-all shadow-lg select-none ${
        isOwn
          ? 'bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 text-white rounded-br-sm shadow-teal-950/30'
          : 'bg-gray-900 text-gray-100 rounded-bl-sm border border-gray-800 shadow-black/40'
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* TOP ROW: PLAY BUTTON + WAVEFORM + MIC BADGE */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-90 cursor-pointer ${
            isOwn
              ? 'bg-white text-teal-900 hover:bg-gray-100 shadow-teal-950/40'
              : 'bg-teal-400 text-gray-950 hover:bg-teal-300 shadow-teal-500/30'
          }`}
          title={isPlaying ? 'Pause' : 'Play voice message'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Center: Waveform + Scrubber + Timers */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {/* Waveform Scrubber */}
          <div className="relative w-full h-6 flex items-center">
            {/* Visual Waveform Bars */}
            <div className="absolute inset-0 flex items-center justify-between pointer-events-none px-0.5">
              {waveformBars.map((height, i) => {
                const barProgress = (i / waveformBars.length) * 100;
                const isPassed = progressPercent >= barProgress;
                return (
                  <span
                    key={i}
                    style={{ height: `${height}%` }}
                    className={`w-[3px] rounded-full transition-all ${
                      isPassed
                        ? isOwn
                          ? 'bg-white'
                          : 'bg-teal-400'
                        : isOwn
                        ? 'bg-white/35'
                        : 'bg-gray-700'
                    } ${isPlaying && isPassed ? 'scale-y-110' : ''}`}
                  />
                );
              })}
            </div>

            {/* Invisible Range Input for Seeking */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>

          {/* Time & Speed Multiplier */}
          <div className="flex items-center justify-between text-[10px] font-bold">
            <span className={isOwn ? 'text-white/95' : 'text-gray-300'}>
              {isPlaying ? formatTime(currentTime) : formatTime(duration || 0)}
            </span>

            <button
              type="button"
              onClick={toggleSpeed}
              className={`px-1.5 py-0.5 rounded-md text-[9px] font-black cursor-pointer transition-colors ${
                isOwn
                  ? 'bg-black/25 text-white hover:bg-black/40'
                  : 'bg-gray-800 text-teal-400 hover:bg-gray-700'
              }`}
              title="Change Speed"
            >
              {playbackRate}x
            </button>
          </div>
        </div>

        {/* Right Mic Badge */}
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
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-teal-300 rounded-full animate-ping" />
          )}
        </div>
      </div>

      {/* BOTTOM META: TIMESTAMP & STATUS TICKS */}
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

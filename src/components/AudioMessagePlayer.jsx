import React, { useState, useRef, useEffect, useMemo } from 'react';

export default function AudioMessagePlayer({ audioUrl, isSender, durationSec = 0, durationText = '0:00' }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(() => {
    if (typeof durationSec === 'number' && durationSec > 0) return durationSec;
    return 0;
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // 26 Realistic Frequency Bars
  const waveformBars = useMemo(() => {
    return [40, 70, 90, 50, 100, 80, 60, 85, 95, 65, 45, 80, 95, 85, 55, 75, 90, 60, 45, 85, 100, 70, 50, 85, 65, 35];
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (audio.duration && isFinite(audio.duration) && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      } else if (durationSec > 0) {
        setTotalDuration(durationSec);
      }
    };

    const handleUpdate = () => {
      if (audio.currentTime && isFinite(audio.currentTime) && !isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, durationSec]);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.warn('Play note:', err.message));
      setIsPlaying(true);
    }
  };

  const toggleSpeed = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    audioRef.current.playbackRate = nextSpeed;
    setPlaybackSpeed(nextSpeed);
  };

  const handleBarClick = (index, e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const effDur = totalDuration > 0 ? totalDuration : durationSec || 10;
    const seekTime = (index / waveformBars.length) * effDur;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const effDur = totalDuration > 0 ? totalDuration : durationSec || 0;
  const progressRatio = effDur > 0 ? currentTime / effDur : 0;
  const activeBarCount = Math.floor(progressRatio * waveformBars.length);

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[240px] max-w-[320px] select-none">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 1. CIRCULAR PLAY BUTTON */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-white text-gray-950 hover:scale-105 active:scale-95 flex items-center justify-center shrink-0 transition-transform shadow-md cursor-pointer"
      >
        {isPlaying ? (
          <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4.5 h-4.5 fill-current ml-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* 2. WAVEFORM BARS & DURATION */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        <div className="flex items-center gap-[2.5px] h-6 cursor-pointer" title="Seek audio">
          {waveformBars.map((heightPercent, idx) => {
            const isBarActive = idx <= activeBarCount;
            return (
              <div
                key={idx}
                onClick={(e) => handleBarClick(idx, e)}
                style={{ height: `${Math.max(25, heightPercent)}%` }}
                className={`flex-1 rounded-full transition-all duration-75 ${
                  isBarActive
                    ? 'bg-white shadow-sm'
                    : isSender
                    ? 'bg-teal-900/60 hover:bg-teal-800'
                    : 'bg-gray-600/70 hover:bg-gray-500'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-white/95 font-bold">
          <span>{isPlaying ? formatTime(currentTime) : formatTime(effDur) || durationText}</span>
          <button
            type="button"
            onClick={toggleSpeed}
            className="px-1.5 py-0.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-[10px] font-mono font-bold border border-white/20 transition-transform active:scale-90 cursor-pointer"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>

      {/* 3. MIC ICON BADGE */}
      <div className="w-8 h-8 rounded-full bg-black/25 text-white flex items-center justify-center shrink-0 border border-white/10">
        <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
    </div>
  );
}

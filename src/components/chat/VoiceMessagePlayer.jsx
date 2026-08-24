import React, { useState, useRef, useEffect } from 'react';

export default function VoiceMessagePlayer({ audioUrl, duration = 0, isMe = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1); // 1 -> 1.5 -> 2
  const audioRef = useRef(null);

  const speedCycle = [1, 1.5, 2];

  const handleTogglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleCycleSpeed = (e) => {
    if (e) e.stopPropagation();
    const nextIdx = (speedCycle.indexOf(playbackRate) + 1) % speedCycle.length;
    const nextSpeed = speedCycle[nextIdx];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSeek = (e) => {
    if (e) e.stopPropagation();
    const seekTime = Number(e.target.value);
    setCurrentTime(seekTime);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const maxDuration = duration || (audioRef.current ? audioRef.current.duration || 0 : 0);

  return (
    <div className="flex items-center gap-3 p-2 min-w-[240px] max-w-xs select-none">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* PLAY / PAUSE BUTTON */}
      <button
        type="button"
        onClick={handleTogglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-md cursor-pointer ${
          isMe ? 'bg-gray-950 text-teal-400' : 'bg-teal-500 text-gray-950'
        }`}
      >
        {isPlaying ? (
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* SCRUBBABLE WAVEFORM TRACK & TIMER */}
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        <input
          type="range"
          min={0}
          max={maxDuration || 100}
          value={currentTime}
          onChange={handleSeek}
          onClick={(e) => e.stopPropagation()}
          className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-teal-400 focus:outline-none"
        />
        <div className="flex justify-between items-center text-[10px] text-gray-300/80 font-mono">
          <span>{formatSeconds(currentTime)}</span>
          <span>{formatSeconds(maxDuration)}</span>
        </div>
      </div>

      {/* SPEED TOGGLE PILL (1x, 1.5x, 2x) */}
      <button
        type="button"
        onClick={handleCycleSpeed}
        className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/10 hover:bg-white/20 text-teal-300 shrink-0 transition-all border border-teal-500/20 cursor-pointer"
        title="Playback speed"
      >
        {playbackRate}x
      </button>

    </div>
  );
}

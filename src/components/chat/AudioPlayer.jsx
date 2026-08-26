import React, { useState, useRef, useEffect } from 'react';

export default function AudioPlayer({
  src,
  fileName = 'Audio File',
  isOwn = true,
  isVoice = false,
  fileSize = null,
  timestamp = '07:07 PM',
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Time formatter (MM:SS)
  const formatTime = (timeInSec) => {
    if (isNaN(timeInSec) || timeInSec === 0) return '0:00';
    const minutes = Math.floor(timeInSec / 60);
    const seconds = Math.floor(timeInSec % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Size formatter
  const formatSize = (bytes) => {
    if (!bytes) return isVoice ? 'Voice Note' : 'Audio Track';
    if (typeof bytes === 'string') return bytes;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`w-full p-4 rounded-3xl transition-all shadow-xl select-none ${
        isOwn
          ? 'bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 text-white rounded-br-sm shadow-teal-950/40 border border-teal-400/40'
          : 'bg-gray-900 text-white rounded-bl-sm border border-gray-700/80 shadow-black/50'
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* TOP HEADER: ICON + FILE INFO + SPEED TOGGLE */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/20">
        <div className="flex items-center gap-3 min-w-0">
          {/* Glowing Music/Mic Icon */}
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
              isOwn
                ? 'bg-black/25 text-white border border-white/25'
                : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
            }`}
          >
            {isVoice ? (
              <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            )}
          </div>

          {/* File Name & Size */}
          <div className="min-w-0 text-left">
            <h5 className="text-sm font-extrabold text-white truncate drop-shadow-sm" title={fileName}>
              {fileName}
            </h5>
            <span className="text-[11px] font-semibold text-teal-100/90 block mt-0.5">
              {formatSize(fileSize)}
            </span>
          </div>
        </div>

        {/* Speed & Download Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleSpeed}
            className="px-2.5 py-1 rounded-xl text-xs font-black bg-black/30 hover:bg-black/50 text-white border border-white/20 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Change Playback Speed"
          >
            {playbackRate}x
          </button>

          {!isVoice && src && (
            <a
              href={src}
              download={fileName || 'audio.mp3'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-black/30 hover:bg-black/50 text-white border border-white/20 transition-all cursor-pointer"
              title="Download file"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* CONTROLS: PLAY BUTTON + HIGH-CONTRAST TIMELINE */}
      <div className="flex items-center gap-3.5">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-transform active:scale-90 cursor-pointer ${
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

        {/* Timeline Slider */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <div className="relative w-full flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none"
              style={{
                background: `linear-gradient(to right, #ffffff ${progressPercent}%, rgba(0, 0, 0, 0.4) ${progressPercent}%)`,
              }}
            />
          </div>

          {/* Timestamps */}
          <div className="flex items-center justify-between text-[11px] font-bold text-white/95">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* BOTTOM TIMESTAMP & DOUBLE BLUE TICKS */}
      <div className="flex items-center justify-end gap-1.5 mt-2.5 text-[11px] font-semibold text-teal-100/90">
        <span>{timestamp}</span>
        {isOwn && (
          <span className="text-white">
            <svg className="w-4 h-4 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

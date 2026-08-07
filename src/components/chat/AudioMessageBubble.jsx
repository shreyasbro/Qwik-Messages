import React, { useState, useRef, useEffect } from 'react';

const AudioMessageBubble = ({ message, isMe, resolvedPhotoUrl, senderDisplayName }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0:00");
  const [durationDisplay, setDurationDisplay] = useState("0:00");
  const audioRef = useRef(null);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleSpeedChange = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => console.error("Audio play failed:", err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const duration = audioRef.current.duration;
    const current = audioRef.current.currentTime;
    if (duration > 0) {
      setProgress((current / duration) * 100);
      setCurrentTimeDisplay(formatTime(current));
    }
  };

  const handleLoadedMetadata = () => {
    setDurationDisplay(formatTime(audioRef.current.duration));
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const seekTo = (e.target.value / 100) * audioRef.current.duration;
    audioRef.current.currentTime = seekTo;
    setProgress(e.target.value);
  };

  const displayFileName = message?.text?.replace("📎 Sent a file: ", "") || "Voice Message.mp3";
  const timestamp = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

  return (
    // ⚡ FIX: Mobile width (w-[85vw]), smaller padding (p-3), scaling up on larger screens
    <div className={`w-[85vw] sm:w-[28rem] md:w-[35rem] lg:w-[40rem] max-w-full bg-teal-900/40 border border-teal-500/30 rounded-2xl p-3 sm:p-4 text-white flex flex-col gap-2 sm:gap-3 shadow-lg my-2 ${isMe ? 'ml-auto rounded-tr-sm' : 'mr-auto rounded-tl-sm'}`}>
      
      <audio 
        ref={audioRef} 
        src={message.mediaUrl} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)} 
      />

      {/* TOP SECTION: Avatar and Text */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Avatar scales down on mobile */}
        <img 
          src={resolvedPhotoUrl || "https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff"} 
          alt="Avatar" 
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-teal-400 shrink-0" 
        />
        {/* min-w-0 is CRITICAL for flex truncation to work on small screens */}
        <div className="flex flex-col overflow-hidden min-w-0 w-full">
          <span className="text-xs sm:text-sm font-semibold text-teal-300 truncate">{senderDisplayName}</span>
          <span className="text-[10px] sm:text-xs text-gray-300 truncate">{displayFileName}</span>
        </div>
      </div>

      {/* BOTTOM SECTION: Controls and Timeline */}
      <div className="flex items-center gap-2 sm:gap-4 mt-1 sm:mt-2">
        {/* Play Button scales down on mobile */}
        <button 
          onClick={togglePlay} 
          className="bg-teal-500 hover:bg-teal-400 text-slate-900 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex shrink-0 items-center justify-center transition-all shadow-md"
        >
          {isPlaying ? (
            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5 sm:ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        
        {/* Speed Toggle */}
        <button 
          onClick={handleSpeedChange} 
          className="text-[10px] sm:text-xs font-bold bg-slate-800 text-teal-300 px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-md cursor-pointer hover:bg-slate-700 transition-colors w-7 sm:w-10 text-center shrink-0 border border-teal-500/20"
        >
          {speed}x
        </button>

        {/* Timeline wrapper - min-w-0 ensures the range input can shrink */}
        <div className="flex-1 flex items-center gap-1.5 sm:gap-3 w-full min-w-0">
          <span className="text-[10px] sm:text-xs text-teal-100 font-medium w-6 sm:w-8 text-right shrink-0">{currentTimeDisplay}</span>
          
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className="flex-1 min-w-0 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400 hover:accent-teal-300 transition-all"
          />
          
          <span className="text-[10px] sm:text-xs text-teal-100 font-medium w-6 sm:w-8 shrink-0">{durationDisplay}</span>
        </div>
      </div>

      <div className="flex justify-end mt-[-4px] sm:mt-[-8px]">
        <span className="text-[9px] sm:text-[10px] text-gray-400 tracking-wide">{timestamp}</span>
      </div>
    </div>
  );
};

export default AudioMessageBubble;

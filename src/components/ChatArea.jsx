import React from 'react';
import MediaMessageItem from './MediaMessageItem';
import AudioMessagePlayer from './AudioMessagePlayer';

export default function ChatArea({ messages = [], currentUser }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((msg) => {
        const isSender = Boolean(currentUser?.uid && msg?.senderId === currentUser.uid);
        const isAudioNote = msg.mediaType === 'audio' || msg.type === 'audio' || msg.isVoice;

        return (
          <div
            key={msg.id || msg._id || Math.random()}
            className={`flex flex-col ${isSender ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-md rounded-2xl p-2.5 shadow-md ${
                isSender
                  ? 'bg-teal-600 text-white rounded-br-none'
                  : 'bg-slate-800 text-slate-100 rounded-bl-none'
              }`}
            >
              {/* RENDER MEDIA (IMAGE / VIDEO / GIF) */}
              {(msg.mediaType === 'image' || msg.mediaType === 'video' || msg.mediaType === 'gif') && msg.mediaUrl ? (
                <div className="mb-1 w-full max-w-sm">
                  <MediaMessageItem currentUser={currentUser} isSender={isSender} msg={msg} />
                </div>
              ) : isAudioNote ? (
                <AudioMessagePlayer audioUrl={msg.mediaUrl} durationSec={msg.durationSec || 0} isSender={isSender} />
              ) : (
                <p className="text-xs leading-relaxed break-words">{msg.text}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

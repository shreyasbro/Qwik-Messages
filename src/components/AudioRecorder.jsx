import React, { useState, useEffect, useRef } from 'react';

export default function AudioRecorder({ onCancel, onSendAudio }) {
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

    const exactSeconds = recordingTime > 0 ? recordingTime : 1;
    const recorder = mediaRecorderRef.current;
    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result;
        onSendAudio(base64Audio, exactSeconds);
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
    return ${m}:;
  };

  return (
    <div className=w-full flex items-center justify-between bg-gray-900 border border-teal-500/40 rounded-2xl px-4 py-2.5 animate-in fade-in duration-200 shadow-lg shadow-teal-500/10>
      <div className=flex items-center gap-3>
        <div className=w-3 h-3 rounded-full bg-red-500 animate-ping />
        <span className=text-xs font-mono font-black text-red-400>
          {formatTimer(recordingTime)}
        </span>
        <span className=text-[11px] text-gray-400 hidden sm:inline font-medium>
          Recording audio note...
        </span>
      </div>

      {errorMsg && (
        <span className=text-[10px] text-red-400 font-bold px-2 truncate max-w-[180px]>
          {errorMsg}
        </span>
      )}

      <div className=flex items-center gap-2>
        <button
          type=button
          onClick={handleCancel}
          className=p-2 rounded-xl bg-gray-800 hover:bg-red-950/80 text-gray-400 hover:text-red-400 transition-colors cursor-pointer border border-gray-700
          title=Cancel recording
        >
          <svg className=w-4 h-4 stroke-[2] fill=none stroke=currentColor viewBox=0 0 24 24>
            <path strokeLinecap=round strokeLinejoin=round d=M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16 />
          </svg>
        </button>

        <button
          type=button
          onClick={handleStopAndSend}
          className=px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black flex items-center gap-1.5 transition-transform active:scale-95 shadow-md shadow-teal-500/20 cursor-pointer
        >
          <span>Send</span>
          <svg className=w-3.5 h-3.5 fill-current rotate-90 viewBox=0 0 24 24>
            <path d=M2.01 21L23 12 2.01 3 2 10l15 2-15 2z />
          </svg>
        </button>
      </div>
    </div>
  );
}

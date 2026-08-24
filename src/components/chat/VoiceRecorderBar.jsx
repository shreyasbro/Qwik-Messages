import React, { useState, useEffect, useRef } from 'react';

export default function VoiceRecorderBar({ onCancel, onSendAudio }) {
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) return;
        streamRef.current = stream;

        // 1. Audio Context & Analyser for Live Waveform
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        // 2. Setup MediaRecorder
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.start(100);

        // 3. Start Timer
        timerIntervalRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);

        // 4. Draw Live Waveform Canvas
        drawLiveWaveform();
      } catch (err) {
        console.error('Microphone access error:', err);
        onCancel();
      }
    };

    startRecording();

    return () => {
      isMounted = false;
      cleanupRecording();
    };
  }, []);

  const drawLiveWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = 3;
      const gap = 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.max(4, (dataArray[i] / 255) * canvas.height);

        // Glowing Teal Waveform Bars
        ctx.fillStyle = '#14b8a6';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth, barHeight, 2);
        } else {
          ctx.rect(x, (canvas.height - barHeight) / 2, barWidth, barHeight);
        }
        ctx.fill();

        x += barWidth + gap;
        if (x > canvas.width) break;
      }
    };

    render();
  };

  const cleanupRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const handleFinishAndSend = () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      onSendAudio(audioBlob, recordingTime);
      cleanupRecording();
    };

    mediaRecorderRef.current.stop();
  };

  const handleAbort = () => {
    cleanupRecording();
    onCancel();
  };

  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex-1 flex items-center justify-between bg-gray-900 border border-teal-500/50 rounded-2xl px-4 py-2 animate-in fade-in zoom-in-95 duration-150 shadow-lg shadow-teal-500/10">
      
      {/* RECORDING PULSE & TIMER */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
        <span className="text-xs font-mono font-bold text-white tracking-wider">
          {formatSeconds(recordingTime)}
        </span>
      </div>

      {/* LIVE WAVEFORM CANVAS */}
      <div className="flex-1 mx-4 flex items-center justify-center">
        <canvas ref={canvasRef} width={180} height={28} className="w-full max-w-[200px]" />
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Discard / Delete */}
        <button
          type="button"
          onClick={handleAbort}
          className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Discard Voice Note"
        >
          <svg className="w-4 h-4 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        {/* Send Audio Note */}
        <button
          type="button"
          onClick={handleFinishAndSend}
          className="p-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold shadow-md transition-all active:scale-95 cursor-pointer"
          title="Send Voice Note"
        >
          <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';

const PhotoEditorModal = ({ imageSrc, onCancel, onApply }) => {
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  // Positional offsets for Pan (X) and Tilt/Position (Y)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
  }, [imageSrc, zoom, brightness, offset]);

  // Mouse / Touch Drag Handlers for seamless direct panning
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    setOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    const SIZE = 200; // 200x200 standard viewport
    canvas.width = SIZE;
    canvas.height = SIZE;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.filter = `brightness(${brightness}%)`;

    // Calculate base centered coordinates
    const scale = Math.max(SIZE / img.width, SIZE / img.height) * zoom;
    const baseX = (SIZE - img.width * scale) / 2;
    const baseY = (SIZE - img.height * scale) / 2;

    // Apply Pan (offset.x) and Tilt/Position (offset.y) to drawImage
    ctx.drawImage(
      img, 
      baseX + offset.x, 
      baseY + offset.y, 
      img.width * scale, 
      img.height * scale
    );
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const editedBase64 = canvas.toDataURL('image/jpeg', 0.8);
    onApply(editedBase64);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-[999999] p-4 animate-fade-in"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center">
        <h3 className="text-lg font-bold text-white mb-1">Adjust Photo</h3>
        <p className="text-[11px] text-slate-400 mb-4">Click and drag photo to pan & position</p>
        
        {/* Interactive Circular Preview Viewport (Click & Drag enabled) */}
        <div 
          className="relative w-48 h-48 rounded-full overflow-hidden border-2 border-teal-500 shadow-inner mb-5 bg-black flex items-center justify-center cursor-move select-none"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <canvas ref={canvasRef} className="w-full h-full object-cover pointer-events-none" />
        </div>

        {/* Sliders Container */}
        <div className="w-full space-y-3 mb-5">
          {/* Zoom Slider */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>🔍 Zoom</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input 
              type="range" min="1" max="3" step="0.05" value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-teal-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Pan (X-Axis Left/Right) Slider */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>↔️ Pan (Left / Right)</span>
              <span>{Math.round(offset.x)}px</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={offset.x} 
              onChange={(e) => setOffset({ ...offset, x: parseInt(e.target.value) })}
              className="w-full accent-teal-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tilt/Position (Y-Axis Up/Down) Slider */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>↕️ Tilt (Up / Down)</span>
              <span>{Math.round(offset.y)}px</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={offset.y} 
              onChange={(e) => setOffset({ ...offset, y: parseInt(e.target.value) })}
              className="w-full accent-teal-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Brightness Slider */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>☀️ Brightness</span>
              <span>{brightness}%</span>
            </div>
            <input
              type="range" min="50" max="150" step="5" value={brightness} 
              onChange={(e) => setBrightness(parseInt(e.target.value))}
              className="w-full accent-teal-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Quick Reset Center Button */}
        <button
          type="button"
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); setBrightness(100); }}
          className="text-xs text-teal-400 hover:underline mb-4 cursor-pointer"
        >
          🔄 Reset Alignment to Center
        </button>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full">
          <button 
            onClick={onCancel}
            type="button"
            className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition cursor-pointer"
          >
            Cancel
          </button>
          <button 
            onClick={handleApply}
            type="button"
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm shadow-lg shadow-teal-500/20 hover:brightness-110 transition cursor-pointer"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditorModal;

import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, Timestamp, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { compressImageToHD } from '../../utils/imageOptimizer';
import { userService } from '../../services/userService';

export default function StatusUploadModal({ currentUser, onClose }) {
  const [tab, setTab] = useState('text'); // 'text' | 'image' | 'video'
  const [textContent, setTextContent] = useState('');
  const [bgColor, setBgColor] = useState('linear-gradient(135deg, #f97316 0%, #ec4899 100%)');
  const [textColor, setTextColor] = useState('#ffffff');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const activeXhrRef = useRef(null);

  // Audience & Close Friends State
  const [audience, setAudience] = useState('all');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [searchFriendTerm, setSearchFriendTerm] = useState('');

  const DURATION_OPTIONS = [
    { label: '6h', hours: 6 },
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '48h', hours: 48 },
  ];

  const [storyDuration, setStoryDuration] = useState(24);

  const PRESET_GRADIENTS = [
    { id: 'sunset', name: 'Sunset', value: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' },
    { id: 'cyber', name: 'Cyber Neon', value: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #9333ea 100%)' },
    { id: 'ocean', name: 'Deep Ocean', value: 'linear-gradient(135deg, #0f172a 0%, #0284c7 100%)' },
    { id: 'purple', name: 'Royal Purple', value: 'linear-gradient(135deg, #701a75 0%, #4c1d95 100%)' },
    { id: 'emerald', name: 'Emerald Glow', value: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)' },
  ];

  const PRESET_SOLIDS = ['#0f766e', '#1e3a8a', '#831843', '#1e293b', '#7c2d12', '#090d16'];

  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const q = query(collection(db, "users"), limit(60));
        const snap = await getDocs(q);
        const users = [];
        snap.forEach(d => {
          if (d.id !== currentUser.uid) {
            users.push({ uid: d.id, ...d.data() });
          }
        });
        setAllUsers(users);
      } catch (err) {
        console.error("Error loading users:", err);
      }
    };
    fetchDirectory();
  }, [currentUser?.uid]);

  const toggleFriend = (uid) => {
    setSelectedFriends(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const filteredUsers = allUsers.filter(u => 
    (u.displayName || u.name || u.email || '').toLowerCase().includes(searchFriendTerm.toLowerCase())
  );

  const handleFileSelect = (e, fileType) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileType === 'video') {
      // 30MB max video size guard
      if (file.size > 30 * 1024 * 1024) {
        setUploadError("Video exceeds 30MB size limit. Please choose a shorter or smaller clip.");
        return;
      }
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
      setTab('video');
    } else {
      // 15MB max photo size
      if (file.size > 15 * 1024 * 1024) {
        setUploadError("Image exceeds 15MB size limit. Please select a smaller photo.");
        return;
      }
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
      setTab('image');
    }
  };

  // CLIENT-SIDE CLOUDINARY UPLOAD WITH PROGRESS TRACKING & CANCEL SUPPORT
  const uploadToCloudinary = (file, resourceType = 'auto') => {
    return new Promise((resolve, reject) => {
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dphkrk4sf'; 
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'Media Sending'; 

      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      const targetUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

      xhr.open('POST', targetUrl, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        activeXhrRef.current = null;
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.secure_url);
          } catch (e) {
            reject(new Error('Invalid response format from media server'));
          }
        } else {
          try {
            const errResponse = JSON.parse(xhr.responseText);
            reject(new Error(errResponse.error?.message || `Upload rejected (${xhr.status})`));
          } catch (e) {
            reject(new Error(`Media upload failed (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => {
        activeXhrRef.current = null;
        reject(new Error('Network error during media upload. Check your connection.'));
      };

      xhr.onabort = () => {
        activeXhrRef.current = null;
        reject(new Error('Upload canceled'));
      };

      xhr.send(formData);
    });
  };

  const handleCancelUpload = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadError("Upload was canceled.");
  };

  const handlePublish = async () => {
    setUploadError(null);
    if (tab === 'text' && !textContent.trim()) {
      setUploadError("Please type some text for your status!");
      return;
    }
    if ((tab === 'image' || tab === 'video') && !mediaFile) {
      setUploadError(`Please select a ${tab === 'video' ? 'video' : 'photo'} first!`);
      return;
    }
    if (audience === 'close_friends' && selectedFriends.length === 0) {
      setUploadError("Please select at least one close friend for this status.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      let finalContent = textContent.trim();
      let resourceType = tab === 'video' ? 'video' : 'image';

      if (tab === 'image' && mediaFile) {
        // Fast In-Browser HD WebP Compression
        const optimizedFile = await compressImageToHD(mediaFile, 1920, 0.85);
        finalContent = await uploadToCloudinary(optimizedFile, 'image');
      } else if (tab === 'video' && mediaFile) {
        finalContent = await uploadToCloudinary(mediaFile, 'video');
      }

      const effectiveName = 
        currentUser?.displayName || 
        currentUser?.name || 
        currentUser?.email?.split('@')[0] || 
        'Anonymous';

      const effectiveAvatar = userService.resolveAvatar(currentUser);

      const expiresAtDate = new Date(Date.now() + storyDuration * 60 * 60 * 1000);

      const statusPayload = {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: effectiveName,
        userAvatar: effectiveAvatar,
        userDisplayName: effectiveName,
        userPhoto: effectiveAvatar,
        type: tab, // 'text' | 'image' | 'video'
        content: finalContent,
        text: tab === 'text' ? textContent.trim() : caption.trim(),
        mediaUrl: (tab === 'image' || tab === 'video') ? finalContent : '',
        imageUrl: tab === 'image' ? finalContent : '',
        videoUrl: tab === 'video' ? finalContent : '',
        caption: (tab === 'image' || tab === 'video') ? caption.trim() : '',
        bgColor: tab === 'text' ? bgColor : '',
        textColor: tab === 'text' ? textColor : '#ffffff',
        audience: audience,
        allowedUsers: audience === 'close_friends' ? [...selectedFriends, currentUser.uid] : [],
        durationHours: storyDuration,
        viewers: [],
        viewerUids: [],
        viewCount: 0,
        reactions: {},
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate)
      };

      await addDoc(collection(db, "statuses"), statusPayload);
      onClose();
    } catch (err) {
      if (err.message !== 'Upload canceled') {
        console.error("STATUS PUBLISH FAILED:", err);
        setUploadError(err.message || "Failed to publish status.");
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-gray-950/95 backdrop-blur-3xl flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-150">
      {/* CLICK-AWAY CLOSE LAYER */}
      <div className="absolute inset-0 bg-black/60" onClick={uploading ? undefined : onClose} />

      {/* STATUS CREATION CARD */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header & Tabs */}
        <div className="p-4 pb-3 shrink-0 border-b border-gray-800 bg-gray-900/60">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400"></span>
              <h3 className="text-white font-black text-sm tracking-wide">Create Status Update</h3>
            </div>
            <button 
              onClick={uploading ? handleCancelUpload : onClose} 
              className="text-slate-400 hover:text-white cursor-pointer p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 3-Pill Switcher: TEXT, PHOTO, VIDEO */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800/60">
            <button
              type="button"
              onClick={() => { setTab('text'); setUploadError(null); }}
              className={`py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                tab === 'text'
                  ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>✍️</span> Text
            </button>
            <button
              type="button"
              onClick={() => { setTab('image'); setUploadError(null); }}
              className={`py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                tab === 'image'
                  ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>📷</span> Photo
            </button>
            <button
              type="button"
              onClick={() => { setTab('video'); setUploadError(null); }}
              className={`py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                tab === 'video'
                  ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🎥</span> Video
            </button>
          </div>
        </div>

        {/* Tab Content (Scrollable Content Body) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {tab === 'text' ? (
            <div>
              {/* Story Live Preview Box */}
              <div 
                className="w-full h-48 rounded-2xl flex items-center justify-center p-6 transition-all duration-300 shadow-inner relative overflow-hidden"
                style={{ background: bgColor }}
              >
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Type a status update..."
                  maxLength={300}
                  style={{ color: textColor }}
                  className="w-full bg-transparent font-extrabold text-center text-xl placeholder-white/60 outline-none resize-none drop-shadow z-10"
                  rows={3}
                  autoFocus
                />
              </div>

              {/* Theme Controls */}
              <div className="mt-4 space-y-3">
                {/* 1. TEXT COLOR PICKER ROW */}
                <div className="bg-gray-800/40 p-2.5 rounded-2xl border border-gray-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Text Color</span>
                  <div className="flex items-center gap-2">
                    {['#ffffff', '#000000', '#fef08a', '#6ee7b7', '#93c5fd', '#f472b6'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setTextColor(color)}
                        className={`w-6 h-6 rounded-full border transition-all ${
                          textColor === color ? 'ring-2 ring-teal-400 scale-110' : 'border-gray-700 opacity-80'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* 2. GRADIENT THEMES */}
                <div className="bg-gray-800/40 p-3.5 rounded-2xl border border-gray-800">
                  <label className="block text-xs font-bold uppercase tracking-wider text-white mb-2.5 text-left select-none">
                    Gradient Themes
                  </label>
                  <div className="flex items-center gap-3 overflow-x-auto py-2 px-1 no-scrollbar">
                    {PRESET_GRADIENTS.map((grad) => {
                      const isSelected = bgColor === grad.value;
                      return (
                        <button
                          key={grad.id}
                          type="button"
                          onClick={() => setBgColor(grad.value)}
                          title={grad.name}
                          className={`w-9 h-9 rounded-full flex-shrink-0 relative transition-all duration-200 flex items-center justify-center cursor-pointer ${
                            isSelected 
                              ? 'scale-105 ring-2 ring-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.5)]' 
                              : 'hover:scale-105 opacity-80 hover:opacity-100 border border-white/10'
                          }`}
                          style={{ background: grad.value }}
                        >
                          {isSelected && (
                            <svg className="w-4 h-4 text-white drop-shadow-md stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. SOLID COLORS & CUSTOM COLOR WHEEL */}
                <div className="bg-gray-800/40 p-3.5 rounded-2xl border border-gray-800">
                  <label className="block text-xs font-bold uppercase tracking-wider text-white mb-2.5 text-left select-none">
                    Solid Colors & Custom Wheel
                  </label>
                  <div className="flex items-center gap-3 overflow-x-auto py-2 px-1 no-scrollbar">
                    {PRESET_SOLIDS.map((color) => {
                      const isSelected = bgColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setBgColor(color)}
                          className={`w-9 h-9 rounded-full flex-shrink-0 relative transition-all duration-200 flex items-center justify-center cursor-pointer ${
                            isSelected 
                              ? 'scale-105 ring-2 ring-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.5)]' 
                              : 'hover:scale-105 opacity-80 hover:opacity-100 border border-white/10'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {isSelected && (
                            <svg className="w-4 h-4 text-white drop-shadow-md stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}

                    {/* Color Wheel / Custom Picker */}
                    <label 
                      title="Custom Background Color Wheel"
                      className={`w-9 h-9 rounded-full flex-shrink-0 cursor-pointer relative flex items-center justify-center p-[2px] bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 transition-all duration-200 ${
                        !PRESET_SOLIDS.includes(bgColor) && !PRESET_GRADIENTS.some(g => g.value === bgColor)
                          ? 'scale-105 ring-2 ring-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.5)]'
                          : 'hover:scale-105 opacity-90 hover:opacity-100'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                      </div>
                      <input
                        type="color"
                        value={bgColor.startsWith('#') ? bgColor : '#0f766e'}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mediaPreview ? (
                <div className="relative w-full h-48 bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-gray-800">
                  {tab === 'video' ? (
                    <video 
                      src={mediaPreview} 
                      controls 
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="w-full h-full object-contain" />
                  )}
                  
                  {/* REAL-TIME UPLOAD PROGRESS OVERLAY */}
                  {uploading && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 rounded-xl z-20">
                      <div className="w-full max-w-xs bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700 shadow-inner">
                        <div 
                          className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all duration-150 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between w-full max-w-xs mt-2.5 text-xs font-semibold select-none">
                        <span className="text-slate-300">Uploading {tab === 'video' ? 'video' : 'photo'}...</span>
                        <span className="text-teal-400 font-mono font-bold">{uploadProgress}%</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelUpload}
                        className="mt-4 px-3 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancel Upload
                      </button>
                    </div>
                  )}

                  {!uploading && (
                    <button 
                      onClick={() => { setMediaFile(null); setMediaPreview(''); }}
                      className="absolute top-2 right-2 bg-black/75 p-1.5 rounded-full text-white hover:bg-black cursor-pointer z-10 border border-white/20"
                      title="Remove file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ) : (
                <label className="w-full h-48 border-2 border-dashed border-gray-700 hover:border-teal-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors bg-gray-950/40 group">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    {tab === 'video' ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 font-bold">
                    Click to choose {tab === 'video' ? 'short video (max 30MB)' : 'photo (max 15MB)'}
                  </span>
                  <span className="text-[10px] text-gray-500 mt-0.5">
                    {tab === 'video' ? 'MP4, WebM, MOV supported' : 'JPEG, PNG, WebP supported'}
                  </span>
                  <input 
                    type="file" 
                    accept={tab === 'video' ? "video/mp4,video/webm,video/quicktime" : "image/*"} 
                    onChange={(e) => handleFileSelect(e, tab)} 
                    className="hidden" 
                  />
                </label>
              )}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Add a caption..."
                className="w-full bg-gray-800/90 border border-gray-700 text-white rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-teal-500"
              />
            </div>
          )}

          {/* UPLOAD ERROR NOTICE */}
          {uploadError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-2xl flex items-center justify-between text-xs text-rose-300 animate-in fade-in">
              <span>{uploadError}</span>
              <button 
                type="button" 
                onClick={() => setUploadError(null)} 
                className="text-rose-400 hover:text-white font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* AUDIENCE SELECTOR */}
          <div className="bg-gray-800/60 p-2.5 rounded-xl border border-gray-800 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Audience:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAudience('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${audience === 'all' ? 'bg-teal-500 text-gray-950 shadow' : 'text-gray-400 hover:text-white bg-gray-800'}`}
              >
                All Contacts
              </button>

              <button
                type="button"
                onClick={() => {
                  setAudience('close_friends');
                  setShowFriendPicker(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${audience === 'close_friends' ? 'bg-green-500 text-gray-950 shadow' : 'text-gray-400 hover:text-green-400 bg-gray-800'}`}
              >
                <span>★</span> Close Friends {selectedFriends.length > 0 && `(${selectedFriends.length})`}
              </button>
            </div>
          </div>

          {/* STORY DURATION SELECTOR */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/40 border border-slate-800/80 mb-3 select-none">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold text-slate-300">Active Duration:</span>
            </div>

            <div className="flex items-center gap-1.5">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = storyDuration === opt.hours;
                return (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setStoryDuration(opt.hours)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20 scale-105'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DYNAMIC POST BUTTON */}
          <button
            type="button"
            disabled={uploading || (tab === 'text' && !textContent.trim()) || ((tab === 'image' || tab === 'video') && !mediaFile)}
            onClick={handlePublish}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              uploading
                ? 'bg-teal-600/50 text-teal-200 cursor-not-allowed border border-teal-500/30'
                : 'bg-teal-500 hover:bg-teal-400 text-gray-950 shadow-lg shadow-teal-500/20 active:scale-[0.99] cursor-pointer'
            }`}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-teal-300" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                Posting Update... {uploadProgress > 0 && `(${uploadProgress}%)`}
              </>
            ) : (
              `Post ${tab === 'video' ? 'Video' : tab === 'image' ? 'Photo' : 'Text'} Status (${audience === 'close_friends' ? 'Close Friends' : 'All Contacts'})`
            )}
          </button>
        </div>

        {/* CLOSE FRIENDS PICKER MODAL */}
        {showFriendPicker && (
          <div className="absolute inset-0 bg-gray-950 z-50 flex flex-col p-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div>
                <h4 className="text-white font-bold text-sm flex items-center gap-1.5">
                  <span className="text-green-400">★</span> Select Close Friends
                </h4>
                <p className="text-[11px] text-gray-400">{selectedFriends.length} friends selected</p>
              </div>
              <button 
                onClick={() => setShowFriendPicker(false)}
                className="bg-green-500 text-gray-950 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-400 cursor-pointer"
              >
                Done
              </button>
            </div>

            <div className="mt-3 mb-2">
              <input
                type="text"
                value={searchFriendTerm}
                onChange={(e) => setSearchFriendTerm(e.target.value)}
                placeholder="Search friend..."
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredUsers.map(user => {
                const isSelected = selectedFriends.includes(user.uid);
                return (
                  <div 
                    key={user.uid}
                    onClick={() => toggleFriend(user.uid)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-green-500/10 border border-green-500/30' : 'hover:bg-gray-900 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={user.photoURL || '/default-avatar.png'} alt="dp" className="w-8 h-8 rounded-full object-cover border border-gray-700" />
                      <div>
                        <p className="text-xs font-bold text-white leading-tight">{user.displayName || 'User'}</p>
                        <p className="text-[10px] text-gray-400">{user.email}</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${isSelected ? 'bg-green-500 border-green-500 text-gray-950' : 'border-gray-600'}`}>
                      {isSelected && <svg className="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';

// Official GIPHY Public Client Key
const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';

const INSTAGRAM_CATEGORY_CHIPS = [
  { label: '🔥 Trending', query: '' },
  { label: '😂 LOL', query: 'lol funny laugh' },
  { label: '😍 Love', query: 'love heart kiss' },
  { label: '😭 Sad', query: 'sad cry crying' },
  { label: '🎉 Party', query: 'party celebrate dance' },
  { label: '👏 Clap', query: 'applause bravo clap' },
  { label: '✨ Anime', query: 'anime aesthetic' },
  { label: '💀 Meme', query: 'meme dank' },
  { label: '🐱 Cats', query: 'cat cute kitten' },
  { label: '👋 Bye', query: 'bye wave farewell' },
];

export default function GiphyPicker({ isOpen, onClose, onSelectMedia }) {
  const [activeTab, setActiveTab] = useState('gifs'); // 'gifs' | 'stickers'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChip, setSelectedChip] = useState('🔥 Trending');
  const [mediaList, setMediaList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Fetch from GIPHY API
  const fetchGiphyMedia = async (type, query = '') => {
    setIsLoading(true);
    try {
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/${type}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/${type}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (data && data.data) {
        const formatted = data.data.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.images?.fixed_height?.url || item.images?.downsized_medium?.url || item.images?.original?.url,
          previewUrl: item.images?.fixed_height_small?.url || item.images?.fixed_height?.url,
          width: item.images?.fixed_height?.width,
          height: item.images?.fixed_height?.height,
        }));
        setMediaList(formatted);
      }
    } catch (err) {
      console.error('GIPHY Fetch Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger search on tab/query change
  useEffect(() => {
    if (!isOpen) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchGiphyMedia(activeTab, searchQuery);
    }, 300);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [isOpen, activeTab, searchQuery]);

  if (!isOpen) return null;

  const handleChipClick = (chip) => {
    setSelectedChip(chip.label);
    setSearchQuery(chip.query);
  };

  return (
    <div className="absolute bottom-14 right-0 z-50 w-[320px] sm:w-[360px] max-w-[calc(100vw-2rem)] bg-gray-950/95 backdrop-blur-2xl border border-gray-800/90 rounded-3xl p-3.5 shadow-2xl shadow-black/90 animate-in fade-in zoom-in-95 duration-150 select-none">
      
      {/* HEADER: GIPHY BRANDING & TABS */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-800/80 mb-3">
        {/* Dual Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-gray-900/90 p-1 rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('gifs');
              setSearchQuery('');
              setSelectedChip('🔥 Trending');
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'gifs'
                ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-gray-950 shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            GIFs
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('stickers');
              setSearchQuery('');
              setSelectedChip('🔥 Trending');
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'stickers'
                ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-gray-950 shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Stickers
          </button>
        </div>

        {/* Powered by GIPHY Badge & Close */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-teal-400 uppercase">
            GIPHY
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* SEARCH INPUT */}
      <div className="relative mb-2.5">
        <input
          type="text"
          placeholder={`Search GIPHY ${activeTab === 'gifs' ? 'GIFs' : 'Stickers'}...`}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedChip('');
          }}
          className="w-full px-3.5 py-2 pl-9 bg-gray-900/90 border border-gray-800 rounded-2xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500 transition-colors"
        />
        <svg className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* INSTAGRAM-STYLE CATEGORY CHIPS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar scroll-smooth">
        {INSTAGRAM_CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleChipClick(chip)}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold shrink-0 transition-all ${
              selectedChip === chip.label
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm'
                : 'bg-gray-900/80 text-gray-400 hover:text-gray-200 border border-gray-800/80'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* MEDIA GRID (2 COLUMNS FOR GIFS, 3 FOR STICKERS) */}
      <div className="h-64 overflow-y-auto pr-1 select-none">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-teal-400 gap-2">
            <svg className="animate-spin w-7 h-7" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-[10px] text-gray-500 font-medium">Loading from GIPHY...</span>
          </div>
        ) : mediaList.length > 0 ? (
          <div className={activeTab === 'gifs' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
            {mediaList.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectMedia({ url: item.url, type: activeTab === 'gifs' ? 'gif' : 'sticker' })}
                className={`group relative rounded-xl overflow-hidden cursor-pointer transition-transform duration-150 active:scale-95 ${
                  activeTab === 'stickers'
                    ? 'aspect-square p-2 hover:bg-white/10 flex items-center justify-center'
                    : 'aspect-video bg-gray-900 hover:opacity-90'
                }`}
              >
                <img
                  src={item.previewUrl || item.url}
                  alt={item.title || 'giphy media'}
                  loading="lazy"
                  className={activeTab === 'stickers' ? 'max-w-full max-h-full object-contain' : 'w-full h-full object-cover'}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs py-8">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No {activeTab} found on GIPHY</span>
          </div>
        )}
      </div>

    </div>
  );
}

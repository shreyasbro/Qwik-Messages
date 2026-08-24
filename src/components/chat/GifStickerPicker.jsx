import React, { useState, useEffect } from 'react';

// Curated Custom Sticker Packs (Telegram/Discord style high-res stickers)
const STICKER_PACKS = {
  cats: {
    name: '🐱 Cute Cats',
    stickers: [
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z2eHk4b2ZwbTV3aXJ6b3BxeWdzZXR3YTNxbzJqNmJ4dTRiNGJieCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/MDJ9IbxxvDUQM/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z2eHk4b2ZwbTV3aXJ6b3BxeWdzZXR3YTNxbzJqNmJ4dTRiNGJieCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/mlvseq9yvZhba/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z2eHk4b2ZwbTV3aXJ6b3BxeWdzZXR3YTNxbzJqNmJ4dTRiNGJieCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/BzyTuYCmvSORqs1ABM/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z2eHk4b2ZwbTV3aXJ6b3BxeWdzZXR3YTNxbzJqNmJ4dTRiNGJieCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/3o6Zt481isNVuQI1l6/giphy.gif',
    ],
  },
  reactions: {
    name: '🔥 Reactions',
    stickers: [
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjYxZDF0NG91MWJidHRreHVlYmtvaDNsMHB2MXMxcWZzcmI5dW9xNCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/l0MYt5jPR6QX5pnqM/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjYxZDF0NG91MWJidHRreHVlYmtvaDNsMHB2MXMxcWZzcmI5dW9xNCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/3o7TKSjRrfIPjeiVyM/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjYxZDF0NG91MWJidHRreHVlYmtvaDNsMHB2MXMxcWZzcmI5dW9xNCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/26u4cqiYI30juCOGY/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjYxZDF0NG91MWJidHRreHVlYmtvaDNsMHB2MXMxcWZzcmI5dW9xNCZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/l3q2K5jinAlChoCLS/giphy.gif',
    ],
  },
  anime: {
    name: '✨ Anime Vibes',
    stickers: [
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnpheWV3aHg0aWFvbjhzNXk1MWY2M3hrcXB6czU0dzBhMW9mNWttaiZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/13CoXDiaCcCoyk/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnpheWV3aHg0aWFvbjhzNXk1MWY2M3hrcXB6czU0dzBhMW9mNWttaiZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/kEdI683LJtrGmTVVqh/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnpheWV3aHg0aWFvbjhzNXk1MWY2M3hrcXB6czU0dzBhMW9mNWttaiZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/xT0xeJpnrWC4XWblEk/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnpheWV3aHg0aWFvbjhzNXk1MWY2M3hrcXB6czU0dzBhMW9mNWttaiZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/5GoVLqeAOo6PK/giphy.gif',
    ],
  },
};

const SUGGESTED_GIF_TAGS = ['Trending', 'Laugh', 'Love', 'Happy', 'Sad', 'Dance', 'Clap', 'Gaming'];

export default function GifStickerPicker({ isOpen, onClose, onSelectMedia }) {
  const [activeTab, setActiveTab] = useState('gifs'); // 'gifs' | 'stickers'
  const [activeStickerPack, setActiveStickerPack] = useState('cats');
  const [gifSearchQuery, setGifSearchQuery] = useState('trending');
  const [gifResults, setGifResults] = useState([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);

  // Fetch GIFs using Tenor Public API endpoint
  const fetchGifs = async (query) => {
    setIsLoadingGifs(true);
    try {
      const endpoint = `https://g.tenor.com/v1/search?q=${encodeURIComponent(
        query || 'trending'
      )}&key=LIVDSRZULELA&limit=18`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.results) {
        setGifResults(data.results.map((r) => r.media[0]?.gif?.url || r.media[0]?.tinygif?.url).filter(Boolean));
      }
    } catch (err) {
      console.error('Failed to fetch GIFs:', err);
    } finally {
      setIsLoadingGifs(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'gifs') {
      fetchGifs(gifSearchQuery);
    }
  }, [isOpen, activeTab, gifSearchQuery]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-14 left-2 z-50 w-80 sm:w-96 bg-gray-950/95 backdrop-blur-xl border border-gray-800 rounded-3xl p-3.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none">
      
      {/* HEADER TABS */}
      <div className="flex items-center justify-between pb-2.5 border-b border-gray-800/80 mb-3">
        <div className="flex items-center gap-1.5 bg-gray-900/80 p-1 rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={() => setActiveTab('gifs')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'gifs'
                ? 'bg-teal-500 text-gray-950 shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            GIFs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'stickers'
                ? 'bg-teal-500 text-gray-950 shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Stickers
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* TAB 1: GIFS (SEARCH + SUGGESTION TAGS + GRID) */}
      {activeTab === 'gifs' && (
        <div className="space-y-2.5">
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search Tenor GIFs..."
              value={gifSearchQuery === 'trending' ? '' : gifSearchQuery}
              onChange={(e) => setGifSearchQuery(e.target.value || 'trending')}
              className="w-full px-3.5 py-2 pl-9 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500"
            />
            <svg className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Suggested Quick Tags */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {SUGGESTED_GIF_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setGifSearchQuery(tag)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
                  gifSearchQuery.toLowerCase() === tag.toLowerCase()
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* GIF Results Grid */}
          <div className="h-64 overflow-y-auto pr-1 grid grid-cols-2 gap-2">
            {isLoadingGifs ? (
              <div className="col-span-2 flex items-center justify-center h-48 text-teal-400">
                <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : (
              gifResults.map((gifUrl, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectMedia({ url: gifUrl, type: 'gif' })}
                  className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <img src={gifUrl} alt="gif" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STICKERS (PACK SELECTOR + GRID) */}
      {activeTab === 'stickers' && (
        <div className="space-y-3">
          {/* Pack Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {Object.entries(STICKER_PACKS).map(([key, pack]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveStickerPack(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  activeStickerPack === key
                    ? 'bg-teal-500 text-gray-950 shadow-md'
                    : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                {pack.name}
              </button>
            ))}
          </div>

          {/* Stickers Grid */}
          <div className="h-64 overflow-y-auto pr-1 grid grid-cols-3 gap-2">
            {STICKER_PACKS[activeStickerPack].stickers.map((stickerUrl, idx) => (
              <div
                key={idx}
                onClick={() => onSelectMedia({ url: stickerUrl, type: 'sticker' })}
                className="aspect-square p-1.5 flex items-center justify-center rounded-2xl hover:bg-white/10 cursor-pointer transition-all hover:scale-110 active:scale-95"
              >
                <img src={stickerUrl} alt="sticker" className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

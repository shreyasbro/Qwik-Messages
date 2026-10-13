import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function SpecificContactsModal({ isOpen, onClose, title, currentAllowed = [], onSave, currentUserUid }) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUids, setSelectedUids] = useState(new Set(currentAllowed));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedUids(new Set(currentAllowed));

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const usersList = [];
        snap.forEach((d) => {
          if (d.id !== currentUserUid) {
            const data = d.data();
            usersList.push({
              uid: d.id,
              displayName: data.displayName || data.name || data.username || 'User',
              email: data.email || '',
              photoURL: data.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${d.id}`,
            });
          }
        });
        setAllUsers(usersList);
      } catch (err) {
        console.warn('Failed to load users for specific privacy:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentAllowed, currentUserUid]);

  if (!isOpen) return null;

  const toggleUser = (uid) => {
    const next = new Set(selectedUids);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    setSelectedUids(next);
  };

  const handleSaveSelection = () => {
    onSave(Array.from(selectedUids));
    onClose();
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[700] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-800/80">
          <div>
            <h3 className="text-sm font-black text-white">{title}</h3>
            <p className="text-[10px] text-gray-400">Select contacts who can view this info</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-500 animate-pulse font-bold">Loading contacts...</div>
          ) : allUsers.length > 0 ? (
            allUsers.map((u) => {
              const isSelected = selectedUids.has(u.uid);
              return (
                <div
                  key={u.uid}
                  onClick={() => toggleUser(u.uid)}
                  className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-teal-950/40 border-teal-500/50 text-white'
                      : 'bg-gray-900/60 border-gray-800/80 text-gray-300 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-700 bg-gray-800 shrink-0" />
                    <div className="min-w-0 pr-2 text-left">
                      <h5 className="text-xs font-bold truncate">{u.displayName}</h5>
                      <span className="text-[10px] text-gray-500 truncate block">{u.email}</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                    isSelected ? 'bg-teal-500 border-teal-400 text-gray-950 font-black' : 'border-gray-700 bg-gray-900'
                  }`}>
                    {isSelected && '✓'}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-gray-500">No other users found.</div>
          )}
        </div>

        <div className="flex gap-2.5 pt-2 border-t border-gray-800/80">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSelection}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
          >
            Save ({selectedUids.size})
          </button>
        </div>
      </div>
    </div>
  );
}

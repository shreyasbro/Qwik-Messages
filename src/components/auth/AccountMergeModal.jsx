import React, { useState } from "react";
import { doc, writeBatch, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

export default function AccountMergeModal() {
  const { currentUser, duplicateAccountConfig, setDuplicateAccountConfig } = useAuth();
  const [isMerging, setIsMerging] = useState(false);

  if (!duplicateAccountConfig || !currentUser) return null;

  const executeMerge = async () => {
    setIsMerging(true);
    try {
      const batch = writeBatch(db);

      // 1. Re-assign all chats where the old duplicate UID was a participant
      const chatsRef = collection(db, "chats");
      const chatsQuery = query(chatsRef, where("participants", "array-contains", duplicateAccountConfig.id));
      const chatsSnapshot = await getDocs(chatsQuery);

      chatsSnapshot.forEach((chatSnap) => {
        const chatData = chatSnap.data();
        if (chatData.participants?.includes(duplicateAccountConfig.id)) {
          const updatedParticipants = chatData.participants.map(id => 
            id === duplicateAccountConfig.id ? currentUser.uid : id
          );
          batch.update(chatSnap.ref, { participants: updatedParticipants });
        }
      });

      // 2. Delete the old duplicate user document
      const oldUserRef = doc(db, "users", duplicateAccountConfig.id);
      batch.delete(oldUserRef);

      await batch.commit();
      console.log("✅ Successfully merged user accounts!");
      
      // Close modal and force a page refresh to reload the newly assigned chats cleanly
      setDuplicateAccountConfig(null);
      window.location.reload(); 

    } catch (error) {
      console.error("❌ Error merging accounts:", error);
    } finally {
      setIsMerging(false);
    }
  };

  const declineMerge = async () => {
    try {
      setDuplicateAccountConfig(null);
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, { mergeDeclined: true });
    } catch (error) {
      console.error("❌ Failed to save decline preference:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#030712]/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/60 p-7 rounded-3xl max-w-sm w-full shadow-2xl text-center flex flex-col gap-5">
        <div className="w-14 h-14 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        
        <div>
          <h2 className="text-white text-xl font-black tracking-wide mb-2">Duplicate Found</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            We found an older account linked to <span className="text-teal-400 font-bold">{currentUser.email}</span>. Merge your old chats and contacts into this active session?
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <button 
            onClick={executeMerge} 
            disabled={isMerging}
            className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-black uppercase tracking-widest text-sm py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(45,212,191,0.2)] disabled:opacity-50 cursor-pointer"
          >
            {isMerging ? "Merging Data..." : "Yes, Merge Accounts"}
          </button>
          
          <button 
            onClick={declineMerge}
            disabled={isMerging}
            className="w-full bg-transparent border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            No, Keep Separate
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function CreatePollModal({ isOpen, onClose, activeChatId, currentUser }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
    if (options.length < 8) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const validOptions = options.map((opt) => opt.trim()).filter((opt) => opt.length > 0);

    if (!question.trim() || validOptions.length < 2 || isSubmitting || !activeChatId) return;

    try {
      setIsSubmitting(true);

      const formattedOptions = validOptions.map((text, idx) => ({
        id: `opt_${Date.now()}_${idx}`,
        text: text,
        voters: [], // Stores user UIDs who voted for this option
      }));

      await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        type: 'poll',
        poll: {
          question: question.trim(),
          options: formattedOptions,
          allowMultiple: allowMultiple,
          totalVotes: 0,
        },
        createdAt: serverTimestamp(),
      });

      setIsSubmitting(false);
      onClose();
    } catch (err) {
      console.error('Error creating poll:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800/80 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">Create New Poll</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleCreatePoll} className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {/* Question Input */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              Poll Question
            </label>
            <input
              type="text"
              required
              placeholder="Ask a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={120}
              className="w-full px-3.5 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:border-teal-500 outline-none"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              Options (2 to 8)
            </label>
            <div className="space-y-2">
              {options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    required={idx < 2}
                    placeholder={`Option ${idx + 1}`}
                    value={option}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    maxLength={60}
                    className="flex-1 px-3.5 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:border-teal-500 outline-none"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 8 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 text-xs font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1.5 py-1 cursor-pointer"
              >
                <span>+</span> Add another option
              </button>
            )}
          </div>

          {/* Toggle Multiple Answers */}
          <div className="flex items-center justify-between p-3 bg-gray-900/60 rounded-2xl border border-gray-800">
            <div>
              <div className="text-xs font-bold text-white">Multiple Answers</div>
              <div className="text-[11px] text-gray-400">Allow voters to select more than one option</div>
            </div>
            <button
              type="button"
              onClick={() => setAllowMultiple(!allowMultiple)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                allowMultiple ? 'bg-teal-500' : 'bg-gray-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  allowMultiple ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !question.trim() || options.filter((o) => o.trim()).length < 2}
            className="w-full py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold text-sm transition-all shadow-lg active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Creating Poll...' : 'Send Poll to Chat'}
          </button>
        </form>
      </div>
    </div>
  );
}

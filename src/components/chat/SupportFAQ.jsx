import React, { useState } from 'react';

export default function SupportFAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    {
      question: "How do I make a Video or Voice Call?",
      answer: "Open a chat with your friend and click on the Phone or Video icon located at the top right of the chat header."
    },
    {
      question: "Can I cancel a media upload?",
      answer: "Yes! While uploading a large file, you will see an 'X' button next to the progress bar. Click it to cancel the upload immediately."
    },
    {
      question: "Are my calls secure?",
      answer: "Absolutely. We use enterprise-grade WebRTC infrastructure (8x8/Jitsi) to ensure your voice and video calls are highly secure and private."
    },
    {
      question: "How can I install this as an App?",
      answer: "You can use the 'Add to Home Screen' option in your browser, or download our native APK file once it is published."
    }
  ];

  const handleContactSupport = (e) => {
    e.preventDefault();
    
    const recipient = "qwik.messages.official@gmail.com";
    const subject = encodeURIComponent("Support Request - Qwik Messages App");
    const body = encodeURIComponent("Hi Qwik Messages Team,\n\nI need help with:\n");

    // Simple Mobile Device Detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // 📱 Mobile: Open native mail client (Gmail app)
      window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    } else {
      // 💻 PC: Open Gmail Web Compose directly in a new browser tab
      const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
      window.open(gmailWebUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex flex-col w-full text-white bg-slate-950 p-4 box-border">
      
      {/* FAQ Accordion */}
      <div className="space-y-3 mb-6">
        {faqs.map((faq, index) => (
          <div key={index} className="border-b border-slate-800/80 pb-2">
            <button 
              type="button"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex justify-between items-center py-2 text-left focus:outline-none cursor-pointer"
            >
              <span className="font-semibold text-xs text-slate-200">{faq.question}</span>
              <span className="text-slate-500 text-sm font-black">
                {openIndex === index ? '−' : '+'}
              </span>
            </button>
            
            {/* Smooth Dropdown Content */}
            <div 
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                openIndex === index ? 'max-h-24 opacity-100 mt-1' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="text-slate-400 text-[11px] leading-relaxed">{faq.answer}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Contact Support Button */}
      <div className="pt-4 border-t border-slate-850">
        <h3 className="text-xs text-slate-400 mb-3 font-semibold">Still need help?</h3>
        <button 
          onClick={handleContactSupport}
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Contact Support
        </button>
      </div>
    </div>
  );
}

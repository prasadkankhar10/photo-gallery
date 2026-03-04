import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import ReviewQueue from './components/ReviewQueue';
import PhotoGallery from './components/PhotoGallery';

export default function App() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="min-h-screen container mx-auto px-4 py-8">
      <header className="mb-12 flex flex-col md:flex-row gap-4 justify-between items-center sketch-card p-6">
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-bold tracking-tight text-ink font-sketch uppercase">
            Nexus Storage
          </h1>
          <p className="text-sm text-pencil mt-1 font-mono">Local-First AI Photo Management</p>
        </div>
        <nav className="flex space-x-4">
          <button 
            onClick={() => setActiveTab('gallery')}
            className={`sketch-button px-6 py-2 text-lg font-bold ${activeTab === 'gallery' ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''}`}
          >
            Gallery
          </button>
          {!window.location.hostname.includes('github.io') && (
              <button 
                onClick={() => setActiveTab('upload')}
                className={`sketch-button px-6 py-2 text-lg font-bold ${activeTab === 'upload' ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''}`}
              >
                Bulk Review Queue
              </button>
          )}
        </nav>
      </header>

      <main>
        {activeTab === 'upload' ? <ReviewQueue addToast={addToast} /> : <PhotoGallery addToast={addToast} />}
      </main>

      {/* Global Toast Container */}
      <div className="fixed bottom-6 right-6 z-[200] space-y-3 flex flex-col items-end pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`animate-slide-up pointer-events-auto flex items-center gap-3 px-4 py-3 sketch-card min-w-[280px] max-w-[400px] ${
              t.type === 'error' ? 'border-errorInk text-errorInk bg-[#fff0f2]' :
              t.type === 'success' ? 'border-successInk text-successInk bg-[#f0fdf4]' :
              'border-primary text-primary bg-[#eff6ff]'
            }`}
          >
             {t.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> :
              t.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> :
              <Info className="w-5 h-5 flex-shrink-0" />}
             
             <span className="text-xl font-bold flex-1">{t.message}</span>
             
             <button onClick={() => removeToast(t.id)} className="p-1 hover:bg-black/10 rounded transition-colors ml-2 opacity-70 hover:opacity-100 flex-shrink-0">
                <X className="w-5 h-5" />
             </button>
          </div>
        ))}
      </div>
    </div>
  );
}

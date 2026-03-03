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
      <header className="mb-12 flex justify-between items-center bg-white/5 p-4 rounded-xl backdrop-blur-sm border border-white/10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
            Nexus Storage
          </h1>
          <p className="text-sm text-gray-400 mt-1">Local-First AI Photo Management</p>
        </div>
        <nav className="flex space-x-2">
          <button 
            onClick={() => setActiveTab('gallery')}
            className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'gallery' ? 'bg-primary/20 text-blue-300 border border-primary/50' : 'hover:bg-white/10 text-gray-400'}`}
          >
            Gallery
          </button>
          {!window.location.hostname.includes('github.io') && (
              <button 
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'upload' ? 'bg-primary/20 text-blue-300 border border-primary/50' : 'hover:bg-white/10 text-gray-400'}`}
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
            className={`animate-slide-up pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.5)] border backdrop-blur-md min-w-[280px] max-w-[400px] ${
              t.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' :
              t.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-200' :
              'bg-blue-500/10 border-blue-500/30 text-blue-200'
            }`}
          >
             {t.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-400" /> :
              t.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" /> :
              <Info className="w-5 h-5 text-blue-400" />}
             
             <span className="text-sm font-medium flex-1">{t.message}</span>
             
             <button onClick={() => removeToast(t.id)} className="p-1 hover:bg-white/10 rounded-lg transition-colors ml-2 opacity-70 hover:opacity-100">
                <X className="w-4 h-4" />
             </button>
          </div>
        ))}
      </div>
    </div>
  );
}

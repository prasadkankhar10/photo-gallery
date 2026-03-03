import React, { useState } from 'react';
import ReviewQueue from './components/ReviewQueue';
import PhotoGallery from './components/PhotoGallery';

export default function App() {
  const [activeTab, setActiveTab] = useState('gallery');

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
        {activeTab === 'upload' ? <ReviewQueue /> : <PhotoGallery />}
      </main>
    </div>
  );
}

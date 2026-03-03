import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, ExternalLink, Download, Loader2, Trash2, Brain, X, Upload } from 'lucide-react';

export default function PhotoGallery() {
  const [photos, setPhotos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [semanticMode, setSemanticMode] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Only auto-fetch if not in semantic mode
    if (!semanticMode) {
      fetchPhotos();
    }
  }, [searchTerm, semanticMode]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const url = searchTerm ? `/api/photos?q=${encodeURIComponent(searchTerm)}` : '/api/photos';
      const res = await fetch(url);
      const data = await res.json();
      setPhotos(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSemanticSearch = async (e) => {
    if (e) e.preventDefault();
    if (!semanticMode) return;
    
    setLoading(true);
    try {
        let endpoint, body, headers = {};
        
        if (imageFile) {
            endpoint = '/api/search/semantic_image';
            const formData = new FormData();
            formData.append('file', imageFile);
            body = formData;
        } else if (searchTerm) {
            endpoint = '/api/search/semantic_text';
            body = JSON.stringify({ query: searchTerm });
            headers = { 'Content-Type': 'application/json' };
        } else {
            setLoading(false);
            return;
        }
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body
        });
        
        const data = await res.json();
        
        if (data.error) {
           alert(data.error);
        } else if (data.success) {
           setPhotos(data.photos || []);
        }
    } catch (e) {
        console.error("Semantic search error", e);
        alert("Semantic search failed. Ensure AI daemon and Flask API are running.");
    }
    setLoading(false);
  };

  const clearImageSearch = () => {
      setImageFile(null);
      setImagePreview('');
      if (!searchTerm) {
          setSemanticMode(false);
      }
  };

  const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
          setImageFile(file);
          setImagePreview(URL.createObjectURL(file));
          setSemanticMode(true);
          setSearchTerm(''); // Clear text when using image
      }
  };

  const handleFetchHighRes = async (fileId) => {
    try {
       const res = await fetch(`/api/photo_url/${fileId}`);
       const data = await res.json();
       if (data.url) {
           window.open(data.url, '_blank');
       } else {
           alert("Could not fetch high-res URL");
       }
    } catch (e) {
       console.error(e);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Are you sure you want to delete this photo from the gallery?")) return;
    
    try {
      const res = await fetch(`/api/delete_photo/${photoId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setPhotos(photos.filter(p => p.id !== photoId));
      } else {
        alert("Failed to delete photo");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting photo");
    }
  };

  return (
    <div className="flex flex-col space-y-6">
      <div className="w-full max-w-2xl mx-auto mb-8 space-y-4">
          <form onSubmit={handleSemanticSearch} className="relative flex items-center gap-2">
            <div className={`relative flex-1 flex items-center transition-all rounded-2xl border ${semanticMode ? 'border-purple-500/50 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'border-white/10 bg-surface shadow-[0_4px_30px_rgba(0,0,0,0.1)]'} backdrop-blur-md`}>
                
                {semanticMode ? (
                   <Brain className="absolute left-4 w-5 h-5 text-purple-400 animate-pulse" />
                ) : (
                   <Search className="absolute left-4 w-5 h-5 text-gray-400" />
                )}
                
                {imagePreview ? (
                    <div className="flex items-center flex-1 py-2 pl-12 pr-4">
                        <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                            <img src={imagePreview} alt="Search Query" className="w-8 h-8 rounded object-cover" />
                            <span className="text-sm text-gray-300 truncate max-w-[150px]">{imageFile.name}</span>
                            <button type="button" onClick={clearImageSearch} className="t ext-gray-400 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <span className="ml-3 text-sm text-gray-500 italic">Finding visually similar photos...</span>
                    </div>
                ) : (
                    <input 
                      type="text" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={semanticMode ? "e.g. 'A sunny day at the beach', 'Dog running in snow'" : "Search exact tags or names (e.g. 'sunset', 'Prasad')"} 
                      className="w-full bg-transparent py-4 pl-12 pr-4 text-lg outline-none text-white placeholder:text-gray-500"
                    />
                )}
                
                <div className="absolute right-2 flex items-center gap-2">
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                        title="Reverse Image Search"
                    >
                        <ImageIcon className="w-5 h-5" />
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="image/*" 
                        className="hidden" 
                    />
                </div>
            </div>
            
            <button 
                type="button" 
                onClick={() => {
                    setSemanticMode(!semanticMode);
                    if (!semanticMode && searchTerm) {
                        // Triggers semantic search on the existing query if switching mode
                        setTimeout(() => handleSemanticSearch(new Event('submit')), 0);
                    }
                }}
                className={`flex items-center gap-2 px-4 py-4 rounded-2xl font-medium transition-all ${semanticMode ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'bg-gray-800 text-gray-400 border border-white/10 hover:bg-gray-700'}`}
                title="Toggle Semantic AI Search"
            >
                <Brain className="w-5 h-5" />
                AI Search
            </button>

            {semanticMode && (
                <button 
                    type="submit" 
                    className="px-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-medium transition-colors shadow-lg"
                >
                    Search
                </button>
            )}
          </form>
          
          {semanticMode && !imagePreview && (
              <p className="text-xs text-center text-purple-400/70">
                  Semantic Search uses CLIP. You can search using natural sentences instead of exact tags.
              </p>
          )}
      </div>

      {(loading && !searchTerm && !semanticMode) ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-xl">No photos found</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
          {photos.map(photo => (
            <div key={photo.id} className="break-inside-avoid glass-panel rounded-2xl overflow-hidden group">
              <div className="relative">
                <img 
                  src={`/${photo.local_cache_path}`} 
                  alt="Gallery Item" 
                  className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleFetchHighRes(photo.telegram_file_id)}
                      className="p-2 bg-white/20 hover:bg-primary/80 rounded-lg backdrop-blur-md transition-colors"
                      title="View High-Res"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                    <a 
                      href={photo.telegram_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 bg-white/20 hover:bg-primary/80 rounded-lg backdrop-blur-md transition-colors"
                      title="Open in Telegram"
                    >
                      <ExternalLink className="w-4 h-4 text-white" />
                    </a>
                    <button 
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-2 bg-white/20 hover:bg-red-500/80 rounded-lg backdrop-blur-md transition-colors ml-auto"
                      title="Delete Photo"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-1 mb-3">
                  {photo.tags.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-white/5 border border-white/10 rounded-md text-gray-300">
                      #{t}
                    </span>
                  ))}
                </div>
                {photo.people.length > 0 && (
                  <div className="text-sm font-medium text-cyan-300">
                     {photo.people.join(', ')}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(photo.upload_timestamp).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, ExternalLink, Download, Loader2, Trash2, Brain, X, Upload, Maximize } from 'lucide-react';

export default function PhotoGallery() {
  const [photos, setPhotos] = useState([]);
  const [fullscreenImage, setFullscreenImage] = useState(null);
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
  
  const isCloudHost = window.location.hostname.includes('github.io');
  const workerUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      if (isCloudHost) {
          // CLOUD MODE (Github Pages)
          const res = await fetch('./catalog.json');
          if (!res.ok) throw new Error("Catalog not found");
          const allData = await res.json();
          
          if (searchTerm) {
              const query = searchTerm.toLowerCase();
              const filtered = allData.filter(row => {
                 return row.people.some(p => p.toLowerCase().includes(query)) || row.tags.some(t => t.toLowerCase().includes(query));
              });
              setPhotos(filtered);
          } else {
              setPhotos(allData);
          }
      } else {
          // LOCAL MODE (Node Backend)
          const url = searchTerm ? `/api/photos?q=${encodeURIComponent(searchTerm)}` : '/api/photos';
          const res = await fetch(url);
          const data = await res.json();
          setPhotos(data);
      }
    } catch (e) {
      console.error(e);
      setPhotos([]);
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

  const handleDownload = async (photo) => {
      try {
          let urlToFetch = '';
          if (isCloudHost && workerUrl && photo.telegram_file_id) {
              urlToFetch = `${workerUrl}?file_id=${photo.telegram_file_id}`;
          } else if (!isCloudHost) {
               const res = await fetch(`/api/photo_url/${photo.telegram_file_id}`);
               const data = await res.json();
               urlToFetch = data.url;
          } else {
              if (photo.telegram_embed_url) {
                   window.open(photo.telegram_embed_url.replace('?embed=1', ''), '_blank');
              }
              return;
          }

          if (urlToFetch) {
              const response = await fetch(urlToFetch);
              const blob = await response.blob();
              const blobUrl = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = `photo_${photo.id}.jpg`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(blobUrl);
          }
      } catch (e) {
          console.error(e);
          alert("Error downloading photo. Please try again or open in Telegram.");
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
            
            {/* Disable Semantic Search in Cloud Mode */
             !isCloudHost && (
                <button 
                    type="button" 
                    onClick={() => {
                        setSemanticMode(!semanticMode);
                        if (!semanticMode && searchTerm) {
                            setTimeout(() => handleSemanticSearch(new Event('submit')), 0);
                        }
                    }}
                    className={`flex items-center gap-2 px-4 py-4 rounded-2xl font-medium transition-all ${semanticMode ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'bg-gray-800 text-gray-400 border border-white/10 hover:bg-gray-700'}`}
                    title="Toggle Semantic AI Search"
                >
                    <Brain className="w-5 h-5" />
                    AI Search
                </button>
             )}

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
                {workerUrl && photo.telegram_file_id ? (
                    // Cloud/Proxy Mode: Secure image stream via Cloudflare 
                    <img 
                      src={`${workerUrl}?file_id=${photo.telegram_file_id}`} 
                      alt="Gallery Item" 
                      className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                ) : isCloudHost && photo.telegram_embed_url ? (
                    // Cloud Mode (Fallback): Simple link to Telegram WebView
                    // Due to strict CORS, if a custom proxy isn't configured, we fallback to a simple click-to-view UI.
                    <div className="w-full h-48 bg-gray-800 flex items-center justify-center p-4 py-8 text-center border border-white/5">
                       <a href={photo.telegram_embed_url.replace('?embed=1', '')} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center text-blue-400 hover:text-blue-300 transition-colors">
                          <ImageIcon className="w-8 h-8 mb-2 opacity-60" />
                          <span className="text-sm font-medium">View Full Photo on Telegram</span>
                       </a>
                    </div>
                ) : (
                    // Local Mode: Serve directly from node uploads/tests folders
                    <img 
                      src={`/${photo.local_cache_path}`} 
                      alt="Gallery Item" 
                      className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                  <div className="flex gap-2">
                    {(!isCloudHost || workerUrl) && (
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFullscreenImage(isCloudHost ? `${workerUrl}?file_id=${photo.telegram_file_id}` : `/${photo.local_cache_path}`); }}
                        className="p-2 bg-white/20 hover:bg-primary/80 rounded-lg backdrop-blur-md transition-colors"
                        title="Fullscreen"
                      >
                        <Maximize className="w-4 h-4 text-white" />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(photo); }}
                      className="p-2 bg-white/20 hover:bg-primary/80 rounded-lg backdrop-blur-md transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                    <a 
                      href={photo.telegram_link || (photo.telegram_embed_url ? photo.telegram_embed_url.replace('?embed=1', '') : '#')} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 bg-white/20 hover:bg-primary/80 rounded-lg backdrop-blur-md transition-colors"
                      title="Open in Telegram"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4 text-white" />
                    </a>
                    {!isCloudHost && (
                        <button 
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="p-2 bg-white/20 hover:bg-red-500/80 rounded-lg backdrop-blur-md transition-colors ml-auto"
                          title="Delete Photo"
                        >
                          <Trash2 className="w-4 h-4 text-white" />
                        </button>
                    )}
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

      {/* Fullscreen Modal Overlay */}
      {fullscreenImage && (
        <div 
           className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md cursor-zoom-out" 
           onClick={() => setFullscreenImage(null)}
        >
            <button 
                className="absolute top-6 right-6 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-[110]"
                onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
            >
                <X className="w-6 h-6" />
            </button>
            <img 
                src={fullscreenImage} 
                alt="Fullscreen view" 
                className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl rounded-sm"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
      )}
    </div>
  );
}

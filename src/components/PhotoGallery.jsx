import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, ExternalLink, Download, Loader2, Trash2, Brain, X, Upload, Maximize } from 'lucide-react';

export default function PhotoGallery({ addToast }) {
  const [photos, setPhotos] = useState([]);
  const [allPhotos, setAllPhotos] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
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
          if (!searchTerm) {
              setAllPhotos(data);
              extractPopularTags(data);
          }
      }
    } catch (e) {
      console.error(e);
      setPhotos([]);
    }
    setLoading(false);
  };

  const extractPopularTags = (dataList) => {
      const counts = {};
      dataList.forEach(p => {
          p.people.forEach(person => counts[person] = (counts[person] || 0) + 1);
          p.tags.forEach(tag => counts[tag] = (counts[tag] || 0) + 1);
      });
      const topTags = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(entry => entry[0]);
      setPopularTags(topTags);
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
           if (addToast) addToast(data.error, 'error');
           else alert(data.error);
        } else if (data.success) {
           setPhotos(data.photos || []);
        }
    } catch (e) {
        console.error("Semantic search error", e);
        if (addToast) addToast("Semantic search failed. Ensure AI daemon is running.", 'error');
        else alert("Semantic search failed. Ensure AI daemon and Flask API are running.");
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
          if (addToast) addToast("Error downloading photo.", 'error');
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
        if (addToast) addToast("Photo deleted successfully", 'success');
      } else {
        if (addToast) addToast("Failed to delete photo", 'error');
      }
    } catch (e) {
      console.error(e);
      if (addToast) addToast("Error deleting photo", 'error');
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

          {popularTags.length > 0 && !semanticMode && (
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                  {popularTags.map(tag => (
                      <button
                         key={tag}
                         onClick={(e) => { e.preventDefault(); setSearchTerm(searchTerm === tag ? '' : tag); }}
                         className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                             searchTerm === tag 
                             ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.6)]' 
                             : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
                         }`}
                      >
                         #{tag}
                      </button>
                  ))}
              </div>
          )}
      </div>

      {(loading && !searchTerm && !semanticMode) ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="break-inside-avoid glass-panel rounded-2xl overflow-hidden animate-pulse">
               <div className="w-full h-64 bg-white/5"></div>
               <div className="p-4 space-y-3">
                   <div className="h-4 bg-white/10 rounded w-1/3"></div>
                   <div className="h-4 bg-white/5 rounded w-1/2"></div>
               </div>
            </div>
          ))}
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
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedPhoto(photo); }}
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

      {/* Premium Split-Pane Modal Overlay */}
      {selectedPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 md:p-8" onClick={() => setSelectedPhoto(null)}>
              <button 
                  className="absolute top-6 right-6 p-3 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-[110]" 
                  onClick={(e) => { e.stopPropagation(); setSelectedPhoto(null); }}
              >
                  <X className="w-6 h-6" />
              </button>

              <div 
                  className="flex flex-col md:flex-row w-full max-w-7xl h-full max-h-[90vh] bg-[#0a0a0f]/80 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-slide-up" 
                  onClick={e => e.stopPropagation()}
              >
                  {/* Left: Huge Image */}
                  <div className="relative flex-1 bg-black/50 flex items-center justify-center p-4">
                      <img 
                          src={isCloudHost && workerUrl && selectedPhoto.telegram_file_id ? `${workerUrl}?file_id=${selectedPhoto.telegram_file_id}` : `/${selectedPhoto.local_cache_path}`} 
                          className="max-w-full max-h-full object-contain rounded-lg drop-shadow-2xl"
                          alt="Selected fullscreen"
                      />
                  </div>

                  {/* Right: Sidebar Metadata */}
                  <div className="w-full md:w-[400px] md:min-w-[400px] bg-white/5 border-l border-white/10 p-8 flex flex-col overflow-y-auto custom-scrollbar">
                      <h3 className="text-2xl font-bold w-full text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mb-8">Metadata</h3>
                      
                      <div className="space-y-8 flex-1">
                          {selectedPhoto.people && selectedPhoto.people.length > 0 && (
                              <div>
                                  <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-widest flex items-center">
                                      <UserIcon className="w-4 h-4 mr-2" /> Detected People
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                     {selectedPhoto.people.map(p => <span key={p} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium border border-blue-500/30">@{p}</span> )}
                                  </div>
                              </div>
                          )}

                          {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                              <div>
                                  <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-widest flex items-center">
                                      <Brain className="w-4 h-4 mr-2" /> Generated AI Tags
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                     {selectedPhoto.tags.map(t => <span key={t} className="px-3 py-1 text-gray-300 bg-white/5 hover:bg-white/10 transition-colors rounded-md text-sm border border-white/10 cursor-pointer" onClick={() => { setSearchTerm(t); setSelectedPhoto(null); }}>#{t}</span> )}
                                  </div>
                              </div>
                          )}

                          <div>
                              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-widest">Date Uploaded</h4>
                              <p className="text-gray-300 text-sm font-medium">{new Date(selectedPhoto.upload_timestamp).toLocaleString()}</p>
                          </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 gap-3">
                          <button onClick={() => handleDownload(selectedPhoto)} className="flex items-center justify-center py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium shadow-lg">
                              <Download className="w-5 h-5 mr-2" /> Save
                          </button>
                          <a href={selectedPhoto.telegram_link || (selectedPhoto.telegram_embed_url ? selectedPhoto.telegram_embed_url.replace('?embed=1', '') : '#')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-xl transition-colors border border-blue-500/30 font-medium shadow-lg">
                              <ExternalLink className="w-5 h-5 mr-2" /> Open Link
                          </a>
                      </div>
                      
                      {!isCloudHost && (
                          <button 
                             onClick={() => { handleDeletePhoto(selectedPhoto.id); setSelectedPhoto(null); }} 
                             className="mt-3 flex items-center justify-center py-3 w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors border border-red-500/20 font-medium"
                          >
                              <Trash2 className="w-5 h-5 mr-2" /> Delete Permanently
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

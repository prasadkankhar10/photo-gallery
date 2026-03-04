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
    <div className="flex flex-col space-y-8">
      <div className="w-full max-w-2xl mx-auto mb-8 space-y-6">
          <form onSubmit={handleSemanticSearch} className="relative flex items-center gap-2">
            <div className={`relative flex-1 flex items-center sketch-card ${semanticMode ? 'border-primary ring-2 ring-primary/20 bg-[#eff6ff]' : 'bg-white'}`}>
                
                {semanticMode ? (
                   <Brain className="absolute left-4 w-6 h-6 text-primary animate-pulse" />
                ) : (
                   <Search className="absolute left-4 w-6 h-6 text-pencil" />
                )}
                
                {imagePreview ? (
                    <div className="flex items-center flex-1 py-2 pl-12 pr-4">
                        <div className="flex items-center gap-3 bg-paper px-3 py-1.5 sketch-border">
                            <img src={imagePreview} alt="Search Query" className="w-10 h-10 object-cover" />
                            <span className="text-lg text-ink font-bold truncate max-w-[150px]">{imageFile.name}</span>
                            <button type="button" onClick={clearImageSearch} className="text-pencil hover:text-errorInk transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <span className="ml-3 text-sm text-pencil italic font-mono hidden sm:inline">Finding similar photos...</span>
                    </div>
                ) : (
                    <input 
                      type="text" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={semanticMode ? "e.g. 'A sunny day at the beach', 'Dog running in snow'" : "Search exact tags or names (e.g. 'sunset', 'Prasad')"} 
                      className="w-full bg-transparent py-4 pl-14 pr-4 text-2xl outline-none text-ink placeholder:text-pencil/50 font-sketch"
                    />
                )}
                
                <div className="absolute right-3 flex items-center gap-2">
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-pencil hover:text-ink sketch-border bg-paper shadow-sm active:translate-y-1 active:shadow-none"
                        title="Reverse Image Search"
                    >
                        <ImageIcon className="w-6 h-6" />
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
            
            {/* Disable Semantic Search in Cloud Mode */}
             {!isCloudHost && (
                <button 
                    type="button" 
                    onClick={() => {
                        setSemanticMode(!semanticMode);
                        if (!semanticMode && searchTerm) {
                            setTimeout(() => handleSemanticSearch(new Event('submit')), 0);
                        }
                    }}
                    className={`sketch-button flex items-center gap-2 px-6 py-4 text-xl font-bold ${semanticMode ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''}`}
                    title="Toggle Semantic AI Search"
                >
                    <Brain className="w-6 h-6" />
                    AI
                </button>
             )}

            {semanticMode && (
                <button 
                    type="submit" 
                    className="sketch-button bg-primary text-white px-8 py-4 text-xl font-bold hover:bg-blue-600"
                >
                    Search
                </button>
            )}
          </form>
          
          {semanticMode && !imagePreview && (
              <p className="text-sm text-center text-primary font-bold">
                  Semantic Search uses CLIP. You can search using natural sentences instead of exact tags.
              </p>
          )}

          {popularTags.length > 0 && !semanticMode && (
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                  {popularTags.map(tag => (
                      <button
                         key={tag}
                         onClick={(e) => { e.preventDefault(); setSearchTerm(searchTerm === tag ? '' : tag); }}
                         className={`sketch-button px-4 py-1 text-xl font-bold ${
                             searchTerm === tag 
                             ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' 
                             : ''
                         }`}
                      >
                         #{tag}
                      </button>
                  ))}
              </div>
          )}
      </div>

      {(loading && !searchTerm && !semanticMode) ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-8 space-y-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="break-inside-avoid sketch-card overflow-hidden animate-pulse">
               <div className="w-full h-64 bg-gray-200 sketch-border border-l-0 border-r-0 border-t-0 rounded-none"></div>
               <div className="p-4 space-y-4">
                   <div className="h-6 bg-gray-300 sketch-border w-1/3"></div>
                   <div className="h-4 bg-gray-200 sketch-border w-1/2"></div>
               </div>
            </div>
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-pencil text-3xl font-bold">
          <ImageIcon className="w-24 h-24 mb-6 opacity-30" />
          <p>No photos found</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-8 space-y-8">
          {photos.map(photo => (
            <div key={photo.id} className="break-inside-avoid sketch-card overflow-hidden group">
              <div className="relative border-b-2 border-ink bg-white">
                {workerUrl && photo.telegram_file_id ? (
                    // Cloud/Proxy Mode: Secure image stream via Cloudflare 
                    <img 
                      src={`${workerUrl}?file_id=${photo.telegram_file_id}`} 
                      alt="Gallery Item" 
                      className="w-full h-auto object-cover"
                      loading="lazy"
                    />
                ) : isCloudHost && photo.telegram_embed_url ? (
                    // Cloud Mode (Fallback): Simple link to Telegram WebView
                    // Due to strict CORS, if a custom proxy isn't configured, we fallback to a simple click-to-view UI.
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center p-4 py-8 text-center">
                       <a href={photo.telegram_embed_url.replace('?embed=1', '')} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center text-primary font-bold text-xl hover:text-blue-700 transition-colors">
                          <ImageIcon className="w-10 h-10 mb-2 opacity-60" />
                          <span>View Full Photo on Telegram</span>
                       </a>
                    </div>
                ) : (
                    // Local Mode: Serve directly from node uploads/tests folders
                    <img 
                      src={`/${photo.local_cache_path}`} 
                      alt="Gallery Item" 
                      className="w-full h-auto object-cover"
                      loading="lazy"
                    />
                )}
                <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4">
                  <div className="flex gap-4">
                    {(!isCloudHost || workerUrl) && (
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedPhoto(photo); }}
                        className="sketch-button p-3 bg-white hover:bg-highlight text-ink"
                        title="Fullscreen"
                      >
                        <Maximize className="w-6 h-6" />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(photo); }}
                      className="sketch-button p-3 bg-white hover:bg-highlight text-ink"
                      title="Download"
                    >
                      <Download className="w-6 h-6" />
                    </button>
                    <a 
                      href={photo.telegram_link || (photo.telegram_embed_url ? photo.telegram_embed_url.replace('?embed=1', '') : '#')} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="sketch-button p-3 bg-white hover:bg-highlight text-ink flex items-center justify-center"
                      title="Open in Telegram"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-6 h-6" />
                    </a>
                    {!isCloudHost && (
                        <button 
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="sketch-button p-3 bg-white hover:bg-errorInk text-ink hover:text-white"
                          title="Delete Photo"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2 mb-4">
                  {photo.tags.map((t, i) => (
                    <span key={i} className="text-sm font-bold px-2 py-1 sketch-border bg-paper text-ink shadow-[2px_2px_0px_#2c2e33]">
                      #{t}
                    </span>
                  ))}
                </div>
                {photo.people.length > 0 && (
                  <div className="text-xl font-bold text-primary font-sketch">
                     {photo.people.join(', ')}
                  </div>
                )}
                <div className="text-sm text-pencil mt-2 font-mono flex items-center">
                  {new Date(photo.upload_timestamp).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sketch Modal Overlay */}
      {selectedPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4 md:p-8" onClick={() => setSelectedPhoto(null)}>
              <div 
                  className="flex flex-col md:flex-row w-full max-w-7xl h-full max-h-[90vh] sketch-card bg-paper overflow-hidden animate-slide-up relative" 
                  onClick={e => e.stopPropagation()}
              >
                  <button 
                      className="sketch-button absolute top-4 right-4 p-2 bg-white z-[110]" 
                      onClick={(e) => { e.stopPropagation(); setSelectedPhoto(null); }}
                  >
                      <X className="w-6 h-6" />
                  </button>

                  {/* Left: Huge Image */}
                  <div className="relative flex-1 bg-white border-b-2 md:border-b-0 md:border-r-2 border-ink flex items-center justify-center p-4">
                      <img 
                          src={isCloudHost && workerUrl && selectedPhoto.telegram_file_id ? `${workerUrl}?file_id=${selectedPhoto.telegram_file_id}` : `/${selectedPhoto.local_cache_path}`} 
                          className="max-w-full max-h-full object-contain sketch-border shadow-sketch bg-paper hidden-scrollbar"
                          alt="Selected fullscreen"
                      />
                  </div>

                  {/* Right: Sidebar Metadata */}
                  <div className="w-full md:w-[450px] md:min-w-[450px] bg-paper p-8 flex flex-col overflow-y-auto custom-scrollbar relative">
                      <h3 className="text-4xl font-bold w-full text-ink mb-8 underline decoration-wavy decoration-primary underline-offset-8">Metadata Note</h3>
                      
                      <div className="space-y-10 flex-1">
                          {selectedPhoto.people && selectedPhoto.people.length > 0 && (
                              <div>
                                  <h4 className="text-xl font-bold text-pencil mb-4 flex items-center">
                                      <UserIcon className="w-5 h-5 mr-3" /> Identified People
                                  </h4>
                                  <div className="flex flex-wrap gap-3">
                                     {selectedPhoto.people.map(p => <span key={p} className="px-4 py-2 sketch-border bg-highlight text-ink text-xl font-bold shadow-sketchHover transform -rotate-1">@{p}</span> )}
                                  </div>
                              </div>
                          )}

                          {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                              <div>
                                  <h4 className="text-xl font-bold text-pencil mb-4 flex items-center">
                                      <Brain className="w-5 h-5 mr-3" /> AI Tags
                                  </h4>
                                  <div className="flex flex-wrap gap-3">
                                     {selectedPhoto.tags.map(t => <span key={t} className="px-3 py-1 sketch-border bg-white text-ink text-lg font-bold shadow-[2px_2px_0px_#2c2e33] cursor-pointer hover:bg-highlight transition-colors" onClick={() => { setSearchTerm(t); setSelectedPhoto(null); }}>#{t}</span> )}
                                  </div>
                              </div>
                          )}

                          <div>
                              <h4 className="text-xl font-bold text-pencil mb-2">Timestamp</h4>
                              <p className="text-ink text-xl font-mono sketch-border p-3 bg-white inline-block shadow-sketchHover">{new Date(selectedPhoto.upload_timestamp).toLocaleString()}</p>
                          </div>
                      </div>

                      <div className="mt-8 pt-8 border-t-2 border-dashed border-ink grid grid-cols-2 gap-4">
                          <button onClick={() => handleDownload(selectedPhoto)} className="sketch-button flex items-center justify-center py-4 bg-white text-xl font-bold">
                              <Download className="w-6 h-6 mr-2" /> Save Form
                          </button>
                          <a href={selectedPhoto.telegram_link || (selectedPhoto.telegram_embed_url ? selectedPhoto.telegram_embed_url.replace('?embed=1', '') : '#')} target="_blank" rel="noopener noreferrer" className="sketch-button flex items-center justify-center py-4 bg-primary text-white hover:text-ink text-xl font-bold">
                              <ExternalLink className="w-6 h-6 mr-2" /> Open File
                          </a>
                      </div>
                      
                      {!isCloudHost && (
                          <button 
                             onClick={() => { handleDeletePhoto(selectedPhoto.id); setSelectedPhoto(null); }} 
                             className="mt-6 flex items-center justify-center py-4 w-full sketch-button border-errorInk text-errorInk hover:bg-errorInk hover:text-white text-xl font-bold"
                          >
                              <Trash2 className="w-6 h-6 mr-2" /> Shred Photo
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

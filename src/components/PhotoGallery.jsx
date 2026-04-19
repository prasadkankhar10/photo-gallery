import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Image as ImageIcon, ExternalLink, Download, Loader2, Trash2,
  Brain, X, Upload, Maximize, User as UserIcon, Play, Video, Users,
  Calendar, ChevronDown, ChevronUp, GripVertical, Tag, Filter
} from 'lucide-react';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v', 'wmv', 'flv']);

function isVideoFile(filename = '') {
  return VIDEO_EXTENSIONS.has(filename.split('.').pop().toLowerCase());
}

function formatDateLabel(dateStr) {
  if (!dateStr) return 'Unknown Date';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'Unknown Date';
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'unknown';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---- Drag-to-Reorder Video Queue ----
function DraggableVideoQueue({ items, onReorder, onRemove }) {
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const handleDragStart = (idx) => { dragItem.current = idx; };
  const handleDragEnter = (idx) => { dragOver.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const newList = [...items];
    const [moved] = newList.splice(dragItem.current, 1);
    newList.splice(dragOver.current, 0, moved);
    dragItem.current = null;
    dragOver.current = null;
    onReorder(newList);
  };

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragEnter={() => handleDragEnter(idx)}
          onDragEnd={handleDragEnd}
          onDragOver={e => e.preventDefault()}
          className="flex items-center gap-3 p-3 bg-white sketch-border shadow-[2px_2px_0px_#2c2e33] cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-transform"
        >
          <GripVertical className="w-5 h-5 text-pencil flex-shrink-0" />
          <Video className="w-5 h-5 text-errorInk flex-shrink-0" />
          <span className="flex-1 text-sm font-bold text-ink truncate">{item.file.name}</span>
          <span className="text-xs text-pencil font-mono">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button onClick={() => onRemove(idx)} className="text-pencil hover:text-errorInk transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function PhotoGallery({ addToast }) {
  const [allMedia, setAllMedia] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [semanticMode, setSemanticMode] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [fallbackUrls, setFallbackUrls] = useState({});

  // Filters
  const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'photo' | 'video'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(''); // Albums mode

  // View tabs
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' | 'albums'

  // Video upload queue
  const [videoQueue, setVideoQueue] = useState([]); // [{id, file, tags, people}]
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [videoTagInput, setVideoTagInput] = useState('');
  const [videoPeopleInput, setVideoPeopleInput] = useState('');

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const isCloudHost = window.location.hostname.includes('github.io');
  const workerUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

  useEffect(() => {
    if (!semanticMode) fetchPhotos();
  }, [searchTerm, semanticMode]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      if (isCloudHost) {
        const res = await fetch('./catalog.json');
        if (!res.ok) throw new Error('Catalog not found');
        const allData = await res.json();
        if (searchTerm) {
          const query = searchTerm.toLowerCase();
          setPhotos(allData.filter(row =>
            row.people.some(p => p.toLowerCase().includes(query)) ||
            row.tags.some(t => t.toLowerCase().includes(query))
          ));
        } else {
          setPhotos(allData);
        }
        setAllMedia(allData);
      } else {
        const url = searchTerm ? `/api/photos?q=${encodeURIComponent(searchTerm)}` : '/api/photos';
        const res = await fetch(url);
        const data = await res.json();
        setPhotos(data);
        if (!searchTerm) {
          setAllMedia(data);
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
    setPopularTags(
      Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0])
    );
  };

  // Distinct people for albums
  const allPeople = [...new Set(allMedia.flatMap(m => m.people || []))].filter(Boolean).sort();

  // Apply all client-side filters
  const filteredPhotos = photos.filter(m => {
    if (mediaFilter !== 'all' && (m.media_type || 'photo') !== mediaFilter) return false;
    if (selectedPerson && !(m.people || []).map(p => p.toLowerCase()).includes(selectedPerson.toLowerCase())) return false;
    const sortDate = m.captured_at || m.upload_timestamp;
    if (dateFrom && sortDate < dateFrom) return false;
    if (dateTo && sortDate > dateTo + 'T23:59:59') return false;
    return true;
  });

  // Group by date
  const groupedByDate = filteredPhotos.reduce((acc, item) => {
    const key = getDateKey(item.captured_at || item.upload_timestamp);
    if (!acc[key]) acc[key] = { label: formatDateLabel(item.captured_at || item.upload_timestamp), items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});
  const dateGroups = Object.entries(groupedByDate).sort((a, b) => b[0].localeCompare(a[0]));

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
      } else { setLoading(false); return; }
      const res = await fetch(endpoint, { method: 'POST', headers, body });
      const data = await res.json();
      if (data.error) { if (addToast) addToast(data.error, 'error'); }
      else if (data.success) { setPhotos(data.photos || []); }
    } catch (e) {
      if (addToast) addToast('Semantic search failed.', 'error');
    }
    setLoading(false);
  };

  const clearImageSearch = () => {
    setImageFile(null);
    setImagePreview('');
    if (!searchTerm) setSemanticMode(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (isVideoFile(file.name)) {
      // Route to video upload flow
      setVideoQueue([{ id: Date.now(), file, tags: [], people: [] }]);
      setShowVideoModal(true);
    } else {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setSemanticMode(true);
      setSearchTerm('');
    }
  };

  const handleVideoFilesSelected = (files) => {
    const newItems = Array.from(files)
      .filter(f => isVideoFile(f.name))
      .map(f => ({ id: Date.now() + Math.random(), file: f, tags: [], people: [] }));
    if (newItems.length === 0) { if (addToast) addToast('No supported video files found', 'error'); return; }
    setVideoQueue(prev => [...prev, ...newItems]);
    setShowVideoModal(true);
  };

  const uploadVideoQueue = async () => {
    if (videoQueue.length === 0) return;
    setIsUploadingVideos(true);
    const globalTags = videoTagInput.split(',').map(t => t.trim()).filter(Boolean);
    const globalPeople = videoPeopleInput.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    let successCount = 0;
    for (const item of videoQueue) {
      try {
        const formData = new FormData();
        formData.append('video', item.file);
        formData.append('tags', JSON.stringify(globalTags));
        formData.append('people', JSON.stringify(globalPeople));
        const res = await fetch('http://localhost:3000/api/upload_video', { method: 'POST', body: formData });
        if (res.ok) successCount++;
        else { const err = await res.json(); console.error(err); }
      } catch (e) { console.error(e); }
    }
    setIsUploadingVideos(false);
    setShowVideoModal(false);
    setVideoQueue([]);
    setVideoTagInput('');
    setVideoPeopleInput('');
    if (addToast) addToast(`Uploaded ${successCount}/${videoQueue.length} videos to Telegram!`, successCount > 0 ? 'success' : 'error');
    if (!isCloudHost) fetchPhotos();
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
        if (photo.telegram_embed_url) window.open(photo.telegram_embed_url.replace('?embed=1', ''), '_blank');
        return;
      }
      if (urlToFetch) {
        const response = await fetch(urlToFetch);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `media_${photo.id}${(photo.media_type === 'video') ? '.mp4' : '.jpg'}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (e) { if (addToast) addToast('Error downloading.', 'error'); }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this item from the gallery?')) return;
    try {
      const res = await fetch(`/api/delete_photo/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotos(photos.filter(p => p.id !== photoId));
        setAllMedia(allMedia.filter(p => p.id !== photoId));
        if (addToast) addToast('Item deleted.', 'success');
      } else { if (addToast) addToast('Failed to delete.', 'error'); }
    } catch (e) { if (addToast) addToast('Error deleting.', 'error'); }
  };

  const getThumbSrc = (item) => {
    if (item.local_thumb_path) return `${import.meta.env.BASE_URL}${item.local_thumb_path.replace('public/', '')}`;
    if (item.local_cache_path) return `${import.meta.env.BASE_URL}${item.local_cache_path}`;
    return null;
  };

  const getFullSrc = (item) => {
    if (isCloudHost && workerUrl && item.telegram_file_id) return `${workerUrl}?file_id=${item.telegram_file_id}`;
    if (fallbackUrls[item.id] && fallbackUrls[item.id] !== 'loading') return fallbackUrls[item.id];
    if (item.local_cache_path) return `/${item.local_cache_path}`;
    return null;
  };

  const triggerFallback = (item) => {
    if (fallbackUrls[item.id]) return;
    setFallbackUrls(prev => ({ ...prev, [item.id]: 'loading' }));
    if (isCloudHost && workerUrl) {
      setFallbackUrls(prev => ({ ...prev, [item.id]: `${workerUrl}?file_id=${item.telegram_file_id}` }));
    } else if (!isCloudHost) {
      fetch(`/api/photo_url/${item.telegram_file_id}`)
        .then(r => r.json())
        .then(data => { if (data.url) setFallbackUrls(prev => ({ ...prev, [item.id]: data.url })); });
    }
  };

  // ---- MEDIA CARD ----
  const MediaCard = ({ item }) => {
    const isVideo = (item.media_type || 'photo') === 'video';
    const thumbSrc = fallbackUrls[item.id] && fallbackUrls[item.id] !== 'loading'
      ? fallbackUrls[item.id]
      : getThumbSrc(item);

    return (
      <div className="break-inside-avoid sketch-card overflow-hidden group mb-8">
        <div className="relative border-b-2 border-ink bg-[#0f0f0f]">
          {isVideo && !thumbSrc ? (
            <div className="w-full aspect-square bg-[#1a1a2e] flex flex-col items-center justify-center">
              <Video className="w-16 h-16 text-[#e94560] mb-2" />
              <span className="text-xs text-gray-400 font-mono">Video</span>
            </div>
          ) : (
            <img
              src={thumbSrc || ''}
              onError={() => item.telegram_file_id && triggerFallback(item)}
              alt={isVideo ? 'Video thumbnail' : 'Gallery Item'}
              className="w-full h-auto object-cover aspect-square md:aspect-auto"
              loading="lazy"
            />
          )}

          {/* Video badge */}
          {isVideo && (
            <div className="absolute top-2 left-2 bg-[#e94560] text-white text-xs font-bold px-2 py-1 flex items-center gap-1 shadow-md">
              <Play className="w-3 h-3" /> VIDEO
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4">
            <div className="flex gap-3 flex-wrap justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedPhoto(item); }}
                className="sketch-button p-3 bg-white hover:bg-highlight text-ink"
                title={isVideo ? 'Play Video' : 'Fullscreen'}
              >
                {isVideo ? <Play className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                className="sketch-button p-3 bg-white hover:bg-highlight text-ink"
                title="Download"
              >
                <Download className="w-6 h-6" />
              </button>
              <a
                href={item.telegram_link || (item.telegram_embed_url ? item.telegram_embed_url.replace('?embed=1', '') : '#')}
                target="_blank" rel="noopener noreferrer"
                className="sketch-button p-3 bg-white hover:bg-highlight text-ink flex items-center justify-center"
                title="Open in Telegram"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-6 h-6" />
              </a>
              {!isCloudHost && (
                <button
                  onClick={() => handleDeletePhoto(item.id)}
                  className="sketch-button p-3 bg-white hover:bg-errorInk text-ink hover:text-white"
                  title="Delete"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            {(item.tags || []).slice(0, 4).map((t, i) => (
              <span key={i} className="text-xs font-bold px-2 py-1 sketch-border bg-paper text-ink shadow-[2px_2px_0px_#2c2e33]">
                #{t}
              </span>
            ))}
          </div>
          {(item.people || []).length > 0 && (
            <div className="text-sm font-bold text-primary font-sketch mb-1 flex flex-wrap gap-1">
              {item.people.map((p, i) => (
                <button key={i} onClick={() => setSelectedPerson(selectedPerson === p ? '' : p)}
                  className={`hover:underline ${selectedPerson === p ? 'text-highlight' : 'text-primary'}`}>
                  @{p}
                </button>
              ))}
            </div>
          )}
          <div className="text-xs text-pencil font-mono mt-1">
            {new Date(item.captured_at || item.upload_timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
    );
  };

  // ---- ALBUMS VIEW ----
  const AlbumsView = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {allPeople.map(person => {
          const personMedia = allMedia.filter(m => (m.people || []).map(p => p.toLowerCase()).includes(person.toLowerCase()));
          const cover = personMedia[0];
          return (
            <button
              key={person}
              onClick={() => { setSelectedPerson(person); setActiveTab('gallery'); }}
              className="group sketch-card overflow-hidden hover:-translate-y-1 transition-transform text-left"
            >
              <div className="relative w-full aspect-square bg-[#f0f0f0] border-b-2 border-ink flex items-center justify-center overflow-hidden">
                {cover ? (
                  <img
                    src={fallbackUrls[cover.id] && fallbackUrls[cover.id] !== 'loading' ? fallbackUrls[cover.id] : getThumbSrc(cover)}
                    onError={() => cover.telegram_file_id && triggerFallback(cover)}
                    alt={person}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-16 h-16 text-pencil/30" />
                )}
                <div className="absolute bottom-0 inset-x-0 bg-ink/70 text-white text-xs font-bold py-1 px-2 text-center">
                  {personMedia.length} item{personMedia.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="p-4">
                <div className="text-lg font-bold text-ink capitalize font-sketch">{person}</div>
              </div>
            </button>
          );
        })}
      </div>
      {allPeople.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-pencil text-2xl font-bold">
          <Users className="w-20 h-20 mb-4 opacity-20" />
          <p>No people identified yet</p>
          <p className="text-sm font-normal mt-2">Upload photos through the AI daemon to start recognising faces</p>
        </div>
      )}
    </div>
  );

  const isLoading = loading && !searchTerm && !semanticMode;

  return (
    <div className="flex flex-col space-y-6">
      {/* ---- SEARCH BAR ---- */}
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <form onSubmit={handleSemanticSearch} className="relative flex items-center gap-2">
          <div className={`relative flex-1 flex items-center sketch-card ${semanticMode ? 'border-primary ring-2 ring-primary/20 bg-[#eff6ff]' : 'bg-white'}`}>
            {semanticMode ? <Brain className="absolute left-4 w-6 h-6 text-primary animate-pulse" /> : <Search className="absolute left-4 w-6 h-6 text-pencil" />}
            {imagePreview ? (
              <div className="flex items-center flex-1 py-2 pl-12 pr-4">
                <div className="flex items-center gap-3 bg-paper px-3 py-1.5 sketch-border">
                  <img src={imagePreview} alt="Search Query" className="w-10 h-10 object-cover" />
                  <span className="text-lg text-ink font-bold truncate max-w-[150px]">{imageFile.name}</span>
                  <button type="button" onClick={clearImageSearch} className="text-pencil hover:text-errorInk"><X className="w-5 h-5" /></button>
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={semanticMode ? "e.g. 'A sunny day at the beach'" : "Search people, tags, events..."}
                className="w-full bg-transparent py-4 pl-14 pr-4 text-2xl outline-none text-ink placeholder:text-pencil/50 font-sketch"
              />
            )}
            <div className="absolute right-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-pencil hover:text-ink sketch-border bg-paper shadow-sm"
                title="Reverse Image Search / Upload"
              >
                <ImageIcon className="w-6 h-6" />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
            </div>
          </div>
          {!isCloudHost && (
            <button
              type="button"
              onClick={() => { setSemanticMode(!semanticMode); }}
              className={`sketch-button flex items-center gap-2 px-6 py-4 text-xl font-bold ${semanticMode ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''}`}
            >
              <Brain className="w-6 h-6" /> AI
            </button>
          )}
          {semanticMode && (
            <button type="submit" className="sketch-button bg-primary text-white px-8 py-4 text-xl font-bold hover:bg-blue-600">Search</button>
          )}
        </form>

        {/* Popular tags */}
        {popularTags.length > 0 && !semanticMode && (
          <div className="flex flex-wrap gap-2 justify-center">
            {popularTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSearchTerm(searchTerm === tag ? '' : tag)}
                className={`sketch-button px-3 py-1 text-base font-bold ${searchTerm === tag ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''}`}
              >#{tag}</button>
            ))}
          </div>
        )}
      </div>

      {/* ---- TABS + CONTROLS ---- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex gap-1 sketch-card overflow-hidden border-2 border-ink">
          {[['gallery', 'Gallery', ImageIcon], ['albums', 'Albums', Users]].map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-5 py-2.5 font-bold text-lg flex items-center gap-2 transition-colors ${activeTab === id ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-gray-100'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'gallery' && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Media type filter */}
            <div className="flex sketch-card divide-x-2 divide-ink border-2 border-ink overflow-hidden">
              {[['all', 'All', Filter], ['photo', 'Photos', ImageIcon], ['video', 'Videos', Video]].map(([val, label, Icon]) => (
                <button
                  key={val}
                  onClick={() => setMediaFilter(val)}
                  className={`px-4 py-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${mediaFilter === val ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-gray-100'}`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {/* Date filter toggle */}
            <button
              onClick={() => setShowDateFilter(!showDateFilter)}
              className={`sketch-button px-4 py-2 font-bold text-sm flex items-center gap-2 ${showDateFilter ? 'bg-highlight shadow-sketchHover translate-y-[1px]' : ''}`}
            >
              <Calendar className="w-4 h-4" />
              Date Range
              {showDateFilter ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Person filter clear */}
            {selectedPerson && (
              <button
                onClick={() => setSelectedPerson('')}
                className="sketch-button px-4 py-2 font-bold text-sm flex items-center gap-2 bg-primary/10 border-primary text-primary"
              >
                <UserIcon className="w-4 h-4" />
                @{selectedPerson} <X className="w-3 h-3" />
              </button>
            )}

            {/* Video upload button */}
            {!isCloudHost && (
              <button
                onClick={() => videoInputRef.current?.click()}
                className="sketch-button px-4 py-2 font-bold text-sm flex items-center gap-2 bg-[#1a1a2e] text-white border-[#e94560] hover:bg-[#e94560]"
              >
                <Video className="w-4 h-4" /> Upload Video
              </button>
            )}
            <input
              type="file"
              ref={videoInputRef}
              onChange={e => handleVideoFilesSelected(e.target.files)}
              accept="video/*"
              multiple
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Date range filter panel */}
      {showDateFilter && activeTab === 'gallery' && (
        <div className="sketch-card p-4 bg-[#fffbea] border-highlight border-2 flex flex-wrap gap-6 items-end animate-slide-up">
          <div>
            <label className="block text-xs font-bold text-pencil uppercase mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="sketch-card px-3 py-2 bg-white text-ink font-mono text-sm border-ink border-2 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-pencil uppercase mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="sketch-card px-3 py-2 bg-white text-ink font-mono text-sm border-ink border-2 outline-none" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="sketch-button px-4 py-2 text-sm font-bold flex items-center gap-1 text-errorInk border-errorInk">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      )}

      {/* ---- ALBUMS TAB ---- */}
      {activeTab === 'albums' && <AlbumsView />}

      {/* ---- GALLERY TAB ---- */}
      {activeTab === 'gallery' && (
        <>
          {isLoading ? (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-8">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="break-inside-avoid sketch-card overflow-hidden animate-pulse mb-8">
                  <div className="w-full h-64 bg-gray-200"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-300 w-1/3"></div>
                    <div className="h-3 bg-gray-200 w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-pencil text-3xl font-bold">
              <ImageIcon className="w-24 h-24 mb-6 opacity-30" />
              <p>No {mediaFilter !== 'all' ? mediaFilter + 's' : 'media'} found</p>
              {(dateFrom || dateTo || selectedPerson || searchTerm) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setSelectedPerson(''); setSearchTerm(''); setMediaFilter('all'); }}
                  className="mt-4 sketch-button px-5 py-2 text-xl font-bold text-errorInk border-errorInk">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {dateGroups.map(([dateKey, group]) => (
                <div key={dateKey}>
                  {/* Date separator */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="sketch-card bg-ink text-paper px-4 py-2 font-bold font-mono text-sm whitespace-nowrap">
                      <Calendar className="w-4 h-4 inline mr-2 -mt-0.5" />
                      {group.label}
                    </div>
                    <div className="flex-1 border-t-2 border-dashed border-ink/30"></div>
                    <span className="text-sm font-mono text-pencil">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Masonry grid for this date */}
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-8">
                    {group.items.map(item => <MediaCard key={item.id} item={item} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- VIDEO UPLOAD MODAL ---- */}
      {showVideoModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-4 animate-slide-up">
          <div className="sketch-card bg-paper w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative">
            <div className="p-6 border-b-2 border-ink flex items-center justify-between">
              <h2 className="text-2xl font-bold font-sketch text-ink flex items-center gap-3">
                <Video className="w-7 h-7 text-[#e94560]" /> Upload Videos
              </h2>
              <button onClick={() => { setShowVideoModal(false); setVideoQueue([]); }}
                className="sketch-button p-2 bg-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {/* Drag-to-reorder queue */}
              {videoQueue.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-pencil uppercase mb-3 flex items-center gap-2">
                    <GripVertical className="w-4 h-4" /> Drag to Reorder Upload Queue
                  </p>
                  <DraggableVideoQueue
                    items={videoQueue}
                    onReorder={setVideoQueue}
                    onRemove={idx => setVideoQueue(q => q.filter((_, i) => i !== idx))}
                  />
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="mt-3 w-full sketch-button py-2 text-sm font-bold text-pencil border-dashed"
                  >
                    + Add More Videos
                  </button>
                </div>
              )}

              {/* Global tags for all videos */}
              <div>
                <label className="block text-sm font-bold text-pencil uppercase mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Tags (comma separated, applies to all)
                </label>
                <input
                  type="text"
                  value={videoTagInput}
                  onChange={e => setVideoTagInput(e.target.value)}
                  placeholder="Birthday, Family, Trip..."
                  className="w-full sketch-card px-4 py-3 bg-white text-ink outline-none border-ink border-2"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-pencil uppercase mb-2 flex items-center gap-2">
                  <UserIcon className="w-4 h-4" /> People in these videos (comma separated)
                </label>
                <input
                  type="text"
                  value={videoPeopleInput}
                  onChange={e => setVideoPeopleInput(e.target.value)}
                  placeholder="Prasad, Mom, Dad..."
                  className="w-full sketch-card px-4 py-3 bg-white text-ink outline-none border-ink border-2"
                />
              </div>
            </div>

            <div className="p-6 border-t-2 border-ink">
              <button
                onClick={uploadVideoQueue}
                disabled={isUploadingVideos || videoQueue.length === 0}
                className="w-full sketch-button py-4 bg-[#1a1a2e] text-white border-[#e94560] font-bold text-xl flex items-center justify-center gap-3 hover:bg-[#e94560] disabled:opacity-50 transition-colors"
              >
                {isUploadingVideos ? <><Loader2 className="w-6 h-6 animate-spin" /> Uploading...</> : <><Upload className="w-6 h-6" /> Upload {videoQueue.length} Video{videoQueue.length !== 1 ? 's' : ''} to Telegram</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- FULLSCREEN MODAL ---- */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4 md:p-8" onClick={() => setSelectedPhoto(null)}>
          <div className="flex flex-col md:flex-row w-full max-w-7xl h-full max-h-[90vh] sketch-card bg-paper overflow-hidden animate-slide-up relative" onClick={e => e.stopPropagation()}>
            <button className="sketch-button absolute top-4 right-4 p-2 bg-white z-[110]" onClick={() => setSelectedPhoto(null)}>
              <X className="w-6 h-6" />
            </button>

            {/* Left: Media */}
            <div className="relative flex-1 bg-[#0f0f0f] border-b-2 md:border-b-0 md:border-r-2 border-ink flex items-center justify-center p-4">
              {(selectedPhoto.media_type || 'photo') === 'video' ? (
                isCloudHost ? (
                  <div className="flex flex-col items-center gap-4 text-white">
                    <Video className="w-20 h-20 text-[#e94560]" />
                    <p className="text-lg font-bold">Video stored on Telegram</p>
                    <a
                      href={selectedPhoto.telegram_link || selectedPhoto.telegram_embed_url?.replace('?embed=1', '') || '#'}
                      target="_blank" rel="noopener noreferrer"
                      className="sketch-button px-6 py-3 bg-[#e94560] text-white font-bold flex items-center gap-2"
                    >
                      <ExternalLink className="w-5 h-5" /> Open in Telegram
                    </a>
                  </div>
                ) : (
                  <video
                    src={getFullSrc(selectedPhoto) || `/api/photo_url/${selectedPhoto.telegram_file_id}`}
                    controls
                    autoPlay={false}
                    className="max-w-full max-h-full outline-none"
                    style={{ maxHeight: '70vh' }}
                  />
                )
              ) : (
                <img
                  src={getFullSrc(selectedPhoto) || ''}
                  onError={() => selectedPhoto.telegram_file_id && triggerFallback(selectedPhoto)}
                  className="max-w-full max-h-full object-contain sketch-border shadow-sketch bg-paper"
                  alt="Fullscreen"
                />
              )}
            </div>

            {/* Right: Sidebar */}
            <div className="w-full md:w-[420px] md:min-w-[420px] bg-paper p-8 flex flex-col overflow-y-auto custom-scrollbar">
              <h3 className="text-3xl font-bold text-ink mb-6 underline decoration-wavy decoration-primary underline-offset-8">
                {(selectedPhoto.media_type === 'video') ? '🎥 Video Info' : 'Metadata Note'}
              </h3>

              <div className="space-y-8 flex-1">
                {selectedPhoto.people?.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold text-pencil mb-3 flex items-center">
                      <UserIcon className="w-5 h-5 mr-2" /> Identified People
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhoto.people.map(p => (
                        <button key={p} onClick={() => { setSelectedPerson(p); setSelectedPhoto(null); setActiveTab('gallery'); }}
                          className="px-3 py-1.5 sketch-border bg-highlight text-ink text-lg font-bold shadow-sketchHover hover:-rotate-1 transition-transform">
                          @{p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPhoto.tags?.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold text-pencil mb-3 flex items-center">
                      <Tag className="w-5 h-5 mr-2" /> Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhoto.tags.map(t => (
                        <span key={t} onClick={() => { setSearchTerm(t); setSelectedPhoto(null); }}
                          className="px-3 py-1 sketch-border bg-white text-ink text-base font-bold shadow-[2px_2px_0px_#2c2e33] cursor-pointer hover:bg-highlight transition-colors">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-lg font-bold text-pencil mb-2">Captured</h4>
                  <p className="text-ink text-base font-mono sketch-border p-3 bg-white inline-block shadow-sketchHover">
                    {new Date(selectedPhoto.captured_at || selectedPhoto.upload_timestamp).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t-2 border-dashed border-ink grid grid-cols-2 gap-3">
                <button onClick={() => handleDownload(selectedPhoto)} className="sketch-button flex items-center justify-center py-3 bg-white text-lg font-bold">
                  <Download className="w-5 h-5 mr-2" /> Save
                </button>
                <a
                  href={selectedPhoto.telegram_link || selectedPhoto.telegram_embed_url?.replace('?embed=1', '') || '#'}
                  target="_blank" rel="noopener noreferrer"
                  className="sketch-button flex items-center justify-center py-3 bg-primary text-white hover:text-ink text-lg font-bold"
                >
                  <ExternalLink className="w-5 h-5 mr-2" /> Telegram
                </a>
              </div>
              {!isCloudHost && (
                <button
                  onClick={() => { handleDeletePhoto(selectedPhoto.id); setSelectedPhoto(null); }}
                  className="mt-4 flex items-center justify-center py-3 w-full sketch-button border-errorInk text-errorInk hover:bg-errorInk hover:text-white text-lg font-bold"
                >
                  <Trash2 className="w-5 h-5 mr-2" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Image as ImageIcon, ExternalLink, Download, Trash2,
  Brain, X, Upload, Maximize, User as UserIcon, Play, Video, Users,
  Calendar, ChevronDown, ChevronUp, GripVertical, Tag, Filter,
  MapPin, ArrowLeft, Loader2, Camera
} from 'lucide-react';

const VIDEO_EXTENSIONS = new Set(['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv']);
function isVideoFile(fn = '') { return VIDEO_EXTENSIONS.has(fn.split('.').pop().toLowerCase()); }

function fmtDateLong(dt) {
  if (!dt) return 'Unknown Date';
  const d = new Date(dt);
  return isNaN(d) ? 'Unknown Date' : d.toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function fmtDateShort(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function dateKey(dt) {
  if (!dt) return 'unknown';
  const d = new Date(dt); return isNaN(d) ? 'unknown' : d.toISOString().slice(0,10);
}

// ─── DRAGGABLE VIDEO QUEUE ───────────────────────────────────────────────────
function DraggableQueue({ items, onReorder, onRemove }) {
  const from = useRef(null), to = useRef(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} draggable
          onDragStart={()=>{from.current=i;}}
          onDragEnter={()=>{to.current=i;}}
          onDragEnd={()=>{
            if(from.current===null||to.current===null||from.current===to.current)return;
            const l=[...items]; const [m]=l.splice(from.current,1); l.splice(to.current,0,m);
            from.current=null; to.current=null; onReorder(l);
          }}
          onDragOver={e=>e.preventDefault()}
          className="flex items-center gap-3 p-3 bg-white border-2 border-ink shadow-[2px_2px_0_#2c2e33] cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-transform"
        >
          <GripVertical className="w-5 h-5 text-pencil flex-shrink-0"/>
          <Video className="w-5 h-5 text-errorInk flex-shrink-0"/>
          <span className="flex-1 text-sm font-bold text-ink truncate">{item.file.name}</span>
          <span className="text-xs text-pencil font-mono">{(item.file.size/1024/1024).toFixed(1)} MB</span>
          <button onClick={()=>onRemove(i)} className="text-pencil hover:text-errorInk"><X className="w-4 h-4"/></button>
        </div>
      ))}
    </div>
  );
}

// ─── CALENDAR HEATMAP ───────────────────────────────────────────────────────
function CalendarHeatmap({ media, onDateClick }) {
  const today = new Date();
  const yearAgo = new Date(today); yearAgo.setFullYear(today.getFullYear()-1);

  const counts = {};
  media.forEach(m => {
    const k = dateKey(m.captured_at || m.upload_timestamp);
    counts[k] = (counts[k]||0) + 1;
  });
  const max = Math.max(...Object.values(counts), 1);

  // Build weeks array: each week is 7 days (Sun→Sat)
  const weeks = [];
  const cur = new Date(yearAgo);
  // Rewind to Sunday
  cur.setDate(cur.getDate() - cur.getDay());
  while (cur <= today) {
    const week = [];
    for (let d=0; d<7; d++) {
      const key = cur.toISOString().slice(0,10);
      week.push({ key, date: new Date(cur), count: counts[key]||0, future: cur > today });
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }

  const color = (c) => {
    if (!c) return '#ebedf0';
    const r = c/max;
    if (r<=0.25) return '#9be9a8';
    if (r<=0.5)  return '#40c463';
    if (r<=0.75) return '#30a14e';
    return '#216e39';
  };

  // Month labels
  const monthLabels = [];
  weeks.forEach((week, i) => {
    const first = week[0].date;
    if (first.getDate() <= 7) {
      monthLabels.push({ i, label: first.toLocaleDateString('en-IN',{month:'short'}) });
    }
  });

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const totalMedia = media.length;
  const daysWithPhotos = Object.keys(counts).length;

  return (
    <div className="space-y-6">
      <div className="sketch-card bg-white p-6 border-2 border-ink">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold font-sketch text-ink">Photo Activity — Past 12 Months</h3>
          <span className="text-sm font-mono text-pencil">{totalMedia} items across {daysWithPhotos} days</span>
        </div>

        {/* Month labels */}
        <div className="flex gap-[3px] mb-1 ml-8">
          {weeks.map((_, i) => {
            const lbl = monthLabels.find(m=>m.i===i);
            return <div key={i} style={{width:13}} className="text-[10px] font-mono text-pencil truncate">{lbl?.label||''}</div>;
          })}
        </div>

        {/* Day labels + grid */}
        <div className="flex gap-1">
          <div className="flex flex-col gap-[3px] mt-0">
            {DAYS.map((d,i) => (
              <div key={d} style={{height:13}} className="text-[9px] font-mono text-pencil text-right pr-1 leading-[13px] w-6">
                {i%2===1?d:''}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px] overflow-x-auto pb-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map(day => (
                  <div
                    key={day.key}
                    style={{
                      width:13, height:13,
                      backgroundColor: day.future ? 'transparent' : color(day.count),
                      borderRadius:3,
                      cursor: day.count>0 ? 'pointer' : 'default',
                      opacity: day.future ? 0 : 1,
                    }}
                    title={day.future ? '' : `${day.key}: ${day.count} item${day.count!==1?'s':''}`}
                    onClick={() => day.count>0 && onDateClick(day.key)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[11px] font-mono text-pencil">Less</span>
          {['#ebedf0','#9be9a8','#40c463','#30a14e','#216e39'].map(c=>(
            <div key={c} style={{width:13,height:13,backgroundColor:c,borderRadius:3}} />
          ))}
          <span className="text-[11px] font-mono text-pencil">More</span>
        </div>
      </div>

      {/* Top days */}
      {Object.keys(counts).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,c])=>(
            <button key={k} onClick={()=>onDateClick(k)}
              className="sketch-card p-3 bg-white hover:-translate-y-1 transition-transform text-left border-2 border-ink">
              <div className="text-2xl font-bold text-ink font-sketch">{c}</div>
              <div className="text-xs font-mono text-pencil mt-1">{fmtDateShort(k)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAP VIEW ───────────────────────────────────────────────────────────────
function MapView({ media }) {
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [noGps, setNoGps] = useState(false);

  useEffect(() => {
    const withGps = media.filter(m => m.gps_lat != null && m.gps_lng != null);
    if (withGps.length === 0) { setNoGps(true); return; }

    async function init() {
      if (!window.L) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
        await new Promise(res => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          s.onload = res; document.head.appendChild(s);
        });
      }
      const L = window.L;
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
      if (!mapRef.current) return;

      // Compute center from GPS data
      const avgLat = withGps.reduce((s,m)=>s+m.gps_lat,0)/withGps.length;
      const avgLng = withGps.reduce((s,m)=>s+m.gps_lng,0)/withGps.length;
      const map = L.map(mapRef.current).setView([avgLat, avgLng], 5);
      mapInst.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
      }).addTo(map);

      // Group by location name (city)
      const byLoc = {};
      withGps.forEach(m => {
        const key = m.location_name || `${m.gps_lat.toFixed(1)},${m.gps_lng.toFixed(1)}`;
        if (!byLoc[key]) byLoc[key] = { name: key, items: [], lat: 0, lng: 0, count: 0 };
        byLoc[key].items.push(m);
        byLoc[key].lat += m.gps_lat;
        byLoc[key].lng += m.gps_lng;
        byLoc[key].count++;
      });

      Object.values(byLoc).forEach(grp => {
        const lat = grp.lat / grp.count;
        const lng = grp.lng / grp.count;
        const cover = grp.items[0];
        const baseUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.BASE_URL || '/') : '/';
        const thumbSrc = cover.local_thumb_path
          ? `${baseUrl}${cover.local_thumb_path.replace('public/','')}` : null;

        const icon = L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:64px;height:64px;">
              <div style="
                width:60px;height:60px;border-radius:50%;border:3px solid white;
                overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.4);
                background:#1a1a2e;display:flex;align-items:center;justify-content:center;
              ">
                ${thumbSrc
                  ? `<img src="${thumbSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />`
                  : `<span style="font-size:24px;">📷</span>`}
              </div>
              <div style="
                position:absolute;bottom:0;right:0;
                background:#e94560;color:white;border-radius:50%;
                width:22px;height:22px;display:flex;align-items:center;justify-content:center;
                font-size:11px;font-weight:bold;border:2px solid white;
              ">${grp.count}</div>
            </div>
          `,
          iconSize: [64, 64], iconAnchor: [32, 32], popupAnchor: [0, -32]
        });

        const thumbsHtml = grp.items.slice(0,4).map(item => {
          const src = item.local_thumb_path
            ? `${baseUrl}${item.local_thumb_path.replace('public/','')}` : null;
          return src
            ? `<img src="${src}" style="width:56px;height:56px;object-fit:cover;border-radius:4px;border:2px solid #eee;" />`
            : `<div style="width:56px;height:56px;background:#1a1a2e;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;">📷</div>`;
        }).join('');

        L.marker([lat, lng], { icon })
          .bindPopup(`
            <div style="font-family:sans-serif;min-width:180px;">
              <b style="font-size:14px;">📍 ${grp.name}</b><br/>
              <span style="font-size:11px;color:#666;">${grp.count} photo${grp.count!==1?'s':''}</span>
              <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">${thumbsHtml}</div>
            </div>
          `, { maxWidth: 260 })
          .addTo(map);
      });
      setMapReady(true);
    }
    init();
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; } };
  }, [media]);

  if (noGps) return (
    <div className="flex flex-col items-center justify-center py-24 text-pencil">
      <MapPin className="w-20 h-20 mb-4 opacity-20"/>
      <p className="text-2xl font-bold">No Location Data</p>
      <p className="text-sm mt-2 max-w-sm text-center">
        Photos taken with GPS-enabled devices will appear here automatically. Make sure location was enabled when taking the photos.
      </p>
    </div>
  );

  return (
    <div className="space-y-2">
      {!mapReady && (
        <div className="flex items-center justify-center py-8 gap-3 text-pencil">
          <Loader2 className="w-6 h-6 animate-spin"/> Loading map…
        </div>
      )}
      <div ref={mapRef} style={{ height: 580 }} className="w-full sketch-border border-2 border-ink rounded-none" />
      <p className="text-xs font-mono text-pencil text-right">Map data © OpenStreetMap contributors</p>
    </div>
  );
}

// ─── MAIN GALLERY ────────────────────────────────────────────────────────────
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
  const [mediaFilter, setMediaFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [calendarDateFilter, setCalendarDateFilter] = useState(''); // from heatmap click

  // Tabs
  const [activeTab, setActiveTab] = useState('gallery');
  const [albumView, setAlbumView] = useState(null); // null = all albums, string = specific person

  // Video upload queue
  const [videoQueue, setVideoQueue] = useState([]);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [videoTagInput, setVideoTagInput] = useState('');
  const [videoPeopleInput, setVideoPeopleInput] = useState('');

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const isCloudHost = window.location.hostname.includes('github.io');
  const workerUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;

  useEffect(() => { if (!semanticMode) fetchPhotos(); }, [searchTerm, semanticMode]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      if (isCloudHost) {
        const res = await fetch('./catalog.json');
        if (!res.ok) throw new Error('Catalog not found');
        const allData = await res.json();
        const filtered = searchTerm
          ? allData.filter(r =>
              r.people.some(p=>p.toLowerCase().includes(searchTerm.toLowerCase()))||
              r.tags.some(t=>t.toLowerCase().includes(searchTerm.toLowerCase())))
          : allData;
        setPhotos(filtered);
        setAllMedia(allData);
      } else {
        const url = searchTerm ? `/api/photos?q=${encodeURIComponent(searchTerm)}` : '/api/photos';
        const res = await fetch(url);
        const data = await res.json();
        setPhotos(data);
        if (!searchTerm) { setAllMedia(data); extractPopularTags(data); }
      }
    } catch (e) { console.error(e); setPhotos([]); }
    setLoading(false);
  };

  const extractPopularTags = (data) => {
    const counts = {};
    data.forEach(p => {
      p.people.forEach(x => counts[x]=(counts[x]||0)+1);
      p.tags.forEach(x => counts[x]=(counts[x]||0)+1);
    });
    setPopularTags(Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]));
  };

  // All unique people sorted by media count
  const allPeople = (() => {
    const counts = {};
    allMedia.forEach(m => (m.people||[]).forEach(p => { counts[p]=(counts[p]||0)+1; }));
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  })();

  // Client-side filtering
  const filteredPhotos = photos.filter(m => {
    if (mediaFilter!=='all' && (m.media_type||'photo')!==mediaFilter) return false;
    if (selectedPerson && !(m.people||[]).map(p=>p.toLowerCase()).includes(selectedPerson.toLowerCase())) return false;
    const sortDt = m.captured_at || m.upload_timestamp;
    if (dateFrom && sortDt < dateFrom) return false;
    if (dateTo && sortDt > dateTo+'T23:59:59') return false;
    if (calendarDateFilter && dateKey(sortDt) !== calendarDateFilter) return false;
    return true;
  });

  // Group by capture date
  const dateGroups = (() => {
    const groups = {};
    filteredPhotos.forEach(item => {
      const k = dateKey(item.captured_at || item.upload_timestamp);
      if (!groups[k]) groups[k] = { label: fmtDateLong(item.captured_at||item.upload_timestamp), items: [] };
      groups[k].items.push(item);
    });
    return Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));
  })();

  const handleSemanticSearch = async (e) => {
    if (e) e.preventDefault();
    if (!semanticMode) return;
    setLoading(true);
    try {
      let endpoint, body, headers = {};
      if (imageFile) { endpoint='/api/search/semantic_image'; const fd=new FormData(); fd.append('file',imageFile); body=fd; }
      else if (searchTerm) { endpoint='/api/search/semantic_text'; body=JSON.stringify({query:searchTerm}); headers={'Content-Type':'application/json'}; }
      else { setLoading(false); return; }
      const res = await fetch(endpoint, { method:'POST', headers, body });
      const data = await res.json();
      if (data.error) addToast?.(data.error,'error');
      else if (data.success) setPhotos(data.photos||[]);
    } catch (_) { addToast?.('Semantic search failed.','error'); }
    setLoading(false);
  };

  const clearImageSearch = () => {
    setImageFile(null); setImagePreview('');
    if (!searchTerm) setSemanticMode(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (isVideoFile(file.name)) {
      setVideoQueue([{id:Date.now(),file}]); setShowVideoModal(true);
    } else {
      setImageFile(file); setImagePreview(URL.createObjectURL(file));
      setSemanticMode(true); setSearchTerm('');
    }
  };

  const uploadVideoQueue = async () => {
    if (!videoQueue.length) return;
    setIsUploadingVideos(true);
    const globalTags = videoTagInput.split(',').map(t=>t.trim()).filter(Boolean);
    const globalPeople = videoPeopleInput.split(',').map(p=>p.trim().toLowerCase()).filter(Boolean);
    let ok = 0;
    for (const item of videoQueue) {
      try {
        const fd = new FormData();
        fd.append('video', item.file);
        fd.append('tags', JSON.stringify(globalTags));
        fd.append('people', JSON.stringify(globalPeople));
        const res = await fetch('http://localhost:3000/api/upload_video', {method:'POST',body:fd});
        if (res.ok) ok++;
      } catch (e) { console.error(e); }
    }
    setIsUploadingVideos(false); setShowVideoModal(false);
    setVideoQueue([]); setVideoTagInput(''); setVideoPeopleInput('');
    addToast?.(`Uploaded ${ok}/${videoQueue.length} videos!`, ok>0?'success':'error');
    if (!isCloudHost) fetchPhotos();
  };

  const handleDownload = async (item) => {
    try {
      let url = '';
      if (isCloudHost && workerUrl && item.telegram_file_id) url=`${workerUrl}?file_id=${item.telegram_file_id}`;
      else if (!isCloudHost) { const r=await fetch(`/api/photo_url/${item.telegram_file_id}`); url=(await r.json()).url; }
      else { window.open(item.telegram_embed_url?.replace('?embed=1',''),'_blank'); return; }
      if (url) {
        const blob = await (await fetch(url)).blob();
        const a = Object.assign(document.createElement('a'),{
          href: URL.createObjectURL(blob),
          download: `media_${item.id}${item.media_type==='video'?'.mp4':'.jpg'}`
        });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch (_) { addToast?.('Download failed.','error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this item from the gallery?')) return;
    try {
      if ((await fetch(`/api/delete_photo/${id}`,{method:'DELETE'})).ok) {
        setPhotos(p=>p.filter(x=>x.id!==id)); setAllMedia(p=>p.filter(x=>x.id!==id));
        addToast?.('Deleted.','success');
      } else addToast?.('Failed to delete.','error');
    } catch (_) { addToast?.('Error.','error'); }
  };

  const getThumbSrc = (item) => {
    if (item.local_thumb_path) return `${import.meta.env.BASE_URL}${item.local_thumb_path.replace('public/','')}`;
    if (item.local_cache_path) return `${import.meta.env.BASE_URL}${item.local_cache_path}`;
    return null; // no local file — will use Telegram fallback
  };

  const getFullSrc = (item) => {
    if (isCloudHost && workerUrl && item.telegram_file_id) return `${workerUrl}?file_id=${item.telegram_file_id}`;
    const fb = fallbackUrls[item.id];
    if (fb && fb !== 'loading') return fb;
    if (item.local_cache_path) return `/${item.local_cache_path}`;
    return null;
  };

  const triggerFallback = useCallback((item) => {
    if (fallbackUrls[item.id]) return;
    setFallbackUrls(p=>({...p,[item.id]:'loading'}));
    if (isCloudHost && workerUrl) {
      setFallbackUrls(p=>({...p,[item.id]:`${workerUrl}?file_id=${item.telegram_file_id}`}));
    } else if (!isCloudHost && item.telegram_file_id) {
      fetch(`/api/photo_url/${item.telegram_file_id}`)
        .then(r=>r.json()).then(d=>{ if(d.url) setFallbackUrls(p=>({...p,[item.id]:d.url})); });
    }
  }, [fallbackUrls, isCloudHost, workerUrl]);

  const tgLink = (item) => item.telegram_link || item.telegram_embed_url?.replace('?embed=1','') || '#';

  // ── MEDIA CARD ──────────────────────────────────────────────────────────────
  const MediaCard = ({ item }) => {
    const isVideo = (item.media_type||'photo') === 'video';
    const fallback = fallbackUrls[item.id];
    const thumbSrc = (fallback && fallback!=='loading') ? fallback : getThumbSrc(item);

    return (
      <div className="break-inside-avoid border-2 border-ink bg-white group mb-6 hover:shadow-[6px_6px_0_#2c2e33] transition-shadow">
        {/* Media area */}
        <div className="relative bg-[#0f0f0f] overflow-hidden">
          {isVideo && !thumbSrc ? (
            <div className="w-full aspect-square flex flex-col items-center justify-center bg-[#1a1a2e]">
              <Video className="w-14 h-14 text-[#e94560] mb-1"/>
              <span className="text-xs text-gray-400 font-mono">Video</span>
            </div>
          ) : thumbSrc ? (
            <img src={thumbSrc} onError={()=>item.telegram_file_id && triggerFallback(item)}
              alt="" className="w-full h-auto object-cover aspect-square md:aspect-auto" loading="lazy"/>
          ) : (
            <div className="w-full aspect-square flex items-center justify-center bg-gray-100 cursor-pointer"
              onClick={()=>item.telegram_file_id && triggerFallback(item)}>
              <Camera className="w-12 h-12 text-pencil/30"/>
            </div>
          )}

          {isVideo && (
            <div className="absolute top-2 left-2 bg-[#e94560] text-white text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
              <Play className="w-3 h-3"/> VIDEO
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-white/92 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <div className="flex gap-2 flex-wrap justify-center p-4">
              <button onClick={e=>{e.stopPropagation();setSelectedPhoto(item);}}
                className="sketch-button p-3 bg-white hover:bg-highlight" title={isVideo?'Play':'Expand'}>
                {isVideo ? <Play className="w-5 h-5"/> : <Maximize className="w-5 h-5"/>}
              </button>
              <button onClick={e=>{e.stopPropagation();handleDownload(item);}}
                className="sketch-button p-3 bg-white hover:bg-highlight"><Download className="w-5 h-5"/></button>
              <a href={tgLink(item)} target="_blank" rel="noopener noreferrer"
                className="sketch-button p-3 bg-white hover:bg-highlight flex items-center justify-center" onClick={e=>e.stopPropagation()}>
                <ExternalLink className="w-5 h-5"/>
              </a>
              {!isCloudHost && (
                <button onClick={()=>handleDelete(item.id)}
                  className="sketch-button p-3 bg-white hover:bg-errorInk hover:text-white">
                  <Trash2 className="w-5 h-5"/>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 border-t-2 border-ink">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(item.tags||[]).slice(0,3).map((t,i)=>(
              <span key={i} className="text-[11px] font-bold px-2 py-0.5 bg-paper border border-ink/30 text-ink">#{t}</span>
            ))}
          </div>
          {(item.people||[]).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {item.people.map((p,i)=>(
                <button key={i} onClick={()=>{setSelectedPerson(p===selectedPerson?'':p);setActiveTab('gallery');}}
                  className={`text-sm font-bold hover:underline ${selectedPerson===p?'text-highlight':'text-primary'}`}>
                  @{p}
                </button>
              ))}
            </div>
          )}
          <div className="text-[11px] text-pencil font-mono flex items-center gap-1 mt-1">
            <Calendar className="w-3 h-3"/>
            {fmtDateShort(item.captured_at || item.upload_timestamp)}
          </div>
        </div>
      </div>
    );
  };

  // ── ALBUMS TAB ──────────────────────────────────────────────────────────────
  const AlbumsTab = () => {
    if (albumView) {
      const personMedia = allMedia.filter(m=>(m.people||[]).map(p=>p.toLowerCase()).includes(albumView.toLowerCase()));
      return (
        <div>
          <button onClick={()=>setAlbumView(null)}
            className="sketch-button mb-6 px-4 py-2 font-bold flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4"/> Back to Albums
          </button>
          <div className="mb-4 flex items-center gap-3">
            <UserIcon className="w-6 h-6 text-primary"/>
            <h2 className="text-2xl font-bold font-sketch text-ink capitalize">{albumView}</h2>
            <span className="text-sm font-mono text-pencil bg-paper border border-ink/30 px-2 py-0.5">{personMedia.length} items</span>
          </div>
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6">
            {personMedia.map(item=><MediaCard key={item.id} item={item}/>)}
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 className="text-xl font-bold font-sketch text-ink mb-6">Albums — sorted by most photos</h2>
        {allPeople.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-pencil">
            <Users className="w-20 h-20 mb-4 opacity-20"/>
            <p className="text-2xl font-bold">No People Identified Yet</p>
            <p className="text-sm mt-2">Upload photos through the AI daemon to identify faces.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {allPeople.map(({ name, count }) => {
              const cover = allMedia.find(m=>(m.people||[]).map(p=>p.toLowerCase()).includes(name.toLowerCase()));
              const thumb = cover ? getThumbSrc(cover) : null;
              return (
                <button key={name} onClick={()=>setAlbumView(name)}
                  className="group border-2 border-ink bg-white hover:-translate-y-1 hover:shadow-[6px_6px_0_#2c2e33] transition-all text-left">
                  <div className="relative w-full aspect-square bg-gray-100 overflow-hidden border-b-2 border-ink">
                    {thumb
                      ? <img src={thumb} alt={name} className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-12 h-12 text-pencil/30"/></div>
                    }
                    <div className="absolute bottom-0 inset-x-0 bg-ink/80 text-white text-xs font-bold py-1 px-2 text-center">
                      {count} item{count!==1?'s':''}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-bold text-ink capitalize font-sketch text-base truncate">{name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    { id:'gallery', label:'Gallery', Icon:ImageIcon },
    { id:'albums',  label:'Albums',  Icon:Users },
    { id:'map',     label:'Map',     Icon:MapPin },
    { id:'calendar',label:'Calendar',Icon:Calendar },
  ];

  const hasActiveFilters = dateFrom || dateTo || selectedPerson || calendarDateFilter || searchTerm || mediaFilter !== 'all';

  return (
    <div className="flex flex-col space-y-6">
      {/* ─── SEARCH BAR ───────────────────────────────── */}
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <form onSubmit={handleSemanticSearch} className="flex items-stretch gap-2">
          <div className={`relative flex-1 flex items-center border-2 border-ink bg-white ${semanticMode?'border-primary bg-[#eff6ff]':''}`}>
            {semanticMode
              ? <Brain className="absolute left-4 w-5 h-5 text-primary animate-pulse"/>
              : <Search className="absolute left-4 w-5 h-5 text-pencil"/>}
            {imagePreview ? (
              <div className="flex items-center flex-1 py-2 pl-12 pr-3">
                <img src={imagePreview} alt="" className="w-9 h-9 object-cover border border-ink mr-2"/>
                <span className="text-base font-bold truncate max-w-[160px]">{imageFile.name}</span>
                <button type="button" onClick={clearImageSearch} className="ml-2 text-pencil hover:text-errorInk"><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                placeholder={semanticMode?"Describe a scene...":"Search people, tags, places..."}
                className="w-full bg-transparent py-4 pl-12 pr-3 text-xl outline-none text-ink placeholder:text-pencil/40 font-sketch"/>
            )}
            <button type="button" onClick={()=>fileInputRef.current?.click()}
              className="absolute right-3 p-1.5 hover:bg-gray-100 rounded text-pencil" title="Upload / Image Search">
              <ImageIcon className="w-5 h-5"/>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden"/>
          </div>
          {!isCloudHost && (
            <button type="button" onClick={()=>setSemanticMode(!semanticMode)}
              className={`sketch-button px-5 text-lg font-bold flex items-center gap-1.5 ${semanticMode?'bg-highlight translate-y-[2px]':''}`}>
              <Brain className="w-5 h-5"/> AI
            </button>
          )}
          {semanticMode && (
            <button type="submit" className="sketch-button bg-primary text-white px-6 text-lg font-bold">Search</button>
          )}
        </form>

        {popularTags.length > 0 && !semanticMode && (
          <div className="flex flex-wrap gap-2 justify-center">
            {popularTags.map(tag=>(
              <button key={tag} onClick={()=>setSearchTerm(searchTerm===tag?'':tag)}
                className={`sketch-button px-3 py-1 text-base font-bold ${searchTerm===tag?'bg-highlight translate-y-[2px]':''}`}>
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── TABS ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex border-2 border-ink overflow-hidden">
          {tabs.map(({id,label,Icon})=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              className={`px-4 py-2.5 font-bold text-base flex items-center gap-2 transition-colors ${activeTab===id?'bg-ink text-paper':'bg-paper text-ink hover:bg-gray-100'}`}>
              <Icon className="w-4 h-4"/>{label}
            </button>
          ))}
        </div>

        {activeTab === 'gallery' && (
          <div className="flex flex-wrap gap-2 items-center">
            {/* Media type filter */}
            <div className="flex border-2 border-ink overflow-hidden divide-x-2 divide-ink">
              {[['all','All',Filter],['photo','Photos',ImageIcon],['video','Videos',Video]].map(([v,l,I])=>(
                <button key={v} onClick={()=>setMediaFilter(v)}
                  className={`px-3 py-1.5 font-bold text-sm flex items-center gap-1 ${mediaFilter===v?'bg-ink text-paper':'bg-paper text-ink hover:bg-gray-100'}`}>
                  <I className="w-3.5 h-3.5"/>{l}
                </button>
              ))}
            </div>

            {/* Date range toggle */}
            <button onClick={()=>setShowDateFilter(!showDateFilter)}
              className={`sketch-button px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 ${showDateFilter||dateFrom||dateTo?'bg-highlight translate-y-[1px]':''}`}>
              <Calendar className="w-4 h-4"/> Date {showDateFilter?<ChevronUp className="w-3 h-3"/>:<ChevronDown className="w-3 h-3"/>}
            </button>

            {/* Active filter badges */}
            {selectedPerson && (
              <button onClick={()=>setSelectedPerson('')}
                className="sketch-button px-3 py-1.5 text-sm font-bold flex items-center gap-1 bg-primary/10 border-primary text-primary">
                @{selectedPerson} <X className="w-3 h-3"/>
              </button>
            )}
            {calendarDateFilter && (
              <button onClick={()=>setCalendarDateFilter('')}
                className="sketch-button px-3 py-1.5 text-sm font-bold flex items-center gap-1 bg-highlight border-ink">
                {fmtDateShort(calendarDateFilter)} <X className="w-3 h-3"/>
              </button>
            )}

            {/* Video upload */}
            {!isCloudHost && (
              <button onClick={()=>videoInputRef.current?.click()}
                className="sketch-button px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 bg-[#0f0f0f] text-white border-[#e94560] hover:bg-[#e94560]">
                <Video className="w-4 h-4"/> Upload Video
              </button>
            )}
            <input type="file" ref={videoInputRef} onChange={e=>e.target.files.length&&(setVideoQueue(Array.from(e.target.files).filter(f=>isVideoFile(f.name)).map(f=>({id:Date.now()+Math.random(),file:f}))),setShowVideoModal(true))} accept="video/*" multiple className="hidden"/>
          </div>
        )}
      </div>

      {/* Date range panel */}
      {showDateFilter && activeTab==='gallery' && (
        <div className="border-2 border-[#fde047] bg-[#fffbea] p-4 flex flex-wrap gap-5 items-end animate-slide-up">
          {[['From', dateFrom, setDateFrom], ['To', dateTo, setDateTo]].map(([lbl,val,set])=>(
            <div key={lbl}>
              <label className="block text-xs font-bold text-pencil uppercase mb-1">{lbl} Date</label>
              <input type="date" value={val} onChange={e=>set(e.target.value)}
                className="border-2 border-ink px-3 py-2 bg-white text-ink font-mono text-sm outline-none"/>
            </div>
          ))}
          {(dateFrom||dateTo) && (
            <button onClick={()=>{setDateFrom('');setDateTo('');}}
              className="sketch-button px-3 py-2 text-sm font-bold text-errorInk border-errorInk flex items-center gap-1">
              <X className="w-4 h-4"/> Clear
            </button>
          )}
        </div>
      )}

      {/* ─── GALLERY TAB ─────────────────────────────── */}
      {activeTab === 'gallery' && (
        <>
          {loading && !searchTerm && !semanticMode ? (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6">
              {[...Array(8)].map((_,i)=>(
                <div key={i} className="break-inside-avoid border-2 border-ink animate-pulse mb-6">
                  <div className="w-full h-56 bg-gray-200"/>
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-300 w-1/3"/>
                    <div className="h-2.5 bg-gray-200 w-1/2"/>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-pencil">
              <ImageIcon className="w-20 h-20 mb-4 opacity-20"/>
              <p className="text-2xl font-bold">No media found</p>
              {hasActiveFilters && (
                <button onClick={()=>{setDateFrom('');setDateTo('');setSelectedPerson('');setCalendarDateFilter('');setSearchTerm('');setMediaFilter('all');}}
                  className="mt-4 sketch-button px-5 py-2 font-bold text-errorInk border-errorInk">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {dateGroups.map(([key, group])=>(
                <div key={key}>
                  {/* Date separator */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="flex-shrink-0 flex items-center gap-2 bg-[#2c2e33] text-[#fdfbf7] px-4 py-2 font-bold font-mono text-sm border-2 border-[#2c2e33]">
                      <Calendar className="w-4 h-4 text-[#fde047]"/>
                      {group.label}
                    </div>
                    <div className="flex-1 border-t-2 border-dashed border-ink/25"/>
                    <span className="text-sm font-mono text-pencil flex-shrink-0">
                      {group.items.length} item{group.items.length!==1?'s':''}
                    </span>
                  </div>
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6">
                    {group.items.map(item=><MediaCard key={item.id} item={item}/>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── ALBUMS TAB ──────────────────────────────── */}
      {activeTab === 'albums' && <AlbumsTab/>}

      {/* ─── MAP TAB ─────────────────────────────────── */}
      {activeTab === 'map' && <MapView media={allMedia}/>}

      {/* ─── CALENDAR TAB ────────────────────────────── */}
      {activeTab === 'calendar' && (
        <CalendarHeatmap
          media={allMedia}
          onDateClick={key=>{
            setCalendarDateFilter(key);
            setActiveTab('gallery');
          }}
        />
      )}

      {/* ─── VIDEO UPLOAD MODAL ──────────────────────── */}
      {showVideoModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-4">
          <div className="border-2 border-ink bg-paper w-full max-w-xl max-h-[90vh] flex flex-col shadow-[8px_8px_0_#2c2e33]">
            <div className="p-5 border-b-2 border-ink flex items-center justify-between bg-[#0f0f0f] text-white">
              <h2 className="text-xl font-bold flex items-center gap-2"><Video className="w-6 h-6 text-[#e94560]"/> Upload Videos to Telegram</h2>
              <button onClick={()=>{setShowVideoModal(false);setVideoQueue([]);}} className="hover:text-[#e94560]"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {videoQueue.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-pencil uppercase mb-2 flex items-center gap-1"><GripVertical className="w-4 h-4"/> Drag to reorder</p>
                  <DraggableQueue items={videoQueue} onReorder={setVideoQueue} onRemove={i=>setVideoQueue(q=>q.filter((_,j)=>j!==i))}/>
                  <button onClick={()=>videoInputRef.current?.click()} className="mt-2 w-full sketch-button py-2 text-sm font-bold text-pencil">+ Add More</button>
                </div>
              )}
              {[['Tags (comma separated)', videoTagInput, setVideoTagInput, 'Birthday, Family, Vacation...'],
                ['People in these videos', videoPeopleInput, setVideoPeopleInput, 'Mom, Dad, Prasad...']
              ].map(([lbl,val,set,ph])=>(
                <div key={lbl}>
                  <label className="block text-xs font-bold text-pencil uppercase mb-1.5">{lbl}</label>
                  <input type="text" value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                    className="w-full border-2 border-ink px-4 py-3 bg-white text-ink outline-none focus:border-primary"/>
                </div>
              ))}
            </div>
            <div className="p-5 border-t-2 border-ink">
              <button onClick={uploadVideoQueue} disabled={isUploadingVideos || !videoQueue.length}
                className="w-full sketch-button py-4 bg-[#0f0f0f] text-white border-[#e94560] font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#e94560] disabled:opacity-50 transition-colors">
                {isUploadingVideos
                  ? <><Loader2 className="w-5 h-5 animate-spin"/> Uploading…</>
                  : <><Upload className="w-5 h-5"/> Upload {videoQueue.length} Video{videoQueue.length!==1?'s':''}  to Telegram</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FULLSCREEN MODAL ────────────────────────── */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4 md:p-8" onClick={()=>setSelectedPhoto(null)}>
          <div className="flex flex-col md:flex-row w-full max-w-7xl h-full max-h-[90vh] border-2 border-ink bg-paper shadow-[8px_8px_0_#2c2e33] overflow-hidden animate-slide-up relative"
            onClick={e=>e.stopPropagation()}>
            <button className="sketch-button absolute top-4 right-4 p-2 bg-white z-[110]" onClick={()=>setSelectedPhoto(null)}>
              <X className="w-5 h-5"/>
            </button>

            {/* Media display */}
            <div className="relative flex-1 bg-[#0f0f0f] border-b-2 md:border-b-0 md:border-r-2 border-ink flex items-center justify-center p-4">
              {(selectedPhoto.media_type||'photo')==='video' ? (
                isCloudHost ? (
                  <div className="flex flex-col items-center gap-5 text-white text-center">
                    <Video className="w-20 h-20 text-[#e94560]"/>
                    <p className="text-lg font-bold">Video is on Telegram</p>
                    <a href={tgLink(selectedPhoto)} target="_blank" rel="noopener noreferrer"
                      className="sketch-button px-6 py-3 bg-[#e94560] text-white font-bold flex items-center gap-2">
                      <ExternalLink className="w-5 h-5"/> Open in Telegram
                    </a>
                  </div>
                ) : (
                  <video src={getFullSrc(selectedPhoto)||''} controls autoPlay={false}
                    className="max-w-full max-h-full" style={{maxHeight:'70vh'}}/>
                )
              ) : (
                <img src={getFullSrc(selectedPhoto)||''}
                  onError={()=>selectedPhoto.telegram_file_id&&triggerFallback(selectedPhoto)}
                  className="max-w-full max-h-full object-contain" alt="Fullscreen"/>
              )}
            </div>

            {/* Metadata sidebar */}
            <div className="w-full md:w-[400px] md:min-w-[400px] bg-paper p-7 flex flex-col overflow-y-auto">
              <h3 className="text-2xl font-bold font-sketch text-ink mb-6 pb-3 border-b-2 border-dashed border-ink/30">
                {(selectedPhoto.media_type==='video') ? '🎥 About this Video' : '📷 All About This Photo'}
              </h3>

              <div className="space-y-6 flex-1">
                {/* People */}
                {selectedPhoto.people?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-pencil uppercase mb-3 flex items-center gap-2">
                      <UserIcon className="w-4 h-4"/> People in this {selectedPhoto.media_type==='video'?'Video':'Photo'}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhoto.people.map(p=>(
                        <button key={p} onClick={()=>{setAlbumView(p);setActiveTab('albums');setSelectedPhoto(null);}}
                          className="px-3 py-1.5 border-2 border-ink bg-highlight text-ink font-bold hover:shadow-[2px_2px_0_#2c2e33] transition-shadow">
                          @{p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedPhoto.tags?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-pencil uppercase mb-3 flex items-center gap-2">
                      <Tag className="w-4 h-4"/> Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhoto.tags.map(t=>(
                        <span key={t} onClick={()=>{setSearchTerm(t);setSelectedPhoto(null);}}
                          className="px-2 py-1 border border-ink/40 bg-white text-ink text-sm font-bold cursor-pointer hover:bg-highlight transition-colors">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date */}
                <div>
                  <h4 className="text-sm font-bold text-pencil uppercase mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4"/> Captured
                  </h4>
                  <p className="text-ink font-mono text-sm border-2 border-ink p-2 bg-white inline-block">
                    {new Date(selectedPhoto.captured_at||selectedPhoto.upload_timestamp).toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Location */}
                {selectedPhoto.location_name && (
                  <div>
                    <h4 className="text-sm font-bold text-pencil uppercase mb-2 flex items-center gap-2">
                      <MapPin className="w-4 h-4"/> Location
                    </h4>
                    <a
                      href={`https://www.google.com/maps?q=${selectedPhoto.gps_lat},${selectedPhoto.gps_lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 border-2 border-ink bg-white text-ink font-bold hover:bg-highlight transition-colors text-sm"
                    >
                      <MapPin className="w-4 h-4 text-errorInk"/> {selectedPhoto.location_name}
                    </a>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-6 pt-4 border-t-2 border-dashed border-ink/30 grid grid-cols-2 gap-3">
                <button onClick={()=>handleDownload(selectedPhoto)}
                  className="sketch-button flex items-center justify-center py-3 bg-white font-bold">
                  <Download className="w-5 h-5 mr-2"/> Save
                </button>
                <a href={tgLink(selectedPhoto)} target="_blank" rel="noopener noreferrer"
                  className="sketch-button flex items-center justify-center py-3 bg-primary text-white hover:text-ink font-bold">
                  <ExternalLink className="w-5 h-5 mr-2"/> Telegram
                </a>
              </div>
              {!isCloudHost && (
                <button onClick={()=>{handleDelete(selectedPhoto.id);setSelectedPhoto(null);}}
                  className="mt-3 sketch-button flex items-center justify-center py-3 w-full border-errorInk text-errorInk hover:bg-errorInk hover:text-white font-bold">
                  <Trash2 className="w-5 h-5 mr-2"/> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

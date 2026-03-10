import React, { useState, useEffect } from 'react';
import { Play, Square, Check, X, User as UserIcon, Loader2, Tag, Maximize, Database, Inbox, CloudUpload, Globe, Trash2 } from 'lucide-react';

export default function ReviewQueue({ addToast }) {
  const [isProcessorRunning, setIsProcessorRunning] = useState(false);
  const [queue, setQueue] = useState([]);
  const [pendingLabels, setPendingLabels] = useState({});
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [globalEventTag, setGlobalEventTag] = useState('');
  const [showUnlabeledOnly, setShowUnlabeledOnly] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [daemonSettings, setDaemonSettings] = useState({ auto_approve: 'true', auto_approve_tag: '' });
  const [isDeploying, setIsDeploying] = useState(false);
  const [daemonLogs, setDaemonLogs] = useState([]);
  const [unpublishedMedia, setUnpublishedMedia] = useState([]);
  const [fallbackUrls, setFallbackUrls] = useState({});
  const [stats, setStats] = useState(null);
  const [editingCloudImage, setEditingCloudImage] = useState(null);

  const fetchStats = async () => {
      try {
          const res = await fetch('http://localhost:3000/api/stats');
          setStats(await res.json());
      } catch(e) {}
  };

  const fetchLogs = async () => {
      try {
          const res = await fetch('http://localhost:3000/api/processor/logs');
          setDaemonLogs(await res.json());
      } catch(e) {}
  };

  const fetchUnpublished = async () => {
      try {
          const res = await fetch('http://localhost:3000/api/unpublished_media');
          setUnpublishedMedia(await res.json());
      } catch(e) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/settings');
      const data = await res.json();
      setDaemonSettings({ 
        auto_approve: data.auto_approve || 'true', 
        auto_approve_tag: data.auto_approve_tag || '' 
      });
    } catch(e) {}
  };

  const updateSetting = async (key, value) => {
    setDaemonSettings(prev => ({ ...prev, [key]: value }));
    try {
      await fetch('http://localhost:3000/api/settings', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ [key]: value })
      });
    } catch(e) {}
  };

  const deployToGithub = async () => {
      setIsDeploying(true);
      if (addToast) addToast("Starting GitHub deployment. This may take 10-30 seconds...", "info");
      try {
          const res = await fetch('http://localhost:3000/api/deploy_github', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
              if (addToast) addToast("Successfully published gallery to Cloud!", "success");
          } else {
              if (addToast) addToast("Deployment failed: " + data.error, "error");
          }
      } catch (e) {
          if (addToast) addToast("Failed to connect for deployment", "error");
      }
      setIsDeploying(false);
  };

  useEffect(() => {
    fetchSettings();
    checkProcessorStatus();
    fetchQueue();
    fetchLogs();
    fetchUnpublished();
    fetchStats();
    const interval = setInterval(() => {
      checkProcessorStatus();
      fetchQueue();
      fetchLogs();
      fetchUnpublished();
      fetchStats();
    }, 5000); // Polling every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkProcessorStatus = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/processor/status');
      const data = await res.json();
      setIsProcessorRunning(data.running);
    } catch (e) { console.error("Status check failed", e); }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/review_queue');
      const data = await res.json();
      setQueue(data);
    } catch (e) { console.error("Fetch queue failed", e); }
  };

  const toggleProcessor = async () => {
    try {
      const endpoint = isProcessorRunning ? '/api/processor/stop' : '/api/processor/start';
      await fetch(`http://localhost:3000${endpoint}`, { method: 'POST' });
      setIsProcessorRunning(!isProcessorRunning);
      fetchQueue();
    } catch (e) {
      console.error("Toggle failed", e);
    }
  };

  const handleLabelChange = (queueId, faceIndex, val) => {
    // Format name spaces with underscores
    const formatted = val.replace(/\s+/g, '_');
    setPendingLabels(prev => ({
      ...prev,
      [`${queueId}-${faceIndex}`]: formatted
    }));
  };


  const approvePhoto = async (item) => {
    // Gather all faces for this photo
    const people = item.detected_faces.map((face, idx) => {
        const customName = pendingLabels[`${item.id}-${idx}`];
        return customName || face.name;
    }).filter(p => !p.toLowerCase().includes('unknown'));

    // Upload Final
    try {
      const res = await fetch('http://localhost:3000/api/upload_final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absolutePath: item.file_path,
          localPath: `tests/${item.file_path.split(/[\/\\]/).pop()}`, // Naive mapping
          people: people.map(p => p.toLowerCase()),
          tags: [item.ai_caption],
          queueId: item.id
        })
      });
      if (res.ok) {
        setQueue(prev => prev.filter(q => q.id !== item.id));
        setSelectedItems(prev => { const n = new Set(prev); n.delete(item.id); return n; });
        if (addToast) addToast("Photo Approved & Synced to Cloud!", "success");
      }
    } catch (error) {
      console.error("Failed to approve photo", error);
      if (addToast) addToast("Failed to approve photo", "error");
    }
  };

  const discardPhoto = async (id) => {
    try {
      await fetch(`http://localhost:3000/api/review_queue/${id}`, { method: 'DELETE' });
      setQueue(prev => prev.filter(q => q.id !== id));
      setSelectedItems(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (addToast) addToast("Photo Discarded & Permanently Deleted", "info");
    } catch (e) { 
        console.error("Failed to discard", e); 
        if (addToast) addToast("Failed to discard photo", "error");
    }
  };

  const toggleSelect = (id) => {
      const newSet = new Set(selectedItems);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedItems(newSet);
  };

  const applyGlobalTag = () => {
      if (!globalEventTag.trim()) return;
      const formattedTag = globalEventTag.trim().replace(/\s+/g, '_');
      const targetItems = selectedItems.size > 0 ? Array.from(selectedItems) : queue.map(q => q.id);
      
      setPendingLabels(prev => {
          const next = { ...prev };
          targetItems.forEach(id => {
              const currentCaption = next[`caption-${id}`] !== undefined ? next[`caption-${id}`] : (queue.find(q => q.id === id)?.ai_caption || '');
              const tagString = `#${formattedTag}`;
              if (!currentCaption.includes(tagString)) {
                  next[`caption-${id}`] = currentCaption ? `${currentCaption} ${tagString}` : tagString;
              }
          });
          return next;
      });
      if (addToast) addToast(`Applied #${formattedTag} to ${targetItems.length} photos`, 'info');
      setGlobalEventTag('');
  };

  const handleBulkApprove = async () => {
      if (selectedItems.size === 0) return;
      setIsProcessingBulk(true);
      const itemsToApprove = queue.filter(q => selectedItems.has(q.id));
      let successCount = 0;
      
      for (const item of itemsToApprove) {
          const people = item.detected_faces.map((face, idx) => {
              const customName = pendingLabels[`${item.id}-${idx}`];
              return customName || face.name;
          }).filter(p => !p.toLowerCase().includes('unknown'));
          const caption = pendingLabels[`caption-${item.id}`] !== undefined ? pendingLabels[`caption-${item.id}`] : item.ai_caption;
          
          try {
              const res = await fetch('http://localhost:3000/api/upload_final', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      absolutePath: item.file_path,
                      localPath: `tests/${item.file_path.split(/[\/\\]/).pop()}`,
                      people: people.map(p => p.toLowerCase()),
                      tags: [caption],
                      queueId: item.id
                  })
              });
              if (res.ok) successCount++;
          } catch (e) { console.error(e); }
      }
      
      fetchQueue();
      setSelectedItems(new Set());
      setIsProcessingBulk(false);
      if (addToast) addToast(`Successfully approved ${successCount} photos!`, 'success');
  };

  const handleBulkDiscard = async () => {
      if (selectedItems.size === 0) return;
      setIsProcessingBulk(true);
      let successCount = 0;
      for (const id of selectedItems) {
          try {
              const res = await fetch(`http://localhost:3000/api/review_queue/${id}`, { method: 'DELETE' });
              if (res.ok) successCount++;
          } catch(e) {}
      }
      fetchQueue();
      setSelectedItems(new Set());
      setIsProcessingBulk(false);
      if (addToast) addToast(`Discarded ${successCount} photos.`, 'info');
  };

  const filteredQueue = queue.filter(item => {
      if (!showUnlabeledOnly) return true;
      return item.detected_faces.some((face, idx) => {
          const currentLabel = pendingLabels[`${item.id}-${idx}`] !== undefined ? pendingLabels[`${item.id}-${idx}`] : face.name;
          return !currentLabel || currentLabel === 'Unknown' || currentLabel.toLowerCase() === 'unknown face';
      });
  });

  const toggleSelectAll = () => {
      if (selectedItems.size === filteredQueue.length && filteredQueue.length > 0) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(filteredQueue.map(item => item.id)));
      }
  };

  const extractPopularQueueTags = () => {
      const counts = {};
      queue.forEach(item => {
          const tags = item.ai_caption.match(/#[a-zA-Z0-9_]+/g) || [];
          tags.forEach(t => counts[t] = (counts[t] || 0) + 1);
      });
      return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  };
  const popularQueueTags = extractPopularQueueTags();

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up">
              <div className="sketch-card p-4 bg-paper flex flex-col items-center justify-center text-center shadow-sketchHover border-ink border-2 hover:-translate-y-1 transition-transform">
                  <Database className="w-8 h-8 text-ink mb-2" />
                  <span className="text-3xl font-bold text-ink font-sketch">{stats.total_processed}</span>
                  <span className="text-xs font-bold font-mono text-pencil mt-1 uppercase">Total Photos</span>
              </div>
              <div className="sketch-card p-4 bg-[#fffbea] flex flex-col items-center justify-center text-center border-highlight sketch-border border-2 hover:-translate-y-1 transition-transform">
                  <CloudUpload className="w-8 h-8 text-highlight mb-2" />
                  <span className="text-3xl font-bold text-ink font-sketch">{stats.ready_for_cloud}</span>
                  <span className="text-xs font-bold font-mono text-pencil mt-1 uppercase">Ready for Cloud</span>
              </div>
              <div className="sketch-card p-4 bg-[#f0fdf4] flex flex-col items-center justify-center text-center border-successInk sketch-border border-2 hover:-translate-y-1 transition-transform">
                  <Globe className="w-8 h-8 text-successInk mb-2" />
                  <span className="text-3xl font-bold text-ink font-sketch">{stats.published}</span>
                  <span className="text-xs font-bold font-mono text-pencil mt-1 uppercase">Published</span>
              </div>
              <div className="sketch-card p-4 bg-[#fff0f2] flex flex-col items-center justify-center text-center border-errorInk sketch-border border-2 hover:-translate-y-1 transition-transform">
                  <Inbox className="w-8 h-8 text-errorInk mb-2" />
                  <span className="text-3xl font-bold text-ink font-sketch">{stats.pending_review}</span>
                  <span className="text-xs font-bold font-mono text-pencil mt-1 uppercase">Pending Review</span>
              </div>
          </div>
      )}

      <div className="sketch-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center sketch-font uppercase">
            Python AI Daemon
            <span className={`ml-3 w-4 h-4 rounded-full border-2 border-ink ${isProcessorRunning ? 'bg-successInk animate-pulse' : 'bg-errorInk'}`}></span>
          </h2>
          <p className="text-pencil text-sm mt-1 font-mono">Background task for Offline Face Detection & Clustering</p>
          
          <div className="mt-6 flex flex-col gap-3 bg-paper p-4 sketch-border border-2 shadow-inner">
             <label className="flex items-center gap-3 text-ink font-bold cursor-pointer hover:underline transition-colors w-fit">
                  <input 
                      type="checkbox" 
                      checked={daemonSettings.auto_approve === 'true'} 
                      onChange={(e) => updateSetting('auto_approve', e.target.checked ? 'true' : 'false')}
                      className="w-5 h-5 sketch-border cursor-pointer accent-highlight shadow-[1px_1px_0px_#2c2e33]"
                  />
                  Auto-Approve 100% Matches directly to Gallery
              </label>
              {daemonSettings.auto_approve === 'true' && (
                  <div className="flex flex-col md:flex-row md:items-center gap-2 mt-2 pt-2 border-t-2 border-dashed border-pencil/30">
                      <span className="text-sm font-bold text-pencil">Event Tag to append:</span>
                      <input 
                          type="text" 
                          placeholder="e.g. Birthday" 
                          value={daemonSettings.auto_approve_tag}
                          onChange={(e) => updateSetting('auto_approve_tag', e.target.value)}
                          className="sketch-border bg-white px-3 py-2 text-sm text-ink font-bold outline-none shadow-[2px_2px_0px_#2c2e33] w-full md:w-64 focus:shadow-sketchHover transition-shadow"
                      />
                  </div>
              )}
          </div>
        </div>
        
        <div className="flex flex-col gap-4 w-full md:w-auto">
            <button
              onClick={toggleProcessor}
              className={`sketch-button flex justify-center items-center px-6 py-4 font-bold text-lg ${
                isProcessorRunning 
                ? 'bg-[#fff0f2] text-errorInk' 
                : 'bg-[#f0fdf4] text-successInk'
              }`}
            >
              {isProcessorRunning ? <><Square className="w-5 h-5 mr-2" /> Stop Daemon</> : <><Play className="w-5 h-5 mr-2" /> Start Daemon</>}
            </button>
            <button 
                onClick={deployToGithub}
                disabled={isDeploying}
                className="sketch-button flex flex-col justify-center items-center px-6 py-3 font-bold text-lg bg-[#f0f8ff] text-[#0369a1] border-[#0369a1] disabled:opacity-50"
            >
                {isDeploying ? (
                    <><Loader2 className="w-6 h-6 animate-spin mb-1"/> Deploying...</>
                ) : (
                    <>
                        <span className="flex items-center">
                            <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24 4.8 4.8 0 0 0-3.3-1.6c-4.3-.4-5.2 2-6.5 2L3 14c-.6-2-.2-4.5 1.5-6.5S8.5 4 10.5 4a3.8 3.8 0 0 1 3.5 2 3.8 3.8 0 0 1 3.4-1.9A3.8 3.8 0 0 1 20 7c.4 1 0 2.5-1 3.2-1.5 2-4.5 2.5-4.5 2.5a5 5 0 0 0 1.5 3.5A3.5 3.5 0 0 1 15 22z"/></svg> 
                            Publish to Cloud
                        </span>
                        <span className="text-xs font-mono font-normal opacity-80 mt-1">Manual Git Sync</span>
                    </>
                )}
            </button>
        </div>
      </div>

      {/* Live Activity Console */}
      <div className="sketch-card p-4 bg-[#f8f9fa] border-2 border-pencil text-ink font-mono text-sm h-48 overflow-y-auto custom-scrollbar shadow-inner flex flex-col-reverse">
          {daemonLogs.length === 0 ? (
              <span className="opacity-50 text-pencil">Waiting for AI daemon output...</span>
          ) : (
              [...daemonLogs].reverse().map((log, i) => (
                  <div key={i} className="mb-1 flex gap-3 border-b border-dashed border-gray-200 pb-1">
                      <span className="text-pencil font-bold flex-shrink-0">[{new Date(log.time).toLocaleTimeString()}]</span> 
                      <span className={`${log.text.includes('ERROR') ? 'text-errorInk font-bold' : 'text-ink'}`}>{log.text}</span>
                  </div>
              ))
          )}
      </div>

      {/* Unpublished (Auto-Approved) Items Ready for Cloud */}
      {unpublishedMedia.length > 0 && (
          <div className="sketch-card p-6 bg-[#fffbea] border-highlight sketch-border border-2">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                  <h3 className="text-xl font-bold text-ink">
                      Ready for Cloud ({unpublishedMedia.length})
                      <span className="block text-sm font-mono text-pencil mt-1">These photos were auto-approved or manually approved, but haven't been pushed to GitHub yet.</span>
                  </h3>
                  <button 
                      onClick={deployToGithub}
                      disabled={isDeploying}
                      className="sketch-button px-6 py-2 bg-[#f0f8ff] text-[#0369a1] font-bold border-[#0369a1] disabled:opacity-50 whitespace-nowrap"
                  >
                      {isDeploying ? "Deploying..." : "Push to GitHub Now"}
                  </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                  {unpublishedMedia.map(m => (
                      <div 
                          key={m.id} 
                          onClick={() => setEditingCloudImage(m)}
                          className="w-32 h-32 flex-shrink-0 sketch-border border-2 bg-paper p-1 shadow-sketchHover group relative cursor-pointer hover:-translate-y-1 transition-transform"
                      >
                  <img 
                      src={fallbackUrls[m.id] ? fallbackUrls[m.id] : `http://localhost:3000/${m.local_cache_path}`} 
                      onError={() => {
                          if (!fallbackUrls[m.id] && m.telegram_file_id) {
                              setFallbackUrls(prev => ({...prev, [m.id]: 'loading'}));
                              fetch(`http://localhost:3000/api/photo_url/${m.telegram_file_id}`)
                                  .then(r => r.json())
                                  .then(data => { 
                                      if(data.url) {
                                          setFallbackUrls(prev => ({...prev, [m.id]: data.url})); 
                                      }
                                  });
                          }
                      }}
                      className="w-full h-full object-cover" 
                  />
                  {m.tags.length > 0 && (
                             <div className="absolute bottom-0 left-0 right-0 bg-ink/80 text-white text-xs p-1 truncate text-center">
                                 {m.tags[0]}
                             </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Manual Upload Area */}
      <div className="sketch-card p-8 bg-paper text-center">
        <h3 className="text-2xl font-bold text-ink mb-2">Upload Photos for AI Processing</h3>
        <p className="text-pencil font-mono text-sm mb-6">You can drop photos here manually, and the local AI daemon will pick them up to find faces.</p>
        
        <input 
          type="file" 
          multiple 
          accept="image/*"
          id="queue-upload"
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('photos', files[i]);
            }
            
            try {
                // UI feedback
                const btn = document.getElementById('upload-btn-text');
                btn.innerText = `Uploading ${files.length} photos...`;
                
                const res = await fetch('http://localhost:3000/api/upload_to_tests', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    btn.innerText = "+ Upload to Queue";
                    if (addToast) addToast(`Successfully queued ${files.length} photos! Start AI daemon to scan them.`, 'success');
                    else alert(`Successfully added ${files.length} photos to the processing directory! Start the AI Daemon to scan them.`);
                }
            } catch (err) {
                console.error("Upload failed", err);
                if (addToast) addToast("Failed to upload photos.", 'error');
                else alert("Failed to upload photos.");
            }
          }}
        />
        <label 
          htmlFor="queue-upload"
          className="sketch-button cursor-pointer inline-block px-8 py-4 bg-white text-ink text-xl font-bold"
        >
          <span id="upload-btn-text" className="font-medium">+ Upload to Queue</span>
        </label>
      </div>

      {/* Advanced Control Toolbar */}
      {queue.length > 0 && (
          <div className="sketch-card p-6 bg-paper flex flex-col gap-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-dashed border-ink pb-6">
                  <div className="flex items-center gap-4 w-full md:w-auto">
                      <Tag className="w-6 h-6 text-ink" />
                      <input 
                         type="text" 
                         placeholder="Event Name (e.g. Birthday 2024)" 
                         value={globalEventTag}
                         onChange={(e) => setGlobalEventTag(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') applyGlobalTag(); }}
                         className="sketch-border bg-white px-4 py-3 text-lg text-ink font-bold outline-none w-full md:w-72 shadow-inner focus:shadow-sketchHover transition-shadow"
                      />
                      <button 
                         onClick={applyGlobalTag}
                         className="sketch-button px-6 py-3 bg-highlight text-ink text-lg font-bold whitespace-nowrap"
                      >
                         Apply Tag {selectedItems.size > 0 ? `to ${selectedItems.size} Selected` : 'to All'}
                      </button>
                  </div>
                  
                  <label className="flex items-center gap-3 text-lg font-bold text-ink cursor-pointer hover:bg-gray-100 transition-colors bg-white px-4 py-3 sketch-border shadow-sketchHover">
                      <input 
                          type="checkbox" 
                          checked={showUnlabeledOnly} 
                          onChange={(e) => setShowUnlabeledOnly(e.target.checked)}
                          className="w-5 h-5 sketch-border text-ink cursor-pointer accent-ink"
                      />
                      Only Show Unlabeled Faces
                  </label>
              </div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <label className="flex items-center gap-3 text-xl font-bold text-ink cursor-pointer hover:underline transition-colors">
                      <input 
                          type="checkbox"
                          checked={selectedItems.size === filteredQueue.length && filteredQueue.length > 0}
                          onChange={toggleSelectAll}
                          className="w-6 h-6 sketch-border cursor-pointer accent-ink"
                      />
                      Select All ({selectedItems.size}/{filteredQueue.length})
                  </label>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto">
                      <button 
                         onClick={handleBulkDiscard}
                         disabled={selectedItems.size === 0 || isProcessingBulk}
                         className="sketch-button flex-1 md:flex-none px-6 py-3 bg-[#fff0f2] text-errorInk text-lg font-bold disabled:opacity-50 flex items-center justify-center border-errorInk"
                      >
                         Discard Selected
                      </button>
                      <button 
                         onClick={handleBulkApprove}
                         disabled={selectedItems.size === 0 || isProcessingBulk}
                         className="sketch-button flex-1 md:flex-none px-6 py-3 bg-[#f0fdf4] text-successInk text-lg font-bold disabled:opacity-50 flex items-center justify-center border-successInk"
                      >
                         {isProcessingBulk ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
                         Approve Selected
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {queue.length === 0 && (
            <div className="col-span-full py-20 text-center text-pencil text-2xl font-bold sketch-card bg-paper shadow-inner">
                {isProcessorRunning ? "Scanning for new photos in tests/..." : "Review queue is empty. Start the daemon or upload photos to process them."}
            </div>
        )}
        
        {filteredQueue.map(item => {
          const filename = item.file_path.split(/[\/\\]/).pop();
          const imgUrl = `http://localhost:3000/tests/${filename}`;
          
          // Determine the caption to show: User Typed > Newly Generated > Original DB fallback
          const currentCaption = pendingLabels[`caption-${item.id}`] !== undefined 
            ? pendingLabels[`caption-${item.id}`] 
            : item.ai_caption;

          const isSelected = selectedItems.has(item.id);

          return (
            <div 
              key={item.id} 
              className={`sketch-card bg-white flex flex-col md:flex-row p-6 gap-6 transition-all duration-300 relative ${
                 isSelected ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : ''
              }`}
            >
              <div className="absolute top-8 left-8 z-20">
                  <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSelect(item.id)} 
                      className="w-6 h-6 sketch-border cursor-pointer accent-ink shadow-sketchHover"
                  />
              </div>

              {/* Left Column: Original Photo & Caption */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div 
                      className="relative bg-paper sketch-border border-2 overflow-hidden aspect-video flex-shrink-0 cursor-zoom-in group shadow-sketchHover"
                      onClick={() => setLightboxImage(imgUrl)}
                  >
                    <img src={imgUrl} alt="Review" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <Maximize className="w-10 h-10 text-ink drop-shadow-md" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col flex-1 sketch-border bg-paper p-4 border-2 shadow-sketchHover">
                      <label className="text-sm text-pencil mb-2 font-bold uppercase tracking-wider">Auto-Generated Tags (Editable)</label>
                      <textarea 
                        className="w-full flex-1 bg-white sketch-border border-2 p-3 text-ink text-sm outline-none resize-none custom-scrollbar focus:shadow-sketchHover font-mono"
                        value={currentCaption}
                        onChange={(e) => {
                             setPendingLabels(prev => ({...prev, [`caption-${item.id}`]: e.target.value}))
                        }}
                      />
                      
                      {popularQueueTags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t-2 border-dashed border-ink/30">
                              {popularQueueTags.map(tag => (
                                  <button 
                                      key={tag}
                                      onClick={() => {
                                          if (!currentCaption.includes(tag)) setPendingLabels(prev => ({...prev, [`caption-${item.id}`]: `${currentCaption} ${tag}`}));
                                      }}
                                      className="text-sm font-bold px-3 py-1 sketch-border bg-white text-ink shadow-[2px_2px_0px_#2c2e33] hover:bg-highlight hover:-translate-y-[1px] transition-transform"
                                      title={`Quick append ${tag}`}
                                  >
                                      {tag}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
              
              {/* Right Column: Detected Faces List */}
              <div className="w-full md:w-1/2 flex flex-col flex-1">
                <h4 className="text-ink font-bold text-xl mb-4 flex items-center">
                    <UserIcon className="w-5 h-5 mr-2 text-ink" />
                    Detected People ({item.detected_faces.length})
                </h4>
                
                <div className="space-y-4 mb-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {item.detected_faces.length === 0 && <span className="text-pencil text-lg bg-paper sketch-border border-2 p-4 block text-center shadow-sketchHover">No faces detected.</span>}
                  
                  {item.detected_faces.map((face, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white p-3 sketch-border border-2 shadow-sketchHover">
                      <div className="w-14 h-14 sketch-border border-2 overflow-hidden bg-paper flex-shrink-0 flex items-center justify-center">
                          {face.crop ? (
                              <img src={face.crop} alt="Face Crop" className="w-full h-full object-cover" />
                          ) : (
                              <UserIcon className="w-8 h-8 text-pencil" />
                          )}
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                          <label className="text-xs text-pencil uppercase tracking-wider font-bold">Name Person</label>
                          <input 
                            type="text"
                            placeholder="Type name..."
                            className="w-full bg-transparent border-b-2 border-dashed border-pencil focus:border-ink outline-none text-ink text-xl font-sketch font-bold placeholder-pencil/50 py-1 transition-colors"
                            value={pendingLabels[`${item.id}-${idx}`] !== undefined ? pendingLabels[`${item.id}-${idx}`] : face.name}
                            onChange={(e) => handleLabelChange(item.id, idx, e.target.value)}
                          />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex space-x-4 mt-auto pt-6 border-t-2 border-dashed border-ink/30">
                  <button 
                    onClick={() => discardPhoto(item.id)}
                    className="sketch-button flex-1 py-3 bg-[#fff0f2] text-errorInk border-errorInk hover:bg-errorInk hover:text-white flex items-center justify-center font-bold text-xl"
                  >
                    <X className="w-6 h-6 mr-2" /> Discard
                  </button>
                  <button 
                    onClick={() => {
                        const finalCaption = pendingLabels[`caption-${item.id}`] !== undefined ? pendingLabels[`caption-${item.id}`] : item.ai_caption;
                        approvePhoto({...item, ai_caption: finalCaption});
                    }}
                    className="sketch-button flex-1 py-3 bg-[#f0fdf4] text-successInk border-successInk hover:bg-successInk hover:text-white flex items-center justify-center font-bold text-xl"
                  >
                    <Check className="w-6 h-6 mr-2" /> Approve
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingCloudImage && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/90 p-4 animate-slide-up">
              <div className="sketch-card bg-paper w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden relative">
                  <button className="absolute top-4 right-4 z-10 p-2 bg-white sketch-border hover:bg-highlight hover:text-ink transition-colors" onClick={() => setEditingCloudImage(null)}>
                      <X className="w-6 h-6" />
                  </button>
                  <div className="w-full md:w-1/2 bg-[#f8f9fa] flex items-center justify-center border-b-2 md:border-b-0 md:border-r-2 border-ink sketch-border p-4">
                       <img 
                          src={`http://localhost:3000/${editingCloudImage.local_cache_path}`} 
                          onError={(e) => { 
                              if (editingCloudImage.telegram_file_id && e.target.src !== fallbackUrls[editingCloudImage.id]) {
                                  e.target.src = fallbackUrls[editingCloudImage.id] || e.target.src;
                              }
                          }}
                          className="max-h-full max-w-full object-contain sketch-card shadow-sketchHover" 
                       />
                  </div>
                  <div className="w-full md:w-1/2 p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8">
                      <h3 className="text-3xl font-bold font-sketch text-ink border-b-2 border-dashed border-pencil/30 pb-4">Edit Cloud Data</h3>
                      
                      <div>
                          <label className="text-sm font-bold text-pencil uppercase tracking-wider mb-4 block flex items-center gap-2"><UserIcon className="w-4 h-4"/> People Identified</label>
                          <div className="flex flex-wrap gap-3">
                              {editingCloudImage.people.length === 0 && <span className="text-pencil italic text-sm">No people detected.</span>}
                              {editingCloudImage.people.map((person, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white px-4 py-2 sketch-border shadow-[2px_2px_0px_#2c2e33]">
                                      <span className="text-md font-bold text-ink">{person}</span>
                                      <button 
                                          className="text-errorInk hover:text-red-700 hover:scale-110 transition-transform"
                                          onClick={() => {
                                              const newPeople = [...editingCloudImage.people];
                                              newPeople.splice(idx, 1);
                                              setEditingCloudImage({...editingCloudImage, people: newPeople});
                                          }}
                                      >
                                          <X className="w-5 h-5" />
                                      </button>
                                  </div>
                              ))}
                              <button 
                                  className="text-sm font-bold bg-[#f0fdf4] text-successInk px-4 py-2 sketch-border border-successInk hover:bg-successInk hover:text-white transition-colors flex items-center gap-1 shadow-[2px_2px_0px_#22c55e]"
                                  onClick={() => {
                                      const name = prompt("Enter a person's name:");
                                      if (name) {
                                          setEditingCloudImage({...editingCloudImage, people: [...editingCloudImage.people, name.toLowerCase()]});
                                      }
                                  }}
                              >
                                  + <UserIcon className="w-4 h-4" /> Add Person
                              </button>
                          </div>
                      </div>

                      <div>
                          <label className="text-sm font-bold text-pencil uppercase tracking-wider mb-4 block flex items-center gap-2"><Tag className="w-4 h-4"/> Event Tags</label>
                          <div className="flex flex-wrap gap-3">
                              {editingCloudImage.tags.length === 0 && <span className="text-pencil italic text-sm">No tags added.</span>}
                              {editingCloudImage.tags.map((tag, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white px-4 py-2 sketch-border shadow-[2px_2px_0px_#2c2e33]">
                                      <span className="text-md font-bold text-ink">{tag}</span>
                                      <button 
                                          className="text-errorInk hover:text-red-700 hover:scale-110 transition-transform"
                                          onClick={() => {
                                              const newTags = [...editingCloudImage.tags];
                                              newTags.splice(idx, 1);
                                              setEditingCloudImage({...editingCloudImage, tags: newTags});
                                          }}
                                      >
                                          <X className="w-5 h-5" />
                                      </button>
                                  </div>
                              ))}
                              <button 
                                  className="text-sm font-bold bg-[#f0f8ff] text-[#0369a1] px-4 py-2 sketch-border border-[#0369a1] hover:bg-[#0369a1] hover:text-white transition-colors flex items-center gap-1 shadow-[2px_2px_0px_#0369a1]"
                                  onClick={() => {
                                      let tag = prompt("Enter an event tag (e.g. Birthday):");
                                      if (tag) {
                                          if (!tag.startsWith('#')) tag = '#' + tag;
                                          setEditingCloudImage({...editingCloudImage, tags: [...editingCloudImage.tags, tag]});
                                      }
                                  }}
                              >
                                  + <Tag className="w-4 h-4" /> Add Tag
                              </button>
                          </div>
                      </div>

                      <div className="mt-auto pt-8 border-t-2 border-dashed border-pencil/30 flex gap-4">
                          <button 
                              className="sketch-button flex-1 py-4 bg-[#fff0f2] text-errorInk border-errorInk font-bold text-lg flex items-center justify-center hover:bg-errorInk hover:text-white group transition-colors"
                              onClick={async () => {
                                  if (window.confirm("Are you sure you want to permanently delete this photo? It will be erased from the database forever.")) {
                                      try {
                                          await fetch(`http://localhost:3000/api/delete_photo/${editingCloudImage.id}`, { method: 'DELETE' });
                                          setEditingCloudImage(null);
                                          if (addToast) addToast("Photo obliterated.", "info");
                                          fetchStats();
                                          fetchUnpublished();
                                      } catch(e) {
                                          if (addToast) addToast("Failed to delete", "error");
                                      }
                                  }
                              }}
                          >
                              <Trash2 className="w-6 h-6 mr-2 group-hover:scale-110 transition-transform" /> Shred Photo
                          </button>
                          <button 
                              className="sketch-button flex-1 py-4 bg-highlight text-ink font-bold text-lg flex items-center justify-center hover:scale-[1.02] shadow:sketchHover transition-all"
                              onClick={async () => {
                                  try {
                                      await fetch(`http://localhost:3000/api/photo/${editingCloudImage.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                              people: editingCloudImage.people,
                                              tags: editingCloudImage.tags
                                          })
                                      });
                                      setEditingCloudImage(null);
                                      if (addToast) addToast("Metadata saved!", "success");
                                      fetchUnpublished();
                                  } catch (e) {
                                      if (addToast) addToast("Failed to save changes", "error");
                                  }
                              }}
                          >
                              <Check className="w-6 h-6 mr-2" /> Save Metadata
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {lightboxImage && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-ink/90 p-4 cursor-zoom-out animate-slide-up" onClick={() => setLightboxImage(null)}>
              <button className="sketch-button absolute top-6 right-6 p-4 bg-white z-[260]" onClick={() => setLightboxImage(null)}>
                  <X className="w-8 h-8 text-ink" />
              </button>
              <img src={lightboxImage} className="max-w-[95vw] max-h-[95vh] object-contain sketch-card shadow-sketch" alt="Inspection" />
          </div>
      )}
    </div>
  );
}

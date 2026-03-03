import React, { useState, useEffect } from 'react';
import { Play, Square, Check, X, User as UserIcon, Loader2, Tag, Maximize } from 'lucide-react';

export default function ReviewQueue({ addToast }) {
  const [isProcessorRunning, setIsProcessorRunning] = useState(false);
  const [queue, setQueue] = useState([]);
  const [pendingLabels, setPendingLabels] = useState({});
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [globalEventTag, setGlobalEventTag] = useState('');
  const [showUnlabeledOnly, setShowUnlabeledOnly] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    checkProcessorStatus();
    fetchQueue();
    const interval = setInterval(() => {
      checkProcessorStatus();
      fetchQueue();
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
    });

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
          });
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md flex items-center justify-between shadow-xl">
        <div>
          <h2 className="text-xl font-semibold text-gray-100 flex items-center">
            Python AI Daemon
            <span className={`ml-3 w-3 h-3 rounded-full ${isProcessorRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          </h2>
          <p className="text-gray-400 text-sm mt-1">Background task for Offline Face Detection & Clustering</p>
        </div>
        <button
          onClick={toggleProcessor}
          className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all shadow-lg ${
            isProcessorRunning 
            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
            : 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30'
          }`}
        >
          {isProcessorRunning ? <><Square className="w-5 h-5 mr-2" /> Stop Processing</> : <><Play className="w-5 h-5 mr-2" /> Start Processing</>}
        </button>
      </div>

      {/* Manual Upload Area */}
      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md shadow-xl text-center">
        <h3 className="text-lg font-medium text-gray-200 mb-2">Upload Photos for AI Processing</h3>
        <p className="text-gray-400 text-sm mb-4">You can drop photos here manually, and the local AI daemon will pick them up to find faces.</p>
        
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
          className="inline-block cursor-pointer bg-blue-500/20 border border-blue-500/50 text-blue-300 px-6 py-3 rounded-xl hover:bg-blue-500/30 transition-colors"
        >
          <span id="upload-btn-text" className="font-medium">+ Upload to Queue</span>
        </label>
      </div>

      {/* Advanced Control Toolbar */}
      {queue.length > 0 && (
          <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md shadow-xl flex flex-col gap-5">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                      <Tag className="w-5 h-5 text-purple-400" />
                      <input 
                         type="text" 
                         placeholder="Event Name (e.g. Birthday 2024)" 
                         value={globalEventTag}
                         onChange={(e) => setGlobalEventTag(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') applyGlobalTag(); }}
                         className="bg-black/40 border border-gray-700/50 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-gray-200 outline-none w-full md:w-72 shadow-inner transition-colors"
                      />
                      <button 
                         onClick={applyGlobalTag}
                         className="px-5 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/50 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shadow-lg flex-shrink-0"
                      >
                         Apply Tag {selectedItems.size > 0 ? `to ${selectedItems.size} Selected` : 'to All'}
                      </button>
                  </div>
                  
                  <label className="flex items-center gap-3 text-sm font-medium text-gray-300 cursor-pointer hover:text-white transition-colors bg-black/20 px-4 py-2.5 rounded-xl border border-white/5">
                      <input 
                          type="checkbox" 
                          checked={showUnlabeledOnly} 
                          onChange={(e) => setShowUnlabeledOnly(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 bg-black/40 text-blue-500 focus:ring-blue-500/50"
                      />
                      Only Show Unlabeled Faces
                  </label>
              </div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-1">
                  <label className="flex items-center gap-3 text-sm font-medium text-blue-300 cursor-pointer hover:text-blue-200 transition-colors">
                      <input 
                          type="checkbox"
                          checked={selectedItems.size === filteredQueue.length && filteredQueue.length > 0}
                          onChange={toggleSelectAll}
                          className="w-5 h-5 rounded border-blue-500/50 bg-black/40 text-blue-500 focus:ring-blue-500/50"
                      />
                      Select All ({selectedItems.size}/{filteredQueue.length})
                  </label>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                      <button 
                         onClick={handleBulkDiscard}
                         disabled={selectedItems.size === 0 || isProcessingBulk}
                         className="flex-1 md:flex-none px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                      >
                         Discard Selected
                      </button>
                      <button 
                         onClick={handleBulkApprove}
                         disabled={selectedItems.size === 0 || isProcessingBulk}
                         className="flex-1 md:flex-none px-6 py-2.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                      >
                         {isProcessingBulk ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
                         Approve Selected
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {queue.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-500 bg-white/5 border border-white/10 rounded-2xl shadow-inner">
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
              className={`bg-white/5 rounded-2xl overflow-hidden border shadow-lg flex flex-col md:flex-row p-4 gap-6 transition-all duration-300 relative ${
                 isSelected ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/50' : 'border-white/10'
              }`}
            >
              <div className="absolute top-6 left-6 z-20">
                  <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSelect(item.id)} 
                      className="w-5 h-5 rounded border-gray-600 bg-black/40 text-blue-500 focus:ring-blue-500/50 cursor-pointer shadow-lg drop-shadow-lg"
                  />
              </div>

              {/* Left Column: Original Photo & Caption */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div 
                      className="relative bg-black/30 rounded-xl overflow-hidden aspect-video flex-shrink-0 border border-white/5 cursor-zoom-in group"
                      onClick={() => setLightboxImage(imgUrl)}
                  >
                    <img src={imgUrl} alt="Review" className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <Maximize className="w-8 h-8 text-white drop-shadow-lg" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col flex-1 bg-black/20 rounded-xl p-4 border border-white/5">
                      <label className="text-sm text-gray-400 mb-2 font-medium">Auto-Generated Tags (Editable)</label>
                      <textarea 
                        className="w-full flex-1 bg-black/40 border border-gray-700 focus:border-blue-500 rounded-lg p-3 text-gray-200 text-sm outline-none resize-none transition-colors custom-scrollbar"
                        value={currentCaption}
                        onChange={(e) => {
                             setPendingLabels(prev => ({...prev, [`caption-${item.id}`]: e.target.value}))
                        }}
                      />
                      
                      {popularQueueTags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                              {popularQueueTags.map(tag => (
                                  <button 
                                      key={tag}
                                      onClick={() => {
                                          if (!currentCaption.includes(tag)) setPendingLabels(prev => ({...prev, [`caption-${item.id}`]: `${currentCaption} ${tag}`}));
                                      }}
                                      className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-md transition-colors"
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
                <h4 className="text-gray-300 font-medium mb-4 flex items-center">
                    <UserIcon className="w-4 h-4 mr-2 text-blue-400" />
                    Detected People ({item.detected_faces.length})
                </h4>
                
                <div className="space-y-3 mb-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {item.detected_faces.length === 0 && <span className="text-gray-500 text-sm bg-black/20 p-4 rounded-xl block text-center">No faces detected.</span>}
                  
                  {item.detected_faces.map((face, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-black/30 p-2 rounded-xl border border-white/5">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/50 border border-gray-700 flex-shrink-0 flex items-center justify-center">
                          {face.crop ? (
                              <img src={face.crop} alt="Face Crop" className="w-full h-full object-cover" />
                          ) : (
                              <UserIcon className="w-6 h-6 text-gray-600" />
                          )}
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Name Person</label>
                          <input 
                            type="text"
                            placeholder="Type name..."
                            className="w-full bg-transparent border-b border-gray-600 focus:border-blue-400 outline-none text-gray-200 text-sm placeholder-gray-600 py-1 transition-colors"
                            value={pendingLabels[`${item.id}-${idx}`] !== undefined ? pendingLabels[`${item.id}-${idx}`] : face.name}
                            onChange={(e) => handleLabelChange(item.id, idx, e.target.value)}
                          />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex space-x-3 mt-auto pt-4 border-t border-white/10">
                  <button 
                    onClick={() => discardPhoto(item.id)}
                    className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center font-medium shadow-lg"
                  >
                    <X className="w-5 h-5 mr-2" /> Discard
                  </button>
                  <button 
                    onClick={() => {
                        const finalCaption = pendingLabels[`caption-${item.id}`] !== undefined ? pendingLabels[`caption-${item.id}`] : item.ai_caption;
                        approvePhoto({...item, ai_caption: finalCaption});
                    }}
                    className="flex-1 py-3 rounded-xl bg-green-500/20 border border-green-500/50 text-green-300 hover:bg-green-500/30 transition-colors flex items-center justify-center font-medium shadow-lg"
                  >
                    <Check className="w-5 h-5 mr-2" /> Approve
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {lightboxImage && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 cursor-zoom-out animate-slide-up" onClick={() => setLightboxImage(null)}>
              <button className="absolute top-6 right-6 p-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-[260]" onClick={() => setLightboxImage(null)}>
                  <X className="w-6 h-6" />
              </button>
              <img src={lightboxImage} className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" alt="Inspection" />
          </div>
      )}
    </div>
  );
}

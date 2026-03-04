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
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="sketch-card p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center sketch-font uppercase">
            Python AI Daemon
            <span className={`ml-3 w-4 h-4 rounded-full border-2 border-ink ${isProcessorRunning ? 'bg-successInk animate-pulse' : 'bg-errorInk'}`}></span>
          </h2>
          <p className="text-pencil text-sm mt-1 font-mono">Background task for Offline Face Detection & Clustering</p>
        </div>
        <button
          onClick={toggleProcessor}
          className={`sketch-button flex items-center px-6 py-3 font-bold text-lg ${
            isProcessorRunning 
            ? 'bg-[#fff0f2] text-errorInk' 
            : 'bg-[#f0fdf4] text-successInk'
          }`}
        >
          {isProcessorRunning ? <><Square className="w-5 h-5 mr-2" /> Stop Processing</> : <><Play className="w-5 h-5 mr-2" /> Start Processing</>}
        </button>
      </div>

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

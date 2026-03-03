import React, { useState, useEffect } from 'react';
import { Play, Square, Check, X, User as UserIcon } from 'lucide-react';

export default function ReviewQueue({ addToast }) {
  const [isProcessorRunning, setIsProcessorRunning] = useState(false);
  const [queue, setQueue] = useState([]);
  const [pendingLabels, setPendingLabels] = useState({});

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
        setQueue(queue.filter(q => q.id !== item.id));
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
      setQueue(queue.filter(q => q.id !== id));
      if (addToast) addToast("Photo Discarded & Permanently Deleted", "info");
    } catch (e) { 
        console.error("Failed to discard", e); 
        if (addToast) addToast("Failed to discard photo", "error");
    }
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {queue.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-500 bg-white/5 border border-white/10 rounded-2xl shadow-inner">
                {isProcessorRunning ? "Scanning for new photos in tests/..." : "Review queue is empty. Start the daemon or upload photos to process them."}
            </div>
        )}
        
        {queue.map(item => {
          const filename = item.file_path.split(/[\/\\]/).pop();
          const imgUrl = `http://localhost:3000/tests/${filename}`;
          
          // Determine the caption to show: User Typed > Newly Generated > Original DB fallback
          const currentCaption = pendingLabels[`caption-${item.id}`] !== undefined 
            ? pendingLabels[`caption-${item.id}`] 
            : item.ai_caption;

          return (
            <div key={item.id} className="bg-white/5 rounded-2xl overflow-hidden border border-white/10 shadow-lg flex flex-col md:flex-row p-4 gap-6">
              
              {/* Left Column: Original Photo & Caption */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div className="relative bg-black/30 rounded-xl overflow-hidden aspect-video flex-shrink-0 border border-white/5">
                    <img src={imgUrl} alt="Review" className="w-full h-full object-contain" />
                  </div>
                  
                  <div className="flex flex-col flex-1 bg-black/20 rounded-xl p-4 border border-white/5">
                      <label className="text-sm text-gray-400 mb-2 font-medium">Auto-Generated Tags (Editable)</label>
                      <textarea 
                        className="w-full flex-1 bg-transparent border border-gray-700 focus:border-blue-500 rounded-lg p-3 text-gray-200 text-sm outline-none resize-none transition-colors"
                        value={currentCaption}
                        onChange={(e) => {
                             setPendingLabels(prev => ({...prev, [`caption-${item.id}`]: e.target.value}))
                        }}
                      />
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
                    className="flex-1 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center font-medium shadow-lg"
                  >
                    <X className="w-5 h-5 mr-2" /> Discard
                  </button>
                  <button 
                    onClick={() => {
                        const finalCaption = pendingLabels[`caption-${item.id}`] !== undefined ? pendingLabels[`caption-${item.id}`] : item.ai_caption;
                        approvePhoto({...item, ai_caption: finalCaption});
                    }}
                    className="flex-1 py-3 rounded-xl bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 transition-colors flex items-center justify-center font-medium shadow-lg"
                  >
                    <Check className="w-5 h-5 mr-2" /> Approve
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

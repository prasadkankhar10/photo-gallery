import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle, X, Loader2, Sparkles, User } from 'lucide-react';
import * as faceapi from 'face-api.js';

export default function UploadArea({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  
  const [tags, setTags] = useState([]);
  const [people, setPeople] = useState([]);
  const [faceDescriptors, setFaceDescriptors] = useState([]); // Store math for new faces
  const [knownFaces, setKnownFaces] = useState([]);
  
  const [metadata, setMetadata] = useState(null);
  const imageRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    const loadModelsAndFaces = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setModelsLoaded(true);
        
        const res = await fetch('/api/known_faces');
        const data = await res.json();
        setKnownFaces(data);
      } catch (e) {
        console.warn("Init issue", e);
      }
    };
    loadModelsAndFaces();
  }, []);

  // Step 1: Detect Faces Locally
  const handleProcessImage = async (acceptedFile) => {
    setFile(acceptedFile);
    const objectUrl = URL.createObjectURL(acceptedFile);
    setPreview(objectUrl);
    setIsProcessing(true);
    setProcessingStep('Detecting faces locally...');

    // Wait a brief moment for the image to render in the DOM so faceapi can read it
    setTimeout(async () => {
      let detectedNames = [];
      let detectedDescriptors = [];
      
      if (modelsLoaded && imageRef.current) {
         try {
           const detections = await faceapi.detectAllFaces(imageRef.current).withFaceLandmarks().withFaceDescriptors();
           
           if (detections.length > 0 && knownFaces.length > 0) {
              // Create Face Matcher with known descriptors from our DB
              const labeledDescriptors = knownFaces.map(kf => {
                 const arr = Object.values(JSON.parse(kf.descriptor)); 
                 return new faceapi.LabeledFaceDescriptors(kf.name, [new Float32Array(arr)]);
              });
              const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
              
              detections.forEach((d, i) => {
                 const bestMatch = faceMatcher.findBestMatch(d.descriptor);
                 if (bestMatch.label !== 'unknown') {
                    detectedNames.push(bestMatch.label);
                 } else {
                    detectedNames.push(`Unknown Person ${i + 1}`);
                 }
                 detectedDescriptors.push(d.descriptor);
              });
           } else if (detections.length > 0) {
              detections.forEach((d, i) => {
                 detectedNames.push(`Unknown Person ${i + 1}`);
                 detectedDescriptors.push(d.descriptor);
              });
           }
         } catch (err) {
           console.error("Face detection failed:", err);
         }
      }
      
      setPeople(detectedNames);
      setFaceDescriptors(detectedDescriptors);
      
      // Step 2: Now send to Gemini WITH the context of who is in the photo
      setProcessingStep('Sending to Gemini for AI Tagging...');
      try {
        const formData = new FormData();
        formData.append('photo', acceptedFile);
        formData.append('peopleContext', JSON.stringify(detectedNames));
        
        const tagResponse = await fetch('/api/tag_image', {
          method: 'POST',
          body: formData
        });
        
        const data = await tagResponse.json();
        if (!tagResponse.ok) throw new Error(data.error);
        
        setTags(data.tags || []);
        setMetadata({ localPath: data.localPath, absolutePath: data.absolutePath });
      } catch (error) {
         console.error(error);
         alert('Error retrieving AI tags');
      }
      setIsProcessing(false);
    }, 500); // 500ms delay to ensure imageRef loads
  };

  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles?.length > 0) {
      handleProcessImage(acceptedFiles[0]);
    }
  }, [modelsLoaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {'image/*': []},
    multiple: false
  });

  const handleConfirmUpload = async () => {
    if (!metadata) return;
    setIsProcessing(true);
    
    setProcessingStep('Saving Face Memories...');
    // Save any confirmed faces to our memory DB
    for (let i = 0; i < people.length; i++) {
       const name = people[i];
       const desc = faceDescriptors[i];
       if (name && !name.startsWith('Unknown Person') && desc) {
           await fetch('/api/save_face', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, descriptor: desc })
           });
       }
    }

    setProcessingStep('Uploading to Telegram...');
    
    try {
      const response = await fetch('/api/upload_final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absolutePath: metadata.absolutePath,
          localPath: metadata.localPath,
          tags,
          people
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setIsProcessing(false);
      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      alert('Error uploading final image');
    }
  };

  const removeTag = (indexToRemove) => {
    setTags(tags.filter((_, idx) => idx !== indexToRemove));
  };
  
  const updatePerson = (index, newName) => {
    const formattedName = newName.replace(/\s+/g, '_');
    const newPeople = [...people];
    newPeople[index] = formattedName;
    setPeople(newPeople);
  };

  if (!preview) {
    return (
      <div 
        {...getRootProps()} 
        className={`glass-panel border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[400px]
        ${isDragActive ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-primary/50 hover:bg-white/5'}`}
      >
        <input {...getInputProps()} />
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
          <UploadCloud className="w-10 h-10 text-blue-400" />
        </div>
        <h3 className="text-2xl font-semibold mb-2">Drag & Drop your photo here</h3>
        <p className="text-gray-400">Or click to browse from your computer</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="glass-panel p-4 rounded-3xl flex flex-col h-fit">
        <div className="relative rounded-2xl overflow-hidden bg-black/50 aspect-auto min-h-[300px] flex items-center justify-center">
          {preview && (
            <img 
              ref={imageRef}
              src={preview} 
              alt="Preview" 
              className="max-w-full max-h-[600px] object-contain rounded-xl"
              crossOrigin="anonymous"
            />
          )}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
               <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
               <p className="text-lg font-medium text-white shadow-sm">{processingStep}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col space-y-6">
        <div className="glass-panel p-6 rounded-3xl">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="text-cyan-400 w-5 h-5"/> AI Generated Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, idx) => (
              <span key={idx} className="px-3 py-1 bg-white/10 border border-white/20 rounded-full text-sm flex items-center gap-2">
                {tag}
                <button onClick={() => removeTag(idx)} className="hover:text-red-400"><X className="w-3 h-3"/></button>
              </span>
            ))}
            <input 
              type="text" 
              placeholder="Add tag..." 
              className="px-3 py-1 bg-black/30 border border-white/10 rounded-full text-sm outline-none focus:border-primary w-24"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value) {
                  setTags([...tags, e.target.value]);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <User className="text-blue-400 w-5 h-5"/> Detected People
          </h3>
          <div className="flex flex-col gap-3">
            {people.map((person, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                    <User className="w-5 h-5 text-gray-300"/>
                </div>
                <input 
                  type="text" 
                  value={person}
                  onChange={(e) => updatePerson(idx, e.target.value)}
                  className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-primary text-white"
                />
              </div>
            ))}
            {people.length === 0 && !isProcessing && (
              <p className="text-gray-400 text-sm">No faces detected.</p>
            )}
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button 
            onClick={() => { setPreview(null); setFile(null); setMetadata(null); }}
            className="flex-1 py-3 px-6 rounded-xl border border-white/20 hover:bg-white/5 transition-all text-white font-medium"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirmUpload}
            className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 transition-all text-white font-medium flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50"
            disabled={isProcessing || !metadata}
          >
            <CheckCircle className="w-5 h-5" />
            Confirm & Upload
          </button>
        </div>
      </div>
    </div>
  );
}

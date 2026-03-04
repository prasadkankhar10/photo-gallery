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
        className={`sketch-card border-2 border-dashed border-ink p-16 text-center cursor-pointer flex flex-col items-center justify-center min-h-[400px]
        ${isDragActive ? 'bg-highlight shadow-sketchHover translate-y-[2px] translate-x-[2px]' : 'bg-paper hover:bg-white shadow-sketch hover:shadow-sketchHover hover:translate-y-[2px] hover:translate-x-[2px] transition-all'}`}
      >
        <input {...getInputProps()} />
        <div className="w-24 h-24 sketch-border border-2 bg-white flex items-center justify-center mb-8 shadow-sketchHover transform rotate-3">
          <UploadCloud className="w-12 h-12 text-ink" />
        </div>
        <h3 className="text-4xl font-bold mb-4 text-ink sketch-font">Drop Photo Outline Here</h3>
        <p className="text-pencil font-mono text-lg">Or click to select a file from your sketchbook folder</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="sketch-card bg-white p-6 flex flex-col h-fit">
        <div className="relative sketch-border border-2 overflow-hidden bg-paper aspect-auto min-h-[300px] flex items-center justify-center shadow-sketchHover">
          {preview && (
            <img 
              ref={imageRef}
              src={preview} 
              alt="Preview" 
              className="max-w-full max-h-[600px] object-contain"
              crossOrigin="anonymous"
            />
          )}
          {isProcessing && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10">
               <Loader2 className="w-16 h-16 text-ink animate-spin mb-4" />
               <p className="text-2xl font-bold text-ink bg-white px-4 py-2 sketch-border shadow-sketchHover">{processingStep}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col space-y-8">
        <div className="sketch-card bg-paper p-8">
          <h3 className="text-3xl font-bold text-ink mb-6 flex items-center gap-3">
            <Sparkles className="text-ink w-8 h-8"/> AI Generated Tags
          </h3>
          <div className="flex flex-wrap gap-3">
            {tags.map((tag, idx) => (
              <span key={idx} className="px-4 py-2 bg-white sketch-border text-lg font-bold flex items-center gap-2 shadow-[2px_2px_0px_#2c2e33]">
                {tag}
                <button onClick={() => removeTag(idx)} className="hover:text-errorInk"><X className="w-4 h-4"/></button>
              </span>
            ))}
            <input 
              type="text" 
              placeholder="Add tag..." 
              className="px-4 py-2 bg-white sketch-border text-lg font-bold outline-none focus:shadow-sketchHover shadow-inner w-32 font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value) {
                  setTags([...tags, e.target.value]);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        <div className="sketch-card bg-paper p-8">
          <h3 className="text-3xl font-bold text-ink mb-6 flex items-center gap-3">
            <User className="text-ink w-8 h-8"/> Detected People
          </h3>
          <div className="flex flex-col gap-4">
            {people.map((person, idx) => (
              <div key={idx} className="flex items-center gap-4 bg-white sketch-border p-3 shadow-sketchHover">
                <div className="w-12 h-12 bg-paper sketch-border flex items-center justify-center">
                    <User className="w-6 h-6 text-pencil"/>
                </div>
                <input 
                  type="text" 
                  value={person}
                  onChange={(e) => updatePerson(idx, e.target.value)}
                  className="flex-1 bg-transparent border-b-2 border-dashed border-ink px-4 py-2 outline-none text-ink text-xl font-bold font-sketch"
                />
              </div>
            ))}
            {people.length === 0 && !isProcessing && (
              <p className="text-pencil text-xl font-bold bg-white sketch-border p-4 shadow-sketchHover">No faces detected.</p>
            )}
          </div>
        </div>

        <div className="pt-4 flex gap-6">
          <button 
            onClick={() => { setPreview(null); setFile(null); setMetadata(null); }}
            className="sketch-button flex-1 py-4 px-6 text-ink font-bold text-2xl flex items-center justify-center"
            disabled={isProcessing}
          >
            Trash It
          </button>
          <button 
            onClick={handleConfirmUpload}
            className="sketch-button flex-1 py-4 px-6 bg-primary text-white hover:text-ink hover:bg-highlight font-bold text-2xl flex items-center justify-center gap-3 disabled:opacity-50"
            disabled={isProcessing || !metadata}
          >
            <CheckCircle className="w-8 h-8" />
            Sign & Save
          </button>
        </div>
      </div>
    </div>
  );
}

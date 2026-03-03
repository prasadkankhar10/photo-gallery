import os
import sys
import sqlite3
import json
import numpy as np
import time
from glob import glob
from PIL import Image
import cv2
import base64
import cv2
import base64
import urllib.request
import chromadb

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DB_PATH = os.path.join(BASE_DIR, 'photos.db')
INPUT_DIR = os.path.join(BASE_DIR, 'tests')
CHROMA_DIR = os.path.join(BASE_DIR, 'chroma_db')

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
# 'cosine' space is best for CLIP embeddings
collection = chroma_client.get_or_create_collection(name="photo_embeddings", metadata={"hnsw:space": "cosine"})

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return np.dot(a, b) / (norm_a * norm_b)

def initialize_models():
    print("Initializing AI Models (This may take up to 2-3 minutes on first load)...", flush=True)
    
    # 1. MobileNetV3 (Extremely lightweight offline scene tagging)
    mobilenet_model = None
    imagenet_labels = []
    mobilenet_transforms = None
    try:
        print("Loading MobileNetV3 for offline tagging...", flush=True)
        import torch
        from torchvision import models
        
        weights = models.MobileNet_V3_Small_Weights.DEFAULT
        mobilenet_model = models.mobilenet_v3_small(weights=weights)
        mobilenet_model.eval()
        mobilenet_transforms = weights.transforms()
        
        # Download ImageNet Labels if missing
        labels_path = os.path.join(BASE_DIR, 'server', 'ai_processor', 'imagenet_classes.txt')
        if not os.path.exists(labels_path):
            urllib.request.urlretrieve("https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt", labels_path)
            
        with open(labels_path, "r") as f:
            imagenet_labels = [s.strip() for s in f.readlines()]
            
        print("MobileNetV3 loaded successfully.", flush=True)
    except Exception as e:
        print(f"MobileNet initialization error (Continuing without tags): {e}", flush=True)

    # 2. MediaPipe + MobileFaceNet (InsightFace buffalo_sc - ultra lightweight face recognition)
    face_app = None
    try:
        print("Loading MobileFaceNet (InsightFace)...", flush=True)
        from insightface.app import FaceAnalysis
        # Initialize insightface and point it to the locally downloaded models
        # CPUExecutionProvider ensures it runs entirely locally without needing CUDA GPUs
        face_app = FaceAnalysis(name="buffalo_sc", root=os.path.expanduser('~/.insightface'), providers=['CPUExecutionProvider'])
        face_app.prepare(ctx_id=0, det_size=(640, 640))
        print("MobileFaceNet loaded successfully.", flush=True)
    except Exception as e:
        print(f"MobileFaceNet initialization error: {e}", flush=True)
        
    # 3. CLIP (OpenAI Contrastive Language-Image Pretraining) for Semantic Search
    clip_model = None
    clip_processor = None
    try:
        print("Loading CLIP Model for Semantic Vector Search...", flush=True)
        from transformers import CLIPProcessor, CLIPModel
        
        # Using a very small, fast CLIP model suitable for CPUs
        model_id = "openai/clip-vit-base-patch32"
        clip_model = CLIPModel.from_pretrained(model_id)
        clip_processor = CLIPProcessor.from_pretrained(model_id)
        
        print("CLIP Model loaded successfully.", flush=True)
    except Exception as e:
        print(f"CLIP initialization error (Semantic search will be disabled): {e}", flush=True)

    return mobilenet_model, mobilenet_transforms, imagenet_labels, face_app, clip_model, clip_processor

def process_directory():
    model, transforms, labels, face_app, clip_model, clip_processor = initialize_models()

    if not os.path.exists(INPUT_DIR):
        print(f"Input directory not found: {INPUT_DIR}", flush=True)
        return

    while True:
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # 1. Load Known Faces
            cursor.execute("SELECT name, descriptor FROM faces")
            known_faces = []
            for row in cursor.fetchall():
                try:
                    desc_list = json.loads(row['descriptor']) 
                    if isinstance(desc_list, dict):
                        desc_list = list(desc_list.values())
                    known_faces.append({'name': row['name'], 'descriptor': desc_list})
                except Exception:
                    pass
            
            # Find images
            image_extensions = ('*.jpg', '*.jpeg', '*.png', '*.webp', '*.JPG', '*.JPEG', '*.PNG', '*.WEBP')
            image_files = []
            for ext in image_extensions:
                image_files.extend(glob(os.path.join(INPUT_DIR, ext)))
                
            cluster_counter = 1
            processed_any = False

            for img_path in image_files:
                # Check queue
                cursor.execute("SELECT id FROM processing_queue WHERE file_path = ?", (img_path,))
                if cursor.fetchone():
                    continue
                    
                # Check media
                rel_path = f"tests/{os.path.basename(img_path)}"
                cursor.execute("SELECT id FROM media WHERE local_cache_path = ? OR local_cache_path = ?", (img_path, rel_path))
                if cursor.fetchone():
                    continue

                processed_any = True
                print(f"\nProcessing {os.path.basename(img_path)}...", flush=True)
                
                all_faces_known = True

                # Generate Caption via MobileNet
                caption = "Pending Offline Tagging..."
                if model and transforms and labels:
                    try:
                        import torch
                        pil_img = Image.open(img_path).convert('RGB')
                        img_tensor = transforms(pil_img).unsqueeze(0)
                        
                        with torch.no_grad():
                            output = model(img_tensor)
                        
                        probabilities = torch.nn.functional.softmax(output[0], dim=0)
                        top5_prob, top5_catid = torch.topk(probabilities, 5)
                        
                        tags = [labels[catid.item()] for catid in top5_catid if probabilities[catid.item()] > 0.05]
                        
                        if tags:
                            caption = ", ".join(tags).title()
                        else:
                            caption = "Uncategorized Photo"
                            
                        print(f"Tags: {caption}", flush=True)
                    except Exception as e:
                        print(f"Tagging error: {e}", flush=True)

                # Extract Faces via MobileFaceNet
                detected_faces = []
                if face_app:
                    try:
                        # Insightface uses BGR OpenCV images
                        cv_img = cv2.imread(img_path)
                        faces = face_app.get(cv_img)
                        
                        for face in faces:
                            # 512-dimensional embedding vector from MobileFaceNet
                            embedding = face.embedding.tolist()
                            bbox = face.bbox.astype(int).tolist() # [x1, y1, x2, y2]
                            
                            # Extract Base64 crop for React UI
                            face_crop_b64 = None
                            try:
                                x1, y1, x2, y2 = bbox
                                # Add 20% padding around the face for better UI visibility
                                h, w = cv_img.shape[:2]
                                pad_x = int((x2 - x1) * 0.2)
                                pad_y = int((y2 - y1) * 0.2)
                                px1, py1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
                                px2, py2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
                                
                                face_crop = cv_img[py1:py2, px1:px2]
                                _, buffer = cv2.imencode('.jpg', face_crop)
                                face_crop_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
                            except Exception as ce:
                                print(f"Crop error: {ce}", flush=True)
                            
                            best_match = None
                            best_sim = 0.0
                            
                            # Compare against known DB faces
                            for kf in known_faces:
                                if len(kf['descriptor']) == 512: # Only compare if the DB holds an InsightFace embedding
                                    sim = cosine_similarity(embedding, kf['descriptor'])
                                    if sim > 0.5 and sim > best_sim: # 0.5 is a standard threshold for arcface/mobilefacenet
                                        best_sim = sim
                                        best_match = kf['name']
                            
                            name = best_match
                            if not name:
                                name = f"Unknown Person {cluster_counter}"
                                cluster_counter += 1
                                # We can optionally cache this unknown person to auto-group the rest of this batch
                                known_faces.append({'name': name, 'descriptor': embedding})
                                all_faces_known = False
                            
                            detected_faces.append({
                                "name": name,
                                "box": bbox,
                                "descriptor": embedding,
                                "crop": face_crop_b64
                            })
                    except Exception as e:
                        print(f"Face extraction error: {e}", flush=True)

                # Extract semantic representation via CLIP
                clip_embedding = None
                if clip_model and clip_processor:
                    try:
                        import torch
                        pil_img = Image.open(img_path).convert('RGB')
                        inputs = clip_processor(images=pil_img, return_tensors="pt")
                        with torch.no_grad():
                            image_features = clip_model.get_image_features(**inputs)
                            
                        # Normalize vector for cosine similarity storage in Chroma
                        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
                        clip_embedding = image_features.cpu().numpy().tolist()[0]
                        print("CLIP embedding generated.", flush=True)
                        
                    except Exception as e:
                        print(f"CLIP encoding error: {e}", flush=True)

                # Auto-Approve if all faces are recognized (or if it's just scenery)
                if all_faces_known:
                    try:
                        print(f"100% face match detected. Auto-uploading to Telegram...", flush=True)
                        
                        payload = {
                            "absolutePath": img_path,
                            "localPath": f"tests/{os.path.basename(img_path)}",
                            "people": [f["name"] for f in detected_faces],
                            "tags": [caption],
                            "queueId": -1
                        }
                        req = urllib.request.Request('http://localhost:3000/api/upload_final', method='POST')
                        req.add_header('Content-Type', 'application/json')
                        jsondata = json.dumps(payload).encode('utf-8')
                        
                        urllib.request.urlopen(req, jsondata)
                        print(f"Auto-approved and uploaded {os.path.basename(img_path)} successfully!", flush=True)
                        continue # Skip SQLite review queue insert
                    except Exception as e:
                        print(f"Auto-upload API failed (falling back to manual queue): {e}", flush=True)

                # Save to Review Queue if unknown faces exist
                cursor.execute(
                    "INSERT INTO processing_queue (file_path, ai_caption, detected_faces, status) VALUES (?, ?, ?, ?)",
                    (img_path, caption, json.dumps(detected_faces), 'PENDING_REVIEW')
                )
                conn.commit()
                queue_id = cursor.lastrowid
                print(f"Added to review queue.", flush=True)
                
                # Store CLIP Embedding in ChromaDB indexed by the absolute path
                if clip_embedding:
                    try:
                        # Convert bbox/name details for metadata
                        face_meta = ", ".join([f["name"] for f in detected_faces]) if detected_faces else "Unknown"
                        collection.add(
                            embeddings=[clip_embedding],
                            documents=[caption], # Good to store the autogenerated caption alongside
                            metadatas=[{"source": img_path, "local_path": f"tests/{os.path.basename(img_path)}", "faces": face_meta}],
                            ids=[img_path] # Use path as unique ID
                        )
                        print("Saved CLIP embedding to ChromaDB.", flush=True)
                    except Exception as e:
                        print(f"ChromaDB insert error: {e}", flush=True)

            conn.close()
            
            if processed_any:
                print("\nWaiting for new images...", flush=True)
                
        except Exception as e:
            print(f"Main loop error: {e}", flush=True)
            
        time.sleep(5)

if __name__ == "__main__":
    process_directory()

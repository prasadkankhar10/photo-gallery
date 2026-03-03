from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import chromadb
import sys
from PIL import Image

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHROMA_DIR = os.path.join(BASE_DIR, 'chroma_db')

# Load ChromaDB
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
collection = chroma_client.get_or_create_collection(name="photo_embeddings", metadata={"hnsw:space": "cosine"})

# Load CLIP Model
print("Loading CLIP Model for Search API...")
from transformers import CLIPProcessor, CLIPModel
import torch

model_id = "openai/clip-vit-base-patch32"
clip_model = CLIPModel.from_pretrained(model_id)
clip_processor = CLIPProcessor.from_pretrained(model_id)
print("CLIP Model loaded for search.")

@app.route('/api/search/text', methods=['POST'])
def search_text():
    data = request.json
    query = data.get('query')
    if not query:
        return jsonify({"error": "No query provided"}), 400
        
    try:
        inputs = clip_processor(text=[query], return_tensors="pt", padding=True)
        with torch.no_grad():
            text_features = clip_model.get_text_features(**inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            embedding = text_features.cpu().numpy().tolist()[0]
            
        results = collection.query(
            query_embeddings=[embedding],
            n_results=10 # return top 10 matches
        )
        
        return jsonify({
            "success": True, 
            "results": results['metadatas'][0],
            "distances": results['distances'][0]
        })
    except Exception as e:
        print(f"Text search error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search/image', methods=['POST'])
def search_image():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    try:
        pil_img = Image.open(file.stream).convert('RGB')
        inputs = clip_processor(images=pil_img, return_tensors="pt")
        with torch.no_grad():
            image_features = clip_model.get_image_features(**inputs)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            embedding = image_features.cpu().numpy().tolist()[0]
            
        # Exclude the exact same image if it's already in DB just in case?
        # For reverse image search we generally just query the embedding directly
        results = collection.query(
            query_embeddings=[embedding],
            n_results=10
        )
        
        return jsonify({
            "success": True, 
            "results": results['metadatas'][0],
            "distances": results['distances'][0]
        })
    except Exception as e:
         print(f"Image search error: {e}")
         return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=False)

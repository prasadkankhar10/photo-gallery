import time
print("Starting DeepFace test...")
start = time.time()
try:
    from deepface import DeepFace
    import numpy as np
    dummy_img = np.zeros((224, 224, 3), dtype=np.uint8)
    print("Loading deepface model...")
    res = DeepFace.represent(dummy_img, model_name="Facenet", enforce_detection=False)
    print(f"DeepFace Success! Took {time.time() - start:.2f}s")
except Exception as e:
    print(f"DeepFace failed: {e}")

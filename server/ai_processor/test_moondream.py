import time
print("Starting Moondream2 test...")
start = time.time()
try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    model_id = "vikhyatk/moondream2"
    revision = "2024-08-26"
    print("Loading moondream model...")
    model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True, revision=revision)
    print(f"Moondream2 Success! Took {time.time() - start:.2f}s")
except Exception as e:
    print(f"Moondream failed: {e}")

import os
import urllib.request
import zipfile

def download_with_progress(url, filepath):
    # Ensure directory exists
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    def report_progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded * 100 / total_size
            # Clear line and print progress dynamically
            print(f"\rDownloading: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB [{percent:.1f}%]", end="")
            
    print(f"Starting download from: {url}")
    urllib.request.urlretrieve(url, filepath, reporthook=report_progress)
    print("\nDownload complete!\n")

def setup_mobilefacenet():
    print("--- Setting up MobileFaceNet (InsightFace) ---")
    insightface_dir = os.path.expanduser("~/.insightface/models")
    model_name = "buffalo_sc" # This contains the lightweight MobileFaceNet
    zip_path = os.path.join(insightface_dir, f"{model_name}.zip")
    extract_path = os.path.join(insightface_dir, model_name)
    
    if os.path.exists(extract_path):
        print(f"MobileFaceNet ({model_name}) is already fully downloaded and extracted at: {extract_path}")
    else:
        # Download buffalo_sc.zip (roughly 16MB for the lightweight models)
        url = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
        download_with_progress(url, zip_path)
        
        print(f"Extracting {model_name}.zip...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)
        print("Extraction complete! MobileFaceNet is ready.")

def check_moondream():
    print("--- Checking Moondream2 ---")
    hf_cache = os.path.expanduser("~/.cache/huggingface/hub/models--vikhyatk--moondream2")
    if os.path.exists(hf_cache):
        # Calculate size
        total_size = 0
        for dirpath, _, filenames in os.walk(hf_cache):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
        size_mb = total_size / (1024 * 1024)
        print(f"Moondream2 is already securely cached on your PC: {size_mb:.1f} MB found at {hf_cache}")
        if size_mb > 1500:
            print("Great! The full Moondream2 model size is verified. No download needed.")
        else:
            print("Warning: The cache seems smaller than expected. It might be corrupt or incomplete.")
    else:
        print("Moondream2 is not found in the HuggingFace cache.")

if __name__ == "__main__":
    check_moondream()
    print("")
    setup_mobilefacenet()
    print("\nAll model checks completed!")

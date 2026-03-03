import os
import requests
import sys

def download_file_with_resume(url, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    headers = {}
    mode = 'wb'
    existing_size = 0
    
    if os.path.exists(dest_path):
        existing_size = os.path.getsize(dest_path)
        if existing_size > 3_000_000_000:
            print(f"File already exists and seems complete ({existing_size / (1024*1024):.1f} MB). Skipping download.")
            return
        elif existing_size > 0:
            print(f"Resuming download from {existing_size / (1024*1024):.1f} MB...")
            headers['Range'] = f'bytes={existing_size}-'
            mode = 'ab'
            
    try:
        # Added a timeout to prevent hanging if the network drops
        response = requests.get(url, headers=headers, stream=True, timeout=15)
        response.raise_for_status()
        
        content_length = int(response.headers.get('content-length', 0))
        
        # 206 means Partial Content (Resume worked)
        if response.status_code == 206:
            total_size = existing_size + content_length
            downloaded = existing_size
            print(f"Server supports resume. Continuing {content_length / (1024*1024*1024):.2f} GB of total {total_size / (1024*1024*1024):.2f} GB")
        else:
            total_size = content_length
            downloaded = 0
            mode = 'wb'
            print(f"Server did not resume. Restarting {total_size / (1024*1024*1024):.2f} GB")
            
        block_size = 1024 * 1024  # 1 MB chunk buffer
        last_percent = -1
        
        with open(dest_path, mode) as f:
            for data in response.iter_content(block_size):
                if not data:
                    break
                f.write(data)
                downloaded += len(data)
                
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    # Only print if we've moved up roughly 0.1% to avoid terminal flicker
                    if percent - last_percent > 0.1:
                        sys.stdout.write(f"\rDownloading: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB [{percent:.1f}%]")
                        sys.stdout.flush()
                        last_percent = percent
                        
        print("\n\nDownload complete! The model is saved exactly where it belongs.")

    except requests.exceptions.Timeout:
         print(f"\nConnection timed out. Network might be unstable. Run the script again to resume.")
    except Exception as e:
        print(f"\nError downloading file: {e}")

if __name__ == "__main__":
    url = "https://huggingface.co/vikhyatk/moondream2/resolve/2024-08-26/model.safetensors?download=true"
    dest_path = os.path.expanduser(r"~\.cache\huggingface\hub\models--vikhyatk--moondream2\snapshots\1c0bccefc952c423baabd1d3d63b0a70f2f099aa\model.safetensors")
    download_file_with_resume(url, dest_path)

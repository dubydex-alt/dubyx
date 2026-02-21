import zipfile
import os

zip_path = "/vercel/share/v0-project/NEWO.zip"
extract_path = "/vercel/share/v0-project/extracted"

os.makedirs(extract_path, exist_ok=True)

with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_path)
    print("Extracted files:")
    for name in zip_ref.namelist():
        print(f"  {name}")

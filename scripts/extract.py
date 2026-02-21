import zipfile
import os
import glob

# Debug: list what's in the directory
cwd = os.getcwd()
print(f"CWD: {cwd}")
print("Files in CWD:")
for f in os.listdir(cwd):
    print(f"  {f}")

# Try to find the zip file
zip_candidates = glob.glob(os.path.join(cwd, "**/*.zip"), recursive=True)
print(f"ZIP files found via glob: {zip_candidates}")

# Also check the v0-project path
v0_path = "/vercel/share/v0-project"
if os.path.exists(v0_path):
    print(f"Files in {v0_path}:")
    for f in os.listdir(v0_path):
        print(f"  {f} (isfile: {os.path.isfile(os.path.join(v0_path, f))})")

# Try multiple possible paths
possible_paths = [
    os.path.join(cwd, "NEWO.zip"),
    "/vercel/share/v0-project/NEWO.zip",
    os.path.join(v0_path, "NEWO.zip"),
]

zip_path = None
for p in possible_paths:
    if os.path.exists(p):
        zip_path = p
        print(f"Found zip at: {p}")
        break
    else:
        print(f"Not found: {p}")

if zip_path:
    extract_path = os.path.join(os.path.dirname(zip_path), "extracted")
    os.makedirs(extract_path, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_path)
        print("Extracted files:")
        for name in zip_ref.namelist():
            print(f"  {name}")
else:
    print("ERROR: Could not find NEWO.zip")

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const zipUrl = 'https://v0chat-agent-data-prod.s3.us-east-1.amazonaws.com/vm-binary/SO18crdGK19/f5d4992e8f834b7a89807e941b2dce5a0592ea768403f6129b86cd8a5b9b48f2.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA52KF4VHQDTZ5RDMT%2F20260221%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260221T105454Z&X-Amz-Expires=3600&X-Amz-Signature=c4ed782cbfa05a3101ed4eeb803e1cc834b265d0e71f2c89d415be6511737705&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractZip(zipBuffer) {
  const files = {};
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return files;

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  let offset = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compMethod = zipBuffer.readUInt16LE(offset + 10);
    const compSize = zipBuffer.readUInt32LE(offset + 20);
    const uncompSize = zipBuffer.readUInt32LE(offset + 24);
    const nameLen = zipBuffer.readUInt16LE(offset + 28);
    const extraLen = zipBuffer.readUInt16LE(offset + 30);
    const commentLen = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const fileName = zipBuffer.toString('utf8', offset + 46, offset + 46 + nameLen);

    if (!fileName.endsWith('/')) {
      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      let content = null;
      if (compMethod === 0) {
        content = zipBuffer.subarray(dataStart, dataStart + uncompSize);
      } else if (compMethod === 8) {
        try {
          content = zlib.inflateRawSync(zipBuffer.subarray(dataStart, dataStart + compSize));
        } catch (e) { /* skip */ }
      }
      if (content) files[fileName] = content.toString('utf8');
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function main() {
  console.log('Downloading and extracting NEWO.zip...');
  const zipBuffer = await downloadFile(zipUrl);
  const files = extractZip(zipBuffer);
  const phpFiles = Object.keys(files).filter(f => f.endsWith('.php'));
  console.log('Total PHP files:', phpFiles.length);

  // Print EVERY PHP file's content for full analysis
  for (const f of phpFiles) {
    console.log('\n\n========== FILE: ' + f + ' ==========');
    console.log(files[f]);
    console.log('========== END: ' + f + ' ==========');
  }
}

main().catch(e => console.error('Error:', e.message));

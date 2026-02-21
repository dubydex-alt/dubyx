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

async function main() {
  console.log('Downloading NEWO.zip...');
  const zipBuffer = await downloadFile(zipUrl);
  console.log('Downloaded. Size:', zipBuffer.length, 'bytes');

  // Find End of Central Directory
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    console.log('ERROR: Not a valid ZIP file');
    process.exit(1);
  }

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  console.log('Found ' + cdEntries + ' entries in ZIP');

  const extractDir = path.join(process.cwd(), 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  let offset = cdOffset;
  const fileList = [];

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

    fileList.push(fileName);

    if (!fileName.endsWith('/')) {
      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const outPath = path.join(extractDir, fileName);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      if (compMethod === 0) {
        const data = zipBuffer.subarray(dataStart, dataStart + uncompSize);
        fs.writeFileSync(outPath, data);
      } else if (compMethod === 8) {
        const compressed = zipBuffer.subarray(dataStart, dataStart + compSize);
        try {
          const data = zlib.inflateRawSync(compressed);
          fs.writeFileSync(outPath, data);
        } catch (e) {
          console.log('  WARN: Failed to decompress ' + fileName + ': ' + e.message);
        }
      }
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  console.log('\nAll files in ZIP:');
  fileList.forEach(f => console.log(' ', f));

  // Show PHP files specifically
  const phpFiles = fileList.filter(f => f.endsWith('.php'));
  console.log('\nPHP files found:');
  phpFiles.forEach(f => console.log(' ', f));

  // Show schema-related files
  const schemaFiles = fileList.filter(f => f.toLowerCase().includes('schema') || f.toLowerCase().includes('database') || f.toLowerCase().includes('db') || f.toLowerCase().includes('migration') || f.toLowerCase().includes('install') || f.toLowerCase().includes('setup'));
  console.log('\nSchema/DB related files:');
  schemaFiles.forEach(f => console.log(' ', f));

  // Print contents of schema-related PHP files
  for (const sf of schemaFiles.filter(f => f.endsWith('.php'))) {
    const filePath = path.join(extractDir, sf);
    if (fs.existsSync(filePath)) {
      console.log('\n=== CONTENT OF ' + sf + ' ===');
      console.log(fs.readFileSync(filePath, 'utf8'));
      console.log('=== END OF ' + sf + ' ===');
    }
  }
}

main().catch(e => console.error('Error:', e.message));

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectDir = process.cwd();
console.log('CWD:', projectDir);
console.log('Files in CWD:');
fs.readdirSync(projectDir).forEach(f => console.log(' ', f));

const zipPath = path.join(projectDir, 'NEWO.zip');
console.log('Zip exists?', fs.existsSync(zipPath));

if (fs.existsSync(zipPath)) {
  const zipBuffer = fs.readFileSync(zipPath);
  console.log('Zip file size:', zipBuffer.length, 'bytes');

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

  const extractDir = path.join(projectDir, 'extracted');
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

  console.log('\nExtracted files:');
  fileList.forEach(f => console.log(' ', f));
} else {
  console.log('ERROR: NEWO.zip not found');
}

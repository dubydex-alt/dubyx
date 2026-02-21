import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';

const projectDir = process.cwd();
console.log('CWD:', projectDir);
console.log('Files in CWD:');
readdirSync(projectDir).forEach(f => console.log(' ', f));

const zipPath = join(projectDir, 'NEWO.zip');
console.log('Zip exists?', existsSync(zipPath));

if (existsSync(zipPath)) {
  // Use Node.js built-in to read zip
  const { Readable } = await import('stream');
  const { createUnzip } = await import('zlib');
  
  // Use a simpler approach - read zip with a library
  const zipBuffer = readFileSync(zipPath);
  console.log('Zip file size:', zipBuffer.length, 'bytes');
  
  // Parse ZIP manually (Central Directory approach)
  // ZIP end of central directory signature: 0x06054b50
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
  console.log(`Found ${cdEntries} entries in ZIP`);
  
  const extractDir = join(projectDir, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  
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
    
    // Extract file data from local header
    if (!fileName.endsWith('/')) {
      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      
      const outPath = join(extractDir, fileName);
      mkdirSync(dirname(outPath), { recursive: true });
      
      if (compMethod === 0) {
        // Stored (no compression)
        const data = zipBuffer.subarray(dataStart, dataStart + uncompSize);
        writeFileSync(outPath, data);
      } else if (compMethod === 8) {
        // Deflated
        const { inflateRawSync } = await import('zlib');
        const compressed = zipBuffer.subarray(dataStart, dataStart + compSize);
        try {
          const data = inflateRawSync(compressed);
          writeFileSync(outPath, data);
        } catch (e) {
          console.log(`  WARN: Failed to decompress ${fileName}: ${e.message}`);
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

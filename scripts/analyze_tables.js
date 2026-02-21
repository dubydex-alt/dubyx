const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const zipUrl = process.argv[2] || '';

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const chunks = [];
    mod.get(url, (res) => {
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

    if (!fileName.endsWith('/') && fileName.endsWith('.php')) {
      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      let content = '';
      if (compMethod === 0) {
        content = zipBuffer.subarray(dataStart, dataStart + uncompSize).toString('utf8');
      } else if (compMethod === 8) {
        try {
          content = zlib.inflateRawSync(zipBuffer.subarray(dataStart, dataStart + compSize)).toString('utf8');
        } catch(e) {}
      }
      files[fileName] = content;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function main() {
  // Download and extract
  console.log('Downloading ZIP...');
  const zipBuffer = await downloadFile(zipUrl);
  console.log('ZIP size:', zipBuffer.length);
  const files = extractZip(zipBuffer);
  const phpFiles = Object.keys(files);
  console.log('PHP files extracted:', phpFiles.length);

  // Combine all PHP content
  const allContent = Object.values(files).join('\n');

  // Find all table references in SQL queries
  const tablePatterns = [
    /FROM\s+`?(\w+)`?/gi,
    /INTO\s+`?(\w+)`?/gi,
    /UPDATE\s+`?(\w+)`?\s+SET/gi,
    /JOIN\s+`?(\w+)`?/gi,
    /DELETE\s+FROM\s+`?(\w+)`?/gi,
    /TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?`?(\w+)`?/gi,
    /SHOW\s+COLUMNS\s+FROM\s+`?(\w+)`?/gi,
    /SHOW\s+TABLES\s+LIKE\s+'(\w+)'/gi,
  ];

  const tablesUsed = new Set();
  for (const pat of tablePatterns) {
    let m;
    while ((m = pat.exec(allContent)) !== null) {
      const t = m[1].toLowerCase();
      // Filter out SQL keywords and common false positives
      if (!['set','select','where','into','table','exists','not','if','null','values','like','and','or','column','index','key','primary','auto_increment','default','from','join','left','right','inner','outer','on','as','in','between','having','group','order','by','limit','offset','distinct','count','sum','avg','max','min','concat','char','varchar','int','tinyint','decimal','text','longtext','enum','datetime','date','timestamp','current_timestamp','engine','innodb','charset','utf8mb4','unique','after','change','add','modify','drop','rename','create','alter','insert','update','delete','show','columns','tables','information_schema'].includes(t)) {
        tablesUsed.add(t);
      }
    }
  }

  console.log('\n============================');
  console.log('ALL TABLES USED IN PROJECT:');
  console.log('============================');
  const sortedTables = [...tablesUsed].sort();
  sortedTables.forEach(t => console.log('  - ' + t));

  // Now find ALL columns referenced per table
  console.log('\n\n============================');
  console.log('COLUMNS USED PER TABLE:');
  console.log('============================');

  for (const table of sortedTables) {
    const cols = new Set();

    // Pattern: table.column
    const dotPat = new RegExp(table + '\\.`?(\\w+)`?', 'gi');
    let m;
    while ((m = dotPat.exec(allContent)) !== null) {
      const c = m[1].toLowerCase();
      if (!['id'].includes(c)) cols.add(c);
      else cols.add(c);
    }

    // Pattern: SELECT ... FROM table (grab column names from SELECT)
    const selectPat = new RegExp('SELECT\\s+(.+?)\\s+FROM\\s+`?' + table + '`?', 'gi');
    while ((m = selectPat.exec(allContent)) !== null) {
      const selPart = m[1];
      if (selPart.trim() !== '*') {
        const colNames = selPart.split(',').map(c => {
          c = c.trim().replace(/`/g, '');
          // Handle aliases
          const asMatch = c.match(/(\w+)\s+(?:AS\s+)?(\w+)/i);
          if (asMatch) return asMatch[1].toLowerCase();
          if (/^\w+$/.test(c)) return c.toLowerCase();
          return null;
        }).filter(Boolean);
        colNames.forEach(c => {
          if (!['count', 'sum', 'avg', 'max', 'min', 'concat', 'distinct', 'case', 'when', 'then', 'else', 'end', 'as', 'null', 'coalesce'].includes(c)) {
            cols.add(c);
          }
        });
      }
    }

    // Pattern: INSERT INTO table (col1, col2, ...) 
    const insertPat = new RegExp('INSERT\\s+INTO\\s+`?' + table + '`?\\s*\\(([^)]+)\\)', 'gi');
    while ((m = insertPat.exec(allContent)) !== null) {
      const colsPart = m[1];
      colsPart.split(',').map(c => c.trim().replace(/`/g, '').toLowerCase()).forEach(c => {
        if (/^\w+$/.test(c)) cols.add(c);
      });
    }

    // Pattern: UPDATE table SET col1=..., col2=...
    const updatePat = new RegExp('UPDATE\\s+`?' + table + '`?\\s+SET\\s+(.+?)\\s+WHERE', 'gi');
    while ((m = updatePat.exec(allContent)) !== null) {
      const setPart = m[1];
      const setCols = setPart.match(/`?(\w+)`?\s*=/g);
      if (setCols) {
        setCols.forEach(sc => {
          const col = sc.replace(/[`=\s]/g, '').toLowerCase();
          if (col) cols.add(col);
        });
      }
    }

    // Pattern: WHERE col = or AND col = or OR col =
    const wherePat = new RegExp('(?:FROM|UPDATE|JOIN)\\s+`?' + table + '`?[^;]*?(?:WHERE|AND|OR)\\s+`?(\\w+)`?\\s*[=<>!]', 'gi');
    while ((m = wherePat.exec(allContent)) !== null) {
      const c = m[1].toLowerCase();
      if (!['where', 'and', 'or', 'not', 'null', 'in', 'between', 'like', 'exists', 'select', 'from'].includes(c)) {
        cols.add(c);
      }
    }

    // Pattern: ORDER BY col
    const orderPat = new RegExp('FROM\\s+`?' + table + '`?[^;]*?ORDER\\s+BY\\s+`?(\\w+)`?', 'gi');
    while ((m = orderPat.exec(allContent)) !== null) {
      cols.add(m[1].toLowerCase());
    }

    if (cols.size > 0) {
      console.log('\n[' + table + ']:');
      [...cols].sort().forEach(c => console.log('    ' + c));
    }
  }

  // Also look for $row['column'] patterns near each table query
  console.log('\n\n============================');
  console.log('$row[column] PATTERNS BY FILE:');
  console.log('============================');

  for (const [fname, content] of Object.entries(files)) {
    // Skip migration/fix files
    if (fname.includes('fix_db') || fname.includes('install') || fname.includes('migrate_') || fname.includes('db_')) continue;

    const rowCols = new Set();
    const rowPat = /\$(?:row|result|data|r|user|course|item|order|teacher|banner|coupon|cat|category|post|ticket|notification|stream|chat|settings|admin|video|chapter|group)\[['"](\w+)['"]\]/g;
    let m;
    while ((m = rowPat.exec(content)) !== null) {
      rowCols.add(m[1]);
    }
    if (rowCols.size > 0) {
      console.log('\n[' + fname + ']:');
      [...rowCols].sort().forEach(c => console.log('    ' + c));
    }
  }
}

main().catch(e => console.error('Error:', e));

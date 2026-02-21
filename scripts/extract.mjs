import { execSync } from 'child_process';

try {
  execSync('unzip -o /vercel/share/v0-project/NEWO.zip -d /vercel/share/v0-project/extracted', { stdio: 'inherit' });
  console.log('Extraction complete');
  
  // List all files
  const result = execSync('find /vercel/share/v0-project/extracted -type f | head -200', { encoding: 'utf-8' });
  console.log(result);
} catch (e) {
  console.error('Error:', e.message);
}

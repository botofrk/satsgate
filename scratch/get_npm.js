const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const npmUrl = 'https://registry.npmjs.org/npm/-/npm-10.8.1.tgz';
const targetDir = __dirname;
const tgzPath = path.join(targetDir, 'npm.tgz');

console.log('Downloading npm tarball from:', npmUrl);

const file = fs.createWriteStream(tgzPath);
https.get(npmUrl, (response) => {
  response.pipe(file);
  file.on('finish', () => {
    file.close(() => {
      console.log('Download complete. Extracting npm.tgz...');
      try {
        // Use Windows native tar to extract
        execSync(`tar -xf "${tgzPath}" -C "${targetDir}"`, { stdio: 'inherit' });
        console.log('Extraction complete! npm is located in scratch/package');
        
        // Rename 'package' to 'npm-cli' to avoid confusion
        const oldPath = path.join(targetDir, 'package');
        const newPath = path.join(targetDir, 'npm-cli');
        if (fs.existsSync(oldPath)) {
          if (fs.existsSync(newPath)) {
            fs.rmSync(newPath, { recursive: true, force: true });
          }
          fs.renameSync(oldPath, newPath);
          console.log('Renamed npm folder to scratch/npm-cli');
        }
        
        // Clean up tgz
        fs.unlinkSync(tgzPath);
      } catch (err) {
        console.error('Error during extraction:', err);
      }
    });
  });
}).on('error', (err) => {
  fs.unlinkSync(tgzPath);
  console.error('Error downloading file:', err.message);
});

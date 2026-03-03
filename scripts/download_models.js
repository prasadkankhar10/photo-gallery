import fs from 'fs';
import https from 'https';
import path from 'path';

const modelsDir = path.join(process.cwd(), 'public', 'models');

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

async function downloadFile(filename) {
  const url = baseUrl + filename;
  const dest = path.join(modelsDir, filename);
  
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${filename}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Downloading face-api.js models to public/models...');
  for (const file of files) {
    try {
      if (!fs.existsSync(path.join(modelsDir, file))) {
        await downloadFile(file);
      } else {
        console.log(`${file} already exists, skipping.`);
      }
    } catch (e) {
      console.error(`Failed to download ${file}:`, e.message);
    }
  }
  console.log('Finished downloading models!');
}

run();

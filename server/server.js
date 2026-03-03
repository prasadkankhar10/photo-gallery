import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import util from 'util';
import { initializeDatabase } from './db_init.js';
import { uploadToTelegram, getTelegramFileUrl } from './telegram_handler.js';
import { GoogleGenAI } from '@google/genai';

const execPromise = util.promisify(exec);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Setup uploads folder
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use('/uploads', express.static(uploadDir));

const testsDir = path.join(__dirname, '..', 'tests');
if (!fs.existsSync(testsDir)) {
  fs.mkdirSync(testsDir);
}
app.use('/tests', express.static(testsDir));

let db;
initializeDatabase().then(database => {
  db = database;
  console.log("SQLite Database initialized.");
}).catch(err => {
  console.error("Failed to init DB:", err);
});

let genai = null;
if (process.env.GEMINI_API_KEY) {
    genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} else {
    console.warn("Gemini API key is not set. Tagging will fail.");
}

function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

// --- CATALOG GENERATOR & GIT SYNC ---
let isDeploying = false;

async function generateCatalogAndSync() {
    if (isDeploying) {
        console.log("Deploy already in progress. Skipping duplicate catalog build.");
        return;
    }
    try {
        isDeploying = true;
        console.log("Generating static catalog for GitHub Pages...");
        const rows = await db.all('SELECT * FROM media ORDER BY upload_timestamp DESC');
        
        const publicCatalog = rows.map(r => {
            // Convert bot API link to public embed link
            // e.g. https://t.me/c/1003597554125/123 -> https://t.me/MyChannelUsername/123?embed=1
            // We need the user's public channel name. We'll store it in ENV or fallback to ID
            const publicChannelName = process.env.TELEGRAM_PUBLIC_CHANNEL_NAME || process.env.TELEGRAM_CHANNEL_ID.replace('-100', '');
            
            return {
                id: r.id,
                telegram_message_id: r.telegram_message_id,
                telegram_file_id: r.telegram_file_id,
                telegram_embed_url: `https://t.me/${publicChannelName}/${r.telegram_message_id}?embed=1`,
                people: JSON.parse(r.people || '[]'),
                tags: JSON.parse(r.tags || '[]'),
                upload_timestamp: r.upload_timestamp
            };
        });

        const catalogPath = path.join(__dirname, '..', 'public', 'catalog.json');
        fs.writeFileSync(catalogPath, JSON.stringify(publicCatalog, null, 2));
        console.log("Written public/catalog.json");
        
        // Disable git sync if not configured to prevent crash loops locally
        if (process.env.GIT_AUTO_SYNC === 'true') {
            console.log("Pushing updates to GitHub main branch...");
            await execPromise('git add public/catalog.json');
            await execPromise('git commit -m "Auto-update gallery catalog" || true');
            await execPromise('git push origin main || git push origin master');
            
            console.log("Rebuilding React App and Deploying to GitHub Pages (gh-pages branch)...");
            await execPromise('npm run deploy');
            console.log("Gallery Cloud Site successfully updated!");
        }
    } catch (error) {
        console.error("Catalog generation / sync failed:", error);
    } finally {
        isDeploying = false;
    }
}

app.post('/api/tag_image', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    
    // Parse people context sent from the frontend if available
    let peopleContext = [];
    try {
        if (req.body.peopleContext) {
            peopleContext = JSON.parse(req.body.peopleContext);
        }
    } catch(e) { console.warn("Could not parse people context"); }
    
    if (!genai) {
        return res.json({
            localPath: `uploads/${req.file.filename}`,
            absolutePath: filePath,
            tags: ["AI Offline", "Configure Key"]
        });
    }

    const imagePart = fileToGenerativePart(filePath, mimeType);
    
    let prompt = "Analyze this image. Return a clean, comma-separated list of 5-10 keywords describing the main objects, environment, and overall mood. Do not include any other text, just the keywords.";
    
    // Inject known people into the prompt for smarter AI tagging
    if (peopleContext.length > 0) {
        prompt = `Context: This photo contains the following people: ${peopleContext.join(', ')}. ` + prompt;
    }

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
    });

    const output = response.text || "";
    const tags = output.split(',').map(t => t.trim()).filter(t => t);

    res.json({
      localPath: `uploads/${req.file.filename}`,
      absolutePath: filePath,
      tags: tags
    });
  } catch (error) {
    console.error("Gemini tagging error:", error);
    // Graceful fallback so the UI can proceed with manual tagging
    res.json({ 
      localPath: `uploads/${req.file.filename}`,
      absolutePath: req.file.path,
      tags: ["AI Offline", "Manual Tagging Required"] 
    });
  }
});


app.post('/api/upload_final', async (req, res) => {
  try {
    const { absolutePath, localPath, people, tags, queueId } = req.body;
    
    const telegramData = await uploadToTelegram(absolutePath, { people, tags });

    const result = await db.run(`
      INSERT INTO media (local_cache_path, telegram_message_id, telegram_file_id, telegram_link, people, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      localPath,
      telegramData.telegram_message_id,
      telegramData.telegram_file_id,
      telegramData.telegram_link,
      JSON.stringify(people),
      JSON.stringify(tags)
    ]);

    if (queueId) {
       await db.run('DELETE FROM processing_queue WHERE id = ?', [queueId]);
    }

    res.json({ success: true, id: result.lastID, ...telegramData });
    
    // Cleanup: Delete the local temp file to save disk space
    try {
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            console.log(`[Auto-Cleanup] Deleted local file: ${absolutePath}`);
        }
    } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr);
    }

    // Trigger catalog regeneration and GitHub push in the background
    generateCatalogAndSync();
    
  } catch (error) {
    console.error("Final upload error:", error);
    res.status(500).json({ error: "Failed to upload to Telegram and save metadata" });
  }
});

// --- NEW OFFLINE PROCESSING UPLOAD ENDPOINT ---

const testStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, testsDir),
  filename: (req, file, cb) => {
    // Keep original filename if possible, but sanitize to avoid overwrites
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});
const uploadToTests = multer({ storage: testStorage });

app.post('/api/upload_to_tests', uploadToTests.array('photos', 50), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No files uploaded" });
        }
        res.json({ 
            success: true, 
            message: `Successfully added ${req.files.length} photos to the offline processing directory.`,
            files: req.files.map(f => f.filename)
        });
    } catch (error) {
        console.error("Upload to tests error:", error);
        res.status(500).json({ error: "Failed to upload files for processing" });
    }
});

app.get('/api/photos', async (req, res) => {
  try {
    const query = req.query.q?.toLowerCase();
    let rows;
    
    if (query) {
      rows = await db.all('SELECT * FROM media ORDER BY upload_timestamp DESC');
      rows = rows.filter(row => {
        const people = JSON.parse(row.people || '[]');
        const tags = JSON.parse(row.tags || '[]');
        return people.some(p => p.toLowerCase().includes(query)) ||
               tags.some(t => t.toLowerCase().includes(query));
      });
    } else {
      rows = await db.all('SELECT * FROM media ORDER BY upload_timestamp DESC');
    }

    const mapped = rows.map(r => ({
      ...r,
      people: JSON.parse(r.people || '[]'),
      tags: JSON.parse(r.tags || '[]')
    }));

    res.json(mapped);
  } catch (error) {
    console.error("Fetch photos error:", error);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

app.get('/api/photo_url/:file_id', async (req, res) => {
    const { file_id } = req.params;
    const url = await getTelegramFileUrl(file_id);
    if (url) {
        res.json({ url });
    } else {
        res.status(404).json({ error: "Not found" });
    }
});

// --- NEW INTELLIGENT TAGGING ENDPOINTS ---

app.get('/api/known_faces', async (req, res) => {
  try {
    const faces = await db.all('SELECT name, descriptor FROM faces');
    res.json(faces);
  } catch (error) {
    console.error("Fetch faces error:", error);
    res.status(500).json({ error: "Failed to fetch known faces" });
  }
});

app.post('/api/save_face', async (req, res) => {
  try {
    const { name, descriptor } = req.body;
    if (!name || !descriptor) {
      return res.status(400).json({ error: "Name and descriptor are required" });
    }
    
    await db.run(`
      INSERT INTO faces (name, descriptor) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET descriptor=excluded.descriptor
    `, [name, JSON.stringify(descriptor)]);
    
    res.json({ success: true, message: `Saved face math for ${name}` });
  } catch (error) {
    console.error("Save face error:", error);
    res.status(500).json({ error: "Failed to save face locally" });
  }
});

app.delete('/api/delete_photo/:id', async (req, res) => {
  try {
    const photoId = req.params.id;
    await db.run('DELETE FROM media WHERE id = ?', [photoId]);
    res.json({ success: true, message: "Photo metadata removed from local gallery" });
    
    // Trigger catalog update
    generateCatalogAndSync();
  } catch (error) {
    console.error("Delete photo error:", error);
    res.status(500).json({ error: "Failed to delete photo metadata" });
  }
});

// --- PYTHON BACKGROUND PROCESSOR & FLASK API ---
let pythonProcess = null;
let flaskProcess = null;

app.post('/api/processor/start', (req, res) => {
  if (pythonProcess || flaskProcess) {
    return res.json({ success: false, message: "Processor/API is already running." });
  }
  
  const venvPython = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
  
  // 1. Start the Background Processor Daemon
  const scriptPath = path.join(__dirname, 'ai_processor', 'processor.py');
  pythonProcess = spawn(venvPython, [scriptPath]);
  pythonProcess.stdout.on('data', (data) => console.log(`[AI Daemon]: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`[AI Daemon Error]: ${data}`));
  pythonProcess.on('close', (code) => {
    console.log(`[AI Daemon] exited with code ${code}`);
    pythonProcess = null;
  });

  // 2. Start the Flask Search API
  const flaskPath = path.join(__dirname, 'ai_processor', 'search_api.py');
  flaskProcess = spawn(venvPython, [flaskPath]);
  flaskProcess.stdout.on('data', (data) => console.log(`[Flask API]: ${data}`));
  flaskProcess.stderr.on('data', (data) => console.error(`[Flask API Error]: ${data}`));
  flaskProcess.on('close', (code) => {
    console.log(`[Flask API] exited with code ${code}`);
    flaskProcess = null;
  });

  res.json({ success: true, message: "AI Processor and Search API started." });
});

app.post('/api/processor/stop', (req, res) => {
  if (pythonProcess || flaskProcess) {
    if (process.platform === 'win32') {
         if (pythonProcess) spawn("taskkill", ["/pid", pythonProcess.pid, '/f', '/t']);
         if (flaskProcess) spawn("taskkill", ["/pid", flaskProcess.pid, '/f', '/t']);
    } else {
         if (pythonProcess) pythonProcess.kill('SIGINT');
         if (flaskProcess) flaskProcess.kill('SIGINT');
    }
    pythonProcess = null;
    flaskProcess = null;
    res.json({ success: true, message: "AI Processor and Search API stopped." });
  } else {
    res.json({ success: false, message: "Processor is not running." });
  }
});

app.get('/api/processor/status', (req, res) => {
  res.json({ running: !!pythonProcess || !!flaskProcess });
});

app.get('/api/review_queue', async (req, res) => {
  try {
    const queue = await db.all("SELECT * FROM processing_queue WHERE status = 'PENDING_REVIEW'");
    const mapped = queue.map(q => ({
      ...q,
      detected_faces: JSON.parse(q.detected_faces || '[]')
    }));
    res.json(mapped);
  } catch (err) {
    console.error("Fetch queue error:", err);
    res.status(500).json({ error: "Failed to fetch review queue" });
  }
});

app.delete('/api/review_queue/:id', async (req, res) => {
  try {
    const queueItem = await db.get('SELECT file_path FROM processing_queue WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM processing_queue WHERE id = ?', [req.params.id]);
    
    // Cleanup the local file when rejected
    if (queueItem && queueItem.file_path) {
        try {
            if (fs.existsSync(queueItem.file_path)) {
                fs.unlinkSync(queueItem.file_path);
                console.log(`[Auto-Cleanup] Deleted rejected file: ${queueItem.file_path}`);
            }
        } catch (e) {
            console.error("Failed to delete local rejection file:", e);
        }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete from queue error:", error);
    res.status(500).json({ error: "Failed to delete from queue" });
  }
});

// --- SEMANTIC SEARCH PROXIES ---
app.post('/api/search/semantic_text', async (req, res) => {
    try {
        const response = await fetch('http://localhost:5000/api/search/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        
        // Lookup full photo details from SQLite using the returned paths
        if (data.success && data.results) {
            const paths = data.results.map(r => r.source);
            if (paths.length > 0) {
                const placeholders = paths.map(() => '?').join(',');
                const rows = await db.all(`SELECT * FROM media WHERE local_cache_path IN (${placeholders})`, paths);
                
                // Keep the items ordered by confidence
                const orderedRows = paths.map(p => rows.find(r => r.local_cache_path === p)).filter(Boolean);
                
                const mappedRows = orderedRows.map(r => ({
                    ...r,
                    people: JSON.parse(r.people || '[]'),
                    tags: JSON.parse(r.tags || '[]')
                }));
                return res.json({ success: true, photos: mappedRows });
            }
        }
        res.json({ success: true, photos: [] });
    } catch (e) {
        console.error("Semantic text proxy error:", e);
        res.status(500).json({ error: "Search failed. Is the AI processor running?" });
    }
});

app.post('/api/search/semantic_image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        
        const fileBuffer = fs.readFileSync(req.file.path);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype });
        
        const formData = new FormData();
        formData.append('file', blob, req.file.originalname);
        
        const response = await fetch('http://localhost:5000/api/search/image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        // Clean up the temp uploaded image
        fs.unlinkSync(req.file.path);
        
        if (data.success && data.results) {
            const paths = data.results.map(r => r.source);
            if (paths.length > 0) {
                 const placeholders = paths.map(() => '?').join(',');
                 const rows = await db.all(`SELECT * FROM media WHERE local_cache_path IN (${placeholders})`, paths);
                 
                 const orderedRows = paths.map(p => rows.find(r => r.local_cache_path === p)).filter(Boolean);
                 
                 const mappedRows = orderedRows.map(r => ({
                     ...r,
                     people: JSON.parse(r.people || '[]'),
                     tags: JSON.parse(r.tags || '[]')
                 }));
                 return res.json({ success: true, photos: mappedRows });
            }
        }
        res.json({ success: true, photos: [] });
    } catch (e) {
         console.error("Semantic image proxy error:", e);
         res.status(500).json({ error: "Search failed. Is the AI processor running?" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

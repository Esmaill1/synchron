import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 60);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${uniqueSuffix}-${cleanBase || 'track'}${ext || '.mp3'}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('audio/') || allowedExts.includes(ext) || file.mimetype === 'video/ogg') {
    cb(null, true);
  } else {
    cb(new Error('Only audio files (MP3, WAV, OGG, FLAC, M4A, AAC) are supported.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', serverTime: Date.now() });
});

// File upload
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const originalTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const title = req.body.title?.trim() || originalTitle;
    const artist = req.body.artist?.trim() || 'Uploaded Audio';
    const uploader = req.body.uploader?.trim() || 'Anonymous';
    const duration = parseFloat(req.body.duration) || 0;

    const track = {
      id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      title,
      artistOrChannel: artist,
      durationSec: duration,
      type: 'file',
      url: `/api/media/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      uploaderName: uploader,
      addedAt: Date.now()
    };

    res.json({ success: true, track });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

// CORS options for media streaming
router.options('/media/:filename', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Encoding',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Access-Control-Max-Age': '86400'
  });
  res.sendStatus(204);
});

// HTTP 206 Partial Content Range Streaming
router.get('/media/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Audio file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(safeFilename).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.webm': 'audio/webm'
  };
  const contentType = mimeTypes[ext] || 'audio/mpeg';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Encoding',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set({
        'Content-Range': `bytes */${fileSize}`,
        ...corsHeaders
      }).send('Requested range not satisfiable');
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// YouTube info endpoint via oEmbed
router.get('/youtube-info', async (req, res) => {
  const inputUrl = req.query.url;
  if (!inputUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Extract video ID
    let videoId = null;
    const regExp = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = inputUrl.match(regExp);

    if (match && match[1]) {
      videoId = match[1];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(inputUrl.trim())) {
      videoId = inputUrl.trim();
    }

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    let title = 'YouTube Video';
    let author = 'YouTube Channel';

    try {
      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = await response.json();
        title = data.title || title;
        author = data.author_name || author;
      }
    } catch {
      // Fallback if oEmbed is unreachable
    }

    const track = {
      id: `yt-${videoId}-${Date.now()}`,
      title,
      artistOrChannel: author,
      durationSec: 0, // YouTube IFrame Player will provide actual duration on load
      type: 'youtube',
      url: videoId,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      uploaderName: req.query.uploader || 'Anonymous',
      addedAt: Date.now()
    };

    res.json({ success: true, track, videoId });
  } catch (err) {
    console.error('YouTube info error:', err);
    res.status(500).json({ error: 'Failed to retrieve YouTube information' });
  }
});

export default router;

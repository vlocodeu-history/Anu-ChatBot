import express from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/index.js';

const router = express.Router();

// Configure S3 client (works with MinIO too)
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  },
  forcePathStyle: true // Required for MinIO
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600') // 100MB default
  }
});

// Upload encrypted file
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { encryptedKey } = req.body;

  if (!encryptedKey) {
    return res.status(400).json({ message: 'Encrypted key required' });
  }

  try {
    const fileId = uuidv4();
    const s3Key = `files/${req.user.userId}/${fileId}`;

    // Upload to S3/MinIO
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        'original-name': req.file.originalname,
        'uploader-id': String(req.user.userId)
      }
    }));

    // Store metadata in database
    await pool.query(
      `INSERT INTO files (id, uploader_id, file_name, file_type, file_size, s3_key, encrypted_key, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')`,
      [
        fileId,
        req.user.userId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        s3Key,
        encryptedKey
      ]
    );

    res.json({ fileId });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

// Get file download URL
router.get('/download/:fileId', async (req, res) => {
  const { fileId } = req.params;

  try {
    // Get file metadata
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1',
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    const file = result.rows[0];

    // Generate presigned URL (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: file.s3_key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({
      url,
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
      encryptedKey: file.encrypted_key
    });
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ message: 'Failed to get file' });
  }
});

export default router;
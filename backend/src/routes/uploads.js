const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Конфигурация хранилища для Multer
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = file.mimetype.startsWith('image/') 
      ? 'backend/uploads/images' 
      : 'backend/uploads/files';
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// Фильтр файлов
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: fileFilter
});

// Загрузка аватара
router.post('/avatar', auth, upload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const avatarUrl = '/uploads/avatars/' + req.file.filename;

  const User = require('../models/User');
  await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

  logger.info('Avatar uploaded for user: ' + req.user.username);

  res.json({
    success: true,
    data: { url: avatarUrl }
  });
}));

// Загрузка изображений для чата
router.post('/image', auth, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const imageUrl = '/uploads/images/' + req.file.filename;

  logger.info('Image uploaded by user: ' + req.user.username);

  res.json({
    success: true,
    data: {
      url: imageUrl,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  });
}));

// Загрузка файлов
router.post('/file', auth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = '/uploads/files/' + req.file.filename;

  logger.info('File uploaded by user: ' + req.user.username);

  res.json({
    success: true,
    data: {
      url: fileUrl,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  });
}));

// Обработка ошибок Multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  
  next();
});

module.exports = router;

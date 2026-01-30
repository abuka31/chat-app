require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');

const { initializeSocket } = require('./socket/socketHandler');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Инициализация Socket.IO
const io = initializeSocket(server);
app.set('io', io);

// Middleware
app.use(helmet());
app.use(xss());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Слишком много запросов, попробуйте позже' }
});
app.use('/api/', limiter);

// Статические файлы для загруженных изображений
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Подключение к MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/comback');
    logger.info('MongoDB подключена успешно');
  } catch (error) {
    logger.error('Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/uploads', require('./routes/uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error Handler
app.use(errorHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    logger.info(`Сервер запущен на порту ${PORT}`);
    logger.info(`Режим: ${process.env.NODE_ENV || 'development'}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM получен, завершение работы...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      logger.info('Сервер закрыт');
      process.exit(0);
    });
  });
});

// Роуты
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/uploads', require('./routes/uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error Handler — обязательно ПОСЛЕ роутов
app.use(errorHandler);

// 404 Handler — ПОСЛЕ errorHandler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});


module.exports = { app, server, io };


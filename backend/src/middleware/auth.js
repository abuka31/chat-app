const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware для проверки JWT токена
 */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    logger.error('Ошибка авторизации:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Невалидный токен' });
    }
    
    res.status(401).json({ error: 'Ошибка авторизации' });
  }
};

/**
 * Middleware для проверки роли
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    next();
  };
};

/**
 * Middleware для проверки участия в чате
 */
const isChatParticipant = async (req, res, next) => {
  try {
    const Chat = require('../models/Chat');
    const chatId = req.params.chatId || req.body.chatId;
    
    if (!chatId) {
      return res.status(400).json({ error: 'ID чата обязателен' });
    }

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const isParticipant = chat.participants.some(
      p => p.user.toString() === req.user._id.toString() && !p.leftAt
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    req.chat = chat;
    next();
  } catch (error) {
    logger.error('Ошибка проверки участника чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

module.exports = { auth, requireRole, isChatParticipant };

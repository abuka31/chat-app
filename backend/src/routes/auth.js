const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Генерация JWT токена
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

/**
 * @route   POST /api/auth/register
 * @desc    Регистрация нового пользователя
 * @access  Public
 */
router.post('/register', [
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль минимум 6 символов'),
  body('username').isLength({ min: 3, max: 30 }).withMessage('Имя пользователя 3-30 символов')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, username } = req.body;

  // Проверка существования пользователя
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    return res.status(400).json({
      error: existingUser.email === email 
        ? 'Email уже используется' 
        : 'Имя пользователя занято'
    });
  }

  // Создание пользователя
  const user = new User({
    email,
    password,
    username
  });

  await user.save();

  // Генерация токена
  const token = generateToken(user._id);

  logger.info(`New user registered: ${username}`);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        status: user.status
      },
      token
    }
  });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Вход в систему
 * @access  Public
 */
router.post('/login', [
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  // Поиск пользователя с паролем
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Проверка пароля
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Проверка блокировки
  if (user.isBlocked) {
    return res.status(403).json({ error: 'Аккаунт заблокирован' });
  }

  // Обновление статуса
  user.status = 'online';
  await user.save();

  // Генерация токена
  const token = generateToken(user._id);

  logger.info(`User logged in: ${user.username}`);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        statusMessage: user.statusMessage
      },
      token
    }
  });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Выход из системы
 * @access  Private
 */
router.post('/logout', auth, asyncHandler(async (req, res) => {
  req.user.status = 'offline';
  req.user.lastSeen = new Date();
  await req.user.save();

  logger.info(`User logged out: ${req.user.username}`);

  res.json({
    success: true,
    message: 'Вы вышли из системы'
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Получить текущего пользователя
 * @access  Private
 */
router.get('/me', auth, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        avatar: req.user.avatar,
        status: req.user.status,
        statusMessage: req.user.statusMessage,
        lastSeen: req.user.lastSeen,
        createdAt: req.user.createdAt
      }
    }
  });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Обновить токен
 * @access  Private
 */
router.post('/refresh', auth, asyncHandler(async (req, res) => {
  const token = generateToken(req.user._id);

  res.json({
    success: true,
    data: { token }
  });
}));

module.exports = router;

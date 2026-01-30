const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * @route   GET /api/users/search
 * @desc    Поиск пользователей
 * @access  Private
 */
router.get('/search', auth, asyncHandler(async (req, res) => {
  const { q, limit = 20 } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Запрос минимум 2 символа' });
  }

  const users = await User.find({
    $or: [
      { username: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ],
    _id: { $ne: req.user._id }
  })
  .select('username email avatar status statusMessage')
  .limit(parseInt(limit));

  res.json({
    success: true,
    data: { users }
  });
}));

/**
 * @route   GET /api/users/:id
 * @desc    Получить пользователя по ID
 * @access  Private
 */
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('username email avatar status statusMessage lastSeen createdAt');

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * @route   PUT /api/users/profile
 * @desc    Обновить профиль
 * @access  Private
 */
router.put('/profile', auth, [
  body('username').optional().isLength({ min: 3, max: 30 }).withMessage('Имя пользователя 3-30 символов'),
  body('statusMessage').optional().isLength({ max: 100 }).withMessage('Статус максимум 100 символов')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, statusMessage } = req.body;
  const updateData = {};

  if (username && username !== req.user.username) {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Имя пользователя занято' });
    }
    updateData.username = username;
  }

  if (statusMessage !== undefined) {
    updateData.statusMessage = statusMessage;
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');

  logger.info(`Profile updated: ${user.username}`);

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * @route   PUT /api/users/password
 * @desc    Изменить пароль
 * @access  Private
 */
router.put('/password', auth, [
  body('currentPassword').notEmpty().withMessage('Текущий пароль обязателен'),
  body('newPassword').isLength({ min: 6 }).withMessage('Новый пароль минимум 6 символов')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }

  user.password = newPassword;
  await user.save();

  logger.info(`Password changed: ${user.username}`);

  res.json({
    success: true,
    message: 'Пароль изменён'
  });
}));

/**
 * @route   PUT /api/users/status
 * @desc    Изменить статус
 * @access  Private
 */
router.put('/status', auth, asyncHandler(async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['online', 'offline', 'away', 'busy'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { status },
    { new: true }
  ).select('-password');

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * @route   GET /api/users
 * @desc    Получить всех пользователей (с пагинацией)
 * @access  Private
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const users = await User.find()
    .select('username email avatar status statusMessage')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments();

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

module.exports = router;

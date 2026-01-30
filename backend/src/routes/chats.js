const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { isChatParticipant } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const logger = require('../utils/logger');

router.get('/', auth, asyncHandler(async (req, res) => {
  const chats = await Chat.find({
    'participants.user': req.user._id,
    'participants.leftAt': null,
    isActive: true
  })
  .populate('participants.user', 'username avatar status statusMessage')
  .populate('lastMessage.sender', 'username avatar')
  .sort({ updatedAt: -1 });

  const chatsWithUnread = await Promise.all(
    chats.map(async (chat) => {
      const participant = chat.participants.find(
        p => p.user._id.toString() === req.user._id.toString()
      );

      const unreadCount = await Message.countDocuments({
        chat: chat._id,
        createdAt: { $gt: participant?.lastReadMessage ? participant.lastReadMessage.createdAt : new Date(0) },
        sender: { $ne: req.user._id }
      });

      return { ...chat.toObject(), unreadCount };
    })
  );

  res.json({ success: true, data: { chats: chatsWithUnread } });
}));

router.post('/private', auth, [
  body('userId').notEmpty().withMessage('ID пользователя обязателен')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { userId } = req.body;

  if (userId === req.user._id.toString()) {
    return res.status(400).json({ error: 'Cannot create chat with yourself' });
  }

  const otherUser = await User.findById(userId);
  if (!otherUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  let chat = await Chat.getPrivateChat(req.user._id, userId);

  if (!chat) {
    chat = new Chat({
      type: 'private',
      participants: [
        { user: req.user._id, role: 'member' },
        { user: userId, role: 'member' }
      ],
      createdBy: req.user._id
    });

    await chat.save();
    await chat.populate('participants.user', 'username avatar status statusMessage');
    logger.info('Private chat created between ' + req.user.username + ' and ' + otherUser.username);
  }

  res.json({ success: true, data: { chat } });
}));

router.post('/group', auth, [
  body('name').isLength({ min: 3, max: 100 }).withMessage('Chat name must be 3-100 characters'),
  body('participants').isArray({ min: 2 }).withMessage('Minimum 2 participants required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, participants, avatar } = req.body;

  const participantIds = [...participants];
  if (!participantIds.includes(req.user._id.toString())) {
    participantIds.push(req.user._id);
  }

  const users = await User.find({ _id: { $in: participantIds } });
  if (users.length !== participantIds.length) {
    return res.status(400).json({ error: 'One or more users not found' });
  }

  const chat = new Chat({
    name,
    type: 'group',
    participants: users.map(user => ({
      user: user._id,
      role: user._id.toString() === req.user._id.toString() ? 'creator' : 'member'
    })),
    avatar: avatar || '',
    admin: req.user._id,
    createdBy: req.user._id
  });

  await chat.save();
  await chat.populate('participants.user', 'username avatar status statusMessage');
  logger.info('Group chat created: ' + name + ' by ' + req.user.username);

  res.status(201).json({ success: true, data: { chat } });
}));

router.get('/:id', auth, isChatParticipant, asyncHandler(async (req, res) => {
  await req.chat.populate('participants.user', 'username avatar status statusMessage');
  await req.chat.populate('lastMessage.sender', 'username avatar');
  res.json({ success: true, data: { chat: req.chat } });
}));

router.put('/:id', auth, isChatParticipant, asyncHandler(async (req, res) => {
  const { name, avatar } = req.body;

  if (req.chat.type !== 'group') {
    return res.status(400).json({ error: 'Can only update group chats' });
  }

  const participant = req.chat.participants.find(
    p => p.user.toString() === req.user._id.toString()
  );

  if (!['admin', 'creator'].includes(participant.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (name) req.chat.name = name;
  if (avatar !== undefined) req.chat.avatar = avatar;

  await req.chat.save();
  await req.chat.populate('participants.user', 'username avatar status statusMessage');

  res.json({ success: true, data: { chat: req.chat } });
}));

router.post('/:id/leave', auth, isChatParticipant, asyncHandler(async (req, res) => {
  const participant = req.chat.participants.find(
    p => p.user.toString() === req.user._id.toString()
  );

  if (req.chat.type === 'private') {
    return res.status(400).json({ error: 'Cannot leave private chat' });
  }

  if (participant.role === 'creator' && req.chat.participants.filter(p => !p.leftAt).length > 1) {
    return res.status(400).json({ error: 'Creator must transfer rights before leaving' });
  }

  participant.leftAt = new Date();
  await req.chat.save();
  logger.info('User ' + req.user.username + ' left group chat ' + req.chat.name);

  res.json({ success: true, message: 'You left the chat' });
}));

router.post('/:id/join', auth, asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);

  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const isParticipant = chat.participants.some(
    p => p.user.toString() === req.user._id.toString() && !p.leftAt
  );

  if (isParticipant) {
    return res.status(400).json({ error: 'Already a participant' });
  }

  chat.participants.push({ user: req.user._id, role: 'member' });
  await chat.save();
  await chat.populate('participants.user', 'username avatar status statusMessage');

  res.json({ success: true, data: { chat } });
}));

router.delete('/:id', auth, isChatParticipant, asyncHandler(async (req, res) => {
  const participant = req.chat.participants.find(
    p => p.user.toString() === req.user._id.toString()
  );

  if (participant.role !== 'creator') {
    return res.status(403).json({ error: 'Only creator can delete chat' });
  }

  await Message.deleteMany({ chat: req.chat._id });
  await Chat.findByIdAndDelete(req.chat._id);
  logger.info('Chat deleted: ' + req.chat.name + ' by ' + req.user.username);

  res.json({ success: true, message: 'Chat deleted' });
}));

router.get('/:id/messages', auth, isChatParticipant, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const messages = await Message.find({ chat: req.chat._id, isDeleted: false })
    .populate('sender', 'username avatar')
    .populate('replyTo', 'content sender')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Message.countDocuments({ chat: req.chat._id });
  messages.reverse();

  res.json({
    success: true,
    data: {
      messages,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }
  });
}));

module.exports = router;

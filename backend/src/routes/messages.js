const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { isChatParticipant } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const logger = require('../utils/logger');

router.post('/', auth, isChatParticipant, [
  body('content').optional().isLength({ max: 5000 }).withMessage('Message max 5000 characters'),
  body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { content, type = 'text', replyTo, attachments } = req.body;

  if (!content && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: 'Message content or attachments required' });
  }

  const message = new Message({
    chat: req.chat._id,
    sender: req.user._id,
    content,
    type,
    replyTo: replyTo || null,
    attachments: attachments || []
  });

  await message.save();
  await message.populate('sender', 'username avatar');
  await message.populate('replyTo', 'content sender');

  // Update chat's last message
  req.chat.lastMessage = {
    content: type === 'text' ? content : '[' + type + ']',
    sender: req.user._id,
    createdAt: new Date(),
    type
  };
  await req.chat.save();

  logger.info('Message sent in chat ' + req.chat._id + ' by ' + req.user.username);

  const io = req.app.get('io');
  io.to('chat:' + req.chat._id).emit('message:new', message);

  res.status(201).json({ success: true, data: { message } });
}));

router.get('/chat/:chatId', auth, asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const isParticipant = chat.participants.some(
    p => p.user.toString() === req.user._id.toString() && !p.leftAt
  );

  if (!isParticipant) {
    return res.status(403).json({ error: 'Not a participant' });
  }

  const { page = 1, limit = 50 } = req.query;

  const messages = await Message.find({ chat: chat._id, isDeleted: false })
    .populate('sender', 'username avatar')
    .populate('replyTo', 'content sender')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Message.countDocuments({ chat: chat._id });
  messages.reverse();

  res.json({
    success: true,
    data: {
      messages,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }
  });
}));

router.put('/:id', auth, asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content || content.length > 5000) {
    return res.status(400).json({ error: 'Content required, max 5000 characters' });
  }

  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (message.sender.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Cannot edit other users messages' });
  }

  if (message.isDeleted) {
    return res.status(400).json({ error: 'Cannot edit deleted message' });
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  await message.populate('sender', 'username avatar');

  const io = req.app.get('io');
  io.to('chat:' + message.chat).emit('message:edited', message);

  res.json({ success: true, data: { message } });
}));

router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (message.sender.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Cannot delete other users messages' });
  }

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.deletedBy = req.user._id;
  message.content = '';
  await message.save();

  const io = req.app.get('io');
  io.to('chat:' + message.chat).emit('message:deleted', { messageId: message._id });

  res.json({ success: true, message: 'Message deleted' });
}));

router.get('/search', auth, asyncHandler(async (req, res) => {
  const { q, chatId, limit = 50 } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const query = {
    content: { $regex: q, $options: 'i' },
    isDeleted: false,
    sender: req.user._id
  };

  if (chatId) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    query.chat = chatId;
  }

  const messages = await Message.find(query)
    .populate('chat', 'name type')
    .populate('sender', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  res.json({ success: true, data: { messages } });
}));

module.exports = router;

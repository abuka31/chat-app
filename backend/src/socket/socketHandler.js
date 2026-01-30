const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const logger = require('../utils/logger');

const onlineUsers = new Map(); // userId -> socketId

/**
 * Инициализация Socket.IO сервера
 */
const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware для Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Требуется авторизация'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');

      if (!user) {
        return next(new Error('Пользователь не найден'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket auth error:', error.message);
      next(new Error('Невалидный токен'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`User connected: ${socket.user.username} (${socket.id})`);

    // Добавляем пользователя в онлайн
    onlineUsers.set(userId, socket.id);

    // Обновляем статус пользователя на online
    User.findByIdAndUpdate(userId, { status: 'online', lastSeen: new Date() }).exec();

    // Уведомляем контактов о выходе в онлайн
    socket.join(`user:${userId}`);

    // Присоединение к комнатам чатов
    socket.on('join:chat', async (chatId) => {
      try {
        const chat = await Chat.findById(chatId);
        if (chat) {
          const isParticipant = chat.participants.some(
            p => p.user.toString() === userId && !p.leftAt
          );
          
          if (isParticipant) {
            socket.join(`chat:${chatId}`);
            logger.debug(`User ${socket.user.username} joined chat ${chatId}`);
          }
        }
      } catch (error) {
        logger.error('Error joining chat:', error);
      }
    });

    // Выход из чата
    socket.on('leave:chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
      logger.debug(`User ${socket.user.username} left chat ${chatId}`);
    });

    // Отправка сообщения
    socket.on('message:send', async (data) => {
      try {
        const { chatId, content, type = 'text', replyTo, attachments } = data;

        const chat = await Chat.findById(chatId);
        if (!chat) {
          return socket.emit('error', { message: 'Чат не найден' });
        }

        const isParticipant = chat.participants.some(
          p => p.user.toString() === userId && !p.leftAt
        );

        if (!isParticipant) {
          return socket.emit('error', { message: 'Вы не участник чата' });
        }

        // Создаем сообщение
        const message = new Message({
          chat: chatId,
          sender: userId,
          content,
          type,
          replyTo: replyTo || null,
          attachments: attachments || []
        });

        await message.save();

        // Обновляем последнее сообщение в чате
        chat.lastMessage = {
          content: type === 'text' ? content : `[${type}]`,
          sender: userId,
          createdAt: new Date(),
          type
        };
        await chat.save();

        // Популейт сообщение с данными отправителя
        await message.populate('sender', 'username avatar status');
        await message.populate('replyTo', 'content sender');

        // Отправляем сообщение всем участникам чата
        io.to(`chat:${chatId}`).emit('message:new', message);

        // Отправляем уведомление о новом сообщении
        chat.participants.forEach(p => {
          if (p.user.toString() !== userId) {
            io.to(`user:${p.user.toString()}`).emit('notification:message', {
              chatId,
              message: {
                content: type === 'text' ? content : `[${type}]`,
                sender: socket.user.username
              }
            });
          }
        });

        logger.info(`Message sent in chat ${chatId} by ${socket.user.username}`);
      } catch (error) {
        logger.error('Error sending message:', error);
        socket.emit('error', { message: 'Ошибка отправки сообщения' });
      }
    });

    // Отметка сообщений как прочитанных
    socket.on('messages:read', async (data) => {
      try {
        const { chatId } = data;
        
        const chat = await Chat.findById(chatId);
        if (!chat) return;

        // Обновляем последнее прочитанное сообщение
        const participant = chat.participants.find(
          p => p.user.toString() === userId
        );
        
        if (participant) {
          // Находим последнее сообщение в чате
          const lastMessage = await Message.findOne({ chat: chatId })
            .sort({ createdAt: -1 });
          
          if (lastMessage) {
            participant.lastReadMessage = lastMessage._id;
            await chat.save();
          }
        }

        // Уведомляем отправителя о прочтении
        if (chat.lastMessage && chat.lastMessage.sender) {
          io.to(`user:${chat.lastMessage.sender.toString()}`).emit('message:read', {
            chatId,
            readerId: userId
          });
        }
      } catch (error) {
        logger.error('Error marking messages as read:', error);
      }
    });

    // Набор сообщения
    socket.on('typing:start', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user:typing', {
        chatId,
        userId,
        username: socket.user.username
      });
    });

    socket.on('typing:stop', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user:stop-typing', {
        chatId,
        userId
      });
    });

    // Получение списка онлайн пользователей
    socket.on('get:online-users', () => {
      socket.emit('online:users', Array.from(onlineUsers.keys()));
    });

    // Обработка отключения
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.user.username} (${socket.id})`);
      
      onlineUsers.delete(userId);
      
      // Обновляем статус на offline
      await User.findByIdAndUpdate(userId, { 
        status: 'offline', 
        lastSeen: new Date() 
      });

      // Уведомляем контактов об оффлайне
      io.emit('user:offline', { userId });
    });

    // Принудительное отключение (logout)
    socket.on('logout', async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { 
        status: 'offline', 
        lastSeen: new Date() 
      });
      socket.disconnect();
    });
  });

  return io;
};

// Утилита для отправки уведомления конкретному пользователю
const sendToUser = (userId, event, data) => {
  const io = require('../server').io;
  const socketId = onlineUsers.get(userId.toString());
  
  if (socketId && io) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

// Получение статуса пользователя
const isUserOnline = (userId) => {
  return onlineUsers.has(userId.toString());
};

module.exports = {
  initializeSocket,
  sendToUser,
  isUserOnline,
  onlineUsers
};

const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Название чата максимум 100 символов']
  },
  type: {
    type: String,
    enum: ['private', 'group'],
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    role: {
      type: String,
      enum: ['member', 'admin', 'creator'],
      default: 'member'
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    lastReadMessage: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  }],
  avatar: {
    type: String,
    default: ''
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: Date,
    type: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Индекс для поиска по участникам
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ updatedAt: -1 });

// Обновление timestamp при изменении
chatSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Статический метод для получения приватного чата между двумя пользователями
chatSchema.statics.getPrivateChat = async function(user1Id, user2Id) {
  const chat = await this.findOne({
    type: 'private',
    'participants.user': { $all: [user1Id, user2Id] }
  }).populate('participants.user', 'username avatar status');
  
  return chat;
};

module.exports = mongoose.model('Chat', chatSchema);

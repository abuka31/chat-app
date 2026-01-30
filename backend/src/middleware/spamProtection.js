const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware для защиты от спама
 */
const spamProtection = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const now = Date.now();
    const spamLimit = parseInt(process.env.SPAM_MESSAGE_LIMIT) || 5;
    const timeWindow = parseInt(process.env.SPAM_TIME_WINDOW) || 60000;

    // Проверяем, прошло ли достаточно времени с последнего спама
    if (user.lastSpamTime && (now - new Date(user.lastSpamTime).getTime()) < timeWindow) {
      if (user.spamCount >= spamLimit) {
        logger.warn(`Спам detected for user ${userId}`);
        return res.status(429).json({
          error: 'Слишком много сообщений. Пожалуйста, подождите.',
          retryAfter: Math.ceil((timeWindow - (now - new Date(user.lastSpamTime).getTime())) / 1000)
        });
      }
    } else {
      // Сбрасываем счетчик, если прошло достаточно времени
      user.spamCount = 0;
      user.lastSpamTime = null;
    }

    // Добавляем метод для проверки в контроллерах
    req.checkSpam = async () => {
      const currentUser = await User.findById(userId);
      const currentTime = Date.now();
      
      if (currentUser.lastSpamTime && 
          (currentTime - new Date(currentUser.lastSpamTime).getTime()) < timeWindow) {
        currentUser.spamCount += 1;
        
        if (currentUser.spamCount >= spamLimit) {
          currentUser.lastSpamTime = new Date();
          await currentUser.save();
          return false; // Spam detected
        }
      } else {
        currentUser.spamCount = 1;
        currentUser.lastSpamTime = new Date();
      }
      
      await currentUser.save();
      return true; // Not spam
    };

    next();
  } catch (error) {
    logger.error('Ошибка spam protection:', error);
    next();
  }
};

/**
 * Middleware для проверки, не заблокирован ли пользователь
 */
const checkBlocked = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user && user.isBlocked) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }
    
    next();
  } catch (error) {
    logger.error('Ошибка проверки блокировки:', error);
    next();
  }
};

module.exports = { spamProtection, checkBlocked };

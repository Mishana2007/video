require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CHANNEL_USERNAME = '@naneironkah';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN_VIDEO;
const DAILY_LIMIT = 1;
const INITIAL_LIMIT = 3;
const BOT_USERNAME = '@naneironkah';

const db = new sqlite3.Database('bot_database.db');
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      remaining_processes INTEGER DEFAULT ${INITIAL_LIMIT},
      last_reset_date TEXT,
      registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
      referral_code TEXT UNIQUE,
      referred_by TEXT
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS referral_uses (
      referral_code TEXT,
      used_by INTEGER,
      used_date TEXT,
      UNIQUE(referral_code, used_by)
    )
  `);
});

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GENAI);

function getTimeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  };
}

function generateReferralCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

const MESSAGES = {
  welcome: (remaining) => {
    const time = getTimeUntilMidnight();
    return `
🎥 *Добро пожаловать в Video Analysis Bot!*

Я помогу вам проанализировать ваши видео и предоставить профессиональный разбор.

📌 *Как использовать бот:*
1. Подпишитесь на наш канал
2. Отправьте видео для анализа
3. Получите детальный разбор

⚡️ *Система анализов:*
• ${INITIAL_LIMIT} анализа после регистрации
• +${DAILY_LIMIT} анализ каждый день
• Дополнительные анализы за приглашения

🎯 *Доступно анализов:* ${remaining}
⏰ *Следующее обновление через:* ${time.hours}ч ${time.minutes}м

💫 Используйте /ref для получения реферальной ссылки`;
  },

  subscribe: `
❗️ *Необходима подписка*

Для использования бота:
1️⃣ Подпишитесь на канал ${CHANNEL_USERNAME}
2️⃣ Отправьте любое видео для анализа
3️⃣ Получите профессиональный разбор`,

  processing: `
🔄 *Начинаю анализ вашего видео*

⏳ Это займет несколько минут
📝 Вы получите подробный разбор всех аспектов выступления`,

  complete: `
✅ *Анализ выступления завершен*

📊 Результаты анализа представлены ниже`,

  error: `
❌ *Не удалось обработать видео*

Возможные причины:
• Формат файла не поддерживается
• Размер превышает 20MB
• Технические неполадки`,

  limitReached: (time) => `
⚠️ *Лимит исчерпан*

• Доступные анализы закончились
• +${DAILY_LIMIT} анализ завтра
• До обновления: ${time.hours}ч ${time.minutes}м

💡 Получите больше анализов:
• Пригласите друзей через /ref
• Дождитесь ежедневного обновления`,

  referral: (code) => `
🎁 *Ваша реферальная ссылка:*

https://t.me/${BOT_USERNAME}?start=${code}

За каждого приглашенного пользователя вы получите:
• +2 дополнительных анализа
• Возможность копить анализы

🔄 Ссылка многоразовая`
};

async function getReferralCode(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT referral_code FROM users WHERE user_id = ?', [userId], async (err, user) => {
      if (err) return reject(err);
      
      if (user?.referral_code) {
        resolve(user.referral_code);
      } else {
        const code = generateReferralCode();
        db.run('UPDATE users SET referral_code = ? WHERE user_id = ?', [code, userId], (err) => {
          if (err) reject(err);
          else resolve(code);
        });
      }
    });
  });
}

async function addReferralBonus(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET remaining_processes = remaining_processes + 2 WHERE user_id = ?',
      [userId],
      err => err ? reject(err) : resolve()
    );
  });
}

async function processReferral(userId, referralCode) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT user_id FROM users WHERE referral_code = ?',
      [referralCode],
      async (err, referrer) => {
        if (err) return reject(err);
        if (!referrer) return resolve(false);

        try {
          await db.run(
            'INSERT INTO referral_uses (referral_code, used_by, used_date) VALUES (?, ?, ?)',
            [referralCode, userId, new Date().toISOString()]
          );
          await addReferralBonus(referrer.user_id);
          await db.run(
            'UPDATE users SET referred_by = ? WHERE user_id = ?',
            [referralCode, userId]
          );
          resolve(true);
        } catch (err) {
          resolve(false);
        }
      }
    );
  });
}

async function processVideo(videoPath) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const videoData = fs.readFileSync(videoPath);
    const base64Video = videoData.toString('base64');
    
    const prompt = `
📊 АНАЛИЗ ВИДЕОВЫСТУПЛЕНИЯ

1️⃣ НЕВЕРБАЛЬНАЯ КОММУНИКАЦИЯ
• Жесты и движения
• Поза и осанка
• Мимика и эмоции
• Зрительный контакт
• Использование пространства

2️⃣ РЕЧЬ И ГОЛОС
• Темп и ритм
• Громкость и интонация
• Чёткость произношения
• Паузы и акценты
• Эмоциональный окрас

3️⃣ СТРУКТУРА
• Логика изложения
• Связность мыслей
• Ключевые моменты
• Работа с аудиторией

4️⃣ ОБЩАЯ ОЦЕНКА
• Сильные стороны
• Области для улучшения
• Рейтинг по 10-балльной шкале

5️⃣ РЕКОМЕНДАЦИИ
• 3-5 конкретных советов
• Практические упражнения
• Следующие шаги`;

    const parts = [{
      inlineData: {
        data: base64Video,
        mimeType: 'video/mp4'
      }
    }, prompt];

    const result = await model.generateContent(parts);
    return result.response.text();
  } catch (error) {
    console.error('Video processing error:', error);
    throw error;
  }
}

async function isSubscribed(chatId) {
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, chatId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch {
    return false;
  }
}

async function checkProcessingLimit(userId) {
  return new Promise((resolve, reject) => {
    const currentDate = new Date().toISOString().split('T')[0];
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, user) => {
      if (err) return reject(err);
      
      if (!user) {
        db.run('INSERT INTO users (user_id, remaining_processes, last_reset_date) VALUES (?, ?, ?)',
          [userId, INITIAL_LIMIT, currentDate]);
        resolve({ canProcess: true, remaining: INITIAL_LIMIT });
      } else if (user.last_reset_date !== currentDate) {
        const newProcesses = user.remaining_processes + DAILY_LIMIT;
        db.run('UPDATE users SET remaining_processes = ?, last_reset_date = ? WHERE user_id = ?',
          [newProcesses, currentDate, userId]);
        resolve({ canProcess: true, remaining: newProcesses });
      } else {
        resolve({ 
          canProcess: user.remaining_processes > 0,
          remaining: user.remaining_processes
        });
      }
    });
  });
}

async function decreaseProcessingCount(userId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET remaining_processes = remaining_processes - 1 WHERE user_id = ?',
      [userId], err => err ? reject(err) : resolve());
  });
}

async function sendLongMessage(chatId, text) {
  const maxLength = 4096;
  const parts = [];
  let message = text;

  while (message.length > 0) {
    if (message.length > maxLength) {
      let part = message.substr(0, maxLength);
      const lastNewline = part.lastIndexOf('\n');
      
      if (lastNewline !== -1) {
        part = message.substr(0, lastNewline);
        message = message.substr(lastNewline + 1);
      } else {
        message = message.substr(maxLength);
      }
      parts.push(part);
    } else {
      parts.push(message);
      message = '';
    }
  }

  for (const part of parts) {
    await bot.sendMessage(chatId, part);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1];

  const subscribed = await isSubscribed(chatId);
  if (!subscribed) {
    await bot.sendMessage(chatId, MESSAGES.subscribe, { parse_mode: 'Markdown' });
    return;
  }

  await processReferral(chatId, referralCode);
  const limits = await checkProcessingLimit(chatId);
  await bot.sendMessage(
    chatId,
    MESSAGES.welcome(limits.remaining),
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  
  const subscribed = await isSubscribed(chatId);
  if (!subscribed) {
    await bot.sendMessage(chatId, MESSAGES.subscribe, { parse_mode: 'Markdown' });
    return;
  }

  const limits = await checkProcessingLimit(chatId);
  await bot.sendMessage(
    chatId,
    MESSAGES.welcome(limits.remaining),
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/ref/, async (msg) => {
  const chatId = msg.chat.id;
  
  const subscribed = await isSubscribed(chatId);
  if (!subscribed) {
    await bot.sendMessage(chatId, MESSAGES.subscribe, { parse_mode: 'Markdown' });
    return;
  }

  const referralCode = await getReferralCode(chatId);
  await bot.sendMessage(
    chatId,
    MESSAGES.referral(referralCode),
    { parse_mode: 'Markdown' }
  );
});

// [Previous code remains the same until the video handler]

bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const subscribed = await isSubscribed(chatId);
    if (!subscribed) {
      await bot.sendMessage(chatId, MESSAGES.subscribe, { parse_mode: 'Markdown' });
      return;
    }

    const limits = await checkProcessingLimit(chatId);
    if (!limits.canProcess) {
      const time = getTimeUntilMidnight();
      await bot.sendMessage(
        chatId,
        MESSAGES.limitReached(time),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const processingMsg = await bot.sendMessage(
      chatId,
      MESSAGES.processing,
      { parse_mode: 'Markdown' }
    );

    const file = await bot.getFile(msg.video.file_id);
    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);
    const videoUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    
    const response = await fetch(videoUrl);
    const buffer = await response.buffer();
    fs.writeFileSync(videoPath, buffer);

    const result = await processVideo(videoPath);
    
    await bot.deleteMessage(chatId, processingMsg.message_id);
    await bot.sendMessage(chatId, MESSAGES.complete, { parse_mode: 'Markdown' });
    await sendLongMessage(chatId, result);
    await decreaseProcessingCount(chatId);

    const remainingLimits = await checkProcessingLimit(chatId);
    const time = getTimeUntilMidnight();
    await bot.sendMessage(
      chatId,
      `📈 *Статистика*

• Осталось анализов: ${remainingLimits.remaining}/${DAILY_LIMIT}
• До обновления: ${time.hours}ч ${time.minutes}м

💡 Получите больше анализов:
• Пригласите друзей через /ref
• Дождитесь ежедневного обновления`,
      { parse_mode: 'Markdown' }
    );

    try {
      fs.unlinkSync(videoPath);
    } catch (err) {
      console.error('Error deleting video file:', err);
    }
  } catch (error) {
    console.error('Error:', error);
    await bot.sendMessage(chatId, MESSAGES.error, { parse_mode: 'Markdown' });
  }
});

// Add error handling for unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Add periodic cleanup of old video files
setInterval(() => {
  const directory = __dirname;
  fs.readdir(directory, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      if (file.startsWith('video_') && file.endsWith('.mp4')) {
        const filePath = path.join(directory, file);
        fs.unlink(filePath, err => {
          if (err) console.error('Error deleting old video file:', err);
        });
      }
    });
  });
}, 3600000); // Cleanup every hour

// Start bot
console.log('🚀 Bot started successfully');
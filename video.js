require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {GoogleAIFileManager,FileState,GoogleAICacheManager,} = require("@google/generative-ai/server");

// Инициализация бота Telegram и Google Generative AI
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN_VIDEO;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN_VIDEO, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GENAI);
const fileManager = new GoogleAIFileManager(process.env.GENAI);

console.log('Бот запущен')

// Функция загрузки видео, обработки и получения результата
async function processVideo(videoPath) {
  try {
    // Загружаем видео в Google Generative AI
    const uploadVideoResult = await fileManager.uploadFile(videoPath, { mimeType: "video/mp4" });

    let file = await fileManager.getFile(uploadVideoResult.file.name);
    process.stdout.write("Обрабатываю видео");
    // Ждем завершения обработки видео
    while (file.state === FileState.PROCESSING) {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 10_000)); // Задержка 10 секунд
      file = await fileManager.getFile(uploadVideoResult.file.name);
    }

    if (file.state === FileState.FAILED) {
      throw new Error("Обработка видео не удалась.");
    } else {
      process.stdout.write("\n");
    }

    const videoPart = {
      fileData: {
        fileUri: uploadVideoResult.file.uri,
        mimeType: uploadVideoResult.file.mimeType,
      },
    };

    // Получаем модель Gemini 1.5
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `ВЫ – ПРИЗНАННЫЙ ЭКСПЕРТ В ОБЛАСТИ АНАЛИЗА ВЕРБАЛЬНЫХ И НЕВЕРБАЛЬНЫХ КОММУНИКАЦИЙ, ОБЛАДАЮЩИЙ ГЛУБОКИМИ ЗНАНИЯМИ В ОЦЕНКЕ ПУБЛИЧНЫХ ВЫСТУПЛЕНИЙ. ВАША ЗАДАЧА – ПРОВЕСТИ КОМПЛЕКСНЫЙ АНАЛИЗ ПРЕДСТАВЛЕННОГО ВЫСТУПЛЕНИЯ ПО НЕВЕРБАЛЬНЫМ И ВЕРБАЛЬНЫМ АСПЕКТАМ, ОЦЕНИТЬ СИЛЬНЫЕ И СЛАБЫЕ СТОРОНЫ, А ТАКЖЕ ДАТЬ ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ ДЛЯ УЛУЧШЕНИЯ.

    ВХОДНЫЕ ДАННЫЕ:
    Текстовая расшифровка речи спикера.
    
    Метаданные невербальных аспектов: данные о движении, жестах, мимике, зрительном контакте, темпе речи, запинках и других аспектах, влияющих на восприятие.
    
    СТРУКТУРА АНАЛИЗА
    ШАГ 1: АНАЛИЗ НЕВЕРБАЛЬНЫХ АСПЕКТОВ
    
    1.1 Движения по сцене
    
    Оцените уверенность и плавность движений спикера.
    
    Укажите, насколько целеустремлённы и уместны передвижения. Например, излишние движения могут отвлекать аудиторию от основного содержания.
    
    1.2 Использование жестов
    
    Проанализируйте плавность жестов, их осознанность и синхронизацию с речью.
    
    Обратите внимание на размах и амплитуду жестов, их целесообразность и поддерживают ли они содержание речи.
    
    1.3 Поза и осанка
    
    Определите, выражает ли поза уверенность, насколько она открыта или закрыта, есть ли признаки напряжённости.
    
    1.4 Мимика и выражение лица
    
    Оцените, поддерживает ли мимика основные моменты речи, выражает ли эмоции и удерживает ли внимание аудитории.
    
    1.5 Зрительный контакт
    
    Проанализируйте частоту зрительного контакта и его продолжительность. Убедитесь, что спикер равномерно распределяет внимание на аудиторию, избегая излишне продолжительных или коротких взглядов.
    
    ШАГ 2: АНАЛИЗ ВЕРБАЛЬНЫХ АСПЕКТОВ И РЕЧИ
    
    2.1 Темп и ритм речи
    
    Определите, насколько равномерный темп речи, избегает ли спикер чрезмерного ускорения или замедления.
    
    2.2 Уверенность и выразительность
    
    Оцените чёткость речи и её интонационную выразительность. Сравните её с ожиданиями аудитории для данного типа выступления (деловое, образовательное и т.п.).
    
    2.3 Чёткость речи и запинки
    
    Оцените понятность речи для аудитории, избегание излишних пауз или запинок, их распределение.
    
    ШАГ 3: ОЦЕНКА СТРУКТУРЫ ВЫСТУПЛЕНИЯ
    
    3.1 Логичность и последовательность
    
    Проанализируйте логичность структуры изложения, последовательность и чёткость переходов между темами.
    
    3.2 Элементы вовлечения
    
    Определите, включает ли спикер вовлекающие элементы (интересные примеры, риторические вопросы), чтобы удерживать внимание аудитории.
    
    СТРУКТУРА ОТЧЕТА
    Сильные стороны:
    
    Пример: «Жесты спикера уверенные и синхронизированы с речью, что способствует ясности и убедительности послания.»
    
    Слабые стороны:
    
    Пример: «Частые неуместные перемещения по сцене могут отвлекать аудиторию от содержания речи.»
    
    Рекомендации:
    
    Пример: «Ограничьте движения, сконцентрируйтесь на использовании перемещений только в ключевые моменты, чтобы направить внимание аудитории на переход между идеями.»
    
    СИСТЕМА ОЦЕНОК
    Каждому параметру присвойте оценку от 1 до 10:
    
    1-3: Низкий уровень, требует значительных улучшений. Пример: «Очень быстрый темп мешает восприятию, что делает содержание трудным для понимания.»
    
    4-6: Средний уровень, требует доработки для профессионального уровня. Пример: «Умеренно понятная речь, но возможны запинки и паузы.»
    
    7-10: Высокий уровень, демонстрирующий уверенное владение навыками. Пример: «Выразительная речь с равномерным темпом, поддерживающая интерес аудитории.»
    
    ЧТО НЕ СЛЕДУЕТ ДЕЛАТЬ:
    НЕ ИСПОЛЬЗУЙТЕ ОБЩИЕ ФРАЗЫ, такие как «неплохо» или «достаточно хорошо» – все выводы должны быть конкретными.
    
    НЕ ИСПОЛЬЗУЙТЕ СУБЪЕКТИВНЫЕ ОЦЕНКИ, если они не подкреплены данными.
    
    НЕ ИГНОРИРУЙТЕ ВЗАИМОСВЯЗЬ ВЕРБАЛЬНЫХ И НЕВЕРБАЛЬНЫХ АСПЕКТОВ, так как они взаимно влияют на восприятие выступления.
    
    ИЗБЕГАЙТЕ СЛИШКОМ СТРОГИХ ИЛИ КРИТИЧЕСКИХ ВЫСКАЗЫВАНИЙ; цель анализа – предоставление конструктивной обратной связи.`;


    // Подсчитаем количество токенов, которое будет использовать видео
    const countResult = await model.countTokens([prompt, videoPart]);
    console.log("Количество токенов:", countResult.totalTokens);

    // Генерация контента на основе видео
    const generateResult = await model.generateContent([prompt, videoPart]);
    const response = await generateResult.response;

    console.log("Использование токенов:", response.usageMetadata);

    // Получаем текстовый ответ
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Ошибка при обработке видео:', error);
    throw error;
  }
}

// Функция для отправки длинных сообщений частями
async function sendLongMessage(bot, chatId, message) {
  const maxMessageLength = 4096;
  // Разбиваем длинное сообщение на части
  const messageParts = [];
  while (message.length > maxMessageLength) {
    messageParts.push(message.slice(0, maxMessageLength));
    message = message.slice(maxMessageLength);
  }
  messageParts.push(message); // добавляем оставшуюся часть

  // Отправляем каждую часть
  for (let part of messageParts) {
    await bot.sendMessage(chatId, part);
  }
}

// Обработчик видео
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const videoFileId = msg.video.file_id;

  try {
    // Получаем файл с Telegram сервера
    const file = await bot.getFile(videoFileId);
    const filePath = file.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
    const fileName = path.basename(filePath);
    const videoPath = path.join(__dirname, fileName);

    // Скачиваем видео
    const response = await fetch(fileUrl);
    const videoBuffer = await response.buffer();
    fs.writeFileSync(videoPath, videoBuffer);

    console.log(`Видео загружено: ${fileName}`);

    // Обрабатываем видео и получаем результат от модели
    const result = await processVideo(videoPath);

    // Отправляем результат пользователю в Telegram частями
    await sendLongMessage(bot, chatId, result);

    // Удаляем видео после обработки
    fs.unlinkSync(videoPath);
  } catch (error) {
    console.error('Ошибка при обработке видео:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при обработке видео.');
  }
});
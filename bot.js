const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const token = '7832491042:AAFytxcjo14qJ0otsaYhEth8gD8JYxh21iQ';
const bot = new TelegramBot(token, { polling: true });

const baseDir = './downloads/';
const usersFilePath = './users.json';

// Создаем базовую директорию если нужно
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

if (!fs.existsSync(usersFilePath)) {
  fs.writeFileSync(usersFilePath, '[]');
}

// Получаем путь к папке пользователя
function getUserDir(userId) {
  return path.join(baseDir, userId.toString());
}

// Модифицированная функция загрузки файла
async function downloadFile(userId, fileId, fileName) {
  const userDir = getUserDir(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  
  // Проверка размера файла
  if (file.file_size > 2147483648) {
    throw new Error('Файл слишком большой (максимум 2 ГБ)');
  }

  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  });

  const filePath = path.join(userDir, fileName);
  const writer = fs.createWriteStream(filePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Модифицированная функция удаления файла
function deleteFile(userId, fileName) {
  const userDir = getUserDir(userId);
  const filePath = path.join(userDir, fileName);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject('Файл не найден');
    }
    
    fs.unlink(filePath, (err) => {
      if (err) reject('Ошибка удаления');
      else resolve();
    });
  });
}

// Модифицированные обработчики команд

bot.onText(/\/download (.+)/, (msg, match) => {
  const userId = msg.chat.id;
  const fileName = match[1];
  const filePath = path.join(getUserDir(userId), fileName);

  if (fs.existsSync(filePath)) {
    bot.sendDocument(userId, filePath)
      .catch(() => bot.sendMessage(userId, 'Ошибка отправки файла'));
  } else {
    bot.sendMessage(userId, 'Файл не найден');
  }
});

bot.onText(/\/delete (.+)/, (msg, match) => {
  const userId = msg.chat.id;
  const fileName = match[1];

  deleteFile(userId, fileName)
    .then(() => bot.sendMessage(userId, 'Файл удален'))
    .catch(e => bot.sendMessage(userId, e));
});

bot.onText(/\/files/, (msg) => {
  const userId = msg.chat.id;
  const userDir = getUserDir(userId);

  fs.readdir(userDir, (err, files) => {
    if (err || !files.length) {
      return bot.sendMessage(userId, 'Нет файлов');
    }

    const filesPerPage = 4;
    let page = 0;

    const sendFilesPage = (p) => {
      const start = p * filesPerPage;
      const end = start + filesPerPage;
      const pageFiles = files.slice(start, end);

      const buttons = pageFiles.map(file => 
        [{ text: file, callback_data: `send_${file}` }]
      );

      if (pageFiles.length < files.length) {
        buttons.push([
          { 
            text: 'Следующая ➡️', 
            callback_data: `page_${p + 1}`
          }
        ]);
      }

      bot.sendMessage(userId, `Ваши файлы (Страница ${p + 1}):`, {
        reply_markup: { inline_keyboard: buttons }
      });
    };

    sendFilesPage(page);
  });
});

// Обработчик медиа-сообщений
bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  
  if (msg.photo || msg.video) {
    bot.sendMessage(userId, 'Введите название файла:');
    
    bot.once('message', async (nameMsg) => {
      const fileName = nameMsg.text + (msg.photo ? '.jpg' : '.mp4');
      const fileId = msg.photo 
        ? msg.photo[msg.photo.length - 1].file_id 
        : msg.video.file_id;

      try {
        await downloadFile(userId, fileId, fileName);
        bot.sendMessage(userId, `Файл сохранен как ${fileName}`);
      } catch (e) {
        bot.sendMessage(userId, 'Ошибка загрузки: ' + e.message);
      }
    });
  }
});

// Остальные обработчики и функции остаются без изменений
// (start, help, callback_query и т.д.)

console.log('Бот запущен');
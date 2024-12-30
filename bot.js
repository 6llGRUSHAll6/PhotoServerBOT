const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');


const token = 'your bot token';
const bot = new TelegramBot(token, { polling: true });


const saveDir = './downloads/';
const usersFilePath = './users.json';


if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir);
}


if (!fs.existsSync(usersFilePath)) {
  fs.writeFileSync(usersFilePath, JSON.stringify([])); 
}


async function downloadFile(fileId, fileName) {
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const fileSize = file.file_size;

  console.log(`Размер файла: ${fileSize} байт (${(fileSize / 1048576).toFixed(2)} МБ)`);

  if (fileSize > 2147483648) {
    throw new Error('Файл слишком большой. Telegram поддерживает файлы до 2 ГБ.');
  }

  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  });

  const filePath = path.join(saveDir, fileName);
  const writer = fs.createWriteStream(filePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log(`Файл ${fileName} успешно сохранен.`);
      resolve(filePath);
    });
    writer.on('error', reject);
  });
}


function deleteFile(fileName) {
  const filePath = path.join(saveDir, fileName);

  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject('Не удалось удалить файл. Убедитесь, что файл существует.');
      } else {
        resolve(`Файл ${fileName} был успешно удален.`);
      }
    });
  });
}


function addUser(userId, userName) {
  const users = JSON.parse(fs.readFileSync(usersFilePath));

  if (!users.some(user => user.id === userId)) {
    users.push({ id: userId, name: userName });
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    console.log(`Пользователь ${userName} с ID ${userId} добавлен в базу данных.`);
  }
}


bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.username || msg.from.first_name || 'Неизвестный';
  
  
  addUser(chatId, userName);

  bot.sendMessage(chatId, 'Привет! Я бот, который помогает сохранить фото и видео(до 50мб), которые вы отправляете. Просто отправьте мне фото или видео, и я сохраню их! (самое главное каждому файлу придумать разное название)');
});


bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    'Я могу помочь вам сохранить медиафайлы, которые вы отправляете. Вот список команд:\n' +
    '/start - Приветствие и информация о боте.\n' +
    '/help - Справка по командам.\n' +
    '/download <file_name> - Скачать файл по имени.\n' +
    '/files - Список файлов, которые были загружены.\n' +
    '/delete <file_name> - Удалить файл по имени.\n\n' +
    'Просто отправьте мне фото или видео, и я сохраню их!');
});


bot.onText(/\/download (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fileName = match[1];
  const filePath = path.join(saveDir, fileName);

  if (fs.existsSync(filePath)) {
    bot.sendDocument(chatId, filePath)
      .then(() => {
        console.log(`Файл ${fileName} отправлен пользователю.`);
      })
      .catch((error) => {
        console.error(`Ошибка при отправке файла ${fileName}:`, error);
        bot.sendMessage(chatId, 'Произошла ошибка при отправке файла.');
      });
  } else {
    bot.sendMessage(chatId, `Файл ${fileName} не найден.`);
  }
});


bot.onText(/\/delete (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fileName = match[1];
  const filePath = path.join(saveDir, fileName);

  if (fs.existsSync(filePath)) {
    deleteFile(fileName)
      .then((message) => {
        bot.sendMessage(chatId, message);
        console.log(`Файл ${fileName} был удален.`);
      })
      .catch((error) => {
        bot.sendMessage(chatId, error);
        console.error('Ошибка при удалении файла:', error);
      });
  } else {
    bot.sendMessage(chatId, `Файл ${fileName} не найден.`);
  }
});


bot.onText(/\/files/, (msg) => {
  const chatId = msg.chat.id;

  fs.readdir(saveDir, (err, files) => {
    if (err) {
      bot.sendMessage(chatId, 'Произошла ошибка при получении списка файлов.');
      return;
    }

    if (files.length === 0) {
      bot.sendMessage(chatId, 'Нет сохраненных файлов.');
      return;
    }

    const filesPerPage = 4; 
    let page = 0; 

    const createFileButtons = (page) => {
      const start = page * filesPerPage;
      const end = start + filesPerPage;
      const currentFiles = files.slice(start, end);

      const fileButtons = currentFiles.map(file => {
        return [{
          text: file,
          callback_data: `copy_${file}`
        }];
      });

      const navigationButtons = [];
      if (page > 0) {
        navigationButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `page_${page - 1}`
        });
      }
      if (end < files.length) {
        navigationButtons.push({
          text: 'Следующая ➡️',
          callback_data: `page_${page + 1}`
        });
      }

      return [...fileButtons, navigationButtons];
    };

    bot.sendMessage(chatId, `Вот список файлов (Страница ${page + 1} из ${Math.ceil(files.length / filesPerPage)}):`, {
      reply_markup: {
        inline_keyboard: createFileButtons(page)
      }
    });
  });
});


bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;

  if (query.data.startsWith('copy_')) {
    const fileName = query.data.replace('copy_', '');


    bot.sendMessage(chatId, `Вы можете скопировать следующее имя файла: \n\n${fileName}`);

    bot.answerCallbackQuery(query.id); 
    return;
  }

  if (query.data.startsWith('page_')) {
    const page = parseInt(query.data.replace('page_', ''), 10);

    fs.readdir(saveDir, (err, files) => {
      if (err || files.length === 0) {
        bot.sendMessage(chatId, 'Произошла ошибка или нет доступных файлов.');
        return;
      }

      const filesPerPage = 4;
      const start = page * filesPerPage;
      const end = start + filesPerPage;
      const currentFiles = files.slice(start, end);

      const fileButtons = currentFiles.map(file => {
        return [{
          text: file,
          callback_data: `copy_${file}`
        }];
      });

      const navigationButtons = [];
      if (page > 0) {
        navigationButtons.push({
          text: '⬅️ Предыдущая',
          callback_data: `page_${page - 1}`
        });
      }
      if (end < files.length) {
        navigationButtons.push({
          text: 'Следующая ➡️',
          callback_data: `page_${page + 1}`
        });
      }

      bot.editMessageText(`Вот список файлов (Страница ${page + 1} из ${Math.ceil(files.length / filesPerPage)}):`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [...fileButtons, navigationButtons]
        }
      });

      bot.answerCallbackQuery(query.id); 
    });
  }
});


bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Если это фото
  if (msg.photo) {
    bot.sendMessage(chatId, 'Отправьте название для фото, которое вы загружаете:');
    bot.once('message', async (msgName) => {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileName = `${msgName.text}.jpg`; 
      try {
        await downloadFile(fileId, fileName);
        bot.sendMessage(chatId, `Фото сохранено как ${fileName}`);
      } catch (error) {
        console.error('Ошибка:', error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при загрузке фото');
      }
    });
  }


  if (msg.video) {
    const videoSize = msg.video.file_size;

    if (videoSize > 2147483648) {
      bot.sendMessage(chatId, 'Извините, видео слишком большое (больше 2 ГБ), Telegram не поддерживает такие файлы.');
      return;
    }

    bot.sendMessage(chatId, 'Отправьте название для видео, которое вы загружаете:');
    bot.once('message', async (msgName) => {
      const fileId = msg.video.file_id;
      const fileName = `${msgName.text}.mp4`; 

      try {
        const savedFilePath = await downloadFile(fileId, fileName);
        bot.sendMessage(chatId, `Видео сохранено как ${fileName}`);
      } catch (error) {
        console.error('Ошибка:', error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при загрузке видео');
      }
    });
  }
});

console.log('Бот работает...');

import 'dotenv/config';
import fetch from 'node-fetch';

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

const message = `🚀 Prueba desde tu servidor\nTodo está funcionando correctamente.`;

const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    disable_web_page_preview: true,
  }),
});

const data = await response.json();
console.log(data);

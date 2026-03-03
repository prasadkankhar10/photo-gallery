import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

console.log(`Testing token: ${token ? 'Loaded' : 'Missing'}`);
console.log(`Testing channel: ${channelId}`);

const bot = new TelegramBot(token, { polling: false });

async function runTest() {
  try {
    const me = await bot.getMe();
    console.log(`Successfully authenticated as bot: @${me.username}`);
    
    console.log(`Attempting to send test message to channel ${channelId}...`);
    const msg = await bot.sendMessage(channelId, "Test message to verify permissions.");
    console.log("SUCCESS! Message sent.");
    console.log("Message ID:", msg.message_id);
  } catch (error) {
    console.error("ERROR from Telegram API:");
    console.error(error.response ? error.response.body : error.message);
  }
}

runTest();

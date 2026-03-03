import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

let bot = null;
if (token && channelId) {
  bot = new TelegramBot(token, { polling: false });
} else {
  console.warn("Telegram integration inactive: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
}

export async function uploadToTelegram(filePath, metadata) {
  if (!bot || !channelId) {
    throw new Error("Telegram bot token or channel ID not configured.");
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const peopleStr = metadata.people?.map(p => `#${p.replace(/\\s+/g, '')}`).join(' ') || '';
  const tagsStr = metadata.tags?.map(t => `#${t.replace(/\\s+/g, '')}`).join(' ') || '';
  
  const caption = `Date: ${dateStr} | People: ${peopleStr} | Tags: ${tagsStr}`;

  try {
    const msg = await bot.sendDocument(channelId, filePath, { caption });
    
    // Telegram format for links mapping channel ID to view URL roughly:
    const cleanChannelId = channelId.toString().replace('-100', '');
    
    return {
      telegram_message_id: msg.message_id.toString(),
      telegram_file_id: msg.document.file_id,
      telegram_link: `https://t.me/c/${cleanChannelId}/${msg.message_id}`
    };
  } catch (error) {
    console.error("Telegram Upload Error:", error);
    throw error;
  }
}

export async function getTelegramFileUrl(fileId) {
    if (!bot) return null;
    try {
        const link = await bot.getFileLink(fileId);
        return link;
    } catch (e) {
        console.error("Error getting file link", e);
        return null;
    }
}

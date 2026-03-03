/**
 * Cloudflare Worker for Photo Gallery Telegram Proxy
 * 
 * 1. Takes a `file_id` parameter from the URL.
 * 2. Uses your secret TELEGRAM_BOT_TOKEN to get the file path.
 * 3. Downloads the file stream from Telegram.
 * 4. Pushes the stream directly to the browser with CORS headers so GitHub Pages can render it.
 */

export default {
  async fetch(request, env, ctx) {
    // Respond to CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const url = new URL(request.url);
    const fileId = url.searchParams.get("file_id");

    if (!fileId) {
      return new Response("Missing file_id parameter", { status: 400 });
    }

    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return new Response("Server error: Missing Bot Token", { status: 500 });
    }

    try {
      // Step 1: Get the file path from Telegram API
      const fileInfoRes = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      
      const fileInfo = await fileInfoRes.json();
      
      if (!fileInfo.ok) {
         return new Response("Telegram API Error: " + fileInfo.description, { status: 404 });
      }

      const filePath = fileInfo.result.file_path;

      // Step 2: Fetch the actual file bytes directly
      const fileRes = await fetch(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
      );

      // Step 3: Stream the response back to the client with wildcard CORS
      const headers = new Headers(fileRes.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      
      // We pass the exact stream back to save memory
      return new Response(fileRes.body, {
        status: fileRes.status,
        headers: headers
      });

    } catch (error) {
       return new Response("Proxy Error: " + error.message, { status: 500 });
    }
  },
};

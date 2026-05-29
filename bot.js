const mineflayer = require('mineflayer');

const serverIp = process.argv[2];
const port = parseInt(process.argv[3]) || 25565;
const username = process.argv[4];

let bot;

function createBot() {
    // تنظيف الأحداث القديمة لتجنب تسرب الذاكرة (Memory Leak) عند إعادة الاتصال
    if (bot) {
        bot.removeAllListeners();
    }

    bot = mineflayer.createBot({
        host: serverIp,
        port: port,
        username: username,
        version: false,
        viewDistance: "tiny"
    });

    bot.on('spawn', () => {
        console.log(`[BOT] ${username} joined ${serverIp}:${port}`);
    });

    bot.on('end', () => {
        console.log(`[BOT] ${username} Disconnected. Reconnecting in 10s...`);
        setTimeout(createBot, 10000);
    });

    bot.on('error', (err) => {
        console.error(`[BOT ERROR - ${username}]`, err.message);
    });
}

// استقبال الأوامر من السيرفر الأساسي (تبقى خارج الدالة)
process.on('message', (packet) => {
    if (packet.type === 'send_chat' && bot && bot.entity) { // التأكد من أن البوت متصل فعلياً
        try {
            bot.chat(packet.text);
            console.log(`[CHAT sent] ${packet.text}`);
        } catch (e) {
            console.error('[ERROR] Failed to send chat', e.message);
        }
    }
});

createBot();

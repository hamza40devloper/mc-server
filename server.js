const express = require('express');
const { fork } = require('child_process');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cors());

// ================= الإعدادات والمتغيرات الأساسية =================
// تم تعريف المتغير هنا مرة واحدة فقط ليتم استخدامه في كامل الملف
const PORT = process.env.PORT || 3000; 
const API_KEY = process.env.API_KEY || "YOUR_SECRET_KEY_HERE";
const activeBots = new Map();

// إعدادات ديسكورد
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; 
const BLOGGER_URL = 'https://nonnetworkofficial.blogspot.com'; 

// إعداد الاتصال بقاعدة بيانات Postgres 
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// تهيئة قاعدة البيانات
async function initDatabase() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS saved_bots (
            bot_id VARCHAR(100) PRIMARY KEY,
            server_ip VARCHAR(255) NOT NULL,
            username VARCHAR(100) NOT NULL,
            user_who_sent VARCHAR(100),
            saved_by_username VARCHAR(100),
            saved_by_user_id VARCHAR(100),
            is_saved_247 BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(createTableQuery);
        console.log('[DATABASE] Connected and tables are ready.');
        await restoreBotsFromDatabase();
    } catch (err) {
        console.error('[DATABASE ERROR] Failed to initialize database:', err.message);
    }
}

// تشغيل البوت كعملية فرعية
function launchBotProcess(botId, serverIp, username, userWhoSent) {
    const botProcess = fork('./bot.js', [serverIp, '25565', username]);
    botProcess.botData = { botId, serverIp, username, userWhoSent, isSaved247: false };
    activeBots.set(botId, botProcess);

    console.log(`[LAUNCH] Bot ${username} launched by: ${userWhoSent}`);
    botProcess.on('exit', () => { activeBots.delete(botId); });
}

// استعادة البوتات المحفوظة 24/7 من الـ Postgres
async function restoreBotsFromDatabase() {
    try {
        const res = await pool.query('SELECT * FROM saved_bots WHERE is_saved_247 = TRUE');
        console.log(`[DATABASE] Restoring ${res.rows.length} permanent bots...`);
        res.rows.forEach(bot => {
            launchBotProcess(bot.bot_id, bot.server_ip, bot.username, bot.user_who_sent);
            const proc = activeBots.get(bot.bot_id);
            if (proc) proc.botData.isSaved247 = true;
        });
    } catch (err) {
        console.error('[DATABASE ERROR] Failed to restore bots:', err.message);
    }
}

// ================= مسارات الـ API والتوثيق =================

// 1. نظام تسجيل دخول ديسكورد
app.get('/api/auth/login', (req, res) => {
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/api/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing authorization code.');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userData = await userResponse.json();
        const uName = encodeURIComponent(userData.username);
        const uId = encodeURIComponent(userData.id);
        const uAvatar = encodeURIComponent(`https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`);

        res.redirect(`${BLOGGER_URL}/?login=success&username=${uName}&id=${uId}&avatar=${uAvatar}`);
    } catch (error) {
        res.status(500).send('Error authenticating with Discord.');
    }
});

// 2. مسار تشغيل البوت الأولي
app.post('/api/start-bot', async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(403).json({ error: 'Access Denied' });
    const { serverIp, username, userWhoSent } = req.body;
    if (!serverIp || !username) return res.status(400).json({ error: 'Missing parameters' });

    const botId = `${username}_${Date.now()}`;
    launchBotProcess(botId, serverIp, username, userWhoSent || "زائر");
    res.json({ success: true, botId });
});

// 3. مسار الأوامر والتشات
app.post('/api/bot/chat', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(403).json({ error: 'Access Denied' });
    const { botId, message } = req.body;

    const botProcess = activeBots.get(botId);
    if (!botProcess) return res.status(444).json({ error: 'البوت غير متصل حالياً' });

    botProcess.send({ type: 'send_chat', text: message });
    res.json({ success: true });
});

// 4. مسار الحفظ الدائم في Postgres
app.post('/api/save-bot', async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(403).json({ error: 'Access Denied' });
    const { botId, username, userId } = req.body;
    const botProcess = activeBots.get(botId);

    if (!botProcess) return res.status(404).json({ error: 'البوت غير موجود لتأمينه' });

    try {
        botProcess.botData.isSaved247 = true;
        botProcess.botData.savedByUsername = username;
        botProcess.botData.savedByUserId = userId;

        const b = botProcess.botData;
        const insertQuery = `
            INSERT INTO saved_bots (bot_id, server_ip, username, user_who_sent, saved_by_username, saved_by_user_id, is_saved_247)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (bot_id) 
            DO UPDATE SET is_saved_247 = TRUE, saved_by_username = $5, saved_by_user_id = $6;
        `;
        
        await pool.query(insertQuery, [b.botId, b.serverIp, b.username, b.userWhoSent, username, userId, true]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database save failed' });
    }
});

// ================= تشغيل السيرفر =================
// تم إزالة الأسطر المكررة هنا، والسيرفر يستمع الآن للمتغير الموحد في الأعلى
app.listen(PORT, () => {
    console.log(`[SERVER] Backend running on port ${PORT}`);
    initDatabase(); 
});

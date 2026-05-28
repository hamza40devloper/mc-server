const express = require('express');
const { fork } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const API_KEY = process.env.API_KEY || "YOUR_SECRET_KEY_HERE";
const DB_FILE = path.join(__dirname, 'bots.json');
const activeBots = new Map();

// دالة الحفظ: تحفظ فقط البوتات التي تمتلك حساب ديسكورد موثق
function saveBotsToDisk() {
    const data = [];
    for (const [botId, bot] of activeBots.entries()) {
        // إذا كان البوت تابع لمستخدم ديسكورد، نقوم بحفظه
        if (bot.discordId) {
            data.push({ 
                botId, 
                serverIp: bot.serverIp, 
                port: bot.port, 
                username: bot.username,
                discordId: bot.discordId // حفظ معرف ديسكورد أيضاً
            });
        }
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// دالة تشغيل البوت
function launchBotProcess(botId, serverIp, port, username, discordId = null) {
    const botProcess = fork('./bot.js', [serverIp, port, username], {
        execArgv: ['--max-old-space-size=40'] 
    });

    // تخزين البيانات داخل كائن العملية الفرعية
    botProcess.serverIp = serverIp;
    botProcess.port = port;
    botProcess.username = username;
    botProcess.discordId = discordId; // سيظل null إذا لم يسجل بالديسكورد

    activeBots.set(botId, botProcess);

    botProcess.on('exit', () => {
        activeBots.delete(botId);
        saveBotsToDisk(); // تحديث الملف عند خروج البوت
    });
}

// استعادة بوتات أصحاب الديسكورد فقط عند إعادة تشغيل سيرفر Railway
if (fs.existsSync(DB_FILE)) {
    try {
        const savedBots = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`[SYSTEM] Restoring ${savedBots.length} VIP Discord bots...`);
        savedBots.forEach(b => {
            const newId = `${b.username}_${Date.now()}`;
            launchBotProcess(newId, b.serverIp, b.port, b.username, b.discordId);
        });
    } catch (e) {
        console.error("[SYSTEM] Failed to load backup file", e);
    }
}

// استقبال طلب التشغيل
app.post('/api/start-bot', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(403).json({ error: 'Invalid API Key' });
    }

    // استلام البيانات (أضفنا ديسكورد هنا كمعامل اختياري)
    const { serverIp, port, username, discordId } = req.body; 
    
    if (!serverIp || !username) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    const botId = `${username}_${Date.now()}`;
    
    // تشغيل البوت وتمرير معرف الديسكورد إن وجد
    launchBotProcess(botId, serverIp, port || '25565', username, discordId || null);
    
    // حفظ البيانات (ستقوم الدالة تلقائياً بفحص الديسكورد وحفظ المستحقين فقط)
    saveBotsToDisk(); 

    res.json({ 
        success: true, 
        botId, 
        isSaved: !!discordId, // إرسال حالة الحفظ للواجهة (true أو false)
        message: discordId ? 'تم تشغيل البوت وحفظه 24 ساعة.' : 'تم تشغيل بوت مؤقت (غير مسجل بديسكورد).' 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SERVER] Backend running on port ${PORT}`);
});

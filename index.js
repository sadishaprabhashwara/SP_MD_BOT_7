const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function startBot() {
    // Session එක සේව් වෙන්න 'auth_info' ෆෝල්ඩර් එක පාවිච්චි කරයි
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // ටර්මිනල් එකේ QR එක පෙන්වයි
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('සම්බන්ධතාවය විසන්ධි විය, නැවත උත්සාහ කරයි...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ SP LINK PROTECTOR සක්‍රීයයි! 🚀');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        // මැසේජ් එකේ තියෙන Text එක ලබා ගැනීම
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";

        // ලින්ක් එකක් තියෙදැයි පරීක්ෂා කිරීම (http හෝ https)
        const hasLink = /(https?:\/\/[^\s]+)/g.test(body);
        
        // ඔයාගේ නම්බර් එක Secrets වලින් ලබා ගනී (උදා: 947xxxxxxxx)
        const adminNumber = process.env.ADMIN_NUMBER;
        const isAdmin = sender.includes(adminNumber);

        if (hasLink && !isAdmin) {
            console.log(`⚠️ ලින්ක් එකක් හමු විය! එවූ පුද්ගලයා: ${sender}`);

            try {
                // 1. මැසේජ් එක ඩිලීට් කිරීම
                await sock.sendMessage(remoteJid, { delete: msg.key });

                // 2. පුද්ගලයා ඉවත් කිරීම (Group එකේ Bot ට Admin බලය තිබිය යුතුය)
                await sock.groupParticipantsUpdate(remoteJid, [sender], "remove");

                console.log('✅ සාර්ථකව ඉවත් කරන ලදී.');
            } catch (err) {
                console.log('❌ Error: බොට්ට ඇඩ්මින් බලය නැතිව ඇති.');
            }
        }
    });
}

startBot();
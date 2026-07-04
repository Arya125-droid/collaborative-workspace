const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = new Redis(REDIS_URL);
const subClient = new Redis(REDIS_URL);
const PORT = 3001;
const server = http.createServer();
const wss = new WebSocket.Server({server});

const localClient = new Map();  // a local memory map to track which doc each local websocket is looking at

// subcribe to any channel that matches the pattern "doc:*:updates"
subClient.psubscribe('doc:*:updates', (err, count)=>{
    if(err) console.error('FAILED TO SUBSCRIBE', err);
    else console.log('SUBSCRIBED TO REDIS DOCUMENT CHANNELS');
});

subClient.on('pmessage', (pattern, channel, messageString)=>{
    const targetDocId = channel.split(':')[1];  // extract id from "doc:123:updates"->123

    // broadcast the message only to local websockets viewing this specific document
    wss.clients.forEach(client=>{
        const clientData = localClient.get(client);
        if(clientData && clientData.docId === targetDocId && client.readyState===WebSocket.OPEN){
            client.send(messageString);
        }
    });
});

// websocket server
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const docId = url.searchParams.get('docId');
    const userId = url.searchParams.get('userId');

    if (!docId || !userId) {
        ws.close(4001, "UNAUTHORISED: Missing docId or userId");
        return;
    }

    localClient.set(ws, { docId, userId });
    const presenceKey = `doc:${docId}:presence`;

    // Attach listeners immediately, synchronously
    ws.on('message', (messageString) => {
        try {
            const data = JSON.parse(messageString);
            pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
                type: data.type,
                userId,
                payload: data.payload
            }));
        } catch (error) {
            console.error("MALFORMED MESSAGE", error);
        }
    });

    ws.on('close', async () => {
        console.log(`User ${userId} left document ${docId}`);
        localClient.delete(ws);
        await pubClient.srem(presenceKey, userId);
        pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
            type: 'user_left',
            userId
        }));
    });

    ws.on('error', (err) => console.error(`WS error for user ${userId}:`, err));

    // Fire-and-await Redis presence update AFTER listeners are wired up
    (async () => {
        await pubClient.sadd(presenceKey, userId);
        pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
            type: 'user_joined',
            userId
        }));
    })();
});

server.listen(PORT, ()=>{
    console.log(`Real time colab engine is live on ws://localhost:${PORT}`);
})
const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');
const auth = require('./authService');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = new Redis(REDIS_URL);
const subClient = new Redis(REDIS_URL);
pubClient.on('error', (err) => console.error('Redis pubClient error:', err));
subClient.on('error', (err) => console.error('Redis subClient error:', err));

const PORT = 3001;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const localClient = new Map();

subClient.psubscribe('doc:*:updates', (err) => {
    if (err) console.error('FAILED TO SUBSCRIBE', err);
    else console.log('SUBSCRIBED TO REDIS DOCUMENT CHANNELS');
});

subClient.on('pmessage', (pattern, channel, messageString) => {
    const targetDocId = channel.split(':')[1];
    wss.clients.forEach(client => {
        const clientData = localClient.get(client);
        if (clientData && clientData.docId === targetDocId && client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
});

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const docId = url.searchParams.get('docId');

    if (!docId) {
        ws.close(4001, "UNAUTHORISED: Missing docId");
        return;
    }

    let isAuthenticated = false;
    let userId = null;
    // const presenceKey = `doc:${docId}:presence`;

    const authTimeout = setTimeout(() => {
        if (!isAuthenticated) {
            console.log(`Connection dropped: Auth timeout for Doc ${docId}`);
            ws.close(4001, 'AUTHENTICATION TIMEOUT');
        }
    }, 3000);

    ws.on('message', async (messageString) => {
        try {
            const data = JSON.parse(messageString);

            if (!isAuthenticated) {
                if (data.type === 'auth' && data.token) {
                    const tokenClaim = auth.verifyAccessToken(data.token);
                    if (tokenClaim) {
                        // TODO: also verify tokenClaim.userId has access to `docId`
                        isAuthenticated = true;
                        userId = tokenClaim.userId;
                        clearTimeout(authTimeout);
                        localClient.set(ws, { docId, userId });
                        console.log(`User ${userId} authenticated and joined Doc ${docId}`);

                        const presenceKey = `doc:${docId}:presence`;
                        await pubClient.sadd(presenceKey, userId);
                        pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
                            type: 'user_joined',
                            userId
                        }));

                        ws.send(JSON.stringify({ type: 'auth-success' }));
                    } else {
                        ws.close(4003, "INVALID TOKEN");
                    }
                } else {
                    ws.close(4001, "EXPECTED AUTH MESSAGE FIRST");
                }
                return;
            }

            if (data.type === 'cursor-move') {
                pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
                    type: data.type,
                    userId: userId,
                    payload: data.payload
                }));
            }
        } catch (error) {
            console.error("MALFORMED MESSAGE", error);
        }
    });

    ws.on('close', async () => {
        if(isAuthenticated && userId){
            console.log(`User ${userId} left Doc ${docId}`);
            localClient.delete(ws);
            await pubClient.srem(`doc:${docId}:presence`, userId);
            pubClient.publish(`doc:${docId}:updates`, JSON.stringify({
                type: 'user-left',
                userId: userId
            }));
        }
    });

    ws.on('error', (err) => console.error(`WS error for doc ${docId}:`, err));
});

server.listen(PORT, () => {
    console.log(`Real time colab engine is live on ws://localhost:${PORT}`);
});
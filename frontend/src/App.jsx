import React, { useState, useEffect, useRef, useCallback } from 'react';

const DOC_ID = 'report_v1';

const urlParams = new URLSearchParams(window.location.search);
const ACCESS_TOKEN = urlParams.get('token');

function useCollaboration(docId, accessToken) {
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [remoteCursors, setRemoteCursors] = useState({});
    const [incomingBlockUpdate, setIncomingBlockUpdate] = useState(null);
    
    const wsRef = useRef(null);

    useEffect(() => {
        if (!docId || !accessToken) return;

        // Initialize WebSocket 
        const ws = new WebSocket(`ws://localhost:3001/?docId=${docId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'auth-success') {
                setIsAuthorized(true);
                return;
            }

            // Sync Remote Cursors
            if (data.type === 'cursor-move') {
                setRemoteCursors(prev => ({
                    ...prev,
                    [data.userId]: { x: data.payload.x, y: data.payload.y }
                }));
            }
            
            // Sync Text Block Updates
            if (data.type === 'block-update') {
                setIncomingBlockUpdate(data.payload);
            }

            // Cleanup when someone leaves
            if (data.type === 'user-left') {
                setRemoteCursors(prev => {
                    const newCursors = { ...prev };
                    delete newCursors[data.userId];
                    return newCursors;
                });
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            setIsAuthorized(false);
        };

        return () => ws.close();
    }, [docId, accessToken]);

    // Secure broadcasting function
    const broadcast = useCallback((type, payload) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isAuthorized) {
            wsRef.current.send(JSON.stringify({ type, payload }));
        }
    }, [isAuthorized]);

    return { isConnected, isAuthorized, remoteCursors, broadcast, incomingBlockUpdate };
}

export default function App() {
    if (!ACCESS_TOKEN) {
        return (
            <div className="min-h-screen bg-[#191919] text-white flex items-center justify-center font-sans">
                <div className="bg-red-500/20 p-6 rounded-lg border border-red-500 text-center">
                    <h2 className="text-xl font-bold mb-2">Missing Authentication</h2>
                    <p>Please add your token to the URL like this:</p>
                    <code className="bg-black p-2 mt-4 block rounded text-green-400">
                        http://localhost:5173/?token=YOUR_ACCESS_TOKEN
                    </code>
                </div>
            </div>
        );
    }
    
    const { isConnected, isAuthorized, remoteCursors, broadcast, incomingBlockUpdate } = useCollaboration(DOC_ID, ACCESS_TOKEN);

    // Initial "Notion" State
    const [blocks, setBlocks] = useState([
        { id: '1', type: 'h1', content: 'Sentinel Architecture Specs' },
        { id: '2', type: 'p', content: 'Welcome to the secure collaborative workspace.' },
        { id: '3', type: 'p', content: 'Start typing here. Open this in two windows to test real-time sync.' }
    ]);

    // Listen for external updates from Redis and merge them into our local state
    useEffect(() => {
        if (incomingBlockUpdate) {
            setBlocks(prev => prev.map(block => 
                block.id === incomingBlockUpdate.id 
                    ? { ...block, content: incomingBlockUpdate.content } 
                    : block
            ));
        }
    }, [incomingBlockUpdate]);

    // Handle Local Typing
    const handleBlockChange = (id, newContent) => {
        // 1. Optimistic UI update 
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: newContent } : b));
        
        // 2. Broadcast to everyone else via Node/Redis
        broadcast('block-update', { id, content: newContent });
    };

    // Throttled Cursor Broadcasting
    const lastCursorSend = useRef(0);
    const handleMouseMove = (e) => {
        if (!isAuthorized) return;
        const now = Date.now();
        if (now - lastCursorSend.current > 40) { // Throttle to ~25fps to save network load
            broadcast('cursor-move', { x: e.clientX, y: e.clientY });
            lastCursorSend.current = now;
        }
    };

    return (
        <div 
            className="min-h-screen bg-[#191919] text-gray-200 font-sans p-10 selection:bg-blue-500 selection:text-white relative overflow-hidden"
            onMouseMove={handleMouseMove}
        >
            {/* Header / Connection Status */}
            <header className="mb-12 border-b border-gray-700 pb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Document Workspace</h2>
                    <p className="text-xs text-gray-500 mt-1">{DOC_ID}</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} ${isAuthorized ? 'shadow-[0_0_10px_#22c55e]' : ''}`}></div>
                    <span className="text-sm text-gray-400">
                        {!isConnected ? 'Connecting...' : !isAuthorized ? 'Authenticating...' : 'Live & Secure'}
                    </span>
                </div>
            </header>

            {/* The "Notion" Block Editor */}
            <main className="max-w-3xl mx-auto mt-10 space-y-4 relative z-10">
                {blocks.map(block => (
                    <div key={block.id} className="relative group">
                        <input
                            type="text"
                            value={block.content}
                            onChange={(e) => handleBlockChange(block.id, e.target.value)}
                            className={`w-full bg-transparent border-none outline-none focus:ring-0 ${
                                block.type === 'h1' ? 'text-4xl font-bold text-white mb-6' : 'text-lg text-gray-300 leading-relaxed'
                            }`}
                            placeholder="Type something..."
                        />
                        {/* Hover indicator to show it's a block */}
                        <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-600 transition-opacity">
                            ⠿
                        </div>
                    </div>
                ))}
            </main>

            {/* Render Remote Cursors */}
            {Object.entries(remoteCursors).map(([userId, pos]) => (
                <div 
                    key={userId}
                    className="absolute pointer-events-none z-50 flex items-center justify-center transition-all duration-75 ease-linear"
                    style={{ left: pos.x, top: pos.y }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute -left-2 -top-2">
                        <path d="M5.5 3.21V20.8C5.5 21.45 6.27 21.79 6.75 21.36L11.44 17.14L15.31 22.43C15.54 22.75 16 22.84 16.36 22.68L18.47 21.73C18.84 21.56 18.99 21.13 18.79 20.78L14.77 15.34H19.72C20.4 15.34 20.78 14.54 20.35 14.02L6.82 2.65C6.4 -0.01 5.5 0.5 5.5 3.21Z" fill="#3b82f6" stroke="white" strokeWidth="1.5"/>
                    </svg>
                    <div className="bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-full absolute left-4 top-4 whitespace-nowrap shadow-lg">
                        {userId.slice(-4)}
                    </div>
                </div>
            ))}
        </div>
    );
}
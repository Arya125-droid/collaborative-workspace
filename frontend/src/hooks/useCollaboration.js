import {useState, useEffect, useRef, useCallback} from 'react';
export function useCollabotation(docId, accessToken){
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthorised, setIsAuthorised] = useState(false);
    const [remoteCursors, setRemoteCursors] = useState({});

    // use ref for websocket so that it persists across frontend
    const wsRef = useRef(null);
    useEffect(()=>{
        if(!docId || !accessToken){
            return;
        }

        // initialise connection
        const ws = new WebSocket(`ws://localhost:3001/?docId=${docId}`);
        wsRef.current = ws;
        ws.onopen=()=>{
            console.log('CONNECTED TO ENGINE. Sending handshake...');
            setIsConnected(true);

            // auth handshake
            ws.send(JSON.stringify({
                type: 'auth',
                token: accessToken
            }));
        };
        
        ws.onmessage=(event)=>{
            const data = JSON.parse(event.data);

            // unlock the backend
            if(data.type==='auth-success'){
                console.log("AUTHORISED");
                setIsAuthorised(true);
                return;
            }

            // handle cursor movements
            if(data.type==='cursor-move'){
                setRemoteCursors(prev=>({
                    ...prev,
                    [data.userId]:{x: data.payload.x, y: data.payload.y}
                }));
            }

            // clean up when someone leaves
            if(data.type==='user-left'){
                setRemoteCursors(prev=>{
                    const newCursor = {...prev};
                    delete newCursor[data.userId];
                    return newCursor;
                })
            }
        };

        // closing connection
        ws.onclose=(event)=>{
            console.log(`DISCONNECTED: ${event.reason}`);
            setIsConnected(false);
            setIsAuthorised(false);
        };

        // cleanup function when component unmounts
        return()=>{
            if(ws.readyState===WebSocket.OPEN){
                ws.close();
            }
        };
    }, [docId, accessToken]);

    const broadcastCursor = useCallback((x, y)=>{
        if(wsRef.current && wsRef.current.readyState===WebSocket.OPEN && isAuthorised){
            ws.current.send(JSON.stringify({
                type:'cursor-move',
                payload:{x, y}
            }));
        }
    }, [isAuthorised]);

    return [isConnected, isAuthorised, remoteCursors, broadcastCursor];
}
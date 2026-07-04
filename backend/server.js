const http = require('http');
const db = require('./db');
const auth = require('./authService');

const PORT = 3000;

function parseJsonBody (req){
    return new Promise((resolve, reject)=>{
        let body = '';
        req.on('data', chunk=>body+=chunk);
        req.on('end', ()=>{
            try{
                resolve(body?JSON.parse(body):{});
            } catch(err){
                reject(err);
            }
        });
    });
}

const server = http.createServer(async (req, res)=>{
    const url = new URL(req.url, `http://${req.headers.host}`);

    // ROUTE: create workspace
    if(req.method==='POST' && url.pathname==='/api/workspaces'){
        // authenticate the user
        const authHeader = req.headers.authorization;
        if(!authHeader || !authHeader.startsWith('Bearer ')){
            res.writeHead(401, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error: 'MISSING ACCESS TOKEN'}));
        }

        const tokenClaims = auth.verifyAccessToken(authHeader.split(' ')[1]);
        if(!tokenClaims){
            res.writeHead(401, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error:'TOKEN INVALID OR EXPIRED'}));
        }

        // parse the request body
        let workspaceName;
        try {
            ({workspaceName} = await parseJsonBody(req));
        } catch (error) {
            res.writeHead(400, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error: 'INVALID JSON BODY'}));
        }
        if(!workspaceName){
            res.writeHead(400, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error: 'WORKSPACE NAME IS REQUIRED'}));
        }

        // the ACID (Atomicity, Consistency, Isolation, Durability)
        const client = await db.getClient(); // borrow a dedicated connection
        try{
            await client.query('BEGIN');    // starts the postgreSQL transactions belonging to the client (ATOMICITY)

            // Query A: create workspace
            const insertWorkspaceSql = `INSERT INTO workspace (name, owner_id) VALUES ($1, $2) RETURNING id, name`;
            const workspaceResult = await client.query(insertWorkspaceSql, [workspaceName, tokenClaims.userId])
            const newWorkspace = workspaceResult.rows[0];

            // Query B: make the creater admin
            const insertMemberSql = `INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`;
            await client.query(insertMemberSql, [newWorkspace.id, tokenClaims.userId]);
            await client.query('COMMIT');   // transactions are done, save them now

            res.writeHead(201, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({message:'Workspace created', workspace:newWorkspace}));
        } catch(error){
            await client.query('ROLLBACK');
            console.error('Transaction failed:', error);
            res.writeHead(500, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error: 'INTERNAL SERVER ERROR'}));
        } finally{
            client.release();
        }
    }

    // fallback for unmatched API
    res.writeHead(404, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({error: 'NOT FOUND'}));
})

server.listen(PORT, ()=>{
    console.log(`Server is running ar port localhost:${PORT}`);
})
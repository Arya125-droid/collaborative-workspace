// login route
    if(req.method==='POST' && url.pathname==='/api/login'){
        try {
            const {email, password} = await parseJsonBody(req);
            const user = authdb.getUser(email);

            if(!user){
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid credentials" }));
            }

            const inputHash = crypto.createHash('sha256').update(password).digest('hex');

            if(inputHash!==user.passwordHash){
                res.writeHead(401, {'Content-Type':'application/json'});
                return res.end(JSON.stringify({ error: "Invalid credentials" }));
            }

            const accessToken = auth.generateAccessToken(user);
            const refreshToken = auth.generateRandomString();
            const familyId = `fam_${auth.generateRandomString().substring(0, 8)}`;

            authdb.saveRefreshToken(refreshToken, user.id, familyId);

            console.log("LOGIN: Saved token to DB ->", refreshToken);

            res.writeHead(200, {
                'Set-Cookie': `refreshToken=${refreshToken}; HttpOnly; Path=/; Max-Age=${30*24*60*60}`,
                'Content-Type': 'application/json'
            });
            return res.end(JSON.stringify({ accessToken }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Malformed JSON" }));
        }
    }

    // refresh token rotation route
    if(req.method==='POST' && url.pathname==='/api/refresh'){
        const incomingRefreshToken = cookies.refreshToken;

        console.log("REFRESH: Received from Postman ->", `"${incomingRefreshToken}"`);
        console.log("Token from Postman:", incomingRefreshToken);
        console.log("Does Database have it?:", !!authdb.getRefreshToken(incomingRefreshToken));

        if(!incomingRefreshToken){
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Refresh token missing" }));
        }

        const tokenRecord = authdb.getRefreshToken(incomingRefreshToken);
        if(!tokenRecord){
            res.writeHead(403, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error:'Invalid token state'}));
        }

        // token reuse detection
        if(tokenRecord.isUsed){
            authdb.invalidateFamily(tokenRecord.familyId);
            res.writeHead(403, { 
                'Set-Cookie': 'refreshToken=; HttpOnly; Path=/api/refresh; Max-Age=0',
                'Content-Type': 'application/json' 
            });
            return res.end(JSON.stringify({ error: "Security Breach Detected. Session revoked." }));
        }
        
        if(Date.now()>tokenRecord.expiresAt){
            res.writeHead(401, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error:'Refresh token expired'}));
        }

        // Rotate token
        authdb.markTokenAsUsed(incomingRefreshToken);
        const user = {id: tokenRecord.userId, role:"admin"};
        const newAccessToken = auth.generateAccessToken(user);
        const newRefreshToken = auth.generateRandomString();

        authdb.saveRefreshToken(newRefreshToken, tokenRecord.userId, tokenRecord.familyId);

        res.writeHead(200, {
            'Set-Cookie': `refreshToken=${newRefreshToken}; HttpOnly; Path=/; Max-Age=${30*24*60*60}`,
            'Content-Type':'application/json'
        })
        return res.end(JSON.stringify({accessToken:newAccessToken}));
    }

    // protected resource route
    if(req.method==='GET' && url.pathname==='/api/dashboard'){
        const authHeader = req.headers.authorization;
        if(!authHeader || !authHeader.startsWith('Bearer ')){
            res.writeHead(400, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error: "Missing access token"}));
        }

        const token = authHeader.split(' ')[1];
        const tokenClaims = auth.verifyAccessToken(token);

        if(!tokenClaims){
            res.writeHead(401, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({error:"Token invalid or expired"}));
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        return res.end(JSON.stringify({message:"Welcome to the secure dashboard"}));
    }
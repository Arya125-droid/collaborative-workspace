const db = require('./db')
const crypto = require('crypto');

const JWT_SECRET = 'super-secret';
const ACCESS_TOKEN_TTL = 15*60*1000;

function base64UrlEncode(obj){
    return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g, '_');
}

function base64UrlDecoder(str){
    return JSON.parse(Buffer.from(str, 'base64').toString());
}

module.exports = {
    generateAccessToken:(user)=>{
        const header = {alg:"HS256", type:"JWT"};
        const payload = {
            userId: user.id, // AuthN
            role: user.role, // AuthZ
            exp: Date.now() + ACCESS_TOKEN_TTL
        }

        const encodedHeader = base64UrlEncode(header);
        const encodedPayload = base64UrlEncode(payload);

        const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    },
    verifyAccessToken:(token)=>{
        try {
            const [header, payload, signature] = token.split('.');
            const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');

            if(signature!=expectedSignature) return null;

            const decodedPayload = base64UrlDecoder(payload);
            if(Date.now()>decodedPayload.exp) return null;

            return decodedPayload;
        } catch (error) {
            return null;
        }
    },
    generateRandomString: ()=>{
        return crypto.randomBytes(40).toString('hex');
    },
    verifyWorkSpaceAccess: async(userId, workspaceId, allowedRoles)=>{
        const sql = `SELECT role FROM workspace_members WHERE userId = $1 AND workspaceId = $2`
        const result = await db.query(sql, [userId, workspaceId]);
        if(result.rows.length==0) return false // user is not present in the database
        const userRole = result.rows[0].role;
        return allowedRoles.includes(userRole);
    }
}
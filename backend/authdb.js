const crypto = require('crypto');

const users = {
    "human@test.com": {
        id: "user_human",
        passwordHash: crypto.createHash('sha256').update('password123').digest('hex'),
    },
    "cherry@test.com": {
        id: "user_cherry",
        passwordHash: crypto.createHash('sha256').update('password321').digest('hex'),
    }
}

// key: refresh_token_string, value: {userId, expiresAt, familyId, isUsed};
const refreshTokensDb = new Map();

module.exports = {
    getUser: (email)=>users[email],
    saveRefreshToken: (token, userId, familyId, ttlDays = 30)=>{
        const expiresAt = Date.now() + (ttlDays*24*60*60*1000);
        refreshTokensDb.set(token, {userId, expiresAt, familyId, isUsed:false});
    },
    getRefreshToken: (token)=>{
        return refreshTokensDb.get(token);
    },
    markTokenAsUsed: (token)=>{
        const record = refreshTokensDb.get(token);
        if(record) record.isUsed = true;
    },
    invalidateFamily: (familyId)=>{
        for(const [token, values] of refreshTokensDb.entries()){
            if(values.familyId === familyId){
                refreshTokensDb.delete(token);
            }
        }
    }
}
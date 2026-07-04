const {Pool} = require('pg');

const pool = new Pool({
    user:'postgres',
    host:'localhost',
    database:'workspace_db',
    port:5432,
    max:20,
    idleTimeoutMillis:30000
});

module.exports = {
    query:(text, params)=>pool.query(text, params),
    getClient:()=>pool.connect()
}
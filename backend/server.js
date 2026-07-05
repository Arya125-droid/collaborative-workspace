const http = require("http");
const db = require("./db");
const auth = require("./authService");
const authdb = require("./authdb");
const crypto = require('crypto');

const PORT = 3000;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    list[parts.shift().trim()] = decodeURIComponent(parts.join("=")).trim();
  });
  return list;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cookies = parseCookies(req);

  // login route
  if (req.method === "POST" && url.pathname === "/api/login") {
    try {
      const { email, password } = await parseJsonBody(req);
      const user = authdb.getUser(email);

      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid credentials" }));
      }

      const inputHash = crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");

      if (inputHash !== user.passwordHash) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid credentials" }));
      }

      const accessToken = auth.generateAccessToken(user);
      const refreshToken = auth.generateRandomString();
      const familyId = `fam_${auth.generateRandomString().substring(0, 8)}`;

      authdb.saveRefreshToken(refreshToken, user.id, familyId);

      console.log("LOGIN: Saved token to DB ->", refreshToken);

      res.writeHead(200, {
        "Set-Cookie": `refreshToken=${refreshToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
        "Content-Type": "application/json",
      });
      return res.end(JSON.stringify({ accessToken }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Malformed JSON" }));
    }
  }

  // refresh token rotation route
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    const incomingRefreshToken = cookies.refreshToken;

    console.log(
      "REFRESH: Received from Postman ->",
      `"${incomingRefreshToken}"`,
    );
    console.log("Token from Postman:", incomingRefreshToken);
    console.log(
      "Does Database have it?:",
      !!authdb.getRefreshToken(incomingRefreshToken),
    );

    if (!incomingRefreshToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Refresh token missing" }));
    }

    const tokenRecord = authdb.getRefreshToken(incomingRefreshToken);
    if (!tokenRecord) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid token state" }));
    }

    // token reuse detection
    if (tokenRecord.isUsed) {
      authdb.invalidateFamily(tokenRecord.familyId);
      res.writeHead(403, {
        "Set-Cookie": "refreshToken=; HttpOnly; Path=/api/refresh; Max-Age=0",
        "Content-Type": "application/json",
      });
      return res.end(
        JSON.stringify({ error: "Security Breach Detected. Session revoked." }),
      );
    }

    if (Date.now() > tokenRecord.expiresAt) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Refresh token expired" }));
    }

    // Rotate token
    authdb.markTokenAsUsed(incomingRefreshToken);
    const user = { id: tokenRecord.userId, role: "admin" };
    const newAccessToken = auth.generateAccessToken(user);
    const newRefreshToken = auth.generateRandomString();

    authdb.saveRefreshToken(
      newRefreshToken,
      tokenRecord.userId,
      tokenRecord.familyId,
    );

    res.writeHead(200, {
      "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
      "Content-Type": "application/json",
    });
    return res.end(JSON.stringify({ accessToken: newAccessToken }));
  }

  // protected resource route
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing access token" }));
    }

    const token = authHeader.split(" ")[1];
    const tokenClaims = auth.verifyAccessToken(token);

    if (!tokenClaims) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Token invalid or expired" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({ message: "Welcome to the secure dashboard" }),
    );
  }

  // ROUTE: create workspace
  if (req.method === "POST" && url.pathname === "/api/workspaces") {
    // authenticate the user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "MISSING ACCESS TOKEN" }));
    }

    const tokenClaims = auth.verifyAccessToken(authHeader.split(" ")[1]);
    if (!tokenClaims) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "TOKEN INVALID OR EXPIRED" }));
    }

    // parse the request body
    let workspaceName;
    try {
      ({ workspaceName } = await parseJsonBody(req));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "INVALID JSON BODY" }));
    }
    if (!workspaceName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "WORKSPACE NAME IS REQUIRED" }));
    }

    // the ACID (Atomicity, Consistency, Isolation, Durability)
    const client = await db.getClient(); // borrow a dedicated connection
    try {
      await client.query("BEGIN"); // starts the postgreSQL transactions belonging to the client (ATOMICITY)

      // Query A: create workspace
      const insertWorkspaceSql = `INSERT INTO workspace (name, owner_id) VALUES ($1, $2) RETURNING id, name`;
      const workspaceResult = await client.query(insertWorkspaceSql, [
        workspaceName,
        tokenClaims.userId,
      ]);
      const newWorkspace = workspaceResult.rows[0];

      // Query B: make the creater admin
      const insertMemberSql = `INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`;
      await client.query(insertMemberSql, [
        newWorkspace.id,
        tokenClaims.userId,
      ]);
      await client.query("COMMIT"); // transactions are done, save them now

      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          message: "Workspace created",
          workspace: newWorkspace,
        }),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Transaction failed:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "INTERNAL SERVER ERROR" }));
    } finally {
      client.release();
    }
  }

  // fallback for unmatched API
  res.writeHead(404, { "Content-Type": "application/json" });
  return res.end(JSON.stringify({ error: "NOT FOUND" }));
});

server.listen(PORT, () => {
  console.log(`Server is running ar port localhost:${PORT}`);
});

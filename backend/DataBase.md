## PostgreSQL Schema (The Source of Truth)
We need to design this using Role-Based Access Control (RBAC) so users can share workspaces safely, and we need a way to store flexible document data

## Redis Architecture (The Real-Time Layer)
PostgreSQL is too slow to handle live cursor movements or `"User is typing..."` indicators. We will use Redis to handle the volatile, ultra-fast state.

We will use two specific Redis data structures for this project:

### 1. Active Presence (Redis Hash / Sets)
When a user opens Document A, we need to show their avatar at the top of the screen to everyone else.

* **Key**: `presence:doc:<document_id>`
* **Action**: When a user connects via WebSocket, we add their user_id and name to this Redis Set. When they close the tab (WebSocket disconnects), we remove them.

*It shows you know how to manage temporary state across distributed servers. If Server 1 crashes, Server 2 can still read Redis to know who is online.*

### 2. Pub/Sub Channels (The Broadcaster)
When User A types a letter, we need to send that letter to User B and User C instantly.
* **Channel Name**: `channel:doc:<document_id>`
* **Action**: Node.js listens for a WebSocket message from User A. Node.js publishes that message to the Redis channel. Redis blasts it out to every other Node.js server, which then pushes it down to the React clients for User B and C.
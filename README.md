# Sentinel Collaborative Workspace

A high-performance, real-time collaborative document editor built with Node.js, WebSockets, and Redis. It allows multiple authenticated users to edit text blocks and track each other's cursors simultaneously with zero latency.

---

## Features

* **Real-Time Cursor Tracking**: See exactly where collaborators are pointing across the document.
* **Live Text Synchronization**: Block-based text editing with instant broadcasting to all connected clients.
* **Secure Authentication**: JWT-based access control with HTTP-only refresh token rotation and session invalidation.
* **ACID-Compliant Workspaces**: PostgreSQL transactions ensure reliable creation of workspaces and user roles.
* **Redis Pub/Sub Architecture**: Horizontally scalable WebSocket message brokering allows users on different server instances to collaborate seamlessly.

---

## Tech Stack

* **Frontend**: React (Vite), Tailwind CSS
* **Backend**: Node.js, Express, ws (WebSockets)
* **Database**: PostgreSQL (User & Workspace data persistence)
* **Memory/Cache**: Redis (Pub/Sub for WebSocket syncing, presence tracking)

---

## Prerequisites

Ensure you have the following installed on your machine before starting:

* Node.js (v18+)
* PostgreSQL
* Redis Server (Running on default port ``6379``)

---

## Installation & Setup

1. Clone the repository
   ```Bash
   git clone https://github.com/Arya125-droid/collaborative-workspace.git
   cd sentinel-workspace
   ```
   
2. Backend Setup
   ```Bash
   cd backend
   npm install
   ```
Create a ``.env`` file in the backend directory and configure your environment variables:
```Bash
PORT=3000
WS_PORT=3001
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://user:password@localhost:5432/sentinel
JWT_SECRET=your_super_secret_key
```
Start the HTTP API and the WebSocket Real-Time Engine:
```Bash
node server.js
node collaboration_engine.js
```

3. Frontend Setup
  ```Bash
  cd ../frontend
  npm install
  npm run dev
  ```

---

## How to Test Multi-User Collaboration

Because this system relies on strict cryptographic authentication, you must simulate two distinct user sessions to see the collaboration features in action.

1. **Generate Access Tokens**: Use Postman (or cURL) to send a ``POST /api/login`` request using two different sets of user credentials. Copy the resulting ``accessToken`` for both users.

2. **Open User A**: Open your primary web browser and navigate to the frontend URL, appending the first user's token directly to the query string:
``http://localhost:5173/?token=PASTE_USER_A_TOKEN_HERE``

3. **Open User B**: Open a separate Incognito/Private window (to isolate browser state) and navigate to the same URL using the second user's token:
``http://localhost:5173/?token=PASTE_USER_B_TOKEN_HERE``

4. **Collaborate**: Start typing in the text blocks in one window, you will see the text instantly replicate in the other. Move your mouse to see the live color-coded cursors (tagged with the user's ID) tracking across both screens.

---

## Core API Endpoints

* ``POST /api/login`` - Authenticate user, returns JWT and sets HTTP-only refresh cookie.
* ``POST /api/refresh`` - Rotate the refresh token securely (includes token-reuse detection).
* ``POST /api/workspaces`` - Create a new collaborative workspace.
* ``ws://localhost:3001/?docId={id}`` - The WebSocket connection gateway for document syncing.

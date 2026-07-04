-- users table
CREATE TABLE users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- workspace
CREATE TABLE workspace(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE, -- prevents orphan rows
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- AuthZ table
CREATE TABLE workspace_members(
    workspace_id UUID REFERENCES workspace(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    PRIMARY KEY(workspace_id, user_id)
)

 -- The data type. Unlike regular JSON (which stores data as a raw string), JSONB decomposes the JSON data into a binary format. This makes insertions slightly slower but makes querying, indexing, and manipulating the JSON significantly faster
CREATE TABLE documents(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    content JSONB DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
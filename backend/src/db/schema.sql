CREATE DATABASE e2ee_chat;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  public_key_ed TEXT NOT NULL,
  public_key_x TEXT NOT NULL,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contacts table
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  contact_id INTEGER REFERENCES users(id),
  nickname VARCHAR(255),
  verified BOOLEAN DEFAULT false,
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

-- Messages table (stores encrypted content only)
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id),
  encrypted_content JSONB NOT NULL, -- stores {ciphertext, nonce, ephPub}
  file_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP
);

-- Files table (metadata only, actual files in S3)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id INTEGER REFERENCES users(id),
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size INTEGER,
  s3_key VARCHAR(500),
  encrypted_key JSONB, -- wrapped symmetric key
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_messages_users ON messages(from_user_id, to_user_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_files_uploader ON files(uploader_id);

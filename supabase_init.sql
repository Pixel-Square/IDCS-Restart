-- Supabase / Postgres minimal schema for roles and users
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS role_maps (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT
);

-- Note: Supabase manages auth.users separately. For the Django app using Postgres,
-- you can insert application-level users into the `accounts_user` table via Django migrations.

-- Seed roles
INSERT INTO roles (name) VALUES ('admin') ON CONFLICT DO NOTHING;
INSERT INTO roles (name) VALUES ('user') ON CONFLICT DO NOTHING;
INSERT INTO roles (name) VALUES ('faculty') ON CONFLICT DO NOTHING;

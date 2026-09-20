# Sahay Racks — Project Tracking System

Centralized enquiry, project, and department workflow platform for Sahay Racks.

Lead (pre-sales opportunity) and Project (confirmed order in execution) stay separate. Work is modeled as **Stage + Status + Task + Activity**, not a single status field.

## Stack

- React + Vite + React Router
- Node.js + Express REST API
- PostgreSQL (Aiven)
- Prisma ORM
- JWT authentication and role-based access

## Quick start

1. Install Node.js 20+.
2. Copy environment files (never commit real `.env` files):

```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

3. Put the Aiven PostgreSQL connection string **only** in `server/.env` as `DATABASE_URL`. Do not put it in the React app.

4. Install and run:

```bash
npm install
npm run install:all
cd server
npx prisma migrate deploy
cd ..
npm run dev
```

5. Open http://localhost:5173 and sign in with the admin credentials from `server/.env`.

## Security

- `DATABASE_URL` exists only on the server.
- Passwords are hashed with bcrypt.
- Documents are stored on the server; the database keeps metadata only.
- Audit logs cannot be edited by ordinary users.

## Excel import

Use **Settings → Excel Import** after signing in as Admin. Original files are not modified.

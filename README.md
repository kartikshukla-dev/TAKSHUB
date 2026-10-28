# TaskHub

Internal JIRA-style task management prototype — projects, Kanban boards, tasks with
comments/labels/attachments/activity logs, email notifications, and live updates.

## Stack
- **Backend**: Node.js, Express, MongoDB (Mongoose), Passport (Google OAuth2), JWT, bcrypt,
  Nodemailer, Socket.io, GridFS (attachments stored in MongoDB)
- **Frontend**: React (Vite), React Router, Axios, @dnd-kit (drag-and-drop), Socket.io-client

## Project structure
```
taskhub (workspace root)
  backend/    Express API, MongoDB models, sockets, email service
  frontend/   React SPA (Kanban board, auth, task details)
```

## Running locally

### 1. MongoDB
You need a MongoDB instance reachable at the URI you set in `backend/.env`
(e.g. a local `mongod`, or a free MongoDB Atlas cluster).

### 2. Backend
```powershell
cd backend
copy .env.example .env   # then fill in MONGO_URI, JWT_SECRET, Google OAuth, SMTP creds
npm install
npm run dev               # starts on http://localhost:5000
```
Run tests: `npm test` (uses an in-memory MongoDB, no real DB needed for tests).

### 3. Frontend
```powershell
cd frontend
copy .env.example .env   # defaults point at http://localhost:5000
npm install
npm run dev               # starts on http://localhost:5173
```
Run tests: `npm test`.

## Configuring integrations

- **Google OAuth**: create OAuth 2.0 credentials in the Google Cloud Console, set the
  authorized redirect URI to `http://localhost:5000/api/auth/google/callback`, and put the
  client ID/secret in `backend/.env`. Without these set, Google login is skipped (email/password
  still works).
- **Email (Nodemailer/SMTP)**: fill `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `backend/.env`.
  For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833) rather
  than your real password. Without SMTP configured, emails are skipped (logged as a warning)
  so the rest of the app still works.

## Feature overview
- Email/password + Google OAuth login (JWT sessions), Admin/Member roles
- Projects with members, Admin-managed
- Kanban board (To Do / In Progress / Done) with drag-and-drop
- Tasks: priority, assignee, due date, labels, comments, per-task activity log, file attachments
- Project-wide activity feed
- Live board updates via Socket.io (multiple tabs/users see changes instantly)
- Email notifications: task created -> assignee; task marked Done -> assignee + reporter

## Known prototype limitations / notes for production hardening
- The register form lets a user pick "Admin" role directly — fine for an internal
  prototype/first-admin bootstrap, but before real rollout this should be restricted
  (e.g. only an existing admin can promote others, or the first registered user becomes
  admin automatically).
- No rate limiting or CSRF protection has been added yet.
- Sprints were intentionally left out in favor of a simple Kanban board (per requirements).
- `npm audit` flags some transitive dev-dependency vulnerabilities (mongodb-memory-server,
  supertest chains); worth re-auditing before shipping to production, though they don't
  affect the runtime app.

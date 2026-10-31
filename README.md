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

All keys go in `backend/.env` (see `backend/.env.example`). Restart the backend after editing it.

### Google login
1. Google Cloud Console → **APIs & Services → OAuth consent screen**: choose *Internal*
   (Google Workspace) or *External*, fill the app name and support email. For *External*
   while testing, add your team's emails as test users.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origin: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
3. Put the values in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The "Continue with Google" button only appears once both are set. A Google account with the
same email as an existing account is linked to it; otherwise a new Employee account is created.

### Email
Pick one provider. `EMAIL_PROVIDER` forces a choice; if it's empty the first one with keys wins
(Resend → Brevo → SMTP). With none set, emails are skipped and the app keeps working.

| Provider | Keys | Notes |
|---|---|---|
| Resend API | `RESEND_API_KEY` | Without a verified domain, Resend only delivers to your own account email. Verify a domain to email the team. |
| Brevo API | `BREVO_API_KEY` | Verify the sender email in Brevo (Senders & IP) and use it in `EMAIL_FROM`. |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833). |

`EMAIL_FROM` is the sender shown in the inbox, e.g. `"Oncare <no-reply@yourdomain.com>"`.

Admins can check the active provider, send a test email and preview every template in
**Settings → Email delivery**.

Emails sent: welcome (sign-up, including Google), task assigned (new or reassigned), task
completed, new comment, password changed. Task emails respect each person's "Email me
notifications" setting; security emails are always sent.

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

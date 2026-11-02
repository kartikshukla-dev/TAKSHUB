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

## Roles and team workflow

| Role (stored value) | Can do |
|---|---|
| **Super Admin** (`admin`) | Sees everything. **Users** page: invite anyone, give roles, move people between teams, disable accounts. **Team Leads** page: every team with its head, members and tasks. |
| **Team Head** (`manager`) | Head of one team (department). Sets the deadline and assignee of tasks sent to their team, only to people in that team. Invites members to their team from **My Team**. |
| **Member** (`member`) | Raises tasks, works on tasks assigned to them. |

Workflow: someone in team A creates a task with **Send to team = B** (a project is optional;
without one it goes to the built-in *Team requests* project, IDs like `REQ-12`). Team B's head
gets an email, sets the deadline and assigns it to someone in team B. Both teams see the task
and its deadline. Every change emails the people on the task: the person who raised it, the
assignee, and the heads of both teams (not the person who made the change). Each person's
"Email me notifications" setting is respected; sign-in codes, invites and role changes always send.

### Sign-in
Invite-only, two methods: **email + one-time code** (6 digits, valid 10 minutes, 5 tries, one
request per 45 s) and **Google**. There is no password login and no self sign-up. The first
Super Admin is whoever is listed in `SUPERADMIN_EMAIL`. With no email provider configured, the
code is printed in the backend console (handy for local demos only).

## Look and 3D

Dark only, cinematic: glass panels over one live WebGL stage (React Three Fiber v8 + drei,
three.js) that sits behind every page.

| Page | Background |
|---|---|
| Login, Dashboard | Oncare ribbon (glass/iridescent, follows the mouse) + particles |
| Projects, Team Leads | **Galaxy view**: projects/teams as planets, open tasks/members as moons, red ring when overdue; click a planet to open it. **Grid** toggle shows the cards (3D tilt + progress ring). |
| Other pages | Particles that morph per page: galaxy (tasks), ring (calendar), grid (team/users), wave (chat), bars (reports/activity), sphere (settings/to-dos) |

Motion: page transitions (Motion), heading reveal (GSAP SplitText), staggered entrances,
count-up stats, Lenis smooth scroll, modal zoom-in, and a shockwave in the particles when a
card is dropped into Done. Hovering a task row shows a floating preview card.

Performance and comfort:
- 3D code is lazy-loaded in its own chunks; the first screen doesn't wait for three.js.
- Quality is picked from the device (CPU cores, memory, mobile, data saver) and stepped down
  automatically when the frame rate drops; rendering pauses when the tab is hidden.
- **Settings → Visual effects → Reduce effects** turns the 3D and most animation off (saved per
  browser). The OS "reduce motion" setting does the same. Without WebGL a static gradient is shown.
- Optional Spline ribbon: set `VITE_SPLINE_RIBBON_URL` (frontend env, Vercel → redeploy). If it's
  empty or fails to load, the coded ribbon is used.

## Deploying

The backend is a long-running Node server (Socket.io for live chat/notifications), so it can't
run as Vercel serverless functions. Host the **frontend on Vercel** and the **backend on a
Node host** such as Render, Railway or Fly.io.

### 1. MongoDB Atlas
1. [cloud.mongodb.com](https://cloud.mongodb.com) → create a cluster (the free M0 tier works for a start).
2. **Database Access** → add a database user with a strong password (role: *Read and write to any database*).
3. **Network Access** → add `0.0.0.0/0`. Render/Railway don't have fixed outbound IPs on free plans; access is still protected by the user/password.
4. **Connect → Drivers** → copy the `mongodb+srv://...` string, put the database name before the `?`, e.g.
   `mongodb+srv://taskhub:<password>@cluster0.xxxx.mongodb.net/taskhub?retryWrites=true&w=majority`.
   URL-encode special characters in the password (`@` → `%40`, `#` → `%23`).

### 2. Backend (e.g. Render → New → Web Service)
- Root directory `backend`, build `npm install`, start `npm start`.
- Environment variables: everything from `backend/.env.example`, with
  `NODE_ENV=production`, `MONGO_URI=<Atlas string>`, a new long random `JWT_SECRET`,
  `FRONTEND_URL=https://<your-app>.vercel.app`,
  `GOOGLE_CALLBACK_URL=https://<your-backend>.onrender.com/api/auth/google/callback`,
  `SUPERADMIN_EMAIL`, and the SMTP / email keys. Don't set `PORT` (the host provides it).
- Check `https://<your-backend>/api/health` returns `"db":"connected"`.

### 3. Frontend (Vercel → New Project)
- Root directory `frontend`, framework preset **Vite** (build `npm run build`, output `dist`).
  `frontend/vercel.json` sends every route to `index.html` so links like `/projects/:id` work.
- Environment variables: `VITE_API_URL=https://<your-backend>/api`,
  `VITE_SOCKET_URL=https://<your-backend>`. Redeploy after changing them (they are baked in at build time).

### 4. Google sign-in
In Google Cloud Console → Credentials → your OAuth client, add
`https://<your-app>.vercel.app` to *Authorized JavaScript origins* and
`https://<your-backend>/api/auth/google/callback` to *Authorized redirect URIs*.

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

Emails sent: sign-in code, invite, role/team changed, new request for your team, assigned to
you, task updated (deadline, assignee, status, team, priority), task completed, new comment.

## Feature overview
- Invite-only sign-in: email + one-time code, or Google. Roles: Super Admin, Team Head, Member
- Cross-team requests: raise a task to a team; its head sets the deadline and assigns it
- Super Admin pages: Team Leads (every team, head, members, tasks) and Users (roles, teams, access)
- Team Heads: My Team page with members, invites and team tasks
- Dashboard, My Tasks / Created by Me / All Tasks with list and board views, projects, calendar,
  activity, reports, to-dos, chat, notifications and search (Ctrl/Cmd+K)
- Live updates via Socket.io; in-app and email notifications for every task change

## Known limitations / notes for production hardening
- Sign-in code requests are rate-limited per email; there is no IP-based rate limiting yet.
- Email notifications are sent from the API process (no queue); a slow provider delays nothing
  for the user, but failed sends are only logged.
- 
pm audit flags some transitive dev-dependency vulnerabilities (mongodb-memory-server,
  supertest chains); worth re-auditing before production.
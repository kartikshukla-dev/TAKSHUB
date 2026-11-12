import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import { useAuth } from './context/AuthContext';

// Pages load on demand: the first visit only downloads the shell and the
// page being opened, the rest arrive in small chunks when visited.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const Todos = lazy(() => import('./pages/Todos'));
const Chat = lazy(() => import('./pages/Chat'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Team = lazy(() => import('./pages/Team'));
const MemberDetail = lazy(() => import('./pages/MemberDetail'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Activity = lazy(() => import('./pages/Activity'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const TeamDetail = lazy(() => import('./pages/TeamDetail'));
const TeamLeads = lazy(() => import('./pages/TeamLeads'));
const Users = lazy(() => import('./pages/Users'));

// Warm the most used pages in the background once the app is idle.
if (typeof window !== 'undefined') {
  const warm = () => {
    import('./pages/Dashboard');
    import('./pages/TasksPage');
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(warm);
}

// Pages only Super Admins can open.
function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
}

const page = (el) => <Suspense fallback={<div className="page page-loading" aria-busy="true" />}>{el}</Suspense>;

export default function App() {
  return <AppRoutes />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* No self sign-up: people join through an invite. */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={page(<Dashboard />)} />
        <Route path="/my-tasks" element={page(<TasksPage mode="mine" />)} />
        <Route path="/created-by-me" element={page(<TasksPage mode="created" />)} />
        <Route path="/tasks" element={page(<TasksPage mode="all" />)} />
        <Route path="/todos" element={page(<Todos />)} />
        <Route path="/chat" element={page(<Chat />)} />
        <Route path="/projects" element={page(<Projects />)} />
        <Route path="/projects/:id" element={page(<ProjectDetail />)} />
        <Route path="/team" element={page(<Team />)} />
        <Route path="/team/:id" element={page(<MemberDetail />)} />
        <Route path="/calendar" element={page(<Calendar />)} />
        <Route path="/activity" element={page(<Activity />)} />
        <Route path="/reports" element={page(<Reports />)} />
        <Route path="/settings" element={page(<Settings />)} />
        <Route path="/teams/:id" element={page(<TeamDetail />)} />
        <Route path="/team-leads" element={page(<AdminOnly><TeamLeads /></AdminOnly>)} />
        <Route path="/users" element={page(<AdminOnly><Users /></AdminOnly>)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

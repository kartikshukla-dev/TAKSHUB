import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Users from './pages/Users';
import TeamLeads from './pages/TeamLeads';
import TeamDetail from './pages/TeamDetail';
import { useAuth } from './context/AuthContext';
import OAuthCallback from './pages/OAuthCallback';
import Dashboard from './pages/Dashboard';
import TasksPage from './pages/TasksPage';
import Todos from './pages/Todos';
import Chat from './pages/Chat';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Team from './pages/Team';
import MemberDetail from './pages/MemberDetail';
import Calendar from './pages/Calendar';
import Activity from './pages/Activity';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

// Pages only Super Admins can open.
function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-tasks" element={<TasksPage mode="mine" />} />
        <Route path="/created-by-me" element={<TasksPage mode="created" />} />
        <Route path="/tasks" element={<TasksPage mode="all" />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/:id" element={<MemberDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/team-leads" element={<AdminOnly><TeamLeads /></AdminOnly>} />
        <Route path="/users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

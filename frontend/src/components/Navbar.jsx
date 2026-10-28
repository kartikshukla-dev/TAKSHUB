import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        TaskHub
      </Link>
      {user && (
        <div className="navbar-right">
          <span className="navbar-user">
            {user.name} <span className="badge">{user.role}</span>
          </span>
          <button onClick={handleLogout} className="btn btn-ghost">
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}

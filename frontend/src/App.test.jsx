import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

vi.mock('./api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn().mockRejectedValue(new Error('no session')),
  getProviders: vi.fn().mockResolvedValue({ google: false }),
  googleLoginUrl: () => 'http://localhost:5000/api/auth/google',
}));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SocketProvider>
          <App />
        </SocketProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects an unauthenticated user from "/" to the login page', async () => {
    renderAt('/');
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });

  it('renders the register page at /register', async () => {
    renderAt('/register');
    expect(await screen.findByText("Create your account")).toBeInTheDocument();
  });
});

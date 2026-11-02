import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from '../context/AuthContext';
import * as authApi from '../api/auth';

vi.mock('../api/auth', () => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  fetchMe: vi.fn(),
  getProviders: vi.fn().mockResolvedValue({ google: true }),
  googleLoginUrl: () => 'http://localhost:5000/api/auth/google',
}));

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Login page (email + one-time code)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('asks for an email and has no password field', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('sends a code, then signs in with it', async () => {
    authApi.requestOtp.mockResolvedValue({ message: 'Code sent' });
    authApi.verifyOtp.mockResolvedValue({ token: 't', user: { _id: 'u1', name: 'A', role: 'member' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByText('Send code'));
    await waitFor(() => expect(authApi.requestOtp).toHaveBeenCalledWith('user@example.com'));

    fireEvent.change(await screen.findByLabelText('Sign-in code'), { target: { value: '12a3456' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(authApi.verifyOtp).toHaveBeenCalledWith('user@example.com', '123456'));
  });

  it('shows the server error for a wrong code', async () => {
    authApi.requestOtp.mockResolvedValue({});
    authApi.verifyOtp.mockRejectedValue({ response: { data: { message: 'That code is not right' } } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByText('Send code'));
    fireEvent.change(await screen.findByLabelText('Sign-in code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Sign in'));
    expect(await screen.findByText('That code is not right')).toBeInTheDocument();
  });

  it('pre-fills the email from an invite link and explains Google errors', () => {
    renderLogin('/login?email=new%40example.com&error=google_not_invited');
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
    expect(screen.getByText(/has not been invited/)).toBeInTheDocument();
  });
});

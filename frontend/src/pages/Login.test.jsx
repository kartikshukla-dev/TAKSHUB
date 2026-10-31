import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from '../context/AuthContext';
import * as authApi from '../api/auth';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn(),
  getProviders: vi.fn().mockResolvedValue({ google: true }),
  googleLoginUrl: () => 'http://localhost:5000/api/auth/google',
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('requires email and password before submitting', () => {
    renderLogin();
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    expect(emailInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it('calls the login API with entered credentials and shows an error on failure', async () => {
    authApi.login.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } });

    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'wrongpass',
    }));
    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeInTheDocument());
  });
});

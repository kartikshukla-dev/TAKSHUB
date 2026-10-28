import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const joinProject = (projectId) => socketRef.current?.emit('project:join', projectId);
  const leaveProject = (projectId) => socketRef.current?.emit('project:leave', projectId);

  const on = (event, handler) => socketRef.current?.on(event, handler);
  const off = (event, handler) => socketRef.current?.off(event, handler);

  return (
    <SocketContext.Provider value={{ connected, joinProject, leaveProject, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}

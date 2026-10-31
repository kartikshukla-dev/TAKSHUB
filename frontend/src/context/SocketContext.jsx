import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    // The token puts this socket in the user's personal room on the server
    // (chat, notifications, task updates).
    const s = io(socketUrl, { transports: ['websocket'], auth: { token } });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  const joinProject = useCallback((projectId) => socketRef.current?.emit('project:join', projectId), []);
  const leaveProject = useCallback((projectId) => socketRef.current?.emit('project:leave', projectId), []);
  const on = useCallback((event, handler) => socketRef.current?.on(event, handler), []);
  const off = useCallback((event, handler) => socketRef.current?.off(event, handler), []);

  return (
    <SocketContext.Provider value={{ socket, connected, joinProject, leaveProject, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}

// Subscribes to socket events for the lifetime of the component. Re-binds
// when the socket reconnects with a new token.
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const fn = (...args) => handlerRef.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

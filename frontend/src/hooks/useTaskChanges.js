import { useEffect, useRef } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { onTaskChange } from '../utils/taskEvents';

// Calls `callback` (debounced) whenever any task is created, updated,
// commented on or deleted, locally or by someone else over the socket.
export default function useTaskChanges(callback, delay = 250) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const timer = useRef(null);

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => cbRef.current(), delay);
  };

  useSocketEvent('task:created', schedule);
  useSocketEvent('task:updated', schedule);
  useSocketEvent('task:deleted', schedule);
  useSocketEvent('task:commented', schedule);

  useEffect(() => {
    const off = onTaskChange(schedule);
    return () => {
      off();
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

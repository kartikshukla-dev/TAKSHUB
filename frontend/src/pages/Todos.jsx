import { useEffect, useState } from 'react';
import * as ws from '../api/workspace';
import Icon from '../components/Icon';
import { Card, PageHeader } from '../components/ui';
import { dueState, formatShortDate } from '../utils/format';

const REPEAT_LABEL = { once: 'Once', daily: 'Every day', weekdays: 'Every weekday' };

function TodoRow({ todo, onToggle, onDelete }) {
  const due = todo.repeat === 'once' && !todo.doneToday ? dueState({ dueDate: todo.dueDate, status: 'todo' }) : null;
  return (
    <li className={`todo-row ${todo.doneToday ? 'todo-done' : ''}`}>
      <label className="todo-check">
        <input type="checkbox" checked={todo.doneToday} onChange={() => onToggle(todo)} />
        <span className="todo-text">{todo.text}</span>
      </label>
      <span className="todo-meta">
        {todo.repeat !== 'once' && <span className="chip">{REPEAT_LABEL[todo.repeat]}</span>}
        {todo.dueDate && <span className={`due due-${due || 'none'}`}>{formatShortDate(todo.dueDate)}</span>}
        <button type="button" className="icon-btn icon-btn-sm" aria-label="Delete to-do" onClick={() => onDelete(todo)}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </li>
  );
}

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');
  const [repeat, setRepeat] = useState('once');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    ws.listTodos()
      .then(setTodos)
      .catch(() => setError('Could not load your to-dos'));
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const todo = await ws.createTodo({ text, repeat, dueDate: repeat === 'once' ? dueDate || null : null });
      setTodos((prev) => [todo, ...prev]);
      setText('');
      setDueDate('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add to-do');
    }
  };

  const toggle = async (todo) => {
    const optimistic = { ...todo, doneToday: !todo.doneToday };
    setTodos((prev) => prev.map((t) => (t._id === todo._id ? optimistic : t)));
    try {
      const updated = await ws.updateTodo(todo._id, { done: !todo.doneToday });
      setTodos((prev) => prev.map((t) => (t._id === todo._id ? updated : t)));
    } catch {
      setTodos((prev) => prev.map((t) => (t._id === todo._id ? todo : t)));
    }
  };

  const remove = async (todo) => {
    setTodos((prev) => prev.filter((t) => t._id !== todo._id));
    try {
      await ws.deleteTodo(todo._id);
    } catch {
      setTodos((prev) => [todo, ...prev]);
    }
  };

  const daily = todos.filter((t) => t.repeat !== 'once');
  const once = todos
    .filter((t) => t.repeat === 'once')
    .sort((a, b) => Number(a.doneToday) - Number(b.doneToday));

  return (
    <div className="page">
      <PageHeader title="To-dos" subtitle="Your personal checklist. Only you can see it (admins can view it, but not change it)." />

      {error && <div className="alert alert-error">{error}</div>}

      <form className="todo-form" onSubmit={add}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" aria-label="New to-do" />
        <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">
          <option value="once">Once</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday</option>
        </select>
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={repeat !== 'once'}
          aria-label="Due date"
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          <Icon name="plus" size={16} /> Add
        </button>
      </form>

      <Card title="Daily" subtitle="Repeats every day or every weekday">
        {daily.length === 0 ? (
          <p className="card-empty">Add something you do every day and choose “Every day” or “Every weekday”.</p>
        ) : (
          <ul className="todo-list">
            {daily.map((t) => (
              <TodoRow key={t._id} todo={t} onToggle={toggle} onDelete={remove} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="To do" subtitle="One-off items">
        {once.length === 0 ? (
          <p className="card-empty">Nothing on your list.</p>
        ) : (
          <ul className="todo-list">
            {once.map((t) => (
              <TodoRow key={t._id} todo={t} onToggle={toggle} onDelete={remove} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

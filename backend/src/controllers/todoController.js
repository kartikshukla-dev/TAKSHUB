const mongoose = require('mongoose');
const Todo = require('../models/Todo');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Repeating items count as done only for the day they were ticked.
function present(todo) {
  const json = todo.toObject ? todo.toObject() : todo;
  const doneToday = json.repeat === 'once' ? json.done : json.lastDoneOn === todayKey();
  return { ...json, doneToday };
}

// GET /api/todos?user=<id> : own list; admins may view (not edit) someone else's.
const listTodos = catchAsync(async (req, res) => {
  let owner = req.user._id;
  if (req.query.user && req.query.user !== req.user._id.toString()) {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only admins can view other people\'s to-dos');
    if (!mongoose.Types.ObjectId.isValid(req.query.user)) throw new ApiError(400, 'Invalid user id');
    owner = req.query.user;
  }
  const todos = await Todo.find({ owner }).sort({ done: 1, dueDate: 1, createdAt: -1 });
  res.status(200).json({ todos: todos.map(present) });
});

const createTodo = catchAsync(async (req, res) => {
  const { text, repeat, dueDate } = req.body;
  if (!text || !text.trim()) throw new ApiError(400, 'text is required');
  const todo = await Todo.create({
    owner: req.user._id,
    text: text.trim(),
    repeat: ['daily', 'weekdays'].includes(repeat) ? repeat : 'once',
    dueDate: dueDate || null,
  });
  res.status(201).json({ todo: present(todo) });
});

async function loadOwn(req) {
  const todo = await Todo.findOne({ _id: req.params.id, owner: req.user._id });
  if (!todo) throw new ApiError(404, 'To-do not found');
  return todo;
}

const updateTodo = catchAsync(async (req, res) => {
  const todo = await loadOwn(req);
  const { text, done, dueDate } = req.body;
  if (text !== undefined) {
    if (!text.trim()) throw new ApiError(400, 'text cannot be empty');
    todo.text = text.trim();
  }
  if (dueDate !== undefined) todo.dueDate = dueDate || null;
  if (done !== undefined) {
    if (todo.repeat === 'once') {
      todo.done = Boolean(done);
      todo.doneAt = done ? new Date() : null;
    } else {
      todo.lastDoneOn = done ? todayKey() : null;
    }
  }
  await todo.save();
  res.status(200).json({ todo: present(todo) });
});

const deleteTodo = catchAsync(async (req, res) => {
  const todo = await loadOwn(req);
  await todo.deleteOne();
  res.status(204).send();
});

module.exports = { listTodos, createTodo, updateTodo, deleteTodo, todayKey };

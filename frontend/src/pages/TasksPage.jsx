import { useTaskUi } from '../context/TaskUiContext';
import { useAuth } from '../context/AuthContext';
import TaskView from '../components/TaskView';
import Icon from '../components/Icon';
import { PageHeader } from '../components/ui';

const MODES = {
  mine: {
    title: 'My tasks',
    subtitle: 'Tasks currently assigned to you.',
    fixed: { assignee: 'me' },
    hide: ['assignee'],
    empty: { title: 'Nothing assigned to you', text: 'When someone assigns you a task, it shows up here.' },
  },
  created: {
    title: 'Created by me',
    subtitle: 'Tasks you reported, whoever is working on them.',
    fixed: { reporter: 'me' },
    hide: [],
    empty: { title: "You haven't created any tasks", text: 'Tasks you create show up here so you can follow them.' },
  },
  all: {
    title: 'All tasks',
    subtitle: 'Every task you have access to in this workspace.',
    fixed: {},
    hide: [],
    empty: { title: 'No tasks yet', text: 'Tasks you can access will appear here. Create the first one.' },
  },
};

export default function TasksPage({ mode }) {
  const config = MODES[mode];
  const { openNewTask } = useTaskUi();
  const { userId } = useAuth();
  const defaults = mode === 'mine' ? { assignee: userId } : {};

  return (
    <div className="page">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openNewTask(defaults)}>
            <Icon name="plus" size={16} /> New task
          </button>
        }
      />
      <TaskView
        key={mode}
        fixed={config.fixed}
        hide={config.hide}
        storageKey={mode}
        empty={config.empty}
        newTaskDefaults={defaults}
      />
    </div>
  );
}

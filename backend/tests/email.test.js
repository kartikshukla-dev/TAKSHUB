require('dotenv').config();
const emailService = require('../src/services/emailService');

describe('emailService', () => {
  let mockTransporter;

  beforeEach(() => {
    mockTransporter = { sendMail: jest.fn().mockResolvedValue({ messageId: 'abc' }) };
    emailService.setTransporter(mockTransporter);
  });

  const project = { name: 'TaskHub Core', key: 'THC' };
  const assignee = { name: 'Assignee Person', email: 'assignee@example.com' };
  const reporter = { name: 'Reporter Person', email: 'reporter@example.com' };

  it('sends a task-created email to the assignee only', async () => {
    const task = { title: 'New Task', priority: 'high', status: 'todo', createdAt: new Date() };

    await emailService.sendTaskCreatedEmail({ task, project, assignee, reporter });

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    const call = mockTransporter.sendMail.mock.calls[0][0];
    expect(call.to).toBe('assignee@example.com');
    expect(call.subject).toContain('New Task');
    expect(call.html).toContain('high');
  });

  it('does not send a task-created email when there is no assignee', async () => {
    const task = { title: 'Unassigned Task', priority: 'low', status: 'todo', createdAt: new Date() };

    await emailService.sendTaskCreatedEmail({ task, project, assignee: null, reporter });

    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('sends a task-completed email to both assignee and reporter', async () => {
    const task = {
      title: 'Done Task',
      priority: 'medium',
      status: 'done',
      completedAt: new Date(),
    };

    await emailService.sendTaskCompletedEmail({ task, project, assignee, reporter });

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    const call = mockTransporter.sendMail.mock.calls[0][0];
    expect(call.to).toBe('assignee@example.com,reporter@example.com');
    expect(call.html).toContain('Task completed');
  });
});

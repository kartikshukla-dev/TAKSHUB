import { describe, it, expect } from 'vitest';
import { shouldPlayDropAnimation } from './dropAnimation';

describe('shouldPlayDropAnimation', () => {
  it('returns true when moving from todo to done', () => {
    expect(shouldPlayDropAnimation('todo', 'done')).toBe(true);
  });

  it('returns true when moving from in-progress to done', () => {
    expect(shouldPlayDropAnimation('in-progress', 'done')).toBe(true);
  });

  it('returns false when already done (no-op update)', () => {
    expect(shouldPlayDropAnimation('done', 'done')).toBe(false);
  });

  it('returns false when moving out of done', () => {
    expect(shouldPlayDropAnimation('done', 'todo')).toBe(false);
  });

  it('returns false for unrelated transitions', () => {
    expect(shouldPlayDropAnimation('todo', 'in-progress')).toBe(false);
  });
});

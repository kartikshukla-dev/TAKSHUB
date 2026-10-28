import { describe, it, expect } from 'vitest';
import { getAgingStage, getAgingDays } from './taskAge';

const NOW = new Date('2026-10-26T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('getAgingStage', () => {
  it('returns "fresh" for a task created today', () => {
    expect(getAgingStage(daysAgo(0), NOW)).toBe('fresh');
  });

  it('returns "slight" for 1-2 days old', () => {
    expect(getAgingStage(daysAgo(1), NOW)).toBe('slight');
    expect(getAgingStage(daysAgo(2), NOW)).toBe('slight');
  });

  it('returns "amber" for 3-5 days old', () => {
    expect(getAgingStage(daysAgo(3), NOW)).toBe('amber');
    expect(getAgingStage(daysAgo(5), NOW)).toBe('amber');
  });

  it('returns "deep-amber" for 6-10 days old', () => {
    expect(getAgingStage(daysAgo(6), NOW)).toBe('deep-amber');
    expect(getAgingStage(daysAgo(10), NOW)).toBe('deep-amber');
  });

  it('returns "red" for 11+ days old', () => {
    expect(getAgingStage(daysAgo(11), NOW)).toBe('red');
    expect(getAgingStage(daysAgo(365), NOW)).toBe('red');
  });

  it('guards against invalid createdAt by returning "fresh"', () => {
    expect(getAgingStage(undefined, NOW)).toBe('fresh');
    expect(getAgingStage('not-a-date', NOW)).toBe('fresh');
  });
});

describe('getAgingDays', () => {
  it('returns the correct whole-day count for a fixed now', () => {
    expect(getAgingDays(daysAgo(0), NOW)).toBe(0);
    expect(getAgingDays(daysAgo(7), NOW)).toBe(7);
    expect(getAgingDays(daysAgo(30), NOW)).toBe(30);
  });

  it('returns 0 for an invalid createdAt', () => {
    expect(getAgingDays(undefined, NOW)).toBe(0);
    expect(getAgingDays('not-a-date', NOW)).toBe(0);
  });
});

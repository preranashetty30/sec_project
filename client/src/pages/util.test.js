import { describe, expect, it } from 'vitest';
import { bestLevels, formatClock } from './util.js';

describe('bestLevels', () => {
  it('keeps the highest level per skill and skips not demonstrated', () => {
    expect(bestLevels([
      { skill: 'Python', level_awarded: 'beginner', percent: 95 },
      { skill: 'python', level_awarded: 'advanced', percent: 61 },
      { skill: 'SQL', level_awarded: 'not_demonstrated', percent: 20 },
    ])).toEqual([{ skill: 'python', level: 'advanced', percent: 61 }]);
  });
});

describe('formatClock', () => {
  it('formats and clamps', () => {
    expect(formatClock(20 * 60_000)).toBe('20:00');
    expect(formatClock(61_500)).toBe('01:02');
    expect(formatClock(-5)).toBe('00:00');
  });
});

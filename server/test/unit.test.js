import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://unused@localhost/unused';
const { awardLevel, publicQuestions } = await import('../src/services/assessment.js');
const { bestLevels } = await import('../src/services/report.js');

test('awardLevel boundaries', () => {
  assert.equal(awardLevel('advanced', 60), 'advanced');
  assert.equal(awardLevel('advanced', 59.9), 'intermediate');
  assert.equal(awardLevel('intermediate', 35), 'beginner');
  assert.equal(awardLevel('beginner', 50), 'not_demonstrated');
  assert.equal(awardLevel('advanced', 34.9), 'not_demonstrated');
});

test('publicQuestions strips answers and rubrics', () => {
  const q = publicQuestions([{ id: 'q1', type: 'mcq', prompt: 'p', options: [], answer_index: 2, explanation: 'e' }, { id: 'q2', type: 'short', prompt: 'p', rubric: 'r' }]);
  assert.deepEqual(q, [{ id: 'q1', type: 'mcq', prompt: 'p', options: [] }, { id: 'q2', type: 'short', prompt: 'p' }]);
});

test('bestLevels keeps highest level per skill, ignoring case', () => {
  const best = bestLevels([
    { skill: 'Python', level_awarded: 'beginner', percent: 90 },
    { skill: 'python', level_awarded: 'intermediate', percent: 61 },
    { skill: 'SQL', level_awarded: 'not_demonstrated', percent: 10 },
  ]);
  assert.deepEqual(best, [{ skill: 'python', level: 'intermediate', percent: 61 }]);
});

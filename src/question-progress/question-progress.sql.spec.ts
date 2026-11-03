import { upsertQuestionProgressSql } from './question-progress.sql';

describe('upsertQuestionProgressSql', () => {
  const sql = upsertQuestionProgressSql('(SELECT 1) ');

  it('upserts on the (userId, questionId) key', () => {
    expect(sql).toContain('INSERT INTO question_progress AS qp');
    expect(sql).toContain('ON CONFLICT ("userId", "questionId") DO UPDATE');
  });

  it('schedules from the configured intervals at the start of a study day (04:00 Tbilisi)', () => {
    expect(sql).toContain('ARRAY[1, 3, 7]::int[]');
    expect(sql).toContain(
      `((EXCLUDED."lastAnsweredAt" AT TIME ZONE 'Asia/Tbilisi') - interval '4 hours')::date`,
    );
    expect(sql).toContain(
      `::timestamp + interval '4 hours') AT TIME ZONE 'Asia/Tbilisi')`,
    );
  });

  it('advances only on a due review and resets on a wrong answer', () => {
    const box = sql.slice(
      sql.indexOf('box = CASE'),
      sql.indexOf('"dueAt" = CASE'),
    );
    expect(box).toContain('WHEN NOT EXCLUDED."lastResult" THEN 0');
    expect(box).toContain(
      'WHEN qp."dueAt" <= EXCLUDED."lastAnsweredAt" THEN qp.box + 1',
    );
    expect(box).toContain('ELSE qp.box');
  });

  it('sets reviews from the answer record on a wrong answer, within 1..3', () => {
    const reviews = sql.slice(
      sql.indexOf('"reviewsLeft" = CASE'),
      sql.indexOf('box = CASE'),
    );
    expect(reviews).toMatch(
      /WHEN NOT EXCLUDED\."lastResult" THEN LEAST\(GREATEST\(\s*3 - qp\."correctCount" \+ qp\."wrongCount" \+ 1, 1\s*\), 3\)/,
    );
    expect(reviews).toContain(
      'WHEN qp."dueAt" <= EXCLUDED."lastAnsweredAt" THEN GREATEST(qp."reviewsLeft" - 1, 0)',
    );
  });

  it('clears on the last review and keeps a wrong answer due now', () => {
    const due = sql.slice(
      sql.indexOf('"dueAt" = CASE'),
      sql.indexOf('"clearedAt" = CASE'),
    );
    expect(due).toContain(
      'WHEN NOT EXCLUDED."lastResult" THEN EXCLUDED."lastAnsweredAt"',
    );
    expect(due).toContain('CASE WHEN qp."reviewsLeft" <= 1 THEN NULL');
    expect(sql).toContain('[LEAST(qp.box + 1, 3)]');
  });

  it('has no leftover template placeholders', () => {
    expect(sql).not.toMatch(/\$\{/);
    expect(sql).not.toContain('undefined');
  });
});

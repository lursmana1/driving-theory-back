import { describe, expect, it } from '@jest/globals';
import type { Question } from '../questions/entities/question.entity';
import {
  missingQuestionIds,
  orderAttemptQuestions,
} from './attempt-questions.util';
import { toQuestionFromArchivedRow } from './archived-questions.query';

const q = (id: number, question = `q${id}`): Question =>
  ({ id, lang: 'ka', question }) as Question;

describe('missingQuestionIds', () => {
  it('returns ticket ids not found live, once each', () => {
    expect(missingQuestionIds([1, 2, 3, 2], [q(1)])).toEqual([2, 3]);
  });

  it('is empty when every id is live', () => {
    expect(missingQuestionIds([1, 2], [q(2), q(1)])).toEqual([]);
  });
});

describe('orderAttemptQuestions', () => {
  it('keeps ticket order and flags archived questions', () => {
    const result = orderAttemptQuestions([3, 1, 2], [q(1), q(2)], [q(3)]);
    expect(result.map((r) => [r.id, r.archived])).toEqual([
      [3, true],
      [1, false],
      [2, false],
    ]);
  });

  it('prefers the live row when an id is in both tables', () => {
    const [only] = orderAttemptQuestions([7], [q(7, 'live')], [q(7, 'old')]);
    expect(only.question).toBe('live');
    expect(only.archived).toBe(false);
  });

  it('drops ids found in neither table', () => {
    expect(orderAttemptQuestions([1, 99], [q(1)], []).map((r) => r.id)).toEqual(
      [1],
    );
  });
});

describe('toQuestionFromArchivedRow', () => {
  it('parses numeric columns that arrive as strings', () => {
    const row = toQuestionFromArchivedRow({
      id: '181',
      lang: 'ka',
      question: 'text',
      question_explained: null,
      hasImg: '1',
      correct_answer: '2',
      answer_1: 'a',
      answer_2: 'b',
      answer_3: null,
      answer_4: null,
      subject: null,
      categories: [1, 2],
      audio: null,
      ai_tutor: null,
      img: null,
    });
    expect(row.id).toBe(181);
    expect(row.hasImg).toBe(1);
    expect(row.subject).toBeNull();
    expect(row.categories).toEqual([1, 2]);
  });
});

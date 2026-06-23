import {
  DEFAULT_GEORGIAN_EXAM_RULE,
  GEORGIAN_EXAM_RULES_BY_CATEGORY,
  isExamPassed,
  resolveGeorgianExamRule,
} from './georgian-exam-rules.util';

describe('resolveGeorgianExamRule', () => {
  it('returns AM rules for category 0', () => {
    expect(resolveGeorgianExamRule({ categories: [0] })).toEqual({
      categoryId: 0,
      questionCount: 20,
      minCorrectToPass: 18,
    });
  });

  it('returns B rules for category 2', () => {
    expect(resolveGeorgianExamRule({ categories: [2] })).toEqual({
      categoryId: 2,
      questionCount: 30,
      minCorrectToPass: 25,
    });
  });

  it('returns C1 rules for category 4', () => {
    expect(resolveGeorgianExamRule({ categories: [4] })).toEqual({
      categoryId: 4,
      questionCount: 35,
      minCorrectToPass: 32,
    });
  });

  it('returns default A rules when no category is given', () => {
    expect(resolveGeorgianExamRule({})).toEqual({
      categoryId: null,
      ...DEFAULT_GEORGIAN_EXAM_RULE,
    });
  });

  it('scales pass threshold when count is overridden', () => {
    const rule = resolveGeorgianExamRule({ categories: [0], count: 10 });
    expect(rule.questionCount).toBe(10);
    expect(rule.minCorrectToPass).toBe(9);
  });
});

describe('isExamPassed', () => {
  it('passes at exact threshold', () => {
    expect(isExamPassed(18, 18)).toBe(true);
    expect(isExamPassed(17, 18)).toBe(false);
  });
});

describe('GEORGIAN_EXAM_RULES_BY_CATEGORY', () => {
  it('defines all 10 license categories', () => {
    expect(Object.keys(GEORGIAN_EXAM_RULES_BY_CATEGORY)).toHaveLength(10);
  });
});

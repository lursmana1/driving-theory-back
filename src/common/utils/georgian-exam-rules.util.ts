/**
 * Official Georgian driving theory exam rules (sa.gov.ge, 2026).
 * Category IDs match the app's categories table (0–9).
 */
export type GeorgianExamRule = {
  questionCount: number;
  minCorrectToPass: number;
};

/** Category id → exam ticket size and pass threshold. */
export const GEORGIAN_EXAM_RULES_BY_CATEGORY: Record<number, GeorgianExamRule> =
  {
    0: { questionCount: 20, minCorrectToPass: 18 }, // AM
    1: { questionCount: 30, minCorrectToPass: 27 }, // A (A1/A2 subcategories)
    2: { questionCount: 30, minCorrectToPass: 25 }, // B (B1 subcategory)
    3: { questionCount: 40, minCorrectToPass: 36 }, // C
    4: { questionCount: 35, minCorrectToPass: 32 }, // C1
    5: { questionCount: 40, minCorrectToPass: 36 }, // D
    6: { questionCount: 35, minCorrectToPass: 32 }, // D1
    7: { questionCount: 30, minCorrectToPass: 27 }, // Military
    8: { questionCount: 30, minCorrectToPass: 27 }, // Tram
    9: { questionCount: 30, minCorrectToPass: 27 }, // T / S
  };

/** Fallback when no category filter is provided (A-category rules). */
export const DEFAULT_GEORGIAN_EXAM_RULE: GeorgianExamRule = {
  questionCount: 30,
  minCorrectToPass: 27,
};

export type ResolveGeorgianExamRuleInput = {
  categories?: number[];
  count?: number;
};

export type ResolvedGeorgianExamRule = GeorgianExamRule & {
  categoryId: number | null;
};

export function resolveGeorgianExamRule(
  input: ResolveGeorgianExamRuleInput,
): ResolvedGeorgianExamRule {
  const categoryId = pickPrimaryCategoryId(input.categories);
  const base =
    categoryId != null
      ? (GEORGIAN_EXAM_RULES_BY_CATEGORY[categoryId] ??
        DEFAULT_GEORGIAN_EXAM_RULE)
      : DEFAULT_GEORGIAN_EXAM_RULE;

  if (input.count == null || input.count === base.questionCount) {
    return { ...base, categoryId };
  }

  const ratio = base.minCorrectToPass / base.questionCount;
  return {
    categoryId,
    questionCount: input.count,
    minCorrectToPass: Math.ceil(input.count * ratio),
  };
}

export function isExamPassed(
  correctCount: number,
  minCorrectToPass: number,
): boolean {
  return correctCount >= minCorrectToPass;
}

export class InsufficientQuestionsError extends Error {
  constructor(
    readonly available: number,
    readonly requiredCount: number,
  ) {
    super('Insufficient questions');
    this.name = 'InsufficientQuestionsError';
  }
}

/** Throws when the filtered pool cannot fill an exam ticket for the given rule. */
export function assertSufficientQuestionPool(
  available: number,
  rule: Pick<GeorgianExamRule, 'questionCount'>,
): void {
  if (available < rule.questionCount) {
    throw new InsufficientQuestionsError(available, rule.questionCount);
  }
}

function pickPrimaryCategoryId(
  categories: number[] | undefined,
): number | null {
  if (!categories?.length) return null;
  const valid = categories.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid[0];
}

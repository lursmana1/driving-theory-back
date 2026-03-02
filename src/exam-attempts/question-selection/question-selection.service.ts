import { Injectable } from '@nestjs/common';
import {
  MIN_ANSWERS_FOR_PERSONALIZATION,
  MIN_ANSWERS_FOR_FULL_PERSONALIZATION,
  DEFAULT_QUESTION_COUNT,
} from '../../common/constants/exam.constants.js';
import type { SelectionOptions } from './selection.types.js';
import { FULL_RATIOS, LIGHT_RATIOS } from './selection.types.js';
import { WeaknessService } from './weakness.service.js';
import { QuestionSamplingService } from './question-sampling.service.js';
import { DEFAULT_LANG } from '../../common/constants/lang.constants.js';

/**
 * Orchestrates question selection by level:
 * - Level 0 (<100 answers): 100% random
 * - Level 1 (100–499): mainly random (70/25/5)
 * - Level 2 (500+): full personalization (50/40/10)
 */
@Injectable()
export class QuestionSelectionService {
  constructor(
    private readonly weaknessService: WeaknessService,
    private readonly samplingService: QuestionSamplingService,
  ) {}

  async selectQuestions(options: SelectionOptions): Promise<number[]> {
    const count = options.count ?? DEFAULT_QUESTION_COUNT;
    const lang = options.lang ?? DEFAULT_LANG;
    const match = this.samplingService.buildMatchFilter(
      lang,
      options.subjects,
      options.categories,
      options.allSubjects,
    );

    const totalAnswers = await this.weaknessService.getTotalAnswerCount(options.userId);

    if (totalAnswers < MIN_ANSWERS_FOR_PERSONALIZATION) {
      const ids = await this.samplingService.sampleRandom(match, count);
      return this.shuffle(ids);
    }

    const weakness = await this.weaknessService.getWeaknessIds(options.userId);
    const ratios = totalAnswers >= MIN_ANSWERS_FOR_FULL_PERSONALIZATION ? FULL_RATIOS : LIGHT_RATIOS;

    let ids = await this.samplingService.sampleWeighted(match, count, weakness, ratios);

    if (ids.length < count) {
      const extra = await this.samplingService.sampleRandom(match, count - ids.length, ids);
      ids = [...ids, ...extra];
    }

    return this.shuffle(ids);
  }

  private shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

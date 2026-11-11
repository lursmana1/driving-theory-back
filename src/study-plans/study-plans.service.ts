import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDY_PLAN_RECOMMENDED_MIN_DAYS,
  STUDY_PLAN_SCHEDULE_CACHE_MAX,
  STUDY_PLAN_TARGET_MINUTES,
} from '../common/constants/study-plan.constants.js';
import { resolveGeorgianExamRule } from '../common/utils/georgian-exam-rules.util.js';
import {
  buildDaySession,
  daySessionSeed,
  olderQuestionIds,
} from './schedule/day-session.util.js';
import {
  isStudyDay,
  resolvePlanLength,
  studyDayOf,
} from './schedule/plan-length.util.js';
import {
  buildSchedule,
  daysForTargetMinutes,
} from './schedule/schedule.builder.util.js';
import { PlanCardsService } from './plan-cards.service.js';
import type { PlanSubjects } from './schedule/plan-subjects.util.js';
import { StudyPlansQueryService } from './study-plans.query.service.js';
import type {
  PlanDay,
  PlanDaySession,
  PlanLesson,
  PlanQuery,
  PlanSchedule,
  PreviewDay,
  PreviewLesson,
  StudyPlanPreview,
  SubjectQuestions,
} from './study-plans.types.js';

function examQuestionCount(categoryId: number): number {
  return resolveGeorgianExamRule({ categories: [categoryId] }).questionCount;
}

function toPreviewLesson({
  questionIds,
  cardIds,
  restIds,
  ...lesson
}: PlanLesson): PreviewLesson {
  return {
    ...lesson,
    questionCount: questionIds.length,
    cardCount: cardIds.length,
  };
}

function toPreviewDay({ carryIds, optionalIds, ...day }: PlanDay): PreviewDay {
  return { ...day, lessons: day.lessons.map(toPreviewLesson) };
}

/**
 * Study plan, public and read-only. The plan is a pure function of
 * (category questions, day count, start day), so the same input always
 * gives the same lessons.
 */
@Injectable()
export class StudyPlansService {
  /**
   * Built schedules per question list, keyed `<dayCount>|<startDay>`. The
   * question list is the query service's cached array, so when that entry
   * expires its schedules are garbage-collected with it; each list keeps at
   * most `STUDY_PLAN_SCHEDULE_CACHE_MAX` (oldest dropped first). Schedules
   * are shared between requests: never mutate one.
   */
  private readonly schedules = new WeakMap<
    readonly SubjectQuestions[],
    Map<string, PlanSchedule>
  >();

  /** Per question list (same lifetime as `schedules`): `daysForTargetMinutes`. */
  private readonly targetDays = new WeakMap<
    readonly SubjectQuestions[],
    number | null
  >();

  constructor(
    private readonly queries: StudyPlansQueryService,
    private readonly cards: PlanCardsService,
  ) {}

  private async schedule(
    query: PlanQuery,
    now: Date,
  ): Promise<{
    schedule: PlanSchedule;
    input: PlanSubjects;
    startDay: string;
    examDay: string | null;
  }> {
    if (query.days == null && !query.examDay) {
      throw new BadRequestException('days or examDay is required');
    }
    if (query.examDay && !isStudyDay(query.examDay)) {
      throw new BadRequestException('examDay is not a valid date');
    }
    const startDay = studyDayOf(now);
    const length = resolvePlanLength(query, startDay);
    if (!length.ok) {
      throw new BadRequestException({
        message: 'Plan length out of range',
        reason: length.reason,
      });
    }
    const input = await this.cards.loadPlanSubjects(query.categoryId);
    const { subjects } = input;
    if (subjects.length === 0) {
      throw new NotFoundException(
        `No questions for category ${query.categoryId}`,
      );
    }
    const schedule = this.cachedSchedule(
      subjects,
      query.categoryId,
      length.dayCount,
      startDay,
    );
    return { schedule, input, startDay, examDay: length.examDay };
  }

  private cachedSchedule(
    subjects: readonly SubjectQuestions[],
    categoryId: number,
    dayCount: number,
    startDay: string,
  ): PlanSchedule {
    let byInput = this.schedules.get(subjects);
    if (!byInput) {
      byInput = new Map();
      this.schedules.set(subjects, byInput);
    }
    const key = `${dayCount}|${startDay}`;
    let schedule = byInput.get(key);
    if (!schedule) {
      schedule = buildSchedule({
        subjects,
        dayCount,
        startDay,
        examQuestionCount: examQuestionCount(categoryId),
      });
      if (byInput.size >= STUDY_PLAN_SCHEDULE_CACHE_MAX) {
        const oldest = byInput.keys().next();
        if (!oldest.done) byInput.delete(oldest.value);
      }
      byInput.set(key, schedule);
    }
    return schedule;
  }

  async getPreview(
    query: PlanQuery,
    now = new Date(),
  ): Promise<StudyPlanPreview> {
    const { schedule, input, startDay, examDay } = await this.schedule(
      query,
      now,
    );
    let targetDays = this.targetDays.get(input.subjects);
    if (targetDays === undefined) {
      targetDays = daysForTargetMinutes(
        input.subjects,
        examQuestionCount(query.categoryId),
        STUDY_PLAN_TARGET_MINUTES,
      );
      this.targetDays.set(input.subjects, targetDays);
    }
    return {
      ...schedule,
      categoryId: query.categoryId,
      startDay,
      examDay,
      intensive: schedule.dayCount < STUDY_PLAN_RECOMMENDED_MIN_DAYS,
      daysForTargetMinutes: targetDays,
      targetMinutes: STUDY_PLAN_TARGET_MINUTES,
      days: schedule.days.map(toPreviewDay),
    };
  }

  /** One day with the question ids of every step and the full questions. */
  async getDay(
    query: PlanQuery,
    index: number,
    lang: string,
    now = new Date(),
  ): Promise<PlanDaySession> {
    const { schedule, input } = await this.schedule(query, now);
    const day = schedule.days[index];
    if (!day) throw new NotFoundException(`Day ${index} not in this plan`);
    const steps = buildDaySession(
      day,
      daySessionSeed(query.categoryId, schedule.dayCount, index),
      day.steps.some((s) => s.examParts?.older)
        ? olderQuestionIds(schedule.days, index)
        : [],
    );
    const ids = [...new Set(steps.flatMap((s) => s.questionIds))];
    const [questions, cards] = await Promise.all([
      this.queries.loadQuestions(ids, lang),
      this.cards.loadLessonCards(day.lessons, input, lang),
    ]);
    return {
      ...toPreviewDay(day),
      categoryId: query.categoryId,
      dayCount: schedule.dayCount,
      steps,
      cards,
      questions,
    };
  }
}

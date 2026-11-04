import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDY_PLAN_RECOMMENDED_MIN_DAYS,
  STUDY_PLAN_SCHEDULE_CACHE_MAX,
} from '../common/constants/study-plan.constants.js';
import { resolveGeorgianExamRule } from '../common/utils/georgian-exam-rules.util.js';
import {
  buildDaySession,
  daySessionSeed,
} from './schedule/day-session.util.js';
import {
  isStudyDay,
  resolvePlanLength,
  studyDayOf,
} from './schedule/plan-length.util.js';
import { buildSchedule } from './schedule/schedule.builder.util.js';
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

function toPreviewLesson({
  questionIds,
  ...lesson
}: PlanLesson): PreviewLesson {
  return { ...lesson, questionCount: questionIds.length };
}

function toPreviewDay(day: PlanDay): PreviewDay {
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

  constructor(private readonly queries: StudyPlansQueryService) {}

  private async schedule(
    query: PlanQuery,
    now: Date,
  ): Promise<{
    schedule: PlanSchedule;
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
    const subjects = await this.queries.loadSubjectQuestions(query.categoryId);
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
    return { schedule, startDay, examDay: length.examDay };
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
        examQuestionCount: resolveGeorgianExamRule({ categories: [categoryId] })
          .questionCount,
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
    const { schedule, startDay, examDay } = await this.schedule(query, now);
    return {
      ...schedule,
      categoryId: query.categoryId,
      startDay,
      examDay,
      intensive: schedule.dayCount < STUDY_PLAN_RECOMMENDED_MIN_DAYS,
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
    const { schedule } = await this.schedule(query, now);
    const day = schedule.days[index];
    if (!day) throw new NotFoundException(`Day ${index} not in this plan`);
    const steps = buildDaySession(
      day,
      daySessionSeed(query.categoryId, schedule.dayCount, index),
    );
    const ids = [...new Set(steps.flatMap((s) => s.questionIds))];
    const questions = await this.queries.loadQuestions(ids, lang);
    return {
      ...toPreviewDay(day),
      categoryId: query.categoryId,
      dayCount: schedule.dayCount,
      steps,
      questions,
    };
  }
}

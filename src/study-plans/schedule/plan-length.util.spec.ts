import {
  addStudyDays,
  isStudyDay,
  resolvePlanLength,
  studyDayOf,
  studyDaysBetween,
} from './plan-length.util';

describe('plan length', () => {
  it('a study day starts at 04:00 Tbilisi (00:00 UTC)', () => {
    // 23:30 Tbilisi = 19:30 UTC, same day
    expect(studyDayOf(new Date('2026-11-04T19:30:00Z'))).toBe('2026-11-04');
    // 01:30 Tbilisi next day = 21:30 UTC: still the 4th
    expect(studyDayOf(new Date('2026-11-04T21:30:00Z'))).toBe('2026-11-04');
    // 04:00 Tbilisi = 00:00 UTC: the 5th
    expect(studyDayOf(new Date('2026-11-05T00:00:00Z'))).toBe('2026-11-05');
  });

  it('adds and counts days across months', () => {
    expect(addStudyDays('2026-11-29', 3)).toBe('2026-12-02');
    expect(studyDaysBetween('2026-11-29', '2026-12-02')).toBe(3);
  });

  it('validates calendar dates', () => {
    expect(isStudyDay('2026-02-28')).toBe(true);
    expect(isStudyDay('2026-02-30')).toBe(false);
    expect(isStudyDay('2026-2-1')).toBe(false);
  });

  it('exam date: days before the exam, 3..60', () => {
    const today = '2026-11-04';
    expect(resolvePlanLength({ examDay: '2026-11-18' }, today)).toEqual({
      ok: true,
      dayCount: 14,
      examDay: '2026-11-18',
    });
    expect(resolvePlanLength({ examDay: '2026-11-06' }, today)).toEqual({
      ok: false,
      reason: 'too-soon',
    });
    expect(resolvePlanLength({ examDay: '2027-02-01' }, today)).toEqual({
      ok: false,
      reason: 'too-far',
    });
  });

  it('preset days when there is no exam date; exam date wins', () => {
    expect(resolvePlanLength({ days: 7 }, '2026-11-04')).toEqual({
      ok: true,
      dayCount: 7,
      examDay: null,
    });
    expect(
      resolvePlanLength({ days: 28, examDay: '2026-11-14' }, '2026-11-04'),
    ).toMatchObject({ dayCount: 10 });
  });
});

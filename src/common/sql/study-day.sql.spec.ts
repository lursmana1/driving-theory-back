import { studyDaySql, studyDayStartSql } from './study-day.sql';

describe('study day SQL', () => {
  it('shifts the Tbilisi day back by the start hour', () => {
    expect(studyDaySql('now()')).toBe(
      "((now() AT TIME ZONE 'Asia/Tbilisi') - interval '4 hours')::date",
    );
  });

  it('starts a study day at 04:00 Tbilisi', () => {
    expect(studyDayStartSql('d.day')).toBe(
      "(((d.day)::timestamp + interval '4 hours') AT TIME ZONE 'Asia/Tbilisi')",
    );
  });
});

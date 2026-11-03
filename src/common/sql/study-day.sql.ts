import {
  STUDY_DAY_START_HOUR,
  STUDY_TIME_ZONE,
} from '../constants/question-progress.constants';

/*
 * SQL for the study day: the Tbilisi calendar day shifted back by
 * STUDY_DAY_START_HOUR, so 01:30 still belongs to the day before.
 *
 * Arguments are fixed SQL expressions from code (column names, `now()`),
 * never request values.
 */

const ZONE_SQL = `'${STUDY_TIME_ZONE}'`;
const SHIFT_SQL = `interval '${STUDY_DAY_START_HOUR} hours'`;

/** `date` of the study day that the timestamptz `tsSql` falls in. */
export function studyDaySql(tsSql: string): string {
  return `((${tsSql} AT TIME ZONE ${ZONE_SQL}) - ${SHIFT_SQL})::date`;
}

/** timestamptz at which the study day `dateSql` (a `date`) begins. */
export function studyDayStartSql(dateSql: string): string {
  return `(((${dateSql})::timestamp + ${SHIFT_SQL}) AT TIME ZONE ${ZONE_SQL})`;
}

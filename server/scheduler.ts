import { DateTime } from 'luxon';
import { all, db, one, parse, run } from './db';
import { createSession, permitted, canReadEdition } from './library';
import { routineSchema, type Routine, type Preferences } from './types';
export function wallTime(date: string, time: string, zone: string): DateTime {
  const [hour, minute] = time.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  let candidate = DateTime.fromObject({ year, month, day, hour, minute }, { zone });
  if (!candidate.isValid) throw Error('Invalid IANA timezone');
  // Gaps move to the next valid minute; repeated times choose the first occurrence.
  if (candidate.hour !== hour || candidate.minute !== minute) {
    const naive = DateTime.fromObject({ year, month, day, hour, minute }, { zone: 'UTC' });
    for (let i = 1; i <= 180; i++) {
      const n = naive.plus({ minutes: i });
      const c = DateTime.fromObject(
        { year: n.year, month: n.month, day: n.day, hour: n.hour, minute: n.minute },
        { zone },
      );
      if (c.hour === n.hour && c.minute === n.minute) {
        candidate = c;
        break;
      }
    }
  }
  return candidate.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0];
}
export function validateRoutine(input: unknown) {
  const config = routineSchema.parse(input);
  if (!DateTime.now().setZone(config.timezone).isValid)
    throw Error('Choose a valid IANA timezone.');
  if (config.mode === 'book' && !config.bookId) throw Error('Choose a book.');
  if (
    config.mode === 'journey' &&
    !['career', 'organizations', 'judgment'].includes(config.journey)
  )
    throw Error('Choose a journey.');
  return config;
}
export function materialize(r: any, now = new Date()) {
  if (r.paused) return;
  const c = parse<Routine>(r.config);
  const local = DateTime.fromJSDate(now, { zone: c.timezone });
  for (let d = 0; d < 8; d++) {
    const day = local.startOf('day').plus({ days: d });
    if (!c.weekdays.includes(day.weekday)) continue;
    const date = day.toISODate()!;
    const at = wallTime(date, c.time, c.timezone);
    if (at.toMillis() < now.getTime() - 86400000) continue;
    const id = `${r.id}:${r.revision}:${date}T${c.time}`;
    run(
      'INSERT OR IGNORE INTO occurrences(id,routine_id,user_id,revision,scheduled_at,local_time,updated_at) VALUES(?,?,?,?,?,?,?)',
      id,
      r.id,
      r.user_id,
      r.revision,
      at.toUTC().toISO(),
      `${date} ${c.time} ${c.timezone}${at.toFormat('HH:mm') !== c.time ? ' → ' + at.toFormat('HH:mm') + ' (DST adjustment)' : ''}`,
      now.toISOString(),
    );
  }
}
export function invalidateRoutine(id: string, revision: number, now = new Date()) {
  run(
    "UPDATE occurrences SET status='cancelled',updated_at=? WHERE routine_id=? AND revision<? AND status IN ('pending','preparing','ready','failed') AND scheduled_at>?",
    now.toISOString(),
    id,
    revision,
    now.toISOString(),
  );
}
export function schedulerTick(now = new Date()) {
  const result = { prepared: 0, failed: 0, skipped: 0 };
  for (const r of all<any>('SELECT * FROM routines WHERE paused=0')) materialize(r, now);
  run(
    "UPDATE occurrences SET status='pending',error='Worker lease expired; retry scheduled' WHERE status='preparing' AND updated_at<?",
    new Date(now.getTime() - 300000).toISOString(),
  );
  const stale = run(
    "UPDATE occurrences SET status='skipped',error='Outside 24-hour catch-up window',updated_at=? WHERE status IN ('pending','failed') AND scheduled_at<?",
    now.toISOString(),
    new Date(now.getTime() - 86400000).toISOString(),
  );
  result.skipped = Number(stale.changes);
  const due = all<any>(
    `SELECT o.*,r.config,r.paused,r.revision AS current_revision,u.preferences FROM occurrences o JOIN routines r ON r.id=o.routine_id JOIN users u ON u.id=o.user_id WHERE o.status IN ('pending','failed') AND o.scheduled_at<=? AND (o.retry_at IS NULL OR o.retry_at<=?) AND o.retries<3 AND r.paused=0 AND o.revision=r.revision ORDER BY o.scheduled_at LIMIT 10`,
    new Date(now.getTime() + 3600000).toISOString(),
    now.toISOString(),
  );
  for (const o of due) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const claimed = run(
        "UPDATE occurrences SET status='preparing',updated_at=? WHERE id=? AND status IN ('pending','failed')",
        now.toISOString(),
        o.id,
      );
      if (!claimed.changes) {
        db.exec('COMMIT');
        continue;
      }
      const c = parse<Routine>(o.config);
      const p = {
        ...parse<Preferences>(o.preferences),
        minutes: c.minutes,
        mode: c.mode === 'journey' ? 'topic' : c.mode,
        depth: c.depth,
        discovery: c.discovery,
        bookId: c.bookId,
      };
      const session = createSession(o.user_id, p, {
        bookId: c.mode === 'book' ? c.bookId : undefined,
        topic: c.mode === 'topic' ? c.topic : undefined,
        journey: c.mode === 'journey' ? c.journey : undefined,
        occurrenceId: o.id,
      });
      run(
        "UPDATE occurrences SET status='ready',session_id=?,error=NULL,updated_at=? WHERE id=?",
        session.id,
        now.toISOString(),
        o.id,
      );
      run(
        "INSERT OR IGNORE INTO notifications(occurrence_id,status) VALUES(?,'in-app-ready')",
        o.id,
      );
      db.exec('COMMIT');
      result.prepared++;
    } catch (e) {
      db.exec('ROLLBACK');
      run(
        "UPDATE occurrences SET status='failed',retries=retries+1,retry_at=?,error=?,updated_at=? WHERE id=?",
        new Date(now.getTime() + Math.pow(2, o.retries) * 60000).toISOString(),
        String(e instanceof Error ? e.message : e),
        now.toISOString(),
        o.id,
      );
      result.failed++;
    }
  }
  // Rights are checked again on every request; revoked ready occurrences are not delivered.
  for (const o of all<any>(
    "SELECT o.id,s.manifest,u.preferences FROM occurrences o JOIN sessions s ON s.id=o.session_id JOIN users u ON u.id=o.user_id WHERE o.status='ready'",
  )) {
    if (!canReadEdition(parse(o.manifest).editionId, parse(o.preferences).territory, now))
      run(
        "UPDATE occurrences SET status='failed',error='Rights unavailable; delivery blocked',retries=3 WHERE id=?",
        o.id,
      );
  }
  run(
    "DELETE FROM users WHERE kind='guest' AND created_at<?",
    new Date(now.getTime() - 7 * 86400000).toISOString(),
  );
  run(
    'INSERT INTO worker_status VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat,last_result=excluded.last_result',
    now.toISOString(),
    JSON.stringify(result),
  );
  return result;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'reading-tests-')), 'test.sqlite');
const { all, one, run, parse } = await import('../server/db');
const { defaults } = await import('../server/types');
await import('../server/seed');
const { createSession, rank, sessionView, sourceContext, permitted } = await import(
  '../server/library'
);
const { wallTime, materialize, schedulerTick, invalidateRoutine, validateRoutine } = await import(
  '../server/scheduler'
);
function user(topics = ['Learning'], other: any = {}) {
  const id = randomUUID();
  const p = { ...defaults, territory: 'US' as const, timezone: 'UTC', topics, ...other };
  run(
    'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
    id,
    id + '@test.example',
    'unused',
    'account',
    new Date().toISOString(),
    JSON.stringify(p),
    0,
  );
  return { id, p };
}
function routine(u: any, config: any = {}, now = new Date()) {
  const id = randomUUID();
  const c = {
    name: 'Test reading',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    time: '12:00',
    timezone: 'UTC',
    minutes: 5,
    mode: 'topic',
    bookId: '',
    topic: 'Learning',
    journey: '',
    depth: 'balanced',
    discovery: 15,
    travel: 'home',
    notification: 'in-app',
    ...config,
  };
  run('INSERT INTO routines(id,user_id,config) VALUES(?,?,?)', id, u.id, JSON.stringify(c));
  const r = one<any>('SELECT * FROM routines WHERE id=?', id);
  materialize(r, now);
  return r;
}
test('three editions have verified hashes, embedded attribution and full licenses', () => {
  const e = all<any>('SELECT * FROM editions');
  assert.equal(e.length, 3);
  for (const source of e) {
    assert.equal(createHash('sha256').update(source.source_text).digest('hex'), source.hash);
    assert.match(source.source_text, /Project Gutenberg/);
    assert.match(source.source_text, /FULL LICENSE|Full Project Gutenberg/);
    assert.equal(parse(source.metadata).territory, 'US');
  }
});
test('ten substantive prepared sessions use exact stored spans and resolving context', () => {
  const u = user();
  const ts = all<any>('SELECT * FROM templates');
  assert.equal(ts.length, 10);
  for (const t of ts) {
    const s = createSession(u.id, u.p, { templateId: t.id, review: true });
    const original = s.blocks.find((b: any) => b.type === 'original')!;
    const span = one<any>('SELECT * FROM source_spans WHERE id=?', original.spanId);
    const source = one<any>('SELECT source_text FROM editions WHERE id=?', span.edition_id);
    assert.equal(original.text, source.source_text.slice(span.start_offset, span.end_offset));
    assert.ok(original.text.split(/\s+/).length >= 600);
    assert.equal(sourceContext(original.spanId, 'US').exact, original.text);
    assert.equal(s.manifest.model, null);
    assert.ok(s.blocks.every((b: any) => b.type !== 'visual' || b.nodes?.length === 3));
  }
});
test('contrasting profiles rank different source-faithful selections', () => {
  const a = user(['Learning', 'Craft']),
    b = user(['Strategy', 'History']);
  const sa = createSession(a.id, a.p),
    sb = createSession(b.id, b.p);
  assert.notEqual(sa.template_id, sb.template_id);
  assert.equal(sa.book.id, 'franklin');
  assert.equal(sb.book.id, 'napoleon');
  assert.match(sa.reason, /Learning/);
  assert.match(sb.reason, /Strategy|History/);
});
test('hard filters honor exclusions, territory, explicit books, and unknown uses', () => {
  const u = user(['Learning'], { excluded: ['franklin'] });
  assert.ok(rank(u.id, u.p).every((t) => t.edition_id !== 'franklin'));
  assert.equal(rank(u.id, { ...u.p, territory: 'unconfirmed' }).length, 0);
  assert.ok(rank(u.id, u.p, { bookId: 'carnegie' }).every((t) => t.edition_id === 'carnegie'));
  assert.equal(permitted('franklin', 'notDeclared', 'US'), false);
});
test('rights revocation and expiry deny cached edition and source access', () => {
  const u = user();
  const s = createSession(u.id, u.p);
  const stored = one<any>('SELECT * FROM sessions WHERE id=?', s.id)!;
  const original = one<any>('SELECT * FROM rights WHERE edition_id=?', s.book.id)!;
  run("UPDATE rights SET status='blocked' WHERE edition_id=?", s.book.id);
  assert.throws(() => sessionView(stored, 'US'), /rights/);
  assert.throws(
    () => sourceContext(s.blocks.find((b: any) => b.type === 'original')!.spanId!, 'US'),
    /rights/,
  );
  run(
    "UPDATE rights SET status='allowed',expires_at='2000-01-01T00:00:00Z' WHERE edition_id=?",
    s.book.id,
  );
  assert.throws(() => sessionView(stored, 'US'));
  run(
    'UPDATE rights SET status=?,expires_at=? WHERE edition_id=?',
    original.status,
    original.expires_at,
    s.book.id,
  );
  assert.equal(sessionView(stored, 'US').id, s.id);
});
test('DST gap advances to the next valid minute and repeated local time delivers once', () => {
  assert.equal(
    wallTime('2026-03-08', '02:30', 'America/New_York').toUTC().toISO(),
    '2026-03-08T07:00:00.000Z',
  );
  assert.equal(
    wallTime('2026-11-01', '01:30', 'America/New_York').toUTC().toISO(),
    '2026-11-01T05:30:00.000Z',
  );
  const u = user();
  const r = routine(
    u,
    { timezone: 'America/New_York', time: '01:30', weekdays: [7] },
    new Date('2026-11-01T04:00:00Z'),
  );
  materialize(r, new Date('2026-11-01T04:00:00Z'));
  assert.equal(
    one<any>(
      "SELECT COUNT(*) AS n FROM occurrences WHERE routine_id=? AND local_time LIKE '2026-11-01%'",
      r.id,
    )!.n,
    1,
  );
});
test('scheduler prepares while logged out and retries cannot duplicate an edition or notification', () => {
  const now = new Date('2026-10-09T11:30:00Z');
  const u = user();
  const r = routine(u, {}, now);
  schedulerTick(now);
  const o = one<any>(
    "SELECT * FROM occurrences WHERE routine_id=? AND local_time LIKE '2026-10-09%'",
    r.id,
  )!;
  assert.equal(o.status, 'ready');
  schedulerTick(now);
  assert.equal(one<any>('SELECT COUNT(*) AS n FROM sessions WHERE occurrence_id=?', o.id)!.n, 1);
  assert.equal(
    one<any>('SELECT COUNT(*) AS n FROM notifications WHERE occurrence_id=?', o.id)!.n,
    1,
  );
  assert.equal(
    one<any>('SELECT status FROM notifications WHERE occurrence_id=?', o.id)!.status,
    'in-app-ready',
  );
  run("UPDATE occurrences SET status='pending' WHERE id=?", o.id);
  schedulerTick(now);
  assert.equal(one<any>('SELECT COUNT(*) AS n FROM sessions WHERE occurrence_id=?', o.id)!.n, 1);
});
test('routine revision invalidates obsolete jobs, pause and delete prevent new delivery', () => {
  const now = new Date('2026-10-09T11:00:00Z');
  const u = user();
  const r = routine(u, {}, now);
  run('UPDATE routines SET revision=2,paused=1 WHERE id=?', r.id);
  invalidateRoutine(r.id, 2, now);
  assert.equal(
    all<any>("SELECT * FROM occurrences WHERE routine_id=? AND status='pending'", r.id).length,
    0,
  );
  schedulerTick(now);
  assert.equal(all<any>('SELECT * FROM sessions WHERE user_id=?', u.id).length, 0);
  run('DELETE FROM routines WHERE id=?', r.id);
  assert.equal(all<any>('SELECT * FROM occurrences WHERE routine_id=?', r.id).length, 0);
});
test('generation failures retain visible retries with backoff and bounded outage catch-up', () => {
  const now = new Date('2026-10-09T11:30:00Z');
  const u = user(['Learning'], { territory: 'unconfirmed' });
  const r = routine(u, {}, now);
  schedulerTick(now);
  const o = one<any>(
    "SELECT * FROM occurrences WHERE routine_id=? AND local_time LIKE '2026-10-09%'",
    r.id,
  )!;
  assert.equal(o.status, 'failed');
  assert.equal(o.retries, 1);
  assert.equal(o.retry_at, '2026-10-09T11:31:00.000Z');
  schedulerTick(now);
  assert.equal(one<any>('SELECT retries FROM occurrences WHERE id=?', o.id)!.retries, 1);
  run("UPDATE occurrences SET scheduled_at='2026-10-01T12:00:00Z' WHERE id=?", o.id);
  schedulerTick(now);
  assert.equal(one<any>('SELECT status FROM occurrences WHERE id=?', o.id)!.status, 'skipped');
});
test('routine validation rejects unknown timezones and enforces duration limits', () => {
  assert.throws(() =>
    validateRoutine({
      name: 'Bad',
      weekdays: [1],
      time: '08:00',
      timezone: 'Unknown/Place',
      minutes: 15,
      mode: 'topic',
    }),
  );
  assert.throws(() =>
    validateRoutine({
      name: 'Bad',
      weekdays: [1],
      time: '08:00',
      timezone: 'UTC',
      minutes: 120,
      mode: 'topic',
    }),
  );
});
test('account deletion cascades private state', () => {
  const u = user();
  const s = createSession(u.id, u.p);
  run(
    'INSERT INTO notes VALUES(?,?,?,?,?,?)',
    randomUUID(),
    u.id,
    s.id,
    s.blocks.find((b: any) => b.type === 'original')!.spanId,
    'private',
    new Date().toISOString(),
  );
  routine(u);
  run('DELETE FROM users WHERE id=?', u.id);
  for (const table of ['notes', 'sessions', 'routines', 'occurrences', 'events'])
    assert.equal(one<any>(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`, u.id)!.n, 0);
});
test('single-book progression uses chronological unopened spans and avoids overlap', () => {
  const u = user(['Community']);
  const a = createSession(u.id, u.p, { bookId: 'franklin' });
  const b = createSession(u.id, u.p, { bookId: 'franklin' });
  assert.equal(a.template_id, 'f-reading');
  assert.equal(b.template_id, 'f-junto');
  assert.ok(a.manifest.coverage.end <= b.manifest.coverage.start);
});
test('usage manifest records real latency and no invented model costs', () => {
  const u = user();
  const s = createSession(u.id, u.p);
  assert.ok(s.manifest.generationLatencyMs >= 0);
  assert.equal(s.manifest.tokenUsage, 0);
  assert.equal(s.manifest.cost, null);
});
test('unknown permission for summaries prevents assembly even when display is allowed', () => {
  const u = user();
  const r = one<any>('SELECT * FROM rights WHERE edition_id=?', 'franklin')!;
  const uses = parse(r.uses);
  delete uses.summaries;
  run('UPDATE rights SET uses=? WHERE edition_id=?', JSON.stringify(uses), 'franklin');
  assert.equal(rank(u.id, u.p, { bookId: 'franklin' }).length, 0);
  run('UPDATE rights SET uses=? WHERE edition_id=?', r.uses, 'franklin');
});
test('explicit topic change takes priority over active book continuity', () => {
  const u = user(['Learning']);
  const s = createSession(u.id, u.p);
  run("UPDATE sessions SET status='in-progress' WHERE id=?", s.id);
  const next = createSession(u.id, u.p, { topic: 'Strategy' });
  assert.equal(next.book.id, 'napoleon');
  assert.match(next.reason, /Strategy/);
  assert.equal(one<any>('SELECT id FROM sessions WHERE id=?', s.id)!.id, s.id);
});
test('revoking an individual adaptation grant blocks a cached adaptive edition', () => {
  const u = user();
  const s = createSession(u.id, u.p);
  const r = one<any>('SELECT * FROM rights WHERE edition_id=?', s.book.id)!;
  const uses = parse(r.uses);
  uses.adaptation = false;
  run('UPDATE rights SET uses=? WHERE edition_id=?', JSON.stringify(uses), s.book.id);
  assert.throws(() => sessionView(one<any>('SELECT * FROM sessions WHERE id=?', s.id)!, 'US'));
  run('UPDATE rights SET uses=? WHERE edition_id=?', r.uses, s.book.id);
});

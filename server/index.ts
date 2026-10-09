import express from 'express';
import { createServer as createViteServer } from 'vite';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import './seed';
import { all, one, run, parse, db } from './db';
import { defaults, preferencesSchema, weights } from './types';
import { catalog, createSession, sessionView, sourceContext, permitted, rank } from './library';
import {
  guest,
  hash,
  issueCookie,
  limitAuth,
  passwordHash,
  passwordMatches,
  publicUser,
  requireUser,
  user,
} from './auth';
import { invalidateRoutine, materialize, schedulerTick, validateRoutine } from './scheduler';
import { DateTime } from 'luxon';
import { limits } from './config';
import { groundedModel, modelStatus } from './model';
const app = express();
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (req.headers.origin !== expected) {
        res.status(403).json({ error: 'Cross-origin request rejected.' });
        return;
      }
    }
  }
  next();
});
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    storage: 'SQLite on server',
    worker: one('SELECT * FROM worker_status WHERE id=1') || null,
    model: modelStatus().message,
    notifications: 'in-app only; delivery provider disconnected',
  }),
);
app.get('/api/me', (req, res) => {
  const u = user(req);
  res.json({
    user: u ? publicUser(u) : null,
    defaults,
    capabilities: {
      model: modelStatus().connected,
      email: false,
      push: false,
      privateUploads: false,
    },
    weights,
  });
});
app.post('/api/guest', limitAuth, (req, res) => {
  res.json({ user: publicUser(guest(req, res)) });
});
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(200),
});
app.post('/api/register', limitAuth, (req, res) => {
  const c = credentials.parse(req.body);
  if (one('SELECT id FROM users WHERE email=?', c.email))
    throw Error('This email is already registered.');
  if (
    process.env.ADMIN_EMAIL?.toLowerCase() === c.email &&
    (!process.env.ADMIN_BOOTSTRAP_PASSWORD ||
      hash(c.password) !== hash(process.env.ADMIN_BOOTSTRAP_PASSWORD))
  )
    throw Error('This address is reserved for the configured administrator.');
  const current = user(req);
  const id = current?.kind === 'guest' ? current.id : randomUUID();
  const admin =
    !!process.env.ADMIN_EMAIL &&
    !!process.env.ADMIN_BOOTSTRAP_PASSWORD &&
    c.email === process.env.ADMIN_EMAIL.toLowerCase() &&
    hash(c.password) === hash(process.env.ADMIN_BOOTSTRAP_PASSWORD);
  if (current?.kind === 'guest')
    run(
      "UPDATE users SET email=?,password=?,kind='account',admin=? WHERE id=?",
      c.email,
      passwordHash(c.password),
      Number(admin),
      id,
    );
  else
    run(
      'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
      id,
      c.email,
      passwordHash(c.password),
      'account',
      new Date().toISOString(),
      JSON.stringify(defaults),
      Number(admin),
    );
  issueCookie(req, res, id);
  res.status(201).json({ user: publicUser(one('SELECT * FROM users WHERE id=?', id)) });
});
app.post('/api/login', limitAuth, (req, res) => {
  const c = credentials.parse(req.body);
  const u = one<any>('SELECT * FROM users WHERE email=?', c.email);
  if (!u || !passwordMatches(c.password, u.password)) {
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  issueCookie(req, res, u.id);
  res.json({ user: publicUser(u) });
});
app.post('/api/logout', (req, res) => {
  const token = req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('reading_auth='))
    ?.slice(13);
  if (token) run('DELETE FROM auth WHERE token_hash=?', hash(token));
  res.clearCookie('reading_auth', { path: '/' });
  res.json({ ok: true });
});
app.use('/api', requireUser);
app.patch('/api/preferences', (req, res) => {
  const old = res.locals.user.preferences;
  const p = preferencesSchema.parse({ ...old, ...req.body });
  if (p.timezone && !DateTime.now().setZone(p.timezone).isValid)
    throw Error('Use a valid IANA timezone.');
  run('UPDATE users SET preferences=? WHERE id=?', JSON.stringify(p), res.locals.user.id);
  res.json({ preferences: p });
});
app.post('/api/reset-personalization', (req, res) => {
  run('DELETE FROM feedback WHERE user_id=?', res.locals.user.id);
  const p = {
    ...res.locals.user.preferences,
    topics: defaults.topics,
    excluded: [],
    pinned: [],
    memory: false,
  };
  run('UPDATE users SET preferences=? WHERE id=?', JSON.stringify(p), res.locals.user.id);
  res.json({ preferences: p });
});
app.get('/api/catalog', (_req, res) =>
  res.json({
    books: catalog(res.locals.user.preferences.territory),
    references: [
      {
        title: 'Walter Isaacson · future catalog request',
        note: 'Reference only. No title or manuscript assumed. No readable license.',
      },
      {
        title: 'A modern Napoleon biography',
        note: 'Reference only. Author and edition not yet specified; no readable license.',
      },
    ],
  }),
);
app.get('/api/recommendation', (_req, res) => {
  const p = res.locals.user.preferences;
  const t = rank(res.locals.user.id, p)[0];
  res.json(
    t
      ? {
          title: t.title,
          templateId: t.id,
          score: t.score,
          reason: t.reason,
          manifest: { editionId: t.edition_id, estimatedMinutes: p.minutes },
        }
      : null,
  );
});
app.get('/api/templates', (_req, res) =>
  res.json(
    all<any>('SELECT t.id,t.title,t.edition_id,t.tags,t.journey FROM templates t').map((t) => ({
      ...t,
      tags: parse(t.tags),
      accessible: permitted(t.edition_id, 'display', res.locals.user.preferences.territory),
    })),
  ),
);
app.get('/api/sessions', (_req, res) =>
  res.json(
    all<any>(
      'SELECT id,title,status,progress,created_at,manifest,reason FROM sessions WHERE user_id=? ORDER BY created_at DESC',
      res.locals.user.id,
    ).map((s) => ({
      ...s,
      manifest: parse(s.manifest),
      accessible:
        permitted(parse(s.manifest).editionId, 'display', res.locals.user.preferences.territory) &&
        permitted(parse(s.manifest).editionId, 'summaries', res.locals.user.preferences.territory),
    })),
  ),
);
app.post('/api/sessions', (req, res) => {
  const options = z
    .object({
      bookId: z.string().optional(),
      topic: z.string().optional(),
      journey: z.string().optional(),
      review: z.boolean().optional(),
      templateId: z.string().optional(),
    })
    .parse(req.body);
  const last = one<any>(
    'SELECT created_at FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
    res.locals.user.id,
  );
  if (last && Date.now() - Date.parse(last.created_at) < limits.generationIntervalMs) {
    res.status(429).json({ error: 'Please wait a moment before preparing another edition.' });
    return;
  }
  res.status(201).json(createSession(res.locals.user.id, res.locals.user.preferences, options));
});
function ownedSession(req: express.Request, res: express.Response) {
  const s = one<any>(
    'SELECT * FROM sessions WHERE id=? AND user_id=?',
    String(req.params.id),
    res.locals.user.id,
  );
  if (!s) {
    res.status(404).json({ error: 'Edition not found.' });
    return;
  }
  return s;
}
app.get('/api/sessions/:id', (req, res) => {
  const s = ownedSession(req, res);
  if (s) res.json(sessionView(s, res.locals.user.preferences.territory));
});
app.patch('/api/sessions/:id', (req, res) => {
  const s = ownedSession(req, res);
  if (!s) return;
  sessionView(s, res.locals.user.preferences.territory);
  const p = z
    .object({
      progress: z.number().int().min(0).max(100).optional(),
      expanded: z.array(z.string().max(80)).max(10).optional(),
      status: z.enum(['ready', 'in-progress', 'completed']).optional(),
    })
    .parse(req.body);
  run(
    'UPDATE sessions SET progress=?,expanded=?,status=? WHERE id=?',
    Math.max(s.progress, p.status === 'completed' ? 100 : (p.progress ?? s.progress)),
    JSON.stringify(p.expanded ?? parse(s.expanded)),
    s.status === 'completed' ? 'completed' : (p.status ?? s.status),
    s.id,
  );
  if (p.status)
    run(
      'UPDATE occurrences SET status=?,updated_at=? WHERE session_id=?',
      p.status,
      new Date().toISOString(),
      s.id,
    );
  res.json({ ok: true });
});
app.get('/api/sources/:id', (req, res) => {
  res.json(sourceContext(String(req.params.id), res.locals.user.preferences.territory));
});
app.get('/api/books/:id/original', (req, res) => {
  const id = String(req.params.id);
  if (!permitted(id, 'display', res.locals.user.preferences.territory)) {
    res.status(403).json({ error: 'Original source is unavailable under current rights.' });
    return;
  }
  const e = one<any>('SELECT * FROM editions WHERE id=?', id);
  res.type('text/plain').send(e.source_text);
});
app.get('/api/books/:id/license', (req, res) => {
  const id = String(req.params.id);
  if (!permitted(id, 'display', res.locals.user.preferences.territory)) {
    res.status(403).json({ error: 'License source unavailable under current rights.' });
    return;
  }
  const e = one<any>('SELECT source_text FROM editions WHERE id=?', id)!;
  const at = e.source_text.search(
    /The Full Project Gutenberg|THE FULL PROJECT GUTENBERG|Full Project Gutenberg/,
  );
  res.type('text/plain').send(at >= 0 ? e.source_text.slice(at) : e.source_text);
});
app.post('/api/sessions/:id/question', (req, res) => {
  const s = ownedSession(req, res);
  if (!s) return;
  const view = sessionView(s, res.locals.user.preferences.territory);
  const question = z.string().trim().min(2).max(300).parse(req.body.question);
  const words = question.toLowerCase().match(/[a-z]{4,}/g) || [];
  const b = view.blocks.find((b: any) => b.type === 'original')!;
  const paragraphs = b.text
    .split(/\n\n+/)
    .map((text: string) => ({
      text,
      score: words.filter((w) => text.toLowerCase().includes(w)).length,
    }))
    .filter((p: any) => p.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 3);
  res.json({
    mode: 'source-search',
    message:
      'Exact matching paragraphs from this edition. This is source search, not a generated answer; live AI is disconnected.',
    matches: paragraphs,
    spanId: b.spanId,
  });
});
app.post('/api/sessions/:id/adapt', limitAuth, async (req, res) => {
  const s = ownedSession(req, res);
  if (!s) return;
  const input = z
    .object({
      mode: z.enum(['explain', 'condense', 'question']),
      question: z.string().max(500).default(''),
    })
    .parse(req.body);
  const view = sessionView(s, res.locals.user.preferences.territory);
  if (!permitted(view.manifest.editionId, 'modelProcessing', res.locals.user.preferences.territory))
    throw Error('Model processing is unavailable under this source grant.');
  if (!modelStatus().connected) {
    res.status(503).json({ error: modelStatus().message });
    return;
  }
  const recent = one<any>(
    'SELECT COUNT(*) AS n FROM generation_jobs WHERE user_id=? AND created_at>=?',
    res.locals.user.id,
    new Date(Date.now() - 86400000).toISOString(),
  )!.n;
  if (recent >= limits.dailyEditions) {
    res.status(429).json({ error: 'Daily model request limit reached.' });
    return;
  }
  const pending = one(
    'SELECT id FROM generation_jobs WHERE user_id=? AND state=? AND created_at>?',
    res.locals.user.id,
    'preparing',
    new Date(Date.now() - 60000).toISOString(),
  );
  if (pending) {
    res.status(429).json({ error: 'Another model request is still preparing.' });
    return;
  }
  const block = view.blocks.find((b: any) => b.type === 'original')!;
  const source = sourceContext(block.spanId!, res.locals.user.preferences.territory);
  const jobId = randomUUID();
  const blockId = input.mode === 'condense' ? 'orientation' : 'context';
  run(
    'INSERT INTO generation_jobs VALUES(?,?,?,?,?,?,?,?)',
    jobId,
    res.locals.user.id,
    s.id,
    blockId,
    'preparing',
    null,
    new Date().toISOString(),
    null,
  );
  try {
    const result = await groundedModel(
      input.mode,
      [
        {
          id: block.spanId!,
          text: source.exact,
          hash: source.hash,
          location: source.span.location,
        },
      ],
      input.question,
    );
    const current = one<any>(
      'SELECT * FROM sessions WHERE id=? AND user_id=?',
      s.id,
      res.locals.user.id,
    );
    if (!current) throw Error('Account or edition was deleted while preparing.');
    sessionView(current, res.locals.user.preferences.territory);
    if (
      !permitted(view.manifest.editionId, 'modelProcessing', res.locals.user.preferences.territory)
    )
      throw Error('Source permission changed during preparation.');
    if (input.mode !== 'question') {
      const blocks = parse<any[]>(current.blocks).map((b) =>
        b.id === blockId
          ? {
              ...b,
              text: result.output.text,
              label:
                input.mode === 'condense'
                  ? 'AI summary · fidelity review pending'
                  : 'AI explanation · interpretation, fidelity review pending',
            }
          : b,
      );
      const manifest = parse(current.manifest);
      manifest.modelRecords = [...(manifest.modelRecords || []), result.record];
      run(
        'UPDATE sessions SET blocks=?,manifest=? WHERE id=? AND user_id=?',
        JSON.stringify(blocks),
        JSON.stringify(manifest),
        s.id,
        res.locals.user.id,
      );
    }
    run(
      "UPDATE generation_jobs SET state='ready',data=? WHERE id=?",
      JSON.stringify(result.record),
      jobId,
    );
    if (input.mode === 'question')
      res.json({
        mode: 'live-ai',
        message: 'AI interpretation · fidelity review pending. ' + result.output.text,
        sourceSpanIds: result.output.sourceSpanIds,
      });
    else
      res.json(
        sessionView(
          one('SELECT * FROM sessions WHERE id=?', s.id),
          res.locals.user.preferences.territory,
        ),
      );
  } catch (e) {
    run(
      "UPDATE generation_jobs SET state='failed',error=? WHERE id=?",
      (e as Error).message,
      jobId,
    );
    throw e;
  }
});
app.post('/api/sessions/:id/feedback', (req, res) => {
  const s = ownedSession(req, res);
  if (!s) return;
  const kind = z
    .enum([
      'Too basic',
      'Too dense',
      'Already know this',
      'Not this topic',
      'More like this',
      'Wrong reason',
      'Useful',
    ])
    .parse(req.body.kind);
  run(
    'INSERT INTO feedback VALUES(?,?,?,?,?)',
    randomUUID(),
    res.locals.user.id,
    s.id,
    kind,
    new Date().toISOString(),
  );
  res.json({ ok: true });
});
app.post('/api/sessions/:id/report', (req, res) => {
  const s = ownedSession(req, res);
  if (!s) return;
  const text = z.string().trim().min(5).max(2000).parse(req.body.text);
  run(
    'INSERT INTO reports(id,user_id,session_id,text,created_at) VALUES(?,?,?,?,?)',
    randomUUID(),
    res.locals.user.id,
    s.id,
    text,
    new Date().toISOString(),
  );
  res.json({ ok: true });
});
app.get('/api/notes', (_req, res) =>
  res.json(
    all<any>(
      'SELECT n.*,s.title,s.manifest FROM notes n JOIN sessions s ON s.id=n.session_id WHERE n.user_id=? ORDER BY n.created_at DESC',
      res.locals.user.id,
    ).map((n) => {
      try {
        const c = sourceContext(n.span_id, res.locals.user.preferences.territory);
        return { ...n, quote: c.exact.slice(0, 700), accessible: true };
      } catch {
        return { ...n, quote: 'Source access currently blocked by rights.', accessible: false };
      }
    }),
  ),
);
app.post('/api/notes', (req, res) => {
  const n = z
    .object({ sessionId: z.string(), spanId: z.string(), text: z.string().max(3000).default('') })
    .parse(req.body);
  const s = one<any>(
    'SELECT * FROM sessions WHERE id=? AND user_id=?',
    n.sessionId,
    res.locals.user.id,
  );
  if (!s) {
    res.status(404).json({ error: 'Edition not found.' });
    return;
  }
  const v = sessionView(s, res.locals.user.preferences.territory);
  if (!v.blocks.some((b: any) => b.spanId === n.spanId))
    throw Error('Passage does not belong to this edition.');
  const id = randomUUID();
  run(
    'INSERT INTO notes VALUES(?,?,?,?,?,?)',
    id,
    res.locals.user.id,
    n.sessionId,
    n.spanId,
    n.text,
    new Date().toISOString(),
  );
  res.status(201).json({ id });
});
app.patch('/api/notes/:id', (req, res) => {
  const text = z.string().max(3000).parse(req.body.text);
  const r = run(
    'UPDATE notes SET text=? WHERE id=? AND user_id=?',
    text,
    String(req.params.id),
    res.locals.user.id,
  );
  if (!r.changes) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }
  res.json({ ok: true });
});
app.delete('/api/notes/:id', (req, res) => {
  run('DELETE FROM notes WHERE id=? AND user_id=?', String(req.params.id), res.locals.user.id);
  res.json({ ok: true });
});
app.get('/api/schedule', (_req, res) => {
  const u = res.locals.user;
  for (const r of all<any>('SELECT * FROM routines WHERE user_id=?', u.id)) materialize(r);
  res.json({
    routines: all<any>('SELECT * FROM routines WHERE user_id=?', u.id).map((r) => ({
      ...r,
      config: parse(r.config),
    })),
    occurrences: all<any>(
      "SELECT * FROM occurrences WHERE user_id=? AND scheduled_at>=? AND status!='cancelled' ORDER BY scheduled_at",
      u.id,
      new Date(Date.now() - 86400000).toISOString(),
    ),
    worker: one('SELECT * FROM worker_status WHERE id=1') || null,
  });
});
app.post('/api/routines', (req, res) => {
  if (res.locals.user.kind !== 'account') {
    res.status(403).json({ error: 'Create an account to schedule reading across devices.' });
    return;
  }
  const c = validateRoutine(req.body);
  const id = randomUUID();
  run(
    'INSERT INTO routines(id,user_id,config) VALUES(?,?,?)',
    id,
    res.locals.user.id,
    JSON.stringify(c),
  );
  materialize(one('SELECT * FROM routines WHERE id=?', id));
  res.status(201).json({ id });
});
app.patch('/api/routines/:id', (req, res) => {
  const id = String(req.params.id);
  const r = one<any>('SELECT * FROM routines WHERE id=? AND user_id=?', id, res.locals.user.id);
  if (!r) {
    res.status(404).json({ error: 'Routine not found.' });
    return;
  }
  const c = validateRoutine({ ...parse<any>(r.config), ...req.body.config });
  const paused =
    req.body.paused === undefined ? r.paused : Number(z.boolean().parse(req.body.paused));
  const revision = r.revision + 1;
  run(
    'UPDATE routines SET config=?,paused=?,revision=? WHERE id=?',
    JSON.stringify(c),
    paused,
    revision,
    id,
  );
  invalidateRoutine(id, revision);
  materialize(one('SELECT * FROM routines WHERE id=?', id));
  res.json({ ok: true });
});
app.delete('/api/routines/:id', (req, res) => {
  run('DELETE FROM routines WHERE id=? AND user_id=?', String(req.params.id), res.locals.user.id);
  res.json({ ok: true });
});
app.patch('/api/occurrences/:id', (req, res) => {
  const id = String(req.params.id);
  const o = one<any>('SELECT * FROM occurrences WHERE id=? AND user_id=?', id, res.locals.user.id);
  if (!o) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const action = z.enum(['skip', 'move', 'replace', 'retry']).parse(req.body.action);
  if (action === 'move') {
    const at = z.iso.datetime().parse(req.body.scheduledAt);
    if (Date.parse(at) < Date.now()) throw Error('Choose a future time.');
    run(
      'UPDATE occurrences SET scheduled_at=?,local_time=?,updated_at=? WHERE id=?',
      at,
      DateTime.fromISO(at)
        .setZone(
          parse(one<any>('SELECT config FROM routines WHERE id=?', o.routine_id)!.config).timezone,
        )
        .toFormat('yyyy-MM-dd HH:mm ZZZZ'),
      new Date().toISOString(),
      id,
    );
  } else if (action === 'skip') {
    run(
      "UPDATE occurrences SET status='skipped',updated_at=? WHERE id=?",
      new Date().toISOString(),
      id,
    );
  } else if (action === 'retry') {
    run(
      "UPDATE occurrences SET status='pending',retries=0,retry_at=NULL,error=NULL WHERE id=?",
      id,
    );
  } else {
    const r = one<any>('SELECT * FROM routines WHERE id=?', o.routine_id)!;
    const c = parse(r.config);
    const p = { ...res.locals.user.preferences, minutes: c.minutes };
    const s = createSession(res.locals.user.id, p, {
      topic: req.body.topic,
      review: !!req.body.review,
    });
    run(
      "UPDATE occurrences SET status='ready',session_id=?,updated_at=? WHERE id=?",
      s.id,
      new Date().toISOString(),
      id,
    );
  }
  res.json({ ok: true });
});
app.post('/api/events', (req, res) => {
  const name = z
    .enum([
      'onboarding_completed',
      'routine_created',
      'session_started',
      'session_completed',
      'voluntary_return',
      'expanded',
      'saved',
      'usefulness',
      'skipped',
      'generation_failed',
    ])
    .parse(req.body.name);
  run(
    'INSERT INTO events VALUES(?,?,?,?)',
    randomUUID(),
    res.locals.user.id,
    name,
    new Date().toISOString(),
  );
  res.json({ ok: true });
});
app.delete('/api/account', (_req, res) => {
  run('DELETE FROM users WHERE id=?', res.locals.user.id);
  res.clearCookie('reading_auth', { path: '/' });
  res.json({ ok: true });
});
app.use('/api/admin', (_req, res, next) => {
  if (!res.locals.user.admin) {
    res.status(403).json({ error: 'Administrator authorization required.' });
    return;
  }
  next();
});
app.get('/api/admin', (_req, res) =>
  res.json({
    books: catalog('US'),
    failedJobs: all("SELECT * FROM occurrences WHERE status='failed'"),
    reports: all('SELECT id,session_id,text,created_at,status FROM reports'),
    worker: one('SELECT * FROM worker_status WHERE id=1'),
    model: {
      ...modelStatus(),
      jobs: all(
        'SELECT id,session_id,block_id,state,data,created_at,error FROM generation_jobs ORDER BY created_at DESC LIMIT 50',
      ),
      cost: 'unknown',
    },
    limits: {
      maxSourceBytes: limits.maxSourceCharacters,
      maxRetries: limits.maxRetries,
      dailyEditions: limits.dailyEditions,
      generationIntervalMs: limits.generationIntervalMs,
    },
    features: { billing: false, privateUploads: false, email: false, push: false },
  }),
);
app.post('/api/admin/scheduler', (_req, res) => res.json(schedulerTick()));
app.patch('/api/admin/rights/:id', (req, res) => {
  const data = z
    .object({
      status: z.enum(['allowed', 'blocked', 'unknown']),
      expiresAt: z.string().nullable(),
      evidence: z.string().min(10).max(2000),
      uses: z.record(z.string(), z.boolean()).optional(),
    })
    .parse(req.body);
  if (data.expiresAt && !DateTime.fromISO(data.expiresAt).isValid)
    throw Error('Invalid expiry timestamp.');
  const r = one<any>('SELECT * FROM rights WHERE edition_id=?', String(req.params.id));
  if (!r) {
    res.status(404).json({ error: 'Edition not found.' });
    return;
  }
  run(
    'UPDATE rights SET status=?,expires_at=?,evidence=?,uses=? WHERE edition_id=?',
    data.status,
    data.expiresAt,
    JSON.stringify({
      ...parse(r.evidence),
      adminReview: data.evidence,
      reviewedAt: new Date().toISOString(),
    }),
    JSON.stringify(data.uses ?? parse(r.uses)),
    String(req.params.id),
  );
  res.json({ ok: true });
});
app.post('/api/admin/import', (req, res) => {
  const input = z
    .object({
      title: z.string().min(1).max(200),
      author: z.string().min(1).max(200),
      edition: z.string().min(1).max(300),
      sourceUrl: z.url(),
      text: z.string().min(1000).max(limits.maxSourceCharacters),
      evidence: z.string().min(50).max(4000),
      territory: z.literal('US'),
      uses: z.record(z.string(), z.boolean()),
    })
    .parse(req.body);
  if (/<script|<iframe|<object|javascript:/i.test(input.text))
    throw Error('Only plain-text sources without active embeds are accepted.');
  const id = randomUUID(),
    digest = createHash('sha256').update(input.text).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    run(
      'INSERT INTO books VALUES(?,?,?,?,?)',
      id,
      input.title,
      input.author,
      '[]',
      'Administrator import; pending editorial preparation.',
    );
    run(
      'INSERT INTO editions VALUES(?,?,?,?,?,?)',
      id,
      id,
      JSON.stringify({ edition: input.edition, upstream: input.sourceUrl, textSha256: digest }),
      input.text,
      digest,
      'pending-review',
    );
    run(
      'INSERT INTO rights VALUES(?,?,?,?,?,?)',
      id,
      'unknown',
      'US',
      JSON.stringify({
        display: false,
        summaries: false,
        adaptation: false,
        crossBook: false,
        visuals: false,
        audio: false,
        caching: false,
        modelProcessing: false,
        ...input.uses,
      }),
      JSON.stringify({ basis: input.evidence, requiresReview: true }),
      null,
    );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.status(201).json({
    id,
    message:
      'Imported in unknown rights state. Rights review and prepared sessions are required before reading.',
  });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err instanceof z.ZodError ? 400 : 400).json({
    error:
      err instanceof z.ZodError
        ? err.issues.map((i: any) => i.message).join('; ')
        : err.message || 'Request failed',
  });
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () =>
  console.log(`Reading Studio running on port ${port}. Database persistence enabled.`),
);

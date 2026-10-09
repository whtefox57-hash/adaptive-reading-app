import { all, one, parse, run } from './db';
import type { Preferences, Block } from './types';
import { weights } from './types';
import { limits } from './config';
import { randomUUID } from 'node:crypto';
import { visualNodes } from './seed';
export function permitted(
  editionId: string,
  use: string,
  territory: string,
  now = new Date(),
): boolean {
  const r = one<any>('SELECT * FROM rights WHERE edition_id=?', editionId);
  return (
    !!r &&
    r.status === 'allowed' &&
    r.territory === territory &&
    parse(r.uses)[use] === true &&
    (!r.expires_at || Date.parse(r.expires_at) > now.getTime())
  );
}
export function canReadEdition(id: string, territory: string, now = new Date()) {
  return ['display', 'summaries', 'adaptation', 'caching'].every((use) =>
    permitted(id, use, territory, now),
  );
}
export function catalog(territory: string) {
  return all<any>(
    `SELECT b.*,e.metadata,e.hash,r.status,r.territory,r.uses,r.evidence,r.expires_at FROM books b JOIN editions e ON b.id=e.book_id JOIN rights r ON r.edition_id=e.id`,
  ).map((b) => ({
    ...b,
    tags: parse(b.tags),
    metadata: parse(b.metadata),
    uses: parse(b.uses),
    evidence: parse(b.evidence),
    accessible: permitted(b.id, 'display', territory),
  }));
}
export function rank(
  userId: string,
  p: Preferences,
  options: { bookId?: string; topic?: string; journey?: string; review?: boolean } = {},
) {
  const history = p.memory
    ? all<any>(
        'SELECT template_id,manifest FROM sessions WHERE user_id=? ORDER BY created_at DESC',
        userId,
      )
    : [];
  const seen = new Set(history.map((h) => h.template_id));
  const active = p.memory
    ? one<any>(
        "SELECT template_id FROM sessions WHERE user_id=? AND status='in-progress' ORDER BY created_at DESC LIMIT 1",
        userId,
      )
    : undefined;
  const activeEdition = active
    ? one<any>('SELECT edition_id FROM templates WHERE id=?', active.template_id)?.edition_id
    : undefined;
  const feedback = p.memory
    ? all<any>(
        'SELECT s.template_id,f.kind,t.edition_id FROM feedback f JOIN sessions s ON s.id=f.session_id JOIN templates t ON t.id=s.template_id WHERE f.user_id=?',
        userId,
      )
    : [];
  const templates = all<any>('SELECT * FROM templates ORDER BY rowid');
  const explicit = options.bookId || (p.mode === 'book' && !options.topic ? p.bookId : '');
  return templates
    .filter(
      (t) =>
        canReadEdition(t.edition_id, p.territory) &&
        !p.excluded.includes(t.edition_id) &&
        (!explicit || t.edition_id === explicit) &&
        (!options.journey || t.journey === options.journey) &&
        (!options.topic ||
          parse<string[]>(t.tags).some(
            (tag) => tag.toLowerCase() === options.topic!.toLowerCase(),
          )) &&
        (options.review || !seen.has(t.id)),
    )
    .map((t) => {
      const tags = parse<string[]>(t.tags);
      const matches = tags.filter((tag) =>
        (options.topic ? [options.topic] : p.topics).some(
          (x) => x.toLowerCase() === tag.toLowerCase(),
        ),
      );
      const continuity = !options.topic && p.mode !== 'discovery' && activeEdition === t.edition_id;
      const reactions = feedback.filter(
        (f) => f.template_id === t.id || f.edition_id === t.edition_id,
      );
      const positive = reactions.filter((f) => f.kind === 'More like this').length;
      const negative = reactions.filter((f) =>
        ['Not this topic', 'Too dense', 'Too basic', 'Already know this', 'Wrong reason'].includes(
          f.kind,
        ),
      ).length;
      const score =
        matches.length * weights.tag +
        (continuity ? weights.continuity : 0) +
        (p.pinned.includes(t.edition_id) ? weights.pinned : 0) +
        positive * weights.positive +
        negative * weights.negative +
        weights.novelty +
        (p.purpose === 'application' && tags.includes('Career') ? weights.purpose : 0) +
        (p.depth === 'deep' && tags.includes('History') ? weights.depth : 0);
      return {
        ...t,
        tags,
        score,
        spanStart: one<any>('SELECT start_offset FROM source_spans WHERE id=?', t.span_id)!
          .start_offset,
        reason: matches.length
          ? `Matched your interest in ${matches.join(' and ')}. ${continuity ? 'Continues your active book. ' : ''}${reactions.length ? 'Your explicit feedback on this book affected its rank. ' : ''}${p.pinned.includes(t.edition_id) ? 'You pinned this book. ' : ''}Selected from permitted US editions; assembled for your ${p.minutes}-minute budget.`
          : `${continuity ? 'Continues your active book.' : 'An available discovery from the US prototype library.'} Assembled for your ${p.minutes}-minute budget.`,
      };
    })
    .sort((a, b) =>
      explicit ||
      (!options.topic &&
        p.mode !== 'discovery' &&
        a.edition_id === activeEdition &&
        b.edition_id === activeEdition)
        ? a.spanStart - b.spanStart
        : b.score - a.score,
    );
}
function makeSpan(template: any, minutes: number) {
  const base = one<any>('SELECT * FROM source_spans WHERE id=?', template.span_id)!;
  const source = one<any>('SELECT * FROM editions WHERE id=?', template.edition_id)!;
  const text = source.source_text as string;
  const next = one<any>(
    'SELECT MIN(start_offset) AS start FROM source_spans WHERE edition_id=? AND start_offset>? AND id IN (SELECT span_id FROM templates)',
    base.edition_id,
    base.start_offset,
  )?.start;
  const target = Math.max(650, Math.round(minutes * 190 - 220));
  let end = base.start_offset,
    words = 0;
  const tail = text.slice(
    base.start_offset,
    next ??
      (text.indexOf('*** END OF THIS PROJECT GUTENBERG', base.start_offset) > 0
        ? text.indexOf('*** END OF THIS PROJECT GUTENBERG', base.start_offset)
        : text.length),
  );
  for (const match of tail.matchAll(/\S[^\n]*(?:\n[^\n]+)*/g)) {
    words += match[0].split(/\s+/).length;
    end = base.start_offset + match.index! + match[0].length;
    if (words >= target) break;
  }
  const id = randomUUID();
  run(
    'INSERT INTO source_spans VALUES(?,?,?,?,?)',
    id,
    base.edition_id,
    base.start_offset,
    end,
    `Source characters ${base.start_offset}–${end} (normalized edition)`,
  );
  return { ...base, id, end_offset: end, words };
}
export function createSession(
  userId: string,
  p: Preferences,
  options: {
    bookId?: string;
    topic?: string;
    journey?: string;
    review?: boolean;
    occurrenceId?: string;
    templateId?: string;
  } = {},
) {
  const started = performance.now();
  if (p.territory !== 'US')
    throw Error('Confirm US access before reading. Worldwide rights have not been verified.');
  if (options.occurrenceId) {
    const existing = one<any>('SELECT * FROM sessions WHERE occurrence_id=?', options.occurrenceId);
    if (existing) return sessionView(existing, p.territory);
  }
  const daily = one<any>(
    'SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND created_at>=?',
    userId,
    new Date(Date.now() - 86400000).toISOString(),
  )!.n;
  if (daily >= limits.dailyEditions)
    throw Error('Daily edition limit reached. Existing editions remain available.');
  const candidates = rank(userId, p, options);
  const t = options.templateId
    ? candidates.find((t) => t.id === options.templateId)
    : candidates[0];
  if (!t)
    throw Error(
      'No unread permitted selection matches. Choose another topic, change exclusions, or explicitly request a review.',
    );
  const span = makeSpan(t, p.minutes);
  const source = one<any>('SELECT * FROM editions WHERE id=?', t.edition_id)!;
  // Exact source spans are stored and hydrated on each access, never generated by a model.
  const blocks: Block[] = [
    {
      id: 'orientation',
      type: 'summary',
      label: 'Prepared editorial introduction · not live AI',
      text: t.summary,
    },
    { id: 'passage', type: 'original', label: 'Original passage', text: '', spanId: span.id },
    {
      id: 'context',
      type: 'explanation',
      label: 'Prepared editorial perspective · interpretation',
      text: t.explanation,
    },
  ];
  if (p.visuals && permitted(t.edition_id, 'visuals', p.territory))
    blocks.push({
      id: 'visual',
      type: 'visual',
      label: 'Concept map · editorial interpretation, not measured causation',
      text: 'A reading aid for the prepared opening. These connections interpret the text; they do not establish causal proof.',
      nodes: visualNodes[t.id],
    });
  blocks.push({
    id: 'reflection',
    type: 'reflection',
    label: 'Optional reflection',
    text: t.reflection,
  });
  const id = randomUUID();
  const manifest = {
    version: 1,
    model: null,
    provider: 'prepared-editorial',
    promptVersion: 'prepared-v1',
    sourceHash: source.hash,
    editionId: t.edition_id,
    sourceSpans: [span.id],
    validation:
      'exact-source-verified; human-prepared commentary; extended original context not summarized',
    wordCount: span.words,
    estimatedMinutes: Math.round((span.words + 180) / 190),
    requestedMinutes: p.minutes,
    originalSharePreference: p.originalShare,
    originalShareNote:
      'Prepared examples preserve substantial original text; this preference does not shorten coherent source passages.',
    coverage: { start: span.start_offset, end: span.end_offset, total: source.source_text.length },
    topic: options.topic || p.topics.join(', '),
    generationLatencyMs: Math.round(performance.now() - started),
    tokenUsage: 0,
    cost: null,
    generatedAt: new Date().toISOString(),
  };
  run(
    'INSERT INTO sessions(id,user_id,template_id,occurrence_id,title,blocks,manifest,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    id,
    userId,
    t.id,
    options.occurrenceId || null,
    t.title,
    JSON.stringify(blocks),
    JSON.stringify(manifest),
    t.reason,
    new Date().toISOString(),
  );
  run(
    'INSERT INTO events VALUES(?,?,?,?)',
    randomUUID(),
    userId,
    'edition_prepared',
    new Date().toISOString(),
  );
  return sessionView(one<any>('SELECT * FROM sessions WHERE id=?', id)!, p.territory);
}
export function sessionView(s: any, territory: string) {
  const m = parse(s.manifest);
  if (!canReadEdition(m.editionId, territory))
    throw Error(
      'Access unavailable: edition rights are blocked, expired, or unavailable in your territory.',
    );
  const book = one<any>('SELECT * FROM books WHERE id=?', m.editionId);
  const blocks = parse<Block[]>(s.blocks)
    .filter((b) => b.type !== 'visual' || permitted(m.editionId, 'visuals', territory))
    .map((b) => {
      if (!b.spanId) return b;
      const span = one<any>('SELECT * FROM source_spans WHERE id=?', b.spanId);
      const text = one<any>(
        'SELECT source_text FROM editions WHERE id=?',
        span.edition_id,
      )!.source_text;
      return {
        ...b,
        text: text.slice(span.start_offset, span.end_offset),
        location: span.location,
        sourceUrl: `/api/sources/${span.id}`,
        start: span.start_offset,
        end: span.end_offset,
      };
    });
  const licenseText = one<any>(
    'SELECT source_text FROM editions WHERE id=?',
    m.editionId,
  )!.source_text;
  const licenseNotice = licenseText.match(/This eBook[\s\S]*?(?=\n\n)/)?.[0] || '';
  return {
    ...s,
    licenseNotice,
    blocks,
    manifest: m,
    expanded: parse(s.expanded),
    book: { ...book, tags: parse(book.tags) },
  };
}
export function sourceContext(spanId: string, territory: string) {
  const s = one<any>('SELECT * FROM source_spans WHERE id=?', spanId);
  if (!s || !permitted(s.edition_id, 'display', territory))
    throw Error('Source unavailable under current rights.');
  const e = one<any>('SELECT * FROM editions WHERE id=?', s.edition_id)!;
  return {
    span: s,
    text: e.source_text.slice(Math.max(0, s.start_offset - 1800), s.end_offset + 2400),
    exact: e.source_text.slice(s.start_offset, s.end_offset),
    metadata: parse(e.metadata),
    hash: e.hash,
  };
}

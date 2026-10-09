import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Preferences, Routine } from '../server/types';
import { topics, journeys } from './content';
import { Icon, PageTitle, Modal, SourceLicense } from './common';
export function Reader({ session, user, act, busy, close, setSession, savePrefs }: any) {
  const [expanded, setExpanded] = useState(session.expanded.includes('passage')),
    [originalOnly, setOriginalOnly] = useState(false),
    [source, setSource] = useState<any>(null),
    [note, setNote] = useState<string | null>(null),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState<any>(null),
    [showTools, setShowTools] = useState(false),
    [report, setReport] = useState<string | null>(null),
    [progress, setProgress] = useState(session.progress),
    [saved, setSaved] = useState(false);
  const passage = session.blocks.find((b: any) => b.type === 'original');
  const progressRef = useRef(session.progress),
    readRef = useRef<HTMLElement>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    progressRef.current = session.progress;
    setProgress(session.progress);
    setExpanded(session.expanded.includes('passage'));
    setOriginalOnly(false);
    setAnswer(null);
    setSaved(false);
    const t = setTimeout(() => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, (height * session.progress) / 100);
    }, 100);
    const update = () => {
      if (progressRef.current >= 100) return;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (height <= 0) return;
      const p = Math.min(
        99,
        Math.max(progressRef.current, Math.round((window.scrollY / height) * 100)),
      );
      if (p !== progressRef.current) {
        progressRef.current = p;
        setProgress(p);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          api('/sessions/' + session.id, 'PATCH', { progress: p, status: 'in-progress' }).catch(
            () => {},
          );
        }, 700);
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      clearTimeout(t);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      window.removeEventListener('scroll', update);
      api('/sessions/' + session.id, 'PATCH', { progress: progressRef.current }).catch(() => {});
    };
  }, [session.id]);
  const toggle = () =>
    act(async () => {
      const scroll = window.scrollY;
      const value = !expanded;
      await api('/sessions/' + session.id, 'PATCH', { expanded: value ? ['passage'] : [] });
      setExpanded(value);
      if (value) await api('/events', 'POST', { name: 'expanded' });
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    });
  const saveNote = () =>
    act(async () => {
      await api('/notes', 'POST', {
        sessionId: session.id,
        spanId: passage.spanId,
        text: note || '',
      });
      await api('/events', 'POST', { name: 'saved' });
      setSaved(true);
      setNote(null);
    }, 'Saved to your notebook');
  const showSource = () => act(async () => setSource(await api('/sources/' + passage.spanId)));
  const paragraphs = passage.text.split(/\n\n+/);
  const excerpt =
    expanded || originalOnly
      ? paragraphs
      : paragraphs.slice(0, Math.max(3, Math.ceil(paragraphs.length * 0.55)));
  const coverage = session.manifest.coverage;
  const covered = Math.max(0, ((coverage.end - coverage.start) / coverage.total) * 100);
  return (
    <>
      <header className="reader-top">
        <button className="text-button" onClick={close}>
          ← Your reading space
        </button>
        <span className="reader-brand">reading studio.</span>
        <div>
          <button
            className="icon-button"
            aria-label="Decrease text size"
            onClick={() =>
              act(() => savePrefs({ fontSize: Math.max(16, user.preferences.fontSize - 2) }))
            }
          >
            A−
          </button>
          <button
            className="icon-button"
            aria-label="Increase text size"
            onClick={() =>
              act(() => savePrefs({ fontSize: Math.min(28, user.preferences.fontSize + 2) }))
            }
          >
            A+
          </button>
          <button
            className="icon-button"
            aria-label="Toggle reading theme"
            onClick={() =>
              act(() => savePrefs({ theme: user.preferences.theme === 'dark' ? 'light' : 'dark' }))
            }
          >
            <Icon name="moon" />
          </button>
        </div>
      </header>
      <div className="reading-progress" aria-label={`Edition progress ${progress}%`}>
        <span style={{ width: progress + '%' }} />
      </div>
      <main
        id="main"
        className="reader-main"
        ref={readRef}
        style={{ '--reading-size': user.preferences.fontSize + 'px' } as React.CSSProperties}
      >
        <p className="eyebrow">
          {session.book.author} / {session.book.tags.join(' · ')}
        </p>
        <h1>{session.title}</h1>
        <SourceLicense id={session.book.id} notice={session.licenseNotice} />
        <div className="reader-meta">
          About {session.manifest.estimatedMinutes} minutes · Prepared edition · Progress saved{' '}
          {progress}%
        </div>
        <div className="reader-switch">
          <button
            className={!originalOnly ? 'selected' : ''}
            onClick={() => setOriginalOnly(false)}
          >
            Adaptive edition
          </button>
          <button className={originalOnly ? 'selected' : ''} onClick={() => setOriginalOnly(true)}>
            Original text
          </button>
          <button className="text-button" onClick={() => setShowTools(!showTools)}>
            {showTools ? 'Hide' : 'Show'} edition details
          </button>
        </div>
        {showTools && (
          <div className="notice">
            <h3>Coverage, with clarity</h3>
            <p>
              This edition selects source characters {coverage.start.toLocaleString()}–
              {coverage.end.toLocaleString()} from the normalized edition. Approximately{' '}
              {covered.toFixed(1)}% of this source file is included, with additional commentary on
              the prepared opening. Completing this edition does not complete the book.
            </p>
            <p>
              Original: selected span. Summarized: the prepared opening only. Not covered: the rest
              of the book, including its editorial material.
            </p>
            <p>
              {session.manifest.originalShareNote} Requested share:{' '}
              {session.manifest.originalSharePreference}%.
            </p>
            <p>
              Provider: prepared editorial
              {session.manifest.modelRecords?.length
                ? ' with requested AI section revisions (fidelity review pending).'
                : user.modelConnected
                  ? ' · model provider configured for optional section requests.'
                  : ' · live AI disconnected.'}{' '}
              Manifest: {session.manifest.validation}.
            </p>
            <p className="hash">Source SHA-256: {session.manifest.sourceHash}</p>
          </div>
        )}
        {session.blocks.map((b: any) => {
          if (originalOnly && b.type !== 'original') return null;
          if (b.type === 'original')
            return (
              <section className="original-block" key={b.id}>
                <div className="block-heading">
                  <span className="eyebrow">ORIGINAL PASSAGE</span>
                  <button className="text-button" onClick={showSource}>
                    Show source ↗
                  </button>
                </div>
                <div className="prose">
                  {excerpt.map((p: string, i: number) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {!expanded && !originalOnly && excerpt.length < paragraphs.length && (
                  <p className="omission">
                    [Remaining source paragraphs are collapsed. Expand to read the complete selected
                    span.]
                  </p>
                )}
                <div className="reader-actions">
                  <button className="secondary" disabled={busy} onClick={toggle}>
                    {expanded ? 'Condense' : 'Expand'} {expanded ? '−' : '+'}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setNote('');
                    }}
                  >
                    Annotate
                  </button>
                  <button className="secondary" disabled={busy} onClick={saveNote}>
                    {saved ? 'Saved ✓' : 'Save passage'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setAnswer({
                        mode: 'explanation',
                        message: session.blocks.find((b: any) => b.type === 'explanation')?.text,
                      });
                      document.getElementById('question-panel')?.scrollIntoView({
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                          ? 'auto'
                          : 'smooth',
                        block: 'center',
                      });
                    }}
                  >
                    Explain
                  </button>
                </div>
                <p className="attribution">
                  {session.book.title} · {session.book.author}
                  <br />
                  {b.location}. Wording and punctuation preserved. Full source and license available
                  via Show source.
                </p>
              </section>
            );
          if (b.type === 'visual')
            return (
              <section className="visual-block" key={b.id}>
                <p className="eyebrow">{b.label}</p>
                <svg
                  role="img"
                  aria-label={
                    b.nodes.join(' connects to ') +
                    '. Conceptual interpretation of the cited opening.'
                  }
                  viewBox="0 0 620 115"
                >
                  <title>Conceptual connections in the prepared passage</title>
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0 0L6 3L0 6" fill="currentColor" />
                    </marker>
                  </defs>
                  {b.nodes.map((node: string, i: number) => (
                    <g key={node}>
                      {i < 2 && (
                        <line
                          x1={i * 210 + 185}
                          y1="55"
                          x2={i * 210 + 225}
                          y2="55"
                          stroke="currentColor"
                          markerEnd="url(#arrowhead)"
                        />
                      )}
                      <rect
                        x={i * 210 + 6}
                        y="18"
                        width="178"
                        height="75"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                      />
                      <text
                        x={i * 210 + 95}
                        y="61"
                        textAnchor="middle"
                        fill="currentColor"
                        fontSize="14"
                      >
                        {node}
                      </text>
                    </g>
                  ))}
                </svg>
                <p>{b.text}</p>
                <details>
                  <summary>Text alternative & source</summary>
                  <ol>
                    {b.nodes.map((node: string) => (
                      <li key={node}>{node}</li>
                    ))}
                  </ol>
                  <p>
                    Source: {session.book.title}, {passage.location}. No numeric or measured causal
                    claim.
                  </p>
                </details>
              </section>
            );
          return (
            <section className={'editorial-block ' + b.type} key={b.id}>
              <p className="eyebrow">{b.label}</p>
              <p>{b.text}</p>
              {b.type === 'reflection' && (
                <button className="text-button" onClick={() => setNote('Reflection: ')}>
                  Write a thought in your notebook ↗
                </button>
              )}
            </section>
          );
        })}
        <section id="question-panel" className="question-panel">
          <h3>Stay with the source.</h3>
          <button
            className="secondary"
            disabled={busy || !user.modelConnected}
            title={
              user.modelConnected
                ? 'Explain this section using the configured provider'
                : 'Live AI requires a secure model provider connection'
            }
            onClick={() =>
              act(async () => {
                const at = window.scrollY;
                const updated = await api('/sessions/' + session.id + '/adapt', 'POST', {
                  mode: 'explain',
                });
                setSession(updated);
                requestAnimationFrame(() => window.scrollTo(0, at));
              })
            }
          >
            {user.modelConnected
              ? 'AI explain this section'
              : 'AI explanation · provider disconnected'}
          </button>
          <p>
            {user.modelConnected
              ? 'Ask about the authorized source window. AI interpretations are unreviewed and may be wrong.'
              : 'Search this passage for an idea or phrase. Live AI questions require a model connection. Prepared explanations and source search remain available.'}
          </p>
          {user.modelConnected && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const at = window.scrollY;
                  const updated = await api('/sessions/' + session.id + '/adapt', 'POST', {
                    mode: 'condense',
                  });
                  setSession(updated);
                  requestAnimationFrame(() => window.scrollTo(0, at));
                })
              }
            >
              AI condense the context
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () =>
                setAnswer(
                  await api(
                    '/sessions/' + session.id + (user.modelConnected ? '/adapt' : '/question'),
                    'POST',
                    { question, mode: 'question' },
                  ),
                ),
              );
            }}
          >
            <label className="sr-only" htmlFor="question">
              Search the source
            </label>
            <input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Try “books” or “learning”"
              minLength={2}
              maxLength={300}
              required
            />
            <button className="secondary" disabled={busy}>
              {user.modelConnected ? 'Ask' : 'Search'}
            </button>
          </form>
          {answer && (
            <div className="answer">
              <p>{answer.message}</p>
              {answer.matches?.length === 0 && (
                <p>
                  No matching paragraph in this span. Try another phrase or open the surrounding
                  source.
                </p>
              )}
              {answer.matches?.map((m: any, i: number) => (
                <blockquote key={i}>{m.text}</blockquote>
              ))}
            </div>
          )}
        </section>
        <section className="edition-finish">
          <p className="eyebrow">MAKE THIS YOURS</p>
          <h3>How did this reading feel?</h3>
          <div className="feedback">
            {[
              'Too basic',
              'Too dense',
              'Already know this',
              'Not this topic',
              'More like this',
              'Wrong reason',
              'Useful',
            ].map((kind) => (
              <button
                key={kind}
                className="chip"
                onClick={() =>
                  act(
                    () => api('/sessions/' + session.id + '/feedback', 'POST', { kind }),
                    'Thank you. Your feedback is saved.',
                  )
                }
              >
                {kind}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api('/sessions/' + session.id, 'PATCH', {
                    progress: 100,
                    status: 'completed',
                  });
                  progressRef.current = 100;
                  setProgress(100);
                  await api('/events', 'POST', { name: 'session_completed' });
                }, 'Edition complete. The rest of the book is still yours to explore.')
              }
            >
              Complete this edition ✓
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const s = await api('/sessions', 'POST', { bookId: session.book.id });
                  setSession(s);
                  window.scrollTo(0, 0);
                })
              }
            >
              Continue book ↗
            </button>
          </div>
          <label>
            Change topic
            <select
              defaultValue=""
              onChange={(e) => {
                const topic = e.target.value;
                if (topic)
                  act(async () => {
                    const s = await api('/sessions', 'POST', { topic });
                    setSession(s);
                    window.scrollTo(0, 0);
                  });
              }}
            >
              <option value="">Choose another interest</option>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={() => setReport('')}>
            Report a source or editorial error
          </button>
        </section>
      </main>
      {source && (
        <Modal title="An original voice, in context." close={() => setSource(null)}>
          <p>{source.metadata.edition}</p>
          <p>
            {source.span.location}. This view adds surrounding text; it preserves the normalized
            source verbatim.
          </p>
          <SourceLicense id={session.book.id} notice={session.licenseNotice} />
          <pre className="source-context">{source.text}</pre>
          <a
            className="secondary link-button"
            href={'/api/books/' + session.book.id + '/original'}
            target="_blank"
            rel="noreferrer"
          >
            Full source & Gutenberg license ↗
          </a>
          <a
            className="text-button"
            href={source.metadata.upstream}
            target="_blank"
            rel="noreferrer"
          >
            Gutenberg catalog ↗
          </a>
        </Modal>
      )}
      {note !== null && (
        <Modal title="A thought worth keeping." close={() => setNote(null)}>
          <p className="muted">Saved privately with this passage and source location.</p>
          <label>
            Your note
            <textarea
              rows={6}
              value={note}
              maxLength={3000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy} onClick={saveNote}>
            Save note
          </button>
        </Modal>
      )}
      {report !== null && (
        <Modal title="Help us read more carefully." close={() => setReport(null)}>
          <label>
            What needs reviewing?
            <textarea
              value={report}
              maxLength={2000}
              onChange={(e) => setReport(e.target.value)}
              rows={5}
            />
          </label>
          <button
            className="primary"
            disabled={busy || report.trim().length < 5}
            onClick={() =>
              act(async () => {
                await api('/sessions/' + session.id + '/report', 'POST', { text: report });
                setReport(null);
              }, 'Report saved for administrator review.')
            }
          >
            Send for editorial review
          </button>
        </Modal>
      )}
    </>
  );
}
export function PreferencesPanel({ user, act, save, logout, auth, admin }: any) {
  const [p, setP] = useState<Preferences>(user.preferences),
    [deleting, setDeleting] = useState(false);
  useEffect(() => setP(user.preferences), [user]);
  const update = (key: keyof Preferences, value: any) => setP({ ...p, [key]: value });
  return (
    <>
      <PageTitle
        eyebrow="YOUR READING, YOUR WAY"
        title="Stay curious, on your terms."
        description="Change your interests whenever you like. We use what you tell us, not assumptions about who you are."
      />
      <form
        className="preferences-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await save(p);
            await api('/events', 'POST', { name: 'onboarding_completed' });
          }, 'Reading preferences saved.');
        }}
      >
        <section>
          <h3>What brings you to a book?</h3>
          <div className="choice-grid">
            {[
              ['pleasure', 'The pleasure of reading'],
              ['understanding', 'A deeper understanding'],
              ['application', 'Ideas to put into practice'],
              ['combination', 'A little of everything'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={p.purpose === value ? 'choice selected' : 'choice'}
                onClick={() => update('purpose', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Follow your interests</h3>
          <div className="tags selectable">
            {topics.map((t) => (
              <button
                type="button"
                aria-pressed={p.topics.includes(t)}
                key={t}
                className={p.topics.includes(t) ? 'chip selected' : 'chip'}
                onClick={() =>
                  update(
                    'topics',
                    p.topics.includes(t) ? p.topics.filter((x) => x !== t) : [...p.topics, t],
                  )
                }
              >
                {t} {p.topics.includes(t) ? '✓' : '+'}
              </button>
            ))}
          </div>
          <label>
            Favorite books or authors{' '}
            <small>Optional · a taste reference, not a readable catalog guarantee</small>
            <input
              value={p.favorites}
              maxLength={500}
              onChange={(e) => update('favorites', e.target.value)}
              placeholder="A book you often return to…"
            />
          </label>
        </section>
        <section>
          <h3>Make room for the reading itself</h3>
          <div className="form-grid">
            <label>
              Time budget (5–60 minutes)
              <input
                type="number"
                min={5}
                max={60}
                required
                value={p.minutes}
                onChange={(e) => update('minutes', Number(e.target.value))}
              />
            </label>
            <label>
              Reading depth
              <select value={p.depth} onChange={(e) => update('depth', e.target.value)}>
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep</option>
              </select>
            </label>
            <label>
              Reading mode
              <select value={p.mode} onChange={(e) => update('mode', e.target.value)}>
                <option value="topic">Explore a topic</option>
                <option value="book">Continue one book</option>
                <option value="discovery">Curated discovery</option>
              </select>
            </label>
            {p.mode === 'book' && (
              <label>
                Chosen book
                <select value={p.bookId} onChange={(e) => update('bookId', e.target.value)}>
                  <option value="">Choose a book</option>
                  <option value="franklin">Franklin</option>
                  <option value="carnegie">Carnegie</option>
                  <option value="napoleon">Bourrienne</option>
                </select>
              </label>
            )}
          </div>
          <label>
            Original-text preference · {p.originalShare}%
            <input
              type="range"
              min={0}
              max={100}
              value={p.originalShare}
              onChange={(e) => update('originalShare', Number(e.target.value))}
            />
            <small>
              A preference, never a promise to cut a source out of context. Prepared examples
              emphasize original text.
            </small>
          </label>
          <label>
            Discovery appetite · {p.discovery}%
            <input
              type="range"
              min={0}
              max={100}
              value={p.discovery}
              onChange={(e) => update('discovery', Number(e.target.value))}
            />
            <small>
              Starting preference is 15%; automatic exploration sampling is not enabled in this
              prepared library.
            </small>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.visuals}
              onChange={(e) => update('visuals', e.target.checked)}
            />
            Show useful conceptual diagrams
          </label>
        </section>
        <section>
          <h3>Timezone & source access</h3>
          <label>
            Confirm your IANA timezone
            <input
              value={p.timezone}
              required
              placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(e) => update('timezone', e.target.value)}
            />
            <button
              type="button"
              className="text-button"
              onClick={() => update('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)}
            >
              Use my detected timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </button>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.territory === 'US'}
              onChange={(e) => update('territory', e.target.checked ? 'US' : 'unconfirmed')}
            />
            I am accessing from the United States
          </label>
          <p className="muted">
            This prototype has US-only rights evidence. Sources are mirrored Gutenberg editions;
            worldwide access is unavailable pending territorial review.
          </p>
        </section>
        <section>
          <h3>Memory & appearance</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={p.memory}
              onChange={(e) => update('memory', e.target.checked)}
            />
            Use my reading history and feedback for personalization
          </label>
          <div className="form-grid">
            <label>
              Theme
              <select value={p.theme} onChange={(e) => update('theme', e.target.value)}>
                <option value="light">Warm ivory</option>
                <option value="dark">Evening ink</option>
              </select>
            </label>
            <label>
              Reading font size
              <input
                type="number"
                min={16}
                max={28}
                value={p.fontSize}
                onChange={(e) => update('fontSize', Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            Blocked books: {p.excluded.join(', ') || 'none'}. Pinned books:{' '}
            {p.pinned.join(', ') || 'none'}. Edit these in Library.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              act(async () => {
                const r = await api('/reset-personalization', 'POST');
                await save(r.preferences);
              }, 'Personalization reset. Your notes and progress are retained.')
            }
          >
            Reset personalization & disable memory
          </button>
        </section>
        <button className="primary" type="submit">
          Save reading preferences <Icon name="arrow" />
        </button>
      </form>
      <section className="account-settings">
        <h3>Your account</h3>
        <p>{user.email || 'Guest · isolated by this browser cookie · deleted after seven days'}</p>
        <p className="muted">
          Account deletion removes preferences, notes, sessions, feedback, authentication, and
          routines immediately from the live database. SQLite backup copies, if configured by a
          deployment operator, require their own retention policy. No private reading text is sent
          to analytics.
        </p>
        {user.kind === 'guest' && (
          <button className="secondary" onClick={auth}>
            Create an account & keep my reading
          </button>
        )}
        <div className="button-row">
          <button className="text-button" onClick={logout}>
            Sign out
          </button>
          {user.admin && (
            <button className="text-button" onClick={admin}>
              Catalog administration ↗
            </button>
          )}
          <button className="text-button danger" onClick={() => setDeleting(true)}>
            Delete my account & data
          </button>
        </div>
      </section>
      {deleting && (
        <Modal title="Delete your reading space?" close={() => setDeleting(false)}>
          <p>
            This removes your notes, reading progress, schedules, and account from the live server
            database. This cannot be undone.
          </p>
          <button
            className="primary danger"
            onClick={() =>
              act(async () => {
                await api('/account', 'DELETE');
                setDeleting(false);
                await logout();
              })
            }
          >
            Delete my data
          </button>
        </Modal>
      )}
    </>
  );
}
export function Note({ note, act, refresh, open }: any) {
  const [edit, setEdit] = useState(false),
    [text, setText] = useState(note.text);
  return (
    <article className="note">
      <p className="eyebrow">{note.title}</p>
      {note.accessible && <SourceLicense id={JSON.parse(note.manifest).editionId} />}
      <blockquote>
        {note.quote}
        {note.accessible && '… [Notebook preview; open the edition for the full saved span.]'}
      </blockquote>
      {edit ? (
        <label>
          Your note
          <textarea value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <p>{note.text || 'Saved passage · no annotation yet'}</p>
      )}
      <div className="button-row">
        <button
          className="text-button"
          onClick={() =>
            edit
              ? act(async () => {
                  await api('/notes/' + note.id, 'PATCH', { text });
                  setEdit(false);
                  await refresh();
                }, 'Note updated')
              : setEdit(true)
          }
        >
          {edit ? 'Save changes' : 'Edit note'}
        </button>
        <button
          className="text-button"
          disabled={!note.accessible}
          onClick={() => open(note.session_id)}
        >
          Return to edition ↗
        </button>
        <button
          className="text-button"
          onClick={() =>
            act(async () => {
              await api('/notes/' + note.id, 'DELETE');
              await refresh();
            }, 'Note removed')
          }
        >
          Remove
        </button>
      </div>
    </article>
  );
}
export function Schedule({ schedule, preferences, books, act, refresh, open, busy }: any) {
  const [editing, setEditing] = useState<any>(null),
    [move, setMove] = useState<any>(null),
    [moveAt, setMoveAt] = useState(''),
    [replacement, setReplacement] = useState<any>(null),
    [topic, setTopic] = useState('Learning');
  const fresh: Routine = {
    name: 'A quiet chapter',
    weekdays: [1, 2, 3, 4, 5],
    time: '08:00',
    timezone: preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    minutes: preferences.minutes,
    mode: 'topic',
    bookId: 'franklin',
    topic: preferences.topics[0] || 'Learning',
    journey: 'career',
    depth: preferences.depth,
    discovery: preferences.discovery,
    travel: 'home',
    notification: 'in-app',
  };
  const [config, setConfig] = useState<Routine>(fresh);
  const update = (key: keyof Routine, value: any) => setConfig({ ...config, [key]: value });
  const edit = (r?: any) => {
    setConfig(r?.config || fresh);
    setEditing(r || { id: null });
  };
  const zone = preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      <div className="section-heading">
        <h3>Your routines</h3>
        <button className="primary" onClick={() => edit()}>
          + New routine
        </button>
      </div>
      {schedule.routines.length ? (
        <div className="routines">
          {schedule.routines.map((r: any) => (
            <article key={r.id} className="routine">
              <div className="rhythm-symbol">
                <Icon name="Schedule" />
              </div>
              <div>
                <h3>{r.config.name}</h3>
                <p>
                  {r.config.weekdays
                    .map((d: number) => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d])
                    .join(', ')}{' '}
                  · {r.config.time} · {r.config.timezone}
                </p>
                <p>
                  {r.config.minutes} minutes · {r.config.mode} · {r.paused ? 'Paused' : 'Active'} ·{' '}
                  {r.config.travel === 'home'
                    ? 'Home timezone'
                    : 'Travel follows confirmed timezone changes'}
                </p>
              </div>
              <div className="button-row">
                <button className="text-button" onClick={() => edit(r)}>
                  Edit
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    act(
                      async () => {
                        await api('/routines/' + r.id, 'PATCH', { paused: !r.paused });
                        await refresh();
                      },
                      r.paused ? 'Routine resumed' : 'Routine paused',
                    )
                  }
                >
                  {r.paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    act(async () => {
                      await api('/routines/' + r.id, 'DELETE');
                      await refresh();
                    }, 'Routine deleted. Reading history remains.')
                  }
                >
                  Delete
                </button>
                {r.config.travel === 'follow' &&
                  r.config.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act(async () => {
                          await api('/routines/' + r.id, 'PATCH', {
                            config: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                          });
                          await refresh();
                        }, 'Travel timezone updated')
                      }
                    >
                      Confirm detected timezone
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="notice">
          <h3>A rhythm, without the pressure.</h3>
          <p>
            Choose a time and a few days. The server worker prepares an edition independently of
            your browser, up to one hour before reading time.
          </p>
        </div>
      )}
      <div className="section-heading">
        <h3>The next seven days</h3>
        <span className="muted">{zone}</span>
      </div>
      <p className="muted">
        Planned topics are not yet prepared editions. No email or push is sent; readiness appears in
        this app. Missed reading never becomes mandatory homework.
      </p>
      <div className="schedule-list">
        {schedule.occurrences
          .filter((o: any) => Date.parse(o.scheduled_at) < Date.now() + 7 * 86400000)
          .map((o: any) => (
            <article key={o.id}>
              <div className="schedule-date">
                <b>
                  {new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: zone }).format(
                    new Date(o.scheduled_at),
                  )}
                </b>
                <span>
                  {new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: zone }).format(
                    new Date(o.scheduled_at),
                  )}
                </span>
              </div>
              <div className="schedule-content">
                <p className="eyebrow">
                  {o.status === 'ready'
                    ? 'PREPARED EDITION'
                    : o.status === 'pending'
                      ? 'PLANNED TOPIC'
                      : o.status.toUpperCase()}
                </p>
                <h4>
                  {schedule.routines.find((r: any) => r.id === o.routine_id)?.config.name ||
                    'Reading session'}
                </h4>
                <p>{o.local_time}</p>
                {o.error && (
                  <p className="danger">
                    {o.error}
                    {o.retries >= 3 ? ' · Retry limit reached' : ''}
                  </p>
                )}
                <div className="button-row">
                  {o.session_id && (
                    <button className="text-button" onClick={() => open(o.session_id)}>
                      Read / Resume ↗
                    </button>
                  )}
                  {!['skipped', 'completed', 'in-progress'].includes(o.status) && (
                    <>
                      <button
                        className="text-button"
                        onClick={() => {
                          setMove(o);
                          setMoveAt('');
                        }}
                      >
                        Move
                      </button>
                      <button className="text-button" onClick={() => setReplacement(o)}>
                        Replace
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          act(async () => {
                            await api('/occurrences/' + encodeURIComponent(o.id), 'PATCH', {
                              action: 'skip',
                            });
                            await api('/events', 'POST', { name: 'skipped' });
                            await refresh();
                          }, 'Session skipped. Your unfinished reading is still available.')
                        }
                      >
                        Skip
                      </button>
                    </>
                  )}
                  {o.status === 'failed' && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act(async () => {
                          await api('/occurrences/' + encodeURIComponent(o.id), 'PATCH', {
                            action: 'retry',
                          });
                          await refresh();
                        }, 'Retry queued for the server worker')
                      }
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
      </div>
      {!schedule.occurrences.length && (
        <p className="muted">Your preview will appear after you create a routine.</p>
      )}
      <div className="notice">
        <h3>Timing, with care</h3>
        <p>
          Repeated daylight-saving times deliver once, at the first occurrence. Missing local times
          move to the next valid minute. Catch-up is limited to the last 24 hours and ten jobs per
          worker cycle. Future jobs are invalidated when a routine changes.
        </p>
        <p>
          {schedule.worker
            ? `Last worker heartbeat: ${new Date(schedule.worker.heartbeat).toLocaleString()}. ${Date.now() - Date.parse(schedule.worker.heartbeat) > 120000 ? 'Worker is stale. Start the independent worker to prepare editions.' : 'Independent worker recently active.'}`
            : 'Worker has not reported a heartbeat. Start npm run worker on the server.'}
        </p>
      </div>
      {editing && (
        <Modal
          title={editing.id ? 'Edit your reading ritual.' : 'A small ritual, a wider world.'}
          close={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api(
                  editing.id ? '/routines/' + editing.id : '/routines',
                  editing.id ? 'PATCH' : 'POST',
                  editing.id ? { config } : config,
                );
                await api('/events', 'POST', { name: 'routine_created' });
                setEditing(null);
                await refresh();
              }, 'Routine saved');
            }}
          >
            <label>
              Routine name
              <input
                value={config.name}
                required
                maxLength={80}
                onChange={(e) => update('name', e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Reading days</legend>
              <div className="weekdays">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    className={config.weekdays.includes(i + 1) ? 'chip selected' : 'chip'}
                    aria-pressed={config.weekdays.includes(i + 1)}
                    onClick={() =>
                      update(
                        'weekdays',
                        config.weekdays.includes(i + 1)
                          ? config.weekdays.filter((d) => d !== i + 1)
                          : [...config.weekdays, i + 1],
                      )
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label>
                Local time
                <input
                  type="time"
                  value={config.time}
                  required
                  onChange={(e) => update('time', e.target.value)}
                />
              </label>
              <label>
                Minutes
                <input
                  type="number"
                  min={5}
                  max={60}
                  required
                  value={config.minutes}
                  onChange={(e) => update('minutes', Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              Confirm timezone
              <input
                value={config.timezone}
                required
                onChange={(e) => update('timezone', e.target.value)}
              />
            </label>
            <label>
              When traveling
              <select value={config.travel} onChange={(e) => update('travel', e.target.value)}>
                <option value="home">Keep home timezone</option>
                <option value="follow">Follow a newly confirmed travel timezone</option>
              </select>
              <small>
                Follow mode offers an explicit timezone update when this device detects a new zone.
              </small>
            </label>
            <div className="form-grid">
              <label>
                Mode
                <select value={config.mode} onChange={(e) => update('mode', e.target.value)}>
                  <option value="topic">Topic exploration</option>
                  <option value="book">Continue one book</option>
                  <option value="journey">Journey</option>
                  <option value="discovery">Curated discovery</option>
                </select>
              </label>
              <label>
                Depth
                <select value={config.depth} onChange={(e) => update('depth', e.target.value)}>
                  <option value="light">Light</option>
                  <option value="balanced">Balanced</option>
                  <option value="deep">Deep</option>
                </select>
              </label>
            </div>
            {config.mode === 'topic' && (
              <label>
                Topic
                <select value={config.topic} onChange={(e) => update('topic', e.target.value)}>
                  {topics.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            {config.mode === 'book' && (
              <label>
                Book
                <select value={config.bookId} onChange={(e) => update('bookId', e.target.value)}>
                  {books.map((b: any) => (
                    <option value={b.id} key={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {config.mode === 'journey' && (
              <label>
                Journey
                <select value={config.journey} onChange={(e) => update('journey', e.target.value)}>
                  {journeys.map((j) => (
                    <option value={j.id} key={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Discovery appetite · {config.discovery}%
              <input
                type="range"
                min={0}
                max={100}
                value={config.discovery}
                onChange={(e) => update('discovery', Number(e.target.value))}
              />
              <small>
                Recorded preference; prepared-catalog exploration sampling is not enabled.
              </small>
            </label>
            <p className="notice">
              In-app readiness only. Email and push require a connected delivery provider and
              opt-in.
            </p>
            <button className="primary" disabled={busy || config.weekdays.length === 0}>
              Save routine <Icon name="arrow" />
            </button>
          </form>
        </Modal>
      )}
      {move && (
        <Modal title="Make time another day." close={() => setMove(null)}>
          <label>
            New reading time (this device’s timezone)
            <input
              type="datetime-local"
              value={moveAt}
              onChange={(e) => setMoveAt(e.target.value)}
            />
          </label>
          <p className="muted">
            Device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Stored in UTC.
          </p>
          <button
            className="primary"
            disabled={busy || !moveAt}
            onClick={() =>
              act(async () => {
                await api('/occurrences/' + encodeURIComponent(move.id), 'PATCH', {
                  action: 'move',
                  scheduledAt: new Date(moveAt).toISOString(),
                });
                setMove(null);
                await refresh();
              }, 'Session moved')
            }
          >
            Reschedule
          </button>
        </Modal>
      )}
      {replacement && (
        <Modal title="Follow a different curiosity." close={() => setReplacement(null)}>
          <label>
            Replacement topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api('/occurrences/' + encodeURIComponent(replacement.id), 'PATCH', {
                  action: 'replace',
                  topic,
                });
                setReplacement(null);
                await refresh();
              }, 'Replacement edition prepared. Previous reading remains in history.')
            }
          >
            Prepare replacement
          </button>
        </Modal>
      )}
    </>
  );
}
export function Admin({ act }: any) {
  const [data, setData] = useState<any>(null),
    [rights, setRights] = useState<any>(null),
    [evidence, setEvidence] = useState(''),
    [expiry, setExpiry] = useState(''),
    [status, setStatus] = useState('blocked'),
    [importing, setImporting] = useState(false),
    [input, setInput] = useState({
      title: '',
      author: '',
      edition: '',
      sourceUrl: '',
      text: '',
      evidence: '',
    });
  const refresh = async () => setData(await api('/admin'));
  useEffect(() => {
    refresh().catch(() => {});
  }, []);
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATOR ONLY"
        title="Care for the collection."
        description="Source integrity, permissions, editorial reports, and actual worker status."
      />
      {!data ? (
        <p>Loading catalog status…</p>
      ) : (
        <>
          <div className="notice">
            <h3>Provider & feature status</h3>
            <p>
              {data.model.message} Key binding: {data.model.keyPresent ? 'present' : 'absent'}.
              Model jobs: {data.model.jobs?.length || 0}. Cost: {data.model.cost}.
            </p>
            <p>
              Billing, audio, private uploads, email, and push are off. Source import limit:{' '}
              {data.limits.maxSourceBytes.toLocaleString()} characters. Maximum preparation retries:{' '}
              {data.limits.maxRetries}.
            </p>
            <p>Worker heartbeat: {data.worker?.heartbeat || 'Not started'}</p>
            {data.model.jobs?.length > 0 && (
              <details>
                <summary>Model jobs & fidelity-review queue</summary>
                {data.model.jobs.map((job: any) => (
                  <p key={job.id}>
                    {job.created_at} · {job.state} · {job.block_id}
                    {job.error ? ' · ' + job.error : ''}
                    {job.data ? ' · ' + JSON.parse(job.data).editorialStatus : ''}
                  </p>
                ))}
              </details>
            )}
            <button
              className="secondary"
              onClick={() =>
                act(async () => {
                  await api('/admin/scheduler', 'POST');
                  await refresh();
                }, 'Scheduler tick completed')
              }
            >
              Run scheduler now
            </button>
          </div>
          <div className="section-heading">
            <h3>Source editions</h3>
            <button className="secondary" onClick={() => setImporting(true)}>
              Import plain-text source
            </button>
          </div>
          <div className="edition-list">
            {data.books.map((b: any) => (
              <button
                key={b.id}
                onClick={() => {
                  setRights(b);
                  setStatus(b.status);
                  setEvidence('');
                  setExpiry(b.expires_at || '');
                }}
              >
                <span>
                  {b.title}
                  <small>
                    {b.status} · {b.metadata.verification || 'Pending source review'} · territory{' '}
                    {b.territory}
                  </small>
                </span>
                <span>Edit rights ↗</span>
              </button>
            ))}
          </div>
          <div className="section-heading">
            <h3>Failed jobs</h3>
          </div>
          {data.failedJobs.length ? (
            data.failedJobs.map((j: any) => (
              <p key={j.id}>
                {j.local_time}: {j.error} · attempts {j.retries}
              </p>
            ))
          ) : (
            <p className="muted">No failed jobs.</p>
          )}
          <div className="section-heading">
            <h3>Editorial review inbox</h3>
          </div>
          {data.reports.length ? (
            data.reports.map((r: any) => (
              <div className="notice" key={r.id}>
                <p>{r.text}</p>
                <small>
                  {r.created_at} · edition {r.session_id}
                </small>
              </div>
            ))
          ) : (
            <p className="muted">No reports yet.</p>
          )}
        </>
      )}
      {rights && (
        <Modal title="Rights require evidence." close={() => setRights(null)}>
          <p>{rights.title}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api('/admin/rights/' + rights.id, 'PATCH', {
                  status,
                  expiresAt: expiry || null,
                  evidence,
                });
                setRights(null);
                await refresh();
              }, 'Rights state updated. Access checks apply to cached editions too.');
            }}
          >
            <label>
              Rights state
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="allowed">Allowed · US only</option>
                <option value="blocked">Blocked</option>
                <option value="unknown">Unknown · unavailable</option>
              </select>
            </label>
            <label>
              Expiry UTC (optional ISO timestamp)
              <input
                placeholder="2030-01-01T00:00:00Z"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
            <label>
              Evidence & rationale
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <p className="muted">
              Existing use-specific permissions are retained. The rights API supports individual-use
              changes. Unknown use permissions deny access by default.
            </p>
            <button className="primary">Save rights review</button>
          </form>
        </Modal>
      )}
      {importing && (
        <Modal title="Import a verified plain-text source." close={() => setImporting(false)}>
          <p>
            Import is administrator-only and begins with unknown rights and all uses unavailable. An
            import is not a license grant.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api('/admin/import', 'POST', { ...input, territory: 'US', uses: {} });
                setImporting(false);
                await refresh();
              }, 'Source imported, awaiting rights review and editorial preparation.');
            }}
          >
            {(['title', 'author', 'edition', 'sourceUrl'] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  required
                  value={input[key]}
                  onChange={(e) => setInput({ ...input, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Source text
              <textarea
                required
                minLength={1000}
                maxLength={1500000}
                rows={6}
                value={input.text}
                onChange={(e) => setInput({ ...input, text: e.target.value })}
              />
            </label>
            <label>
              Rights evidence
              <textarea
                required
                minLength={50}
                maxLength={4000}
                rows={4}
                value={input.evidence}
                onChange={(e) => setInput({ ...input, evidence: e.target.value })}
              />
            </label>
            <button className="primary">Import for review</button>
          </form>
        </Modal>
      )}
    </>
  );
}

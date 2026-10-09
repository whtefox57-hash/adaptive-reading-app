import { useEffect, useState } from 'react';
import { api } from './api';
import type { Preferences } from '../server/types';
import type { User, Page } from './content';
import { journeys } from './content';
import { Icon, PageTitle, Empty, Modal, BookArtwork, Auth, SourceLicense } from './common';
import { Reader, PreferencesPanel, Note, Schedule, Admin } from './components';
function App() {
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState<Page>('Today'),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [auth, setAuth] = useState<'login' | 'register' | null>(null),
    [intro, setIntro] = useState(false);
  const [books, setBooks] = useState<any[]>([]),
    [templates, setTemplates] = useState<any[]>([]),
    [sessions, setSessions] = useState<any[]>([]),
    [schedule, setSchedule] = useState<any>({ routines: [], occurrences: [] }),
    [notes, setNotes] = useState<any[]>([]),
    [reader, setReader] = useState<any>(null),
    [recommendation, setRecommendation] = useState<any>(null);
  const refresh = async () => {
    const me = await api('/me');
    setUser(me.user ? { ...me.user, modelConnected: me.capabilities.model } : null);
    if (me.user) {
      const [c, t, s, sc, n, recommended] = await Promise.all([
        api('/catalog'),
        api('/templates'),
        api('/sessions'),
        api('/schedule'),
        api('/notes'),
        api('/recommendation'),
      ]);
      setRecommendation(recommended);
      setBooks(c.books);
      setTemplates(t);
      setSessions(s);
      setSchedule(sc);
      setNotes(n);
    } else {
      setSessions([]);
      setNotes([]);
      setBooks([]);
      setTemplates([]);
      setSchedule({ routines: [], occurrences: [] });
    }
  };
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = user?.preferences.theme || 'light';
  }, [user?.preferences.theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const act = async (fn: () => Promise<any>, message?: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (message) setToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const savePrefs = async (p: Partial<Preferences>) => {
    await api('/preferences', 'PATCH', p);
    await refresh();
  };
  const sample = () =>
    act(async () => {
      await api('/guest', 'POST');
      await api('/preferences', 'PATCH', { territory: 'US' });
      const s = await api('/sessions', 'POST', { templateId: 'f-reading', review: true });
      await api('/sessions/' + s.id, 'PATCH', { status: 'in-progress' });
      await refresh();
      setReader(s);
    });
  const prepare = (options: Record<string, any> = {}) =>
    act(async () => {
      if (!user) {
        setIntro(true);
        return;
      }
      if (user.preferences.territory !== 'US') {
        setPage('Preferences');
        setError('Confirm US access in preferences before reading.');
        return;
      }
      const s = await api('/sessions', 'POST', options);
      await api('/sessions/' + s.id, 'PATCH', { status: 'in-progress' });
      await refresh();
      setReader(s);
    });
  const open = (id: string) =>
    act(async () => {
      const s = await api('/sessions/' + id);
      setReader(s);
      await api('/sessions/' + id, 'PATCH', {
        status: s.status === 'completed' ? 'completed' : 'in-progress',
      });
      await api('/events', 'POST', { name: 'session_started' });
    });
  const closeReader = () => {
    setReader(null);
    refresh().catch((e) => setError(e.message));
  };
  const active =
    sessions.find((s) => s.status === 'in-progress' && s.accessible) ||
    sessions.find((s) => s.status === 'ready' && s.accessible);
  const chosen = active ||
    recommendation || {
      title: 'The education you make for yourself',
      manifest: { editionId: 'franklin', estimatedMinutes: 15 },
      reason:
        'A starting point for curious minds: Benjamin Franklin on finding your own education.',
    };
  const next = schedule.occurrences.find(
    (o: any) =>
      ['pending', 'ready', 'failed'].includes(o.status) && Date.parse(o.scheduled_at) > Date.now(),
  );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!reader && (
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => setPage('Today')}
            aria-label="Reading Studio home"
          >
            <span className="brand-mark">
              r<span>•</span>
            </span>
            <span>
              reading
              <br />
              studio<span className="brand-period">.</span>
            </span>
          </button>
          <span className="sidebar-caption">MAKE ROOM FOR IDEAS</span>
          <nav aria-label="Primary navigation">
            {(['Today', 'Library', 'Journeys', 'Schedule', 'Notebook'] as Page[]).map((p) => (
              <button
                key={p}
                aria-label={p}
                className={page === p ? 'nav-item active' : 'nav-item'}
                onClick={() => setPage(p)}
                aria-current={page === p ? 'page' : undefined}
              >
                <Icon name={p} />
                <span>{p}</span>
                {p === 'Today' && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="small-note">
              A little time.
              <br />
              <em>A larger world.</em>
            </div>
            <button
              className="profile"
              onClick={() => (user ? setPage('Preferences') : setAuth('register'))}
            >
              <span className="avatar">{user?.email?.charAt(0).toUpperCase() || 'R'}</span>
              <span>
                {user?.kind === 'account' ? 'Your reading space' : 'Your reading space'}
                <small>{user?.email || 'Begin with a sample'}</small>
              </span>
              <span>↗</span>
            </button>
          </div>
        </aside>
      )}
      <div className={reader ? 'reader-container' : 'main-container'}>
        {!reader && (
          <header className="topbar">
            <span className="breadcrumb">
              Your space <span>/</span> {page}
            </span>
            <div>
              <span className="status-dot" />{' '}
              {user?.kind === 'account'
                ? 'Saved to your account'
                : user
                  ? 'Guest · seven-day server storage'
                  : 'A quieter kind of discovery'}
              <button
                className="topbar-profile"
                aria-label={user ? 'Reading preferences' : 'Sign in'}
                onClick={() => (user ? setPage('Preferences') : setAuth('login'))}
              >
                {user ? (
                  <span className="avatar">{user.email?.charAt(0).toUpperCase() || 'R'}</span>
                ) : (
                  <>Sign in ↗</>
                )}
              </button>
              <button
                aria-label="Toggle reading theme"
                className="icon-button"
                onClick={() =>
                  user
                    ? act(() =>
                        savePrefs({ theme: user.preferences.theme === 'dark' ? 'light' : 'dark' }),
                      )
                    : (document.documentElement.dataset.theme =
                        document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
                }
              >
                <Icon name="moon" />
              </button>
            </div>
          </header>
        )}
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        {loading ? (
          <main id="main">
            <div className="loading">Opening your reading space…</div>
          </main>
        ) : reader ? (
          <Reader
            session={reader}
            user={user!}
            act={act}
            busy={busy}
            close={closeReader}
            setSession={setReader}
            savePrefs={savePrefs}
          />
        ) : (
          <main id="main">
            {page === 'Today' && (
              <>
                <div className="page-intro">
                  <div>
                    <p className="eyebrow">THE DAILY EDITION</p>
                    <h1>
                      A little time,
                      <br />
                      <em>a larger world.</em>
                    </h1>
                    <p className="intro-copy">
                      Good ideas deserve more than a scroll.
                      <br />
                      Settle into something worth reading.
                    </p>
                  </div>
                  <div className="date-stamp">
                    <span>
                      {new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date())}
                    </span>
                    <b>
                      {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
                        new Date(),
                      )}
                    </b>
                    <small>YOUR NEXT CHAPTER</small>
                  </div>
                </div>
                <section className="featured">
                  <div className="featured-copy">
                    <div className="pill">
                      <span className="status-dot" />
                      {active ? 'YOUR EDITION IS READY' : 'A PREPARED FIRST EDITION'}
                    </div>
                    <p className="book-kicker">
                      {chosen.manifest.editionId === 'carnegie'
                        ? 'ANDREW CARNEGIE'
                        : chosen.manifest.editionId === 'napoleon'
                          ? 'LOUIS A. F. DE BOURRIENNE'
                          : 'BENJAMIN FRANKLIN'}{' '}
                      · AUTOBIOGRAPHY & MEMOIR
                    </p>
                    <h2>{chosen.title}</h2>
                    <p className="featured-description">
                      {chosen.manifest.editionId === 'franklin'
                        ? 'A borrowed book. A printing shop. The beginnings of a life shaped by curiosity. Read the original voice, with room to follow what catches yours.'
                        : chosen.reason}
                    </p>
                    <div className="edition-meta">
                      <span>◷ About {chosen.manifest.estimatedMinutes || 15} min</span>
                      <span>Original text + prepared context</span>
                    </div>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => (active ? open(active.id) : user ? prepare() : setIntro(true))}
                    >
                      {busy ? 'Preparing…' : active?.progress ? 'Resume reading' : 'Start reading'}
                      <Icon name="arrow" />
                    </button>
                    {active?.progress > 0 && (
                      <span className="resume-hint">{active.progress}% of this edition read</span>
                    )}
                  </div>
                  <BookArtwork edition={chosen.manifest.editionId} />
                </section>
                <div className="why-session">
                  <span className="tiny-star">✦</span>
                  <div>
                    <strong>Why this edition?</strong>
                    <p>{chosen.reason}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => (user ? setPage('Preferences') : setAuth('register'))}
                  >
                    Tune your interests ↗
                  </button>
                </div>
                <section className="next-section">
                  <div className="section-heading">
                    <h3>Your reading rhythm</h3>
                    <button className="text-button" onClick={() => setPage('Schedule')}>
                      View schedule <span>↗</span>
                    </button>
                  </div>
                  <div className="rhythm">
                    <div className="rhythm-symbol">
                      <Icon name="Schedule" />
                    </div>
                    <div>
                      <strong>
                        {next
                          ? new Intl.DateTimeFormat('en', {
                              weekday: 'long',
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: user?.preferences.timezone || undefined,
                            }).format(new Date(next.scheduled_at))
                          : 'Make a small ritual'}
                      </strong>
                      <p>
                        {next
                          ? `${next.status === 'ready' ? 'Edition prepared' : 'Planned · prepared by the server worker'} · ${next.local_time}`
                          : 'A few quiet minutes, at a time that works for you. No streaks. No catching up.'}
                      </p>
                    </div>
                    <button className="secondary" onClick={() => setPage('Schedule')}>
                      {next ? 'Edit routine' : 'Set a routine'}
                    </button>
                  </div>
                </section>
                <section>
                  <div className="section-heading">
                    <h3>Follow a thread</h3>
                    <button className="text-button" onClick={() => setPage('Journeys')}>
                      All journeys ↗
                    </button>
                  </div>
                  <div className="journey-preview">
                    {journeys.slice(0, 2).map((j) => (
                      <button
                        key={j.id}
                        className="journey-row"
                        onClick={() => (user ? prepare({ journey: j.id }) : setIntro(true))}
                      >
                        <span className="journey-number">{j.number}</span>
                        <span>
                          <h4>{j.title}</h4>
                          <p>{j.subtitle}</p>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    ))}
                  </div>
                </section>
                <footer>
                  READ DEEPLY. WANDER WISELY. <span>Reading Studio · Independent prototype</span>
                </footer>
              </>
            )}
            {page === 'Library' && (
              <>
                <PageTitle
                  eyebrow="THE READING ROOM"
                  title="A library with depth."
                  description="Original voices, carefully attributed. Start with a book, or let an interest lead you."
                />
                {!user ? (
                  <Empty
                    title="Your first reading space"
                    text="Try an edition before setting up your preferences."
                    action={() => setIntro(true)}
                    label="Try a sample"
                  />
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>Available US source editions</h3>
                      <span className="muted">3 source books · 10 prepared starting points</span>
                    </div>
                    <div className="library-list">
                      {books.map((b, i) => (
                        <article className="library-book" key={b.id}>
                          <div className={'book-spine spine-' + b.id}>
                            <span>{String(i + 1).padStart(2, '0')}</span>
                            <b>{b.author}</b>
                          </div>
                          <div>
                            <p className="eyebrow">
                              {b.accessible
                                ? 'AVAILABLE IN THE US'
                                : 'TERRITORY OR RIGHTS CONFIRMATION REQUIRED'}
                            </p>
                            <h2>{b.title}</h2>
                            <p>{b.description}</p>
                            <div className="tags">
                              {b.tags.map((t: string) => (
                                <span key={t}>{t}</span>
                              ))}
                            </div>
                            <details>
                              <summary>Source edition & permissions</summary>
                              <p>{b.metadata.edition}</p>
                              <p>{b.evidence.basis}</p>
                              <p>{b.metadata.verification}</p>
                              <a href={b.metadata.upstream} target="_blank" rel="noreferrer">
                                Gutenberg catalog ↗
                              </a>
                              <p className="hash">SHA-256: {b.hash}</p>
                              <p>
                                Source display, prepared summaries and conceptual visuals allowed in
                                the US. Audio unavailable. Full license retained with original.
                              </p>
                            </details>
                            {b.accessible && <SourceLicense id={b.id} />}
                            <div className="button-row">
                              <button
                                className="secondary"
                                disabled={busy || !b.accessible}
                                onClick={() => prepare({ bookId: b.id })}
                              >
                                Begin this book <Icon name="arrow" />
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  act(
                                    () =>
                                      savePrefs({
                                        pinned: user.preferences.pinned.includes(b.id)
                                          ? user.preferences.pinned.filter((x) => x !== b.id)
                                          : [...user.preferences.pinned, b.id],
                                      }),
                                    'Preference saved',
                                  )
                                }
                              >
                                {user.preferences.pinned.includes(b.id) ? 'Unpin' : 'Pin'}
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  act(
                                    () =>
                                      savePrefs({
                                        excluded: user.preferences.excluded.includes(b.id)
                                          ? user.preferences.excluded.filter((x) => x !== b.id)
                                          : [...user.preferences.excluded, b.id],
                                      }),
                                    'Preference saved',
                                  )
                                }
                              >
                                {user.preferences.excluded.includes(b.id) ? 'Unblock' : 'Block'}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <h3 className="section-heading">Prepared editions</h3>
                    <div className="edition-list">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          disabled={busy || !t.accessible}
                          onClick={() => prepare({ templateId: t.id, review: true })}
                        >
                          <span>
                            {t.title}
                            <small>
                              {books.find((b) => b.id === t.edition_id)?.author} ·{' '}
                              {t.tags.join(' / ')}
                            </small>
                          </span>
                          <Icon name="arrow" />
                        </button>
                      ))}
                    </div>
                    <div className="reference-note">
                      <p className="eyebrow">REFERENCE ONLY</p>
                      <h3>The books we might read next</h3>
                      <p>
                        Walter Isaacson’s work and a modern Napoleon biography are taste references,
                        not supplied or licensed manuscripts. They are unavailable to read here.
                      </p>
                      <button className="text-button" onClick={() => setPage('Preferences')}>
                        Add a favorite to your preferences ↗
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {page === 'Journeys' && (
              <>
                <PageTitle
                  eyebrow="CONNECTED READING"
                  title="Follow a thread."
                  description="A coherent path through original voices. Each edition keeps its own source and point of view."
                />
                <div className="journey-list">
                  {journeys.map((j) => (
                    <article className="journey-large" key={j.id}>
                      <span className="journey-number">{j.number}</span>
                      <div>
                        <p className="eyebrow">{j.books}</p>
                        <h2>{j.title}</h2>
                        <p>{j.subtitle}</p>
                        <ol>
                          {templates
                            .filter((t) => t.journey === j.id)
                            .map((t) => (
                              <li key={t.id}>{t.title}</li>
                            ))}
                        </ol>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => prepare({ journey: j.id })}
                        >
                          Continue this journey <Icon name="arrow" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="muted">
                  Journeys advance through unread prepared openings. Finishing a session never marks
                  a whole book read.
                </p>
              </>
            )}
            {page === 'Schedule' && (
              <>
                <PageTitle
                  eyebrow="YOUR READING RHYTHM"
                  title="Make room for reading."
                  description="A gentle routine, a prepared edition. Miss a day? Your unfinished reading stays here."
                />
                {!user || user.kind !== 'account' ? (
                  <Empty
                    title="A routine that follows you"
                    text="Create an account to save routines across devices. Guest reading stays isolated to this browser’s cookie for seven days."
                    label="Create an account"
                    action={() => setAuth('register')}
                  />
                ) : (
                  <Schedule
                    schedule={schedule}
                    preferences={user.preferences}
                    books={books}
                    act={act}
                    refresh={refresh}
                    open={open}
                    busy={busy}
                  />
                )}
              </>
            )}
            {page === 'Notebook' && (
              <>
                <PageTitle
                  eyebrow="IDEAS TO KEEP"
                  title="Your commonplace book."
                  description="Passages worth returning to, and the thoughts they leave behind."
                />
                {!notes.length ? (
                  <Empty
                    title="Keep what stays with you"
                    text="Save a passage or add a note from any edition. Your words remain private to your account."
                    label="Return to your edition"
                    action={() => (active ? open(active.id) : setPage('Today'))}
                  />
                ) : (
                  <div className="notes">
                    {notes.map((n) => (
                      <Note key={n.id} note={n} act={act} refresh={refresh} open={open} />
                    ))}
                  </div>
                )}
                <div className="section-heading">
                  <h3>Reading history</h3>
                </div>
                {sessions.length ? (
                  <div className="edition-list">
                    {sessions.map((s) => (
                      <button key={s.id} disabled={!s.accessible} onClick={() => open(s.id)}>
                        <span>
                          {s.title}
                          <small>
                            {s.status} · {s.progress}% of edition ·{' '}
                            {new Date(s.created_at).toLocaleDateString()}
                          </small>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Your first chapter is still ahead.</p>
                )}
              </>
            )}
            {page === 'Preferences' && user && (
              <PreferencesPanel
                user={user}
                act={act}
                save={savePrefs}
                logout={() =>
                  act(async () => {
                    await api('/logout', 'POST');
                    setPage('Today');
                    await refresh();
                  })
                }
                auth={() => setAuth('register')}
                admin={() => setPage('Admin')}
              />
            )}
            {page === 'Admin' && user?.admin && <Admin act={act} />}
          </main>
        )}
      </div>
      {intro && (
        <Modal title="A first chapter, without the setup." close={() => setIntro(false)}>
          <p>
            Read a prepared edition from Franklin’s autobiography. Commentary is editorially
            prepared; live AI is not connected.
          </p>
          <p>
            The prototype sources are verified as public domain in the United States only. Confirm
            you are accessing from the US before continuing.
          </p>
          <p className="notice">
            Guest preferences, reading progress, and notes are stored on this server for seven days,
            isolated by this browser’s cookie. An account keeps them across devices.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setIntro(false);
              sample();
            }}
          >
            I’m in the US · Start reading <Icon name="arrow" />
          </button>
          <button
            className="text-button"
            onClick={() => {
              setIntro(false);
              setAuth('register');
            }}
          >
            Create an account instead
          </button>
        </Modal>
      )}
      {auth && (
        <Auth
          mode={auth}
          setMode={setAuth}
          close={() => setAuth(null)}
          act={act}
          busy={busy}
          success={async () => {
            setAuth(null);
            await refresh();
            setPage('Preferences');
          }}
        />
      )}
    </div>
  );
}

export default App;

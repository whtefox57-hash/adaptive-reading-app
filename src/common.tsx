import { useEffect, useRef, useState } from 'react';
import { api } from './api';
export function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    Today: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    Library: (
      <>
        <path d="M4 4h4v16H4zM10 4h4v16h-4zM17 4l4 15-3 1-4-15z" />
      </>
    ),
    Journeys: (
      <>
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M7 6h8a4 4 0 010 8H9a3 3 0 000 6h6" />
      </>
    ),
    Schedule: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6m10-6v6M3 10h18m-13 5h3" />
      </>
    ),
    Notebook: (
      <>
        <path d="M5 3h14v18H5zM3 7h4m-4 5h4m-4 5h4m3-9h6m-6 4h6" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6l6 6-6 6" />,
    moon: <path d="M20 14A9 9 0 0110 3a9 9 0 1010 11z" />,
    close: <path d="M6 6l12 12M6 18L18 6" />,
  };
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="empty">
      <span className="tiny-star">✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="secondary" onClick={action}>
        {label} ↗
      </button>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]') || [],
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const fs = focusable();
        if (e.shiftKey && document.activeElement === fs[0]) {
          e.preventDefault();
          fs.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === fs.at(-1)) {
          e.preventDefault();
          fs[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="modal-close icon-button" onClick={close} aria-label="Close dialog">
          <Icon name="close" />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
export function BookArtwork({ edition }: { edition: string }) {
  return (
    <div className={'book-art art-' + edition} aria-hidden="true">
      <div className="art-lines" />
      <span className="art-small">THE ORIGINAL VOICE</span>
      <div className="art-frame">
        <span className="art-no">
          {edition === 'franklin' ? '01' : edition === 'carnegie' ? '02' : '03'}
        </span>
        <div className="art-orbit">
          <div className="orbit-middle" />
          <div className="orbit-dot" />
        </div>
        <p>
          {edition === 'franklin'
            ? 'A life of\ncuriosity.'
            : edition === 'carnegie'
              ? 'Ideas into\nindustry.'
              : 'Ambition &\njudgment.'}
        </p>
        <small>
          {edition === 'franklin'
            ? 'BENJAMIN FRANKLIN'
            : edition === 'carnegie'
              ? 'ANDREW CARNEGIE'
              : 'BOURRIENNE’S ACCOUNT'}
        </small>
      </div>
      <span className="art-bottom">READING STUDIO / SOURCE EDITIONS</span>
    </div>
  );
}
export function Auth({ mode, setMode, close, act, busy, success }: any) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  return (
    <Modal title={mode === 'register' ? 'Make this space yours.' : 'Welcome back.'} close={close}>
      <p>
        {mode === 'register'
          ? 'Keep your reading, routines, and private notes across devices.'
          : 'Continue exactly where you left off.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await api('/' + mode, 'POST', { email, password });
            await success();
          });
        }}
      >
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password <small>At least 12 characters</small>
          <input
            type="password"
            minLength={12}
            maxLength={200}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Opening…' : mode === 'register' ? 'Create account' : 'Sign in'}{' '}
          <Icon name="arrow" />
        </button>
      </form>
      <p className="muted">
        No promotional emails. Password reset and email verification are not yet connected; use a
        test account.
      </p>
      <button
        className="text-button"
        onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
      >
        {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </Modal>
  );
}

export function SourceLicense({ id, notice }: { id: string; notice?: string }) {
  return (
    <div className="source-license">
      <p>
        {notice ||
          'This eBook is for the use of anyone anywhere at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org'}
      </p>
      <a href={'/api/books/' + id + '/license'} target="_blank" rel="noreferrer">
        Full Project Gutenberg license →
      </a>
      <span>
        {' '}
        US prototype access. No worldwide clearance asserted. No affiliation or endorsement.
      </span>
    </div>
  );
}

import { randomBytes, createHash, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { one, run, parse } from './db';
import { defaults } from './types';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function passwordHash(s: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(s, salt, 64).toString('hex');
}
export function passwordMatches(s: string, stored: string) {
  const [salt, key] = stored.split(':');
  const a = scryptSync(s, salt, 64),
    b = Buffer.from(key, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function user(req: Request) {
  const token = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('reading_auth='))
    ?.slice(13);
  if (!token) return undefined;
  const u = one<any>(
    'SELECT u.* FROM auth a JOIN users u ON u.id=a.user_id WHERE a.token_hash=? AND a.expires_at>?',
    hash(token),
    new Date().toISOString(),
  );
  return u ? { ...u, preferences: parse(u.preferences) } : undefined;
}
export function publicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    kind: u.kind,
    admin: !!u.admin,
    preferences: typeof u.preferences === 'string' ? parse(u.preferences) : u.preferences,
  };
}
export function issueCookie(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString('hex');
  run(
    'INSERT INTO auth VALUES(?,?,?)',
    hash(token),
    userId,
    new Date(Date.now() + 30 * 86400000).toISOString(),
  );
  res.cookie('reading_auth', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true' || req.secure,
    maxAge: 30 * 86400000,
    path: '/',
  });
}
export function guest(req: Request, res: Response) {
  const existing = user(req);
  if (existing) return existing;
  const id = randomUUID();
  run(
    'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
    id,
    null,
    null,
    'guest',
    new Date().toISOString(),
    JSON.stringify(defaults),
    0,
  );
  issueCookie(req, res, id);
  return one<any>('SELECT * FROM users WHERE id=?', id);
}
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = user(req);
  if (!u) {
    res.status(401).json({ error: 'Sign in or start a guest sample.' });
    return;
  }
  res.locals.user = u;
  next();
}
const attempts = new Map<string, { n: number; reset: number }>();
export function limitAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) {
    a = { n: 0, reset: now + 900000 };
    attempts.set(key, a);
  }
  if (++a.n > 40) {
    res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    return;
  }
  if (attempts.size > 10000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  next();
}

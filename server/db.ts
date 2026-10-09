import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export const dbPath = resolve(process.env.DATABASE_PATH || '.runtime/reading.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,password TEXT,kind TEXT NOT NULL,created_at TEXT NOT NULL,preferences TEXT NOT NULL,admin INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS auth(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT NOT NULL,tags TEXT NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS editions(id TEXT PRIMARY KEY,book_id TEXT REFERENCES books(id),metadata TEXT NOT NULL,source_text TEXT NOT NULL,hash TEXT NOT NULL,ingestion_status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rights(edition_id TEXT PRIMARY KEY REFERENCES editions(id),status TEXT NOT NULL,territory TEXT NOT NULL,uses TEXT NOT NULL,evidence TEXT NOT NULL,expires_at TEXT);
CREATE TABLE IF NOT EXISTS source_spans(id TEXT PRIMARY KEY,edition_id TEXT REFERENCES editions(id),start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,location TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,edition_id TEXT REFERENCES editions(id),title TEXT NOT NULL,tags TEXT NOT NULL,summary TEXT NOT NULL,explanation TEXT NOT NULL,reflection TEXT NOT NULL,span_id TEXT REFERENCES source_spans(id),journey TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,config TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,paused INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS occurrences(id TEXT PRIMARY KEY,routine_id TEXT REFERENCES routines(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL,scheduled_at TEXT NOT NULL,local_time TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',session_id TEXT,retries INTEGER DEFAULT 0,retry_at TEXT,error TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,template_id TEXT REFERENCES templates(id),occurrence_id TEXT UNIQUE,title TEXT NOT NULL,blocks TEXT NOT NULL,manifest TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ready',progress INTEGER DEFAULT 0,expanded TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,span_id TEXT REFERENCES source_spans(id),text TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,kind TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS notifications(occurrence_id TEXT PRIMARY KEY REFERENCES occurrences(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'unavailable',provider TEXT,sent_at TEXT);
CREATE TABLE IF NOT EXISTS generation_jobs(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,block_id TEXT,state TEXT NOT NULL,data TEXT,created_at TEXT NOT NULL,error TEXT);
CREATE TABLE IF NOT EXISTS worker_status(id INTEGER PRIMARY KEY CHECK(id=1),heartbeat TEXT NOT NULL,last_result TEXT NOT NULL);
`);
export function one<T = any>(sql: string, ...args: any[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}
export function all<T = any>(sql: string, ...args: any[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}
export function run(sql: string, ...args: any[]) {
  return db.prepare(sql).run(...args);
}
export const parse = <T = any>(s: string): T => JSON.parse(s);

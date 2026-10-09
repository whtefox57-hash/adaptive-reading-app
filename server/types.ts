import { z } from 'zod';
export const preferencesSchema = z.object({
  purpose: z
    .enum(['pleasure', 'understanding', 'application', 'combination'])
    .default('understanding'),
  topics: z.array(z.string().max(60)).max(20).default(['Learning', 'Biography']),
  favorites: z.string().max(500).default(''),
  depth: z.enum(['light', 'balanced', 'deep']).default('balanced'),
  minutes: z.number().int().min(5).max(60).default(15),
  visuals: z.boolean().default(true),
  originalShare: z.number().min(0).max(100).default(80),
  discovery: z.number().min(0).max(100).default(15),
  mode: z.enum(['book', 'topic', 'discovery']).default('topic'),
  bookId: z.string().default(''),
  excluded: z.array(z.string()).max(100).default([]),
  pinned: z.array(z.string()).max(100).default([]),
  memory: z.boolean().default(true),
  territory: z.enum(['US', 'unconfirmed']).default('unconfirmed'),
  timezone: z.string().default(''),
  theme: z.enum(['light', 'dark']).default('light'),
  fontSize: z.number().min(16).max(28).default(20),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaults = preferencesSchema.parse({});
export const routineSchema = z.object({
  name: z.string().trim().min(1).max(80),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(80),
  minutes: z.number().int().min(5).max(60),
  mode: z.enum(['book', 'topic', 'discovery', 'journey']),
  bookId: z.string().default(''),
  topic: z.string().max(60).default(''),
  journey: z.string().default(''),
  depth: z.enum(['light', 'balanced', 'deep']).default('balanced'),
  discovery: z.number().min(0).max(100).default(15),
  travel: z.enum(['home', 'follow']).default('home'),
  notification: z.literal('in-app').default('in-app'),
});
export type Routine = z.infer<typeof routineSchema>;
export type Block = {
  id: string;
  type: 'original' | 'summary' | 'explanation' | 'visual' | 'reflection';
  text: string;
  spanId?: string;
  nodes?: string[];
  label: string;
};
export const weights = {
  tag: 4,
  continuity: 9,
  purpose: 2,
  duration: 1,
  depth: 1,
  novelty: 3,
  positive: 8,
  negative: -12,
  pinned: 6,
};

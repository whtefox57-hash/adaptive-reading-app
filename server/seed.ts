import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { db, one, run } from './db';
const metadata = JSON.parse(readFileSync('data/sources/manifest.json', 'utf8'));
const books = [
  {
    id: 'franklin',
    title: 'The Autobiography of Benjamin Franklin',
    author: 'Benjamin Franklin',
    edition: 'Charles W. Eliot, editor; P. F. Collier & Son, 1909. Gutenberg #148, updated 2014.',
    tags: ['Learning', 'Biography', 'Craft', 'Community'],
    description: 'A life assembled through reading, experiment, friendship, and public work.',
  },
  {
    id: 'carnegie',
    title: 'Autobiography of Andrew Carnegie',
    author: 'Andrew Carnegie',
    edition:
      'John C. Van Dyke, editor. Gutenberg #17976, released 2006; original autobiography published 1920.',
    tags: ['Industry', 'Biography', 'Organizations', 'Career'],
    description:
      'From a messenger’s first opportunity to the growth of an industrial organization.',
  },
  {
    id: 'napoleon',
    title: 'Memoirs of Napoleon Bonaparte — Complete',
    author: 'Louis Antoine Fauvelet de Bourrienne',
    edition:
      'Gutenberg #3567, updated 2013. Translation not attributed in the source file; collected edition with editorial annotations.',
    tags: ['Strategy', 'History', 'Ambition', 'Biography'],
    description:
      'An intimate, contested account of ambition and power. Read as Bourrienne’s perspective.',
  },
];
const seeds = [
  [
    'f-reading',
    'franklin',
    'The education you make for yourself',
    ['Learning', 'Craft'],
    25724,
    'career',
    'Franklin describes an early appetite for books and the apprenticeship that made more reading possible. Access came through borrowed books and the generosity of people around him.',
    'This is retrospective autobiography: Franklin selects the experiences that explain the person he became. His account of teaching himself is inseparable from the people and working conditions that enabled it.',
    'Where has an informal source of learning changed your direction?',
    ['Borrow books', 'Practice a craft', 'Seek feedback'],
  ],
  [
    'f-junto',
    'franklin',
    'A small circle, a larger world',
    ['Community', 'Organizations'],
    128912,
    'organizations',
    'Franklin describes the Junto as a gathering for mutual improvement. Its questions and essays made conversation a recurring practice rather than a chance encounter.',
    'The club is a historical example of organized inquiry, not proof that any modern group will produce the same results. Notice how the rules shape the conversation.',
    'What question would you bring to a circle of curious friends?',
    ['Questions', 'Conversation', 'Shared practice'],
  ],
  [
    'f-library',
    'franklin',
    'Making knowledge common',
    ['Community', 'Learning'],
    167870,
    'organizations',
    'Franklin recalls turning a small shared collection into a subscription library. Recruiting subscribers required both a practical plan and a way to reduce resistance to the proposal.',
    'The account links access to books with civic organization. It reflects Franklin’s own assessment of the library’s effects, rather than an independent measure of educational outcomes.',
    'What makes a useful resource genuinely accessible?',
    ['Shared books', 'Subscription', 'Public access'],
  ],
  [
    'f-habits',
    'franklin',
    'The imperfect art of improvement',
    ['Learning', 'Ambition'],
    177532,
    'judgment',
    'Franklin sets out his project of moral improvement, recognizing that knowing what is right does not by itself form a habit. He tries to turn intentions into repeated practice.',
    'His virtue scheme is a personal historical framework, not a universal psychological prescription. Read both the ambition and the limits of his self-description.',
    'Which intention is hardest to translate into an everyday practice?',
    ['Intention', 'Attention', 'Practice'],
  ],
  [
    'c-messenger',
    'carnegie',
    'An opening across the river',
    ['Career', 'Biography'],
    71205,
    'career',
    'Carnegie remembers the opportunity to become a telegraph messenger. His family debates the change, and he goes to meet the manager with his father’s support.',
    'This recollection gives family decisions and small opportunities a central role. It is an account of one career, not a promise of social mobility for everyone.',
    'What did this opening make possible that the previous job could not?',
    ['Family decision', 'New work', 'Local knowledge'],
  ],
  [
    'c-telegraph',
    'carnegie',
    'Learning to hear a new language',
    ['Learning', 'Industry'],
    105066,
    'career',
    'Practice before the operators arrived gave Carnegie a route into telegraphy. He describes learning the instruments and taking on responsibility as his skills developed.',
    'Carnegie’s account highlights initiative, but the access to equipment and the trust of coworkers also matter. Avoid reducing the scene to a solitary success story.',
    'What form of practice became possible because someone trusted you?',
    ['Access', 'Practice', 'Responsibility'],
  ],
  [
    'c-steel',
    'carnegie',
    'When iron gave way to steel',
    ['Industry', 'Organizations'],
    319534,
    'organizations',
    'Carnegie recounts his interest in the Bessemer process and the problem of replacing iron rails. Technical possibility and practical railway demand meet in his description.',
    'The account is written by an industrial participant who benefited from these changes. It is useful evidence of his perspective, not a complete account of labor or the industry.',
    'Which details connect the technology to a practical need?',
    ['Railway demand', 'Steel process', 'Investment'],
  ],
  [
    'n-school',
    'napoleon',
    'Before the legend: a school friendship',
    ['History', 'Biography'],
    55600,
    'judgment',
    'Bourrienne recalls his friendship with the young Bonaparte and describes their school years. The intimacy of the narrator gives this account its appeal, while also shaping its point of view.',
    'Bourrienne’s recollections and the edition’s annotations sometimes differ. Treat remembered conversations and character judgments as attributed claims, not settled historical fact.',
    'How does friendship change the way a biographer sees a subject?',
    ['Shared school years', 'Recollection', 'Later interpretation'],
  ],
  [
    'n-ambition',
    'napoleon',
    'Restlessness after victory',
    ['Strategy', 'Ambition'],
    236111,
    'judgment',
    'Bourrienne portrays Bonaparte as restless when peace appeared to close his military career, and interested in a new role in the Republic. The passage connects personal ambition with institutional constraints.',
    'This is the narrator’s interpretation of Bonaparte’s motives. It does not establish a universal relationship between restlessness and strategic ability.',
    'Which parts describe events, and which infer motive?',
    ['Military position', 'Political aspiration', 'Institutional limits'],
  ],
  [
    'n-egypt',
    'napoleon',
    'An expedition and its uncertain horizon',
    ['Strategy', 'History'],
    307247,
    'judgment',
    'Bourrienne describes the renewed project of an Egyptian expedition and the thinking he attributes to Bonaparte and his circle. The account includes competing views of what France should have done.',
    'The narrator participated in these events and later judged them. Read his judgments beside the quoted documents and editorial notes rather than treating them as one impartial voice.',
    'What uncertainty is visible before an ambitious decision is made?',
    ['Proposed expedition', 'Debate', 'Uncertain consequences'],
  ],
] as const;
export function seed() {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const b of books) {
      const m = metadata.find((m: any) => m.id === b.id);
      const text = readFileSync(`data/sources/${b.id}.txt`, 'utf8');
      if (createHash('sha256').update(text).digest('hex') !== m.textSha256)
        throw Error(`Source integrity failure: ${b.id}`);
      run(
        'INSERT OR IGNORE INTO books VALUES(?,?,?,?,?)',
        b.id,
        b.title,
        b.author,
        JSON.stringify(b.tags),
        b.description,
      );
      run(
        'INSERT OR IGNORE INTO editions VALUES(?,?,?,?,?,?)',
        b.id,
        b.id,
        JSON.stringify({ ...m, edition: b.edition }),
        text,
        m.textSha256,
        'mirror-verified',
      );
      run(
        'INSERT OR IGNORE INTO rights VALUES(?,?,?,?,?,?)',
        b.id,
        'allowed',
        'US',
        JSON.stringify(m.uses),
        JSON.stringify({
          basis:
            'Embedded Project Gutenberg full license and public-domain-in-US declaration; no worldwide clearance asserted.',
          url: m.upstream,
          mirror: m.retrievedFrom,
          verifiedAt: m.verifiedAt,
          review: 'Mirror text reviewed; direct official-site verification pending network access.',
          terms:
            'Free access only. Full license and original source supplied with every edition. No trademark endorsement.',
        }),
        null,
      );
    }
    for (const s of seeds) {
      const [id, edition, title, tags, approx, journey, summary, explanation, reflection, nodes] =
        s;
      const text = one<any>('SELECT source_text FROM editions WHERE id=?', edition)!.source_text;
      const paragraphs = [...text.matchAll(/\S[^\n]*(?:\n[^\n]+)*/g)];
      const pi = paragraphs.findIndex((p: any) => p.index >= approx);
      const start = paragraphs[pi].index!;
      let end = start,
        words = 0;
      for (let i = pi; i < paragraphs.length && words < 1100; i++) {
        const p = paragraphs[i];
        words += p[0].split(/\s+/).length;
        end = p.index! + p[0].length;
      }
      const location = `Source characters ${start}–${end} (normalized edition)`;
      run(
        'INSERT OR IGNORE INTO source_spans VALUES(?,?,?,?,?)',
        id,
        edition,
        start,
        end,
        location,
      );
      run(
        'INSERT OR IGNORE INTO templates VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        edition,
        title,
        JSON.stringify(tags),
        summary,
        explanation,
        reflection,
        id,
        journey,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export const visualNodes: Record<string, string[]> = Object.fromEntries(
  seeds.map((s) => [s[0], [...s[9]]]),
);
seed();

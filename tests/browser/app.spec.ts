import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const password = 'A test-only reading password 2026';
async function account(request: any, topics = ['Learning', 'Craft']) {
  const email = `reader-${Date.now()}-${Math.random()}@test.example`;
  const r = await request.post('/api/register', { data: { email, password } });
  expect(r.status()).toBe(201);
  await request.patch('/api/preferences', {
    data: { territory: 'US', timezone: 'UTC', topics, minutes: 5 },
  });
  return email;
}
test('a guest starts a substantive sample and reader controls preserve state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await page.getByRole('button', { name: 'I’m in the US · Start reading' }).click();
  await expect(
    page.getByRole('heading', { name: 'The education you make for yourself' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand +', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Condense −' })).toBeVisible();
  await page.getByRole('button', { name: 'Condense −' }).click();
  await page.getByRole('button', { name: 'Show source ↗', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('normalized edition');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save passage', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved to your notebook');
  await page.getByRole('button', { name: 'Annotate', exact: true }).click();
  await page.getByLabel('Your note').fill('A private note on borrowed books.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: '← Your reading space' }).click();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(page.getByText('A private note on borrowed books.', { exact: true })).toBeVisible();
});
test('new account preferences, edition, routine, reload and independent login persist', async ({
  page,
  browser,
}) => {
  const email = await account(page.request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'The education you make for yourself' }),
  ).toBeVisible();
  const sessions = await (await page.request.get('/api/sessions')).json();
  const id = sessions[0].id;
  await page.request.patch('/api/sessions/' + id, {
    data: { progress: 37, status: 'in-progress', expanded: ['passage'] },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume reading', exact: true }).click();
  await expect(page.getByText(/Progress saved 37%/)).toBeVisible();
  await page.getByRole('button', { name: '← Your reading space' }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: '+ New routine' }).click();
  await page.getByLabel('Routine name').fill('An evening chapter');
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'An evening chapter', exact: true, level: 3 }),
  ).toBeVisible();
  const context = await browser.newContext();
  const r = await context.request.post('http://127.0.0.1:3100/api/login', {
    data: { email, password },
  });
  expect(r.status()).toBe(200);
  const me = await (await context.request.get('http://127.0.0.1:3100/api/me')).json();
  expect(me.user.preferences.topics).toEqual(['Learning', 'Craft']);
  const saved = await (
    await context.request.get('http://127.0.0.1:3100/api/sessions/' + id)
  ).json();
  expect(saved.progress).toBeGreaterThanOrEqual(37);
  const routines = await (await context.request.get('http://127.0.0.1:3100/api/schedule')).json();
  expect(routines.routines[0].config.name).toBe('An evening chapter');
  await page.request.post('/api/logout');
  await page.request.post('/api/login', { data: { email, password } });
  expect(
    (await (await page.request.get('/api/sessions/' + id)).json()).progress,
  ).toBeGreaterThanOrEqual(37);
  await context.close();
});
test('second user cannot access notes, editions, routines or administrator controls', async ({
  page,
  browser,
}) => {
  await account(page.request);
  const edition = await (await page.request.post('/api/sessions', { data: {} })).json();
  const note = await (
    await page.request.post('/api/notes', {
      data: {
        sessionId: edition.id,
        spanId: edition.blocks.find((b: any) => b.type === 'original').spanId,
        text: 'owner-only text',
      },
    })
  ).json();
  const context = await browser.newContext();
  await account(context.request, ['Strategy']);
  expect(
    (await context.request.get('http://127.0.0.1:3100/api/sessions/' + edition.id)).status(),
  ).toBe(404);
  expect(
    (
      await context.request.patch('http://127.0.0.1:3100/api/notes/' + note.id, {
        data: { text: 'attack' },
      })
    ).status(),
  ).toBe(404);
  expect((await context.request.get('http://127.0.0.1:3100/api/admin')).status()).toBe(403);
  expect(await (await context.request.get('http://127.0.0.1:3100/api/notes')).json()).toEqual([]);
  expect(
    (
      await context.request.post('http://127.0.0.1:3100/api/preferences', {
        headers: { Origin: 'https://attacker.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await context.close();
});
test('independent worker prepares an edition with the reader signed out, exactly once', async ({
  page,
}) => {
  const email = await account(page.request);
  const time = new Date(Date.now() + 5 * 60000).toISOString().slice(11, 16);
  const r = await page.request.post('/api/routines', {
    data: {
      name: 'Worker acceptance',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      time,
      timezone: 'UTC',
      minutes: 5,
      mode: 'topic',
      topic: 'Learning',
    },
  });
  expect(r.status()).toBe(201);
  await page.request.post('/api/logout');
  await expect
    .poll(
      async () => {
        await page.request.post('/api/login', { data: { email, password } });
        const schedule = await (await page.request.get('/api/schedule')).json();
        await page.request.post('/api/logout');
        return schedule.occurrences.filter((o: any) => o.status === 'ready').length;
      },
      { timeout: 45000, intervals: [3000, 5000] },
    )
    .toBe(1);
  await page.request.post('/api/login', { data: { email, password } });
  const sessions = await (await page.request.get('/api/sessions')).json();
  expect(sessions.length).toBe(1);
  expect(sessions[0].title).toBeTruthy();
});
for (const width of [375, 768, 1440])
  test(`responsive reading surface at ${width}px with no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'A little time, a larger world.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/reading-studio-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Start reading', exact: true }).click();
    await page.getByRole('button', { name: 'I’m in the US · Start reading' }).click();
    await expect(
      page.getByRole('heading', { name: 'The education you make for yourself' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/reading-studio-reader-${width}.png`, fullPage: false });
  });

test('visible onboarding accepts preferences and a routine without database intervention', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email', { exact: true }).fill(`onboarding-${Date.now()}@test.example`);
  await page.getByLabel('Password At least 12 characters').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stay curious, on your terms.' })).toBeVisible();
  await page.getByRole('button', { name: 'Strategy +', exact: true }).click();
  await page.getByLabel('Confirm your IANA timezone').fill('UTC');
  await page.getByLabel('I am accessing from the United States').check();
  await page.getByRole('button', { name: 'Save reading preferences' }).click();
  await expect(page.getByRole('status')).toContainText('Reading preferences saved');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: '+ New routine' }).click();
  await page.getByLabel('Routine name').fill('Morning curiosity');
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Morning curiosity', level: 3 })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(page.locator('.prose')).toBeVisible();
  expect((await page.locator('.prose').innerText()).split(/\s+/).length).toBeGreaterThan(500);
});
test('authorized administrator can revoke cached access and run the actual scheduler', async ({
  page,
}) => {
  const email = await account(page.request);
  execFileSync('node_modules/.bin/tsx', ['scripts/admin.ts', email], {
    env: { ...process.env, DATABASE_PATH: process.env.READING_TEST_DATABASE },
    stdio: 'pipe',
  });
  const session = await (
    await page.request.post('/api/sessions', { data: { bookId: 'franklin' } })
  ).json();
  expect((await page.request.get('/api/admin')).status()).toBe(200);
  await page.goto('/');
  await page.getByRole('button', { name: 'Reading preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Catalog administration ↗' }).click();
  await expect(page.getByRole('heading', { name: 'Care for the collection.' })).toBeVisible();
  await page.getByRole('button', { name: 'Run scheduler now' }).click();
  await expect(page.getByRole('status')).toContainText('Scheduler tick completed');
  const change = await page.request.patch('/api/admin/rights/franklin', {
    data: {
      status: 'blocked',
      expiresAt: null,
      evidence: 'Acceptance test: temporary revocation of cached edition access.',
    },
  });
  expect(change.status()).toBe(200);
  expect((await page.request.get('/api/sessions/' + session.id)).status()).toBe(400);
  expect((await page.request.get('/api/books/franklin/original')).status()).toBe(403);
  await page.request.patch('/api/admin/rights/franklin', {
    data: {
      status: 'allowed',
      expiresAt: null,
      evidence: 'Acceptance test concluded: restore embedded Gutenberg US license evidence.',
    },
  });
  expect((await page.request.get('/api/sessions/' + session.id)).status()).toBe(200);
});
test('topic changes preserve the prior edition and disconnected/empty/failure states are explicit', async ({
  page,
}) => {
  await account(page.request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep what stays with you' })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(
    page.getByText('Live AI questions require a model connection.', { exact: false }),
  ).toBeVisible();
  const prior = (await (await page.request.get('/api/sessions')).json())[0];
  const disconnected = await page.request.post('/api/sessions/' + prior.id + '/adapt', {
    data: { mode: 'explain' },
  });
  expect(disconnected.status()).toBe(503);
  expect(
    (await (await page.request.get('/api/sessions/' + prior.id)).json()).manifest.model,
  ).toBeNull();
  await expect.poll(() => Date.now() - Date.parse(prior.created_at)).toBeGreaterThanOrEqual(1000);
  await page.getByLabel('Change topic').selectOption('Strategy');
  await expect(page.getByRole('heading', { name: 'Restlessness after victory' })).toBeVisible();
  expect((await page.request.get('/api/sessions/' + prior.id)).status()).toBe(200);
  await page.route('**/api/sessions/*/question', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Source search is temporarily unavailable. Please retry.' }),
    }),
  );
  await page.getByLabel('Search the source').fill('Egypt');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
});

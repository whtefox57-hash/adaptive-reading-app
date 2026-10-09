import test from 'node:test';
import assert from 'node:assert/strict';
import { groundedModel, validateModelOutput, modelStatus, type ModelSource } from '../server/model';
const sources: ModelSource[] = [
  {
    id: 'source-span-a',
    hash: 'test-source-hash',
    location: 'Source characters in a test fixture',
    text: 'From a child I was fond of reading, and all the little money that came into my hands was ever laid out in books.',
  },
];
const valid = {
  text: 'Franklin describes an appetite for reading and recalls spending his available money on books.',
  sourceSpanIds: ['source-span-a'],
};
test('model validation rejects references outside authorized windows, unsupported quantities and invented quotations', () => {
  assert.deepEqual(validateModelOutput(valid, sources), valid);
  assert.throws(() =>
    validateModelOutput({ ...valid, sourceSpanIds: ['other-user-span'] }, sources),
  );
  assert.throws(() =>
    validateModelOutput(
      { ...valid, text: 'Franklin improved his learning by 40 percent.' },
      sources,
    ),
  );
  assert.throws(() =>
    validateModelOutput(
      { ...valid, text: 'Franklin read twenty books before entering the shop.' },
      sources,
    ),
  );
  assert.throws(() =>
    validateModelOutput(
      { ...valid, text: 'Franklin said “A fabricated sentence about enterprise.”' },
      sources,
    ),
  );
  assert.throws(() =>
    validateModelOutput({ ...valid, text: '<script>steal private notes</script>' }, sources),
  );
});
test('disconnected model fails explicitly without performing a request', async () => {
  const previous = process.env.MODEL_API_KEY;
  delete process.env.MODEL_API_KEY;
  let calls = 0;
  try {
    assert.equal(modelStatus().connected, false);
    await assert.rejects(
      () =>
        groundedModel('explain', sources, '', async () => {
          calls++;
          throw Error('unexpected network');
        }),
      /Connect MODEL_API_KEY/,
    );
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = previous;
  }
});
test('mock transport exercises structured request, bounded context and recorded unreviewed output; not live-provider verification', async () => {
  const previous = process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY = 'mock-only-test-credential';
  let calls = 0;
  try {
    const result = await groundedModel('explain', sources, '', async (url, init) => {
      calls++;
      assert.equal(new URL(String(url)).protocol, 'https:');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.response_format.type, 'json_schema');
      assert.match(body.messages[0].content, /untrusted data/);
      assert.equal(JSON.parse(body.messages[1].content).sources[0].id, 'source-span-a');
      return new Response(
        JSON.stringify({
          model: 'mock-model-not-live',
          choices: [{ message: { content: JSON.stringify(valid) } }],
          usage: { prompt_tokens: 100, completion_tokens: 25 },
        }),
        { status: 200 },
      );
    });
    assert.equal(calls, 1);
    assert.equal(result.record.editorialStatus, 'unreviewed');
    assert.equal(result.record.cost, null);
    assert.equal(result.record.model, 'mock-model-not-live');
    assert.equal(result.record.sourceWindows[0].sourceHash, 'test-source-hash');
    assert.deepEqual(result.output, valid);
  } finally {
    if (previous === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = previous;
  }
});
test('mock provider failure and oversized output are rejected instead of replacing an edition', async () => {
  const previous = process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY = 'mock-only-test-credential';
  try {
    await assert.rejects(
      () =>
        groundedModel(
          'condense',
          sources,
          '',
          async () => new Response('blocked', { status: 429 }),
        ),
      /HTTP 429/,
    );
    await assert.rejects(
      () => groundedModel('explain', sources, '', async () => new Response('x'.repeat(160000))),
      /permitted size/,
    );
  } finally {
    if (previous === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = previous;
  }
});

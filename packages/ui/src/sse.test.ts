import { expect, test } from 'bun:test';
import { parseSse } from './sse.ts';

async function collect(text: string, chunkAt?: number) {
  const enc = new TextEncoder();
  const parts = chunkAt === undefined ? [text] : [text.slice(0, chunkAt), text.slice(chunkAt)];
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); },
  });
  const out = [];
  for await (const ev of parseSse(body)) out.push(ev);
  return out;
}

test('splits frames on blank lines and reads event and data', async () => {
  const out = await collect('event: delta\ndata: {"text":"po"}\n\nevent: done\ndata: {"message":{}}\n\n');
  expect(out).toEqual([
    { event: 'delta', data: '{"text":"po"}' },
    { event: 'done', data: '{"message":{}}' },
  ]);
});

test('buffers a frame split across chunks', async () => {
  const out = await collect('event: delta\ndata: {"text":"po"}\n\n', 12);
  expect(out).toEqual([{ event: 'delta', data: '{"text":"po"}' }]);
});

test('an event without an explicit name is "message"', async () => {
  expect(await collect('data: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
});

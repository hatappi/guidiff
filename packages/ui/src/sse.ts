export interface SseFrame {
  event: string;
  data: string;
}

// Minimal server-sent-events reader for a fetch body: frames are separated
// by a blank line, each carrying `event:` and `data:` lines. Multi-line data
// is joined with newlines per the spec; comments and other fields are ignored.
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const parseFrame = (block: string): SseFrame | null => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    return data.length === 0 ? null : { event, data: data.join('\n') };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = parseFrame(buf.slice(0, sep));
        buf = buf.slice(sep + 2);
        if (frame) yield frame;
      }
    }
    const last = buf.trim() === '' ? null : parseFrame(buf);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

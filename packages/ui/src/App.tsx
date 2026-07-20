import { useEffect, useState } from 'react';
import type { ReviewPayload } from '@guidiff/schema';
import { fetchReview } from './api.ts';

export default function App() {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReview().then(setPayload).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Failed to load review: {error}</div>;
  if (!payload) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>guidiff</h1>
        <span className="target">{payload.target}</span>
      </header>
      <main className="main">
        {payload.files.map((f) => (
          <section key={f.path} className="file">
            <h2>{f.path}</h2>
            {f.hunks.map((h, i) => (
              <table key={i} className="hunk">
                <tbody>
                  {h.lines.map((l, j) => (
                    <tr key={j} className={`line line-${l.type}`}>
                      <td className="ln">{l.oldLine ?? ''}</td>
                      <td className="ln">{l.newLine ?? ''}</td>
                      <td className="code">{l.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

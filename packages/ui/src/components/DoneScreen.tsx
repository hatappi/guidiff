import { useEffect, useState } from 'react';

// Terminal screen shown after submit/cancel. The tab was opened by the CLI
// with a single history entry, so window.close() is allowed in Chrome/Safari;
// browsers that block it (e.g. Firefox) just keep showing the message.
export default function DoneScreen({ message, seconds = 10 }: { message: string; seconds?: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      window.close();
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return (
    <div className="done">
      {message}
      {remaining > 0 && <div className="done-countdown">Closing in {remaining}s…</div>}
    </div>
  );
}

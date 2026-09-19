import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChatMessage } from '@guidiff/schema';
import { renderChatMarkdown } from '../markdown.ts';
import { CHAT_RESIZE } from '../resize.ts';
import ResizeHandle from './ResizeHandle.tsx';

export interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (content: string) => void;
  onAbort: () => void;
  onClear: () => void;
  onClose: () => void;
  onJump: (file: string) => void;
  onAddAsComment: (answer: ChatMessage, question: ChatMessage) => void;
}

function contextLabel(m: ChatMessage): string | null {
  const c = m.context;
  if (!c) return null;
  if (c.startLine === undefined || c.endLine === undefined) return c.file;
  return c.startLine === c.endLine ? `${c.file}:${c.startLine}` : `${c.file}:${c.startLine}-${c.endLine}`;
}

export default function ChatPanel(props: ChatPanelProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest tokens in view while an answer streams in.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.messages]);

  const send = () => {
    const content = input.trim();
    if (content === '' || props.streaming) return;
    props.onSend(content);
    setInput('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  return (
    <aside className="chat-panel" aria-label="Ask AI">
      <ResizeHandle spec={CHAT_RESIZE} ariaLabel="Resize Ask AI panel" />
      <div className="chat-header">
        <h2>Ask AI</h2>
        <span className="comment-form-spacer" />
        <button onClick={props.onClear} disabled={props.messages.length === 0}>Clear</button>
        <button aria-label="Close Ask AI" onClick={props.onClose}>×</button>
      </div>
      <div className="chat-messages" ref={listRef}>
        {props.messages.length === 0 && (
          <p className="chat-empty">Ask anything about this diff, or write a comment and press Ask AI.</p>
        )}
        {props.messages.map((m, i) => {
          if (m.role === 'user') {
            const label = contextLabel(m);
            return (
              <div key={m.id} className="chat-msg chat-user">
                {label && (
                  <button className="chat-context" onClick={() => props.onJump(m.context!.file)}>{label}</button>
                )}
                {m.context?.code !== undefined && <pre className="chat-quote">{m.context.code}</pre>}
                <div className="chat-text">{m.content}</div>
              </div>
            );
          }
          const question = props.messages[i - 1];
          const anchored =
            question?.role === 'user' &&
            question.context?.startLine !== undefined &&
            question.context?.endLine !== undefined;
          return (
            <div key={m.id} className={`chat-msg chat-assistant chat-status-${m.status}`}>
              <div className="chat-text markdown-body" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(m.content) }} />
              {m.status === 'streaming' && <span className="chat-cursor" aria-hidden="true">▍</span>}
              {m.status === 'aborted' && <div className="chat-note">(stopped)</div>}
              {m.status === 'error' && <div className="chat-error">{m.error ?? 'The reply failed.'}</div>}
              {m.status === 'done' && anchored && m.content.trim() !== '' && (
                <div className="chat-actions">
                  <button onClick={() => props.onAddAsComment(m, question!)}>Add as comment</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="chat-input">
        <textarea
          placeholder="Ask about this diff…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
        />
        <div className="chat-input-actions">
          <span className="chat-hint">⌘/Ctrl+Enter to send</span>
          <span className="comment-form-spacer" />
          {props.streaming && <button onClick={props.onAbort}>Stop</button>}
          <button className="primary" disabled={props.streaming || input.trim() === ''} onClick={send}>Send</button>
        </div>
      </div>
    </aside>
  );
}

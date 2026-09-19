import { beforeEach, expect, test } from 'bun:test';
import { loadChatOptions, saveChatOptions } from './chat-options.ts';

beforeEach(() => localStorage.clear());

test('round-trips a selection and drops fields set back to default', () => {
  saveChatOptions({ model: 'opus', effort: 'high' });
  expect(loadChatOptions()).toEqual({ model: 'opus', effort: 'high' });
  saveChatOptions({ effort: 'low' });
  expect(loadChatOptions()).toEqual({ effort: 'low' });
  saveChatOptions({});
  expect(loadChatOptions()).toEqual({});
});

test('ignores values that are not in the enums', () => {
  localStorage.setItem('guidiff.chat.model', 'gpt');
  localStorage.setItem('guidiff.chat.effort', 'ultra');
  expect(loadChatOptions()).toEqual({});
});

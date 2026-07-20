import { beforeEach, expect, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './theme-context.tsx';

function Probe() {
  const { theme, toggle } = useTheme();
  return <button aria-label="Toggle theme" onClick={toggle}>{theme}</button>;
}

beforeEach(() => localStorage.removeItem('guidiff-theme'));

test('provider applies data-theme and toggle flips + persists it', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  const initial = document.documentElement.dataset.theme;
  expect(initial === 'light' || initial === 'dark').toBe(true);
  const button = screen.getByLabelText('Toggle theme');
  const before = button.textContent;
  fireEvent.click(button);
  const after = button.textContent;
  expect(after).not.toBe(before);
  expect(document.documentElement.dataset.theme).toBe(after);
  expect(localStorage.getItem('guidiff-theme')).toBe(after);
});

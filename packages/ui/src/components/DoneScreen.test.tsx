import { afterEach, describe, expect, jest, mock, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import DoneScreen from './DoneScreen.tsx';

describe('DoneScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows the message with a countdown and closes the tab at zero', () => {
    jest.useFakeTimers();
    const close = mock(() => {});
    window.close = close;
    render(<DoneScreen message="Review submitted." seconds={3} />);

    expect(screen.getByText('Review submitted.')).toBeTruthy();
    expect(screen.getByText('Closing in 3s…')).toBeTruthy();

    act(() => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText('Closing in 2s…')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();

    // Each tick schedules the next only after React flushes, so advance 1s at a time.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText('Closing in 1s…')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('keeps the message and stops counting if the browser blocks close', () => {
    jest.useFakeTimers();
    window.close = mock(() => {});
    render(<DoneScreen message="Review cancelled." seconds={1} />);

    act(() => { jest.advanceTimersByTime(5000); });
    // close was blocked (no-op stub): the message stays, the countdown is gone.
    expect(screen.getByText('Review cancelled.')).toBeTruthy();
    expect(screen.queryByText(/Closing in/)).toBeNull();
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  test('unmounting cancels the pending close', () => {
    jest.useFakeTimers();
    const close = mock(() => {});
    window.close = close;
    const { unmount } = render(<DoneScreen message="Bye." seconds={1} />);

    unmount();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(close).not.toHaveBeenCalled();
  });
});

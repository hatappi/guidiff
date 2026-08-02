import { beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import ResizeHandle from './components/ResizeHandle.tsx';

const guideVar = () => document.documentElement.style.getPropertyValue('--guide-w');

// happy-dom's window.innerWidth is 1024, so the clamp ceiling is 512.
describe('ResizeHandle', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--guide-w');
    document.documentElement.removeAttribute('data-resizing');
  });

  test('dragging updates --guide-w by the pointer delta', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 420 });
    expect(guideVar()).toBe('420px');

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 380 });
    expect(guideVar()).toBe('380px');
    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  test('drag deltas apply from the width at drag start, not the default', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');
    document.documentElement.style.setProperty('--guide-w', '400px');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150 });
    expect(guideVar()).toBe('450px');
    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  test('dragging far right clamps to half the viewport', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1000 });
    expect(guideVar()).toBe('512px');
    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  test('dragging far left clamps to the minimum', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0 });
    expect(guideVar()).toBe('200px');
    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  test('pointer moves without a prior pointerdown are ignored', () => {
    const { getByRole } = render(<ResizeHandle />);
    fireEvent.pointerMove(getByRole('separator'), { pointerId: 1, clientX: 999 });
    expect(guideVar()).toBe('');
  });

  test('marks <html> with data-resizing only while dragging', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    expect(document.documentElement.hasAttribute('data-resizing')).toBe(false);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 });
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(true);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(false);
  });

  test('pointercancel ends the drag like pointerup', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(false);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 999 });
    expect(guideVar()).toBe('');
  });

  test('double-click resets to the default width', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');
    document.documentElement.style.setProperty('--guide-w', '450px');

    fireEvent.doubleClick(handle);
    expect(guideVar()).toBe('320px');
  });

  test('arrow keys adjust the width by 16px and update aria-valuenow', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(guideVar()).toBe('336px');
    expect(handle.getAttribute('aria-valuenow')).toBe('336');

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(guideVar()).toBe('304px');
    expect(handle.getAttribute('aria-valuenow')).toBe('304');
  });

  test('other keys are ignored', () => {
    const { getByRole } = render(<ResizeHandle />);
    fireEvent.keyDown(getByRole('separator'), { key: 'ArrowUp' });
    expect(guideVar()).toBe('');
  });

  test('exposes separator semantics', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-label')).toBe('Resize guide panel');
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-valuemax')).toBe('640');
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  test('non-primary buttons do not start a drag', () => {
    const { getByRole } = render(<ResizeHandle />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 320, button: 2 });
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(false);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 420 });
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('');
  });
});

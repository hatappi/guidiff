import { beforeEach, describe, expect, test } from 'bun:test';
import {
  CHAT_RESIZE,
  GUIDE_RESIZE,
  MIN_GUIDE_WIDTH,
  clampGuideWidth,
  clampWidth,
  defaultWidth,
  getGuideWidth,
  getWidth,
  maxWidth,
  resetGuideWidth,
  resetWidth,
  setGuideWidth,
  setWidth,
} from './resize.ts';

describe('clampGuideWidth', () => {
  test('passes through values inside the range', () => {
    expect(clampGuideWidth(300, 2000)).toBe(300);
  });

  test('clamps below MIN to MIN', () => {
    expect(clampGuideWidth(100, 2000)).toBe(MIN_GUIDE_WIDTH);
  });

  test('caps the max at half the viewport', () => {
    expect(clampGuideWidth(5000, 1000)).toBe(500);
    expect(clampGuideWidth(5000, 2000)).toBe(1000);
  });

  test('never lets the viewport cap push the max below MIN', () => {
    expect(clampGuideWidth(5000, 300)).toBe(MIN_GUIDE_WIDTH);
  });

  test('rounds fractional widths to whole pixels', () => {
    expect(clampGuideWidth(300.4, 2000)).toBe(300);
  });
});

describe('getGuideWidth / setGuideWidth', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--guide-w');
  });

  // happy-dom's innerWidth is 1024, so the 35% default is 358
  test('returns 35% of the viewport when the variable is unset', () => {
    expect(getGuideWidth()).toBe(358);
  });

  test('set then get round-trips a clamped value', () => {
    const applied = setGuideWidth(400);
    expect(applied).toBe(400);
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('400px');
    expect(getGuideWidth()).toBe(400);
  });

  test('setGuideWidth clamps using window.innerWidth', () => {
    // the max is half the viewport: 512
    expect(setGuideWidth(5000)).toBe(512);
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('512px');
  });

  test('falls back to the default when the variable holds garbage', () => {
    document.documentElement.style.setProperty('--guide-w', 'abc');
    expect(getGuideWidth()).toBe(358);
  });

  test('resetGuideWidth clears the pinned width back to the ratio default', () => {
    setGuideWidth(300);
    expect(resetGuideWidth()).toBe(358);
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('');
  });
});

describe('spec-driven widths', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--guide-w');
    document.documentElement.style.removeProperty('--chat-w');
  });

  test('GUIDE_RESIZE reproduces the legacy guide behaviour', () => {
    expect(defaultWidth(GUIDE_RESIZE, 1024)).toBe(358);
    expect(maxWidth(GUIDE_RESIZE, 1024)).toBe(512);
    expect(clampWidth(GUIDE_RESIZE, 100, 1024)).toBe(200);
    expect(clampWidth(GUIDE_RESIZE, 5000, 1024)).toBe(512);
  });

  test('CHAT_RESIZE has a pixel default and a hard max under the viewport cap', () => {
    expect(defaultWidth(CHAT_RESIZE, 1024)).toBe(400);
    expect(maxWidth(CHAT_RESIZE, 1024)).toBe(512);
    expect(maxWidth(CHAT_RESIZE, 4000)).toBe(800);
    expect(clampWidth(CHAT_RESIZE, 100, 1024)).toBe(280);
  });

  test('get/set/reset work per variable without touching the other', () => {
    expect(getWidth(CHAT_RESIZE)).toBe(400);
    expect(setWidth(CHAT_RESIZE, 450)).toBe(450);
    expect(document.documentElement.style.getPropertyValue('--chat-w')).toBe('450px');
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('');
    expect(getWidth(GUIDE_RESIZE)).toBe(358);
    expect(resetWidth(CHAT_RESIZE)).toBe(400);
    expect(document.documentElement.style.getPropertyValue('--chat-w')).toBe('');
  });
});

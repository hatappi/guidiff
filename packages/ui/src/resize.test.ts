import { beforeEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_GUIDE_WIDTH,
  MAX_GUIDE_WIDTH,
  MIN_GUIDE_WIDTH,
  clampGuideWidth,
  getGuideWidth,
  setGuideWidth,
} from './resize.ts';

describe('clampGuideWidth', () => {
  test('passes through values inside the range', () => {
    expect(clampGuideWidth(300, 2000)).toBe(300);
  });

  test('clamps below MIN to MIN', () => {
    expect(clampGuideWidth(100, 2000)).toBe(MIN_GUIDE_WIDTH);
  });

  test('clamps above MAX to MAX on a wide viewport', () => {
    expect(clampGuideWidth(5000, 2000)).toBe(MAX_GUIDE_WIDTH);
  });

  test('caps the max at half the viewport on narrower screens', () => {
    expect(clampGuideWidth(5000, 1000)).toBe(500);
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

  test('returns the default when the variable is unset', () => {
    expect(getGuideWidth()).toBe(DEFAULT_GUIDE_WIDTH);
  });

  test('set then get round-trips a clamped value', () => {
    const applied = setGuideWidth(400);
    expect(applied).toBe(400);
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('400px');
    expect(getGuideWidth()).toBe(400);
  });

  test('setGuideWidth clamps using window.innerWidth', () => {
    // happy-dom's innerWidth is 1024, so the max is 512
    expect(setGuideWidth(5000)).toBe(512);
    expect(document.documentElement.style.getPropertyValue('--guide-w')).toBe('512px');
  });

  test('falls back to the default when the variable holds garbage', () => {
    document.documentElement.style.setProperty('--guide-w', 'abc');
    expect(getGuideWidth()).toBe(DEFAULT_GUIDE_WIDTH);
  });
});

import { describe, it, expect } from 'vitest';

// Extracted from updateSchedulingRules in settings/actions.ts
function parseMaxConcurrentBookings(raw: string | null | undefined): number | null {
  const trimmed = raw?.trim() ?? '';
  const parsed = parseInt(trimmed);
  return !trimmed || isNaN(parsed) || parsed <= 0 ? null : parsed;
}

describe('parseMaxConcurrentBookings', () => {
  it('returns the parsed integer for a valid positive value', () => {
    expect(parseMaxConcurrentBookings('3')).toBe(3);
    expect(parseMaxConcurrentBookings('1')).toBe(1);
    expect(parseMaxConcurrentBookings('20')).toBe(20);
  });

  it('returns null for an empty string (unlimited)', () => {
    expect(parseMaxConcurrentBookings('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseMaxConcurrentBookings('   ')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseMaxConcurrentBookings(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseMaxConcurrentBookings(undefined)).toBeNull();
  });

  it('returns null for zero (means unlimited)', () => {
    expect(parseMaxConcurrentBookings('0')).toBeNull();
  });

  it('returns null for a negative value', () => {
    expect(parseMaxConcurrentBookings('-1')).toBeNull();
    expect(parseMaxConcurrentBookings('-5')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseMaxConcurrentBookings('abc')).toBeNull();
    expect(parseMaxConcurrentBookings('unlimited')).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    expect(parseMaxConcurrentBookings('  5  ')).toBe(5);
  });

  it('truncates floats (parseInt behaviour)', () => {
    expect(parseMaxConcurrentBookings('2.9')).toBe(2);
  });
});

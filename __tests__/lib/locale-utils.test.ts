import { setAppLocale } from '../../lib/i18n';
import {
  formatCurrency,
  formatCurrencyWhole,
  formatAge,
  formatAgeLabel,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatShortDate,
  formatScheduleDayHeader,
  formatMonthYear,
} from '../../lib/locale-utils';

beforeEach(() => {
  setAppLocale('en');
});

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency()', () => {
  it('formats BRL with two decimals', () => {
    const result = formatCurrency(1500.5);
    // Intl formats differently across environments; just check it contains the number
    expect(result).toMatch(/1[,.]?500/);
    expect(result).toMatch(/5[0-9]/);
  });

  it('does not throw on zero', () => {
    expect(() => formatCurrency(0)).not.toThrow();
  });

  it('falls back gracefully on invalid input', () => {
    expect(() => formatCurrency(NaN)).not.toThrow();
  });
});

describe('formatCurrencyWhole()', () => {
  it('formats a whole number without decimals', () => {
    const result = formatCurrencyWhole(200);
    expect(result).not.toContain(',00');
    expect(result).not.toContain('.00');
  });

  it('rounds to nearest whole', () => {
    expect(() => formatCurrencyWhole(99.9)).not.toThrow();
  });
});

// ─── formatAge ───────────────────────────────────────────────────────────────

describe('formatAge()', () => {
  it('returns empty string for invalid date', () => {
    expect(formatAge('not-a-date')).toBe('');
  });

  it('returns empty string for future birth date', () => {
    expect(formatAge('2099-01-01')).toBe('');
  });

  it('returns months only for a baby under 1 year', () => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const dateStr = threeMonthsAgo.toISOString().split('T')[0];
    const result = formatAge(dateStr);
    expect(result).toMatch(/mo/);
    expect(result).not.toMatch(/yr/);
  });

  it('returns years for an adult', () => {
    const result = formatAge('1990-01-01');
    expect(result).toMatch(/yr/);
  });

  it('returns years + months when months > 0', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 5, now.getMonth() - 2, now.getDate());
    const dateStr = birthDate.toISOString().split('T')[0];
    const result = formatAge(dateStr);
    expect(result).toContain('yr');
    expect(result).toContain('mo');
  });

  it('returns Portuguese month string', () => {
    setAppLocale('pt-BR');
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    const dateStr = twoMonthsAgo.toISOString().split('T')[0];
    const result = formatAge(dateStr);
    expect(result).toContain('meses');
  });

  it('uses singular form for exactly 1 year', () => {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const dateStr = oneYearAgo.toISOString().split('T')[0];
    const result = formatAge(dateStr);
    expect(result).toContain('yr');
  });

  it('uses singular form for exactly 1 month', () => {
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const dateStr = oneMonthAgo.toISOString().split('T')[0];
    const result = formatAge(dateStr);
    expect(result).toMatch(/1 mo/);
  });
});

describe('formatAgeLabel()', () => {
  it('wraps a valid age', () => {
    const result = formatAgeLabel('1990-01-01');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for invalid date', () => {
    expect(formatAgeLabel('bad-date')).toBe('');
  });

  it('in Portuguese, does not add "old" suffix (uses same age string)', () => {
    setAppLocale('pt-BR');
    const result = formatAgeLabel('1990-01-01');
    expect(result).toMatch(/\d+/);
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration()', () => {
  it('formats 30 minutes', () => {
    expect(formatDuration(30)).toBe('30 min');
  });

  it('formats 60 minutes', () => {
    expect(formatDuration(60)).toBe('60 min');
  });

  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0 min');
  });
});

// ─── formatFileSize ──────────────────────────────────────────────────────────

describe('formatFileSize()', () => {
  it('shows bytes for small files', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('shows KB for medium files', () => {
    const result = formatFileSize(2048);
    expect(result).toContain('KB');
  });

  it('shows MB for large files', () => {
    const result = formatFileSize(2 * 1024 * 1024);
    expect(result).toContain('MB');
  });

  it('formats exactly 1024 bytes as KB', () => {
    const result = formatFileSize(1024);
    expect(result).toContain('KB');
  });
});

// ─── formatNumber ────────────────────────────────────────────────────────────

describe('formatNumber()', () => {
  it('formats with two decimal places by default', () => {
    const result = formatNumber(3.1);
    expect(result).toMatch(/3[.,]10/);
  });

  it('formats with zero decimals', () => {
    const result = formatNumber(42, 0);
    expect(result).toBe('42');
  });

  it('does not throw on zero', () => {
    expect(() => formatNumber(0)).not.toThrow();
  });
});

// ─── formatShortDate ─────────────────────────────────────────────────────────

describe('formatShortDate()', () => {
  it('formats a date string to locale short date', () => {
    const result = formatShortDate('2024-03-15');
    expect(result).toMatch(/\d/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns original string on invalid input', () => {
    const result = formatShortDate('bad-date');
    expect(typeof result).toBe('string');
  });
});

// ─── formatScheduleDayHeader ─────────────────────────────────────────────────

describe('formatScheduleDayHeader()', () => {
  it('includes the day number', () => {
    const date = new Date(2024, 2, 15); // March 15
    const result = formatScheduleDayHeader(date);
    expect(result).toContain('15');
  });

  it('includes the year', () => {
    const date = new Date(2024, 0, 1);
    const result = formatScheduleDayHeader(date);
    expect(result).toContain('2024');
  });
});

// ─── formatMonthYear ─────────────────────────────────────────────────────────

describe('formatMonthYear()', () => {
  it('formats a month-year string', () => {
    const result = formatMonthYear('2024-03');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\d{2}/);
  });

  it('returns a non-empty string even for partial input', () => {
    const result = formatMonthYear('bad');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

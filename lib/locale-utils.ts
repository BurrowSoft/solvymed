/**
 * Locale-aware formatting utilities.
 * All functions use the native Intl API (supported by Hermes in Expo SDK 52+).
 * No external dependencies required.
 */

import { locale } from './i18n';

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format a monetary amount using the current locale and currency.
 * PT-BR: R$ 1.234,56   EN: BRL 1,234.56 (or R$1,234.56 with symbol override)
 */
export function formatCurrency(amount: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
}

/**
 * Format a whole-number currency (no cents) — used for dashboard summary cards.
 */
export function formatCurrencyWhole(amount: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `R$ ${Math.round(amount)}`;
  }
}

// ─── Date / Time ──────────────────────────────────────────────────────────────

function parseDate(date: Date | string): Date {
  if (typeof date === 'string') {
    // ISO date strings like "2024-06-09" are parsed as UTC midnight;
    // add noon to avoid off-by-one from timezone shifts.
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T12:00:00`);
    return new Date(date);
  }
  return date;
}

/** Short weekday name: "seg." / "Mon" */
export function formatWeekdayShort(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(parseDate(date));
  } catch {
    return '';
  }
}

/** Short weekday name, uppercased (used in schedule header). */
export function formatWeekdayShortUpper(date: Date | string): string {
  return formatWeekdayShort(date).toUpperCase().replace('.', '');
}

/** Day number: "9" */
export function formatDay(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(parseDate(date));
  } catch {
    return '';
  }
}

/** Short month name: "jan." / "Jan" */
export function formatMonthShort(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(parseDate(date));
  } catch {
    return '';
  }
}

/** Short month name uppercased. */
export function formatMonthShortUpper(date: Date | string): string {
  return formatMonthShort(date).toUpperCase().replace('.', '');
}

/** Full year: "2026" */
export function formatYear(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(parseDate(date));
  } catch {
    return '';
  }
}

/**
 * Full date header for the schedule day view.
 * PT-BR: "SEG, 09 JUN 2026"   EN: "MON, 09 JUN 2026"
 */
export function formatScheduleDayHeader(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = formatWeekdayShortUpper(date);
  const month = formatMonthShortUpper(date);
  const year = date.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

/**
 * Week range label.
 * PT-BR: "seg 9 - dom 15, jun 2026"   EN: "Mon 9 - Sun 15, Jun 2026"
 */
export function formatScheduleWeekHeader(from: Date, to: Date): string {
  const fmtDay = (d: Date) => `${formatWeekdayShort(d).replace('.', '')} ${d.getDate()}`;
  const month = formatMonthShort(to);
  const year = to.getFullYear();
  return `${fmtDay(from)} - ${fmtDay(to)}, ${month} ${year}`;
}

/**
 * Home screen date header.
 * PT-BR: "Seg, 09 jun 2026"   EN: "Mon, 09 Jun 2026"
 */
export function formatHomeDateHeader(date: Date): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * Short month + year for revenue chart labels.
 * PT-BR: "jan/26"   EN: "Jan '26"
 */
export function formatMonthYear(yearMonth: string): string {
  // yearMonth is "2026-01"
  const date = parseDate(`${yearMonth}-01`);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(date);
  } catch {
    return yearMonth;
  }
}

/** PT-BR short date: "09/06/2026"  EN: "06/09/2026" */
export function formatShortDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDate(dateStr));
  } catch {
    return dateStr;
  }
}

// ─── Age ──────────────────────────────────────────────────────────────────────

/**
 * Compute and format patient age from a birth date string (YYYY-MM-DD).
 * PT-BR: "32 anos, 4 meses"   EN: "32 yrs, 4 mo"
 */
export function formatAge(birthDate: string): string {
  const birth = parseDate(birthDate);
  if (isNaN(birth.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return '';

  const isPt = locale.startsWith('pt');

  if (years === 0) {
    if (isPt) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
    return `${months} mo`;
  }
  const yearStr = isPt
    ? `${years} ${years === 1 ? 'ano' : 'anos'}`
    : `${years} yr${years !== 1 ? 's' : ''}`;
  const monthStr = months > 0
    ? (isPt ? `, ${months} ${months === 1 ? 'mês' : 'meses'}` : `, ${months} mo`)
    : '';
  return `${yearStr}${monthStr}`;
}

/** Like formatAge but appended with "old" / nothing. Used in appointment modal. */
export function formatAgeLabel(birthDate: string): string {
  const age = formatAge(birthDate);
  if (!age) return '';
  if (locale.startsWith('pt')) return age;
  return `${age} old`;
}

// ─── Duration ────────────────────────────────────────────────────────────────

/** "45 min" — same in all supported locales, but kept here for consistency. */
export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

// ─── Number ──────────────────────────────────────────────────────────────────

/** Locale-aware decimal number (e.g. for prices without currency symbol). */
export function formatNumber(value: number, fractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return value.toFixed(fractionDigits);
  }
}

// ─── File size ────────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}

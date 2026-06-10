/**
 * Locale-aware formatting utilities.
 * All functions use the native Intl API (supported by Hermes in Expo SDK 52+).
 * No external dependencies required.
 */

import { getLocale, t } from './i18n';

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
}

export function formatCurrencyWhole(amount: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `R$ ${Math.round(amount)}`;
  }
}

export function formatTime(time: string): string {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ?? '00';
  return `${h}:${m}`;
}

// ─── Date / Time ──────────────────────────────────────────────────────────────

function parseDate(date: Date | string): Date {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T12:00:00`);
    return new Date(date);
  }
  return date;
}

export function formatWeekdayShort(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(parseDate(date));
  } catch {
    return '';
  }
}

export function formatWeekdayShortUpper(date: Date | string): string {
  return formatWeekdayShort(date).toUpperCase().replace('.', '');
}

export function formatDay(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { day: 'numeric' }).format(parseDate(date));
  } catch {
    return '';
  }
}

export function formatMonthShort(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { month: 'short' }).format(parseDate(date));
  } catch {
    return '';
  }
}

export function formatMonthShortUpper(date: Date | string): string {
  return formatMonthShort(date).toUpperCase().replace('.', '');
}

export function formatYear(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { year: 'numeric' }).format(parseDate(date));
  } catch {
    return '';
  }
}

export function formatScheduleDayHeader(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = formatWeekdayShortUpper(date);
  const month = formatMonthShortUpper(date);
  const year = date.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

export function formatScheduleWeekHeader(from: Date, to: Date): string {
  const fmtDay = (d: Date) => `${formatWeekdayShort(d).replace('.', '')} ${d.getDate()}`;
  const month = formatMonthShort(to);
  const year = to.getFullYear();
  return `${fmtDay(from)} - ${fmtDay(to)}, ${month} ${year}`;
}

export function formatHomeDateHeader(date: Date): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function formatMonthYear(yearMonth: string): string {
  const date = parseDate(`${yearMonth}-01`);
  try {
    return new Intl.DateTimeFormat(getLocale(), { month: 'short', year: '2-digit' }).format(date);
  } catch {
    return yearMonth;
  }
}

export function formatShortDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDate(dateStr));
  } catch {
    return dateStr;
  }
}

// ─── Age ──────────────────────────────────────────────────────────────────────

export function formatAge(birthDate: string): string {
  const birth = parseDate(birthDate);
  if (isNaN(birth.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return '';

  if (years === 0) {
    return t(months === 1 ? 'age.month' : 'age.months', { n: months });
  }
  const yearStr = t(years === 1 ? 'age.year' : 'age.years', { n: years });
  const monthStr = months > 0
    ? `, ${t(months === 1 ? 'age.month' : 'age.months', { n: months })}`
    : '';
  return `${yearStr}${monthStr}`;
}

export function formatAgeLabel(birthDate: string): string {
  const age = formatAge(birthDate);
  if (!age) return '';
  return t('age.old', { age });
}

// ─── Duration ────────────────────────────────────────────────────────────────

export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

// ─── Number ──────────────────────────────────────────────────────────────────

export function formatNumber(value: number, fractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(getLocale(), {
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

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Today's date at 00:00:00 local time (matches `date` columns). */
export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Parse a `YYYY-MM-DD` string or Date into a local midnight Date. */
export function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a Date as `YYYY-MM-DD` for <input type="date">. */
export function toDateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DATE_FORMAT = { day: '2-digit', month: 'short', year: 'numeric' };
const DATE_LONG = { day: 'numeric', month: 'long', year: 'numeric' };
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: true };

export function formatDate(value, { long = false } = {}) {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return date.toLocaleDateString('en-PH', long ? DATE_LONG : DATE_FORMAT);
}

export function formatDateTime(value) {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return `${date.toLocaleDateString('en-PH', DATE_FORMAT)}, ${date.toLocaleTimeString(
    'en-PH',
    TIME_FORMAT,
  )}`;
}

export function formatTime(value) {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return date.toLocaleTimeString('en-PH', TIME_FORMAT);
}

/** "3 days ago" / "in 2 hours" style relative label. */
export function formatRelative(value) {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), 'second');
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Two-letter initials for avatars. */
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function fullName(member) {
  if (!member) return '';
  const parts = [member.firstName, member.middleName, member.lastName, member.suffix]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts.slice(1, -1).join(' ')} ${parts[parts.length - 1]}`;
}

export function shortName(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** URL-safe slug. Appends a short suffix when `ensureUnique` is provided. */
export function slugify(input, ensureUnique) {
  const base = String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const stem = base || 'item';
  return ensureUnique ? `${stem}-${String(ensureUnique).slice(0, 8)}` : stem;
}

export function truncate(text, max = 140) {
  if (!text) return '';
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}\u2026`;
}

/**
 * Only allow same-origin redirect targets. Blocks open-redirects such as
 * `?next=https://evil.example` after login.
 */
export function safeRedirectPath(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  if (value.startsWith('/login') || value.startsWith('/api/auth')) return fallback;
  return value;
}

/** Clamp + normalise pagination input coming from a URL search param. */
export function parsePagination(input = {}, defaults = { page: 1, pageSize: 10 }) {
  const page = Math.max(1, Number.parseInt(input.page, 10) || defaults.page);
  const rawSize = Number.parseInt(input.pageSize, 10) || defaults.pageSize;
  const pageSize = Math.min(100, Math.max(5, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Total pages (always >= 1) for a row count. */
export function totalPages(total, pageSize) {
  const count = Number(total) || 0;
  const size = Number(pageSize) || 1;
  return Math.max(1, Math.ceil(count / size));
}

/** Serialise a params object into a query string, dropping empty values. */
export function buildQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Case-insensitive "contains" filter, safe to pass straight to Prisma. */
export function contains(value) {
  return { contains: value, mode: 'insensitive' };
}

/** Normalise an email for storage / lookup. */
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Deterministic secondary sort for records with identical timestamps. */
export function byNewest(field = 'createdAt') {
  return { [field]: 'desc' };
}
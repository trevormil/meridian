/**
 * NYSE trading-calendar gate — unit tests (no network).
 *
 *   bun test test/meridian/calendar.spec.ts
 */
import { test, expect } from 'bun:test';
import {
  isWeekend,
  isMarketHoliday,
  isEarlyClose,
  isTradingDay,
} from '../../src/meridian/calendar.js';

test('NYSE holidays are not trading days', () => {
  expect(isMarketHoliday('2026-01-01')).toBe(true); // New Year's Day
  expect(isMarketHoliday('2026-07-03')).toBe(true); // Independence Day (observed)
  expect(isMarketHoliday('2026-12-25')).toBe(true); // Christmas
  expect(isTradingDay('2026-12-25')).toBe(false);
});

test('weekends are not trading days', () => {
  expect(isWeekend('2026-05-23')).toBe(true); // Saturday
  expect(isWeekend('2026-05-24')).toBe(true); // Sunday
  expect(isTradingDay('2026-05-23')).toBe(false);
});

test('a normal weekday is a trading day', () => {
  // 2026-05-22 is a Friday and not a holiday.
  expect(isWeekend('2026-05-22')).toBe(false);
  expect(isMarketHoliday('2026-05-22')).toBe(false);
  expect(isTradingDay('2026-05-22')).toBe(true);
});

test('early-close half-days are still trading days', () => {
  expect(isEarlyClose('2026-11-27')).toBe(true); // day after Thanksgiving
  expect(isEarlyClose('2026-12-24')).toBe(true); // Christmas Eve
  // Half-days produce a valid 1pm close, so the 4:05pm settle still runs.
  expect(isTradingDay('2026-11-27')).toBe(true);
  expect(isMarketHoliday('2026-11-27')).toBe(false);
});

test('uncovered year fails open (no table → treated as a trading day)', () => {
  // 2030 has no hardcoded table yet. isMarketHoliday must NOT halt the product;
  // it returns false (and logs a warning) so a missed annual update degrades
  // to "runs on a holiday" rather than silently never running.
  expect(isMarketHoliday('2030-12-25')).toBe(false);
  // 2030-12-25 is a Wednesday, so it reads as a (fail-open) trading day.
  expect(isTradingDay('2030-12-25')).toBe(true);
});

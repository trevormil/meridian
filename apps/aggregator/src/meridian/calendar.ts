/**
 * NYSE trading-calendar gate for the Meridian daily lifecycle.
 *
 * The cron lines fire Mon-Fri, which excludes weekends — but NOT exchange
 * holidays. On a full closure:
 *   - morning.ts would create markets that never get a real close
 *   - evening.ts would settle them against the PRIOR session's stale close
 *
 * morning.ts + evening.ts call `isTradingDay()` and no-op cleanly when today
 * isn't a trading day. The holiday tables are the NYSE full-day closure
 * schedule; extend them once a year (dates shift — floating Mondays,
 * observed-on-Friday/Monday rules for fixed-date holidays).
 *
 * FAIL OPEN for uncovered years: `isMarketHoliday()` returns false + logs a
 * warning when there's no table for the year. A missed annual update degrades
 * to "the product runs on a holiday" (visible in logs / on-chain) rather than
 * silently halting the product for everyone.
 *
 * Half-days (1pm early close — day after Thanksgiving, Christmas Eve, etc.) are
 * NOT closures: the market still produces a valid 1pm close that the 4:05pm
 * settle reads correctly. `isEarlyClose()` is exposed for information only and
 * does not gate anything.
 */

// NYSE full-day market holidays, keyed YYYY-MM-DD in US/Eastern, per year.
// Source: NYSE official holiday calendar. Add a new year's entry annually.
const NYSE_HOLIDAYS_BY_YEAR: Record<number, ReadonlySet<string>> = {
  2026: new Set([
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday (Presidents' Day)
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed — Jul 4 is a Saturday)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving Day
    '2026-12-25', // Christmas Day
  ]),
  2027: new Set([
    '2027-01-01', // New Year's Day
    '2027-01-18', // Martin Luther King Jr. Day
    '2027-02-15', // Washington's Birthday
    '2027-03-26', // Good Friday
    '2027-05-31', // Memorial Day
    '2027-06-18', // Juneteenth (observed — Jun 19 is a Saturday)
    '2027-07-05', // Independence Day (observed — Jul 4 is a Sunday)
    '2027-09-06', // Labor Day
    '2027-11-25', // Thanksgiving Day
    '2027-12-24', // Christmas (observed — Dec 25 is a Saturday)
  ]),
};

// NYSE 1pm early-close days (informational only — these are normal trading days
// for settlement purposes since the 4:05pm settle runs after the 1pm close).
const NYSE_EARLY_CLOSE_BY_YEAR: Record<number, ReadonlySet<string>> = {
  2026: new Set([
    '2026-11-27', // day after Thanksgiving
    '2026-12-24', // Christmas Eve
  ]),
  2027: new Set([
    '2027-11-26', // day after Thanksgiving
  ]),
};

function yearOf(closeDate: string): number {
  return Number(closeDate.slice(0, 4));
}

/** Day-of-week (0=Sun … 6=Sat) for a date in US/Eastern. */
function easternWeekday(closeDate: string): number {
  // closeDate is YYYY-MM-DD; interpret at noon ET to avoid TZ edge flips.
  const d = new Date(`${closeDate}T12:00:00-04:00`);
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
    })
      .format(d)
      .replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, (m) =>
        String(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(m)),
      ),
  );
}

export function isWeekend(closeDate: string): boolean {
  const wd = easternWeekday(closeDate);
  return wd === 0 || wd === 6;
}

export function isMarketHoliday(closeDate: string): boolean {
  const table = NYSE_HOLIDAYS_BY_YEAR[yearOf(closeDate)];
  if (!table) {
    console.warn(
      `[calendar] no NYSE holiday table for ${yearOf(closeDate)} — update calendar.ts; ` +
        `treating ${closeDate} as a trading day (fail-open)`,
    );
    return false;
  }
  return table.has(closeDate);
}

export function isEarlyClose(closeDate: string): boolean {
  return NYSE_EARLY_CLOSE_BY_YEAR[yearOf(closeDate)]?.has(closeDate) ?? false;
}

export function isTradingDay(closeDate: string): boolean {
  return !isWeekend(closeDate) && !isMarketHoliday(closeDate);
}

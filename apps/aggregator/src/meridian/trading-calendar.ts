/**
 * NYSE trading-calendar guard for the Meridian daily cron.
 *
 * The cron lines fire Mon-Fri (`* * 1-5`), which covers weekends — but NOT
 * exchange holidays. On a holiday the market is closed, so:
 *   - morning.ts would create markets that never get a real close
 *   - evening.ts would settle them against the PRIOR session's stale close
 *
 * Both scripts call `assertTradingDay()` at the top and exit cleanly (code 0)
 * when today isn't a trading day. The holiday list is the NYSE full-day
 * closure schedule; update it once a year (the dates shift — e.g. floating
 * Mondays, observed-on-Friday/Monday rules for fixed-date holidays).
 *
 * Half-days (1pm early close — day after Thanksgiving, Christmas Eve, July 3
 * in some years) are NOT treated as closures: the market still produces a
 * valid 1pm close that the 4:05pm settle reads correctly.
 */

// NYSE full-day market holidays. Keyed YYYY-MM-DD in US/Eastern.
// Sources: NYSE official holiday calendar. Extend annually.
const NYSE_HOLIDAYS = new Set<string>([
  // 2026
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
  // 2027
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
]);

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
  return NYSE_HOLIDAYS.has(closeDate);
}

export function isTradingDay(closeDate: string): boolean {
  return !isWeekend(closeDate) && !isMarketHoliday(closeDate);
}

/**
 * Exit cleanly (code 0) if `closeDate` is not a trading day. Cron runs
 * Mon-Fri so weekends rarely reach here, but the holiday check is the point.
 * Returns true when it's a trading day (caller proceeds).
 */
export function assertTradingDay(closeDate: string, script: string): boolean {
  if (isMarketHoliday(closeDate)) {
    console.log(`[${script}] ${closeDate} is an NYSE holiday — market closed, skipping.`);
    return false;
  }
  if (isWeekend(closeDate)) {
    console.log(`[${script}] ${closeDate} is a weekend — market closed, skipping.`);
    return false;
  }
  return true;
}

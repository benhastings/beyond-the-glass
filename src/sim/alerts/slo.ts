/**
 * SLO arithmetic (E8-07), the way the SRE workbook defines it. An objective of 99.9% leaves an error budget
 * of 0.1% of requests. The burn rate is how fast a window spends it: the window's error ratio divided by the
 * budget (1 means exactly on budget for the period; 14.4 spends a 30-day budget in 50 hours).
 */
export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export const errorBudget = (objective: number) => 1 - objective

/** How many times faster than allowed the budget is being spent. */
export const burnRate = (errorRatio: number, objective: number) =>
  errorRatio / errorBudget(objective)

/** The share of a whole period's budget a window at this burn rate spends. */
export const budgetConsumed = (burn: number, windowMs: number, periodMs = 30 * DAY) =>
  (burn * windowMs) / periodMs

/** How long a full budget lasts at this burn rate (Infinity if nothing is failing). */
export const timeToExhaust = (burn: number, periodMs = 30 * DAY) =>
  burn <= 0 ? Infinity : periodMs / burn

/**
 * The multiwindow, multi-burn-rate alerts the SRE workbook recommends: page when both the long and the short
 * window burn faster than the threshold (the short window makes the alert stop soon after the fix); open a
 * ticket for the slower burns.
 */
export const BURN_ALERTS = [
  {
    severity: 'page',
    long: HOUR,
    short: 5 * 60_000,
    threshold: 14.4,
    spends: '2% of a 30-day budget in an hour',
  },
  {
    severity: 'page',
    long: 6 * HOUR,
    short: 30 * 60_000,
    threshold: 6,
    spends: '5% of a 30-day budget in six hours',
  },
  {
    severity: 'ticket',
    long: 3 * DAY,
    short: 6 * HOUR,
    threshold: 1,
    spends: '10% of a 30-day budget in three days',
  },
] as const

/** Whether a burn alert holds, given the error ratio over its long and short windows. */
export const burnAlertHolds = (
  a: (typeof BURN_ALERTS)[number],
  longRatio: number,
  shortRatio: number,
  objective: number,
) => burnRate(longRatio, objective) > a.threshold && burnRate(shortRatio, objective) > a.threshold

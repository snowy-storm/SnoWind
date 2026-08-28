import { PeriodUnit } from './dto/page-verification.dto';

export const PERIOD_UNIT_DAYS: Record<PeriodUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export const PERIOD_UNIT_MAX_AMOUNT: Record<PeriodUnit, number> = {
  day: 3650,
  week: 520,
  month: 120,
  year: 20,
};

export const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

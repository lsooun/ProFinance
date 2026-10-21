export type TimeUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

export const TIME_UNIT_LABELS: Record<TimeUnit, string> = {
  hour: '小时',
  day: '天',
  week: '周',
  month: '月',
  year: '年',
};

export const HOURS_PER_UNIT: Record<TimeUnit, number> = {
  hour: 1,
  day: 8,
  week: 40,
  month: 174,
  year: 2088,
};

export const TIME_UNIT_HINT = '折算规则：1 天 = 8 小时，1 周 = 40 小时，1 月 = 21.75 天（174 小时），1 年 = 261 天（2088 小时）。';

export function toCanonicalHours(value: number, unit: TimeUnit): number {
  return Math.round(value * HOURS_PER_UNIT[unit] * 100) / 100;
}

export function formatCanonicalHours(value: number): string {
  return Number.isInteger(value) ? `${value} 小时` : `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} 小时`;
}

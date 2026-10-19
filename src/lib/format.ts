const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const detailedCurrencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount || 0);
}

export function formatCurrencyDetailed(amount: number): string {
  return detailedCurrencyFormatter.format(amount || 0);
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

export function formatMonth(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(date));
}

export function formatPercent(value: number): string {
  if (!isFinite(value)) return '—';
  return `${value >= 0 ? '' : ''}${value.toFixed(1)}%`;
}

export function calculateProfit(revenue: number, cost: number): number {
  return (revenue || 0) - (cost || 0);
}

export function calculateMargin(revenue: number, cost: number): number {
  const profit = calculateProfit(revenue, cost);
  if (!revenue || revenue === 0) return 0;
  return (profit / revenue) * 100;
}

export function calculatePlannedProfit(revenue: number, budget: number): number {
  return (revenue || 0) - (budget || 0);
}

export function calculatePlannedMargin(revenue: number, budget: number): number {
  const profit = calculatePlannedProfit(revenue, budget);
  if (!revenue || revenue === 0) return 0;
  return (profit / revenue) * 100;
}

export function calculateBudgetTotal(labor: number, travel: number, other: number): number {
  return (labor || 0) + (travel || 0) + (other || 0);
}

export function formatHours(hours: number): string {
  if (!hours) return '0 小时';
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value} 小时`;
}

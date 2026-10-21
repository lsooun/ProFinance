import type { BudgetCategory, InvoicePlan, InvoiceStatus, Project, Transaction } from '@/types';
import { calculateBudgetTotal } from '@/lib/format';

export interface ProjectFinancials {
  contractRevenue: number;
  budget: number;
  actualIncome: number;
  actualExpense: number;
  actualProfit: number;
  actualMargin: number;
  plannedProfit: number;
  plannedMargin: number;
  budgetUsed: number;
}

export function sumTransactions(transactions: Transaction[], type: 'income' | 'expense'): number {
  return transactions
    .filter((tx) => tx.type === type)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function suggestedBudgetCategory(category: string): BudgetCategory {
  if (category === '工资' || category === 'Salary') return 'labor';
  if (category === '差旅' || category === 'Travel') return 'travel';
  return 'other';
}

export interface BudgetActuals {
  labor: number;
  travel: number;
  other: number;
  total: number;
}

export function budgetActuals(transactions: Transaction[]): BudgetActuals {
  const actuals: BudgetActuals = { labor: 0, travel: 0, other: 0, total: 0 };
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const category = tx.budget_category === 'labor' || tx.budget_category === 'travel'
      ? tx.budget_category
      : 'other';
    actuals[category] += tx.amount;
    actuals.total += tx.amount;
  }
  return actuals;
}

export function invoiceAmount(plan: InvoicePlan, revenue: number): number {
  return (plan.percentage / 100) * revenue;
}

export function effectiveInvoiceStatus(plan: InvoicePlan, revenue: number): InvoiceStatus {
  const paid = plan.paid_amount ?? 0;
  if (paid <= 0) return plan.status;
  return paid >= invoiceAmount(plan, revenue) ? 'collected' : 'invoiced';
}

export function transactionsForProject(transactions: Transaction[], projectId: string): Transaction[] {
  return transactions.filter((tx) => tx.project_id === projectId);
}

export function projectFinancials(
  project: Project,
  projectTransactions: Transaction[],
): ProjectFinancials {
  return buildProjectFinancials(
    project,
    sumTransactions(projectTransactions, 'income'),
    sumTransactions(projectTransactions, 'expense'),
  );
}

export function projectFinancialsFromAggregates(project: Project): ProjectFinancials {
  return buildProjectFinancials(
    project,
    project.aggregate_income ?? 0,
    project.aggregate_expense ?? 0,
  );
}

function buildProjectFinancials(project: Project, actualIncome: number, actualExpense: number): ProjectFinancials {
  const budget = calculateBudgetTotal(project.budget_labor, project.budget_travel, project.budget_other);
  const actualProfit = actualIncome - actualExpense;
  const netRevenue = project.cost_sheet?.total_revenue_without_tax ?? project.revenue;
  const plannedProfit = project.cost_sheet?.gross_margin ?? netRevenue - budget;
  return {
    contractRevenue: project.revenue,
    budget,
    actualIncome,
    actualExpense,
    actualProfit,
    actualMargin: actualIncome > 0 ? (actualProfit / actualIncome) * 100 : 0,
    plannedProfit,
    plannedMargin: netRevenue > 0 ? (plannedProfit / netRevenue) * 100 : 0,
    budgetUsed: budget > 0 ? (actualExpense / budget) * 100 : 0,
  };
}

export function isSameMonth(dateStr: string, now: Date): boolean {
  const date = new Date(dateStr);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

export function isSameYear(dateStr: string, year: number): boolean {
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === year;
}

import type { Project, Transaction } from '@/types';
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

export function transactionsForProject(transactions: Transaction[], projectId: string): Transaction[] {
  return transactions.filter((tx) => tx.project_id === projectId);
}

export function projectFinancials(
  project: Project,
  projectTransactions: Transaction[],
): ProjectFinancials {
  const budget = calculateBudgetTotal(project.budget_labor, project.budget_travel, project.budget_other);
  const actualIncome = sumTransactions(projectTransactions, 'income');
  const actualExpense = sumTransactions(projectTransactions, 'expense');
  const plannedProfit = project.revenue - budget;
  const actualProfit = actualIncome - actualExpense;
  return {
    contractRevenue: project.revenue,
    budget,
    actualIncome,
    actualExpense,
    actualProfit,
    actualMargin: actualIncome > 0 ? (actualProfit / actualIncome) * 100 : 0,
    plannedProfit,
    plannedMargin: project.revenue > 0 ? (plannedProfit / project.revenue) * 100 : 0,
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

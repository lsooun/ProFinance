import type * as XLSXTypes from 'xlsx';
import type { CostSheetData, CostSheetMilestone } from '@/types';

type Worksheet = XLSXTypes.WorkSheet;

function getSheet(workbook: XLSXTypes.WorkBook, name: string): Worksheet | null {
  const exact = workbook.Sheets[name];
  if (exact) return exact;
  const match = Object.keys(workbook.Sheets).find((key) => key.trim().toLowerCase() === name.toLowerCase());
  return match ? workbook.Sheets[match] : null;
}

function rawValue(sheet: Worksheet | null, address: string): unknown {
  if (!sheet) return undefined;
  const cell = sheet[address] as XLSXTypes.CellObject | undefined;
  return cell?.v;
}

function numberValue(sheet: Worksheet | null, address: string, fallback = 0): number {
  const value = rawValue(sheet, address);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[%,,\s]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringValue(sheet: Worksheet | null, address: string): string {
  const value = rawValue(sheet, address);
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return localDateString(value);
  return String(value).trim();
}

function localDateString(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function dateValue(sheet: Worksheet | null, address: string): string | null {
  const value = rawValue(sheet, address);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localDateString(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'number' && value > 1000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

function sumRange(sheet: Worksheet | null, startRow: number, endRow: number, column: string): number {
  let total = 0;
  for (let row = startRow; row <= endRow; row++) {
    total += numberValue(sheet, `${column}${row}`);
  }
  return total;
}

function columnName(index: number): string {
  let name = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

export function costSheetToProjectFields(data: CostSheetData) {
  const budgetOther = Math.max(0, data.total_cost - data.manpower_cost - data.travel_cost);
  return {
    budget_labor: data.manpower_cost,
    budget_travel: data.travel_cost,
    budget_other: budgetOther,
    revenue: data.total_contract_with_tax,
  };
}

export async function parseCostSheet(buffer: ArrayBuffer, fileName: string): Promise<CostSheetData> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const summary = getSheet(workbook, 'Cost Sheet Summary');
  const people = getSheet(workbook, '人员成本');
  const quote = getSheet(workbook, '报价');
  const other = getSheet(workbook, '其它费用');
  const outsourcing = getSheet(workbook, '外包报价');
  const ratesSheet = getSheet(workbook, '人天成本');

  const warnings: string[] = [];
  if (!quote) warnings.push('未找到“报价”工作表，部分合同金额可能无法计算。');
  if (!people) warnings.push('未找到“人员成本”工作表，人力成本可能无法计算。');
  if (!other) warnings.push('未找到“其它费用”工作表，差旅及其他费用可能无法计算。');
  if (!outsourcing) warnings.push('未找到“外包报价”工作表，外包成本按 0 计算。');
  if (!ratesSheet) warnings.push('未找到“人天成本”工作表，将使用人员成本表中的单价。');
  if (!summary) warnings.push('未找到“Cost Sheet Summary”工作表，利润率等汇总值将根据明细计算。');

  const rates = new Map<string, number>();
  if (ratesSheet) {
    for (let row = 2; row <= 20; row++) {
      const level = stringValue(ratesSheet, `B${row}`).toUpperCase();
      const rate = numberValue(ratesSheet, `C${row}`);
      if (level && rate > 0) rates.set(level, rate);
    }
  }

  let manpowerCost = 0;
  let personDays = 0;
  if (people) {
    for (let row = 12; row <= 40; row++) {
      const name = stringValue(people, `A${row}`);
      if (/^total/i.test(name)) continue;
      const level = stringValue(people, `B${row}`).toUpperCase();
      let days = numberValue(people, `G${row}`);
      if (days === 0) {
        for (let col = 8; col <= 30; col++) {
          const cellAddress = `${columnName(col)}${row}`;
          days += numberValue(people, cellAddress);
        }
      }
      if (!name && !level && days === 0) continue;
      const fallbackRate = numberValue(people, `C${row}`);
      const rate = rates.get(level) || fallbackRate;
      if (days > 0) {
        personDays += days;
        manpowerCost += rate * days;
      }
    }
  }
  const summaryManpower = numberValue(summary, 'E22');
  if (summaryManpower > 0 && Math.abs(summaryManpower - manpowerCost) > 1) {
    warnings.push(`明细人力成本 ${manpowerCost.toLocaleString('zh-CN')} 与汇总值 ${summaryManpower.toLocaleString('zh-CN')} 不一致，已采用明细计算值。`);
  }
  if (manpowerCost === 0) {
    manpowerCost = summaryManpower;
  }

  const travelCost = numberValue(other, 'D19', sumRange(other, 12, 18, 'D'));
  const otherExpense = numberValue(other, 'D28', sumRange(other, 21, 27, 'D'));
  const outsourcingCost = numberValue(outsourcing, 'E11', sumRange(outsourcing, 6, 10, 'E'));

  const serviceContractWithTax = numberValue(quote, 'D18');
  const serviceRevenueWithoutTax = numberValue(quote, 'D17');
  const hardwareContractWithTax = numberValue(summary, 'E11');
  const totalContractWithTax = numberValue(summary, 'E13', serviceContractWithTax + hardwareContractWithTax);
  const totalRevenueWithoutTax = numberValue(summary, 'E17', serviceRevenueWithoutTax);
  const serviceCost = numberValue(summary, 'E20');
  const withholdingTax = numberValue(summary, 'E24');

  let totalCost = numberValue(summary, 'E25');
  if (totalCost === 0) {
    totalCost = manpowerCost + travelCost + otherExpense + outsourcingCost + serviceCost + withholdingTax;
  }
  const grossMargin = numberValue(summary, 'E26', totalRevenueWithoutTax - totalCost);
  const grossMarginPct = normalizePercent(numberValue(summary, 'E28', totalRevenueWithoutTax > 0 ? grossMargin / totalRevenueWithoutTax : 0));

  const contingencyManpower = numberValue(summary, 'E31', manpowerCost * 0.05);
  const contingencyOutsourcing = numberValue(summary, 'E30', outsourcingCost * 0.05);
  const otherRisk = numberValue(summary, 'E32');
  const surchargeTax = numberValue(summary, 'E33') + numberValue(summary, 'E34');
  const financialInterest = numberValue(summary, 'E35');
  const approvalMargin = numberValue(
    summary,
    'E36',
    grossMargin - contingencyManpower - contingencyOutsourcing - otherRisk - surchargeTax - financialInterest,
  );
  const approvalMarginPct = normalizePercent(numberValue(summary, 'E37', totalRevenueWithoutTax > 0 ? approvalMargin / totalRevenueWithoutTax : 0));

  const paymentMilestones: CostSheetMilestone[] = [];
  if (quote) {
    for (let row = 29; row <= 40; row++) {
      const stage = stringValue(quote, `A${row}`);
      const percentage = normalizePercent(numberValue(quote, `B${row}`));
      if (!stage || percentage <= 0) continue;
      paymentMilestones.push({
        stage,
        percentage: Math.round(percentage * 10000) / 100,
        amount: numberValue(quote, `C${row}`, totalContractWithTax * percentage),
        description: stringValue(quote, `D${row}`),
      });
    }
  }
  if (paymentMilestones.length > 0) {
    const milestoneTotal = paymentMilestones.reduce((sum, item) => sum + item.percentage, 0);
    if (Math.abs(milestoneTotal - 100) > 0.01) {
      warnings.push(`付款节点比例合计为 ${milestoneTotal.toFixed(2)}%，与 100% 不一致。`);
    }
  }

  const customerName = stringValue(people, 'B2');
  const projectDescription = stringValue(people, 'B6');
  const projectStartDate = dateValue(people, 'B9');
  if (!customerName && !projectDescription) {
    warnings.push('未能从成本表读取客户名称或项目描述。');
  }

  return {
    source_file_name: fileName,
    parsed_at: new Date().toISOString(),
    customer_name: customerName,
    project_description: projectDescription,
    project_start_date: projectStartDate,
    person_days: personDays || numberValue(quote, 'B15'),
    service_contract_with_tax: serviceContractWithTax,
    service_revenue_without_tax: serviceRevenueWithoutTax,
    hardware_contract_with_tax: hardwareContractWithTax,
    total_contract_with_tax: totalContractWithTax,
    total_revenue_without_tax: totalRevenueWithoutTax,
    manpower_cost: manpowerCost,
    travel_cost: travelCost,
    other_expense: otherExpense,
    outsourcing_cost: outsourcingCost,
    service_cost: serviceCost,
    withholding_tax: withholdingTax,
    total_cost: totalCost,
    gross_margin: grossMargin,
    gross_margin_pct: grossMarginPct,
    contingency_manpower: contingencyManpower,
    contingency_outsourcing: contingencyOutsourcing,
    other_risk: otherRisk,
    approval_margin: approvalMargin,
    approval_margin_pct: approvalMarginPct,
    payment_milestones: paymentMilestones,
    warnings,
  };
}

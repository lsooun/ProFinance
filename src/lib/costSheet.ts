import type { CostSheetData } from '@/types';

export interface CostSheetInputs {
  hardwareContract: number;
  serviceContract: number;
  hardwareCost: number;
  serviceCost: number;
  outsourcingCost: number;
  manpowerCost: number;
  otherExpense: number;
  travelCost: number;
  withholdingTax: number;
  contingencyOutsourcingPct: number;
  contingencyManpowerPct: number;
  otherRisk: number;
  financialInterest: number;
}

export const EMPTY_COST_SHEET_INPUTS: CostSheetInputs = {
  hardwareContract: 0,
  serviceContract: 0,
  hardwareCost: 0,
  serviceCost: 0,
  outsourcingCost: 0,
  manpowerCost: 0,
  otherExpense: 0,
  travelCost: 0,
  withholdingTax: 0,
  contingencyOutsourcingPct: 5,
  contingencyManpowerPct: 5,
  otherRisk: 0,
  financialInterest: 0,
};

function n(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function legacyPct(amount: unknown, base: number): number {
  if (typeof amount === 'number' && base > 0) return (amount / base) * 100;
  return 5;
}

export function costSheetInputsFromData(data?: CostSheetData | null): CostSheetInputs {
  if (!data) return { ...EMPTY_COST_SHEET_INPUTS };
  const hardwareContract = n(data.hardware_contract_with_tax);
  const serviceContract = n(data.service_contract_with_tax)
    || Math.max(0, n(data.total_contract_with_tax) - hardwareContract);
  const outsourcingCost = n(data.outsourcing_cost);
  const manpowerCost = n(data.manpower_cost);
  return {
    hardwareContract,
    serviceContract,
    hardwareCost: n(data.hardware_cost),
    serviceCost: n(data.service_cost),
    outsourcingCost,
    manpowerCost,
    otherExpense: n(data.other_expense),
    travelCost: n(data.travel_cost),
    withholdingTax: n(data.withholding_tax),
    contingencyOutsourcingPct: data.contingency_outsourcing_pct ?? legacyPct(data.contingency_outsourcing, outsourcingCost),
    contingencyManpowerPct: data.contingency_manpower_pct ?? legacyPct(data.contingency_manpower, manpowerCost),
    otherRisk: n(data.other_risk),
    financialInterest: n(data.financial_interest),
  };
}

export function calculateCostSheet(inputs: CostSheetInputs): CostSheetData {
  const hardwareContract = n(inputs.hardwareContract);
  const serviceContract = n(inputs.serviceContract);
  const totalContract = hardwareContract + serviceContract;

  const hardwareRevenue = hardwareContract / 1.13;
  const serviceRevenue = serviceContract / 1.06;
  const totalRevenue = hardwareRevenue + serviceRevenue;

  const hardwareCost = n(inputs.hardwareCost);
  const serviceCost = n(inputs.serviceCost);
  const outsourcingCost = n(inputs.outsourcingCost);
  const manpowerCost = n(inputs.manpowerCost);
  const otherExpense = n(inputs.otherExpense);
  const travelCost = Math.min(Math.max(0, n(inputs.travelCost)), otherExpense);
  const withholdingTax = n(inputs.withholdingTax);
  const totalCost = hardwareCost + serviceCost + outsourcingCost + manpowerCost + otherExpense + withholdingTax;

  const grossMargin = totalRevenue - totalCost;
  const grossMarginPct = totalRevenue > 0 ? grossMargin / totalRevenue : 0;

  const contingencyOutsourcingPct = n(inputs.contingencyOutsourcingPct);
  const contingencyManpowerPct = n(inputs.contingencyManpowerPct);
  const contingencyOutsourcing = outsourcingCost * (contingencyOutsourcingPct / 100);
  const contingencyManpower = manpowerCost * (contingencyManpowerPct / 100);
  const otherRisk = n(inputs.otherRisk);
  const financialInterest = n(inputs.financialInterest);

  // 与 Cost Sheet 模板保持一致：13% 附加税 = 硬件毛利 × 13% × 12%；
  // 服务 6% 附加税在模板中乘以 0（未启用），因此这里保持 0。
  const surchargeTaxHardware = Math.max(0, (hardwareRevenue - hardwareCost) * 0.13 * 0.12);
  const surchargeTaxService = 0;

  const approvalMargin = grossMargin
    - contingencyOutsourcing
    - contingencyManpower
    - otherRisk
    - surchargeTaxHardware
    - surchargeTaxService
    - financialInterest;
  const approvalMarginPct = totalRevenue > 0 ? approvalMargin / totalRevenue : 0;

  return {
    updated_at: new Date().toISOString(),
    hardware_contract_with_tax: round2(hardwareContract),
    service_contract_with_tax: round2(serviceContract),
    total_contract_with_tax: round2(totalContract),
    hardware_revenue_without_tax: round2(hardwareRevenue),
    service_revenue_without_tax: round2(serviceRevenue),
    total_revenue_without_tax: round2(totalRevenue),
    hardware_cost: round2(hardwareCost),
    service_cost: round2(serviceCost),
    outsourcing_cost: round2(outsourcingCost),
    manpower_cost: round2(manpowerCost),
    other_expense: round2(otherExpense),
    travel_cost: round2(travelCost),
    withholding_tax: round2(withholdingTax),
    total_cost: round2(totalCost),
    gross_margin: round2(grossMargin),
    gross_margin_pct: grossMarginPct,
    contingency_outsourcing_pct: contingencyOutsourcingPct,
    contingency_manpower_pct: contingencyManpowerPct,
    contingency_outsourcing: round2(contingencyOutsourcing),
    contingency_manpower: round2(contingencyManpower),
    other_risk: round2(otherRisk),
    surcharge_tax_hardware: round2(surchargeTaxHardware),
    surcharge_tax_service: round2(surchargeTaxService),
    financial_interest: round2(financialInterest),
    approval_margin: round2(approvalMargin),
    approval_margin_pct: approvalMarginPct,
  };
}

export function costSheetToProjectFields(data: CostSheetData) {
  return {
    budget_labor: data.manpower_cost,
    budget_travel: data.travel_cost,
    budget_other: Math.max(0, data.total_cost - data.manpower_cost - data.travel_cost),
    revenue: data.total_contract_with_tax,
  };
}

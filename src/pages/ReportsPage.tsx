import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, Button, Badge, Select } from '@/components/ui';
import { formatCurrency, formatCurrencyDetailed, formatHours, formatDate } from '@/lib/format';
import type { Transaction, Project, Person, TimesheetEntry, InvoicePlan, InvoiceStatus } from '@/types';
import {
  PERSON_ROLE_LABELS, INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, BUDGET_CATEGORY_LABELS,
} from '@/types';
import { effectiveInvoiceStatus, invoiceAmount } from '@/lib/finance';
import {
  getTransactions, getManageableProjects, getPersons, getTimesheets,
  getProjectPlannedHours, getAllInvoicePlans,
} from '@/lib/storage';
import {
  FileBarChart, Download, TrendingUp, TrendingDown, Wallet,
  ChevronLeft, ChevronRight, Clock, Users, FileText,
} from 'lucide-react';

type ReportTab = 'financial' | 'hours' | 'invoices';
type ReportType = 'monthly' | 'yearly';

const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCSV(filename: string, headers: string[], rows: unknown[][]): void {
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';
  const [transactions] = useState<Transaction[]>(getTransactions());
  const [projects] = useState<Project[]>(profile ? getManageableProjects(profile) : []);
  const [persons] = useState<Person[]>(getPersons());
  const [timesheets] = useState<TimesheetEntry[]>(getTimesheets());
  const [invoicePlans] = useState<InvoicePlan[]>(getAllInvoicePlans());
  const [tab, setTab] = useState<ReportTab>('financial');
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const years = [...new Set([
    ...transactions.map((tx) => new Date(tx.transaction_date).getFullYear()),
    ...timesheets.map((entry) => new Date(entry.date).getFullYear()),
    ...invoicePlans.map((plan) => new Date(plan.date).getFullYear()),
  ])].filter((year) => Number.isFinite(year)).sort((a, b) => b - a);
  if (years.length === 0) years.push(new Date().getFullYear());
  if (!years.includes(selectedYear)) years.unshift(selectedYear);

  function inPeriod(dateStr: string): boolean {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    if (reportType === 'yearly') return date.getFullYear() === selectedYear;
    return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
  }

  const periodTx = transactions.filter((tx) => inPeriod(tx.transaction_date));
  const totalIncome = periodTx.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = periodTx.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const monthlyData = MONTH_NAMES.map((_, month) => {
    const monthTx = transactions.filter((tx) => {
      const date = new Date(tx.transaction_date);
      return date.getFullYear() === selectedYear && date.getMonth() === month;
    });
    const income = monthTx.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const expense = monthTx.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    return { month, income, expense, net: income - expense, count: monthTx.length };
  });

  const categoryMap = new Map<string, { category: string; income: number; expense: number; count: number }>();
  periodTx.forEach((tx) => {
    const existing = categoryMap.get(tx.category) || { category: tx.category, income: 0, expense: 0, count: 0 };
    if (tx.type === 'income') existing.income += tx.amount;
    else existing.expense += tx.amount;
    existing.count += 1;
    categoryMap.set(tx.category, existing);
  });
  const categoryData = Array.from(categoryMap.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));

  const projectMap = new Map<string, { projectId: string; projectName: string; income: number; expense: number; net: number }>();
  periodTx.forEach((tx) => {
    if (!tx.project_id) return;
    const project = projects.find((item) => item.id === tx.project_id);
    if (!project) return;
    const existing = projectMap.get(tx.project_id) || { projectId: tx.project_id, projectName: project.name, income: 0, expense: 0, net: 0 };
    if (tx.type === 'income') existing.income += tx.amount;
    else existing.expense += tx.amount;
    existing.net = existing.income - existing.expense;
    projectMap.set(tx.project_id, existing);
  });
  const projectData = Array.from(projectMap.values()).sort((a, b) => b.net - a.net);
  const maxMonthlyAmount = Math.max(...monthlyData.map((month) => Math.max(month.income, month.expense)), 1);

  const periodTimesheets = timesheets.filter((entry) => inPeriod(entry.date));
  const projectHoursData = projects.map((project) => {
    const planned = getProjectPlannedHours(project.id);
    const actual = periodTimesheets.filter((entry) => entry.project_id === project.id).reduce((sum, entry) => sum + entry.hours, 0);
    return { projectId: project.id, projectName: project.name, planned, actual, variance: actual - planned };
  }).filter((project) => project.planned > 0 || project.actual > 0).sort((a, b) => b.actual - a.actual);

  const personHoursData = persons.map((person) => {
    const actual = periodTimesheets.filter((entry) => entry.person_id === person.id).reduce((sum, entry) => sum + entry.hours, 0);
    const projectCount = new Set(periodTimesheets.filter((entry) => entry.person_id === person.id).map((entry) => entry.project_id)).size;
    return { personId: person.id, personName: person.name, role: person.role, actual, projectCount };
  }).filter((person) => person.actual > 0).sort((a, b) => b.actual - a.actual);

  function navigateMonth(direction: number) {
    if (reportType === 'yearly') {
      setSelectedYear((year) => year + direction);
    } else {
      let newMonth = selectedMonth + direction;
      let newYear = selectedYear;
      if (newMonth > 11) { newMonth = 0; newYear++; }
      if (newMonth < 0) { newMonth = 11; newYear--; }
      setSelectedMonth(newMonth);
      setSelectedYear(newYear);
    }
  }

  const periodLabel = reportType === 'yearly' ? `${selectedYear} 年` : `${selectedYear} 年 ${MONTH_NAMES[selectedMonth]}`;
  const totalProjectHours = projectHoursData.reduce((sum, project) => sum + project.actual, 0);
  const totalPersonHours = personHoursData.reduce((sum, person) => sum + person.actual, 0);

  const invoiceReportData = invoicePlans.filter((plan) => inPeriod(plan.date)).map((plan) => {
    const project = projects.find((item) => item.id === plan.project_id);
    return {
      id: plan.id,
      date: plan.date,
      projectName: project?.name || '未知项目',
      stage: plan.stage,
      percentage: plan.percentage,
      amount: invoiceAmount(plan, project?.revenue || 0),
      paid: plan.paid_amount ?? 0,
      status: effectiveInvoiceStatus(plan, project?.revenue || 0),
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const invoiceStatusCounts: Record<InvoiceStatus, number> = { unbilled: 0, invoiced: 0, collected: 0 };
  const invoiceStatusAmounts: Record<InvoiceStatus, number> = { unbilled: 0, invoiced: 0, collected: 0 };
  invoiceReportData.forEach((invoice) => {
    invoiceStatusCounts[invoice.status]++;
    invoiceStatusAmounts[invoice.status] += invoice.amount;
  });
  const totalInvoiceAmount = invoiceReportData.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalInvoicePaid = invoiceReportData.reduce((sum, invoice) => sum + invoice.paid, 0);

  function exportCSV() {
    if (tab === 'financial') {
      if (periodTx.length === 0) return;
      downloadCSV(
        `财务明细-${periodLabel}.csv`,
        ['日期', '类型', '分类', '说明', '金额', '项目', '预算分类'],
        periodTx.map((tx) => [
          tx.transaction_date,
          tx.type === 'income' ? '收入' : '支出',
          tx.category,
          tx.description || '',
          tx.amount,
          projects.find((project) => project.id === tx.project_id)?.name || '',
          tx.budget_category ? BUDGET_CATEGORY_LABELS[tx.budget_category] : '',
        ]),
      );
      return;
    }
    if (tab === 'hours') {
      if (periodTimesheets.length === 0) return;
      downloadCSV(
        `工时明细-${periodLabel}.csv`,
        ['日期', '人员', '项目', '工时', '工作内容'],
        periodTimesheets.map((entry) => [
          entry.date,
          persons.find((person) => person.id === entry.person_id)?.name || '',
          projects.find((project) => project.id === entry.project_id)?.name || '',
          entry.hours,
          entry.description || '',
        ]),
      );
      return;
    }
    if (invoiceReportData.length === 0) return;
    downloadCSV(
      `回款计划-${periodLabel}.csv`,
      ['日期', '项目', '回款节点', '比例(%)', '金额', '已收金额', '状态'],
      invoiceReportData.map((invoice) => [
        invoice.date,
        invoice.projectName,
        invoice.stage,
        invoice.percentage,
        invoice.amount,
        invoice.paid,
        INVOICE_STATUS_LABELS[invoice.status],
      ]),
    );
  }

  const exportDisabled =
    tab === 'financial' ? periodTx.length === 0 :
    tab === 'hours' ? periodTimesheets.length === 0 :
    invoiceReportData.length === 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
        <button onClick={() => setTab('financial')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'financial' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><FileBarChart className="w-4 h-4" /> 财务</span>
        </button>
        <button onClick={() => setTab('hours')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'hours' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> 工时</span>
        </button>
        <button onClick={() => setTab('invoices')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'invoices' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> 回款计划</span>
        </button>
      </div>

      {isManager && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          你正在查看自己负责项目的明细报表；全部项目的汇总统计请查看仪表盘和项目列表。
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          <button onClick={() => setReportType('monthly')} className={`px-4 py-2 text-sm font-medium transition-colors ${reportType === 'monthly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>月度</button>
          <button onClick={() => setReportType('yearly')} className={`px-4 py-2 text-sm font-medium transition-colors ${reportType === 'yearly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>年度</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors" aria-label="上一期"><ChevronLeft className="w-4 h-4" /></button>
          <div className="px-4 py-2 rounded-lg bg-white border border-slate-200 min-w-[160px] text-center"><span className="text-sm font-semibold text-slate-900">{periodLabel}</span></div>
          <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors" aria-label="下一期"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {reportType === 'monthly' && (
          <Select value={selectedMonth.toString()} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="max-w-[120px]">
            {MONTH_NAMES.map((month, index) => <option key={index} value={index}>{month}</option>)}
          </Select>
        )}
        <Select value={selectedYear.toString()} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="max-w-[110px]">
          {years.map((year) => <option key={year} value={year}>{year} 年</option>)}
        </Select>
        <Button variant="outline" onClick={exportCSV} className="lg:ml-auto" disabled={exportDisabled}>
          <Download className="w-4 h-4" /> 导出 CSV
        </Button>
      </div>

      {tab === 'financial' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div><div><p className="text-sm text-slate-500">总收入</p><p className="text-xl font-bold text-slate-900">{formatCurrencyDetailed(totalIncome)}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-rose-100 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-rose-600" /></div><div><p className="text-sm text-slate-500">总支出</p><p className="text-xl font-bold text-slate-900">{formatCurrencyDetailed(totalExpense)}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className={`w-11 h-11 rounded-lg flex items-center justify-center ${netProfit >= 0 ? 'bg-blue-100' : 'bg-rose-100'}`}><Wallet className={`w-5 h-5 ${netProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`} /></div><div><p className="text-sm text-slate-500">净利润</p><p className={`text-xl font-bold ${netProfit >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{formatCurrencyDetailed(netProfit)}</p></div></div></Card>
          </div>

          {reportType === 'yearly' && (
            <Card className="p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-1">月度收支 — {selectedYear} 年</h3>
              <p className="text-xs text-slate-500 mb-5">按月份对比收入与支出</p>
              {monthlyData.every((month) => month.count === 0) ? (
                <div className="py-12 text-center"><FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">{selectedYear} 年暂无收支数据</p></div>
              ) : (
                <div className="flex items-end justify-between gap-1 sm:gap-2 h-48 pt-4">
                  {monthlyData.map((month) => (
                    <div key={month.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {month.count > 0 && (
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 pointer-events-none">
                          <div>收入：{formatCurrency(month.income)}</div><div>支出：{formatCurrency(month.expense)}</div>
                          <div className={month.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>净额：{formatCurrency(month.net)}</div>
                        </div>
                      )}
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        <div className="w-2.5 sm:w-3 rounded-t bg-emerald-400 hover:bg-emerald-500 transition-colors" style={{ height: `${(month.income / maxMonthlyAmount) * 100}%`, minHeight: month.income > 0 ? '4px' : '0' }} />
                        <div className="w-2.5 sm:w-3 rounded-t bg-rose-400 hover:bg-rose-500 transition-colors" style={{ height: `${(month.expense / maxMonthlyAmount) * 100}%`, minHeight: month.expense > 0 ? '4px' : '0' }} />
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-500 font-medium">{MONTH_NAMES[month.month]}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-emerald-400" /><span className="text-xs text-slate-600">收入</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-rose-400" /><span className="text-xs text-slate-600">支出</span></div>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-4">分类明细</h3>
              {categoryData.length === 0 ? <p className="text-sm text-slate-500 py-8 text-center">本期暂无数据。</p> : (
                <div className="space-y-3">
                  {categoryData.map((category) => {
                    const maxTotal = Math.max(...categoryData.map((item) => item.income + item.expense), 1);
                    return (
                      <div key={category.category}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-slate-700">{category.category}</span>
                          <div className="flex items-center gap-3 text-xs">
                            {category.income > 0 && <span className="text-emerald-600">+{formatCurrency(category.income)}</span>}
                            {category.expense > 0 && <span className="text-rose-600">−{formatCurrency(category.expense)}</span>}
                          </div>
                        </div>
                        <div className="flex h-2 rounded-full bg-slate-100 overflow-hidden">
                          {category.income > 0 && <div className="h-full bg-emerald-400" style={{ width: `${(category.income / maxTotal) * 100}%` }} />}
                          {category.expense > 0 && <div className="h-full bg-rose-400" style={{ width: `${(category.expense / maxTotal) * 100}%` }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-4">项目明细</h3>
              {projectData.length === 0 ? <p className="text-sm text-slate-500 py-8 text-center">本期暂无关联项目的收支。</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="pb-2 font-medium">项目</th><th className="pb-2 font-medium text-right">收入</th><th className="pb-2 font-medium text-right">支出</th><th className="pb-2 font-medium text-right">净额</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {projectData.map((project) => (
                        <tr key={project.projectId} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 text-slate-900 font-medium max-w-[160px] truncate">{project.projectName}</td>
                          <td className="py-2.5 text-right text-emerald-600 whitespace-nowrap">{formatCurrency(project.income)}</td>
                          <td className="py-2.5 text-right text-rose-600 whitespace-nowrap">{formatCurrency(project.expense)}</td>
                          <td className={`py-2.5 text-right font-semibold whitespace-nowrap ${project.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(project.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : tab === 'hours' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div><div><p className="text-sm text-slate-500">本期填报工时</p><p className="text-xl font-bold text-slate-900">{formatHours(totalPersonHours)}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center"><Users className="w-5 h-5 text-emerald-600" /></div><div><p className="text-sm text-slate-500">参与人员</p><p className="text-xl font-bold text-slate-900">{personHoursData.length}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center"><FileBarChart className="w-5 h-5 text-amber-600" /></div><div><p className="text-sm text-slate-500">涉及项目</p><p className="text-xl font-bold text-slate-900">{projectHoursData.length}</p></div></div></Card>
          </div>

          <Card className="p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-1">项目工时 — {periodLabel}</h3>
            <p className="text-xs text-slate-500 mb-4">计划工时为项目全周期数据，实际工时为本期数据。</p>
            {projectHoursData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">本期暂无工时数据。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">项目</th>
                      <th className="pb-2 font-medium text-right">计划工时（全周期）</th>
                      <th className="pb-2 font-medium text-right">本期实际工时</th>
                      <th className="pb-2 font-medium text-right">偏差</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {projectHoursData.map((project) => (
                      <tr key={project.projectId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 text-slate-900 font-medium">{project.projectName}</td>
                        <td className="py-2.5 text-right text-slate-600">{formatHours(project.planned)}</td>
                        <td className="py-2.5 text-right text-slate-900 font-medium">{formatHours(project.actual)}</td>
                        <td className={`py-2.5 text-right font-medium ${project.variance <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {project.variance >= 0 ? '+' : ''}{formatHours(project.variance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-3 font-semibold text-slate-900">合计</td>
                      <td className="py-3 text-right font-semibold text-slate-600">{formatHours(projectHoursData.reduce((sum, project) => sum + project.planned, 0))}</td>
                      <td className="py-3 text-right font-semibold text-slate-900">{formatHours(totalProjectHours)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">人员工时 — {periodLabel}</h3>
            {personHoursData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">本期暂无工时数据。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">人员</th>
                      <th className="pb-2 font-medium">角色</th>
                      <th className="pb-2 font-medium text-right">项目数</th>
                      <th className="pb-2 font-medium text-right">本期工时</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {personHoursData.map((person) => (
                      <tr key={person.personId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 text-slate-900 font-medium">{person.personName}</td>
                        <td className="py-2.5 text-slate-600">{PERSON_ROLE_LABELS[person.role]}</td>
                        <td className="py-2.5 text-right text-slate-600">{person.projectCount}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">{formatHours(person.actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-3 font-semibold text-slate-900" colSpan={3}>合计</td>
                      <td className="py-3 text-right font-semibold text-slate-900">{formatHours(totalPersonHours)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-600" /></div><div><p className="text-sm text-slate-500">本期回款节点</p><p className="text-xl font-bold text-slate-900">{invoiceReportData.length}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-blue-600" /></div><div><p className="text-sm text-slate-500">计划金额</p><p className="text-xl font-bold text-slate-900">{formatCurrency(totalInvoiceAmount)}</p></div></div></Card>
            <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div><div><p className="text-sm text-slate-500">已回款</p><p className="text-xl font-bold text-slate-900">{formatCurrency(invoiceStatusAmounts.collected)}</p></div></div></Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((status) => (
              <Card key={status} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{INVOICE_STATUS_LABELS[status]}</p>
                    <p className="text-lg font-bold text-slate-900">{invoiceStatusCounts[status]} 个节点</p>
                  </div>
                  <Badge className={INVOICE_STATUS_COLORS[status]}>{formatCurrency(invoiceStatusAmounts[status])}</Badge>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">回款计划明细 — {periodLabel}</h3>
            {invoiceReportData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">本期暂无回款计划。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">日期</th>
                      <th className="pb-2 font-medium">项目</th>
                      <th className="pb-2 font-medium">回款节点</th>
                      <th className="pb-2 font-medium text-right">比例</th>
                      <th className="pb-2 font-medium text-right">金额</th>
                      <th className="pb-2 font-medium text-right">已收</th>
                      <th className="pb-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoiceReportData.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 text-slate-600 whitespace-nowrap">{formatDate(invoice.date)}</td>
                        <td className="py-2.5 text-slate-900 font-medium max-w-[160px] truncate">{invoice.projectName}</td>
                        <td className="py-2.5 text-slate-600">{invoice.stage}</td>
                        <td className="py-2.5 text-right text-slate-600">{invoice.percentage}%</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(invoice.amount)}</td>
                        <td className="py-2.5 text-right text-emerald-700 whitespace-nowrap">{formatCurrency(invoice.paid)}</td>
                        <td className="py-2.5">
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                            {invoice.paid > 0 && <span className="text-[10px] text-slate-400">自动对账</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td colSpan={3} className="py-3 font-semibold text-slate-900">合计</td>
                      <td className="py-3 text-right font-semibold text-slate-600">—</td>
                      <td className="py-3 text-right font-semibold text-slate-900">{formatCurrency(totalInvoiceAmount)}</td>
                      <td className="py-3 text-right font-semibold text-emerald-700">{formatCurrency(totalInvoicePaid)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Card, Button, Badge, EmptyState, StatCard, Modal, Input } from '@/components/ui';
import {
  formatCurrency, formatCurrencyDetailed, formatDate, formatHours,
} from '@/lib/format';
import { budgetActuals, effectiveInvoiceStatus, invoiceAmount, projectFinancials } from '@/lib/finance';
import {
  STATUS_LABELS, STATUS_COLORS,
  PERSON_ROLE_LABELS,
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  type Project, type Transaction, type Person, type ProjectAssignment,
  type TimesheetEntry, type InvoicePlan, type ProjectAttachment, type InvoiceStatus,
} from '@/types';
import {
  getProjectById, getTransactionsByProject,
  getAssignmentsByProject, createAssignment, updateAssignment, deleteAssignment,
  getTimesheetsByProject, getProjectActualHours, getProjectPlannedHours,
  getPersons,
  getInvoicePlansByProject, getInvoicePlanTotalPercentage, createInvoicePlan, deleteInvoicePlan, updateInvoicePlan,
  getAttachmentsByProject, createAttachment, deleteAttachment, getAttachmentDownloadUrl,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import {
  ArrowLeft, Calendar, User, Target, TrendingUp, TrendingDown,
  Wallet, Plus, ArrowUpRight, ArrowDownRight, Clock, Users, Trash2, Pencil,
  FileText, Paperclip, Download, Upload, FileSpreadsheet, DollarSign,
} from 'lucide-react';

export default function ProjectDetailPage({
  projectId,
  onBack,
  onAddTransaction,
}: {
  projectId: string;
  onBack: () => void;
  onAddTransaction?: (projectId: string) => void;
}) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const [project, setProject] = useState<Project | null>(getProjectById(projectId));
  const [assignments, setAssignments] = useState<ProjectAssignment[]>(getAssignmentsByProject(projectId));
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>(getTimesheetsByProject(projectId));
  const [transactions, setTransactions] = useState<Transaction[]>(getTransactionsByProject(projectId));
  const [invoicePlans, setInvoicePlans] = useState<InvoicePlan[]>(getInvoicePlansByProject(projectId));
  const [attachments, setAttachments] = useState<ProjectAttachment[]>(getAttachmentsByProject(projectId));
  const persons = getPersons();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoicePlan | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<ProjectAssignment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function reload() {
    setProject(getProjectById(projectId));
    setAssignments(getAssignmentsByProject(projectId));
    setTimesheets(getTimesheetsByProject(projectId));
    setTransactions(getTransactionsByProject(projectId));
    setInvoicePlans(getInvoicePlansByProject(projectId));
    setAttachments(getAttachmentsByProject(projectId));
  }

  if (!project) {
    return (
      <div className="max-w-7xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回项目列表
        </Button>
        <Card className="p-6">
          <EmptyState icon={<Target className="w-6 h-6" />} title="项目不存在或无权访问" description="该项目可能已被删除，或者你没有被分配到该项目。" />
        </Card>
      </div>
    );
  }

  const financials = projectFinancials(project, transactions);
  const budgetActualsByCategory = budgetActuals(transactions);
  const budgetCards = [
    { key: 'labor', label: '人力预算', budget: project.budget_labor, actual: budgetActualsByCategory.labor },
    { key: 'travel', label: '差旅预算', budget: project.budget_travel, actual: budgetActualsByCategory.travel },
    { key: 'other', label: '其他预算', budget: project.budget_other, actual: budgetActualsByCategory.other },
  ];
  const budget = financials.budget;
  const actualCost = financials.actualExpense;
  const plannedProfit = financials.plannedProfit;
  const plannedMargin = financials.plannedMargin;
  const actualProfit = financials.actualProfit;
  const actualMargin = financials.actualMargin;
  const budgetUsed = financials.budgetUsed;
  const txIncome = financials.actualIncome;
  const txExpense = financials.actualExpense;
  const plannedHours = getProjectPlannedHours(projectId);
  const actualHours = getProjectActualHours(projectId);
  const hoursUsed = plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0;
  const invoiceTotalPct = getInvoicePlanTotalPercentage(projectId);
  const invoiceTotalAmount = invoicePlans.reduce((sum, plan) => sum + (plan.percentage / 100) * project.revenue, 0);
  const invoicePaidTotal = invoicePlans.reduce((sum, plan) => sum + (plan.paid_amount ?? 0), 0);
  const canAddInvoice = invoiceTotalPct < 100;

  const myAssignment = assignments.find((assignment) => assignment.person_id === user?.person_id);
  const myPlannedHours = myAssignment?.planned_hours ?? 0;
  const myActualHours = timesheets.reduce((sum, entry) => sum + entry.hours, 0);
  const myVariance = myActualHours - myPlannedHours;

  function personName(id: string): string {
    return persons.find((person) => person.id === id)?.name || '未知人员';
  }

  async function handleDeleteAssignment(id: string) {
    if (await deleteAssignment(id)) reload();
  }

  async function handleDeleteInvoice(id: string) {
    if (await deleteInvoicePlan(id)) reload();
  }

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    if (await updateInvoicePlan(id, { status })) reload();
  }

  async function handleDeleteAttachment(id: string) {
    if (await deleteAttachment(id)) reload();
  }

  function openNewInvoice() {
    setEditingInvoice(null);
    setInvoiceModalOpen(true);
  }

  function openEditInvoice(plan: InvoicePlan) {
    setEditingInvoice(plan);
    setInvoiceModalOpen(true);
  }

  function openNewAssignment() {
    setEditingAssignment(null);
    setAssignModalOpen(true);
  }

  function openEditAssignment(assignment: ProjectAssignment) {
    setEditingAssignment(assignment);
    setAssignModalOpen(true);
  }

  function handleDownload(attachment: ProjectAttachment) {
    const link = document.createElement('a');
    link.href = getAttachmentDownloadUrl(attachment.id);
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const allowedExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    if (!allowedExtensions.some((ext) => fileName.endsWith(ext))) {
      setUploadError('仅支持上传 Excel 文件（.xlsx / .xls）。');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('文件大小不能超过 5 MB。');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const dataBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
      setUploading(true);
      const created = await createAttachment({
        project_id: projectId,
        file_name: file.name,
        file_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_size: file.size,
        data_base64: dataBase64,
      });
      setUploading(false);
      if (created) reload();
    };
    reader.onerror = () => setUploadError('读取文件失败，请重试。');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> 返回项目列表
      </Button>

      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-slate-900">{project.name}</h2>
              <Badge className={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
            </div>
            {project.description && <p className="text-sm text-slate-500 max-w-2xl">{project.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {project.client && <span className="flex items-center gap-1.5"><Target className="w-4 h-4" /> {project.client}</span>}
              {project.manager_name && <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {project.manager_name}</span>}
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {formatDate(project.start_date)} → {formatDate(project.end_date)}</span>
            </div>
          </div>
        </div>
      </Card>

      {canManage && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="合同收入" value={formatCurrency(project.revenue)} icon={<Target className="w-5 h-5" />} color="amber" />
            <StatCard label="实际收入" value={formatCurrency(txIncome)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
            <StatCard label="实际支出" value={formatCurrency(txExpense)} icon={<TrendingDown className="w-5 h-5" />} color="rose" />
            <StatCard label="实际利润" value={formatCurrency(actualProfit)} icon={<Wallet className="w-5 h-5" />} color={actualProfit >= 0 ? 'blue' : 'rose'} />
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">预算拆分与实际执行</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {budgetCards.map((card) => {
                const used = card.budget > 0 ? (card.actual / card.budget) * 100 : 0;
                return (
                  <div key={card.key} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-500">{card.label}</p>
                      <span className={`text-xs font-medium ${used > 100 ? 'text-rose-600' : 'text-slate-500'}`}>{used.toFixed(0)}%</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(card.actual)}</p>
                    <p className="text-xs text-slate-400 mb-2">预算 {formatCurrency(card.budget)}</p>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${used > 100 ? 'bg-rose-500' : used > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(used, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">实际支出按收支记录中的“预算分类”归集。</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <h3 className="text-base font-semibold text-slate-900">回款计划</h3>
              </div>
              {canAddInvoice && (
                <Button size="sm" onClick={openNewInvoice}><Plus className="w-4 h-4" /> 新增回款节点</Button>
              )}
            </div>

            {invoicePlans.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-6 h-6" />}
                title="暂无回款计划"
                description="按阶段设置回款日期、节点和比例，金额按合同收入自动计算。"
                action={canAddInvoice ? <Button size="sm" onClick={openNewInvoice}><Plus className="w-4 h-4" /> 新增回款节点</Button> : undefined}
              />
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                        <th className="px-4 py-2.5 font-medium">日期</th>
                        <th className="px-4 py-2.5 font-medium">节点</th>
                        <th className="px-4 py-2.5 font-medium text-right">比例</th>
                        <th className="px-4 py-2.5 font-medium text-right">金额</th>
                        <th className="px-4 py-2.5 font-medium text-right">已收</th>
                        <th className="px-4 py-2.5 font-medium">状态</th>
                        <th className="px-4 py-2.5 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {invoicePlans.map((plan) => {
                        const paid = plan.paid_amount ?? 0;
                        const status = effectiveInvoiceStatus(plan, project.revenue);
                        const isAuto = paid > 0;
                        return (
                          <tr key={plan.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(plan.date)}</td>
                            <td className="px-4 py-2.5 text-slate-900 font-medium">{plan.stage}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{plan.percentage}%</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(invoiceAmount(plan, project.revenue))}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{formatCurrency(paid)}</td>
                            <td className="px-4 py-2.5">
                              {isAuto ? (
                                <div className="flex flex-col items-start gap-0.5">
                                  <Badge className={INVOICE_STATUS_COLORS[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
                                  <span className="text-[10px] text-slate-400">按关联收入自动对账</span>
                                </div>
                              ) : (
                                <select
                                  value={plan.status}
                                  onChange={(e) => void handleStatusChange(plan.id, e.target.value as InvoiceStatus)}
                                  className={`rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 ${INVOICE_STATUS_COLORS[plan.status]}`}
                                >
                                  {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((item) => (
                                    <option key={item} value={item}>{INVOICE_STATUS_LABELS[item]}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <button onClick={() => openEditInvoice(plan)} className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors" title="编辑">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => void handleDeleteInvoice(plan.id)} className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors ml-1" title="删除">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200">
                        <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-slate-900">合计</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${invoiceTotalPct === 100 ? 'text-emerald-600' : invoiceTotalPct > 100 ? 'text-rose-600' : 'text-slate-900'}`}>{invoiceTotalPct}%</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(invoiceTotalAmount)}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">{formatCurrency(invoicePaidTotal)}</td>
                        <td className="px-4 py-3" />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${invoiceTotalPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(invoiceTotalPct, 100)}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">已规划合同收入的 {invoiceTotalPct}%，已回款 {formatCurrency(invoicePaidTotal)}</span>
                </div>

                {invoiceTotalPct >= 100 && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
                    <Target className="w-4 h-4" /> 回款计划已满 100%，不能再新增节点。
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">预算使用情况</h3>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-bold text-slate-900">{budgetUsed.toFixed(1)}%</span>
                <span className="text-sm text-slate-500">{formatCurrency(actualCost)} / {formatCurrency(budget)}</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budgetUsed > 100 ? 'bg-rose-500' : budgetUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(budgetUsed, 100)}%` }} />
              </div>
              {budgetUsed > 100 && (
                <p className="mt-2 text-xs text-rose-600 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5" /> 已超预算 {formatCurrency(actualCost - budget)}
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">利润对比</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-sm text-slate-500">计划利润（合同收入 − 预算）</span>
                    <span className={`text-lg font-bold ${plannedProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatCurrency(plannedProfit)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>计划利润率</span>
                    <span className={plannedMargin >= 0 ? 'text-blue-600' : 'text-rose-600'}>{plannedMargin.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${plannedProfit >= 0 ? 'bg-blue-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, Math.min(plannedMargin, 100))}%` }} />
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-sm text-slate-500">实际利润（实际收入 − 实际支出）</span>
                    <span className={`text-lg font-bold ${actualProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(actualProfit)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>实际利润率</span>
                    <span className={actualMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{actualMargin.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${actualProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, Math.min(actualMargin, 100))}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">工时汇总</h3>
              <Badge className={hoursUsed > 100 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                已使用 {hoursUsed.toFixed(0)}%
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="flex items-center gap-2.5 rounded-lg bg-blue-50 px-3 py-2.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs text-slate-500">计划工时</p>
                  <p className="text-sm font-semibold text-blue-700">{formatHours(plannedHours)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500">实际工时</p>
                  <p className="text-sm font-semibold text-emerald-700">{formatHours(actualHours)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
                <Clock className="w-4 h-4 text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500">工时偏差</p>
                  <p className={`text-sm font-semibold ${actualHours - plannedHours <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {actualHours - plannedHours >= 0 ? '+' : ''}{formatHours(actualHours - plannedHours)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {!canManage && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-4">我的工时</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-xs text-slate-500">分配工时</p>
              <p className="mt-1 text-lg font-semibold text-blue-700">{formatHours(myPlannedHours)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-4 py-3">
              <p className="text-xs text-slate-500">已填报工时</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{formatHours(myActualHours)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">差异</p>
              <p className={`mt-1 text-lg font-semibold ${myVariance <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {myVariance >= 0 ? '+' : ''}{formatHours(myVariance)}
              </p>
            </div>
          </div>
          {!myAssignment && (
            <p className="mt-3 text-xs text-amber-600">你尚未被分配到此项目，暂时无法填报该项目工时。</p>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">项目成员</h3>
          {canManage && (
            <Button size="sm" onClick={openNewAssignment}><Plus className="w-4 h-4" /> 分配成员</Button>
          )}
        </div>
        {assignments.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="暂无项目成员"
            description="分配团队成员并设置计划工时。"
            action={canManage ? <Button size="sm" onClick={openNewAssignment}><Plus className="w-4 h-4" /> 分配成员</Button> : undefined}
          />
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => {
              const person = persons.find((item) => item.id === assignment.person_id);
              const personActual = timesheets
                .filter((entry) => entry.person_id === assignment.person_id)
                .reduce((sum, entry) => sum + entry.hours, 0);
              return (
                <div key={assignment.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {personName(assignment.person_id).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{personName(assignment.person_id)}</p>
                      <p className="text-xs text-slate-500">{person ? PERSON_ROLE_LABELS[person.role] : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {canManage && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900">{formatHours(assignment.planned_hours)} 计划</p>
                        <p className="text-xs text-slate-500">{formatHours(personActual)} 已填报</p>
                      </div>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => openEditAssignment(assignment)} className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors" title="编辑计划工时">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => void handleDeleteAssignment(assignment.id)} className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors" title="移除成员">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {timesheets.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-4">{canManage ? '最近工时记录' : '我的工时记录'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium">人员</th>
                  <th className="pb-2 font-medium">工作内容</th>
                  <th className="pb-2 font-medium text-right">工时</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {timesheets.slice(0, 10).map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="py-2.5 text-slate-900 font-medium">{personName(entry.person_id)}</td>
                    <td className="py-2.5 text-slate-600 max-w-xs truncate">{entry.description || '—'}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">{formatHours(entry.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canManage && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-slate-400" />
                <h3 className="text-base font-semibold text-slate-900">附件</h3>
                {attachments.length > 0 && <Badge className="bg-slate-100 text-slate-600 border-slate-200">{attachments.length}</Badge>}
              </div>
              <label className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors cursor-pointer ${uploading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                <Upload className="w-4 h-4" /> {uploading ? '上传中…' : '上传成本表'}
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" disabled={uploading} />
              </label>
            </div>

            {uploadError && (
              <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{uploadError}</div>
            )}

            {attachments.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet className="w-6 h-6" />}
                title="暂无附件"
                description="支持上传 Excel 成本表（.xlsx / .xls），单个文件不超过 5 MB。"
              />
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => {
                  const sizeKB = attachment.file_size / 1024;
                  const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB.toFixed(0)} KB`;
                  return (
                    <div key={attachment.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{attachment.file_name}</p>
                          <p className="text-xs text-slate-500">{sizeStr} · {formatDate(attachment.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleDownload(attachment)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded transition-colors" title="下载">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => void handleDeleteAttachment(attachment.id)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">项目收支</h3>
              <Button size="sm" onClick={() => onAddTransaction?.(project.id)}><Plus className="w-4 h-4" /> 新增收支</Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500">收入</p>
                  <p className="text-sm font-semibold text-emerald-700">{formatCurrencyDetailed(txIncome)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-rose-50 px-3 py-2.5">
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
                <div>
                  <p className="text-xs text-slate-500">支出</p>
                  <p className="text-sm font-semibold text-rose-700">{formatCurrencyDetailed(txExpense)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-blue-50 px-3 py-2.5">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs text-slate-500">收支净额</p>
                  <p className="text-sm font-semibold text-blue-700">{formatCurrencyDetailed(txIncome - txExpense)}</p>
                </div>
              </div>
            </div>

            {transactions.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="w-6 h-6" />}
                title="暂无关联收支"
                description="为该项目的收入与支出记账，实际利润会自动更新。"
                action={<Button size="sm" onClick={() => onAddTransaction?.(project.id)}><Plus className="w-4 h-4" /> 新增收支</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">日期</th>
                      <th className="pb-2 font-medium">说明</th>
                      <th className="pb-2 font-medium">分类</th>
                      <th className="pb-2 font-medium">类型</th>
                      <th className="pb-2 font-medium text-right">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 text-slate-600 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                        <td className="py-2.5 text-slate-900 font-medium">{tx.description || tx.category}</td>
                        <td className="py-2.5 text-slate-600">{tx.category}</td>
                        <td className="py-2.5">
                          <Badge className={tx.type === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                            {tx.type === 'income' ? '收入' : '支出'}
                          </Badge>
                        </td>
                        <td className={`py-2.5 text-right font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'income' ? '+' : '−'}{formatCurrencyDetailed(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {assignModalOpen && (
        <AssignMemberModal
          open={assignModalOpen}
          onClose={() => { setAssignModalOpen(false); setEditingAssignment(null); }}
          projectId={projectId}
          persons={persons}
          existingAssignments={assignments}
          assignment={editingAssignment}
          onSaved={() => { setAssignModalOpen(false); setEditingAssignment(null); reload(); }}
        />
      )}

      {invoiceModalOpen && (
        <InvoicePlanModal
          open={invoiceModalOpen}
          onClose={() => { setInvoiceModalOpen(false); setEditingInvoice(null); }}
          projectId={projectId}
          currentTotalPct={invoiceTotalPct - (editingInvoice?.percentage ?? 0)}
          revenue={project.revenue}
          plan={editingInvoice}
          onSaved={() => { setInvoiceModalOpen(false); setEditingInvoice(null); reload(); }}
        />
      )}
    </div>
  );
}

function AssignMemberModal({
  open, onClose, projectId, persons, existingAssignments, assignment, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  persons: Person[];
  existingAssignments: ProjectAssignment[];
  assignment: ProjectAssignment | null;
  onSaved: () => void;
}) {
  const isEditing = Boolean(assignment);
  const [personId, setPersonId] = useState(assignment?.person_id || '');
  const [plannedHours, setPlannedHours] = useState(assignment?.planned_hours?.toString() || '80');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const availablePersons = persons.filter(
    (person) => person.is_active && !existingAssignments.some((item) => item.person_id === person.id),
  );
  const editingPerson = assignment
    ? persons.find((person) => person.id === assignment.person_id) || null
    : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEditing && !personId) { setError('请选择人员。'); return; }
    const hours = parseFloat(plannedHours);
    if (!hours || hours <= 0) { setError('计划工时必须大于 0。'); return; }
    setSaving(true);
    const result = isEditing && assignment
      ? await updateAssignment(assignment.id, hours)
      : await createAssignment({ project_id: projectId, person_id: personId, planned_hours: hours });
    setSaving(false);
    if (result) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? '编辑成员计划工时' : '分配项目成员'}>
      <form onSubmit={handleSave} className="space-y-4">
        {isEditing ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            成员：<span className="font-medium">{editingPerson?.name || '未知人员'}</span>
            <span className="text-slate-400 ml-2">（成员不可变，仅调整计划工时）</span>
          </div>
        ) : (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">选择人员…</option>
            {availablePersons.map((person) => <option key={person.id} value={person.id}>{person.name} — {PERSON_ROLE_LABELS[person.role]}</option>)}
            {availablePersons.length === 0 && <option value="" disabled>所有在职人员都已分配</option>}
          </select>
        )}
        <Input label="计划工时（小时）" type="number" min="1" step="1" required value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} placeholder="80" />
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving || (!isEditing && availablePersons.length === 0)}>{saving ? '保存中…' : isEditing ? '保存修改' : '分配'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function InvoicePlanModal({
  open, onClose, projectId, currentTotalPct, revenue, plan, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  currentTotalPct: number;
  revenue: number;
  plan: InvoicePlan | null;
  onSaved: () => void;
}) {
  const isEditing = Boolean(plan);
  const [date, setDate] = useState(plan?.date || new Date().toISOString().slice(0, 10));
  const [stage, setStage] = useState(plan?.stage || '');
  const [percentage, setPercentage] = useState(plan?.percentage?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const remaining = 100 - currentTotalPct;
  const pctNum = parseFloat(percentage) || 0;
  const amount = (pctNum / 100) * revenue;
  const maxInput = Math.max(remaining, 1);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date) { setError('请选择日期。'); return; }
    if (!stage.trim()) { setError('请填写回款节点。'); return; }
    if (!pctNum || pctNum <= 0) { setError('回款比例必须大于 0。'); return; }
    if (currentTotalPct + pctNum > 100) {
      setError(`回款比例合计不能超过 100%，剩余 ${remaining}%。`);
      return;
    }
    setSaving(true);
    const result = isEditing && plan
      ? await updateInvoicePlan(plan.id, { date, stage: stage.trim(), percentage: pctNum })
      : await createInvoicePlan({ project_id: projectId, date, stage: stage.trim(), percentage: pctNum, status: 'unbilled' });
    setSaving(false);
    if (result) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? '编辑回款节点' : '新增回款节点'}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
          其他节点已规划：<strong>{currentTotalPct}%</strong>，可分配：<strong>{Math.max(remaining, 0)}%</strong>，合同收入：<strong>{formatCurrency(revenue)}</strong>
        </div>
        <Input label="日期" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="回款节点" required value={stage} onChange={(e) => setStage(e.target.value)} placeholder="例如：第一阶段：项目启动" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={`比例（最多 ${Math.max(remaining, 0)}%）`} type="number" min="1" max={maxInput} step="1" required value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="例如：40" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">计算金额</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
              {formatCurrency(amount)}
            </div>
          </div>
        </div>
        {isEditing && (
          <p className="text-xs text-slate-400">修改比例时会校验所有回款节点的合计不超过 100%。回款状态由关联收入自动对账，或按原手工状态保留。</p>
        )}
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : isEditing ? '保存修改' : '添加节点'}</Button>
        </div>
      </form>
    </Modal>
  );
}

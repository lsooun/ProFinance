import { useState } from 'react';
import {
  Card, Button, Input, Select, Textarea, Modal, Badge, EmptyState, StatCard,
} from '@/components/ui';
import {
  formatCurrency, formatHours, formatDate,
} from '@/lib/format';
import { projectFinancials, projectFinancialsFromAggregates } from '@/lib/finance';
import { costSheetToProjectFields, parseCostSheet } from '@/lib/costSheet';
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_DOT_COLORS,
  type CostSheetData, type ManagerOption, type Project, type ProjectStatus,
} from '@/types';
import {
  getProjects, createProject, updateProject, deleteProject,
  getProjectActualHours, getProjectPlannedHours,
  getManagerOptions, getAccessibleProjects, getTransactionsByProject,
  getAssignmentsByProject, getTimesheetsByProject, createAttachment,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import {
  Plus, FolderKanban, Search, Pencil, Trash2, Filter, X,
  DollarSign, TrendingUp, AlertCircle, Clock, Briefcase, Upload, FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import { notify } from '@/lib/notify';

const ALL_STATUSES: ProjectStatus[] = ['presales', 'in_progress', 'completed', 'cancelled'];

export default function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>(
    user ? getAccessibleProjects(user) : getProjects(),
  );
  const managerOptions = getManagerOptions();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ProjectStatus[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    setProjects(user ? getAccessibleProjects(user) : getProjects());
  }

  const filtered = projects.filter((project) => {
    const keyword = search.toLowerCase();
    const matchesSearch =
      project.name.toLowerCase().includes(keyword) ||
      (project.client || '').toLowerCase().includes(keyword);
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(project.status);
    return matchesSearch && matchesStatus;
  });

  const totalContract = filtered.reduce((sum, project) => sum + project.revenue, 0);
  const financialsFor = (project: Project) => user?.role === 'manager'
    ? projectFinancialsFromAggregates(project)
    : projectFinancials(project, getTransactionsByProject(project.id));
  const totalActualIncome = filtered.reduce((sum, project) => sum + financialsFor(project).actualIncome, 0);
  const totalActualProfit = filtered.reduce((sum, project) => sum + financialsFor(project).actualProfit, 0);
  const myActiveProjects = filtered.filter((project) => project.status === 'in_progress').length;
  const myTotalHours = filtered.reduce(
    (sum, project) =>
      sum +
      getTimesheetsByProject(project.id)
        .filter((entry) => entry.person_id === user?.person_id)
        .reduce((hours, entry) => hours + entry.hours, 0),
    0,
  );

  function toggleStatus(status: ProjectStatus) {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status],
    );
  }

  function openNew() {
    setEditingProject(null);
    setModalOpen(true);
  }

  function openEdit(project: Project) {
    setEditingProject(project);
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteProject(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
      reload();
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {canManage ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="合同总额" value={formatCurrency(totalContract)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
          <StatCard label="实际收入" value={formatCurrency(totalActualIncome)} icon={<DollarSign className="w-5 h-5" />} color="blue" />
          <StatCard label="实际利润" value={formatCurrency(totalActualProfit)} icon={<DollarSign className="w-5 h-5" />} color={totalActualProfit >= 0 ? 'blue' : 'rose'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="我的项目" value={String(filtered.length)} icon={<Briefcase className="w-5 h-5" />} color="blue" />
          <StatCard label="进行中的项目" value={String(myActiveProjects)} icon={<Clock className="w-5 h-5" />} color="emerald" />
          <StatCard label="我的累计工时" value={formatHours(myTotalHours)} icon={<Clock className="w-5 h-5" />} color="amber" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="按项目名称或客户搜索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>状态：</span>
          </div>
          {ALL_STATUSES.map((status) => {
            const active = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  active
                    ? STATUS_COLORS[status] + ' ring-1 ring-offset-0'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
                {STATUS_LABELS[status]}
                {active && <X className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
          {selectedStatuses.length > 0 && (
            <button onClick={() => setSelectedStatuses([])} className="text-xs text-slate-400 hover:text-slate-600 ml-1">清除筛选</button>
          )}
        </div>

        {canManage && (
          <Button onClick={openNew} className="lg:ml-auto">
            <Plus className="w-4 h-4" /> 新建项目
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<FolderKanban className="w-6 h-6" />}
            title={
              projects.length === 0
                ? canManage ? '暂无项目' : '暂无可访问项目'
                : '没有匹配的项目'
            }
            description={
              projects.length === 0
                ? canManage
                  ? '创建第一个项目，开始跟踪预算、收入和实际利润。'
                  : '你还没有被分配到任何项目，请联系项目经理。'
                : '请调整搜索条件或状态筛选。'
            }
            action={
              projects.length === 0 && canManage
                ? <Button onClick={openNew}><Plus className="w-4 h-4" />新建项目</Button>
                : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const financials = financialsFor(project);
            const plannedProfit = financials.plannedProfit;
            const plannedMargin = financials.plannedMargin;
            const canEditProject = user?.role === 'admin'
              || (user?.role === 'manager' && project.manager_user_id === user.id);
            const plannedHours = user?.role === 'manager'
              ? (project.aggregate_planned_hours ?? 0)
              : getProjectPlannedHours(project.id);
            const actualHours = user?.role === 'manager'
              ? (project.aggregate_hours ?? 0)
              : getProjectActualHours(project.id);
            const myAssignment = getAssignmentsByProject(project.id).find(
              (assignment) => assignment.person_id === user?.person_id,
            );
            const myPlannedHours = myAssignment?.planned_hours ?? 0;
            const myActualHours = getTimesheetsByProject(project.id)
              .filter((entry) => entry.person_id === user?.person_id)
              .reduce((sum, entry) => sum + entry.hours, 0);
            return (
              <Card key={project.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
                <div onClick={() => onOpenProject(project.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{project.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{project.client || '未填写客户'}</p>
                    </div>
                    <Badge className={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                  </div>

                  {project.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>}

                  {canManage ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">合同收入</span>
                        <span className="font-medium text-slate-900">{formatCurrency(project.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">预算总额</span>
                        <span className="font-medium text-slate-900">{formatCurrency(financials.budget)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">实际收入</span>
                        <span className="font-medium text-emerald-600">{formatCurrency(financials.actualIncome)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">实际支出</span>
                        <span className="font-medium text-rose-600">{formatCurrency(financials.actualExpense)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">计划利润</span>
                        <div className="text-right">
                          <span className={`font-semibold ${plannedProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatCurrency(plannedProfit)}</span>
                          <span className="text-xs text-slate-400 ml-1.5">({plannedMargin.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                        <span className="text-slate-500">实际利润</span>
                        <div className="text-right">
                          <span className={`font-semibold ${financials.actualProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(financials.actualProfit)}</span>
                          <span className="text-xs text-slate-400 ml-1.5">({financials.actualMargin.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">项目经理</span>
                        <span className="font-medium text-slate-900">{project.manager_name || '未指定'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">项目周期</span>
                        <span className="text-slate-700">{formatDate(project.start_date)} — {formatDate(project.end_date)}</span>
                      </div>
                    </div>
                  )}

                  {canManage && financials.budget > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>预算使用率</span>
                        <span>{financials.budgetUsed.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${financials.budgetUsed > 100 ? 'bg-rose-500' : financials.budgetUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(financials.budgetUsed, 100)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    {canManage ? (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatHours(actualHours)} / {formatHours(plannedHours)}</span>
                    ) : (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 我的工时 {formatHours(myActualHours)} / {formatHours(myPlannedHours)}</span>
                    )}
                    {canManage ? (
                      <span>{project.manager_name || '未指定项目经理'}</span>
                    ) : (
                      <span>查看详情 →</span>
                    )}
                  </div>
                </div>

                {canEditProject && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(project)}><Pencil className="w-3.5 h-3.5" /> 编辑</Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(project)} className="text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /> 删除</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <ProjectFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          project={editingProject}
          managerOptions={managerOptions}
          currentUserId={user?.id || ''}
          currentUserRole={user?.role || 'employee'}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="删除项目" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-sm text-slate-700">
                确定要删除 <span className="font-semibold">{deleteTarget.name}</span> 吗？
                相关项目成员、工时、回款计划和附件将一并删除；已关联的收支记录会保留，但会取消项目关联。此操作不可撤销。
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
              <Button variant="danger" onClick={() => void handleDelete()} disabled={deleting}>{deleting ? '删除中…' : '确认删除'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function ProjectFormModal({
  open, onClose, project, managerOptions, currentUserId, currentUserRole, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  managerOptions: ManagerOption[];
  currentUserId: string;
  currentUserRole: 'admin' | 'manager' | 'employee';
  onSaved: () => void;
}) {
  const isEditing = Boolean(project);
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'presales');
  const [managerId, setManagerId] = useState(
    project?.manager_user_id || (currentUserRole === 'manager' ? currentUserId : ''),
  );
  const [client, setClient] = useState(project?.client || '');
  const [startDate, setStartDate] = useState(project?.start_date || '');
  const [endDate, setEndDate] = useState(project?.end_date || '');
  const [budgetLabor, setBudgetLabor] = useState(project?.budget_labor?.toString() || '0');
  const [budgetTravel, setBudgetTravel] = useState(project?.budget_travel?.toString() || '0');
  const [budgetOther, setBudgetOther] = useState(project?.budget_other?.toString() || '0');
  const [revenue, setRevenue] = useState(project?.revenue?.toString() || '0');
  const [costSheet, setCostSheet] = useState<CostSheetData | null>(project?.cost_sheet ?? null);
  const [costSheetFile, setCostSheetFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [costSheetError, setCostSheetError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalBudget = (parseFloat(budgetLabor) || 0) + (parseFloat(budgetTravel) || 0) + (parseFloat(budgetOther) || 0);

  async function handleCostSheetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCostSheetError(null);
    setError(null);
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setCostSheetError('Cost Sheet 仅支持 Excel 文件（.xlsx / .xls）。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCostSheetError('Cost Sheet 文件不能超过 10 MB。');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseCostSheet(await file.arrayBuffer(), file.name);
      const fields = costSheetToProjectFields(parsed);
      setCostSheet(parsed);
      setCostSheetFile(file);
      setBudgetLabor(String(Math.round(fields.budget_labor * 100) / 100));
      setBudgetTravel(String(Math.round(fields.budget_travel * 100) / 100));
      setBudgetOther(String(Math.round(fields.budget_other * 100) / 100));
      setRevenue(String(Math.round(fields.revenue * 100) / 100));
      if (parsed.customer_name) setClient(parsed.customer_name);
      if (parsed.project_description) setDescription(parsed.project_description);
      if (parsed.project_start_date) setStartDate(parsed.project_start_date);
    } catch (err) {
      setCostSheetError(err instanceof Error ? err.message : 'Cost Sheet 解析失败，请检查文件结构。');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('项目名称不能为空'); return; }
    setSaving(true);
    const payload: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'manager_name'> = {
      name: name.trim(),
      description,
      status,
      manager_user_id: currentUserRole === 'manager' ? currentUserId : managerId || null,
      client,
      start_date: startDate || null,
      end_date: endDate || null,
      budget_labor: parseFloat(budgetLabor) || 0,
      budget_travel: parseFloat(budgetTravel) || 0,
      budget_other: parseFloat(budgetOther) || 0,
      revenue: parseFloat(revenue) || 0,
      cost_sheet: !isEditing ? costSheet : undefined,
    };
    const saved = project ? await updateProject(project.id, payload) : await createProject(payload);
    if (!saved) {
      setSaving(false);
      return;
    }
    if (!project && costSheetFile) {
      try {
        const dataBase64 = await fileToBase64(costSheetFile);
        const type = costSheetFile.type || (costSheetFile.name.toLowerCase().endsWith('.xls')
          ? 'application/vnd.ms-excel'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const attachment = await createAttachment({
          project_id: saved.id,
          file_name: costSheetFile.name,
          file_type: type,
          file_size: costSheetFile.size,
          category: 'cost_sheet',
          data_base64: dataBase64,
        });
        if (!attachment) notify('项目已创建，但 Cost Sheet 附件上传失败，请在项目附件中重新上传。', 'error');
      } catch {
        notify('项目已创建，但 Cost Sheet 附件上传失败，请在项目附件中重新上传。', 'error');
      }
    }
    setSaving(false);
    onSaved();
  }

  const metrics = costSheet ? [
    { label: '合同总额（含税）', value: formatCurrency(costSheet.total_contract_with_tax) },
    { label: '净收入（不含税）', value: formatCurrency(costSheet.total_revenue_without_tax) },
    { label: '总成本', value: formatCurrency(costSheet.total_cost) },
    { label: '人力成本', value: formatCurrency(costSheet.manpower_cost) },
    { label: '差旅成本', value: formatCurrency(costSheet.travel_cost) },
    { label: '毛利率', value: `${(costSheet.gross_margin_pct * 100).toFixed(1)}%` },
    { label: '审批利润', value: formatCurrency(costSheet.approval_margin) },
    { label: '人天', value: `${costSheet.person_days}` },
  ] : [];

  return (
    <Modal open={open} onClose={onClose} title={project ? '编辑项目' : '新建项目'} size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        {!project && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <FileSpreadsheet className="w-4 h-4" /> 上传 Cost Sheet 并自动计算
                </div>
                <p className="text-xs text-blue-700/70 mt-1">
                  支持本模板的报价、人员成本、其它费用、外包和人天成本表；解析后自动填充预算、收入和项目基本信息。
                </p>
              </div>
              <label className={`inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 cursor-pointer hover:bg-blue-50 ${parsing ? 'opacity-60 pointer-events-none' : ''}`}>
                {parsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {parsing ? '解析中…' : costSheet ? '重新上传' : '选择 Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleCostSheetFile(e)} />
              </label>
            </div>
            {costSheetError && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{costSheetError}</div>}
            {costSheet && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-900 truncate">{costSheet.source_file_name}</span>
                  <span className="text-blue-700/60">已解析，预算和收入已自动填充</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {metrics.map((item) => (
                    <div key={item.label} className="rounded-lg bg-white border border-blue-100 px-2.5 py-2">
                      <p className="text-[10px] text-slate-500">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>
                {costSheet.payment_milestones.length > 0 && (
                  <div className="rounded-lg bg-white border border-blue-100 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-600 mb-1">付款节点</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {costSheet.payment_milestones.map((item) => (
                        <span key={item.stage}>{item.stage} {item.percentage}% · {formatCurrency(item.amount)}</span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-blue-700/70">成本表会作为“成本表”类型附件保存到项目；审批利润 = 毛利 − 人力/外包风险金 − 其他风险。</p>
                {costSheet.warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 space-y-0.5">
                    {costSheet.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="项目名称" required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：企业官网改版" />
          <Input label="客户" value={client} onChange={(e) => setClient(e.target.value)} placeholder="例如：艾克米公司" />
        </div>
        <Textarea label="项目描述" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目内容…" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="项目状态" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {ALL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
          </Select>
          {currentUserRole === 'manager' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">项目经理</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {managerOptions.find((manager) => manager.id === currentUserId)?.full_name || '本人'}（仅自己负责的项目可查看明细）
              </div>
            </div>
          ) : (
            <Select label="项目经理" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">未指定项目经理</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.full_name}</option>
              ))}
              {project?.manager_user_id && !managerOptions.some((manager) => manager.id === project.manager_user_id) && (
                <option value={project.manager_user_id}>{project.manager_name || '当前项目经理'}（不可用）</option>
              )}
            </Select>
          )}
        </div>
        <p className="text-xs text-slate-400 -mt-2">项目经理仅能管理自己负责的项目；管理员可以指定任意项目经理。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="开始日期" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="结束日期" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <DollarSign className="w-4 h-4 text-slate-400" /> 预算拆分
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="人力预算（元）" type="number" min="0" step="0.01" value={budgetLabor} onChange={(e) => setBudgetLabor(e.target.value)} />
            <Input label="差旅预算（元）" type="number" min="0" step="0.01" value={budgetTravel} onChange={(e) => setBudgetTravel(e.target.value)} />
            <Input label="其他预算（元）" type="number" min="0" step="0.01" value={budgetOther} onChange={(e) => setBudgetOther(e.target.value)} />
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
            <span className="text-slate-500">预算总额</span>
            <span className="font-bold text-slate-900">{formatCurrency(totalBudget)}</span>
          </div>
        </div>

        <Input label="合同收入（元，含税）" type="number" min="0" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
        <p className="text-xs text-slate-400 -mt-2">Cost Sheet 的合同总额（含税）会自动填入此处；项目利润率使用成本表中的净收入计算。</p>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving || parsing}>{saving ? '保存中…' : project ? '保存修改' : '创建项目'}</Button>
        </div>
      </form>
    </Modal>
  );
}

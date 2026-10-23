import { useEffect, useState } from 'react';
import {
  Card, Button, Input, Select, Textarea, Modal, Badge, EmptyState, StatCard,
} from '@/components/ui';
import {
  formatCurrency, formatHours, formatDate,
} from '@/lib/format';
import { projectFinancialsFromAggregates } from '@/lib/finance';
import {
  calculateCostSheet, costSheetInputsFromData, costSheetToProjectFields,
  type CostSheetInputs,
} from '@/lib/costSheet';
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_DOT_COLORS,
  PROJECT_CATEGORY_LABELS, PROJECT_CATEGORY_COLORS,
  type ManagerOption, type Project, type ProjectCategory, type ProjectStatus,
} from '@/types';
import {
  getProjectsPage, createProject, updateProject, deleteProject,
  getProjectActualHours, getProjectPlannedHours,
  getManagerOptions, getTimesheets,
  getAssignmentsByProject, getTimesheetsByProject,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import {
  Plus, FolderKanban, Search, Pencil, Trash2, Filter, X,
  DollarSign, TrendingUp, AlertCircle, Clock, Briefcase,
} from 'lucide-react';

const ALL_STATUSES: ProjectStatus[] = ['presales', 'in_progress', 'completed', 'cancelled'];

export default function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    contract: number; income: number; expense: number;
    status_counts: Partial<Record<ProjectStatus, number>>;
  }>({ contract: 0, income: 0, expense: 0, status_counts: {} });
  const managerOptions = getManagerOptions();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ProjectStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<ProjectCategory | 'unclassified' | ''>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 12;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    const timer = window.setTimeout(() => {
      getProjectsPage({
        page,
        pageSize,
        search: search.trim() || undefined,
        category: categoryFilter || undefined,
        statuses: selectedStatuses.length ? selectedStatuses : undefined,
      })
        .then((result) => {
          if (!active) return;
          setProjects(result.items);
          setTotal(result.total);
          setSummary(result.summary);
        })
        .catch(() => { if (active) setLoadError('项目加载失败，请稍后重试。'); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, pageSize, search, categoryFilter, selectedStatuses, refreshKey]);

  function reload() {
    setRefreshKey((key) => key + 1);
  }

  const totalContract = summary.contract;
  const financialsFor = (project: Project) => projectFinancialsFromAggregates(project);
  const totalActualIncome = summary.income;
  const totalActualProfit = summary.income - summary.expense;
  const myActiveProjects = summary.status_counts.in_progress ?? 0;
  const myTotalHours = getTimesheets()
    .filter((entry) => entry.person_id === user?.person_id)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleStatus(status: ProjectStatus) {
    setPage(1);
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
      setPage(1);
      reload();
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {canManage ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="合同总额" value={formatCurrency(totalContract)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
          <StatCard label="累计回款" value={formatCurrency(totalActualIncome)} icon={<DollarSign className="w-5 h-5" />} color="blue" />
          <StatCard label="现金净额" value={formatCurrency(totalActualProfit)} icon={<DollarSign className="w-5 h-5" />} color={totalActualProfit >= 0 ? 'blue' : 'rose'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="我的项目" value={String(total)} icon={<Briefcase className="w-5 h-5" />} color="blue" />
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value as ProjectCategory | 'unclassified' | ''); setPage(1); }}
          className="h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          aria-label="项目分类筛选"
        >
          <option value="">全部分类</option>
          {(Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[]).map((item) => (
            <option key={item} value={item}>{PROJECT_CATEGORY_LABELS[item]}</option>
          ))}
          <option value="unclassified">未分类</option>
        </select>

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
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all ${
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

            {loading ? (
        <Card className="p-12 text-center text-sm text-slate-500">正在加载项目…</Card>
      ) : loadError ? (
        <Card className="p-6 text-sm text-rose-700">{loadError}</Card>
      ) : total === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<FolderKanban className="w-6 h-6" />}
            title={
              total === 0 && !search && !categoryFilter && selectedStatuses.length === 0
                ? canManage ? '暂无项目' : '暂无可访问项目'
                : '没有匹配的项目'
            }
            description={
              total === 0 && !search && !categoryFilter && selectedStatuses.length === 0
                ? canManage
                  ? '创建第一个项目，开始跟踪预算、回款和现金净额。'
                  : '你还没有被分配到任何项目，请联系项目经理。'
                : '请调整搜索条件或状态筛选。'
            }
            action={
              total === 0 && !search && !categoryFilter && selectedStatuses.length === 0 && canManage
                ? <Button onClick={openNew}><Plus className="w-4 h-4" />新建项目</Button>
                : undefined
            }
          />
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => {
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
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Badge className={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                      <Badge className={project.category ? PROJECT_CATEGORY_COLORS[project.category] : 'bg-slate-50 text-slate-400 border-slate-200 border-dashed'}>
                        {project.category ? PROJECT_CATEGORY_LABELS[project.category] : '未分类'}
                      </Badge>
                    </div>
                  </div>

                  {project.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>}

                  {canManage ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">合同收入（含税）</span>
                        <span className="font-medium text-slate-900">{formatCurrency(project.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">预算总额</span>
                        <span className="font-medium text-slate-900">{formatCurrency(financials.budget)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">回款</span>
                        <span className="font-medium text-emerald-600">{formatCurrency(financials.actualIncome)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">付款</span>
                        <span className="font-medium text-rose-600">{formatCurrency(financials.actualExpense)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">计划利润（不含税）</span>
                        <div className="text-right">
                          <span className={`font-semibold ${plannedProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatCurrency(plannedProfit)}</span>
                          <span className="text-xs text-slate-400 ml-1.5">({plannedMargin.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                        <span className="text-slate-500">现金净额</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">共 {total} 个项目，第 {page} / {totalPages} 页</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button>
          </div>
        </div>
        </>
      )}

      {modalOpen && (
        <ProjectFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          project={editingProject}
          managerOptions={managerOptions}
          currentUserId={user?.id || ''}
          currentUserRole={user?.role || 'employee'}
          onSaved={() => { setModalOpen(false); setPage(1); reload(); }}
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
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'presales');
  const [category, setCategory] = useState<ProjectCategory | ''>(project?.category || '');
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
  const [taxRate, setTaxRate] = useState(project?.tax_rate?.toString() || '6');
  const [costSheetChangeReason, setCostSheetChangeReason] = useState('');
  const costSheetMode = !project || Boolean(project.cost_sheet);
  const [costInputs, setCostInputs] = useState<CostSheetInputs>(() => costSheetInputsFromData(project?.cost_sheet));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const computedCostSheet = calculateCostSheet(costInputs);
  const derived = costSheetToProjectFields(computedCostSheet);
  const manualBudget = (parseFloat(budgetLabor) || 0) + (parseFloat(budgetTravel) || 0) + (parseFloat(budgetOther) || 0);
  const totalBudget = costSheetMode
    ? derived.budget_labor + derived.budget_travel + derived.budget_other
    : manualBudget;

  function setCostField<K extends keyof CostSheetInputs>(key: K, value: string) {
    const parsed = value === '' ? 0 : Number(value);
    setCostInputs((previous) => ({ ...previous, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }


  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('项目名称不能为空'); return; }
    if (!project && !category) { setError('请选择项目分类'); return; }
    setSaving(true);
    const payload: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'manager_name'> & { cost_sheet_change_reason?: string } = {
      name: name.trim(),
      description,
      status,
      category: category || null,
      manager_user_id: currentUserRole === 'manager' ? currentUserId : managerId || null,
      client,
      start_date: startDate || null,
      end_date: endDate || null,
      budget_labor: costSheetMode ? derived.budget_labor : parseFloat(budgetLabor) || 0,
      budget_travel: costSheetMode ? derived.budget_travel : parseFloat(budgetTravel) || 0,
      budget_other: costSheetMode ? derived.budget_other : parseFloat(budgetOther) || 0,
      revenue: costSheetMode ? derived.revenue : parseFloat(revenue) || 0,
      tax_rate: costSheetMode ? 6 : parseFloat(taxRate) || 0,
      cost_sheet: costSheetMode ? computedCostSheet : null,
      cost_sheet_change_reason: costSheetMode && project ? costSheetChangeReason.trim() : undefined,
    };
    const saved = project ? await updateProject(project.id, payload) : await createProject(payload);
    setSaving(false);
    if (saved) onSaved();
  }

  const costInput = (key: keyof CostSheetInputs, label: string, note?: string) => (
    <div key={key}>
      <Input
        label={label}
        type="number"
        min="0"
        step="0.01"
        value={costInputs[key] as number}
        onChange={(e) => setCostField(key, e.target.value)}
        aria-label={label}
      />
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );

  const calcCard = (label: string, value: string, note?: string) => (
    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5">{value}</p>
      {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={project ? '编辑项目' : '新建项目'} size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="项目名称" required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：企业官网改版" />
          <Input label="客户" value={client} onChange={(e) => setClient(e.target.value)} placeholder="例如：艾克米公司" />
        </div>
        <Textarea label="项目描述" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目内容…" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="项目分类" required={!project} value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory | '')}>
            <option value="">{project ? '未分类' : '请选择项目分类'}</option>
            {(Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[]).map((item) => (
              <option key={item} value={item}>{PROJECT_CATEGORY_LABELS[item]}</option>
            ))}
          </Select>
          <Select label="项目状态" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {ALL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
          </Select>
        </div>
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
        <p className="text-xs text-slate-400 -mt-2">项目经理仅能管理自己负责的项目；管理员可以指定任意项目经理。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="开始日期" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="结束日期" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        {costSheetMode ? (
          <>
            <div className="space-y-5">
              {project && (
                <Input
                  label="本次 Cost Sheet 变更说明（可选）"
                  value={costSheetChangeReason}
                  onChange={(e) => setCostSheetChangeReason(e.target.value)}
                  placeholder="例如：调整外包成本、补充合同金额"
                  maxLength={500}
                />
              )}
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">合同与收入</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {costInput('hardwareContract', '硬件和软件合同金额（含税 13%）', '合同金额（含税）')}
                  {costInput('serviceContract', '服务合同金额（含税 6%）', '合同金额（含税）')}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {calcCard('合同总金额（TCV）', formatCurrency(computedCostSheet.total_contract_with_tax), '= 硬件/软件合同 + 服务合同')}
                  {calcCard('硬件/软件收入（不含 13% 税）', formatCurrency(computedCostSheet.hardware_revenue_without_tax), '= 合同金额 ÷ 1.13')}
                  {calcCard('服务收入（不含 6% 税）', formatCurrency(computedCostSheet.service_revenue_without_tax), '= 合同金额 ÷ 1.06')}
                  {calcCard('合计收入', formatCurrency(computedCostSheet.total_revenue_without_tax), '= 硬件收入 + 服务收入')}
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">成本</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {costInput('hardwareCost', '硬件和软件成本（不含税）', '硬件/软件成本')}
                  {costInput('serviceCost', '服务成本（不含税）', '服务交付成本')}
                  {costInput('outsourcingCost', '第三方服务 / 外包成本（不含税）', '外包或分包成本')}
                  {costInput('manpowerCost', '人力费用', '内部人力成本')}
                  {costInput('otherExpense', '其他费用（差旅等）', '差旅、招待及其他')}
                  {costInput('travelCost', '其中：差旅费用', '用于项目预算的差旅拆分')}
                  {costInput('withholdingTax', '预提税', '预提税及其他税费')}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {calcCard('合计成本', formatCurrency(computedCostSheet.total_cost), '= 上述成本合计')}
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">利润与风险</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {calcCard('项目利润', formatCurrency(computedCostSheet.gross_margin), '= 合计收入 − 合计成本')}
                  {calcCard('项目利润率', `${(computedCostSheet.gross_margin_pct * 100).toFixed(2)}%`, '= 项目利润 ÷ 合计收入')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="第三方服务风险金比例（%）"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={costInputs.contingencyOutsourcingPct}
                      onChange={(e) => setCostField('contingencyOutsourcingPct', e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">风险金：{formatCurrency(computedCostSheet.contingency_outsourcing)}（外包成本 × 比例）</p>
                  </div>
                  <div>
                    <Input
                      label="人力风险金比例（%）"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={costInputs.contingencyManpowerPct}
                      onChange={(e) => setCostField('contingencyManpowerPct', e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">风险金：{formatCurrency(computedCostSheet.contingency_manpower)}（人力费用 × 比例）</p>
                  </div>
                  {costInput('otherRisk', '其他风险', '其他风险准备')}
                  {costInput('financialInterest', '财务利息 / 保函费用', '资金成本或保函费用')}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {calcCard('附加税（13%）', formatCurrency(computedCostSheet.surcharge_tax_hardware), '(硬件收入 − 硬件成本) × 13% × 12%')}
                  <div key="service-surcharge" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-500">附加税（6%）</p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={costInputs.serviceSurchargeEnabled}
                        aria-label="启用服务附加税（6%）"
                        onClick={() => setCostInputs((previous) => ({ ...previous, serviceSurchargeEnabled: !previous.serviceSurchargeEnabled }))}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${costInputs.serviceSurchargeEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${costInputs.serviceSurchargeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{formatCurrency(computedCostSheet.surcharge_tax_service)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">服务收入 − 服务成本 − 外包成本 × 6% × 12%</p>
                  </div>
                  {calcCard('项目审批利润', formatCurrency(computedCostSheet.approval_margin), '= 项目利润 − 风险金 − 附加税 − 财务费用')}
                  {calcCard('审批利润率', `${(computedCostSheet.approval_margin_pct * 100).toFixed(2)}%`, '= 审批利润 ÷ 合计收入')}
                </div>
              </section>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div><p className="text-xs text-slate-500">人力预算</p><p className="mt-1 font-semibold text-slate-900">{formatCurrency(derived.budget_labor)}</p></div>
                  <div><p className="text-xs text-slate-500">差旅预算</p><p className="mt-1 font-semibold text-slate-900">{formatCurrency(derived.budget_travel)}</p></div>
                  <div><p className="text-xs text-slate-500">其他预算</p><p className="mt-1 font-semibold text-slate-900">{formatCurrency(derived.budget_other)}</p></div>
                  <div><p className="text-xs text-slate-500">预算总额</p><p className="mt-1 font-bold text-slate-900">{formatCurrency(totalBudget)}</p></div>
                  <div><p className="text-xs text-slate-500">合同收入（含税）</p><p className="mt-1 font-bold text-slate-900">{formatCurrency(derived.revenue)}</p></div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="合同收入（元，含税）" type="number" min="0" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
              <Input label="税率（%）" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </>
        )}

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : project ? '保存修改' : '创建项目'}</Button>
        </div>
      </form>
    </Modal>
  );
}

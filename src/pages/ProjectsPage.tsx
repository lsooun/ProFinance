import { useState } from 'react';
import {
  Card, Button, Input, Select, Textarea, Modal, Badge, EmptyState, StatCard,
} from '@/components/ui';
import {
  formatCurrency, calculatePlannedProfit, calculatePlannedMargin, formatHours, formatDate,
} from '@/lib/format';
import { projectFinancials } from '@/lib/finance';
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_DOT_COLORS,
  type Project, type ProjectStatus,
} from '@/types';
import {
  getProjects, createProject, updateProject, deleteProject,
  getProjectActualHours, getProjectPlannedHours,
  getPersons, getAccessibleProjects, getTransactionsByProject,
  getAssignmentsByProject, getTimesheetsByProject,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import type { Person } from '@/types';
import {
  Plus, FolderKanban, Search, Pencil, Trash2, Filter, X,
  DollarSign, TrendingUp, AlertCircle, Clock, Briefcase,
} from 'lucide-react';

const ALL_STATUSES: ProjectStatus[] = ['presales', 'in_progress', 'completed', 'cancelled'];

export default function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>(
    user ? getAccessibleProjects(user) : getProjects(),
  );
  const persons = getPersons().filter((person) => person.is_active);
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
  const totalActualIncome = filtered.reduce(
    (sum, project) => sum + projectFinancials(project, getTransactionsByProject(project.id)).actualIncome,
    0,
  );
  const totalActualProfit = filtered.reduce(
    (sum, project) => sum + projectFinancials(project, getTransactionsByProject(project.id)).actualProfit,
    0,
  );
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
            const financials = projectFinancials(project, getTransactionsByProject(project.id));
            const plannedProfit = calculatePlannedProfit(project.revenue, financials.budget);
            const plannedMargin = calculatePlannedMargin(project.revenue, financials.budget);
            const plannedHours = getProjectPlannedHours(project.id);
            const actualHours = getProjectActualHours(project.id);
            const manager = persons.find((person: Person) => person.id === project.manager_id);
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
                        <span className="font-medium text-slate-900">{manager ? manager.name : '未指定'}</span>
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
                      <span>{manager ? manager.name : '未指定项目经理'}</span>
                    ) : (
                      <span>查看详情 →</span>
                    )}
                  </div>
                </div>

                {canManage && (
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
          persons={persons}
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

function ProjectFormModal({
  open, onClose, project, persons, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  persons: Person[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'presales');
  const [managerId, setManagerId] = useState(project?.manager_id || '');
  const [client, setClient] = useState(project?.client || '');
  const [startDate, setStartDate] = useState(project?.start_date || '');
  const [endDate, setEndDate] = useState(project?.end_date || '');
  const [budgetLabor, setBudgetLabor] = useState(project?.budget_labor?.toString() || '0');
  const [budgetTravel, setBudgetTravel] = useState(project?.budget_travel?.toString() || '0');
  const [budgetOther, setBudgetOther] = useState(project?.budget_other?.toString() || '0');
  const [revenue, setRevenue] = useState(project?.revenue?.toString() || '0');
  const [saving, setSaving] = useState(false);

  const totalBudget = (parseFloat(budgetLabor) || 0) + (parseFloat(budgetTravel) || 0) + (parseFloat(budgetOther) || 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name,
      description,
      status,
      manager_id: managerId || null,
      client,
      start_date: startDate || null,
      end_date: endDate || null,
      budget_labor: parseFloat(budgetLabor) || 0,
      budget_travel: parseFloat(budgetTravel) || 0,
      budget_other: parseFloat(budgetOther) || 0,
      revenue: parseFloat(revenue) || 0,
    };
    const saved = project ? await updateProject(project.id, payload) : await createProject(payload);
    setSaving(false);
    if (saved) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? '编辑项目' : '新建项目'} size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="项目名称" required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：企业官网改版" />
          <Input label="客户" value={client} onChange={(e) => setClient(e.target.value)} placeholder="例如：艾克米公司" />
        </div>
        <Textarea label="项目描述" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目内容…" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="项目状态" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {ALL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
          </Select>
          <Select label="项目经理" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">未指定项目经理</option>
            {persons.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select>
        </div>
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

        <Input label="合同收入（元）" type="number" min="0" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : project ? '保存修改' : '创建项目'}</Button>
        </div>
      </form>
    </Modal>
  );
}

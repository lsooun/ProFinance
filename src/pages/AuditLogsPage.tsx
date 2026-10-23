import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Modal, Select } from '@/components/ui';
import { getAuditLogs, getProjectOptions } from '@/lib/storage';
import { formatDate } from '@/lib/format';
import type { AuditLogEntry, AuditLogPage } from '@/types';
import { ChevronLeft, ChevronRight, Eye, History, RefreshCw, Search, ShieldCheck } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  'project.create': '创建项目',
  'project.update': '修改项目',
  'project.delete': '移入回收站（项目）',
  'project.restore': '恢复项目',
  'project.purge': '永久删除项目',
  'cost_sheet.version.create': '创建 Cost Sheet 版本',
  'cost_sheet.version.restore': '恢复 Cost Sheet 版本',
  'transaction.create': '新增收支',
  'transaction.update': '修改收支',
  'transaction.delete': '移入回收站（收支）',
  'transaction.restore': '恢复收支',
  'transaction.purge': '永久删除收支',
  'timesheet.create': '新增工时',
  'timesheet.update': '修改工时',
  'timesheet.delete': '删除工时',
  'invoice.create': '新增回款节点',
  'invoice.update': '修改回款节点',
  'invoice.delete': '删除回款节点',
  'person.create': '新增人员',
  'person.update': '修改人员',
  'person.delete': '删除人员',
  'account.create': '创建账号',
  'account.update': '修改账号',
  'account.delete': '删除账号',
  'attachment.upload': '上传文档',
  'attachment.delete': '删除文档',
};

const ENTITY_LABELS: Record<string, string> = {
  project: '项目',
  transaction: '收支',
  timesheet: '工时',
  invoice: '回款节点',
  person: '人员',
  user: '账号',
  attachment: '文档',
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

function entityLabel(type: string) {
  return ENTITY_LABELS[type] || type;
}

function dateTime(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function pretty(value: unknown) {
  if (value === null || value === undefined) return '无';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export default function AuditLogsPage() {
  const [data, setData] = useState<AuditLogPage>({ items: [], total: 0, page: 1, page_size: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const projects = getProjectOptions();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAuditLogs({
      page,
      pageSize: 50,
      action: action || undefined,
      entityType: entityType || undefined,
      projectId: projectId || undefined,
      search: search || undefined,
    })
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setError('审计日志加载失败，请稍后重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, action, entityType, projectId, search, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  function applySearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setAction('');
    setEntityType('');
    setProjectId('');
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-900">审计日志</h2>
        </div>
        <p className="text-sm text-slate-500">记录项目、财务、工时、人员和账号的关键变更。日志只读，不随业务数据删除。</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
              placeholder="搜索操作人、对象或 ID…"
              className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <Button variant="outline" onClick={applySearch}><Search className="w-4 h-4" /> 搜索</Button>
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-full sm:w-44">
            <option value="">全部操作</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="w-full sm:w-36">
            <option value="">全部对象</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }} className="w-full sm:w-48">
            <option value="">全部项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
          <Button variant="ghost" onClick={resetFilters}>重置</Button>
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw className="w-4 h-4" /> 刷新</Button>
        </div>
      </Card>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-rose-700">{error}</div>
        ) : loading ? (
          <div className="p-12 text-center text-sm text-slate-500">正在加载审计日志…</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<History className="w-6 h-6" />} title="暂无审计记录" description="完成项目、收支、工时或人员变更后，记录会显示在这里。" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium whitespace-nowrap">时间</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">操作人</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">操作</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">对象</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">项目</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">IP</th>
                    <th className="px-4 py-3 font-medium text-right">详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dateTime(entry.created_at)}</td>
                      <td className="px-4 py-3 text-slate-900 whitespace-nowrap">{entry.actor_name || '系统'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{actionLabel(entry.action)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {entityLabel(entry.entity_type)}
                        <span className="ml-1 text-xs text-slate-400">{entry.entity_id ? entry.entity_id.slice(0, 8) : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={entry.project_name || ''}>{entry.project_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{entry.ip || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(entry)}><Eye className="w-3.5 h-3.5" /> 查看</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">共 {data.total} 条，第 {data.page} / {totalPages} 页</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft className="w-4 h-4" /> 上一页
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
                  下一页 <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="审计记录详情" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">操作</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{actionLabel(selected.action)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">操作人 / 时间</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selected.actor_name || '系统'}</p>
                <p className="text-xs text-slate-500">{dateTime(selected.created_at)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">对象</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{entityLabel(selected.entity_type)}</p>
                <p className="text-xs text-slate-400">{selected.entity_id || '—'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">项目 / IP</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selected.project_name || '—'}</p>
                <p className="text-xs text-slate-400">{selected.ip || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">变更前</p>
              <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">{pretty(selected.before)}</pre>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">变更后</p>
              <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">{pretty(selected.after)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { getRecycleBin, purgeProject, purgeTransaction, restoreProject, restoreTransaction } from '@/lib/storage';
import type { RecycleBinPage as RecyclePageData, RecycleProjectItem, RecycleTransactionItem } from '@/types';
import { AlertTriangle, ArchiveRestore, FolderKanban, RotateCcw, Trash2, ArrowLeftRight } from 'lucide-react';

type RecycleType = 'project' | 'transaction';

export default function RecycleBinPage() {
  const { user } = useAuth();
  const [type, setType] = useState<RecycleType>('project');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecyclePageData<RecycleProjectItem | RecycleTransactionItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [purgeTarget, setPurgeTarget] = useState<RecycleProjectItem | RecycleTransactionItem | null>(null);
  const [purging, setPurging] = useState(false);
  const isAdmin = user?.role === 'admin';
  const pageSize = 30;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getRecycleBin(type, page, pageSize)
      .then((result) => { if (active) setData(result as RecyclePageData<RecycleProjectItem | RecycleTransactionItem>); })
      .catch(() => { if (active) setError('回收站加载失败，请稍后重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, page, refreshKey]);

  function switchType(next: RecycleType) {
    setType(next);
    setPage(1);
  }

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  async function handleRestore(id: string) {
    const ok = type === 'project' ? await restoreProject(id) : await restoreTransaction(id);
    if (ok) refresh();
  }

  async function handlePurge() {
    if (!purgeTarget) return;
    setPurging(true);
    const ok = type === 'project' ? await purgeProject(purgeTarget.id) : await purgeTransaction(purgeTarget.id);
    setPurging(false);
    if (ok) {
      setPurgeTarget(null);
      refresh();
    }
  }

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ArchiveRestore className="w-5 h-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-900">回收站</h2>
        </div>
        <p className="text-sm text-slate-500">删除的项目和收支会在这里保留；可恢复，管理员可永久删除。</p>
      </div>

      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
        <button onClick={() => switchType('project')} className={`flex h-10 items-center gap-2 px-4 text-sm font-medium transition-colors ${type === 'project' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          <FolderKanban className="w-4 h-4" /> 项目
        </button>
        <button onClick={() => switchType('transaction')} className={`flex h-10 items-center gap-2 px-4 text-sm font-medium transition-colors ${type === 'transaction' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          <ArrowLeftRight className="w-4 h-4" /> 收支
        </button>
      </div>

      <Card>
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">正在加载回收站…</div>
        ) : error ? (
          <div className="p-6 text-sm text-rose-700">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<ArchiveRestore className="w-6 h-6" />} title="回收站为空" description="删除的项目或收支记录会显示在这里。" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">{type === 'project' ? '项目' : '收支'}</th>
                    {type === 'transaction' && <th className="px-4 py-3 font-medium">项目</th>}
                    <th className="px-4 py-3 font-medium">删除原因</th>
                    <th className="px-4 py-3 font-medium">删除人 / 时间</th>
                    <th className="px-4 py-3 font-medium">剩余可恢复</th>
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isProject = type === 'project';
                    const project = item as RecycleProjectItem;
                    const transaction = item as RecycleTransactionItem;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{isProject ? project.name : `${transaction.type === 'income' ? '回款' : '付款'} · ${transaction.category}`}</p>
                          <p className="text-xs text-slate-500">{isProject ? (project.client || '未填写客户') : formatCurrency(transaction.amount)}</p>
                        </td>
                        {!isProject && <td className="px-4 py-3 text-slate-600">{transaction.project_name || '未关联项目'}</td>}
                        <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={item.delete_reason}>{item.delete_reason || '未填写'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          <p>{item.deleted_by_name || '未知'}</p>
                          <p>{formatDate(item.deleted_at ?? null)}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge className={item.days_remaining > 7 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                            {item.days_remaining} 天
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => void handleRestore(item.id)}>
                            <RotateCcw className="w-3.5 h-3.5" /> 恢复
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="sm" className="ml-1 text-rose-600 hover:bg-rose-50" onClick={() => setPurgeTarget(item)}>
                              <Trash2 className="w-3.5 h-3.5" /> 永久删除
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">共 {data?.total ?? 0} 条，第 {page} / {totalPages} 页</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!purgeTarget} onClose={() => setPurgeTarget(null)} title="永久删除" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <p className="text-sm text-slate-700">
              永久删除后无法恢复，相关附件和关联数据也会被清理。确定继续吗？
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={purging}>取消</Button>
            <Button variant="danger" onClick={() => void handlePurge()} disabled={purging}>{purging ? '删除中…' : '确认永久删除'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

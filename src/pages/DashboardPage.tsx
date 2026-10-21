import { Card, StatCard, Badge, EmptyState, Button } from '@/components/ui';
import { formatCurrency, formatCurrencyDetailed, formatDate, calculateBudgetTotal, formatHours } from '@/lib/format';
import { projectFinancials, transactionsForProject, sumTransactions, isSameMonth } from '@/lib/finance';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOT_COLORS,
  type Project,
} from '@/types';
import {
  getProjects,
  getTransactions,
  getPersons,
  getTimesheets,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  FolderKanban,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  CheckCircle2,
  Clock,
  Briefcase,
} from 'lucide-react';
import type { PageKey } from '@/lib/router';

export default function DashboardPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const { profile } = useAuth();
  const projects = getProjects();
  const transactions = getTransactions();
  const persons = getPersons();
  const now = new Date();
  const isEmployee = profile?.role === 'employee';
  const isManager = profile?.role === 'manager';

  const currentPerson = persons.find((person) => person.id === profile?.person_id) ?? null;
  const myTimesheets = getTimesheets();
  const monthHours = myTimesheets
    .filter((entry) => isSameMonth(entry.date, now))
    .reduce((sum, entry) => sum + entry.hours, 0);
  const totalMyHours = myTimesheets.reduce((sum, entry) => sum + entry.hours, 0);
  const activeProjectCount = projects.filter((project) => project.status === 'in_progress').length;

  const totalIncome = isManager
    ? projects.reduce((sum, project) => sum + (project.aggregate_income ?? 0), 0)
    : sumTransactions(transactions, 'income');
  const totalExpense = isManager
    ? projects.reduce((sum, project) => sum + (project.aggregate_expense ?? 0), 0)
    : sumTransactions(transactions, 'expense');
  const totalProfit = totalIncome - totalExpense;
  const totalBudget = projects.reduce(
    (sum, project) => sum + calculateBudgetTotal(project.budget_labor, project.budget_travel, project.budget_other),
    0,
  );
  const monthIncome = isManager
    ? projects.reduce((sum, project) => sum + (project.aggregate_month_income ?? 0), 0)
    : transactions
      .filter((tx) => tx.type === 'income' && isSameMonth(tx.transaction_date, now))
      .reduce((sum, tx) => sum + tx.amount, 0);
  const monthExpense = isManager
    ? projects.reduce((sum, project) => sum + (project.aggregate_month_expense ?? 0), 0)
    : transactions
      .filter((tx) => tx.type === 'expense' && isSameMonth(tx.transaction_date, now))
      .reduce((sum, tx) => sum + tx.amount, 0);
  const statusCounts = {
    presales: projects.filter((project) => project.status === 'presales').length,
    in_progress: projects.filter((project) => project.status === 'in_progress').length,
    completed: projects.filter((project) => project.status === 'completed').length,
    cancelled: projects.filter((project) => project.status === 'cancelled').length,
  };
  const recentProjects = projects.slice(0, 5);
  const recentTransactions = transactions.slice(0, 10);
  const recentTimesheets = myTimesheets.slice(0, 8);

  function projectProfit(project: Project): number {
    if (isManager) return (project.aggregate_income ?? 0) - (project.aggregate_expense ?? 0);
    return projectFinancials(project, transactionsForProject(transactions, project.id)).actualProfit;
  }

  if (isEmployee) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">你好，{profile?.full_name}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {currentPerson ? `${currentPerson.department || '团队成员'} · 我的项目与工时概览` : '当前账号尚未关联人员档案'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            这里只展示你被分配的项目，以及你本人的工时记录。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="我的项目" value={String(projects.length)} icon={<Briefcase className="w-5 h-5" />} color="blue" />
          <StatCard label="进行中的项目" value={String(activeProjectCount)} icon={<FolderKanban className="w-5 h-5" />} color="emerald" />
          <StatCard label="本月工时" value={formatHours(monthHours)} icon={<Clock className="w-5 h-5" />} color="amber" />
          <StatCard label="累计工时" value={formatHours(totalMyHours)} icon={<Calendar className="w-5 h-5" />} color="slate" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">我的项目</h2>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('projects')}>查看全部</Button>
            </div>
            {recentProjects.length === 0 ? (
              <EmptyState
                icon={<FolderKanban className="w-6 h-6" />}
                title="暂无项目"
                description="你还没有被分配到任何项目，请联系项目经理。"
              />
            ) : (
              <div className="space-y-2">
                {recentProjects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[project.status]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                        <p className="text-xs text-slate-500">{project.client || '未填写客户'}</p>
                      </div>
                    </div>
                    <Badge className={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-4">项目状态</h2>
            <div className="space-y-3">
              {([
                { key: 'presales' as const, label: '预售', color: 'text-amber-600' },
                { key: 'in_progress' as const, label: '进行中', color: 'text-blue-600' },
                { key: 'completed' as const, label: '已完成', color: 'text-emerald-600' },
                { key: 'cancelled' as const, label: '已取消', color: 'text-rose-600' },
              ]).map(({ key, label, color }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className={`text-sm ${color}`}>{label}</span>
                  <span className="text-sm font-semibold text-slate-900">{statusCounts[key]}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-500">项目总数</span>
              <span className="font-semibold text-slate-900">{projects.length}</span>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">最近工时</h2>
          {recentTimesheets.length === 0 ? (
            <EmptyState icon={<Clock className="w-6 h-6" />} title="暂无工时记录" description="你可以前往工时管理页面填报自己的工时。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-medium">日期</th>
                    <th className="pb-2 font-medium">项目</th>
                    <th className="pb-2 font-medium">工作内容</th>
                    <th className="pb-2 font-medium text-right">工时</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentTimesheets.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className="py-2.5 text-slate-900 font-medium">{projects.find((project) => project.id === entry.project_id)?.name ?? '未知项目'}</td>
                      <td className="py-2.5 text-slate-600 max-w-xs truncate">{entry.description || '—'}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">{formatHours(entry.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {isManager && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          汇总指标覆盖全部项目；底部收支明细仅展示自己负责的项目。
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="实际收入" value={formatCurrency(totalIncome)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
        <StatCard label="实际支出" value={formatCurrency(totalExpense)} icon={<TrendingDown className="w-5 h-5" />} color="rose" />
        <StatCard label="实际利润" value={formatCurrency(totalProfit)} icon={<Wallet className="w-5 h-5" />} color={totalProfit >= 0 ? 'blue' : 'rose'} />
        <StatCard label="预算总额" value={formatCurrency(totalBudget)} icon={<DollarSign className="w-5 h-5" />} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">最近项目</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('projects')}>查看全部</Button>
          </div>
          {recentProjects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="w-6 h-6" />}
              title="暂无项目"
              description="创建第一个项目，开始跟踪预算、收入和实际利润。"
              action={<Button size="sm" onClick={() => onNavigate('projects')}>前往项目</Button>}
            />
          ) : (
            <div className="space-y-2">
              {recentProjects.map((project) => {
                const profit = projectProfit(project);
                return (
                  <div key={project.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[project.status]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                        <p className="text-xs text-slate-500">{project.client || '未填写客户'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge className={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(profit)}</p>
                        <p className="text-xs text-slate-400">实际利润</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">项目状态</h2>
          <div className="space-y-3">
            {([
              { key: 'presales' as const, label: '预售', icon: <Clock className="w-4 h-4" />, color: 'text-amber-600' },
              { key: 'in_progress' as const, label: '进行中', icon: <FolderKanban className="w-4 h-4" />, color: 'text-blue-600' },
              { key: 'completed' as const, label: '已完成', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600' },
              { key: 'cancelled' as const, label: '已取消', icon: <span className="text-base leading-none">&times;</span>, color: 'text-rose-600' },
            ]).map(({ key, label, icon, color }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={color}>{icon}</span>
                  <span className="text-sm text-slate-600">{label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{statusCounts[key]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">项目总数</span>
              <span className="font-semibold text-slate-900">{projects.length}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">本月收入</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrencyDetailed(monthIncome)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">本月支出</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrencyDetailed(monthExpense)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">本月净额</p>
              <p className={`text-lg font-bold ${monthIncome - monthExpense >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrencyDetailed(monthIncome - monthExpense)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">最近收支</h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('transactions')}>查看全部</Button>
        </div>
        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-6 h-6" />}
            title="暂无收支记录"
            description="记录收入与支出，保持财务数据及时准确。"
            action={<Button size="sm" onClick={() => onNavigate('transactions')}>新增收支</Button>}
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
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 text-slate-600 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                    <td className="py-2.5 text-slate-900 font-medium max-w-xs truncate">{tx.description || tx.category}</td>
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
    </div>
  );
}

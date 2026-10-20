import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui';
import { Briefcase, Lock, Mail, Eye, EyeOff } from 'lucide-react';

// 仅开发模式展示演示账号；生产构建会被 Vite 静态移除
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV;
const DEMO_PASSWORD = '123456';
const DEMO_ACCOUNTS = SHOW_DEMO_ACCOUNTS
  ? [
      { role: '管理员', email: 'admin@company.com' },
      { role: '项目经理', email: 'manager@company.com' },
      { role: '普通员工', email: 'wang.lei@company.com' },
    ]
  : [];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(SHOW_DEMO_ACCOUNTS ? 'admin@company.com' : '');
  const [password, setPassword] = useState(SHOW_DEMO_ACCOUNTS ? DEMO_PASSWORD : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-1/2 bg-slate-900 text-white flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight">ProFinance</span>
            <span className="block text-xs text-slate-400">项目与财务管理</span>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
            项目与财务，<br />一站式管理。
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed">
            跟踪项目进度、管理收入与支出、统计工时与回款，让经营数据一目了然。
          </p>
          <div className="mt-8 space-y-3">
            {[
              '管理项目预算、合同收入与实际利润',
              '记录收支，支持 CSV 批量导入',
              '跟踪工时、成员投入与回款计划',
              '多角色访问控制与数据隔离',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm text-slate-300">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-400">
          &copy; 2026 ProFinance. 保留所有权利。
        </div>
      </div>

      <div className="lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">欢迎回来</h2>
            <p className="mt-1 text-sm text-slate-500">登录你的账号以继续。</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? '登录中…' : '登录'}
            </Button>
          </form>

          {SHOW_DEMO_ACCOUNTS && (
            <div className="mt-6 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">演示账号（密码均为 123456）</p>
              <div className="space-y-1">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs text-blue-700 hover:bg-blue-100/60"
                  >
                    <span className="text-blue-500">{account.role}</span>
                    <span className="font-mono">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

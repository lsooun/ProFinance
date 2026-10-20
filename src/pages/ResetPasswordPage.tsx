import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button, Input } from '@/components/ui';
import { apiRequest, errorMessage } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Briefcase, CheckCircle2, KeyRound } from 'lucide-react';

export default function ResetPasswordPage({ token }: { token: string }) {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('新密码至少需要 6 个字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: password },
      });
      setSuccess(true);
      notify('密码已重置，请使用新密码登录', 'success');
    } catch (err) {
      setError(errorMessage(err, '密码重置失败，链接可能已过期'));
    } finally {
      setSaving(false);
    }
  }

  async function goToLogin() {
    await signOut();
    window.location.hash = '#/dashboard';
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">ProFinance</p>
            <p className="text-xs text-slate-500">项目与财务管理</p>
          </div>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">密码重置成功</h1>
            <p className="mt-2 text-sm text-slate-500">请使用新密码重新登录。</p>
            <Button onClick={() => void goToLogin()} className="mt-6 w-full">前往登录</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5 text-amber-500" />
              <h1 className="text-xl font-bold text-slate-900">重置密码</h1>
            </div>
            <p className="text-sm text-slate-500 mb-6">该链接为一次性链接，提交后所有旧会话将失效。</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="新密码"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 个字符"
                autoComplete="new-password"
              />
              <Input
                label="确认新密码"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
              {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? '提交中…' : '确认重置'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

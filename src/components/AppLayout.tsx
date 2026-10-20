import { useState, type ReactNode } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button, Input, Modal } from '@/components/ui';
import {
  LayoutDashboard,
  FolderKanban,
  ArrowLeftRight,
  FileBarChart,
  Users,
  LogOut,
  Menu,
  X,
  Briefcase,
  ChevronDown,
  UserCog,
  Clock,
  KeyRound,
  UserRound,
} from 'lucide-react';
import { USER_ROLE_LABELS } from '@/types';
import type { PageKey } from '@/lib/router';

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  managerUp?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { key: 'projects', label: '项目管理', icon: FolderKanban },
  { key: 'transactions', label: '收支管理', icon: ArrowLeftRight, managerUp: true },
  { key: 'timesheets', label: '工时管理', icon: Clock },
  { key: 'personnel', label: '人员管理', icon: UserCog, managerUp: true },
  { key: 'reports', label: '统计报表', icon: FileBarChart, managerUp: true },
  { key: 'users', label: '用户管理', icon: Users, adminOnly: true },
];

export default function AppLayout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && profile?.role !== 'admin') return false;
    if (item.managerUp && profile?.role === 'employee') return false;
    return true;
  });
  const currentItem = NAV_ITEMS.find((item) => item.key === currentPage);

  function handleNav(key: PageKey) {
    onNavigate(key);
    setSidebarOpen(false);
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-base font-semibold text-white tracking-tight">ProFinance</span>
              <span className="block text-[10px] text-slate-500">项目与财务管理</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white" aria-label="关闭菜单">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon style={{ width: 18, height: 18 }} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {(profile?.full_name || '用').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile?.full_name || '用户'}</p>
              <p className="text-xs text-slate-400">{profile ? USER_ROLE_LABELS[profile.role] : '项目经理'}</p>
            </div>
          </div>
          <button
            onClick={() => void handleSignOut()}
            className="w-full mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
          >
            <LogOut style={{ width: 18, height: 18 }} />
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-600 hover:text-slate-900"
              aria-label="打开菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{currentItem?.label || 'ProFinance'}</h1>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                {(profile?.full_name || '用').charAt(0).toUpperCase()}
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-40">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900 truncate">{profile?.full_name}</p>
                    <p className="text-xs text-slate-500">{profile ? USER_ROLE_LABELS[profile.role] : ''}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{profile?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <UserRound className="w-4 h-4" />
                    个人资料
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      setPasswordModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                    修改密码
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      void handleSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">{children}</main>
      </div>

      {profileModalOpen && (
        <ProfileModal onClose={() => setProfileModalOpen(false)} />
      )}

      {passwordModalOpen && (
        <PasswordModal onClose={() => setPasswordModalOpen(false)} />
      )}
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('新密码至少需要 6 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="修改密码" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="当前密码"
          type="password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
        <Input
          label="新密码"
          type="password"
          required
          minLength={6}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
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
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('姓名不能为空');
      return;
    }
    setSaving(true);
    const result = await updateProfile(fullName.trim(), email.trim());
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="个人资料" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="姓名"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Input
          label="登录邮箱"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <p className="text-xs text-slate-500">修改邮箱后，下次登录请使用新邮箱。</p>
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </div>
      </form>
    </Modal>
  );
}

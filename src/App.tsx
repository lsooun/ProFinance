import { useEffect } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/auth-context';
import LoginPage from '@/pages/LoginPage';
import AppLayout from '@/components/AppLayout';
import Toaster from '@/components/Toaster';
import DashboardPage from '@/pages/DashboardPage';
import ProjectsPage from '@/pages/ProjectsPage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';
import TransactionsPage from '@/pages/TransactionsPage';
import ReportsPage from '@/pages/ReportsPage';
import UsersPage from '@/pages/UsersPage';
import PersonnelPage from '@/pages/PersonnelPage';
import TimesheetPage from '@/pages/TimesheetPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { getResetTokenFromHash, pathFor, useHashRoute } from '@/lib/router';

function AppContent() {
  const { user, profile, signOut, loading } = useAuth();
  const { route, navigate } = useHashRoute();
  const resetToken = getResetTokenFromHash(window.location.hash);

  const isManagerUp = profile?.role === 'admin' || profile?.role === 'manager';

  useEffect(() => {
    if (!profile) return;
    const managerOnly = route.page === 'transactions' || route.page === 'personnel' || route.page === 'reports';
    const adminOnly = route.page === 'users';
    if ((managerOnly && !isManagerUp) || (adminOnly && profile.role !== 'admin')) {
      navigate('/dashboard', { replace: true });
    }
  }, [route.page, profile, isManagerUp, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">正在加载数据…</p>
        </div>
      </div>
    );
  }

  if (resetToken) {
    return <ResetPasswordPage token={resetToken} />;
  }

  if (!user || !profile) {
    return <LoginPage />;
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">账号已停用</h2>
          <p className="mt-2 text-sm text-slate-500">当前账号已被管理员停用，请联系管理员恢复访问。</p>
          <button
            onClick={() => void signOut()}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            返回登录
          </button>
        </div>
      </div>
    );
  }

  let content;
  if (route.page === 'projects' && route.projectId && (isManagerUp || user.role === 'employee')) {
    content = (
      <ProjectDetailPage
        projectId={route.projectId}
        onBack={() => navigate('/projects')}
        onAddTransaction={isManagerUp ? (projectId) => navigate(`/transactions?project=${encodeURIComponent(projectId)}`) : undefined}
      />
    );
  } else if (route.page === 'projects') {
    content = <ProjectsPage onOpenProject={(id) => navigate(`/projects/${encodeURIComponent(id)}`)} />;
  } else if (route.page === 'transactions' && isManagerUp) {
    content = <TransactionsPage initialProjectId={route.transactionProjectId} />;
  } else if (route.page === 'timesheets') {
    content = <TimesheetPage />;
  } else if (route.page === 'personnel' && isManagerUp) {
    content = <PersonnelPage onManageAccounts={() => navigate('/users')} />;
  } else if (route.page === 'reports' && isManagerUp) {
    content = <ReportsPage />;
  } else if (route.page === 'users' && user.role === 'admin') {
    content = <UsersPage />;
  } else {
    content = <DashboardPage onNavigate={(page) => navigate(pathFor(page))} />;
  }

  return (
    <AppLayout currentPage={route.page} onNavigate={(page) => navigate(pathFor(page))}>
      {content}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster />
    </AuthProvider>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { UserAccount } from '@/types';
import { apiRequest, errorMessage } from '@/lib/api';
import { clearCache, loadBootstrap, updateOwnProfile } from '@/lib/storage';
import { notify } from '@/lib/notify';
import { AuthContext } from '@/context/auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadBootstrap();
        if (active) setUser(data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      clearCache();
      setUser(null);
      notify('登录状态已失效，请重新登录', 'error');
    }
    window.addEventListener('pf:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('pf:unauthorized', handleUnauthorized);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
      const data = await loadBootstrap();
      setUser(data.user);
      return { error: null };
    } catch (error) {
      return { error: errorMessage(error, '登录失败，请稍后重试') };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // 即使请求失败，本地也清除登录态
    } finally {
      clearCache();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await loadBootstrap();
      setUser(data.user);
    } catch (error) {
      notify(errorMessage(error, '刷新用户信息失败'), 'error');
    }
  }, []);

  const updateProfile = useCallback(async (fullName: string, email: string) => {
    try {
      const updated = await updateOwnProfile(fullName, email);
      if (!updated) return { error: '资料更新失败' };
      setUser(updated);
      notify('个人资料已更新', 'success');
      return { error: null };
    } catch (error) {
      return { error: errorMessage(error, '资料更新失败') };
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await apiRequest('/api/auth/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
      notify('密码修改成功', 'success');
      return { error: null };
    } catch (error) {
      return { error: errorMessage(error, '密码修改失败') };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile: user, loading, signIn, signOut, refreshProfile, updateProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}


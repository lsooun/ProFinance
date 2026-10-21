import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  Card, Button, Input, Select, Modal, Badge, EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { PERSON_ROLE_LABELS, type UserRole, type UserAccount } from '@/types';
import {
  getUsers, createUser, updateUser, deleteUser, getPersons, createPasswordResetToken,
} from '@/lib/storage';
import { notify } from '@/lib/notify';
import {
  UserPlus, Pencil, Trash2, Users, AlertCircle, Shield, User as UserIcon,
  Lock, Mail, Link2, Search, KeyRound, Copy, Check,
} from 'lucide-react';

export default function UsersPage() {
  const { profile: currentProfile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>(getUsers());
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetLink, setResetLink] = useState<{ user: UserAccount; url: string; expiresAt: string } | null>(null);
  const [generatingReset, setGeneratingReset] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reload() {
    setUsers(getUsers());
  }

  const isAdmin = currentProfile?.role === 'admin';
  const filteredUsers = users.filter((user) => {
    const keyword = search.toLowerCase();
    return user.full_name.toLowerCase().includes(keyword) || user.email.toLowerCase().includes(keyword);
  });

  function openNew() {
    setEditingUser(null);
    setModalOpen(true);
  }

  function openEdit(user: UserAccount) {
    setEditingUser(user);
    setModalOpen(true);
  }

  async function toggleActive(user: UserAccount) {
    if (user.id === currentProfile?.id) {
      notify('不能停用当前登录账号', 'error');
      return;
    }
    const updated = await updateUser(user.id, { is_active: !user.is_active });
    if (updated) reload();
  }

  async function handleGenerateReset(user: UserAccount) {
    setGeneratingReset(user.id);
    const result = await createPasswordResetToken(user.id);
    setGeneratingReset(null);
    if (!result) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    setResetLink({
      user,
      url: `${base}#/reset-password?token=${encodeURIComponent(result.token)}`,
      expiresAt: result.expires_at,
    });
    setCopied(false);
  }

  async function copyResetLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('复制失败，请手动选择链接复制', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteUser(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
      reload();
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card className="p-6">
          <EmptyState icon={<Lock className="w-6 h-6" />} title="无访问权限" description="只有管理员可以管理用户账号。" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">账号管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理登录账号、角色权限与密码；项目经理和员工账号请在人员管理中开通。</p>
        </div>
        <div className="relative lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索姓名或邮箱…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full lg:w-64 rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <Button onClick={openNew}><UserPlus className="w-4 h-4" /> 新增管理员账号</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Users className="w-5 h-5 text-slate-600" /></div>
          <div><p className="text-xs text-slate-500">账号总数</p><p className="text-lg font-bold text-slate-900">{users.length}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Shield className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-xs text-slate-500">管理员</p><p className="text-lg font-bold text-slate-900">{users.filter((user) => user.role === 'admin').length}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><UserIcon className="w-5 h-5 text-emerald-600" /></div>
          <div><p className="text-xs text-slate-500">启用账号</p><p className="text-lg font-bold text-slate-900">{users.filter((user) => user.is_active).length}</p></div>
        </Card>
      </div>

      {filteredUsers.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<Users className="w-6 h-6" />} title="没有匹配的账号" description="请调整搜索条件。" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">{(user.full_name || '用').charAt(0).toUpperCase()}</div>
                        <div>
                          <p className="font-medium text-slate-900">{user.full_name || '未命名'}</p>
                          {user.id === currentProfile?.id && <p className="text-xs text-blue-600">当前账号</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={user.role === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : user.role === 'manager' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
                        {user.role === 'admin' ? <><Shield className="w-3 h-3" /> 管理员</> : user.role === 'manager' ? <><UserIcon className="w-3 h-3" /> 项目经理</> : <><UserIcon className="w-3 h-3" /> 普通员工</>}
                      </Badge>
                      {user.person_id && (
                        <span className="text-xs text-slate-400 flex items-center gap-1 mt-1"><Link2 className="w-3 h-3" /> {getPersons().find((person) => person.id === user.person_id)?.name || '未知人员'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void toggleActive(user)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${user.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'} ${user.id === currentProfile?.id ? 'cursor-not-allowed opacity-70' : ''}`}
                        title={user.id === currentProfile?.id ? '不能停用当前登录账号' : '切换状态'}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {user.is_active ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => void handleGenerateReset(user)}
                        className="text-slate-400 hover:text-amber-600 p-1 rounded transition-colors"
                        title="生成密码重置链接"
                        disabled={generatingReset === user.id}
                      ><KeyRound className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(user)} className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors" title="编辑"><Pencil className="w-4 h-4" /></button>
                      {user.id !== currentProfile?.id && (
                        <button onClick={() => setDeleteTarget(user)} className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors ml-1" title="删除"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <UserFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          user={editingUser}
          currentUserId={currentProfile?.id || null}
          onSaved={async () => {
            setModalOpen(false);
            reload();
            if (editingUser?.id === currentProfile?.id) await refreshProfile();
          }}
        />
      )}

      {resetLink && (
        <Modal open onClose={() => setResetLink(null)} title="密码重置链接">
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
              为 <span className="font-semibold">{resetLink.user.full_name}</span> 生成了一次性重置链接，30 分钟内有效。请通过安全渠道发送给用户，链接只能使用一次。
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">重置链接</label>
              <textarea
                readOnly
                value={resetLink.url}
                rows={3}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-700 bg-slate-50 focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-500">到期时间：{formatDate(resetLink.expiresAt)} {new Date(resetLink.expiresAt).toLocaleTimeString('zh-CN')}</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setResetLink(null)}>关闭</Button>
              <Button onClick={() => void copyResetLink()}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制' : '复制链接'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="删除用户" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-5 h-5 text-rose-600" /></div>
              <p className="text-sm text-slate-700">
                确定删除用户 <span className="font-semibold">{deleteTarget.full_name}</span>（{deleteTarget.email}）吗？
                该账号将无法再登录，此操作不可撤销。
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

function UserFormModal({
  open, onClose, user, currentUserId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserAccount | null;
  currentUserId: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const linkedPerson = user?.person_id
    ? getPersons().find((person) => person.id === user.person_id) ?? null
    : null;
  const [fullName, setFullName] = useState(linkedPerson?.name || user?.full_name || '');
  const [role, setRole] = useState<UserRole>(user?.role || 'admin');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password && password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }
    if (user) {
      setSaving(true);
      const updates: Parameters<typeof updateUser>[1] = {
        email,
        role: linkedPerson ? role : 'admin',
        is_active: user.id === currentUserId ? true : isActive,
      };
      if (!linkedPerson) updates.full_name = fullName;
      if (password) updates.password = password;
      const updated = await updateUser(user.id, updates);
      setSaving(false);
      if (updated) await onSaved();
    } else {
      if (!fullName.trim() || !email || !password) {
        setError('新增管理员账号必须填写姓名、邮箱和密码');
        return;
      }
      if (password.length < 6) { setError('密码至少需要 6 个字符'); return; }
      setSaving(true);
      const created = await createUser(fullName, email, password, 'admin', null);
      setSaving(false);
      if (created) await onSaved();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user ? '编辑账号' : '新增管理员账号'}>
      <form onSubmit={handleSave} className="space-y-4">
        {linkedPerson ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs text-slate-500">人员信息</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">{linkedPerson.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{linkedPerson.department || '未填写部门'} · {PERSON_ROLE_LABELS[linkedPerson.role]}</p>
            <p className="text-[11px] text-slate-400 mt-1">姓名以人员档案为准；登录邮箱在下方维护。</p>
          </div>
        ) : (
          <>
            <Input label="姓名" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="张三" />
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              管理员账号不关联人员档案。项目经理和员工账号请到“人员管理”中开通。
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">登录邮箱</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com"
              className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>

        <Input
          label={user ? '重置密码（留空则不修改）' : '密码'}
          type="password"
          required={!user}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={user ? '输入新密码则重置' : '至少 6 个字符'}
          autoComplete="new-password"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {linkedPerson ? (
            <Select label="系统角色" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="manager">项目经理</option>
              <option value="employee">普通员工</option>
              <option value="admin">管理员</option>
            </Select>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">系统角色</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">管理员</div>
            </div>
          )}
          <Select
            label="状态"
            value={isActive ? 'active' : 'inactive'}
            onChange={(e) => setIsActive(e.target.value === 'active')}
            disabled={user?.id === currentUserId || !user}
          >
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </Select>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-700">管理员</strong>：全部权限，包含账号与人员管理。<br />
          <strong className="text-slate-700">项目经理</strong>：查看全部项目汇总统计；管理自己负责项目的明细、收支、人员、工时与报表。<br />
          <strong className="text-slate-700">普通员工</strong>：只能查看被分配的项目，并填报自己的工时。
        </div>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : user ? '保存修改' : '创建管理员账号'}</Button>
        </div>
      </form>
    </Modal>
  );
}

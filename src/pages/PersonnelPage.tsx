import { useState } from 'react';
import {
  Card, Button, Input, Select, Modal, Badge, EmptyState,
} from '@/components/ui';
import { formatDate, formatHours } from '@/lib/format';
import {
  PERSON_ROLE_LABELS, type Person, type PersonRole,
} from '@/types';
import {
  getPersons, createPerson, updatePerson, deletePerson,
  getPersonActualHours, getAssignmentsByPerson, getUsers, createUser,
} from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import type { UserAccount, UserRole } from '@/types';
import {
  UserPlus, Pencil, Trash2, Users, AlertCircle, Mail, Phone, Briefcase, Clock, KeyRound, Settings,
} from 'lucide-react';

const ALL_ROLES: PersonRole[] = ['project_manager', 'consultant', 'developer', 'designer', 'qa', 'other'];

export default function PersonnelPage({ onManageAccounts }: { onManageAccounts?: () => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [persons, setPersons] = useState<Person[]>(getPersons());
  const [accounts, setAccounts] = useState<UserAccount[]>(isAdmin ? getUsers() : []);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [accountPerson, setAccountPerson] = useState<Person | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountRole, setAccountRole] = useState<UserRole>('employee');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);

  function reload() {
    setPersons(getPersons());
    setAccounts(isAdmin ? getUsers() : []);
  }

  function openAccount(person: Person) {
    setAccountPerson(person);
    setAccountEmail(person.email || '');
    setAccountPassword('');
    setAccountRole(person.role === 'project_manager' ? 'manager' : 'employee');
    setAccountError(null);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accountPerson) return;
    setAccountError(null);
    if (!accountEmail.trim()) { setAccountError('请填写登录邮箱'); return; }
    if (accountPassword.length < 6) { setAccountError('密码至少需要 6 个字符'); return; }
    setAccountSaving(true);
    const created = await createUser(accountPerson.name, accountEmail.trim(), accountPassword, accountRole, accountPerson.id);
    setAccountSaving(false);
    if (created) {
      setAccountPerson(null);
      reload();
    }
  }

  const filtered = persons.filter((person) => {
    const keyword = search.toLowerCase();
    const matchesSearch = person.name.toLowerCase().includes(keyword) ||
      person.email.toLowerCase().includes(keyword) ||
      person.department.toLowerCase().includes(keyword);
    const matchesRole = !roleFilter || person.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  function openNew() {
    setEditingPerson(null);
    setModalOpen(true);
  }

  function openEdit(person: Person) {
    setEditingPerson(person);
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deletePerson(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
      reload();
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="按姓名、邮箱或部门搜索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">全部角色</option>
          {ALL_ROLES.map((role) => <option key={role} value={role}>{PERSON_ROLE_LABELS[role]}</option>)}
        </select>
        <Button onClick={openNew} className="lg:ml-auto">
          <UserPlus className="w-4 h-4" /> 添加人员
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={persons.length === 0 ? '暂无人员' : '没有匹配的人员'}
            description={persons.length === 0 ? '添加第一位团队成员，开始管理项目分配与工时。' : '请调整搜索条件或角色筛选。'}
            action={persons.length === 0 ? <Button onClick={openNew}><UserPlus className="w-4 h-4" /> 添加人员</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((person) => {
            const actualHours = getPersonActualHours(person.id);
            const assignments = getAssignmentsByPerson(person.id);
            return (
              <Card key={person.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{person.name}</h3>
                      <p className="text-xs text-slate-500">{person.department || '未填写部门'}</p>
                    </div>
                  </div>
                  <Badge className={person.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                    {person.is_active ? '在职' : '停用'}
                  </Badge>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">角色</span>
                    <Badge className="bg-slate-50 text-slate-700 border-slate-200">{PERSON_ROLE_LABELS[person.role]}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400" /> {person.email || '—'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400" /> {person.phone || '—'}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">登录账号</span>
                      {(() => {
                        const account = accounts.find((item) => item.person_id === person.id);
                        if (!account) return <span className="text-xs text-slate-400">未开通</span>;
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${account.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${account.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {account.is_active ? '已开通' : '已停用'}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-0.5">
                      <Briefcase className="w-3 h-3" /> 项目数
                    </div>
                    <p className="text-lg font-bold text-slate-900">{assignments.length}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-0.5">
                      <Clock className="w-3 h-3" /> 累计工时
                    </div>
                    <p className="text-lg font-bold text-slate-900">{formatHours(actualHours)}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">创建于 {formatDate(person.created_at)}</span>
                  <div className="flex items-center gap-1">
                    {isAdmin && (() => {
                      const account = accounts.find((item) => item.person_id === person.id);
                      return account ? (
                        <Button variant="ghost" size="sm" onClick={onManageAccounts} title="账号管理">
                          <Settings className="w-3.5 h-3.5" /> 账号
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openAccount(person)} title="开通登录账号">
                          <KeyRound className="w-3.5 h-3.5" /> 开通账号
                        </Button>
                      );
                    })()}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(person)} title="编辑"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(person)} className="text-rose-600 hover:bg-rose-50" title="删除"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <PersonFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          person={editingPerson}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}

      {accountPerson && (
        <Modal open onClose={() => setAccountPerson(null)} title={`为 ${accountPerson.name} 开通登录账号`}>
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900">{accountPerson.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{accountPerson.department || '未填写部门'} · {PERSON_ROLE_LABELS[accountPerson.role]}</p>
            </div>
            <Input label="登录邮箱" type="email" required value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="user@company.com" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="系统角色" value={accountRole} onChange={(e) => setAccountRole(e.target.value as UserRole)}>
                <option value="employee">普通员工</option>
                <option value="manager">项目经理</option>
              </Select>
              <Input label="初始密码" type="password" required minLength={6} value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="至少 6 个字符" autoComplete="new-password" />
            </div>
            <p className="text-xs text-slate-400">账号会自动关联当前人员档案；姓名以人员档案为准。</p>
            {accountError && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{accountError}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setAccountPerson(null)} disabled={accountSaving}>取消</Button>
              <Button type="submit" disabled={accountSaving}>{accountSaving ? '开通中…' : '开通账号'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="删除人员" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-sm text-slate-700">
                确定删除 <span className="font-semibold">{deleteTarget.name}</span> 吗？
                其项目分配和工时记录将一并删除。若该人员已开通登录账号，请先在账号管理中删除账号后再删除人员。
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

function PersonFormModal({
  open, onClose, person, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  person: Person | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(person?.name || '');
  const [role, setRole] = useState<PersonRole>(person?.role || 'developer');
  const [email, setEmail] = useState(person?.email || '');
  const [phone, setPhone] = useState(person?.phone || '');
  const [department, setDepartment] = useState(person?.department || '');
  const [isActive, setIsActive] = useState(person?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name, role, email, phone, department, is_active: isActive };
    const saved = person ? await updatePerson(person.id, payload) : await createPerson(payload);
    setSaving(false);
    if (saved) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={person ? '编辑人员' : '添加人员'}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="姓名" required value={name} onChange={(e) => setName(e.target.value)} placeholder="张伟" />
          <Select label="角色" value={role} onChange={(e) => setRole(e.target.value as PersonRole)}>
            {ALL_ROLES.map((item) => <option key={item} value={item}>{PERSON_ROLE_LABELS[item]}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="邮箱" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          <Input label="电话" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="138-0000-0000" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="部门" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="工程部" />
          <Select label="状态" value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
            <option value="active">在职</option>
            <option value="inactive">停用</option>
          </Select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : person ? '保存修改' : '添加'}</Button>
        </div>
      </form>
    </Modal>
  );
}

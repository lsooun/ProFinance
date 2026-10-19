import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  Card, Button, Input, Select, Modal, EmptyState, StatCard,
} from '@/components/ui';
import { formatDate, formatHours } from '@/lib/format';
import type { Person, Project, TimesheetEntry } from '@/types';
import {
  getPersons, getProjects, getTimesheets, createTimesheet, updateTimesheet, deleteTimesheet,
  getAssignmentsByProject,
} from '@/lib/storage';
import {
  Plus, Clock, Search, Pencil, Trash2, AlertCircle, User, ArrowLeftRight,
  Upload, Download, CheckCircle2,
} from 'lucide-react';
import { parseCSV, getFieldAny, downloadCSVTemplate } from '@/lib/csv';
import { notify } from '@/lib/notify';

export default function TimesheetPage() {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const currentPersonId = user?.person_id ?? null;
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>(getTimesheets());
  const [persons] = useState<Person[]>(getPersons());
  const [projects] = useState<Project[]>(getProjects());
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [personFilter, setPersonFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimesheetEntry | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    setTimesheets(getTimesheets());
  }

  const filtered = timesheets.filter((entry) => {
    if (isEmployee && entry.person_id !== currentPersonId) return false;
    const person = persons.find((item) => item.id === entry.person_id);
    const keyword = search.toLowerCase();
    const matchesSearch =
      (entry.description || '').toLowerCase().includes(keyword) ||
      (person?.name || '').toLowerCase().includes(keyword);
    const matchesProject = !projectFilter || entry.project_id === projectFilter;
    const matchesPerson = !personFilter || entry.person_id === personFilter;
    return matchesSearch && matchesProject && matchesPerson;
  });

  const totalHours = filtered.reduce((sum, entry) => sum + entry.hours, 0);

  function openNew() {
    setEditingEntry(null);
    setModalOpen(true);
  }

  function openEdit(entry: TimesheetEntry) {
    setEditingEntry(entry);
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteTimesheet(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
      reload();
    }
  }

  function personName(id: string): string {
    return persons.find((person) => person.id === id)?.name || '未知人员';
  }

  function projectName(id: string): string {
    return projects.find((project) => project.id === id)?.name || '未知项目';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="工时合计" value={formatHours(totalHours)} icon={<Clock className="w-5 h-5" />} color="blue" />
        <StatCard label="记录条数" value={String(filtered.length)} icon={<ArrowLeftRight className="w-5 h-5" />} color="emerald" />
        <StatCard label="涉及人数" value={String(new Set(filtered.map((entry) => entry.person_id)).size)} icon={<User className="w-5 h-5" />} color="amber" />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="搜索人员或工作内容…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
        </div>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
          <option value="">全部项目</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {!isEmployee && (
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">全部人员</option>
            {persons.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        )}
        {!isEmployee && (
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> 导入</Button>
        )}
        <Button onClick={openNew} className="lg:ml-auto" disabled={isEmployee && !currentPersonId}>
          <Plus className="w-4 h-4" /> 填报工时
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Clock className="w-6 h-6" />}
            title={timesheets.length === 0 ? '暂无工时记录' : '没有匹配的工时记录'}
            description={timesheets.length === 0 ? '填报第一条工时，开始跟踪项目投入。' : '请调整筛选条件。'}
            action={timesheets.length === 0 && (!isEmployee || currentPersonId) ? <Button onClick={openNew}><Plus className="w-4 h-4" /> 填报工时</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">日期</th>
                  <th className="px-4 py-3 font-medium">人员</th>
                  <th className="px-4 py-3 font-medium">项目</th>
                  <th className="px-4 py-3 font-medium">工作内容</th>
                  <th className="px-4 py-3 font-medium text-right">工时</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{personName(entry.person_id)}</td>
                    <td className="px-4 py-3 text-slate-600">{projectName(entry.project_id)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{entry.description || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{formatHours(entry.hours)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(entry)} className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors" title="编辑"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(entry)} className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors ml-1" title="删除"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <TimesheetFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          entry={editingEntry}
          persons={persons}
          projects={projects}
          lockedPersonId={isEmployee ? currentPersonId : null}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}

      {importOpen && (
        <TimesheetImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          persons={persons}
          projects={projects}
          onImported={() => { setImportOpen(false); reload(); }}
        />
      )}

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="删除工时记录" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-sm text-slate-700">
                确定删除这条 <span className="font-semibold">{formatHours(deleteTarget.hours)}</span> 的工时记录吗？
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

function TimesheetFormModal({
  open, onClose, entry, persons, projects, lockedPersonId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  entry: TimesheetEntry | null;
  persons: Person[];
  projects: Project[];
  lockedPersonId: string | null;
  onSaved: () => void;
}) {
  const [personId, setPersonId] = useState(entry?.person_id || lockedPersonId || '');
  const [projectId, setProjectId] = useState(entry?.project_id || '');
  const [date, setDate] = useState(entry?.date || new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState(entry?.hours?.toString() || '8');
  const [description, setDescription] = useState(entry?.description || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const assignedPersons = projectId
    ? getAssignmentsByProject(projectId)
        .map((assignment) => persons.find((person) => person.id === assignment.person_id))
        .filter((person): person is Person => Boolean(person))
    : persons;
  const assignablePersons = lockedPersonId
    ? assignedPersons.filter((person) => person.id === lockedPersonId)
    : assignedPersons;
  const editingExistingPerson = entry ? persons.find((person) => person.id === entry.person_id) : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!personId) { setError('请选择人员。'); return; }
    if (!projectId) { setError('请选择项目。'); return; }
    if (lockedPersonId && !assignedPersons.some((person) => person.id === lockedPersonId)) {
      setError('你尚未被分配到该项目，无法填报该项目工时。');
      return;
    }
    const hoursNum = parseFloat(hours);
    if (!hoursNum || hoursNum <= 0) { setError('工时必须大于 0。'); return; }
    setSaving(true);
    const payload = { person_id: personId, project_id: projectId, date, hours: hoursNum, description };
    const saved = entry ? await updateTimesheet(entry.id, payload) : await createTimesheet(payload);
    setSaving(false);
    if (saved) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={entry ? '编辑工时记录' : '填报工时'}>
      <form onSubmit={handleSave} className="space-y-4">
        <Select label="项目" value={projectId} onChange={(e) => {
          setProjectId(e.target.value);
          if (!lockedPersonId) setPersonId('');
        }}>
          <option value="">选择项目…</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>

        {lockedPersonId ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            填报人员：<span className="font-medium">{persons.find((person) => person.id === lockedPersonId)?.name || '本人'}</span>
          </div>
        ) : (
          <Select label="人员" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">选择人员…</option>
            {assignablePersons.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            {editingExistingPerson && !assignablePersons.some((person) => person.id === editingExistingPerson.id) && (
              <option value={editingExistingPerson.id}>{editingExistingPerson.name}（当前记录）</option>
            )}
            {projectId && assignablePersons.length === 0 && <option value="" disabled>该项目暂无已分配成员</option>}
          </Select>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="日期" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="工时（小时）" type="number" min="0.25" max="24" step="0.25" required value={hours} onChange={(e) => setHours(e.target.value)} placeholder="8" />
        </div>
        <Input label="工作内容" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="填写具体工作内容…" />
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : entry ? '保存修改' : '提交工时'}</Button>
        </div>
      </form>
    </Modal>
  );
}

interface TsImportRow {
  rowNumber: number;
  date: string;
  personName: string;
  projectName: string;
  hours: number;
  description: string;
  error: string | null;
}

function TimesheetImportModal({
  open, onClose, persons, projects, onImported,
}: {
  open: boolean;
  onClose: () => void;
  persons: Person[];
  projects: Project[];
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<TsImportRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const TEMPLATE_HEADERS = ['日期', '人员', '项目', '工时', '描述'];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      setCsvText(text);
      doParse(text);
    };
    reader.readAsText(file, 'utf-8');
  }

  function doParse(text: string) {
    const result = parseCSV(text);
    if (result.headers.length === 0) {
      setParsedRows([]);
      setHasParsed(true);
      return;
    }
    const rows: TsImportRow[] = result.rows.map((row) => {
      const dateStr = getFieldAny(row.values, result.headers, ['日期', 'Date']);
      const personName = getFieldAny(row.values, result.headers, ['人员', 'Person']);
      const projectName = getFieldAny(row.values, result.headers, ['项目', 'Project']);
      const hoursStr = getFieldAny(row.values, result.headers, ['工时', 'Hours']);
      const description = getFieldAny(row.values, result.headers, ['描述', '工作内容', 'Description']);
      const errors: string[] = [];

      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.push('日期格式应为 YYYY-MM-DD');
      if (!personName) errors.push('人员不能为空');
      if (!projectName) errors.push('项目不能为空');
      const hours = parseFloat(hoursStr);
      if (!Number.isFinite(hours) || hours <= 0) errors.push('工时必须大于 0');
      if (personName && !persons.some((person) => person.name.toLowerCase() === personName.toLowerCase())) {
        errors.push(`人员“${personName}”不存在`);
      }
      if (projectName && !projects.some((project) => project.name.toLowerCase() === projectName.toLowerCase())) {
        errors.push(`项目“${projectName}”不存在`);
      }

      return {
        rowNumber: row.rowNumber,
        date: dateStr,
        personName,
        projectName,
        hours,
        description,
        error: errors.length > 0 ? errors.join('；') : null,
      };
    });
    setParsedRows(rows);
    setHasParsed(true);
  }

  function handleParse() {
    doParse(csvText);
  }

  async function handleImport() {
    const validRows = parsedRows.filter((row) => !row.error);
    let imported = 0;
    let failed = 0;
    for (const row of validRows) {
      const person = persons.find((item) => item.name.toLowerCase() === row.personName.toLowerCase());
      const project = projects.find((item) => item.name.toLowerCase() === row.projectName.toLowerCase());
      if (!person || !project) { failed++; continue; }
      const created = await createTimesheet({
        person_id: person.id,
        project_id: project.id,
        date: row.date,
        hours: row.hours,
        description: row.description,
      });
      if (created) imported++;
      else failed++;
    }
    if (failed > 0) notify(`${failed} 条记录导入失败`, 'error');
    setImportedCount(imported);
    setTimeout(() => {
      onImported();
    }, 1200);
  }

  function downloadTemplate() {
    downloadCSVTemplate(
      TEMPLATE_HEADERS,
      'timesheet-template.csv',
      [
        ['2026-01-20', '张伟', '企业官网改版', '8', '项目启动与规划'],
        ['2026-01-20', '王磊', '企业官网改版', '6', '后端接口搭建'],
      ],
    );
  }

  function reset() {
    setCsvText('');
    setParsedRows([]);
    setHasParsed(false);
    setImportedCount(0);
  }

  const validCount = parsedRows.filter((row) => !row.error).length;
  const errorCount = parsedRows.filter((row) => row.error).length;

  return (
    <Modal open={open} onClose={onClose} title="导入工时记录" size="lg">
      {importedCount > 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">成功导入 {importedCount} 条工时记录</h3>
          <p className="text-sm text-slate-500 mt-1">工时数据已保存。</p>
          <Button className="mt-4" onClick={() => { reset(); onClose(); }}>完成</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            上传包含以下列的 CSV 文件：<span className="font-semibold">日期、人员、项目、工时、描述</span>。
            人员与项目名称必须与系统现有记录一致。
            <br />
            <span className="text-xs text-blue-600">兼容旧模板的表头：Date、Person、Project、Hours、Description。</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center justify-center gap-2 font-medium rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 px-4 py-2 text-sm cursor-pointer transition-colors">
              <Upload className="w-4 h-4" /> 选择 CSV 文件
              <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}><Download className="w-3.5 h-3.5" /> 下载模板</Button>
          </div>

          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
            rows={6}
            placeholder="或在此粘贴 CSV 内容…"
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setHasParsed(false); }}
          />

          {csvText && !hasParsed && (
            <Button variant="outline" onClick={handleParse} className="w-full">预览导入</Button>
          )}

          {hasParsed && parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-emerald-600 font-medium">{validCount} 条有效</span>
                {errorCount > 0 && <span className="text-rose-600 font-medium">{errorCount} 条有误</span>}
                <span className="text-slate-400">共 {parsedRows.length} 行</span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">日期</th>
                      <th className="px-3 py-2 font-medium">人员</th>
                      <th className="px-3 py-2 font-medium">项目</th>
                      <th className="px-3 py-2 font-medium text-right">工时</th>
                      <th className="px-3 py-2 font-medium">描述</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNumber} className={row.error ? 'bg-rose-50/50' : ''}>
                        <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2 text-slate-600">{row.personName}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">{row.projectName}</td>
                        <td className="px-3 py-2 text-right text-slate-900 font-medium">{row.hours || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">{row.description || '—'}</td>
                        <td className="px-3 py-2">
                          {row.error ? <span className="text-rose-600 text-xs">{row.error}</span> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={reset}>重置</Button>
                <Button onClick={() => void handleImport()} disabled={validCount === 0}>导入 {validCount} 条记录</Button>
              </div>
            </div>
          )}

          {hasParsed && parsedRows.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">CSV 中没有数据行。</p>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="ghost" onClick={onClose}>取消</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

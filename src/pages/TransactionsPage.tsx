import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  Card, Button, Input, Select, Textarea, Modal, Badge, EmptyState, StatCard,
} from '@/components/ui';
import { formatCurrencyDetailed, formatDate } from '@/lib/format';
import {
  INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  type Transaction, type TransactionType, type Project,
} from '@/types';
import {
  getTransactions, getProjects, createTransaction, updateTransaction, deleteTransaction,
} from '@/lib/storage';
import {
  Plus, Search, Pencil, Trash2, ArrowUpRight, ArrowDownRight,
  Wallet, ArrowLeftRight, AlertCircle, Upload, Download, CheckCircle2,
} from 'lucide-react';
import { parseCSV, getFieldAny, downloadCSVTemplate } from '@/lib/csv';
import { notify } from '@/lib/notify';

export default function TransactionsPage({ initialProjectId }: { initialProjectId?: string | null }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>(getTransactions());
  const [projects, setProjects] = useState<Project[]>(getProjects());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(Boolean(initialProjectId));
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [presetProjectId] = useState<string | null>(initialProjectId || null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    setTransactions(getTransactions());
    setProjects(getProjects());
  }

  const filtered = transactions.filter((tx) => {
    const keyword = search.toLowerCase();
    const matchesSearch =
      (tx.description || '').toLowerCase().includes(keyword) ||
      tx.category.toLowerCase().includes(keyword);
    const matchesType = !typeFilter || tx.type === typeFilter;
    const matchesProject = !projectFilter || tx.project_id === projectFilter;
    const matchesCategory = !categoryFilter || tx.category === categoryFilter;
    return matchesSearch && matchesType && matchesProject && matchesCategory;
  });

  const totalIncome = filtered.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = filtered.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
  const allCategories = [...new Set(transactions.map((tx) => tx.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

  function openNew() {
    setEditingTx(null);
    setModalOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx);
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteTransaction(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
      reload();
    }
  }

  function projectName(id: string | null) {
    if (!id) return null;
    return projects.find((project) => project.id === id)?.name ?? null;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="收入" value={formatCurrencyDetailed(totalIncome)} icon={<ArrowUpRight className="w-5 h-5" />} color="emerald" />
        <StatCard label="支出" value={formatCurrencyDetailed(totalExpense)} icon={<ArrowDownRight className="w-5 h-5" />} color="rose" />
        <StatCard label="净额" value={formatCurrencyDetailed(totalIncome - totalExpense)} icon={<Wallet className="w-5 h-5" />} color={totalIncome - totalExpense >= 0 ? 'blue' : 'rose'} />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="搜索收支…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TransactionType | '')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
          <option value="">全部类型</option>
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </select>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
          <option value="">全部项目</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
          <option value="">全部分类</option>
          {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> 导入</Button>
        <Button onClick={openNew} className="lg:ml-auto"><Plus className="w-4 h-4" /> 新增收支</Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ArrowLeftRight className="w-6 h-6" />}
            title={transactions.length === 0 ? '暂无收支记录' : '没有匹配的收支记录'}
            description={transactions.length === 0 ? '记录第一笔收入或支出，开始跟踪财务状况。' : '请调整筛选条件。'}
            action={transactions.length === 0 ? <Button onClick={openNew}><Plus className="w-4 h-4" /> 新增收支</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">日期</th>
                  <th className="px-4 py-3 font-medium">说明</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">项目</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium text-right">金额</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium max-w-xs truncate">{tx.description || tx.category}</td>
                    <td className="px-4 py-3 text-slate-600">{tx.category}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{projectName(tx.project_id) || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className={tx.type === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                        {tx.type === 'income' ? '收入' : '支出'}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tx.type === 'income' ? '+' : '−'}{formatCurrencyDetailed(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(tx)} className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors" title="编辑"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(tx)} className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors ml-1" title="删除"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <TransactionFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          transaction={editingTx}
          projects={projects}
          userId={user?.id || null}
          presetProjectId={presetProjectId}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}

      {importOpen && (
        <TransactionImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          projects={projects}
          userId={user?.id || null}
          onImported={() => { setImportOpen(false); reload(); }}
        />
      )}

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="删除收支" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-sm text-slate-700">
                确定删除这笔<span className="font-semibold">{deleteTarget.type === 'income' ? '收入' : '支出'}</span>记录（
                <span className="font-semibold">{formatCurrencyDetailed(deleteTarget.amount)}</span>）吗？此操作不可撤销。
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

function TransactionFormModal({
  open, onClose, transaction, projects, userId, presetProjectId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  projects: Project[];
  userId: string | null;
  presetProjectId: string | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type || 'income');
  const [category, setCategory] = useState(transaction?.category || '');
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction?.amount?.toString() || '');
  const [transactionDate, setTransactionDate] = useState(transaction?.transaction_date || new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState(transaction?.project_id || presetProjectId || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || parseFloat(amount) <= 0) {
      setError('金额必须大于 0');
      return;
    }
    setSaving(true);
    const payload = {
      type,
      category: category || categories[0],
      description,
      amount: parseFloat(amount),
      transaction_date: transactionDate,
      project_id: projectId || null,
      created_by: userId,
    };
    const saved = transaction
      ? await updateTransaction(transaction.id, payload)
      : await createTransaction(payload);
    setSaving(false);
    if (saved) onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={transaction ? '编辑收支' : '新增收支'}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => { setType('income'); setCategory(''); }}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${type === 'income' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            <ArrowUpRight className="w-4 h-4" /> 收入
          </button>
          <button type="button" onClick={() => { setType('expense'); setCategory(''); }}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${type === 'expense' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            <ArrowDownRight className="w-4 h-4" /> 支出
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="金额（元）" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <Input label="日期" type="date" required value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="分类" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">选择分类…</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select label="项目（可选）" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">不关联项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </div>

        <Textarea label="说明" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可填写备注…" />

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : transaction ? '保存修改' : '创建'}</Button>
        </div>
      </form>
    </Modal>
  );
}

interface ImportRow {
  rowNumber: number;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  date: string;
  projectName: string;
  projectId: string | null;
  error: string | null;
}

function TransactionImportModal({
  open, onClose, projects, userId, onImported,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  userId: string | null;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const TEMPLATE_HEADERS = ['类型', '日期', '分类', '描述', '金额', '项目'];

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
    const rows: ImportRow[] = result.rows.map((row) => {
      const typeStr = getFieldAny(row.values, result.headers, ['类型', 'Type']).toLowerCase();
      const dateStr = getFieldAny(row.values, result.headers, ['日期', 'Date']);
      const category = getFieldAny(row.values, result.headers, ['分类', 'Category']);
      const description = getFieldAny(row.values, result.headers, ['描述', '说明', 'Description']);
      const amountStr = getFieldAny(row.values, result.headers, ['金额', 'Amount']);
      const projectName = getFieldAny(row.values, result.headers, ['项目', 'Project']);

      const errors: string[] = [];
      const type: TransactionType =
        typeStr === '收入' || typeStr === 'income'
          ? 'income'
          : typeStr === '支出' || typeStr === 'expense'
            ? 'expense'
            : 'expense';
      if (typeStr !== '收入' && typeStr !== '支出' && typeStr !== 'income' && typeStr !== 'expense') {
        errors.push('类型必须为“收入”或“支出”');
      }
      const amount = parseFloat(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) errors.push('金额必须大于 0');
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.push('日期格式应为 YYYY-MM-DD');

      let projectId: string | null = null;
      if (projectName) {
        const project = projects.find((item) => item.name.toLowerCase() === projectName.toLowerCase());
        if (!project) errors.push(`项目“${projectName}”不存在`);
        else projectId = project.id;
      }

      return {
        rowNumber: row.rowNumber,
        type,
        category,
        description,
        amount,
        date: dateStr,
        projectName,
        projectId,
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
      const created = await createTransaction({
        type: row.type,
        category: row.category || (row.type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]),
        description: row.description,
        amount: row.amount,
        transaction_date: row.date,
        project_id: row.projectId,
        created_by: userId,
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
    const sampleProject = projects[0]?.name || '';
    const sampleDate = new Date().toISOString().slice(0, 10);
    downloadCSVTemplate(
      TEMPLATE_HEADERS,
      'transactions-template.csv',
      [
        ['收入', sampleDate, INCOME_CATEGORIES[0], '示例收入', '25000', sampleProject],
        ['支出', sampleDate, EXPENSE_CATEGORIES[0], '示例支出', '15000', sampleProject],
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
    <Modal open={open} onClose={onClose} title="导入收支记录" size="lg">
      {importedCount > 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">成功导入 {importedCount} 条收支记录</h3>
          <p className="text-sm text-slate-500 mt-1">收支数据已保存。</p>
          <Button className="mt-4" onClick={() => { reset(); onClose(); }}>完成</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            上传包含以下列的 CSV 文件：<span className="font-semibold">类型、日期、分类、描述、金额、项目</span>。
            类型填写“收入”或“支出”；项目需与现有项目名称一致，留空表示不关联项目。
            <br />
            <span className="text-xs text-blue-600">兼容旧模板的表头：Type、Date、Category、Description、Amount、Project。</span>
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
                      <th className="px-3 py-2 font-medium">类型</th>
                      <th className="px-3 py-2 font-medium">日期</th>
                      <th className="px-3 py-2 font-medium">分类</th>
                      <th className="px-3 py-2 font-medium">说明</th>
                      <th className="px-3 py-2 font-medium text-right">金额</th>
                      <th className="px-3 py-2 font-medium">项目</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNumber} className={row.error ? 'bg-rose-50/50' : ''}>
                        <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-slate-600">{row.type === 'income' ? '收入' : '支出'}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2 text-slate-600">{row.category || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{row.description || '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-900 font-medium">{row.amount || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">{row.projectName || '—'}</td>
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

import type {
  BootstrapData,
  InvoicePlan,
  ManagerOption,
  Person,
  Project,
  ProjectAssignment,
  ProjectAttachment,
  TimesheetEntry,
  Transaction,
  UserAccount,
} from '@/types';
import { apiRequest, errorMessage } from '@/lib/api';
import { notify } from '@/lib/notify';

let cache: BootstrapData | null = null;

function data(): BootstrapData {
  if (!cache) throw new Error('数据尚未加载，请重新登录');
  return cache;
}

export async function loadBootstrap(): Promise<BootstrapData> {
  const result = await apiRequest<BootstrapData>('/api/bootstrap');
  cache = result;
  return result;
}

export function clearCache(): void {
  cache = null;
}

export function getCurrentUser(): UserAccount | null {
  return cache?.user ?? null;
}

// ===== Users =====

export function getUsers(): UserAccount[] {
  return [...data().users].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getUserById(id: string): UserAccount | null {
  return data().users.find((user) => user.id === id) ?? null;
}

export async function createUser(
  fullName: string,
  email: string,
  password: string,
  role: UserAccount['role'],
  personId?: string | null,
): Promise<UserAccount | null> {
  const result = await mutate<{ user: UserAccount }>('/api/users', 'POST', {
    full_name: fullName,
    email,
    password,
    role,
    person_id: personId || null,
  });
  if (!result) return null;
  const store = data();
  store.users.push(result.user);
  syncManagerOption(result.user);
  return result.user;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<UserAccount, 'full_name' | 'email' | 'role' | 'is_active' | 'person_id'>> & {
    password?: string;
  },
): Promise<UserAccount | null> {
  const result = await mutate<{ user: UserAccount }>(`/api/users/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.users.findIndex((user) => user.id === id);
  if (index !== -1) store.users[index] = result.user;
  if (store.user.id === id) store.user = result.user;
  store.projects = store.projects.map((project) =>
    project.manager_user_id === id ? { ...project, manager_name: result.user.full_name } : project,
  );
  syncManagerOption(result.user);
  return result.user;
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  const store = data();
  store.users = store.users.filter((user) => user.id !== id);
  store.managerOptions = store.managerOptions.filter((option) => option.id !== id);
  store.projects = store.projects.map((project) =>
    project.manager_user_id === id
      ? { ...project, manager_user_id: null, manager_name: null }
      : project,
  );
  return true;
}

export function getManagerOptions(): ManagerOption[] {
  return [...data().managerOptions].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'zh-CN'),
  );
}

function syncManagerOption(user: UserAccount): void {
  const store = data();
  const exists = store.managerOptions.some((option) => option.id === user.id);
  const eligible = user.role === 'manager' && user.is_active;
  if (eligible) {
    const option = { id: user.id, full_name: user.full_name, role: user.role };
    if (exists) {
      store.managerOptions = store.managerOptions.map((item) =>
        item.id === user.id ? option : item,
      );
    } else {
      store.managerOptions.push(option);
    }
  } else if (exists) {
    store.managerOptions = store.managerOptions.filter((option) => option.id !== user.id);
  }
}

// ===== Projects =====

export function getProjects(): Project[] {
  return [...data().projects].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getProjectById(id: string): Project | null {
  return data().projects.find((project) => project.id === id) ?? null;
}

export async function createProject(
  project: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'manager_name'>,
): Promise<Project | null> {
  const result = await mutate<Project>('/api/projects', 'POST', project);
  if (!result) return null;
  data().projects.push(result);
  return result;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const result = await mutate<Project>(`/api/projects/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.projects.findIndex((project) => project.id === id);
  if (index !== -1) store.projects[index] = result;
  return result;
}

export async function deleteProject(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  const store = data();
  store.projects = store.projects.filter((project) => project.id !== id);
  store.transactions = store.transactions.map((tx) =>
    tx.project_id === id ? { ...tx, project_id: null } : tx,
  );
  store.assignments = store.assignments.filter((assignment) => assignment.project_id !== id);
  store.timesheets = store.timesheets.filter((entry) => entry.project_id !== id);
  store.invoicePlans = store.invoicePlans.filter((plan) => plan.project_id !== id);
  store.attachments = store.attachments.filter((attachment) => attachment.project_id !== id);
  return true;
}

export function getAccessibleProjects(user: UserAccount): Project[] {
  if (user.role === 'admin' || user.role === 'manager') return getProjects();
  if (!user.person_id) return [];
  const accessibleIds = new Set(
    data().assignments
      .filter((assignment) => assignment.person_id === user.person_id)
      .map((assignment) => assignment.project_id),
  );
  return getProjects().filter((project) => accessibleIds.has(project.id));
}

// ===== Transactions =====

export function getTransactions(): Transaction[] {
  return [...data().transactions].sort(
    (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime(),
  );
}

export function getTransactionsByProject(projectId: string): Transaction[] {
  return getTransactions().filter((tx) => tx.project_id === projectId);
}

export function getProjectCost(projectId: string): number {
  return getTransactionsByProject(projectId)
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function getProjectIncome(projectId: string): number {
  return getTransactionsByProject(projectId)
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'created_at'>,
): Promise<Transaction | null> {
  const result = await mutate<Transaction>('/api/transactions', 'POST', transaction);
  if (!result) return null;
  data().transactions.push(result);
  return result;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Transaction>,
): Promise<Transaction | null> {
  const result = await mutate<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.transactions.findIndex((tx) => tx.id === id);
  if (index !== -1) store.transactions[index] = result;
  return result;
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/transactions/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  data().transactions = data().transactions.filter((tx) => tx.id !== id);
  return true;
}

// ===== Persons =====

export function getPersons(): Person[] {
  return [...data().persons].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export function getPersonById(id: string): Person | null {
  return data().persons.find((person) => person.id === id) ?? null;
}

export async function createPerson(
  person: Omit<Person, 'id' | 'created_at'>,
): Promise<Person | null> {
  const result = await mutate<Person>('/api/persons', 'POST', person);
  if (!result) return null;
  data().persons.push(result);
  return result;
}

export async function updatePerson(id: string, updates: Partial<Person>): Promise<Person | null> {
  const result = await mutate<Person>(`/api/persons/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.persons.findIndex((person) => person.id === id);
  if (index !== -1) store.persons[index] = result;
  return result;
}

export async function deletePerson(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/persons/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  const store = data();
  store.persons = store.persons.filter((person) => person.id !== id);
  store.assignments = store.assignments.filter((assignment) => assignment.person_id !== id);
  store.timesheets = store.timesheets.filter((entry) => entry.person_id !== id);
  return true;
}

// ===== Assignments =====

export function getAssignments(): ProjectAssignment[] {
  return [...data().assignments];
}

export function getAssignmentsByProject(projectId: string): ProjectAssignment[] {
  return data().assignments.filter((assignment) => assignment.project_id === projectId);
}

export function getAssignmentsByPerson(personId: string): ProjectAssignment[] {
  return data().assignments.filter((assignment) => assignment.person_id === personId);
}

export async function createAssignment(dataInput: {
  project_id: string;
  person_id: string;
  planned_hours: number;
}): Promise<ProjectAssignment | null> {
  const result = await mutate<ProjectAssignment>('/api/assignments', 'POST', dataInput);
  if (!result) return null;
  data().assignments.push(result);
  return result;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/assignments/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  data().assignments = data().assignments.filter((assignment) => assignment.id !== id);
  return true;
}

// ===== Timesheets =====

export function getTimesheets(): TimesheetEntry[] {
  return [...data().timesheets].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function getTimesheetsByProject(projectId: string): TimesheetEntry[] {
  return getTimesheets().filter((entry) => entry.project_id === projectId);
}

export function getTimesheetsByPerson(personId: string): TimesheetEntry[] {
  return getTimesheets().filter((entry) => entry.person_id === personId);
}

export async function createTimesheet(
  entry: Omit<TimesheetEntry, 'id' | 'created_at'>,
): Promise<TimesheetEntry | null> {
  const result = await mutate<TimesheetEntry>('/api/timesheets', 'POST', entry);
  if (!result) return null;
  data().timesheets.push(result);
  return result;
}

export async function updateTimesheet(
  id: string,
  updates: Partial<TimesheetEntry>,
): Promise<TimesheetEntry | null> {
  const result = await mutate<TimesheetEntry>(`/api/timesheets/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.timesheets.findIndex((entry) => entry.id === id);
  if (index !== -1) store.timesheets[index] = result;
  return result;
}

export async function deleteTimesheet(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/timesheets/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  data().timesheets = data().timesheets.filter((entry) => entry.id !== id);
  return true;
}

export function getProjectActualHours(projectId: string): number {
  return getTimesheetsByProject(projectId).reduce((sum, entry) => sum + entry.hours, 0);
}

export function getProjectPlannedHours(projectId: string): number {
  return getAssignmentsByProject(projectId).reduce((sum, assignment) => sum + assignment.planned_hours, 0);
}

export function getPersonActualHours(personId: string): number {
  return getTimesheetsByPerson(personId).reduce((sum, entry) => sum + entry.hours, 0);
}

// ===== Invoice plans =====

export function getInvoicePlans(): InvoicePlan[] {
  return [...data().invoicePlans].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

export function getInvoicePlansByProject(projectId: string): InvoicePlan[] {
  return getInvoicePlans().filter((plan) => plan.project_id === projectId);
}

export function getInvoicePlanTotalPercentage(projectId: string): number {
  return getInvoicePlansByProject(projectId).reduce((sum, plan) => sum + plan.percentage, 0);
}

export async function createInvoicePlan(
  plan: Omit<InvoicePlan, 'id' | 'created_at'>,
): Promise<InvoicePlan | null> {
  const result = await mutate<InvoicePlan>('/api/invoices', 'POST', plan);
  if (!result) return null;
  data().invoicePlans.push(result);
  return result;
}

export async function updateInvoicePlan(
  id: string,
  updates: Partial<InvoicePlan>,
): Promise<InvoicePlan | null> {
  const result = await mutate<InvoicePlan>(`/api/invoices/${encodeURIComponent(id)}`, 'PATCH', updates);
  if (!result) return null;
  const store = data();
  const index = store.invoicePlans.findIndex((plan) => plan.id === id);
  if (index !== -1) store.invoicePlans[index] = result;
  return result;
}

export async function deleteInvoicePlan(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/invoices/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  data().invoicePlans = data().invoicePlans.filter((plan) => plan.id !== id);
  return true;
}

export function getAllInvoicePlans(): InvoicePlan[] {
  return getInvoicePlans();
}

// ===== Attachments =====

export function getAttachments(): ProjectAttachment[] {
  return [...data().attachments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getAttachmentsByProject(projectId: string): ProjectAttachment[] {
  return getAttachments().filter((attachment) => attachment.project_id === projectId);
}

export async function createAttachment(input: {
  project_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  data_base64: string;
}): Promise<ProjectAttachment | null> {
  const result = await mutate<ProjectAttachment>(
    `/api/projects/${encodeURIComponent(input.project_id)}/attachments`,
    'POST',
    {
      file_name: input.file_name,
      file_type: input.file_type,
      file_size: input.file_size,
      data_base64: input.data_base64,
    },
  );
  if (!result) return null;
  data().attachments.push(result);
  return result;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const result = await mutate<{ ok: boolean }>(`/api/attachments/${encodeURIComponent(id)}`, 'DELETE');
  if (!result?.ok) return false;
  data().attachments = data().attachments.filter((attachment) => attachment.id !== id);
  return true;
}

export function getAttachmentDownloadUrl(id: string): string {
  return `/api/attachments/${encodeURIComponent(id)}/download`;
}

// ===== Internal helpers =====

async function mutate<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T | null> {
  try {
    return await apiRequest<T>(path, { method, body });
  } catch (error) {
    notify(errorMessage(error), 'error');
    return null;
  }
}

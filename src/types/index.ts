export type ProjectStatus = 'presales' | 'in_progress' | 'completed' | 'cancelled';

export type UserRole = 'admin' | 'manager' | 'employee';

export interface UserAccount {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  person_id: string | null;
  created_at: string;
}

export type Profile = UserAccount;

export interface ManagerOption {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  manager_user_id: string | null;
  manager_name: string | null;
  client: string;
  start_date: string | null;
  end_date: string | null;
  budget_labor: number;
  budget_travel: number;
  budget_other: number;
  revenue: number;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  project_id: string | null;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  transaction_date: string;
  created_by: string | null;
  created_at: string;
}

export type PersonRole = 'project_manager' | 'consultant' | 'developer' | 'designer' | 'qa' | 'other';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  email: string;
  phone: string;
  department: string;
  is_active: boolean;
  created_at: string;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  person_id: string;
  planned_hours: number;
  created_at: string;
}

export interface TimesheetEntry {
  id: string;
  project_id: string;
  person_id: string;
  date: string;
  hours: number;
  description: string;
  created_at: string;
}

export type InvoiceStatus = 'unbilled' | 'invoiced' | 'collected';

export interface InvoicePlan {
  id: string;
  project_id: string;
  date: string;
  stage: string;
  percentage: number;
  status: InvoiceStatus;
  created_at: string;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unbilled: '未开票',
  invoiced: '已开票',
  collected: '已回款',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  unbilled: 'bg-slate-100 text-slate-600 border-slate-200',
  invoiced: 'bg-amber-50 text-amber-700 border-amber-200',
  collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export interface ProjectAttachment {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  presales: '预售',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  presales: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const STATUS_DOT_COLORS: Record<ProjectStatus, string> = {
  presales: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
};

export const INCOME_CATEGORIES = [
  '咨询服务',
  '开发服务',
  '设计服务',
  '运维服务',
  '培训服务',
  '其他收入',
];

export const EXPENSE_CATEGORIES = [
  '工资',
  '材料',
  '软件',
  '差旅',
  '设备',
  '市场推广',
  '办公',
  '其他支出',
];

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  project_manager: '项目经理',
  consultant: '顾问',
  developer: '开发工程师',
  designer: '设计师',
  qa: '测试工程师',
  other: '其他',
};

export const PERSON_ROLE_COLORS: Record<PersonRole, string> = {
  project_manager: 'bg-blue-100 text-blue-700 border-blue-200',
  consultant: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  developer: 'bg-violet-100 text-violet-700 border-violet-200',
  designer: 'bg-amber-100 text-amber-700 border-amber-200',
  qa: 'bg-rose-100 text-rose-700 border-rose-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  manager: '项目经理',
  employee: '普通员工',
};

export interface BootstrapData {
  user: UserAccount;
  projects: Project[];
  persons: Person[];
  assignments: ProjectAssignment[];
  timesheets: TimesheetEntry[];
  transactions: Transaction[];
  invoicePlans: InvoicePlan[];
  attachments: ProjectAttachment[];
  users: UserAccount[];
  managerOptions: ManagerOption[];
  permissions: {
    canManage: boolean;
    isAdmin: boolean;
  };
}

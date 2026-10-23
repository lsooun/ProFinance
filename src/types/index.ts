export type ProjectStatus = 'presales' | 'in_progress' | 'completed' | 'cancelled';

export type ProjectCategory =
  | 'erp_delivery'
  | 'custom_development'
  | 'integration_implementation'
  | 'operations_service'
  | 'consulting_service'
  | 'other';

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  erp_delivery: 'ERP交付类',
  custom_development: '定制开发类',
  integration_implementation: '集成实施类',
  operations_service: '运维服务类',
  consulting_service: '咨询服务类',
  other: '其他',
};

export const PROJECT_CATEGORY_COLORS: Record<ProjectCategory, string> = {
  erp_delivery: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  custom_development: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  integration_implementation: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  operations_service: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  consulting_service: 'bg-amber-50 text-amber-700 border-amber-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
};

export interface CostSheetMilestone {
  stage: string;
  percentage: number;
  amount: number;
  description: string;
}

export interface CostSheetData {
  updated_at: string;
  hardware_contract_with_tax: number;
  service_contract_with_tax: number;
  total_contract_with_tax: number;
  hardware_revenue_without_tax: number;
  service_revenue_without_tax: number;
  total_revenue_without_tax: number;
  hardware_cost: number;
  service_cost: number;
  outsourcing_cost: number;
  manpower_cost: number;
  other_expense: number;
  travel_cost: number;
  withholding_tax: number;
  total_cost: number;
  gross_margin: number;
  gross_margin_pct: number;
  contingency_outsourcing_pct: number;
  contingency_manpower_pct: number;
  contingency_outsourcing: number;
  contingency_manpower: number;
  other_risk: number;
  surcharge_tax_hardware: number;
  surcharge_tax_service: number;
  service_surcharge_enabled?: boolean;
  financial_interest: number;
  approval_margin: number;
  approval_margin_pct: number;
  // 兼容早期 Excel 解析版本的数据
  source_file_name?: string;
  parsed_at?: string;
  customer_name?: string;
  project_description?: string;
  project_start_date?: string | null;
  person_days?: number;
  payment_milestones?: CostSheetMilestone[];
  warnings?: string[];
}

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


export interface CostSheetVersionSummary {
  id: string;
  version: number;
  status: string;
  is_current: boolean;
  is_baseline: boolean;
  total_contract: number;
  revenue_without_tax: number;
  total_cost: number;
  gross_margin: number;
  approval_margin: number;
  created_at: string;
  approved_at: string | null;
  change_reason: string;
  created_by_name: string | null;
  approved_by_name: string | null;
}

export interface ProjectDetailData {
  project: Project;
  transactions: Transaction[];
  assignments: ProjectAssignment[];
  timesheets: TimesheetEntry[];
  invoicePlans: InvoicePlan[];
  attachments: ProjectAttachment[];
  canManage: boolean;
  canViewDetails: boolean;
}

export interface DashboardData {
  projects: Project[];
  transactions: Transaction[];
  timesheets: TimesheetEntry[];
  recentProjects: Project[];
  recentTransactions: Transaction[];
  recentTimesheets: TimesheetEntry[];
  summary: {
    totalIncome: number;
    totalExpense: number;
    totalBudget: number;
    monthIncome: number;
    monthExpense: number;
    activeProjectCount: number;
    statusCounts: Record<ProjectStatus, number>;
    monthHours: number;
    totalHours: number;
  };
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    contract: number;
    income: number;
    expense: number;
    status_counts: Partial<Record<ProjectStatus, number>>;
  };
}

export interface PaginatedTransactions {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  summary: { income: number; expense: number };
  categories: string[];
}

export interface PaginatedTimesheets {
  items: TimesheetEntry[];
  total: number;
  page: number;
  page_size: number;
  summary: { hours: number; persons: number };
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  project_name: string | null;
  before: unknown;
  after: unknown;
  ip: string;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface CostSheetVersionDetail extends CostSheetVersionSummary {
  details: CostSheetData | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  category: ProjectCategory | null;
  manager_user_id: string | null;
  manager_name: string | null;
  client: string;
  start_date: string | null;
  end_date: string | null;
  budget_labor: number;
  budget_travel: number;
  budget_other: number;
  revenue: number;
  tax_rate: number;
  cost_sheet?: CostSheetData | null;
  cost_sheet_version?: number | null;
  cost_sheet_updated_at?: string | null;
  cost_sheet_baseline_version?: number | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string;
  aggregate_income?: number;
  aggregate_expense?: number;
  aggregate_hours?: number;
  aggregate_planned_hours?: number;
  aggregate_month_income?: number;
  aggregate_month_expense?: number;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'income' | 'expense';
export type BudgetCategory = 'labor' | 'travel' | 'other';

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  labor: '人力',
  travel: '差旅',
  other: '其他',
};

export interface Transaction {
  id: string;
  project_id: string | null;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  transaction_date: string;
  created_by: string | null;
  budget_category: BudgetCategory | null;
  invoice_plan_id: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string;
}

export interface RecycleProjectItem {
  id: string;
  name: string;
  client: string;
  revenue: number;
  deleted_at: string;
  deleted_by_name: string | null;
  delete_reason: string;
  days_remaining: number;
}

export interface RecycleTransactionItem extends Transaction {
  project_name: string | null;
  deleted_by_name: string | null;
  days_remaining: number;
}

export interface RecycleBinPage<T> {
  type: 'project' | 'transaction';
  total: number;
  page: number;
  page_size: number;
  items: T[];
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
  paid_amount?: number;
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

export type AttachmentCategory =
  | 'cost_sheet'
  | 'contract'
  | 'sow'
  | 'blueprint'
  | 'test_confirmation'
  | 'go_live'
  | 'closure'
  | 'other';

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  cost_sheet: '成本表',
  contract: '合同',
  sow: 'SOW',
  blueprint: '蓝图签字文档',
  test_confirmation: '测试确认文档',
  go_live: '上线确认文档',
  closure: '项目关闭文档',
  other: '其他文档',
};

export const REQUIRED_ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  'cost_sheet', 'contract', 'sow', 'blueprint', 'test_confirmation', 'go_live', 'closure',
];

export const ATTACHMENT_CATEGORY_COLORS: Record<AttachmentCategory, string> = {
  cost_sheet: 'bg-blue-50 text-blue-700 border-blue-200',
  contract: 'bg-violet-50 text-violet-700 border-violet-200',
  sow: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blueprint: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  test_confirmation: 'bg-amber-50 text-amber-700 border-amber-200',
  go_live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closure: 'bg-slate-100 text-slate-600 border-slate-200',
  other: 'bg-slate-50 text-slate-500 border-slate-200',
};

export interface ProjectAttachment {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  category: AttachmentCategory;
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

export interface ProjectOption {
  id: string;
  name: string;
  status: ProjectStatus;
  category: ProjectCategory | null;
  manager_user_id: string | null;
  client: string;
  start_date: string | null;
  end_date: string | null;
}

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
  projectOptions: ProjectOption[];
  permissions: {
    canManage: boolean;
    isAdmin: boolean;
    canViewAllProjectStats?: boolean;
  };
}

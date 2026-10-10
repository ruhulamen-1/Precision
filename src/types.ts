export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  name: string;
  // Null for bulk-created (Project Name + Password) users.
  email: string | null;
  // Login ID for bulk-created users — the Project Name with spaces stripped +
  // lowercased. Null for regular email-based accounts.
  username?: string | null;
  role: UserRole;
  created_at?: string;
}

// One row of a Bulk Add Users import (Admin Panel -> Users -> Bulk Add Users).
export interface BulkUserRow {
  sl: number;
  project_name: string;
  password: string;
}

// Per-row result from POST /api/users/bulk.
export interface BulkUserResultItem {
  sl: number;
  project_name: string;
  reason?: string; // present on skipped rows
  id?: number;      // present on created rows
  username?: string; // present on created rows
}

export interface Project {
  id: number;
  project_name: string;
  created_by?: number;
  created_at?: string;
}

export interface UserProjectPermission {
  id: number;
  user_id: number;
  project_id: number;
  created_at?: string;
}

export interface MprNumber {
  id: number;
  mpr_no: string;
  created_by?: number;
  created_at?: string;
}

export interface Job {
  id: number;
  job_no: string;
  job_duration: string;
  created_at?: string;
}

export interface Entry {
  id: number;
  entry_date: string;
  job_name: string;
  budget_id?: number | null;
  project_id: number;
  job_id: number;
  mpr_id: number;
  // Exact imported Budget Excel row (budget_items.id) this entry's Item Name was
  // picked from. Null for older entries created before this column existed.
  budget_item_id?: number | null;
  item_name: string;
  delivery_date: string;
  created_by?: number;
  project_name: string;
  job_no: string;
  job_duration: string;
  mpr_no: string;
  user_name?: string;
  budget_name?: string | null;
  created_at?: string;
  // Pulled from the matching imported Budget Excel row (budget_id + MRF No + Description)
  specification?: string | null;
  req_qty?: string | null;
  unit?: string | null;
  bi_sl_no?: string | null;
  bi_req_no?: string | null;
  bi_item_date?: string | null;
  po_qty?: string | null;
  received_qty?: string | null;
  balance_qty?: string | null;
  bi_entry_user?: string | null;
  bi_approved_date?: string | null;
  bi_app_user?: string | null;
  site_sup_date?: string | null;
  // Whether the owning user has already submitted (locked) this entry's Budget
  budget_locked?: boolean;
  // "Job Recycle" soft delete — only present on rows returned from the Admin's
  // Recycle bin endpoint (GET /api/entries/recycle); active entries never carry these.
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
  // Set by POST /api/budgets/:id/approve ("Approve & Calculate"), matched from the Rate
  // File. matched_rate/computed_amount null with rate_calculated_at set means it WAS
  // attempted but genuinely found no match (vs. null rate_calculated_at = never run yet).
  matched_rate?: number | null;
  computed_amount?: number | null;
  category_head?: string | null;
  category_sub1?: string | null;
  category_sub2?: string | null;
  category_sub3?: string | null;
  category_sector?: string | null;
  rate_calculated_at?: string | null;
}

export interface EntryEditHistory {
  id: number;
  entry_id: number;
  edited_by?: number | null;
  editor_name?: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
}

export interface Budget {
  id: number;
  budget_name: string;
  created_by?: number;
  created_at?: string;
  item_count?: number;
  original_filename?: string | null;
  has_file?: boolean;
  // Admin-set allowed Delivery Date window for entries created under this Budget
  // (both null/empty = no restriction).
  delivery_date_from?: string | null;
  delivery_date_to?: string | null;
  // Whether the CURRENT logged-in user has already submitted (finished/locked) this
  // Budget — set per-user by the server, not a global flag on the Budget itself.
  submitted?: boolean;
  // Admin's "Submit" gate on the Data Import page: a Budget stays hidden from Users
  // (is_published = false) until the Admin reviews the imported Excel data and submits
  // it. GET /api/budgets already filters unpublished Budgets out for non-admin users,
  // so a User-facing screen will simply never receive one with is_published: false.
  is_published?: boolean;
  published_at?: string | null;
  // Set by POST /api/budgets/:id/approve ("Approve & Calculate") — when an Admin last
  // matched Rate/Category onto every entry under this Budget, and who ran it.
  rate_approved_at?: string | null;
  rate_approved_by?: number | null;
}

export interface BudgetItem {
  id: number;
  budget_id: number;
  sl_no?: string;
  project_name?: string;
  req_no?: string;
  mrf_no?: string;
  item_date?: string;
  description?: string;
  unit?: string;
  specification?: string;
  req_qty?: string;
  po_qty?: string;
  received_qty?: string;
  balance_qty?: string;
  entry_user?: string;
  approved_date?: string;
  app_user?: string;
  site_sup_date?: string;
  created_at?: string;
}

// A minimal, system-wide "is this MPR No already used, and under which Job" record —
// from GET /api/entries/mpr-usage. Deliberately has no created_by / user_name so a
// User can see an MPR No is taken (and where) without browsing other users' entries.
export interface MprUsage {
  mpr_id: number;
  mpr_no: string;
  job_no: string;
  job_name: string;
  project_name: string;
  entry_date: string;
}
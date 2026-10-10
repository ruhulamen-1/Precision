export const CHECK_STATUS = {
  PENDING: 'Pending',
  CHECKED: 'Checked',
  ON_HOLD: 'On Hold',
  RETURNED: 'Returned',
  RE_AUDIT: 'Re-Audit',
} as const;

export type CheckStatus = typeof CHECK_STATUS[keyof typeof CHECK_STATUS];

export const UPLOAD_STATUS = {
  NEW: 'New Upload',
  OLD: 'Old Upload',
} as const;

export type UploadStatus = typeof UPLOAD_STATUS[keyof typeof UPLOAD_STATUS];

export const USER_ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

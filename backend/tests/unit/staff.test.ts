import { describe, expect, it } from 'vitest';
import { canManageStaff } from '../../src/domain/staff.js';

describe('STAFF-001 AC-002 role hierarchy', () => {
  it('allows owner to manage admin and employee', () => {
    expect(canManageStaff('owner', 'admin', 'employee')).toBe(true);
    expect(canManageStaff('owner', 'employee', 'admin')).toBe(true);
  });
  it('ROLE-001 AC-002 allows admin to manage admin and employee', () => {
    expect(canManageStaff('admin', 'employee', 'employee')).toBe(true);
    expect(canManageStaff('admin', 'employee', 'admin')).toBe(true);
    expect(canManageStaff('admin', 'admin', 'employee')).toBe(true);
  });
  it('protects owner from management and role assignment', () => {
    expect(canManageStaff('owner', 'owner', 'owner')).toBe(false);
    expect(canManageStaff('owner', 'employee', 'owner')).toBe(false);
    expect(canManageStaff('admin', 'owner', 'employee')).toBe(false);
  });
  it('does not infer administrative rights for employee', () => {
    expect(canManageStaff('employee', 'employee', 'employee')).toBe(false);
  });
});

export type StaffRole = 'owner' | 'admin' | 'employee';

export function canManageStaff(
  actor: StaffRole,
  current: StaffRole,
  next: StaffRole,
): boolean {
  if (current === 'owner' || next === 'owner') return false;
  return (
    actor === 'owner' ||
    (actor === 'admin' && current === 'employee' && next === 'employee')
  );
}

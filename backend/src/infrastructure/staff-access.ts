import type { PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type { StaffRole } from '../domain/staff.js';

export interface StaffAccess {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: StaffRole;
  status: string;
}

export async function requireStaff(
  client: PoolClient,
  userId: string,
  restaurantId: string,
  allowed: StaffRole[],
  options: { allowSuspendedOwner?: boolean } = {},
): Promise<StaffAccess> {
  const result = await client.query<
    StaffAccess & { restaurant_status: string }
  >(
    `SELECT e.id,e.user_id,e.restaurant_id,e.status,r.rol_type AS role,
       restaurant.status AS restaurant_status
     FROM restaurant_employees e JOIN roles r ON r.id=e.role_id
     JOIN restaurants restaurant ON restaurant.id=e.restaurant_id
     WHERE e.user_id=$1 AND e.restaurant_id=$2`,
    [userId, restaurantId],
  );
  const staff = result.rows[0];
  if (!staff) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  if (staff.status !== 'active' || !allowed.includes(staff.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient restaurant permissions');
  }
  if (
    staff.restaurant_status !== 'active' &&
    !(options.allowSuspendedOwner && staff.role === 'owner')
  ) {
    throw new AppError(403, 'RESTAURANT_SUSPENDED', 'Restaurant is suspended');
  }
  return staff;
}

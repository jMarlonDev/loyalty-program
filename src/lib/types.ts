export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}
export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  status: string;
  actor_role?: 'owner' | 'admin' | 'employee';
  email?: string;
  phone?: string;
}
export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  department: string;
  status: string;
  phone?: string;
}
export interface Employee {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'employee';
  status: string;
  full_name?: string;
  email?: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token?: string;
  expires_at?: string;
}
export interface Program {
  terms_locked?: boolean;
  id: string;
  name: string;
  description: string | null;
  stamps_required: number;
  reward_description: string;
  logo_url: string | null;
  background_color: string;
  text_color: string;
  card_message: string | null;
  status: string;
  public_code: string;
  restaurant_name?: string;
}
export interface LoyaltyCard extends Partial<Program> {
  id: string;
  program_name: string;
  program_id: string;
  restaurant_id: string;
  status: string;
  balance: number;
  created_at: string;
}
export interface Reward {
  id: string;
  description: string;
  status: string;
  earned_at?: string;
}
export interface Movement {
  id: string;
  stamp_delta: number;
  type?: string;
  entry_type?: string;
  created_at: string;
  purchase_id?: string;
}
export interface ClosurePreview {
  card_id: string;
  benefits_version: number;
  balance: number;
  rewards: Reward[];
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}
export interface Restaurant {
  id: string;
  name: string;
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

export interface RewardView {
  id: string;
  description: string;
  status: 'available' | 'redeemed' | 'cancelled';
  accounting_mode: 'legacy_debited' | 'debit_on_redemption';
  earned_at: string;
  voucher: { token: string; expires_at: string | null } | null;
  whatsapp_url: string | null;
}
export interface CardView {
  id: string;
  membership_id: string;
  program_id: string;
  restaurant_id: string;
  restaurant_name: string;
  program_name: string;
  status: string;
  version: number;
  balance: number;
  target: number;
  cycle: {
    id: string;
    number: number;
    state: 'collecting' | 'reward_available' | 'redeemed';
    stamps: number;
    target: number;
  } | null;
  rewards: RewardView[];
  program: {
    name: string;
    description: string | null;
    stamps_required: number;
    reward_description: string;
    logo_url: string | null;
    background_color: string;
    text_color: string;
    card_message: string | null;
    public_code: string;
  };
}
export interface ScanReward {
  id: string;
  description: string;
  status: string;
  voucher_token: string | null;
}
export interface ScanResult {
  card: CardView;
  phone_masked: string;
  reward: ScanReward | null;
  allowed_actions: Array<'purchase' | 'redeem'>;
  locations?: Array<{ id: string; name: string }>;
}
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  physical_point: string | null;
  status: string;
  employees: number;
}
export interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  status: string;
  must_change_password: boolean;
  can_transfer_cards: boolean;
  locations: Array<{ id: string; name: string }>;
}
export interface BranchInvitation {
  id: string;
  location_id: string;
  location_name: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  state: 'valid' | 'expired' | 'revoked' | 'exhausted';
}
export interface BranchInvitationIssued {
  id: string;
  token: string;
  url: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  state: BranchInvitation['state'];
  location_name: string;
}
export interface OperatorInvitation {
  id: string;
  restaurant_id: string;
  email: string;
  phone_masked: string | null;
  status: string;
  expires_at: string;
}
export interface OperatorEmployee {
  id: string;
  user_id: string;
  status: string;
  phone_masked: string | null;
  joined_at: string;
  full_name: string;
  email: string;
  ended_at: string | null;
  can_transfer_cards?: boolean;
}

export interface EnrollmentResult {
  existing: boolean;
  same_program?: boolean;
  reenrollment?: boolean;
  notice?: string | null;
  card: CardView;
}
export interface AdminCardRow {
  card_id: string;
  membership_id: string;
  program_name: string;
  status: 'active' | 'closed';
  joined_at: string;
  closed_at: string | null;
  is_reenrollment: boolean;
  previous_cards_count: number;
  phone_masked: string;
  stamps: number;
  pending_rewards: number;
}
export interface AdminCardDetail {
  card_id: string;
  program_name: string;
  status: 'active' | 'closed';
  phone: string;
  phone_masked: string;
  joined_at: string;
  closed_at: string | null;
  close_reason: string | null;
  is_reenrollment: boolean;
  previous_cards_count: number;
  purchases: Array<{
    id?: string;
    created_at?: string;
    reference?: string | null;
  }>;
  rewards: Array<{
    id?: string;
    description?: string;
    status?: string;
    earned_at?: string;
  }>;
  previous_cards: Array<{
    card_id: string;
    status: string;
    joined_at: string;
    closed_at: string | null;
  }>;
}

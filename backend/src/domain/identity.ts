export interface VerifiedIdentity {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'suspended' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface ProfilePatch {
  full_name?: string;
  phone?: string | null;
}

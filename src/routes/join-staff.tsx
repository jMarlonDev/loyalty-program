import { createFileRoute } from '@tanstack/react-router';
import { JoinStaffPage } from '@/features/join-staff';
export const Route = createFileRoute('/join-staff')({
  component: JoinStaffPage,
});

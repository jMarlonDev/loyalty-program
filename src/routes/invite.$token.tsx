import { createFileRoute } from '@tanstack/react-router';
import { InvitationPage } from '@/features/enrollment';
export const Route = createFileRoute('/invite/$token')({ component: Page });
function Page() {
  const { token } = Route.useParams();
  return <InvitationPage token={token} />;
}

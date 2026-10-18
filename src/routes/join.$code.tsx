import { createFileRoute } from '@tanstack/react-router';
import { EnrollmentPage } from '@/features/enrollment';
export const Route = createFileRoute('/join/$code')({ component: Page });
function Page() {
  const { code } = Route.useParams();
  return <EnrollmentPage code={code} />;
}

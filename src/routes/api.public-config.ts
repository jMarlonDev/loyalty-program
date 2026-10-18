import { createFileRoute } from '@tanstack/react-router';
import { handleApi } from '@/server/runtime';

export const Route = createFileRoute('/api/public-config')({
  server: { handlers: { GET: ({ request }) => handleApi(request) } },
});

import { createFileRoute } from '@tanstack/react-router';
import { handleApi } from '@/server/runtime';

const handler = ({ request }: { request: Request }) => handleApi(request);
export const Route = createFileRoute('/openapi.json')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PATCH: handler,
      PUT: handler,
      DELETE: handler,
      OPTIONS: handler,
      HEAD: handler,
    },
  },
});

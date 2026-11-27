import { defineHandler } from 'nitro';
import { control } from './fixture-runtime';

export default defineHandler(async (event) => {
  if (
    event.req.headers.get('x-fixture-key') !== process.env.REALTIME_FIXTURE_KEY
  ) {
    return new Response(null, { status: 403 });
  }
  return control(
    (await event.req.json()) as { type: string; session?: string },
  );
});

import { definePlugin } from 'nitro';
import { closeRuntime } from './runtime';

export default definePlugin((app) => {
  app.hooks.hook('close', closeRuntime);
});

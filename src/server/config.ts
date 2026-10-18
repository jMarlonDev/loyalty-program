import { loadConfig } from '../../backend/src/config';
import { parseAppOrigin } from '../lib/public-origin';

export function loadRuntimeConfig(env: NodeJS.ProcessEnv) {
  const origin = parseAppOrigin(env.APP_ORIGIN);
  return { ...loadConfig(env), origin };
}

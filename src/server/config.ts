import { loadConfig } from '../../backend/src/config';
import { parseAppOrigin } from '../lib/public-origin';

export function readAppOrigin(env: NodeJS.ProcessEnv) {
  return parseAppOrigin(env.APP_ORIGIN, {
    allowPrivateHttp: env.NODE_ENV === 'development',
  });
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv) {
  const origin = readAppOrigin(env);
  return { ...loadConfig(env), origin };
}

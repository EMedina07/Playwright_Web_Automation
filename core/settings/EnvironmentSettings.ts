import dotenv from 'dotenv';
import path from 'path';

const VALID_ENVIRONMENTS = ['qa', 'cert', 'local'] as const;
type SupportedEnvironment = (typeof VALID_ENVIRONMENTS)[number];

const rawEnv = process.env.ENV ?? 'qa';

if (!(VALID_ENVIRONMENTS as readonly string[]).includes(rawEnv)) {
  throw new Error(
    `Invalid ENV "${rawEnv}". Supported environments: ${VALID_ENVIRONMENTS.join(', ')}`
  );
}

const env = rawEnv as SupportedEnvironment;

dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

const baseURL = process.env.BASE_URL;

if (!baseURL) {
  throw new Error(
    `BASE_URL is not defined. Create a .env.${env} file with BASE_URL=https://your-url.com`
  );
}

// URL del portal de comercios (app distinta del back-office). Si no se define,
// cae al back-office por compatibilidad.
const portalURL = process.env.PORTAL_URL ?? baseURL;

export default { env, baseURL, portalURL };

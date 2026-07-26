import { generateTotp } from './TotpGenerator';

// Obtiene UN token de sesión de admin vía la API (login + MFA), y lo cachea para
// toda la corrida (JWT válido ~15 min). Así se inyecta en sessionStorage del
// back-office sin repetir el login 2FA por escenario (evita el anti-replay del
// TOTP). Si el código cae en un paso ya usado, espera a la siguiente ventana.

const API = process.env.API_URL ?? 'http://localhost:5265';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@pricelist.dev';
// Credenciales del admin: SIEMPRE del .env.<entorno> (gitignored). Nunca se
// hardcodean la contraseña ni el secreto TOTP (semilla 2FA) — no deben viajar en
// el repositorio. Ver .env.example para las claves esperadas.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET ?? '';

let cachedToken: string | null = null;

export function clearAdminToken(): void {
  cachedToken = null;
}

export async function getAdminToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  if (!ADMIN_PASSWORD || !ADMIN_TOTP_SECRET) {
    throw new Error('Faltan ADMIN_PASSWORD y/o ADMIN_TOTP_SECRET en el .env del entorno (ver .env.example).');
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateTotp(ADMIN_TOTP_SECRET);
    const res = await fetch(`${API}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, totpCode: code }),
    });
    if (res.ok) {
      const data = (await res.json()) as { accessToken?: string };
      if (data.accessToken) {
        cachedToken = data.accessToken;
        return cachedToken;
      }
      lastErr = new Error('Login admin no devolvió accessToken.');
    } else {
      lastErr = new Error(`Login admin -> ${res.status}: ${(await res.text()).slice(0, 80)}`);
    }
    // Espera a la próxima ventana de 30 s (nuevo paso TOTP) antes de reintentar.
    const msToNext = 30_000 - (Date.now() % 30_000) + 700;
    await new Promise((r) => setTimeout(r, msToNext));
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo autenticar al admin.');
}

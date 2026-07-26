import { execFileSync } from 'node:child_process';

// Monta un comercio APROBADO para poder llegar a la pantalla de "Verificación
// en dos pasos" del portal. El comercio se CREA por el endpoint real de registro
// (así tiene una contraseña válida); la aprobación + verificación de correo se
// fijan por SQL directo, porque son PRECONDICIONES del test (no lo que se
// prueba: aquí se prueba la validación de cliente del campo de código 2FA).

const API = process.env.API_URL ?? 'http://localhost:5265';
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'pricelist-db';
const DB_USER = process.env.PGUSER ?? 'pricelist';
const DB_NAME = process.env.PGDATABASE ?? 'pricelist_dev';

async function post(path: string, body: unknown) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${data?.title ?? text}`);
  return data;
}

function sql(statement: string): void {
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-c', statement], {
    stdio: 'pipe',
  });
}

// Limpia el lockout/intentos del admin (precondición de las pruebas del 2FA del
// back-office: el primer login sin código no debe verse afectado por intentos
// fallidos de corridas previas).
export function resetAdminLockout(email = process.env.ADMIN_EMAIL ?? 'admin@pricelist.dev'): void {
  sql(`UPDATE admin_users SET failed_attempts = 0, locked_until = NULL WHERE email = '${email}';`);
}

export interface ApprovedVendor { email: string; password: string; vendorId: number }

export async function setupApprovedVendor(): Promise<ApprovedVendor> {
  const stamp = Date.now();
  const email = `mfa.${stamp}@pricelist.dev`;
  const password = 'Comercio#Mfa2026';
  const taxId = String(stamp).slice(-9);

  const reg = await post('/api/vendors/register', {
    name: 'Comercio MFA Test',
    legalName: 'MFA Test Comercial SRL',
    email,
    phone: '(809)-555-0177',
    address: 'Av. MFA 100, Santo Domingo',
    taxId,
    password,
  });
  const vendorId = reg.vendorId as number;

  // Precondición: correo verificado + solicitud aprobada (para poder llegar al 2FA).
  sql(`UPDATE vendor_accounts SET email_verified_at = now(), application_status = 'Approved' WHERE email = '${email}';`);

  return { email, password, vendorId };
}

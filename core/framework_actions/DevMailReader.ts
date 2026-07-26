import { readFileSync } from 'node:fs';

// En Development, PriceList "envía" los correos por DevEmailSender, que solo los
// loguea. El código de verificación no lo devuelve la API, así que lo leemos del
// log del backend (línea JSON con "Email" y "Code") — el mismo canal que usaría
// un operador de dev mirando la consola.

const API_LOG =
  process.env.API_LOG ??
  '/private/tmp/claude-501/-Users-emedina/f08ad1ea-5972-4564-b33f-b7db5622e43f/scratchpad/api.log';

// Devuelve el ÚLTIMO código de verificación logueado para ese correo, o null.
export function findEmailCode(email: string): string | null {
  let content: string;
  try {
    content = readFileSync(API_LOG, 'utf8');
  } catch {
    return null;
  }
  let code: string | null = null;
  for (const line of content.split('\n')) {
    if (!line.includes('DevEmailSender') || !line.includes(email)) continue;
    try {
      const rec = JSON.parse(line);
      if (rec?.State?.Code && rec?.State?.Email === email) code = String(rec.State.Code);
    } catch {
      /* ignora líneas no-JSON */
    }
  }
  return code;
}

// Espera (poll corto) hasta que aparezca el código, porque el log se escribe de
// forma asíncrona justo después de que la API responde.
export async function waitForEmailCode(
  email: string,
  { tries = 25, delayMs = 200 }: { tries?: number; delayMs?: number } = {},
): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const code = findEmailCode(email);
    if (code) return code;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

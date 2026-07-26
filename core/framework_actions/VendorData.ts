// Genera datos de comercio ALEATORIOS y ÚNICOS por corrida (para que el
// registro nunca choque con "dato ya registrado") y ya NORMALIZADOS, de modo
// que lo que se guarda/muestra en el back-office coincida exactamente con lo
// registrado. El backend normaliza el teléfono a "+1"+10dígitos; por eso se
// expone `phoneInput` (lo que se teclea) y `phoneDisplay` (lo que se mostrará).

export interface VendorInput {
  name: string;
  legalName: string;
  email: string;
  phoneInput: string;
  phoneDisplay: string;
  address: string;
  taxId: string;
  password: string;
}

function digits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

export function randomVendor(): VendorInput {
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000);
  const uid = `${stamp}${rand}`;
  const phone7 = digits(7);
  // RNC/Cédula: 9 dígitos, sin cero inicial (formato válido, sintético → DGII
  // no coincide → queda Pendiente).
  const taxId = (1 + Math.floor(Math.random() * 9)).toString() + digits(8);
  return {
    name: `Comercio Solicitud ${rand}`,
    legalName: `Solicitud ${rand} Comercial SRL`,
    email: `sol.${uid}@pricelist.dev`,
    phoneInput: `809${phone7}`,
    phoneDisplay: `+1809${phone7}`,
    address: `Av. Solicitud ${rand}, Santo Domingo`,
    taxId,
    password: 'Comercio#Sol2026',
  };
}

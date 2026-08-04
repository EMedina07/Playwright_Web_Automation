import crypto from 'node:crypto';
import { raw, type Raw } from './TrustActions';

// Acciones del módulo "Curación de catálogo" del back-office (A-04/P-01),
// todas a nivel de API — el servidor es la capa de cumplimiento de las
// validaciones; el cliente solo las refleja.

export interface PendingCuration {
  productId: number; gtin: string; name: string; saleUnit: string;
  createdAt: string; vendorCount: number; sampleLocalName: string | null;
}

export interface CurateBody {
  name: string; brand: string | null; categoryCode: string; saleUnit: string;
  subcategoryCode: string | null; presentation: string | null;
}

export interface SynonymRow { id: number; term: string; synonym: string; productCount: number }

export interface Coverage {
  totalProducts: number; withPrice: number; withoutPrice: number;
  uncovered: { productId: number; name: string }[];
}

/// EAN-13 nuevo y VÁLIDO (dígito verificador GS1 correcto), prefijo 778 para
/// no chocar con el seed (746) ni con los smokes manuales (779).
export function gtinValido(): string {
  const body = `778${crypto.randomInt(100000000, 999999999)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

/// El mismo GTIN pero con el dígito verificador corrido: inválido a propósito.
export function gtinInvalido(): string {
  const ok = gtinValido();
  return ok.slice(0, 12) + String((Number(ok[12]) + 1) % 10);
}

export const pendingCuration = (token: string): Promise<Raw> =>
  raw('/api/admin/catalog/pending-curation', { token });

export const curate = (token: string, productId: number, body: Partial<CurateBody>): Promise<Raw> =>
  raw(`/api/admin/catalog/products/${productId}`, { method: 'PUT', token, body });

export const categories = (token: string): Promise<Raw> =>
  raw('/api/admin/catalog/categories', { token });

export const coverage = async (token: string): Promise<Coverage> => {
  const r = await raw('/api/admin/catalog/price-coverage', { token });
  if (!r.ok) throw new Error(`price-coverage -> ${r.status}`);
  return r.data as Coverage;
};

export const createSynonym = (token: string, term: string, synonym: string): Promise<Raw> =>
  raw('/api/admin/catalog/synonyms', { method: 'POST', token, body: { term, synonym } });

export const listSynonyms = async (token: string): Promise<SynonymRow[]> => {
  const r = await raw('/api/admin/catalog/synonyms', { token });
  if (!r.ok) throw new Error(`synonyms -> ${r.status}`);
  return r.data as SynonymRow[];
};

export const synonymProducts = async (token: string, id: number): Promise<{ productId: number; name: string }[]> => {
  const r = await raw(`/api/admin/catalog/synonyms/${id}/products`, { token });
  if (!r.ok) throw new Error(`synonyms/${id}/products -> ${r.status}`);
  return r.data as { productId: number; name: string }[];
};

export const deleteSynonym = (token: string, id: number): Promise<Raw> =>
  raw(`/api/admin/catalog/synonyms/${id}`, { method: 'DELETE', token });

export const createProduct = (token: string, body: Record<string, unknown>): Promise<Raw> =>
  raw('/api/admin/catalog/products', { method: 'POST', token, body });

/// Buscador PÚBLICO del consumidor — la vara contra la que se valida el
/// conteo de los sinónimos y la visibilidad de lo curado.
export const search = async (text: string): Promise<{ id: number; name: string }[]> => {
  const r = await raw(`/api/products/search?q=${encodeURIComponent(text)}&limit=20`);
  if (!r.ok) throw new Error(`search -> ${r.status}`);
  return r.data as { id: number; name: string }[];
};

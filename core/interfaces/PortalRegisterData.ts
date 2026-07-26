import type { RegField } from '../../src/pages/PortalRegisterPage';

/**
 * Datos de prueba del registro de comercio del portal de PriceList.
 * Cada caso negativo sobreescribe UN campo de la base válida con un valor malo
 * y declara qué campo debe mostrar error y con qué mensaje.
 */
export interface PortalRegisterData {
  id: string;
  /** Sobreescrituras sobre la base válida (campo → valor). */
  fields: Partial<Record<RegField, string>>;
  /** Campo cuyo mensaje de error se verifica. */
  expectField: RegField;
  /** Mensaje de error esperado, exacto. */
  expectedError: string;
}

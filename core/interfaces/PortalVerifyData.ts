import type { VerifyField } from '../../src/pages/PortalVerifyPage';

/**
 * Datos de prueba de la pantalla "Confirma tu correo" del portal. Cada caso
 * negativo sobreescribe un campo de la base válida y declara qué campo debe
 * mostrar error y con qué mensaje.
 */
export interface PortalVerifyData {
  id: string;
  fields: Partial<Record<VerifyField, string>>;
  expectField: VerifyField;
  expectedError: string;
}

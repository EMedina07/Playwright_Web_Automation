import type { LoginField } from '../../src/pages/PortalLoginPage';

/**
 * Datos de prueba del login del portal de comercios de PriceList.
 * Cada caso negativo sobreescribe un campo de la base válida y declara qué
 * campo debe mostrar error y con qué mensaje.
 */
export interface PortalLoginData {
  id: string;
  fields: Partial<Record<LoginField, string>>;
  expectField: LoginField;
  expectedError: string;
}

/**
 * Datos de prueba del login del back-office de PriceList.
 * La credencial es un email (no un username).
 */
export interface BackofficeLoginData {
  id: string;
  email: string;
  password: string;
  /** Mensaje esperado bajo el campo email (validación de cliente). */
  expectedEmailError?: string;
  /** Mensaje esperado bajo el campo contraseña (validación de cliente). */
  expectedPasswordError?: string;
  /** Mensaje esperado en el error general del formulario (respuesta del servidor). */
  expectedFormError?: string;
  /** Secreto TOTP (base32) del admin, para automatizar el 2FA obligatorio. */
  totpSecret?: string;
}

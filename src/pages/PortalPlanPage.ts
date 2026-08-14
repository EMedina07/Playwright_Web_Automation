import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';
import { generateTotp } from '../../core/framework_actions/TotpGenerator';

/**
 * Pestañas "Plan" y "Facturación" del portal del comercio: cotización del
 * precio Pro por escala de sucursales, activación con la tarjeta en archivo y
 * el historial de pagos que el comercio ve de su lado (la contraparte del
 * ledger del back-office). Los montos se devuelven como NÚMEROS: el portal
 * formatea sin decimales (RD$3,600) y el back-office con dos (RD$3,600.00) —
 * comparar texto entre pantallas es un falso rojo garantizado.
 */
export class PortalPlanPage extends PageHelpers {
  private readonly loginEmail: Locator;
  private readonly loginPassword: Locator;
  private readonly loginSubmit: Locator;
  private readonly mfaCode: Locator;
  private readonly mfaSubmit: Locator;
  private readonly tabPlan: Locator;
  private readonly tabFacturacion: Locator;
  private readonly precioCotizado: Locator;
  private readonly botonTarjetaEnArchivo: Locator;
  private readonly tarjetaPlanPro: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.loginEmail = page.getByTestId('login-email');
    this.loginPassword = page.getByTestId('login-password');
    this.loginSubmit = page.getByTestId('login-submit');
    this.mfaCode = page.getByTestId('mfa-code');
    this.mfaSubmit = page.getByTestId('mfa-submit');
    this.tabPlan = page.locator('nav.tabs').getByRole('button', { name: 'Plan', exact: true });
    this.tabFacturacion = page.locator('nav.tabs').getByRole('button', { name: 'Facturación', exact: true });
    this.precioCotizado = page.getByText(/Tu precio:/);
    this.botonTarjetaEnArchivo = page.getByRole('button', { name: /Usar tarjeta en archivo/ });
    this.tarjetaPlanPro = page.locator('.card').filter({ hasText: 'Plan Pro' });
  }

  /// Login del comercio con su MFA ya enrolado (el TOTP se genera del secreto).
  async entrar(email: string, password: string, totpSecret: string): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.loginEmail);
    await this.fillField(this.loginEmail, email, 'Correo del comercio');
    await this.fillField(this.loginPassword, password, 'Contraseña', true);
    await this.clickElement(this.loginSubmit, 'botón Entrar');
    await this.waitForLocator(this.mfaCode);
    await this.fillField(this.mfaCode, generateTotp(totpSecret), 'Código 2FA');
    await this.clickElement(this.mfaSubmit, 'botón Confirmar y entrar');
    await this.waitForLocator(this.tabPlan);
  }

  /// Vuelve al portal reutilizando la sesión viva de sessionStorage — para
  /// flujos que en el medio navegaron al back-office (misma pestaña).
  async volverAlPortal(): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.tabPlan);
  }

  async abrirPlan(): Promise<void> {
    await this.clickElement(this.tabPlan, 'pestaña Plan');
    await this.waitForLocator(this.tarjetaPlanPro);
  }

  /// El monto mensual que el portal cotiza ("Tu precio: RD$X/mes (...)").
  async precioMensualCotizado(): Promise<number> {
    await this.waitForLocator(this.precioCotizado);
    const texto = (await this.precioCotizado.textContent()) ?? '';
    await this.captureCurrentState('ASSERT', `Cotización visible: "${texto.trim()}"`, 'Tu precio');
    const monto = /RD\$([\d.,]+)\/mes/.exec(texto)?.[1];
    if (!monto) throw new Error(`No se pudo leer el precio cotizado de: "${texto}"`);
    return Number(monto.replace(/,/g, ''));
  }

  /// La insignia "Activo" de la tarjeta del plan (tras activar aparece más de
  /// una "Activo" en la tarjeta — la del encabezado basta y sobra).
  private get badgeActivo(): Locator {
    return this.tarjetaPlanPro.locator('.badge', { hasText: 'Activo' }).first();
  }

  /// Activa Pro con la tarjeta guardada y espera la confirmación en pantalla.
  async activarProConTarjetaEnArchivo(): Promise<void> {
    await this.clickElement(this.botonTarjetaEnArchivo, 'Usar tarjeta en archivo');
    await this.badgeActivo.waitFor({ state: 'visible', timeout: 20_000 });
  }

  async proEstaActivo(): Promise<boolean> {
    await this.captureCurrentState('ASSERT', 'El plan Pro figura Activo en el portal', 'badge Activo');
    return this.badgeActivo.isVisible();
  }

  /// La baja del comercio: clic en "Volver al plan Gratis" — ESTE es el único
  /// origen de una suscripción Canceled (decisión del dueño: el admin no
  /// asigna ni remueve planes). Espera a que la pantalla vuelva al estado
  /// "sin Pro" (reaparece "Cambiar a Pro").
  async volverAGratis(): Promise<void> {
    await this.clickElement(this.page.getByRole('button', { name: 'Volver al plan Gratis' }), 'Volver al plan Gratis');
    await this.page.getByRole('button', { name: 'Cambiar a Pro', exact: true })
      .waitFor({ state: 'visible', timeout: 20_000 });
  }

  /// Doble clic rápido en "Usar tarjeta en archivo": el segundo clic no debe
  /// generar un segundo cobro (el botón queda busy/deshabilitado).
  async activarProConDobleClic(): Promise<void> {
    await this.clickElement(this.botonTarjetaEnArchivo, 'Usar tarjeta en archivo (1er clic)');
    await this.botonTarjetaEnArchivo.click({ timeout: 1_500 }).catch(() => undefined);
    await this.badgeActivo.waitFor({ state: 'visible', timeout: 20_000 });
  }

  async hayBotonTarjetaEnArchivo(): Promise<boolean> {
    await this.captureCurrentState('ASSERT', '¿Existe "Usar tarjeta en archivo"?', 'botón tarjeta en archivo');
    return (await this.botonTarjetaEnArchivo.count()) > 0;
  }

  /// "Cambiar a Pro" debe abrir el formulario de tarjeta (no cobrar directo).
  async cambiarAProAbreFormularioDeTarjeta(): Promise<void> {
    await this.clickElement(this.page.getByRole('button', { name: 'Cambiar a Pro', exact: true }), 'Cambiar a Pro');
    await this.waitForLocator(this.page.getByPlaceholder('Número de la tarjeta'));
  }

  /// Tramo negociado: el portal avisa y el botón de activar queda inhabilitado.
  async avisaPrecioNegociadoYNoDejaActivar(): Promise<boolean> {
    await this.waitForLocator(this.page.locator('.callout', { hasText: 'negociado' }));
    const boton = this.page.getByRole('button', { name: 'Cambiar a Pro', exact: true });
    await this.captureCurrentState('ASSERT', 'Aviso de precio negociado con "Cambiar a Pro" inhabilitado', 'callout negociado');
    return boton.isDisabled();
  }

  /// Última fila del "Historial de pagos" de Facturación: monto y estado.
  async ultimoPago(): Promise<{ monto: number; estado: string }> {
    await this.clickElement(this.tabFacturacion, 'pestaña Facturación');
    // El "Historial de pagos" comparte encabezados con el de facturas — lo
    // distingue que la tabla de facturas trae la columna extra "e-CF".
    const tabla = this.page.locator('table')
      .filter({ has: this.page.getByRole('columnheader', { name: 'Concepto' }) })
      .filter({ hasNot: this.page.getByRole('columnheader', { name: 'e-CF' }) });
    const fila = tabla.locator('tbody tr').first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const celdas = await fila.locator('td').allTextContents();
    await this.captureCurrentState('ASSERT', `Último pago del portal: ${JSON.stringify(celdas)}`, 'Historial de pagos fila 1');
    // Fecha | Concepto | Monto | Estado
    const monto = Number((/([\d.,]+)/.exec(celdas[2] ?? '')?.[1] ?? '').replace(/,/g, ''));
    return { monto, estado: celdas[3]?.trim() ?? '' };
  }
}

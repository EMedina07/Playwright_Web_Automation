import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';
import { waitForEmailCode } from '../../core/framework_actions/DevMailReader';

/**
 * Flujo de RECUPERACIÓN de verificación de correo del portal:
 *   registrar → "cerrar" la pantalla (volver al login) → reabrir confirmación
 *   desde el login → reenviar código → leerlo del log → verificar → volver al
 *   login confirmado. Reproduce el caso "cerré sin poner los 6 dígitos".
 */
export class PortalRecoveryPage extends PageHelpers {
  private readonly goRegister: Locator;
  private readonly registerHeading: Locator;
  private readonly regSubmit: Locator;
  private readonly loginEmail: Locator;
  private readonly loginNotice: Locator;
  private readonly goVerify: Locator;
  private readonly verifyHeading: Locator;
  private readonly verifyEmailInput: Locator;
  private readonly verifyCode: Locator;
  private readonly verifySubmit: Locator;
  private readonly resendBtn: Locator;
  private readonly verifyNotice: Locator;
  private readonly verifyBack: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.goRegister = page.getByTestId('go-register');
    this.registerHeading = page.getByTestId('register-heading');
    this.regSubmit = page.getByTestId('reg-submit');
    this.loginEmail = page.getByTestId('login-email');
    this.loginNotice = page.getByTestId('login-notice');
    this.goVerify = page.getByTestId('go-verify');
    this.verifyHeading = page.getByTestId('verify-email-heading');
    this.verifyEmailInput = page.getByTestId('verify-email-input');
    this.verifyCode = page.getByTestId('verify-code');
    this.verifySubmit = page.getByTestId('verify-submit');
    this.resendBtn = page.getByTestId('resend-code');
    this.verifyNotice = page.getByTestId('verify-notice');
    this.verifyBack = page.getByTestId('verify-back');
  }

  // Registra un comercio con datos válidos y correo/RNC únicos → pantalla de
  // confirmación de correo (sin ingresar el código todavía).
  async registerComercio(email: string, taxId: string): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.goRegister);
    await this.clickElement(this.goRegister, 'enlace "Registra tu comercio"');
    await this.waitForLocator(this.registerHeading);
    const fill = async (field: string, value: string, secret = false) =>
      this.fillField(this.page.getByTestId(`reg-${field}`), value, `campo ${field}`, secret);
    await fill('name', 'Comercio Recuperacion');
    await fill('legalName', 'Recuperacion Comercial SRL');
    await fill('email', email);
    await fill('phone', '(809)-555-0199');
    await fill('address', 'Av. Recuperación 123, Santo Domingo');
    await fill('taxId', taxId);
    await fill('password', 'Comercio#Recup2026', true);
    await this.clickElement(this.regSubmit, 'botón Crear mi cuenta');
    await this.waitForLocator(this.verifyHeading);
  }

  // Simula "cerrar" la pantalla sin poner el código: vuelve al login.
  async closeWithoutVerifying(): Promise<void> {
    await this.clickElement(this.verifyBack, 'botón Volver a iniciar sesión');
    await this.waitForLocator(this.loginEmail);
  }

  // Desde el login, reabre la confirmación de correo.
  async reopenVerifyFromLogin(): Promise<void> {
    await this.clickElement(this.goVerify, 'enlace "Confírmalo aquí"');
    await this.waitForLocator(this.verifyHeading);
  }

  async setVerifyEmail(email: string): Promise<void> {
    await this.fillField(this.verifyEmailInput, email, 'Correo del comercio (confirmación)');
  }

  async clickResend(): Promise<void> {
    await this.clickElement(this.resendBtn, 'botón Reenviar código');
  }

  async assertResendNotice(expected: string): Promise<void> {
    await this.assertLocatorText(this.verifyNotice, expected, 'Verifica el aviso de reenvío de código', 15_000);
  }

  // Lee del log el código reenviado y lo ingresa + confirma.
  async enterResentCodeAndConfirm(email: string): Promise<void> {
    const code = await waitForEmailCode(email);
    if (!code) throw new Error(`No apareció un código de verificación para ${email} en el log del backend.`);
    await this.fillField(this.verifyCode, code, 'Código de 6 dígitos');
    await this.clickElement(this.verifySubmit, 'botón Confirmar');
  }

  // Tras verificar, el portal vuelve al login con el aviso de éxito.
  async assertConfirmedAtLogin(): Promise<void> {
    await this.assertLocatorText(
      this.loginNotice,
      '¡Correo confirmado! Si tu solicitud ya fue aprobada, entra con tu contraseña.',
      'Verifica que el correo quedó confirmado y volvió al login',
      15_000,
    );
  }
}

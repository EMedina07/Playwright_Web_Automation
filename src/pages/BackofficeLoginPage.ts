import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import { generateTotp } from '../../core/framework_actions/TotpGenerator';

// El back-office sirve el login en la raíz (SPA de Vite); no hay ruta /auth.
const LOGIN_PATH = '/';

export class BackofficeLoginPage extends PageHelpers {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly emailError: Locator;
  private readonly passwordError: Locator;
  private readonly formError: Locator;
  private readonly mfaHeading: Locator;
  private readonly mfaCode: Locator;
  private readonly mfaSubmit: Locator;
  private readonly adminName: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.loginButton = page.getByTestId('login-submit');
    this.emailError = page.getByTestId('login-email-error');
    this.passwordError = page.getByTestId('login-password-error');
    this.formError = page.getByTestId('login-form-error');
    this.mfaHeading = page.getByTestId('mfa-heading');
    this.mfaCode = page.getByTestId('mfa-code');
    this.mfaSubmit = page.getByTestId('mfa-submit');
    this.adminName = page.getByTestId('admin-name');
  }

  async navigateTo(): Promise<void> {
    await this.navigateAndCapture(LOGIN_PATH, this.loginButton, 'Página de login del back-office cargada');
  }

  async fillEmail(value: string): Promise<void> {
    await this.fillField(this.emailInput, value, 'Correo del admin');
  }

  async fillPassword(value: string): Promise<void> {
    await this.fillField(this.passwordInput, value, 'Contraseña', true);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.loginButton, 'botón Entrar');
  }

  async assertEmailFieldError(expected: string): Promise<void> {
    await this.assertLocatorText(this.emailError, expected, `Verifica error de email: "${expected}"`);
  }

  async assertPasswordFieldError(expected: string): Promise<void> {
    await this.assertLocatorText(this.passwordError, expected, `Verifica error de contraseña: "${expected}"`);
  }

  async assertFormError(expected: string): Promise<void> {
    await this.assertLocatorText(this.formError, expected, `Verifica error del formulario: "${expected}"`, 30_000);
  }

  async assertReachedMfaSetup(): Promise<void> {
    await this.assertLocatorText(
      this.mfaHeading,
      'Verificación en dos pasos',
      'Verifica que credenciales válidas avanzan al paso de MFA (2FA obligatorio)',
      30_000,
    );
  }

  async assertXssNotExecuted(expectedEmailError: string): Promise<void> {
    // El payload se rechaza en el cliente por formato inválido y nunca se ejecuta.
    await this.assertXssPayloadBlocked(this.emailError, expectedEmailError, 'Verifica que el payload no se ejecutó');
  }

  // Completa el MFA (2FA obligatorio) derivando el código de 6 dígitos del
  // secreto TOTP enrolado, y confirma para entrar al back-office.
  async completeMfa(totpSecret: string): Promise<void> {
    const code = generateTotp(totpSecret);
    await this.fillField(this.mfaCode, code, 'Código de verificación (2FA)');
    await this.clickElement(this.mfaSubmit, 'botón Confirmar y entrar');
  }

  // Verifica que el admin entró: el nombre/correo del admin aparece en la barra.
  async assertReachedBackoffice(expectedEmail: string): Promise<void> {
    await this.assertLocatorText(
      this.adminName,
      expectedEmail,
      `Verifica que el admin entró al back-office (${expectedEmail})`,
      30_000,
    );
  }
}

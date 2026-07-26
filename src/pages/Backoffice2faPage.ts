import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

/**
 * Pantalla "Verificación en dos pasos" (2FA) del back-office. Se alcanza tras
 * enviar correo+contraseña correctos del admin (el servidor pide el código y la
 * UI muestra el campo). Valida en cliente que el código sea de 6 dígitos
 * numéricos — los inválidos se atrapan sin llegar al servidor (no consume TOTP).
 */
export class Backoffice2faPage extends PageHelpers {
  private readonly loginEmail: Locator;
  private readonly loginPassword: Locator;
  private readonly loginSubmit: Locator;
  private readonly mfaCode: Locator;
  private readonly mfaSubmit: Locator;
  private readonly mfaCodeError: Locator;

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
    this.mfaCodeError = page.getByTestId('mfa-code-error');
  }

  // Entra con el correo+contraseña del admin y llega a la pantalla de 2FA.
  async loginToTwoFactor(email: string, password: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.waitForLocator(this.loginEmail);
    await this.fillField(this.loginEmail, email, 'Correo del admin');
    await this.fillField(this.loginPassword, password, 'Contraseña', true);
    await this.clickElement(this.loginSubmit, 'botón Entrar');
    await this.waitForLocator(this.mfaCode);
  }

  // Ingresa un código, confirma y verifica el mensaje de error esperado.
  async assertCodeRejected(code: string, expectedError: string): Promise<void> {
    await this.mfaCode.fill(''); // limpia el intento anterior
    if (code !== '') await this.fillField(this.mfaCode, code, 'Código 2FA');
    await this.clickElement(this.mfaSubmit, 'botón Confirmar y entrar');
    await this.assertLocatorText(this.mfaCodeError, expectedError, `Verifica el error del código 2FA: "${expectedError}"`);
  }
}

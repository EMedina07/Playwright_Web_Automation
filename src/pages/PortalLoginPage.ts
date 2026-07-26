import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

export type LoginField = 'email' | 'password';

export class PortalLoginPage extends PageHelpers {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submit: Locator;
  private readonly emailError: Locator;
  private readonly passwordError: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submit = page.getByTestId('login-submit');
    this.emailError = page.getByTestId('login-email-error');
    this.passwordError = page.getByTestId('login-password-error');
  }

  // El portal abre en la pantalla de login por defecto.
  async navigateTo(): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.emailInput);
  }

  async fillEmail(value: string): Promise<void> {
    if (value !== '') await this.fillField(this.emailInput, value, 'Correo del comercio');
  }

  async fillPassword(value: string): Promise<void> {
    if (value !== '') await this.fillField(this.passwordInput, value, 'Contraseña', true);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.submit, 'botón Entrar');
  }

  async assertFieldError(field: LoginField, expected: string): Promise<void> {
    const locator = field === 'email' ? this.emailError : this.passwordError;
    await this.assertLocatorText(locator, expected, `Verifica el error del campo ${field}: "${expected}"`);
  }
}

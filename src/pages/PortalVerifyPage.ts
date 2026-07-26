import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

export type VerifyField = 'email' | 'code';

/**
 * Pantalla "Confirma tu correo" del portal. Se alcanza desde el login por el
 * enlace "¿Ya te registraste y no confirmaste tu correo?". Valida en cliente el
 * correo (mismas reglas del registro) y el código (6 dígitos numéricos).
 */
export class PortalVerifyPage extends PageHelpers {
  private readonly goVerify: Locator;
  private readonly heading: Locator;
  private readonly emailInput: Locator;
  private readonly codeInput: Locator;
  private readonly submit: Locator;
  private readonly emailError: Locator;
  private readonly codeError: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.goVerify = page.getByTestId('go-verify');
    this.heading = page.getByTestId('verify-email-heading');
    this.emailInput = page.getByTestId('verify-email-input');
    this.codeInput = page.getByTestId('verify-code');
    this.submit = page.getByTestId('verify-submit');
    this.emailError = page.getByTestId('verify-email-error');
    this.codeError = page.getByTestId('verify-code-error');
  }

  async navigateToVerify(): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.goVerify);
    await this.clickElement(this.goVerify, 'enlace "¿Ya te registraste y no confirmaste tu correo?"');
    await this.waitForLocator(this.heading);
  }

  async fillEmail(value: string): Promise<void> {
    if (value !== '') await this.fillField(this.emailInput, value, 'Correo del comercio (confirmación)');
  }

  async fillCode(value: string): Promise<void> {
    if (value !== '') await this.fillField(this.codeInput, value, 'Código de 6 dígitos');
  }

  async clickConfirm(): Promise<void> {
    await this.clickElement(this.submit, 'botón Confirmar');
  }

  async assertFieldError(field: VerifyField, expected: string): Promise<void> {
    const locator = field === 'email' ? this.emailError : this.codeError;
    await this.assertLocatorText(locator, expected, `Verifica el error del campo ${field}: "${expected}"`);
  }
}

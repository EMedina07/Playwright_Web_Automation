import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

// Campos del formulario "Registrar mi comercio" y sus data-testid.
export type RegField = 'name' | 'legalName' | 'email' | 'phone' | 'address' | 'taxId' | 'password';

export class PortalRegisterPage extends PageHelpers {
  private readonly goRegister: Locator;
  private readonly registerHeading: Locator;
  private readonly verifyEmailHeading: Locator;
  private readonly submit: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.goRegister = page.getByTestId('go-register');
    this.registerHeading = page.getByTestId('register-heading');
    this.verifyEmailHeading = page.getByTestId('verify-email-heading');
    this.submit = page.getByTestId('reg-submit');
  }

  private input(field: RegField): Locator {
    return this.page.getByTestId(`reg-${field}`);
  }

  private fieldError(field: RegField): Locator {
    return this.page.getByTestId(`reg-${field}-error`);
  }

  // Abre el portal y cambia al formulario de registro de comercio.
  async navigateToRegister(): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.goRegister);
    await this.clickElement(this.goRegister, 'enlace "Registra tu comercio"');
    await this.waitForLocator(this.registerHeading);
  }

  async fill(field: RegField, value: string): Promise<void> {
    await this.fillField(this.input(field), value, `campo ${field}`, field === 'password');
  }

  // Llena todos los campos con los valores dados (los ausentes se dejan vacíos).
  async fillAll(data: Partial<Record<RegField, string>>): Promise<void> {
    const fields: RegField[] = ['name', 'legalName', 'email', 'phone', 'address', 'taxId', 'password'];
    for (const f of fields) {
      const v = data[f];
      if (v !== undefined && v !== '') await this.fill(f, v);
    }
  }

  async clickCreate(): Promise<void> {
    await this.clickElement(this.submit, 'botón Crear mi cuenta');
  }

  async assertFieldError(field: RegField, expected: string): Promise<void> {
    await this.assertLocatorText(
      this.fieldError(field),
      expected,
      `Verifica el error del campo ${field}: "${expected}"`,
    );
  }

  // Happy path: un registro válido avanza a "Confirma tu correo".
  async assertReachedVerifyEmail(): Promise<void> {
    await this.assertLocatorText(
      this.verifyEmailHeading,
      'Confirma tu correo',
      'Verifica que un registro válido avanza a la confirmación de correo',
      30_000,
    );
  }
}

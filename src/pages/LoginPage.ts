import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';

const LOGIN_PATH = '/web/index.php/auth/login';
const DASHBOARD_PATH = '/web/index.php/dashboard/index';
const DASHBOARD_URL_FRAGMENT = '**/dashboard/index';

export class LoginPage extends PageHelpers {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly fieldErrorMessages: Locator;
  private readonly credentialsError: Locator;
  private readonly sidebarMenu: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.usernameInput = page.getByPlaceholder('Username');
    this.passwordInput = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.fieldErrorMessages = page.locator('.oxd-input-field-error-message');
    this.credentialsError = page.locator('.orangehrm-login-error');
    this.sidebarMenu = page.locator('div.oxd-main-menu');
  }

  async navigateTo(): Promise<void> {
    await this.navigateAndCapture(LOGIN_PATH, this.loginButton, 'Página de login cargada');
  }

  async fillUsername(value: string): Promise<void> {
    await this.fillField(this.usernameInput, value, 'Username');
  }

  async fillPassword(value: string): Promise<void> {
    await this.fillField(this.passwordInput, value, 'Password', true);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.loginButton, 'botón Login');
  }

  async assertOnDashboard(): Promise<void> {
    await this.assertUrlMatchesWithElement(
      DASHBOARD_URL_FRAGMENT,
      this.sidebarMenu,
      'Verifica redirección al dashboard',
    );
  }

  async assertOnLoginPage(): Promise<void> {
    await this.assertUrlContains('/auth/login', this.loginButton, 'Verifica que el sistema redirigió a la página de login');
  }

  async assertFieldRequired(): Promise<void> {
    await this.assertAllTextsEqual(this.fieldErrorMessages, 'Required', 'Verifica mensajes "Required" en campos obligatorios vacíos');
  }

  async assertInvalidCredentialsError(): Promise<void> {
    await this.assertLocatorText(this.credentialsError, 'Invalid credentials', 'Verifica error "Invalid credentials"', 30_000);
  }

  async assertXssNotExecuted(): Promise<void> {
    await this.assertXssPayloadBlocked(this.credentialsError, 'Invalid credentials', 'Verifica que el payload XSS no se ejecutó en la página');
  }

  async attemptDirectDashboardAccess(): Promise<void> {
    await this.navigateAndWaitForRedirect(
      DASHBOARD_PATH,
      /\/(dashboard|auth\/login)/,
      'Intenta acceder al dashboard sin autenticación',
    );
  }

  async loginWithTiming(username: string, password: string): Promise<number> {
    await this.fillUsername(username);
    await this.fillPassword(password);
    const start = Date.now();
    await this.clickLogin();
    await this.assertOnDashboard();
    return Date.now() - start;
  }
}

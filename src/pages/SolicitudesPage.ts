import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';
import { VendorInput } from '../../core/framework_actions/VendorData';
import { waitForEmailCode } from '../../core/framework_actions/DevMailReader';

const API_URL = process.env.API_URL ?? 'http://localhost:5265';

type Filter = 'pending' | 'approved' | 'rejected';

/**
 * Módulo "Solicitudes" del back-office. Registra un comercio en el PORTAL
 * (capturando su vendorId), entra al back-office con sesión de admin inyectada,
 * valida que TODOS los datos mostrados coincidan con lo registrado, y aprueba o
 * rechaza la solicitud verificando la transición de estado.
 */
export class SolicitudesPage extends PageHelpers {
  private readonly goRegister: Locator;
  private readonly registerHeading: Locator;
  private readonly regSubmit: Locator;
  private readonly adminName: Locator;

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
    this.adminName = page.getByTestId('admin-name');
  }

  // ── Registro en el PORTAL (captura el vendorId de la respuesta) ────────────
  async registerOnPortal(data: VendorInput): Promise<number> {
    await this.navigate(environments.portalURL);
    await this.waitForLocator(this.goRegister);
    await this.clickElement(this.goRegister, 'enlace "Registra tu comercio"');
    await this.waitForLocator(this.registerHeading);
    const fill = (field: string, value: string, secret = false) =>
      this.fillField(this.page.getByTestId(`reg-${field}`), value, `campo ${field}`, secret);
    await fill('name', data.name);
    await fill('legalName', data.legalName);
    await fill('email', data.email);
    await fill('phone', data.phoneInput);
    await fill('address', data.address);
    await fill('taxId', data.taxId);
    await fill('password', data.password, true);

    const [resp] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/api/vendors/register') && r.request().method() === 'POST',
      ),
      this.clickElement(this.regSubmit, 'botón Crear mi cuenta'),
    ]);
    const body = await resp.json();
    if (!body?.vendorId) throw new Error('El registro no devolvió vendorId.');
    return body.vendorId as number;
  }

  // El comercio verifica su correo (lee el código del log dev y llama al API).
  // Requisito para que el admin pueda APROBAR la solicitud.
  async verifyVendorEmail(email: string): Promise<void> {
    const code = await waitForEmailCode(email);
    if (!code) throw new Error(`No apareció código de verificación para ${email} en el log.`);
    const res = await fetch(`${API_URL}/api/vendors/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) throw new Error(`verify-email falló: ${res.status} ${(await res.text()).slice(0, 80)}`);
  }

  // ── Entrar al back-office con sesión de admin inyectada ────────────────────
  async openBackofficeAsAdmin(token: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.adminToken', t), token);
    await this.page.reload();
    // La pestaña por defecto tras el login ahora es "Ingresos" (decisión del
    // dueño): Solicitudes se abre explícitamente.
    await this.clickElement(this.page.getByRole('button', { name: 'Solicitudes' }), 'pestaña Solicitudes');
    await this.waitForLocator(this.adminName);
  }

  async selectFilter(filter: Filter): Promise<void> {
    await this.clickElement(this.page.getByTestId(`filter-${filter}`), `filtro ${filter}`);
  }

  // Valida que CADA dato mostrado coincida con lo registrado.
  async assertMatches(vendorId: number, data: VendorInput): Promise<void> {
    const card = this.page.getByTestId(`app-${vendorId}`);
    await this.waitForLocator(card);
    const checks: [string, string][] = [
      ['name', data.name],
      ['legalName', data.legalName],
      ['email', data.email],
      ['phone', data.phoneDisplay],
      ['taxId', data.taxId],
      ['address', data.address],
    ];
    for (const [field, expected] of checks) {
      await this.assertLocatorText(
        this.page.getByTestId(`app-${vendorId}-${field}`),
        expected,
        `Solicitud ${vendorId}: el campo ${field} coincide con lo registrado ("${expected}")`,
      );
    }
  }

  async approve(vendorId: number): Promise<void> {
    await this.clickElement(this.page.getByTestId(`app-${vendorId}-approve`), 'botón Aprobar');
  }

  async rejectWith(vendorId: number, reason: string): Promise<void> {
    await this.clickElement(this.page.getByTestId(`app-${vendorId}-reject`), 'botón Rechazar');
    await this.fillField(this.page.getByTestId('reason-input'), reason, 'Motivo del rechazo');
    await this.clickElement(this.page.getByTestId('reason-confirm'), 'botón Rechazar (confirmar)');
  }

  // Verifica que la solicitud está en el filtro dado (transición de estado).
  async assertInFilter(vendorId: number, filter: Filter): Promise<void> {
    await this.selectFilter(filter);
    await this.waitForLocator(this.page.getByTestId(`app-${vendorId}`));
  }

  // Verifica que ya NO está en Pendientes.
  async assertNotPending(vendorId: number): Promise<void> {
    await this.selectFilter('pending');
    await this.page.getByTestId(`app-${vendorId}`).waitFor({ state: 'detached', timeout: 15_000 })
      .catch(async () => {
        // Si no llegó a existir en el DOM, también es válido (no está).
        const count = await this.page.getByTestId(`app-${vendorId}`).count();
        if (count > 0) throw new Error(`La solicitud ${vendorId} sigue en Pendientes.`);
      });
  }
}

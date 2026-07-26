import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

/**
 * Pantalla "Confianza de los comercios" del back-office. Sin data-testid en la
 * pantalla (por decisión): se localiza por texto/rol. La tabla lista solo los
 * comercios CON reportes en la ventana; al reactivar (ciclo limpio) el comercio
 * desaparece de la lista. La pantalla se auto-refresca cada ~2 s, así que las
 * esperas por estado toleran ese retraso de forma natural.
 */
export class ConfianzaPage extends PageHelpers {
  private readonly heading: Locator;

  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }, recordStep?: (r: StepRecord) => void) {
    super(page, attachFn, stepCounter, recordStep);
    this.heading = page.getByRole('heading', { name: 'Confianza de los comercios' });
  }

  // Tabla de la LISTA (la primera .table; la del detalle viene después).
  private listTable(): Locator {
    return this.page.locator('table.table').first();
  }

  private row(name: string): Locator {
    return this.listTable().locator('tbody tr').filter({ hasText: name });
  }

  async openAsAdmin(token: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.adminToken', t), token);
    await this.page.reload();
    await this.clickElement(this.page.getByRole('button', { name: 'Confianza' }), 'pestaña Confianza');
    await this.waitForLocator(this.heading);
  }

  // Espera (tolerando el auto-refresco) a que el comercio aparezca con el estado.
  async waitForStatus(name: string, status: 'Active' | 'Suspended', timeout = 20_000): Promise<void> {
    const target = this.row(name).filter({ hasText: status }).first();
    await this.captureCurrentState('ASSERT', `El comercio "${name}" aparece con estado ${status} en la lista`, `row(${name}).filter(${status}).waitFor(visible)`);
    await target.waitFor({ state: 'visible', timeout });
  }

  // Espera a que el comercio DESAPAREZCA de la lista (ciclo limpio tras reactivar).
  async waitForAbsent(name: string, timeout = 20_000): Promise<void> {
    await this.captureCurrentState('ASSERT', `El comercio "${name}" ya NO aparece en la lista (0 reportes)`, `row(${name}).waitFor(count==0)`);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if ((await this.row(name).count()) === 0) return;
      await this.page.waitForTimeout(500);
    }
    throw new Error(`El comercio "${name}" sigue en la lista de confianza tras el tiempo de espera.`);
  }

  async openDetail(name: string): Promise<void> {
    await this.clickElement(this.row(name).getByRole('button', { name: 'Ver detalle' }), `Ver detalle de "${name}"`);
    await this.waitForLocator(this.page.getByRole('heading', { name, level: 2 }));
  }

  // Lee "N reportes de M clientes distintos" del detalle abierto.
  async detailReporters(): Promise<{ reports: number; reporters: number }> {
    const hint = this.page.getByText(/reportes de .* clientes distintos/);
    await this.waitForLocator(hint);
    const text = (await hint.textContent()) ?? '';
    const m = text.match(/(\d+)\s+reportes de\s+(\d+)\s+clientes distintos/);
    return { reports: Number(m?.[1] ?? -1), reporters: Number(m?.[2] ?? -1) };
  }

  async suspendFromDetail(reason: string): Promise<void> {
    await this.clickElement(this.page.getByRole('button', { name: 'Suspender' }), 'botón Suspender (detalle)');
    await this.fillField(this.page.getByTestId('reason-input'), reason, 'Motivo de la suspensión');
    await this.clickElement(this.page.getByTestId('reason-confirm'), 'botón Suspender (confirmar)');
  }

  async reactivateFromDetail(): Promise<void> {
    await this.clickElement(this.page.getByRole('button', { name: 'Reactivar' }), 'botón Reactivar (detalle)');
  }

  // El aviso de error ("El comercio ya está activo") se muestra y se auto-descarta.
  async errorVisible(text: string): Promise<boolean> {
    return this.page.locator('.error', { hasText: text }).first().isVisible().catch(() => false);
  }
}

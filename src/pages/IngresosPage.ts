import { Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

/**
 * Pantalla "Ingresos" del back-office (la primera tras el login): las 5
 * tarjetas del dashboard + los ingresos cobrados por fuente. Esta página LEE
 * los valores tal como los ve el admin — las recetas del dueño validan que lo
 * que dicen las tarjetas cuadre con las acciones y con la auditoría.
 */
export class IngresosPage extends PageHelpers {
  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }, recordStep?: (r: StepRecord) => void) {
    super(page, attachFn, stepCounter, recordStep);
  }

  async openAsAdmin(token: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.adminToken', t), token);
    await this.page.reload();
    await this.clickElement(this.page.getByRole('button', { name: 'Ingresos' }), 'pestaña Ingresos');
    await this.waitForLocator(this.page.getByRole('heading', { name: 'Ingresos', exact: true }));
  }

  /// "RD$2,000.00" | "RD$2,000" | "3" → número.
  private static parse(texto: string): number {
    return Number(texto.replace(/[^\d.]/g, ''));
  }

  async tarjeta(label: string): Promise<number> {
    const stat = this.page.locator('.stat').filter({ hasText: label }).first();
    await stat.waitFor({ state: 'visible', timeout: 15_000 });
    return IngresosPage.parse((await stat.locator('.stat-value').textContent()) ?? '');
  }

  async leerTarjetas(labels: string[]): Promise<Record<string, number>> {
    const foto: Record<string, number> = {};
    for (const label of labels) {
      foto[label] = await this.tarjeta(label);
    }
    await this.captureCurrentState('ASSERT', `Foto de tarjetas: ${JSON.stringify(foto)}`, 'stat-value × labels');
    return foto;
  }

  /// Espera (recargando) a que la tarjeta llegue al valor esperado — cubre el
  /// "en segundos" de la receta: el refresco de la vista se encola tras la
  /// acción y el admin solo recarga la pantalla.
  async esperarTarjeta(label: string, esperado: number, timeoutMs = 30_000): Promise<void> {
    const inicio = Date.now();
    await this.captureCurrentState('ASSERT', `"${label}" debe llegar a ${esperado} en segundos`, 'poll + reload');
    while (Date.now() - inicio < timeoutMs) {
      if ((await this.tarjeta(label)) === esperado) return;
      await this.page.waitForTimeout(1500);
      await this.page.reload();
    }
    const real = await this.tarjeta(label);
    throw new Error(`La tarjeta "${label}" quedó en ${real}; se esperaba ${esperado} (${Math.round(timeoutMs / 1000)} s).`);
  }
}

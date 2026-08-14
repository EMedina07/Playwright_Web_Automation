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

  /// Tarjetas cuyo monto se DESBORDA: recortado dentro del span o pintado
  /// fuera del área útil de la tarjeta. Con montos gigantes el StatValue debe
  /// encoger la letra — esta medición es la prueba de que lo hizo.
  async tarjetasConMontoDesbordado(): Promise<string[]> {
    await this.page.locator('.stat').first().waitFor({ state: 'visible', timeout: 15_000 });
    const desbordadas = await this.page.$$eval('.stat', (cards) =>
      cards.filter((card) => {
        const valor = card.querySelector('.stat-value');
        if (!valor) return false;
        // Desborde = el texto quedó recortado dentro del span, o el span se
        // pinta fuera del rectángulo de su tarjeta.
        const areaTarjeta = card.getBoundingClientRect();
        const areaValor = valor.getBoundingClientRect();
        return valor.scrollWidth > valor.clientWidth + 1
          || areaValor.right > areaTarjeta.right + 1
          || areaValor.left < areaTarjeta.left - 1;
      }).map((card) => card.querySelector('.stat-label')?.textContent?.trim() ?? '(sin etiqueta)'));
    await this.captureCurrentState('ASSERT',
      desbordadas.length === 0 ? 'Ningún monto se sale de su tarjeta' : `Desbordadas: ${desbordadas.join(', ')}`,
      '.stat-value vs área útil de .stat');
    return desbordadas;
  }

  /// Reduce la ventana a un ancho móvil: las tarjetas deben re-encogerse.
  async angostarPantalla(anchoPx: number): Promise<void> {
    await this.page.setViewportSize({ width: anchoPx, height: 800 });
    await this.page.waitForTimeout(300); // deja actuar al ResizeObserver
    await this.captureCurrentState('ACTION', `Pantalla angostada a ${anchoPx}px`, 'viewport');
  }

  /// La fila "en curso" (primera) de la tabla de 12 meses: desde que el dueño
  /// quitó las tarjetas redundantes, el mes corriente se lee AQUÍ.
  async mesEnCurso(): Promise<{ subscriptions: number; advertising: number; total: number }> {
    const fila = this.page.locator('table tbody tr').filter({ hasText: 'en curso' }).first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const celdas = await fila.locator('td').allTextContents();
    // Mes | Suscripciones | Publicidad | Total | barra
    return {
      subscriptions: IngresosPage.parse(celdas[1] ?? ''),
      advertising: IngresosPage.parse(celdas[2] ?? ''),
      total: IngresosPage.parse(celdas[3] ?? ''),
    };
  }

  async esperarMesEnCurso(campo: 'subscriptions' | 'advertising' | 'total', esperado: number, timeoutMs = 30_000): Promise<void> {
    const inicio = Date.now();
    await this.captureCurrentState('ASSERT', `Mes en curso: ${campo} debe llegar a ${esperado}`, 'fila (en curso) + reload');
    while (Date.now() - inicio < timeoutMs) {
      if ((await this.mesEnCurso())[campo] === esperado) return;
      await this.page.waitForTimeout(1500);
      await this.page.reload();
    }
    const real = (await this.mesEnCurso())[campo];
    throw new Error(`El mes en curso quedó con ${campo}=${real}; se esperaba ${esperado}.`);
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

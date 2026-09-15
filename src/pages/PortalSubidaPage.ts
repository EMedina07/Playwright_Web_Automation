import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';

/**
 * Pestañas "Subir Excel" y "Por revisar" del portal del comercio: el editor
 * de mapeo de columnas, la subida del archivo con su resultado de lote, y la
 * cola de revisión con sus acciones. Los .xlsx de prueba son fixtures del
 * repo (src/test/fixtures/excel) — deterministas y versionados.
 */
export class PortalSubidaPage extends PageHelpers {
  private readonly tabSubir: Locator;
  private readonly tabRevision: Locator;
  private readonly toggleMapeo: Locator;
  private readonly botonGuardarMapeo: Locator;
  private readonly inputArchivo: Locator;
  private readonly cargaCompletada: Locator;

  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
    this.tabSubir = page.locator('nav.tabs').getByRole('button', { name: 'Subir Excel', exact: true });
    this.tabRevision = page.locator('nav.tabs').getByRole('button', { name: 'Por revisar', exact: true });
    this.toggleMapeo = page.getByRole('button', { name: /Mi archivo usa otros nombres/ });
    this.botonGuardarMapeo = page.getByRole('button', { name: 'Guardar mapeo', exact: true });
    this.inputArchivo = page.locator('input[type="file"]');
    this.cargaCompletada = page.locator('.callout', { hasText: '¡Carga completada!' });
  }

  async abrirSubirExcel(): Promise<void> {
    await this.clickElement(this.tabSubir, 'pestaña Subir Excel');
    await this.waitForLocator(this.page.getByRole('heading', { name: 'Actualizar precios con Excel' }));
  }

  /// Configura "Mi archivo usa otros nombres": cada input lleva como
  /// placeholder el nombre estándar del campo (sku, precio, …).
  async guardarMapeo(mapeo: Record<string, string>): Promise<void> {
    await this.clickElement(this.toggleMapeo, 'Mi archivo usa otros nombres');
    for (const [campo, encabezado] of Object.entries(mapeo)) {
      await this.fillField(this.page.getByPlaceholder(campo, { exact: true }), encabezado, `mapeo ${campo}`);
    }
    await this.clickElement(this.botonGuardarMapeo, 'Guardar mapeo');
    await this.waitForLocator(this.page.getByText('Mapeo guardado'));
  }

  async subirArchivo(rutaAbsoluta: string): Promise<void> {
    await this.captureCurrentState('ACTION', `Sube ${rutaAbsoluta.split('/').pop()}`, 'input[type=file]');
    await this.inputArchivo.setInputFiles(rutaAbsoluta);
  }

  /// Espera el resultado del lote (el portal sondea el procesamiento en
  /// background hasta ~30 s) y lo devuelve como números.
  async resultadoDeCarga(): Promise<{ publicados: number; enRevision: number }> {
    await this.cargaCompletada.waitFor({ state: 'visible', timeout: 45_000 });
    const texto = (await this.cargaCompletada.innerText()).replace(/\s+/g, ' ');
    await this.captureCurrentState('ASSERT', `Resultado del lote: "${texto}"`, 'callout de carga');
    const publicados = Number(/(\d+) precios publicados/.exec(texto)?.[1] ?? '0');
    const enRevision = Number(/(\d+) productos necesitan tu confirmación/.exec(texto)?.[1] ?? '0');
    return { publicados, enRevision };
  }

  // ── Por revisar ────────────────────────────────────────────────────────────

  async abrirPorRevisar(): Promise<void> {
    await this.clickElement(this.tabRevision, 'pestaña Por revisar');
    await this.waitForLocator(this.page.getByRole('heading', { name: /Por revisar/ }));
  }

  private tarjetaDeItem(sku: string): Locator {
    return this.page.locator('.review-card').filter({ hasText: sku });
  }

  /// La tarjeta del ítem con su motivo visible — la prueba de que lo enviado
  /// a revisión APARECE (el bug era que sin sugerencia desaparecía).
  async itemListadoConMotivo(sku: string, motivo: string): Promise<boolean> {
    const tarjeta = this.tarjetaDeItem(sku).first();
    await tarjeta.waitFor({ state: 'visible', timeout: 15_000 });
    await this.captureCurrentState('ASSERT', `"${sku}" listado en Por revisar`, '.review-card');
    return (await tarjeta.innerText()).includes(motivo);
  }

  async descartarItem(sku: string): Promise<void> {
    const tarjeta = this.tarjetaDeItem(sku).first();
    await this.clickElement(tarjeta.getByRole('button', { name: 'Descartar' }), `Descartar "${sku}"`);
    await tarjeta.waitFor({ state: 'detached', timeout: 15_000 });
  }

  async nadaPendiente(): Promise<void> {
    await this.waitForLocator(this.page.getByText('Nada pendiente'));
    await this.captureCurrentState('ASSERT', 'La cola quedó vacía: "Nada pendiente"', 'estado vacío');
  }
}

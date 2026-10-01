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
    this.tabSubir = page.locator('nav.tabs').getByRole('button', { name: 'Importar productos', exact: true });
    this.tabRevision = page.locator('nav.tabs').getByRole('button', { name: 'Pendientes de revisión', exact: true });
    this.toggleMapeo = page.getByRole('button', { name: /Mi archivo usa otros nombres/ });
    this.botonGuardarMapeo = page.getByRole('button', { name: 'Guardar mapeo', exact: true });
    this.inputArchivo = page.locator('input[type="file"]');
    this.cargaCompletada = page.locator('.callout', { hasText: '¡Carga completada!' });
  }

  async abrirSubirExcel(): Promise<void> {
    await this.clickElement(this.tabSubir, 'pestaña Importar productos');
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
    await this.clickElement(this.tabRevision, 'pestaña Pendientes de revisión');
    await this.waitForLocator(this.page.getByRole('heading', { name: /Pendientes de revisión/ }));
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

  /// El aviso de filas omitidas ("Algunas filas se omitieron") — hallazgo de
  /// la tester: lo excluido ya no se pierde en silencio.
  async avisosDeOmision(): Promise<string> {
    const aviso = this.page.locator('.callout', { hasText: 'Algunas filas se omitieron' });
    await aviso.waitFor({ state: 'visible', timeout: 15_000 });
    const texto = (await aviso.innerText()).replace(/\s+/g, ' ');
    await this.captureCurrentState('ASSERT', `Avisos de omisión: "${texto}"`, 'callout warn');
    return texto;
  }

  /// ¿El ítem ofrece el camino directo "Confirmar y publicar como producto nuevo"?
  async botonConfirmarNuevoVisible(sku: string): Promise<boolean> {
    // Dos variantes según haya sugerencia o no: "Confirmar y publicar como
    // producto nuevo" (primario) o "No, publicarlo como producto nuevo".
    const boton = this.tarjetaDeItem(sku).first()
      .getByRole('button', { name: /como producto nuevo/ });
    const visible = await boton.isVisible();
    await this.captureCurrentState('ASSERT', `Botón de confirmar en "${sku}": ${visible}`, '.review-card button');
    return visible;
  }

  /// Confirma el ítem como producto nuevo y espera a que salga de la cola.
  async confirmarComoNuevo(sku: string): Promise<void> {
    const tarjeta = this.tarjetaDeItem(sku).first();
    await this.clickElement(
      tarjeta.getByRole('button', { name: /como producto nuevo/ }),
      `Confirmar "${sku}" como producto nuevo`);
    await tarjeta.waitFor({ state: 'detached', timeout: 15_000 });
  }
}

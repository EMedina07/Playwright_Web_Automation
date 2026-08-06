import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

export interface FilaAuditoria {
  comercio: string;
  monto: string;
  estado: string;
}

/**
 * Pantalla "Planes" del back-office (solo gestión): asignación manual, tabla
 * de suscripciones y la Auditoría de facturación — el ledger contable expuesto
 * en modo lectura, que es la vara contra la que cuadran las tarjetas.
 */
export class PlanesPage extends PageHelpers {
  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }, recordStep?: (r: StepRecord) => void) {
    super(page, attachFn, stepCounter, recordStep);
  }

  async openAsAdmin(token: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.adminToken', t), token);
    await this.page.reload();
    await this.clickElement(this.page.getByRole('button', { name: 'Planes', exact: true }), 'pestaña Planes');
    await this.waitForLocator(this.page.getByRole('heading', { name: 'Planes y suscripciones' }));
  }

  /// La receta del dueño, tal cual: ID del comercio + PRO + meses + nota.
  async asignar(vendorId: number, meses: number, nota: string): Promise<void> {
    await this.fillField(this.page.getByPlaceholder('ID del comercio'), String(vendorId), 'ID del comercio');
    await this.fillField(this.page.getByPlaceholder('Meses'), String(meses), 'Meses');
    await this.fillField(this.page.getByPlaceholder('Nota (ej. transferencia #123)'), nota, 'Nota');
    await this.clickElement(this.page.getByRole('button', { name: 'Asignar', exact: true }), 'Asignar');
  }

  private filaSuscripcion(vendorName: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: vendorName });
  }

  async esperarSuscripcionListada(vendorName: string): Promise<void> {
    await this.captureCurrentState('ASSERT', `"${vendorName}" aparece en la tabla de suscripciones`, 'row(vendor)');
    await this.filaSuscripcion(vendorName).first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /// Cancela desde la tabla (window.confirm nativo: registrar el diálogo
  /// ANTES del click) y espera a que la fila desaparezca — el panel solo
  /// lista suscripciones abiertas.
  async cancelar(vendorName: string): Promise<void> {
    this.page.once('dialog', (dialog) => void dialog.accept());
    await this.clickElement(
      this.filaSuscripcion(vendorName).getByRole('button', { name: 'Cancelar' }), `Cancelar a "${vendorName}"`);
    await this.filaSuscripcion(vendorName).waitFor({ state: 'detached', timeout: 15_000 });
  }

  // ── Auditoría de facturación ─────────────────────────────────────────────

  /// Abre la sub-pestaña (Pagos/Facturas) y aplica el filtro de propósito.
  private async abrirAuditoria(tab: 'Pagos' | 'Facturas', proposito: 'Subscription' | 'Advertising'): Promise<void> {
    await this.clickElement(this.page.getByRole('button', { name: tab, exact: true }), `auditoría → ${tab}`);
    // El select de propósito es el único con la opción de Suscripción/Publicidad.
    const filtro = this.page.locator('select:has(option[value="Subscription"])');
    await filtro.selectOption(proposito);
    await this.page.waitForTimeout(600); // recarga del listado filtrado
  }

  /// Primera fila (la más reciente) del listado: comercio, monto y estado.
  /// La tabla se ancla por su encabezado DISTINTIVO ("Ref/Motivo" en Pagos,
  /// "Emitida" en Facturas): la página tiene varias tablas (suscripciones,
  /// tramos de precios) y la primera del DOM no es la de auditoría.
  private async primeraFila(tab: 'Pagos' | 'Facturas', proposito: 'Subscription' | 'Advertising'): Promise<FilaAuditoria> {
    await this.abrirAuditoria(tab, proposito);
    const marcador = tab === 'Pagos' ? 'Ref/Motivo' : 'Emitida';
    const tabla = this.page.locator('table').filter({ has: this.page.getByRole('columnheader', { name: marcador }) });
    const fila = tabla.locator('tbody tr').first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const celdas = await fila.locator('td').allTextContents();
    // Pagos: # | Comercio | Concepto | Monto | Estado | Ref | Fecha
    // Facturas: # | Comercio | Concepto | Monto | Estado | Emitida | Pagada
    return { comercio: celdas[1]?.trim() ?? '', monto: celdas[3]?.trim() ?? '', estado: (await fila.locator('.badge').textContent())?.trim() ?? '' };
  }

  async primerPago(proposito: 'Subscription' | 'Advertising'): Promise<FilaAuditoria> {
    const fila = await this.primeraFila('Pagos', proposito);
    await this.captureCurrentState('ASSERT', `Primer pago (${proposito}): ${JSON.stringify(fila)}`, 'auditoría Pagos fila 1');
    return fila;
  }

  async primeraFactura(proposito: 'Subscription' | 'Advertising'): Promise<FilaAuditoria> {
    const fila = await this.primeraFila('Facturas', proposito);
    await this.captureCurrentState('ASSERT', `Primera factura (${proposito}): ${JSON.stringify(fila)}`, 'auditoría Facturas fila 1');
    return fila;
  }
}

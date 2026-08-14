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

  // La asignación y cancelación manuales se retiraron de la pantalla
  // (decisión del dueño): el comercio autogestiona su plan desde el portal.
  private filaSuscripcion(vendorName: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: vendorName });
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

  /// Abre el panel solo si no está ya en él: validar varias filas de la misma
  /// tabla no amerita una navegación completa por fila (y el re-reload
  /// repetido se volvía intermitente).
  async asegurarAbiertoComoAdmin(token: string): Promise<void> {
    const abierto = await this.page.getByRole('heading', { name: 'Planes y suscripciones' })
      .isVisible().catch(() => false);
    if (!abierto) await this.openAsAdmin(token);
  }

  /// Estado (badge) de la suscripción de un comercio en la tabla del panel.
  async estadoSuscripcion(vendorName: string): Promise<string> {
    const fila = this.filaSuscripcion(vendorName).first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const estado = (await fila.locator('.badge').textContent())?.trim() ?? '';
    await this.captureCurrentState('ASSERT', `Estado de "${vendorName}" en la tabla: ${estado}`, 'badge estado');
    return estado;
  }

  /// Fila de auditoría DEL COMERCIO (no la primera global: bajo ejecución en
  /// paralelo, la fila más reciente puede ser de otro escenario).
  private async filaDelComercio(
    tab: 'Pagos' | 'Facturas', proposito: 'Subscription' | 'Advertising', vendorId: number,
  ): Promise<FilaAuditoria> {
    await this.abrirAuditoria(tab, proposito);
    const marcador = tab === 'Pagos' ? 'Ref/Motivo' : 'Emitida';
    const tabla = this.page.locator('table').filter({ has: this.page.getByRole('columnheader', { name: marcador }) });
    const fila = tabla.locator('tbody tr')
      .filter({ has: this.page.locator('td:nth-child(2)', { hasText: new RegExp(`^${vendorId}$`) }) })
      .first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const celdas = await fila.locator('td').allTextContents();
    return { comercio: celdas[1]?.trim() ?? '', monto: celdas[3]?.trim() ?? '', estado: (await fila.locator('.badge').textContent())?.trim() ?? '' };
  }

  async pagoDelComercio(vendorId: number, proposito: 'Subscription' | 'Advertising'): Promise<FilaAuditoria> {
    const fila = await this.filaDelComercio('Pagos', proposito, vendorId);
    await this.captureCurrentState('ASSERT', `Pago del comercio ${vendorId}: ${JSON.stringify(fila)}`, 'auditoría Pagos');
    return fila;
  }

  async facturaDelComercio(vendorId: number, proposito: 'Subscription' | 'Advertising'): Promise<FilaAuditoria> {
    const fila = await this.filaDelComercio('Facturas', proposito, vendorId);
    await this.captureCurrentState('ASSERT', `Factura del comercio ${vendorId}: ${JSON.stringify(fila)}`, 'auditoría Facturas');
    return fila;
  }

  /// Última entrada del journal de ese tipo para el comercio, con su snapshot
  /// desplegado vía "Ver detalle" (el journal viene ordenado del más reciente).
  async journalDelComercio(vendorId: number, tipo: string): Promise<{ monto: string; snapshot: string }> {
    await this.clickElement(this.page.getByRole('button', { name: 'Journal', exact: true }), 'auditoría → Journal');
    const tabla = this.page.locator('table').filter({ has: this.page.getByRole('columnheader', { name: 'Momento' }) });
    const fila = tabla.locator('tbody tr')
      .filter({ has: this.page.locator('td:nth-child(2)', { hasText: new RegExp(`^${tipo}$`) }) })
      .filter({ has: this.page.locator('td:nth-child(3)', { hasText: new RegExp(`^${vendorId}$`) }) })
      .first();
    await fila.waitFor({ state: 'visible', timeout: 15_000 });
    const monto = (await fila.locator('td').nth(5).textContent())?.trim() ?? '';
    await this.clickElement(fila.getByRole('button', { name: 'Ver detalle' }), `Ver detalle del journal ${tipo}`);
    const snapshot = (await this.page.locator('.snapshot-json').first().textContent()) ?? '';
    await this.captureCurrentState('ASSERT', `Journal ${tipo} del comercio ${vendorId}: ${monto}`, 'journal con detalle');
    return { monto, snapshot };
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

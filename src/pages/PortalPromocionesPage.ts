import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

/**
 * Pestaña "Promociones" del portal de comercios. Desactivar pide una
 * confirmación NATIVA (window.confirm — se maneja con el evento dialog, y hay
 * que registrarlo ANTES del click). Reactivar solo existe cuando la desactivó
 * el propio comercio; si fue moderación, se muestra el aviso y no hay botón.
 */
export class PortalPromocionesPage extends PageHelpers {
  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }, recordStep?: (r: StepRecord) => void) {
    super(page, attachFn, stepCounter, recordStep);
  }

  private card(caption: string): Locator {
    return this.page.locator('.review-card').filter({ hasText: caption });
  }

  async openAsVendor(jwt: string): Promise<void> {
    await this.navigate(environments.portalURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.vendorToken', t), jwt);
    await this.page.reload();
    await this.clickElement(this.page.getByRole('button', { name: 'Promociones' }), 'pestaña Promociones');
    await this.waitForLocator(this.page.getByRole('heading', { name: 'Promociones patrocinadas' }));
  }

  // ── Publicar: cotización en vivo y pago ───────────────────────────────────

  /// Los dos date-pickers del formulario: Inicio y Fin, en ese orden.
  async setCampaignDates(inicioISO: string, finISO: string): Promise<void> {
    const fechas = this.page.locator('input[type="date"]');
    await this.fillField(fechas.nth(0), inicioISO, `Inicio de campaña ${inicioISO}`);
    await this.fillField(fechas.nth(1), finISO, `Fin de campaña ${finISO}`);
  }

  /// La línea "N día(s) × RD$X.XX/día = RD$Y.YY" que recotiza en vivo.
  async quoteLine(timeout = 10_000): Promise<string> {
    const linea = this.page.locator('.callout.good strong');
    await linea.waitFor({ state: 'visible', timeout });
    return (await linea.textContent())?.trim() ?? '';
  }

  async publishButtonLabel(): Promise<string> {
    return (await this.page.getByRole('button', { name: /Publicar/ }).textContent())?.trim() ?? '';
  }

  /// Publica de verdad desde el formulario (imagen + texto + fechas ya puestas)
  /// y espera a que la campaña aparezca en la lista — cobro incluido.
  async publicar(caption: string, imagen: Buffer): Promise<void> {
    await this.page.locator('input[type="file"]').setInputFiles({
      name: 'promo-qa.png', mimeType: 'image/png', buffer: imagen,
    });
    await this.fillField(this.page.locator('textarea'), caption, 'Texto de la promoción');
    await this.clickElement(this.page.getByRole('button', { name: /Publicar y pagar/ }), 'Publicar y pagar');
    await this.waitForLocator(this.card(caption).locator('.badge', { hasText: 'Activa' }));
  }

  /// Pulsa Desactivar y responde la confirmación nativa. aceptar=false simula
  /// el arrepentimiento: la campaña pagada debe seguir activa.
  async deactivate(caption: string, aceptar: boolean): Promise<void> {
    this.page.once('dialog', (dialog) => void (aceptar ? dialog.accept() : dialog.dismiss()));
    await this.clickElement(
      this.card(caption).getByRole('button', { name: 'Desactivar' }),
      `Desactivar "${caption}" (${aceptar ? 'aceptando' : 'rechazando'} la confirmación)`);
  }

  async reactivate(caption: string): Promise<void> {
    await this.clickElement(this.card(caption).getByRole('button', { name: 'Reactivar' }), `Reactivar "${caption}"`);
  }

  async waitForState(caption: string, estado: 'Activa' | 'Desactivada', timeout = 15_000): Promise<void> {
    await this.captureCurrentState('ASSERT', `"${caption}" se muestra ${estado}`, `card.badge(${estado})`);
    await this.card(caption).locator('.badge', { hasText: estado }).first()
      .waitFor({ state: 'visible', timeout });
  }

  async reactivarDisponible(caption: string): Promise<boolean> {
    return (await this.card(caption).getByRole('button', { name: 'Reactivar' }).count()) > 0;
  }

  async avisoModeracionVisible(caption: string): Promise<boolean> {
    return this.card(caption).getByText('Desactivada por PriceList (moderación)').isVisible().catch(() => false);
  }
}

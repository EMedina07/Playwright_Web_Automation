import { Locator, Page } from 'playwright';
import { PageHelpers } from './PageHelpers';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

/**
 * Pantalla "Moderación de promociones" del back-office. Cada promoción es una
 * tarjeta (.review-card) con su caption, el badge de estado y UN solo botón de
 * acción: "Desactivar" (activa, pide motivo en el ReasonModal) o "Reactivar"
 * (desactivada). No hay auto-refresco: la pantalla recarga tras cada acción.
 */
export class PromocionesModeracionPage extends PageHelpers {
  constructor(page: Page, attachFn?: IAttachFn, stepCounter?: { value: number }, recordStep?: (r: StepRecord) => void) {
    super(page, attachFn, stepCounter, recordStep);
  }

  private card(caption: string): Locator {
    return this.page.locator('.review-card').filter({ hasText: caption });
  }

  async openAsAdmin(token: string): Promise<void> {
    await this.navigate(environments.baseURL);
    await this.page.evaluate((t) => sessionStorage.setItem('pricelist.adminToken', t), token);
    await this.page.reload();
    await this.clickElement(this.page.getByRole('button', { name: 'Promociones' }), 'pestaña Promociones');
    await this.waitForLocator(this.page.getByRole('heading', { name: 'Moderación de promociones' }));
  }

  async deactivate(caption: string, reason: string): Promise<void> {
    await this.clickElement(this.card(caption).getByRole('button', { name: 'Desactivar' }), `Desactivar "${caption}"`);
    await this.fillField(this.page.getByTestId('reason-input'), reason, 'Motivo de la desactivación');
    await this.clickElement(this.page.getByTestId('reason-confirm'), 'confirmar desactivación');
  }

  async openDeactivateAndCancel(caption: string): Promise<void> {
    await this.clickElement(this.card(caption).getByRole('button', { name: 'Desactivar' }), `Desactivar "${caption}"`);
    await this.clickElement(this.page.getByRole('button', { name: 'Cancelar' }), 'cancelar el motivo');
  }

  async reactivate(caption: string): Promise<void> {
    await this.clickElement(this.card(caption).getByRole('button', { name: 'Reactivar' }), `Reactivar "${caption}"`);
  }

  // La tarjeta muestra el badge del estado y el botón de la acción CONTRARIA
  // — verificar ambos es verificar que el botón "funcionó" de cara al admin.
  async waitForState(caption: string, estado: 'Activa' | 'Desactivada', timeout = 15_000): Promise<void> {
    const card = this.card(caption);
    await this.captureCurrentState('ASSERT', `"${caption}" se muestra ${estado}`, `card.badge(${estado})`);
    await card.locator('.badge', { hasText: estado }).first().waitFor({ state: 'visible', timeout });
    const accionContraria = estado === 'Activa' ? 'Desactivar' : 'Reactivar';
    await card.getByRole('button', { name: accionContraria }).waitFor({ state: 'visible', timeout });
  }
}

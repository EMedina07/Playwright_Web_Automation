import { Given, Then } from '@cucumber/cucumber';
import { Backoffice2faPage } from '../../../pages/Backoffice2faPage';
import { resetAdminLockout } from '../../../../core/framework_actions/VendorSetup';
import { CustomWorld } from '../../../support/world';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@pricelist.dev';
// La contraseña del admin viene del .env.<entorno> (gitignored), nunca hardcodeada.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

Given('el admin llega a la pantalla de verificación en dos pasos del back-office', { timeout: 30_000 }, async function (this: CustomWorld) {
  resetAdminLockout(ADMIN_EMAIL); // precondición: sin lockout de corridas previas
  await this.getPage(Backoffice2faPage).loginToTwoFactor(ADMIN_EMAIL, ADMIN_PASSWORD);
});

Then('el código 2FA del back-office {string} muestra el error {string}', async function (this: CustomWorld, code: string, expectedError: string) {
  await this.getPage(Backoffice2faPage).assertCodeRejected(code, expectedError);
});

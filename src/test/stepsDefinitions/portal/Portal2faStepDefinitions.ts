import { Given, Then } from '@cucumber/cucumber';
import { Portal2faPage } from '../../../pages/Portal2faPage';
import { setupApprovedVendor } from '../../../../core/framework_actions/VendorSetup';
import { CustomWorld } from '../../../support/world';

Given('existe un comercio aprobado en la pantalla de verificación en dos pasos', { timeout: 60_000 }, async function (this: CustomWorld) {
  // Monta un comercio aprobado por los endpoints reales y entra al 2FA.
  const vendor = await setupApprovedVendor();
  await this.getPage(Portal2faPage).loginToTwoFactor(vendor.email, vendor.password);
});

Then('el código 2FA {string} muestra el error {string}', async function (this: CustomWorld, code: string, expectedError: string) {
  await this.getPage(Portal2faPage).assertCodeRejected(code, expectedError);
});

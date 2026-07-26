import { Given, When, Then } from '@cucumber/cucumber';
import { PortalRecoveryPage } from '../../../pages/PortalRecoveryPage';
import { CustomWorld } from '../../../support/world';

const RESEND_NOTICE =
  'Si tu correo está pendiente de confirmar, te enviamos un código nuevo. Revísalo e ingrésalo aquí.';

// Guarda el correo/RNC únicos de este escenario en el world (por-escenario).
interface RecoveryState { recoveryEmail?: string; recoveryTaxId?: string }

Given('un comercio se registra pero no confirma su correo', async function (this: CustomWorld) {
  // Correo y RNC únicos por corrida para poder repetir el escenario sin choques.
  const stamp = Date.now();
  const email = `recuperacion.${stamp}@pricelist.dev`;
  const taxId = String(stamp).slice(-9);
  (this as CustomWorld & RecoveryState).recoveryEmail = email;
  (this as CustomWorld & RecoveryState).recoveryTaxId = taxId;
  await this.getPage(PortalRecoveryPage).registerComercio(email, taxId);
});

When('el comercio cierra la pantalla sin ingresar el código', async function (this: CustomWorld) {
  await this.getPage(PortalRecoveryPage).closeWithoutVerifying();
});

When('reabre la confirmación desde el login y reenvía el código', async function (this: CustomWorld) {
  const email = (this as CustomWorld & RecoveryState).recoveryEmail!;
  const page = this.getPage(PortalRecoveryPage);
  await page.reopenVerifyFromLogin();
  await page.setVerifyEmail(email);
  await page.clickResend();
  await page.assertResendNotice(RESEND_NOTICE);
});

Then('puede confirmar su correo con el código reenviado', async function (this: CustomWorld) {
  const email = (this as CustomWorld & RecoveryState).recoveryEmail!;
  const page = this.getPage(PortalRecoveryPage);
  await page.enterResentCodeAndConfirm(email);
  await page.assertConfirmedAtLogin();
});

import { Given, When, Then } from '@cucumber/cucumber';
import { PortalVerifyPage, type VerifyField } from '../../../pages/PortalVerifyPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { CustomWorld } from '../../../support/world';
import { PortalVerifyData } from '../../../../core/interfaces/PortalVerifyData';

const DATA_FILE = 'portal-verify';

// Base VÁLIDA: cada caso negativo sobreescribe un solo campo con un valor malo.
const VALID_BASE: Record<VerifyField, string> = {
  email: 'prueba@comercio.com',
  code: '123456',
};

function getData(dataId: string): PortalVerifyData {
  return JsonDataManagement.getById<PortalVerifyData>(environments.env, DATA_FILE, dataId);
}

Given('el usuario está en la pantalla de confirmar correo del portal', async function (this: CustomWorld) {
  await this.getPage(PortalVerifyPage).navigateToVerify();
});

When('el usuario intenta confirmar el correo con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  const merged: Record<VerifyField, string> = { ...VALID_BASE, ...data.fields };
  const page = this.getPage(PortalVerifyPage);
  await page.fillEmail(merged.email);
  await page.fillCode(merged.code);
  await page.clickConfirm();
});

Then('se muestra el error de confirmación esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  await this.getPage(PortalVerifyPage).assertFieldError(data.expectField, data.expectedError);
});

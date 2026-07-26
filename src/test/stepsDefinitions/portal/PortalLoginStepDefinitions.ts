import { Given, When, Then } from '@cucumber/cucumber';
import { PortalLoginPage, type LoginField } from '../../../pages/PortalLoginPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { CustomWorld } from '../../../support/world';
import { PortalLoginData } from '../../../../core/interfaces/PortalLoginData';

const DATA_FILE = 'portal-login';

// Base VÁLIDA: cada caso negativo sobreescribe un solo campo con un valor malo.
const VALID_BASE: Record<LoginField, string> = {
  email: 'prueba@comercio.com',
  password: 'Comercio#2026',
};

function getData(dataId: string): PortalLoginData {
  return JsonDataManagement.getById<PortalLoginData>(environments.env, DATA_FILE, dataId);
}

Given('el usuario está en el login del portal de comercios', async function (this: CustomWorld) {
  await this.getPage(PortalLoginPage).navigateTo();
});

When('el comercio intenta iniciar sesión con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  const merged: Record<LoginField, string> = { ...VALID_BASE, ...data.fields };
  const page = this.getPage(PortalLoginPage);
  await page.fillEmail(merged.email);
  await page.fillPassword(merged.password);
  await page.clickLogin();
});

Then('se muestra el error de login esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  await this.getPage(PortalLoginPage).assertFieldError(data.expectField, data.expectedError);
});

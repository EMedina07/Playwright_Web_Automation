import { Given, When, Then } from '@cucumber/cucumber';
import { PortalRegisterPage, type RegField } from '../../../pages/PortalRegisterPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { CustomWorld } from '../../../support/world';
import { PortalRegisterData } from '../../../../core/interfaces/PortalRegisterData';

const DATA_FILE = 'portal-register';

// Base VÁLIDA: cada caso negativo sobreescribe un solo campo con un valor malo.
const VALID_BASE: Record<RegField, string> = {
  name: 'Supermercado Prueba',
  legalName: 'Comercial Prueba SRL',
  email: 'prueba@comercio.com',
  phone: '(809)-555-0100',
  address: 'Av. Principal 100, Santo Domingo',
  taxId: '131000001',
  password: 'Comercio#2026',
};

function getData(dataId: string): PortalRegisterData {
  return JsonDataManagement.getById<PortalRegisterData>(environments.env, DATA_FILE, dataId);
}

Given('el usuario está en el registro de comercio del portal', async function (this: CustomWorld) {
  await this.getPage(PortalRegisterPage).navigateToRegister();
});

When('el usuario intenta registrar el comercio con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  const merged: Record<RegField, string> = { ...VALID_BASE, ...data.fields };
  const page = this.getPage(PortalRegisterPage);
  await page.fillAll(merged);
  await page.clickCreate();
});

Then('se muestra el error de registro esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  await this.getPage(PortalRegisterPage).assertFieldError(data.expectField, data.expectedError);
});

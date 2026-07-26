import { Given, Then, When } from '@cucumber/cucumber';
import { BackofficeLoginPage } from '../../../pages/BackofficeLoginPage';
import { JsonDataManagement } from '../../../../core/data_management/JsonDataManagement';
import environments from '../../../../core/settings/EnvironmentSettings';
import { CustomWorld } from '../../../support/world';
import { BackofficeLoginData } from '../../../../core/interfaces/BackofficeLoginData';

const DATA_FILE = 'backoffice-login';

function getData(dataId: string): BackofficeLoginData {
  return JsonDataManagement.getById<BackofficeLoginData>(environments.env, DATA_FILE, dataId);
}

Given('el usuario está en la página de login del back-office', async function (this: CustomWorld) {
  await this.getPage(BackofficeLoginPage).navigateTo();
});

When('el usuario del back-office inicia sesión con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  const page = this.getPage(BackofficeLoginPage);
  await page.fillEmail(data.email);
  await page.fillPassword(data.password);
  await page.clickLogin();
});

Then('el sistema avanza al paso de verificación en dos pasos', async function (this: CustomWorld) {
  await this.getPage(BackofficeLoginPage).assertReachedMfaSetup();
});

Then('se muestra el error de email esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  if (!data.expectedEmailError) {
    throw new Error(`El dato "${dataId}" no define expectedEmailError.`);
  }
  await this.getPage(BackofficeLoginPage).assertEmailFieldError(data.expectedEmailError);
});

Then('se muestra el error de contraseña esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  if (!data.expectedPasswordError) {
    throw new Error(`El dato "${dataId}" no define expectedPasswordError.`);
  }
  await this.getPage(BackofficeLoginPage).assertPasswordFieldError(data.expectedPasswordError);
});

Then('se muestran los mensajes de validación esperados para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  const page = this.getPage(BackofficeLoginPage);
  if (data.expectedEmailError) {
    await page.assertEmailFieldError(data.expectedEmailError);
  }
  if (data.expectedPasswordError) {
    await page.assertPasswordFieldError(data.expectedPasswordError);
  }
});

Then('se muestra el error de formulario esperado para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  if (!data.expectedFormError) {
    throw new Error(`El dato "${dataId}" no define expectedFormError.`);
  }
  await this.getPage(BackofficeLoginPage).assertFormError(data.expectedFormError);
});

Then('el sistema no ejecuta el payload y muestra el error de email para {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  if (!data.expectedEmailError) {
    throw new Error(`El dato "${dataId}" no define expectedEmailError.`);
  }
  await this.getPage(BackofficeLoginPage).assertXssNotExecuted(data.expectedEmailError);
});

Then('el admin completa la verificación en dos pasos con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  if (!data.totpSecret) {
    throw new Error(`El dato "${dataId}" no define totpSecret para automatizar el 2FA.`);
  }
  await this.getPage(BackofficeLoginPage).completeMfa(data.totpSecret);
});

Then('el admin entra al back-office con {string}', async function (this: CustomWorld, dataId: string) {
  const data = getData(dataId);
  await this.getPage(BackofficeLoginPage).assertReachedBackoffice(data.email);
});

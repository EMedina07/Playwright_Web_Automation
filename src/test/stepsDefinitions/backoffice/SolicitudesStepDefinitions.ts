import { Given, When, Then } from '@cucumber/cucumber';
import { SolicitudesPage } from '../../../pages/SolicitudesPage';
import { randomVendor, type VendorInput } from '../../../../core/framework_actions/VendorData';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { CustomWorld } from '../../../support/world';

interface SolState { vendorData?: VendorInput; vendorId?: number }

const FILTERS: Record<string, 'pending' | 'approved' | 'rejected'> = {
  Pendientes: 'pending',
  Aprobadas: 'approved',
  Rechazadas: 'rejected',
};

Given('un comercio se registra en el portal con datos aleatorios', { timeout: 40_000 }, async function (this: CustomWorld) {
  const data = randomVendor();
  const vendorId = await this.getPage(SolicitudesPage).registerOnPortal(data);
  const s = this as CustomWorld & SolState;
  s.vendorData = data;
  s.vendorId = vendorId;
});

Given('el comercio verifica su correo', { timeout: 30_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & SolState;
  await this.getPage(SolicitudesPage).verifyVendorEmail(s.vendorData!.email);
});

Given('el admin abre el módulo de Solicitudes del back-office', { timeout: 60_000 }, async function (this: CustomWorld) {
  const token = await getAdminToken();
  await this.getPage(SolicitudesPage).openBackofficeAsAdmin(token);
});

Then('los datos de la solicitud pendiente coinciden con el comercio registrado', async function (this: CustomWorld) {
  const s = this as CustomWorld & SolState;
  await this.getPage(SolicitudesPage).assertMatches(s.vendorId!, s.vendorData!);
});

When('el admin aprueba la solicitud', async function (this: CustomWorld) {
  const s = this as CustomWorld & SolState;
  await this.getPage(SolicitudesPage).approve(s.vendorId!);
});

When('el admin rechaza la solicitud con motivo {string}', async function (this: CustomWorld, reason: string) {
  const s = this as CustomWorld & SolState;
  await this.getPage(SolicitudesPage).rejectWith(s.vendorId!, reason);
});

Then('la solicitud aparece en {string}', async function (this: CustomWorld, filterLabel: string) {
  const s = this as CustomWorld & SolState;
  const filter = FILTERS[filterLabel];
  if (!filter) throw new Error(`Filtro desconocido: ${filterLabel}`);
  await this.getPage(SolicitudesPage).assertInFilter(s.vendorId!, filter);
});

Then('la solicitud ya no está en Pendientes', async function (this: CustomWorld) {
  const s = this as CustomWorld & SolState;
  await this.getPage(SolicitudesPage).assertNotPending(s.vendorId!);
});

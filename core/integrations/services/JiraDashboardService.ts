import { JiraConfig } from '../config/jira.config';
import { createJiraClient, postJson, getJson } from '../utils/http.client';

interface JiraFilter { id: string; name: string }
interface JiraDashboard { id: string; name: string }
interface JiraGadget { id: string; uri: string; title?: string; color?: string }

const DASHBOARD_NAME = 'QA Automation Dashboard';
const FILTER_NAME = 'QA Automation — Todos los scenarios';

// Full gadget URIs from /rest/api/3/dashboard/gadgets
const GADGET_URIS = {
  pieChart:       'rest/gadgets/1.0/g/com.atlassian.jira.gadgets:pie-chart-gadget/gadgets/piechart-gadget.xml',
  filterResults:  'rest/gadgets/1.0/g/com.atlassian.jira.gadgets:filter-results-gadget/gadgets/filter-results-gadget.xml',
  stats:          'rest/gadgets/1.0/g/com.atlassian.jira.gadgets:stats-gadget/gadgets/stats-gadget.xml',
  recentlyCreated:'rest/gadgets/1.0/g/com.atlassian.jira.gadgets:recently-created-chart-gadget/gadgets/recently-created-gadget.xml',
};

// NOTE: Jira Cloud REST API v3 does NOT support setting userPrefs for classic gadgets
// programmatically. Gadgets must be configured manually via the Jira UI after creation:
// 1. Open the dashboard
// 2. Click "Editar" → click the gear icon on each gadget
// 3. Select filter "QA Automation — Todos los scenarios"

export class JiraDashboardService {
  private readonly client;
  private readonly cfg: JiraConfig;

  constructor(config: JiraConfig) {
    this.cfg = config;
    this.client = createJiraClient(config.baseUrl, config.email, config.apiToken);
  }

  async createOrUpdate(): Promise<string> {
    console.log('\n[Dashboard] Configurando dashboard de Jira...');

    const filter = await this.ensureFilter();
    const dashboard = await this.ensureDashboard();
    await this.ensureGadgets(dashboard.id, filter.id);

    const url = `${this.cfg.baseUrl}/jira/dashboards/${dashboard.id}`;
    console.log(`[Dashboard] ✅ Dashboard listo: ${url}`);
    console.log(`[Dashboard] ℹ️  Para ver datos: abre el dashboard → Editar → configura el filtro en cada gadget`);
    return url;
  }

  private async ensureFilter(): Promise<JiraFilter> {
    const res = await getJson<{ values: JiraFilter[] }>(
      this.client,
      `/filter/search?filterName=${encodeURIComponent(FILTER_NAME)}`,
    );
    const existing = res.data.values?.find((f) => f.name === FILTER_NAME);
    if (existing) {
      console.log(`[Dashboard] Filtro existente: ${existing.id}`);
      return existing;
    }

    const created = await postJson<JiraFilter>(this.client, '/filter', {
      name: FILTER_NAME,
      jql: `project = "${this.cfg.projectKey}" AND labels = "qa-automation" ORDER BY key DESC`,
      description: 'Todos los scenarios de automatización QA',
      favourite: true,
    });
    console.log(`[Dashboard] Filtro creado: ${created.data.id}`);
    return created.data;
  }

  private async ensureDashboard(): Promise<JiraDashboard> {
    const res = await getJson<{ dashboards: JiraDashboard[] }>(this.client, '/dashboard?maxResults=50');
    const existing = res.data.dashboards?.find((d) => d.name === DASHBOARD_NAME);
    if (existing) {
      console.log(`[Dashboard] Dashboard existente: ${existing.id}`);
      return existing;
    }

    const created = await postJson<JiraDashboard>(this.client, '/dashboard', {
      name: DASHBOARD_NAME,
      description: 'Estado de los scenarios de automatización QA',
    });
    console.log(`[Dashboard] Dashboard creado: ${created.data.id}`);
    return created.data;
  }

  private async ensureGadgets(dashboardId: string, _filterId: string): Promise<void> {
    const res = await getJson<{ gadgets: JiraGadget[] }>(
      this.client, `/dashboard/${dashboardId}/gadget`,
    ).catch(() => ({ data: { gadgets: [] } }));

    const existing = res.data.gadgets ?? [];
    if (existing.length > 0) {
      console.log(`[Dashboard] Gadgets existentes (${existing.length}). Omitiendo creación.`);
      return;
    }

    const gadgetDefs = [
      { uri: GADGET_URIS.pieChart,        color: 'blue',   position: { column: 0, row: 0 }, title: 'Gráfico de tarta' },
      { uri: GADGET_URIS.filterResults,   color: 'green',  position: { column: 1, row: 0 }, title: 'Filtrar resultados' },
      { uri: GADGET_URIS.stats,           color: 'cyan',   position: { column: 0, row: 1 }, title: 'Estadísticas de actividades' },
      { uri: GADGET_URIS.recentlyCreated, color: 'purple', position: { column: 1, row: 1 }, title: 'Gráfico creado recientemente' },
    ];

    for (const def of gadgetDefs) {
      try {
        await postJson<JiraGadget>(
          this.client,
          `/dashboard/${dashboardId}/gadget`,
          { uri: def.uri, color: def.color, position: def.position, title: def.title },
        );
        console.log(`[Dashboard]  ✓ ${def.title} (${def.color})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Dashboard]  ✗ ${def.title}: ${msg}`);
      }
    }

    console.log(`[Dashboard] ⚠️  Gadgets creados. Configura el filtro manualmente:`);
    console.log(`[Dashboard]    1. Abre el dashboard y haz clic en "Editar"`);
    console.log(`[Dashboard]    2. En cada gadget, haz clic en el ícono de engranaje`);
    console.log(`[Dashboard]    3. Selecciona el filtro: "${FILTER_NAME}"`);
    console.log(`[Dashboard]    4. Guarda y cierra`);
  }
}

import { Locator, Page } from 'playwright';
import { IAttachFn, ActionType, StepRecord, renderCard } from '../../core/framework_actions/StepLogger';

export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    private readonly attachFn?: IAttachFn,
    private readonly stepCounter?: { value: number },
    private readonly recordStep?: (record: StepRecord) => void,
  ) {}

  // Espera dos ciclos de animación para que Vue/React termine de pintar la UI
  // antes de tomar el screenshot. Evita capturas en blanco cuando el DOM
  // ya existe pero el renderizado visual aún no se completó.
  private async waitForVisualStability(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 });
    } catch {}
    // Si la página está en blanco por una navegación en curso, espera que se establezca la URL real
    if (this.page.url() === 'about:blank') {
      try {
        await this.page.waitForURL((url) => url.href !== 'about:blank', { timeout: 8_000 });
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 });
      } catch {}
    }
    try {
      await this.page.evaluate(
        'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
      );
    } catch {}
  }

  private async captureAction(
    type: ActionType,
    description: string,
    code: string,
    action: () => Promise<void>,
  ): Promise<void> {
    await action();
    if (!this.attachFn || !this.stepCounter) return;
    try {
      await this.waitForVisualStability();
      const screenshot = await this.page.screenshot({ fullPage: false });
      this.stepCounter.value++;
      const card = renderCard(this.stepCounter.value, type, description, code, screenshot, false);
      await this.attachFn(card, 'text/html');
      this.recordStep?.({ index: this.stepCounter.value, type, description, code, screenshot, failed: false });
    } catch {}
  }

  protected async assertCapture(
    description: string,
    code: string,
    assertion: () => Promise<void>,
  ): Promise<void> {
    let failed = false;
    let thrownError: unknown;

    try {
      await assertion();
    } catch (e) {
      failed = true;
      thrownError = e;
    }

    if (this.attachFn && this.stepCounter) {
      try {
        await this.waitForVisualStability();
        const screenshot = await this.page.screenshot({ fullPage: false });
        this.stepCounter.value++;
        const card = renderCard(this.stepCounter.value, 'ASSERT', description, code, screenshot, failed);
        await this.attachFn(card, 'text/html');
        this.recordStep?.({ index: this.stepCounter.value, type: 'ASSERT', description, code, screenshot, failed });
      } catch {}
    }

    if (thrownError) throw thrownError;
  }

  protected async actionCapture(
    description: string,
    code: string,
    action: () => Promise<void>,
  ): Promise<void> {
    await this.captureAction('ACTION', description, code, action);
  }

  protected async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  protected async captureCurrentState(
    type: ActionType,
    description: string,
    code: string,
  ): Promise<void> {
    if (!this.attachFn || !this.stepCounter) return;
    try {
      await this.waitForVisualStability();
      const screenshot = await this.page.screenshot({ fullPage: false });
      this.stepCounter.value++;
      const card = renderCard(this.stepCounter.value, type, description, code, screenshot, false);
      await this.attachFn(card, 'text/html');
      this.recordStep?.({ index: this.stepCounter.value, type, description, code, screenshot, failed: false });
    } catch {}
  }

  protected async waitForLocator(locator: Locator, timeout = 10_000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  protected async fillField(
    locator: Locator,
    value: string,
    fieldLabel = 'campo',
    masked = false,
  ): Promise<void> {
    const displayValue = masked ? '***' : value.length > 0 ? `"${value}"` : '(vacío)';
    await this.captureAction(
      'FILL',
      `Ingresa ${displayValue} en ${fieldLabel}`,
      `locator.fill(${displayValue})`,
      async () => {
        await locator.clear();
        await locator.fill(value);
      },
    );
  }

  protected async clickElement(locator: Locator, elementLabel = 'elemento'): Promise<void> {
    await this.captureAction(
      'CLICK',
      `Hace clic en ${elementLabel}`,
      `locator.click()`,
      async () => { await locator.click(); },
    );
  }

  // Selecciona una opción de un <select> nativo por valor, label o índice
  protected async selectOption(
    locator: Locator,
    value: string,
    fieldLabel = 'campo',
  ): Promise<void> {
    await this.captureAction(
      'SELECT',
      `Selecciona "${value}" en ${fieldLabel}`,
      `locator.selectOption('${value}')`,
      async () => { await locator.selectOption(value); },
    );
  }

  // Marca o desmarca un checkbox o radio button
  protected async checkElement(
    locator: Locator,
    elementLabel = 'elemento',
    checked = true,
  ): Promise<void> {
    const verb = checked ? 'Marca' : 'Desmarca';
    await this.captureAction(
      'CHECK',
      `${verb} ${elementLabel}`,
      `locator.setChecked(${checked})`,
      async () => { await locator.setChecked(checked); },
    );
  }

  // Selecciona un registro de una lista, tabla de resultados o autocomplete
  protected async chooseRecord(
    locator: Locator,
    recordLabel = 'registro',
  ): Promise<void> {
    await this.captureAction(
      'CHOOSE',
      `Selecciona registro: ${recordLabel}`,
      `locator.click()`,
      async () => { await locator.click(); },
    );
  }

  // Sube uno o varios archivos a un input de tipo file
  protected async uploadFile(
    locator: Locator,
    filePaths: string | string[],
    fieldLabel = 'archivo',
  ): Promise<void> {
    const display = Array.isArray(filePaths) ? filePaths.join(', ') : filePaths;
    await this.captureAction(
      'UPLOAD',
      `Sube "${display}" en ${fieldLabel}`,
      `locator.setInputFiles('${display}')`,
      async () => { await locator.setInputFiles(filePaths); },
    );
  }

  async takeScreenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({ fullPage: true, path: `test-results/${name}.png` });
  }
}

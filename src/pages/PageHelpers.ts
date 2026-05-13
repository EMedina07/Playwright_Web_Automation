import { Locator, Page } from 'playwright';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { IAttachFn, StepRecord } from '../../core/framework_actions/StepLogger';
import environments from '../../core/settings/EnvironmentSettings';

export abstract class PageHelpers extends BasePage {
  constructor(
    page: Page,
    attachFn?: IAttachFn,
    stepCounter?: { value: number },
    recordStep?: (record: StepRecord) => void,
  ) {
    super(page, attachFn, stepCounter, recordStep);
  }

  protected async navigateAndCapture(
    path: string,
    anchorLocator: Locator,
    description: string,
  ): Promise<void> {
    await this.navigate(`${environments.baseURL}${path}`);
    await this.waitForLocator(anchorLocator);
    await this.captureCurrentState(
      'NAVIGATE',
      description,
      `page.goto('${environments.baseURL}${path}')`,
    );
  }

  protected async navigateAndWaitForRedirect(
    path: string,
    urlPattern: string | RegExp,
    description: string,
    timeout = 15_000,
  ): Promise<void> {
    await this.navigate(`${environments.baseURL}${path}`);
    await this.page.waitForURL(urlPattern, { timeout });
    await this.captureCurrentState(
      'NAVIGATE',
      description,
      `page.goto('${environments.baseURL}${path}')`,
    );
  }

  protected async assertUrlContains(
    fragment: string,
    anchorLocator: Locator,
    description: string,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `expect(page.url()).toContain('${fragment}')`,
      async () => {
        await this.waitForLocator(anchorLocator);
        expect(this.page.url()).toContain(fragment);
      },
    );
  }

  protected async assertUrlMatches(
    urlPattern: string,
    description: string,
    timeout = 10_000,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `page.waitForURL('${urlPattern}')`,
      async () => {
        await this.page.waitForURL(urlPattern, { timeout });
      },
    );
  }

  // Igual que assertUrlMatches pero además espera que anchorLocator sea visible,
  // garantizando que el framework renderizó la página antes del screenshot.
  // Usar cuando la navegación es client-side (SPA) y la URL cambia antes de que
  // los componentes estén montados.
  protected async assertUrlMatchesWithElement(
    urlPattern: string,
    anchorLocator: Locator,
    description: string,
    timeout = 15_000,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `page.waitForURL('${urlPattern}')\nwaitForLocator(anchor)`,
      async () => {
        await this.page.waitForURL(urlPattern, { timeout });
        await this.waitForLocator(anchorLocator, timeout);
      },
    );
  }

  protected async assertLocatorText(
    locator: Locator,
    text: string,
    description: string,
    timeout = 10_000,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `expect(locator).toContainText('${text}')`,
      async () => {
        await this.waitForLocator(locator, timeout);
        await expect(locator).toContainText(text);
      },
    );
  }


  protected async assertAllTextsEqual(
    locator: Locator,
    expectedText: string,
    description: string,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `locator.allTextContents().every(t => t === '${expectedText}')`,
      async () => {
        await locator.first().waitFor({ state: 'visible' });
        const texts = await locator.allTextContents();
        texts.forEach((text) => expect(text.trim()).toBe(expectedText));
      },
    );
  }

  protected async assertXssPayloadBlocked(
    errorLocator: Locator,
    errorText: string,
    description: string,
    timeout = 30_000,
  ): Promise<void> {
    await this.assertCapture(
      description,
      `body no contiene '<script>'\nexpect(errorLocator).toContainText('${errorText}')`,
      async () => {
        const bodyText = (await this.page.locator('body').textContent()) ?? '';
        expect(bodyText).not.toContain('<script>');
        await this.waitForLocator(errorLocator, timeout);
        await expect(errorLocator).toContainText(errorText);
      },
    );
  }
}

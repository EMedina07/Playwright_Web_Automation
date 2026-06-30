import { After, AfterStep, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';
import { renderSkippedCard } from '../../core/framework_actions/StepLogger';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { launchOptions, contextOptions } from '../config/browser.config';
import { CustomWorld } from './world';
import { generateScenarioPdf } from '../../core/reports/PdfReporter';

setDefaultTimeout(60_000);

const cleanedVideoFolders = new Set<string>();

function extractFeatureName(uri: string): string {
  return path.basename(path.dirname(uri));
}

function buildVideoName(scenarioSlug: string, status: 'PASSED' | 'FAILED'): string {
  const date = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '_')
    .replace(/:/g, '-');
  return `${scenarioSlug}_${date}_${status}.webm`;
}

BeforeAll(function () {
  fs.mkdirSync(path.join('test-results', 'traces'), { recursive: true });
  fs.mkdirSync(path.join('test-results', 'videos'), { recursive: true });
});

// Timeout amplio para los hooks: el arranque del navegador y la generación de
// evidencia (PDF/trace/video) pueden tardar más que un step normal, sobre todo en
// ejecución paralela. Es independiente del timeout de los steps (genérico).
Before({ timeout: 120_000 }, async function (this: CustomWorld, scenario) {
  const featureName = extractFeatureName(scenario.pickle.uri);
  const videoDir = path.join('test-results', 'videos', featureName);

  if (!cleanedVideoFolders.has(featureName)) {
    if (fs.existsSync(videoDir)) {
      fs.readdirSync(videoDir)
        .filter((f) => f.endsWith('.webm'))
        .forEach((f) => {
          try { fs.unlinkSync(path.join(videoDir, f)); } catch {}
        });
    }
    cleanedVideoFolders.add(featureName);
  }

  fs.mkdirSync(videoDir, { recursive: true });

  this.browser = await chromium.launch(launchOptions);
  this.context = await this.browser.newContext(contextOptions);

  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  this.page = await this.context.newPage();

  this.consoleLogs = [];
  this.page.on('console', (msg) => {
    if (msg.type() === 'error') {
      this.consoleLogs.push(`[console.error] ${msg.text()}`);
    }
  });
  this.page.on('pageerror', (err) => {
    this.consoleLogs.push(`[page.error] ${err.message}`);
  });
});

AfterStep(async function (this: CustomWorld, { pickleStep, result }) {
  if ((result.status as string) === 'SKIPPED') {
    this.stepCounter.value++;
    const card = renderSkippedCard(this.stepCounter.value, pickleStep.text);
    await this.attach(card, 'text/html');
  }
});

After({ timeout: 120_000 }, async function (this: CustomWorld, scenario) {
  const failed = scenario.result?.status === 'FAILED';
  const willBeRetried = (scenario.result as { willBeRetried?: boolean })?.willBeRetried ?? false;
  const scenarioSlug = scenario.pickle.name.replace(/\s+/g, '-').toLowerCase();
  const featureName = extractFeatureName(scenario.pickle.uri);
  const tracePrefix = `${scenarioSlug}-${scenario.pickle.id.slice(0, 8)}`;
  const videoDir = path.join('test-results', 'videos', featureName);

  // Generate PDF evidence only on final execution (not intermediate retries)
  if (!willBeRetried && this.stepRecords.length > 0) {
    try {
      const pdfPath = await generateScenarioPdf(
        {
          name: scenario.pickle.name,
          featureName,
          status: failed ? 'failed' : 'passed',
          tags: scenario.pickle.tags.map((t) => t.name),
        },
        this.stepRecords,
      );
      this.attach(`PDF de evidencia: ${path.resolve(pdfPath)}`, 'text/plain');
    } catch {}
  }

  if (failed && !willBeRetried) {
    // Final failure — save all evidence
    const screenshot = await this.page?.screenshot({ fullPage: true });
    if (screenshot) this.attach(screenshot, 'image/png');

    const currentUrl = this.page?.url();
    if (currentUrl) this.attach(`URL al fallar: ${currentUrl}`, 'text/plain');

    if (this.consoleLogs.length > 0) {
      this.attach(`Errores de consola:\n${this.consoleLogs.join('\n')}`, 'text/plain');
    }

    await this.context?.tracing.stop({
      path: path.join('test-results', 'traces', `${tracePrefix}.zip`),
    });

    const videoPath = await this.page?.video()?.path();
    await this.context?.close();
    await this.browser?.close();

    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(videoDir, buildVideoName(scenarioSlug, 'FAILED'));
      fs.renameSync(videoPath, dest);
      this.attach(`Video del fallo: ${path.resolve(dest)}`, 'text/plain');
    }
  } else if (failed && willBeRetried) {
    // Intermediate failure — discard evidence and prepare clean slate for retry
    const videoPath = await this.page?.video()?.path();
    await this.context?.tracing.stop();
    await this.context?.close();
    await this.browser?.close();

    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  } else {
    // Passed (first attempt or successful retry)
    await this.context?.tracing.stop();

    const videoPath = await this.page?.video()?.path();
    await this.context?.close();
    await this.browser?.close();

    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(videoDir, buildVideoName(scenarioSlug, 'PASSED'));
      fs.renameSync(videoPath, dest);
    }
  }
});

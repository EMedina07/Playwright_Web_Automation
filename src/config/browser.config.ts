import * as path from 'path';
import { BrowserContextOptions, LaunchOptions } from 'playwright';

const isCI = !!process.env.CI;
// Headless si es CI o si se pide explícitamente con HEADLESS=true (genérico, sirve en cualquier proyecto).
const isHeadless = isCI || process.env.HEADLESS === 'true';
const shouldRecordVideo = isCI || process.env.RECORD_VIDEO === 'true';

export const launchOptions: LaunchOptions = {
  headless: isHeadless,
  args: isHeadless ? [] : ['--start-maximized'],
};

export const contextOptions: BrowserContextOptions = {
  viewport: isHeadless ? { width: 1280, height: 720 } : null,
  ...(shouldRecordVideo && {
    recordVideo: {
      dir: path.join('test-results', 'videos'),
      size: { width: 1280, height: 720 },
    },
  }),
};

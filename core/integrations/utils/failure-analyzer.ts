import { QACucumberResult, QAStep } from '../types/qa-bridge.types';

export type FailureClassification = 'framework' | 'application';

export type FrameworkErrorCategory =
  | 'timeout'
  | 'element-not-found'
  | 'strict-mode'
  | 'page-crash'
  | 'network-error'
  | 'type-error'
  | 'unknown-framework';

export type ApplicationErrorCategory =
  | 'assertion-text'
  | 'assertion-visibility'
  | 'assertion-url'
  | 'assertion-value'
  | 'assertion-generic'
  | 'unknown-application';

export type ErrorCategory = FrameworkErrorCategory | ApplicationErrorCategory;

export interface FailureAnalysis {
  classification: FailureClassification;
  errorCategory: ErrorCategory;
  errorTitle: string;
  errorDetail: string;
  failedStep: QAStep | null;
  failedStepIndex: number;
  lastSuccessfulStep: QAStep | null;
  reproductionSteps: string[];
  suggestedFix: string;
}

// ─── Classification patterns ──────────────────────────────────────────────────

const FRAMEWORK_PATTERNS: Array<{
  pattern: RegExp;
  category: FrameworkErrorCategory;
  title: string;
  fix: string;
}> = [
  {
    pattern: /TimeoutError|Timeout \d+ms exceeded|page\.waitForSelector|locator\.waitFor/i,
    category: 'timeout',
    title: 'Timeout — El elemento o la navegación no respondió a tiempo',
    fix: 'Revisar el selector, aumentar el timeout configurado o verificar que el elemento existe en el DOM. Considerar condiciones de red lentas.',
  },
  {
    pattern: /strict mode violation|resolved to \d+ elements/i,
    category: 'strict-mode',
    title: 'Strict mode violation — El selector resuelve múltiples elementos',
    fix: 'Usar un selector más específico o agregar .nth(0) para seleccionar el primer elemento.',
  },
  {
    pattern: /locator.*not found|resolved to 0 elements|No element.*found|element not found/i,
    category: 'element-not-found',
    title: 'Element not found — El elemento no existe en la página',
    fix: 'Verificar que el selector es correcto y que el elemento está presente en el DOM en el momento de la interacción.',
  },
  {
    pattern: /Target closed|page.*closed|browser.*disconnected/i,
    category: 'page-crash',
    title: 'Page crash — El navegador o la página se cerró inesperadamente',
    fix: 'Revisar si la aplicación genera un crash. Verificar logs del servidor y el estado del ambiente.',
  },
  {
    pattern: /net::ERR_|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ECONNREFUSED/i,
    category: 'network-error',
    title: 'Error de red — Problema de conectividad o URL inválida',
    fix: 'Verificar que la BASE_URL es correcta y el servidor está disponible. Revisar variables de entorno.',
  },
  {
    pattern: /TypeError|ReferenceError|Cannot read prop|is not a function|is not defined/i,
    category: 'type-error',
    title: 'Error de implementación — Error de TypeScript/JavaScript en el script',
    fix: 'Revisar el step definition. Verificar imports, tipos y que los métodos existen.',
  },
];

const APPLICATION_PATTERNS: Array<{
  pattern: RegExp;
  category: ApplicationErrorCategory;
  title: string;
}> = [
  {
    pattern: /toContainText|toHaveText|toContain\(/i,
    category: 'assertion-text',
    title: 'Assertion de texto — El texto en pantalla no coincide con el esperado',
  },
  {
    pattern: /toBeVisible|toBeHidden|toBeAttached/i,
    category: 'assertion-visibility',
    title: 'Assertion de visibilidad — El elemento no tiene la visibilidad esperada',
  },
  {
    pattern: /toHaveURL|toMatchURL/i,
    category: 'assertion-url',
    title: 'Assertion de URL — La URL actual no coincide con la esperada',
  },
  {
    pattern: /toHaveValue|toHaveAttribute|toBe\(|toEqual\(|toBeLessThan|toBeGreaterThan/i,
    category: 'assertion-value',
    title: 'Assertion de valor — El valor obtenido no coincide con el esperado',
  },
  {
    pattern: /expect\(|Expected.*\nReceived|AssertionError/i,
    category: 'assertion-generic',
    title: 'Assertion fallida — La condición de prueba no se cumplió',
  },
];

function classifyError(errorMessage: string): {
  classification: FailureClassification;
  errorCategory: ErrorCategory;
  errorTitle: string;
  suggestedFix: string;
} {
  for (const { pattern, category, title, fix } of FRAMEWORK_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return { classification: 'framework', errorCategory: category, errorTitle: title, suggestedFix: fix };
    }
  }
  for (const { pattern, category, title } of APPLICATION_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        classification: 'application',
        errorCategory: category,
        errorTitle: title,
        suggestedFix: 'Defecto funcional — debe ser revisado por el equipo de desarrollo.',
      };
    }
  }
  return {
    classification: 'application',
    errorCategory: 'unknown-application',
    errorTitle: 'Error desconocido — No clasificado automáticamente',
    suggestedFix: 'Revisar el mensaje de error completo y el comportamiento de la aplicación.',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function analyzeFailure(scenario: QACucumberResult): FailureAnalysis {
  const failedStepIndex = scenario.steps.findIndex((s) => s.status === 'failed');
  const failedStep: QAStep | null = failedStepIndex >= 0 ? scenario.steps[failedStepIndex] : null;
  const errorMessage = failedStep?.errorMessage ?? '';

  const lastSuccessfulStep: QAStep | null = failedStepIndex > 0
    ? scenario.steps[failedStepIndex - 1]
    : null;

  const { classification, errorCategory, errorTitle, suggestedFix } = classifyError(errorMessage);

  const reproductionSteps = scenario.steps
    .filter((s) => s.status !== 'skipped')
    .map((s, i) => {
      const icon = s.status === 'passed' ? '✅' : s.status === 'failed' ? '❌' : '⚠️';
      return `${i + 1}. ${icon} ${s.keyword.trim()} ${s.text}`;
    });

  return {
    classification,
    errorCategory,
    errorTitle,
    errorDetail: errorMessage,
    failedStep,
    failedStepIndex,
    lastSuccessfulStep,
    reproductionSteps,
    suggestedFix,
  };
}

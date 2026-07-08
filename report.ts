import report from 'multiple-cucumber-html-reporter';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Limpia la salida HTML anterior para regenerar fresco cada corrida: evita archivos
// acumulados de ejecuciones previas y garantiza que los assets se copien desde cero.
// No toca el JSON (reports/cucumber-report.json) ni cambia cómo se presentan las evidencias.
fs.rmSync(path.resolve('reports', 'html'), { recursive: true, force: true });

report.generate({
  jsonDir: 'reports',
  reportPath: 'reports/html',
  reportName: 'Cucumber Report',
  pageTitle: 'Resultados de pruebas',
  displayDuration: true,
  metadata: {
    browser: {
      name: 'chrome',
      version: 'latest',
    },
    device: 'Local test machine',
    platform: {
      name: 'windows',
      version: '11 Enterprise',
    },
  },
  customData: {
    title: 'Run info',
    data: [
      { label: 'Project', value: 'Workflow' },
      { label: 'Release', value: '1.0.0' },
      { label: 'Environment', value: (process.env.ENV ?? 'unknown').toUpperCase() },
      { label: 'SDET Engineer', value: 'Ezequiel Medina Adames' },
      { label: 'Executed', value: new Date().toLocaleString() },
    ],
  },
});

// Red de seguridad: en algunos entornos (p. ej. carpetas sincronizadas por OneDrive)
// el reporter no logra copiar sus assets (jQuery/Bootstrap/DataTables) y el HTML queda
// sin estilos ni scripts — los escenarios, casos y evidencias no se ven. Los copiamos
// nosotros para garantizar un reporte funcional. Genérico y reaplicable a cualquier equipo.
try {
  const pkgRoot = path.dirname(require.resolve('multiple-cucumber-html-reporter/package.json'));
  const assetsSrc = path.join(pkgRoot, 'templates', 'assets');
  const assetsDest = path.resolve('reports', 'html', 'assets');
  fs.cpSync(assetsSrc, assetsDest, { recursive: true });
} catch (e) {
  console.warn('Aviso: no se pudieron copiar los assets del reporte:', (e as Error).message);
}

const reportPath = path.resolve('reports', 'html', 'index.html');
console.log(`\nReporte generado: ${reportPath}`);

if (!process.env.CI) {
  try {
    if (process.platform === 'win32') {
      execSync(`cmd /c start "" "${reportPath}"`);
    } else if (process.platform === 'darwin') {
      execSync(`open "${reportPath}"`);
    } else {
      execSync(`xdg-open "${reportPath}"`);
    }
  } catch {
    console.log('Abre manualmente el reporte en tu browser.');
  }
}

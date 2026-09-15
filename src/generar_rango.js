/**
 * Genera verificación por rango de fechas con columna Lote.
 *
 * Uso:
 *   node src/generar_rango.js
 *   node src/generar_rango.js 2026-08-16 2026-09-14
 */
import { config } from './config.js';
import { closePool } from './db.js';
import {
  obtenerDiscrepancias,
  obtenerResumenVerificacion,
  obtenerTodasLasLineas,
} from './verificar.js';
import { generarExcel } from './report.js';

function fechaBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function main() {
  const fechaDesde = process.argv[2] || '2026-08-16';
  const fechaHasta = process.argv[3] || '2026-09-14';
  const opts = { fechaDesde, fechaHasta };

  console.log(`\n🔎 Verificación con lote — ${fechaDesde} a ${fechaHasta}`);

  const [resumen, discrepancias, todasLasLineas] = await Promise.all([
    obtenerResumenVerificacion(opts),
    obtenerDiscrepancias(opts),
    obtenerTodasLasLineas(opts),
  ]);

  console.log('Resumen:', resumen);
  console.log(`Discrepancias: ${discrepancias.length} · Todas las líneas: ${todasLasLineas.length}`);

  const conLote = todasLasLineas.filter((r) => r.lote).length;
  console.log(`Líneas con lote: ${conLote} / ${todasLasLineas.length}`);

  const { rutaExcel, nombreArchivo } = await generarExcel({
    fechaReporte: fechaBogota(),
    resumen,
    discrepancias,
    todasLasLineas,
    fechaDesde,
    fechaHasta,
    nombrePrefijo: 'verificacion_precios_cortes_con_lote',
  });

  console.log(`\nExcel: ${rutaExcel}`);
  console.log(`Archivo: ${nombreArchivo}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

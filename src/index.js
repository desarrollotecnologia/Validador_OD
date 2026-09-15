/**
 * Verificación de precios de cortes en facturas SIRT vs lista estándar.
 *
 * Uso:
 *   node src/index.js              -> agenda cron
 *   node src/index.js --now        -> corre ahora y notifica si hay desvíos
 *   node src/index.js --prueba     -> corre ahora y notifica solo a REPORT_NOTIFY_TO
 *   node src/index.js --now --sin-correo -> solo genera Excel en /output
 */
import cron from 'node-cron';
import { config } from './config.js';
import { closePool } from './db.js';
import {
  obtenerDiscrepancias,
  obtenerResumenVerificacion,
  obtenerTodasLasLineas,
} from './verificar.js';
import { generarExcel } from './report.js';
import { enviarNotificacion } from './email.js';

function fechaBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function ejecutarVerificacion({
  esPrueba = false,
  sinCorreo = false,
  dias = config.diasVerificacion,
} = {}) {
  const fechaReporte = fechaBogota();
  console.log(`\n🔎 Verificación precios cortes — ${fechaReporte} (últimos ${dias} días)`);

  const [resumen, discrepancias, todasLasLineas] = await Promise.all([
    obtenerResumenVerificacion({ dias }),
    obtenerDiscrepancias({ dias }),
    obtenerTodasLasLineas({ dias }),
  ]);

  console.log('Resumen:', resumen);
  console.log(`Discrepancias: ${discrepancias.length} · Todas las líneas: ${todasLasLineas.length}`);

  let rutaExcel = null;
  let nombreArchivo = null;

  const generar = () =>
    generarExcel({
      fechaReporte,
      resumen,
      discrepancias,
      todasLasLineas,
      dias,
    });

  if (discrepancias.length > 0 || config.notificarSiOk || todasLasLineas.length > 0) {
    ({ rutaExcel, nombreArchivo } = await generar());
    console.log(`Excel: ${rutaExcel}`);
  }

  const hayDesvios = Number(resumen.lineas_con_desvio) > 0;
  const debeNotificar = !sinCorreo && (hayDesvios || config.notificarSiOk || esPrueba);

  if (debeNotificar) {
    if (!rutaExcel) {
      ({ rutaExcel, nombreArchivo } = await generar());
    }
    const info = await enviarNotificacion({
      rutaExcel,
      nombreArchivo,
      resumen,
      fechaReporte,
      dias,
      discrepancias,
      esPrueba,
    });
    console.log(`Correo enviado: ${info.messageId}`);
  } else if (sinCorreo) {
    console.log('Modo sin correo: solo reporte local.');
  } else if (!hayDesvios) {
    console.log('Sin desvíos: no se envía notificación (NOTIFICAR_SI_OK=false).');
  }

  return { resumen, discrepancias, todasLasLineas, rutaExcel, nombreArchivo };
}

function parseArgs(argv) {
  return {
    now: argv.includes('--now') || argv.includes('--prueba'),
    prueba: argv.includes('--prueba'),
    sinCorreo: argv.includes('--sin-correo'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.now) {
    try {
      await ejecutarVerificacion({ esPrueba: args.prueba, sinCorreo: args.sinCorreo });
    } finally {
      await closePool();
    }
    return;
  }

  if (!cron.validate(config.cronSchedule)) {
    throw new Error(`CRON_SCHEDULE inválido: ${config.cronSchedule}`);
  }

  console.log(`⏰ Cron activo: "${config.cronSchedule}" (${config.timezone})`);
  console.log('Usa --now para ejecutar inmediatamente o --prueba para notificar a REPORT_NOTIFY_TO.');

  cron.schedule(
    config.cronSchedule,
    async () => {
      try {
        await ejecutarVerificacion();
      } catch (err) {
        console.error('Error en verificación programada:', err);
      }
    },
    { timezone: config.timezone }
  );
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closePool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

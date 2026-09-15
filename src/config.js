import dotenv from 'dotenv';
dotenv.config();

function envStr(key, fallback = '') {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  return String(v).replace(/^"(.*)"$/, '$1').trim();
}

function envInt(key, fallback) {
  const n = Number(envStr(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key, fallback = false) {
  const v = envStr(key, String(fallback)).toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí'].includes(v)) return true;
  if (['0', 'false', 'no'].includes(v)) return false;
  return fallback;
}

function envList(key) {
  return envStr(key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  pg: {
    host: envStr('POSTGRES_HOST'),
    port: envInt('POSTGRES_PORT', 5432),
    database: envStr('POSTGRES_DB'),
    user: envStr('POSTGRES_USER'),
    password: envStr('POSTGRES_PASSWORD'),
    ssl: envBool('POSTGRES_SSL', false) ? { rejectUnauthorized: false } : false,
  },
  smtp: {
    host: envStr('SMTP_HOST'),
    port: envInt('SMTP_PORT', 465),
    user: envStr('SMTP_USER'),
    password: envStr('SMTP_PASSWORD'),
    useTls: envBool('SMTP_USE_TLS', false),
    from: envStr('SMTP_FROM'),
    fromName: envStr('SMTP_FROM_NAME', 'Verificacion Precios Cortes SIRT'),
  },
  reportTo: envList('REPORT_TO'),
  reportNotifyTo: envList('REPORT_NOTIFY_TO'),
  diasVerificacion: envInt('DIAS_VERIFICACION', 7),
  toleranciaPrecio: envInt('TOLERANCIA_PRECIO', 1),
  ignorarPrecioListaCero: envBool('IGNORAR_PRECIO_LISTA_CERO', true),
  tipoFactura: envStr('TIPO_FACTURA', 'Venta Carne'),
  cronSchedule: envStr('CRON_SCHEDULE', '30 7 * * *'),
  timezone: envStr('TIMEZONE', 'America/Bogota'),
  notificarSiOk: envBool('NOTIFICAR_SI_OK', false),
};

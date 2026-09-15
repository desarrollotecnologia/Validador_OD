import nodemailer from 'nodemailer';
import { readFile } from 'fs/promises';
import { config } from './config.js';

function crearTransportador() {
  const { smtp } = config;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465 || !smtp.useTls,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
    tls: smtp.useTls ? { rejectUnauthorized: false } : undefined,
  });
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-CO');
}

function cuerpoHtml({ fechaReporte, resumen, dias, esPrueba, hayDesvios, muestra }) {
  const filasMuestra = (muestra || [])
    .slice(0, 15)
    .map(
      (r) => `
      <tr>
        <td>${String(r.fecha_factura).slice(0, 10)}</td>
        <td>${r.id_factura}</td>
        <td>${r.cliente || ''}</td>
        <td>${r.criterio || ''}</td>
        <td align="right">${fmt(r.precio_factura)}</td>
        <td align="right">${fmt(r.precio_lista)}</td>
        <td align="right">${fmt(r.diferencia_unitaria)}</td>
        <td>${r.tipo_desvio}</td>
      </tr>`
    )
    .join('');

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;color:#333;">
    <h2 style="color:${hayDesvios ? '#c62828' : '#259c39'};">
      Verificación precios de cortes vs lista SIRT
    </h2>
    ${esPrueba ? '<p style="background:#fff9c4;padding:10px;border-radius:6px;"><strong>Modo prueba.</strong></p>' : ''}
    <p>Fecha: <strong>${fechaReporte}</strong> · Ventana: últimos <strong>${dias}</strong> días</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:12px 0;">
      <tr style="background:${hayDesvios ? '#c62828' : '#259c39'};color:white;"><th colspan="2">Resultado</th></tr>
      <tr><td>Facturas revisadas</td><td align="center"><strong>${fmt(resumen.facturas_revisadas)}</strong></td></tr>
      <tr style="background:#ffe0b2;"><td>Facturas con desvío</td><td align="center"><strong>${fmt(resumen.facturas_con_desvio)}</strong></td></tr>
      <tr><td>Líneas revisadas</td><td align="center"><strong>${fmt(resumen.lineas_revisadas)}</strong></td></tr>
      <tr><td>Líneas OK</td><td align="center"><strong>${fmt(resumen.lineas_ok)}</strong></td></tr>
      <tr style="background:#ffcdd2;"><td>Líneas con desvío</td><td align="center"><strong>${fmt(resumen.lineas_con_desvio)}</strong></td></tr>
    </table>
    ${
      hayDesvios
        ? `<p><strong>Hay facturas cuyo precio de corte no coincide con el precio estándar de la lista.</strong></p>
           <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
             <tr style="background:#1b5e20;color:white;">
               <th>Fecha</th><th>ID Factura</th><th>Cliente</th><th>Corte</th>
               <th>Precio factura</th><th>Precio lista</th><th>Diff</th><th>Tipo</th>
             </tr>
             ${filasMuestra}
           </table>
           <p style="margin-top:1rem;color:#666;font-size:12px;">Detalle completo en el Excel adjunto.</p>`
        : '<p>Todas las líneas de corte revisadas coinciden con el precio de lista (dentro de la tolerancia).</p>'
    }
  </div>`;
}

export async function enviarNotificacion({
  rutaExcel,
  nombreArchivo,
  resumen,
  fechaReporte,
  dias,
  discrepancias,
  esPrueba = false,
  destinatarios,
}) {
  const hayDesvios = Number(resumen.lineas_con_desvio) > 0;
  const to = (destinatarios && destinatarios.length
    ? destinatarios
    : esPrueba
      ? config.reportNotifyTo
      : config.reportTo
  ).filter(Boolean);

  if (!to.length) {
    throw new Error('No hay destinatarios configurados (REPORT_TO / REPORT_NOTIFY_TO).');
  }

  const transport = crearTransportador();
  const html = cuerpoHtml({
    fechaReporte,
    resumen,
    dias,
    esPrueba,
    hayDesvios,
    muestra: discrepancias,
  });

  const subject = esPrueba
    ? `[PRUEBA] Verificación precios cortes ${fechaReporte} — ${resumen.lineas_con_desvio} desvíos`
    : hayDesvios
      ? `ALERTA precios cortes ${fechaReporte} — ${resumen.facturas_con_desvio} facturas / ${resumen.lineas_con_desvio} líneas fuera de lista`
      : `OK verificación precios cortes ${fechaReporte}`;

  const attachments = [];
  if (rutaExcel && nombreArchivo) {
    attachments.push({
      filename: nombreArchivo,
      content: await readFile(rutaExcel),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  return transport.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.from}>`,
    to: to.join(', '),
    subject,
    html,
    attachments,
  });
}

export async function verificarSmtp() {
  const transport = crearTransportador();
  await transport.verify();
  return true;
}

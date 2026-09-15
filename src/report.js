import ExcelJS from 'exceljs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'output');

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v;
}

function fechaStr(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Evita "Mon Sep 14..." de toString() local; prefiere YYYY-MM-DD
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

const COLUMNAS = [
  { header: 'Fecha', key: 'fecha_factura', width: 12 },
  { header: 'ID Factura', key: 'id_factura', width: 12 },
  { header: 'Numeración', key: 'numeracion', width: 14 },
  { header: 'N° Factura', key: 'numero_factura', width: 12 },
  { header: 'Cliente', key: 'cliente', width: 32 },
  { header: 'NIT', key: 'nit_cliente', width: 14 },
  { header: 'Lote', key: 'lote', width: 42 },
  { header: 'Criterio / Corte', key: 'criterio', width: 28 },
  { header: 'Cód. producto', key: 'codigo_producto', width: 14 },
  { header: 'Cortes asociados', key: 'cortes_asociados', width: 36 },
  { header: 'Precio factura', key: 'precio_factura', width: 14 },
  { header: 'Precio lista', key: 'precio_lista', width: 14 },
  { header: 'Diff unitaria', key: 'diferencia_unitaria', width: 14 },
  { header: 'Cantidad (kg)', key: 'cantidad', width: 12 },
  { header: 'Subtotal línea', key: 'subtotal', width: 14 },
  { header: 'Impacto total', key: 'impacto_total', width: 14 },
  { header: 'Estado', key: 'estado', width: 10 },
  { header: 'Tipo desvío', key: 'tipo_desvio', width: 16 },
  { header: 'Valor factura', key: 'valor_factura', width: 14 },
  { header: 'Usuario', key: 'usuario_factura', width: 18 },
  { header: 'Contabilizado', key: 'contabilizado', width: 12 },
];

function estiloEncabezado(ws) {
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B5E20' },
  };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
}

function agregarFilas(ws, filas) {
  for (const row of filas) {
    const excelRow = ws.addRow({
      fecha_factura: fechaStr(row.fecha_factura),
      id_factura: row.id_factura,
      numeracion: row.numeracion ?? '',
      numero_factura: row.numero_factura ?? '',
      cliente: row.cliente ?? '',
      nit_cliente: row.nit_cliente ?? '',
      lote: row.lote ?? '',
      criterio: row.criterio ?? '',
      codigo_producto: row.codigo_producto ?? '',
      cortes_asociados: row.cortes_asociados ?? '',
      precio_factura: money(row.precio_factura),
      precio_lista: money(row.precio_lista),
      diferencia_unitaria: money(row.diferencia_unitaria),
      cantidad: money(row.cantidad),
      subtotal: money(row.subtotal),
      impacto_total: money(row.impacto_total),
      estado: row.estado ?? (row.tipo_desvio === 'OK' ? 'OK' : 'DESVIO'),
      tipo_desvio: row.tipo_desvio,
      valor_factura: money(row.valor_factura),
      usuario_factura: row.usuario_factura ?? '',
      contabilizado: row.contabilizado ?? '',
    });

    if (row.tipo_desvio === 'MAYOR_A_LISTA') {
      excelRow.getCell('tipo_desvio').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCDD2' },
      };
      excelRow.getCell('estado').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCDD2' },
      };
    } else if (row.tipo_desvio === 'MENOR_A_LISTA') {
      excelRow.getCell('tipo_desvio').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0B2' },
      };
      excelRow.getCell('estado').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0B2' },
      };
    } else if (row.tipo_desvio === 'OK') {
      excelRow.getCell('estado').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC8E6C9' },
      };
    }
  }

  ['precio_factura', 'precio_lista', 'diferencia_unitaria', 'subtotal', 'impacto_total', 'valor_factura'].forEach((col) => {
    ws.getColumn(col).numFmt = '#,##0.00';
  });
  ws.getColumn('cantidad').numFmt = '#,##0.00';
}

/**
 * Genera Excel con resumen, discrepancias y todos los cortes (OK + desvíos).
 * @returns {Promise<{ rutaExcel: string, nombreArchivo: string }>}
 */
export async function generarExcel({
  fechaReporte,
  resumen,
  discrepancias,
  todasLasLineas = [],
  dias,
  fechaDesde = null,
  fechaHasta = null,
  nombrePrefijo = 'verificacion_precios_cortes',
}) {
  await mkdir(OUT_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Verificacion Precios Cortes SIRT';
  wb.created = new Date();

  const wsResumen = wb.addWorksheet('Resumen');
  wsResumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 40 },
    { header: 'Valor', key: 'valor', width: 24 },
  ];
  const filasResumen = [
    { concepto: 'Fecha verificación', valor: fechaReporte },
  ];
  if (fechaDesde && fechaHasta) {
    filasResumen.push(
      { concepto: 'Fecha desde', valor: fechaDesde },
      { concepto: 'Fecha hasta', valor: fechaHasta }
    );
  } else {
    filasResumen.push({ concepto: 'Ventana (días)', valor: dias });
  }
  filasResumen.push(
    { concepto: 'Facturas revisadas', valor: resumen.facturas_revisadas },
    { concepto: 'Facturas con desvío', valor: resumen.facturas_con_desvio },
    { concepto: 'Líneas revisadas', valor: resumen.lineas_revisadas },
    { concepto: 'Líneas OK (precio lista)', valor: resumen.lineas_ok },
    { concepto: 'Líneas con desvío', valor: resumen.lineas_con_desvio }
  );
  wsResumen.addRows(filasResumen);
  wsResumen.getRow(1).font = { bold: true };

  const wsDisc = wb.addWorksheet('Discrepancias');
  wsDisc.columns = COLUMNAS;
  estiloEncabezado(wsDisc);
  agregarFilas(wsDisc, discrepancias);

  const wsTodos = wb.addWorksheet('Todos los cortes');
  wsTodos.columns = COLUMNAS;
  estiloEncabezado(wsTodos);
  agregarFilas(wsTodos, todasLasLineas);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rango =
    fechaDesde && fechaHasta
      ? `${fechaDesde}_a_${fechaHasta}`
      : fechaReporte;
  const nombreArchivo = `${nombrePrefijo}_${rango}_${stamp}.xlsx`;
  const rutaExcel = path.join(OUT_DIR, nombreArchivo);
  try {
    await wb.xlsx.writeFile(rutaExcel);
  } catch (err) {
    if (err && err.code === 'EBUSY') {
      const alt = path.join(OUT_DIR, `${nombrePrefijo}_${rango}_${Date.now()}.xlsx`);
      await wb.xlsx.writeFile(alt);
      return { rutaExcel: alt, nombreArchivo: path.basename(alt) };
    }
    throw err;
  }

  return { rutaExcel, nombreArchivo };
}

import ExcelJS from 'exceljs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'output');

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : '';
}

function fechaStr(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v).slice(0, 10);
}

function header(ws) {
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1565C0' },
  };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
}

function moneyCols(ws, cols) {
  for (const col of cols) ws.getColumn(col).numFmt = '#,##0.00';
}

/**
 * Excel jerárquico OD:
 * 1) Resumen cliente
 * 2) Corte + OD (lotes agregados)
 * 3) Detalle lote (máximo detalle)
 */
export async function generarExcelOdCliente({
  fechaDesde,
  fechaHasta,
  resumenClientes,
  porCorteOd,
  detalleLote,
  clienteFiltro = null,
}) {
  await mkdir(OUT_DIR, { recursive: true });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Desglose OD por cliente';
  wb.created = new Date();

  // --- Resumen ---
  const wsR = wb.addWorksheet('Resumen cliente');
  wsR.columns = [
    { header: 'Cliente', key: 'cliente', width: 36 },
    { header: 'NIT', key: 'nit', width: 14 },
    { header: '# Órdenes OD', key: 'num_ordenes', width: 12 },
    { header: '# Cortes', key: 'num_cortes', width: 10 },
    { header: '# Lotes', key: 'num_lotes', width: 10 },
    { header: 'Kg total', key: 'kg_total', width: 12 },
    { header: 'Valor OD', key: 'valor_od', width: 14 },
  ];
  header(wsR);
  for (const r of resumenClientes) wsR.addRow(r);
  moneyCols(wsR, ['kg_total', 'valor_od']);

  // --- Corte + OD ---
  const wsC = wb.addWorksheet('Corte y OD');
  wsC.columns = [
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'NIT', key: 'nit', width: 12 },
    { header: 'Corte', key: 'corte', width: 26 },
    { header: 'Cód. corte', key: 'codigo_corte', width: 10 },
    { header: 'Orden OD', key: 'orden_od', width: 12 },
    { header: 'Fecha despacho', key: 'fecha_despacho', width: 14 },
    { header: 'Kg (suma lotes)', key: 'kg', width: 14 },
    { header: '# Lotes', key: 'num_lotes', width: 10 },
    { header: 'Lotes', key: 'lotes', width: 48 },
    { header: 'Precio OD', key: 'precio_od', width: 12 },
    { header: 'Desc. %', key: 'descuento_pct', width: 10 },
    { header: 'Precio lista', key: 'precio_lista', width: 12 },
    { header: 'Vs lista', key: 'vs_lista', width: 12 },
    { header: 'Subtotal OD (corte)', key: 'subtotal_od', width: 16 },
    { header: 'Valor orden (OD)', key: 'valor_od_orden', width: 16 },
    { header: 'Valor orden facturada', key: 'valor_factura', width: 18 },
    { header: 'Productos factura', key: 'valor_productos_factura', width: 16 },
  ];
  header(wsC);
  for (const r of porCorteOd) {
    const row = wsC.addRow({
      ...r,
      fecha_despacho: fechaStr(r.fecha_despacho),
      precio_od: money(r.precio_od),
      descuento_pct: money(r.descuento_pct),
      precio_lista: money(r.precio_lista),
      kg: money(r.kg),
      subtotal_od: money(r.subtotal_od),
      valor_od_orden: money(r.valor_od_orden),
      valor_factura: money(r.valor_factura),
      valor_productos_factura: money(r.valor_productos_factura),
    });
    if (r.vs_lista === 'MENOR_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0B2' },
      };
    } else if (r.vs_lista === 'MAYOR_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCDD2' },
      };
    } else if (r.vs_lista === 'IGUAL_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC8E6C9' },
      };
    }
  }
  moneyCols(wsC, [
    'kg',
    'precio_od',
    'descuento_pct',
    'precio_lista',
    'subtotal_od',
    'valor_od_orden',
    'valor_factura',
    'valor_productos_factura',
  ]);

  // --- Detalle lote ---
  const wsD = wb.addWorksheet('Detalle lote');
  wsD.columns = [
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'NIT', key: 'nit', width: 12 },
    { header: 'Corte', key: 'corte', width: 26 },
    { header: 'Cód. corte', key: 'codigo_corte', width: 10 },
    { header: 'Orden OD', key: 'orden_od', width: 12 },
    { header: 'Fecha despacho', key: 'fecha_despacho', width: 14 },
    { header: 'Lote', key: 'lote', width: 18 },
    { header: 'Kg llevados', key: 'kg', width: 12 },
    { header: 'Precio OD', key: 'precio_od', width: 12 },
    { header: 'Desc. %', key: 'descuento_pct', width: 10 },
    { header: 'Precio lista', key: 'precio_lista', width: 12 },
    { header: 'Diff vs lista', key: 'diff_vs_lista', width: 12 },
    { header: 'Vs lista', key: 'vs_lista', width: 12 },
    { header: 'Subtotal línea', key: 'subtotal_od', width: 14 },
    { header: 'Valor orden (OD)', key: 'valor_od_orden', width: 16 },
    { header: 'Valor orden facturada', key: 'valor_factura', width: 18 },
  ];
  header(wsD);
  for (const r of detalleLote) {
    const row = wsD.addRow({
      cliente: r.cliente,
      nit: r.nit,
      corte: r.corte,
      codigo_corte: r.codigo_corte,
      orden_od: r.orden_od,
      fecha_despacho: fechaStr(r.fecha_despacho),
      lote: r.lote,
      kg: money(r.kg),
      precio_od: money(r.precio_od),
      descuento_pct: money(r.descuento_pct),
      precio_lista: money(r.precio_lista),
      diff_vs_lista: money(r.diff_vs_lista),
      vs_lista: r.vs_lista,
      subtotal_od: money(r.subtotal_od),
      valor_od_orden: money(r.valor_od_orden),
      valor_factura: money(r.valor_factura),
    });
    if (r.vs_lista === 'MENOR_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0B2' },
      };
    } else if (r.vs_lista === 'MAYOR_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCDD2' },
      };
    } else if (r.vs_lista === 'IGUAL_LISTA') {
      row.getCell('vs_lista').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC8E6C9' },
      };
    }
  }
  moneyCols(wsD, [
    'kg',
    'precio_od',
    'descuento_pct',
    'precio_lista',
    'diff_vs_lista',
    'subtotal_od',
    'valor_od_orden',
    'valor_factura',
  ]);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufijo = clienteFiltro
    ? `_${String(clienteFiltro).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}`
    : '';
  const nombreArchivo = `desglose_OD_cliente_${fechaDesde}_a_${fechaHasta}${sufijo}_${stamp}.xlsx`;
  const rutaExcel = path.join(OUT_DIR, nombreArchivo);
  await wb.xlsx.writeFile(rutaExcel);
  return { rutaExcel, nombreArchivo };
}

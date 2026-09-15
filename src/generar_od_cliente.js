/**
 * Desglose Cliente → Corte → OD → Lote (precio de la orden, no factura).
 *
 * Uso:
 *   node src/generar_od_cliente.js
 *   node src/generar_od_cliente.js 2026-08-16 2026-09-14
 *   node src/generar_od_cliente.js 2026-08-16 2026-09-14 "SUPERCARNES"
 */
import { closePool } from './db.js';
import {
  obtenerDetalleOdPorCliente,
  obtenerResumenClienteOd,
  agregarPorCorteOd,
} from './od_cliente.js';
import { generarExcelOdCliente } from './report_od.js';

async function main() {
  const fechaDesde = process.argv[2] || '2026-08-16';
  const fechaHasta = process.argv[3] || '2026-09-14';
  const cliente = process.argv[4] || null;

  console.log(`\n📦 Desglose OD — ${fechaDesde} a ${fechaHasta}${cliente ? ` · cliente: ${cliente}` : ''}`);

  const detalleLote = await obtenerDetalleOdPorCliente({ fechaDesde, fechaHasta, cliente });
  const porCorteOd = agregarPorCorteOd(detalleLote);
  const resumenClientes = await obtenerResumenClienteOd(detalleLote);

  console.log(`Clientes: ${resumenClientes.length}`);
  console.log(`Filas Corte+OD: ${porCorteOd.length}`);
  console.log(`Filas Detalle lote: ${detalleLote.length}`);

  const { rutaExcel, nombreArchivo } = await generarExcelOdCliente({
    fechaDesde,
    fechaHasta,
    resumenClientes,
    porCorteOd,
    detalleLote,
    clienteFiltro: cliente,
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

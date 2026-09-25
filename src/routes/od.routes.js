import express from 'express';
import {
  obtenerDetalleOdPorCliente,
  obtenerResumenClienteOd,
  agregarPorCorteOd,
  construirArbolOd,
  construirHistorialClientes,
  listarClientesOd,
  listarCortesOd,
} from '../od_cliente.js';
import { generarExcelOdCliente } from '../report_od.js';

const router = express.Router();

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseFiltros(q) {
  const hoy = hoyBogota();
  const fechaDesde = q.desde || q.fechaDesde || hoy;
  const fechaHasta = q.hasta || q.fechaHasta || fechaDesde;
  return {
    fechaDesde,
    fechaHasta,
    cliente: q.cliente || null,
    corte: q.corte || null,
    ordenOd: q.orden || q.ordenOd || null,
    soloConDescuento: q.soloDescuento === '1' || q.soloDescuento === 'true',
    soloDiferenteLista: q.soloDifLista === '1' || q.soloDifLista === 'true',
    excluirPrecioCero:
      q.excluirPrecioCero === undefined ||
      q.excluirPrecioCero === '1' ||
      q.excluirPrecioCero === 'true',
    estadoFactura: 'facturadas',
  };
}

function validarFechas(f) {
  if (!f.fechaDesde || !f.fechaHasta) {
    return 'Indica fecha desde y hasta (YYYY-MM-DD).';
  }
  if (f.fechaDesde > f.fechaHasta) {
    return 'La fecha desde no puede ser mayor que hasta.';
  }
  return null;
}

router.get('/clientes', async (req, res) => {
  try {
    const f = parseFiltros(req.query);
    const err = validarFechas(f);
    if (err) return res.status(400).json({ error: err });
    const rows = await listarClientesOd(f);
    res.json({ rowCount: rows.length, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cortes', async (req, res) => {
  try {
    const f = parseFiltros(req.query);
    const err = validarFechas(f);
    if (err) return res.status(400).json({ error: err });
    const rows = await listarCortesOd(f);
    res.json({ rowCount: rows.length, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/consulta', async (req, res) => {
  try {
    const f = parseFiltros(req.query);
    const err = validarFechas(f);
    if (err) return res.status(400).json({ error: err });

    const detalle = await obtenerDetalleOdPorCliente(f);
    const resumen = await obtenerResumenClienteOd(detalle);
    const porCorteOd = agregarPorCorteOd(detalle);
    const tree = construirArbolOd(detalle);

    const totales = {
      lineas: detalle.length,
      clientes: resumen.length,
      ordenes: new Set(detalle.map((r) => r.orden_od)).size,
      cortes: new Set(detalle.map((r) => r.corte)).size,
      lotes: new Set(detalle.map((r) => r.lote)).size,
      kg: Math.round(detalle.reduce((s, r) => s + (Number(r.kg) || 0), 0) * 100) / 100,
      valor: Math.round(detalle.reduce((s, r) => s + (Number(r.subtotal_od) || 0), 0) * 100) / 100,
      con_descuento: detalle.filter((r) => Number(r.descuento_pct) > 0).length,
      diferente_lista: detalle.filter(
        (r) => r.vs_lista === 'MENOR_LISTA' || r.vs_lista === 'MAYOR_LISTA'
      ).length,
    };

    res.json({
      filtros: f,
      totales,
      resumen,
      porCorteOd,
      detalle,
      tree,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/historial', async (req, res) => {
  try {
    const f = parseFiltros(req.query);
    const err = validarFechas(f);
    if (err) return res.status(400).json({ error: err });

    const detalle = await obtenerDetalleOdPorCliente({
      ...f,
      cliente: null,
      corte: null,
      ordenOd: null,
      soloConDescuento: false,
      soloDiferenteLista: false,
      excluirPrecioCero: true,
      estadoFactura: 'facturadas',
    });

    const hist = construirHistorialClientes(detalle, f.cliente);
    res.json({ filtros: f, ...hist });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/excel', async (req, res) => {
  try {
    const f = parseFiltros(req.query);
    const err = validarFechas(f);
    if (err) return res.status(400).json({ error: err });

    const detalle = await obtenerDetalleOdPorCliente(f);
    const resumen = await obtenerResumenClienteOd(detalle);
    const porCorteOd = agregarPorCorteOd(detalle);

    const { rutaExcel, nombreArchivo } = await generarExcelOdCliente({
      fechaDesde: f.fechaDesde,
      fechaHasta: f.fechaHasta,
      resumenClientes: resumen,
      porCorteOd,
      detalleLote: detalle,
      clienteFiltro: f.cliente,
    });

    res.download(rutaExcel, nombreArchivo);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;

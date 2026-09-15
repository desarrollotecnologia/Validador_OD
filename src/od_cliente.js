import { query } from './db.js';

/**
 * Detalle a nivel lote: Cliente → Corte → OD → Lote.
 * kg = solicitud_kg (kilos asignados/llevados en esa línea de la OD).
 * precio_od = precio en orden_despacho_detalle (ya refleja descuento si aplica).
 */
export async function obtenerDetalleOdPorCliente({
  fechaDesde,
  fechaHasta,
  cliente = null,
  corte = null,
  ordenOd = null,
  soloConDescuento = false,
  soloDiferenteLista = false,
  excluirPrecioCero = false,
  /** todas | facturadas | sin_factura */
  estadoFactura = 'todas',
} = {}) {
  const params = [fechaDesde, fechaHasta];
  const filtros = [];

  if (cliente) {
    params.push(`%${cliente}%`);
    filtros.push(`AND e.nombre ILIKE $${params.length}`);
  }
  if (corte) {
    params.push(`%${corte}%`);
    filtros.push(`AND c.nombre ILIKE $${params.length}`);
  }
  if (ordenOd) {
    params.push(`%${ordenOd}%`);
    filtros.push(`AND od.codigo ILIKE $${params.length}`);
  }
  if (soloConDescuento) {
    filtros.push(`AND COALESCE(odd.descuento, 0) > 0`);
  }
  if (soloDiferenteLista) {
    filtros.push(`AND cf.valor IS NOT NULL AND ABS(odd.precio - cf.valor) > 1`);
  }
  if (excluirPrecioCero) {
    filtros.push(`AND COALESCE(odd.precio, 0) > 0`);
  }
  if (estadoFactura === 'facturadas') {
    filtros.push(`AND fac.id_factura IS NOT NULL`);
  } else if (estadoFactura === 'sin_factura') {
    filtros.push(`AND fac.id_factura IS NULL`);
  }

  const sql = `
    SELECT
      e.id AS id_cliente,
      e.nombre AS cliente,
      e.nit,
      c.id AS id_corte,
      c.codigo AS codigo_corte,
      c.nombre AS corte,
      COALESCE(cf.nombre, c.nombre) AS criterio,
      od.id AS id_orden,
      od.codigo AS orden_od,
      od.fecha_despacho_planta::date AS fecha_despacho,
      od.fecha_entrega_cliente::date AS fecha_entrega,
      od.producto_alistado,
      l.id AS id_lote,
      COALESCE(l.codigo, '(sin lote)') AS lote,
      odd.solicitud_kg AS kg,
      odd.existencia_kg,
      odd.precio AS precio_od,
      COALESCE(odd.descuento, 0) AS descuento_pct,
      cf.valor AS precio_lista,
      ROUND((odd.solicitud_kg * odd.precio)::numeric, 2) AS subtotal_od,
      CASE
        WHEN cf.valor IS NULL THEN 'SIN_LISTA'
        WHEN ABS(odd.precio - cf.valor) <= 1 THEN 'IGUAL_LISTA'
        WHEN odd.precio < cf.valor THEN 'MENOR_LISTA'
        ELSE 'MAYOR_LISTA'
      END AS vs_lista,
      ROUND((odd.precio - COALESCE(cf.valor, odd.precio))::numeric, 2) AS diff_vs_lista,
      fac.id_factura,
      fac.fecha_factura,
      fac.numeracion,
      fac.numero_factura,
      fac.valor_factura,
      CASE
        WHEN fac.id_factura IS NULL THEN 'SIN_FACTURA'
        ELSE 'FACTURADA'
      END AS estado_factura
    FROM desposte.orden_despacho_detalle odd
    JOIN desposte.orden_despacho od
      ON od.id = odd.id_orden_despacho
    JOIN organizaciones.empresa e
      ON e.id = od.id_empresa
    JOIN desposte.corte c
      ON c.id = odd.id_corte
    LEFT JOIN desposte.lote l
      ON l.id = odd.id_lote
    LEFT JOIN financiero.criterio_facturacion cf
      ON cf.id = c.id_criterio_facturacion
    LEFT JOIN LATERAL (
      SELECT
        v.id_factura,
        f.fecha_factura::date AS fecha_factura,
        f.numeracion,
        f.numero_factura,
        f.valor_factura
      FROM desposte.vehiculo_asignado_orden_despacho v
      JOIN financiero.factura f ON f.id = v.id_factura
      WHERE v.id_orden_despacho = od.id
        AND v.id_factura IS NOT NULL
        AND COALESCE(f.anulado, '') <> 'S'
      ORDER BY f.fecha_factura DESC NULLS LAST, v.id DESC
      LIMIT 1
    ) fac ON TRUE
    WHERE od.fecha_despacho_planta::date BETWEEN $1::date AND $2::date
      ${filtros.join('\n      ')}
    ORDER BY e.nombre, c.nombre, od.codigo, l.codigo
  `;

  const { rows } = await query(sql, params);
  return rows;
}

export async function listarClientesOd({ fechaDesde, fechaHasta } = {}) {
  const { rows } = await query(
    `
    SELECT DISTINCT e.nombre AS cliente, e.nit
    FROM desposte.orden_despacho od
    JOIN organizaciones.empresa e ON e.id = od.id_empresa
    WHERE od.fecha_despacho_planta::date BETWEEN $1::date AND $2::date
    ORDER BY e.nombre
    `,
    [fechaDesde, fechaHasta]
  );
  return rows;
}

export async function listarCortesOd({ fechaDesde, fechaHasta, cliente = null } = {}) {
  const params = [fechaDesde, fechaHasta];
  let filtro = '';
  if (cliente) {
    params.push(`%${cliente}%`);
    filtro = `AND e.nombre ILIKE $${params.length}`;
  }
  const { rows } = await query(
    `
    SELECT DISTINCT c.nombre AS corte, c.codigo AS codigo_corte
    FROM desposte.orden_despacho_detalle odd
    JOIN desposte.orden_despacho od ON od.id = odd.id_orden_despacho
    JOIN organizaciones.empresa e ON e.id = od.id_empresa
    JOIN desposte.corte c ON c.id = odd.id_corte
    WHERE od.fecha_despacho_planta::date BETWEEN $1::date AND $2::date
      ${filtro}
    ORDER BY c.nombre
    `,
    params
  );
  return rows;
}

export function construirArbolOd(detalle) {
  const tree = {};
  for (const r of detalle) {
    const cli = r.cliente;
    if (!tree[cli]) tree[cli] = { nit: r.nit, cortes: {} };
    if (!tree[cli].cortes[r.corte]) {
      tree[cli].cortes[r.corte] = { codigo: r.codigo_corte, ods: {} };
    }
    const od = r.orden_od;
    if (!tree[cli].cortes[r.corte].ods[od]) {
      tree[cli].cortes[r.corte].ods[od] = {
        fecha: r.fecha_despacho,
        precio_od: Number(r.precio_od),
        precio_lista: r.precio_lista != null ? Number(r.precio_lista) : null,
        descuento_pct: Number(r.descuento_pct) || 0,
        vs_lista: r.vs_lista,
        estado_factura: r.estado_factura,
        id_factura: r.id_factura,
        fecha_factura: r.fecha_factura,
        numeracion: r.numeracion,
        valor_factura: r.valor_factura != null ? Number(r.valor_factura) : null,
        lotes: [],
      };
    }
    tree[cli].cortes[r.corte].ods[od].lotes.push({
      lote: r.lote,
      kg: Number(r.kg),
      subtotal: Number(r.subtotal_od),
    });
  }
  return tree;
}

export async function obtenerResumenClienteOd(detalle) {
  const map = new Map();
  for (const r of detalle) {
    const key = r.id_cliente;
    if (!map.has(key)) {
      map.set(key, {
        cliente: r.cliente,
        nit: r.nit,
        ordenes: new Set(),
        cortes: new Set(),
        lotes: new Set(),
        kg_total: 0,
        valor_od: 0,
        con_descuento: 0,
        diferente_lista: 0,
      });
    }
    const a = map.get(key);
    a.ordenes.add(r.orden_od);
    a.cortes.add(r.corte);
    a.lotes.add(r.lote);
    a.kg_total += Number(r.kg) || 0;
    a.valor_od += Number(r.subtotal_od) || 0;
    if (Number(r.descuento_pct) > 0) a.con_descuento += 1;
    if (r.vs_lista && r.vs_lista !== 'IGUAL_LISTA' && r.vs_lista !== 'SIN_LISTA') {
      a.diferente_lista += 1;
    }
  }

  return [...map.values()]
    .map((a) => ({
      cliente: a.cliente,
      nit: a.nit,
      num_ordenes: a.ordenes.size,
      num_cortes: a.cortes.size,
      num_lotes: a.lotes.size,
      kg_total: Math.round(a.kg_total * 100) / 100,
      valor_od: Math.round(a.valor_od * 100) / 100,
      lineas_con_descuento: a.con_descuento,
      lineas_diferente_lista: a.diferente_lista,
    }))
    .sort((x, y) => y.valor_od - x.valor_od);
}

/** Agrega Cliente + Corte + OD (suma kilos de todos los lotes). */
export function agregarPorCorteOd(detalle) {
  const map = new Map();
  for (const r of detalle) {
    const key = `${r.id_cliente}|${r.id_corte}|${r.id_orden}`;
    if (!map.has(key)) {
      map.set(key, {
        cliente: r.cliente,
        nit: r.nit,
        corte: r.corte,
        codigo_corte: r.codigo_corte,
        orden_od: r.orden_od,
        fecha_despacho: r.fecha_despacho,
        precio_od: r.precio_od,
        descuento_pct: r.descuento_pct,
        precio_lista: r.precio_lista,
        vs_lista: r.vs_lista,
        kg: 0,
        subtotal_od: 0,
        lotes: [],
      });
    }
    const a = map.get(key);
    a.kg += Number(r.kg) || 0;
    a.subtotal_od += Number(r.subtotal_od) || 0;
    a.lotes.push(r.lote);
  }

  return [...map.values()]
    .map((a) => ({
      ...a,
      kg: Math.round(a.kg * 100) / 100,
      subtotal_od: Math.round(a.subtotal_od * 100) / 100,
      lotes: [...new Set(a.lotes)].join(' | '),
      num_lotes: new Set(a.lotes).size,
    }))
    .sort((x, y) => {
      const c = String(x.cliente).localeCompare(String(y.cliente));
      if (c) return c;
      const k = String(x.corte).localeCompare(String(y.corte));
      if (k) return k;
      return String(x.orden_od).localeCompare(String(y.orden_od));
    });
}

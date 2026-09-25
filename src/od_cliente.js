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
      ROUND(
        SUM(odd.solicitud_kg * odd.precio) OVER (PARTITION BY od.id)::numeric,
        2
      ) AS valor_od_orden,
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
      fac.valor_productos_factura,
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
        f.valor_factura,
        (
          SELECT ROUND(COALESCE(SUM(cfc.valor * cfc.cantidad), 0)::numeric, 2)
          FROM desposte.criterio_facturacion_corte cfc
          JOIN financiero.criterio_facturacion cf2
            ON cf2.id = cfc.id_criterio_facturacion
          WHERE cfc.id_factura = f.id
            AND NOT (cf2.nombre ~* '(retenci|reteica|retefuente)')
            AND COALESCE(cf2.codigo_producto, '0') NOT IN ('0', '')
        ) AS valor_productos_factura
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
    if (!tree[cli]) tree[cli] = { nit: r.nit, ordenes: {} };

    const od = r.orden_od;
    if (!tree[cli].ordenes[od]) {
      tree[cli].ordenes[od] = {
        fecha: r.fecha_despacho,
        precio_od: Number(r.precio_od),
        precio_lista: r.precio_lista != null ? Number(r.precio_lista) : null,
        descuento_pct: Number(r.descuento_pct) || 0,
        vs_lista: r.vs_lista,
        estado_factura: r.estado_factura,
        id_factura: r.id_factura,
        fecha_factura: r.fecha_factura,
        numeracion: r.numeracion,
        valor_od_orden: r.valor_od_orden != null ? Number(r.valor_od_orden) : null,
        valor_factura: r.valor_factura != null ? Number(r.valor_factura) : null,
        valor_productos_factura:
          r.valor_productos_factura != null ? Number(r.valor_productos_factura) : null,
        cortes: {},
      };
    }

    const nodeOd = tree[cli].ordenes[od];
    const fechaOd = fechaStrKey(r.fecha_despacho);
    const fechaAct = fechaStrKey(nodeOd.fecha);
    if (fechaOd > fechaAct) nodeOd.fecha = r.fecha_despacho;

    if (!nodeOd.cortes[r.corte]) {
      nodeOd.cortes[r.corte] = { codigo: r.codigo_corte, lotes: [] };
    }
    nodeOd.cortes[r.corte].lotes.push({
      lote: r.lote,
      kg: Number(r.kg),
      subtotal: Number(r.subtotal_od),
      precio_od: Number(r.precio_od),
      precio_lista: r.precio_lista != null ? Number(r.precio_lista) : null,
      descuento_pct: Number(r.descuento_pct) || 0,
      vs_lista: r.vs_lista,
    });
  }
  return tree;
}

function fechaStrKey(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
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
        fechas: new Set(),
        fecha_reciente: null,
      });
    }
    const a = map.get(key);
    a.ordenes.add(r.orden_od);
    a.cortes.add(r.corte);
    a.lotes.add(r.lote);
    a.kg_total += Number(r.kg) || 0;
    a.valor_od += Number(r.subtotal_od) || 0;
    const f = fechaStrKey(r.fecha_despacho);
    if (f) {
      a.fechas.add(f);
      if (!a.fecha_reciente || f > a.fecha_reciente) a.fecha_reciente = f;
    }
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
      fecha_reciente: a.fecha_reciente,
      fechas: [...a.fechas].sort((x, y) => (x < y ? 1 : -1)),
    }))
    .sort((x, y) => {
      const fx = x.fecha_reciente || '';
      const fy = y.fecha_reciente || '';
      if (fx !== fy) return fx < fy ? 1 : -1;
      return y.valor_od - x.valor_od;
    });
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
        valor_od_orden: r.valor_od_orden != null ? Number(r.valor_od_orden) : null,
        valor_factura: r.valor_factura != null ? Number(r.valor_factura) : null,
        valor_productos_factura:
          r.valor_productos_factura != null ? Number(r.valor_productos_factura) : null,
        id_factura: r.id_factura,
        estado_factura: r.estado_factura,
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

/**
 * Historial / estadísticas de clientes en un rango.
 * ranking: quién compra más
 * detalleCliente: cortes + timeline de OD del cliente elegido
 */
export function construirHistorialClientes(detalle, clienteFiltro = null) {
  const rankingMap = new Map();
  const totalValor = detalle.reduce((s, r) => s + (Number(r.subtotal_od) || 0), 0);
  const totalKg = detalle.reduce((s, r) => s + (Number(r.kg) || 0), 0);

  for (const r of detalle) {
    const key = r.id_cliente;
    if (!rankingMap.has(key)) {
      rankingMap.set(key, {
        id_cliente: r.id_cliente,
        cliente: r.cliente,
        nit: r.nit,
        ordenes: new Set(),
        cortes: new Set(),
        kg: 0,
        valor: 0,
        fecha_primera: null,
        fecha_ultima: null,
      });
    }
    const a = rankingMap.get(key);
    a.ordenes.add(r.orden_od);
    a.cortes.add(r.corte);
    a.kg += Number(r.kg) || 0;
    a.valor += Number(r.subtotal_od) || 0;
    const f = fechaStrKey(r.fecha_despacho);
    if (f) {
      if (!a.fecha_primera || f < a.fecha_primera) a.fecha_primera = f;
      if (!a.fecha_ultima || f > a.fecha_ultima) a.fecha_ultima = f;
    }
  }

  const ranking = [...rankingMap.values()]
    .map((a) => ({
      id_cliente: a.id_cliente,
      cliente: a.cliente,
      nit: a.nit,
      num_ordenes: a.ordenes.size,
      num_cortes: a.cortes.size,
      kg: Math.round(a.kg * 100) / 100,
      valor: Math.round(a.valor * 100) / 100,
      pct_valor: totalValor > 0 ? Math.round((a.valor / totalValor) * 10000) / 100 : 0,
      pct_kg: totalKg > 0 ? Math.round((a.kg / totalKg) * 10000) / 100 : 0,
      fecha_primera: a.fecha_primera,
      fecha_ultima: a.fecha_ultima,
    }))
    .sort((x, y) => y.valor - x.valor);

  let detalleCliente = null;
  if (clienteFiltro) {
    const rows = detalle.filter((r) =>
      String(r.cliente).toLowerCase().includes(String(clienteFiltro).toLowerCase())
    );
    const cortesMap = new Map();
    const odsMap = new Map();

    for (const r of rows) {
      if (!cortesMap.has(r.corte)) {
        cortesMap.set(r.corte, {
          corte: r.corte,
          codigo: r.codigo_corte,
          kg: 0,
          valor: 0,
          ordenes: new Set(),
          fechas: new Set(),
        });
      }
      const c = cortesMap.get(r.corte);
      c.kg += Number(r.kg) || 0;
      c.valor += Number(r.subtotal_od) || 0;
      c.ordenes.add(r.orden_od);
      const f = fechaStrKey(r.fecha_despacho);
      if (f) c.fechas.add(f);

      if (!odsMap.has(r.orden_od)) {
        odsMap.set(r.orden_od, {
          orden_od: r.orden_od,
          fecha: fechaStrKey(r.fecha_despacho),
          kg: 0,
          valor: 0,
          valor_od_orden: r.valor_od_orden != null ? Number(r.valor_od_orden) : null,
          valor_factura: r.valor_factura != null ? Number(r.valor_factura) : null,
          estado_factura: r.estado_factura,
          id_factura: r.id_factura,
          numeracion: r.numeracion,
          cortes: new Map(),
        });
      }
      const od = odsMap.get(r.orden_od);
      od.kg += Number(r.kg) || 0;
      od.valor += Number(r.subtotal_od) || 0;
      if (!od.cortes.has(r.corte)) {
        od.cortes.set(r.corte, { corte: r.corte, kg: 0, valor: 0, lotes: [] });
      }
      const oc = od.cortes.get(r.corte);
      oc.kg += Number(r.kg) || 0;
      oc.valor += Number(r.subtotal_od) || 0;
      oc.lotes.push({ lote: r.lote, kg: Number(r.kg), subtotal: Number(r.subtotal_od) });
    }

    const valorCli = rows.reduce((s, r) => s + (Number(r.subtotal_od) || 0), 0);
    const cortes = [...cortesMap.values()]
      .map((c) => ({
        corte: c.corte,
        codigo: c.codigo,
        kg: Math.round(c.kg * 100) / 100,
        valor: Math.round(c.valor * 100) / 100,
        num_ordenes: c.ordenes.size,
        pct_valor: valorCli > 0 ? Math.round((c.valor / valorCli) * 10000) / 100 : 0,
        fechas: [...c.fechas].sort((a, b) => (a < b ? 1 : -1)),
      }))
      .sort((a, b) => b.valor - a.valor);

    const ordenes = [...odsMap.values()]
      .map((o) => ({
        orden_od: o.orden_od,
        fecha: o.fecha,
        kg: Math.round(o.kg * 100) / 100,
        valor: Math.round(o.valor * 100) / 100,
        valor_od_orden: o.valor_od_orden,
        valor_factura: o.valor_factura,
        estado_factura: o.estado_factura,
        id_factura: o.id_factura,
        numeracion: o.numeracion,
        cortes: [...o.cortes.values()]
          .map((c) => ({
            ...c,
            kg: Math.round(c.kg * 100) / 100,
            valor: Math.round(c.valor * 100) / 100,
          }))
          .sort((a, b) => b.valor - a.valor),
      }))
      .sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
        return String(b.orden_od).localeCompare(String(a.orden_od));
      });

    const byFecha = new Map();
    for (const o of ordenes) {
      const f = o.fecha || 's/f';
      if (!byFecha.has(f)) byFecha.set(f, []);
      byFecha.get(f).push(o);
    }
    const timeline = [...byFecha.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([fecha, ods]) => ({
        fecha,
        num_ordenes: ods.length,
        kg: Math.round(ods.reduce((s, o) => s + o.kg, 0) * 100) / 100,
        valor: Math.round(ods.reduce((s, o) => s + o.valor, 0) * 100) / 100,
        ordenes: ods,
      }));

    // Estudio por mes: OD / kg / valor y top cortes de cada mes
    const byMes = new Map();
    for (const r of rows) {
      const f = fechaStrKey(r.fecha_despacho);
      const mes = f ? f.slice(0, 7) : 's/f';
      if (!byMes.has(mes)) {
        byMes.set(mes, {
          mes,
          ordenes: new Set(),
          cortes: new Set(),
          kg: 0,
          valor: 0,
          porCorte: new Map(),
        });
      }
      const m = byMes.get(mes);
      m.ordenes.add(r.orden_od);
      m.cortes.add(r.corte);
      m.kg += Number(r.kg) || 0;
      m.valor += Number(r.subtotal_od) || 0;
      if (!m.porCorte.has(r.corte)) {
        m.porCorte.set(r.corte, { corte: r.corte, kg: 0, valor: 0, ordenes: new Set() });
      }
      const mc = m.porCorte.get(r.corte);
      mc.kg += Number(r.kg) || 0;
      mc.valor += Number(r.subtotal_od) || 0;
      mc.ordenes.add(r.orden_od);
    }

    const porMes = [...byMes.values()]
      .map((m) => {
        const cortesMes = [...m.porCorte.values()]
          .map((c) => ({
            corte: c.corte,
            kg: Math.round(c.kg * 100) / 100,
            valor: Math.round(c.valor * 100) / 100,
            num_ordenes: c.ordenes.size,
            pct_valor: m.valor > 0 ? Math.round((c.valor / m.valor) * 10000) / 100 : 0,
          }))
          .sort((a, b) => b.valor - a.valor);
        return {
          mes: m.mes,
          num_ordenes: m.ordenes.size,
          num_cortes: m.cortes.size,
          kg: Math.round(m.kg * 100) / 100,
          valor: Math.round(m.valor * 100) / 100,
          pct_valor: valorCli > 0 ? Math.round((m.valor / valorCli) * 10000) / 100 : 0,
          top_corte: cortesMes[0]?.corte || null,
          top_corte_valor: cortesMes[0]?.valor || 0,
          cortes: cortesMes,
        };
      })
      .sort((a, b) => (a.mes < b.mes ? 1 : -1));

    const head = ranking.find((r) =>
      String(r.cliente).toLowerCase().includes(String(clienteFiltro).toLowerCase())
    );

    detalleCliente = {
      cliente: head?.cliente || rows[0]?.cliente || clienteFiltro,
      nit: head?.nit || rows[0]?.nit || null,
      num_ordenes: new Set(rows.map((r) => r.orden_od)).size,
      num_cortes: cortes.length,
      kg: Math.round(rows.reduce((s, r) => s + (Number(r.kg) || 0), 0) * 100) / 100,
      valor: Math.round(valorCli * 100) / 100,
      fecha_primera: head?.fecha_primera || null,
      fecha_ultima: head?.fecha_ultima || null,
      cortes,
      porMes,
      timeline,
      ordenes,
    };
  }

  return {
    totales: {
      clientes: ranking.length,
      ordenes: new Set(detalle.map((r) => r.orden_od)).size,
      cortes: new Set(detalle.map((r) => r.corte)).size,
      kg: Math.round(totalKg * 100) / 100,
      valor: Math.round(totalValor * 100) / 100,
    },
    ranking,
    detalleCliente,
  };
}

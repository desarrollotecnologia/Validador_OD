import { query } from './db.js';
import { config } from './config.js';

/**
 * Arma filtros de fecha: rango fijo (desde/hasta) o ventana por días.
 */
function resolverFiltroFecha({ dias, fechaDesde, fechaHasta }) {
  if (fechaDesde && fechaHasta) {
    return {
      whereFecha: 'f.fecha_factura BETWEEN $1::date AND $5::date',
      paramsBase: (tolerancia, tipoFactura, ignorarPrecioListaCero) => [
        fechaDesde,
        tipoFactura,
        tolerancia,
        ignorarPrecioListaCero,
        fechaHasta,
      ],
    };
  }

  return {
    whereFecha: `f.fecha_factura >= CURRENT_DATE - ($1::int || ' days')::interval`,
    paramsBase: (tolerancia, tipoFactura, ignorarPrecioListaCero) => [
      dias ?? config.diasVerificacion,
      tipoFactura,
      tolerancia,
      ignorarPrecioListaCero,
    ],
  };
}

function sqlLineas(whereFecha) {
  return `
  SELECT
    f.id AS id_factura,
    f.numero_factura,
    f.numeracion,
    f.fecha_factura::date AS fecha_factura,
    f.valor_factura,
    f.user_name AS usuario_factura,
    COALESCE(f.contabilizado, '') AS contabilizado,
    tf.nombre AS tipo_factura,
    COALESCE(e.nombre, TRIM(CONCAT(per.nombres, ' ', per.apellidos)), '') AS cliente,
    COALESCE(e.nit, per.documento, '') AS nit_cliente,
    cfc.id AS id_linea,
    cf.id AS id_criterio,
    cf.nombre AS criterio,
    cf.codigo_producto,
    cf.codigo_criterio_facturacion,
    cfc.valor AS precio_factura,
    cf.valor AS precio_lista,
    (cfc.valor - cf.valor) AS diferencia_unitaria,
    cfc.cantidad,
    ROUND((cfc.valor * cfc.cantidad)::numeric, 2) AS subtotal,
    ROUND((cfc.valor - cf.valor) * cfc.cantidad, 2) AS impacto_total,
    CASE
      WHEN ABS(cfc.valor - cf.valor) <= $3 THEN 'OK'
      WHEN cfc.valor > cf.valor THEN 'MAYOR_A_LISTA'
      ELSE 'MENOR_A_LISTA'
    END AS tipo_desvio,
    CASE
      WHEN ABS(cfc.valor - cf.valor) <= $3 THEN 'OK'
      ELSE 'DESVIO'
    END AS estado,
    (
      SELECT STRING_AGG(DISTINCT c.nombre, ' | ' ORDER BY c.nombre)
      FROM desposte.corte c
      WHERE c.id_criterio_facturacion = cf.id
        AND c.fecha_fin_vigencia IS NULL
    ) AS cortes_asociados,
    (
      SELECT STRING_AGG(DISTINCT l.codigo, ' | ' ORDER BY l.codigo)
      FROM desposte.lote_factura lf
      JOIN desposte.lote l ON l.id = lf.id_lote
      WHERE lf.id_factura = f.id
    ) AS lote
  FROM desposte.criterio_facturacion_corte cfc
  JOIN financiero.factura f
    ON f.id = cfc.id_factura
  JOIN financiero.tipo_factura tf
    ON tf.id = f.id_tipo_factura
  JOIN financiero.criterio_facturacion cf
    ON cf.id = cfc.id_criterio_facturacion
  LEFT JOIN organizaciones.empresa_persona ep
    ON ep.id = f.id_empresa_persona
  LEFT JOIN organizaciones.empresa e
    ON e.id = ep.id_empresa
  LEFT JOIN recursos_humanos.persona per
    ON per.id = ep.id_persona
  WHERE ${whereFecha}
    AND COALESCE(f.anulado, '') <> 'S'
    AND tf.nombre = $2
    AND (
      NOT $4::boolean
      OR cf.valor > 0
    )
    AND COALESCE(cf.codigo_producto, '0') NOT IN ('0', '')
    AND cf.nombre !~* '(retenci[oó]n|reteica|retefuente|^iva\\b)'
`;
}

/**
 * Todas las líneas de corte revisadas (OK + desvíos).
 */
export async function obtenerTodasLasLineas({
  dias = config.diasVerificacion,
  tolerancia = config.toleranciaPrecio,
  tipoFactura = config.tipoFactura,
  ignorarPrecioListaCero = config.ignorarPrecioListaCero,
  fechaDesde = null,
  fechaHasta = null,
} = {}) {
  const { whereFecha, paramsBase } = resolverFiltroFecha({ dias, fechaDesde, fechaHasta });
  const sql = `
    ${sqlLineas(whereFecha)}
    ORDER BY f.fecha_factura DESC, f.id DESC, cf.nombre
  `;
  const { rows } = await query(sql, paramsBase(tolerancia, tipoFactura, ignorarPrecioListaCero));
  return rows;
}

/**
 * Solo líneas cuyo precio facturado no coincide con el precio de lista.
 */
export async function obtenerDiscrepancias({
  dias = config.diasVerificacion,
  tolerancia = config.toleranciaPrecio,
  tipoFactura = config.tipoFactura,
  ignorarPrecioListaCero = config.ignorarPrecioListaCero,
  fechaDesde = null,
  fechaHasta = null,
} = {}) {
  const { whereFecha, paramsBase } = resolverFiltroFecha({ dias, fechaDesde, fechaHasta });
  const sql = `
    ${sqlLineas(whereFecha)}
      AND ABS(cfc.valor - cf.valor) > $3
    ORDER BY f.fecha_factura DESC, ABS(cfc.valor - cf.valor) DESC, f.id DESC
  `;
  const { rows } = await query(sql, paramsBase(tolerancia, tipoFactura, ignorarPrecioListaCero));
  return rows;
}

export async function obtenerResumenVerificacion({
  dias = config.diasVerificacion,
  tolerancia = config.toleranciaPrecio,
  tipoFactura = config.tipoFactura,
  ignorarPrecioListaCero = config.ignorarPrecioListaCero,
  fechaDesde = null,
  fechaHasta = null,
} = {}) {
  const { whereFecha, paramsBase } = resolverFiltroFecha({ dias, fechaDesde, fechaHasta });
  const sql = `
    WITH base AS (
      SELECT
        f.id AS id_factura,
        cfc.valor AS precio_factura,
        cf.valor AS precio_lista,
        ABS(cfc.valor - cf.valor) AS abs_diff
      FROM desposte.criterio_facturacion_corte cfc
      JOIN financiero.factura f ON f.id = cfc.id_factura
      JOIN financiero.tipo_factura tf ON tf.id = f.id_tipo_factura
      JOIN financiero.criterio_facturacion cf ON cf.id = cfc.id_criterio_facturacion
      WHERE ${whereFecha}
        AND COALESCE(f.anulado, '') <> 'S'
        AND tf.nombre = $2
        AND (
          NOT $4::boolean
          OR cf.valor > 0
        )
        AND COALESCE(cf.codigo_producto, '0') NOT IN ('0', '')
        AND cf.nombre !~* '(retenci[oó]n|reteica|retefuente|^iva\\b)'
    )
    SELECT
      COUNT(*)::int AS lineas_revisadas,
      COUNT(*) FILTER (WHERE abs_diff > $3)::int AS lineas_con_desvio,
      COUNT(*) FILTER (WHERE abs_diff <= $3)::int AS lineas_ok,
      COUNT(DISTINCT id_factura)::int AS facturas_revisadas,
      COUNT(DISTINCT id_factura) FILTER (WHERE abs_diff > $3)::int AS facturas_con_desvio
    FROM base
  `;

  const { rows } = await query(sql, paramsBase(tolerancia, tipoFactura, ignorarPrecioListaCero));
  return rows[0];
}

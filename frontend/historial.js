/* Historial de clientes — vista secundaria del Validador OD */

window.ValidadorHistorial = (function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: null,
    cliente: '',
    cargando: false,
  };

  function money(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function kg(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  }

  function fechaCorta(iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function labelMes(ym) {
    if (!ym || ym === 's/f') return 'Sin fecha';
    const [y, m] = String(ym).split('-');
    const nombres = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const mi = Number(m);
    return `${nombres[mi] || m} ${y}`;
  }

  function todayISO() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function daysAgoISO(n) {
    const parts = todayISO().split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function setRango(dias) {
    $('hHasta').value = todayISO();
    $('hDesde').value = daysAgoISO(dias);
  }

  function setStatus(msg, type = '') {
    const el = $('hStatus');
    el.textContent = msg;
    el.className = 'status' + (type ? ` ${type}` : '');
  }

  function apiFetch(url, options = {}) {
    if (typeof window.apiFetch === 'function') return window.apiFetch(url, options);
    const token = sessionStorage.getItem('vod_token') || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...options, headers, credentials: 'include' });
  }

  function renderStats(t) {
    $('hStats').hidden = false;
    $('hSClientes').textContent = String(t.clientes);
    $('hSOrdenes').textContent = String(t.ordenes);
    $('hSCortes').textContent = String(t.cortes);
    $('hSKg').textContent = kg(t.kg);
    $('hSValor').textContent = '$' + money(t.valor);
  }

  function renderRanking() {
    const tbody = $('hTablaRanking').querySelector('tbody');
    const q = ($('hBusca').value || '').toLowerCase().trim();
    let rows = state.data?.ranking || [];
    if (q) rows = rows.filter((r) => String(r.cliente).toLowerCase().includes(q));

    $('hRankingMeta').textContent = `${rows.length} cliente(s) · ordenado por valor`;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="muted">Sin clientes en este rango.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((r, i) => {
        const active = state.cliente === r.cliente ? ' class="row-active"' : '';
        return `<tr data-cliente="${escapeAttr(r.cliente)}"${active}>
          <td>${i + 1}</td>
          <td class="cli-name">${escapeHtml(r.cliente)}</td>
          <td>${escapeHtml(r.nit || '—')}</td>
          <td class="num">${r.num_ordenes}</td>
          <td class="num">${r.num_cortes}</td>
          <td class="num">${kg(r.kg)}</td>
          <td class="num">$${money(r.valor)}</td>
          <td class="num">${r.pct_valor}%</td>
          <td>${fechaCorta(r.fecha_primera)}</td>
          <td>${fechaCorta(r.fecha_ultima)}</td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('tr[data-cliente]').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.cliente = tr.dataset.cliente;
        consultar(true);
      });
    });
  }

  function renderDetalle() {
    const d = state.data?.detalleCliente;
    if (!d) {
      $('hDetalleVacio').hidden = false;
      $('hDetalleBody').hidden = true;
      $('hDetalleTitulo').textContent = 'Seguimiento del cliente';
      $('hDetalleMeta').textContent = 'Selecciona un cliente del ranking';
      return;
    }

    $('hDetalleVacio').hidden = true;
    $('hDetalleBody').hidden = false;
    $('hDetalleTitulo').textContent = d.cliente;
    $('hDetalleMeta').textContent = `NIT ${d.nit || '—'} · ${fechaCorta(d.fecha_primera)} → ${fechaCorta(d.fecha_ultima)}`;

    $('hDetalleKpis').innerHTML = `
      <div class="mini accent"><div class="v">${d.num_ordenes}</div><div class="l">Órdenes OD</div></div>
      <div class="mini accent"><div class="v">${d.num_cortes}</div><div class="l">Cortes distintos</div></div>
      <div class="mini"><div class="v">${kg(d.kg)} kg</div><div class="l">Kg totales</div></div>
      <div class="mini"><div class="v">$${money(d.valor)}</div><div class="l">Valor OD</div></div>
    `;

    const meses = d.porMes || [];
    const tbM = $('hTablaMeses').querySelector('tbody');
    $('hMesDetalle').hidden = true;
    $('hMesDetalle').innerHTML = '';

    if (!meses.length) {
      tbM.innerHTML = '<tr><td colspan="7" class="muted">Sin datos mensuales en este rango.</td></tr>';
    } else {
      tbM.innerHTML = meses
        .map(
          (m) => `<tr data-mes="${escapeAttr(m.mes)}">
            <td><strong>${labelMes(m.mes)}</strong></td>
            <td class="num">${m.num_ordenes}</td>
            <td class="num">${m.num_cortes}</td>
            <td class="num">${kg(m.kg)}</td>
            <td class="num">$${money(m.valor)}</td>
            <td class="num">${m.pct_valor}%</td>
            <td>${escapeHtml(m.top_corte || '—')}${m.top_corte ? ` · $${money(m.top_corte_valor)}` : ''}</td>
          </tr>`
        )
        .join('');

      tbM.querySelectorAll('tr[data-mes]').forEach((tr) => {
        tr.addEventListener('click', () => {
          tbM.querySelectorAll('tr').forEach((x) => x.classList.remove('row-active'));
          tr.classList.add('row-active');
          const mes = tr.dataset.mes;
          const m = meses.find((x) => x.mes === mes);
          if (!m) return;
          const box = $('hMesDetalle');
          box.hidden = false;
          box.innerHTML = `
            <div class="hist-day-head">
              <strong>Cortes en ${labelMes(m.mes)}</strong>
              <span class="muted">${m.num_ordenes} OD · ${kg(m.kg)} kg · $${money(m.valor)}</span>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Corte</th>
                    <th class="num">OD</th>
                    <th class="num">Kg</th>
                    <th class="num">Valor</th>
                    <th class="num">% del mes</th>
                  </tr>
                </thead>
                <tbody>
                  ${(m.cortes || [])
                    .map(
                      (c) => `<tr>
                        <td>${escapeHtml(c.corte)}</td>
                        <td class="num">${c.num_ordenes}</td>
                        <td class="num">${kg(c.kg)}</td>
                        <td class="num">$${money(c.valor)}</td>
                        <td class="num">${c.pct_valor}%</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`;
        });
      });
    }

    const tbC = $('hTablaCortes').querySelector('tbody');
    tbC.innerHTML = (d.cortes || [])
      .map(
        (c) => `<tr>
          <td>${escapeHtml(c.corte)}</td>
          <td class="num">${c.num_ordenes}</td>
          <td class="num">${kg(c.kg)}</td>
          <td class="num">$${money(c.valor)}</td>
          <td class="num">${c.pct_valor}%</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="muted">Sin cortes</td></tr>';

    const tl = $('hTimeline');
    tl.innerHTML = (d.timeline || [])
      .map((dia) => {
        const ods = (dia.ordenes || [])
          .map((o) => {
            const cortes = (o.cortes || [])
              .map((c) => `<li><strong>${escapeHtml(c.corte)}</strong> · ${kg(c.kg)} kg · $${money(c.valor)}</li>`)
              .join('');
            return `<details class="block hist-od">
              <summary class="row">
                <span class="row-title">${escapeHtml(o.orden_od)}</span>
                <span class="row-meta">$${money(o.valor)} · Fac ${o.valor_factura != null ? '$' + money(o.valor_factura) : '—'} · ${o.estado_factura || ''}</span>
              </summary>
              <div class="body"><ul class="hist-cut-list">${cortes}</ul></div>
            </details>`;
          })
          .join('');
        return `<div class="hist-day">
          <div class="hist-day-head">
            <strong>${fechaCorta(dia.fecha)}</strong>
            <span class="muted">${dia.num_ordenes} OD · ${kg(dia.kg)} kg · $${money(dia.valor)}</span>
          </div>
          ${ods}
        </div>`;
      })
      .join('') || '<p class="muted">Sin órdenes en el rango.</p>';
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function consultar(conCliente = false) {
    if (state.cargando) return;
    const desde = $('hDesde').value;
    const hasta = $('hHasta').value;
    if (!desde || !hasta) {
      setStatus('Indica fecha desde y hasta.', 'error');
      return;
    }
    if (desde > hasta) {
      setStatus('La fecha desde no puede ser mayor que hasta.', 'error');
      return;
    }

    state.cargando = true;
    $('btnHConsultar').disabled = true;
    setStatus('Consultando historial en SIRT…');

    try {
      const p = new URLSearchParams({ desde, hasta });
      const cli = conCliente ? state.cliente : ($('hBusca').value || '').trim();
      if (cli) {
        state.cliente = cli;
        p.set('cliente', cli);
      } else {
        state.cliente = '';
      }

      const res = await apiFetch(`/api/od/historial?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en historial');

      state.data = data;
      renderStats(data.totales);
      renderRanking();
      renderDetalle();
      setStatus(
        `Listo · ${fechaCorta(desde)} → ${fechaCorta(hasta)} · ${data.totales.clientes} clientes · ${data.totales.ordenes} OD`,
        'ok'
      );
    } catch (e) {
      console.error(e);
      setStatus(e.message || String(e), 'error');
    } finally {
      state.cargando = false;
      $('btnHConsultar').disabled = false;
    }
  }

  function init() {
    if (!$('vistaHistorial')) return;
    setRango(30);

    $('btnH30').addEventListener('click', () => {
      setRango(30);
      consultar(false);
    });
    $('btnH90').addEventListener('click', () => {
      setRango(90);
      consultar(false);
    });
    $('btnH365').addEventListener('click', () => {
      setRango(365);
      consultar(false);
    });
    $('btnHConsultar').addEventListener('click', () => consultar(false));
    $('hBusca').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.cliente = $('hBusca').value.trim();
        consultar(!!state.cliente);
      }
    });
    $('hBusca').addEventListener('input', () => {
      if (state.data) renderRanking();
    });
    $('hDesde').addEventListener('change', () => {});
    $('hHasta').addEventListener('change', () => {});
  }

  return { init, consultar, setRango };
})();

window.ValidadorHistorial.init();

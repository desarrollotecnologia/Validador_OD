/* Dashboard historial clientes — gráficas + ficha flotante */

window.ValidadorHistorial = (function () {
  const $ = (id) => document.getElementById(id);

  const GREEN = '#166534';
  const GREEN2 = '#22c55e';
  const GREEN_SOFT = '#86efac';
  const MUTED = '#4d7c5a';

  const state = {
    data: null,
    cliente: '',
    cargando: false,
    charts: { valor: null, kg: null, mes: null, cortes: null },
  };

  function money(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function kg(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  }

  function fechaCorta(iso) {
    if (iso == null || iso === '') return '—';
    if (iso instanceof Date && !Number.isNaN(iso.getTime())) {
      const y = iso.getFullYear();
      const m = String(iso.getMonth() + 1).padStart(2, '0');
      const d = String(iso.getDate()).padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
    const s = String(iso).trim();
    const mIso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
    const mLat = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (mLat) return s.slice(0, 10);
    return '—';
  }

  function labelMes(ym) {
    if (!ym || ym === 's/f') return 'Sin fecha';
    const [y, m] = String(ym).split('-');
    const nombres = [
      '',
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    return `${nombres[Number(m)] || m} ${y}`;
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
    el.className = 'status dash-status' + (type ? ` ${type}` : '');
  }

  function apiFetch(url, options = {}) {
    if (typeof window.apiFetch === 'function') return window.apiFetch(url, options);
    const token = sessionStorage.getItem('vod_token') || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...options, headers, credentials: 'include' });
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

  function destroyChart(key) {
    if (state.charts[key]) {
      state.charts[key].destroy();
      state.charts[key] = null;
    }
  }

  function shortName(name, max = 18) {
    const s = String(name || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function renderStats(t) {
    $('hStats').hidden = false;
    $('hSClientes').textContent = String(t.clientes);
    $('hSOrdenes').textContent = String(t.ordenes);
    $('hSCortes').textContent = String(t.cortes);
    $('hSKg').textContent = kg(t.kg);
    $('hSValor').textContent = '$' + money(t.valor);
  }

  function rankingFiltrado() {
    const q = ($('hBusca').value || '').toLowerCase().trim();
    let rows = state.data?.ranking || [];
    if (q) rows = rows.filter((r) => String(r.cliente).toLowerCase().includes(q));
    return rows;
  }

  function renderChartsGlobales() {
    if (typeof Chart === 'undefined') return;
    const top = rankingFiltrado().slice(0, 10);

    destroyChart('valor');
    destroyChart('kg');

    const labels = top.map((r) => shortName(r.cliente));
    const clientes = top.map((r) => r.cliente);

    state.charts.valor = new Chart($('hChartValor'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Valor OD',
            data: top.map((r) => r.valor),
            backgroundColor: GREEN,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: chartOpts((i) => abrirFicha(clientes[i])),
    });

    state.charts.kg = new Chart($('hChartKg'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Kg',
            data: top.map((r) => r.kg),
            backgroundColor: GREEN2,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: chartOpts((i) => abrirFicha(clientes[i])),
    });
  }

  function chartOpts(onClickIndex) {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.x;
              return ctx.dataset.label === 'Kg' ? ` ${kg(v)} kg` : ` $${money(v)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: MUTED, callback: (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v) },
          grid: { color: '#e8f5e9' },
        },
        y: { ticks: { color: GREEN, font: { size: 11 } }, grid: { display: false } },
      },
      onClick(_e, els) {
        if (els?.[0] && onClickIndex) onClickIndex(els[0].index);
      },
    };
  }

  function renderRanking() {
    const tbody = $('hTablaRanking').querySelector('tbody');
    const rows = rankingFiltrado();
    $('hRankingMeta').textContent = `${rows.length} cliente(s) · clic para abrir ficha`;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="muted">Sin clientes en este rango.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (r, i) => `<tr data-cliente="${escapeAttr(r.cliente)}">
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
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('tr[data-cliente]').forEach((tr) => {
      tr.addEventListener('click', () => abrirFicha(tr.dataset.cliente));
    });
  }

  function cerrarFicha() {
    const overlay = $('hFichaOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('ficha-open');
    state.cliente = '';
    destroyChart('mes');
    destroyChart('cortes');
  }

  async function abrirFicha(nombre) {
    if (!nombre) return;
    state.cliente = nombre;
    await consultar(true);
  }

  function mostrarFicha(d) {
    if (!d) return;
    $('hFichaTitulo').textContent = d.cliente;
    $('hFichaMeta').textContent = `NIT ${d.nit || '—'} · ${fechaCorta(d.fecha_primera)} → ${fechaCorta(d.fecha_ultima)}`;
    $('hFichaOverlay').hidden = false;
    document.body.classList.add('ficha-open');

    $('hDetalleKpis').innerHTML = `
      <div class="mini accent"><div class="v">${d.num_ordenes}</div><div class="l">Órdenes OD</div></div>
      <div class="mini accent"><div class="v">${d.num_cortes}</div><div class="l">Cortes</div></div>
      <div class="mini"><div class="v">${kg(d.kg)}</div><div class="l">Kg</div></div>
      <div class="mini"><div class="v">$${money(d.valor)}</div><div class="l">Valor</div></div>
    `;

    renderMeses(d);
    renderCortes(d);
    renderTimeline(d);
    renderChartsFicha(d);
  }

  function renderChartsFicha(d) {
    if (typeof Chart === 'undefined') return;
    destroyChart('mes');
    destroyChart('cortes');

    const meses = [...(d.porMes || [])].reverse();
    state.charts.mes = new Chart($('hChartMes'), {
      type: 'line',
      data: {
        labels: meses.map((m) => labelMes(m.mes)),
        datasets: [
          {
            label: 'Valor',
            data: meses.map((m) => m.valor),
            borderColor: GREEN,
            backgroundColor: 'rgba(22,101,52,0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: GREEN2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: MUTED, maxRotation: 0, font: { size: 10 } }, grid: { display: false } },
          y: {
            ticks: { color: MUTED, callback: (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v) },
            grid: { color: '#e8f5e9' },
          },
        },
      },
    });

    const topC = (d.cortes || []).slice(0, 8);
    state.charts.cortes = new Chart($('hChartCortes'), {
      type: 'doughnut',
      data: {
        labels: topC.map((c) => shortName(c.corte, 22)),
        datasets: [
          {
            data: topC.map((c) => c.valor),
            backgroundColor: [
              '#14532d',
              '#166534',
              '#15803d',
              '#16a34a',
              '#22c55e',
              '#4ade80',
              '#86efac',
              '#bbf7d0',
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, color: MUTED, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label(ctx) {
                return ` $${money(ctx.parsed)}`;
              },
            },
          },
        },
      },
    });
  }

  function renderMeses(d) {
    const meses = d.porMes || [];
    const tbM = $('hTablaMeses').querySelector('tbody');
    $('hMesDetalle').hidden = true;
    $('hMesDetalle').innerHTML = '';

    if (!meses.length) {
      tbM.innerHTML = '<tr><td colspan="6" class="muted">Sin datos mensuales.</td></tr>';
      return;
    }

    tbM.innerHTML = meses
      .map(
        (m) => `<tr data-mes="${escapeAttr(m.mes)}">
          <td><strong>${labelMes(m.mes)}</strong></td>
          <td class="num">${m.num_ordenes}</td>
          <td class="num">${kg(m.kg)}</td>
          <td class="num">$${money(m.valor)}</td>
          <td class="num">${m.pct_valor}%</td>
          <td>${escapeHtml(m.top_corte || '—')}</td>
        </tr>`
      )
      .join('');

    tbM.querySelectorAll('tr[data-mes]').forEach((tr) => {
      tr.addEventListener('click', () => {
        tbM.querySelectorAll('tr').forEach((x) => x.classList.remove('row-active'));
        tr.classList.add('row-active');
        const m = meses.find((x) => x.mes === tr.dataset.mes);
        if (!m) return;
        const box = $('hMesDetalle');
        box.hidden = false;
        box.innerHTML = `
          <div class="hist-day-head">
            <strong>Cortes · ${labelMes(m.mes)}</strong>
            <span class="muted">${m.num_ordenes} OD · $${money(m.valor)}</span>
          </div>
          <ul class="hist-cut-list">
            ${(m.cortes || [])
              .slice(0, 12)
              .map(
                (c) =>
                  `<li><strong>${escapeHtml(c.corte)}</strong> · ${kg(c.kg)} kg · $${money(c.valor)} · ${c.pct_valor}%</li>`
              )
              .join('')}
          </ul>`;
      });
    });
  }

  function renderCortes(d) {
    const tbC = $('hTablaCortes').querySelector('tbody');
    tbC.innerHTML =
      (d.cortes || [])
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
  }

  function renderTimeline(d) {
    const tl = $('hTimeline');
    tl.innerHTML =
      (d.timeline || [])
        .map((dia) => {
          const ods = (dia.ordenes || [])
            .map((o) => {
              const cortes = (o.cortes || [])
                .map(
                  (c) =>
                    `<li><strong>${escapeHtml(c.corte)}</strong> · ${kg(c.kg)} kg · $${money(c.valor)}</li>`
                )
                .join('');
              return `<details class="block hist-od">
                <summary class="row">
                  <span class="row-title">${escapeHtml(o.orden_od)}</span>
                  <span class="row-meta">$${money(o.valor)} · Fac ${o.valor_factura != null ? '$' + money(o.valor_factura) : '—'}</span>
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
    setStatus(conCliente ? `Cargando ficha de ${state.cliente}…` : 'Actualizando dashboard…');

    try {
      const p = new URLSearchParams({ desde, hasta });
      if (conCliente && state.cliente) p.set('cliente', state.cliente);

      const res = await apiFetch(`/api/od/historial?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en historial');

      state.data = data;
      renderStats(data.totales);
      renderRanking();
      renderChartsGlobales();

      if (conCliente && data.detalleCliente) {
        mostrarFicha(data.detalleCliente);
        setStatus(`Ficha · ${data.detalleCliente.cliente}`, 'ok');
      } else {
        if (!conCliente) cerrarFicha();
        setStatus(
          `Dashboard · ${fechaCorta(desde)} → ${fechaCorta(hasta)} · ${data.totales.clientes} clientes`,
          'ok'
        );
      }
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
    $('btnHConsultar').addEventListener('click', () => {
      cerrarFicha();
      consultar(false);
    });
    $('hBusca').addEventListener('input', () => {
      if (!state.data) return;
      renderRanking();
      renderChartsGlobales();
    });
    $('hFichaCerrar').addEventListener('click', cerrarFicha);
    $('hFichaOverlay').addEventListener('click', (e) => {
      if (e.target === $('hFichaOverlay')) cerrarFicha();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('hFichaOverlay').hidden) cerrarFicha();
    });
  }

  return { init, consultar, setRango, cerrarFicha };
})();

window.ValidadorHistorial.init();

const $ = (id) => document.getElementById(id);

const TOKEN_KEY = 'vod_token';

const state = {
  data: null,
  clienteActivo: '',
  refreshTimer: null,
  consultando: false,
  debounceTimer: null,
  pendiente: false,
  busquedaAmpliaCliente: false,
  iniciado: false,
};

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    mostrarLock('Sesión expirada. Ingresa el PIN.');
    throw new Error('PIN requerido');
  }
  return res;
}
window.apiFetch = apiFetch;

function cambiarVista(vista) {
  const esHist = vista === 'historial';
  $('vistaValidador').hidden = esHist;
  $('vistaHistorial').hidden = !esHist;
  $('tabValidador').classList.toggle('active', !esHist);
  $('tabHistorial').classList.toggle('active', esHist);
  $('btnHoy').hidden = esHist;
  $('btnExcel').hidden = esHist;
  $('taglineVista').textContent = esHist
    ? 'Historial · ranking de compras · cortes por cliente · seguimiento por fechas'
    : 'Solo OD facturadas · Cliente → Orden OD (fecha) → Corte → Lote';

  if (esHist && window.ValidadorHistorial) {
    window.ValidadorHistorial.consultar(false);
  }
}

function mostrarLock(msg) {
  clearToken();
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  $('appRoot').hidden = true;
  $('lockScreen').hidden = false;
  if (msg) {
    $('pinError').hidden = false;
    $('pinError').textContent = msg;
  } else {
    $('pinError').hidden = true;
  }
  $('pinInput').value = '';
  setTimeout(() => $('pinInput').focus(), 50);
}

function mostrarApp() {
  $('lockScreen').hidden = true;
  $('appRoot').hidden = false;
  $('pinError').hidden = true;
}

async function loginConPin(pin) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'PIN incorrecto');
  setToken(data.token);
  return data;
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  mostrarLock();
}

async function sesionValida() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await apiFetch('/api/auth/check');
    return res.ok;
  } catch {
    return false;
  }
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatFechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function daysAgoISO(n) {
  const parts = todayISO().split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function rangoEfectivo() {
  const desde = $('desde').value;
  const hasta = $('hasta').value;
  const hoy = todayISO();

  // Búsqueda de cliente: si no hay rango manual, mira último año
  if (state.busquedaAmpliaCliente && !desde && !hasta) {
    return { desde: daysAgoISO(365), hasta: hoy, modo: 'amplio' };
  }

  if (!desde && !hasta) {
    return { desde: hoy, hasta: hoy, modo: 'hoy' };
  }
  if (desde && !hasta) {
    return { desde, hasta: desde, modo: 'rango' };
  }
  if (!desde && hasta) {
    return { desde: hasta, hasta, modo: 'rango' };
  }
  return { desde, hasta, modo: 'rango' };
}

function actualizarHintRango() {
  const r = rangoEfectivo();
  const el = $('rangoActivo');
  if (r.modo === 'amplio') {
    el.textContent = `Búsqueda de cliente · últimos 12 meses · ${formatFechaCorta(r.desde)} → ${formatFechaCorta(r.hasta)}`;
    el.classList.add('rango');
  } else if (r.modo === 'hoy') {
    el.textContent = `Mostrando el día de hoy · ${formatFechaCorta(r.desde)}`;
    el.classList.remove('rango');
  } else if (r.desde === r.hasta) {
    el.textContent = `Rango personalizado · ${formatFechaCorta(r.desde)}`;
    el.classList.add('rango');
  } else {
    el.textContent = `Rango personalizado · ${formatFechaCorta(r.desde)} → ${formatFechaCorta(r.hasta)}`;
    el.classList.add('rango');
  }
}

function money(n) {
  return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function kg(n) {
  return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function fechaStr(v) {
  if (!v) return '—';
  return String(v).slice(0, 10);
}

function pillClass(vs) {
  if (vs === 'IGUAL_LISTA') return 'ok';
  if (vs === 'MENOR_LISTA') return 'warn';
  if (vs === 'MAYOR_LISTA') return 'bad';
  return 'neutral';
}

function queryParams(extra = {}) {
  const r = rangoEfectivo();
  const p = new URLSearchParams({
    desde: r.desde,
    hasta: r.hasta,
  });
  const cliente = extra.cliente !== undefined ? extra.cliente : $('cliente').value;
  const corte = $('corte').value;
  const orden = $('orden').value.trim();
  if (cliente) p.set('cliente', cliente);
  if (corte) p.set('corte', corte);
  if (orden) p.set('orden', orden);
  p.set('estadoFactura', 'facturadas');
  if ($('soloDescuento').checked) p.set('soloDescuento', '1');
  if ($('soloDifLista').checked) p.set('soloDifLista', '1');
  if ($('excluirPrecioCero').checked) p.set('excluirPrecioCero', '1');
  return p;
}

function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (type ? ` ${type}` : '');
}

async function cargarListas() {
  const r = rangoEfectivo();
  const base = new URLSearchParams({
    desde: r.desde,
    hasta: r.hasta,
  });
  const clienteSel = $('cliente').value;

  const [cliRes, corteRes] = await Promise.all([
    apiFetch(`/api/od/clientes?${base}`),
    apiFetch(`/api/od/cortes?${base}${clienteSel ? `&cliente=${encodeURIComponent(clienteSel)}` : ''}`),
  ]);
  const clientes = await cliRes.json();
  const cortes = await corteRes.json();
  if (!cliRes.ok) throw new Error(clientes.error || 'Error cargando clientes');
  if (!corteRes.ok) throw new Error(cortes.error || 'Error cargando cortes');

  const prevCli = $('cliente').value;
  const prevCorte = $('corte').value;

  $('cliente').innerHTML = '<option value="">Todos los clientes</option>';
  for (const c of clientes.rows || []) {
    const opt = document.createElement('option');
    opt.value = c.cliente;
    opt.textContent = c.cliente;
    $('cliente').appendChild(opt);
  }
  if ([...$('cliente').options].some((o) => o.value === prevCli)) {
    $('cliente').value = prevCli;
  }

  $('corte').innerHTML = '<option value="">Todos los cortes</option>';
  for (const c of cortes.rows || []) {
    const opt = document.createElement('option');
    opt.value = c.corte;
    opt.textContent = c.corte;
    $('corte').appendChild(opt);
  }
  if ([...$('corte').options].some((o) => o.value === prevCorte)) {
    $('corte').value = prevCorte;
  }
}

function renderStats(totales) {
  $('stats').hidden = false;
  $('sClientes').textContent = String(totales.clientes);
  $('sOrdenes').textContent = String(totales.ordenes);
  $('sCortes').textContent = String(totales.cortes);
  $('sKg').textContent = kg(totales.kg);
  $('sValor').textContent = '$' + money(totales.valor);
  $('sDif').textContent = String(totales.diferente_lista);
  $('sDesc').textContent = String(totales.con_descuento);
}

function renderListaClientes() {
  const box = $('listaClientes');
  const q = ($('buscaCliente').value || '').toLowerCase().trim();
  const resumen = state.data?.resumen || [];
  box.innerHTML = '';

  const todos = document.createElement('button');
  todos.type = 'button';
  todos.className = 'client-item' + (!state.clienteActivo ? ' active' : '');
  todos.innerHTML = `<div class="name">Todos</div><div class="sub">${resumen.length} clientes</div>`;
  todos.onclick = () => {
    state.clienteActivo = '';
    state.busquedaAmpliaCliente = false;
    $('cliente').value = '';
    $('buscaCliente').value = '';
    renderListaClientes();
    consultar(false);
  };
  box.appendChild(todos);

  const filtrados = resumen
    .filter((r) => !q || String(r.cliente).toLowerCase().includes(q))
    .sort((a, b) => String(b.fecha_reciente || '').localeCompare(String(a.fecha_reciente || '')));

  for (const r of filtrados) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'client-item' + (state.clienteActivo === r.cliente ? ' active' : '');
    const fechaTxt = r.fecha_reciente ? formatFechaCorta(r.fecha_reciente) : '—';
    btn.innerHTML = `
      <div class="name">${r.cliente}</div>
      <div class="sub">NIT ${r.nit || '—'} · última OD ${fechaTxt}</div>
      <div class="sub">${r.num_ordenes} OD · ${kg(r.kg_total)} kg · $${money(r.valor_od)}</div>
    `;
    btn.onclick = () => seleccionarCliente(r.cliente);
    box.appendChild(btn);
  }

  if (q && !filtrados.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Sin coincidencias en este rango. Pulsa Enter para buscar en 12 meses.';
    box.appendChild(empty);
  }
}

function seleccionarCliente(nombre) {
  state.clienteActivo = nombre;
  $('cliente').value = nombre;
  $('buscaCliente').value = nombre;
  const r = rangoEfectivo();
  // Sin rango manual → ampliar a 12 meses para ver todo el historial del cliente
  state.busquedaAmpliaCliente = !$('desde').value && !$('hasta').value;
  renderListaClientes();
  consultar(false);
}

function ordenarOrdenesPorFecha(ordenesObj) {
  return Object.entries(ordenesObj || {}).sort((a, b) => {
    const fa = String(a[1].fecha || '').slice(0, 10);
    const fb = String(b[1].fecha || '').slice(0, 10);
    if (fa !== fb) return fa < fb ? 1 : -1;
    return String(b[0]).localeCompare(String(a[0]));
  });
}

function fechaRecienteCliente(node) {
  let max = '';
  for (const od of Object.values(node.ordenes || {})) {
    const f = String(od.fecha || '').slice(0, 10);
    if (f > max) max = f;
  }
  return max;
}

function renderTree() {
  const treeEl = $('tree');
  if (!state.data) {
    treeEl.innerHTML = '<p class="muted">Sin datos todavía.</p>';
    return;
  }

  const tree = state.data.tree || {};
  const expand = $('expandirTodo').checked || !!state.clienteActivo;
  let clientes = Object.keys(tree).sort((a, b) => {
    const fa = fechaRecienteCliente(tree[a]);
    const fb = fechaRecienteCliente(tree[b]);
    if (fa !== fb) return fa < fb ? 1 : -1;
    return a.localeCompare(b);
  });
  if (state.clienteActivo) {
    clientes = clientes.filter((c) => c === state.clienteActivo);
  }

  $('tituloVista').textContent = state.clienteActivo || 'Todos los clientes filtrados';
  $('vistaMeta').textContent = `${clientes.length} cliente(s) · OD más recientes primero`;

  if (!clientes.length) {
    treeEl.innerHTML = '<p class="muted">No hay resultados con estos filtros.</p>';
    return;
  }

  let html = '';
  for (const cli of clientes) {
    const node = tree[cli];
    const ordenes = ordenarOrdenesPorFecha(node.ordenes);
    const fechaUlt = fechaRecienteCliente(node);
    html += `<details class="block" ${expand ? 'open' : ''}>
      <summary class="row">
        <span class="row-title">${cli}</span>
        <span class="row-meta">NIT ${node.nit || '—'} · última OD ${fechaUlt ? formatFechaCorta(fechaUlt) : '—'} · ${ordenes.length} OD</span>
      </summary>
      <div class="body">`;

    for (const [odCodigo, od] of ordenes) {
      const cortes = Object.entries(od.cortes || {}).sort((a, b) => a[0].localeCompare(b[0]));
      const kgOd = cortes.reduce(
        (s, [, c]) => s + c.lotes.reduce((a, l) => a + l.kg, 0),
        0
      );
      const valOdCorte = cortes.reduce(
        (s, [, c]) => s + c.lotes.reduce((a, l) => a + l.subtotal, 0),
        0
      );
      const valorOrden = od.valor_od_orden != null ? od.valor_od_orden : valOdCorte;
      const valorFacturada = od.valor_factura;
      const valorProductosFac = od.valor_productos_factura;
      const diff =
        valorFacturada != null ? Math.round((valorOrden - valorFacturada) * 100) / 100 : null;
      const fechaOd = formatFechaCorta(String(od.fecha || '').slice(0, 10));

      html += `<details class="block" ${expand ? 'open' : ''}>
        <summary class="row">
          <span class="row-title">${odCodigo} · ${fechaOd || 's/f'}</span>
          <span class="row-meta">
            <span class="pill ${od.estado_factura === 'FACTURADA' ? 'ok' : 'warn'}">${od.estado_factura === 'FACTURADA' ? 'FACTURADA' : 'SIN FACTURA'}</span>
            <span class="pill ${pillClass(od.vs_lista)}">${String(od.vs_lista || '').replaceAll('_', ' ')}</span>
            &nbsp; OD $${money(valorOrden)} · Fac ${valorFacturada != null ? '$' + money(valorFacturada) : '—'}
          </span>
        </summary>
        <div class="body">
          <div class="grid4">
            <div class="mini accent"><div class="v">${fechaOd || '—'}</div><div class="l">Fecha de la orden</div></div>
            <div class="mini"><div class="v">${cortes.length}</div><div class="l">Cortes en la OD</div></div>
            <div class="mini"><div class="v">${kg(kgOd)} kg</div><div class="l">Kg totales OD</div></div>
            <div class="mini"><div class="v">$${money(valorOrden)}</div><div class="l">Valor de la orden</div></div>
          </div>
          <div class="grid4 valores-od">
            <div class="mini accent">
              <div class="v">$${money(valorOrden)}</div>
              <div class="l">Valor de la orden (OD completa)</div>
            </div>
            <div class="mini accent">
              <div class="v">${valorFacturada != null ? '$' + money(valorFacturada) : '—'}</div>
              <div class="l">Valor orden facturada (total factura)</div>
            </div>
            <div class="mini">
              <div class="v">${valorProductosFac != null ? '$' + money(valorProductosFac) : '—'}</div>
              <div class="l">Productos en factura (sin retenciones)</div>
            </div>
            <div class="mini ${diff != null && Math.abs(diff) > 1 ? 'warn' : ''}">
              <div class="v">${diff != null ? '$' + money(diff) : '—'}</div>
              <div class="l">Diferencia OD − factura</div>
            </div>
          </div>
          ${
            od.estado_factura === 'FACTURADA'
              ? `<div class="muted">Factura ID ${od.id_factura || '—'} · ${fechaStr(od.fecha_factura)} · ${od.numeracion || 's/n'}</div>`
              : `<div class="muted">Esta OD aún no está ligada a una factura en SIRT.</div>`
          }`;

      for (const [corteNombre, corte] of cortes) {
        const kgCorte = corte.lotes.reduce((a, l) => a + l.kg, 0);
        const valCorte = corte.lotes.reduce((a, l) => a + l.subtotal, 0);
        const rows = corte.lotes
          .map(
            (l) =>
              `<tr><td>${l.lote}</td><td class="num">${kg(l.kg)}</td><td class="num">$${money(l.subtotal)}</td></tr>`
          )
          .join('');
        const vs = corte.lotes[0]?.vs_lista;

        html += `<details class="block" ${expand ? 'open' : ''}>
          <summary class="row">
            <span class="row-title">${corteNombre}</span>
            <span class="row-meta">
              <span class="pill ${pillClass(vs)}">${String(vs || '').replaceAll('_', ' ')}</span>
              &nbsp; ${kg(kgCorte)} kg · $${money(valCorte)}
            </span>
          </summary>
          <div class="body">
            <div class="muted">Código corte ${corte.codigo || '—'} · fecha OD ${fechaOd || '—'}</div>
            <table>
              <thead><tr><th>Lote</th><th class="num">Kg llevados</th><th class="num">Subtotal</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>`;
      }

      html += '</div></details>';
    }

    html += '</div></details>';
  }

  treeEl.innerHTML = html;
}

async function consultar(silent = false) {
  if (state.consultando) {
    state.pendiente = true;
    return;
  }
  state.consultando = true;
  actualizarHintRango();
  try {
    $('btnExcel').disabled = true;
    if (!silent) setStatus('Consultando SIRT…');

    await cargarListas();
    const params = queryParams();
    const res = await apiFetch(`/api/od/consulta?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error en consulta');

    state.data = data;
    state.clienteActivo = $('cliente').value || '';

    renderStats(data.totales);
    renderListaClientes();
    renderTree();

    $('btnExcel').disabled = data.totales.lineas === 0;
    const ahora = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const r = rangoEfectivo();
    const etiqueta =
      r.modo === 'hoy'
        ? 'hoy'
        : r.modo === 'amplio'
          ? `12 meses (${formatFechaCorta(r.desde)} → ${formatFechaCorta(r.hasta)})`
          : `${formatFechaCorta(r.desde)} → ${formatFechaCorta(r.hasta)}`;
    setStatus(
      `Actualizado ${ahora} · ${etiqueta}: ${data.totales.lineas} líneas · ${data.totales.clientes} clientes · ${data.totales.ordenes} OD`,
      'ok'
    );
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), 'error');
  } finally {
    state.consultando = false;
    if (state.pendiente) {
      state.pendiente = false;
      consultar(true);
    }
  }
}

function programarConsulta(delay = 280) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => consultar(false), delay);
}

function descargarExcel() {
  const params = queryParams({ cliente: state.clienteActivo || $('cliente').value });
  const token = getToken();
  if (token) params.set('token', token);
  window.location.href = `/api/od/excel?${params}`;
}

function setupAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  const on = $('autoRefresh').checked;
  $('liveBadge').classList.toggle('off', !on);
  if (on) {
    state.refreshTimer = setInterval(() => {
      consultar(true);
    }, 30000);
  }
}

function syncChips() {
  document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    const id = chip.dataset.filter;
    const checked = $(id).checked;
    chip.classList.toggle('active', checked);
    chip.setAttribute('aria-pressed', checked ? 'true' : 'false');
  });
}

function irAHoy() {
  $('desde').value = '';
  $('hasta').value = '';
  state.busquedaAmpliaCliente = false;
  actualizarHintRango();
  consultar(false);
}

function iniciarApp() {
  if (state.iniciado) {
    setupAutoRefresh();
    consultar(false);
    return;
  }
  state.iniciado = true;

  $('desde').value = '';
  $('hasta').value = '';
  actualizarHintRango();
  syncChips();

  $('btnHoy').addEventListener('click', irAHoy);
  $('btnLimpiarFechas').addEventListener('click', irAHoy);
  $('btnExcel').addEventListener('click', descargarExcel);
  $('btnSalir').addEventListener('click', logout);
  $('tabValidador').addEventListener('click', () => cambiarVista('validador'));
  $('tabHistorial').addEventListener('click', () => cambiarVista('historial'));
  $('buscaCliente').addEventListener('input', renderListaClientes);
  $('buscaCliente').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = $('buscaCliente').value.trim();
    if (!q) return;
    seleccionarCliente(q);
  });

  $('desde').addEventListener('change', () => {
    state.busquedaAmpliaCliente = false;
    programarConsulta(80);
  });
  $('hasta').addEventListener('change', () => {
    state.busquedaAmpliaCliente = false;
    programarConsulta(80);
  });
  $('cliente').addEventListener('change', () => {
    const v = $('cliente').value;
    if (v) seleccionarCliente(v);
    else {
      state.clienteActivo = '';
      state.busquedaAmpliaCliente = false;
      programarConsulta(80);
    }
  });
  $('corte').addEventListener('change', () => programarConsulta(80));
  $('orden').addEventListener('input', () => programarConsulta(450));

  document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.filter;
      const box = $(id);
      box.checked = !box.checked;
      syncChips();
      if (id === 'autoRefresh') {
        setupAutoRefresh();
        return;
      }
      if (id === 'expandirTodo' && state.data) {
        renderTree();
        return;
      }
      programarConsulta(80);
    });
  });

  setupAutoRefresh();
  consultar(false);
}

async function init() {
  $('pinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('pinInput').value.trim();
    $('pinError').hidden = true;
    try {
      await loginConPin(pin);
      mostrarApp();
      iniciarApp();
    } catch (err) {
      $('pinError').hidden = false;
      $('pinError').textContent = err.message || 'PIN incorrecto';
      $('pinInput').select();
    }
  });

  if (await sesionValida()) {
    mostrarApp();
    iniciarApp();
  } else {
    mostrarLock();
  }
}

init();

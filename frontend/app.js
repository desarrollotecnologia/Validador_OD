const $ = (id) => document.getElementById(id);

const TOKEN_KEY = 'vod_token';

const state = {
  data: null,
  clienteActivo: '',
  refreshTimer: null,
  consultando: false,
  debounceTimer: null,
  pendiente: false,
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

function rangoEfectivo() {
  const desde = $('desde').value;
  const hasta = $('hasta').value;
  const hoy = todayISO();
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
  if (r.modo === 'hoy') {
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
  const q = ($('buscaCliente').value || '').toLowerCase();
  const resumen = state.data?.resumen || [];
  box.innerHTML = '';

  const todos = document.createElement('button');
  todos.type = 'button';
  todos.className = 'client-item' + (!state.clienteActivo ? ' active' : '');
  todos.innerHTML = `<div class="name">Todos</div><div class="sub">${resumen.length} clientes</div>`;
  todos.onclick = () => {
    state.clienteActivo = '';
    $('cliente').value = '';
    renderListaClientes();
    renderTree();
  };
  box.appendChild(todos);

  for (const r of resumen) {
    if (q && !String(r.cliente).toLowerCase().includes(q)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'client-item' + (state.clienteActivo === r.cliente ? ' active' : '');
    btn.innerHTML = `
      <div class="name">${r.cliente}</div>
      <div class="sub">${r.num_ordenes} OD · ${kg(r.kg_total)} kg · $${money(r.valor_od)}</div>
    `;
    btn.onclick = () => {
      state.clienteActivo = r.cliente;
      $('cliente').value = r.cliente;
      renderListaClientes();
      renderTree();
    };
    box.appendChild(btn);
  }
}

function renderTree() {
  const treeEl = $('tree');
  if (!state.data) {
    treeEl.innerHTML = '<p class="muted">Sin datos todavía.</p>';
    return;
  }

  const tree = state.data.tree || {};
  const expand = $('expandirTodo').checked;
  let clientes = Object.keys(tree).sort();
  if (state.clienteActivo) {
    clientes = clientes.filter((c) => c === state.clienteActivo);
  }

  $('tituloVista').textContent = state.clienteActivo || 'Todos los clientes filtrados';
  $('vistaMeta').textContent = `${clientes.length} cliente(s) visibles`;

  if (!clientes.length) {
    treeEl.innerHTML = '<p class="muted">No hay resultados con estos filtros.</p>';
    return;
  }

  let html = '';
  for (const cli of clientes) {
    const node = tree[cli];
    const cortes = Object.keys(node.cortes).sort();
    html += `<details class="block" ${expand ? 'open' : ''}>
      <summary class="row">
        <span class="row-title">${cli}</span>
        <span class="row-meta">NIT ${node.nit || '—'} · ${cortes.length} cortes</span>
      </summary>
      <div class="body">`;

    for (const corteNombre of cortes) {
      const corte = node.cortes[corteNombre];
      const ods = Object.entries(corte.ods);
      const kgCorte = ods.reduce((s, [, od]) => s + od.lotes.reduce((a, l) => a + l.kg, 0), 0);
      const valCorte = ods.reduce((s, [, od]) => s + od.lotes.reduce((a, l) => a + l.subtotal, 0), 0);

      html += `<details class="block" ${expand ? 'open' : ''}>
        <summary class="row">
          <span class="row-title">${corteNombre}</span>
          <span class="row-meta">${ods.length} OD · ${kg(kgCorte)} kg · $${money(valCorte)}</span>
        </summary>
        <div class="body">
          <div class="muted">Código corte ${corte.codigo || '—'}</div>`;

      for (const [odCodigo, od] of ods) {
        const kgOd = od.lotes.reduce((a, l) => a + l.kg, 0);
        const valOdCorte = od.lotes.reduce((a, l) => a + l.subtotal, 0);
        const valorOrden = od.valor_od_orden != null ? od.valor_od_orden : valOdCorte;
        const valorFacturada = od.valor_factura;
        const valorProductosFac = od.valor_productos_factura;
        const diff =
          valorFacturada != null ? Math.round((valorOrden - valorFacturada) * 100) / 100 : null;
        const rows = od.lotes
          .map(
            (l) =>
              `<tr><td>${l.lote}</td><td class="num">${kg(l.kg)}</td><td class="num">$${money(l.subtotal)}</td></tr>`
          )
          .join('');

        html += `<details class="block" ${expand ? 'open' : ''}>
          <summary class="row">
            <span class="row-title">${odCodigo}</span>
            <span class="row-meta">
              <span class="pill ${od.estado_factura === 'FACTURADA' ? 'ok' : 'warn'}">${od.estado_factura === 'FACTURADA' ? 'FACTURADA' : 'SIN FACTURA'}</span>
              <span class="pill ${pillClass(od.vs_lista)}">${String(od.vs_lista || '').replaceAll('_', ' ')}</span>
              &nbsp; OD $${money(valorOrden)} · Fac ${valorFacturada != null ? '$' + money(valorFacturada) : '—'}
            </span>
          </summary>
          <div class="body">
            <div class="grid4">
              <div class="mini"><div class="v">${fechaStr(od.fecha)}</div><div class="l">Fecha despacho</div></div>
              <div class="mini"><div class="v">$${money(od.precio_od)}</div><div class="l">Precio OD / kg</div></div>
              <div class="mini"><div class="v">${od.precio_lista != null ? '$' + money(od.precio_lista) : '—'}</div><div class="l">Precio lista / kg</div></div>
              <div class="mini"><div class="v">${kg(kgOd)} kg</div><div class="l">Kg este corte en OD</div></div>
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
            <div class="muted">Este corte (${corteNombre}) en la OD: $${money(valOdCorte)}</div>
            ${
              od.estado_factura === 'FACTURADA'
                ? `<div class="muted">Factura ID ${od.id_factura || '—'} · ${fechaStr(od.fecha_factura)} · ${od.numeracion || 's/n'}</div>`
                : `<div class="muted">Esta OD aún no está ligada a una factura en SIRT.</div>`
            }
            ${Number(od.descuento_pct) > 0 ? `<div class="muted">Descuento OD: ${od.descuento_pct}%</div>` : ''}
            <table>
              <thead><tr><th>Lote</th><th class="num">Kg llevados</th><th class="num">Subtotal</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="muted" style="margin-top:8px">Total ${odCodigo} / ${corteNombre}: ${kg(kgOd)} kg · $${money(valOdCorte)}</div>
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
    const etiqueta = r.modo === 'hoy' ? 'hoy' : `${formatFechaCorta(r.desde)} → ${formatFechaCorta(r.hasta)}`;
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
  $('buscaCliente').addEventListener('input', renderListaClientes);

  $('desde').addEventListener('change', () => programarConsulta(80));
  $('hasta').addEventListener('change', () => programarConsulta(80));
  $('cliente').addEventListener('change', () => {
    state.clienteActivo = $('cliente').value;
    programarConsulta(80);
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

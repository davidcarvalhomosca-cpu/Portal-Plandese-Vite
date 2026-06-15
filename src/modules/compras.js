// ═══════════════════════════════════════
//  MÓDULO COMPRAS — pedidos e mapa Leaflet
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S, R } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast, flashAlert, closeModal } from './navigation.js';
import { sbLoadFornecedores } from './fornecedores.js';

let COMPRAS = [];
let _cmpSeq = 1;
let _cmpArtigosEdit = [];
let _cmpFornsEdit   = [];
let _artPickerItems = [];
let _mapaLeaflet = null;
let _mapaMarker  = null;
let _mapaCoords  = null;

// ═══════════════════════════════════════
//  MÓDULO COMPRAS
// ═══════════════════════════════════════
// modelo: {id, titulo, descricao, obraId, fornecedor, urgencia, estado, dataLimite,
//          notas, local, localLat, localLng, emailNotif, criadoPor, criadoNome, criadoEm}

// ── Supabase ────────────────────────────────────────────────────
async function sbLoadCompras() {
  try {
    const {data, error} = await sb.from('pedidos_compra').select('*').order('created_at', {ascending: false});
    if (error) throw error;
    if (data) {
      COMPRAS = data.map(r => ({
        id:               r.id,
        titulo:           r.titulo || r.artigo || '',
        artigos:          Array.isArray(r.artigos) ? r.artigos : [],
        obraId:           r.obra_id || '',
        fornecedor:       r.fornecedor || '',
        fornecedores:     Array.isArray(r.fornecedores) ? r.fornecedores : (r.fornecedor ? [r.fornecedor] : []),
        urgencia:         r.urgencia || 'Normal',
        estado:           r.estado || 'pendente',
        dataLimite:       r.data_limite || '',
        notas:            r.notas || '',
        local:            r.local || '',
        localLat:         r.local_lat || null,
        localLng:         r.local_lng || null,
        emailNotif:       r.email_notif || '',
        pedidoCotacao:    !!r.pedido_cotacao,
        aprovadoDO:       !!r.aprovado_do,
        adjudicado:       !!r.adjudicado,
        dataFornecimento: r.data_fornecimento || '',
        criadoPor:        r.criado_por || '',
        criadoNome:       r.criado_nome || r.criado_por || '',
        criadoEm:         r.created_at ? r.created_at.slice(0,10) : fmt(new Date())
      }));
    }
  } catch(e) { console.warn('Erro ao carregar compras:', e); }
}

async function sbSaveCompra(c) {
  try {
    const rec = {
      titulo:             c.titulo,
      artigos:            Array.isArray(c.artigos) ? c.artigos : [],
      obra_id:            c.obraId           || null,
      fornecedor:         c.fornecedor       || null,
      fornecedores:       Array.isArray(c.fornecedores) ? c.fornecedores : [],
      urgencia:           c.urgencia,
      estado:             c.estado,
      data_limite:        c.dataLimite       || null,
      notas:              c.notas            || null,
      local:              c.local            || null,
      local_lat:          c.localLat         || null,
      local_lng:          c.localLng         || null,
      email_notif:        c.emailNotif       || null,
      pedido_cotacao:     !!c.pedidoCotacao,
      aprovado_do:        !!c.aprovadoDO,
      adjudicado:         !!c.adjudicado,
      data_fornecimento:  c.dataFornecimento || null,
      criado_por:         c.criadoPor        || null,
      criado_nome:        c.criadoNome       || null
    };
    if (c.id && typeof c.id === 'string' && c.id.includes('-')) {
      const {error} = await sb.from('pedidos_compra').update(rec).eq('id', c.id);
      if (error) throw error;
    } else {
      const {data, error} = await sb.from('pedidos_compra').insert(rec).select().single();
      if (error) throw error;
      if (data) c.id = data.id;
    }
  } catch(e) { console.warn('Erro ao guardar compra:', e); }
}

async function sbApagarCompra(id) {
  try {
    if (typeof id === 'string' && id.includes('-')) {
      await sb.from('pedidos_compra').delete().eq('id', id);
    }
  } catch(e) { console.warn('Erro ao apagar compra:', e); }
}

// ── Email de notificação ─────────────────────────────────────────
function enviarEmailNotificacao(c) {
  if (!c.emailNotif) return;
  const obraNome = S.OBRAS.find(o=>o.id===c.obraId)?.nome || '—';
  const mapLink  = c.localLat && c.localLng
    ? `\nMapa: https://www.openstreetmap.org/?mlat=${c.localLat}&mlon=${c.localLng}#map=16/${c.localLat}/${c.localLng}`
    : (c.local ? `\nLocalização: ${c.local}` : '');
  const subject = encodeURIComponent(`[Compras] Novo pedido: ${c.titulo}`);
  const body    = encodeURIComponent(
    `Novo pedido de compra registado no Portal PLANDESE\n\n` +
    `Título: ${c.titulo}\n` +
    `Obra: ${obraNome}\n` +
    `Urgência: ${c.urgencia}\n` +
    `Estado: ${c.estado}\n` +
    (c.dataLimite ? `Data limite de entrega: ${fmtPT(c.dataLimite)}\n` : '') +
    (c.fornecedor ? `Fornecedor preferencial: ${c.fornecedor}\n` : '') +
    mapLink +
    `\n\nDescrição:\n${c.descricao||'—'}\n` +
    `\nNotas:\n${c.notas||'—'}\n` +
    `\nCriado por: ${c.criadoNome||c.criadoPor} em ${c.criadoEm}`
  );
  window.open(`mailto:${c.emailNotif}?subject=${subject}&body=${body}`, '_blank');
}

// ── Badges ───────────────────────────────────────────────────────
function urgBadge(u) {
  if (u === 'Muito Urgente') return '<span class="urg-muito">Muito Urgente</span>';
  if (u === 'Urgente')       return '<span class="urg-urgente">Urgente</span>';
  return '<span class="urg-normal">Normal</span>';
}
function cmpEstadoBadge(e) {
  const map = {
    pendente:    {cls:'cmp-estado-pendente',   label:'Pendente'},
    aprovado:    {cls:'cmp-estado-aprovado',   label:'Aprovado'},
    encomendado: {cls:'cmp-estado-encomendado',label:'Encomendado'},
    entregue:    {cls:'cmp-estado-entregue',   label:'Entregue'}
  };
  const m = map[e] || {cls:'b-gray', label: e};
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
function cmpFornDisplay(c) {
  const fns = Array.isArray(c.fornecedores) && c.fornecedores.length ? c.fornecedores : (c.fornecedor ? [c.fornecedor] : []);
  if (!fns.length) return '—';
  if (fns.length === 1) return `<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:170px" title="${fns[0]}">${fns[0]}</span>`;
  return `<span title="${fns.join(', ')}" style="cursor:default">${fns[0]} <span style="color:var(--gray-400);font-size:11px">+${fns.length-1}</span></span>`;
}
function cmpWorkflowBadges(c) {
  let s = '';
  if (c.pedidoCotacao) s += '<span style="display:inline-block;margin-top:3px;margin-right:3px;background:var(--blue-50);color:var(--blue-700);border:1px solid var(--blue-200);border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap">Cotação</span>';
  if (c.aprovadoDO)    s += '<span style="display:inline-block;margin-top:3px;margin-right:3px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap">Aprov. DO</span>';
  if (c.adjudicado)    s += '<span style="display:inline-block;margin-top:3px;background:#faf5ff;color:#6b21a8;border:1px solid #e9d5ff;border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap">Adjudicado</span>';
  return s ? `<div style="margin-top:3px">${s}</div>` : '';
}
function dataLimiteBadge(dl, estado) {
  if (!dl || estado === 'entregue') return '<span class="dl-none">—</span>';
  const hoje = fmt(new Date());
  const diff = Math.round((new Date(dl) - new Date(hoje)) / 86400000);
  const label = fmtPT(dl);
  if (diff < 0)  return `<span class="dl-over" title="Em atraso ${Math.abs(diff)} dia(s)">⚠ ${label}</span>`;
  if (diff <= 3) return `<span class="dl-warn" title="${diff} dia(s) restante(s)">⏳ ${label}</span>`;
  return `<span class="dl-ok">${label}</span>`;
}

// ── KPIs ─────────────────────────────────────────────────────────
function atualizaKPIsCompras() {
  const total = COMPRAS.length;
  const pend  = COMPRAS.filter(c => c.estado === 'pendente').length;
  const enc   = COMPRAS.filter(c => c.estado === 'encomendado').length;
  const ent   = COMPRAS.filter(c => c.estado === 'entregue').length;
  const el = id => document.getElementById(id);
  if(el('cmp-k-total')) el('cmp-k-total').textContent = total;
  if(el('cmp-k-pend'))  el('cmp-k-pend').textContent  = pend;
  if(el('cmp-k-enc'))   el('cmp-k-enc').textContent   = enc;
  if(el('cmp-k-ent'))   el('cmp-k-ent').textContent   = ent;
  const nb = document.getElementById('nb-cmp');
  if (nb) { nb.textContent = pend; nb.style.display = pend > 0 ? '' : 'none'; }
}

// ── Filtros e render (agrupado por obra) ─────────────────────────
function filtraCompras() {
  const srch = (document.getElementById('cmp-f-search')?.value||'').toLowerCase();
  const obra = document.getElementById('cmp-f-obra')?.value||'';
  const est  = document.getElementById('cmp-f-estado')?.value||'';
  const urg  = document.getElementById('cmp-f-urg')?.value||'';
  return COMPRAS.filter(c => {
    if (srch && !c.titulo.toLowerCase().includes(srch) &&
        !(c.fornecedor||'').toLowerCase().includes(srch) &&
        !(c.criadoNome||'').toLowerCase().includes(srch)) return false;
    if (obra && c.obraId !== obra) return false;
    if (est  && c.estado !== est)  return false;
    if (urg  && c.urgencia !== urg) return false;
    return true;
  });
}

// ── Vista activa ─────────────────────────────────────────────────
let _cmpView = 'lista';

export function cmpSetView(mode) {
  _cmpView = mode;
  ['lista','cards','resumo'].forEach(m => {
    document.getElementById('cmp-vbtn-'+m)?.classList.toggle('active', m === mode);
  });
  renderCompras();
}

// ── Agrupamento auxiliar ──────────────────────────────────────────
function _cmpGrupos(lista) {
  const grupos = {};
  lista.forEach(c => {
    const k = c.obraId || '__sem_obra__';
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(c);
  });
  return Object.keys(grupos).sort((a,b) => {
    if (a === '__sem_obra__') return 1;
    if (b === '__sem_obra__') return -1;
    const na = S.OBRAS.find(o=>o.id===a)?.nome||'';
    const nb = S.OBRAS.find(o=>o.id===b)?.nome||'';
    return na.localeCompare(nb, 'pt');
  }).map(k => ({
    k,
    nome: k === '__sem_obra__' ? 'Sem obra associada' : (S.OBRAS.find(o=>o.id===k)?.nome || k),
    items: grupos[k]
  }));
}

// ── Vista: Lista (tabela agrupada) ───────────────────────────────
function _renderLista(lista) {
  const grupos = _cmpGrupos(lista);
  let html = `<div class="card" style="padding:0;overflow:hidden"><div class="tbl-wrap"><table>
    <thead><tr><th>Título</th><th>Fornecedor</th><th>Urgência</th><th>Estado</th><th>Entrega limite</th><th>Criado por</th><th></th></tr></thead>
    <tbody>`;
  grupos.forEach(({nome, items}) => {
    html += `<tr class="cmp-group-row"><td colspan="7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;vertical-align:middle;margin-right:5px"><path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z"/></svg>
      ${nome} <span style="font-weight:400;color:var(--gray-400);margin-left:6px">(${items.length})</span>
    </td></tr>`;
    items.forEach(c => {
      const autorNome = c.criadoNome || c.criadoPor || '—';
      const emailIco = c.emailNotif ? `<span title="${c.emailNotif}" style="margin-left:4px;color:var(--blue-500)"><svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;vertical-align:middle"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></span>` : '';
      const mapIco = (c.localLat && c.localLng) ? `<a href="https://www.openstreetmap.org/?mlat=${c.localLat}&mlon=${c.localLng}#map=16/${c.localLat}/${c.localLng}" target="_blank" title="${c.local}" style="color:var(--blue-500);display:inline-flex;align-items:center;gap:3px;font-size:11px;text-decoration:none"><svg viewBox="0 0 24 24" fill="currentColor" style="width:11px;height:11px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>Ver mapa</a>` : '';
      html += `<tr>
        <td style="max-width:220px"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titulo}</strong>${c.local ? `<div>${mapIco || `<span style="font-size:11px;color:var(--gray-400)">${c.local}</span>`}</div>` : ''}</td>
        <td style="color:var(--gray-600);max-width:180px">${cmpFornDisplay(c)}</td>
        <td>${urgBadge(c.urgencia)}</td>
        <td>${cmpEstadoBadge(c.estado)}${cmpWorkflowBadges(c)}</td>
        <td>${dataLimiteBadge(c.dataLimite, c.estado)}</td>
        <td style="font-size:12px;color:var(--gray-700);white-space:nowrap">${autorNome}${emailIco}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="editarCompra('${c.id}')">Editar</button></td>
      </tr>`;
    });
  });
  html += `</tbody></table></div></div>`;
  return html;
}

// ── Vista: Cartões por obra ──────────────────────────────────────
function _renderCards(lista) {
  const grupos = _cmpGrupos(lista);
  const ESTADO_COR = { pendente:'#F59E0B', aprovado:'#3B82F6', encomendado:'#8B5CF6', entregue:'#10B981' };
  let html = '<div style="display:flex;flex-direction:column;gap:20px">';
  grupos.forEach(({nome, items}) => {
    html += `<div class="card" style="padding:0;overflow:hidden">
      <div style="padding:12px 18px;background:var(--gray-50);border-bottom:1.5px solid var(--gray-200);display:flex;align-items:center;gap:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--blue-500);flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span style="font-size:14px;font-weight:700;color:var(--gray-900)">${nome}</span>
        <span style="margin-left:auto;font-size:12px;color:var(--gray-500);font-weight:500">${items.length} pedido${items.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:0">`;
    items.forEach((c, i) => {
      const forn = cmpFornDisplay(c);
      const urgColor = c.urgencia === 'Muito Urgente' ? '#EF4444' : c.urgencia === 'Urgente' ? '#F59E0B' : '#6B7280';
      const estadoCor = ESTADO_COR[c.estado] || '#6B7280';
      html += `<div style="display:flex;align-items:center;gap:14px;padding:11px 18px;${i > 0 ? 'border-top:1px solid var(--gray-100)' : ''};cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''" onclick="editarCompra('${c.id}')">
        <div style="width:4px;height:36px;border-radius:3px;background:${estadoCor};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titulo}</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${forn ? `<span>${forn}</span>` : ''}
            ${c.dataLimite ? `<span>📅 ${fmtPT(c.dataLimite)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          ${urgBadge(c.urgencia)}
          ${cmpEstadoBadge(c.estado)}
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  html += '</div>';
  return html;
}

// ── Vista: Resumo por obra ───────────────────────────────────────
function _renderResumo(lista) {
  const grupos = _cmpGrupos(lista);
  const urgentes = lista.filter(c => c.urgencia === 'Muito Urgente' || c.urgencia === 'Urgente').length;
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">`;
  grupos.forEach(({nome, items}) => {
    const pend = items.filter(c => c.estado === 'pendente').length;
    const aprov = items.filter(c => c.estado === 'aprovado').length;
    const enc  = items.filter(c => c.estado === 'encomendado').length;
    const ent  = items.filter(c => c.estado === 'entregue').length;
    const urg  = items.filter(c => c.urgencia === 'Muito Urgente' || c.urgencia === 'Urgente').length;
    const pct  = items.length ? Math.round(ent / items.length * 100) : 0;
    html += `<div class="card" style="padding:18px 20px;cursor:pointer" onclick="document.getElementById('cmp-f-obra').value='${items[0]?.obraId||''}';renderCompras();cmpSetView('cards')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:14px">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--gray-900);line-height:1.3">${nome}</div>
          <div style="font-size:12px;color:var(--gray-400);margin-top:2px">${items.length} pedido${items.length!==1?'s':''}</div>
        </div>
        ${urg ? `<span style="font-size:11px;font-weight:700;color:#EF4444;background:#FEF2F2;border-radius:20px;padding:3px 10px;white-space:nowrap">${urg} urgente${urg!==1?'s':''}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
        ${pend  ? `<span style="font-size:11px;font-weight:600;color:#92400E;background:#FEF3C7;border-radius:20px;padding:3px 10px">${pend} pendente${pend!==1?'s':''}</span>` : ''}
        ${aprov ? `<span style="font-size:11px;font-weight:600;color:#1E40AF;background:#DBEAFE;border-radius:20px;padding:3px 10px">${aprov} aprovado${aprov!==1?'s':''}</span>` : ''}
        ${enc   ? `<span style="font-size:11px;font-weight:600;color:#5B21B6;background:#EDE9FE;border-radius:20px;padding:3px 10px">${enc} encomendado${enc!==1?'s':''}</span>` : ''}
        ${ent   ? `<span style="font-size:11px;font-weight:600;color:#065F46;background:#D1FAE5;border-radius:20px;padding:3px 10px">${ent} entregue${ent!==1?'s':''}</span>` : ''}
      </div>
      <div style="background:var(--gray-100);border-radius:4px;height:6px;overflow:hidden">
        <div style="height:100%;border-radius:4px;background:#10B981;width:${pct}%;transition:width 0.4s"></div>
      </div>
      <div style="font-size:11px;color:var(--gray-400);margin-top:5px;text-align:right">${pct}% concluído</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function renderCompras() {
  const lista = filtraCompras();
  const area  = document.getElementById('cmp-view-area');
  const empty = document.getElementById('cmp-empty');
  if (!area) return;
  if (lista.length === 0) {
    area.innerHTML = '';
    if (empty) empty.style.display = '';
    atualizaKPIsCompras();
    return;
  }
  if (empty) empty.style.display = 'none';
  if (_cmpView === 'cards')  area.innerHTML = _renderCards(lista);
  else if (_cmpView === 'resumo') area.innerHTML = _renderResumo(lista);
  else area.innerHTML = _renderLista(lista);
  atualizaKPIsCompras();
}

// ── Selects de obras ─────────────────────────────────────────────
function populaCmpObras() {
  ['cmp-f-obra', 'mcmp-obra'].forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const val = sel.value;
    const prefix = sid === 'cmp-f-obra'
      ? '<option value="">Todas</option>'
      : '<option value="">— Sem obra associada —</option>';
    sel.innerHTML = prefix + S.OBRAS.filter(o=>o.ativa).map(o=>`<option value="${o.id}">${o.nome}</option>`).join('');
    if (val) sel.value = val;
  });
}

// ── MAPA PICKER (Leaflet + Nominatim) ───────────────────────────

function abrirMapaPicker() {
  const bg = document.getElementById('modal-mapa');
  bg.classList.add('open');
  // Inicializar mapa na primeira abertura
  setTimeout(() => {
    if (!_mapaLeaflet) {
      const lat = _mapaCoords?.lat || 39.5;
      const lng = _mapaCoords?.lng || -8.0;
      _mapaLeaflet = L.map('map-leaflet').setView([lat, lng], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(_mapaLeaflet);
      _mapaLeaflet.on('click', onMapClick);
    }
    _mapaLeaflet.invalidateSize();
    // Restaurar marcador anterior se existir
    if (_mapaCoords) {
      setMapaMarker(_mapaCoords.lat, _mapaCoords.lng, _mapaCoords.addr);
    }
  }, 80);
  document.getElementById('map-search-input').value = _mapaCoords?.addr || '';
}

function fecharMapaPicker() {
  document.getElementById('modal-mapa').classList.remove('open');
}

function onMapClick(e) {
  reverseGeocode(e.latlng.lat, e.latlng.lng);
}

async function geocodeSearch() {
  const q = document.getElementById('map-search-input').value.trim();
  if (!q) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&accept-language=pt`;
    const res = await fetch(url, {headers:{'Accept-Language':'pt'}});
    const data = await res.json();
    if (data.length > 0) {
      const r = data[0];
      setMapaMarker(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
      _mapaLeaflet.setView([parseFloat(r.lat), parseFloat(r.lon)], 15);
    } else {
      showToast('Localização não encontrada');
    }
  } catch(e) { showToast('Erro ao pesquisar localização'); }
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt`;
    const res  = await fetch(url);
    const data = await res.json();
    const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setMapaMarker(lat, lng, addr);
    document.getElementById('map-search-input').value = addr;
  } catch(e) {
    setMapaMarker(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }
}

function setMapaMarker(lat, lng, addr) {
  _mapaCoords = {lat, lng, addr};
  if (_mapaMarker) _mapaMarker.remove();
  _mapaMarker = L.marker([lat, lng]).addTo(_mapaLeaflet);
  document.getElementById('map-addr-preview').textContent = addr;
  document.getElementById('map-confirm-btn').disabled = false;
}

function confirmarLocalizacao() {
  if (!_mapaCoords) return;
  document.getElementById('mcmp-local').value = _mapaCoords.addr;
  document.getElementById('mcmp-lat').value   = _mapaCoords.lat;
  document.getElementById('mcmp-lng').value   = _mapaCoords.lng;
  const prev = document.getElementById('loc-preview-line');
  const txt  = document.getElementById('loc-preview-txt');
  txt.textContent = _mapaCoords.addr;
  prev.classList.add('show');
  fecharMapaPicker();
}

function limparLocalizacao() {
  _mapaCoords = null;
  document.getElementById('mcmp-local').value = '';
  document.getElementById('mcmp-lat').value   = '';
  document.getElementById('mcmp-lng').value   = '';
  const prev = document.getElementById('loc-preview-line');
  prev.classList.remove('show');
  if (_mapaMarker) { _mapaMarker.remove(); _mapaMarker = null; }
  if (_mapaLeaflet) {
    document.getElementById('map-addr-preview').textContent = 'Nenhuma localização selecionada';
    document.getElementById('map-confirm-btn').disabled = true;
  }
}

// ── CRUD ─────────────────────────────────────────────────────────
// ── Artigos picker ───────────────────────────────────────────────
function cmpInitArtPicker() {
  const sel = document.getElementById('mcmp-cat');
  if (!sel || sel.options.length > 1) return; // already populated
  const cat = window.ARTIGOS_CATALOGO;
  if (!cat) return;
  Object.entries(cat).forEach(([key, val]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = val.label;
    sel.appendChild(opt);
  });
}

function cmpRenderArtPicker() {
  const cat   = document.getElementById('mcmp-cat')?.value || '';
  const q     = (document.getElementById('mcmp-art-srch')?.value || '').toLowerCase().trim();
  const list  = document.getElementById('mcmp-art-list');
  if (!list) return;
  const catalogo = window.ARTIGOS_CATALOGO;
  if (!catalogo) { list.innerHTML = '<div style="padding:10px 12px;color:var(--gray-400);font-size:12px">Catálogo não carregado</div>'; return; }

  let items = [];
  if (cat && catalogo[cat]) {
    items = catalogo[cat].items;
  } else {
    Object.values(catalogo).forEach(c => { items = items.concat(c.items); });
  }
  if (q) {
    items = items.filter(([ref, nome]) =>
      nome.toLowerCase().includes(q) || (ref && ref.toLowerCase().includes(q))
    );
  }
  _artPickerItems = items;

  if (items.length === 0) {
    list.innerHTML = '<div style="padding:10px 12px;color:var(--gray-400);font-size:12px">Nenhum artigo encontrado</div>';
    return;
  }

  const shown = items.slice(0, 60);
  list.innerHTML = shown.map((item, i) =>
    `<div onclick="cmpAddArtigo(${i})" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--gray-200);font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px" onmouseover="this.style.background='var(--blue-50)'" onmouseout="this.style.background=''">`+
    `<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${item[1].replace(/"/g,'&quot;')}">${item[1]}</span>`+
    `<span style="flex-shrink:0;font-size:11px;color:var(--gray-400)">${item[2]}</span>`+
    `</div>`
  ).join('') + (items.length > 60
    ? `<div style="padding:6px 12px;color:var(--gray-400);font-size:11px;font-style:italic">+${items.length-60} itens — refine a pesquisa para ver mais</div>`
    : '');
}

function cmpAddArtigo(idx) {
  const item = _artPickerItems[idx];
  if (!item) return;
  const [ref, nome, un] = item;
  const exists = _cmpArtigosEdit.find(a => a.ref === ref && a.nome === nome);
  if (exists) { exists.qty += 1; cmpRenderArtigosSelected(); return; }
  _cmpArtigosEdit.push({ ref, nome, un, qty: 1 });
  cmpRenderArtigosSelected();
}

function cmpRemoveArtigo(i) {
  _cmpArtigosEdit.splice(i, 1);
  cmpRenderArtigosSelected();
  cmpUpdateArtBtnBadge();
}

function cmpAddArtigoRapido() {
  const nomeEl = document.getElementById('mcmp-art-rapido');
  const qtyEl  = document.getElementById('mcmp-art-qty');
  const unEl   = document.getElementById('mcmp-art-un');
  if (!nomeEl) return;
  const nome = nomeEl.value.trim();
  if (!nome) { nomeEl.focus(); return; }
  const qty = parseFloat(qtyEl?.value) || 1;
  const un  = unEl?.value || 'un';
  const exists = _cmpArtigosEdit.find(a => a.nome.toLowerCase() === nome.toLowerCase() && a.un === un);
  if (exists) {
    exists.qty += qty;
  } else {
    _cmpArtigosEdit.push({ ref: '', nome, un, qty });
  }
  nomeEl.value = '';
  if (qtyEl) qtyEl.value = '1';
  cmpRenderArtigosSelected();
  cmpUpdateArtBtnBadge();
  nomeEl.focus();
}

function cmpUpdateArtigoQty(i, val) {
  if (_cmpArtigosEdit[i]) _cmpArtigosEdit[i].qty = parseFloat(val) || 0;
}

function cmpRenderArtigosSelected() {
  const el = document.getElementById('mcmp-art-selected');
  if (!el) return;
  if (_cmpArtigosEdit.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    `<table style="width:100%;border-collapse:collapse;font-size:12px">`+
    `<thead><tr style="background:var(--gray-100);">`+
    `<th style="padding:6px 10px;text-align:left;color:var(--gray-600);font-weight:600">Referência</th>`+
    `<th style="padding:6px 10px;text-align:left;color:var(--gray-600);font-weight:600">Artigo</th>`+
    `<th style="padding:6px 10px;text-align:center;color:var(--gray-600);font-weight:600;width:50px">Un.</th>`+
    `<th style="padding:6px 10px;text-align:center;color:var(--gray-600);font-weight:600;width:90px">Qtd.</th>`+
    `<th style="width:32px"></th></tr></thead><tbody>`+
    _cmpArtigosEdit.map((a, i) =>
      `<tr style="border-bottom:1px solid var(--gray-200)">`+
      `<td style="padding:5px 10px;color:var(--gray-500);font-size:11px">${a.ref||'—'}</td>`+
      `<td style="padding:5px 10px">${a.nome}</td>`+
      `<td style="padding:5px 10px;text-align:center;color:var(--gray-600)">${a.un}</td>`+
      `<td style="padding:4px 10px;text-align:center"><input type="number" min="0" step="any" value="${a.qty}" onchange="cmpUpdateArtigoQty(${i},this.value)" style="width:72px;text-align:center;border:1.5px solid var(--gray-200);border-radius:6px;padding:3px 6px;font-size:13px;font-family:inherit"/></td>`+
      `<td style="padding:4px 6px;text-align:center"><button onclick="cmpRemoveArtigo(${i})" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:15px;line-height:1;padding:2px 4px" title="Remover">✕</button></td>`+
      `</tr>`
    ).join('')+
    `</tbody></table>`;
}

// ── Fornecedores chips ────────────────────────────────────────────
function cmpAddForn() {
  const inp = document.getElementById('mcmp-forn-input');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  const match = S.FORNECEDORES?.find(f => f.nome.toLowerCase() === val.toLowerCase());
  const entry = match ? { id: match.id, nome: match.nome } : { nome: val };
  const alreadyIn = _cmpFornsEdit.some(f =>
    (entry.id && (f.id === entry.id)) || (f.nome || f) === entry.nome
  );
  if (!alreadyIn) {
    _cmpFornsEdit.push(entry);
    cmpRenderFornChips();
  }
  inp.value = '';
}

function cmpRemoveForn(i) {
  _cmpFornsEdit.splice(i, 1);
  cmpRenderFornChips();
}

function cmpRenderFornChips() {
  const el = document.getElementById('mcmp-forn-chips');
  if (!el) return;
  el.innerHTML = _cmpFornsEdit.length === 0
    ? '<span style="color:var(--gray-400);font-size:12px">Nenhum fornecedor adicionado</span>'
    : _cmpFornsEdit.map((f, i) => {
        const nome = typeof f === 'string' ? f : f.nome;
        const linked = typeof f !== 'string' && f.id;
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--blue-50);color:var(--blue-700);border:1px solid ${linked ? 'var(--blue-300)' : 'var(--blue-200)'};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:500">`+
          (linked ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;opacity:.7"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` : '') +
          `${nome}<button onclick="cmpRemoveForn(${i})" style="background:none;border:none;cursor:pointer;color:var(--blue-400);font-size:13px;line-height:1;padding:0 0 0 2px;display:inline-flex;align-items:center" title="Remover">✕</button></span>`;
      }).join('');
}

// ── Picker de fornecedores (modal) ───────────────────────────────
async function abrirFornPicker() {
  const srch = document.getElementById('forn-picker-srch');
  if (srch) srch.value = '';
  if (!S.FORNECEDORES || S.FORNECEDORES.length === 0) {
    await sbLoadFornecedores();
  }
  cmpFornPickerRender();
  openModal('modal-forn-picker');
}

function _fornScore(f, terms) {
  const text = _lstNorm(`${f.nome} ${f.nif||''} ${f.localidade||''} ${f.email||''}`);
  if (!terms.every(t => text.includes(t))) return 0;
  const n = _lstNorm(f.nome);
  let score = 10;
  if (n.startsWith(terms[0])) score += 50;
  else if (n.split(/\s+/).some(w => w.startsWith(terms[0]))) score += 25;
  score += terms.reduce((s, t) => s + (n.includes(t) ? 5 : 0), 0);
  return score;
}

function cmpFornPickerRender() {
  const raw = (document.getElementById('forn-picker-srch')?.value || '').trim();
  const terms = _lstNorm(raw).split(/\s+/).filter(Boolean);
  const list = document.getElementById('forn-picker-list');
  if (!list) return;
  const active = (S.FORNECEDORES || []).filter(f => f.ativo);
  let filtered;
  if (terms.length) {
    const scored = active.map(f => ({ f, score: _fornScore(f, terms) })).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    filtered = scored.map(x => x.f);
  } else {
    filtered = active;
  }
  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:16px;color:var(--gray-400);text-align:center;font-size:13px">Nenhum fornecedor encontrado</div>';
    return;
  }
  const selectedIds = new Set(_cmpFornsEdit.filter(f => f.id).map(f => f.id));
  const selectedNames = new Set(_cmpFornsEdit.map(f => typeof f === 'string' ? f : f.nome));
  list.innerHTML = filtered.map(f => {
    const sel = selectedIds.has(f.id) || selectedNames.has(f.nome);
    return `<div onclick="cmpSelFornPicker('${f.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-100);background:${sel ? 'var(--blue-50)' : 'white'};transition:background 0.1s" onmouseover="this.style.background='${sel ? 'var(--blue-100)' : 'var(--gray-50)'}'" onmouseout="this.style.background='${sel ? 'var(--blue-50)' : 'white'}'">
      <div style="width:20px;height:20px;border-radius:5px;border:2px solid ${sel ? 'var(--blue-500)' : 'var(--gray-300)'};background:${sel ? 'var(--blue-500)' : 'white'};flex-shrink:0;display:flex;align-items:center;justify-content:center">
        ${sel ? '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nome}</div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:1px">${[f.nif, f.localidade].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`;
  }).join('');
}

function cmpSelFornPicker(id) {
  const forn = (S.FORNECEDORES || []).find(f => f.id === id);
  if (!forn) return;
  const idx = _cmpFornsEdit.findIndex(f => f.id === id || (typeof f === 'string' ? f : f.nome) === forn.nome);
  if (idx >= 0) {
    _cmpFornsEdit.splice(idx, 1);
  } else {
    _cmpFornsEdit.push({ id: forn.id, nome: forn.nome });
  }
  cmpRenderFornChips();
  cmpFornPickerRender();
}

// ── Lista de Materiais (modal fullscreen) ────────────────────────
let _lstTempArtigos = [];
let _lstPickerItems = [];

function abrirListaMateriais() {
  _lstTempArtigos = JSON.parse(JSON.stringify(_cmpArtigosEdit));
  const sel = document.getElementById('lst-cat');
  if (sel && sel.options.length <= 1) {
    const cat = window.ARTIGOS_CATALOGO;
    if (cat) {
      Object.entries(cat).forEach(([key, val]) => {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = val.label;
        sel.appendChild(opt);
      });
    }
  }
  const srch = document.getElementById('lst-srch');
  if (srch) srch.value = '';
  if (sel) sel.value = '';
  cmpLstRender();
  lstUpdateSelPanel();
  openModal('modal-lista-mat');
}

function fecharListaMateriais() {
  closeModal('modal-lista-mat');
}

function confirmarListaMateriais() {
  _cmpArtigosEdit = JSON.parse(JSON.stringify(_lstTempArtigos));
  cmpRenderArtigosSelected();
  cmpUpdateArtBtnBadge();
  fecharListaMateriais();
}

function _lstNorm(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _lstScore(nome, ref, terms) {
  const n = _lstNorm(nome);
  const r = ref ? _lstNorm(ref) : '';
  if (!terms.every(t => n.includes(t) || r.includes(t))) return 0;
  // Relevance: all terms at start of name → higher score
  let score = 10;
  if (terms.every(t => n.includes(t))) {
    if (n.startsWith(terms[0])) score += 40;
    else if (n.split(/\s+/).some(w => w.startsWith(terms[0]))) score += 20;
    score += terms.reduce((s, t) => s + (n.includes(t) ? 5 : 0), 0);
  }
  return score;
}

function cmpLstRender() {
  const cat = document.getElementById('lst-cat')?.value || '';
  const raw = (document.getElementById('lst-srch')?.value || '').trim();
  const terms = _lstNorm(raw).split(/\s+/).filter(Boolean);
  const list = document.getElementById('lst-results');
  if (!list) return;
  const catalogo = window.ARTIGOS_CATALOGO;
  if (!catalogo) { list.innerHTML = '<div style="padding:20px;color:var(--gray-400);text-align:center">Catálogo não carregado</div>'; return; }
  let items = [];
  if (cat && catalogo[cat]) {
    items = catalogo[cat].items;
  } else {
    Object.values(catalogo).forEach(c => { items = items.concat(c.items); });
  }
  if (terms.length) {
    const scored = items.map(item => ({ item, score: _lstScore(item[1], item[0], terms) })).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    items = scored.map(x => x.item);
  }
  _lstPickerItems = items;
  if (items.length === 0) {
    list.innerHTML = '<div style="padding:40px;color:var(--gray-400);text-align:center;font-size:14px">Nenhum artigo encontrado</div>';
    return;
  }
  const shown = items.slice(0, 200);
  const selectedRefs = new Set(_lstTempArtigos.map(a => a.ref));
  list.innerHTML = '<div style="display:grid;gap:6px">' + shown.map((item, i) => {
    const [ref, nome, un] = item;
    const sel = selectedRefs.has(ref);
    return `<div onclick="cmpLstToggle(${i})" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;border:1.5px solid ${sel ? 'var(--blue-400)' : 'var(--gray-200)'};background:${sel ? 'var(--blue-50)' : 'white'};transition:all 0.1s">
      <div style="width:20px;height:20px;border-radius:5px;border:2px solid ${sel ? 'var(--blue-500)' : 'var(--gray-300)'};background:${sel ? 'var(--blue-500)' : 'white'};flex-shrink:0;display:flex;align-items:center;justify-content:center">
        ${sel ? '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${nome.replace(/"/g,'&quot;')}">${nome}</div>
        ${ref ? `<div style="font-size:11px;color:var(--gray-400);margin-top:1px">${ref}</div>` : ''}
      </div>
      <span style="font-size:12px;color:var(--gray-600);flex-shrink:0;background:var(--gray-100);padding:2px 8px;border-radius:10px;font-weight:500">${un}</span>
    </div>`;
  }).join('') + '</div>' +
    (items.length > 200 ? `<div style="padding:12px;color:var(--gray-400);font-size:12px;text-align:center;font-style:italic">+${items.length - 200} itens — refine a pesquisa para ver mais</div>` : '');
}

function cmpLstToggle(idx) {
  const item = _lstPickerItems[idx];
  if (!item) return;
  const [ref, nome, un] = item;
  const existsIdx = _lstTempArtigos.findIndex(a => a.ref === ref);
  if (existsIdx >= 0) {
    _lstTempArtigos.splice(existsIdx, 1);
  } else {
    _lstTempArtigos.push({ ref, nome, un, qty: 1 });
  }
  cmpLstRender();
  lstUpdateSelPanel();
}

function lstUpdateSelPanel() {
  const selList = document.getElementById('lst-sel-list');
  const countTxt = document.getElementById('lst-count-txt');
  const badge = document.getElementById('lst-badge');
  const n = _lstTempArtigos.length;
  if (selList) {
    selList.innerHTML = n === 0
      ? '<div style="color:var(--gray-400);font-size:12px;padding:8px 0">Nenhum artigo selecionado</div>'
      : _lstTempArtigos.map((a, i) =>
          `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--gray-100)">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500;color:var(--gray-800);line-height:1.3">${a.nome}</div>
              <div style="font-size:11px;color:var(--gray-400);margin-top:2px">${a.un}</div>
            </div>
            <input type="number" min="0.01" step="any" value="${a.qty}" onchange="lstUpdateQty(${i},this.value)" style="width:58px;text-align:center;border:1.5px solid var(--gray-200);border-radius:6px;padding:3px 5px;font-size:12px;font-family:inherit"/>
            <button onclick="cmpLstRemoveSel(${i})" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:14px;padding:2px 3px;flex-shrink:0;line-height:1" title="Remover">✕</button>
          </div>`
        ).join('');
  }
  if (countTxt) countTxt.textContent = n === 0 ? 'Nenhum artigo selecionado' : `${n} artigo${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}`;
  if (badge) { badge.style.display = n > 0 ? '' : 'none'; badge.textContent = `${n} artigo${n !== 1 ? 's' : ''}`; }
}

function lstUpdateQty(i, val) {
  if (_lstTempArtigos[i]) _lstTempArtigos[i].qty = parseFloat(val) || 0;
}

function cmpLstRemoveSel(i) {
  _lstTempArtigos.splice(i, 1);
  cmpLstRender();
  lstUpdateSelPanel();
}

function cmpUpdateArtBtnBadge() {
  const btn = document.getElementById('btn-lista-mat');
  if (!btn) return;
  const n = _cmpArtigosEdit.length;
  const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  btn.innerHTML = icon + (n > 0 ? ` Lista de Materiais <span style="background:var(--blue-500);color:white;border-radius:12px;padding:1px 8px;font-size:11px;margin-left:4px">${n}</span>` : ' Lista de Materiais');
}

function openCompraModal(c) {
  populaCmpObras();
  cmpInitArtPicker();
  // Limpar estado do mapa picker
  _mapaCoords = c?.localLat ? {lat:c.localLat, lng:c.localLng, addr:c.local} : null;
  document.getElementById('mcmp-title').textContent       = c ? 'Editar pedido' : 'Novo pedido de compra';
  document.getElementById('mcmp-sub').textContent         = c ? `Criado por ${c.criadoNome||c.criadoPor} em ${c.criadoEm}` : 'Preencha os campos do pedido';
  document.getElementById('mcmp-id').value                = c ? c.id : '';
  document.getElementById('mcmp-titulo').value            = c ? c.titulo : '';
  document.getElementById('mcmp-obra').value              = c ? (c.obraId||'') : '';
  document.getElementById('mcmp-local').value             = c ? (c.local||'') : '';
  document.getElementById('mcmp-lat').value               = c?.localLat || '';
  document.getElementById('mcmp-lng').value               = c?.localLng || '';
  document.getElementById('mcmp-urg').value               = c ? c.urgencia : 'Normal';
  document.getElementById('mcmp-estado').value            = c ? c.estado : 'pendente';
  document.getElementById('mcmp-data-limite').value       = c ? (c.dataLimite||'') : '';
  document.getElementById('mcmp-notas').value             = c ? (c.notas||'') : '';
  document.getElementById('mcmp-email').value             = c ? (c.emailNotif||'') : '';
  document.getElementById('mcmp-del-btn').style.display   = c ? '' : 'none';
  const elMapaBtn = document.getElementById('mcmp-mapa-btn');
  if (elMapaBtn) elMapaBtn.style.display = c ? '' : 'none';
  // Workflow checkboxes (elementos opcionais — podem ter sido removidos do form)
  const elCotacao = document.getElementById('mcmp-cotacao');
  const elAprovDO = document.getElementById('mcmp-aprov-do');
  const elAdjud   = document.getElementById('mcmp-adjud');
  const elDataForn = document.getElementById('mcmp-data-forn');
  if (elCotacao)  elCotacao.checked  = c ? !!c.pedidoCotacao : false;
  if (elAprovDO)  elAprovDO.checked  = c ? !!c.aprovadoDO    : false;
  if (elAdjud)    elAdjud.checked    = c ? !!c.adjudicado    : false;
  if (elDataForn) elDataForn.value   = c ? (c.dataFornecimento||'') : '';
  // Artigos
  _cmpArtigosEdit = c && Array.isArray(c.artigos) ? JSON.parse(JSON.stringify(c.artigos)) : [];
  cmpRenderArtigosSelected();
  cmpUpdateArtBtnBadge();
  // Fornecedores
  _cmpFornsEdit = c && Array.isArray(c.fornecedores) ? [...c.fornecedores] : (c?.fornecedor ? [c.fornecedor] : []);
  document.getElementById('mcmp-forn-input').value = '';
  cmpRenderFornChips();
  // Preview de localização
  const prev = document.getElementById('loc-preview-line');
  const txt  = document.getElementById('loc-preview-txt');
  if (c?.local) { txt.textContent = c.local; prev.classList.add('show'); }
  else           { prev.classList.remove('show'); }
  openModal('modal-compra');
}

function editarCompra(id) {
  const c = COMPRAS.find(x => String(x.id) === String(id));
  if (c) openCompraModal(c);
}

async function saveCompra() {
  const titulo = document.getElementById('mcmp-titulo').value.trim();
  if (!titulo) { showToast('Indique o título do pedido'); return; }
  const rawId = document.getElementById('mcmp-id').value;
  let c = rawId ? COMPRAS.find(x => String(x.id) === rawId) : null;
  const isNovo = !c;
  const localAddr = document.getElementById('mcmp-local').value.trim();
  const localLat  = parseFloat(document.getElementById('mcmp-lat').value) || null;
  const localLng  = parseFloat(document.getElementById('mcmp-lng').value) || null;
  const artigos   = JSON.parse(JSON.stringify(_cmpArtigosEdit));
  const fornecedores = [..._cmpFornsEdit];
  const fornecedor   = fornecedores[0] || '';
  const pedidoCotacao = document.getElementById('mcmp-cotacao')?.checked ?? false;
  const aprovadoDO    = document.getElementById('mcmp-aprov-do')?.checked ?? false;
  const adjudicado    = document.getElementById('mcmp-adjud')?.checked ?? false;
  const dataFornecimento = document.getElementById('mcmp-data-forn')?.value || null;
  if (c) {
    c.titulo           = titulo;
    c.artigos          = artigos;
    c.obraId           = document.getElementById('mcmp-obra').value;
    c.local            = localAddr;
    c.localLat         = localLat;
    c.localLng         = localLng;
    c.fornecedor       = fornecedor;
    c.fornecedores     = fornecedores;
    c.urgencia         = document.getElementById('mcmp-urg').value;
    c.estado           = document.getElementById('mcmp-estado').value;
    c.dataLimite       = document.getElementById('mcmp-data-limite').value;
    c.notas            = document.getElementById('mcmp-notas').value;
    c.emailNotif       = document.getElementById('mcmp-email').value.trim();
    c.pedidoCotacao    = pedidoCotacao;
    c.aprovadoDO       = aprovadoDO;
    c.adjudicado       = adjudicado;
    c.dataFornecimento = dataFornecimento;
  } else {
    c = {
      id:               'local_' + (_cmpSeq++),
      titulo,
      artigos,
      obraId:           document.getElementById('mcmp-obra').value,
      local:            localAddr,
      localLat,
      localLng,
      fornecedor,
      fornecedores,
      urgencia:         document.getElementById('mcmp-urg').value,
      estado:           document.getElementById('mcmp-estado').value,
      dataLimite:       document.getElementById('mcmp-data-limite').value,
      notas:            document.getElementById('mcmp-notas').value,
      emailNotif:       document.getElementById('mcmp-email').value.trim(),
      pedidoCotacao,
      aprovadoDO,
      adjudicado,
      dataFornecimento,
      criadoPor:        S.currentUser?.key  || '',
      criadoNome:       S.currentUser?.nome || '',
      criadoEm:         fmt(new Date())
    };
    COMPRAS.unshift(c);
  }
  closeModal('modal-compra');
  renderCompras();
  flashAlert('cmp-alert');
  showToast('Pedido guardado');
  if (isNovo && c.emailNotif) setTimeout(() => enviarEmailNotificacao(c), 400);
  await sbSaveCompra(c);
  const obraNome = S.OBRAS.find(o=>o.id===c.obraId)?.nome || '';
  R.emitEvent?.({ acao:(isNovo?'Novo pedido de compra':'Pedido de compra atualizado')+': '+titulo+(obraNome?' · '+obraNome:''), seccao:'compras' });
}

async function apagarCompra() {
  const rawId = document.getElementById('mcmp-id').value;
  if (!rawId) return;
  if (!confirm('Apagar este pedido de compra?')) return;
  const idx = COMPRAS.findIndex(x => String(x.id) === rawId);
  if (idx !== -1) COMPRAS.splice(idx, 1);
  closeModal('modal-compra');
  renderCompras();
  showToast('Pedido apagado');
  await sbApagarCompra(rawId);
}

// ── Upload de Lista Excel ─────────────────────────────────────────
function uploadListaExcel() {
  const inp = document.getElementById('cmp-upload-lista-input');
  if (inp) { inp.value = ''; inp.click(); }
}

function uploadListaExcelFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const wb   = XLSX.read(ev.target.result, { type: 'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Encontrar linha de cabeçalho: procura "Descrição" ou "QTD"
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i].map(h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
        if (r.some(h => h.includes('descri')) && r.some(h => h.includes('qtd') || h === 'un')) {
          headerIdx = i; break;
        }
      }
      if (headerIdx < 0) { showToast('Cabeçalho não encontrado no ficheiro'); return; }

      const header = rows[headerIdx].map(h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
      const colDesc = header.findIndex(h => h.includes('descri'));
      const colQty  = header.findIndex(h => h.includes('qtd'));
      const colUn   = header.findIndex(h => h === 'un.' || h === 'un');
      const colRef  = header.findIndex(h => h === 'artigo' || h.includes('codigo') || h.includes('ref'));

      if (colDesc < 0) { showToast('Coluna "Descrição" não encontrada'); return; }

      let count = 0;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row  = rows[i];
        const nome = String(row[colDesc] ?? '').trim();
        if (!nome) continue;
        const qtyRaw = colQty >= 0 ? row[colQty] : '';
        const qty    = parseFloat(String(qtyRaw).replace(',', '.')) || 1;
        if (qty <= 0) continue;
        const un  = colUn  >= 0 ? (String(row[colUn]  ?? '').trim() || 'un') : 'un';
        const ref = colRef >= 0 ? String(row[colRef] ?? '').trim() : '';

        const exists = _cmpArtigosEdit.find(a => a.nome.toLowerCase() === nome.toLowerCase());
        if (exists) {
          exists.qty += qty;
        } else {
          _cmpArtigosEdit.push({ ref, nome, un, qty });
          count++;
        }
      }
      cmpRenderArtigosSelected();
      cmpUpdateArtBtnBadge();
      showToast(count > 0 ? `${count} artigo(s) importado(s) da lista` : 'Nenhum artigo novo encontrado');
    } catch(e) {
      console.warn('Erro ao ler ficheiro Excel:', e);
      showToast('Erro ao processar o ficheiro Excel');
    }
  };
  reader.readAsBinaryString(file);
}

// ── Exportar Excel ────────────────────────────────────────────────
function exportComprasXLSX() {
  if (COMPRAS.length === 0) { showToast('Sem pedidos para exportar'); return; }
  const dados = COMPRAS.map(c => {
    const obraNome = S.OBRAS.find(o=>o.id===c.obraId)?.nome||'';
    const artigosStr = (c.artigos||[]).map(a=>`${a.nome} (${a.qty} ${a.un})`).join('; ');
    const fornsStr   = (c.fornecedores||[c.fornecedor]).filter(Boolean).join('; ');
    return {
      'Título': c.titulo,
      'Artigos': artigosStr,
      'Obra': obraNome,
      'Localização': c.local||'',
      'Fornecedores': fornsStr,
      'Urgência': c.urgencia,
      'Estado': c.estado,
      'Data limite': c.dataLimite||'',
      'Pedido cotação': c.pedidoCotacao ? 'Sim' : '',
      'Aprovado DO': c.aprovadoDO ? 'Sim' : '',
      'Adjudicado': c.adjudicado ? 'Sim' : '',
      'Data fornecimento': c.dataFornecimento||'',
      'Criado por': c.criadoNome||c.criadoPor||'',
      'Data criação': c.criadoEm||'', 'Email notif.': c.emailNotif||'',
      'Notas': c.notas||''
    };
  });
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos Compra');
  XLSX.writeFile(wb, `pedidos_compra_${fmt(new Date())}.xlsx`);
}

// ── Init ──────────────────────────────────────────────────────────
async function initCompras() {
  await sbLoadCompras();
  populaCmpObras();
  renderCompras();
}

export {
  COMPRAS, sbLoadCompras, sbSaveCompra, sbApagarCompra,
  renderCompras, filtraCompras, populaCmpObras,
  editarCompra, saveCompra, apagarCompra, exportComprasXLSX,
  abrirMapaPicker, fecharMapaPicker, geocodeSearch, confirmarLocalizacao, limparLocalizacao,
  cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty, cmpAddArtigoRapido,
  cmpAddForn, cmpRemoveForn, cmpInitArtPicker,
  abrirListaMateriais, fecharListaMateriais, confirmarListaMateriais,
  uploadListaExcel, uploadListaExcelFile,
  cmpLstRender, cmpLstToggle, cmpLstRemoveSel, lstUpdateQty, cmpUpdateArtBtnBadge,
  abrirFornPicker, cmpFornPickerRender, cmpSelFornPicker,
  openCompraModal, enviarEmailNotificacao, initCompras,
  urgBadge, cmpEstadoBadge, cmpFornDisplay, cmpWorkflowBadges, dataLimiteBadge, atualizaKPIsCompras
};

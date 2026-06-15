// ═══════════════════════════════════════════════════════════
//  MAPAS COMPARATIVOS
// ═══════════════════════════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast, closeModal } from './navigation.js';
import { COMPRAS } from './compras.js';

let MAPAS_COMP = S.MAPAS_COMP;
let _mcMapaAtual = S._mcMapaAtual;
let _mcFornecedores = S._mcFornecedores;
let _mcLinhas = S._mcLinhas;

// ═══════════════════════════════════════════════════════════
//  MÓDULO MAPAS COMPARATIVOS
// ═══════════════════════════════════════════════════════════

const MC_ESTADO_CFG = {
  rascunho:   { cls:'b-gray',   label:'Rascunho' },
  em_analise: { cls:'b-orange', label:'Em análise' },
  aprovado:   { cls:'b-green',  label:'Aprovado' },
  arquivado:  { cls:'b-gray',   label:'Arquivado' }
};

async function sbLoadMapasComp() {
  try {
    const { data, error } = await sb.from('mapas_comparativos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    S.MAPAS_COMP = data || [];
  } catch(e) { console.warn('Erro ao carregar mapas comparativos:', e); }
}

function filtrarMapasComp() {
  const q = (document.getElementById('mc-f-search')?.value || '').toLowerCase();
  const obraId = document.getElementById('mc-f-obra')?.value || '';
  const estado = document.getElementById('mc-f-estado')?.value || '';
  return S.MAPAS_COMP.filter(m => {
    if (obraId && m.obra_id !== obraId) return false;
    if (estado && m.estado !== estado) return false;
    if (q) {
      const obraNome = S.OBRAS.find(o => o.id === m.obra_id)?.nome || '';
      if (!(`${m.titulo} ${obraNome}`).toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderMapasComp() {
  const lista = filtrarMapasComp();
  const cont = document.getElementById('mc-lista');
  const empty = document.getElementById('mc-empty');
  if (!cont) return;
  if (lista.length === 0) {
    cont.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const grupos = {};
  lista.forEach(m => {
    const k = m.obra_id || '__sem_obra__';
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(m);
  });
  const chaves = Object.keys(grupos).sort((a,b) => {
    if (a === '__sem_obra__') return 1;
    if (b === '__sem_obra__') return -1;
    const na = S.OBRAS.find(o=>o.id===a)?.nome||'';
    const nb = S.OBRAS.find(o=>o.id===b)?.nome||'';
    return na.localeCompare(nb, 'pt');
  });

  cont.innerHTML = chaves.map(k => {
    const obraNome = k === '__sem_obra__' ? 'Sem obra associada' : (S.OBRAS.find(o=>o.id===k)?.nome || k);
    const grupo = grupos[k];
    const cards = grupo.map(m => {
      const est = MC_ESTADO_CFG[m.estado] || MC_ESTADO_CFG.rascunho;
      const pedido = m.pedido_id ? COMPRAS.find(c => c.id === m.pedido_id) : null;
      return `<div class="card" style="padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:160px">
          <div style="font-weight:600;font-size:14px;color:var(--gray-800)">${m.titulo}</div>
          ${pedido ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px">Pedido: ${pedido.titulo}</div>` : ''}
          ${m.descricao ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px">${m.descricao}</div>` : ''}
        </div>
        <span class="badge ${est.cls}">${est.label}</span>
        <div style="font-size:11px;color:var(--gray-400)">${(m.created_at||'').slice(0,10)}</div>
        <button class="btn btn-secondary btn-sm" onclick="abrirMapaComparativo('${m.id}')">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          Ver mapa
        </button>
        <button class="btn btn-secondary btn-sm" onclick="abrirResumoMapa('${m.id}')" style="color:var(--blue-600)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Resumo
        </button>
        <button class="btn btn-secondary btn-sm" onclick="editarMapaComp('${m.id}')">Editar</button>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:8px;margin:16px 0 6px">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--blue-500)"></div>
        <span style="font-size:14px;font-weight:600;color:var(--gray-800)">${obraNome}</span>
        <span style="font-weight:400;color:var(--gray-400);font-size:13px">(${grupo.length})</span>
      </div>
      ${cards}
    </div>`;
  }).join('');
}

function populaMcObras() {
  ['mc-f-obra','mmc-obra'].forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const val = sel.value;
    const prefix = sid === 'mc-f-obra' ? '<option value="">Todas</option>' : '<option value="">— Sem obra —</option>';
    sel.innerHTML = prefix + S.OBRAS.filter(o=>o.ativa).map(o=>`<option value="${o.id}">${o.nome}</option>`).join('');
    if (val) sel.value = val;
  });
}

function populaMcPedidos() {
  const sel = document.getElementById('mmc-pedido');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sem pedido —</option>' +
    COMPRAS.map(c => `<option value="${c.id}">${c.titulo}</option>`).join('');
}

async function openModalMapa(pedidoId) {
  S._mcMapaAtual = null;
  S._mcFornecedores = [];
  S._mcLinhas = [];
  document.getElementById('mmc-title').textContent = 'Novo Mapa Comparativo';
  document.getElementById('mmc-sub').textContent = 'Preencha os dados do mapa';
  document.getElementById('mmc-id').value = '';
  document.getElementById('mmc-titulo').value = '';
  document.getElementById('mmc-descricao').value = '';
  document.getElementById('mmc-estado').value = 'rascunho';
  document.getElementById('mmc-mostrar-venda').checked = false;
  populaMcObras();
  populaMcPedidos();
  if (pedidoId) {
    const c = COMPRAS.find(x => x.id === pedidoId);
    if (c) {
      document.getElementById('mmc-pedido').value = pedidoId;
      document.getElementById('mmc-titulo').value = `Mapa Comparativo — ${c.titulo}`;
      if (c.obraId) document.getElementById('mmc-obra').value = c.obraId;
      // Fornecedores: todos os do pedido
      const fornsNomes = Array.isArray(c.fornecedores) && c.fornecedores.length
        ? c.fornecedores
        : (c.fornecedor ? [c.fornecedor] : []);
      S._mcFornecedores = fornsNomes.map(nome => {
        const f = typeof nome === 'string' ? nome : (nome.nome || '');
        const match = S.FORNECEDORES.find(x => x.nome === f);
        return { id: match?.id || null, nome: match?.nome || f };
      }).filter(f => f.nome);
      // Artigos do pedido → linhas do mapa
      if (Array.isArray(c.artigos) && c.artigos.length) {
        S._mcLinhas = c.artigos.map(a => ({
          id: null,
          descricao: a.ref ? `[${a.ref}] ${a.nome}` : a.nome,
          unidade: a.un || 'un',
          quantidade: a.qty || 1,
          valor_seco: null,
          valor_venda: null,
          _valores: []
        }));
      }
    }
  }
  document.getElementById('mmc-del-btn').style.display = 'none';
  renderMmcFornecedores();
  renderMmcLinhas();
  openModal('modal-mapa-comp');
}

async function editarMapaComp(id) {
  const m = S.MAPAS_COMP.find(x => x.id === id);
  if (!m) return;
  S._mcMapaAtual = m;
  document.getElementById('mmc-title').textContent = 'Editar Mapa Comparativo';
  document.getElementById('mmc-sub').textContent = `Criado em ${(m.created_at||'').slice(0,10)}`;
  document.getElementById('mmc-id').value = m.id;
  document.getElementById('mmc-titulo').value = m.titulo;
  document.getElementById('mmc-descricao').value = m.descricao || '';
  document.getElementById('mmc-estado').value = m.estado || 'rascunho';
  document.getElementById('mmc-mostrar-venda').checked = !!m.mostrar_venda;
  populaMcObras();
  populaMcPedidos();
  document.getElementById('mmc-obra').value = m.obra_id || '';
  document.getElementById('mmc-pedido').value = m.pedido_id || '';
  document.getElementById('mmc-del-btn').style.display = '';

  try {
    const [{ data: linhas }, { data: vals }] = await Promise.all([
      sb.from('mapa_linhas').select('*').eq('mapa_id', id).order('ordem'),
      sb.from('mapa_fornecedor_valores').select('*').eq('mapa_id', id)
    ]);
    S._mcLinhas = (linhas || []).map(l => ({
      ...l,
      _valores: (vals || []).filter(v => v.linha_id === l.id)
    }));
    const fornNomes = [...new Set((vals||[]).map(v => v.fornecedor_nome).filter(Boolean))];
    S._mcFornecedores = fornNomes.map(nome => {
      const forn = S.FORNECEDORES.find(f => f.nome === nome);
      return { id: forn?.id || null, nome };
    });
  } catch(e) { S._mcLinhas = []; S._mcFornecedores = []; }

  renderMmcFornecedores();
  renderMmcLinhas();
  openModal('modal-mapa-comp');
}

function renderMmcFornecedores() {
  const cont = document.getElementById('mmc-forn-lista');
  if (!cont) return;
  cont.innerHTML = S._mcFornecedores.map((f, i) =>
    `<div style="display:inline-flex;align-items:center;gap:6px;background:var(--blue-50);border:1px solid var(--blue-200);border-radius:20px;padding:4px 10px;font-size:13px">
      <span>${f.nome}</span>
      <button type="button" onclick="removerFornecedorMapa(${i})" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:14px;line-height:1;padding:0 2px">&times;</button>
    </div>`
  ).join('');
  renderMmcLinhas();
}

function adicionarFornecedorMapa() {
  const inp = document.getElementById('mmc-forn-add-input');
  if (!inp) return;
  const nome = inp.value.trim();
  if (!nome) return;
  if (S._mcFornecedores.find(f => f.nome.toLowerCase() === nome.toLowerCase())) {
    showToast('Fornecedor já adicionado'); return;
  }
  const forn = S.FORNECEDORES.find(f => f.nome.toLowerCase() === nome.toLowerCase());
  S._mcFornecedores.push({ id: forn?.id || null, nome: forn?.nome || nome });
  inp.value = '';
  renderMmcFornecedores();
}

function removerFornecedorMapa(idx) {
  S._mcFornecedores.splice(idx, 1);
  renderMmcFornecedores();
}

function renderMmcLinhas() {
  const tbody = document.getElementById('mmc-linhas-tbody');
  const thVenda = document.getElementById('mmc-th-venda');
  if (!tbody) return;
  const mostrarVenda = document.getElementById('mmc-mostrar-venda')?.checked;
  if (thVenda) thVenda.style.display = mostrarVenda ? '' : 'none';

  const header = document.getElementById('mmc-linhas-header');
  if (header) {
    Array.from(header.querySelectorAll('th[data-forn]')).forEach(th => th.remove());
    const lastTh = header.querySelector('th:last-child');
    S._mcFornecedores.forEach((f, i) => {
      const th = document.createElement('th');
      th.setAttribute('data-forn', i);
      th.style.minWidth = '120px';
      th.textContent = f.nome;
      header.insertBefore(th, lastTh);
    });
  }

  if (S._mcLinhas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${5 + S._mcFornecedores.length}" style="text-align:center;color:var(--gray-400);font-size:13px;padding:12px">Sem linhas. Clique em "+ Adicionar linha".</td></tr>`;
    return;
  }

  tbody.innerHTML = S._mcLinhas.map((l, li) => {
    const fornCols = S._mcFornecedores.map((f, fi) => {
      const val = (l._valores || []).find(v => v.fornecedor_nome === f.nome);
      const vUnit = val?.valor_unit ?? '';
      return `<td>
        <input type="number" min="0" step="0.01" value="${vUnit}"
          style="width:100px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px"
          onchange="atualizarValorFornMapa(${li},${fi},this.value)"
          placeholder="0.00"/>
      </td>`;
    }).join('');
    return `<tr>
      <td><input type="text" value="${l.descricao}" style="width:100%;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="S._mcLinhas[${li}].descricao=this.value"/></td>
      <td><input type="text" value="${l.unidade||'un'}" style="width:60px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="S._mcLinhas[${li}].unidade=this.value"/></td>
      <td><input type="number" min="0" step="0.001" value="${l.quantidade||1}" style="width:80px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="S._mcLinhas[${li}].quantidade=parseFloat(this.value)||1"/></td>
      <td><input type="number" min="0" step="0.01" value="${l.valor_seco??''}" style="width:100px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="S._mcLinhas[${li}].valor_seco=this.value?parseFloat(this.value):null" placeholder="0.00"/></td>
      <td style="display:${mostrarVenda?'':'none'}"><input type="number" min="0" step="0.01" value="${l.valor_venda??''}" style="width:100px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="S._mcLinhas[${li}].valor_venda=this.value?parseFloat(this.value):null" placeholder="0.00"/></td>
      ${fornCols}
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="removerLinhaMapa(${li})" style="color:var(--red)">&times;</button></td>
    </tr>`;
  }).join('');
}

function adicionarLinhaMapa() {
  S._mcLinhas.push({ id: null, descricao: '', unidade: 'un', quantidade: 1, valor_seco: null, valor_venda: null, _valores: [] });
  renderMmcLinhas();
}

function removerLinhaMapa(idx) {
  S._mcLinhas.splice(idx, 1);
  renderMmcLinhas();
}

function atualizarValorFornMapa(li, fi, val) {
  if (!S._mcLinhas[li]._valores) S._mcLinhas[li]._valores = [];
  const forn = S._mcFornecedores[fi];
  let entry = S._mcLinhas[li]._valores.find(v => v.fornecedor_nome === forn.nome);
  if (!entry) {
    entry = { fornecedor_id: forn.id, fornecedor_nome: forn.nome, valor_unit: null, selecionado: false };
    S._mcLinhas[li]._valores.push(entry);
  }
  entry.valor_unit = val ? parseFloat(val) : null;
  entry.valor_total = entry.valor_unit != null ? entry.valor_unit * (S._mcLinhas[li].quantidade || 1) : null;
}

document.addEventListener('change', e => {
  if (e.target.id === 'mmc-mostrar-venda') renderMmcLinhas();
});

async function saveMapaComp() {
  const titulo = document.getElementById('mmc-titulo').value.trim();
  if (!titulo) { showToast('O título é obrigatório'); return; }
  const id = document.getElementById('mmc-id').value;
  const rec = {
    titulo,
    descricao: document.getElementById('mmc-descricao').value.trim() || null,
    obra_id: document.getElementById('mmc-obra').value || null,
    pedido_id: document.getElementById('mmc-pedido').value || null,
    estado: document.getElementById('mmc-estado').value,
    mostrar_venda: document.getElementById('mmc-mostrar-venda').checked,
    criado_por: S.currentUser?.username || null,
    criado_nome: S.currentUser?.nome || S.currentUser?.username || null,
    updated_at: new Date().toISOString()
  };
  try {
    let mapaId = id;
    if (id) {
      const { error } = await sb.from('mapas_comparativos').update(rec).eq('id', id);
      if (error) throw error;
      const idx = S.MAPAS_COMP.findIndex(m => m.id === id);
      if (idx >= 0) S.MAPAS_COMP[idx] = { ...S.MAPAS_COMP[idx], ...rec };
    } else {
      const { data, error } = await sb.from('mapas_comparativos').insert(rec).select().single();
      if (error) throw error;
      mapaId = data.id;
      S.MAPAS_COMP.unshift(data);
    }

    if (mapaId) {
      await sb.from('mapa_linhas').delete().eq('mapa_id', mapaId);
      for (let i = 0; i < S._mcLinhas.length; i++) {
        const l = S._mcLinhas[i];
        if (!l.descricao.trim()) continue;
        const { data: linhaData, error: leErr } = await sb.from('mapa_linhas').insert({
          mapa_id: mapaId, ordem: i, descricao: l.descricao, unidade: l.unidade||'un',
          quantidade: l.quantidade||1, valor_seco: l.valor_seco||null, valor_venda: l.valor_venda||null
        }).select().single();
        if (leErr) continue;
        const vals = (l._valores || []).filter(v => v.valor_unit != null);
        if (vals.length) {
          await sb.from('mapa_fornecedor_valores').insert(vals.map(v => ({
            mapa_id: mapaId, linha_id: linhaData.id,
            fornecedor_id: v.fornecedor_id || null,
            fornecedor_nome: v.fornecedor_nome,
            valor_unit: v.valor_unit,
            valor_total: v.valor_unit * (l.quantidade||1),
            selecionado: !!v.selecionado
          })));
        }
      }
    }

    closeModal('modal-mapa-comp');
    const al = document.getElementById('mapa-alert');
    if (al) { al.style.display=''; setTimeout(() => al.style.display='none', 3000); }
    renderMapasComp();
  } catch(e) { showToast('Erro ao guardar mapa: ' + (e.message||e)); }
}

async function apagarMapaComp() {
  const id = document.getElementById('mmc-id').value;
  if (!id) return;
  if (!confirm('Apagar este mapa comparativo? Esta acção não pode ser revertida.')) return;
  try {
    await sb.from('mapas_comparativos').delete().eq('id', id);
    S.MAPAS_COMP = S.MAPAS_COMP.filter(m => m.id !== id);
    closeModal('modal-mapa-comp');
    renderMapasComp();
  } catch(e) { showToast('Erro ao apagar: ' + (e.message||e)); }
}

async function abrirMapaComparativo(id) {
  const m = S.MAPAS_COMP.find(x => x.id === id);
  if (!m) return;

  const body = document.getElementById('modal-mapa-view-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">A carregar mapa...</div>';
  openModal('modal-mapa-view');

  try {
    const [{ data: linhas }, { data: vals }] = await Promise.all([
      sb.from('mapa_linhas').select('*').eq('mapa_id', id).order('ordem'),
      sb.from('mapa_fornecedor_valores').select('*').eq('mapa_id', id)
    ]);
    const obraNome = S.OBRAS.find(o => o.id === m.obra_id)?.nome || '—';
    const fornNomes = [...new Set((vals||[]).map(v => v.fornecedor_nome).filter(Boolean))];
    const est = MC_ESTADO_CFG[m.estado] || MC_ESTADO_CFG.rascunho;

    const totais = {};
    let totalValorSeco = 0;
    let hasValorSeco = false;
    fornNomes.forEach(fn => totais[fn] = 0);

    const qty = fn => parseFloat(fn) || 1;
    const cel2 = (unit, total, highlight) => {
      if (unit == null) return `<td style="text-align:right;color:var(--gray-300)">—</td>`;
      return `<td style="text-align:right;${highlight ? 'background:#f0fdf4;' : ''}">
        <div style="font-size:11px;color:${highlight ? '#16a34a' : 'var(--gray-400)'};line-height:1.3">€ ${unit.toFixed(2)}</div>
        <div style="font-weight:700;font-size:13px;color:${highlight ? '#16a34a' : 'inherit'};line-height:1.3">€ ${total.toFixed(2)}</div>
      </td>`;
    };

    const linhasHtml = (linhas||[]).map(l => {
      const lVals = (vals||[]).filter(v => v.linha_id === l.id);
      const qtd = qty(l.quantidade);
      const fornData = fornNomes.map(fn => {
        const v = lVals.find(x => x.fornecedor_nome === fn);
        const unit = v?.valor_unit != null ? parseFloat(v.valor_unit) : null;
        const total = unit != null ? (v?.valor_total != null ? parseFloat(v.valor_total) : unit * qtd) : null;
        return { unit, total };
      });
      const validTotals = fornData.map(d => d.total).filter(t => t != null);
      const minTotal = validTotals.length ? Math.min(...validTotals) : null;
      const fornCols = fornData.map((d, fi) => {
        if (d.total != null) totais[fornNomes[fi]] += d.total;
        const isMin = d.total != null && fornNomes.length > 1 && minTotal !== null && d.total === minTotal;
        return cel2(d.unit, d.total, isMin);
      }).join('');
      const vs = l.valor_seco != null ? parseFloat(l.valor_seco) : null;
      const vsTotal = vs != null ? vs * qtd : null;
      if (vsTotal != null) { totalValorSeco += vsTotal; hasValorSeco = true; }
      return `<tr>
        <td>${l.descricao}</td>
        <td style="text-align:center">${l.unidade||'un'}</td>
        <td style="text-align:right">${l.quantidade}</td>
        ${cel2(vs, vsTotal, false)}
        ${m.mostrar_venda ? (l.valor_venda!=null ? `<td style="text-align:right">${cel2(parseFloat(l.valor_venda), parseFloat(l.valor_venda)*qtd, false).replace(/^<td[^>]*>/,'').replace(/<\/td>$/,'')}</td>` : '<td style="color:var(--gray-300)">—</td>') : ''}
        ${fornCols}
      </tr>`;
    }).join('');

    const hasTotal = fornNomes.length || hasValorSeco;
    const totalRow = hasTotal ? `<tr style="font-weight:700;background:var(--gray-50);border-top:2px solid var(--gray-200)">
      <td colspan="3" style="text-align:right;padding-right:12px;color:var(--gray-500);font-size:12px;text-transform:uppercase;letter-spacing:.5px">Total</td>
      <td style="text-align:right;font-size:14px">${hasValorSeco ? '€ ' + totalValorSeco.toFixed(2) : '—'}</td>
      ${m.mostrar_venda ? '<td style="color:var(--gray-400)">—</td>' : ''}
      ${fornNomes.map(fn => `<td style="text-align:right;font-size:14px">€ ${totais[fn].toFixed(2)}</td>`).join('')}
    </tr>` : '';

    const minForn = fornNomes.length > 1 ? fornNomes.reduce((a,b) => totais[a]<=totais[b]?a:b) : null;

    const titleEl = document.getElementById('modal-mapa-view-title');
    const subEl = document.getElementById('modal-mapa-view-sub');
    const editBtn = document.getElementById('modal-mapa-view-edit-btn');
    if (titleEl) titleEl.textContent = m.titulo;
    if (subEl) subEl.innerHTML = `Obra: ${obraNome} &nbsp;&middot;&nbsp; <span class="badge ${est.cls}">${est.label}</span>`;
    if (editBtn) editBtn.onclick = () => { closeModal('modal-mapa-view'); editarMapaComp(m.id); };

    const html = `
      ${minForn ? `<div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:16px;color:#16a34a">
        ✓ Proposta mais competitiva: <strong>${minForn}</strong> — Total: € ${totais[minForn].toFixed(2)}
      </div>` : ''}
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th rowspan="2">Descrição</th>
                <th rowspan="2" style="text-align:center">Un.</th>
                <th rowspan="2" style="text-align:right">Qtd.</th>
                <th colspan="1" style="text-align:center;background:var(--blue-50);color:var(--blue-700);border-bottom:1px solid var(--blue-200)">Valor Seco</th>
                ${m.mostrar_venda ? '<th colspan="1" style="text-align:center">Valor Venda</th>' : ''}
                ${fornNomes.map(fn=>`<th colspan="1" style="text-align:center">${fn}</th>`).join('')}
              </tr>
              <tr>
                <th style="text-align:right;font-weight:500;font-size:11px;color:var(--blue-600);background:var(--blue-50);white-space:nowrap">Unit. &nbsp;/&nbsp; Total</th>
                ${m.mostrar_venda ? '<th style="text-align:right;font-weight:500;font-size:11px;color:var(--gray-400);white-space:nowrap">Unit. &nbsp;/&nbsp; Total</th>' : ''}
                ${fornNomes.map(()=>`<th style="text-align:right;font-weight:500;font-size:11px;color:var(--gray-400);white-space:nowrap">Unit. &nbsp;/&nbsp; Total</th>`).join('')}
              </tr>
            </thead>
            <tbody>${linhasHtml}${totalRow}</tbody>
          </table>
        </div>
      </div>
      ${m.descricao ? `<div style="font-size:13px;color:var(--gray-500);margin-top:12px">${m.descricao}</div>` : ''}`;

    if (body) body.innerHTML = html;
  } catch(e) {
    if (body) body.innerHTML = `<div style="color:var(--red);padding:20px">Erro ao carregar: ${e.message||e}</div>`;
    showToast('Erro ao abrir mapa: ' + (e.message||e));
  }
}

// Botão "Mapa Comparativo" nos pedidos aprovados
// Chamado por app.js após renderCompras() para injetar botões nas linhas aprovadas
export function injectMapaCompBtns() {
  const tbody = document.getElementById('cmp-tbody');
  if (!tbody) return;
  tbody.querySelectorAll('tr:not(.cmp-group-row)').forEach(row => {
    const btn = row.querySelector('button.btn-sm');
    if (!btn || row.querySelector('.btn-mapa-comp')) return;
    const m = (btn.getAttribute('onclick')||'').match(/editarCompra\('([^']+)'\)/);
    if (!m) return;
    const c = COMPRAS.find(x => String(x.id) === m[1]);
    if (!c || c.estado !== 'aprovado') return;
    const mapBtn = document.createElement('button');
    mapBtn.className = 'btn btn-secondary btn-sm btn-mapa-comp';
    mapBtn.title = 'Criar mapa comparativo';
    mapBtn.style.cssText = 'margin-left:4px;color:var(--blue-500)';
    mapBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg> Mapa';
    mapBtn.onclick = () => {
      window.goTo('mapas-comparativos', document.getElementById('nav-mapas-comp'));
      setTimeout(() => openModalMapa(c.id), 200);
    };
    btn.parentElement.insertBefore(mapBtn, btn);
  });
}

// ═══════════════════════════════════════════════════════════
//  RESUMO DO MAPA COMPARATIVO
// ═══════════════════════════════════════════════════════════

function _gerarComentario({ fornOrdenados, fornTotais, totalSeco, hasSeco, nLinhas }) {
  if (!fornOrdenados.length) return 'Sem propostas de fornecedores registadas. Preencha os valores no mapa para obter uma análise.';

  const best = fornOrdenados[0];
  const worst = fornOrdenados[fornOrdenados.length - 1];
  const bestVal = fornTotais[best];
  const worstVal = fornTotais[worst];
  const partes = [];

  if (hasSeco && totalSeco > 0) {
    const margemBest = (totalSeco - bestVal) / totalSeco * 100;
    const margemBestStr = Math.abs(margemBest).toFixed(1) + '%';
    if (margemBest > 0) {
      partes.push(`A proposta de **${best}** (€ ${bestVal.toFixed(2)}) é a mais competitiva e fica **${margemBestStr} abaixo do valor seco**, representando uma poupança de € ${(totalSeco - bestVal).toFixed(2)} face ao orçamento estimado.`);
    } else if (margemBest < 0) {
      partes.push(`A proposta mais baixa é a de **${best}** (€ ${bestVal.toFixed(2)}), mas **excede o valor seco em ${margemBestStr}** — custo adicional de € ${(bestVal - totalSeco).toFixed(2)} face ao orçamento. Recomenda-se negociar ou rever o caderno de encargos.`);
    } else {
      partes.push(`A proposta de **${best}** coincide com o valor seco orçamentado.`);
    }
    const fornAbaixo = fornOrdenados.filter(fn => fornTotais[fn] <= totalSeco).length;
    const fornAcima = fornOrdenados.length - fornAbaixo;
    if (fornOrdenados.length > 1) {
      if (fornAbaixo > 0 && fornAcima > 0)
        partes.push(`${fornAbaixo} fornecedor${fornAbaixo > 1 ? 'es ficam' : ' fica'} dentro do orçamento e ${fornAcima} excede${fornAcima > 1 ? 'm' : ''} o valor seco.`);
      else if (fornAcima === 0)
        partes.push('Todas as propostas ficam dentro do valor seco — situação orçamental favorável.');
      else
        partes.push('Nenhuma proposta fica dentro do valor seco — pode ser necessário renegociar ou rever o orçamento.');
    }
  } else {
    partes.push(`A proposta mais competitiva é a de **${best}** com € ${bestVal.toFixed(2)}.`);
  }

  if (fornOrdenados.length > 1 && bestVal > 0) {
    const diff = worstVal - bestVal;
    const diffPct = (diff / bestVal * 100).toFixed(1);
    partes.push(`A diferença entre a proposta mais cara (**${worst}**, € ${worstVal.toFixed(2)}) e a mais barata é de € ${diff.toFixed(2)} (${diffPct}%).`);
    const pct = parseFloat(diffPct);
    if (pct < 5)
      partes.push('As propostas estão muito próximas — mercado competitivo com pouca margem de negociação adicional.');
    else if (pct > 25)
      partes.push('A grande amplitude entre propostas sugere abordagens distintas ao fornecimento. Convém verificar se todos os fornecedores interpretaram o caderno de encargos da mesma forma.');
  }

  if (nLinhas > 0 && fornOrdenados.length >= 2) {
    partes.push(`Análise baseada em ${nLinhas} linha${nLinhas > 1 ? 's' : ''} de artigos e ${fornOrdenados.length} propostas.`);
  }

  return partes.join('\n\n');
}

async function abrirResumoMapa(id) {
  const m = S.MAPAS_COMP.find(x => x.id === id);
  if (!m) return;
  const body = document.getElementById('modal-mapa-resumo-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">A calcular resumo...</div>';
  const resumoModal = document.getElementById('modal-mapa-resumo');
  if (resumoModal) resumoModal.dataset.mapaId = id;
  openModal('modal-mapa-resumo');

  try {
    const [{ data: linhas }, { data: vals }] = await Promise.all([
      sb.from('mapa_linhas').select('*').eq('mapa_id', id).order('ordem'),
      sb.from('mapa_fornecedor_valores').select('*').eq('mapa_id', id)
    ]);
    const obraNome = S.OBRAS.find(o => o.id === m.obra_id)?.nome || '—';
    const est = MC_ESTADO_CFG[m.estado] || MC_ESTADO_CFG.rascunho;
    const fornNomes = [...new Set((vals||[]).map(v => v.fornecedor_nome).filter(Boolean))];

    let totalSeco = 0; let hasSeco = false;
    const fornTotais = {}; fornNomes.forEach(fn => fornTotais[fn] = 0);

    (linhas||[]).forEach(l => {
      const qtd = parseFloat(l.quantidade) || 1;
      if (l.valor_seco != null) { totalSeco += parseFloat(l.valor_seco) * qtd; hasSeco = true; }
      const lVals = (vals||[]).filter(v => v.linha_id === l.id);
      fornNomes.forEach(fn => {
        const v = lVals.find(x => x.fornecedor_nome === fn);
        if (v?.valor_unit != null) {
          fornTotais[fn] += v.valor_total != null ? parseFloat(v.valor_total) : parseFloat(v.valor_unit) * qtd;
        }
      });
    });

    const fornOrdenados = [...fornNomes].sort((a, b) => fornTotais[a] - fornTotais[b]);
    const minTotal = fornOrdenados.length ? fornTotais[fornOrdenados[0]] : 0;
    const maxTotal = fornOrdenados.length ? fornTotais[fornOrdenados[fornOrdenados.length - 1]] : 0;
    const barMax = Math.max(hasSeco ? totalSeco : 0, maxTotal) * 1.05 || 1;

    const comentario = _gerarComentario({ fornOrdenados, fornTotais, totalSeco, hasSeco, nLinhas: (linhas||[]).length });

    const titleEl = document.getElementById('modal-mapa-resumo-title');
    const subEl   = document.getElementById('modal-mapa-resumo-sub');
    if (titleEl) titleEl.textContent = m.titulo;
    if (subEl)   subEl.innerHTML = `Obra: ${obraNome} &nbsp;&middot;&nbsp; <span class="badge ${est.cls}">${est.label}</span>`;

    // KPI cards
    const bestForn = fornOrdenados[0];
    const poupanca = (hasSeco && bestForn) ? totalSeco - fornTotais[bestForn] : null;
    const kpis = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">
      ${hasSeco ? `<div class="card" style="padding:14px 16px;text-align:center">
        <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Valor Seco Total</div>
        <div style="font-size:20px;font-weight:700;color:var(--blue-700)">€ ${totalSeco.toFixed(2)}</div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:2px">${(linhas||[]).length} artigos</div>
      </div>` : ''}
      ${bestForn ? `<div class="card" style="padding:14px 16px;text-align:center;border:1.5px solid #bbf7d0">
        <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Melhor proposta</div>
        <div style="font-size:20px;font-weight:700;color:#16a34a">€ ${fornTotais[bestForn].toFixed(2)}</div>
        <div style="font-size:11px;color:#16a34a;margin-top:2px;font-weight:600">${bestForn}</div>
      </div>` : ''}
      ${poupanca != null ? `<div class="card" style="padding:14px 16px;text-align:center;border:1.5px solid ${poupanca >= 0 ? '#bbf7d0' : '#fca5a5'}">
        <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${poupanca >= 0 ? 'Poupança' : 'Desvio'}</div>
        <div style="font-size:20px;font-weight:700;color:${poupanca >= 0 ? '#16a34a' : '#dc2626'}">${poupanca >= 0 ? '+' : ''}€ ${Math.abs(poupanca).toFixed(2)}</div>
        <div style="font-size:11px;color:${poupanca >= 0 ? '#16a34a' : '#dc2626'};margin-top:2px">${hasSeco && totalSeco > 0 ? Math.abs(poupanca / totalSeco * 100).toFixed(1) + '% vs seco' : ''}</div>
      </div>` : ''}
    </div>`;

    // Fornecedor cards with margin bars
    const fornCards = fornOrdenados.length ? `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Comparação de propostas</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${fornOrdenados.map((fn, i) => {
            const val = fornTotais[fn];
            const isMin = i === 0;
            const margem = hasSeco && totalSeco > 0 ? (totalSeco - val) / totalSeco * 100 : null;
            const margemPos = margem != null && margem >= 0;
            const barW = Math.round(val / barMax * 100);
            const barColor = isMin ? '#16a34a' : (margem != null && !margemPos ? '#dc2626' : '#3b82f6');
            return `<div class="card" style="padding:14px 16px;border-left:4px solid ${barColor}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap">
                <div>
                  <span style="font-size:14px;font-weight:700;color:var(--gray-900)">${fn}</span>
                  ${isMin ? '<span style="margin-left:6px;font-size:10px;font-weight:700;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:1px 7px">✓ MELHOR</span>' : ''}
                </div>
                <div style="text-align:right">
                  <div style="font-size:17px;font-weight:700;color:var(--gray-900)">€ ${val.toFixed(2)}</div>
                  ${margem != null ? `<div style="font-size:12px;font-weight:600;color:${margemPos ? '#16a34a' : '#dc2626'}">
                    ${margemPos ? '▲' : '▼'} ${Math.abs(margem).toFixed(1)}% ${margemPos ? 'abaixo do seco' : 'acima do seco'}
                  </div>` : ''}
                </div>
              </div>
              <div style="background:var(--gray-100);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;border-radius:4px;background:${barColor};width:${barW}%;transition:width .5s"></div>
              </div>
              ${hasSeco && totalSeco > 0 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:5px;display:flex;justify-content:space-between">
                <span>€ 0</span>
                <span style="color:var(--blue-600)">Seco: € ${totalSeco.toFixed(2)}</span>
                <span>€ ${barMax.toFixed(2)}</span>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : '<div style="color:var(--gray-400);font-size:13px;padding:20px 0">Sem propostas de fornecedores registadas.</div>';

    // Intelligent comment box
    const comentarioHtml = `
      <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1.5px solid var(--blue-200);border-radius:12px;padding:18px 20px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style="font-size:13px;font-weight:700;color:#1d4ed8">Análise automática</span>
        </div>
        <div style="font-size:13px;color:var(--gray-700);line-height:1.65">
          ${comentario.split('\n\n').map(p =>
            `<p style="margin:0 0 8px">${p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>`
          ).join('')}
        </div>
      </div>`;

    if (body) body.innerHTML = kpis + fornCards + comentarioHtml;
  } catch(e) {
    if (body) body.innerHTML = `<div style="color:var(--red);padding:20px">Erro ao calcular resumo: ${e.message||e}</div>`;
    showToast('Erro: ' + (e.message||e));
  }
}

async function exportResumoPDF() {
  const modal = document.getElementById('modal-mapa-resumo');
  const body = document.getElementById('modal-mapa-resumo-body');
  const id = modal?.dataset?.mapaId;
  const m = id ? S.MAPAS_COMP.find(x => x.id === id) : null;
  if (!body || !m) { showToast('Nenhum resumo aberto'); return; }

  if (!window.html2canvas || !window.jspdf) {
    showToast('Bibliotecas PDF não carregadas, tente novamente'); return;
  }

  try {
    showToast('A gerar PDF...');
    const canvas = await window.html2canvas(body, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;

    // Cabeçalho com cor da marca
    pdf.setFillColor(30, 64, 175);
    pdf.rect(0, 0, pageW, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Plandese — Mapa Comparativo', margin, 11);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    const obraNome = S.OBRAS.find(o => o.id === m.obra_id)?.nome || '—';
    pdf.text(`${m.titulo}  ·  Obra: ${obraNome}`, margin, 18);
    const dateStr = new Date().toLocaleDateString('pt-PT');
    const dateTxt = `Gerado em ${dateStr}`;
    const dateTxtW = pdf.getTextWidth(dateTxt);
    pdf.text(dateTxt, pageW - margin - dateTxtW, 18);

    // Conteúdo — paginação automática
    const imgW = pageW - margin * 2;
    const imgH = canvas.height * imgW / canvas.width;
    const contentY = 28;
    const maxH = pageH - contentY - margin;

    if (imgH <= maxH) {
      pdf.addImage(imgData, 'JPEG', margin, contentY, imgW, imgH);
    } else {
      const ratio = canvas.width / imgW;
      let yPx = 0;
      let firstPage = true;
      while (yPx < canvas.height) {
        if (!firstPage) pdf.addPage();
        const topY = firstPage ? contentY : margin;
        const availH = firstPage ? maxH : (pageH - margin * 2);
        const slicePx = Math.min(availH * ratio, canvas.height - yPx);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(slicePx);
        sliceCanvas.getContext('2d').drawImage(canvas, 0, -yPx);
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, topY, imgW, slicePx / ratio);
        yPx += slicePx;
        firstPage = false;
      }
    }

    // Rodapé
    const totalPages = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Portal Plandese', margin, pageH - 5);
      pdf.text(`${p} / ${totalPages}`, pageW - margin - 8, pageH - 5);
    }

    pdf.save(`resumo-${m.titulo.replace(/[^a-zA-Z0-9À-ú]/g, '-')}.pdf`);
    showToast('PDF exportado com sucesso');
  } catch(e) {
    showToast('Erro ao gerar PDF: ' + (e.message || e));
    console.error('exportResumoPDF', e);
  }
}

// ─── Upload de Lista Excel (Secos) ───────────────────────────
function uploadListaMapaSecos() {
  const inp = document.getElementById('mmc-upload-lista-input');
  if (inp) { inp.value = ''; inp.click(); }
}

function uploadListaMapaSecosFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const wb   = XLSX.read(ev.target.result, { type: 'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Encontrar linha de cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i].map(h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
        if (r.some(h => h === 'nome' || h.includes('descri'))) { headerIdx = i; break; }
      }
      if (headerIdx < 0) { showToast('Cabeçalho não encontrado no ficheiro'); return; }

      const norm  = h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const header = rows[headerIdx].map(norm);
      const colNome  = header.findIndex(h => h === 'nome' || h.includes('descri'));
      const colUn    = header.findIndex(h => h === 'un.' || h === 'un' || h.startsWith('un'));
      const colQtd   = header.findIndex(h => h.includes('qtd') || h.includes('quant'));
      const colSeco  = header.findIndex(h => h.includes('prec') || h.includes('preco') || h.includes('valor') || h.includes('unit'));

      if (colNome < 0) { showToast('Coluna de descrição não encontrada'); return; }

      let added = 0, updated = 0;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row  = rows[i];
        const nome = String(row[colNome] ?? '').trim();
        if (!nome) continue;
        const un   = colUn  >= 0 ? (String(row[colUn]  ?? '').trim() || 'un') : 'un';
        const qty  = colQtd >= 0 ? (parseFloat(String(row[colQtd] ?? '').replace(',', '.')) || 1) : 1;
        const seco = colSeco >= 0 ? (parseFloat(String(row[colSeco] ?? '').replace(',', '.')) || null) : null;

        // Tentar encontrar linha existente com mesmo nome
        const existing = S._mcLinhas.find(l =>
          l.descricao.toLowerCase().trim() === nome.toLowerCase()
        );
        if (existing) {
          if (seco != null) existing.valor_seco = seco;
          existing.unidade    = un;
          existing.quantidade = qty;
          updated++;
        } else {
          S._mcLinhas.push({ id: null, descricao: nome, unidade: un, quantidade: qty, valor_seco: seco, valor_venda: null, _valores: [] });
          added++;
        }
      }

      renderMmcLinhas();
      const msg = [];
      if (added)   msg.push(`${added} linha(s) adicionada(s)`);
      if (updated) msg.push(`${updated} linha(s) atualizada(s) com valor seco`);
      showToast(msg.length ? msg.join(', ') : 'Nenhuma linha nova encontrada');
    } catch(e) {
      console.warn('Erro ao ler lista Excel:', e);
      showToast('Erro ao processar o ficheiro Excel');
    }
  };
  reader.readAsBinaryString(file);
}

// ═══════════════════════════════════════════════════════════

export {
  sbLoadMapasComp, filtrarMapasComp, renderMapasComp, populaMcObras, populaMcPedidos,
  openModalMapa, editarMapaComp, renderMmcFornecedores, adicionarFornecedorMapa, removerFornecedorMapa,
  renderMmcLinhas, adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa,
  uploadListaMapaSecos, uploadListaMapaSecosFile,
  saveMapaComp, apagarMapaComp, abrirMapaComparativo, abrirResumoMapa, exportResumoPDF
};

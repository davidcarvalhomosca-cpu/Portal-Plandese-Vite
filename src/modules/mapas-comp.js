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
      if (c.fornecedor) {
        const forn = S.FORNECEDORES.find(f => f.nome === c.fornecedor);
        S._mcFornecedores = [{ id: forn?.id || null, nome: forn?.nome || c.fornecedor }];
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
  const sec = document.getElementById('sec-mapas-comparativos');
  if (sec) sec.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">A carregar mapa...</div>';

  try {
    const [{ data: linhas }, { data: vals }] = await Promise.all([
      sb.from('mapa_linhas').select('*').eq('mapa_id', id).order('ordem'),
      sb.from('mapa_fornecedor_valores').select('*').eq('mapa_id', id)
    ]);
    const obraNome = S.OBRAS.find(o => o.id === m.obra_id)?.nome || '—';
    const fornNomes = [...new Set((vals||[]).map(v => v.fornecedor_nome).filter(Boolean))];
    const est = MC_ESTADO_CFG[m.estado] || MC_ESTADO_CFG.rascunho;

    const totais = {};
    fornNomes.forEach(fn => totais[fn] = 0);

    const linhasHtml = (linhas||[]).map(l => {
      const lVals = (vals||[]).filter(v => v.linha_id === l.id);
      const fornTotais = fornNomes.map(fn => {
        const v = lVals.find(x => x.fornecedor_nome === fn);
        return v?.valor_total ?? (v?.valor_unit != null ? v.valor_unit * l.quantidade : null);
      });
      const minVal = Math.min(...fornTotais.filter(v => v != null));
      const fornCols = fornNomes.map((fn, fi) => {
        const vt = fornTotais[fi];
        if (vt != null) totais[fn] += vt;
        const isMin = vt != null && fornNomes.length > 1 && vt === minVal;
        return `<td style="text-align:right;${isMin?'color:var(--green);font-weight:600;':''}">${vt!=null ? '€ ' + vt.toFixed(2) : '—'}</td>`;
      }).join('');
      return `<tr>
        <td>${l.descricao}</td>
        <td style="text-align:center">${l.unidade||'un'}</td>
        <td style="text-align:right">${l.quantidade}</td>
        ${l.valor_seco!=null ? `<td style="text-align:right">€ ${parseFloat(l.valor_seco).toFixed(2)}</td>` : '<td style="color:var(--gray-400)">—</td>'}
        ${m.mostrar_venda ? (l.valor_venda!=null ? `<td style="text-align:right">€ ${parseFloat(l.valor_venda).toFixed(2)}</td>` : '<td style="color:var(--gray-400)">—</td>') : ''}
        ${fornCols}
      </tr>`;
    }).join('');

    const totalRow = fornNomes.length ? `<tr style="font-weight:700;background:var(--gray-50)">
      <td colspan="${3 + (m.mostrar_venda?2:1)}">TOTAL</td>
      ${fornNomes.map(fn => `<td style="text-align:right">€ ${totais[fn].toFixed(2)}</td>`).join('')}
    </tr>` : '';

    const minForn = fornNomes.length > 1 ? fornNomes.reduce((a,b) => totais[a]<=totais[b]?a:b) : null;

    const html = `
      <div style="max-width:960px;margin:0 auto;padding:0 0 24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="goTo('mapas-comparativos',document.getElementById('nav-mapas-comp'));sbLoadMapasComp().then(renderMapasComp)">
            ← Voltar
          </button>
          <div style="flex:1">
            <div class="pg-title" style="font-size:18px">${m.titulo}</div>
            <div style="font-size:13px;color:var(--gray-500)">Obra: ${obraNome} &nbsp;&middot;&nbsp; <span class="badge ${est.cls}">${est.label}</span></div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="editarMapaComp('${m.id}')">Editar</button>
        </div>
        ${minForn ? `<div style="background:var(--green-50,#f0fdf4);border:1px solid var(--green,#16a34a);border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px;color:var(--green)">
          ✓ Proposta mais competitiva: <strong>${minForn}</strong> — Total: € ${totais[minForn].toFixed(2)}
        </div>` : ''}
        <div class="card" style="padding:0;overflow:hidden">
          <div class="tbl-wrap">
            <table>
              <thead><tr>
                <th>Descrição</th><th>Un.</th><th>Qtd.</th>
                <th>Valor Seco</th>
                ${m.mostrar_venda ? '<th>Valor Venda</th>' : ''}
                ${fornNomes.map(fn=>`<th>${fn}</th>`).join('')}
              </tr></thead>
              <tbody>${linhasHtml}${totalRow}</tbody>
            </table>
          </div>
        </div>
        ${m.descricao ? `<div style="font-size:13px;color:var(--gray-500);margin-top:12px">${m.descricao}</div>` : ''}
      </div>`;

    if (sec) sec.innerHTML = html;
  } catch(e) { showToast('Erro ao abrir mapa: ' + (e.message||e)); }
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

export {
  sbLoadMapasComp, filtrarMapasComp, renderMapasComp, populaMcObras, populaMcPedidos,
  openModalMapa, editarMapaComp, renderMmcFornecedores, adicionarFornecedorMapa, removerFornecedorMapa,
  renderMmcLinhas, adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa,
  saveMapaComp, apagarMapaComp, abrirMapaComparativo
};

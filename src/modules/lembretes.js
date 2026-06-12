// ═══════════════════════════════════════
//  LEMBRETES — Quadro estilo Trello
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { showToast } from './navigation.js';

const COLUNAS = [
  { id: 'a_fazer',   label: 'A Fazer',    cor: 'var(--blue-500)' },
  { id: 'em_curso',  label: 'Em Curso',   cor: 'var(--yellow)' },
  { id: 'concluido', label: 'Concluído',  cor: 'var(--green)' },
];

const PRIORIDADES = {
  baixa: { label: 'Baixa', cor: '#0E9F6E', bg: '#DEF7EC' },
  media: { label: 'Média', cor: '#C27803', bg: '#FDF6B2' },
  alta:  { label: 'Alta',  cor: '#E02424', bg: '#FDE8E8' },
};

const CORES_CARD = [
  '#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#f97316','#06b6d4',
];

let _lembretes = [];
let _dragId = null;
let _editingId = null;

// ── Carregar ───────────────────────────────────────────────────────
async function loadLembretes() {
  try {
    const { data, error } = await sb
      .from('lembretes')
      .select('*')
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: true });
    if (error) throw error;
    _lembretes = data || [];
  } catch (e) {
    console.warn('loadLembretes:', e);
    _lembretes = [];
  }
}

// ── Render completo ────────────────────────────────────────────────
async function renderLembretes() {
  const board = document.getElementById('lembretes-board');
  if (!board) return;
  await loadLembretes();
  _renderBoard(board);
}

function _renderBoard(board) {
  board.innerHTML = COLUNAS.map(col => {
    const cards = _lembretes.filter(c => c.coluna === col.id);
    return `
      <div class="lmb-col" data-col="${col.id}"
           ondragover="lembretesDragOver(event)"
           ondrop="lembretesDrop(event,'${col.id}')">
        <div class="lmb-col-hdr">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="lmb-col-dot" style="background:${col.cor}"></div>
            <span class="lmb-col-title">${col.label}</span>
            <span class="lmb-col-count">${cards.length}</span>
          </div>
        </div>
        <div class="lmb-cards" id="lmb-col-cards-${col.id}">
          ${cards.map(_renderCard).join('')}
        </div>
        <button class="lmb-add-card-btn" onclick="lembretesOpenModal(null,'${col.id}')">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Adicionar
        </button>
      </div>`;
  }).join('');
}

function _renderCard(card) {
  const prio = PRIORIDADES[card.prioridade] || PRIORIDADES.media;
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = card.prazo && card.prazo < hoje;
  const prazoStr = card.prazo
    ? card.prazo.split('-').reverse().join('/')
    : '';

  return `
    <div class="lmb-card"
         draggable="true"
         data-id="${card.id}"
         ondragstart="lembretesDragStart(event,'${card.id}')"
         ondragend="lembretesDragEnd(event)"
         onclick="lembretesOpenModal('${card.id}')">
      ${card.cor ? `<div class="lmb-card-stripe" style="background:${card.cor}"></div>` : ''}
      <div class="lmb-card-body">
        <div class="lmb-card-title">${_esc(card.titulo)}</div>
        ${card.descricao ? `<div class="lmb-card-desc">${_esc(card.descricao)}</div>` : ''}
        <div class="lmb-card-meta">
          <span class="lmb-prio" style="color:${prio.cor};background:${prio.bg}">${prio.label}</span>
          ${prazoStr ? `<span class="lmb-prazo${vencido ? ' lmb-vencido' : ''}">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;flex-shrink:0"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            ${prazoStr}
          </span>` : ''}
          ${card.criado_por ? `<span class="lmb-avatar">${card.criado_por.slice(0, 2).toUpperCase()}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Re-render só as colunas (após drag) ───────────────────────────
function _reRenderColumns() {
  COLUNAS.forEach(col => {
    const el = document.getElementById(`lmb-col-cards-${col.id}`);
    if (!el) return;
    const cards = _lembretes.filter(c => c.coluna === col.id);
    el.innerHTML = cards.map(_renderCard).join('');
    const cnt = el.closest('.lmb-col')?.querySelector('.lmb-col-count');
    if (cnt) cnt.textContent = cards.length;
  });
}

// ── Modal ──────────────────────────────────────────────────────────
function lembretesOpenModal(id, colunaDefault = 'a_fazer') {
  _editingId = id || null;
  const card = id ? _lembretes.find(c => c.id === id) : null;

  document.getElementById('lmb-modal-title').textContent = card ? 'Editar Cartão' : 'Novo Cartão';
  document.getElementById('lmb-input-titulo').value = card?.titulo || '';
  document.getElementById('lmb-input-desc').value = card?.descricao || '';
  document.getElementById('lmb-input-coluna').value = card?.coluna || colunaDefault;
  document.getElementById('lmb-input-prio').value = card?.prioridade || 'media';
  document.getElementById('lmb-input-prazo').value = card?.prazo || '';

  const corAtual = card?.cor || '';
  document.getElementById('lmb-cor-picker').innerHTML =
    CORES_CARD.map(cor =>
      `<button type="button" class="lmb-cor-btn${cor === corAtual ? ' active' : ''}"
               style="background:${cor}" data-cor="${cor}"
               onclick="lembretesSelectCor('${cor}')"></button>`
    ).join('') +
    `<button type="button" class="lmb-cor-btn lmb-cor-none${!corAtual ? ' active' : ''}"
             data-cor="" onclick="lembretesSelectCor('')" title="Sem cor">×</button>`;

  document.getElementById('lmb-btn-apagar').style.display = card ? '' : 'none';

  const modal = document.getElementById('lmb-modal-bg');
  modal.style.display = 'flex';
  requestAnimationFrame(() => document.getElementById('lmb-input-titulo').focus());
}

function lembretesSelectCor(cor) {
  document.querySelectorAll('.lmb-cor-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.cor === cor)
  );
}

function lembretesCloseModal() {
  document.getElementById('lmb-modal-bg').style.display = 'none';
  _editingId = null;
}

async function lembretesSave() {
  const titulo = document.getElementById('lmb-input-titulo').value.trim();
  if (!titulo) { showToast('O título é obrigatório'); return; }

  const corAtiva = document.querySelector('.lmb-cor-btn.active')?.dataset.cor || null;
  const coluna = document.getElementById('lmb-input-coluna').value;
  const payload = {
    titulo,
    descricao: document.getElementById('lmb-input-desc').value.trim() || null,
    coluna,
    prioridade: document.getElementById('lmb-input-prio').value,
    prazo: document.getElementById('lmb-input-prazo').value || null,
    cor: corAtiva || null,
    criado_por: S.currentUser?.key || null,
    atualizado_em: new Date().toISOString(),
  };

  try {
    if (_editingId) {
      const { error } = await sb.from('lembretes').update(payload).eq('id', _editingId);
      if (error) throw error;
      const idx = _lembretes.findIndex(c => c.id === _editingId);
      if (idx >= 0) _lembretes[idx] = { ..._lembretes[idx], ...payload };
    } else {
      const maxOrdem = _lembretes
        .filter(c => c.coluna === coluna)
        .reduce((m, c) => Math.max(m, c.ordem || 0), 0);
      payload.ordem = maxOrdem + 1;
      payload.criado_em = new Date().toISOString();
      const { data, error } = await sb.from('lembretes').insert(payload).select().single();
      if (error) throw error;
      _lembretes.push(data);
    }
    lembretesCloseModal();
    showToast(_editingId ? 'Cartão atualizado ✓' : 'Cartão criado ✓');
    _reRenderColumns();
  } catch (e) {
    console.error('lembretesSave:', e);
    showToast('Erro ao guardar: ' + e.message);
  }
}

async function lembretesApagar() {
  if (!_editingId) return;
  if (!confirm('Apagar este cartão?')) return;
  try {
    const { error } = await sb.from('lembretes').delete().eq('id', _editingId);
    if (error) throw error;
    _lembretes = _lembretes.filter(c => c.id !== _editingId);
    lembretesCloseModal();
    showToast('Cartão apagado');
    _reRenderColumns();
  } catch (e) {
    showToast('Erro ao apagar: ' + e.message);
  }
}

// ── Drag & Drop ────────────────────────────────────────────────────
function lembretesDragStart(ev, id) {
  _dragId = id;
  ev.dataTransfer.effectAllowed = 'move';
  setTimeout(() => ev.currentTarget.classList.add('lmb-dragging'), 0);
}

function lembretesDragEnd(ev) {
  ev.currentTarget.classList.remove('lmb-dragging');
  document.querySelectorAll('.lmb-col').forEach(c => c.classList.remove('lmb-over'));
}

function lembretesDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.lmb-col').forEach(c => c.classList.remove('lmb-over'));
  ev.currentTarget.closest('.lmb-col')?.classList.add('lmb-over');
}

async function lembretesDrop(ev, coluna) {
  ev.preventDefault();
  document.querySelectorAll('.lmb-col').forEach(c => c.classList.remove('lmb-over'));
  if (!_dragId) return;

  const card = _lembretes.find(c => c.id === _dragId);
  if (!card || card.coluna === coluna) { _dragId = null; return; }

  card.coluna = coluna;
  _reRenderColumns();

  try {
    await sb.from('lembretes')
      .update({ coluna, atualizado_em: new Date().toISOString() })
      .eq('id', _dragId);
  } catch (e) {
    showToast('Erro ao mover cartão');
    await renderLembretes();
  }
  _dragId = null;
}

export {
  renderLembretes,
  lembretesOpenModal, lembretesCloseModal, lembretesSave, lembretesApagar,
  lembretesSelectCor,
  lembretesDragStart, lembretesDragEnd, lembretesDragOver, lembretesDrop,
};

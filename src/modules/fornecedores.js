// ═══════════════════════════════════════════════════════════
//  FORNECEDORES
// ═══════════════════════════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmtPT } from '../utils/helpers.js';
import { showToast, closeModal } from './navigation.js';

const FORN_PER_PAGE = 50;

// ═══════════════════════════════════════════════════════════
//  MÓDULO FORNECEDORES
// ═══════════════════════════════════════════════════════════

async function sbLoadFornecedores() {
  try {
    const { data, error } = await sb.from('fornecedores').select('*').order('nome');
    if (error) throw error;
    S.FORNECEDORES = data || [];
    preencherDatalistFornecedores();
  } catch(e) { console.warn('Erro ao carregar fornecedores:', e); }
}

function preencherDatalistFornecedores() {
  ['mcmp-forn-list','mmc-forn-add-list'].forEach(dlId => {
    const dl = document.getElementById(dlId);
    if (!dl) return;
    dl.innerHTML = S.FORNECEDORES
      .filter(f => f.ativo)
      .map(f => `<option value="${f.nome}" data-id="${f.id}">${f.nome}${f.nif ? ' — ' + f.nif : ''}${f.localidade ? ' (' + f.localidade + ')' : ''}</option>`)
      .join('');
  });
}

function filtrarFornecedores() {
  const q = (document.getElementById('forn-f-search')?.value || '').toLowerCase();
  const ativo = document.getElementById('forn-f-ativo')?.value;
  return S.FORNECEDORES.filter(f => {
    if (ativo === '1' && !f.ativo) return false;
    if (ativo === '0' && f.ativo) return false;
    if (q && !(`${f.nome} ${f.nif || ''} ${f.localidade || ''}`).toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderFornecedores() {
  const lista = filtrarFornecedores();
  const tbody = document.getElementById('forn-tbody');
  const empty = document.getElementById('forn-empty');
  const pagDiv = document.getElementById('forn-pag');
  if (!tbody) return;

  const total = lista.length;
  const totalPag = Math.ceil(total / FORN_PER_PAGE) || 1;
  if (S._fornPage >= totalPag) S._fornPage = Math.max(0, totalPag - 1);
  const slice = lista.slice(S._fornPage * FORN_PER_PAGE, (S._fornPage + 1) * FORN_PER_PAGE);

  const kTotal = document.getElementById('forn-k-total');
  const kAtivos = document.getElementById('forn-k-ativos');
  if (kTotal) kTotal.textContent = S.FORNECEDORES.length;
  if (kAtivos) kAtivos.textContent = S.FORNECEDORES.filter(f => f.ativo).length;

  if (total === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pagDiv) pagDiv.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = slice.map(f => `<tr>
    <td><strong>${f.nome}</strong>${f.num_conta ? `<div style="font-size:11px;color:var(--gray-400)">${f.num_conta}</div>` : ''}</td>
    <td>${f.nif || '—'}</td>
    <td>${f.localidade || '—'}</td>
    <td>${f.telefone || f.telemovel || '—'}</td>
    <td>${f.email_compras || f.email || '—'}</td>
    <td><span class="badge ${f.ativo ? 'b-green' : 'b-gray'}">${f.ativo ? 'Activo' : 'Inactivo'}</span></td>
    <td><button class="btn btn-secondary btn-sm" onclick="editarFornecedor('${f.id}')">Editar</button></td>
  </tr>`).join('');

  if (pagDiv) {
    if (totalPag <= 1) {
      pagDiv.innerHTML = `<span style="color:var(--gray-400)">${total} fornecedores</span>`;
    } else {
      pagDiv.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="fornPag(-1)" ${S._fornPage===0?'disabled':''}>&#8249; Anterior</button>
        <span>Página ${S._fornPage+1} de ${totalPag} &nbsp;&middot;&nbsp; ${total} fornecedores</span>
        <button class="btn btn-secondary btn-sm" onclick="fornPag(1)" ${S._fornPage>=totalPag-1?'disabled':''}>Próxima &#8250;</button>`;
    }
  }
}

function fornPag(delta) { S._fornPage = Math.max(0, S._fornPage + delta); renderFornecedores(); }

function openModalFornecedor(id) {
  const f = id ? S.FORNECEDORES.find(x => x.id === id) : null;
  document.getElementById('mforn-title').textContent = f ? 'Editar Fornecedor' : 'Novo Fornecedor';
  document.getElementById('mforn-sub').textContent = f ? `Conta: ${f.num_conta || '—'}` : 'Preencha os dados do fornecedor';
  document.getElementById('mforn-id').value = f ? f.id : '';
  document.getElementById('mforn-nome').value = f?.nome || '';
  document.getElementById('mforn-nif').value = f?.nif || '';
  document.getElementById('mforn-conta').value = f?.num_conta || '';
  document.getElementById('mforn-codpostal').value = f?.cod_postal || '';
  document.getElementById('mforn-localidade').value = f?.localidade || '';
  document.getElementById('mforn-rua').value = f?.rua || '';
  document.getElementById('mforn-telefone').value = f?.telefone || '';
  document.getElementById('mforn-telemovel').value = f?.telemovel || '';
  document.getElementById('mforn-email').value = f?.email || '';
  document.getElementById('mforn-email-compras').value = f?.email_compras || '';
  document.getElementById('mforn-email-comercial').value = f?.email_comercial || '';
  document.getElementById('mforn-email-contab').value = f?.email_contabilidade || '';
  document.getElementById('mforn-notas').value = f?.notas || '';
  document.getElementById('mforn-ativo').value = f ? (f.ativo ? '1' : '0') : '1';
  document.getElementById('mforn-del-btn').style.display = f ? '' : 'none';
  openModal('modal-fornecedor');
}

function editarFornecedor(id) { openModalFornecedor(id); }

async function saveFornecedor() {
  const nome = document.getElementById('mforn-nome').value.trim();
  if (!nome) { showToast('O nome do fornecedor é obrigatório'); return; }
  const id = document.getElementById('mforn-id').value;
  const rec = {
    nome,
    nif: document.getElementById('mforn-nif').value.trim() || null,
    num_conta: document.getElementById('mforn-conta').value.trim() || null,
    cod_postal: document.getElementById('mforn-codpostal').value.trim() || null,
    localidade: document.getElementById('mforn-localidade').value.trim() || null,
    rua: document.getElementById('mforn-rua').value.trim() || null,
    telefone: document.getElementById('mforn-telefone').value.trim() || null,
    telemovel: document.getElementById('mforn-telemovel').value.trim() || null,
    email: document.getElementById('mforn-email').value.trim() || null,
    email_compras: document.getElementById('mforn-email-compras').value.trim() || null,
    email_comercial: document.getElementById('mforn-email-comercial').value.trim() || null,
    email_contabilidade: document.getElementById('mforn-email-contab').value.trim() || null,
    notas: document.getElementById('mforn-notas').value.trim() || null,
    ativo: document.getElementById('mforn-ativo').value === '1'
  };
  try {
    if (id) {
      const { error } = await sb.from('fornecedores').update(rec).eq('id', id);
      if (error) throw error;
      const idx = S.FORNECEDORES.findIndex(f => f.id === id);
      if (idx >= 0) S.FORNECEDORES[idx] = { ...S.FORNECEDORES[idx], ...rec };
    } else {
      const { data, error } = await sb.from('fornecedores').insert(rec).select().single();
      if (error) throw error;
      S.FORNECEDORES.push(data);
      S.FORNECEDORES.sort((a,b) => a.nome.localeCompare(b.nome, 'pt'));
    }
    preencherDatalistFornecedores();
    closeModal('modal-fornecedor');
    const al = document.getElementById('forn-alert');
    if (al) { al.style.display=''; setTimeout(() => al.style.display='none', 3000); }
    renderFornecedores();
  } catch(e) { showToast('Erro ao guardar: ' + (e.message||e)); }
}

async function apagarFornecedor() {
  const id = document.getElementById('mforn-id').value;
  if (!id) return;
  if (!confirm('Apagar este fornecedor? Esta acção não pode ser revertida.')) return;
  try {
    await sb.from('fornecedores').delete().eq('id', id);
    S.FORNECEDORES = S.FORNECEDORES.filter(f => f.id !== id);
    preencherDatalistFornecedores();
    closeModal('modal-fornecedor');
    renderFornecedores();
  } catch(e) { showToast('Erro ao apagar: ' + (e.message||e)); }
}

function exportFornecedoresXLSX() {
  const rows = filtrarFornecedores().map(f => ({
    'Nome': f.nome, 'NIF': f.nif||'', 'Nº Conta': f.num_conta||'',
    'Cód. Postal': f.cod_postal||'', 'Localidade': f.localidade||'', 'Rua': f.rua||'',
    'Telefone': f.telefone||'', 'Telemóvel': f.telemovel||'',
    'Email': f.email||'', 'Email Compras': f.email_compras||'',
    'Email Comercial': f.email_comercial||'', 'Estado': f.ativo?'Activo':'Inactivo'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
  XLSX.writeFile(wb, 'Lista_Fornecedores.xlsx');
}

// Sincronizar ID do fornecedor selecionado no campo datalist do modal de compra
document.addEventListener('input', e => {
  if (e.target.id === 'mcmp-forn-input') {
    const nome = e.target.value;
    const forn = S.FORNECEDORES.find(f => f.nome === nome);
    const hiddenId = document.getElementById('mcmp-forn-id');
    if (hiddenId) hiddenId.value = forn ? forn.id : '';
  }
});

// ═══════════════════════════════════════════════════════════

export {
  sbLoadFornecedores, filtrarFornecedores, renderFornecedores,
  openModalFornecedor, saveFornecedor, apagarFornecedor, exportFornecedoresXLSX,
  fornPag, editarFornecedor, preencherDatalistFornecedores
};

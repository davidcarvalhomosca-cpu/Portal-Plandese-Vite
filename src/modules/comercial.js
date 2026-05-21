// ═══════════════════════════════════════
//  COMERCIAL
// ═══════════════════════════════════════
import { fmt } from '../utils/helpers.js';
import { showToast, closeModal } from './navigation.js';

let PROPOSTAS = []; // [{id, cliente, descricao, valor, estado, data}]
const COM_ESTADOS = ['Em curso','Negociação','Ganha','Perdida'];

export function initComercial(){
  renderComercial();
}

export function renderComercial(){
  const tbody = document.getElementById('com-tbody');
  const empty = document.getElementById('com-empty');
  const wrap  = document.getElementById('com-table-wrap');
  if(!tbody) return;

  const kpiMap = {emcurso:0, ganhas:0, neg:0, perdidas:0};
  PROPOSTAS.forEach(p=>{
    const e = (p.estado||'').toLowerCase();
    if(e.includes('curso')) kpiMap.emcurso++;
    else if(e.includes('neg')) kpiMap.neg++;
    else if(e.includes('ganha')) kpiMap.ganhas++;
    else if(e.includes('perd')) kpiMap.perdidas++;
  });
  const setKpi = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  setKpi('com-kpi-propostas', kpiMap.emcurso);
  setKpi('com-kpi-ganhas',    kpiMap.ganhas);
  setKpi('com-kpi-neg',       kpiMap.neg);
  setKpi('com-kpi-perdidas',  kpiMap.perdidas);

  if(PROPOSTAS.length===0){
    if(empty) empty.style.display='';
    if(wrap)  wrap.style.display='none';
    return;
  }
  if(empty) empty.style.display='none';
  if(wrap)  wrap.style.display='';

  const ESTADO_BADGE = {
    'Em curso':'b-blue','Negociação':'b-orange','Ganha':'b-green','Perdida':'b-gray'
  };
  tbody.innerHTML = PROPOSTAS.map(p=>`
    <tr>
      <td style="font-weight:500">${p.cliente||'—'}</td>
      <td>${p.descricao||'—'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${p.valor?Number(p.valor).toLocaleString('pt-PT',{minimumFractionDigits:2}):'—'}</td>
      <td><span class="badge ${ESTADO_BADGE[p.estado]||'b-gray'}">${p.estado||'—'}</span></td>
      <td style="font-size:12px;color:var(--gray-500)">${p.data||'—'}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="editProposta('${p.id}')">Editar</button></td>
    </tr>`).join('');
}

export function openModalComercial(id){
  const existing = id ? PROPOSTAS.find(p=>p.id===id) : null;
  const html = `
  <div class="modal-bg open" id="modal-com" onclick="if(event.target===this)closeModalCom()">
    <div class="modal">
      <div class="modal-title">${existing?'Editar':'Nova'} proposta</div>
      <input type="hidden" id="com-id" value="${existing?.id||''}"/>
      <div class="field"><label>Cliente *</label><input type="text" id="com-cliente" value="${existing?.cliente||''}" placeholder="Nome do cliente"/></div>
      <div class="field"><label>Descrição</label><input type="text" id="com-desc" value="${existing?.descricao||''}" placeholder="Resumo da proposta"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Valor (€)</label><input type="number" id="com-valor" value="${existing?.valor||''}" placeholder="0.00" step="0.01"/></div>
        <div class="field"><label>Data</label><input type="date" id="com-data" value="${existing?.data||fmt(new Date())}"/></div>
      </div>
      <div class="field"><label>Estado</label>
        <select id="com-estado">${COM_ESTADOS.map(e=>`<option value="${e}" ${existing?.estado===e?'selected':''}>${e}</option>`).join('')}</select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModalCom()">Cancelar</button>
        ${existing?`<button class="btn" style="background:var(--red);color:white" onclick="deleteProposta('${existing.id}')">Apagar</button>`:''}
        <button class="btn btn-primary" onclick="saveProposta()">Guardar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

export function closeModalCom(){
  document.getElementById('modal-com')?.remove();
}

export function editProposta(id){ openModalComercial(id); }

export function saveProposta(){
  const cliente = document.getElementById('com-cliente')?.value.trim();
  if(!cliente){ alert('Preencha o campo Cliente.'); return; }
  const id = document.getElementById('com-id')?.value || 'p-'+Date.now();
  const obj = {
    id, cliente,
    descricao: document.getElementById('com-desc')?.value.trim()||'',
    valor: document.getElementById('com-valor')?.value||'',
    data:  document.getElementById('com-data')?.value||'',
    estado:document.getElementById('com-estado')?.value||'Em curso'
  };
  const idx = PROPOSTAS.findIndex(p=>p.id===id);
  if(idx>=0) PROPOSTAS[idx]=obj; else PROPOSTAS.unshift(obj);
  closeModalCom();
  renderComercial();
  const al=document.getElementById('com-alert');
  if(al){al.style.display='';setTimeout(()=>al.style.display='none',2500);}
}

export function deleteProposta(id){
  if(!confirm('Apagar esta proposta?')) return;
  PROPOSTAS = PROPOSTAS.filter(p=>p.id!==id);
  closeModalCom();
  renderComercial();
}


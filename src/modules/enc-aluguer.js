// ═══════════════════════════════════════
//  ALUGUER MOA — Encarregado e Admin MOA
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT, calcH, fmtH } from '../utils/helpers.js';
import { showToast } from './navigation.js';

// ── MOA — Estado ──────────────────────
let encAlugEmpresaId='', encAlugEmpresaNome='', encAlugObraId='', encAlugData='', encAlugHoraIni='08:00', encAlugHoraFim='17:00';
export let encAlugTrabalhadores = [];
export let EMPRESAS_MOA = [];
export let COLABORADORES_MOA = {};
let moaCurrentMonday = null;

// ── MOA — Estado ──────────────────────

// Lista de empresas cedentes — carregada do Supabase

// Colaboradores por empresa MOA — { empresa_moa_id: [{id, nome, funcao}] }

// ═══════════════════════════════════════
//  EMPRESAS MOA — CRUD
// ═══════════════════════════════════════
function _saveEmpresasMOALocal(){
  try{ localStorage.setItem('empresas_moa_local', JSON.stringify(EMPRESAS_MOA)); }catch(e){}
}
function _loadEmpresasMOALocal(){
  try{ return JSON.parse(localStorage.getItem('empresas_moa_local')||'[]'); }catch(e){ return []; }
}

async function loadEmpresasMOA(){
  try{
    const {data,error}=await sb.from('empresas_moa').select('*').order('nome');
    if(error) throw error;
    EMPRESAS_MOA=(data||[]).map(e=>({id:e.id,nome:e.nome,nif:e.nif||'',contacto:e.contacto||'',ativa:e.ativa!==false}));
    // sincronizar local com o que veio do Supabase
    _saveEmpresasMOALocal();
  }catch(e){
    // tabela ainda não existe — usar localStorage como fallback
    console.warn('empresas_moa Supabase indisponível, a usar localStorage:',e.message);
    EMPRESAS_MOA=_loadEmpresasMOALocal();
  }
}

async function loadColaboradoresMOA(){
  try{
    const {data,error}=await sb.from('colaboradores_moa').select('*').eq('ativo',true).order('nome');
    if(error) throw error;
    COLABORADORES_MOA={};
    (data||[]).forEach(c=>{
      if(!COLABORADORES_MOA[c.empresa_moa_id]) COLABORADORES_MOA[c.empresa_moa_id]=[];
      COLABORADORES_MOA[c.empresa_moa_id].push({id:c.id,nome:c.nome,funcao:c.funcao||''});
    });
  }catch(e){
    console.warn('colaboradores_moa Supabase indisponível:',e.message);
    COLABORADORES_MOA={};
  }
}

async function addColabMOA(empId){
  const nomeEl=document.getElementById(`colab-nome-${empId}`);
  const funcEl=document.getElementById(`colab-func-${empId}`);
  const nome=(nomeEl?.value||'').trim();
  const funcao=(funcEl?.value||'').trim();
  if(!nome){showToast('Indique o nome do colaborador');return;}
  const id='cmoa_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const rec={id, empresa_moa_id:empId, nome, funcao:funcao||null, ativo:true};
  // Guardar no Supabase
  try{
    const {error}=await sb.from('colaboradores_moa').insert(rec);
    if(error) throw error;
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    return;
  }
  // Atualizar estado local
  if(!COLABORADORES_MOA[empId]) COLABORADORES_MOA[empId]=[];
  COLABORADORES_MOA[empId].push({id,nome,funcao:funcao||''});
  // Re-renderizar painel
  const panel=document.getElementById(`colabs-panel-${empId}`);
  if(panel) _renderColabsPanelMOA(empId, panel);
  showToast(`✓ ${nome} adicionado`);
}

async function removeColabMOA(id, empId){
  if(!confirm('Remover este colaborador?')) return;
  try{
    const {error}=await sb.from('colaboradores_moa').delete().eq('id',id);
    if(error) throw error;
  }catch(e){
    showToast('Erro ao remover: '+(e.message||e));
    return;
  }
  // Atualizar estado local
  if(COLABORADORES_MOA[empId]) COLABORADORES_MOA[empId]=COLABORADORES_MOA[empId].filter(c=>c.id!==id);
  // Re-renderizar painel
  const panel=document.getElementById(`colabs-panel-${empId}`);
  if(panel) _renderColabsPanelMOA(empId, panel);
  showToast('Colaborador removido');
}

function renderEmpresasMOA(){
  const cont=document.getElementById('empresas-moa-list');
  if(!cont) return;
  cont.innerHTML='';
  if(!EMPRESAS_MOA.length){
    cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px">Nenhuma empresa criada. Clique em "Nova empresa".</div>';
    return;
  }
  EMPRESAS_MOA.forEach(emp=>{
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-bottom:18px';
    // Card principal da empresa
    const card=document.createElement('div');
    card.className='card';
    card.style.cssText='padding:12px 16px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:none;margin-bottom:0';
    card.innerHTML=`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <div style="width:10px;height:10px;border-radius:50%;background:${emp.ativa?'var(--green)':'var(--gray-300)'};flex-shrink:0;margin-top:3px"></div>
          <div>
            <div style="font-weight:600;font-size:14px">${emp.nome}</div>
            ${emp.nif?`<div style="font-size:12px;color:var(--gray-400);margin-top:2px">NIF: ${emp.nif}</div>`:''}
            ${emp.contacto?`<div style="font-size:12px;color:var(--gray-400);margin-top:1px">${emp.contacto}</div>`:''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" onclick="editEmpresaMOA('${emp.id}')">Editar</button>
          <button class="btn btn-sm" style="background:${emp.ativa?'var(--yellow-bg)':'var(--green-bg)'};color:${emp.ativa?'var(--yellow)':'var(--green)'};border:1px solid ${emp.ativa?'#FDE68A':'var(--green-light)'}" onclick="toggleEmpresaMOA('${emp.id}')">${emp.ativa?'Desativar':'Ativar'}</button>
        </div>
      </div>`;
    wrap.appendChild(card);
    // Painel de colaboradores
    const panel=document.createElement('div');
    panel.id=`colabs-panel-${emp.id}`;
    panel.style.cssText='background:var(--gray-50);border:1px solid var(--gray-200);border-top:none;border-radius:0 0 var(--radius-lg) var(--radius-lg);padding:10px 14px 12px';
    _renderColabsPanelMOA(emp.id, panel);
    wrap.appendChild(panel);
    cont.appendChild(wrap);
  });
}

function _renderColabsPanelMOA(empId, panel){
  const FUNCOES_MOA=['Servente','Pedreiro','Manobrador','Motorista','Canalizador','Encarregado'];
  const colabs=(COLABORADORES_MOA[empId]||[]);
  let html=`<div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Colaboradores (${colabs.length})</div>`;
  if(colabs.length){
    html+=`<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">`;
    colabs.forEach(c=>{
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:white;border:1px solid var(--gray-200);border-radius:6px">
        <span style="font-size:13px;font-weight:600;color:var(--gray-900);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</span>
        ${c.funcao?`<span style="font-size:11px;color:#7c3aed;font-weight:500;white-space:nowrap">${c.funcao}</span>`:''}
        <button onclick="removeColabMOA('${c.id}','${empId}')" title="Remover" style="padding:2px 7px;background:#fee2e2;border:none;border-radius:5px;color:#b91c1c;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">✕</button>
      </div>`;
    });
    html+=`</div>`;
  } else {
    html+=`<div style="font-size:12px;color:var(--gray-400);padding:4px 0 8px">Sem colaboradores. Adicione abaixo.</div>`;
  }
  // Formulário compacto numa só linha
  html+=`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <input type="text" id="colab-nome-${empId}" placeholder="Nome *" style="flex:2;min-width:110px;padding:6px 9px;border:1.5px solid var(--gray-200);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--gray-900);background:white"/>
    <select id="colab-func-${empId}" style="flex:1;min-width:110px;padding:6px 9px;border:1.5px solid var(--gray-200);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--gray-900);background:white">
      <option value="">— Função —</option>
      ${FUNCOES_MOA.map(f=>`<option value="${f}">${f}</option>`).join('')}
    </select>
    <button onclick="addColabMOA('${empId}')" class="btn btn-primary btn-sm" style="flex-shrink:0;white-space:nowrap;font-size:12px">+ Adicionar</button>
  </div>`;
  panel.innerHTML=html;
}

function editEmpresaMOA(id){
  const emp=EMPRESAS_MOA.find(e=>e.id===id);
  if(!emp) return;
  document.getElementById('memoa-title').textContent='Editar Empresa MOA';
  document.getElementById('memoa-id').value=id;
  document.getElementById('memoa-nome').value=emp.nome;
  document.getElementById('memoa-nif').value=emp.nif||'';
  document.getElementById('memoa-contacto').value=emp.contacto||'';
  document.getElementById('modal-empresa-moa').classList.add('open');
}

async function saveEmpresaMOA(){
  const nome=document.getElementById('memoa-nome').value.trim();
  if(!nome){alert('Nome da empresa obrigatório.');return;}
  const id=document.getElementById('memoa-id').value||('empmoa_'+Date.now());
  const nif=document.getElementById('memoa-nif').value.trim();
  const contacto=document.getElementById('memoa-contacto').value.trim();
  const rec={id,nome,nif:nif||null,contacto:contacto||null,ativa:true};
  // Atualizar array local primeiro
  const idx=EMPRESAS_MOA.findIndex(e=>e.id===id);
  if(idx>=0) EMPRESAS_MOA[idx]={...EMPRESAS_MOA[idx],...rec};
  else EMPRESAS_MOA.push(rec);
  // Guardar sempre em localStorage (funciona mesmo sem tabela Supabase)
  _saveEmpresasMOALocal();
  // Tentar guardar no Supabase (silencioso se tabela não existir)
  try{
    await sb.from('empresas_moa').upsert(rec,{onConflict:'id'});
  }catch(e){
    console.warn('Supabase empresas_moa indisponível, guardado localmente:',e.message);
  }
  closeModal('modal-empresa-moa');
  renderEmpresasMOA();
  flashAlert('empresamoa-alert');
}

async function toggleEmpresaMOA(id){
  const emp=EMPRESAS_MOA.find(e=>e.id===id);
  if(!emp) return;
  emp.ativa=!emp.ativa;
  _saveEmpresasMOALocal();
  try{
    await sb.from('empresas_moa').update({ativa:emp.ativa}).eq('id',id);
  }catch(e){ console.warn(e); }
  renderEmpresasMOA();
}

async function encAlugPassarTrabalhadores(){
  const empresaId=document.getElementById('enc-alug-empresa').value;
  const empresaNome=document.getElementById('enc-alug-empresa').options[document.getElementById('enc-alug-empresa').selectedIndex]?.text||'';
  const data=document.getElementById('enc-alug-data').value;
  const obraId=document.getElementById('enc-alug-obra').value;
  const ini=document.getElementById('enc-alug-hora-ini').value;
  const fim=document.getElementById('enc-alug-hora-fim').value;
  if(!empresaId){showToast('Selecione a empresa cedente');return;}
  if(!data){showToast('Selecione a data do registo');return;}
  if(!obraId){showToast('Selecione uma obra');return;}
  if(!ini||!fim){showToast('Indique as horas de início e fim');return;}
  encAlugEmpresaId=empresaId; encAlugEmpresaNome=empresaNome;
  encAlugObraId=obraId; encAlugData=data;
  encAlugHoraIni=ini; encAlugHoraFim=fim;
  // Pré-carregar colaboradores registados da empresa selecionada
  const colabsPreDef=(COLABORADORES_MOA[empresaId]||[]);
  encAlugTrabalhadores=colabsPreDef.map(c=>({id:Date.now()+Math.random(),nome:c.nome,funcao:c.funcao||'',entrada:ini,saida:fim,status:'P'}));
  // Atualizar resumo
  const obraNome=S.OBRAS.find(o=>o.id===obraId)?.nome||'—';
  const [y,m,d]=data.split('-');
  document.getElementById('enc-alug-resumo-empresa').textContent=empresaNome;
  document.getElementById('enc-alug-resumo-info').textContent=`${obraNome}  ·  ${d}/${m}/${y}  ·  ${ini} – ${fim}`;
  document.getElementById('enc-alug-screen-a').style.display='none';
  const screenB=document.getElementById('enc-alug-screen-b');
  screenB.style.display='flex'; screenB.style.flexDirection='column';
  buildAlugList();
}

function encAlugVoltarA(){
  document.getElementById('enc-alug-screen-a').style.display='block';
  const screenB=document.getElementById('enc-alug-screen-b');
  screenB.style.display='none';
}

function encAlugAddTrabalhador(){
  const inp=document.getElementById('enc-alug-nome-novo');
  const nome=inp.value.trim();
  if(!nome){showToast('Escreva o nome do trabalhador');return;}
  encAlugTrabalhadores.push({id:Date.now(),nome,entrada:encAlugHoraIni,saida:encAlugHoraFim,status:'P'});
  inp.value='';
  buildAlugList();
}

function buildAlugList(){
  const cont=document.getElementById('enc-alug-list'); cont.innerHTML='';
  if(!encAlugTrabalhadores.length){
    cont.innerHTML='<div style="text-align:center;padding:32px 16px;color:var(--gray-400);font-size:14px">Adicione trabalhadores acima para iniciar o registo.</div>';
    encAlugUpdateStats([]);return;
  }
  // Separador informativo quando há colaboradores pré-carregados
  const temPreDef=(COLABORADORES_MOA[encAlugEmpresaId]||[]).length>0;
  if(temPreDef){
    const sep=document.createElement('div');
    sep.style.cssText='font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;padding:8px 4px 4px;display:flex;align-items:center;gap:6px';
    sep.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg> Lista pré-carregada · remova os ausentes`;
    cont.appendChild(sep);
  }
  const dateObj=new Date(encAlugData+'T12:00:00');
  const cards=encAlugTrabalhadores.map(t=>{
    const h=calcH(t.entrada,t.saida,dateObj);
    const card=document.createElement('div');
    card.className='mob-colab-card';
    card.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a855f7);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0">${t.nome.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.nome}</div>
          ${t.funcao?`<div style="font-size:11px;color:#7c3aed;font-weight:500;margin-bottom:1px">${t.funcao}</div>`:''}
          <div class="mob-horas" id="alug-horas-${t.id}">${h.t>0?`<span class="mob-horas-n">${fmtH(h.n)}</span>${h.e>0?` +<span class="mob-horas-e">${fmtH(h.e)}E</span>`:''}` : '<span style="color:var(--gray-300)">—</span>'}</div>
        </div>
        <button onclick="encAlugRemover(${t.id})" style="padding:4px 8px;background:#fee2e2;border:none;border-radius:6px;color:#b91c1c;font-size:11px;font-weight:600;cursor:pointer">✕ Remover</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Entrada</div>
          <input type="time" value="${t.entrada}" class="enc-input enc-time" style="width:100%;font-size:13px;padding:6px 10px" onchange="encAlugSetHora(${t.id},'entrada',this.value)"/>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Saída</div>
          <input type="time" value="${t.saida}" class="enc-input enc-time" style="width:100%;font-size:13px;padding:6px 10px" onchange="encAlugSetHora(${t.id},'saida',this.value)"/>
        </div>
      </div>`;
    return card;
  });
  cards.forEach(c=>cont.appendChild(c));
  encAlugUpdateStats(encAlugTrabalhadores);
}

function encAlugSetHora(id,campo,val){
  const t=encAlugTrabalhadores.find(x=>x.id===id);
  if(!t)return;
  t[campo]=val;
  const dateObj=new Date(encAlugData+'T12:00:00');
  const h=calcH(t.entrada,t.saida,dateObj);
  const hEl=document.getElementById(`alug-horas-${id}`);
  if(hEl) hEl.innerHTML=h.t>0?`<span class="mob-horas-n">${fmtH(h.n)}</span>${h.e>0?` +<span class="mob-horas-e">${fmtH(h.e)}E</span>`:''}` : '<span style="color:var(--gray-300)">—</span>';
  encAlugUpdateStats(encAlugTrabalhadores);
}

function encAlugRemover(id){
  encAlugTrabalhadores=encAlugTrabalhadores.filter(t=>t.id!==id);
  buildAlugList();
}

function encAlugUpdateStats(lista){
  const dateObj=new Date(encAlugData+'T12:00:00');
  let tn=0,te=0,tt=0;
  lista.forEach(t=>{const h=calcH(t.entrada,t.saida,dateObj);tn+=h.n;te+=h.e;tt+=h.t;});
  document.getElementById('alug-st-p').textContent=lista.length;
  document.getElementById('alug-st-n').textContent=fmtH(tn)||'0h';
  document.getElementById('alug-st-e').textContent=fmtH(te)||'0h';
  document.getElementById('alug-st-t').textContent=fmtH(tt)||'0h';
}

async function encAlugSubmeter(){
  if(!encAlugTrabalhadores.length){showToast('Adicione pelo menos um trabalhador');return;}
  const btn=document.querySelector('#enc-alug-screen-b .mob-save-btn');
  if(btn){btn.disabled=true;btn.textContent='A guardar…';}
  try{
    const rows=encAlugTrabalhadores.map(t=>({
      data:encAlugData,
      empresa_moa_id:encAlugEmpresaId,
      empresa_moa_nome:encAlugEmpresaNome,
      trabalhador_nome:t.nome,
      trabalhador_funcao:t.funcao||null,
      obra_id:encAlugObraId,
      entrada:t.entrada,
      saida:t.saida,
      encarregado_nome:S.currentUser?.nome||'',
      criado_em:new Date().toISOString()
    }));
    const {error}=await sb.from('registos_ponto_moa').insert(rows);
    if(error)throw error;
    showToast(`✓ ${encAlugTrabalhadores.length} registo(s) guardado(s)!`);
    setTimeout(()=>encVoltarHome(),1500);
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    if(btn){btn.disabled=false;btn.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Submeter registo';}
  }
}

// ── MOA Admin — filtros e listagem ─────

async function applyMOAFilter(){
  const dataVal=document.getElementById('moa-f-semana').value;
  if(!dataVal){showToast('Selecione uma data para pesquisar');return;}
  moaCurrentMonday=getMonday(new Date(dataVal+'T12:00:00'));
  await loadMOAWeek();
}

function navMOASemana(dir){
  if(!moaCurrentMonday)return;
  moaCurrentMonday=new Date(moaCurrentMonday);
  moaCurrentMonday.setDate(moaCurrentMonday.getDate()+dir*7);
  loadMOAWeek();
}

async function loadMOAWeek(){
  if(!moaCurrentMonday)return;
  const monday=moaCurrentMonday;
  const sunday=new Date(monday); sunday.setDate(sunday.getDate()+6);
  const fmtMon=fmt(monday), fmtSun=fmt(sunday);
  const empresaFil=document.getElementById('moa-f-empresa').value;
  const obraFil=document.getElementById('moa-f-obra').value;
  // Atualizar navegação
  document.getElementById('moa-week-nav').style.display='flex';
  document.getElementById('moa-week-title').textContent=`Semana de ${fmtPT(fmtMon)} a ${fmtPT(fmtSun)}`;
  document.getElementById('moa-week-sub').textContent='';
  document.getElementById('btn-export-moa').style.display='flex';
  const res=document.getElementById('moa-resultado');
  res.innerHTML='<div style="padding:32px;text-align:center;color:var(--gray-400)">A carregar…</div>';
  try{
    let q=sb.from('registos_ponto_moa').select('*').gte('data',fmtMon).lte('data',fmtSun).order('data').order('empresa_moa_nome');
    if(empresaFil) q=q.eq('empresa_moa_id',empresaFil);
    if(obraFil) q=q.eq('obra_id',obraFil);
    const {data:rows,error}=await q;
    if(error)throw error;
    renderMOAResultado(rows||[]);
  }catch(e){
    res.innerHTML=`<div style="padding:32px;text-align:center;color:#b91c1c">Erro ao carregar dados: ${e.message}</div>`;
  }
}

function renderMOAResultado(rows){
  const res=document.getElementById('moa-resultado');
  if(!rows.length){res.innerHTML='<div style="padding:48px;text-align:center;color:var(--gray-400);font-size:14px">Nenhum registo encontrado para este período.</div>';return;}
  // Agrupar por empresa
  const byEmp={};
  rows.forEach(r=>{
    const key=r.empresa_moa_nome||r.empresa_moa_id||'—';
    if(!byEmp[key]) byEmp[key]=[];
    byEmp[key].push(r);
  });
  let html='';
  Object.entries(byEmp).forEach(([emp,regs])=>{
    html+=`<div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">
      <div style="padding:14px 18px;background:linear-gradient(135deg,#7c3aed11,#a855f711);border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:#7c3aed"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        <div style="font-weight:700;color:var(--gray-900)">${emp}</div>
        <div style="margin-left:auto;font-size:12px;color:var(--gray-500)">${regs.length} registo(s)</div>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Data</th><th>Trabalhador</th><th>Função</th><th>Obra</th><th>Entrada</th><th>Saída</th><th>Horas N.</th><th>Horas E.</th><th>Total</th></tr></thead>
          <tbody>
            ${regs.map(r=>{
              const dateObj=new Date(r.data+'T12:00:00');
              const h=calcH(r.entrada?.slice(0,5)||'',r.saida?.slice(0,5)||'',dateObj);
              const obraNome=S.OBRAS.find(o=>o.id===r.obra_id)?.nome||r.obra_id||'—';
              return `<tr>
                <td>${fmtPT(r.data)}</td>
                <td>${r.trabalhador_nome||'—'}</td>
                <td style="color:var(--gray-500);font-size:12px">${r.trabalhador_funcao||'—'}</td>
                <td>${obraNome}</td>
                <td>${r.entrada?.slice(0,5)||'—'}</td>
                <td>${r.saida?.slice(0,5)||'—'}</td>
                <td>${fmtH(h.n)||'—'}</td>
                <td>${fmtH(h.e)||'—'}</td>
                <td style="font-weight:600">${fmtH(h.t)||'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  });
  res.innerHTML=html;
}

function exportMOAExcel(){showToast('Exportação Excel MOA em breve!');}

async function initMOAFilters(){
  // Preencher empresas no filtro do admin
  const es=document.getElementById('moa-f-empresa');
  if(es){
    es.innerHTML='<option value="">Todas</option>';
    EMPRESAS_MOA.filter(e=>e.ativa!==false).forEach(emp=>{const op=document.createElement('option');op.value=emp.id;op.textContent=emp.nome;es.appendChild(op);});
  }
  // Preencher obras no filtro admin
  const os=document.getElementById('moa-f-obra');
  if(os){
    os.innerHTML='<option value="">Todas</option>';
    S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  }
}

export {
  loadEmpresasMOA, loadColaboradoresMOA, addColabMOA, removeColabMOA,
  renderEmpresasMOA, editEmpresaMOA, saveEmpresaMOA, toggleEmpresaMOA,
  encAlugPassarTrabalhadores, encAlugVoltarA, encAlugAddTrabalhador,
  buildAlugList, encAlugSetHora, encAlugRemover, encAlugUpdateStats, encAlugSubmeter,
  applyMOAFilter, navMOASemana, loadMOAWeek, renderMOAResultado, exportMOAExcel, initMOAFilters
};

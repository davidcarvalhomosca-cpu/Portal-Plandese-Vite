// ═══════════════════════════════════════
//  ENC-PONTO — Encarregado: ponto e navegação
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT, calcH, fmtH } from '../utils/helpers.js';
import { TIPOS } from '../config.js';
import { showToast } from './navigation.js';
import { loadEmpresasMOA, loadColaboradoresMOA, EMPRESAS_MOA } from './enc-aluguer.js';
import { _encEquipShowState, startEncQrScanner } from './enc-equip.js';
import { stopCombQrScanner } from './enc-combustivel.js';

// ═══════════════════════════════════════
//  ENCARREGADO
// ═══════════════════════════════════════
// ── ENCARREGADO — ESTADO ──────────────────────────────────────

async function initEnc(){
  // Mostrar home imediatamente (antes das chamadas async ao Supabase)
  const _nomeEl = document.getElementById('enc-home-nome');
  if (_nomeEl) _nomeEl.textContent = S.currentUser?.nome?.split(' ')[0] || 'Encarregado';
  document.getElementById('enc-screen0').style.display='flex';
  ['enc-screen-menu-ponto','enc-screen1','enc-screen2','enc-screen-equip',
   'enc-screen-combustivel','enc-screen-comb-deposito','enc-screen-comb-viatura',
   'enc-screen-historico-enc','enc-screen-aluguer','enc-screen-compras-chat']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  _encUpdateCtxBar();
  // Preencher data com hoje (campo existe em enc-screen1)
  const _dataEl = document.getElementById('enc-data-sel');
  if (_dataEl) _dataEl.value = fmt(new Date());
  // Garantir empresas MOA e colaboradores actualizados (podem ter sido criados após o login)
  await loadEmpresasMOA().catch(e=>console.warn('loadEmpresasMOA:',e));
  await loadColaboradoresMOA().catch(e=>console.warn('loadColaboradoresMOA:',e));
  // Buscar obras do Supabase
  try {
    const {data:obras}=await sb.from('obras').select('*').eq('ativa',true).order('nome');
    if(obras&&obras.length>0) S.OBRAS=obras.map(o=>({id:o.id,nome:o.nome,local:o.local||'',desc:o.descricao||'',ativa:o.ativa}));
  } catch(e){ console.warn('obras:',e); }
  // Buscar colaboradores
  try {
    const {data:colabs}=await sb.from('colaboradores').select('*').eq('ativo',true).order('numero');
    if(colabs&&colabs.length>0) S.COLABORADORES=colabs.map(c=>({n:c.numero,nome:c.nome,func:c.funcao,ativo:c.ativo}));
  } catch(e){ console.warn('colabs:',e); }
  // Preencher select de obras (campo existe em enc-screen1)
  const os=document.getElementById('enc-obra-sel');
  if(os){
    os.innerHTML='<option value="">— Selecione uma obra —</option>';
    S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  }
  // Reforçar visibilidade (caso algo tenha mudado durante o carregamento)
  document.getElementById('enc-screen0').style.display='flex';
  const s1=document.getElementById('enc-screen1'); if(s1) s1.style.display='none';
}

async function encPassarColaboradores(){
  const data=document.getElementById('enc-data-sel').value;
  const obraId=document.getElementById('enc-obra-sel').value;
  const ini=document.getElementById('enc-hora-ini').value;
  const fim=document.getElementById('enc-hora-fim').value;
  if(!data){showToast('Selecione a data do registo');return;}
  if(!obraId){showToast('Selecione uma obra');return;}
  if(!ini||!fim){showToast('Indique as horas de início e fim');return;}
  S.encDataSel=data; S.encObraId=obraId; S.encHoraIni=ini; S.encHoraFim=fim;
  // Atualizar S.currentDate com a data selecionada
  S.currentDate=new Date(data+'T12:00:00');
  const dk=S.encDataSel;
  // Carregar registos existentes para esta data
  try {
    const {data:regs}=await sb.from('registos_ponto').select('*').eq('data',dk);
    if(regs&&regs.length>0){
      S.REGISTOS[dk]=regs.map(r=>({colabN:r.colab_numero,obra:r.obra_id,entrada:r.entrada?.slice(0,5)||'',saida:r.saida?.slice(0,5)||'',tipo:r.tipo||'Presença'}));
      S.activeRows[dk]=regs.map(r=>r.colab_numero);
    } else { S.REGISTOS[dk]=[]; S.activeRows[dk]=[]; }
  } catch(e){ S.REGISTOS[dk]=[]; S.activeRows[dk]=[]; }
  // Atualizar resumo
  const obraNome=S.OBRAS.find(o=>o.id===obraId)?.nome||'—';
  const [y,m,d]=data.split('-');
  document.getElementById('enc-resumo-obra').textContent=obraNome;
  document.getElementById('enc-resumo-info').textContent=`${d}/${m}/${y}  ·  ${ini} – ${fim}`;
  // Mostrar ecrã 2
  document.getElementById('enc-screen1').style.display='none';
  document.getElementById('enc-screen2').style.display='flex';
  document.getElementById('enc-screen2').style.flexDirection='column';
  buildEncColabSel();
  buildEncList();
  // Carregar equipa do registo anterior
  await carregarEquipaAnterior();
}

function encVoltarScreen1(){
  document.getElementById('enc-screen1').style.display='flex';document.getElementById('enc-screen1').style.flexDirection='column';
  document.getElementById('enc-screen2').style.display='none';
}

async function carregarEquipaAnterior(){
  // Procurar o registo mais recente anterior à data selecionada
  const dk=S.encDataSel;
  const jaAdicionados=S.activeRows[dk]||[];
  try {
    const {data:regs}=await sb.from('registos_ponto')
      .select('colab_numero, data')
      .lt('data', dk)
      .order('data',{ascending:false})
      .limit(50);
    if(!regs||regs.length===0){document.getElementById('ontem-box').style.display='none';return;}
    // Encontrar a data mais recente
    const dataAnterior=regs[0].data;
    document.getElementById('ontem-label').textContent=`Equipa de ${fmtPT(dataAnterior)}`;
    const numsAnteriores=[...new Set(regs.filter(r=>r.data===dataAnterior).map(r=>r.colab_numero))];
    const paraAdicionar=numsAnteriores.filter(n=>!jaAdicionados.includes(n));
    if(!paraAdicionar.length){document.getElementById('ontem-box').style.display='none';return;}
    document.getElementById('ontem-box').style.display='block';
    const lista=document.getElementById('ontem-lista');lista.innerHTML='';
    paraAdicionar.forEach(n=>{
      const c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
      const chip=document.createElement('button');
      chip.style.cssText='padding:6px 12px;background:var(--green-bg);color:var(--green);border:1.5px solid var(--green-light);border-radius:20px;font-family:"DM Sans",sans-serif;font-size:12px;font-weight:600;cursor:pointer';
      chip.textContent=`+ ${c.nome.split(' ')[0]}`;
      chip.onclick=()=>encAddColabN(n,chip);
      lista.appendChild(chip);
    });
    document.getElementById('ontem-box').dataset.nums=JSON.stringify(paraAdicionar);
  } catch(e){ document.getElementById('ontem-box').style.display='none'; }
}

async function adicionarTodosOntem(){
  const box=document.getElementById('ontem-box');
  const nums=JSON.parse(box.dataset.nums||'[]');
  const jaAdicionados=S.activeRows[S.encDataSel]||[];
  const paraAdicionar=nums.filter(n=>!jaAdicionados.includes(n));
  if(!paraAdicionar.length){showToast('Todos já adicionados');return;}
  for(const n of paraAdicionar) await encAddColabN(n,null);
  document.querySelectorAll('#ontem-lista button').forEach(chip=>{
    chip.style.background='var(--gray-100)';chip.style.color='var(--gray-400)';chip.style.borderColor='var(--gray-200)';chip.disabled=true;
  });
  showToast(`${paraAdicionar.length} colaboradores adicionados ✓`);
}

function buildEncColabSel(){
  const sel=document.getElementById('enc-add-sel');
  sel.innerHTML='<option value="">— Selecionar —</option>';
  const already=S.activeRows[S.encDataSel]||[];
  [...S.COLABORADORES].filter(c=>c.ativo&&!already.includes(c.n)).sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(c=>{
    const o=document.createElement('option');o.value=c.n;o.textContent=`${c.nome} (${c.func})`;sel.appendChild(o);
  });
}

async function encAddColabN(n,chipEl){
  const dk=S.encDataSel;
  if(!S.activeRows[dk])S.activeRows[dk]=[];
  if(S.activeRows[dk].includes(n))return;
  S.activeRows[dk].push(n);
  if(!S.REGISTOS[dk])S.REGISTOS[dk]=[];
  S.REGISTOS[dk].push({colabN:n,obra:S.encObraId,tipo:'Presença',entrada:S.encHoraIni,saida:S.encHoraFim});
  if(chipEl){chipEl.style.background='var(--gray-100)';chipEl.style.color='var(--gray-400)';chipEl.style.borderColor='var(--gray-200)';chipEl.disabled=true;chipEl.textContent='✓ '+S.COLABORADORES.find(x=>x.n===n)?.nome.split(' ')[0];}
  buildEncList();buildEncColabSel();
}

async function sbSaveRegistoEnc(dk,n){
  const r=(S.REGISTOS[dk]||[]).find(x=>x.colabN===n);if(!r)return;
  try {
    await sb.from('registos_ponto').upsert({
      data:dk, colab_numero:n, obra_id:r.obra||null,
      entrada:r.entrada||null, saida:r.saida||null, tipo:r.tipo||'Presença'
    },{onConflict:'data,colab_numero'});
  } catch(e){console.warn('save registo:',e);}
}


async function encAddColab(){
  const sel=document.getElementById('enc-add-sel');
  const n=parseInt(sel.value);if(!n){showToast('Selecione um colaborador');return;}
  const dk=S.encDataSel;
  if(!S.activeRows[dk])S.activeRows[dk]=[];
  if(S.activeRows[dk].includes(n)){showToast('Colaborador já adicionado');return;}
  S.activeRows[dk].push(n);
  if(!S.REGISTOS[dk])S.REGISTOS[dk]=[];
  S.REGISTOS[dk].push({colabN:n,obra:S.encObraId,tipo:'Presença',entrada:S.encHoraIni,saida:S.encHoraFim});
  sel.value='';
  buildEncList();buildEncColabSel();
  showToast('Colaborador adicionado ✓');
}

function buildEncList(){
  const dk=S.encDataSel;const rows=S.activeRows[dk]||[];
  const cont=document.getElementById('enc-colab-list');cont.innerHTML='';
  if(!rows.length){cont.innerHTML='<div style="text-align:center;padding:32px 16px;color:var(--gray-400);font-size:14px">Adicione colaboradores acima para iniciar o registo.</div>';encUpdateStats([]);return;}
  const calcList=[];
  rows.forEach(n=>{
    const c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
    const saved=(S.REGISTOS[dk]||[]).find(r=>r.colabN===n)||{};
    const d=new Date(dk+"T12:00:00");const h=calcH(saved.entrada,saved.saida,d);calcList.push(h);
    const ini=c.nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
    let statusClass='',statusBadge='';
    if(saved.tipo&&saved.tipo!=='Presença'){statusClass='ausente';statusBadge=`<span class="badge b-red">${saved.tipo}</span>`;}
    else if(h.t>0){statusClass='completo';statusBadge='<span class="badge b-green">✓</span>';}
    else if(saved.entrada){statusClass='parcial';statusBadge='<span class="badge b-blue">Em curso</span>';}
    const card=document.createElement('div');
    card.className=`mob-colab-card ${statusClass}`;card.id='ec-'+n;
    card.innerHTML=`
      <div class="mob-colab-top">
        <div class="mob-colab-av">${ini}</div>
        <div class="mob-colab-info"><div class="mob-colab-name">${c.nome}</div><div class="mob-colab-func">${c.func}</div></div>
        <div class="mob-colab-status">${statusBadge}</div>
      </div>
      <div class="mob-colab-times">
        <div class="mob-time-block"><div class="mob-time-lbl">Entrada</div>
          <input type="time" class="mob-time-inp ${saved.entrada?'filled':''}" id="ent-${n}" value="${saved.entrada||''}" onchange="encTimeChange(${n})"/></div>
        <div class="mob-time-block"><div class="mob-time-lbl">Saída</div>
          <input type="time" class="mob-time-inp ${saved.saida?'filled':''}" id="sai-${n}" value="${saved.saida||''}" onchange="encTimeChange(${n})"/></div>
        <div class="mob-time-block"><div class="mob-time-lbl">Horas</div>
          <div class="mob-horas-box" id="h-${n}">
            ${h.n>0?`<span class="mob-horas-n">${fmtH(h.n)}</span>`:''}
            ${h.e>0?` +<span class="mob-horas-e">${fmtH(h.e)}E</span>`:''}
            ${h.t===0?'<span style="color:var(--gray-300)">—</span>':''}
          </div></div>
      </div>
      <div class="mob-colab-bottom">
        <select class="mob-tipo-sel" id="tipo-${n}" onchange="encTipoChange(${n})">
          ${TIPOS.map(t=>`<option${saved.tipo===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <button class="mob-rem-btn" onclick="encRemColab(${n})">×</button>
      </div>`;
    cont.appendChild(card);
  });
  encUpdateStats(calcList);buildEncColabSel();
}

async function encTimeChange(n){
  const dk=S.encDataSel;
  const ent=document.getElementById('ent-'+n)?.value||'';
  const sai=document.getElementById('sai-'+n)?.value||'';
  document.getElementById('ent-'+n)?.classList.toggle('filled',!!ent);
  document.getElementById('sai-'+n)?.classList.toggle('filled',!!sai);
  const d=new Date(dk+'T12:00:00');
  const h=calcH(ent,sai,d);
  const hBox=document.getElementById('h-'+n);
  if(hBox){hBox.innerHTML=(h.n>0?`<span class="mob-horas-n">${fmtH(h.n)}</span>`:'')+( h.e>0?` +<span class="mob-horas-e">${fmtH(h.e)}E</span>`:'')+( h.t===0?'<span style="color:var(--gray-300)">—</span>':'');}
  const card=document.getElementById('ec-'+n);
  if(card){
    card.className=`mob-colab-card ${h.t>0?'completo':ent?'parcial':''}`;
    const statusEl=card.querySelector('.mob-colab-status');
    if(statusEl){if(h.t>0)statusEl.innerHTML='<span class="badge b-green">✓</span>';else if(ent)statusEl.innerHTML='<span class="badge b-blue">Em curso</span>';else statusEl.innerHTML='';}
  }
  encAutoSave(n);
  encRecalcStats();
}

async function encTipoChange(n){
  const tipo=document.getElementById('tipo-'+n)?.value;
  const card=document.getElementById('ec-'+n);
  const isAusente=tipo&&tipo!=='Presença';
  if(isAusente){
    // Limpar horas de entrada/saída
    const entEl=document.getElementById('ent-'+n);
    const saiEl=document.getElementById('sai-'+n);
    if(entEl){entEl.value='';entEl.classList.remove('filled');}
    if(saiEl){saiEl.value='';saiEl.classList.remove('filled');}
    // Mostrar 0 horas
    const hBox=document.getElementById('h-'+n);
    if(hBox)hBox.innerHTML='<span style="color:var(--gray-300)">—</span>';
    if(card){
      card.className='mob-colab-card ausente';
      const statusEl=card.querySelector('.mob-colab-status');
      if(statusEl)statusEl.innerHTML=`<span class="badge b-red">${tipo}</span>`;
    }
  } else if(card){
    card.className='mob-colab-card';
    const statusEl=card.querySelector('.mob-colab-status');
    if(statusEl)statusEl.innerHTML='';
  }
  encAutoSave(n);
  encRecalcStats();
}

function encAutoSave(n){
  const dk=S.encDataSel;if(!S.REGISTOS[dk])S.REGISTOS[dk]=[];
  const idx=S.REGISTOS[dk].findIndex(r=>r.colabN===n);
  const rec={colabN:n,obra:S.encObraId,entrada:document.getElementById('ent-'+n)?.value||'',saida:document.getElementById('sai-'+n)?.value||'',tipo:document.getElementById('tipo-'+n)?.value||'Normal'};
  if(idx>=0)S.REGISTOS[dk][idx]=rec;else S.REGISTOS[dk].push(rec);
}

async function encRemColab(n){
  const dk=S.encDataSel;
  S.activeRows[dk]=(S.activeRows[dk]||[]).filter(x=>x!==n);
  if(S.REGISTOS[dk])S.REGISTOS[dk]=S.REGISTOS[dk].filter(r=>r.colabN!==n);
  try{await sb.from('registos_ponto').delete().eq('data',dk).eq('colab_numero',n);}catch(e){}
  buildEncList();
  // Reativar chip anterior se existir
  const box=document.getElementById('ontem-box');
  if(box&&box.style.display!=='none'){
    const nums=JSON.parse(box.dataset.nums||'[]');
    if(nums.includes(n)){
      const nome=S.COLABORADORES.find(x=>x.n===n)?.nome.split(' ')[0];
      document.querySelectorAll('#ontem-lista button').forEach(chip=>{
        if(chip.textContent.includes(nome)&&chip.disabled){
          chip.style.background='var(--green-bg)';chip.style.color='var(--green)';
          chip.style.borderColor='var(--green-light)';chip.disabled=false;
          chip.textContent=`+ ${nome}`;
          chip.onclick=()=>encAddColabN(n,chip);
        }
      });
    }
  }
}

function encRecalcStats(){
  const dk=S.encDataSel;
  const d=new Date(dk+'T12:00:00');
  encUpdateStats((S.activeRows[dk]||[]).map(n=>calcH(document.getElementById('ent-'+n)?.value,document.getElementById('sai-'+n)?.value,d)));
}
function encUpdateStats(list){
  document.getElementById('m-st-p').textContent=list.filter(h=>h.t>0).length;
  document.getElementById('m-st-n').textContent=fmtH(list.reduce((s,h)=>s+h.n,0));
  document.getElementById('m-st-e').textContent=fmtH(list.reduce((s,h)=>s+h.e,0));
  document.getElementById('m-st-t').textContent=fmtH(list.reduce((s,h)=>s+h.t,0));
}

async function encSubmeterRegisto(){
  const dk=S.encDataSel;
  if(!(S.activeRows[dk]||[]).length){showToast('Adicione pelo menos um colaborador');return;}
  showToast('A submeter...');
  for(const n of (S.activeRows[dk]||[])){encAutoSave(n);await sbSaveRegistoEnc(dk,n);}
  showToast('Registo submetido com sucesso! ✓');
  _encMarkDoneToday('plandese');
  setTimeout(()=>encVoltarHome(), 1500);
}

async function encSaveDay(){
  await encSubmeterRegisto();
}


// ── Context bar: data/hora + badges "registado hoje" ──────────
function _encUpdateCtxBar(){
  const now=new Date();
  const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dateEl=document.getElementById('enc-ctx-date');
  const timeEl=document.getElementById('enc-ctx-time');
  if(dateEl) dateEl.textContent=`${dias[now.getDay()]}, ${now.getDate()} de ${meses[now.getMonth()]}`;
  if(timeEl){ const h=String(now.getHours()).padStart(2,'0'),m=String(now.getMinutes()).padStart(2,'0'); timeEl.textContent=`${h}:${m}`; }
  const dk=fmt(now);
  const plandOk=localStorage.getItem(`enc_done_plandese_${dk}`)==='1';
  const alugOk =localStorage.getItem(`enc_done_aluguer_${dk}`)==='1';
  const donePl=document.getElementById('enc-done-plandese');
  const doneAl=document.getElementById('enc-done-aluguer');
  if(donePl) donePl.classList.toggle('visible',plandOk);
  if(doneAl) doneAl.classList.toggle('visible',alugOk);
  const statusEl=document.getElementById('enc-ponto-status');
  const statusTxt=document.getElementById('enc-ponto-status-txt');
  if(statusEl&&statusTxt){
    if(plandOk||alugOk){ statusEl.className='enc-ctx-status ok'; statusTxt.textContent='Ponto registado'; }
    else { statusEl.className='enc-ctx-status pending'; statusTxt.textContent='Ponto não registado'; }
  }
}

function _encMarkDoneToday(type){
  localStorage.setItem(`enc_done_${type}_${fmt(new Date())}`,'1');
}

// ── Navegação entre ecrãs ──────────────
function encGoMenuPonto(){
  _encHideAll();
  const s=document.getElementById('enc-screen-menu-ponto');
  s.style.display='flex'; s.style.flexDirection='column';
}

function encGoFolhaPontoPlandese(){
  _encHideAll();
  document.getElementById('enc-screen1').style.display='flex';
  document.getElementById('enc-screen1').style.flexDirection='column';
}

// Manter compatibilidade com chamadas antigas
function encGoFolhaPonto(){ encGoFolhaPontoPlandese(); }

function encGoHistoricoEnc(){
  _encHideAll();
  const s=document.getElementById('enc-screen-historico-enc');
  s.style.display='flex'; s.style.flexDirection='column';
  // preencher data com hoje
  const di=document.getElementById('enc-hist-data');
  if(di && !di.value) di.value=fmt(new Date());
  encLoadHistorico();
}

async function encLoadHistorico(){
  const tipo=document.getElementById('enc-hist-tipo').value;
  const data=document.getElementById('enc-hist-data').value;
  const res=document.getElementById('enc-hist-resultado');
  if(!data){res.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)">Selecione uma data.</div>';return;}
  res.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400)">A carregar…</div>';
  try{
    if(tipo==='plandese'){
      const {data:rows}=await sb.from('registos_ponto').select('*').eq('data',data).order('colab_numero');
      if(!rows||!rows.length){res.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400);font-size:14px">Sem registos para este dia.</div>';return;}
      const dateObj=new Date(data+'T12:00:00');
      let html='<div style="display:flex;flex-direction:column;gap:10px">';
      rows.forEach(r=>{
        const c=S.COLABORADORES.find(x=>x.n===r.colab_numero);
        const nome=c?c.nome:(r.colab_numero||'—');
        const ob=S.OBRAS.find(o=>o.id===r.obra_id)?.nome||'—';
        const h=calcH(r.entrada?.slice(0,5)||'',r.saida?.slice(0,5)||'',dateObj);
        html+=`<div class="enc-card" style="margin:0;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-100);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:var(--blue-600);flex-shrink:0">${nome.charAt(0)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:var(--gray-900)">${nome}</div>
              <div style="font-size:12px;color:var(--gray-500)">${ob}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;font-size:13px;color:var(--blue-600)">${fmtH(h.t)||'—'}</div>
              <div style="font-size:11px;color:var(--gray-400)">${r.entrada?.slice(0,5)||'—'} – ${r.saida?.slice(0,5)||'—'}</div>
            </div>
          </div>
        </div>`;
      });
      html+='</div>';
      res.innerHTML=html;
    } else {
      const {data:rows}=await sb.from('registos_ponto_moa').select('*').eq('data',data).order('empresa_moa_nome');
      if(!rows||!rows.length){res.innerHTML='<div style="text-align:center;padding:32px;color:var(--gray-400);font-size:14px">Sem registos de MO Aluguer para este dia.</div>';return;}
      const dateObj=new Date(data+'T12:00:00');
      let html='<div style="display:flex;flex-direction:column;gap:10px">';
      rows.forEach(r=>{
        const ob=S.OBRAS.find(o=>o.id===r.obra_id)?.nome||'—';
        const h=calcH(r.entrada?.slice(0,5)||'',r.saida?.slice(0,5)||'',dateObj);
        html+=`<div class="enc-card" style="margin:0;padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">${r.empresa_moa_nome||'—'}</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:50%;background:#f3e8ff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#7c3aed;flex-shrink:0">${(r.trabalhador_nome||'?').charAt(0)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:var(--gray-900)">${r.trabalhador_nome||'—'}</div>
              <div style="font-size:12px;color:var(--gray-500)">${ob}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;font-size:13px;color:#7c3aed">${fmtH(h.t)||'—'}</div>
              <div style="font-size:11px;color:var(--gray-400)">${r.entrada?.slice(0,5)||'—'} – ${r.saida?.slice(0,5)||'—'}</div>
            </div>
          </div>
        </div>`;
      });
      html+='</div>';
      res.innerHTML=html;
    }
  }catch(e){
    res.innerHTML=`<div style="text-align:center;padding:32px;color:#b91c1c;font-size:13px">Erro: ${e.message}</div>`;
  }
}

async function encGoFolhaPontoAluguer(){
  _encHideAll();
  const s=document.getElementById('enc-screen-aluguer');
  s.style.display='flex'; s.style.flexDirection='column';
  // Resetar ao ecrã A
  document.getElementById('enc-alug-screen-a').style.display='block';
  const screenB=document.getElementById('enc-alug-screen-b');
  screenB.style.display='none';
  // Preencher data com hoje
  document.getElementById('enc-alug-data').value = fmt(new Date());
  // Preencher obras
  const os=document.getElementById('enc-alug-obra');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  // Recarregar empresas cedentes do Supabase (garante lista actualizada)
  await loadEmpresasMOA().catch(e=>console.warn('loadEmpresasMOA:',e));
  const es=document.getElementById('enc-alug-empresa');
  es.innerHTML='<option value="">— Selecione a empresa —</option>';
  EMPRESAS_MOA.filter(e=>e.ativa!==false).forEach(emp=>{const op=document.createElement('option');op.value=emp.id;op.textContent=emp.nome;es.appendChild(op);});
}

function encGoEquipamentos(){
  _encHideAll();
  const s=document.getElementById('enc-screen-equip');
  s.style.display='flex'; s.style.flexDirection='column';
  _encEquipShowState('scanner');
  setTimeout(()=>startEncQrScanner(), 350);
}

// ════════════════════════════════════════════════
//  COMBUSTÍVEL — ENCARREGADO
// ════════════════════════════════════════════════
function encGoCombustivel(){
  _encHideAll();
  const el = document.getElementById('enc-screen-combustivel');
  if(el){ el.style.display='flex'; el.style.flexDirection='column'; }
}

function encVoltarHome(){
  stopEncQrScanner();
  stopCombQrScanner();
  _encHideAll();
  document.getElementById('enc-screen0').style.display='flex';
  document.getElementById('enc-screen0').style.flexDirection='column';
  _encUpdateCtxBar();
}

function _encHideAll(){
  ['enc-screen0','enc-screen-menu-ponto','enc-screen1','enc-screen2','enc-screen-equip','enc-screen-aluguer','enc-screen-historico-enc','enc-screen-combustivel','enc-screen-comb-deposito','enc-screen-comb-viatura',
   'enc-screen-compras-chat'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
}

export {
  initEnc, encPassarColaboradores, encVoltarScreen1, carregarEquipaAnterior,
  adicionarTodosOntem, buildEncColabSel, encAddColabN, sbSaveRegistoEnc,
  encAddColab, buildEncList, encTimeChange, encTipoChange, encAutoSave,
  encRemColab, encRecalcStats, encUpdateStats, encSubmeterRegisto, encSaveDay,
  encGoMenuPonto, encGoFolhaPontoPlandese, encGoFolhaPonto, encGoHistoricoEnc,
  encLoadHistorico, encGoFolhaPontoAluguer, encGoEquipamentos, encGoCombustivel,
  encVoltarHome, _encHideAll
};

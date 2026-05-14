// ═══════════════════════════════════════
//  APP.JS — Lógica completa do Portal Plandese
//  Migrado para Vite/ES Modules
// ═══════════════════════════════════════
import { sb } from './supabase.js';
import {
  COLABORADORES_BASE, USERS_BASE, ROLE_LABELS, ROLE_ACCESS,
  NAV_GROUP_SECTIONS, TIPOS, MESES_PT, DIAS_PT_EXP
} from './config.js';
import { fmt, fmtPT, isWeekend, getMonday, dayShort, dayLong, calcH, fmtH } from './utils/helpers.js';

// ── Polyfill: expõe helpers globalmente para compatibilidade com HTML inline ──
window.fmt = fmt; window.fmtPT = fmtPT; window.calcH = calcH; window.fmtH = fmtH;

// ═══════════════════════════════════════
//  ESTADO
// ═══════════════════════════════════════
let COLABORADORES = [...COLABORADORES_BASE];
let OBRAS = [];
let USERS = {...USERS_BASE};
let REGISTOS = {}; // { 'YYYY-MM-DD': [{colabN, obra, entrada, saida, tipo}] }
let activeRows = {}; // { 'YYYY-MM-DD': [colabN,...] }
let currentUser = null;
let currentDate = new Date(); currentDate.setHours(12,0,0,0);
let encObraId = '';
// TIPOS: importado de config.js
let saveTimer = null;

// ═══════════════════════════════════════
//  SUPABASE — CARREGAR DADOS
// ═══════════════════════════════════════
async function carregarDados() {
  try {
    // Colaboradores
    const {data: colabs} = await sb.from('colaboradores').select('*').order('numero');
    if (colabs && colabs.length > 0) {
      COLABORADORES = colabs.map(c => ({n:c.numero, nome:c.nome, func:c.funcao, ativo:c.ativo}));
    }
    // Obras
    const {data: obras} = await sb.from('obras').select('*').order('nome');
    if (obras) {
      OBRAS = obras.map(o => ({id:o.id, nome:o.nome, local:o.local||'', desc:o.descricao||'', ativa:o.ativa}));
    }
    // Empresas MOA e colaboradores
    await loadEmpresasMOA();
    await loadColaboradoresMOA();
    // Utilizadores
    const {data: users} = await sb.from('utilizadores').select('*');
    if (users && users.length > 0) {
      USERS = {};
      users.forEach(u => { USERS[u.username] = {pass:u.password, nome:u.nome, initials:u.initials||u.nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase(), role:u.role}; });
      if (!USERS['admin']) USERS['admin'] = USERS_BASE['admin'];
    }
    // Registos do dia atual e 7 dias anteriores
    const dataMin = new Date(currentDate); dataMin.setDate(dataMin.getDate()-7);
    const {data: regs} = await sb.from('registos_ponto').select('*').gte('data', fmt(dataMin));
    if (regs) {
      REGISTOS = {};
      activeRows = {};
      regs.forEach(r => {
        const dk = r.data;
        if (!REGISTOS[dk]) REGISTOS[dk] = [];
        if (!activeRows[dk]) activeRows[dk] = [];
        REGISTOS[dk].push({colabN:r.colab_numero, obra:r.obra_id, entrada:r.entrada?.slice(0,5)||'', saida:r.saida?.slice(0,5)||'', tipo:r.tipo||'Normal'});
        if (!activeRows[dk].includes(r.colab_numero)) activeRows[dk].push(r.colab_numero);
      });
    }
  } catch(e) { console.warn('Erro ao carregar dados:', e); }
}

// ═══════════════════════════════════════
//  SUPABASE — GUARDAR REGISTO
// ═══════════════════════════════════════
async function sbSaveRegisto(dk, n) {
  const r = (REGISTOS[dk]||[]).find(x => x.colabN===n);
  if (!r) return;
  try {
    await sb.from('registos_ponto').upsert({
      data: dk,
      colab_numero: n,
      obra_id: r.obra||null,
      entrada: r.entrada||null,
      saida: r.saida||null,
      tipo: r.tipo||'Normal'
    }, {onConflict: 'data,colab_numero'});
  } catch(e) { console.warn('Erro ao guardar registo:', e); }
}

async function sbSaveObra(rec) {
  try {
    await sb.from('obras').upsert({id:rec.id, nome:rec.nome, local:rec.local||null, descricao:rec.desc||null, ativa:rec.ativa}, {onConflict:'id'});
  } catch(e) { console.warn('Erro ao guardar obra:', e); }
}

async function sbSaveColab(c) {
  try {
    await sb.from('colaboradores').upsert({numero:c.n, nome:c.nome, funcao:c.func, ativo:c.ativo}, {onConflict:'numero'});
  } catch(e) { console.warn('Erro ao guardar colaborador:', e); }
}

async function sbSaveUser(key, u) {
  try {
    await sb.from('utilizadores').upsert({username:key, nome:u.nome, password:u.pass, role:u.role, initials:u.initials}, {onConflict:'username'});
  } catch(e) { console.warn('Erro ao guardar utilizador:', e); }
}

async function sbToggleObra(id, ativa) {
  try { await sb.from('obras').update({ativa}).eq('id',id); } catch(e) {}
}
async function sbToggleColab(n, ativo) {
  try { await sb.from('colaboradores').update({ativo}).eq('numero',n); } catch(e) {}
}

function showSaveInd(){const el=document.getElementById('save-ind');if(!el)return;el.classList.add('show');clearTimeout(saveTimer);saveTimer=setTimeout(()=>el.classList.remove('show'),2000);}

// ═══════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════
function mostrarDiag(msg, cor='#1d4ed8') {
  let d = document.getElementById('diag-box');
  if (!d) {
    d = document.createElement('div');
    d.id = 'diag-box';
    d.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;padding:12px 16px;border-radius:10px;font-size:13px;font-family:DM Sans,sans-serif;z-index:9999;color:white;max-height:120px;overflow-y:auto';
    document.body.appendChild(d);
  }
  d.style.background = cor;
  d.textContent = msg;
  clearTimeout(d._t);
  d._t = setTimeout(() => d.remove(), 6000);
}

// ── DEVICE DETECTION ──────────────────────────────────────────────
function getDeviceType(){
  const w=window.innerWidth;
  const isTouch=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if(w<=640||(isTouch&&w<=900))return'mobile';
  if(w<=1024)return'tablet';
  return'desktop';
}
function applyDeviceClass(){
  const dt=getDeviceType();
  document.body.classList.remove('device-mobile','device-tablet','device-desktop');
  document.body.classList.add('device-'+dt);
  // Adjust sidebar CSS var
  if(dt==='desktop') document.documentElement.style.setProperty('--sidebar-w','220px');
  else if(dt==='tablet') document.documentElement.style.setProperty('--sidebar-w','60px');
  return dt;
}
function updateDeviceBadge(dt){
  const hdr=document.querySelector('.hdr-right');
  if(!hdr)return;
  let badge=document.getElementById('dev-badge');
  if(!badge){badge=document.createElement('span');badge.id='dev-badge';
    badge.style.cssText='font-size:10px;font-weight:600;padding:3px 8px;border-radius:10px;border:1px solid var(--gray-200);color:var(--gray-500);background:var(--gray-50);display:flex;align-items:center;gap:4px';
    hdr.insertBefore(badge,hdr.firstChild);
  }
  const icons={'mobile':'📱','tablet':'📟','desktop':'🖥️'};
  const labels={'mobile':'Mobile','tablet':'Tablet','desktop':'Desktop'};
  badge.textContent=`${icons[dt]} ${labels[dt]}`;
}
window.addEventListener('resize',()=>{
  const dt=applyDeviceClass();
  if(currentUser?.role==='admin')updateDeviceBadge(dt);
});
applyDeviceClass();

async function doLogin() {
  const u=document.getElementById('lu').value.trim().toLowerCase();
  const p=document.getElementById('lp').value;
  const btn=document.querySelector('.btn-login');
  btn.textContent='A ligar ao Supabase...'; btn.disabled=true;
  try {
    mostrarDiag('A ligar ao Supabase...','#1d4ed8');
    const {data:users,error}=await sb.from('utilizadores').select('*');
    if(error)throw error;
    if(users&&users.length>0){
      mostrarDiag('✓ Supabase ligado — '+users.length+' utilizadores','#15803D');
      USERS={};
      users.forEach(x=>{USERS[x.username]={pass:x.password,nome:x.nome,initials:x.initials||x.nome.split(' ').map(c=>c[0]).join('').slice(0,2).toUpperCase(),role:x.role};});
      // Garantir admin local como fallback de emergência
      if(!USERS['admin'])USERS['admin']=USERS_BASE['admin'];
    } else {
      // Tabela vazia: usar apenas admin local; outros utilizadores não podem entrar sem Supabase
      USERS = { 'admin': USERS_BASE['admin'] };
      mostrarDiag('⚠️ Supabase ligado mas sem utilizadores — só o admin pode entrar','#B45309');
    }
  } catch(e){
    // Sem Supabase: apenas o admin local pode entrar; outros utilizadores ficam bloqueados
    USERS = { 'admin': USERS_BASE['admin'] };
    mostrarDiag('⚠️ Sem ligação ao servidor — apenas admin pode entrar','#B45309');
  }
  btn.textContent='Entrar'; btn.disabled=false;
  const usr=USERS[u];
  if(usr&&usr.pass===p){
    currentUser={...usr,key:u};
    document.getElementById('login-screen').style.display='none';
    document.body.insertAdjacentHTML('beforeend','<div id="loading-screen" style="position:fixed;inset:0;background:#103060;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9998"><div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.2);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite"></div><div style="color:white;margin-top:16px;font-family:DM Sans,sans-serif;font-size:14px" id="loading-msg">A carregar dados...</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>');
    try {
      document.getElementById('loading-msg').textContent='A carregar obras e colaboradores...';
      await carregarDados();
      mostrarDiag(`✓ Dados carregados: ${OBRAS.length} obras, ${COLABORADORES.length} colaboradores`,'#15803D');
    } catch(e){
      mostrarDiag('❌ Erro ao carregar dados: '+e.message,'#B91C1C');
    }
    const ls=document.getElementById('loading-screen');if(ls)ls.remove();
    const device=applyDeviceClass();
    if(usr.role==='encarregado'){
      document.body.classList.add('enc-mode');
      document.getElementById('enc-app').style.display='flex';
      document.getElementById('enc-name').textContent=usr.nome;
      await initEnc();
    } else {
      // admin, diretor_obra, compras, financeiro, comercial → portal admin
      document.getElementById('admin-app').style.display='flex';
      document.getElementById('u-av').textContent=usr.initials;
      document.getElementById('u-nm').textContent=usr.nome;
      document.getElementById('u-role').textContent=ROLE_LABELS[usr.role]||usr.role;
      if(usr.role==='admin')updateDeviceBadge(device);
      applyStoredPermissions();
      initAdmin();
      applyRolePermissions(usr.role);
      initNotifications();
    }
  } else {
    const e=document.getElementById('login-error');e.style.display='block';setTimeout(()=>e.style.display='none',3000);
  }
}
function doLogout() {
  currentUser = null;
  NOTIFICACOES = [];
  notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
  const badge = document.getElementById('notif-badge');
  if(badge) badge.hidden = true;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('enc-app').style.display = 'none';
  document.getElementById('admin-app').style.display = 'none';
  document.body.classList.remove('enc-mode');
  encObraId = ''; encDataSel = '';
  // Repor todos os ecrãs do encarregado ao estado inicial
  ['enc-screen0','enc-screen-menu-ponto','enc-screen1','enc-screen2',
   'enc-screen-equip','enc-screen-aluguer','enc-screen-historico-enc','enc-screen-combustivel','enc-screen-comb-deposito','enc-screen-comb-viatura',
   'enc-screen-compras-chat'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const _s1 = document.getElementById('enc-screen1');
  if(_s1){ _s1.style.display='flex'; _s1.style.flexDirection='column'; }
  document.getElementById('lu').value = '';
  document.getElementById('lp').value = '';
}
document.getElementById('lp').addEventListener('keypress', e => { if(e.key==='Enter') doLogin(); });

// ═══════════════════════════════════════
//  DATE UTILS
// ═══════════════════════════════════════
// fmt: importado de utils/helpers.js
// fmtPT: importado de utils/helpers.js
// isWeekend: importado de utils/helpers.js
// getMonday: importado de utils/helpers.js
// dayShort: importado de utils/helpers.js
// dayLong: importado de utils/helpers.js


// ═══════════════════════════════════════
//  ENCARREGADO
// ═══════════════════════════════════════
// ── ENCARREGADO — ESTADO ──────────────────────────────────────
let encDataSel = ''; // data selecionada no ecrã 1
let encHoraIni = '08:00';
let encHoraFim = '17:00';

async function initEnc(){
  // Preencher data com hoje
  document.getElementById('enc-data-sel').value = fmt(new Date());
  // Garantir empresas MOA e colaboradores actualizados (podem ter sido criados após o login)
  await loadEmpresasMOA().catch(e=>console.warn('loadEmpresasMOA:',e));
  await loadColaboradoresMOA().catch(e=>console.warn('loadColaboradoresMOA:',e));
  // Buscar obras do Supabase
  try {
    const {data:obras}=await sb.from('obras').select('*').eq('ativa',true).order('nome');
    if(obras&&obras.length>0) OBRAS=obras.map(o=>({id:o.id,nome:o.nome,local:o.local||'',desc:o.descricao||'',ativa:o.ativa}));
  } catch(e){ console.warn('obras:',e); }
  // Buscar colaboradores
  try {
    const {data:colabs}=await sb.from('colaboradores').select('*').eq('ativo',true).order('numero');
    if(colabs&&colabs.length>0) COLABORADORES=colabs.map(c=>({n:c.numero,nome:c.nome,func:c.funcao,ativo:c.ativo}));
  } catch(e){ console.warn('colabs:',e); }
  // Preencher select de obras
  const os=document.getElementById('enc-obra-sel');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  // Mostrar ecrã home (screen0) — o encarregado escolhe o módulo
  document.getElementById('enc-home-nome').textContent = currentUser?.nome?.split(' ')[0] || 'Encarregado';
  document.getElementById('enc-screen0').style.display='flex';
  document.getElementById('enc-screen0').style.flexDirection='column';
  document.getElementById('enc-screen1').style.display='none';
  document.getElementById('enc-screen2').style.display='none';
  document.getElementById('enc-screen-equip').style.display='none';
}

async function encPassarColaboradores(){
  const data=document.getElementById('enc-data-sel').value;
  const obraId=document.getElementById('enc-obra-sel').value;
  const ini=document.getElementById('enc-hora-ini').value;
  const fim=document.getElementById('enc-hora-fim').value;
  if(!data){showToast('Selecione a data do registo');return;}
  if(!obraId){showToast('Selecione uma obra');return;}
  if(!ini||!fim){showToast('Indique as horas de início e fim');return;}
  encDataSel=data; encObraId=obraId; encHoraIni=ini; encHoraFim=fim;
  // Atualizar currentDate com a data selecionada
  currentDate=new Date(data+'T12:00:00');
  const dk=encDataSel;
  // Carregar registos existentes para esta data
  try {
    const {data:regs}=await sb.from('registos_ponto').select('*').eq('data',dk);
    if(regs&&regs.length>0){
      REGISTOS[dk]=regs.map(r=>({colabN:r.colab_numero,obra:r.obra_id,entrada:r.entrada?.slice(0,5)||'',saida:r.saida?.slice(0,5)||'',tipo:r.tipo||'Normal'}));
      activeRows[dk]=regs.map(r=>r.colab_numero);
    } else { REGISTOS[dk]=[]; activeRows[dk]=[]; }
  } catch(e){ REGISTOS[dk]=[]; activeRows[dk]=[]; }
  // Atualizar resumo
  const obraNome=OBRAS.find(o=>o.id===obraId)?.nome||'—';
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
  const dk=encDataSel;
  const jaAdicionados=activeRows[dk]||[];
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
      const c=COLABORADORES.find(x=>x.n===n);if(!c)return;
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
  const jaAdicionados=activeRows[encDataSel]||[];
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
  const already=activeRows[encDataSel]||[];
  [...COLABORADORES].filter(c=>c.ativo&&!already.includes(c.n)).sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(c=>{
    const o=document.createElement('option');o.value=c.n;o.textContent=`${c.nome} (${c.func})`;sel.appendChild(o);
  });
}

async function encAddColabN(n,chipEl){
  const dk=encDataSel;
  if(!activeRows[dk])activeRows[dk]=[];
  if(activeRows[dk].includes(n))return;
  activeRows[dk].push(n);
  if(!REGISTOS[dk])REGISTOS[dk]=[];
  REGISTOS[dk].push({colabN:n,obra:encObraId,tipo:'Normal',entrada:encHoraIni,saida:encHoraFim});
  if(chipEl){chipEl.style.background='var(--gray-100)';chipEl.style.color='var(--gray-400)';chipEl.style.borderColor='var(--gray-200)';chipEl.disabled=true;chipEl.textContent='✓ '+COLABORADORES.find(x=>x.n===n)?.nome.split(' ')[0];}
  buildEncList();buildEncColabSel();
}

async function sbSaveRegistoEnc(dk,n){
  const r=(REGISTOS[dk]||[]).find(x=>x.colabN===n);if(!r)return;
  try {
    await sb.from('registos_ponto').upsert({
      data:dk, colab_numero:n, obra_id:r.obra||null,
      entrada:r.entrada||null, saida:r.saida||null, tipo:r.tipo||'Normal'
    },{onConflict:'data,colab_numero'});
  } catch(e){console.warn('save registo:',e);}
}


async function encAddColab(){
  const sel=document.getElementById('enc-add-sel');
  const n=parseInt(sel.value);if(!n){showToast('Selecione um colaborador');return;}
  const dk=encDataSel;
  if(!activeRows[dk])activeRows[dk]=[];
  if(activeRows[dk].includes(n)){showToast('Colaborador já adicionado');return;}
  activeRows[dk].push(n);
  if(!REGISTOS[dk])REGISTOS[dk]=[];
  REGISTOS[dk].push({colabN:n,obra:encObraId,tipo:'Normal',entrada:encHoraIni,saida:encHoraFim});
  sel.value='';
  buildEncList();buildEncColabSel();
  showToast('Colaborador adicionado ✓');
}

function buildEncList(){
  const dk=encDataSel;const rows=activeRows[dk]||[];
  const cont=document.getElementById('enc-colab-list');cont.innerHTML='';
  if(!rows.length){cont.innerHTML='<div style="text-align:center;padding:32px 16px;color:var(--gray-400);font-size:14px">Adicione colaboradores acima para iniciar o registo.</div>';encUpdateStats([]);return;}
  const calcList=[];
  rows.forEach(n=>{
    const c=COLABORADORES.find(x=>x.n===n);if(!c)return;
    const saved=(REGISTOS[dk]||[]).find(r=>r.colabN===n)||{};
    const d=new Date(dk+"T12:00:00");const h=calcH(saved.entrada,saved.saida,d);calcList.push(h);
    const ini=c.nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
    let statusClass='',statusBadge='';
    if(saved.tipo&&saved.tipo!=='Normal'&&saved.tipo!=='Hora Extra'){statusClass='ausente';statusBadge=`<span class="badge b-red">${saved.tipo}</span>`;}
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
  const dk=encDataSel;
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
  if(card&&tipo&&tipo!=='Normal'&&tipo!=='Hora Extra'){
    card.className='mob-colab-card ausente';
    const statusEl=card.querySelector('.mob-colab-status');
    if(statusEl)statusEl.innerHTML=`<span class="badge b-red">${tipo}</span>`;
  }
  encAutoSave(n);
}

function encAutoSave(n){
  const dk=encDataSel;if(!REGISTOS[dk])REGISTOS[dk]=[];
  const idx=REGISTOS[dk].findIndex(r=>r.colabN===n);
  const rec={colabN:n,obra:encObraId,entrada:document.getElementById('ent-'+n)?.value||'',saida:document.getElementById('sai-'+n)?.value||'',tipo:document.getElementById('tipo-'+n)?.value||'Normal'};
  if(idx>=0)REGISTOS[dk][idx]=rec;else REGISTOS[dk].push(rec);
}

async function encRemColab(n){
  const dk=encDataSel;
  activeRows[dk]=(activeRows[dk]||[]).filter(x=>x!==n);
  if(REGISTOS[dk])REGISTOS[dk]=REGISTOS[dk].filter(r=>r.colabN!==n);
  try{await sb.from('registos_ponto').delete().eq('data',dk).eq('colab_numero',n);}catch(e){}
  buildEncList();
  // Reativar chip anterior se existir
  const box=document.getElementById('ontem-box');
  if(box&&box.style.display!=='none'){
    const nums=JSON.parse(box.dataset.nums||'[]');
    if(nums.includes(n)){
      const nome=COLABORADORES.find(x=>x.n===n)?.nome.split(' ')[0];
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
  const dk=encDataSel;
  const d=new Date(dk+'T12:00:00');
  encUpdateStats((activeRows[dk]||[]).map(n=>calcH(document.getElementById('ent-'+n)?.value,document.getElementById('sai-'+n)?.value,d)));
}
function encUpdateStats(list){
  document.getElementById('m-st-p').textContent=list.filter(h=>h.t>0).length;
  document.getElementById('m-st-n').textContent=fmtH(list.reduce((s,h)=>s+h.n,0));
  document.getElementById('m-st-e').textContent=fmtH(list.reduce((s,h)=>s+h.e,0));
  document.getElementById('m-st-t').textContent=fmtH(list.reduce((s,h)=>s+h.t,0));
}

async function encSubmeterRegisto(){
  const dk=encDataSel;
  if(!(activeRows[dk]||[]).length){showToast('Adicione pelo menos um colaborador');return;}
  showToast('A submeter...');
  for(const n of (activeRows[dk]||[])){encAutoSave(n);await sbSaveRegistoEnc(dk,n);}
  showToast('Registo submetido com sucesso! ✓');
  setTimeout(()=>encVoltarHome(), 1500);
}

async function encSaveDay(){
  await encSubmeterRegisto();
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
let toastTimer=null;
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500);
}

// ═══════════════════════════════════════
//  ADMIN — INIT
// ═══════════════════════════════════════
// ── Tabs Folha de Ponto ─────────────────
let fpTabAtivo = 'plandese';
function switchFPTab(tab){
  fpTabAtivo = tab;
  document.getElementById('fp-tab-plandese').style.display = tab==='plandese' ? '' : 'none';
  document.getElementById('fp-tab-aluguer').style.display  = tab==='aluguer'  ? '' : 'none';
  document.getElementById('fp-tab-btn-plandese').classList.toggle('active', tab==='plandese');
  document.getElementById('fp-tab-btn-aluguer').classList.toggle('active',  tab==='aluguer');
  document.getElementById('export-btns-plandese').style.display = 'none';
  document.getElementById('export-btns-aluguer').style.display  = 'none';
}

function initAdmin(){
  renderObras();renderColabs();renderUsers();
  populateFilterSelects();
  document.getElementById('f-semana').value=fmt(new Date());
  document.getElementById('nb-colab').textContent=COLABORADORES.filter(c=>c.ativo).length;
  // Inicializa módulo de compras em background
  initCompras().catch(e=>console.warn('initCompras:',e));
  // Inicializa filtros MOA
  initMOAFilters().catch(e=>console.warn('initMOAFilters:',e));
  // Navegar para o Painel Principal por defeito
  goTo('painel',document.getElementById('nav-painel'));
}

function populateFilterSelects(){
  const fc=document.getElementById('f-col');if(!fc)return;
  fc.innerHTML='<option value="">Todos</option>';
  COLABORADORES.forEach(c=>{const o=document.createElement('option');o.value=c.n;o.textContent=`${c.n} — ${c.nome}`;fc.appendChild(o);});
  ['f-obra'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML='<option value="">Todas as obras</option>';
    OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;el.appendChild(op);});
  });
}

// ═══════════════════════════════════════
//  ADMIN — HISTÓRICO SEMANAL
// ═══════════════════════════════════════
let histSemanaRef = new Date(); // data de referência da semana atual no hist

async function applyFilter(){
  const ds = document.getElementById('f-semana').value;
  if(!ds){ showToast('Selecione uma data da semana pretendida'); return; }
  histSemanaRef = new Date(ds+'T12:00:00');
  await renderHistSemana();
}

function navSemana(delta){
  histSemanaRef = new Date(histSemanaRef);
  histSemanaRef.setDate(histSemanaRef.getDate() + delta*7);
  document.getElementById('f-semana').value = fmt(histSemanaRef);
  renderHistSemana();
}

async function renderHistSemana(){
  const mon = getMonday(histSemanaRef);
  const days = [];
  for(let i=0;i<6;i++){ const d=new Date(mon); d.setDate(d.getDate()+i); days.push(d); }
  const dStrs = days.map(fmt);
  const semLabel = `${fmtPT(dStrs[0])} a ${fmtPT(dStrs[5])}`;
  const dayNames = ['2ª Feira','3ª Feira','4ª Feira','5ª Feira','6ª Feira','Sábado'];

  // Atualizar nav
  const nav = document.getElementById('hist-week-nav');
  if(!nav) return;
  nav.style.display='flex';
  document.getElementById('hist-week-title').textContent = `Semana ${semLabel}`;
  // hist-semana-label removido (tabs inline)

  const cn = parseInt(document.getElementById('f-col').value)||0;
  const oo = document.getElementById('f-obra').value;

  // Carregar registos da semana do Supabase
  const cont = document.getElementById('hist-resultado');
  cont.innerHTML='<div style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">A carregar...</div>';

  let regs;
  try {
    let query = sb.from('registos_ponto').select('*').in('data', dStrs);
    if(cn) query=query.eq('colab_numero',cn);
    if(oo) query=query.eq('obra_id',oo);
    const {data, error} = await query;
    if(error) throw error;
    regs = data;
  } catch(e) {
    cont.innerHTML=`<div class="card" style="text-align:center;color:var(--red);padding:32px;font-size:13px">⚠️ Erro ao carregar dados: ${e.message||'Verifique a ligação ao Supabase.'}</div>`;
    document.getElementById('export-btns-plandese').style.display='none';
    return;
  }

  if(!regs||!regs.length){
    cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">Sem registos para esta semana.</div>';
    document.getElementById('export-btns-plandese').style.display='none';
    return;
  }

  // Agrupar por obra → colaborador → dia
  const obraMap={};
  regs.forEach(r=>{
    const oId=r.obra_id||'_sem';
    if(!obraMap[oId]) obraMap[oId]={};
    if(!obraMap[oId][r.colab_numero]) obraMap[oId][r.colab_numero]=Array(6).fill(null);
    const di=dStrs.indexOf(r.data);
    if(di>=0) obraMap[oId][r.colab_numero][di]=r;
  });

  cont.innerHTML='';
  let grandN=0,grandE=0,grandT=0;

  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=OBRAS.find(o=>o.id===obraId)?.nome||'(sem obra)';
    const obraData=obraMap[obraId];

    // Cabeçalho da obra
    const obraHdr=document.createElement('div');
    obraHdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin:18px 0 6px;flex-wrap:wrap;gap:8px';
    obraHdr.innerHTML=`<div style="display:flex;align-items:center;gap:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:var(--blue-500)"></div>
      <span style="font-size:14px;font-weight:600;color:var(--gray-800)">Obra: ${obraNome}</span>
    </div>`;
    cont.appendChild(obraHdr);

    // Tabela
    const wrap=document.createElement('div');
    wrap.className='card';
    wrap.style.cssText='padding:0;overflow:hidden;margin-bottom:4px';
    const tblWrap=document.createElement('div');
    tblWrap.className='tbl-wrap';
    const tbl=document.createElement('table');

    // CABEÇALHO
    let thead='<thead>';
    // Linha 1: dias e datas
    thead+=`<tr style="background:var(--blue-800)">
      <th style="color:white;background:var(--blue-800);min-width:36px">Nº</th>
      <th style="color:white;background:var(--blue-800);min-width:160px">Nome</th>
      <th style="color:white;background:var(--blue-800);min-width:90px">Função</th>`;
    days.forEach((d,i)=>{
      const we=isWeekend(d);
      const bg=we?'#C2410C':'var(--blue-600)';
      thead+=`<th colspan="3" style="color:white;background:${bg};text-align:center;border-left:2px solid rgba(255,255,255,.2)">
        <div style="font-size:12px;font-weight:700">${dayNames[i]}</div>
        <div style="font-size:10px;font-weight:400;opacity:.8">${fmtPT(dStrs[i])}</div>
      </th>`;
    });
    thead+=`<th style="color:white;background:#1e3a2f;text-align:center;border-left:2px solid rgba(255,255,255,.2)">H.Nor.</th>
      <th style="color:white;background:#1e3a2f;text-align:center">H.Ext.</th>
      <th style="color:white;background:#1e3a2f;text-align:center">Total</th></tr>`;
    // Linha 2: sub-colunas H.Nor. / H.Ext. / Total por dia
    thead+=`<tr style="background:var(--gray-50)">
      <th colspan="3" style="background:var(--gray-50)"></th>`;
    days.forEach(()=>{
      thead+=`<th style="font-size:10px;color:var(--gray-500);text-align:center;border-left:1px solid var(--gray-200)">H.Nor.</th>
        <th style="font-size:10px;color:var(--gray-500);text-align:center">H.Ext.</th>
        <th style="font-size:10px;color:var(--gray-500);text-align:center;border-right:1px solid var(--gray-200)">Total</th>`;
    });
    thead+=`<th></th><th></th><th></th></tr></thead>`;
    tbl.innerHTML=thead;

    let tbody='<tbody>';
    let totN=0,totE=0,totT=0;
    let rowNum=1;

    Object.keys(obraData).sort((a,b)=>{
      const ca=COLABORADORES.find(x=>x.n===parseInt(a));
      const cb=COLABORADORES.find(x=>x.n===parseInt(b));
      return (ca?.nome||'').localeCompare(cb?.nome||'');
    }).forEach(nStr=>{
      const n=parseInt(nStr);
      const c=COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      let dayCells='';
      obraData[n].forEach((r,i)=>{
        if(!r){dayCells+=`<td style="text-align:center;color:var(--gray-200);border-left:1px solid var(--gray-100);font-size:11px">—</td><td style="text-align:center;color:var(--gray-200);font-size:11px">—</td><td style="text-align:center;color:var(--gray-200);border-right:1px solid var(--gray-100);font-size:11px">—</td>`;return;}
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);
        rN+=h.n;rE+=h.e;rT+=h.t;
        const isFalta=r.tipo?.includes('Falta');
        const isFolga=r.tipo==='Folga';
        if(isFalta){
          dayCells+=`<td colspan="3" style="text-align:center;border-left:1px solid var(--gray-100);border-right:1px solid var(--gray-100)"><span class="badge b-red" style="font-size:10px">${r.tipo}</span></td>`;
        } else if(isFolga){
          dayCells+=`<td colspan="3" style="text-align:center;border-left:1px solid var(--gray-100);border-right:1px solid var(--gray-100)"><span class="badge b-yellow" style="font-size:10px">Folga</span></td>`;
        } else {
          dayCells+=`<td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;color:var(--green);border-left:1px solid var(--gray-100)">${h.n>0?fmtH(h.n):'—'}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;color:var(--orange)">${h.e>0?fmtH(h.e):'—'}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;font-weight:600;border-right:1px solid var(--gray-100)">${h.t>0?fmtH(h.t):'—'}</td>`;
        }
      });
      totN+=rN;totE+=rE;totT+=rT;
      grandN+=rN;grandE+=rE;grandT+=rT;
      tbody+=`<tr style="${rowNum%2===0?'background:var(--gray-50)':''}">
        <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-400);font-weight:700;text-align:center">${n}</td>
        <td style="font-weight:500;font-size:13px;white-space:nowrap">${c.nome}</td>
        <td style="font-size:11px;color:var(--gray-500)">${c.func}</td>
        ${dayCells}
        <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:700;text-align:center;border-left:2px solid var(--gray-200)">${fmtH(rN)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:700;text-align:center">${fmtH(rE)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;text-align:center;color:var(--blue-600)">${fmtH(rT)}</td>
      </tr>`;
      rowNum++;
    });

    // Linha de totais da obra
    let totCells='';
    for(let i=0;i<6;i++) totCells+=`<td colspan="3" style="border-left:1px solid var(--gray-200)"></td>`;
    tbody+=`<tr style="background:var(--gray-100);border-top:2px solid var(--gray-300)">
      <td colspan="3" style="font-weight:700;font-size:12px;padding:9px 12px;color:var(--gray-700)">TOTAL DA OBRA</td>
      ${totCells}
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:700;text-align:center;border-left:2px solid var(--gray-300)">${fmtH(totN)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:700;text-align:center">${fmtH(totE)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;text-align:center;color:var(--blue-600)">${fmtH(totT)}</td>
    </tr></tbody>`;

    tbl.innerHTML+=tbody;
    tblWrap.appendChild(tbl);
    wrap.appendChild(tblWrap);
    cont.appendChild(wrap);
  });

  // Guardar dados para exportar
  window._histExportData={obraMap,days,dStrs,dayNames,semLabel,grandN,grandE,grandT};
  document.getElementById('export-btns-plandese').style.display='flex';
  // Set current month in selector
  const curM=new Date().getMonth()+1;
  document.getElementById('mes-mensal-sel').value=String(curM);
}

// ─── EXPORTAÇÃO MENSAL INDIVIDUAL ────────────────────────────
// MESES_PT: importado de config.js
// DIAS_PT_EXP: importado de config.js

// ── ExcelJS helpers ─────────────────────────────────────────────────────────
function exFill(hex8){ return {type:'pattern',pattern:'solid',fgColor:{argb:hex8}}; }
function exFont(bold,size,argb,name='Roboto'){ const f={bold,size,name:'Roboto'}; if(argb)f.color={argb}; return f; }
function exAlign(h='center',v='middle',wrap=false){ return {horizontal:h,vertical:v,wrapText:wrap}; }
function exBorder(top,bot,left,right){
  const s=st=>st?{style:st}:undefined;
  const b={};
  if(top)b.top=s(top); if(bot)b.bottom=s(bot);
  if(left)b.left=s(left); if(right)b.right=s(right);
  return b;
}
function setCells(ws, row, col, count, opts){
  for(let i=0;i<count;i++){
    const cell=ws.getCell(row, col+i);
    if(opts.border) cell.border=opts.border;
    if(opts.font) cell.font=opts.font;
    if(opts.alignment) cell.alignment=opts.alignment;
    if(opts.fill) cell.fill=opts.fill;
  }
}
function applyToMerge(ws, r, c1, c2, opts){
  for(let ci=c1;ci<=c2;ci++){
    const cell=ws.getCell(r,ci);
    if(opts.border) cell.border=opts.border;
    if(opts.font) cell.font=opts.font;
    if(opts.alignment) cell.alignment=opts.alignment;
    if(opts.fill) cell.fill=opts.fill;
  }
}

async function exportMensal(){
  const mesVal=parseInt(document.getElementById('mes-mensal-sel').value);
  const ano=2026;
  const mesNome=MESES_PT[mesVal-1];
  // Período: dia 22 mês anterior → dia 21 mês atual
  const dataIni=new Date(ano, mesVal===1?-1:mesVal-2, 22);
  const dataFim=new Date(ano, mesVal-1, 21);
  const datas=[];
  for(let d=new Date(dataIni);d<=dataFim;d.setDate(d.getDate()+1)) datas.push(new Date(d));
  const dStrs=datas.map(d=>fmt(d));

  showToast('A carregar dados do servidor...');
  const {data:regs}=await sb.from('registos_ponto').select('*').gte('data',dStrs[0]).lte('data',dStrs[dStrs.length-1]);
  const regMap={};
  (regs||[]).forEach(r=>{ if(!regMap[r.data])regMap[r.data]={}; regMap[r.data][r.colab_numero]=r; });

  showToast('A formatar ficheiro Excel...');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Plandese SA';

  const colabsAtivos=[...COLABORADORES].filter(c=>c.ativo).sort((a,b)=>a.n-b.n);
  const summaryData=[]; // acumula dados para Folha de Fecho
  const wsFecho=workbook.addWorksheet('Folha de Fecho'); // primeira aba do workbook

  // Colors (exact from original)
  const CC_C='FF0000FF', H_C='FF00B050', TOT_C='FF002060', NORM_C='FFFF00FF', EXTRA_C='FF993300';
  const F_FER='FF00FF00', F_FAL='FFC00000', F_DES='FF00B0F0';
  const F_TR='FFFFFF00', F_FE='FF00FF00', F_FA='FFC00000', F_DE='FF00B0F0';

  for(const colab of colabsAtivos){
    const {n,nome,func}=colab;
    const parts=nome.split(' ');
    const inis=parts.slice(0,2).map(p=>p[0]).join('');
    const shName=`${n}_${inis}`.slice(0,31);
    const ws=workbook.addWorksheet(shName);

    // Column widths (exact from original)
    ws.columns=[
      {width:1.5},{width:1.5},{width:8.43},{width:12.0},{width:5.0},{width:8.14},
      {width:4.29},{width:6.71},{width:4.71},{width:7.71},{width:4.71},{width:6.71},
      {width:7.86},{width:8.29},{width:8.43},{width:7.0},{width:13.0},{width:13.0},
      {width:1.14},{width:3.57},{width:8.0}
    ];

    // Row heights
    ws.getRow(1).height=20.25; ws.getRow(2).height=3.75; ws.getRow(3).height=20.25;
    ws.getRow(4).height=18.0;  ws.getRow(5).height=15.0; ws.getRow(6).height=15.0;
    ws.getRow(7).height=15.75; ws.getRow(8).height=12.75;

    // ── ROW 1: CONTROLE DE PONTO ────────────────────────────────────────────
    ws.mergeCells('C1:R1');
    const c1=ws.getCell('C1');
    c1.value='CONTROLE DE PONTO';
    c1.font=exFont(true,16,null,'Roboto');
    c1.alignment=exAlign();
    const bTitle=exBorder('thin','thin','thin','thin');
    c1.border=bTitle;
    for(let ci=4;ci<=18;ci++) ws.getCell(1,ci).border=exBorder('thin','thin');

    // ── ROW 3 ───────────────────────────────────────────────────────────────
    ws.mergeCells('C3:D3');
    let cell=ws.getCell('C3'); cell.value='Funcionário'; cell.font=exFont(false,11); cell.alignment=exAlign();

    ws.mergeCells('E3:L3');
    cell=ws.getCell('E3'); cell.value=`${n} - ${nome}`;
    cell.font=exFont(true,16); cell.alignment=exAlign(); cell.border=bTitle;
    for(let ci=6;ci<=12;ci++) ws.getCell(3,ci).border=exBorder('thin','thin');

    cell=ws.getCell('M3'); cell.value='Mês'; cell.font=exFont(false,11); cell.alignment=exAlign();
    ws.mergeCells('N3:P3');
    cell=ws.getCell('N3'); cell.value=mesNome; cell.font=exFont(true,14); cell.alignment=exAlign();
    ws.mergeCells('Q3:R3');
    cell=ws.getCell('Q3'); cell.value=ano; cell.font=exFont(true,14); cell.alignment=exAlign('center','top');
    cell.border=exBorder(null,null,'thick');

    // ── ROW 4: Função ───────────────────────────────────────────────────────
    ws.mergeCells('E4:L4');
    cell=ws.getCell('E4'); cell.value=func; cell.font=exFont(false,10); cell.alignment=exAlign();

    // ── ROW 5/6: Mês inicial ────────────────────────────────────────────────
    ws.mergeCells('C5:C6');
    cell=ws.getCell('C5'); cell.value='Mês\ninicial'; cell.font=exFont(false,10); cell.alignment=exAlign('center','middle',true);
    ws.mergeCells('D5:D6');
    cell=ws.getCell('D5'); cell.value=mesNome; cell.font=exFont(true,10); cell.alignment=exAlign();
    cell.border=exBorder('hair');

    // ── ROW 8: Headers ──────────────────────────────────────────────────────
    const hdrBCD=exBorder('thin','dotted','thin','dotted');
    const hdrBCC=exBorder('thin','dotted','thin','thin');
    const hdrBFP=exBorder('thin','thin');
    const hdrBFPR=exBorder('thin','thin',null,'thin');
    const hdrs=[
      [3,'Data',hdrBCD,null],[4,'Dia',hdrBCD,null],
      [5,'CC1',hdrBCC,null],[6,'h',hdrBCC,null],[7,'CC2',hdrBCC,null],[8,'h',hdrBCC,null],
      [9,'CC3',hdrBCC,null],[10,'h',hdrBCC,null],[11,'CC4',hdrBCC,null],[12,'h',hdrBCC,null],
      [13,'Total',hdrBCC,null],[14,'Normais',hdrBCC,null],[15,'Extra',hdrBCC,null],
      [16,'Férias',hdrBFP,F_FER],[17,'Faltas',hdrBFP,F_FAL],[18,'Desloc.',hdrBFPR,F_DES],
    ];
    for(const [col,val,brd,fill] of hdrs){
      cell=ws.getCell(8,col); cell.value=val;
      cell.font=exFont(true,10); cell.alignment=exAlign(); cell.border=brd;
      if(fill) cell.fill=exFill(fill);
    }

    // ── DATA ROWS ───────────────────────────────────────────────────────────
    let totN=0,totE=0,dTrab=0,dFer=0,dFalt=0,dDes=0;
    const obraHoras={}; // {obraId:{n,e}} para Folha de Fecho

    for(let i=0;i<datas.length;i++){
      const d=datas[i]; const row=9+i;
      ws.getRow(row).height=15.0;
      const dStr=fmt(d); const isWE=d.getDay()===0||d.getDay()===6;
      const diaNome=DIAS_PT_EXP[d.getDay()===0?6:d.getDay()-1];

      const bDate=isWE?exBorder('thin','thin','thin','dotted'):exBorder('dotted','thin','thin','dotted');
      const bDay =isWE?exBorder('thin','thin','dotted'):exBorder('dotted','thin','dotted');
      const bData=isWE?exBorder('thin','thin','thin','thin'):exBorder('dotted','thin','thin','thin');

      // Date cell
      cell=ws.getCell(row,3);
      cell.value=`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      cell.font=exFont(false,9); cell.alignment=exAlign(); cell.border=bDate;

      // Day cell
      cell=ws.getCell(row,4); cell.value=diaNome;
      cell.font=exFont(false,9); cell.alignment=exAlign(); cell.border=bDay;

      const reg=(regMap[dStr]||{})[n];
      let normH='',extraH='',totalH='',ferV='',faltV='',desV='',obraNome='';

      if(reg){
        const tipo=reg.tipo||'Normal';
        const ent=(reg.entrada||'').slice(0,5); const sai=(reg.saida||'').slice(0,5);
        obraNome=OBRAS.find(o=>o.id===reg.obra_id)?.nome||'';
        const hc=calcH(ent,sai,d);
        if(tipo==='Férias'){ferV=1;dFer++;}
        else if(tipo&&tipo.includes('Falta')){faltV=1;dFalt++;}
        else if(tipo&&(tipo.includes('Desloc')||tipo==='Deslocado')){
          if(hc.t>0){normH=hc.n||'';extraH=hc.e||'';totalH=hc.t;totN+=hc.n;totE+=hc.e;dTrab++;
            if(reg.obra_id){if(!obraHoras[reg.obra_id])obraHoras[reg.obra_id]={n:0,e:0};obraHoras[reg.obra_id].n+=hc.n;obraHoras[reg.obra_id].e+=hc.e;}
          }
          desV=1;dDes++;
        } else {
          if(hc.t>0){normH=hc.n||'';extraH=hc.e||'';totalH=hc.t;totN+=hc.n;totE+=hc.e;dTrab++;
            if(reg.obra_id){if(!obraHoras[reg.obra_id])obraHoras[reg.obra_id]={n:0,e:0};obraHoras[reg.obra_id].n+=hc.n;obraHoras[reg.obra_id].e+=hc.e;}
          }
        }
      }

      function dc(col,val,argb,fillHex){
        cell=ws.getCell(row,col); cell.value=(val!==''&&val!==null&&val!==undefined)?val:null;
        cell.font=exFont(false,11,argb); cell.alignment=exAlign(); cell.border=bData;
        if(fillHex) cell.fill=exFill(fillHex);
      }

      dc(5,obraNome,CC_C);   dc(6,normH||null,H_C);
      dc(7,'',CC_C);         dc(8,'',H_C);
      dc(9,'',CC_C);         dc(10,'',H_C);
      dc(11,'',CC_C);        dc(12,extraH||null,H_C);
      dc(13,totalH||null,TOT_C); dc(14,normH||null,NORM_C); dc(15,extraH||null,EXTRA_C);

      cell=ws.getCell(row,16); cell.value=ferV||null; cell.alignment=exAlign(); cell.border=bData;
      if(ferV) cell.fill=exFill(F_FER);
      cell=ws.getCell(row,17); cell.value=faltV||null; cell.alignment=exAlign(); cell.border=bData;
      if(faltV) cell.fill=exFill(F_FAL);
      cell=ws.getCell(row,18); cell.value=desV||null; cell.alignment=exAlign(); cell.border=bData;
      if(desV) cell.fill=exFill(F_DES);
    }

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    const sr=9+datas.length+1;
    function sc(row,col,val,bold,argb,fillHex,h='left'){
      cell=ws.getCell(row,col); cell.value=val;
      cell.font=exFont(bold||false,10,argb); cell.alignment=exAlign(h);
      if(fillHex) cell.fill=exFill(fillHex);
    }
    sc(sr,22,'total HORAS do ponto');
    sc(sr,28,'Total',true,null,null,'center'); sc(sr,29,Math.round((totN+totE)*100)/100,true,null,null,'center');
    sc(sr+1,28,'Normais',false,null,null,'center'); sc(sr+1,29,Math.round(totN*100)/100,false,NORM_C,null,'center');
    sc(sr+2,28,'Extra',false,null,null,'center'); sc(sr+2,29,Math.round(totE*100)/100,false,EXTRA_C,null,'center');
    sc(sr+4,22,'Total por MES');
    sc(sr+4,28,mesNome,false,null,null,'center'); sc(sr+4,29,Math.round((totN+totE)*100)/100,false,null,null,'center');
    sc(sr+5,28,mesNome,false,null,null,'center'); sc(sr+5,29,Math.round((totN+totE)*100)/100,false,null,null,'center');
    sc(sr+6,28,'Total',true,null,null,'center'); sc(sr+6,29,Math.round((totN+totE)*100)/100,true,null,null,'center'); sc(sr+6,30,'CERTO');
    sc(sr+8,22,'Dias');
    sc(sr+8,28,'Dias trabalho',false,null,F_TR); sc(sr+8,29,dTrab,false,null,null,'center');
    sc(sr+9,28,'Dias de férias',false,null,F_FE); sc(sr+9,29,dFer,false,null,null,'center');
    sc(sr+10,28,'Dias de falta',false,null,F_FA); sc(sr+10,29,dFalt,false,null,null,'center');
    sc(sr+11,28,'Dias deslocado',false,null,F_DE); sc(sr+11,29,dDes,false,null,null,'center');
    summaryData.push({n,nome,func,totN,totE,obraHoras});
  }

  // ── FOLHA DE FECHO ──────────────────────────────────────────────────────────
  try {
    // Ordenar obras pelo nome
    const allObraIds=[...new Set(summaryData.flatMap(w=>Object.keys(w.obraHoras)))].sort(
      (a,b)=>(OBRAS.find(o=>o.id===a)?.nome||'').localeCompare(OBRAS.find(o=>o.id===b)?.nome||'')
    );
    const allObras=allObraIds.map(id=>({id,nome:OBRAS.find(o=>o.id===id)?.nome||id}));

    const fixedCount=6; // Nº, Nome, Função, H.Normais, H.Extra, Total
    const obraColStart=fixedCount+1;
    const totalCols=fixedCount+allObras.length*2;

    // Larguras de coluna
    wsFecho.columns=[
      {width:6},{width:26},{width:14},{width:11},{width:11},{width:11},
      ...allObras.flatMap(()=>[{width:10},{width:9}])
    ];

    // ── Linha 1: Título ──
    wsFecho.mergeCells(1,1,1,totalCols);
    let fc=wsFecho.getCell(1,1);
    fc.value='PLANDESE, SA — Folha de Fecho';
    fc.font=exFont(true,14,'FFFFFFFF');
    fc.alignment=exAlign();
    for(let ci=1;ci<=totalCols;ci++) wsFecho.getCell(1,ci).fill=exFill('FF002060');
    wsFecho.getRow(1).height=24;

    // ── Linha 2: Período ──
    wsFecho.mergeCells(2,1,2,totalCols);
    fc=wsFecho.getCell(2,1);
    const pd1=`${String(dataIni.getDate()).padStart(2,'0')}/${String(dataIni.getMonth()+1).padStart(2,'0')}/${dataIni.getFullYear()}`;
    const pd2=`${String(dataFim.getDate()).padStart(2,'0')}/${String(dataFim.getMonth()+1).padStart(2,'0')}/${dataFim.getFullYear()}`;
    fc.value=`Período: ${pd1} a ${pd2}  —  Mês: ${mesNome} ${ano}`;
    fc.font=exFont(false,10,'FFFFFFFF');
    fc.alignment=exAlign();
    for(let ci=1;ci<=totalCols;ci++) wsFecho.getCell(2,ci).fill=exFill('FF1E3A5F');
    wsFecho.getRow(2).height=16;

    // ── Linhas 3-4: Cabeçalhos (2 linhas para agrupar obras) ──
    const hBg='FF1D4ED8';
    const hBg2='FF1E40AF';
    const hFg='FFFFFFFF';
    const bH=exBorder('thin','thin','thin','thin');

    // Colunas fixas (span 2 linhas)
    const fixedHdrs=['Nº','Nome','Função','H.Normais','H.Extra','Total'];
    fixedHdrs.forEach((v,i)=>{
      wsFecho.mergeCells(3,i+1,4,i+1);
      fc=wsFecho.getCell(3,i+1);
      fc.value=v; fc.font=exFont(true,10,hFg);
      fc.alignment=exAlign('center','middle',true);
      for(let r=3;r<=4;r++){wsFecho.getCell(r,i+1).fill=exFill(hBg);wsFecho.getCell(r,i+1).border=bH;}
    });
    // Colunas de obras (grupo na linha 3, sub-cabeçalhos na linha 4)
    allObras.forEach((obra,i)=>{
      const cH=obraColStart+i*2; const cP=cH+1;
      wsFecho.mergeCells(3,cH,3,cP);
      fc=wsFecho.getCell(3,cH);
      fc.value=obra.nome; fc.font=exFont(true,9,hFg);
      fc.alignment=exAlign('center','middle',true);
      for(let ci=cH;ci<=cP;ci++){wsFecho.getCell(3,ci).fill=exFill(hBg2);wsFecho.getCell(3,ci).border=bH;}
      // Sub-cabeçalhos linha 4
      fc=wsFecho.getCell(4,cH); fc.value='Horas'; fc.font=exFont(false,8,hFg);
      fc.alignment=exAlign(); fc.fill=exFill(hBg2); fc.border=bH;
      fc=wsFecho.getCell(4,cP); fc.value='%'; fc.font=exFont(false,8,hFg);
      fc.alignment=exAlign(); fc.fill=exFill(hBg2); fc.border=bH;
    });
    wsFecho.getRow(3).height=28; wsFecho.getRow(4).height=16;

    // ── Linhas de dados ──
    const grandObraH={};
    allObraIds.forEach(id=>{grandObraH[id]={n:0,e:0};});
    let gN=0,gE=0;

    summaryData.forEach((w,idx)=>{
      const row=5+idx;
      const totW=Math.round((w.totN+w.totE)*100)/100;
      gN+=w.totN; gE+=w.totE;
      allObraIds.forEach(id=>{if(w.obraHoras[id]){grandObraH[id].n+=w.obraHoras[id].n;grandObraH[id].e+=w.obraHoras[id].e;}});

      const rowFg=idx%2===0?'FFFFFFFF':'FFF0F4FF';
      const bR=exBorder('thin','thin','thin','thin');

      const wc=(col,val,bold,argb,fg)=>{
        const cell=wsFecho.getCell(row,col);
        cell.value=(val!==null&&val!==undefined&&val!=='')?val:null;
        cell.font=exFont(bold||false,10,argb||null);
        cell.alignment=exAlign(typeof val==='number'?'center':'left','middle');
        cell.fill=exFill(fg||rowFg); cell.border=bR;
      };
      wc(1,w.n,false,'FF374151');
      wc(2,w.nome,true,'FF111827');
      wc(3,w.func,false,'FF6B7280');
      wc(4,Math.round(w.totN*100)/100,true,'FF00B050');
      wc(5,Math.round(w.totE*100)/100,true,'FF993300');
      wc(6,totW,true,'FF002060');

      allObras.forEach((obra,i)=>{
        const cH=obraColStart+i*2; const cP=cH+1;
        const oH=w.obraHoras[obra.id]||{n:0,e:0};
        const oT=Math.round((oH.n+oH.e)*100)/100;
        const pct=totW>0?Math.round(oT/totW*1000)/10:0;
        wc(cH,oT>0?oT:null,false,'FF1D4ED8');
        const pcell=wsFecho.getCell(row,cP);
        pcell.value=oT>0?pct:null;
        pcell.font=exFont(false,10,'FF6B7280');
        pcell.alignment=exAlign('center','middle');
        pcell.fill=exFill(rowFg); pcell.border=bR;
        if(oT>0) pcell.numFmt='0.0"%"';
      });
      wsFecho.getRow(row).height=18;
    });

    // ── Linha de Totais ──
    const totRow=5+summaryData.length;
    const gT=Math.round((gN+gE)*100)/100;
    const bTot=exBorder('medium','medium','medium','medium');

    const tc=(col,val,bold,argb)=>{
      const cell=wsFecho.getCell(totRow,col);
      cell.value=(val!==null&&val!==undefined)?val:null;
      cell.font=exFont(bold||false,10,argb||null);
      cell.alignment=exAlign(typeof val==='number'?'center':'left','middle');
      cell.fill=exFill('FFE8F0FE'); cell.border=bTot;
    };
    wsFecho.mergeCells(totRow,1,totRow,3);
    tc(1,'TOTAL GERAL',true,'FF002060');
    tc(4,Math.round(gN*100)/100,true,'FF00B050');
    tc(5,Math.round(gE*100)/100,true,'FF993300');
    tc(6,gT,true,'FF002060');

    allObras.forEach((obra,i)=>{
      const cH=obraColStart+i*2; const cP=cH+1;
      const oH=grandObraH[obra.id]||{n:0,e:0};
      const oT=Math.round((oH.n+oH.e)*100)/100;
      const pct=gT>0?Math.round(oT/gT*1000)/10:0;
      tc(cH,oT>0?oT:null,true,'FF1D4ED8');
      const pcell=wsFecho.getCell(totRow,cP);
      pcell.value=oT>0?pct:null;
      pcell.font=exFont(true,10,'FF1D4ED8');
      pcell.alignment=exAlign('center','middle');
      pcell.fill=exFill('FFE8F0FE'); pcell.border=bTot;
      if(oT>0) pcell.numFmt='0.0"%"';
    });
    wsFecho.getRow(totRow).height=22;
  } catch(eFecho) { console.warn('Folha de Fecho erro:', eFecho); }
  // ── FIM FOLHA DE FECHO ──────────────────────────────────────────────────────

  // Write and download
  showToast('A gerar ficheiro...');
  const buffer=await workbook.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url;
  a.download=`Plandese_Folha_Ponto_${mesNome}_${ano}.xlsx`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Folha mensal gerada: ${mesNome} ${ano} ✓`);
}

function exportHistSemana(){
  const d=window._histExportData;if(!d)return;
  const {obraMap,days,dStrs,dayNames,semLabel}=d;
  const wb=XLSX.utils.book_new();

  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=OBRAS.find(o=>o.id===obraId)?.nome||'Sem obra';
    const obraData=obraMap[obraId];
    const wd=[
      ['PLANDESE, SA — Folha de Ponto Semanal'],
      [`Obra nº: ${obraNome}`],
      [`Semana: ${semLabel}`],
      [`Exportado em: ${new Date().toLocaleString('pt-PT')}`],
      [],
      ['Nº','Nome','Função',...dayNames.flatMap(d=>[d+' H.Nor.',d+' H.Ext.',d+' Total']),'H.Normais','H.Extra','Total']
    ];
    let totN=0,totE=0,totT=0;
    Object.keys(obraData).sort().forEach(nStr=>{
      const n=parseInt(nStr),c=COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      const dc=obraData[n].flatMap((r,i)=>{
        if(!r)return['','',''];
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);
        rN+=h.n;rE+=h.e;rT+=h.t;
        if(r.tipo?.includes('Falta'))return[r.tipo,'',''];
        if(r.tipo==='Folga')return['Folga','',''];
        return[h.n||'',h.e||'',h.t||''];
      });
      totN+=rN;totE+=rE;totT+=rT;
      wd.push([n,c.nome,c.func,...dc,rN||'',rE||'',rT||'']);
    });
    wd.push([]);
    wd.push(['','','TOTAIS',...Array(18).fill(''),'',totN,totE,totT]);
    const ws=XLSX.utils.aoa_to_sheet(wd);
    ws['!cols']=[{wch:6},{wch:22},{wch:14},...Array(18).fill({wch:10}),{wch:10},{wch:10},{wch:10}];
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:21}},{s:{r:1,c:0},e:{r:1,c:21}},{s:{r:2,c:0},e:{r:2,c:21}},{s:{r:3,c:0},e:{r:3,c:21}}];
    XLSX.utils.book_append_sheet(wb,ws,obraNome.slice(0,31));
  });
  const [d1,d2]=semLabel.split(' a ');
  XLSX.writeFile(wb,`Plandese_Semana_${semLabel.replace(/\//g,'').replace(/\s/g,'').replace(/a/g,'_')}.xlsx`);
}

// ═══════════════════════════════════════
//  ADMIN — FECHO SEMANAL
// ═══════════════════════════════════════
async function loadWeek(){
  const ds=document.getElementById('sw-data').value;if(!ds){alert('Selecione uma data.');return;}
  const ref=new Date(ds+'T12:00:00'),mon=getMonday(ref);
  const days=[];for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(d.getDate()+i);days.push(d);}
  const dStrs=days.map(fmt);
  const obraFilter=document.getElementById('sw-obra').value;
  const semLabel=`${fmtPT(dStrs[0])} — ${fmtPT(dStrs[6])}`;
  const cont=document.getElementById('week-content');
  cont.innerHTML='<div style="text-align:center;color:var(--gray-400);padding:32px">A carregar semana...</div>';
  // Carregar da BD
  let query=sb.from('registos_ponto').select('*').in('data',dStrs);
  if(obraFilter)query=query.eq('obra_id',obraFilter);
  const {data:regs}=await query;
  // Agrupar
  const obraMap={};
  (regs||[]).forEach(r=>{
    const obraId=r.obra_id||'_sem';
    if(obraFilter&&obraId!==obraFilter)return;
    const i=dStrs.indexOf(r.data);if(i<0)return;
    if(!obraMap[obraId])obraMap[obraId]={};
    if(!obraMap[obraId][r.colab_numero])obraMap[obraId][r.colab_numero]=Array(7).fill(null);
    obraMap[obraId][r.colab_numero][i]=r;
  });
  cont.innerHTML='';
  if(!Object.keys(obraMap).length){cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px">Sem registos para esta semana.</div>';return;}
  const wi=document.createElement('div');wi.className='card';wi.style.cssText='margin-bottom:16px;background:var(--blue-50);border-color:var(--blue-100)';
  wi.innerHTML=`<div style="font-size:13px;color:var(--blue-600)">📅 Semana: <strong>${semLabel}</strong></div>`;cont.appendChild(wi);
  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=OBRAS.find(o=>o.id===obraId)?.nome||obraId;
    const obraData=obraMap[obraId];
    const hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px;flex-wrap:wrap;gap:8px';
    hdr.innerHTML=`<span style="font-size:14px;font-weight:600;color:var(--gray-700)">${obraNome}</span>`;
    const expBtn=document.createElement('button');expBtn.className='btn btn-green btn-sm';
    expBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Excel`;
    expBtn.onclick=()=>exportSemanaExcel(obraNome,obraData,days,semLabel);
    hdr.appendChild(expBtn);cont.appendChild(hdr);
    const card=document.createElement('div');card.className='card';card.style.cssText='padding:0;overflow:hidden;margin-bottom:4px';
    const wrap=document.createElement('div');wrap.className='tbl-wrap';const tbl=document.createElement('table');
    const dHdr=days.map((d,i)=>`<th>${dayShort(d)}<br><span style="font-weight:400;font-size:10px">${fmtPT(dStrs[i])}</span></th>`).join('');
    tbl.innerHTML=`<thead><tr><th>Nº</th><th>Colaborador</th><th>Função</th>${dHdr}<th>H.N.</th><th>H.E.</th><th>Total</th></tr></thead>`;
    let tbody='<tbody>',otN=0,otE=0,otT=0;
    Object.keys(obraData).forEach(nStr=>{
      const n=parseInt(nStr),c=COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      const dCells=obraData[n].map((r,i)=>{
        if(!r)return`<td style="color:var(--gray-200);text-align:center">—</td>`;
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);rN+=h.n;rE+=h.e;rT+=h.t;
        if(r.tipo?.includes('Falta'))return`<td style="text-align:center"><span class="badge b-red" style="font-size:10px">${r.tipo}</span></td>`;
        if(r.tipo==='Folga')return`<td style="text-align:center"><span class="badge b-yellow" style="font-size:10px">Folga</span></td>`;
        return`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px">${h.t>0?fmtH(h.t):'—'}</td>`;
      }).join('');
      otN+=rN;otE+=rE;otT+=rT;
      tbody+=`<tr><td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-400)">${n}</td><td style="font-weight:500;font-size:13px">${c.nome}</td><td style="font-size:11px;color:var(--gray-500)">${c.func}</td>${dCells}<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:600">${fmtH(rN)}</td><td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:600">${fmtH(rE)}</td><td style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700">${fmtH(rT)}</td></tr>`;
    });
    tbody+=`<tr style="background:var(--gray-50);border-top:2px solid var(--gray-200)"><td colspan="3" style="font-weight:600;font-size:12px;padding:9px 12px">Total</td>${days.map(()=>'<td></td>').join('')}<td style="font-family:'DM Mono',monospace;color:var(--green);font-weight:700">${fmtH(otN)}</td><td style="font-family:'DM Mono',monospace;color:var(--orange);font-weight:700">${fmtH(otE)}</td><td style="font-family:'DM Mono',monospace;color:var(--blue-600);font-weight:700">${fmtH(otT)}</td></tr></tbody>`;
    tbl.innerHTML+=tbody;wrap.appendChild(tbl);card.appendChild(wrap);cont.appendChild(card);
  });
}

function exportSemanaExcel(obraNome,obraData,days,semLabel){
  const wb=XLSX.utils.book_new();
  const dNames=days.map(d=>d.toLocaleDateString('pt-PT',{weekday:'long'})+' '+fmtPT(fmt(d)));
  const wd=[['PLANDESE, SA — Folha de Ponto Semanal'],[`Obra: ${obraNome}`],[`Semana: ${semLabel}`],[`Exportado: ${new Date().toLocaleString('pt-PT')}`],[],['Nº','Colaborador','Função',...dNames,'H.Normais','H.Extra','Total']];
  let totN=0,totE=0,totT=0;
  Object.keys(obraData).forEach(nStr=>{
    const n=parseInt(nStr),c=COLABORADORES.find(x=>x.n===n);if(!c)return;
    let rN=0,rE=0,rT=0;
    const dc=obraData[n].map((r,i)=>{if(!r)return'';const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);rN+=h.n;rE+=h.e;rT+=h.t;if(r.tipo?.includes('Falta'))return r.tipo;if(r.tipo==='Folga')return'Folga';return h.t>0?fmtH(h.t):'';});
    totN+=rN;totE+=rE;totT+=rT;
    wd.push([n,c.nome,c.func,...dc,rN||'',rE||'',rT||'']);
  });
  wd.push([]);wd.push(['','','TOTAIS',...Array(7).fill(''),totN,totE,totT]);
  const ws=XLSX.utils.aoa_to_sheet(wd);
  ws['!cols']=[{wch:6},{wch:22},{wch:16},...Array(7).fill({wch:16}),{wch:12},{wch:10},{wch:12}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}},{s:{r:2,c:0},e:{r:2,c:11}},{s:{r:3,c:0},e:{r:3,c:11}}];
  XLSX.utils.book_append_sheet(wb,ws,obraNome.slice(0,31));
  XLSX.writeFile(wb,`Plandese_${obraNome.replace(/\s/g,'_')}_${semLabel.replace(/\//g,'').replace(/\s/g,'').replace(/—/g,'_')}.xlsx`);
}

// ═══════════════════════════════════════
//  ADMIN — OBRAS
// ═══════════════════════════════════════
function renderObras(){
  const cont=document.getElementById('obras-list');cont.innerHTML='';
  if(!OBRAS.length){cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px">Nenhuma obra criada. Clique em "Nova obra".</div>';document.getElementById('nb-obras').textContent=0;return;}
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px';
  OBRAS.forEach(o=>{const card=document.createElement('div');card.className='card';card.style.padding='16px';card.innerHTML=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="display:flex;align-items:center;gap:10px;flex:1"><div style="width:10px;height:10px;border-radius:50%;background:${o.ativa?'var(--green)':'var(--gray-300)'};flex-shrink:0;margin-top:3px"></div><div><div style="font-weight:600;font-size:14px">${o.nome}</div>${o.local?`<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${o.local}</div>`:''}</div></div><div style="display:flex;gap:4px;flex-shrink:0"><button class="btn btn-secondary btn-sm" onclick="editObra('${o.id}')">Editar</button><button class="btn btn-sm" style="background:${o.ativa?'var(--yellow-bg)':'var(--green-bg)'};color:${o.ativa?'var(--yellow)':'var(--green)'};border:1px solid ${o.ativa?'#FDE68A':'var(--green-light)'}" onclick="toggleObra('${o.id}')">${o.ativa?'Desativar':'Ativar'}</button></div></div>`;grid.appendChild(card);});
  cont.appendChild(grid);document.getElementById('nb-obras').textContent=OBRAS.filter(o=>o.ativa).length;
}
function editObra(id){const o=OBRAS.find(x=>x.id===id);if(!o)return;document.getElementById('mo-title').textContent='Editar obra';document.getElementById('mo-id').value=id;document.getElementById('mo-nome').value=o.nome;document.getElementById('mo-local').value=o.local||'';document.getElementById('mo-desc').value=o.desc||'';document.getElementById('modal-obra').classList.add('open');}
async function saveObra(){
  const nome=document.getElementById('mo-nome').value.trim();if(!nome){alert('Nome obrigatório.');return;}
  const id=document.getElementById('mo-id').value||('obra_'+Date.now());
  const existing=OBRAS.findIndex(o=>o.id===id);
  const rec={id,nome,local:document.getElementById('mo-local').value.trim(),desc:document.getElementById('mo-desc').value.trim(),ativa:true};
  // Guardar no Supabase PRIMEIRO e aguardar confirmação
  try {
    const {error} = await sb.from('obras').upsert({
      id:rec.id, nome:rec.nome, local:rec.local||null, descricao:rec.desc||null, ativa:true
    });
    if(error) throw error;
    // Só atualiza o estado local após confirmação do Supabase
    if(existing>=0)OBRAS[existing]={...OBRAS[existing],...rec};else OBRAS.push(rec);
    closeModal('modal-obra');renderObras();populateFilterSelects();flashAlert('obra-alert');
  } catch(e){
    alert('Erro ao guardar obra: '+e.message+'\nVerifique a ligação ao Supabase.');
  }
}
async function toggleObra(id){
  const o=OBRAS.find(x=>x.id===id);if(!o)return;
  o.ativa=!o.ativa;
  await sbToggleObra(id,o.ativa);
  renderObras();populateFilterSelects();
}

// ═══════════════════════════════════════
//  ADMIN — COLABORADORES
// ═══════════════════════════════════════
function renderColabs(){
  const tbody=document.getElementById('colab-tbody');tbody.innerHTML='';
  const ativos=COLABORADORES.filter(c=>c.ativo).length;
  document.getElementById('nb-colab').textContent=ativos;
  document.getElementById('colab-count-sub').textContent=`${COLABORADORES.length} colaboradores (${ativos} ativos)`;
  [...COLABORADORES].sort((a,b)=>a.n-b.n).forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-400);font-weight:600">${c.n}</td><td style="font-weight:500">${c.nome}</td><td><span class="badge b-gray">${c.func}</span></td><td><span class="badge ${c.ativo?'b-green':'b-gray'}">${c.ativo?'Ativo':'Inativo'}</span></td><td><div style="display:flex;gap:4px"><button class="btn btn-secondary btn-sm" onclick="editColab(${c.n})">Editar</button><button class="btn btn-sm" style="background:${c.ativo?'var(--yellow-bg)':'var(--green-bg)'};color:${c.ativo?'var(--yellow)':'var(--green)'};border:1px solid ${c.ativo?'#FDE68A':'var(--green-light)'}" onclick="toggleColab(${c.n})">${c.ativo?'Desativar':'Ativar'}</button></div></td>`;tbody.appendChild(tr);});
}
function editColab(n){const c=COLABORADORES.find(x=>x.n===n);if(!c)return;document.getElementById('mc-title').textContent='Editar colaborador';document.getElementById('mc-id').value=n;document.getElementById('mc-num').value=c.n;document.getElementById('mc-nome').value=c.nome;document.getElementById('mc-func').value=c.func;document.getElementById('modal-colab').classList.add('open');}
async function saveColab(){
  const num=parseInt(document.getElementById('mc-num').value);
  const nome=document.getElementById('mc-nome').value.trim();
  const func=document.getElementById('mc-func').value;
  const idEdit=parseInt(document.getElementById('mc-id').value)||0;
  if(!num||!nome){alert('Nº e nome obrigatórios.');return;}
  if(!idEdit&&COLABORADORES.find(c=>c.n===num)){alert('Nº já existe.');return;}
  if(idEdit){const idx=COLABORADORES.findIndex(c=>c.n===idEdit);if(idx>=0){COLABORADORES[idx].n=num;COLABORADORES[idx].nome=nome;COLABORADORES[idx].func=func;}}
  else COLABORADORES.push({n:num,nome,func,ativo:true});
  await sbSaveColab({n:num,nome,func,ativo:true});
  closeModal('modal-colab');renderColabs();flashAlert('colab-alert');
}
async function toggleColab(n){
  const c=COLABORADORES.find(x=>x.n===n);if(!c)return;
  c.ativo=!c.ativo;
  await sbToggleColab(n,c.ativo);
  renderColabs();
}

// ═══════════════════════════════════════
//  ADMIN — UTILIZADORES
// ═══════════════════════════════════════
function renderUsers(){
  const ROLE_BADGE={admin:'b-blue',diretor_obra:'b-blue',compras:'b-orange',financeiro:'b-green',comercial:'b-gray',encarregado:'b-gray'};
  const tbody=document.getElementById('user-tbody');
  tbody.innerHTML='';
  Object.keys(USERS).forEach(key=>{
    const u=USERS[key];
    const roleLbl=ROLE_LABELS[u.role]||u.role;
    const badgeCls=ROLE_BADGE[u.role]||'b-gray';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-500)">${key}</td><td style="font-weight:500">${u.nome}</td><td><span class="badge ${badgeCls}">${roleLbl}</span></td><td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-400)">${u.pass}</td><td><span class="badge b-green">Ativo</span></td><td><button class="btn btn-secondary btn-sm" onclick="editUser('${key}')">Editar</button></td>`;
    tbody.appendChild(tr);
  });
}
function editUser(key){const u=USERS[key];if(!u)return;document.getElementById('mu-title').textContent='Editar utilizador';document.getElementById('mu-key').value=key;document.getElementById('mu-nome').value=u.nome;document.getElementById('mu-user').value=key;document.getElementById('mu-pass').value=u.pass;document.getElementById('mu-role').value=u.role;document.getElementById('modal-user').classList.add('open');}
async function saveUser(){
  const nome=document.getElementById('mu-nome').value.trim();
  const user=document.getElementById('mu-user').value.trim().toLowerCase().replace(/\s/g,'.');
  const pass=document.getElementById('mu-pass').value.trim();
  const role=document.getElementById('mu-role').value;
  const editKey=document.getElementById('mu-key').value;
  if(!nome||!user||!pass){alert('Preencha todos os campos.');return;}
  const initials=nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  if(editKey&&editKey!==user)delete USERS[editKey];
  USERS[user]={pass,nome,initials,role};
  await sbSaveUser(user,{pass,nome,initials,role});
  closeModal('modal-user');renderUsers();flashAlert('user-alert');
}

// ═══════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════
function openModal(id){
  if(id==='modal-obra'){document.getElementById('mo-title').textContent='Nova obra';['mo-id','mo-nome','mo-local','mo-desc'].forEach(i=>document.getElementById(i).value='');}
  if(id==='modal-colab'){document.getElementById('mc-title').textContent='Novo colaborador';['mc-id','mc-num','mc-nome'].forEach(i=>document.getElementById(i).value='');document.getElementById('mc-func').value='Encarregado';}
  if(id==='modal-user'){document.getElementById('mu-title').textContent='Novo utilizador';['mu-key','mu-nome','mu-user','mu-pass'].forEach(i=>document.getElementById(i).value='');document.getElementById('mu-role').value='encarregado';}
  if(id==='modal-empresa-moa'){document.getElementById('memoa-title').textContent='Nova Empresa MOA';['memoa-id','memoa-nome','memoa-nif','memoa-contacto'].forEach(i=>document.getElementById(i).value='');}
  document.getElementById(id).classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(mb=>mb.addEventListener('click',e=>{if(e.target===mb)mb.classList.remove('open');}));
function goTo(id,btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  // Find the sidebar nav-btn that points to this id (when called from bottom-nav, btn is bnav)
  const sideBtn = document.querySelector('.sidebar .nav-btn[onclick*="\'' + id + '\'"]');
  if(sideBtn) sideBtn.classList.add('active');
  if(btn) btn.classList.add('active');
  // Sync bottom nav
  const bnav=document.querySelector('#bottom-nav .bnav-btn[onclick*="\'' + id + '\'"]');
  if(bnav)bnav.classList.add('active');
  // Open the parent group of the active sidebar button
  syncNavGroups();
  if(id==='historico')applyFilter();
  if(id==='empresas-moa')renderEmpresasMOA();
}

// ── Botão Actualizar: recarrega dados sem sair da secção actual ──
async function refreshPortal(){
  const btn = document.getElementById('btn-refresh');
  if(btn){ btn.disabled=true; btn.classList.add('refreshing'); }
  try {
    await carregarDados();
    // Re-renderiza a secção actualmente activa
    const activeSection = document.querySelector('.section.active');
    if(activeSection){
      const id = activeSection.id.replace(/^sec-/,'');
      const renderMap = {
        'painel': ()=>renderPainel(),
        'historico': ()=>applyFilter(),
        'empresas-moa': ()=>renderEmpresasMOA(),
        'obras': ()=>renderObras(),
        'colaboradores': ()=>renderColabs(),
        'utilizadores': ()=>renderUsers(),
        'faturas': ()=>renderFaturas(),
        'compras': ()=>renderCompras(),
        'equipamentos': ()=>renderEquipamentos(),
        'combustivel': ()=>loadCombustivelAdmin(),
        'producao': ()=>renderProdDashboard(),
        'prevfat': ()=>renderPrevFat(),
        'autos': ()=>renderAutos(),
        'custos': ()=>renderCustos(),
        'comercial': ()=>renderComercial(),
        'permissoes': ()=>renderPermMatrix(),
        'fecho-mes': ()=>renderFechoMes(),
      };
      if(renderMap[id]) renderMap[id]();
    }
    mostrarDiag('✓ Dados actualizados','#15803D');
  } catch(e){
    mostrarDiag('❌ Erro ao actualizar: '+e.message,'#B91C1C');
  } finally {
    if(btn){ btn.disabled=false; btn.classList.remove('refreshing'); }
  }
}

function toggleNavGrp(key){
  const lbl = document.querySelector('.nav-lbl[data-grp="'+key+'"]');
  const grp = document.querySelector('.nav-group[data-grp="'+key+'"]');
  if(!lbl||!grp) return;
  const open = grp.classList.toggle('open');
  lbl.classList.toggle('open', open);
}
function syncNavGroups(){
  document.querySelectorAll('.sidebar .nav-group').forEach(grp=>{
    const key = grp.getAttribute('data-grp');
    const lbl = document.querySelector('.nav-lbl[data-grp="'+key+'"]');
    const hasActive = !!grp.querySelector('.nav-btn.active');
    if(hasActive){
      grp.classList.add('open');
      if(lbl){ lbl.classList.add('open'); lbl.classList.add('has-active'); }
    } else {
      if(lbl) lbl.classList.remove('has-active');
    }
  });
}
// On first load: menu starts collapsed; only the active group is open
document.addEventListener('DOMContentLoaded',()=>{
  syncNavGroups();

  // Hover-to-open: each nav-lbl + nav-group pair opens on hover and closes on mouse-leave
  document.querySelectorAll('.sidebar .nav-lbl').forEach(lbl=>{
    const key=lbl.getAttribute('data-grp');
    const grp=document.querySelector('.nav-group[data-grp="'+key+'"]');
    if(!grp) return;
    let timer;
    const openGrp=()=>{
      clearTimeout(timer);
      grp.classList.add('open');
      lbl.classList.add('open');
    };
    const scheduleClose=()=>{
      timer=setTimeout(()=>{
        // keep open if this group contains the active button
        if(grp.querySelector('.nav-btn.active')) return;
        grp.classList.remove('open');
        lbl.classList.remove('open');
      },150);
    };
    lbl.addEventListener('mouseenter',openGrp);
    lbl.addEventListener('mouseleave',scheduleClose);
    grp.addEventListener('mouseenter',()=>clearTimeout(timer));
    grp.addEventListener('mouseleave',scheduleClose);
  });
});
function flashAlert(id){const el=document.getElementById(id);if(!el)return;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000);}

// ═══════════════════════════════════════════════════════════════════
//  MÓDULO FATURAS  (apenas perfil 'admin')
//  ───────────────────────────────────────────────────────────────────
//  Pipeline de extração 100% client-side (sem backend):
//    PDFs com texto       → PDF.js (extrai texto direto)
//    PDFs digitalizados   → PDF.js renderiza páginas → Tesseract.js OCR
//    Imagens (jpg/png)    → Tesseract.js OCR (por+eng)
//    Parsing dos campos   → regex específicas para faturas portuguesas
//
//  Em produção pode-se substituir por API mais precisa:
//    Azure Document Intelligence (prebuilt-invoice) | AWS Textract
//    AnalyzeExpense | Google Document AI | Mindee Invoice OCR.
// ═══════════════════════════════════════════════════════════════════

let FATURAS = [];          // [{id, fornecedor, nif, base, iva, total, data, dataPag, status, confianca, ficheiro, paginas, notas, criadoEm, _flags}]
let FAT_QUEUE = [];        // [{id, name, size, status: 'pending'|'processing'|'done'|'error', progress, error?}]
let _fatSeq = 0;

// (sem dados de demonstração — extração real do ficheiro carregado)
function seedFaturasDemo(){ /* no-op */ }

// ═══════════════════════════════════════
//  VALIDAÇÕES (boas práticas — checksums e coerência)
// ═══════════════════════════════════════
function validaNIF(nif){
  if(!nif) return false;
  const s = String(nif).replace(/\D/g,'');
  if(s.length!==9) return false;
  // Primeiro dígito tem de ser válido para PT
  if(!'12356789'.includes(s[0])) return false;
  let total=0;
  for(let i=0;i<8;i++) total += parseInt(s[i],10)*(9-i);
  let check = 11 - (total%11);
  if(check>=10) check = 0;
  return check === parseInt(s[8],10);
}
function coerenciaTotais(base, iva, total){
  if(base==null||iva==null||total==null) return true;
  return Math.abs((base+iva) - total) < 0.05;
}
function statusBadge(s){
  switch(s){
    case 'extraida': return '<span class="badge b-blue">Extraída</span>';
    case 'rever':    return '<span class="badge b-yellow">A rever</span>';
    case 'validada': return '<span class="badge b-green">Validada</span>';
    case 'paga':     return '<span class="badge b-gray">Paga</span>';
    default: return '<span class="badge b-gray">—</span>';
  }
}
function confBadge(c){
  if(c>=0.9) return `<span class="fat-conf high">${Math.round(c*100)}%</span>`;
  if(c>=0.75) return `<span class="fat-conf med">${Math.round(c*100)}%</span>`;
  return `<span class="fat-conf low">${Math.round(c*100)}%</span>`;
}
function eur(v){ if(v==null||isNaN(v)) return '—'; return Number(v).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }

// ═══════════════════════════════════════
//  UPLOAD + OCR SIMULADO
// ═══════════════════════════════════════
function handleFatFiles(fileList){
  const files = Array.from(fileList||[]);
  if(files.length===0) return;
  const MAX = 10*1024*1024;
  files.forEach(f=>{
    if(f.size>MAX){ showToast(`${f.name}: excede 10 MB`); return; }
    const ok = /\.(pdf|jpe?g|png)$/i.test(f.name);
    if(!ok){ showToast(`${f.name}: formato não suportado`); return; }
    const id = ++_fatSeq;
    const item = {id, name:f.name, size:f.size, status:'pending', progress:0, _file:f};
    FAT_QUEUE.push(item);
    renderQueue();
    // Inicia processamento simulado
    setTimeout(()=>processQueueItem(item), 200);
  });
  document.getElementById('fat-input').value='';
}

// ═══════════════════════════════════════
//  PROCESSAMENTO REAL: PDF.js (PDF) + Tesseract.js (imagens / PDFs digitalizados)
// ═══════════════════════════════════════
async function processQueueItem(item){
  item.status='processing'; item.progress=2; renderQueue();
  try{
    const isPDF = /\.pdf$/i.test(item.name) || item._file.type==='application/pdf';
    const isImg = /\.(jpe?g|png)$/i.test(item.name);
    let texto = '';

    if(isPDF){
      texto = await extractTextFromPDF(item);
      // Recorre a OCR se: (a) texto vazio, (b) texto curto, (c) texto "lixo" — fontes com glifos
      // personalizados que o PDF.js não consegue mapear para Unicode (caracteres fora do alfabeto PT/EN)
      const precisaOCR = !texto
        || texto.replace(/\s/g,'').length < 30
        || textoPareceLixo(texto);
      if(precisaOCR){
        showToast(`${item.name}: PDF com fontes não-padrão, a executar OCR…`);
        texto = await ocrPDFPagesToText(item);
      }
    } else if(isImg){
      texto = await ocrImageToText(item);
    } else {
      throw new Error('Formato não suportado');
    }

    if(!texto || texto.trim().length<10){
      throw new Error('Não foi possível extrair texto do ficheiro');
    }

    item.progress = 92; renderQueue();
    const fat = extractInvoiceFields(texto, item);
    FATURAS.push(fat);

    item.status='done'; item.progress=100; renderQueue();
    renderFaturas(); atualizaKPIs();
    const detetados = countCamposDetetados(fat);
    showToast(`${item.name}: ${detetados}/5 campos detetados`);
    setTimeout(()=>{ FAT_QUEUE = FAT_QUEUE.filter(q=>q.id!==item.id); renderQueue(); }, 4000);
  } catch(e){
    console.error('Erro processamento fatura:', e);
    item.status='error'; item.error = e.message || 'Erro ao processar';
    renderQueue();
    showToast(`Falha ao processar ${item.name}: ${item.error}`);
  }
}

// Deteta se o texto extraído é "lixo" — PDFs com fontes embutidas com encoding personalizado
// que o PDF.js não consegue mapear para Unicode devolvem caracteres no bloco Latin-1 Supplement
// (¡¢£¤¥¦§¨©ª…) ou Private Use Area, em vez das letras reais. Se a percentagem de "letras
// reconhecíveis PT/EN" for baixa, é melhor recorrer a OCR.
function textoPareceLixo(texto){
  const limpo = texto.replace(/\s/g,'');
  if(limpo.length < 50) return false;
  // Heurística 1: ratio global de letras reais < 75% → suspeito
  const letrasReais = (limpo.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g)||[]).length;
  const ratioGlobal = letrasReais / limpo.length;
  if(ratioGlobal < 0.75) return true;
  // Heurística 2: sequência consecutiva longa (>=15 chars) de símbolos Latin-1
  // (U+00A1–U+00BF e U+02XX) — sintoma típico de fonte com encoding personalizado
  // que o PDF.js não consegue mapear. Mesmo que o resto do texto esteja OK,
  // queremos OCR para extrair o cabeçalho/caixa de totais que vêm corrompidos.
  if(/[¡-¿ʰ-˿]{15,}/.test(texto)) return true;
  return false;
}

// Extrai texto direto de um PDF (sem OCR — para PDFs com texto)
async function extractTextFromPDF(item){
  if(!window.pdfjsLib) throw new Error('PDF.js indisponível');
  const buf = await item._file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  let txt = '';
  for(let i=1;i<=pdf.numPages;i++){
    item.progress = Math.round(((i-1)/pdf.numPages)*70)+5; renderQueue();
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruir linhas (item.str já vem em ordem de leitura)
    let lastY = null, line = '';
    const lines = [];
    content.items.forEach(it=>{
      const y = it.transform[5];
      if(lastY!==null && Math.abs(y-lastY)>2){ lines.push(line.trim()); line=''; }
      line += it.str + ' ';
      lastY = y;
    });
    if(line.trim()) lines.push(line.trim());
    txt += lines.join('\n') + '\n--PAGE--\n';
  }
  return txt;
}

// OCR de imagem (jpg/png) com Tesseract
async function ocrImageToText(item){
  if(!window.Tesseract) throw new Error('Tesseract.js indisponível');
  const url = URL.createObjectURL(item._file);
  try{
    const { data } = await Tesseract.recognize(url, 'por+eng', {
      logger: m => {
        if(m.status==='recognizing text'){
          item.progress = Math.round(m.progress*80)+10; renderQueue();
        } else if(m.status==='loading language traineddata' || m.status==='initializing api'){
          item.progress = Math.max(item.progress, 8); renderQueue();
        }
      }
    });
    return data.text;
  } finally { URL.revokeObjectURL(url); }
}

// PDF digitalizado: renderiza páginas em canvas e corre OCR em cada
async function ocrPDFPagesToText(item){
  if(!window.pdfjsLib || !window.Tesseract) throw new Error('Bibliotecas OCR indisponíveis');
  const buf = await item._file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  let texto = '';
  for(let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({scale:2.0});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext:ctx, viewport}).promise;
    const blob = await new Promise(r=>canvas.toBlob(r,'image/png'));
    const url = URL.createObjectURL(blob);
    try{
      const { data } = await Tesseract.recognize(url, 'por+eng', {
        logger: m => {
          if(m.status==='recognizing text'){
            const base = ((i-1)/pdf.numPages)*80;
            const dentro = (m.progress*80)/pdf.numPages;
            item.progress = Math.round(base+dentro)+5; renderQueue();
          }
        }
      });
      texto += data.text + '\n--PAGE--\n';
    } finally { URL.revokeObjectURL(url); }
  }
  return texto;
}

// ═══════════════════════════════════════
//  EXTRAÇÃO DE CAMPOS — regex específicas para faturas PT
// ═══════════════════════════════════════
function extractInvoiceFields(texto, item){
  const t = texto.replace(/ /g,' ').replace(/[ \t]+/g,' ');
  // NIF: tag explícita primeiro, depois fallback para qualquer 9 dígitos válido
  let nif = '';
  const nifTag = t.match(/(?:NIF|NIPC|N[ºo°.]?\s*Cont(?:ribuinte|\.?(?:\s*PT)?)|Contribuinte|VAT)[\s:.\-Nº°#PT]*([12356789]\d{8})/i);
  if(nifTag) nif = nifTag[1];
  else {
    const candidatos = [...t.matchAll(/\b([12356789]\d{8})\b/g)].map(m=>m[1]).filter(validaNIF);
    if(candidatos.length) nif = candidatos[0];
  }

  // Padrão para um número de fatura típico: "1 107.00", "1.107,00", "900.00", "207,00"
  // (1 dígito, depois até 15 chars [dígitos/espaços/pontos/vírgulas], depois separador decimal e 2 dígitos)
  const NUM_REGEX = '(\\d[\\d\\s.,]{0,15}[.,]\\d{2})';

  // Total — várias variantes em PT
  const total = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:a\\s*pagar|geral|c[\\/\\.]?\\s*IVA|com\\s*IVA|fatura|factura|documento|do\\s*documento)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Valor\\s*(?:total|a\\s*pagar)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*TOTAL[^\\d\\n]*?'+NUM_REGEX, 'm'),
  ]));
  // IVA — preferimos "Total IVA" para evitar apanhar células de tabela com 0,00
  const iva = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*IVA[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*IVA(?:\\s*\\(?\\d+\\s*%\\)?)?[^\\d\\n]+?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Imposto[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  // Base / sub-total — inclui "Total Serviços", "Total Mercadoria", "Total Bruto"
  let base = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:Servi[çc]os|Mercadoria|Mercadorias|Bruto)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*(?:Total\\s*)?(?:Base\\s*tribut[áa]vel|Subtotal|Sub-total|Total\\s*l[íi]quido|Sem\\s*IVA|Valor\\s*l[íi]quido|Incid[êe]ncia)[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  if(base==null && total!=null && iva!=null) base = Math.round((total-iva)*100)/100;
  if(total==null && base!=null && iva!=null) {/* mantemos null */}

  // Data emissão — suporta YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  let data = '';
  const dataTag =
        t.match(/(?:Data\s*(?:de\s*)?(?:emiss[ãa]o|fatura|factura|documento)?)[\s:]*?(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i)
     || t.match(/(?:Data\s*(?:de\s*)?(?:emiss[ãa]o|fatura|factura|documento)?)[\s:]*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i)
     || t.match(/(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/)
     || t.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
  if(dataTag) data = parseData(dataTag[1] || dataTag[0]);

  // Data de pagamento / vencimento — mesmos formatos
  let dataPag = '';
  const dpTag =
        t.match(/(?:Data\s*(?:de\s*)?(?:pagamento|liquida[çc][ãa]o|vencimento)|Venc\.?)[\s:]*?(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i)
     || t.match(/(?:Data\s*(?:de\s*)?(?:pagamento|liquida[çc][ãa]o|vencimento)|Venc\.?)[\s:]*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if(dpTag) dataPag = parseData(dpTag[1]);

  // Número da fatura (FACTURA Nº 261995, FT 2026/123, etc.)
  let numero = '';
  const numTag = t.match(/(?:FACTURA|FATURA|FACT|FAT|FT|FA|FR|FS)\s*N?[ºo°.]?\s*[:.]?\s*([A-Z0-9][\w\-\/]{2,30})/i);
  if(numTag) numero = numTag[1].replace(/[.\s]+$/,'');

  // Fornecedor — heurísticas:
  // 1) linha que contém Lda / S.A. / Unipessoal
  // 2) primeira linha "longa" não numérica antes do NIF
  let fornecedor = '';
  const empresaMatch = t.match(/^[ \t]*([^\n]*?(?:\b(?:Lda\.?|LDA|S\.?\s*A\.?|S\.?A\.?|Unipessoal|SGPS|SARL|& Cia|& C\.?ª|Sociedade)\b)[^\n]*)/im);
  if(empresaMatch) fornecedor = empresaMatch[1].trim().slice(0,80);
  if(!fornecedor){
    const linhas = t.split('\n').map(l=>l.trim()).filter(l=>l.length>=4 && l.length<=80 && !/^\d+[\d.,€\s/-]*$/.test(l));
    fornecedor = (linhas[0]||'').trim();
  }
  fornecedor = fornecedor.replace(/^[•\-\*\s]+/,'').trim();

  // Confiança = proporção dos 5 campos chave detetados, ponderada pela qualidade
  const detetados = [fornecedor, nif, total, iva, data].filter(v=>v!=null && v!=='').length;
  let confianca = detetados/5;
  // Penaliza se NIF inválido ou totais incoerentes
  const _flags = [];
  if(nif && !validaNIF(nif)){ confianca -= 0.15; _flags.push('invalid_nif'); }
  if(!coerenciaTotais(base,iva,total)){ confianca -= 0.10; _flags.push('totals_mismatch'); }
  if(confianca<0) confianca=0; if(confianca>1) confianca=1;
  if(detetados<3) _flags.push('low_extraction');

  return {
    id: ++_fatSeq,
    fornecedor: fornecedor || '',
    nif,
    numero,
    base, iva, total,
    data, dataPag,
    status: confianca<0.80 ? 'rever' : 'extraida',
    confianca,
    ficheiro: item.name,
    paginas: 1,
    notas: detetados<3 ? `Apenas ${detetados}/5 campos detetados — confirme manualmente.` : '',
    criadoEm: new Date().toISOString(),
    _flags,
    _rawText: t.slice(0,4000),
  };
}

function matchValor(texto, patterns){
  for(const p of patterns){
    const m = texto.match(p);
    if(m && m[1]) return m[1];
  }
  return null;
}
function parseEuro(s){
  if(s==null) return null;
  s = String(s).replace(/[€EUR\s]/gi,'').trim();
  if(!s) return null;
  // formatos: 1.234,56 (PT) | 1,234.56 (EN) | 1234,56 | 1234.56
  if(s.includes('.') && s.includes(',')){
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
  } else if(s.includes(',')){
    s = s.replace(',','.');
  }
  const n = parseFloat(s);
  if(isNaN(n)) return null;
  return Math.round(n*100)/100;
}
function parseData(s){
  if(!s) return '';
  s = s.trim();
  // ISO direto
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY.MM.DD ou YYYY/MM/DD ou YYYY-MM-DD (ano primeiro)
  const mYMD = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if(mYMD){
    const [,y,mo,d] = mYMD;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (dia primeiro)
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if(!m) return '';
  let [,d,mo,y] = m;
  if(y.length===2) y = (parseInt(y,10)>50?'19':'20')+y;
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function countCamposDetetados(f){
  return [f.fornecedor, f.nif, f.total, f.iva, f.data].filter(v=>v!=null && v!=='').length;
}

function renderQueue(){
  const wrap = document.getElementById('fat-queue');
  if(!wrap) return;
  if(FAT_QUEUE.length===0){ wrap.innerHTML=''; return; }
  wrap.innerHTML = FAT_QUEUE.map(q=>{
    const iconCls = q.status==='processing'?'processing':(q.status==='done'?'done':(q.status==='error'?'error':''));
    const icon = q.status==='done'
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
      : q.status==='error'
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>';
    const meta = q.status==='processing' ? `A ler com OCR/IA… ${q.progress}%`
              : q.status==='done' ? 'Concluído — dados extraídos'
              : q.status==='error' ? (q.error||'Erro')
              : 'Em fila';
    const sizeKB = (q.size/1024).toFixed(0);
    return `<div class="fat-queue-item">
      <div class="fat-queue-icon ${iconCls}">${icon}</div>
      <div class="fat-queue-info">
        <div class="fat-queue-name">${q.name} <span style="color:var(--gray-400);font-weight:400">· ${sizeKB} KB</span></div>
        <div class="fat-queue-meta">${meta}</div>
        ${q.status==='processing'?`<div class="fat-queue-progress"><div class="fat-queue-bar" style="width:${q.progress}%"></div></div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════
function setupFatDropzone(){
  const dz = document.getElementById('fat-drop');
  if(!dz || dz._wired) return;
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.add('dragging');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.remove('dragging');}));
  dz.addEventListener('drop', e=>{
    const files = e.dataTransfer?.files;
    if(files && files.length) handleFatFiles(files);
  });
  dz._wired = true;
}

// ═══════════════════════════════════════
//  RENDER TABELA + KPIs
// ═══════════════════════════════════════
function filtraFaturas(){
  const q = (document.getElementById('fat-f-search')?.value||'').trim().toLowerCase();
  const st = document.getElementById('fat-f-status')?.value||'';
  const de = document.getElementById('fat-f-de')?.value||'';
  const ate = document.getElementById('fat-f-ate')?.value||'';
  return FATURAS.filter(f=>{
    if(q && !(`${f.fornecedor} ${f.nif}`.toLowerCase().includes(q))) return false;
    if(st && f.status!==st) return false;
    if(de && f.data<de) return false;
    if(ate && f.data>ate) return false;
    return true;
  }).sort((a,b)=> (b.data||'').localeCompare(a.data||''));
}
function limparFatFiltros(){
  ['fat-f-search','fat-f-status','fat-f-de','fat-f-ate'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderFaturas();
}
function renderFaturas(){
  const tb = document.getElementById('fat-tbody');
  if(!tb) return;
  const lista = filtraFaturas();
  if(lista.length===0){
    tb.innerHTML = `<tr><td colspan="10"><div class="fat-empty">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
      <div>Sem faturas. Faça upload do primeiro documento acima.</div>
    </div></td></tr>`;
    atualizaKPIs(); return;
  }
  tb.innerHTML = lista.map(f=>{
    const warn = f._flags && f._flags.length>0;
    const rowCls = warn ? 'fat-row-warn' : '';
    const nifOk = validaNIF(f.nif);
    const nifHTML = nifOk ? f.nif : `<span style="color:var(--red)">${f.nif||'—'}</span>`;
    const totaisOK = coerenciaTotais(f.base,f.iva,f.total);
    const totalHTML = totaisOK ? eur(f.total) : `<span style="color:var(--yellow);" title="Base + IVA não corresponde ao total">${eur(f.total)} ⚠</span>`;
    return `<tr class="${rowCls}">
      <td>${f.data?fmtPT(f.data):'—'}</td>
      <td><strong>${f.fornecedor||'—'}</strong>${f.ficheiro?`<div style="font-size:11px;color:var(--gray-400);margin-top:1px">${f.ficheiro}</div>`:''}</td>
      <td class="fat-nif">${nifHTML}</td>
      <td class="fat-amount">${eur(f.base)}</td>
      <td class="fat-amount">${eur(f.iva)}</td>
      <td class="fat-amount">${totalHTML}</td>
      <td>${f.dataPag?fmtPT(f.dataPag):'<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${statusBadge(f.status)}</td>
      <td>${confBadge(f.confianca||0)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="editarFatura(${f.id})">Editar</button></td>
    </tr>`;
  }).join('');
  atualizaKPIs();
}

function atualizaKPIs(){
  const hoje = new Date();
  const mes = hoje.getMonth()+1, ano = hoje.getFullYear();
  const noMes = FATURAS.filter(f=>{
    if(!f.data) return false;
    const [y,m] = f.data.split('-').map(Number);
    return y===ano && m===mes;
  });
  const sum = (arr,k)=>arr.reduce((s,f)=>s+(Number(f[k])||0),0);
  const elc=document.getElementById('kpi-fat-count'); if(elc) elc.textContent = noMes.length;
  const elcs=document.getElementById('kpi-fat-count-sub'); if(elcs) elcs.textContent = `Total na BD: ${FATURAS.length}`;
  const eln=document.getElementById('kpi-fat-net'); if(eln) eln.textContent = eur(sum(noMes,'base'));
  const eli=document.getElementById('kpi-fat-iva'); if(eli) eli.textContent = eur(sum(noMes,'iva'));
  const aRever = FATURAS.filter(f=>f.status==='rever' || (f._flags&&f._flags.length>0)).length;
  const elr=document.getElementById('kpi-fat-rev'); if(elr) elr.textContent = aRever;
  const nb = document.getElementById('nb-fat'); if(nb) nb.textContent = aRever;
}

// ═══════════════════════════════════════
//  MODAL EDITAR
// ═══════════════════════════════════════
let _editFatId = null;
function editarFatura(id){
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  _editFatId = id;
  document.getElementById('mf-id').value = id;
  document.getElementById('mf-forn').value = f.fornecedor||'';
  document.getElementById('mf-nif').value = f.nif||'';
  const elNum = document.getElementById('mf-num'); if(elNum) elNum.value = f.numero||'';
  document.getElementById('mf-data').value = f.data||'';
  document.getElementById('mf-base').value = f.base??'';
  document.getElementById('mf-iva').value = f.iva??'';
  document.getElementById('mf-total').value = f.total??'';
  document.getElementById('mf-pago').value = f.dataPag||'';
  document.getElementById('mf-status').value = f.status||'extraida';
  document.getElementById('mf-notas').value = f.notas||'';
  const elRaw = document.getElementById('mf-rawtext');
  if(elRaw) elRaw.textContent = f._rawText || '(sem texto extraído)';
  validaCamposModal();
  document.getElementById('modal-fat').classList.add('open');
  ['mf-nif','mf-base','mf-iva','mf-total'].forEach(id=>{
    const el=document.getElementById(id);
    if(el && !el._wired){ el.addEventListener('input', validaCamposModal); el._wired=true; }
  });
}
function validaCamposModal(){
  const nif = document.getElementById('mf-nif').value;
  const base = parseFloat(document.getElementById('mf-base').value||0);
  const iva  = parseFloat(document.getElementById('mf-iva').value||0);
  const total= parseFloat(document.getElementById('mf-total').value||0);
  document.getElementById('mf-nif-warn').innerHTML = (nif && !validaNIF(nif))
    ? `<span class="fat-warn-pill"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>NIF inválido</span>` : '';
  document.getElementById('mf-iva-warn').innerHTML = (!coerenciaTotais(base,iva,total))
    ? `<span class="fat-warn-pill"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>Base+IVA ≠ Total</span>` : '';
}
function saveFatura(){
  const id = parseInt(document.getElementById('mf-id').value,10);
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  f.fornecedor = document.getElementById('mf-forn').value.trim();
  f.nif = document.getElementById('mf-nif').value.trim();
  const elNum2 = document.getElementById('mf-num'); if(elNum2) f.numero = elNum2.value.trim();
  f.data = document.getElementById('mf-data').value;
  f.base = parseFloat(document.getElementById('mf-base').value||0);
  f.iva  = parseFloat(document.getElementById('mf-iva').value||0);
  f.total= parseFloat(document.getElementById('mf-total').value||0);
  f.dataPag = document.getElementById('mf-pago').value;
  f.status = document.getElementById('mf-status').value;
  f.notas  = document.getElementById('mf-notas').value;
  // Re-avalia flags
  f._flags = [];
  if(!validaNIF(f.nif)) f._flags.push('invalid_nif');
  if(!coerenciaTotais(f.base,f.iva,f.total)) f._flags.push('totals_mismatch');
  // Edição manual aumenta confiança
  if(f.confianca<0.99) f.confianca = Math.min(0.99, (f.confianca||0.7)+0.15);
  closeModal('modal-fat');
  renderFaturas();
  flashAlert('fat-alert');
  showToast('Fatura atualizada');
}
function apagarFatura(){
  const id = parseInt(document.getElementById('mf-id').value,10);
  if(!confirm('Apagar esta fatura?')) return;
  FATURAS = FATURAS.filter(f=>f.id!==id);
  closeModal('modal-fat');
  renderFaturas();
  showToast('Fatura apagada');
}

// ═══════════════════════════════════════
//  EXPORT EXCEL (usa XLSX já carregado)
// ═══════════════════════════════════════
function exportFaturasXLSX(){
  if(FATURAS.length===0){ showToast('Sem faturas para exportar'); return; }
  const dados = FATURAS.map(f=>({
    'Data emissão': f.data, 'Fornecedor': f.fornecedor, 'NIF': f.nif,
    'Base (€)': f.base, 'IVA (€)': f.iva, 'Total (€)': f.total,
    'Data pagamento': f.dataPag||'', 'Estado': f.status,
    'Confiança (%)': Math.round((f.confianca||0)*100), 'Ficheiro': f.ficheiro||'', 'Notas': f.notas||''
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faturas');
  XLSX.writeFile(wb, `faturas_${fmt(new Date())}.xlsx`);
}

// ═══════════════════════════════════════
//  MÓDULO COMPRAS
// ═══════════════════════════════════════
// modelo: {id, titulo, descricao, obraId, fornecedor, urgencia, estado, dataLimite,
//          notas, local, localLat, localLng, emailNotif, criadoPor, criadoNome, criadoEm}
let COMPRAS = [];
let _cmpSeq = 1;
let _cmpArtigosEdit = []; // artigos selecionados no modal corrente
let _cmpFornsEdit   = []; // fornecedores selecionados no modal corrente
let _artPickerItems = []; // itens filtrados visíveis no picker

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
  const obraNome = OBRAS.find(o=>o.id===c.obraId)?.nome || '—';
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

function renderCompras() {
  const lista = filtraCompras();
  const tbody = document.getElementById('cmp-tbody');
  const empty = document.getElementById('cmp-empty');
  if (!tbody) return;
  if (lista.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    atualizaKPIsCompras();
    return;
  }
  if (empty) empty.style.display = 'none';

  // Agrupar por obraId
  const grupos = {};
  lista.forEach(c => {
    const k = c.obraId || '__sem_obra__';
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(c);
  });
  // Ordenar: obras com nome primeiro, sem obra no fim
  const chaves = Object.keys(grupos).sort((a,b) => {
    if (a === '__sem_obra__') return 1;
    if (b === '__sem_obra__') return -1;
    const na = OBRAS.find(o=>o.id===a)?.nome||'';
    const nb2= OBRAS.find(o=>o.id===b)?.nome||'';
    return na.localeCompare(nb2, 'pt');
  });

  let html = '';
  chaves.forEach(k => {
    const obraNome = k === '__sem_obra__' ? 'Sem obra associada' : (OBRAS.find(o=>o.id===k)?.nome || k);
    const grupo = grupos[k];
    html += `<tr class="cmp-group-row"><td colspan="7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;vertical-align:middle;margin-right:5px"><path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z"/></svg>
      ${obraNome} <span style="font-weight:400;color:var(--gray-400);margin-left:6px">(${grupo.length})</span>
    </td></tr>`;
    grupo.forEach(c => {
      const autorNome = c.criadoNome || c.criadoPor || '—';
      const emailIco  = c.emailNotif
        ? `<span title="${c.emailNotif}" style="margin-left:4px;color:var(--blue-500)"><svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;vertical-align:middle"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></span>` : '';
      const mapIco    = (c.localLat && c.localLng)
        ? `<a href="https://www.openstreetmap.org/?mlat=${c.localLat}&mlon=${c.localLng}#map=16/${c.localLat}/${c.localLng}" target="_blank" title="${c.local}" style="color:var(--blue-500);display:inline-flex;align-items:center;gap:3px;font-size:11px;text-decoration:none;margin-top:2px"><svg viewBox="0 0 24 24" fill="currentColor" style="width:11px;height:11px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>Ver mapa</a>` : '';
      html += `<tr>
        <td style="max-width:220px">
          <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titulo}</strong>
          ${c.local ? `<div style="display:flex;align-items:center;gap:4px">${mapIco || `<span style="font-size:11px;color:var(--gray-400)">${c.local}</span>`}</div>` : ''}
        </td>
        <td style="color:var(--gray-600);max-width:180px">${cmpFornDisplay(c)}</td>
        <td>${urgBadge(c.urgencia)}</td>
        <td>${cmpEstadoBadge(c.estado)}${cmpWorkflowBadges(c)}</td>
        <td>${dataLimiteBadge(c.dataLimite, c.estado)}</td>
        <td style="font-size:12px;color:var(--gray-700);white-space:nowrap">${autorNome}${emailIco}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="editarCompra('${c.id}')">Editar</button></td>
      </tr>`;
    });
  });
  tbody.innerHTML = html;
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
    sel.innerHTML = prefix + OBRAS.filter(o=>o.ativa).map(o=>`<option value="${o.id}">${o.nome}</option>`).join('');
    if (val) sel.value = val;
  });
}

// ── MAPA PICKER (Leaflet + Nominatim) ───────────────────────────
let _mapaLeaflet = null;
let _mapaMarker  = null;
let _mapaCoords  = null; // {lat, lng, addr}

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
  if (!_cmpFornsEdit.includes(val)) {
    _cmpFornsEdit.push(val);
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
    : _cmpFornsEdit.map((f, i) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--blue-50);color:var(--blue-700);border:1px solid var(--blue-200);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:500">`+
        `${f}<button onclick="cmpRemoveForn(${i})" style="background:none;border:none;cursor:pointer;color:var(--blue-400);font-size:13px;line-height:1;padding:0 0 0 2px;display:inline-flex;align-items:center" title="Remover">✕</button>`+
        `</span>`
      ).join('');
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
  // Workflow checkboxes
  document.getElementById('mcmp-cotacao').checked         = c ? !!c.pedidoCotacao : false;
  document.getElementById('mcmp-aprov-do').checked        = c ? !!c.aprovadoDO    : false;
  document.getElementById('mcmp-adjud').checked           = c ? !!c.adjudicado    : false;
  document.getElementById('mcmp-data-forn').value         = c ? (c.dataFornecimento||'') : '';
  // Artigos
  _cmpArtigosEdit = c && Array.isArray(c.artigos) ? JSON.parse(JSON.stringify(c.artigos)) : [];
  document.getElementById('mcmp-cat').value = '';
  document.getElementById('mcmp-art-srch').value = '';
  cmpRenderArtPicker();
  cmpRenderArtigosSelected();
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
  const pedidoCotacao = document.getElementById('mcmp-cotacao').checked;
  const aprovadoDO    = document.getElementById('mcmp-aprov-do').checked;
  const adjudicado    = document.getElementById('mcmp-adjud').checked;
  const dataFornecimento = document.getElementById('mcmp-data-forn').value || null;
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
      criadoPor:        currentUser?.key  || '',
      criadoNome:       currentUser?.nome || '',
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

// ── Exportar Excel ────────────────────────────────────────────────
function exportComprasXLSX() {
  if (COMPRAS.length === 0) { showToast('Sem pedidos para exportar'); return; }
  const dados = COMPRAS.map(c => {
    const obraNome = OBRAS.find(o=>o.id===c.obraId)?.nome||'';
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

// ═══════════════════════════════════════
//  HOOK: integra no goTo + initAdmin
// ═══════════════════════════════════════
const _origGoTo = goTo;
goTo = function(id, btn){
  _origGoTo(id, btn);
  if(id==='faturas'){
    seedFaturasDemo();
    setupFatDropzone();
    renderFaturas();
    atualizaKPIs();
  }
  if(id==='compras'){
    populaCmpObras();
    renderCompras();
  }
};
// Atualiza badge ao iniciar
setTimeout(()=>{ try{ atualizaKPIs(); }catch(e){} }, 500);

// ═══════════════════════════════════════
//  EQUIPAMENTOS E LOGÍSTICA
// ═══════════════════════════════════════

// ── Dados (localStorage) ───────────────
let EQUIPAMENTOS  = JSON.parse(localStorage.getItem('plandese_eq')||'[]');
let EQ_MOVIMENTOS = JSON.parse(localStorage.getItem('plandese_eq_mov')||'[]');
let _eqMap = null, _eqMapMarkers = [], _editingEqId = null;
let _qrGpsLat = null, _qrGpsLng = null, _qrEquipId = null;

function saveEqLocal(){
  localStorage.setItem('plandese_eq',     JSON.stringify(EQUIPAMENTOS));
  localStorage.setItem('plandese_eq_mov', JSON.stringify(EQ_MOVIMENTOS));
}
function genEqId(){ return 'EQ' + Date.now().toString(36).toUpperCase(); }

// ── Categorias ─────────────────────────
const EQ_CATS = {
  maquina:    {label:'Máquina',    cls:'eq-cat-maquina'},
  veiculo:    {label:'Veículo',    cls:'eq-cat-veiculo'},
  ferramenta: {label:'Ferramenta', cls:'eq-cat-ferramenta'},
  outro:      {label:'Outro',      cls:'eq-cat-outro'}
};
function eqCatBadge(cat){
  const c = EQ_CATS[cat]||EQ_CATS.outro;
  return `<span class="eq-cat-badge ${c.cls}">${c.label}</span>`;
}

// ── Helpers ────────────────────────────
function eqTimeAgo(d){
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff/60000);
  if(m < 1)  return 'agora mesmo';
  if(m < 60) return `há ${m} min`;
  const h = Math.floor(m/60);
  if(h < 24) return `há ${h}h`;
  const days = Math.floor(h/24);
  if(days === 1) return 'ontem';
  if(days < 30)  return `há ${days} dias`;
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function eqFmtDt(d){
  if(!(d instanceof Date)||isNaN(d)) return '—';
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'}) +
         ' ' + d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
}
function showEqAlert(msg){
  const el = document.getElementById('eq-alert');
  if(!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 3000);
}

// ── KPIs ───────────────────────────────
function updateEqKPIs(){
  const total    = EQUIPAMENTOS.length;
  const today    = new Date(); today.setHours(0,0,0,0);
  const ago7     = new Date(Date.now() - 7*24*3600*1000);
  const monSem   = new Date(); monSem.setDate(monSem.getDate()-monSem.getDay()); monSem.setHours(0,0,0,0);
  let emObra = 0, semReg = 0;
  EQUIPAMENTOS.forEach(eq=>{
    const ul = eq.ultimoRegisto ? new Date(eq.ultimoRegisto) : null;
    if(ul && ul >= today) emObra++;
    if(!ul || ul < ago7) semReg++;
  });
  const movSem = EQ_MOVIMENTOS.filter(m=>new Date(m.criadoEm)>=monSem).length;
  document.getElementById('eq-k-total').textContent = total;
  document.getElementById('eq-k-obra').textContent  = emObra;
  document.getElementById('eq-k-sem').textContent   = semReg;
  document.getElementById('eq-k-mov').textContent   = movSem;
  const nb = document.getElementById('nb-eq');
  if(nb) nb.textContent = total;
}

// ── Tabela ─────────────────────────────
function renderEquipamentos(){
  const search = (document.getElementById('eq-f-search')||{value:''}).value.toLowerCase();
  const cat    = (document.getElementById('eq-f-cat')||{value:''}).value;
  const list   = EQUIPAMENTOS.filter(eq=>{
    const txt = (eq.nome+' '+(eq.serie||'')).toLowerCase();
    return (!search || txt.includes(search)) && (!cat || eq.categoria===cat);
  });
  const tbody  = document.getElementById('eq-tbody');
  const empty  = document.getElementById('eq-empty');
  if(!tbody) return;
  if(!list.length){ tbody.innerHTML=''; if(empty) empty.style.display=''; updateEqKPIs(); return; }
  if(empty) empty.style.display='none';
  tbody.innerHTML = list.map(eq=>{
    const ult    = eq.ultimoLocal||'—';
    const dt     = eq.ultimoRegisto ? eqFmtDt(new Date(eq.ultimoRegisto)) : '—';
    const ago    = eq.ultimoRegisto ? eqTimeAgo(new Date(eq.ultimoRegisto)) : null;
    const coords = eq.ultimoLat ? `<div style="font-size:10px;color:var(--gray-400);font-family:'DM Mono',monospace">${(+eq.ultimoLat).toFixed(5)}, ${(+eq.ultimoLng).toFixed(5)}</div>` : '';
    return `<tr>
      <td>
        <div style="font-weight:600;color:var(--gray-900)">${eq.nome}</div>
        ${eq.descricao?`<div style="font-size:11px;color:var(--gray-400);margin-top:1px">${eq.descricao}</div>`:''}
      </td>
      <td>${eqCatBadge(eq.categoria)}</td>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px">${eq.serie||'—'}</span></td>
      <td><div style="font-size:13px">${ult}</div>${coords}</td>
      <td>
        <div style="font-size:13px">${dt}</div>
        ${ago?`<div style="font-size:11px;color:var(--gray-400)">${ago}</div>`:''}
      </td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="showQrCode('${eq.id}')" title="Ver QR Code">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm-4 4h2v2h-2zm2 2h2v2h-2zm2-4h2v2h-2zm0 4h2v2h-2z"/></svg>
          QR
        </button>
        <button class="btn btn-secondary btn-sm" style="margin-left:4px" onclick="showEqHistorico('${eq.id}')" title="Histórico">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
        </button>
        <button class="btn btn-secondary btn-sm" style="margin-left:4px" onclick="editEquipamento('${eq.id}')" title="Editar">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
  updateEqKPIs();
}

// ── Mapa Leaflet ────────────────────────
function initEqMap(){
  const mapEl = document.getElementById('eq-map');
  if(!mapEl) return;
  if(_eqMap){ _eqMap.remove(); _eqMap=null; _eqMapMarkers=[]; }
  _eqMap = L.map('eq-map').setView([38.716,-9.139], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>', maxZoom:19
  }).addTo(_eqMap);
  refreshEqMap();
}
function refreshEqMap(){
  if(!_eqMap) return;
  _eqMapMarkers.forEach(m=>m.remove()); _eqMapMarkers=[];
  const withLoc = EQUIPAMENTOS.filter(eq=>eq.ultimoLat&&eq.ultimoLng);
  const mapEl   = document.getElementById('eq-map');
  const emptyEl = document.getElementById('eq-map-empty');
  if(!withLoc.length){
    if(mapEl)   mapEl.style.display  ='none';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(mapEl)   mapEl.style.display  ='';
  if(emptyEl) emptyEl.style.display='none';
  const colors={maquina:'#6D28D9',veiculo:'#1D4ED8',ferramenta:'#92400E',outro:'#6B7280'};
  const bounds=[];
  withLoc.forEach(eq=>{
    const lat=parseFloat(eq.ultimoLat), lng=parseFloat(eq.ultimoLng);
    const color=colors[eq.categoria]||'#6B7280';
    const icon=L.divIcon({className:'',
      html:`<div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
      iconSize:[28,28],iconAnchor:[14,28],popupAnchor:[0,-30]});
    const cat = EQ_CATS[eq.categoria]||EQ_CATS.outro;
    const ago = eq.ultimoRegisto ? eqTimeAgo(new Date(eq.ultimoRegisto)) : '—';
    const popup=`<div class="eq-popup-name">${eq.nome}</div>
      <div class="eq-popup-cat">${cat.label}${eq.serie?' · '+eq.serie:''}</div>
      <div class="eq-popup-loc">📍 ${eq.ultimoLocal||'Localização GPS'}</div>
      <div class="eq-popup-time">🕐 ${ago}</div>`;
    _eqMapMarkers.push(L.marker([lat,lng],{icon}).addTo(_eqMap).bindPopup(popup));
    bounds.push([lat,lng]);
  });
  if(bounds.length===1) _eqMap.setView(bounds[0],14);
  else _eqMap.fitBounds(bounds,{padding:[40,40]});
}

// ── Modal add / edit ────────────────────
function openEqModal(eq=null){
  _editingEqId=eq?eq.id:null;
  document.getElementById('meq-title').textContent=eq?'Editar equipamento':'Novo equipamento';
  document.getElementById('meq-id').value   =eq?eq.id:'';
  document.getElementById('meq-nome').value =eq?eq.nome:'';
  document.getElementById('meq-cat').value  =eq?eq.categoria:'maquina';
  document.getElementById('meq-serie').value=eq?(eq.serie||''):'';
  document.getElementById('meq-desc').value =eq?(eq.descricao||''):'';
  const d=document.getElementById('meq-del-btn'); if(d) d.style.display=eq?'':'none';
  openModal('modal-equip');
}
function editEquipamento(id){ const eq=EQUIPAMENTOS.find(e=>e.id===id); if(eq) openEqModal(eq); }
function saveEquipamento(){
  const nome=document.getElementById('meq-nome').value.trim();
  if(!nome){ showToast('Preencha o nome do equipamento'); return; }
  const id=_editingEqId||genEqId();
  const ex=_editingEqId?EQUIPAMENTOS.find(e=>e.id===_editingEqId):null;
  const obj={id,nome,
    categoria:   document.getElementById('meq-cat').value,
    serie:       document.getElementById('meq-serie').value.trim(),
    descricao:   document.getElementById('meq-desc').value.trim(),
    criadoEm:    ex?ex.criadoEm:new Date().toISOString(),
    ultimoLocal: ex?ex.ultimoLocal:null, ultimoLat:ex?ex.ultimoLat:null,
    ultimoLng:   ex?ex.ultimoLng:null,   ultimoRegisto:ex?ex.ultimoRegisto:null
  };
  if(_editingEqId){ const i=EQUIPAMENTOS.findIndex(e=>e.id===_editingEqId); if(i>=0)EQUIPAMENTOS[i]=obj; else EQUIPAMENTOS.push(obj); }
  else EQUIPAMENTOS.push(obj);
  saveEqLocal(); closeModal('modal-equip'); renderEquipamentos(); refreshEqMap();
  showEqAlert('Equipamento guardado com sucesso.');
  sbUpsertEquipamento(obj);
}
function apagarEquipamento(){
  if(!_editingEqId) return;
  if(!confirm('Apagar este equipamento e todo o seu histórico?')) return;
  const delId=_editingEqId;
  EQUIPAMENTOS  =EQUIPAMENTOS.filter(e=>e.id!==delId);
  EQ_MOVIMENTOS =EQ_MOVIMENTOS.filter(m=>m.equipId!==delId);
  saveEqLocal(); closeModal('modal-equip'); renderEquipamentos(); refreshEqMap();
  showToast('Equipamento apagado.');
  try{ sb.from('equipamentos').delete().eq('id',delId).then(()=>{}).catch(()=>{}); }catch(e){}
}

// ── QR Code display ─────────────────────
function showQrCode(id){
  const eq=EQUIPAMENTOS.find(e=>e.id===id); if(!eq){ showToast('Equipamento não encontrado'); return; }
  const qrUrl=location.href.split('?')[0]+'?reg='+id;
  document.getElementById('mqr-title').textContent=eq.nome;
  document.getElementById('mqr-sub').textContent=(EQ_CATS[eq.categoria]?.label||'Equipamento')+(eq.serie?' · '+eq.serie:'');
  document.getElementById('mqr-url').textContent=qrUrl;
  const qrDiv=document.getElementById('mqr-qrcode'); qrDiv.innerHTML='';
  if(window.QRCode){
    new QRCode(qrDiv,{text:qrUrl,width:200,height:200,colorDark:'#0a1f3d',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  } else {
    qrDiv.innerHTML=`<div style="width:200px;height:200px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:12px;text-align:center;padding:12px">Biblioteca QR não carregada</div>`;
  }
  openModal('modal-qr');
}
function printQrCode(){
  const title=document.getElementById('mqr-title').textContent;
  const sub  =document.getElementById('mqr-sub').textContent;
  const url  =document.getElementById('mqr-url').textContent;
  const qrDiv=document.getElementById('mqr-qrcode');
  const canvas=qrDiv.querySelector('canvas'); const img=qrDiv.querySelector('img');
  const imgSrc=canvas?canvas.toDataURL():(img?img.src:'');
  const w=window.open('','_blank','width=420,height=520');
  w.document.write(`<!DOCTYPE html><html><head><title>QR — ${title}</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;margin:0}
    h2{margin:0 0 4px;font-size:18px;color:#0a1f3d}p{color:#6B7280;font-size:13px;margin:0 0 18px}
    img{max-width:200px;border:1px solid #eee;padding:8px;border-radius:8px}
    .url{font-size:9px;color:#9CA3AF;word-break:break-all;margin-top:12px;font-family:monospace}
    </style></head><body><h2>${title}</h2><p>${sub}</p>
    ${imgSrc?`<img src="${imgSrc}"/>`:'<p style="color:red">QR indisponível</p>'}
    <div class="url">${url}</div></body></html>`);
  w.document.close(); w.onload=()=>{ w.print(); };
}

// ── Histórico de movimentos ─────────────
function showEqHistorico(id){
  const eq=EQUIPAMENTOS.find(e=>e.id===id); if(!eq) return;
  document.getElementById('meqh-title').textContent='Histórico — '+eq.nome;
  document.getElementById('meqh-sub').textContent=(EQ_CATS[eq.categoria]?.label||'Equipamento')+(eq.serie?' · '+eq.serie:'');
  const movs=EQ_MOVIMENTOS.filter(m=>m.equipId===id).sort((a,b)=>new Date(b.criadoEm)-new Date(a.criadoEm));
  const list=document.getElementById('meqh-list');
  if(!movs.length){
    list.innerHTML=`<div style="text-align:center;padding:28px;color:var(--gray-400);font-size:13px">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;color:var(--gray-300);display:block;margin:0 auto 8px"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
      Sem registos de movimentos ainda.</div>`;
  } else {
    list.innerHTML=movs.map((m,i)=>{
      const coords=m.lat?`<div style="font-size:10px;color:var(--gray-400);font-family:'DM Mono',monospace;margin-top:2px">${parseFloat(m.lat).toFixed(5)}, ${parseFloat(m.lng).toFixed(5)}</div>`:'';
      return `<div style="display:flex;gap:12px;padding:12px 2px;border-bottom:${i<movs.length-1?'1px solid var(--gray-100)':'none'}">
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:32px;height:32px;background:var(--blue-50);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;color:var(--blue-500)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
          ${i<movs.length-1?'<div style="width:1px;flex:1;min-height:12px;background:var(--gray-200);margin:3px 0"></div>':''}
        </div>
        <div style="flex:1;min-width:0;padding-bottom:6px">
          <div style="font-weight:600;font-size:13px;color:var(--gray-900)">${m.obraNome||m.local||'Localização registada'}</div>
          ${m.obs?`<div style="font-size:12px;color:var(--gray-500);margin-top:2px;font-style:italic">"${m.obs}"</div>`:''}
          ${coords}
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px">${eqFmtDt(new Date(m.criadoEm))}${m.encarregado?' · <strong style="color:var(--gray-600)">'+m.encarregado+'</strong>':''}</div>
        </div>
      </div>`;
    }).join('');
  }
  openModal('modal-eq-hist');
}

// ── Export XLSX ─────────────────────────
function exportEquipamentosXLSX(){
  if(!EQUIPAMENTOS.length){ showToast('Sem equipamentos para exportar'); return; }
  const dados=EQUIPAMENTOS.map(eq=>({'ID':eq.id,'Nome':eq.nome,'Categoria':EQ_CATS[eq.categoria]?.label||eq.categoria,'Nº Série':eq.serie||'','Descrição':eq.descricao||'','Última localização':eq.ultimoLocal||'','Lat':eq.ultimoLat||'','Lng':eq.ultimoLng||'','Último registo':eq.ultimoRegisto?eqFmtDt(new Date(eq.ultimoRegisto)):''}));
  const ws=XLSX.utils.json_to_sheet(dados); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Equipamentos');
  XLSX.writeFile(wb,`equipamentos_${fmt(new Date())}.xlsx`);
}

// ── Supabase sync helpers ────────────────
async function sbLoadEquipamentos(){
  try{
    const {data,error}=await sb.from('equipamentos').select('*').order('criado_em',{ascending:false});
    if(error||!data) return;
    const localMap=Object.fromEntries(EQUIPAMENTOS.map(e=>[e.id,e]));
    data.forEach(row=>{
      localMap[row.id]={
        id:row.id, nome:row.nome, categoria:row.categoria||'outro',
        serie:row.serie||'', descricao:row.descricao||'',
        criadoEm:row.criado_em||new Date().toISOString(),
        ultimoLocal:row.ultimo_local||null, ultimoLat:row.ultimo_lat||null,
        ultimoLng:row.ultimo_lng||null, ultimoRegisto:row.ultimo_registo||null
      };
    });
    EQUIPAMENTOS=Object.values(localMap);
    saveEqLocal();
  }catch(e){ console.warn('sbLoadEquipamentos:',e); }
}

async function sbFetchEquipamentoById(id){
  try{
    const {data,error}=await sb.from('equipamentos').select('*').eq('id',id).single();
    if(error||!data) return null;
    return {
      id:data.id, nome:data.nome, categoria:data.categoria||'outro',
      serie:data.serie||'', descricao:data.descricao||'',
      criadoEm:data.criado_em||new Date().toISOString(),
      ultimoLocal:data.ultimo_local||null, ultimoLat:data.ultimo_lat||null,
      ultimoLng:data.ultimo_lng||null, ultimoRegisto:data.ultimo_registo||null
    };
  }catch(e){ return null; }
}

function sbUpsertEquipamento(eq){
  try{
    sb.from('equipamentos').upsert({
      id:eq.id, nome:eq.nome, categoria:eq.categoria,
      serie:eq.serie||null, descricao:eq.descricao||null,
      criado_em:eq.criadoEm,
      ultimo_local:eq.ultimoLocal||null, ultimo_lat:eq.ultimoLat||null,
      ultimo_lng:eq.ultimoLng||null, ultimo_registo:eq.ultimoRegisto||null
    }).then(()=>{}).catch(e=>console.warn('sbUpsertEquipamento:',e));
  }catch(e){}
}

function sbUpdateEquipamentoLocal(id, ultimoLocal, ultimoLat, ultimoLng, ultimoRegisto){
  try{
    sb.from('equipamentos').update({
      ultimo_local:ultimoLocal||null, ultimo_lat:ultimoLat||null,
      ultimo_lng:ultimoLng||null, ultimo_registo:ultimoRegisto||null
    }).eq('id',id).then(()=>{}).catch(e=>console.warn('sbUpdateEquipLocal:',e));
  }catch(e){}
}

// ── Init da secção ──────────────────────
async function initEquipamentos(){
  renderEquipamentos();
  setTimeout(()=>{ initEqMap(); }, 120);
  await sbLoadEquipamentos();
  renderEquipamentos(); refreshEqMap();
}

// ═══════════════════════════════════════
//  QR REGISTRATION — ecrã para o encarregado
// ═══════════════════════════════════════
async function initQrRegistration(){
  const params=new URLSearchParams(location.search);
  const regId=params.get('reg');
  if(!regId) return false;
  _qrEquipId=regId;
  document.getElementById('qr-reg-screen').style.display='flex';
  document.getElementById('login-screen').style.display='none';
  let eq=EQUIPAMENTOS.find(e=>e.id===regId);
  if(!eq){
    // Equipamento não está no localStorage — tentar Supabase (criado noutro dispositivo)
    document.getElementById('qr-equip-nome').textContent='A carregar…';
    document.getElementById('qr-equip-cat').textContent='';
    eq=await sbFetchEquipamentoById(regId);
    if(eq){ EQUIPAMENTOS.push(eq); saveEqLocal(); }
  }
  document.getElementById('qr-equip-nome').textContent=eq?eq.nome:`Equipamento ${regId}`;
  document.getElementById('qr-equip-cat').textContent=eq?(EQ_CATS[eq.categoria]?.label||'Equipamento'):'';
  // Obras via Supabase
  try{
    const {data:obras}=await sb.from('obras').select('id,nome').eq('ativa',true).order('nome');
    const sel=document.getElementById('qr-obra-sel');
    sel.innerHTML='<option value="">Selecionar obra…</option>';
    if(obras&&obras.length) obras.forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.nome; sel.appendChild(op); });
  }catch(e){
    const sel=document.getElementById('qr-obra-sel');
    sel.innerHTML='<option value="">Selecionar obra…</option>';
    OBRAS.filter(o=>o.ativa).forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.nome; sel.appendChild(op); });
  }
  // GPS
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      _qrGpsLat=pos.coords.latitude; _qrGpsLng=pos.coords.longitude;
      document.getElementById('qr-loc-dot').className='qr-loc-dot ok';
      document.getElementById('qr-loc-txt').textContent=`GPS: ${_qrGpsLat.toFixed(5)}, ${_qrGpsLng.toFixed(5)}`;
    },()=>{
      document.getElementById('qr-loc-dot').className='qr-loc-dot err';
      document.getElementById('qr-loc-txt').textContent='GPS não disponível — registo sem coordenadas';
      document.getElementById('qr-use-gps').checked=false;
    },{timeout:8000,enableHighAccuracy:true});
  } else {
    document.getElementById('qr-loc-dot').className='qr-loc-dot err';
    document.getElementById('qr-loc-txt').textContent='GPS não suportado neste dispositivo';
    document.getElementById('qr-use-gps').checked=false;
  }
  return true;
}

function submitQrRegistration(){
  const obraId  =document.getElementById('qr-obra-sel').value;
  const obs     =document.getElementById('qr-obs').value.trim();
  const useGps  =document.getElementById('qr-use-gps').checked;
  const encNome =(document.getElementById('qr-enc-nome').value.trim())||'Encarregado';
  // Nome da obra a partir da option
  const selEl=document.getElementById('qr-obra-sel');
  const selOpt=selEl.querySelector(`option[value="${obraId}"]`);
  const obraNome=selOpt&&obraId?selOpt.textContent:null;
  const mov={
    id:'MOV'+Date.now().toString(36).toUpperCase(),
    equipId:_qrEquipId, obraId:obraId||null, obraNome:obraNome||null,
    lat:(useGps&&_qrGpsLat)?_qrGpsLat:null, lng:(useGps&&_qrGpsLng)?_qrGpsLng:null,
    obs, encarregado:encNome, criadoEm:new Date().toISOString()
  };
  EQ_MOVIMENTOS.push(mov);
  const idx=EQUIPAMENTOS.findIndex(e=>e.id===_qrEquipId);
  if(idx>=0){
    EQUIPAMENTOS[idx].ultimoLocal   =obraNome||(mov.lat?`${mov.lat.toFixed(4)}, ${mov.lng.toFixed(4)}`:'Registado');
    EQUIPAMENTOS[idx].ultimoLat     =mov.lat;
    EQUIPAMENTOS[idx].ultimoLng     =mov.lng;
    EQUIPAMENTOS[idx].ultimoRegisto =mov.criadoEm;
  }
  saveEqLocal();
  // Guardar movimento em Supabase (silencioso)
  try{ sb.from('eq_movimentos').insert({equip_id:_qrEquipId,obra_id:mov.obraId,obra_nome:mov.obraNome,lat:mov.lat,lng:mov.lng,obs:mov.obs,encarregado:mov.encarregado,criado_em:mov.criadoEm}).then(()=>{}).catch(()=>{}); }catch(e){}
  // Actualizar último local do equipamento em Supabase
  const _qrIdx=EQUIPAMENTOS.findIndex(e=>e.id===_qrEquipId);
  if(_qrIdx>=0){ sbUpdateEquipamentoLocal(_qrEquipId,EQUIPAMENTOS[_qrIdx].ultimoLocal,EQUIPAMENTOS[_qrIdx].ultimoLat,EQUIPAMENTOS[_qrIdx].ultimoLng,EQUIPAMENTOS[_qrIdx].ultimoRegisto); }
  // Mostrar sucesso
  const form=document.getElementById('qr-reg-form'), succ=document.getElementById('qr-success');
  if(form) form.style.display='none'; if(succ) succ.style.display='block';
  document.getElementById('qr-success-txt').innerHTML=
    `<strong>${encNome}</strong> registou o equipamento<br>`+
    (obraNome?`em <strong>${obraNome}</strong>`:'sem obra associada')+
    `<br><span style="font-size:11px;color:var(--gray-400);display:block;margin-top:6px">${eqFmtDt(new Date())}</span>`;
}

// ── Hook goTo ───────────────────────────
(function(){
  const _prev=goTo;
  goTo=function(id,btn){ _prev(id,btn); if(id==='equipamentos') initEquipamentos(); if(id==='combustivel') _initCombustivelAdmin(); };
})();

// ═══════════════════════════════════════
//  ENCARREGADO — NAVEGAÇÃO HOME + QR SCANNER
// ═══════════════════════════════════════

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
        const c=COLABORADORES.find(x=>x.n===r.colab_numero);
        const nome=c?c.nome:(r.colab_numero||'—');
        const ob=OBRAS.find(o=>o.id===r.obra_id)?.nome||'—';
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
        const ob=OBRAS.find(o=>o.id===r.obra_id)?.nome||'—';
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
  OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
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
  stopCombQrScanner();
  const s=document.getElementById('enc-screen-combustivel');
  s.style.display='flex'; s.style.flexDirection='column';
}

// ── Depósito de Obra ────────────────────────────
let _depMovimento = 'entrada'; // 'entrada' | 'saida'

function depSetMovimento(tipo){
  _depMovimento = tipo;
  const btnE=document.getElementById('dep-btn-entrada');
  const btnS=document.getElementById('dep-btn-saida');
  if(tipo==='entrada'){
    btnE.style.background='#22c55e'; btnE.style.borderColor='#22c55e'; btnE.style.color='white';
    btnS.style.background='rgba(255,255,255,.08)'; btnS.style.borderColor='rgba(255,255,255,.2)'; btnS.style.color='rgba(255,255,255,.6)';
  } else {
    btnS.style.background='#f97316'; btnS.style.borderColor='#f97316'; btnS.style.color='white';
    btnE.style.background='rgba(255,255,255,.08)'; btnE.style.borderColor='rgba(255,255,255,.2)'; btnE.style.color='rgba(255,255,255,.6)';
  }
}

function encGoCombDeposito(){
  _encHideAll();
  const s=document.getElementById('enc-screen-comb-deposito');
  s.style.display='flex'; s.style.flexDirection='column';
  document.getElementById('dep-data').value=fmt(new Date());
  const os=document.getElementById('dep-obra');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  document.getElementById('dep-litros').value='';
  document.getElementById('dep-obs').value='';
  document.getElementById('dep-tipo').value='Gasóleo';
  document.getElementById('dep-alert').style.display='none';
  _depMovimento='entrada';
  depSetMovimento('entrada');
}

async function encSubmeterCombDeposito(){
  const data=document.getElementById('dep-data').value;
  const obraEl=document.getElementById('dep-obra');
  const obraId=obraEl.value;
  const obraNome=obraEl.options[obraEl.selectedIndex]?.text||'';
  const litros=parseFloat(document.getElementById('dep-litros').value)||null;
  const tipo=document.getElementById('dep-tipo').value;
  const obs=document.getElementById('dep-obs').value.trim()||null;
  if(!data){showToast('Selecione a data');return;}
  if(!obraId){showToast('Selecione a obra do depósito');return;}
  if(!litros||litros<=0){showToast('Indique a quantidade de litros');return;}
  const btn=document.getElementById('dep-submit-btn');
  if(btn){btn.disabled=true;}
  try{
    const {error}=await sb.from('registos_combustivel').insert({
      data,
      equipamento_id:null,
      equipamento_nome:'Depósito de Obra',
      obra_id:obraId,
      obra_nome:obraNome,
      litros,
      tipo_combustivel:tipo,
      tipo_registo:'deposito',
      movimento:_depMovimento,
      encarregado_nome:currentUser?.nome||'',
      obs
    });
    if(error)throw error;
    document.getElementById('dep-alert').style.display='block';
    showToast((_depMovimento==='entrada'?'Entrada':'Saída')+' no depósito registada ✓');
    setTimeout(()=>{
      document.getElementById('dep-litros').value='';
      document.getElementById('dep-obs').value='';
      document.getElementById('dep-obra').value='';
      document.getElementById('dep-alert').style.display='none';
      if(btn){btn.disabled=false;}
    },1800);
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    if(btn){btn.disabled=false;}
  }
}

// ── Viaturas / Equipamentos — QR + Manual ───────
let _combHtml5Qr = null;
let _combQrEquipId = null;
let _combModoManual = false;

function _combViaturaShowState(state){
  document.getElementById('comb-viatura-state-scanner').style.display = state==='scanner'?'':'none';
  const fEl=document.getElementById('comb-viatura-state-form');
  fEl.style.display = state==='form'?'flex':'none';
  if(state==='form') fEl.style.flexDirection='column';
  const sEl=document.getElementById('comb-viatura-state-success');
  sEl.style.display = state==='success'?'flex':'none';
  if(state==='success') sEl.style.flexDirection='column';
}

async function encGoCombViatura(){
  _encHideAll();
  const s=document.getElementById('enc-screen-comb-viatura');
  s.style.display='flex'; s.style.flexDirection='column';
  _combQrEquipId=null; _combModoManual=false;
  _combViaturaShowState('scanner');
  document.getElementById('comb-qr-reader').innerHTML='';
  setTimeout(()=>startCombQrScanner(), 350);
}

function startCombQrScanner(){
  const readerEl=document.getElementById('comb-qr-reader');
  if(!readerEl) return;
  if(typeof Html5Qrcode==='undefined'){
    readerEl.innerHTML=`<div style="padding:28px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.6">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;display:block;margin:0 auto 10px;opacity:.7"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M20 5h-6v6h6V5z"/></svg>
      Leitor QR não disponível.</div>`; return;
  }
  if(_combHtml5Qr){try{_combHtml5Qr.stop();}catch(e){} _combHtml5Qr=null;}
  _combHtml5Qr=new Html5Qrcode('comb-qr-reader');
  _combHtml5Qr.start(
    {facingMode:'environment'},
    {fps:10, qrbox:{width:220,height:220}, aspectRatio:1.0},
    (decoded)=>{onCombQrScanned(decoded);},
    ()=>{}
  ).catch(err=>{
    console.warn('Comb QR scanner:',err);
    readerEl.innerHTML=`<div style="padding:24px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:32px;height:32px;display:block;margin:0 auto 10px;opacity:.7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      Câmara não acessível.<br>
      <span style="font-size:11px;opacity:.8">Utilize o botão abaixo para registo manual.</span>
    </div>`;
  });
}

function stopCombQrScanner(){
  if(_combHtml5Qr){try{_combHtml5Qr.stop();}catch(e){} _combHtml5Qr=null;}
}

async function onCombQrScanned(text){
  stopCombQrScanner();
  let equipId=null;
  try{const u=new URL(text); equipId=u.searchParams.get('reg');}catch(e){}
  if(!equipId && /^EQ[A-Z0-9]+$/.test(text)) equipId=text;
  if(!equipId){
    showToast('QR code não reconhecido como equipamento Plandese');
    setTimeout(()=>startCombQrScanner(), 2500);
    return;
  }
  _combQrEquipId=equipId; _combModoManual=false;
  let eq=EQUIPAMENTOS.find(e=>e.id===equipId);
  if(!eq){
    document.getElementById('comb-viatura-nome').textContent='A carregar…';
    document.getElementById('comb-viatura-cat').textContent='';
    _combViaturaShowState('form');
    eq=await sbFetchEquipamentoById(equipId).catch(()=>null);
    if(eq){EQUIPAMENTOS.push(eq); saveEqLocal();}
  } else {
    _combViaturaShowState('form');
  }
  document.getElementById('comb-viatura-info-box').style.display='flex';
  document.getElementById('comb-viatura-nome-field').style.display='none';
  document.getElementById('comb-viatura-scan-btn').style.display='inline-flex';
  document.getElementById('comb-viatura-nome').textContent=eq?eq.nome:`Equipamento ${equipId}`;
  document.getElementById('comb-viatura-cat').textContent=eq?(EQ_CATS[eq.categoria]?.label||'Equipamento'):'Equipamento';
  _combPreencherFormViatura();
}

function combViaturaManual(){
  stopCombQrScanner();
  _combQrEquipId=null; _combModoManual=true;
  _combViaturaShowState('form');
  document.getElementById('comb-viatura-info-box').style.display='none';
  document.getElementById('comb-viatura-nome-field').style.display='block';
  document.getElementById('comb-viatura-scan-btn').style.display='inline-flex';
  document.getElementById('comb-viatura-nome-input').value='';
  _combPreencherFormViatura();
}

function _combPreencherFormViatura(){
  document.getElementById('comb-viatura-data').value=fmt(new Date());
  const os=document.getElementById('comb-viatura-obra');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  document.getElementById('comb-viatura-litros').value='';
  document.getElementById('comb-viatura-fornecedor').value='';
  document.getElementById('comb-viatura-obs').value='';
  document.getElementById('comb-viatura-tipo').value='Gasóleo';
  document.getElementById('comb-viatura-alert').style.display='none';
}

function combViaturaVoltarScanner(){
  _combQrEquipId=null; _combModoManual=false;
  document.getElementById('comb-qr-reader').innerHTML='';
  _combViaturaShowState('scanner');
  setTimeout(()=>startCombQrScanner(), 350);
}

async function encSubmeterCombViatura(){
  const data=document.getElementById('comb-viatura-data').value;
  const obraEl=document.getElementById('comb-viatura-obra');
  const obraId=obraEl.value;
  const obraNome=obraEl.options[obraEl.selectedIndex]?.text||'';
  const litros=parseFloat(document.getElementById('comb-viatura-litros').value)||null;
  const tipo=document.getElementById('comb-viatura-tipo').value;
  const fornecedor=document.getElementById('comb-viatura-fornecedor').value.trim()||null;
  const obs=document.getElementById('comb-viatura-obs').value.trim()||null;
  // Nome do equipamento
  let equipId=_combQrEquipId||null;
  let equipNome='';
  if(_combModoManual){
    equipNome=document.getElementById('comb-viatura-nome-input').value.trim();
    if(!equipNome){showToast('Indique o nome da viatura ou equipamento');return;}
  } else {
    const eq=EQUIPAMENTOS.find(e=>e.id===equipId);
    equipNome=eq?eq.nome:(equipId||'');
  }
  if(!data){showToast('Selecione a data');return;}
  if(!litros||litros<=0){showToast('Indique a quantidade de litros');return;}
  const btn=document.getElementById('comb-viatura-submit-btn');
  if(btn){btn.disabled=true;}
  try{
    const {error}=await sb.from('registos_combustivel').insert({
      data,
      equipamento_id:equipId,
      equipamento_nome:equipNome,
      obra_id:obraId||null,
      obra_nome:obraId?obraNome:null,
      litros,
      tipo_combustivel:tipo,
      tipo_registo:'viatura',
      movimento:'saida',
      fornecedor,
      encarregado_nome:currentUser?.nome||'',
      obs
    });
    if(error)throw error;
    showToast('Abastecimento registado ✓');
    const encNome=currentUser?.nome||'Encarregado';
    document.getElementById('comb-viatura-success-txt').innerHTML=
      `<strong>${encNome}</strong> registou<br>`+
      `<strong>${litros}L de ${tipo}</strong><br>`+
      `em <strong>${equipNome}</strong>`+
      (obraId?`<br>Obra: <strong>${obraNome}</strong>`:'')+
      `<br><span style="font-size:11px;opacity:.65;display:block;margin-top:6px">${eqFmtDt(new Date())}</span>`;
    _combViaturaShowState('success');
    if(btn){btn.disabled=false;}
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    if(btn){btn.disabled=false;}
  }
}

// Manter compatibilidade com referências antigas ao encSubmeterCombustivel
function encSubmeterCombustivel(){ encSubmeterCombViatura(); }

// ════════════════════════════════════════════════
//  COMBUSTÍVEL — ADMIN
// ════════════════════════════════════════════════
async function loadCombustivelAdmin(){
  const ini=document.getElementById('comb-f-ini').value;
  const fim=document.getElementById('comb-f-fim').value;
  const equip=document.getElementById('comb-f-equip').value;
  const tbody=document.getElementById('comb-tbody');
  const empty=document.getElementById('comb-empty');
  tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray-400)">A carregar…</td></tr>';
  empty.style.display='none';
  try{
    let q=sb.from('registos_combustivel').select('*').order('data',{ascending:false}).order('criado_em',{ascending:false});
    if(ini) q=q.gte('data',ini);
    if(fim) q=q.lte('data',fim);
    if(equip) q=q.eq('equipamento_id',equip);
    const {data:rows,error}=await q;
    if(error)throw error;
    if(!rows||!rows.length){tbody.innerHTML='';empty.style.display='';document.getElementById('comb-kpis').style.display='none';return;}
    // KPIs
    const totalLitros=rows.reduce((s,r)=>s+(parseFloat(r.litros)||0),0);
    const gasoleo=rows.filter(r=>r.tipo_combustivel==='Gasóleo').reduce((s,r)=>s+(parseFloat(r.litros)||0),0);
    const gasolina=rows.filter(r=>r.tipo_combustivel==='Gasolina').reduce((s,r)=>s+(parseFloat(r.litros)||0),0);
    document.getElementById('comb-k-total').textContent=rows.length;
    document.getElementById('comb-k-litros').textContent=totalLitros.toFixed(1)+'L';
    document.getElementById('comb-k-gasoleo').textContent=gasoleo.toFixed(1)+'L';
    document.getElementById('comb-k-gasolina').textContent=gasolina.toFixed(1)+'L';
    document.getElementById('comb-kpis').style.display='';
    // Tabela
    tbody.innerHTML=rows.map(r=>{
      const obraNome=OBRAS.find(o=>o.id===r.obra_id)?.nome||r.obra_id||'—';
      return `<tr>
        <td>${fmtPT(r.data)}</td>
        <td style="font-weight:600">${r.equipamento_nome||'—'}</td>
        <td>${obraNome}</td>
        <td style="font-weight:600;color:var(--orange)">${r.litros!=null?r.litros+'L':'—'}</td>
        <td><span class="badge ${r.tipo_combustivel==='Gasóleo'?'b-blue':r.tipo_combustivel==='Gasolina'?'b-orange':'b-gray'}">${r.tipo_combustivel||'—'}</span></td>
        <td>${r.fornecedor||'—'}</td>
        <td>${r.encarregado_nome||'—'}</td>
        <td style="color:var(--gray-500);font-size:12px">${r.obs||'—'}</td>
      </tr>`;
    }).join('');
  }catch(e){
    tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:24px;color:#b91c1c">Erro: ${e.message}</td></tr>`;
  }
}

function exportCombustivelXLSX(){
  const rows=[];
  document.querySelectorAll('#comb-tbody tr').forEach(tr=>{
    const cells=[...tr.querySelectorAll('td')].map(td=>td.innerText);
    if(cells.length) rows.push(cells);
  });
  if(!rows.length){showToast('Sem dados para exportar');return;}
  const ws=XLSX.utils.aoa_to_sheet([['Data','Viatura/Máquina','Obra','Litros','Tipo','Fornecedor','Encarregado','Obs'],...rows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Combustível');
  XLSX.writeFile(wb,`combustivel_${fmt(new Date())}.xlsx`);
}

function _initCombustivelAdmin(){
  // Preencher datas padrão: mês corrente
  const hoje=fmt(new Date());
  const ini=hoje.slice(0,7)+'-01';
  document.getElementById('comb-f-ini').value=ini;
  document.getElementById('comb-f-fim').value=hoje;
  // Preencher select de equipamentos
  const sel=document.getElementById('comb-f-equip');
  sel.innerHTML='<option value="">Todos</option>';
  EQUIPAMENTOS.forEach(eq=>{const op=document.createElement('option');op.value=eq.id;op.textContent=eq.nome;sel.appendChild(op);});
  loadCombustivelAdmin();
}

function encVoltarHome(){
  stopEncQrScanner();
  stopCombQrScanner();
  _encHideAll();
  document.getElementById('enc-screen0').style.display='flex';
  document.getElementById('enc-screen0').style.flexDirection='column';
}

function _encHideAll(){
  ['enc-screen0','enc-screen-menu-ponto','enc-screen1','enc-screen2','enc-screen-equip','enc-screen-aluguer','enc-screen-historico-enc','enc-screen-combustivel','enc-screen-comb-deposito','enc-screen-comb-viatura',
   'enc-screen-compras-chat'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
}

// ── MOA — Estado ──────────────────────
let encAlugEmpresaId='', encAlugEmpresaNome='', encAlugObraId='', encAlugData='', encAlugHoraIni='08:00', encAlugHoraFim='17:00';
let encAlugTrabalhadores=[]; // [{nome, entrada, saida, status}]

// Lista de empresas cedentes — carregada do Supabase
let EMPRESAS_MOA = [];

// Colaboradores por empresa MOA — { empresa_moa_id: [{id, nome, funcao}] }
let COLABORADORES_MOA = {};

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
  const obraNome=OBRAS.find(o=>o.id===obraId)?.nome||'—';
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
      encarregado_nome:currentUser?.nome||'',
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
let moaCurrentMonday=null;

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
              const obraNome=OBRAS.find(o=>o.id===r.obra_id)?.nome||r.obra_id||'—';
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
    OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  }
}

function _encEquipShowState(state){
  document.getElementById('enc-equip-state-scanner').style.display = state==='scanner' ? '' : 'none';
  const fEl=document.getElementById('enc-equip-state-form');
  fEl.style.display = state==='form' ? 'flex' : 'none';
  if(state==='form') fEl.style.flexDirection='column';
  const sEl=document.getElementById('enc-equip-state-success');
  sEl.style.display = state==='success' ? 'flex' : 'none';
  if(state==='success') sEl.style.flexDirection='column';
}

// ── QR Scanner ─────────────────────────
let _encHtml5Qr = null;
let _encQrEquipId = null;
let _encQrGpsLat = null, _encQrGpsLng = null;

function startEncQrScanner(){
  const readerEl = document.getElementById('enc-qr-reader');
  if(!readerEl) return;
  if(typeof Html5Qrcode === 'undefined'){
    readerEl.innerHTML=`<div style="padding:28px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.6">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;display:block;margin:0 auto 10px;opacity:.7"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M20 5h-6v6h6V5z"/></svg>
      Leitor QR não disponível.<br>
      <span style="font-size:11px;opacity:.8">Utilize a câmara nativa para fotografar o QR code — o link abrirá automaticamente.</span>
    </div>`;
    return;
  }
  if(_encHtml5Qr){ try{_encHtml5Qr.stop();}catch(e){} _encHtml5Qr=null; }
  _encHtml5Qr = new Html5Qrcode('enc-qr-reader');
  _encHtml5Qr.start(
    {facingMode:'environment'},
    {fps:10, qrbox:{width:220, height:220}, aspectRatio:1.0},
    (decoded)=>{ onEncQrScanned(decoded); },
    ()=>{}
  ).catch(err=>{
    console.warn('QR scanner:', err);
    readerEl.innerHTML=`<div style="padding:24px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:32px;height:32px;display:block;margin:0 auto 10px;opacity:.7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      Câmara não acessível.<br>
      <span style="font-size:11px;opacity:.8">Verifique as permissões do browser ou fotografe o QR code com a câmara nativa.</span>
    </div>`;
  });
}

function stopEncQrScanner(){
  if(_encHtml5Qr){
    try{_encHtml5Qr.stop();}catch(e){}
    _encHtml5Qr=null;
  }
}

async function onEncQrScanned(text){
  stopEncQrScanner();
  // Extrair equipId da URL ou texto directo
  let equipId=null;
  try{ const u=new URL(text); equipId=u.searchParams.get('reg'); }catch(e){}
  if(!equipId && /^EQ[A-Z0-9]+$/.test(text)) equipId=text;
  if(!equipId){
    showToast('QR code não reconhecido como equipamento Plandese');
    setTimeout(()=>startEncQrScanner(), 2500);
    return;
  }
  _encQrEquipId=equipId;
  _encQrGpsLat=null; _encQrGpsLng=null;
  // Info do equipamento — primeiro local, depois Supabase se não encontrar
  let eq=EQUIPAMENTOS.find(e=>e.id===equipId);
  if(!eq){
    // Mostrar estado de carregamento enquanto busca
    document.getElementById('enc-eq-nome').textContent='A carregar…';
    document.getElementById('enc-eq-cat').textContent='';
    _encEquipShowState('form');
    eq=await sbFetchEquipamentoById(equipId);
    if(eq){ EQUIPAMENTOS.push(eq); saveEqLocal(); }
  } else {
    _encEquipShowState('form');
  }
  document.getElementById('enc-eq-nome').textContent=eq?eq.nome:`Equipamento ${equipId}`;
  document.getElementById('enc-eq-cat').textContent=eq?(EQ_CATS[eq.categoria]?.label||'Equipamento'):'Equipamento';
  // Preencher obras
  const sel=document.getElementById('enc-eq-obra-sel');
  sel.innerHTML='<option value="">Selecionar obra…</option>';
  OBRAS.filter(o=>o.ativa).forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.nome; sel.appendChild(op); });
  // Reset form
  document.getElementById('enc-eq-obs').value='';
  document.getElementById('enc-eq-use-gps').checked=true;
  document.getElementById('enc-eq-loc-dot').className='qr-loc-dot loading';
  document.getElementById('enc-eq-loc-txt').textContent='A obter localização GPS…';
  // GPS
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      _encQrGpsLat=pos.coords.latitude; _encQrGpsLng=pos.coords.longitude;
      document.getElementById('enc-eq-loc-dot').className='qr-loc-dot ok';
      document.getElementById('enc-eq-loc-txt').textContent=`GPS: ${_encQrGpsLat.toFixed(5)}, ${_encQrGpsLng.toFixed(5)}`;
    },()=>{
      document.getElementById('enc-eq-loc-dot').className='qr-loc-dot err';
      document.getElementById('enc-eq-loc-txt').textContent='GPS não disponível';
      document.getElementById('enc-eq-use-gps').checked=false;
    },{timeout:8000,enableHighAccuracy:true});
  } else {
    document.getElementById('enc-eq-loc-dot').className='qr-loc-dot err';
    document.getElementById('enc-eq-loc-txt').textContent='GPS não suportado';
    document.getElementById('enc-eq-use-gps').checked=false;
  }
}

function encScanNovamente(){
  _encQrEquipId=null; _encQrGpsLat=null; _encQrGpsLng=null;
  document.getElementById('enc-qr-reader').innerHTML='';
  _encEquipShowState('scanner');
  setTimeout(()=>startEncQrScanner(), 350);
}

function submitEncEquipamento(){
  if(!_encQrEquipId){ showToast('Nenhum equipamento seleccionado'); return; }
  const obraId  =document.getElementById('enc-eq-obra-sel').value;
  const obs     =document.getElementById('enc-eq-obs').value.trim();
  const useGps  =document.getElementById('enc-eq-use-gps').checked;
  const encNome =currentUser?.nome || 'Encarregado';
  const selEl   =document.getElementById('enc-eq-obra-sel');
  const selOpt  =selEl.querySelector(`option[value="${obraId}"]`);
  const obraNome=selOpt&&obraId?selOpt.textContent:null;
  const mov={
    id:'MOV'+Date.now().toString(36).toUpperCase(),
    equipId:_encQrEquipId, obraId:obraId||null, obraNome:obraNome||null,
    lat:(useGps&&_encQrGpsLat)?_encQrGpsLat:null,
    lng:(useGps&&_encQrGpsLng)?_encQrGpsLng:null,
    obs, encarregado:encNome, criadoEm:new Date().toISOString()
  };
  EQ_MOVIMENTOS.push(mov);
  const idx=EQUIPAMENTOS.findIndex(e=>e.id===_encQrEquipId);
  if(idx>=0){
    EQUIPAMENTOS[idx].ultimoLocal   =obraNome||(mov.lat?`${mov.lat.toFixed(4)}, ${mov.lng.toFixed(4)}`:'Registado');
    EQUIPAMENTOS[idx].ultimoLat     =mov.lat;
    EQUIPAMENTOS[idx].ultimoLng     =mov.lng;
    EQUIPAMENTOS[idx].ultimoRegisto =mov.criadoEm;
  }
  saveEqLocal();
  // Guardar movimento em Supabase
  try{ sb.from('eq_movimentos').insert({equip_id:_encQrEquipId,obra_id:mov.obraId,obra_nome:mov.obraNome,lat:mov.lat,lng:mov.lng,obs:mov.obs,encarregado:mov.encarregado,criado_em:mov.criadoEm}).then(()=>{}).catch(()=>{}); }catch(e){}
  // Actualizar último local do equipamento em Supabase
  const _eIdx=EQUIPAMENTOS.findIndex(e=>e.id===_encQrEquipId);
  if(_eIdx>=0){ sbUpdateEquipamentoLocal(_encQrEquipId,EQUIPAMENTOS[_eIdx].ultimoLocal,EQUIPAMENTOS[_eIdx].ultimoLat,EQUIPAMENTOS[_eIdx].ultimoLng,EQUIPAMENTOS[_eIdx].ultimoRegisto); }
  const eq=EQUIPAMENTOS.find(e=>e.id===_encQrEquipId);
  document.getElementById('enc-eq-success-txt').innerHTML=
    `<strong>${encNome}</strong> registou<br>`+
    `<strong>${eq?eq.nome:_encQrEquipId}</strong><br>`+
    (obraNome?`em <strong>${obraNome}</strong>`:'sem obra associada')+
    `<br><span style="font-size:11px;opacity:.65;display:block;margin-top:6px">${eqFmtDt(new Date())}</span>`;
  _encEquipShowState('success');
}

// ═══════════════════════════════════════
//  PRODUÇÃO — DADOS E FUNÇÕES
// ═══════════════════════════════════════

// ── Persistência local ─────
let PREV_FATURACAO = [];
let AUTOS_MEDICAO  = [];
let CUSTOS_FATURAS = [];

function _prodLoadLocal(){
  try{ PREV_FATURACAO = JSON.parse(localStorage.getItem('prod_prev_fat')||'[]'); }catch(e){ PREV_FATURACAO=[]; }
  try{ AUTOS_MEDICAO  = JSON.parse(localStorage.getItem('prod_autos')   ||'[]'); }catch(e){ AUTOS_MEDICAO=[]; }
  try{ CUSTOS_FATURAS = JSON.parse(localStorage.getItem('prod_faturas') ||'[]'); }catch(e){ CUSTOS_FATURAS=[]; }
}
function saveProdLocal(){
  localStorage.setItem('prod_prev_fat', JSON.stringify(PREV_FATURACAO));
  localStorage.setItem('prod_autos',    JSON.stringify(AUTOS_MEDICAO));
  localStorage.setItem('prod_faturas',  JSON.stringify(CUSTOS_FATURAS));
}
_prodLoadLocal();

// ── Tab principal ─────
// ── Metadados extra de obra (nº, data início, prazo) ─────────────────────
let OBRAS_EXTRA = {};
function _loadObrasExtra(){ try{ OBRAS_EXTRA = JSON.parse(localStorage.getItem('obras_extra')||'{}'); }catch(e){ OBRAS_EXTRA={}; } }
function _saveObrasExtra(){ localStorage.setItem('obras_extra', JSON.stringify(OBRAS_EXTRA)); }
_loadObrasExtra();

let _custoCardObraId = null;

function initProducao(){
  _prodLoadLocal();
  _loadObrasExtra();
  renderProdDashboard();
}

function prodGoTab(){ /* mantido por compatibilidade */ }

// ── Dashboard principal (redesign Controlo de Obras) ─────────────────────
let _coState = { filter: 'all', view: 'cards', q: '', detailObraId: null, wired: false };

function coFmtData(d){ return d ? d.split('-').reverse().join('/') : '—'; }
function coFmtMes(ym){ if(!ym) return '—'; const [y,m]=ym.split('-'); const ns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return (ns[parseInt(m)-1]||m)+' '+y; }
function coFmtMesShort(ym){ if(!ym) return '—'; const [y,m]=ym.split('-'); const ns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return (ns[parseInt(m)-1]||m)+"'"+y.slice(2); }
function coParseMonths(txt){ if(!txt) return null; const m=String(txt).match(/(\d+)/); if(!m) return null; const n=parseInt(m[1],10); if(/dia/i.test(txt)) return Math.round(n/30); return n; }
function coAddMonths(yyyymmdd, n){ if(!yyyymmdd) return null; const d=new Date(yyyymmdd); if(isNaN(d)) return null; d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); }
function coStatusOf(s){
  if(s.faturado<=0 && s.custos<=0) return 'warn'; // sem dados
  if(s.custos > s.faturado*1.02 && s.faturado>0) return 'bad';
  if(s.contratado>0 && s.tempoPct>0){
    const lag = s.tempoPct - s.execPct;
    if(lag>25) return 'bad';
    if(lag>10) return 'warn';
  }
  if(s.faturado>0 && s.margemPct < 12) return 'warn';
  return 'ok';
}
function coStatusLabel(st){ return st==='ok'?'Em curso':(st==='warn'?'Atenção':'Alerta'); }

function coComputeStats(o){
  const extra = OBRAS_EXTRA[o.id] || {};
  const autosAll = AUTOS_MEDICAO.filter(a => a.obraId===o.id && a.tipo==='contratual');
  const faturado = autosAll.reduce((s,a)=>s+(a.valor||0), 0);
  const custos = CUSTOS_FATURAS.filter(f=>f.obraId===o.id).reduce((s,f)=>s+(f.custos||0),0);
  const prevs = PREV_FATURACAO.filter(p=>p.obraId===o.id);
  const contratadoPrev = prevs.reduce((s,p)=>s+(p.valor||0),0);
  const contratado = contratadoPrev > 0 ? contratadoPrev : faturado; // fallback
  const margem = faturado - custos;
  const margemPct = faturado>0 ? (margem/faturado)*100 : 0;
  const execPct = contratado>0 ? Math.min(100,(faturado/contratado)*100) : 0;

  // tempo
  const meses = coParseMonths(extra.prazoExecucao);
  const fim = (extra.dataInicio && meses) ? coAddMonths(extra.dataInicio, meses) : null;
  let tempoPct = 0, diasRest=null;
  if(extra.dataInicio && fim){
    const ini = new Date(extra.dataInicio).getTime();
    const f = new Date(fim).getTime();
    const now = Date.now();
    if(f>ini){ tempoPct = Math.max(0, Math.min(100, ((now-ini)/(f-ini))*100)); diasRest = Math.round((f-now)/(1000*60*60*24)); }
  }

  // próximo auto = próxima previsão futura
  const nowYM = new Date().toISOString().slice(0,7);
  const futurePrevs = prevs.filter(p=>p.mes>=nowYM).sort((a,b)=>a.mes.localeCompare(b.mes));
  const proxPrev = futurePrevs[0] || null;
  const ultimoAuto = autosAll.slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''))[0] || null;

  const s = { obra:o, extra, autosAll, faturado, custos, contratado, contratadoPrev, margem, margemPct, execPct, tempoPct, diasRest, fim, proxPrev, ultimoAuto, numAutos: autosAll.length };
  s.status = coStatusOf(s);
  return s;
}

function renderProdDashboard(){
  const emptyEl = document.getElementById('prod-dash-empty');
  const cardsEl = document.getElementById('co-cards-view');
  const tbody   = document.getElementById('co-tbody');
  if(!cardsEl) return;

  const obras = OBRAS.filter(o => o.ativa !== false);
  if(obras.length === 0){
    if(emptyEl) emptyEl.style.display = 'block';
    document.getElementById('co-list-view').style.display='none';
    document.getElementById('co-detail').classList.remove('show');
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  const allStats = obras.map(coComputeStats);

  // Portfolio summary
  const totC = allStats.reduce((s,x)=>s+x.contratado,0);
  const totF = allStats.reduce((s,x)=>s+x.faturado,0);
  const totK = allStats.reduce((s,x)=>s+x.custos,0);
  const totM = totF - totK;
  const totMP = totF>0 ? (totM/totF)*100 : 0;
  const counts = { ok:0, warn:0, bad:0 };
  allStats.forEach(s=>counts[s.status]++);
  const hoje2 = new Date(); const nextMesKey = new Date(hoje2.getFullYear(), hoje2.getMonth()+1, 1).toISOString().slice(0,7);
  const prevNextMes = PREV_FATURACAO.filter(p=>p.mes===nextMesKey).reduce((s,p)=>s+(p.valor||0),0);
  const prevNextMesObras = new Set(PREV_FATURACAO.filter(p=>p.mes===nextMesKey).map(p=>p.obraId)).size;
  const nextMesLabel = new Date(hoje2.getFullYear(), hoje2.getMonth()+1, 1).toLocaleString('pt-PT',{month:'long',year:'numeric'});
  document.getElementById('co-portfolio').innerHTML = `
    <div class="co-pf-cell"><div class="co-pf-lbl">Carteira contratada</div><div class="co-pf-val">${prodFmtEur(totC)}</div><div class="co-pf-sub">${allStats.length} obra${allStats.length!==1?'s':''} ativa${allStats.length!==1?'s':''}</div></div>
    <div class="co-pf-cell"><div class="co-pf-lbl">Faturado</div><div class="co-pf-val" style="color:oklch(0.55 0.13 155)">${prodFmtEur(totF)}</div><div class="co-pf-sub">${totC>0?((totF/totC)*100).toFixed(1)+'% executado':'—'}</div></div>
    <div class="co-pf-cell"><div class="co-pf-lbl">Custos diretos</div><div class="co-pf-val" style="color:oklch(0.55 0.18 25)">${prodFmtEur(totK)}</div><div class="co-pf-sub">${totF>0?((totK/totF)*100).toFixed(1)+'% sobre faturado':'—'}</div></div>
    <div class="co-pf-cell"><div class="co-pf-lbl">Margem global</div><div class="co-pf-val" style="color:${totM>=0?'oklch(0.55 0.13 155)':'oklch(0.58 0.18 25)'}">${(totM>=0?'+':'')+prodFmtEur(totM)}</div><div class="co-pf-sub"><span class="co-pf-trend" style="background:${totM>=0?'var(--green-bg)':'var(--red-bg)'};color:${totM>=0?'var(--green)':'var(--red)'}">${totMP.toFixed(1)}%</span> margem</div></div>
    <div class="co-pf-cell" style="cursor:pointer" title="Previsão de faturação para ${nextMesLabel}">
      <div class="co-pf-lbl">Prev. mês seguinte</div>
      <div class="co-pf-val" style="color:${prevNextMes>0?'oklch(0.50 0.14 260)':'var(--gray-400)'}">${prevNextMes>0?prodFmtEur(prevNextMes):'—'}</div>
      <div class="co-pf-sub">${prevNextMes>0?prevNextMesObras+' obra'+(prevNextMesObras!==1?'s':''):nextMesLabel}</div>
    </div>
    <div class="co-pf-cell health">
      <div class="co-pf-health">
        <div class="co-pf-lbl">Saúde da carteira</div>
        <div class="co-pf-pills">
          ${Array(counts.ok).fill('<div class="co-pf-pill ok"></div>').join('')}
          ${Array(counts.warn).fill('<div class="co-pf-pill warn"></div>').join('')}
          ${Array(counts.bad).fill('<div class="co-pf-pill bad"></div>').join('')}
        </div>
        <div class="co-pf-counts"><span><b>${counts.ok}</b> ok</span><span><b>${counts.warn}</b> atenção</span><span><b>${counts.bad}</b> alerta</span></div>
      </div>
    </div>`;

  // Update chip counts
  document.querySelector('#co-chips [data-c="all"]').textContent = `(${allStats.length})`;
  document.querySelector('#co-chips [data-c="ok"]').textContent = `(${counts.ok})`;
  document.querySelector('#co-chips [data-c="warn"]').textContent = `(${counts.warn})`;
  document.querySelector('#co-chips [data-c="bad"]').textContent = `(${counts.bad})`;

  // Filter
  const q = (_coState.q||'').toLowerCase().trim();
  const filtered = allStats.filter(s => {
    if(_coState.filter!=='all' && s.status!==_coState.filter) return false;
    if(q){
      const hay = (s.obra.nome+' '+(s.extra.numero||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  // Cards view
  cardsEl.innerHTML = filtered.length ? filtered.map(coBuildCard).join('') : '<div class="co-empty" style="grid-column:1/-1">Nenhuma obra corresponde aos filtros.</div>';

  // Table view
  if(tbody){
    tbody.innerHTML = filtered.length ? filtered.map(coBuildRow).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:32px">Nenhuma obra corresponde aos filtros.</td></tr>';
  }

  // Show correct view container
  document.getElementById('co-list-view').style.display = '';
  document.getElementById('co-cards-view').style.display = _coState.view==='cards' ? '' : 'none';
  document.getElementById('co-table-view').style.display = _coState.view==='table' ? '' : 'none';

  // Wire up tools once
  if(!_coState.wired){
    document.getElementById('co-q').addEventListener('input', e=>{ _coState.q=e.target.value; renderProdDashboard(); });
    document.getElementById('co-chips').addEventListener('click', e=>{
      const b=e.target.closest('.co-chip'); if(!b) return;
      _coState.filter=b.dataset.f;
      document.querySelectorAll('#co-chips .co-chip').forEach(x=>x.classList.toggle('active', x===b));
      renderProdDashboard();
    });
    document.getElementById('co-vt').addEventListener('click', e=>{
      const b=e.target.closest('button[data-view]'); if(!b) return;
      _coState.view=b.dataset.view;
      document.querySelectorAll('#co-vt button').forEach(x=>x.classList.toggle('active', x===b));
      renderProdDashboard();
    });
    _coState.wired = true;
  }

  // Re-render detail if open
  if(_coState.detailObraId){
    const stillThere = allStats.find(s=>s.obra.id===_coState.detailObraId);
    if(stillThere) coRenderDetail(_coState.detailObraId);
    else coGoList();
  }
}

function coBuildCard(s){
  const o=s.obra, ex=s.extra, st=s.status;
  const execClass = st==='bad'?'bad':(st==='warn'?'warn':'');
  const marginColorVal = s.margem>=0 ? 'pos' : 'neg';
  const numTxt = ex.numero ? `Obra Nº ${prodEsc(ex.numero)}` : 'Sem nº';
  const proxTxt = s.proxPrev ? `Próximo: <strong>${prodFmtEur(s.proxPrev.valor)}</strong> · ${coFmtMes(s.proxPrev.mes)}` : (s.ultimoAuto ? `Último auto: <strong>${prodFmtEur(s.ultimoAuto.valor||0)}</strong> · ${coFmtData(s.ultimoAuto.data)}` : 'Sem movimentos registados');
  return `<div class="co-card" onclick="coOpenDetail('${o.id}')">
    <div class="co-card-hd">
      <div class="co-card-hd-top">
        <div class="co-card-num">${numTxt}</div>
        <div class="co-card-status ${st}"><span class="dot"></span>${coStatusLabel(st)}</div>
      </div>
      <div class="co-card-name">${prodEsc(o.nome)}</div>
      ${ex.localizacao ? `<div class="co-card-loc"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>${prodEsc(ex.localizacao)}</div>` : ''}
    </div>
    <div class="co-kpis">
      <div class="co-kpi"><div class="co-kpi-lbl">Contratado</div><div class="co-kpi-val">${s.contratado>0?prodFmtEur(s.contratado):'—'}</div><div class="co-kpi-sub">${s.contratadoPrev>0?'previsão':'sem prev.'}</div></div>
      <div class="co-kpi"><div class="co-kpi-lbl">Faturado</div><div class="co-kpi-val pos">${s.faturado>0?prodFmtEur(s.faturado):'—'}</div><div class="co-kpi-sub">${s.numAutos} auto${s.numAutos!==1?'s':''}</div></div>
      <div class="co-kpi"><div class="co-kpi-lbl">Custos</div><div class="co-kpi-val ${s.custos>0?'neg':''}">${s.custos>0?prodFmtEur(s.custos):'—'}</div><div class="co-kpi-sub">${s.faturado>0?((s.custos/s.faturado)*100).toFixed(0)+'%':'—'}</div></div>
      <div class="co-kpi"><div class="co-kpi-lbl">Margem</div><div class="co-kpi-val ${marginColorVal}">${s.faturado>0?(s.margem>=0?'+':'')+prodFmtEur(s.margem):'—'}</div><div class="co-kpi-sub">${s.faturado>0?s.margemPct.toFixed(1)+'%':'—'}</div></div>
    </div>
    <div class="co-prog-wrap">
      <div class="co-prog">
        <div class="co-prog-head">
          <span class="co-prog-lbl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Tempo decorrido</span>
          <span class="co-prog-val">${s.tempoPct.toFixed(0)}%</span>
        </div>
        <div class="co-bar"><div class="co-bar-fill time" style="width:${s.tempoPct}%"></div></div>
        <div class="co-prog-meta">${ex.dataInicio?coFmtData(ex.dataInicio)+' → '+(s.fim?coFmtData(s.fim):'—'):'Datas não definidas'}${s.diasRest!==null?' · '+(s.diasRest>=0?s.diasRest+' dias restantes':Math.abs(s.diasRest)+' dias em atraso'):''}</div>
      </div>
      <div class="co-prog">
        <div class="co-prog-head">
          <span class="co-prog-lbl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M5 9l7-7 7 7"/></svg>Execução financeira</span>
          <span class="co-prog-val">${s.contratado>0?s.execPct.toFixed(0)+'%':'—'}</span>
        </div>
        <div class="co-bar">
          <div class="co-bar-fill exec ${execClass}" style="width:${s.execPct}%"></div>
          ${s.tempoPct>0?`<div class="co-bar-marker" style="left:${s.tempoPct}%" title="Onde devia estar (face ao tempo)"></div>`:''}
        </div>
        <div class="co-prog-meta">${s.contratado>0?prodFmtEur(s.faturado)+' de '+prodFmtEur(s.contratado):'Sem contratado definido'}</div>
      </div>
    </div>
    <div class="co-card-ft">
      <div class="co-next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span>${proxTxt}</span></div>
      <span class="co-open">Abrir <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></span>
    </div>
  </div>`;
}

function coBuildRow(s){
  const o=s.obra, ex=s.extra, st=s.status;
  const hNxt = new Date(); hNxt.setMonth(hNxt.getMonth()+1);
  const nxtKey = hNxt.toISOString().slice(0,7);
  const prevNxt = PREV_FATURACAO.filter(p=>p.obraId===o.id && p.mes===nxtKey).reduce((x,p)=>x+(p.valor||0),0);
  return `<tr onclick="coOpenDetail('${o.id}')">
    <td><div class="name-cell"><b>${prodEsc(o.nome)}</b><span>${ex.numero?'Nº '+prodEsc(ex.numero):'sem nº'}${ex.localizacao?' · '+prodEsc(ex.localizacao):''}</span></div></td>
    <td><span class="status-pill ${st}"><span class="dot"></span>${coStatusLabel(st)}</span></td>
    <td class="num-col">${s.contratado>0?prodFmtEur(s.contratado):'—'}</td>
    <td class="num-col pos">${s.faturado>0?prodFmtEur(s.faturado):'—'}</td>
    <td><span class="mini-bar"><span class="mini-bar-fill" style="width:${s.execPct}%"></span></span><span class="pct">${s.contratado>0?s.execPct.toFixed(0)+'%':'—'}</span></td>
    <td class="num-col ${s.margem>=0?'pos':'neg'}">${s.faturado>0?(s.margem>=0?'+':'')+prodFmtEur(s.margem):'—'}<div style="font-size:10px;color:var(--gray-400);font-weight:500">${s.faturado>0?s.margemPct.toFixed(1)+'%':''}</div></td>
    <td class="num-col" style="color:${prevNxt>0?'oklch(0.50 0.14 260)':'var(--gray-300)'}">${prevNxt>0?prodFmtEur(prevNxt):'—'}</td>
    <td><div style="font-size:11.5px;color:var(--gray-700)">${ex.dataInicio?coFmtData(ex.dataInicio):'—'}</div><div style="font-size:10.5px;color:var(--gray-400)">${s.fim?'até '+coFmtData(s.fim):(ex.prazoExecucao||'—')}</div></td>
    <td style="text-align:right"><span class="co-open">→</span></td>
  </tr>`;
}

function coOpenDetail(obraId){
  _coState.detailObraId = obraId;
  document.getElementById('co-list-view').style.display='none';
  document.getElementById('co-list-hdr').style.display='none';
  document.getElementById('co-detail').classList.add('show');
  coRenderDetail(obraId);
  window.scrollTo({top:0,behavior:'smooth'});
}
function coGoList(){
  _coState.detailObraId = null;
  document.getElementById('co-detail').classList.remove('show');
  document.getElementById('co-list-view').style.display='';
  document.getElementById('co-list-hdr').style.display='';
}

function coRenderDetail(obraId){
  const o = OBRAS.find(x=>x.id===obraId); if(!o) return;
  const s = coComputeStats(o);
  document.getElementById('co-dt-crumb').textContent = o.nome;
  document.getElementById('co-dt-num').textContent = s.extra.numero ? `OBRA Nº ${s.extra.numero}` : 'SEM Nº';
  document.getElementById('co-dt-name').textContent = o.nome;
  document.getElementById('co-dt-loc').textContent = s.extra.localizacao || (s.extra.dataInicio?`Início ${coFmtData(s.extra.dataInicio)}`:'Localização não definida');
  const stEl = document.getElementById('co-dt-status');
  stEl.className = 'co-hero-status '+s.status;
  document.getElementById('co-dt-status-txt').textContent = coStatusLabel(s.status);
  document.getElementById('co-dt-k-contr').textContent = s.contratado>0?prodFmtEur(s.contratado):'—';
  document.getElementById('co-dt-k-contr-sub').textContent = s.contratadoPrev>0?'soma de previsões':'sem previsões';
  document.getElementById('co-dt-k-fat').textContent = s.faturado>0?prodFmtEur(s.faturado):'—';
  document.getElementById('co-dt-k-fat-sub').textContent = `${s.numAutos} auto${s.numAutos!==1?'s':''}`;
  document.getElementById('co-dt-k-cust').textContent = s.custos>0?prodFmtEur(s.custos):'—';
  const margeEl = document.getElementById('co-dt-k-marg');
  margeEl.textContent = s.faturado>0?(s.margem>=0?'+':'')+prodFmtEur(s.margem):'—';
  margeEl.style.color = s.faturado>0 ? (s.margem>=0?'#c8f5dd':'#ffd1d1') : '';
  document.getElementById('co-dt-k-marg-sub').textContent = s.faturado>0?s.margemPct.toFixed(1)+'% sobre faturado':'—';
  document.getElementById('co-dt-k-exec').textContent = s.contratado>0?s.execPct.toFixed(0)+'%':'—';
  document.getElementById('co-dt-k-exec-sub').textContent = s.tempoPct>0?'tempo: '+s.tempoPct.toFixed(0)+'%':'sem prazo definido';

  // Hero buttons
  document.getElementById('co-dt-edit').onclick = ()=>openObraExtraModal(obraId);
  document.getElementById('co-dt-newauto').onclick = ()=>openAutoModalForObra(obraId);
  document.getElementById('co-dt-newprev').onclick = ()=>openPrevFatModalForObra(obraId);
  document.getElementById('co-dt-import').onclick = ()=>obraImportCustos(obraId);
  // Panel buttons
  const nb2 = document.getElementById('co-dt-newauto2');
  if(nb2) nb2.onclick = ()=>openAutoModalForObra(obraId);
  const np2 = document.getElementById('co-dt-newprev2');
  if(np2) np2.onclick = ()=>openPrevFatModalForObra(obraId);

  // Balanço mensal
  const months = new Set();
  CUSTOS_FATURAS.filter(f=>f.obraId===obraId).forEach(f=>{ if(f.mesKey) months.add(f.mesKey); });
  s.autosAll.forEach(a=>{ const m=(a.data||'').slice(0,7); if(m) months.add(m); });
  const monthsArr = [...months].sort();
  const last = monthsArr.slice(-12);
  const cByM = {}, rByM = {};
  CUSTOS_FATURAS.filter(f=>f.obraId===obraId).forEach(f=>{ if(f.mesKey){ cByM[f.mesKey]=(cByM[f.mesKey]||0)+(f.custos||0); }});
  s.autosAll.forEach(a=>{ const m=(a.data||'').slice(0,7); if(m){ rByM[m]=(rByM[m]||0)+(a.valor||0); }});
  const max = Math.max(1, ...last.map(m=>Math.max(cByM[m]||0, rByM[m]||0)));
  const balEl = document.getElementById('co-dt-bal');
  balEl.innerHTML = last.length ? last.map(m=>{
    const c=cByM[m]||0, r=rByM[m]||0;
    const ch=Math.max(2,(c/max)*120), rh=Math.max(2,(r/max)*120);
    return `<div class="co-bal-col"><div class="co-bal-bars"><div class="co-bal-bar cost" style="height:${ch}px" title="Custos: ${prodFmtEur(c)}"></div><div class="co-bal-bar rev" style="height:${rh}px" title="Proveitos: ${prodFmtEur(r)}"></div></div>${coFmtMesShort(m)}</div>`;
  }).join('') : '<div style="color:var(--gray-400);font-size:13px;text-align:center;width:100%;align-self:center">Sem movimentos para representar.</div>';

  // Pivot
  document.getElementById('co-dt-pivot-wrap').innerHTML = coBuildDetailPivot(obraId);

  // Autos list (todos os tipos)
  const autosAllSorted = AUTOS_MEDICAO.filter(a=>a.obraId===obraId).slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const autosEl = document.getElementById('co-dt-autos');
  autosEl.innerHTML = autosAllSorted.length ? autosAllSorted.map(a=>`
    <div class="co-auto">
      <div class="co-auto-tag" style="background:${a.tipo==='complementar'?'var(--orange-bg)':'var(--blue-50)'};color:${a.tipo==='complementar'?'var(--orange)':'var(--blue-700)'}">${prodEsc(a.numero||'AM')}</div>
      <div class="co-auto-info"><b>${coFmtData(a.data)}</b><span>${prodEsc(a.descricao||'sem descrição')}${a.tipo==='complementar'?' <em style="color:var(--orange);font-style:normal">(Compl.)</em>':''}</span></div>
      <div class="co-auto-val">${prodFmtEur(a.valor||0)}</div>
      <div class="co-auto-actions">
        <button class="co-auto-btn edit" onclick="editAutoFromDetail('${a.id}','${obraId}')">✎</button>
        <button class="co-auto-btn del" onclick="deleteAutoFromDetail('${a.id}','${obraId}')">✕</button>
      </div>
    </div>`).join('') : '<div style="color:var(--gray-400);font-size:13px;text-align:center;padding:18px 0">Sem autos registados. Use o botão "Novo auto" acima.</div>';

  // Previsões de faturação por obra
  const prevsEl = document.getElementById('co-dt-prevs');
  if(prevsEl){
    const obraPrevs = PREV_FATURACAO.filter(p=>p.obraId===obraId).slice().sort((a,b)=>(a.mes||'').localeCompare(b.mes||''));
    const hoje = new Date(); const nextMes = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1).toISOString().slice(0,7);
    if(obraPrevs.length){
      prevsEl.innerHTML = obraPrevs.map(p=>{
        const isNext = p.mes===nextMes;
        const isPast = p.mes < hoje.toISOString().slice(0,7);
        return `<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:11px 0;border-bottom:1px dashed var(--gray-100);align-items:center">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--gray-900);display:flex;align-items:center;gap:6px">${coFmtMes(p.mes)}${isNext?'<span style="background:#FEF3C7;color:#B45309;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px">Mês seguinte</span>':''}${isPast?'<span style="background:var(--gray-100);color:var(--gray-400);font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px">Passado</span>':''}</div>
            ${p.notas?`<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${prodEsc(p.notas)}</div>`:''}
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;color:oklch(0.55 0.13 155)">${prodFmtEur(p.valor)}</div>
          <div style="display:flex;gap:4px">
            <button class="co-auto-btn edit" onclick="editPrevFatFromDetail('${p.id}','${obraId}')">✎</button>
            <button class="co-auto-btn del" onclick="deletePrevFatFromDetail('${p.id}','${obraId}')">✕</button>
          </div>
        </div>`;
      }).join('') + `<div style="font-size:11px;color:var(--gray-500);padding-top:10px;font-family:'DM Mono',monospace">Total: ${prodFmtEur(obraPrevs.reduce((s,p)=>s+(p.valor||0),0))}</div>`;
    } else {
      prevsEl.innerHTML = '<div style="color:var(--gray-400);font-size:13px;text-align:center;padding:18px 0">Sem previsões registadas. Use o botão "Nova" acima.</div>';
    }
  }

  // Meta lateral
  const metaEl = document.getElementById('co-dt-meta');
  metaEl.innerHTML = `
    <div class="co-meta-row"><span class="co-meta-lbl">Início</span><span class="co-meta-val">${coFmtData(s.extra.dataInicio)}</span></div>
    <div class="co-meta-row"><span class="co-meta-lbl">Prazo execução</span><span class="co-meta-val">${prodEsc(s.extra.prazoExecucao||'—')}</span></div>
    <div class="co-meta-row"><span class="co-meta-lbl">Fim previsto</span><span class="co-meta-val">${s.fim?coFmtData(s.fim):'—'}</span></div>
    <div class="co-meta-row"><span class="co-meta-lbl">Dias restantes</span><span class="co-meta-val" style="color:${s.diasRest!==null && s.diasRest<0?'oklch(0.58 0.18 25)':'var(--gray-900)'}">${s.diasRest===null?'—':(s.diasRest>=0?s.diasRest:'-'+Math.abs(s.diasRest))}</span></div>
    <div class="co-meta-row"><span class="co-meta-lbl">Total previsões</span><span class="co-meta-val">${prodFmtEur(PREV_FATURACAO.filter(p=>p.obraId===obraId).reduce((x,p)=>x+(p.valor||0),0))}</span></div>
    <div class="co-meta-row"><span class="co-meta-lbl">Próxima previsão</span><span class="co-meta-val" style="${s.proxPrev?'color:oklch(0.50 0.14 260);font-weight:700':''}">${s.proxPrev?prodFmtEur(s.proxPrev.valor)+' · '+coFmtMes(s.proxPrev.mes):'—'}</span></div>
    <div class="co-dropzone" onclick="obraImportCustos('${obraId}')" ondragover="event.preventDefault();this.style.background='var(--blue-100)'" ondragleave="this.style.background=''" ondrop="obraCustosHandleDrop(event,'${obraId}')">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;display:block;margin:0 auto 5px"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      Arraste o Excel ou clique para importar custos<br><span style="font-size:10.5px;opacity:.7">.xlsx · .xls</span>
    </div>
    ${s.custos>0?`<button class="btn btn-sm" style="color:var(--red);background:var(--red-bg);border:1px solid #fca5a5;font-size:11px;width:100%" onclick="clearCustoObra('${obraId}')">Limpar custos desta obra</button>`:''}
  `;
}

function coBuildDetailPivot(obraId){
  const rows = CUSTOS_FATURAS.filter(f => f.obraId === obraId);
  if(rows.length === 0) return '<div style="color:var(--gray-400);font-size:13px;padding:20px 0;text-align:center">Sem custos importados — use o painel ao lado para fazer upload do Excel.</div>';
  const monthsSet = new Set(); rows.forEach(f => { if(f.mesKey) monthsSet.add(f.mesKey); });
  const months = [...monthsSet].sort();
  const pivot = {}; CUSTO_GRUPOS_ORDER.forEach(g => { pivot[g]={}; months.forEach(m=>{ pivot[g][m]=0; }); });
  rows.forEach(f => { if(CUSTO_GRUPOS_ORDER.includes(f.grupoArtigo)){ pivot[f.grupoArtigo][f.mesKey]=(pivot[f.grupoArtigo][f.mesKey]||0)+(f.custos||0); } });
  let t = '<table class="co-pivot"><thead><tr><th>Grupo</th>';
  months.forEach(m => { t += `<th>${coFmtMesShort(m)}</th>`; });
  t += '<th style="color:var(--gray-700)">Total</th></tr></thead><tbody>';
  const colTot = {}; months.forEach(m=>{ colTot[m]=0; }); let grand=0;
  CUSTO_GRUPOS_ORDER.forEach(g => {
    let rowTot=0; let cells='';
    months.forEach(m => { const v=pivot[g][m]||0; rowTot+=v; colTot[m]+=v; cells += v>0.01?`<td>${prodFmtEur(v)}</td>`:'<td class="zero">—</td>'; });
    grand+=rowTot;
    if(rowTot>0.01) t += `<tr><td>${custoGrupoLabel(g)}</td>${cells}<td style="font-weight:700;color:var(--gray-900)">${prodFmtEur(rowTot)}</td></tr>`;
  });
  t += '<tr class="total"><td>TOTAL</td>';
  months.forEach(m => { const v=colTot[m]||0; t += v>0.01?`<td>${prodFmtEur(v)}</td>`:'<td class="zero">—</td>'; });
  t += `<td>${prodFmtEur(grand)}</td></tr></tbody></table>`;
  return t;
}

// Mantido por compatibilidade — o cartão antigo já não é usado, mas algumas chamadas legadas podem invocá-lo
function buildObraCard(o){ return ''; }

function buildObraPivot(obraId){
  const rows = CUSTOS_FATURAS.filter(f => f.obraId === obraId);
  if(rows.length === 0) return '<div style="font-size:12px;color:rgba(30,64,175,.5);padding:4px 0;margin-top:6px">Sem custos importados para esta obra.</div>';
  const monthsSet = new Set(); rows.forEach(f => { if(f.mesKey) monthsSet.add(f.mesKey); });
  const months = [...monthsSet].sort();
  const fmtM = ym => { const [y,m]=ym.split('-'); const ns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return (ns[parseInt(m)-1]||m)+"'"+y.slice(2); };
  const pivot = {}; CUSTO_GRUPOS_ORDER.forEach(g => { pivot[g]={}; months.forEach(m=>{ pivot[g][m]=0; }); });
  rows.forEach(f => { if(CUSTO_GRUPOS_ORDER.includes(f.grupoArtigo)){ pivot[f.grupoArtigo][f.mesKey]=(pivot[f.grupoArtigo][f.mesKey]||0)+(f.custos||0); } });
  let t = '<div style="overflow-x:auto;margin-top:10px;border-radius:6px;border:1px solid var(--blue-200)"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:280px"><thead><tr><th style="background:var(--blue-800);color:#fff;padding:6px 10px;text-align:left">Grupo</th>';
  months.forEach(m => { t += '<th style="background:var(--blue-800);color:#fff;padding:6px 8px;text-align:right;white-space:nowrap">' + fmtM(m) + '</th>'; });
  t += '<th style="background:var(--blue-700);color:#fff;padding:6px 8px;text-align:right;font-weight:700">Total</th></tr></thead><tbody>';
  const colTot = {}; months.forEach(m=>{ colTot[m]=0; }); let grand=0;
  CUSTO_GRUPOS_ORDER.forEach(g => {
    let rowTot=0; t += '<tr><td style="padding:5px 10px;font-weight:600;color:var(--gray-800);background:var(--gray-50)">' + custoGrupoLabel(g) + '</td>';
    months.forEach(m => { const v=pivot[g][m]||0; rowTot+=v; colTot[m]=(colTot[m]||0)+v; t+=v>0.01?'<td style="padding:5px 8px;text-align:right">'+prodFmtEur(v)+'</td>':'<td style="padding:5px 8px;text-align:right;color:#d1d5db">—</td>'; });
    grand+=rowTot; t += '<td style="padding:5px 8px;text-align:right;font-weight:700;background:var(--gray-50)">' + (rowTot>0.01?prodFmtEur(rowTot):'—') + '</td></tr>';
  });
  t += '<tr style="font-weight:700;background:var(--blue-50)"><td style="padding:5px 10px;color:var(--blue-900)">TOTAL</td>';
  months.forEach(m => { const v=colTot[m]||0; t+=v>0.01?'<td style="padding:5px 8px;text-align:right;color:var(--blue-800)">'+prodFmtEur(v)+'</td>':'<td style="padding:5px 8px;text-align:right;color:#d1d5db">—</td>'; });
  t += '<td style="padding:5px 8px;text-align:right;color:var(--blue-800)">' + prodFmtEur(grand) + '</td></tr></tbody></table></div>';
  return t;
}

function toggleAutosMes(obraId){ const el=document.getElementById('autos-mes-'+obraId); if(el) el.style.display=el.style.display==='none'?'block':'none'; }
function toggleCustosPanel(obraId){ const el=document.getElementById('custos-panel-'+obraId); if(!el) return; const open=el.style.display!=='none'; el.style.display=open?'none':'block'; _custoCardObraId=open?null:obraId; }

function openAutoModalForObra(obraId){
  openAutoModal();
  setTimeout(() => { const sel=document.getElementById('mam-obra'); if(sel) sel.value=obraId; }, 80);
}

function openPrevFatModalForObra(obraId){
  openPrevFatModal();
  setTimeout(() => {
    const sel=document.getElementById('mpf-obra'); if(sel) sel.value=obraId;
    const mesEl=document.getElementById('mpf-mes'); if(mesEl){ const d=new Date(); d.setMonth(d.getMonth()+1); mesEl.value=d.toISOString().slice(0,7); }
  }, 80);
}

function editAutoFromDetail(id, obraId){
  editAuto(id);
}

function deleteAutoFromDetail(id, obraId){
  if(!confirm('Eliminar este auto de medição?')) return;
  AUTOS_MEDICAO = AUTOS_MEDICAO.filter(a=>a.id!==id);
  saveProdLocal();
  if(_coState.detailObraId) coRenderDetail(_coState.detailObraId);
  renderAutos();
  showToast('Auto eliminado');
}

function editPrevFatFromDetail(id, obraId){
  editPrevFat(id);
}

function deletePrevFatFromDetail(id, obraId){
  if(!confirm('Eliminar esta previsão de faturação?')) return;
  PREV_FATURACAO = PREV_FATURACAO.filter(p=>p.id!==id);
  saveProdLocal();
  if(_coState.detailObraId) coRenderDetail(_coState.detailObraId);
  renderPrevFat();
  showToast('Previsão eliminada');
}

function obraImportCustos(obraId){ _custoCardObraId=obraId; document.getElementById('custo-file-input').click(); }
function obraCustosHandleDrop(e, obraId){ e.preventDefault(); _custoCardObraId=obraId; const f=e.dataTransfer?e.dataTransfer.files[0]:null; if(f) parseCustoExcel(f); }

// ── Modal editar obra extra ─────────────────────────────────────────────
function openObraExtraModal(obraId){
  const obra=OBRAS.find(o=>o.id===obraId); const extra=OBRAS_EXTRA[obraId]||{};
  document.getElementById('oex-id').value        = obraId;
  document.getElementById('oex-nome').textContent = obra?obra.nome:obraId;
  document.getElementById('oex-numero').value     = extra.numero||'';
  document.getElementById('oex-inicio').value     = extra.dataInicio||'';
  document.getElementById('oex-prazo').value      = extra.prazoExecucao||'';
  document.getElementById('modal-oex').classList.add('open');
}
function saveObraExtra(){
  const id=document.getElementById('oex-id').value;
  OBRAS_EXTRA[id]={ numero:document.getElementById('oex-numero').value.trim(), dataInicio:document.getElementById('oex-inicio').value, prazoExecucao:document.getElementById('oex-prazo').value.trim() };
  _saveObrasExtra(); closeModal('modal-oex'); renderProdDashboard(); showToast('Dados da obra atualizados');
}

// ─────────────────────────────────────────
//  SUBSECÇÃO 1 — PREVISÕES DE FATURAÇÃO
// ─────────────────────────────────────────
let _editPrevId = null;

function renderPrevFat(){
  const totalPrev = PREV_FATURACAO.reduce((s,p) => s + (p.valor||0), 0);
  const obrasSet  = new Set(PREV_FATURACAO.map(p => p.obraId));
  document.getElementById('prev-k-total').textContent  = prodFmtEur(totalPrev);
  document.getElementById('prev-k-obras').textContent  = obrasSet.size;
  document.getElementById('prev-k-meses').textContent  = PREV_FATURACAO.length;

  const tbody = document.getElementById('prev-tbody');
  tbody.innerHTML = '';
  const isEmpty = PREV_FATURACAO.length === 0;
  document.getElementById('prev-empty').style.display = isEmpty ? 'block' : 'none';
  if(isEmpty) return;

  // Agrupar por obra
  const byObra = {};
  PREV_FATURACAO.forEach(p => {
    if(!byObra[p.obraId]) byObra[p.obraId] = { nome: p.obraNome, items: [] };
    byObra[p.obraId].items.push(p);
  });

  Object.entries(byObra).forEach(([obraId, group]) => {
    const totalObra = group.items.reduce((s,p) => s + (p.valor||0), 0);
    const trh = document.createElement('tr');
    trh.className = 'cmp-group-row';
    trh.innerHTML = `<td colspan="5">${prodEsc(group.nome)} &mdash; Total: <strong>${prodFmtEur(totalObra)}</strong></td>`;
    tbody.appendChild(trh);

    group.items.sort((a,b) => (a.mes||'').localeCompare(b.mes||'')).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${prodEsc(p.obraNome)}</td>
        <td>${prodFmtMes(p.mes)}</td>
        <td class="fat-amount">${prodFmtEur(p.valor)}</td>
        <td style="color:var(--gray-500);font-size:12px">${prodEsc(p.notas||'—')}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="editPrevFat('${p.id}')">Editar</button>
          <button class="btn btn-sm" style="color:var(--red);background:var(--red-bg);border:1px solid #fca5a5;margin-left:4px" onclick="deletePrevFat('${p.id}')">✕</button>
        </td>`;
      tbody.appendChild(tr);
    });
  });
}

function openPrevFatModal(id){
  _editPrevId = id || null;
  const p = id ? PREV_FATURACAO.find(x => x.id === id) : null;
  const sel = document.getElementById('mpf-obra');
  sel.innerHTML = '<option value="">— Selecionar obra —</option>' +
    OBRAS.filter(o => o.ativa !== false).map(o => `<option value="${o.id}">${prodEsc(o.nome)}</option>`).join('');
  if(p){ sel.value = p.obraId; }
  const _defMes = ()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,7); };
  document.getElementById('mpf-mes').value   = p ? p.mes   : _defMes();
  document.getElementById('mpf-valor').value = p ? p.valor : '';
  document.getElementById('mpf-notas').value = p ? (p.notas||'') : '';
  document.getElementById('modal-prev-fat-title').textContent = p ? 'Editar previsão' : 'Nova previsão de faturação';
  document.getElementById('modal-prev-fat').classList.add('open');
}

function editPrevFat(id){ openPrevFatModal(id); }

function savePrevFat(){
  const obraId = document.getElementById('mpf-obra').value;
  const mes    = document.getElementById('mpf-mes').value;
  const valor  = parseFloat(document.getElementById('mpf-valor').value);
  const notas  = document.getElementById('mpf-notas').value.trim();
  if(!obraId){ showToast('Selecione uma obra'); return; }
  if(!mes)   { showToast('Indique o mês'); return; }
  if(isNaN(valor)||valor<0){ showToast('Valor inválido'); return; }
  const obraNome = (OBRAS.find(o=>o.id===obraId)||{}).nome || obraId;
  if(_editPrevId){
    const idx = PREV_FATURACAO.findIndex(p=>p.id===_editPrevId);
    if(idx>=0) PREV_FATURACAO[idx] = {...PREV_FATURACAO[idx], obraId, obraNome, mes, valor, notas};
  } else {
    PREV_FATURACAO.push({ id:'PF'+Date.now().toString(36).toUpperCase(), obraId, obraNome, mes, valor, notas, criadoEm: new Date().toISOString() });
  }
  saveProdLocal();
  closeModal('modal-prev-fat');
  renderPrevFat();
  if(_coState.detailObraId) coRenderDetail(_coState.detailObraId);
  showToast('Previsão guardada');
}

function deletePrevFat(id){
  if(!confirm('Eliminar esta previsão?')) return;
  PREV_FATURACAO = PREV_FATURACAO.filter(p=>p.id!==id);
  saveProdLocal();
  renderPrevFat();
  if(_coState.detailObraId) coRenderDetail(_coState.detailObraId);
  showToast('Previsão eliminada');
}

// ─────────────────────────────────────────
//  SUBSECÇÃO 2 — AUTOS DE MEDIÇÃO
// ─────────────────────────────────────────
let _autoSubTab = 'contratual';
let _editAutoId = null;

function autoGoTab(tipo){
  _autoSubTab = tipo;
  document.querySelectorAll('.auto-tab').forEach(t => t.classList.toggle('active', t.dataset.tipo === tipo));
  renderAutos();
}

function renderAutos(){
  const filtered = AUTOS_MEDICAO.filter(a => a.tipo === _autoSubTab);
  const totalVal = filtered.reduce((s,a) => s + (a.valor||0), 0);
  const obrasSet = new Set(filtered.map(a => a.obraId));
  document.getElementById('auto-k-total').textContent = prodFmtEur(totalVal);
  document.getElementById('auto-k-count').textContent = filtered.length;
  document.getElementById('auto-k-obras').textContent = obrasSet.size;

  const tbody = document.getElementById('auto-tbody');
  tbody.innerHTML = '';
  const isEmpty = filtered.length === 0;
  document.getElementById('auto-empty').style.display = isEmpty ? 'block' : 'none';
  if(isEmpty) return;

  // Agrupar por obra
  const byObra = {};
  filtered.forEach(a => {
    if(!byObra[a.obraId]) byObra[a.obraId] = { nome: a.obraNome, items: [] };
    byObra[a.obraId].items.push(a);
  });

  Object.entries(byObra).forEach(([obraId, group]) => {
    const totalObra = group.items.reduce((s,a) => s + (a.valor||0), 0);
    const trh = document.createElement('tr');
    trh.className = 'cmp-group-row';
    trh.innerHTML = `<td colspan="6">${prodEsc(group.nome)} &mdash; Total: <strong>${prodFmtEur(totalObra)}</strong></td>`;
    tbody.appendChild(trh);

    group.items.sort((a,b) => (a.data||'').localeCompare(b.data||'')).forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500">${prodEsc(a.obraNome)}</td>
        <td><span class="badge b-blue">${prodEsc(a.numero||'—')}</span></td>
        <td>${prodFmtData(a.data)}</td>
        <td class="fat-amount" style="color:var(--green)">${prodFmtEur(a.valor)}</td>
        <td style="color:var(--gray-500);font-size:12px">${prodEsc(a.descricao||'—')}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="editAuto('${a.id}')">Editar</button>
          <button class="btn btn-sm" style="color:var(--red);background:var(--red-bg);border:1px solid #fca5a5;margin-left:4px" onclick="deleteAuto('${a.id}')">✕</button>
        </td>`;
      tbody.appendChild(tr);
    });
  });
}

function openAutoModal(id){
  _editAutoId = id || null;
  const a = id ? AUTOS_MEDICAO.find(x=>x.id===id) : null;
  const sel = document.getElementById('mam-obra');
  sel.innerHTML = '<option value="">— Selecionar obra —</option>' +
    OBRAS.filter(o=>o.ativa!==false).map(o=>`<option value="${o.id}">${prodEsc(o.nome)}</option>`).join('');
  document.getElementById('mam-tipo').value  = a ? a.tipo   : _autoSubTab;
  if(a){ sel.value = a.obraId; }
  document.getElementById('mam-num').value   = a ? (a.numero||'')   : '';
  document.getElementById('mam-data').value  = a ? a.data            : new Date().toISOString().slice(0,10);
  document.getElementById('mam-valor').value = a ? a.valor           : '';
  document.getElementById('mam-desc').value  = a ? (a.descricao||'') : '';
  document.getElementById('modal-auto-title').textContent = a ? 'Editar auto de medição' : 'Novo auto de medição';
  document.getElementById('modal-auto').classList.add('open');
}

function editAuto(id){ openAutoModal(id); }

function saveAuto(){
  const obraId   = document.getElementById('mam-obra').value;
  const tipo     = document.getElementById('mam-tipo').value;
  const numero   = document.getElementById('mam-num').value.trim();
  const data     = document.getElementById('mam-data').value;
  const valor    = parseFloat(document.getElementById('mam-valor').value);
  const descricao= document.getElementById('mam-desc').value.trim();
  if(!obraId){ showToast('Selecione uma obra'); return; }
  if(!data)  { showToast('Indique a data'); return; }
  if(isNaN(valor)||valor<0){ showToast('Valor inválido'); return; }
  const obraNome = (OBRAS.find(o=>o.id===obraId)||{}).nome || obraId;
  if(_editAutoId){
    const idx = AUTOS_MEDICAO.findIndex(a=>a.id===_editAutoId);
    if(idx>=0) AUTOS_MEDICAO[idx] = {...AUTOS_MEDICAO[idx], obraId, obraNome, tipo, numero, data, valor, descricao};
  } else {
    AUTOS_MEDICAO.push({ id:'AM'+Date.now().toString(36).toUpperCase(), obraId, obraNome, tipo, numero, data, valor, descricao, criadoEm: new Date().toISOString() });
  }
  saveProdLocal();
  closeModal('modal-auto');
  renderAutos();
  if(_coState.detailObraId) coRenderDetail(_coState.detailObraId);
  showToast('Auto de medição guardado');
}

function deleteAuto(id){
  if(!confirm('Eliminar este auto de medição?')) return;
  AUTOS_MEDICAO = AUTOS_MEDICAO.filter(a=>a.id!==id);
  saveProdLocal();
  renderAutos();
  if(_coState && _coState.detailObraId) coRenderDetail(_coState.detailObraId);
  showToast('Auto eliminado');
}

// ─────────────────────────────────────────
//  SUBSECÇÃO 3 — CONTROLO DE CUSTOS
// ─────────────────────────────────────────
function renderCustos(){
  const totalCusto  = CUSTOS_FATURAS.reduce((s,f) => s + (f.custos||0), 0);
  const totalProv   = AUTOS_MEDICAO.reduce((s,a) => s + (a.valor||0), 0);
  const balanco     = totalProv - totalCusto;
  const isPositive  = balanco >= 0;

  document.getElementById('custo-k-fat').textContent  = prodFmtEur(totalCusto);
  document.getElementById('custo-k-prov').textContent = prodFmtEur(totalProv);
  const balEl = document.getElementById('custo-k-bal');
  balEl.textContent  = prodFmtEur(Math.abs(balanco));
  balEl.style.color  = isPositive ? 'var(--green)' : 'var(--red)';
  const lblEl = document.getElementById('custo-k-bal-label');
  lblEl.textContent  = isPositive ? 'Resultado Positivo' : 'Resultado Negativo';
  lblEl.style.color  = isPositive ? 'var(--green)' : 'var(--red)';

  // Atualizar dashboard (cards)
  renderProdDashboard();

  // Gráfico balanço mensal
  renderBalancoChart();
}

function clearCustoFaturas(){
  if(CUSTOS_FATURAS.length===0){ showToast('Sem registos para limpar'); return; }
  if(!confirm('Limpar todos os custos importados?')) return;
  CUSTOS_FATURAS = [];
  saveProdLocal();
  renderCustos();
  showToast('Registos removidos');
}

function clearCustoObra(obraId){
  if(!confirm('Limpar custos desta obra?')) return;
  CUSTOS_FATURAS = CUSTOS_FATURAS.filter(f => f.obraId !== obraId);
  saveProdLocal();
  renderProdDashboard();
  showToast('Custos da obra removidos');
}

// ── Balanço por Obra ─────────────────────────────────────────────────────
function renderCustoObras(){
  const emptyEl = document.getElementById('custo-obras-empty');
  const wrapEl  = document.getElementById('custo-obras-wrap');
  const tbody   = document.getElementById('custo-obras-tbody');
  if(!tbody) return;

  // Agregar custos por obra
  const byObra = {};
  CUSTOS_FATURAS.forEach(f => {
    const key = f.obraId || '__sem__';
    if(!byObra[key]) byObra[key] = { nome: f.obraNome || '(sem obra)', custos: 0, proveitos: 0 };
    byObra[key].custos += (f.custos || 0);
  });
  // Adicionar proveitos dos autos de medição
  AUTOS_MEDICAO.forEach(a => {
    const key = a.obraId || '__sem__';
    if(!byObra[key]) byObra[key] = { nome: a.obraNome || '(sem obra)', custos: 0, proveitos: 0 };
    byObra[key].proveitos += (a.valor || 0);
  });

  const entries = Object.entries(byObra);
  if(entries.length === 0){
    if(emptyEl) emptyEl.style.display = 'block';
    if(wrapEl)  wrapEl.style.display  = 'none';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';
  if(wrapEl)  wrapEl.style.display  = 'block';

  tbody.innerHTML = '';
  entries.sort((a,b) => a[1].nome.localeCompare(b[1].nome)).forEach(([obraId, d]) => {
    const res = d.proveitos - d.custos;
    const isPos = res >= 0;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--gray-100)';
    tr.innerHTML =
      '<td style="padding:9px 14px;font-weight:600;color:var(--gray-900)">' + prodEsc(d.nome) + '</td>' +
      '<td style="padding:9px 14px;text-align:right;color:var(--red)">' + prodFmtEur(d.custos) + '</td>' +
      '<td style="padding:9px 14px;text-align:right;color:var(--green)">' + prodFmtEur(d.proveitos) + '</td>' +
      '<td style="padding:9px 14px;text-align:right;font-weight:700;color:' + (isPos ? 'var(--green)' : 'var(--red)') + '">' +
        (isPos ? '+' : '') + prodFmtEur(res) + '</td>' +
      '<td style="padding:9px 6px;text-align:center">' +
        (obraId !== '__sem__' ? '<button class="btn btn-sm" style="color:var(--red);background:var(--red-bg);border:1px solid #fca5a5;padding:3px 8px" onclick="clearCustoObra(\'' + obraId + '\')">✕</button>' : '') +
      '</td>';
    tbody.appendChild(tr);
  });
}

// ── Pobrar select de obras no tab custos ─────────────────────────────────
function populateCustoObraSelect(){
  const sel = document.getElementById('custo-obra-sel');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Selecionar obra —</option>' +
    OBRAS.filter(o => o.ativa !== false).map(o => '<option value="' + o.id + '">' + prodEsc(o.nome) + '</option>').join('');
  if(cur) sel.value = cur;
}

// ── Gráfico de balanço mensal ─────
function renderBalancoChart(){
  const canvas = document.getElementById('balanco-canvas');
  if(!canvas) return;

  // Agregar dados por mês (YYYY-MM)
  const months = {};
  AUTOS_MEDICAO.forEach(a => {
    const m = (a.data||'').slice(0,7);
    if(!m) return;
    if(!months[m]) months[m] = { mes:m, custos:0, proveitos:0 };
    months[m].proveitos += (a.valor||0);
  });
  CUSTOS_FATURAS.forEach(f => {
    const m = (f.data||'').slice(0,7);
    if(!m) return;
    if(!months[m]) months[m] = { mes:m, custos:0, proveitos:0 };
    months[m].custos += (f.custos||0);
  });

  const data = Object.values(months).sort((a,b)=>a.mes.localeCompare(b.mes)).slice(-12);
  const emptyEl = document.getElementById('balanco-empty');

  if(data.length === 0){
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.parentElement.offsetWidth - 40;
  const H   = 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,W,H);

  const maxVal  = Math.max(...data.map(d=>Math.max(d.custos,d.proveitos,1)));
  const padL=58, padR=12, padT=12, padB=48;
  const chartW  = W - padL - padR;
  const chartH  = H - padT - padB;
  const colW    = chartW / data.length;
  const barW    = Math.max(6, Math.min(22, Math.floor(colW/2.8)));

  // Grid
  ctx.strokeStyle='#E5E7EB'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y = padT + chartH*(1-i/4);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.fillStyle='#9CA3AF'; ctx.font='10px sans-serif'; ctx.textAlign='right';
    ctx.fillText(prodFmtEurShort(maxVal*i/4), padL-5, y+4);
  }

  // Barras
  data.forEach((d,i) => {
    const cx  = padL + i*colW + colW/2;
    const hC  = d.custos   / maxVal * chartH;
    const hP  = d.proveitos/ maxVal * chartH;

    // Custos (vermelho)
    ctx.fillStyle = 'rgba(185,28,28,0.80)';
    ctx.beginPath(); ctx.roundRect(cx-barW-2, padT+chartH-hC, barW, hC, [3,3,0,0]); ctx.fill();
    // Proveitos (verde)
    ctx.fillStyle = 'rgba(21,128,61,0.80)';
    ctx.beginPath(); ctx.roundRect(cx+2, padT+chartH-hP, barW, hP, [3,3,0,0]); ctx.fill();

    // Label mês
    ctx.fillStyle='#6B7280'; ctx.font='10px sans-serif'; ctx.textAlign='center';
    ctx.fillText(prodFmtMesShort(d.mes), cx, padT+chartH+16);
    // Mini-total dif
    const dif = d.proveitos - d.custos;
    ctx.fillStyle = dif>=0 ? 'rgba(21,128,61,0.85)' : 'rgba(185,28,28,0.85)';
    ctx.font='9px sans-serif';
    ctx.fillText((dif>=0?'+':'')+prodFmtEurShort(dif), cx, padT+chartH+28);
  });
}

// ── Mapeamento de grupos ─────────────────────────────────────────────────
function custoGrupoLabel(g){
  const map = {'Mão de Obra':'Mão de Obra','MateriaPrima':'Materiais','Equipamento':'Equipamentos','N/D':'Subcontratos','Geral':'Geral'};
  return map[g] || g || '—';
}
const CUSTO_GRUPOS_ORDER = ['Mão de Obra','MateriaPrima','Equipamento','N/D','Geral'];

// ── Tabela dinâmica pivot ─────────────────────────────────────────────────
function renderPivotTable(){
  const pivotEmpty = document.getElementById('pivot-empty');
  const pivotWrap  = document.getElementById('pivot-table-wrap');
  const pivotTable = document.getElementById('pivot-table');
  if(!pivotTable) return;

  if(CUSTOS_FATURAS.length === 0){
    if(pivotEmpty) pivotEmpty.style.display = 'block';
    if(pivotWrap)  pivotWrap.style.display  = 'none';
    return;
  }
  if(pivotEmpty) pivotEmpty.style.display = 'none';
  if(pivotWrap)  pivotWrap.style.display  = 'block';

  // Meses únicos ordenados
  const monthsSet = new Set();
  CUSTOS_FATURAS.forEach(f => { if(f.mesKey) monthsSet.add(f.mesKey); });
  const months = [...monthsSet].sort();

  // Pivot: {grupo: {mesKey: total}}
  const pivot = {};
  CUSTO_GRUPOS_ORDER.forEach(g => {
    pivot[g] = {};
    months.forEach(m => { pivot[g][m] = 0; });
  });
  CUSTOS_FATURAS.forEach(f => {
    const g = f.grupoArtigo;
    if(!CUSTO_GRUPOS_ORDER.includes(g)) return;
    if(!pivot[g][f.mesKey]) pivot[g][f.mesKey] = 0;
    pivot[g][f.mesKey] += (f.custos || 0);
  });

  const fmtM = ym => {
    if(!ym) return '—';
    const [y,m] = ym.split('-');
    const ns = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return (ns[parseInt(m)-1] || m) + "'" + y.slice(2);
  };

  let t = '<thead><tr>';
  t += '<th class="pivot-row-header">Grupo</th>';
  months.forEach(m => { t += '<th>' + fmtM(m) + '</th>'; });
  t += '<th class="pivot-total-col" style="background:var(--blue-700)">Total</th>';
  t += '</tr></thead><tbody>';

  const colTotals = {};
  months.forEach(m => { colTotals[m] = 0; });
  let grandTotal = 0;

  CUSTO_GRUPOS_ORDER.forEach(g => {
    const label = custoGrupoLabel(g);
    let rowTotal = 0;
    t += '<tr><td class="pivot-row-header">' + label + '</td>';
    months.forEach(m => {
      const v = (pivot[g] && pivot[g][m]) ? pivot[g][m] : 0;
      rowTotal += v;
      colTotals[m] = (colTotals[m] || 0) + v;
      t += v > 0.01 ? '<td>' + prodFmtEur(v) + '</td>' : '<td class="zero">—</td>';
    });
    grandTotal += rowTotal;
    t += '<td class="pivot-total-col">' + (rowTotal > 0.01 ? prodFmtEur(rowTotal) : '—') + '</td></tr>';
  });

  // Linha total
  t += '<tr><td class="pivot-row-header">TOTAL</td>';
  months.forEach(m => {
    const v = colTotals[m] || 0;
    t += v > 0.01 ? '<td>' + prodFmtEur(v) + '</td>' : '<td class="zero">—</td>';
  });
  t += '<td class="pivot-total-col">' + prodFmtEur(grandTotal) + '</td></tr>';
  t += '</tbody>';
  pivotTable.innerHTML = t;
}

// ── Upload Excel de faturas ─────
function custoDropzoneClick(){ document.getElementById('custo-file-input').click(); }

function custoHandleDrop(e){
  e.preventDefault && e.preventDefault();
  const dz = document.getElementById('custo-dropzone');
  if(dz) dz.classList.remove('dragging');
  const file = (e.dataTransfer ? e.dataTransfer.files[0] : null) || (e.target ? e.target.files[0] : null);
  if(!file) return;
  parseCustoExcel(file);
  if(e.target && e.target.type==='file') e.target.value='';
}

function parseCustoExcel(file){
  const reader = new FileReader();
  reader.onload = function(ev){
    try{
      const wb   = XLSX.read(ev.target.result, { type:'binary', cellDates:true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
      if(rows.length < 2){ showToast('Ficheiro sem dados'); return; }

      // Encontrar linha de cabeçalho
      let headerIdx = -1;
      for(let i = 0; i < Math.min(rows.length, 5); i++){
        const r = rows[i].map(h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim());
        if(r.includes('data') || r.some(h => h === 'grupoartigo')){
          headerIdx = i; break;
        }
      }
      if(headerIdx < 0){ showToast('Cabeçalho não encontrado no ficheiro'); return; }

      const header = rows[headerIdx].map(h => String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim());

      let colData  = header.indexOf('data');
      if(colData < 0) colData = header.findIndex(h => h.includes('data'));
      let colGrupo = header.indexOf('grupoartigo');
      if(colGrupo < 0) colGrupo = header.findIndex(h => h.startsWith('grupo'));
      let colNome  = header.indexOf('nomeartigo');
      if(colNome < 0) colNome = header.findIndex((h,i) => i !== colGrupo && h.startsWith('nome'));
      let colForn  = header.findIndex(h => h.startsWith('fornecedor') || h === 'entidade');
      let colCusto = header.indexOf('custos');
      if(colCusto < 0) colCusto = header.findIndex(h => h.startsWith('custo'));
      let colMes   = header.indexOf('mes');
      let colAno   = header.indexOf('ano');

      // Fallback para posições fixas do formato Plandese
      if(colData  < 0) colData  = 0;
      if(colGrupo < 0) colGrupo = 1;
      if(colNome  < 0) colNome  = 2;
      if(colForn  < 0) colForn  = 3;
      if(colCusto < 0) colCusto = 5;
      if(colMes   < 0) colMes   = 8;
      if(colAno   < 0) colAno   = 9;

      // Obra activa (definida pelo card que acionou o import)
      const obraId   = _custoCardObraId || '';
      const obraObj  = obraId ? OBRAS.find(o => o.id === obraId) : null;
      const obraNome = obraObj ? obraObj.nome : '';
      if(!obraId){ showToast('Abra o painel de custos da obra antes de importar'); return; }

      let count = 0;
      for(let i = headerIdx + 1; i < rows.length; i++){
        const row = rows[i];
        if(!row || row.length === 0) continue;
        if(row.every(c => c === '' || c === null || c === undefined)) continue;
        const rawVal = row[colCusto];
        if(rawVal === '' || rawVal === null || rawVal === undefined) continue;
        const valor = parseFloat(String(rawVal).replace(/[€\s ]/g,'').replace(',','.'));
        if(isNaN(valor) || valor === 0) continue;

        const grupo = String(row[colGrupo] || '').trim();
        if(grupo === 'Servico') continue;

        let data = '';
        const rawData = row[colData];
        if(rawData instanceof Date){
          data = rawData.toISOString().slice(0,10);
        } else if(typeof rawData === 'number'){
          const d = new Date((rawData - 25569) * 86400 * 1000);
          data = d.toISOString().slice(0,10);
        } else {
          data = String(rawData).slice(0,10).replace(/\//g,'-');
        }

        let mesKey = data.slice(0,7);
        if(colMes >= 0 && colAno >= 0){
          const mv = row[colMes], av = row[colAno];
          if(mv !== '' && mv !== null && av !== '' && av !== null){
            const m = String(mv).trim().padStart(2,'0');
            const a = String(av).trim();
            if(m && a && a.length === 4) mesKey = a + '-' + m;
          }
        }

        CUSTOS_FATURAS.push({
          id:          'CF' + (Date.now() + i).toString(36).toUpperCase(),
          data:        data || new Date().toISOString().slice(0,10),
          mesKey:      mesKey,
          obraId:      obraId,
          obraNome:    obraNome,
          grupoArtigo: grupo,
          nomeArtigo:  String(row[colNome] || '').trim(),
          fornecedor:  String(row[colForn] || '').trim(),
          custos:      Math.abs(valor)
        });
        count++;
      }

      saveProdLocal();
      renderProdDashboard();
      showToast(count > 0 ? count + ' linha(s) importada(s) com sucesso' : 'Nenhuma linha reconhecida');
    } catch(err){
      console.error('parseCustoExcel:', err);
      showToast('Erro ao processar o ficheiro: ' + err.message);
    }
  };
  reader.readAsBinaryString(file);
}

// ── Utilitários de formatação ─────
function prodFmtEur(v){
  return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0);
}
function prodFmtEurShort(v){
  v = v||0;
  if(Math.abs(v)>=1000000) return (v/1000000).toFixed(1)+'M€';
  if(Math.abs(v)>=1000)    return (v/1000).toFixed(0)+'k€';
  return v.toFixed(0)+'€';
}
function prodFmtMes(ym){
  if(!ym) return '—';
  const [y,m] = ym.split('-');
  const mns=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return (mns[parseInt(m)-1]||m)+' '+y;
}
function prodFmtMesShort(ym){
  if(!ym) return '';
  const [y,m] = ym.split('-');
  const mns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return (mns[parseInt(m)-1]||m)+" '"+String(y).slice(2);
}
function prodFmtData(d){
  if(!d) return '—';
  const p = String(d).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : d;
}
function prodEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Estender goTo para inicializar a secção ─────
(function(){
  const _orig = goTo;
  goTo = function(id, btn){
    _orig(id, btn);
    if(id==='producao') initProducao();
  };
})();

// Re-render chart on window resize
window.addEventListener('resize', function(){
  if(document.getElementById('sec-producao')&&document.getElementById('sec-producao').classList.contains('active')){
    renderProdDashboard();
  }
});

// ── Verificar URL param no arranque ─────
(function(){ try{ initQrRegistration(); }catch(e){ console.warn('QR init:',e); } })();

// ═══════════════════════════════════════
//  GESTÃO DE PERMISSÕES DE ACESSO
// ═══════════════════════════════════════

// Todas as secções configuráveis e os seus rótulos
const ALL_SECTIONS = [
  {id:'painel',             label:'Painel Principal'},
  {id:'historico',          label:'Folha de Ponto'},
  {id:'semana',             label:'Fecho Semanal'},
  {id:'compras',            label:'Pedidos de Compra'},
  {id:'mapas-comparativos', label:'Mapas Comparativos'},
  {id:'faturas',            label:'Faturas'},
  {id:'equipamentos',       label:'Equipamentos'},
  {id:'producao',           label:'Controlo de Obras'},
  {id:'obras',              label:'Gerir Obras'},
  {id:'colaboradores',      label:'Colaboradores'},
  {id:'utilizadores',       label:'Utilizadores'},
  {id:'fornecedores',       label:'Lista de Fornecedores'},
  {id:'comercial',          label:'Comercial'},
];

// Perfis que podem ser configurados (admin tem sempre tudo)
const CONFIGURABLE_ROLES = [
  {key:'diretor_obra', label:'Diretor de Obra'},
  {key:'compras',      label:'Compras'},
  {key:'financeiro',   label:'Financeiro'},
  {key:'comercial',    label:'Comercial'},
];

// Permissões padrão (usadas se não houver nada guardado)
const DEFAULT_PERMISSIONS = {
  diretor_obra: ['painel','historico','semana','compras','faturas','equipamentos','producao','obras','colaboradores'],
  compras:      ['painel','compras'],
  financeiro:   ['painel','faturas','compras'],
  comercial:    ['painel','comercial'],
};

const PERM_STORAGE_KEY = 'plandese_role_permissions_v1';

// Carrega permissões do localStorage (ou usa as default)
function loadPermissions(){
  try {
    const raw = localStorage.getItem(PERM_STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  } catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
}

// Guarda permissões no localStorage e atualiza o ROLE_ACCESS em memória
function savePermissions(){
  const perms = readPermMatrixState();
  try {
    localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(perms));
  } catch(e){}

  // Atualizar ROLE_ACCESS em memória para a sessão atual
  CONFIGURABLE_ROLES.forEach(r=>{
    if(ROLE_ACCESS[r.key]){
      ROLE_ACCESS[r.key].sections = perms[r.key] || [];
      ROLE_ACCESS[r.key].default  = perms[r.key]?.[0] || null;
    }
  });

  const msg = document.getElementById('perm-saved-msg');
  if(msg){ msg.classList.add('show'); setTimeout(()=>msg.classList.remove('show'),2500); }
  showToast('Permissões guardadas ✓');
}

function resetPermissions(){
  if(!confirm('Repor todas as permissões para os valores predefinidos?')) return;
  try { localStorage.removeItem(PERM_STORAGE_KEY); } catch(e){}
  // Atualizar ROLE_ACCESS em memória
  CONFIGURABLE_ROLES.forEach(r=>{
    if(ROLE_ACCESS[r.key]){
      ROLE_ACCESS[r.key].sections = [...(DEFAULT_PERMISSIONS[r.key]||[])];
      ROLE_ACCESS[r.key].default  = ROLE_ACCESS[r.key].sections[0]||null;
    }
  });
  renderPermMatrix();
  showToast('Permissões repostas ✓');
}

// Lê o estado atual dos toggles na matriz
function readPermMatrixState(){
  const perms = {};
  CONFIGURABLE_ROLES.forEach(r=>{ perms[r.key]=[]; });
  document.querySelectorAll('.perm-chk').forEach(chk=>{
    if(chk.checked){
      const role = chk.dataset.role;
      const sec  = chk.dataset.sec;
      if(perms[role]) perms[role].push(sec);
    }
  });
  return perms;
}

// Renderiza a matriz de permissões
function renderPermMatrix(){
  const perms = loadPermissions();

  // Cabeçalho: colunas = secções
  const thead = document.getElementById('perm-matrix-head');
  if(!thead) return;
  thead.innerHTML = '<tr><th>Perfil</th>' +
    ALL_SECTIONS.map(s=>`<th>${s.label}</th>`).join('') +
    '</tr>';

  // Corpo: linhas = perfis configuráveis
  const tbody = document.getElementById('perm-matrix-body');
  tbody.innerHTML = CONFIGURABLE_ROLES.map(role=>{
    const roleSecs = perms[role.key] || [];
    const cells = ALL_SECTIONS.map(sec=>{
      const checked = roleSecs.includes(sec.id);
      return `<td>
        <label class="perm-toggle" title="${checked?'Acesso permitido':'Acesso bloqueado'}">
          <input type="checkbox" class="perm-chk"
            data-role="${role.key}" data-sec="${sec.id}"
            ${checked?'checked':''}
            onchange="onPermChange(this)"/>
          <span class="perm-slider"></span>
        </label>
      </td>`;
    }).join('');
    return `<tr><td>${role.label}</td>${cells}</tr>`;
  }).join('');

  // Linha Admin (sempre com tudo, read-only)
  const adminCells = ALL_SECTIONS.map(()=>`<td>
    <label class="perm-toggle">
      <input type="checkbox" checked disabled/>
      <span class="perm-slider"></span>
    </label>
  </td>`).join('');
  tbody.innerHTML += `<tr style="opacity:.6"><td>Administrador <span style="font-size:10px;color:var(--gray-400);font-weight:400">(total)</span></td>${adminCells}</tr>`;
}

// Atualiza o ROLE_ACCESS em tempo real ao alterar um toggle (sem guardar)
function onPermChange(chk){
  // Feedback visual imediato — guardar acontece ao clicar "Guardar permissões"
  const role = chk.dataset.role;
  const sec  = chk.dataset.sec;
  // Opcional: highlight da linha alterada
  chk.closest('tr').style.background = 'var(--blue-50)';
  setTimeout(()=>{ chk.closest('tr').style.background=''; }, 800);
}

// Troca de tab na secção de utilizadores
function switchUtilTab(tab, btn){
  document.querySelectorAll('.sec-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sec-tab-pane').forEach(p=>p.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('util-pane-'+tab)?.classList.add('active');
  // Mostrar/ocultar botão "Novo utilizador"
  const btnNovo = document.getElementById('btn-novo-utilizador');
  if(btnNovo) btnNovo.style.display = tab==='users' ? '' : 'none';
  if(tab==='perms') renderPermMatrix();
}

// Aplicar permissões guardadas ao fazer login
function applyStoredPermissions(){
  const perms = loadPermissions();
  CONFIGURABLE_ROLES.forEach(r=>{
    if(ROLE_ACCESS[r.key]){
      const secs = perms[r.key];
      if(secs && secs.length >= 0){
        ROLE_ACCESS[r.key].sections = secs;
        ROLE_ACCESS[r.key].default  = secs[0] || null;
      }
    }
  });
}

// ═══════════════════════════════════════
//  CENTRO DE NOTIFICAÇÕES
// ═══════════════════════════════════════
let NOTIFICACOES = [];
let notifPanelOpen = false;

function initNotifications(){
  buildNotifications();
  renderNotifPanel();
  // Fechar ao clicar fora (painel está fora da notif-wrap no DOM)
  document.addEventListener('click', function(e){
    if(notifPanelOpen
      && !e.target.closest('.notif-wrap')
      && !e.target.closest('#notif-panel')){
      closeNotifPanel();
    }
  });
}

function buildNotifications(){
  NOTIFICACOES = [];
  const now = Date.now();

  // Pedidos de compra pendentes
  if(typeof COMPRAS !== 'undefined'){
    const pendentes = COMPRAS.filter(c=>c.estado==='pendente'||c.estado==='Pendente');
    if(pendentes.length>0){
      NOTIFICACOES.push({
        id:'cmp-pend',
        msg:`${pendentes.length} pedido${pendentes.length>1?'s':''} de compra pendente${pendentes.length>1?'s':''}`,
        time: agora(),
        unread: true,
        section:'compras'
      });
    }
  }

  // Faturas pendentes de aprovação
  if(typeof FATURAS !== 'undefined'){
    const fPend = FATURAS.filter(f=>f.estado==='pendente'||f.estado==='Pendente');
    if(fPend.length>0){
      NOTIFICACOES.push({
        id:'fat-pend',
        msg:`${fPend.length} fatura${fPend.length>1?'s':''} aguarda${fPend.length>1?'m':''} validação`,
        time: agora(),
        unread: true,
        section:'faturas'
      });
    }
  }

  // Notificação de boas-vindas (sempre presente na 1ª visita)
  const seenWelcome = sessionStorage.getItem('notif-welcome-seen');
  if(!seenWelcome){
    NOTIFICACOES.unshift({
      id:'welcome',
      msg:'Bem-vindo ao Portal Plandese. Consulte as suas secções disponíveis.',
      time: agora(),
      unread: true,
      section: null
    });
  }
}

function agora(){
  return new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
}

function addNotification(msg, section){
  NOTIFICACOES.unshift({id:'n-'+Date.now(), msg, time:agora(), unread:true, section});
  renderNotifPanel();
}

function renderNotifPanel(){
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if(!list||!badge) return;

  const unread = NOTIFICACOES.filter(n=>n.unread).length;
  if(unread>0){
    badge.textContent = unread>9?'9+':unread;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  if(NOTIFICACOES.length===0){
    list.innerHTML='<div class="notif-empty">Sem notificações de momento</div>';
    return;
  }

  list.innerHTML = NOTIFICACOES.map(n=>`
    <div class="notif-item ${n.unread?'unread':''}" onclick="notifClick('${n.id}','${n.section||''}')">
      <div class="notif-dot"></div>
      <div class="notif-content">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>`).join('');
}

function notifClick(id, section){
  const n = NOTIFICACOES.find(x=>x.id===id);
  if(n) n.unread = false;
  renderNotifPanel();
  closeNotifPanel();
  if(section){
    const btn = document.querySelector(`.sidebar .nav-btn[onclick*="'${section}'"]`);
    goTo(section, btn);
  }
}

function toggleNotifPanel(){
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if(notifPanelOpen){
    const btn = document.getElementById('notif-btn');
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    buildNotifications();
    renderNotifPanel();
    panel.classList.add('open');
  } else {
    panel.classList.remove('open');
  }
}

function closeNotifPanel(){
  notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
}

function markAllRead(){
  NOTIFICACOES.forEach(n=>n.unread=false);
  sessionStorage.setItem('notif-welcome-seen','1');
  renderNotifPanel();
}

// ═══════════════════════════════════════
//  COMERCIAL
// ═══════════════════════════════════════
let PROPOSTAS = []; // [{id, cliente, descricao, valor, estado, data}]
const COM_ESTADOS = ['Em curso','Negociação','Ganha','Perdida'];

function initComercial(){
  renderComercial();
}

function renderComercial(){
  const tbody = document.getElementById('com-tbody');
  const empty = document.getElementById('com-empty');
  const wrap  = document.getElementById('com-table-wrap');
  if(!tbody) return;

  // KPIs
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

function openModalComercial(id){
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

function closeModalCom(){
  document.getElementById('modal-com')?.remove();
}

function editProposta(id){ openModalComercial(id); }

function saveProposta(){
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

function deleteProposta(id){
  if(!confirm('Apagar esta proposta?')) return;
  PROPOSTAS = PROPOSTAS.filter(p=>p.id!==id);
  closeModalCom();
  renderComercial();
}

// Inicializar Comercial ao navegar para a secção
(function(){
  const _origGoTo = goTo;
  goTo = function(id, btn){
    _origGoTo(id, btn);
    if(id==='comercial') initComercial();
  };
})();

// ─── DATETIME WIDGET ────────────────────────────────
(function(){
  const DIAS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun',
                     'Jul','Ago','Set','Out','Nov','Dez'];

  let calVisible = null;
  let calYear, calMonth;

  function pad(n){ return String(n).padStart(2,'0'); }

  function updateClocks(){
    const now = new Date();
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateStr = `${DIAS[now.getDay()]}, ${now.getDate()} ${MESES_ABR[now.getMonth()]} ${now.getFullYear()}`;
    ['enc','adm'].forEach(function(s){
      const c = document.getElementById('dw-clock-'+s);
      const d = document.getElementById('dw-date-'+s);
      if(c) c.textContent = timeStr;
      if(d) d.textContent = dateStr;
    });
  }

  function renderCal(suffix){
    const cal = document.getElementById('dw-cal-'+suffix);
    if(!cal) return;
    const today = new Date();
    const y = calYear, m = calMonth;
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();

    let html = `<div class="dw-cal-hdr">
      <button class="dw-cal-nav" onclick="dwNavCal('${suffix}',-1)">&#8592;</button>
      <span class="dw-cal-title">${MESES[m]} ${y}</span>
      <button class="dw-cal-nav" onclick="dwNavCal('${suffix}',1)">&#8594;</button>
    </div>
    <div class="dw-cal-grid">
      <div class="dw-cal-dow">Dom</div>
      <div class="dw-cal-dow">Seg</div>
      <div class="dw-cal-dow">Ter</div>
      <div class="dw-cal-dow">Qua</div>
      <div class="dw-cal-dow">Qui</div>
      <div class="dw-cal-dow">Sex</div>
      <div class="dw-cal-dow">Sáb</div>`;

    for(var i=0;i<firstDow;i++) html += '<div class="dw-cal-empty"></div>';
    for(var d=1;d<=daysInMonth;d++){
      const isToday = d===today.getDate() && m===today.getMonth() && y===today.getFullYear();
      html += `<button class="dw-cal-day${isToday?' today':''}">${d}</button>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  }

  window.dwToggleCal = function(suffix){
    const cal    = document.getElementById('dw-cal-'+suffix);
    const dateEl = document.getElementById('dw-date-'+suffix);
    if(!cal || !dateEl) return;
    if(calVisible === suffix){
      cal.style.display = 'none';
      calVisible = null;
    } else {
      if(calVisible){
        const other = document.getElementById('dw-cal-'+calVisible);
        if(other) other.style.display = 'none';
      }
      const now = new Date();
      calYear  = now.getFullYear();
      calMonth = now.getMonth();
      renderCal(suffix);
      // Position fixed relative to the date element
      const rect = dateEl.getBoundingClientRect();
      cal.style.top   = (rect.bottom + 8) + 'px';
      cal.style.right = (window.innerWidth - rect.right) + 'px';
      cal.style.left  = 'auto';
      cal.style.display = 'block';
      calVisible = suffix;
    }
  };

  window.dwNavCal = function(suffix, dir){
    calMonth += dir;
    if(calMonth > 11){ calMonth = 0; calYear++; }
    if(calMonth < 0) { calMonth = 11; calYear--; }
    renderCal(suffix);
  };

  document.addEventListener('click', function(e){
    if(calVisible && !e.target.closest('.dw-wrap')){
      const cal = document.getElementById('dw-cal-'+calVisible);
      if(cal) cal.style.display = 'none';
      calVisible = null;
    }
  });

  updateClocks();
  setInterval(updateClocks, 1000);
})();

// ═══════════════════════════════════════
//  PAINEL PRINCIPAL — Dashboard personalizável
// ═══════════════════════════════════════

// ── Estado do painel ──────────────────────────────────────────────
let _painelConfig = null; // carregado do Supabase / localStorage

const PAINEL_WIDGETS_DEF = [
  { id:'obras_ativas',    label:'Obras Ativas',       icon:'<path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>',  section:'obras' },
  { id:'colaboradores',   label:'Colaboradores',      icon:'<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',  section:'colaboradores' },
  { id:'ponto_semana',    label:'Ponto da Semana',    icon:'<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>',  section:'historico' },
  { id:'compras_recentes',label:'Compras Pendentes',  icon:'<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>',  section:'compras' },
  { id:'faturas',         label:'Faturas',            icon:'<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM7 7h7v2H7V7zm10 12H7v-2h10v2zm0-4H7v-2h10v2zm-4-7V3.5L18.5 9H13z"/>',  section:'faturas' },
  { id:'equipamentos',    label:'Equipamentos',       icon:'<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>',  section:'equipamentos' },
  { id:'combustivel',     label:'Combustível',        icon:'<path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM18 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM8 18v-4.5H6L10 7v5h2l-4 6z"/>',  section:'combustivel' },
];

const PAINEL_DEFAULT_CONFIG = {
  widgets: ['obras_ativas','colaboradores','ponto_semana','compras_recentes'],
  obras_filtro: [], // vazio = todas as obras
};

// ── Carregar config do Supabase ────────────────────────────────────
async function loadPainelConfig() {
  // Tentar carregar do Supabase
  if (currentUser?.key) {
    try {
      const { data } = await sb.from('utilizadores').select('painel_config').eq('username', currentUser.key).single();
      if (data?.painel_config) {
        _painelConfig = { ...PAINEL_DEFAULT_CONFIG, ...data.painel_config };
        return;
      }
    } catch(e) { console.warn('loadPainelConfig:', e); }
  }
  // Fallback: localStorage
  try {
    const raw = localStorage.getItem('plandese_painel_config_' + (currentUser?.key || 'guest'));
    if (raw) { _painelConfig = { ...PAINEL_DEFAULT_CONFIG, ...JSON.parse(raw) }; return; }
  } catch(e) {}
  _painelConfig = { ...PAINEL_DEFAULT_CONFIG };
}

// ── Guardar config no Supabase ─────────────────────────────────────
async function savePainelConfig(cfg) {
  _painelConfig = cfg;
  // localStorage como backup imediato
  try { localStorage.setItem('plandese_painel_config_' + (currentUser?.key || 'guest'), JSON.stringify(cfg)); } catch(e) {}
  // Supabase
  if (currentUser?.key) {
    try {
      await sb.from('utilizadores').update({ painel_config: cfg }).eq('username', currentUser.key);
    } catch(e) { console.warn('savePainelConfig:', e); }
  }
}

// ── Renderizar painel ──────────────────────────────────────────────
async function renderPainel() {
  const grid = document.getElementById('painel-grid');
  if (!grid) return;

  // Carregar config se ainda não tiver
  if (!_painelConfig) await loadPainelConfig();

  const cfg = _painelConfig || PAINEL_DEFAULT_CONFIG;
  const obrasAtivas = OBRAS.filter(o => o.ativa);
  const obrasFiltro = (cfg.obras_filtro || []).filter(id => obrasAtivas.some(o => o.id === id));

  // Badge de obras filtradas
  const badge = document.getElementById('painel-obras-badge');
  const badgeTxt = document.getElementById('painel-obras-badge-txt');
  if (badge && badgeTxt) {
    if (obrasFiltro.length > 0) {
      const nomes = obrasFiltro.map(id => obrasAtivas.find(o => o.id === id)?.nome || id).join(', ');
      badgeTxt.textContent = `A mostrar dados de: ${nomes}`;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Saudação personalizada
  const titulo = document.getElementById('painel-titulo');
  if (titulo) {
    const h = new Date().getHours();
    const saudacao = h < 12 ? 'Bom dia' : h < 19 ? 'Boa tarde' : 'Boa noite';
    const nomePropio = currentUser?.nome?.split(' ')[0] || '';
    titulo.textContent = nomePropio ? `${saudacao}, ${nomePropio}` : 'Painel Principal';
  }

  // Carregar dados necessários para os widgets ativos
  const widgets = (cfg.widgets || []).filter(wid => PAINEL_WIDGETS_DEF.some(w => w.id === wid));

  if (widgets.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--gray-400);font-size:14px">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;margin:0 auto 12px;display:block;opacity:.3"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
      Nenhum widget selecionado. Clique em <strong>Personalizar</strong> para configurar o painel.
    </div>`;
    return;
  }

  // Mostrar loading
  grid.innerHTML = widgets.map(() =>
    `<div class="card" style="min-height:140px;display:flex;align-items:center;justify-content:center">
      <div style="width:24px;height:24px;border:3px solid var(--gray-200);border-top-color:var(--blue);border-radius:50%;animation:spin 1s linear infinite"></div>
    </div>`
  ).join('');

  // Construir cada widget
  const htmlWidgets = await Promise.all(widgets.map(wid => buildWidget(wid, obrasFiltro)));
  grid.innerHTML = htmlWidgets.join('');
}

// ── Construir HTML de cada widget ─────────────────────────────────
async function buildWidget(wid, obrasFiltro) {
  const def = PAINEL_WIDGETS_DEF.find(w => w.id === wid);
  if (!def) return '';

  const goBtn = `<button class="btn btn-secondary btn-sm" onclick="goTo('${def.section}',document.querySelector('.sidebar .nav-btn[onclick*=\\'${def.section}\\']'))" style="margin-top:12px;font-size:11px">Ver tudo →</button>`;

  try {
    if (wid === 'obras_ativas') {
      const obras = OBRAS.filter(o => o.ativa && (obrasFiltro.length === 0 || obrasFiltro.includes(o.id)));
      const rows = obras.slice(0, 5).map(o => `<div style="padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:13px;color:var(--gray-700)">${o.nome}</div>`).join('');
      const extra = obras.length > 5 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:6px">+${obras.length-5} mais</div>` : '';
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${obras.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">obras ativas</div>${rows}${extra}${goBtn}`);
    }

    if (wid === 'colaboradores') {
      const ativos = COLABORADORES.filter(c => c.ativo);
      const byFunc = {};
      ativos.forEach(c => { byFunc[c.func] = (byFunc[c.func]||0)+1; });
      const top3 = Object.entries(byFunc).sort((a,b)=>b[1]-a[1]).slice(0,3);
      const rows = top3.map(([f,n]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:13px"><span style="color:var(--gray-700)">${f}</span><span style="font-weight:600;color:var(--gray-900)">${n}</span></div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${ativos.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">colaboradores ativos</div>${rows}${goBtn}`);
    }

    if (wid === 'ponto_semana') {
      // Registos desta semana (já carregados em REGISTOS)
      const mon = getMonday(new Date());
      const days = [];
      for(let i=0;i<6;i++){ const d=new Date(mon); d.setDate(d.getDate()+i); days.push(fmt(d)); }
      let total = 0, presentes = new Set();
      days.forEach(dk => {
        const regs = REGISTOS[dk] || [];
        const filtrados = obrasFiltro.length > 0 ? regs.filter(r => obrasFiltro.includes(r.obra)) : regs;
        filtrados.forEach(r => { presentes.add(r.colabN); if(r.tipo==='Normal'||r.tipo==='Hora Extra') total++; });
      });
      const hoje = fmt(new Date());
      const hoje_regs = (REGISTOS[hoje] || []);
      const hoje_pres = obrasFiltro.length > 0 ? hoje_regs.filter(r => obrasFiltro.includes(r.obra)).length : hoje_regs.length;
      return _painelCard(def, `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div style="text-align:center;padding:12px;background:var(--blue-50,#eff6ff);border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:var(--blue)">${hoje_pres}</div>
            <div style="font-size:11px;color:var(--gray-500)">hoje</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:var(--gray-700)">${total}</div>
            <div style="font-size:11px;color:var(--gray-500)">esta semana</div>
          </div>
        </div>
        ${goBtn}`);
    }

    if (wid === 'compras_recentes') {
      const compras = (typeof COMPRAS !== 'undefined' ? COMPRAS : []);
      const pendentes = compras.filter(c => (c.estado||'').toLowerCase() === 'pendente');
      const recentes = compras.slice(0, 4);
      const rows = recentes.map(c => {
        const est = (c.estado||'pendente').toLowerCase();
        const cor = est==='pendente'?'var(--orange,#ea580c)':est==='aprovado'?'var(--green)':'var(--gray-400)';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
          <span style="color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${c.descricao||c.fornecedor||'—'}</span>
          <span style="font-size:10px;font-weight:600;color:${cor};white-space:nowrap">${c.estado||'—'}</span>
        </div>`;
      }).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--orange,#ea580c);line-height:1">${pendentes.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">pedidos pendentes</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem compras registadas</div>'}${goBtn}`);
    }

    if (wid === 'faturas') {
      const fats = (typeof FATURAS !== 'undefined' ? FATURAS : []);
      const total = fats.reduce((s,f) => s+(parseFloat(f.total)||0), 0);
      const recentes = fats.slice(0,4);
      const rows = recentes.map(f => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span style="color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${f.fornecedor||f.numero||'—'}</span>
        <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-600)">${(parseFloat(f.total)||0).toLocaleString('pt-PT',{minimumFractionDigits:2})} €</span>
      </div>`).join('');
      return _painelCard(def, `<div style="font-size:24px;font-weight:700;color:var(--gray-800);line-height:1;font-family:'DM Mono',monospace">${total.toLocaleString('pt-PT',{minimumFractionDigits:2})} €</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">${fats.length} faturas</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem faturas carregadas</div>'}${goBtn}`);
    }

    if (wid === 'equipamentos') {
      const equips = (typeof EQUIPAMENTOS !== 'undefined' ? EQUIPAMENTOS : []);
      const bycat = {};
      equips.forEach(e => { const k=e.categoria||'outro'; bycat[k]=(bycat[k]||0)+1; });
      const rows = Object.entries(bycat).map(([k,n]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:13px"><span style="color:var(--gray-700);text-transform:capitalize">${k}</span><span style="font-weight:600">${n}</span></div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${equips.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">equipamentos</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem equipamentos</div>'}${goBtn}`);
    }

    if (wid === 'combustivel') {
      // Buscar últimos registos de combustível do Supabase
      let combustRegs = [];
      try {
        const { data } = await sb.from('registos_combustivel').select('*').order('data',{ascending:false}).order('criado_em',{ascending:false}).limit(5);
        if (data) combustRegs = data;
      } catch(e) {}
      const totalLitros = combustRegs.reduce((s,r) => s+(parseFloat(r.litros)||0), 0);
      const rows = combustRegs.slice(0,4).map(r => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span style="color:var(--gray-700)">${r.data||'—'} · ${r.tipo_combustivel||r.tipo||'—'}</span>
        <span style="font-weight:600;color:var(--gray-900)">${r.litros||0} L</span>
      </div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${totalLitros.toFixed(0)}<span style="font-size:16px;font-weight:400"> L</span></div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">últimos 5 registos</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem registos de combustível</div>'}${goBtn}`);
    }

  } catch(e) {
    console.warn('buildWidget error:', wid, e);
    return _painelCard(def, `<div style="font-size:13px;color:var(--red,#dc2626);padding:12px 0">Erro ao carregar dados</div>`);
  }

  return '';
}

// ── Helper: card HTML ──────────────────────────────────────────────
function _painelCard(def, bodyHtml) {
  return `<div class="card" style="padding:20px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:36px;height:36px;border-radius:8px;background:var(--blue-50,#eff6ff);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:var(--blue)">${def.icon}</svg>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--gray-700)">${def.label}</div>
    </div>
    ${bodyHtml}
  </div>`;
}

// ── Abrir modal de personalização ──────────────────────────────────
function openPainelCustomizer() {
  if (!_painelConfig) _painelConfig = { ...PAINEL_DEFAULT_CONFIG };
  const cfg = _painelConfig;

  // Widgets checkboxes
  const widChecks = document.getElementById('painel-widget-checks');
  if (widChecks) {
    widChecks.innerHTML = PAINEL_WIDGETS_DEF.map(w => {
      const checked = (cfg.widgets || []).includes(w.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid ${checked?'var(--blue)':'var(--gray-200)'};border-radius:8px;cursor:pointer;background:${checked?'var(--blue-50,#eff6ff)':'white'};transition:all .15s;font-size:13px" id="painel-wlbl-${w.id}">
        <input type="checkbox" id="painel-wchk-${w.id}" ${checked?'checked':''} onchange="painelWChkChange('${w.id}',this)" style="accent-color:var(--blue)"/>
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;flex-shrink:0;color:var(--blue)">${w.icon}</svg>
        ${w.label}
      </label>`;
    }).join('');
  }

  // Obras checkboxes
  const obraChecks = document.getElementById('painel-obra-checks');
  if (obraChecks) {
    const obrasAtivas = OBRAS.filter(o => o.ativa);
    if (obrasAtivas.length === 0) {
      obraChecks.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem obras ativas</div>';
    } else {
      obraChecks.innerHTML = obrasAtivas.map(o => {
        const checked = (cfg.obras_filtro || []).includes(o.id);
        return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 10px;border-radius:6px;cursor:pointer;background:${checked?'var(--blue-50,#eff6ff)':'transparent'};transition:all .15s" id="painel-obra-lbl-${o.id}">
          <input type="checkbox" id="painel-obra-chk-${o.id}" ${checked?'checked':''} onchange="painelObraChkChange('${o.id}',this)" style="accent-color:var(--blue)"/>
          ${o.nome}
        </label>`;
      }).join('');
    }
  }

  const modal = document.getElementById('painel-modal-bg');
  if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
}

function painelWChkChange(wid, chk) {
  const lbl = document.getElementById('painel-wlbl-'+wid);
  if (lbl) {
    lbl.style.borderColor = chk.checked ? 'var(--blue)' : 'var(--gray-200)';
    lbl.style.background = chk.checked ? 'var(--blue-50,#eff6ff)' : 'white';
  }
}

function painelObraChkChange(obraId, chk) {
  const lbl = document.getElementById('painel-obra-lbl-'+obraId);
  if (lbl) lbl.style.background = chk.checked ? 'var(--blue-50,#eff6ff)' : 'transparent';
}

function closePainelCustomizer() {
  const modal = document.getElementById('painel-modal-bg');
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

async function savePainelCustomizer() {
  // Ler widgets selecionados
  const widgets = PAINEL_WIDGETS_DEF.map(w => w.id).filter(wid => {
    const chk = document.getElementById('painel-wchk-'+wid);
    return chk && chk.checked;
  });
  // Ler obras selecionadas
  const obras_filtro = OBRAS.filter(o => o.ativa).map(o => o.id).filter(id => {
    const chk = document.getElementById('painel-obra-chk-'+id);
    return chk && chk.checked;
  });

  const cfg = { widgets, obras_filtro };
  await savePainelConfig(cfg);
  closePainelCustomizer();
  showToast('Painel guardado ✓');
  renderPainel();
}

// ── Hook goTo para o painel ────────────────────────────────────────
(function(){
  const _origGoTo = goTo;
  goTo = function(id, btn) {
    _origGoTo(id, btn);
    if (id === 'painel') renderPainel();
  };
})();

// ══════════════════════════════════════════════════════════
//  FOLHA DE FECHO — Resumo mensal de horas por trabalhador
// ══════════════════════════════════════════════════════════

async function renderFechoMes(){
  const sel = document.getElementById('fecho-mes-sel');
  if(!sel) return;
  const mesVal = parseInt(sel.value);
  const ano = 2026;

  // Período: 22 do mês anterior → 21 do mês atual
  // Usar hora 12:00 para evitar problemas de timezone (UTC vs UTC+1)
  const dataIni = new Date(ano, mesVal === 1 ? -1 : mesVal - 2, 22, 12, 0, 0);
  const dataFim = new Date(ano, mesVal - 1, 21, 12, 0, 0);

  // Formatar datas para string YYYY-MM-DD sem desvio de timezone
  const fmtLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  };

  const dIniStr = fmtLocal(dataIni);
  const dFimStr = fmtLocal(dataFim);

  // Atualiza info do período
  const infoEl = document.getElementById('fecho-periodo-info');
  if(infoEl) infoEl.textContent = 'Período: ' + dIniStr.split('-').reverse().join('/') + ' a ' + dFimStr.split('-').reverse().join('/');

  const tbody = document.getElementById('fecho-tbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--gray-500)">A carregar dados…</td></tr>';

  try {
    const {data: regs, error} = await sb.from('registos_ponto').select('*').gte('data', dIniStr).lte('data', dFimStr);
    if(error) throw new Error(error.message);

    // Construir mapa: data → colabNumero → registo
    const regMap = {};
    (regs||[]).forEach(r => {
      if(!regMap[r.data]) regMap[r.data] = {};
      regMap[r.data][String(r.colab_numero)] = r;
    });

    // Gerar lista de datas do período usando fmtLocal
    const datas = [];
    for(let d = new Date(dataIni); fmtLocal(d) <= dFimStr; d.setDate(d.getDate()+1)){
      datas.push(fmtLocal(new Date(d)));
    }

    // Calcular horas por colaborador
    const colabsAtivos = [...COLABORADORES].filter(c => c.ativo).sort((a,b) => a.n - b.n);
    const rows = [];

    for(const colab of colabsAtivos){
      const {n, nome, func} = colab;
      let totN = 0, totE = 0;
      const obraHoras = {};

      for(const dk of datas){
        const r = (regMap[dk]||{})[String(n)];
        if(!r) continue;
        if(r.tipo === 'Folga') continue;
        const dateObj = new Date(dk + 'T12:00:00');
        const h = calcH(r.entrada ? r.entrada.slice(0,5) : '', r.saida ? r.saida.slice(0,5) : '', dateObj);
        totN += h.n;
        totE += h.e;
        const oId = r.obra_id || '_sem_obra';
        obraHoras[oId] = (obraHoras[oId]||0) + h.t;
      }

      const totT = totN + totE;
      if(totT === 0) continue;
      rows.push({n, nome, func, totN, totE, totT, obraHoras});
    }

    if(!tbody) return;

    if(rows.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--gray-400)">Sem registos para este período (' + dIniStr + ' a ' + dFimStr + '). Total de registos carregados: ' + (regs||[]).length + '</td></tr>';
      const totaisEl = document.getElementById('fecho-totais');
      if(totaisEl) totaisEl.style.display = 'none';
      return;
    }

    let globalN = 0, globalE = 0, globalT = 0;
    const htmlRows = rows.map((row, i) => {
      globalN += row.totN;
      globalE += row.totE;
      globalT += row.totT;

      const obraEntries = Object.entries(row.obraHoras).sort((a,b) => b[1]-a[1]);
      const obraBadges = obraEntries.map(([oId, horas]) => {
        const pct = row.totT > 0 ? Math.round((horas / row.totT) * 100) : 0;
        const obra = OBRAS.find(o => String(o.id) === String(oId));
        const oNome = obra ? (obra.nome || obra.numero || oId) : (oId === '_sem_obra' ? 'Sem obra' : oId);
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;color:#1d4ed8;white-space:nowrap;margin:2px 2px 2px 0">' + oNome + ' <span style="color:#6b7280">' + pct + '%</span></span>';
      }).join('');

      const bg = i % 2 === 0 ? '' : 'background:var(--gray-50)';
      return '<tr style="' + bg + '">'
        + '<td style="padding:10px 14px;color:var(--gray-500);font-family:monospace;font-size:12px">' + row.n + '</td>'
        + '<td style="padding:10px 14px;font-weight:600;color:var(--gray-900)">' + row.nome + '</td>'
        + '<td style="padding:10px 14px;color:var(--gray-600);font-size:12px">' + (row.func||'—') + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;color:var(--gray-700)">' + fmtH(row.totN) + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;color:#3b82f6">' + fmtH(row.totE) + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-weight:700;color:var(--green)">' + fmtH(row.totT) + '</td>'
        + '<td style="padding:10px 14px">' + (obraBadges || '<span style="color:var(--gray-300);font-size:12px">—</span>') + '</td>'
        + '</tr>';
    });
    tbody.innerHTML = htmlRows.join('');

    // Totais rodapé
    const totaisEl = document.getElementById('fecho-totais');
    if(totaisEl){
      totaisEl.style.display = '';
      document.getElementById('fecho-tot-n').textContent = fmtH(globalN);
      document.getElementById('fecho-tot-e').textContent = fmtH(globalE);
      document.getElementById('fecho-tot-t').textContent = fmtH(globalT);
      document.getElementById('fecho-tot-w').textContent = rows.length;
    }

    window._fechoMesData = {rows, mesVal, ano, dIniStr, dFimStr};

  } catch(err) {
    console.error('renderFechoMes error:', err);
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red)">Erro: ' + err.message + '</td></tr>';
  }
}

async function exportFechoMes(){
  if(!window._fechoMesData || !window._fechoMesData.rows || !window._fechoMesData.rows.length){
    showToast('Carregue primeiro os dados clicando em Atualizar.');
    return;
  }
  const {rows, mesVal, dIniStr, dFimStr} = window._fechoMesData;
  const mesNome = MESES_PT[mesVal-1];

  showToast('A gerar ficheiro Excel\u2026');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plandese SA';
  const ws = workbook.addWorksheet('Folha de Fecho');

  ws.columns = [
    {header:'N\u00ba', key:'n', width:6},
    {header:'Nome', key:'nome', width:28},
    {header:'Fun\u00e7\u00e3o', key:'func', width:18},
    {header:'H.Normais', key:'hn', width:12},
    {header:'H.Extra', key:'he', width:10},
    {header:'Total', key:'ht', width:10},
    {header:'Distribui\u00e7\u00e3o por Obra', key:'obras', width:50},
  ];

  // Linha de título (inserida antes do cabeçalho)
  ws.spliceRows(1, 0, []);
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Folha de Fecho \u2014 ' + mesNome + ' 2026 (' + dIniStr + ' a ' + dFimStr + ')';
  titleCell.font = {bold:true, size:13, color:{argb:'FF002060'}};
  titleCell.alignment = {horizontal:'center', vertical:'middle'};
  titleCell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFD9E1F2'}};
  ws.getRow(1).height = 22;

  // Cabeçalhos da tabela
  const hdr = ws.getRow(2);
  ['N\u00ba','Nome','Fun\u00e7\u00e3o','H. Normais','H. Extra','Total Horas','Distribui\u00e7\u00e3o por Obra'].forEach((v,i) => {
    const cell = hdr.getCell(i+1);
    cell.value = v;
    cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF002060'}};
    cell.alignment = {horizontal:'center', vertical:'middle'};
  });
  hdr.height = 18;

  // Linhas de dados
  rows.forEach((row, i) => {
    const obraEntries = Object.entries(row.obraHoras).sort((a,b) => b[1]-a[1]);
    const obraStr = obraEntries.map(([oId, h]) => {
      const pct = row.totT > 0 ? Math.round((h/row.totT)*100) : 0;
      const obra = OBRAS.find(o => o.id === oId);
      const oNome = obra ? (obra.nome||obra.numero||oId) : (oId === '_sem_obra' ? 'Sem obra' : oId);
      return oNome + ': ' + pct + '%';
    }).join(' | ');

    const dataRow = ws.getRow(i+3);
    dataRow.values = [row.n, row.nome, row.func||'', fmtH(row.totN), fmtH(row.totE), fmtH(row.totT), obraStr];
    dataRow.eachCell(cell => {
      cell.alignment = {vertical:'middle', wrapText:true};
      if(i%2===1) cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFF2F6FF'}};
    });
    dataRow.height = 16;
  });

  // Linha de totais
  const totRow = ws.getRow(rows.length+3);
  const globalN = rows.reduce((s,r) => s+r.totN, 0);
  const globalE = rows.reduce((s,r) => s+r.totE, 0);
  const globalT = rows.reduce((s,r) => s+r.totT, 0);
  totRow.values = ['', 'TOTAL (' + rows.length + ' trabalhadores)', '', fmtH(globalN), fmtH(globalE), fmtH(globalT), ''];
  totRow.eachCell(cell => {
    cell.font = {bold:true, color:{argb:'FF002060'}};
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFD9E1F2'}};
    cell.alignment = {vertical:'middle', horizontal:'center'};
  });
  totRow.height = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Folha_Fecho_' + mesNome + '_2026.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  showToast('\u2713 Ficheiro exportado!');
}

// Hook goTo para inicializar a Folha de Fecho ao navegar
(function(){
  const _prevGoTo = goTo;
  goTo = function(id, btn){
    _prevGoTo(id, btn);
    if(id === 'fecho-mes') renderFechoMes();
  };
})();

// ── Expor funções globais para handlers HTML (onclick=, onchange=, oninput=, etc.) ──
// Necessário porque módulos ES têm scope próprio e não expõem funções ao window automaticamente.
Object.assign(window, {
  // Auth
  doLogin, doLogout,

  // Painel Principal
  openPainelCustomizer, closePainelCustomizer, savePainelCustomizer,
  painelWChkChange, painelObraChkChange,

  // Navegação admin
  goTo, toggleNavGrp,

  // Modais genéricos
  openModal, closeModal,

  // Histórico / Ponto
  applyFilter, navSemana, exportHistSemana, exportMensal,
  switchFPTab, loadWeek,

  // MOA
  applyMOAFilter, navMOASemana, exportMOAExcel,

  // Obras
  renderObras, saveObra, editObra, toggleObra,
  saveObraExtra,

  // Colaboradores
  renderColabs, saveColab, editColab, toggleColab,

  // Utilizadores
  renderUsers, saveUser, editUser, switchUtilTab,

  // Permissões
  savePermissions, resetPermissions, onPermChange,

  // Faturas
  handleFatFiles, renderFaturas, limparFatFiltros,
  editarFatura, saveFatura, apagarFatura, exportFaturasXLSX,

  // Compras
  renderCompras, editarCompra, saveCompra, apagarCompra,
  exportComprasXLSX, abrirMapaPicker, fecharMapaPicker,
  geocodeSearch, confirmarLocalizacao, limparLocalizacao,
  cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty,
  cmpAddForn, cmpRemoveForn,

  // Empresas MOA
  saveEmpresaMOA, editEmpresaMOA, toggleEmpresaMOA,
  addColabMOA, removeColabMOA,

  // Equipamentos
  renderEquipamentos, openEqModal, editEquipamento,
  saveEquipamento, apagarEquipamento, refreshEqMap,
  showQrCode, printQrCode, showEqHistorico, exportEquipamentosXLSX,

  // QR Registration
  submitQrRegistration,

  // Combustível
  loadCombustivelAdmin, exportCombustivelXLSX,

  // Encarregado — navegação
  encVoltarHome, encGoMenuPonto, encGoFolhaPontoPlandese,
  encGoFolhaPontoAluguer, encGoHistoricoEnc,
  encGoEquipamentos, encGoCombustivel,

  // Encarregado — ponto
  encPassarColaboradores, encVoltarScreen1,
  encAddColab, encRemColab, encSubmeterRegisto,
  adicionarTodosOntem, encLoadHistorico,

  // Encarregado — equipamentos QR
  encScanNovamente, submitEncEquipamento,

  // Encarregado — combustível
  encGoCombDeposito, encGoCombViatura,
  depSetMovimento, encSubmeterCombDeposito,
  combViaturaManual, combViaturaVoltarScanner, encSubmeterCombViatura,

  // Encarregado — aluguer
  encAlugPassarTrabalhadores, encAlugVoltarA,
  encAlugAddTrabalhador, encAlugSubmeter, encAlugRemover,

  // Produção / Controlo de Obras
  coGoList, coOpenDetail,
  editAutoFromDetail, deleteAutoFromDetail,
  editPrevFatFromDetail, deletePrevFatFromDetail,
  obraImportCustos, obraCustosHandleDrop, clearCustoObra,
  editPrevFat, deletePrevFat, savePrevFat,
  editAuto, deleteAuto, saveAuto,
  custoDropzoneClick, custoHandleDrop,
  toggleAutosMes, toggleCustosPanel,
  exportSemanaExcel,

  // Comercial
  openModalComercial, closeModalCom,
  editProposta, saveProposta, deleteProposta,

  // Notificações
  toggleNotifPanel, notifClick,

  // Actualizar
  refreshPortal,

  // Folha de Fecho
  renderFechoMes, exportFechoMes,
});;

// ═══════════════════════════════════════════════════════════
//  MÓDULO FORNECEDORES
// ═══════════════════════════════════════════════════════════
let FORNECEDORES = [];
let _fornPage = 0;
const FORN_PER_PAGE = 50;

async function sbLoadFornecedores() {
  try {
    const { data, error } = await sb.from('fornecedores').select('*').order('nome');
    if (error) throw error;
    FORNECEDORES = data || [];
    preencherDatalistFornecedores();
  } catch(e) { console.warn('Erro ao carregar fornecedores:', e); }
}

function preencherDatalistFornecedores() {
  ['mcmp-forn-list','mmc-forn-add-list'].forEach(dlId => {
    const dl = document.getElementById(dlId);
    if (!dl) return;
    dl.innerHTML = FORNECEDORES
      .filter(f => f.ativo)
      .map(f => `<option value="${f.nome}" data-id="${f.id}">${f.nome}${f.nif ? ' — ' + f.nif : ''}${f.localidade ? ' (' + f.localidade + ')' : ''}</option>`)
      .join('');
  });
}

function filtrarFornecedores() {
  const q = (document.getElementById('forn-f-search')?.value || '').toLowerCase();
  const ativo = document.getElementById('forn-f-ativo')?.value;
  return FORNECEDORES.filter(f => {
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
  if (_fornPage >= totalPag) _fornPage = Math.max(0, totalPag - 1);
  const slice = lista.slice(_fornPage * FORN_PER_PAGE, (_fornPage + 1) * FORN_PER_PAGE);

  const kTotal = document.getElementById('forn-k-total');
  const kAtivos = document.getElementById('forn-k-ativos');
  if (kTotal) kTotal.textContent = FORNECEDORES.length;
  if (kAtivos) kAtivos.textContent = FORNECEDORES.filter(f => f.ativo).length;

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
        <button class="btn btn-secondary btn-sm" onclick="fornPag(-1)" ${_fornPage===0?'disabled':''}>&#8249; Anterior</button>
        <span>Página ${_fornPage+1} de ${totalPag} &nbsp;&middot;&nbsp; ${total} fornecedores</span>
        <button class="btn btn-secondary btn-sm" onclick="fornPag(1)" ${_fornPage>=totalPag-1?'disabled':''}>Próxima &#8250;</button>`;
    }
  }
}

function fornPag(delta) { _fornPage = Math.max(0, _fornPage + delta); renderFornecedores(); }

function openModalFornecedor(id) {
  const f = id ? FORNECEDORES.find(x => x.id === id) : null;
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
      const idx = FORNECEDORES.findIndex(f => f.id === id);
      if (idx >= 0) FORNECEDORES[idx] = { ...FORNECEDORES[idx], ...rec };
    } else {
      const { data, error } = await sb.from('fornecedores').insert(rec).select().single();
      if (error) throw error;
      FORNECEDORES.push(data);
      FORNECEDORES.sort((a,b) => a.nome.localeCompare(b.nome, 'pt'));
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
    FORNECEDORES = FORNECEDORES.filter(f => f.id !== id);
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
    const forn = FORNECEDORES.find(f => f.nome === nome);
    const hiddenId = document.getElementById('mcmp-forn-id');
    if (hiddenId) hiddenId.value = forn ? forn.id : '';
  }
});

// ═══════════════════════════════════════════════════════════
//  MÓDULO MAPAS COMPARATIVOS
// ═══════════════════════════════════════════════════════════
let MAPAS_COMP = [];
let _mcMapaAtual = null;
let _mcFornecedores = [];
let _mcLinhas = [];

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
    MAPAS_COMP = data || [];
  } catch(e) { console.warn('Erro ao carregar mapas comparativos:', e); }
}

function filtrarMapasComp() {
  const q = (document.getElementById('mc-f-search')?.value || '').toLowerCase();
  const obraId = document.getElementById('mc-f-obra')?.value || '';
  const estado = document.getElementById('mc-f-estado')?.value || '';
  return MAPAS_COMP.filter(m => {
    if (obraId && m.obra_id !== obraId) return false;
    if (estado && m.estado !== estado) return false;
    if (q) {
      const obraNome = OBRAS.find(o => o.id === m.obra_id)?.nome || '';
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
    const na = OBRAS.find(o=>o.id===a)?.nome||'';
    const nb = OBRAS.find(o=>o.id===b)?.nome||'';
    return na.localeCompare(nb, 'pt');
  });

  cont.innerHTML = chaves.map(k => {
    const obraNome = k === '__sem_obra__' ? 'Sem obra associada' : (OBRAS.find(o=>o.id===k)?.nome || k);
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
    sel.innerHTML = prefix + OBRAS.filter(o=>o.ativa).map(o=>`<option value="${o.id}">${o.nome}</option>`).join('');
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
  _mcMapaAtual = null;
  _mcFornecedores = [];
  _mcLinhas = [];
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
        const forn = FORNECEDORES.find(f => f.nome === c.fornecedor);
        _mcFornecedores = [{ id: forn?.id || null, nome: forn?.nome || c.fornecedor }];
      }
    }
  }
  document.getElementById('mmc-del-btn').style.display = 'none';
  renderMmcFornecedores();
  renderMmcLinhas();
  openModal('modal-mapa-comp');
}

async function editarMapaComp(id) {
  const m = MAPAS_COMP.find(x => x.id === id);
  if (!m) return;
  _mcMapaAtual = m;
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
    _mcLinhas = (linhas || []).map(l => ({
      ...l,
      _valores: (vals || []).filter(v => v.linha_id === l.id)
    }));
    const fornNomes = [...new Set((vals||[]).map(v => v.fornecedor_nome).filter(Boolean))];
    _mcFornecedores = fornNomes.map(nome => {
      const forn = FORNECEDORES.find(f => f.nome === nome);
      return { id: forn?.id || null, nome };
    });
  } catch(e) { _mcLinhas = []; _mcFornecedores = []; }

  renderMmcFornecedores();
  renderMmcLinhas();
  openModal('modal-mapa-comp');
}

function renderMmcFornecedores() {
  const cont = document.getElementById('mmc-forn-lista');
  if (!cont) return;
  cont.innerHTML = _mcFornecedores.map((f, i) =>
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
  if (_mcFornecedores.find(f => f.nome.toLowerCase() === nome.toLowerCase())) {
    showToast('Fornecedor já adicionado'); return;
  }
  const forn = FORNECEDORES.find(f => f.nome.toLowerCase() === nome.toLowerCase());
  _mcFornecedores.push({ id: forn?.id || null, nome: forn?.nome || nome });
  inp.value = '';
  renderMmcFornecedores();
}

function removerFornecedorMapa(idx) {
  _mcFornecedores.splice(idx, 1);
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
    _mcFornecedores.forEach((f, i) => {
      const th = document.createElement('th');
      th.setAttribute('data-forn', i);
      th.style.minWidth = '120px';
      th.textContent = f.nome;
      header.insertBefore(th, lastTh);
    });
  }

  if (_mcLinhas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${5 + _mcFornecedores.length}" style="text-align:center;color:var(--gray-400);font-size:13px;padding:12px">Sem linhas. Clique em "+ Adicionar linha".</td></tr>`;
    return;
  }

  tbody.innerHTML = _mcLinhas.map((l, li) => {
    const fornCols = _mcFornecedores.map((f, fi) => {
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
      <td><input type="text" value="${l.descricao}" style="width:100%;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="_mcLinhas[${li}].descricao=this.value"/></td>
      <td><input type="text" value="${l.unidade||'un'}" style="width:60px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="_mcLinhas[${li}].unidade=this.value"/></td>
      <td><input type="number" min="0" step="0.001" value="${l.quantidade||1}" style="width:80px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="_mcLinhas[${li}].quantidade=parseFloat(this.value)||1"/></td>
      <td><input type="number" min="0" step="0.01" value="${l.valor_seco??''}" style="width:100px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="_mcLinhas[${li}].valor_seco=this.value?parseFloat(this.value):null" placeholder="0.00"/></td>
      <td style="display:${mostrarVenda?'':'none'}"><input type="number" min="0" step="0.01" value="${l.valor_venda??''}" style="width:100px;padding:4px 6px;border:1px solid var(--gray-200);border-radius:6px;font-size:13px" onchange="_mcLinhas[${li}].valor_venda=this.value?parseFloat(this.value):null" placeholder="0.00"/></td>
      ${fornCols}
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="removerLinhaMapa(${li})" style="color:var(--red)">&times;</button></td>
    </tr>`;
  }).join('');
}

function adicionarLinhaMapa() {
  _mcLinhas.push({ id: null, descricao: '', unidade: 'un', quantidade: 1, valor_seco: null, valor_venda: null, _valores: [] });
  renderMmcLinhas();
}

function removerLinhaMapa(idx) {
  _mcLinhas.splice(idx, 1);
  renderMmcLinhas();
}

function atualizarValorFornMapa(li, fi, val) {
  if (!_mcLinhas[li]._valores) _mcLinhas[li]._valores = [];
  const forn = _mcFornecedores[fi];
  let entry = _mcLinhas[li]._valores.find(v => v.fornecedor_nome === forn.nome);
  if (!entry) {
    entry = { fornecedor_id: forn.id, fornecedor_nome: forn.nome, valor_unit: null, selecionado: false };
    _mcLinhas[li]._valores.push(entry);
  }
  entry.valor_unit = val ? parseFloat(val) : null;
  entry.valor_total = entry.valor_unit != null ? entry.valor_unit * (_mcLinhas[li].quantidade || 1) : null;
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
    criado_por: currentUser?.username || null,
    criado_nome: currentUser?.nome || currentUser?.username || null,
    updated_at: new Date().toISOString()
  };
  try {
    let mapaId = id;
    if (id) {
      const { error } = await sb.from('mapas_comparativos').update(rec).eq('id', id);
      if (error) throw error;
      const idx = MAPAS_COMP.findIndex(m => m.id === id);
      if (idx >= 0) MAPAS_COMP[idx] = { ...MAPAS_COMP[idx], ...rec };
    } else {
      const { data, error } = await sb.from('mapas_comparativos').insert(rec).select().single();
      if (error) throw error;
      mapaId = data.id;
      MAPAS_COMP.unshift(data);
    }

    if (mapaId) {
      await sb.from('mapa_linhas').delete().eq('mapa_id', mapaId);
      for (let i = 0; i < _mcLinhas.length; i++) {
        const l = _mcLinhas[i];
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
    MAPAS_COMP = MAPAS_COMP.filter(m => m.id !== id);
    closeModal('modal-mapa-comp');
    renderMapasComp();
  } catch(e) { showToast('Erro ao apagar: ' + (e.message||e)); }
}

async function abrirMapaComparativo(id) {
  const m = MAPAS_COMP.find(x => x.id === id);
  if (!m) return;
  const sec = document.getElementById('sec-mapas-comparativos');
  if (sec) sec.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">A carregar mapa...</div>';

  try {
    const [{ data: linhas }, { data: vals }] = await Promise.all([
      sb.from('mapa_linhas').select('*').eq('mapa_id', id).order('ordem'),
      sb.from('mapa_fornecedor_valores').select('*').eq('mapa_id', id)
    ]);
    const obraNome = OBRAS.find(o => o.id === m.obra_id)?.nome || '—';
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
const _origRenderCompras = renderCompras;
renderCompras = function() {
  _origRenderCompras();
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
      goTo('mapas-comparativos', document.getElementById('nav-mapas-comp'));
      setTimeout(() => openModalMapa(c.id), 200);
    };
    btn.parentElement.insertBefore(mapBtn, btn);
  });
};

// Hook goTo para inicializar módulos ao navegar
(function() {
  const _prev = goTo;
  goTo = function(id, btn) {
    _prev(id, btn);
    if (id === 'fornecedores') {
      if (!FORNECEDORES.length) sbLoadFornecedores().then(() => renderFornecedores());
      else renderFornecedores();
    }
    if (id === 'mapas-comparativos') {
      populaMcObras();
      sbLoadMapasComp().then(() => renderMapasComp());
    }
  };
})();

// Carregar fornecedores na inicialização
sbLoadFornecedores();

// Expor funções globais dos novos módulos
Object.assign(window, {
  renderFornecedores, openModalFornecedor, editarFornecedor,
  saveFornecedor, apagarFornecedor, exportFornecedoresXLSX, fornPag,
  renderMapasComp, openModalMapa, editarMapaComp, saveMapaComp,
  apagarMapaComp, abrirMapaComparativo,
  adicionarFornecedorMapa, removerFornecedorMapa,
  adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa,
});

// ═══════════════════════════════════════════════════════════
//  ASSISTENTE DE COMPRAS — CHAT INTELIGENTE
// ═══════════════════════════════════════════════════════════

// Estado da conversa
let _chat = {
  step: 'material',       // material | quantidade | mais | prazo | obra | done
  artigos: [],            // [{ref, nome, unidade, quantidade}]
  currentMaterial: null,  // {ref, nome, unidade}
  prazo: null,
  obraId: null,
  obraNome: null,
};

// Abrir o ecrã do chat
function encGoComprasChat() {
  _encHideAll();
  const el = document.getElementById('enc-screen-compras-chat');
  if (el) { el.style.display = 'flex'; el.style.flexDirection = 'column'; }
  _chatReset();
  _chatWelcome();
}

// Reset total do estado
function _chatReset() {
  _chat = { step: 'material', artigos: [], currentMaterial: null, prazo: null, obraId: null, obraNome: null };
  const msgs = document.getElementById('chat-msgs');
  if (msgs) msgs.innerHTML = '';
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) { inp.value = ''; inp.disabled = false; }
}

// ── Mensagens ─────────────────────────────────────────────────
function _chatAddBot(text, delay = 0) {
  return new Promise(resolve => {
    const msgs = document.getElementById('chat-msgs');
    if (!msgs) return resolve();

    // Mostrar indicador "a escrever..."
    const typingRow = document.createElement('div');
    typingRow.className = 'chat-bubble-row bot';
    typingRow.innerHTML = '<div class="chat-bubble bot"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
    msgs.appendChild(typingRow);
    msgs.scrollTop = msgs.scrollHeight;

    setTimeout(() => {
      typingRow.remove();
      const row = document.createElement('div');
      row.className = 'chat-bubble-row bot';
      row.innerHTML = `<div class="chat-bubble bot">${text}</div>
        <div class="chat-time">${_chatTime()}</div>`;
      msgs.appendChild(row);
      msgs.scrollTop = msgs.scrollHeight;
      resolve();
    }, delay || 700);
  });
}

function _chatAddUser(text) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  const row = document.createElement('div');
  row.className = 'chat-bubble-row user';
  row.innerHTML = `<div class="chat-bubble user">${_esc(text)}</div>
    <div class="chat-time">${_chatTime()}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function _chatTime() {
  return new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function _esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Sugestões / Chips ─────────────────────────────────────────
function _chatClearSuggestions() {
  const s = document.getElementById('chat-suggestions');
  if (s) s.innerHTML = '';
}

function _chatShowChips(chips) {
  // chips: [{label, value, cls}]
  const s = document.getElementById('chat-suggestions');
  if (!s) return;
  s.innerHTML = '';
  chips.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chat-chip ' + (c.cls || '');
    btn.textContent = c.label;
    btn.onclick = () => c.onclick();
    s.appendChild(btn);
  });
}

// ── Pesquisa de materiais no catálogo ─────────────────────────
function _chatSearchMateriais(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const results = [];
  if (typeof ARTIGOS_CATALOGO === 'undefined') return results;
  for (const cat of Object.values(ARTIGOS_CATALOGO)) {
    for (const item of (cat.items || [])) {
      const nome = (item[1] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (nome.includes(q)) {
        results.push({ ref: item[0], nome: item[1], unidade: item[2] || 'un' });
        if (results.length >= 8) return results;
      }
    }
  }
  return results;
}

// ── Fluxo da conversa ─────────────────────────────────────────

async function _chatWelcome() {
  const nome = currentUser?.nome?.split(' ')[0] || 'Encarregado';
  const inp = document.getElementById('chat-input');
  if (inp) inp.disabled = true;
  await _chatAddBot(`Olá <strong>${nome}</strong>! 👷 Vou ajudar-te a criar um pedido de compras.<br>O que necessitas?`, 400);
  if (inp) inp.disabled = false;
  _chat.step = 'material';
  _chatSetPlaceholder('Escreve o material (ex: cimento, varão...)');
}

function chatOnInput(val) {
  if (_chat.step !== 'material' && _chat.step !== 'quantidade') return;
  if (_chat.step === 'material') {
    const results = _chatSearchMateriais(val);
    if (results.length > 0) {
      _chatShowChips(results.map(r => ({
        label: r.nome.length > 42 ? r.nome.substring(0, 42) + '…' : r.nome,
        onclick: () => _chatSelectMaterial(r),
      })));
    } else {
      _chatClearSuggestions();
    }
  }
}

function _chatSelectMaterial(mat) {
  _chat.currentMaterial = mat;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  _chatAddUser(mat.nome);
  _chatAskQuantidade();
}

async function _chatAskQuantidade() {
  _chat.step = 'quantidade';
  await _chatAddBot('Qual a quantidade?');
  _chatSetPlaceholder('Ex: 50 sacos, 10 un, 200 kg...');
  // Chips de quantidade rápida
  const uni = _chat.currentMaterial?.unidade || 'un';
  const quickQtds = ['1', '5', '10', '20', '50', '100'].map(n => ({
    label: `${n} ${uni}`,
    onclick: () => { _chatAddUser(`${n} ${uni}`); _chatConfirmArtigo(`${n} ${uni}`); }
  }));
  _chatShowChips(quickQtds);
}

function _chatConfirmArtigo(qtdTxt) {
  const artigo = {
    ref: _chat.currentMaterial?.ref || '',
    nome: _chat.currentMaterial?.nome || '',
    unidade: _chat.currentMaterial?.unidade || 'un',
    quantidade: qtdTxt,
  };
  _chat.artigos.push(artigo);
  _chat.currentMaterial = null;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  _chatAskMais();
}

async function _chatAskMais() {
  _chat.step = 'mais';
  // Mostrar resumo dos artigos adicionados
  const listaHtml = _chat.artigos.map(a =>
    `• <strong>${a.nome}</strong> — ${a.quantidade}`
  ).join('<br>');
  await _chatAddBot(`Adicionado ✅<br><div class="chat-items-preview">${listaHtml}</div><br>Queres adicionar mais algum material?`);
  _chatSetPlaceholder('');
  _chatShowChips([
    { label: '➕ Sim, adicionar mais', cls: 'green', onclick: () => { _chatAddUser('Sim, mais um'); _chatClearSuggestions(); _chat.step = 'material'; _chatSetPlaceholder('Escreve o próximo material...'); _chatAddBot('Qual o próximo material?'); } },
    { label: '➡️ Não, continuar', onclick: () => { _chatAddUser('Não, continuar'); _chatClearSuggestions(); _chatAskPrazo(); } },
  ]);
}

async function _chatAskPrazo() {
  _chat.step = 'prazo';
  await _chatAddBot('Para quando necessitas?');
  _chatSetPlaceholder('Ex: sexta-feira, urgente, próxima semana...');
  _chatShowChips([
    { label: 'Hoje',          onclick: () => { _chatAddUser('Hoje');           _chatSetPrazo('Hoje'); } },
    { label: 'Amanhã',        onclick: () => { _chatAddUser('Amanhã');         _chatSetPrazo('Amanhã'); } },
    { label: 'Esta semana',   onclick: () => { _chatAddUser('Esta semana');    _chatSetPrazo('Esta semana'); } },
    { label: 'Próxima semana',onclick: () => { _chatAddUser('Próxima semana'); _chatSetPrazo('Próxima semana'); } },
  ]);
}

function _chatSetPrazo(val) {
  _chat.prazo = val;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  _chatAskObra();
}

async function _chatAskObra() {
  _chat.step = 'obra';
  await _chatAddBot('Para que obra?');
  _chatSetPlaceholder('');
  const obras = (OBRAS || []).filter(o => o.ativa !== false);
  if (obras.length > 0) {
    _chatShowChips(obras.map(o => ({
      label: o.nome,
      cls: 'obra',
      onclick: () => { _chatAddUser(o.nome); _chatSelectObra(o.id, o.nome); }
    })));
  }
}

function _chatSelectObra(obraId, obraNome) {
  _chat.obraId = obraId;
  _chat.obraNome = obraNome;
  _chatClearSuggestions();
  _chatFinalize();
}

async function _chatFinalize() {
  _chat.step = 'done';
  const inp = document.getElementById('chat-input');
  if (inp) inp.disabled = true;
  await _chatAddBot('Um momento, a registar o pedido... ⏳', 300);

  try {
    const urgencia = ['hoje','urgent','amanhã','amanha'].some(k => (_chat.prazo||'').toLowerCase().includes(k))
      ? 'Urgente' : 'Normal';

    const titulo = _chat.artigos.length === 1
      ? _chat.artigos[0].nome
      : `${_chat.artigos.length} materiais — ${_chat.artigos[0].nome}...`;

    const artigos = _chat.artigos.map(a => ({
      ref: a.ref, descricao: a.nome, unidade: a.unidade, quantidade: a.quantidade
    }));

    const { data: pedido, error } = await sb.from('pedidos_compra').insert({
      titulo,
      descricao: `Pedido via assistente de chat por ${currentUser?.nome || ''}`,
      obra_id:     _chat.obraId,
      urgencia,
      estado:      'Pendente',
      notas:       `Prazo: ${_chat.prazo}`,
      artigos,
      criado_por:  currentUser?.username || '',
      criado_nome: currentUser?.nome || '',
    }).select('id').single();

    if (error) throw error;

    const ref = (pedido?.id || '').substring(0, 8).toUpperCase();
    const listaFinal = _chat.artigos.map(a => `• ${a.nome} — ${a.quantidade}`).join('<br>');

    await _chatAddBot(
      `✅ <strong>Pedido registado com sucesso!</strong><br><br>` +
      `<div class="chat-items-preview">` +
      `📋 Ref: <strong>#${ref}</strong><br>` +
      `🏗️ Obra: <strong>${_esc(_chat.obraNome)}</strong><br>` +
      `📅 Prazo: <strong>${_esc(_chat.prazo)}</strong><br><br>` +
      listaFinal +
      `</div><br>O responsável foi notificado. Obrigado! 👍`, 600
    );

    // Botão para novo pedido
    _chatShowChips([
      { label: '🛒 Novo pedido', cls: 'green', onclick: () => { _chatReset(); _chatWelcome(); } },
      { label: '← Voltar ao início', onclick: () => encVoltarHome() },
    ]);

    // Refrescar lista de compras em background
    if (typeof initCompras === 'function') initCompras().catch(() => {});

  } catch (e) {
    console.error('chatFinalize:', e);
    await _chatAddBot('⚠️ Ocorreu um erro ao registar o pedido. Tenta novamente.');
    if (inp) inp.disabled = false;
    _chat.step = 'obra';
  }
}

// ── Envio manual (input + botão) ──────────────────────────────
async function chatSend() {
  const inp = document.getElementById('chat-input');
  const val = (inp?.value || '').trim();
  if (!val) return;

  _chatAddUser(val);
  inp.value = '';
  _chatClearSuggestions();

  if (_chat.step === 'material') {
    // Pesquisar e usar o primeiro resultado, ou texto livre
    const results = _chatSearchMateriais(val);
    const mat = results.length > 0
      ? results[0]
      : { ref: '', nome: val, unidade: 'un' };
    _chatSelectMaterial(mat);

  } else if (_chat.step === 'quantidade') {
    _chatConfirmArtigo(val);

  } else if (_chat.step === 'mais') {
    const v = val.toLowerCase();
    if (v.includes('sim') || v.includes('mais') || v.includes('s')) {
      _chat.step = 'material';
      _chatSetPlaceholder('Escreve o próximo material...');
      _chatAddBot('Qual o próximo material?');
    } else {
      _chatAskPrazo();
    }

  } else if (_chat.step === 'obra') {
    const obras = (typeof OBRAS !== 'undefined' ? OBRAS : []).filter(function(o) { return o.ativa !== false; });
    const match = obras.find(function(o) { return o.nome.toLowerCase().includes(val.toLowerCase()); });
    if (match) {
      _chatSelectObra(match.id, match.nome);
    } else {
      await _chatAddBot('Não encontrei essa obra. Escolhe uma da lista acima 👆');
      _chatAskObra();
    }
  }
}

window.encGoComprasChat = encGoComprasChat;
window.chatSend         = chatSend;
window.chatOnInput      = chatOnInput;

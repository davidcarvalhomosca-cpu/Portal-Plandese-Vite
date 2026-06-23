// ═══════════════════════════════════════
//  ENC-PONTO — Encarregado: ponto e navegação
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S, R } from '../state.js';
import { fmt, fmtPT, calcH, fmtH } from '../utils/helpers.js';
import { TIPOS } from '../config.js';
import { showToast } from './navigation.js';
import { loadEmpresasMOA, loadColaboradoresMOA, EMPRESAS_MOA } from './enc-aluguer.js';
import { _encEquipShowState, startEncQrScanner, stopEncQrScanner } from './enc-equip.js';
import { stopCombQrScanner } from './enc-combustivel.js';

// ═══════════════════════════════════════
//  ENCARREGADO
// ═══════════════════════════════════════
// ── ENCARREGADO — ESTADO ──────────────────────────────────────

function _encUpdatePrazoWidget(){
  const username=S.currentUser?.username||S.currentUser?.nome;
  const obra=S.OBRAS.find(o=>o.ativa&&o.encarregado_id===username);
  // compat: legacy widget elements (may be hidden)
  const valEl=document.getElementById('enc-obra-prazo-days');
  const lblEl=document.getElementById('enc-obra-prazo-label');
  const iconEl=document.getElementById('enc-obra-prazo-icon');
  // v2 elements
  const obraNomeEl=document.getElementById('enc-v2-obra-nome');
  const prazoBadgeEl=document.getElementById('enc-v2-prazo-badge');
  if(!obra){
    if(valEl) valEl.textContent='—';
    if(lblEl) lblEl.textContent='sem obra atribuída';
    if(iconEl){iconEl.style.background='#f9fafb'; iconEl.style.color='#9ca3af';}
    if(obraNomeEl) obraNomeEl.textContent='Sem obra atribuída';
    if(prazoBadgeEl) prazoBadgeEl.textContent='';
    return;
  }
  if(obraNomeEl) obraNomeEl.textContent=obra.nome;
  if(!obra.prazo){
    if(valEl) valEl.textContent='—';
    if(lblEl) lblEl.textContent=obra.nome;
    if(prazoBadgeEl) prazoBadgeEl.textContent='';
    return;
  }
  const today=new Date(); today.setHours(0,0,0,0);
  const prazoDate=new Date(obra.prazo+'T00:00:00');
  const days=Math.ceil((prazoDate-today)/(1000*60*60*24));
  if(valEl) valEl.textContent=days>0?days:'0';
  if(lblEl) lblEl.textContent=`dias · ${obra.nome}`;
  if(iconEl){
    if(days<=7){iconEl.style.background='#fef2f2';iconEl.style.color='#dc2626';}
    else if(days<=21){iconEl.style.background='#fff7ed';iconEl.style.color='#ea580c';}
    else{iconEl.style.background='#f0fdf4';iconEl.style.color='#16a34a';}
  }
  if(prazoBadgeEl){
    prazoBadgeEl.textContent=days>0?`${days}d`:'vencido';
    prazoBadgeEl.style.color=days<=7?'#ef4444':days<=21?'#f97316':'#22c55e';
  }
}

const _WMO_DESC={
  0:'Céu limpo',1:'Principalmente limpo',2:'Parcialmente nublado',3:'Nublado',
  45:'Nevoeiro',48:'Nevoeiro',51:'Garoa leve',53:'Garoa',55:'Garoa intensa',
  61:'Chuva leve',63:'Chuva',65:'Chuva intensa',71:'Neve leve',73:'Neve',75:'Neve intensa',
  80:'Aguaceiros',81:'Aguaceiros',82:'Aguaceiros fortes',95:'Trovoada',96:'Trovoada c/ granizo',99:'Trovoada intensa'
};
function _wmoIcon(code){
  if(code<=1) return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>`;
  if(code<=3) return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`;
  if(code>=95) return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM13 14h3l-4 6v-4h-3l4-6v4z"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M17.66 8L12 2.35 6.34 8C4.78 9.56 4 11.64 4 13.64s.78 4.11 2.34 5.67 3.61 2.35 5.66 2.35 4.1-.79 5.66-2.35S20 15.64 20 13.64 19.22 9.56 17.66 8zM6 14c.01-2 .62-3.27 1.76-4.4L12 5.27l4.24 4.38C17.38 10.77 17.99 12 18 14H6z"/></svg>`;
}
function _wmoColors(code){
  if(code<=1) return {bg:'#fefce8',color:'#ca8a04'};
  if(code<=3) return {bg:'#f9fafb',color:'#6b7280'};
  if(code>=95) return {bg:'#fef3c7',color:'#d97706'};
  return {bg:'#eff6ff',color:'#2563eb'};
}
let _encWeatherCoords=null;

function _encLoadWeather(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos=>{
    _encWeatherCoords={lat:pos.coords.latitude,lon:pos.coords.longitude};
    try{
      const {lat,lon}=_encWeatherCoords;
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=1`;
      const resp=await fetch(url);
      const json=await resp.json();
      const cur=json.current;
      const temp=Math.round(cur.temperature_2m);
      const code=cur.weather_code;
      const desc=_WMO_DESC[code]||'Tempo variável';
      const precip=cur.precipitation_probability??null;
      const tempEl=document.getElementById('enc-weather-temp');
      const descEl=document.getElementById('enc-weather-desc');
      const iconEl=document.getElementById('enc-weather-icon');
      const alertEl=document.getElementById('enc-weather-rain-alert');
      if(tempEl) tempEl.textContent=temp+'°';
      if(descEl) descEl.textContent=desc;
      if(iconEl){
        iconEl.innerHTML=_wmoIcon(code);
        const {bg,color}=_wmoColors(code);
        iconEl.style.background=bg; iconEl.style.color=color;
      }
      if(alertEl&&precip!==null&&precip>=50){
        alertEl.textContent=`💧 ${precip}% chuva`;
        alertEl.classList.add('visible');
      }
    }catch(e){
      const d=document.getElementById('enc-weather-desc'); if(d) d.textContent='Sem dados';
    }
  },()=>{
    const d=document.getElementById('enc-weather-desc'); if(d) d.textContent='—';
  },{timeout:8000});
}

const _DAYS_PT=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

async function encOpenWeatherModal(){
  const modal=document.getElementById('enc-weather-modal');
  const list=document.getElementById('enc-weather-forecast');
  if(!modal||!list) return;
  modal.style.display='flex';
  list.innerHTML=`<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">A carregar previsão...</div>`;
  if(!_encWeatherCoords){
    list.innerHTML=`<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">Localização não disponível</div>`;
    return;
  }
  try{
    const {lat,lon}=_encWeatherCoords;
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const resp=await fetch(url);
    const json=await resp.json();
    const daily=json.daily;
    const todayStr=fmt(new Date());
    list.innerHTML='';
    daily.time.forEach((dateStr,i)=>{
      const d=new Date(dateStr+'T12:00:00');
      const isToday=dateStr===todayStr;
      const dayName=isToday?'Hoje':_DAYS_PT[d.getDay()];
      const code=daily.weather_code[i];
      const tmax=Math.round(daily.temperature_2m_max[i]);
      const tmin=Math.round(daily.temperature_2m_min[i]);
      const precip=daily.precipitation_probability_max[i]??0;
      const desc=_WMO_DESC[code]||'—';
      const {bg,color}=_wmoColors(code);
      const row=document.createElement('div');
      row.className='enc-forecast-row';
      row.innerHTML=`
        <div class="enc-forecast-day${isToday?' today':''}">${dayName}</div>
        <div class="enc-forecast-icon" style="background:${bg};color:${color}">${_wmoIcon(code)}</div>
        <div class="enc-forecast-desc">${desc}</div>
        <div class="enc-forecast-precip${precip<20?' dry':''}">💧${precip}%</div>
        <div class="enc-forecast-temp">${tmax}°<span> / ${tmin}°</span></div>`;
      list.appendChild(row);
    });
  }catch(e){
    list.innerHTML=`<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">Erro ao carregar previsão</div>`;
  }
}

function encCloseWeatherModal(){
  const modal=document.getElementById('enc-weather-modal');
  if(modal) modal.style.display='none';
}

// ── FAB + bottom sheet ──────────────────────────────────────
const _FAB_SVG_PLUS=`<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" style="width:24px;height:24px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const _FAB_SVG_CLOSE=`<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function encToggleSheet(){
  const sheet=document.getElementById('enc-v2-sheet');
  const overlay=document.getElementById('enc-v2-overlay');
  const fab=document.getElementById('enc-v2-fab');
  if(!sheet||!overlay) return;
  const isOpen=sheet.classList.contains('open');
  if(isOpen){
    sheet.classList.remove('open');
    overlay.classList.remove('visible');
    fab?.classList.remove('open');
    if(fab) fab.innerHTML=_FAB_SVG_PLUS;
  } else {
    sheet.classList.add('open');
    overlay.classList.add('visible');
    fab?.classList.add('open');
    if(fab) fab.innerHTML=_FAB_SVG_CLOSE;
  }
}

function encCloseSheet(){
  const sheet=document.getElementById('enc-v2-sheet');
  const overlay=document.getElementById('enc-v2-overlay');
  const fab=document.getElementById('enc-v2-fab');
  sheet?.classList.remove('open');
  overlay?.classList.remove('visible');
  fab?.classList.remove('open');
  if(fab) fab.innerHTML=_FAB_SVG_PLUS;
}

// ── Home stats ──────────────────────────────────────────────
async function _encLoadHomeStats(){
  const username=S.currentUser?.username||S.currentUser?.nome;
  const obra=S.OBRAS.find(o=>o.ativa&&o.encarregado_id===username);
  const presEl=document.getElementById('enc-v2-presentes');
  const faltEl=document.getElementById('enc-v2-faltas');
  const pendEl=document.getElementById('enc-v2-pendentes');
  const listEl=document.getElementById('enc-v2-pending');
  if(!obra){
    if(presEl) presEl.textContent='—';
    if(faltEl) faltEl.textContent='—';
    if(pendEl) pendEl.textContent='—';
    if(listEl) listEl.innerHTML='<div class="enc-v2-pending-empty">Sem obra atribuída</div>';
    return;
  }
  try{
    const today=fmt(new Date());
    const {data:rows}=await sb.from('registos_ponto').select('*').eq('data',today).eq('obra_id',obra.id);
    const all=rows||[];
    const presentes=all.filter(r=>!r.tipo||r.tipo==='Presença');
    const faltas=all.filter(r=>r.tipo&&r.tipo!=='Presença');
    const semSaida=presentes.filter(r=>!r.saida);
    if(presEl) presEl.textContent=presentes.length;
    if(faltEl) faltEl.textContent=faltas.length;
    if(pendEl) pendEl.textContent=semSaida.length;
    if(listEl){
      if(!all.length){
        listEl.innerHTML='<div class="enc-v2-pending-empty">Sem registos para hoje</div>';
      } else if(!semSaida.length){
        listEl.innerHTML='<div class="enc-v2-pending-empty">Todos os registos completos ✓</div>';
      } else {
        listEl.innerHTML=semSaida.map(r=>{
          const c=S.COLABORADORES.find(x=>x.n===r.colab_numero);
          const nome=c?c.nome:`Nº ${r.colab_numero}`;
          const ini=nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
          return `<div class="enc-v2-pending-item">
            <div class="enc-v2-pending-ico" style="font-weight:700;font-size:12px;color:#1e4a8a">${ini}</div>
            <div class="enc-v2-pending-info">
              <div class="enc-v2-pi-title">${nome}</div>
              <div class="enc-v2-pi-sub">Entrada: ${r.entrada?.slice(0,5)||'—'} · Sem saída</div>
            </div>
          </div>`;
        }).join('');
      }
    }
  }catch(e){
    if(presEl) presEl.textContent='—';
    if(faltEl) faltEl.textContent='—';
    if(pendEl) pendEl.textContent='—';
    if(listEl) listEl.innerHTML='<div class="enc-v2-pending-empty">Erro ao carregar</div>';
  }
}

async function initEnc(){
  // Greeting + nome
  const _nomeEl = document.getElementById('enc-home-nome');
  if (_nomeEl) _nomeEl.textContent = S.currentUser?.nome?.split(' ')[0] || 'Encarregado';
  const _greetEl = document.getElementById('enc-v2-greeting');
  if(_greetEl){ const h=new Date().getHours(); _greetEl.textContent=h<12?'Bom dia':h<19?'Boa tarde':'Boa noite'; }
  // Activar home e esconder app bar
  const _encAppEl=document.getElementById('enc-app');
  if(_encAppEl) _encAppEl.classList.add('enc-home-active');
  document.getElementById('enc-screen0').style.display='flex';
  ['enc-screen1','enc-screen2','enc-screen-equip',
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
    if(obras&&obras.length>0) S.OBRAS=obras.map(o=>({id:o.id,nome:o.nome,local:o.local||'',desc:o.descricao||'',ativa:o.ativa,prazo:o.prazo||null,encarregado_id:o.encarregado_id||null}));
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
  // Widgets: prazo da obra + meteorologia + home stats
  _encUpdatePrazoWidget();
  _encLoadWeather();
  _encLoadHomeStats();
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
      chip.style.cssText='padding:6px 12px;background:var(--green-bg);color:var(--green);border:1.5px solid var(--green-light);border-radius:20px;font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer';
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
  R.emitEvent?.({ acao:'Folha de ponto submetida · '+(S.currentUser?.nome||'Encarregado')+' ('+(S.activeRows[dk]||[]).length+' colab.)', seccao:'historico' });
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
// Mantido para compatibilidade — navega directamente para o home
function encGoMenuPonto(){ encVoltarHome(); }

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
  encCloseSheet();
  _encHideAll();
  document.getElementById('enc-screen0').style.display='flex';
  document.getElementById('enc-screen0').style.flexDirection='column';
  const _encAppEl=document.getElementById('enc-app');
  if(_encAppEl) _encAppEl.classList.add('enc-home-active');
  _encUpdateCtxBar();
  _encLoadHomeStats();
}

function _encHideAll(){
  document.getElementById('enc-app')?.classList.remove('enc-home-active');
  ['enc-screen0','enc-screen1','enc-screen2','enc-screen-equip','enc-screen-aluguer','enc-screen-historico-enc','enc-screen-combustivel','enc-screen-comb-deposito','enc-screen-comb-viatura',
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
  encVoltarHome, _encHideAll,
  encOpenWeatherModal, encCloseWeatherModal,
  encToggleSheet, encCloseSheet
};

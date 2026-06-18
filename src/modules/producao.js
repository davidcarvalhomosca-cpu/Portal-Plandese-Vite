// ═══════════════════════════════════════
//  PRODUÇÃO — Controlo de obras
// ═══════════════════════════════════════
import { S, R } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast, closeModal } from './navigation.js';

let PREV_FATURACAO = [];
let AUTOS_MEDICAO  = [];
let CUSTOS_FATURAS = [];
let OBRAS_EXTRA = {};
let _coState = { filter: 'all', view: 'cards', q: '', detailObraId: null, wired: false };
let _editPrevId = null;
let _autoSubTab = 'contratual';
let _editAutoId = null;
let _custoCardObraId = null;
let custoMesesExcluidos = new Set();

//  PRODUÇÃO — DADOS E FUNÇÕES
// ═══════════════════════════════════════

// ── Persistência local ─────

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
function _loadObrasExtra(){ try{ OBRAS_EXTRA = JSON.parse(localStorage.getItem('obras_extra')||'{}'); }catch(e){ OBRAS_EXTRA={}; } }
function _saveObrasExtra(){ localStorage.setItem('obras_extra', JSON.stringify(OBRAS_EXTRA)); }
_loadObrasExtra();


function initProducao(){
  _prodLoadLocal();
  _loadObrasExtra();
  renderProdDashboard();
}

function prodGoTab(){ /* mantido por compatibilidade */ }

// ── Dashboard principal (redesign Controlo de Obras) ─────────────────────

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

  const obras = S.OBRAS.filter(o => o.ativa !== false);
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
  const o = S.OBRAS.find(x=>x.id===obraId); if(!o) return;
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
  const obra=S.OBRAS.find(o=>o.id===obraId); const extra=OBRAS_EXTRA[obraId]||{};
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
    S.OBRAS.filter(o => o.ativa !== false).map(o => `<option value="${o.id}">${prodEsc(o.nome)}</option>`).join('');
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
  const obraNome = (S.OBRAS.find(o=>o.id===obraId)||{}).nome || obraId;
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
  R.emitEvent?.({ acao:(_editPrevId?'Previsão de faturação atualizada':'Nova previsão de faturação')+' · '+obraNome, seccao:'producao' });
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
    S.OBRAS.filter(o=>o.ativa!==false).map(o=>`<option value="${o.id}">${prodEsc(o.nome)}</option>`).join('');
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
  const obraNome = (S.OBRAS.find(o=>o.id===obraId)||{}).nome || obraId;
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
  R.emitEvent?.({ acao:(_editAutoId?'Auto de medição atualizado':'Novo auto de medição')+' · '+obraNome, seccao:'producao' });
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
function _custoAllMonths(){
  const s = new Set();
  CUSTOS_FATURAS.forEach(f => { const m=(f.data||'').slice(0,7); if(m) s.add(m); });
  AUTOS_MEDICAO.forEach(a => { const m=(a.data||'').slice(0,7); if(m) s.add(m); });
  return [...s].sort();
}

function custoToggleMes(mes){
  if(custoMesesExcluidos.has(mes)) custoMesesExcluidos.delete(mes);
  else custoMesesExcluidos.add(mes);
  renderCustos();
}

function custoSelectAllMeses(all){
  if(all) custoMesesExcluidos.clear();
  else _custoAllMonths().forEach(m => custoMesesExcluidos.add(m));
  renderCustos();
}

function _renderCustoMesFilter(){
  const filterEl = document.getElementById('custo-mes-filter');
  if(!filterEl) return;
  const allMonths = _custoAllMonths();
  if(allMonths.length === 0){ filterEl.innerHTML = ''; return; }
  const allSel  = allMonths.every(m => !custoMesesExcluidos.has(m));
  const noneSel = allMonths.every(m =>  custoMesesExcluidos.has(m));
  const chips = allMonths.map(m => {
    const sel = !custoMesesExcluidos.has(m);
    return `<button onclick="custoToggleMes('${m}')" style="padding:3px 10px;border-radius:20px;border:1.5px solid ${sel?'var(--blue-700)':'var(--gray-300)'};background:${sel?'var(--blue-700)':'transparent'};color:${sel?'#fff':'var(--gray-500)'};font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s">${prodFmtMesShort(m)}</button>`;
  }).join('');
  filterEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);margin-bottom:12px">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);white-space:nowrap">Meses no balanço</span>
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;flex:1">${chips}</div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button onclick="custoSelectAllMeses(true)" style="padding:3px 10px;border-radius:20px;border:1.5px solid var(--gray-300);background:${allSel?'var(--gray-200)':'transparent'};color:var(--gray-600);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">Todos</button>
        <button onclick="custoSelectAllMeses(false)" style="padding:3px 10px;border-radius:20px;border:1.5px solid var(--gray-300);background:${noneSel?'var(--gray-200)':'transparent'};color:var(--gray-600);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">Nenhum</button>
      </div>
    </div>`;
}

function renderCustos(){
  _renderCustoMesFilter();

  const faturas = custoMesesExcluidos.size === 0
    ? CUSTOS_FATURAS
    : CUSTOS_FATURAS.filter(f => !custoMesesExcluidos.has((f.data||'').slice(0,7)));
  const autos = custoMesesExcluidos.size === 0
    ? AUTOS_MEDICAO
    : AUTOS_MEDICAO.filter(a => !custoMesesExcluidos.has((a.data||'').slice(0,7)));

  const totalCusto  = faturas.reduce((s,f) => s + (f.custos||0), 0);
  const totalProv   = autos.reduce((s,a) => s + (a.valor||0), 0);
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
    S.OBRAS.filter(o => o.ativa !== false).map(o => '<option value="' + o.id + '">' + prodEsc(o.nome) + '</option>').join('');
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
      const obraObj  = obraId ? S.OBRAS.find(o => o.id === obraId) : null;
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

// Re-render chart on window resize
window.addEventListener('resize', function(){
  if(document.getElementById('sec-producao')&&document.getElementById('sec-producao').classList.contains('active')){
    renderProdDashboard();
  }
});


// ═══════════════════════════════════════
//  GESTÃO DE PERMISSÕES DE ACESSO

export {
  PREV_FATURACAO, AUTOS_MEDICAO, CUSTOS_FATURAS, OBRAS_EXTRA,
  initProducao, renderProdDashboard, coGoList, coOpenDetail,
  renderPrevFat, openPrevFatModal, editPrevFat, savePrevFat, deletePrevFat, deletePrevFatFromDetail, editPrevFatFromDetail,
  renderAutos, openAutoModal, editAuto, saveAuto, deleteAuto, deleteAutoFromDetail, editAutoFromDetail, openAutoModalForObra,
  renderCustos, clearCustoFaturas, clearCustoObra, renderCustoObras,
  custoToggleMes, custoSelectAllMeses,
  renderBalancoChart, renderPivotTable,
  custoDropzoneClick, custoHandleDrop, parseCustoExcel, obraImportCustos, obraCustosHandleDrop,
  openObraExtraModal, saveObraExtra,
  toggleAutosMes, toggleCustosPanel, openPrevFatModalForObra,
  prodFmtEur, prodFmtEurShort, prodFmtMes, prodFmtMesShort, prodFmtData, prodEsc,
  _prodLoadLocal, saveProdLocal, _loadObrasExtra, _saveObrasExtra,
  coComputeStats, coStatusOf, coStatusLabel, coBuildCard, coBuildRow, coRenderDetail, coBuildDetailPivot
};

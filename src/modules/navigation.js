// ═══════════════════════════════════════
//  NAVIGATION — Navegação, modais e admin init
// ═══════════════════════════════════════
import { S, R } from '../state.js';
import { fmt } from '../utils/helpers.js';

let toastTimer = null;
export function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500);
}

// ── Tabs Folha de Ponto ─────────────────
let fpTabAtivo = 'plandese';
export function switchFPTab(tab){
  fpTabAtivo = tab;
  document.getElementById('fp-tab-plandese').style.display = tab==='plandese' ? '' : 'none';
  document.getElementById('fp-tab-aluguer').style.display  = tab==='aluguer'  ? '' : 'none';
  document.getElementById('fp-tab-btn-plandese').classList.toggle('active', tab==='plandese');
  document.getElementById('fp-tab-btn-aluguer').classList.toggle('active',  tab==='aluguer');
  document.getElementById('export-btns-plandese').style.display = 'none';
  document.getElementById('export-btns-aluguer').style.display  = 'none';
}

export function initAdmin(){
  R.renderObras?.();
  R.renderColabs?.();
  R.renderUsers?.();
  populateFilterSelects();
  document.getElementById('f-semana').value=fmt(new Date());
  document.getElementById('nb-colab').textContent=S.COLABORADORES.filter(c=>c.ativo).length;
  R.initCompras?.()?.catch?.(e=>console.warn('initCompras:',e));
  R.initMOAFilters?.()?.catch?.(e=>console.warn('initMOAFilters:',e));
  goTo('painel',document.getElementById('nav-painel'));
}

export function populateFilterSelects(){
  const fc=document.getElementById('f-col');if(!fc)return;
  fc.innerHTML='<option value="">Todos</option>';
  S.COLABORADORES.forEach(c=>{const o=document.createElement('option');o.value=c.n;o.textContent=`${c.n} — ${c.nome}`;fc.appendChild(o);});
  ['f-obra'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML='<option value="">Todas as obras</option>';
    S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;el.appendChild(op);});
  });
}

export function openModal(id){
  if(id==='modal-obra'){document.getElementById('mo-title').textContent='Nova obra';['mo-id','mo-nome','mo-local','mo-desc'].forEach(i=>document.getElementById(i).value='');}
  if(id==='modal-colab'){document.getElementById('mc-title').textContent='Novo colaborador';['mc-id','mc-num','mc-nome'].forEach(i=>document.getElementById(i).value='');document.getElementById('mc-func').value='Encarregado';}
  if(id==='modal-user'){document.getElementById('mu-title').textContent='Novo utilizador';['mu-key','mu-nome','mu-user','mu-pass'].forEach(i=>document.getElementById(i).value='');document.getElementById('mu-role').value='encarregado';}
  if(id==='modal-empresa-moa'){document.getElementById('memoa-title').textContent='Nova Empresa MOA';['memoa-id','memoa-nome','memoa-nif','memoa-contacto'].forEach(i=>document.getElementById(i).value='');}
  document.getElementById(id).classList.add('open');
}

export function closeModal(id){document.getElementById(id).classList.remove('open');}

export let goTo = function(id, btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  const sideBtn = document.querySelector('.sidebar .nav-btn[onclick*="\'' + id + '\'"]');
  if(sideBtn) sideBtn.classList.add('active');
  if(btn) btn.classList.add('active');
  const bnav=document.querySelector('#bottom-nav .bnav-btn[onclick*="\'' + id + '\'"]');
  if(bnav)bnav.classList.add('active');
  if(id==='painel') closeAllGroups();
  syncNavGroups();
  if(id==='historico') R.applyFilter?.();
  if(id==='empresas-moa') R.renderEmpresasMOA?.();
};

export async function refreshPortal(){
  const btn = document.getElementById('btn-refresh');
  if(btn){ btn.disabled=true; btn.classList.add('refreshing'); }
  try {
    await R.carregarDados();
    const activeSection = document.querySelector('.section.active');
    if(activeSection){
      const id = activeSection.id.replace(/^sec-/,'');
      const renderMap = {
        'painel':          ()=>R.renderPainel?.(),
        'historico':       ()=>R.applyFilter?.(),
        'empresas-moa':    ()=>R.renderEmpresasMOA?.(),
        'obras':           ()=>R.renderObras?.(),
        'colaboradores':   ()=>R.renderColabs?.(),
        'utilizadores':    ()=>R.renderUsers?.(),
        'faturas':         ()=>R.renderFaturas?.(),
        'compras':         ()=>R.renderCompras?.(),
        'equipamentos':    ()=>R.renderEquipamentos?.(),
        'combustivel':     ()=>R.loadCombustivelAdmin?.(),
        'producao':        ()=>R.renderProdDashboard?.(),
        'permissoes':      ()=>R.renderPermMatrix?.(),
        'fecho-mes':       ()=>R.renderFechoMes?.(),
      };
      if(renderMap[id]) renderMap[id]();
    }
    R.mostrarDiag?.('✓ Dados actualizados','#15803D');
  } catch(e){
    R.mostrarDiag?.('❌ Erro ao actualizar: '+e.message,'#B91C1C');
  } finally {
    if(btn){ btn.disabled=false; btn.classList.remove('refreshing'); }
  }
}

function closeAllGroups(){
  document.querySelectorAll('.sidebar .nav-group').forEach(g=>{
    g.classList.remove('open');
    const l=document.querySelector('.nav-lbl[data-grp="'+g.getAttribute('data-grp')+'"]');
    if(l) l.classList.remove('open');
  });
}

export function toggleNavGrp(key){
  const lbl = document.querySelector('.nav-lbl[data-grp="'+key+'"]');
  const grp = document.querySelector('.nav-group[data-grp="'+key+'"]');
  if(!lbl||!grp) return;
  const willOpen = !grp.classList.contains('open');
  closeAllGroups();
  if(willOpen){
    grp.classList.add('open');
    lbl.classList.add('open');
  }
}

export function syncNavGroups(){
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

export function flashAlert(id){const el=document.getElementById(id);if(!el)return;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000);}

document.addEventListener('DOMContentLoaded',()=>{ syncNavGroups(); });

// Modal close on background click
document.querySelectorAll('.modal-bg').forEach(mb=>mb.addEventListener('click',e=>{if(e.target===mb)mb.classList.remove('open');}));

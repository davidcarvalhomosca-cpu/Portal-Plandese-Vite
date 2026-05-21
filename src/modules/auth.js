// ═══════════════════════════════════════
//  AUTH — Login/Logout e Device Detection
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S, R } from '../state.js';
import { USERS_BASE, ROLE_LABELS } from '../config.js';

export function mostrarDiag(msg, cor='#1d4ed8') {
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
export function getDeviceType(){
  const w=window.innerWidth;
  const isTouch=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if(w<=640||(isTouch&&w<=900))return'mobile';
  if(w<=1024)return'tablet';
  return'desktop';
}

export function applyDeviceClass(){
  const dt=getDeviceType();
  document.body.classList.remove('device-mobile','device-tablet','device-desktop');
  document.body.classList.add('device-'+dt);
  if(dt==='desktop') document.documentElement.style.setProperty('--sidebar-w','220px');
  else if(dt==='tablet') document.documentElement.style.setProperty('--sidebar-w','60px');
  return dt;
}

export function updateDeviceBadge(dt){
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

export async function doLogin() {
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
      S.USERS={};
      users.forEach(x=>{S.USERS[x.username]={pass:x.password,nome:x.nome,initials:x.initials||x.nome.split(' ').map(c=>c[0]).join('').slice(0,2).toUpperCase(),role:x.role};});
      if(!S.USERS['admin'])S.USERS['admin']=USERS_BASE['admin'];
    } else {
      S.USERS = { 'admin': USERS_BASE['admin'] };
      mostrarDiag('⚠️ Supabase ligado mas sem utilizadores — só o admin pode entrar','#B45309');
    }
  } catch(e){
    S.USERS = { 'admin': USERS_BASE['admin'] };
    mostrarDiag('⚠️ Sem ligação ao servidor — apenas admin pode entrar','#B45309');
  }
  btn.textContent='Entrar'; btn.disabled=false;
  const usr=S.USERS[u];
  if(usr&&usr.pass===p){
    S.currentUser={...usr,key:u};
    document.getElementById('login-screen').style.display='none';
    document.body.insertAdjacentHTML('beforeend','<div id="loading-screen" style="position:fixed;inset:0;background:#103060;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9998"><div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.2);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite"></div><div style="color:white;margin-top:16px;font-family:DM Sans,sans-serif;font-size:14px" id="loading-msg">A carregar dados...</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>');
    try {
      document.getElementById('loading-msg').textContent='A carregar obras e colaboradores...';
      await R.carregarDados();
      mostrarDiag(`✓ Dados carregados: ${S.OBRAS.length} obras, ${S.COLABORADORES.length} colaboradores`,'#15803D');
    } catch(e){
      mostrarDiag('❌ Erro ao carregar dados: '+e.message,'#B91C1C');
    }
    const ls=document.getElementById('loading-screen');if(ls)ls.remove();
    const device=applyDeviceClass();
    if(usr.role==='encarregado'){
      document.body.classList.add('enc-mode');
      document.getElementById('enc-app').style.display='flex';
      document.getElementById('enc-name').textContent=usr.nome;
      await R.initEnc();
    } else {
      document.getElementById('admin-app').style.display='flex';
      document.getElementById('u-av').textContent=usr.initials;
      document.getElementById('u-nm').textContent=usr.nome;
      document.getElementById('u-role').textContent=ROLE_LABELS[usr.role]||usr.role;
      if(usr.role==='admin')updateDeviceBadge(device);
      R.applyStoredPermissions();
      R.initAdmin();
      R.applyRolePermissions(usr.role);
      R.initNotifications();
    }
  } else {
    const e=document.getElementById('login-error');e.style.display='block';setTimeout(()=>e.style.display='none',3000);
  }
}

export function doLogout() {
  S.currentUser = null;
  S.NOTIFICACOES = [];
  S.notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
  const badge = document.getElementById('notif-badge');
  if(badge) badge.hidden = true;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('enc-app').style.display = 'none';
  document.getElementById('admin-app').style.display = 'none';
  document.body.classList.remove('enc-mode');
  S.encObraId = ''; S.encDataSel = '';
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

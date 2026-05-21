// ═══════════════════════════════════════
//  CENTRO DE NOTIFICAÇÕES
// ═══════════════════════════════════════
import { S } from '../state.js';
import { closeModal } from './navigation.js';

export function initNotifications(){
  buildNotifications();
  renderNotifPanel();
  document.addEventListener('click', function(e){
    if(S.notifPanelOpen
      && !e.target.closest('.notif-wrap')
      && !e.target.closest('#notif-panel')){
      closeNotifPanel();
    }
  });
}

export function buildNotifications(){
  S.NOTIFICACOES = [];

  if(typeof window.COMPRAS !== 'undefined'){
    const pendentes = window.COMPRAS.filter(c=>c.estado==='pendente'||c.estado==='Pendente');
    if(pendentes.length>0){
      S.NOTIFICACOES.push({
        id:'cmp-pend',
        msg:`${pendentes.length} pedido${pendentes.length>1?'s':''} de compra pendente${pendentes.length>1?'s':''}`,
        time: agora(),
        unread: true,
        section:'compras'
      });
    }
  }

  if(typeof window.FATURAS !== 'undefined'){
    const fPend = window.FATURAS.filter(f=>f.estado==='pendente'||f.estado==='Pendente');
    if(fPend.length>0){
      S.NOTIFICACOES.push({
        id:'fat-pend',
        msg:`${fPend.length} fatura${fPend.length>1?'s':''} aguarda${fPend.length>1?'m':''} validação`,
        time: agora(),
        unread: true,
        section:'faturas'
      });
    }
  }

  const seenWelcome = sessionStorage.getItem('notif-welcome-seen');
  if(!seenWelcome){
    S.NOTIFICACOES.unshift({
      id:'welcome',
      msg:'Bem-vindo ao Portal Plandese. Consulte as suas secções disponíveis.',
      time: agora(),
      unread: true,
      section: null
    });
  }
}

export function agora(){
  return new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
}

export function addNotification(msg, section){
  S.NOTIFICACOES.unshift({id:'n-'+Date.now(), msg, time:agora(), unread:true, section});
  renderNotifPanel();
}

export function renderNotifPanel(){
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if(!list||!badge) return;

  const unread = S.NOTIFICACOES.filter(n=>n.unread).length;
  if(unread>0){
    badge.textContent = unread>9?'9+':unread;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  if(S.NOTIFICACOES.length===0){
    list.innerHTML='<div class="notif-empty">Sem notificações de momento</div>';
    return;
  }

  list.innerHTML = S.NOTIFICACOES.map(n=>`
    <div class="notif-item ${n.unread?'unread':''}" onclick="notifClick('${n.id}','${n.section||''}')">
      <div class="notif-dot"></div>
      <div class="notif-content">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>`).join('');
}

export function notifClick(id, section){
  const n = S.NOTIFICACOES.find(x=>x.id===id);
  if(n) n.unread = false;
  renderNotifPanel();
  closeNotifPanel();
  if(section){
    const btn = document.querySelector(`.sidebar .nav-btn[onclick*="'${section}'"]`);
    window.goTo(section, btn);
  }
}

export function toggleNotifPanel(){
  S.notifPanelOpen = !S.notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if(S.notifPanelOpen){
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

export function closeNotifPanel(){
  S.notifPanelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
}

export function markAllRead(){
  S.NOTIFICACOES.forEach(n=>n.unread=false);
  sessionStorage.setItem('notif-welcome-seen','1');
  renderNotifPanel();
}


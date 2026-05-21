// ═══════════════════════════════════════
//  ADMIN — UTILIZADORES
// ═══════════════════════════════════════
import { S } from '../state.js';
import { sbSaveUser } from '../db.js';
import { closeModal, flashAlert } from './navigation.js';
import { ROLE_LABELS } from '../config.js';

export function renderUsers(){
  const ROLE_BADGE={admin:'b-blue',diretor_obra:'b-blue',compras:'b-orange',financeiro:'b-green',comercial:'b-gray',encarregado:'b-gray'};
  const tbody=document.getElementById('user-tbody');
  tbody.innerHTML='';
  Object.keys(S.USERS).forEach(key=>{
    const u=S.USERS[key];
    const roleLbl=ROLE_LABELS[u.role]||u.role;
    const badgeCls=ROLE_BADGE[u.role]||'b-gray';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-500)">${key}</td><td style="font-weight:500">${u.nome}</td><td><span class="badge ${badgeCls}">${roleLbl}</span></td><td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-400)">${u.pass}</td><td><span class="badge b-green">Ativo</span></td><td><button class="btn btn-secondary btn-sm" onclick="editUser('${key}')">Editar</button></td>`;
    tbody.appendChild(tr);
  });
}

export function editUser(key){const u=S.USERS[key];if(!u)return;document.getElementById('mu-title').textContent='Editar utilizador';document.getElementById('mu-key').value=key;document.getElementById('mu-nome').value=u.nome;document.getElementById('mu-user').value=key;document.getElementById('mu-pass').value=u.pass;document.getElementById('mu-role').value=u.role;document.getElementById('modal-user').classList.add('open');}

export async function saveUser(){
  const nome=document.getElementById('mu-nome').value.trim();
  const user=document.getElementById('mu-user').value.trim().toLowerCase().replace(/\s/g,'.');
  const pass=document.getElementById('mu-pass').value.trim();
  const role=document.getElementById('mu-role').value;
  const editKey=document.getElementById('mu-key').value;
  if(!nome||!user||!pass){alert('Preencha todos os campos.');return;}
  const initials=nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  if(editKey&&editKey!==user)delete S.USERS[editKey];
  S.USERS[user]={pass,nome,initials,role};
  await sbSaveUser(user,{pass,nome,initials,role});
  closeModal('modal-user');renderUsers();flashAlert('user-alert');
}

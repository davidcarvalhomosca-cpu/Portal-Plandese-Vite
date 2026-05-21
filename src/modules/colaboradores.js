// ═══════════════════════════════════════
//  ADMIN — COLABORADORES
// ═══════════════════════════════════════
import { S } from '../state.js';
import { sbSaveColab, sbToggleColab } from '../db.js';
import { closeModal, flashAlert } from './navigation.js';

export function renderColabs(){
  const tbody=document.getElementById('colab-tbody');tbody.innerHTML='';
  const ativos=S.COLABORADORES.filter(c=>c.ativo).length;
  document.getElementById('nb-colab').textContent=ativos;
  document.getElementById('colab-count-sub').textContent=`${S.COLABORADORES.length} colaboradores (${ativos} ativos)`;
  [...S.COLABORADORES].sort((a,b)=>a.n-b.n).forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-400);font-weight:600">${c.n}</td><td style="font-weight:500">${c.nome}</td><td><span class="badge b-gray">${c.func}</span></td><td><span class="badge ${c.ativo?'b-green':'b-gray'}">${c.ativo?'Ativo':'Inativo'}</span></td><td><div style="display:flex;gap:4px"><button class="btn btn-secondary btn-sm" onclick="editColab(${c.n})">Editar</button><button class="btn btn-sm" style="background:${c.ativo?'var(--yellow-bg)':'var(--green-bg)'};color:${c.ativo?'var(--yellow)':'var(--green)'};border:1px solid ${c.ativo?'#FDE68A':'var(--green-light)'}" onclick="toggleColab(${c.n})">${c.ativo?'Desativar':'Ativar'}</button></div></td>`;tbody.appendChild(tr);});
}

export function editColab(n){const c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;document.getElementById('mc-title').textContent='Editar colaborador';document.getElementById('mc-id').value=n;document.getElementById('mc-num').value=c.n;document.getElementById('mc-nome').value=c.nome;document.getElementById('mc-func').value=c.func;document.getElementById('modal-colab').classList.add('open');}

export async function saveColab(){
  const num=parseInt(document.getElementById('mc-num').value);
  const nome=document.getElementById('mc-nome').value.trim();
  const func=document.getElementById('mc-func').value;
  const idEdit=parseInt(document.getElementById('mc-id').value)||0;
  if(!num||!nome){alert('Nº e nome obrigatórios.');return;}
  if(!idEdit&&S.COLABORADORES.find(c=>c.n===num)){alert('Nº já existe.');return;}
  if(idEdit){const idx=S.COLABORADORES.findIndex(c=>c.n===idEdit);if(idx>=0){S.COLABORADORES[idx].n=num;S.COLABORADORES[idx].nome=nome;S.COLABORADORES[idx].func=func;}}
  else S.COLABORADORES.push({n:num,nome,func,ativo:true});
  await sbSaveColab({n:num,nome,func,ativo:true});
  closeModal('modal-colab');renderColabs();flashAlert('colab-alert');
}

export async function toggleColab(n){
  const c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
  c.ativo=!c.ativo;
  await sbToggleColab(n,c.ativo);
  renderColabs();
}

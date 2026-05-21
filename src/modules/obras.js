// ═══════════════════════════════════════
//  ADMIN — OBRAS
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { sbToggleObra } from '../db.js';
import { closeModal, populateFilterSelects, flashAlert } from './navigation.js';

export function renderObras(){
  const cont=document.getElementById('obras-list');cont.innerHTML='';
  if(!S.OBRAS.length){cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px">Nenhuma obra criada. Clique em "Nova obra".</div>';document.getElementById('nb-obras').textContent=0;return;}
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px';
  S.OBRAS.forEach(o=>{const card=document.createElement('div');card.className='card';card.style.padding='16px';card.innerHTML=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="display:flex;align-items:center;gap:10px;flex:1"><div style="width:10px;height:10px;border-radius:50%;background:${o.ativa?'var(--green)':'var(--gray-300)'};flex-shrink:0;margin-top:3px"></div><div><div style="font-weight:600;font-size:14px">${o.nome}</div>${o.local?`<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${o.local}</div>`:''}</div></div><div style="display:flex;gap:4px;flex-shrink:0"><button class="btn btn-secondary btn-sm" onclick="editObra('${o.id}')">Editar</button><button class="btn btn-sm" style="background:${o.ativa?'var(--yellow-bg)':'var(--green-bg)'};color:${o.ativa?'var(--yellow)':'var(--green)'};border:1px solid ${o.ativa?'#FDE68A':'var(--green-light)'}" onclick="toggleObra('${o.id}')">${o.ativa?'Desativar':'Ativar'}</button></div></div>`;grid.appendChild(card);});
  cont.appendChild(grid);document.getElementById('nb-obras').textContent=S.OBRAS.filter(o=>o.ativa).length;
}

export function editObra(id){const o=S.OBRAS.find(x=>x.id===id);if(!o)return;document.getElementById('mo-title').textContent='Editar obra';document.getElementById('mo-id').value=id;document.getElementById('mo-nome').value=o.nome;document.getElementById('mo-local').value=o.local||'';document.getElementById('mo-desc').value=o.desc||'';document.getElementById('modal-obra').classList.add('open');}

export async function saveObra(){
  const nome=document.getElementById('mo-nome').value.trim();if(!nome){alert('Nome obrigatório.');return;}
  const id=document.getElementById('mo-id').value||('obra_'+Date.now());
  const existing=S.OBRAS.findIndex(o=>o.id===id);
  const rec={id,nome,local:document.getElementById('mo-local').value.trim(),desc:document.getElementById('mo-desc').value.trim(),ativa:true};
  try {
    const {error} = await sb.from('obras').upsert({
      id:rec.id, nome:rec.nome, local:rec.local||null, descricao:rec.desc||null, ativa:true
    });
    if(error) throw error;
    if(existing>=0)S.OBRAS[existing]={...S.OBRAS[existing],...rec};else S.OBRAS.push(rec);
    closeModal('modal-obra');renderObras();populateFilterSelects();flashAlert('obra-alert');
  } catch(e){
    alert('Erro ao guardar obra: '+e.message+'\nVerifique a ligação ao Supabase.');
  }
}

export async function toggleObra(id){
  const o=S.OBRAS.find(x=>x.id===id);if(!o)return;
  o.ativa=!o.ativa;
  await sbToggleObra(id,o.ativa);
  renderObras();populateFilterSelects();
}

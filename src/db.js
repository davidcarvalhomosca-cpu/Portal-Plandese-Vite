// ═══════════════════════════════════════
//  DB — Operações Supabase CRUD
// ═══════════════════════════════════════
import { sb } from './supabase.js';
import { S, R } from './state.js';
import { fmt } from './utils/helpers.js';
import { USERS_BASE } from './config.js';

// ═══════════════════════════════════════
//  SUPABASE — CARREGAR DADOS
// ═══════════════════════════════════════
export async function carregarDados() {
  try {
    // Colaboradores
    const {data: colabs} = await sb.from('colaboradores').select('*').order('numero');
    if (colabs && colabs.length > 0) {
      S.COLABORADORES = colabs.map(c => ({n:c.numero, nome:c.nome, func:c.funcao, ativo:c.ativo}));
    }
    // Obras
    const {data: obras} = await sb.from('obras').select('*').order('nome');
    if (obras) {
      S.OBRAS = obras.map(o => ({id:o.id, nome:o.nome, local:o.local||'', desc:o.descricao||'', ativa:o.ativa}));
    }
    // Empresas MOA e colaboradores
    await R.loadEmpresasMOA?.();
    await R.loadColaboradoresMOA?.();
    // Utilizadores
    const {data: users} = await sb.from('utilizadores').select('*');
    if (users && users.length > 0) {
      S.USERS = {};
      users.forEach(u => { S.USERS[u.username] = {pass:u.password, nome:u.nome, initials:u.initials||u.nome.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase(), role:u.role}; });
      if (!S.USERS['admin']) S.USERS['admin'] = USERS_BASE['admin'];
    }
    // Registos do dia atual e 7 dias anteriores
    const dataMin = new Date(S.currentDate); dataMin.setDate(dataMin.getDate()-7);
    const {data: regs} = await sb.from('registos_ponto').select('*').gte('data', fmt(dataMin));
    if (regs) {
      S.REGISTOS = {};
      S.activeRows = {};
      regs.forEach(r => {
        const dk = r.data;
        if (!S.REGISTOS[dk]) S.REGISTOS[dk] = [];
        if (!S.activeRows[dk]) S.activeRows[dk] = [];
        S.REGISTOS[dk].push({colabN:r.colab_numero, obra:r.obra_id, entrada:r.entrada?.slice(0,5)||'', saida:r.saida?.slice(0,5)||'', tipo:r.tipo||'Presença'});
        if (!S.activeRows[dk].includes(r.colab_numero)) S.activeRows[dk].push(r.colab_numero);
      });
    }
  } catch(e) { console.warn('Erro ao carregar dados:', e); }
}

// ═══════════════════════════════════════
//  SUPABASE — GUARDAR REGISTO
// ═══════════════════════════════════════
export async function sbSaveRegisto(dk, n) {
  const r = (S.REGISTOS[dk]||[]).find(x => x.colabN===n);
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

export async function sbSaveObra(rec) {
  try {
    await sb.from('obras').upsert({id:rec.id, nome:rec.nome, local:rec.local||null, descricao:rec.desc||null, ativa:rec.ativa}, {onConflict:'id'});
  } catch(e) { console.warn('Erro ao guardar obra:', e); }
}

export async function sbSaveColab(c) {
  try {
    await sb.from('colaboradores').upsert({numero:c.n, nome:c.nome, funcao:c.func, ativo:c.ativo}, {onConflict:'numero'});
  } catch(e) { console.warn('Erro ao guardar colaborador:', e); }
}

export async function sbSaveUser(key, u) {
  try {
    await sb.from('utilizadores').upsert({username:key, nome:u.nome, password:u.pass, role:u.role, initials:u.initials}, {onConflict:'username'});
  } catch(e) { console.warn('Erro ao guardar utilizador:', e); }
}

export async function sbToggleObra(id, ativa) {
  try { await sb.from('obras').update({ativa}).eq('id',id); } catch(e) {}
}

export async function sbToggleColab(n, ativo) {
  try { await sb.from('colaboradores').update({ativo}).eq('numero',n); } catch(e) {}
}

export function showSaveInd(){
  const el=document.getElementById('save-ind');
  if(!el)return;
  el.classList.add('show');
  clearTimeout(S.saveTimer);
  S.saveTimer=setTimeout(()=>el.classList.remove('show'),2000);
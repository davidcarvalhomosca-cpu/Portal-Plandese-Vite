// ═══════════════════════════════════════
//  PERMISSÕES DE ACESSO
// ═══════════════════════════════════════
import { ROLE_ACCESS } from '../config.js';
import { showToast } from './navigation.js';

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
];

const CONFIGURABLE_ROLES = [
  {key:'diretor_obra', label:'Diretor de Obra'},
  {key:'compras',      label:'Compras'},
  {key:'financeiro',   label:'Financeiro'},
];

const DEFAULT_PERMISSIONS = {
  diretor_obra: ['painel','historico','semana','compras','faturas','equipamentos','producao','obras','colaboradores'],
  compras:      ['painel','compras'],
  financeiro:   ['painel','faturas','compras'],
};

const PERM_STORAGE_KEY = 'plandese_role_permissions_v1';

export function loadPermissions(){
  try {
    const raw = localStorage.getItem(PERM_STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  } catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
}

export function savePermissions(){
  const perms = readPermMatrixState();
  try { localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(perms)); } catch(e){}
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

export function resetPermissions(){
  if(!confirm('Repor todas as permissões para os valores predefinidos?')) return;
  try { localStorage.removeItem(PERM_STORAGE_KEY); } catch(e){}
  CONFIGURABLE_ROLES.forEach(r=>{
    if(ROLE_ACCESS[r.key]){
      ROLE_ACCESS[r.key].sections = [...(DEFAULT_PERMISSIONS[r.key]||[])];
      ROLE_ACCESS[r.key].default  = ROLE_ACCESS[r.key].sections[0]||null;
    }
  });
  renderPermMatrix();
  showToast('Permissões repostas ✓');
}

export function readPermMatrixState(){
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

export function renderPermMatrix(){
  const perms = loadPermissions();
  const thead = document.getElementById('perm-matrix-head');
  if(!thead) return;
  thead.innerHTML = '<tr><th>Perfil</th>' +
    ALL_SECTIONS.map(s=>`<th>${s.label}</th>`).join('') +
    '</tr>';
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
  const adminCells = ALL_SECTIONS.map(()=>`<td>
    <label class="perm-toggle">
      <input type="checkbox" checked disabled/>
      <span class="perm-slider"></span>
    </label>
  </td>`).join('');
  tbody.innerHTML += `<tr style="opacity:.6"><td>Administrador <span style="font-size:10px;color:var(--gray-400);font-weight:400">(total)</span></td>${adminCells}</tr>`;
}

export function onPermChange(chk){
  chk.closest('tr').style.background = 'var(--blue-50)';
  setTimeout(()=>{ chk.closest('tr').style.background=''; }, 800);
}

export function switchUtilTab(tab, btn){
  document.querySelectorAll('.sec-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sec-tab-pane').forEach(p=>p.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('util-pane-'+tab)?.classList.add('active');
  const btnNovo = document.getElementById('btn-novo-utilizador');
  if(btnNovo) btnNovo.style.display = tab==='users' ? '' : 'none';
  if(tab==='perms') renderPermMatrix();
  if(tab==='notifs' && window.renderNotifSubs) window.renderNotifSubs();
}

export function applyStoredPermissions(){
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

export function applyRolePermissions(role){
  if(role === 'admin') return; // admin vê tudo
  const access = ROLE_ACCESS[role];
  if(!access) return;
  const allowed = access.sections || [];
  // Esconder botões de nav não permitidos
  document.querySelectorAll('.nav-btn[data-section],.bnav-btn[data-section]').forEach(btn=>{
    const sec = btn.getAttribute('data-section');
    if(sec && !allowed.includes(sec)) btn.style.display='none';
  });
}

// ═══════════════════════════════════════
//  ADMIN — Painel principal e Fecho de Mês
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT, getMonday, calcH, fmtH } from '../utils/helpers.js';
import { MESES_PT } from '../config.js';
import { showToast } from './navigation.js';

let _painelConfig = null;

// ── Estado do painel ──────────────────────────────────────────────

const PAINEL_WIDGETS_DEF = [
  { id:'obras_ativas',    label:'Obras Ativas',       icon:'<path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>',  section:'obras' },
  { id:'colaboradores',   label:'Colaboradores',      icon:'<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',  section:'colaboradores' },
  { id:'ponto_semana',    label:'Ponto da Semana',    icon:'<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>',  section:'historico' },
  { id:'compras_recentes',label:'Compras Pendentes',  icon:'<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>',  section:'compras' },
  { id:'faturas',         label:'Faturas',            icon:'<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM7 7h7v2H7V7zm10 12H7v-2h10v2zm0-4H7v-2h10v2zm-4-7V3.5L18.5 9H13z"/>',  section:'faturas' },
  { id:'equipamentos',    label:'Equipamentos',       icon:'<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>',  section:'equipamentos' },
  { id:'combustivel',     label:'Combustível',        icon:'<path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM18 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM8 18v-4.5H6L10 7v5h2l-4 6z"/>',  section:'combustivel' },
  { id:'controlo_obras',  label:'Controlo de Obras',  icon:'<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>',  section:'producao' },
];

const PAINEL_DEFAULT_CONFIG = {
  widgets: ['obras_ativas','colaboradores','ponto_semana','compras_recentes'],
  obras_filtro: [], // vazio = todas as obras
};

// ── Carregar config do Supabase ────────────────────────────────────
async function loadPainelConfig() {
  // Tentar carregar do Supabase
  if (S.currentUser?.key) {
    try {
      const { data } = await sb.from('utilizadores').select('painel_config').eq('username', S.currentUser.key).single();
      if (data?.painel_config) {
        _painelConfig = { ...PAINEL_DEFAULT_CONFIG, ...data.painel_config };
        return;
      }
    } catch(e) { console.warn('loadPainelConfig:', e); }
  }
  // Fallback: localStorage
  try {
    const raw = localStorage.getItem('plandese_painel_config_' + (S.currentUser?.key || 'guest'));
    if (raw) { _painelConfig = { ...PAINEL_DEFAULT_CONFIG, ...JSON.parse(raw) }; return; }
  } catch(e) {}
  _painelConfig = { ...PAINEL_DEFAULT_CONFIG };
}

// ── Guardar config no Supabase ─────────────────────────────────────
async function savePainelConfig(cfg) {
  _painelConfig = cfg;
  // localStorage como backup imediato
  try { localStorage.setItem('plandese_painel_config_' + (S.currentUser?.key || 'guest'), JSON.stringify(cfg)); } catch(e) {}
  // Supabase
  if (S.currentUser?.key) {
    try {
      await sb.from('utilizadores').update({ painel_config: cfg }).eq('username', S.currentUser.key);
    } catch(e) { console.warn('savePainelConfig:', e); }
  }
}

// ── Renderizar painel ──────────────────────────────────────────────
async function renderPainel() {
  const grid = document.getElementById('painel-grid');
  if (!grid) return;

  // Carregar config se ainda não tiver
  if (!_painelConfig) await loadPainelConfig();

  const cfg = _painelConfig || PAINEL_DEFAULT_CONFIG;
  const obrasAtivas = S.OBRAS.filter(o => o.ativa);
  const obrasFiltro = (cfg.obras_filtro || []).filter(id => obrasAtivas.some(o => o.id === id));

  // Badge de obras filtradas
  const badge = document.getElementById('painel-obras-badge');
  const badgeTxt = document.getElementById('painel-obras-badge-txt');
  if (badge && badgeTxt) {
    if (obrasFiltro.length > 0) {
      const nomes = obrasFiltro.map(id => obrasAtivas.find(o => o.id === id)?.nome || id).join(', ');
      badgeTxt.textContent = `A mostrar dados de: ${nomes}`;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Saudação personalizada
  const titulo = document.getElementById('painel-titulo');
  if (titulo) {
    const h = new Date().getHours();
    const saudacao = h < 12 ? 'Bom dia' : h < 19 ? 'Boa tarde' : 'Boa noite';
    const nomePropio = S.currentUser?.nome?.split(' ')[0] || '';
    titulo.textContent = nomePropio ? `${saudacao}, ${nomePropio}` : 'Painel Principal';
  }

  // Carregar dados necessários para os widgets ativos
  const widgets = (cfg.widgets || []).filter(wid => PAINEL_WIDGETS_DEF.some(w => w.id === wid));

  if (widgets.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--gray-400);font-size:14px">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:40px;height:40px;margin:0 auto 12px;display:block;opacity:.3"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
      Nenhum widget selecionado. Clique em <strong>Personalizar</strong> para configurar o painel.
    </div>`;
    return;
  }

  // Mostrar loading
  grid.innerHTML = widgets.map(() =>
    `<div class="card" style="min-height:140px;display:flex;align-items:center;justify-content:center">
      <div style="width:24px;height:24px;border:3px solid var(--gray-200);border-top-color:var(--blue);border-radius:50%;animation:spin 1s linear infinite"></div>
    </div>`
  ).join('');

  // Construir cada widget
  const htmlWidgets = await Promise.all(widgets.map(wid => buildWidget(wid, obrasFiltro)));
  grid.innerHTML = htmlWidgets.join('');
}

// ── Construir HTML de cada widget ─────────────────────────────────
async function buildWidget(wid, obrasFiltro) {
  const def = PAINEL_WIDGETS_DEF.find(w => w.id === wid);
  if (!def) return '';

  const goBtn = `<button class="btn btn-secondary btn-sm" onclick="goTo('${def.section}',document.querySelector('.sidebar .nav-btn[onclick*=\\'${def.section}\\']'))" style="margin-top:12px;font-size:11px">Ver tudo →</button>`;

  try {
    if (wid === 'obras_ativas') {
      const obras = S.OBRAS.filter(o => o.ativa && (obrasFiltro.length === 0 || obrasFiltro.includes(o.id)));
      const rows = obras.slice(0, 5).map(o => `<div style="padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:13px;color:var(--gray-700)">${o.nome}</div>`).join('');
      const extra = obras.length > 5 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:6px">+${obras.length-5} mais</div>` : '';
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${obras.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">obras ativas</div>${rows}${extra}${goBtn}`);
    }

    if (wid === 'colaboradores') {
      const ativos = S.COLABORADORES.filter(c => c.ativo);
      const byFunc = {};
      ativos.forEach(c => { byFunc[c.func] = (byFunc[c.func]||0)+1; });
      const top3 = Object.entries(byFunc).sort((a,b)=>b[1]-a[1]).slice(0,3);
      const rows = top3.map(([f,n]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:13px"><span style="color:var(--gray-700)">${f}</span><span style="font-weight:600;color:var(--gray-900)">${n}</span></div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${ativos.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">colaboradores ativos</div>${rows}${goBtn}`);
    }

    if (wid === 'ponto_semana') {
      // Registos desta semana (já carregados em S.REGISTOS)
      const mon = getMonday(new Date());
      const days = [];
      for(let i=0;i<6;i++){ const d=new Date(mon); d.setDate(d.getDate()+i); days.push(fmt(d)); }
      let total = 0, presentes = new Set();
      days.forEach(dk => {
        const regs = S.REGISTOS[dk] || [];
        const filtrados = obrasFiltro.length > 0 ? regs.filter(r => obrasFiltro.includes(r.obra)) : regs;
        filtrados.forEach(r => { presentes.add(r.colabN); if(r.tipo==='Presença'||r.tipo==='Normal'||r.tipo==='Hora Extra') total++; });
      });
      const hoje = fmt(new Date());
      const hoje_regs = (S.REGISTOS[hoje] || []);
      const hoje_pres = obrasFiltro.length > 0 ? hoje_regs.filter(r => obrasFiltro.includes(r.obra)).length : hoje_regs.length;
      return _painelCard(def, `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div style="text-align:center;padding:12px;background:var(--blue-50,#eff6ff);border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:var(--blue)">${hoje_pres}</div>
            <div style="font-size:11px;color:var(--gray-500)">hoje</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:var(--gray-700)">${total}</div>
            <div style="font-size:11px;color:var(--gray-500)">esta semana</div>
          </div>
        </div>
        ${goBtn}`);
    }

    if (wid === 'compras_recentes') {
      const compras = (typeof COMPRAS !== 'undefined' ? COMPRAS : []);
      const pendentes = compras.filter(c => (c.estado||'').toLowerCase() === 'pendente');
      const recentes = compras.slice(0, 4);
      const rows = recentes.map(c => {
        const est = (c.estado||'pendente').toLowerCase();
        const cor = est==='pendente'?'var(--orange,#ea580c)':est==='aprovado'?'var(--green)':'var(--gray-400)';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
          <span style="color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${c.descricao||c.fornecedor||'—'}</span>
          <span style="font-size:10px;font-weight:600;color:${cor};white-space:nowrap">${c.estado||'—'}</span>
        </div>`;
      }).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--orange,#ea580c);line-height:1">${pendentes.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">pedidos pendentes</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem compras registadas</div>'}${goBtn}`);
    }

    if (wid === 'faturas') {
      const fats = (typeof FATURAS !== 'undefined' ? FATURAS : []);
      const total = fats.reduce((s,f) => s+(parseFloat(f.total)||0), 0);
      const recentes = fats.slice(0,4);
      const rows = recentes.map(f => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span style="color:var(--gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${f.fornecedor||f.numero||'—'}</span>
        <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-600)">${(parseFloat(f.total)||0).toLocaleString('pt-PT',{minimumFractionDigits:2})} €</span>
      </div>`).join('');
      return _painelCard(def, `<div style="font-size:24px;font-weight:700;color:var(--gray-800);line-height:1;font-family:'DM Mono',monospace">${total.toLocaleString('pt-PT',{minimumFractionDigits:2})} €</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">${fats.length} faturas</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem faturas carregadas</div>'}${goBtn}`);
    }

    if (wid === 'equipamentos') {
      const equips = (typeof EQUIPAMENTOS !== 'undefined' ? EQUIPAMENTOS : []);
      const bycat = {};
      equips.forEach(e => { const k=e.categoria||'outro'; bycat[k]=(bycat[k]||0)+1; });
      const rows = Object.entries(bycat).map(([k,n]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:13px"><span style="color:var(--gray-700);text-transform:capitalize">${k}</span><span style="font-weight:600">${n}</span></div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${equips.length}</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">equipamentos</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem equipamentos</div>'}${goBtn}`);
    }

    if (wid === 'combustivel') {
      // Buscar últimos registos de combustível do Supabase
      let combustRegs = [];
      try {
        const { data } = await sb.from('registos_combustivel').select('*').order('data',{ascending:false}).order('criado_em',{ascending:false}).limit(5);
        if (data) combustRegs = data;
      } catch(e) {}
      const totalLitros = combustRegs.reduce((s,r) => s+(parseFloat(r.litros)||0), 0);
      const rows = combustRegs.slice(0,4).map(r => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span style="color:var(--gray-700)">${r.data||'—'} · ${r.tipo_combustivel||r.tipo||'—'}</span>
        <span style="font-weight:600;color:var(--gray-900)">${r.litros||0} L</span>
      </div>`).join('');
      return _painelCard(def, `<div style="font-size:36px;font-weight:700;color:var(--blue);line-height:1">${totalLitros.toFixed(0)}<span style="font-size:16px;font-weight:400"> L</span></div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">últimos 5 registos</div>${rows||'<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem registos de combustível</div>'}${goBtn}`);
    }

    if (wid === 'controlo_obras') {
      // Garantir que os dados extra e de produção estão carregados
      _prodLoadLocal();
      _loadObrasExtra();

      const obrasAtivas = S.OBRAS.filter(o => o.ativa && (obrasFiltro.length === 0 || obrasFiltro.includes(o.id)));

      if (obrasAtivas.length === 0) {
        return _painelCard(def, `<div style="font-size:13px;color:var(--gray-400);padding:20px 0;text-align:center">Sem obras ativas</div>${goBtn}`);
      }

      // Calcular stats para cada obra ativa
      const allStats = obrasAtivas.map(o => coComputeStats(o));

      // Contagem por estado
      const nOk   = allStats.filter(s => s.status === 'ok').length;
      const nWarn = allStats.filter(s => s.status === 'warn').length;
      const nBad  = allStats.filter(s => s.status === 'bad').length;

      // Total faturado
      const totalFat = allStats.reduce((sum, s) => sum + s.faturado, 0);

      // Badge de estado colorido
      const statusBadge = (st) => {
        const cor = st === 'ok' ? 'var(--green,#16a34a)' : st === 'warn' ? 'var(--orange,#ea580c)' : 'var(--red,#dc2626)';
        const bg  = st === 'ok' ? '#f0fdf4' : st === 'warn' ? '#fff7ed' : '#fef2f2';
        const lbl = st === 'ok' ? 'OK' : st === 'warn' ? 'Atenção' : 'Alerta';
        return `<span style="font-size:10px;font-weight:600;color:${cor};background:${bg};border-radius:4px;padding:2px 6px;white-space:nowrap">${lbl}</span>`;
      };

      // Barra de progresso
      const progressBar = (pct, color) => {
        const p = Math.min(100, Math.max(0, pct));
        return `<div style="height:4px;background:var(--gray-100);border-radius:2px;overflow:hidden;margin-top:3px">
          <div style="height:100%;width:${p}%;background:${color};border-radius:2px;transition:width .3s"></div>
        </div>`;
      };

      // Cabeçalho com contagens de estado
      const resumo = `
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          ${nOk   > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--green,#16a34a);background:#f0fdf4;border-radius:6px;padding:4px 8px"><span style="font-weight:700">${nOk}</span> em curso</div>` : ''}
          ${nWarn > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--orange,#ea580c);background:#fff7ed;border-radius:6px;padding:4px 8px"><span style="font-weight:700">${nWarn}</span> atenção</div>` : ''}
          ${nBad  > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--red,#dc2626);background:#fef2f2;border-radius:6px;padding:4px 8px"><span style="font-weight:700">${nBad}</span> alerta</div>` : ''}
        </div>`;

      // Linhas por obra (máx 5, ordenadas: bad → warn → ok)
      const sorted = allStats.slice().sort((a, b) => {
        const rank = { bad: 0, warn: 1, ok: 2 };
        return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
      });

      const rows = sorted.slice(0, 5).map(s => {
        const temPrazo = s.tempoPct > 0;
        const temExec  = s.execPct  > 0 || s.contratado > 0;
        const execColor = s.status === 'bad' ? 'var(--red,#dc2626)' : s.status === 'warn' ? 'var(--orange,#ea580c)' : 'var(--blue)';

        const prazoPart = temPrazo
          ? `<div style="font-size:10px;color:var(--gray-400);margin-top:1px">
               Tempo: ${s.tempoPct.toFixed(0)}%
               ${s.diasRest !== null ? ` · ${s.diasRest >= 0 ? s.diasRest + 'd restantes' : Math.abs(s.diasRest) + 'd atraso'}` : ''}
             </div>
             ${progressBar(s.tempoPct, 'var(--gray-300)')}`
          : '';

        const execPart = temExec
          ? `<div style="font-size:10px;color:var(--gray-400);margin-top:4px">
               Execução: ${s.execPct.toFixed(0)}%
               ${s.faturado > 0 ? ` · ${prodFmtEur(s.faturado)}` : ''}
             </div>
             ${progressBar(s.execPct, execColor)}`
          : '';

        return `<div style="padding:8px 0;border-bottom:1px solid var(--gray-100)">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span style="font-size:12px;font-weight:500;color:var(--gray-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${s.obra.nome}</span>
            ${statusBadge(s.status)}
          </div>
          ${prazoPart}${execPart}
        </div>`;
      }).join('');

      const extra = sorted.length > 5 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:6px">+${sorted.length - 5} mais obras</div>` : '';

      const totalFatHtml = totalFat > 0
        ? `<div style="font-size:11px;color:var(--gray-500);margin-top:10px;padding-top:8px;border-top:1px solid var(--gray-100)">
             Total faturado: <strong style="color:var(--gray-800);font-family:'DM Mono',monospace">${prodFmtEur(totalFat)}</strong>
           </div>` : '';

      return _painelCard(def, `${resumo}${rows}${extra}${totalFatHtml}${goBtn}`);
    }

  } catch(e) {
    console.warn('buildWidget error:', wid, e);
    return _painelCard(def, `<div style="font-size:13px;color:var(--red,#dc2626);padding:12px 0">Erro ao carregar dados</div>`);
  }

  return '';
}

// ── Helper: card HTML ──────────────────────────────────────────────
function _painelCard(def, bodyHtml) {
  return `<div class="card" style="padding:20px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:36px;height:36px;border-radius:8px;background:var(--blue-50,#eff6ff);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:var(--blue)">${def.icon}</svg>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--gray-700)">${def.label}</div>
    </div>
    ${bodyHtml}
  </div>`;
}

// ── Abrir modal de personalização ──────────────────────────────────
function openPainelCustomizer() {
  if (!_painelConfig) _painelConfig = { ...PAINEL_DEFAULT_CONFIG };
  const cfg = _painelConfig;

  // Widgets checkboxes
  const widChecks = document.getElementById('painel-widget-checks');
  if (widChecks) {
    widChecks.innerHTML = PAINEL_WIDGETS_DEF.map(w => {
      const checked = (cfg.widgets || []).includes(w.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid ${checked?'var(--blue)':'var(--gray-200)'};border-radius:8px;cursor:pointer;background:${checked?'var(--blue-50,#eff6ff)':'white'};transition:all .15s;font-size:13px" id="painel-wlbl-${w.id}">
        <input type="checkbox" id="painel-wchk-${w.id}" ${checked?'checked':''} onchange="painelWChkChange('${w.id}',this)" style="accent-color:var(--blue)"/>
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;flex-shrink:0;color:var(--blue)">${w.icon}</svg>
        ${w.label}
      </label>`;
    }).join('');
  }

  // Obras checkboxes
  const obraChecks = document.getElementById('painel-obra-checks');
  if (obraChecks) {
    const obrasAtivas = S.OBRAS.filter(o => o.ativa);
    if (obrasAtivas.length === 0) {
      obraChecks.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Sem obras ativas</div>';
    } else {
      obraChecks.innerHTML = obrasAtivas.map(o => {
        const checked = (cfg.obras_filtro || []).includes(o.id);
        return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 10px;border-radius:6px;cursor:pointer;background:${checked?'var(--blue-50,#eff6ff)':'transparent'};transition:all .15s" id="painel-obra-lbl-${o.id}">
          <input type="checkbox" id="painel-obra-chk-${o.id}" ${checked?'checked':''} onchange="painelObraChkChange('${o.id}',this)" style="accent-color:var(--blue)"/>
          ${o.nome}
        </label>`;
      }).join('');
    }
  }

  const modal = document.getElementById('painel-modal-bg');
  if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
}

function painelWChkChange(wid, chk) {
  const lbl = document.getElementById('painel-wlbl-'+wid);
  if (lbl) {
    lbl.style.borderColor = chk.checked ? 'var(--blue)' : 'var(--gray-200)';
    lbl.style.background = chk.checked ? 'var(--blue-50,#eff6ff)' : 'white';
  }
}

function painelObraChkChange(obraId, chk) {
  const lbl = document.getElementById('painel-obra-lbl-'+obraId);
  if (lbl) lbl.style.background = chk.checked ? 'var(--blue-50,#eff6ff)' : 'transparent';
}

function closePainelCustomizer() {
  const modal = document.getElementById('painel-modal-bg');
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

async function savePainelCustomizer() {
  // Ler widgets selecionados
  const widgets = PAINEL_WIDGETS_DEF.map(w => w.id).filter(wid => {
    const chk = document.getElementById('painel-wchk-'+wid);
    return chk && chk.checked;
  });
  // Ler obras selecionadas
  const obras_filtro = S.OBRAS.filter(o => o.ativa).map(o => o.id).filter(id => {
    const chk = document.getElementById('painel-obra-chk-'+id);
    return chk && chk.checked;
  });

  const cfg = { widgets, obras_filtro };
  await savePainelConfig(cfg);
  closePainelCustomizer();
  showToast('Painel guardado ✓');
  renderPainel();
}

async function renderFechoMes(){
  const sel = document.getElementById('fecho-mes-sel');
  if(!sel) return;
  const mesVal = parseInt(sel.value);
  const ano = 2026;

  // Período: 22 do mês anterior → 21 do mês atual
  // Usar hora 12:00 para evitar problemas de timezone (UTC vs UTC+1)
  const dataIni = new Date(ano, mesVal === 1 ? -1 : mesVal - 2, 22, 12, 0, 0);
  const dataFim = new Date(ano, mesVal - 1, 21, 12, 0, 0);

  // Formatar datas para string YYYY-MM-DD sem desvio de timezone
  const fmtLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  };

  const dIniStr = fmtLocal(dataIni);
  const dFimStr = fmtLocal(dataFim);

  // Atualiza info do período
  const infoEl = document.getElementById('fecho-periodo-info');
  if(infoEl) infoEl.textContent = 'Período: ' + dIniStr.split('-').reverse().join('/') + ' a ' + dFimStr.split('-').reverse().join('/');

  const tbody = document.getElementById('fecho-tbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--gray-500)">A carregar dados…</td></tr>';

  try {
    const {data: regs, error} = await sb.from('registos_ponto').select('*').gte('data', dIniStr).lte('data', dFimStr);
    if(error) throw new Error(error.message);

    // Construir mapa: data → colabNumero → registo
    const regMap = {};
    (regs||[]).forEach(r => {
      if(!regMap[r.data]) regMap[r.data] = {};
      regMap[r.data][String(r.colab_numero)] = r;
    });

    // Gerar lista de datas do período usando fmtLocal
    const datas = [];
    for(let d = new Date(dataIni); fmtLocal(d) <= dFimStr; d.setDate(d.getDate()+1)){
      datas.push(fmtLocal(new Date(d)));
    }

    // Calcular horas por colaborador
    const colabsAtivos = [...S.COLABORADORES].filter(c => c.ativo).sort((a,b) => a.n - b.n);
    const rows = [];

    for(const colab of colabsAtivos){
      const {n, nome, func} = colab;
      let totN = 0, totE = 0;
      const obraHoras = {};

      for(const dk of datas){
        const r = (regMap[dk]||{})[String(n)];
        if(!r) continue;
        if(r.tipo === 'Folga') continue;
        const dateObj = new Date(dk + 'T12:00:00');
        const h = calcH(r.entrada ? r.entrada.slice(0,5) : '', r.saida ? r.saida.slice(0,5) : '', dateObj);
        totN += h.n;
        totE += h.e;
        const oId = r.obra_id || '_sem_obra';
        obraHoras[oId] = (obraHoras[oId]||0) + h.t;
      }

      const totT = totN + totE;
      if(totT === 0) continue;
      rows.push({n, nome, func, totN, totE, totT, obraHoras});
    }

    if(!tbody) return;

    if(rows.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--gray-400)">Sem registos para este período (' + dIniStr + ' a ' + dFimStr + '). Total de registos carregados: ' + (regs||[]).length + '</td></tr>';
      const totaisEl = document.getElementById('fecho-totais');
      if(totaisEl) totaisEl.style.display = 'none';
      return;
    }

    let globalN = 0, globalE = 0, globalT = 0;
    const htmlRows = rows.map((row, i) => {
      globalN += row.totN;
      globalE += row.totE;
      globalT += row.totT;

      const obraEntries = Object.entries(row.obraHoras).sort((a,b) => b[1]-a[1]);
      const obraBadges = obraEntries.map(([oId, horas]) => {
        const pct = row.totT > 0 ? Math.round((horas / row.totT) * 100) : 0;
        const obra = S.OBRAS.find(o => String(o.id) === String(oId));
        const oNome = obra ? (obra.nome || obra.numero || oId) : (oId === '_sem_obra' ? 'Sem obra' : oId);
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;color:#1d4ed8;white-space:nowrap;margin:2px 2px 2px 0">' + oNome + ' <span style="color:#6b7280">' + pct + '%</span></span>';
      }).join('');

      const bg = i % 2 === 0 ? '' : 'background:var(--gray-50)';
      return '<tr style="' + bg + '">'
        + '<td style="padding:10px 14px;color:var(--gray-500);font-family:monospace;font-size:12px">' + row.n + '</td>'
        + '<td style="padding:10px 14px;font-weight:600;color:var(--gray-900)">' + row.nome + '</td>'
        + '<td style="padding:10px 14px;color:var(--gray-600);font-size:12px">' + (row.func||'—') + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;color:var(--gray-700)">' + fmtH(row.totN) + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;color:#3b82f6">' + fmtH(row.totE) + '</td>'
        + '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-weight:700;color:var(--green)">' + fmtH(row.totT) + '</td>'
        + '<td style="padding:10px 14px">' + (obraBadges || '<span style="color:var(--gray-300);font-size:12px">—</span>') + '</td>'
        + '</tr>';
    });
    tbody.innerHTML = htmlRows.join('');

    // Totais rodapé
    const totaisEl = document.getElementById('fecho-totais');
    if(totaisEl){
      totaisEl.style.display = '';
      document.getElementById('fecho-tot-n').textContent = fmtH(globalN);
      document.getElementById('fecho-tot-e').textContent = fmtH(globalE);
      document.getElementById('fecho-tot-t').textContent = fmtH(globalT);
      document.getElementById('fecho-tot-w').textContent = rows.length;
    }

    window._fechoMesData = {rows, mesVal, ano, dIniStr, dFimStr};

  } catch(err) {
    console.error('renderFechoMes error:', err);
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red)">Erro: ' + err.message + '</td></tr>';
  }
}

async function exportFechoMes(){
  if(!window._fechoMesData || !window._fechoMesData.rows || !window._fechoMesData.rows.length){
    showToast('Carregue primeiro os dados clicando em Atualizar.');
    return;
  }
  const {rows, mesVal, dIniStr, dFimStr} = window._fechoMesData;
  const mesNome = MESES_PT[mesVal-1];

  showToast('A gerar ficheiro Excel\u2026');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plandese SA';
  const ws = workbook.addWorksheet('Folha de Fecho');

  ws.columns = [
    {header:'N\u00ba', key:'n', width:6},
    {header:'Nome', key:'nome', width:28},
    {header:'Fun\u00e7\u00e3o', key:'func', width:18},
    {header:'H.Normais', key:'hn', width:12},
    {header:'H.Extra', key:'he', width:10},
    {header:'Total', key:'ht', width:10},
    {header:'Distribui\u00e7\u00e3o por Obra', key:'obras', width:50},
  ];

  // Linha de título (inserida antes do cabeçalho)
  ws.spliceRows(1, 0, []);
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Folha de Fecho \u2014 ' + mesNome + ' 2026 (' + dIniStr + ' a ' + dFimStr + ')';
  titleCell.font = {bold:true, size:13, color:{argb:'FF002060'}};
  titleCell.alignment = {horizontal:'center', vertical:'middle'};
  titleCell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFD9E1F2'}};
  ws.getRow(1).height = 22;

  // Cabeçalhos da tabela
  const hdr = ws.getRow(2);
  ['N\u00ba','Nome','Fun\u00e7\u00e3o','H. Normais','H. Extra','Total Horas','Distribui\u00e7\u00e3o por Obra'].forEach((v,i) => {
    const cell = hdr.getCell(i+1);
    cell.value = v;
    cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF002060'}};
    cell.alignment = {horizontal:'center', vertical:'middle'};
  });
  hdr.height = 18;

  // Linhas de dados
  rows.forEach((row, i) => {
    const obraEntries = Object.entries(row.obraHoras).sort((a,b) => b[1]-a[1]);
    const obraStr = obraEntries.map(([oId, h]) => {
      const pct = row.totT > 0 ? Math.round((h/row.totT)*100) : 0;
      const obra = S.OBRAS.find(o => o.id === oId);
      const oNome = obra ? (obra.nome||obra.numero||oId) : (oId === '_sem_obra' ? 'Sem obra' : oId);
      return oNome + ': ' + pct + '%';
    }).join(' | ');

    const dataRow = ws.getRow(i+3);
    dataRow.values = [row.n, row.nome, row.func||'', fmtH(row.totN), fmtH(row.totE), fmtH(row.totT), obraStr];
    dataRow.eachCell(cell => {
      cell.alignment = {vertical:'middle', wrapText:true};
      if(i%2===1) cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFF2F6FF'}};
    });
    dataRow.height = 16;
  });

  // Linha de totais
  const totRow = ws.getRow(rows.length+3);
  const globalN = rows.reduce((s,r) => s+r.totN, 0);
  const globalE = rows.reduce((s,r) => s+r.totE, 0);
  const globalT = rows.reduce((s,r) => s+r.totT, 0);
  totRow.values = ['', 'TOTAL (' + rows.length + ' trabalhadores)', '', fmtH(globalN), fmtH(globalE), fmtH(globalT), ''];
  totRow.eachCell(cell => {
    cell.font = {bold:true, color:{argb:'FF002060'}};
    cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFD9E1F2'}};
    cell.alignment = {vertical:'middle', horizontal:'center'};
  });
  totRow.height = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Folha_Fecho_' + mesNome + '_2026.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  showToast('\u2713 Ficheiro exportado!');
}

export {
  loadPainelConfig, savePainelConfig, renderPainel, buildWidget, _painelCard,
  openPainelCustomizer, closePainelCustomizer, savePainelCustomizer,
  painelWChkChange, painelObraChkChange,
  renderFechoM
// ═══════════════════════════════════════
//  FÉRIAS — Mapa anual por colaborador
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt } from '../utils/helpers.js';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let _ano = new Date().getFullYear();
let _locked = true;
let _filtroFunc = null;
let _feriasUtilizadas = new Set(); // 'colab_numero|YYYY-MM-DD' — vêm das folhas de ponto
let _feriasPrevistas  = new Set(); // 'colab_numero|YYYY-MM-DD' — planeadas, editáveis

const NAME_W = 160;
const TOT_W  = 52;
// Fundo dos fins de semana — listras diagonais subtis para realçar
const WKND_BG = "repeating-linear-gradient(135deg,#E9EDF2 0px,#E9EDF2 3px,#D4DAE3 3px,#D4DAE3 6px)";

// ── Navegação de ano — precisa de novo fetch ──────────────────
export function feriasNavAno(delta) {
  _ano += delta;
  renderMapaFerias();
}

// ── Lock / Unlock — apenas re-render, sem novo fetch ─────────
export function feriasToggleLock() {
  _locked = !_locked;
  _applyLockBtn();
  _renderTabela();
}

// ── Filtro por função — apenas re-render, sem novo fetch ─────
export function feriasSetFiltro(func) {
  _filtroFunc = (_filtroFunc === func) ? null : func;
  _renderTabela();
}

// ── Toggle férias previstas (click na célula) ─────────────────
export async function feriasTogglePrevista(colabN, dateStr) {
  if (_locked) return;
  const key = `${colabN}|${dateStr}`;
  if (_feriasUtilizadas.has(key)) return;

  try {
    if (_feriasPrevistas.has(key)) {
      await sb.from('ferias_previstas')
        .delete()
        .eq('colab_numero', colabN)
        .eq('data', dateStr);
      _feriasPrevistas.delete(key);
    } else {
      await sb.from('ferias_previstas')
        .upsert({ colab_numero: colabN, data: dateStr }, { onConflict: 'colab_numero,data' });
      _feriasPrevistas.add(key);
    }
    _updateColabRow(colabN);
  } catch (e) {
    console.warn('feriasTogglePrevista:', e);
  }
}

// ── Atualiza só a linha de um colaborador sem re-render total ──
function _updateColabRow(colabN) {
  const colab = S.COLABORADORES.find(c => c.n === colabN);
  if (!colab) return;

  let totalUtil = 0, totalPrev = 0;

  for (let m = 0; m < 12; m++) {
    const diasNoMes = new Date(_ano, m + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const dateObj = new Date(_ano, m, d);
      const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const dateStr = fmt(new Date(_ano, m, d, 12));
      const key = `${colabN}|${dateStr}`;
      const isUtil = _feriasUtilizadas.has(key);
      const isPrev = _feriasPrevistas.has(key);

      if (!isWknd) {
        if (isUtil) totalUtil++;
        else if (isPrev) totalPrev++;
      }

      const cell = document.getElementById(`fc-${colabN}-${dateStr}`);
      if (!cell) continue;

      _styleCell(cell, { isUtil, isPrev, isWknd, d, m, colabN, dateStr });
    }
  }

  const totalMarcadas = totalUtil + totalPrev;
  const elMarc = document.getElementById(`ft-marc-${colabN}`);
  if (elMarc) elMarc.innerHTML = _totalBadge(totalMarcadas, 'var(--gray-600)', 'var(--gray-100)');
  const elUtil = document.getElementById(`ft-util-${colabN}`);
  if (elUtil) elUtil.innerHTML = _totalBadge(totalUtil, '#065F46', '#D1FAE5');
  const elPrev = document.getElementById(`ft-prev-${colabN}`);
  if (elPrev) elPrev.innerHTML = _totalBadge(totalPrev, '#92400E', '#FEF3C7');
}

// ── Aplica estilo + handlers a uma célula de dia ──────────────
function _styleCell(cell, { isUtil, isPrev, isWknd, d, m, colabN, dateStr }) {
  cell.onclick = null;
  if (isUtil) {
    cell.style.background = '#10B981';
    cell.style.cursor = 'default';
    cell.title = `Férias utilizadas — ${d} ${MESES_FULL[m]}`;
  } else if (isPrev) {
    cell.style.background = '#F59E0B';
    if (_locked) {
      cell.style.cursor = 'default';
      cell.title = `Férias previstas — ${d} ${MESES_FULL[m]}`;
    } else {
      cell.style.cursor = 'pointer';
      cell.title = `Férias previstas — ${d} ${MESES_FULL[m]} (clique para remover)`;
      cell.onclick = () => feriasTogglePrevista(colabN, dateStr);
    }
  } else if (isWknd) {
    cell.style.background = WKND_BG;
    cell.style.cursor = 'default';
    cell.title = '';
  } else {
    cell.style.background = '';
    if (_locked) {
      cell.style.cursor = 'default';
      cell.title = '';
    } else {
      cell.style.cursor = 'pointer';
      cell.title = `Clique para marcar férias — ${d} ${MESES_FULL[m]}`;
      cell.onclick = () => feriasTogglePrevista(colabN, dateStr);
    }
  }
}

function _totalBadge(n, color, bg) {
  return `<span style="display:inline-block;padding:2px 6px;border-radius:9999px;font-size:11px;font-weight:600;background:${bg};color:${color}">${n}d</span>`;
}

function _svgLock() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H8.9V6zM18 20H6V10h12v10z"/></svg>`;
}

function _svgLockOpen() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.65 1.35-3 3-3s3 1.35 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>`;
}

function _applyLockBtn() {
  const btn = document.getElementById('ferias-lock-btn');
  if (!btn) return;
  if (_locked) {
    btn.title = 'Mapa trancado — clique para editar';
    btn.style.color = '';
    btn.style.background = '';
    btn.innerHTML = _svgLock();
  } else {
    btn.title = 'Mapa destrancado — clique para trancar';
    btn.style.color = 'var(--primary)';
    btn.style.background = 'var(--primary-50, #EFF6FF)';
    btn.innerHTML = _svgLockOpen();
  }
}

// ── Render principal: fetch Supabase + tabela ─────────────────
export async function renderMapaFerias() {
  const cont = document.getElementById('ferias-cont');
  if (!cont) return;

  const lbl = document.getElementById('ferias-ano-label');
  if (lbl) lbl.textContent = _ano;

  _applyLockBtn();

  cont.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">A carregar...</div>';

  const dIni = `${_ano}-01-01`;
  const dFim = `${_ano}-12-31`;

  try {
    const { data: dataUtil, error: errUtil } = await sb
      .from('registos_ponto')
      .select('colab_numero, data')
      .eq('tipo', 'Férias')
      .gte('data', dIni)
      .lte('data', dFim);
    if (errUtil) throw errUtil;
    _feriasUtilizadas = new Set((dataUtil || []).map(r => `${r.colab_numero}|${r.data}`));

    const { data: dataPrev, error: errPrev } = await sb
      .from('ferias_previstas')
      .select('colab_numero, data')
      .gte('data', dIni)
      .lte('data', dFim);
    if (errPrev) throw errPrev;
    _feriasPrevistas = new Set((dataPrev || []).map(r => `${r.colab_numero}|${r.data}`));

  } catch (e) {
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--red);padding:32px;font-size:13px">⚠️ Erro ao carregar dados: ${e.message}</div>`;
    return;
  }

  _renderTabela();
}

// ── Render da tabela a partir dos dados em memória ────────────
// Chamado por lock/filtro — nunca faz fetch ao Supabase.
function _renderTabela() {
  const cont = document.getElementById('ferias-cont');
  if (!cont) return;

  const allColabs = S.COLABORADORES.filter(c => c.ativo).sort((a, b) => a.n - b.n);
  if (!allColabs.length) {
    cont.innerHTML = '<div class="card" style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">Sem colaboradores ativos.</div>';
    return;
  }

  const funcs = [...new Set(allColabs.map(c => c.func))].sort();
  const colabs = _filtroFunc ? allColabs.filter(c => c.func === _filtroFunc) : allColabs;

  cont.innerHTML = '';

  // ── Barra de filtro por função ────────────────────────────────
  const filtroBar = document.createElement('div');
  filtroBar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap';

  const filtroLbl = document.createElement('span');
  filtroLbl.style.cssText = 'font-size:12px;font-weight:500;color:var(--gray-500);white-space:nowrap';
  filtroLbl.textContent = 'Função:';
  filtroBar.appendChild(filtroLbl);

  const chipStyle = (active) =>
    `padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:500;border:1px solid ${active ? 'var(--primary)' : 'var(--gray-200)'};background:${active ? 'var(--primary)' : 'white'};color:${active ? 'white' : 'var(--gray-600)'};cursor:pointer;transition:all .15s`;

  const chipTodos = document.createElement('button');
  chipTodos.style.cssText = chipStyle(!_filtroFunc);
  chipTodos.textContent = 'Todos';
  chipTodos.onclick = () => { _filtroFunc = null; _renderTabela(); };
  filtroBar.appendChild(chipTodos);

  for (const f of funcs) {
    const chip = document.createElement('button');
    chip.style.cssText = chipStyle(_filtroFunc === f);
    chip.textContent = f;
    chip.onclick = () => feriasSetFiltro(f);
    filtroBar.appendChild(chip);
  }

  cont.appendChild(filtroBar);

  // ── Tabela ────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'overflow-x:auto;border-radius:12px;border:1px solid var(--gray-200)';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;min-width:900px;font-size:12px';

  const stickyTh = (left) =>
    `position:sticky;left:${left}px;background:var(--gray-50);z-index:2;`;
  const stickyTd = (left) =>
    `position:sticky;left:${left}px;background:white;z-index:1;`;

  // Cabeçalho de meses
  let thead = '<thead>';
  thead += '<tr style="background:var(--gray-50)">';
  thead += `<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);white-space:nowrap;border-bottom:2px solid var(--gray-200);width:${NAME_W}px;min-width:${NAME_W}px;${stickyTh(0)}">Colaborador</th>`;
  thead += `<th style="padding:6px 2px;text-align:center;font-size:10px;font-weight:600;color:var(--gray-500);border-bottom:2px solid var(--gray-200);border-left:1px solid var(--gray-200);width:${TOT_W}px;min-width:${TOT_W}px;${stickyTh(NAME_W)}">Marc.</th>`;
  thead += `<th style="padding:6px 2px;text-align:center;font-size:10px;font-weight:600;color:#065F46;border-bottom:2px solid var(--gray-200);border-left:1px solid var(--gray-200);width:${TOT_W}px;min-width:${TOT_W}px;${stickyTh(NAME_W + TOT_W)}">Usadas</th>`;
  thead += `<th style="padding:6px 2px;text-align:center;font-size:10px;font-weight:600;color:#92400E;border-bottom:2px solid var(--gray-200);border-left:1px solid var(--gray-200);border-right:2px solid var(--gray-300);width:${TOT_W}px;min-width:${TOT_W}px;${stickyTh(NAME_W + TOT_W * 2)}">P/ Usar</th>`;

  for (let m = 0; m < 12; m++) {
    const diasNoMes = new Date(_ano, m + 1, 0).getDate();
    thead += `<th colspan="${diasNoMes}" style="padding:8px 4px;text-align:center;font-size:11px;font-weight:600;color:var(--gray-500);border-bottom:1px solid var(--gray-200);border-left:2px solid var(--gray-200)">${MESES[m]}</th>`;
  }
  thead += '</tr>';

  // Sub-cabeçalho de dias
  thead += '<tr style="background:var(--gray-50)">';
  thead += `<th style="border-bottom:1px solid var(--gray-200);${stickyTh(0)}"></th>`;
  thead += `<th style="border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);${stickyTh(NAME_W)}"></th>`;
  thead += `<th style="border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);${stickyTh(NAME_W + TOT_W)}"></th>`;
  thead += `<th style="border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);border-right:2px solid var(--gray-300);${stickyTh(NAME_W + TOT_W * 2)}"></th>`;

  for (let m = 0; m < 12; m++) {
    const diasNoMes = new Date(_ano, m + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const dateObj = new Date(_ano, m, d);
      const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const wkndBg = isWknd ? `background:${WKND_BG};` : '';
      const borderL = d === 1 ? 'border-left:2px solid var(--gray-200)' : 'border-left:1px solid var(--gray-100)';
      thead += `<th style="padding:3px 0;text-align:center;font-size:9px;font-weight:500;color:var(--gray-400);border-bottom:1px solid var(--gray-200);width:18px;min-width:18px;${wkndBg}${borderL}">${d}</th>`;
    }
  }
  thead += '</tr>';
  thead += '</thead>';

  // Corpo — uma linha por colaborador
  let tbody = '<tbody>';
  for (const colab of colabs) {
    let totalUtil = 0, totalPrev = 0;
    let cells = '';

    for (let m = 0; m < 12; m++) {
      const diasNoMes = new Date(_ano, m + 1, 0).getDate();
      for (let d = 1; d <= diasNoMes; d++) {
        const dateObj = new Date(_ano, m, d);
        const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const dateStr = fmt(new Date(_ano, m, d, 12));
        const key = `${colab.n}|${dateStr}`;
        const isUtil = _feriasUtilizadas.has(key);
        const isPrev = _feriasPrevistas.has(key);

        if (!isWknd) {
          if (isUtil) totalUtil++;
          else if (isPrev) totalPrev++;
        }

        const borderL = d === 1 ? 'border-left:2px solid var(--gray-200)' : 'border-left:1px solid var(--gray-100)';

        let bg = '', titleAttr = '', cursorStyle = '', onclickAttr = '';
        if (isUtil) {
          bg = 'background:#10B981;';
          titleAttr = ` title="Férias utilizadas — ${d} ${MESES_FULL[m]}"`;
          cursorStyle = 'cursor:default;';
        } else if (isPrev) {
          bg = 'background:#F59E0B;';
          if (_locked) {
            titleAttr = ` title="Férias previstas — ${d} ${MESES_FULL[m]}"`;
            cursorStyle = 'cursor:default;';
          } else {
            titleAttr = ` title="Férias previstas — ${d} ${MESES_FULL[m]} (clique para remover)"`;
            cursorStyle = 'cursor:pointer;';
            onclickAttr = ` onclick="feriasTogglePrevista(${colab.n},'${dateStr}')"`;
          }
        } else if (isWknd) {
          bg = `background:${WKND_BG};`;
          cursorStyle = 'cursor:default;';
        } else {
          if (_locked) {
            cursorStyle = 'cursor:default;';
          } else {
            titleAttr = ` title="Clique para marcar férias — ${d} ${MESES_FULL[m]}"`;
            cursorStyle = 'cursor:pointer;';
            onclickAttr = ` onclick="feriasTogglePrevista(${colab.n},'${dateStr}')"`;
          }
        }

        cells += `<td id="fc-${colab.n}-${dateStr}" style="padding:0;height:28px;${bg}${cursorStyle}${borderL}"${titleAttr}${onclickAttr}></td>`;
      }
    }

    const totalMarcadas = totalUtil + totalPrev;

    tbody += `<tr style="border-bottom:1px solid var(--gray-100)">`;
    tbody += `<td style="padding:6px 14px;white-space:nowrap;font-weight:500;font-size:12px;color:var(--gray-700);border-right:1px solid var(--gray-200);${stickyTd(0)}">
      <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gray-400);margin-right:6px">${colab.n}</span>${colab.nome}
      <div style="font-size:10px;color:var(--gray-400);margin-top:1px;font-weight:400">${colab.func}</div>
    </td>`;
    tbody += `<td id="ft-marc-${colab.n}" style="padding:4px;text-align:center;border-left:1px solid var(--gray-200);${stickyTd(NAME_W)}">${_totalBadge(totalMarcadas, 'var(--gray-600)', 'var(--gray-100)')}</td>`;
    tbody += `<td id="ft-util-${colab.n}" style="padding:4px;text-align:center;border-left:1px solid var(--gray-200);${stickyTd(NAME_W + TOT_W)}">${_totalBadge(totalUtil, '#065F46', '#D1FAE5')}</td>`;
    tbody += `<td id="ft-prev-${colab.n}" style="padding:4px;text-align:center;border-left:1px solid var(--gray-200);border-right:2px solid var(--gray-300);${stickyTd(NAME_W + TOT_W * 2)}">${_totalBadge(totalPrev, '#92400E', '#FEF3C7')}</td>`;
    tbody += cells;
    tbody += `</tr>`;
  }
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
  wrapper.appendChild(table);
  cont.appendChild(wrapper);

  // Legenda
  const leg = document.createElement('div');
  leg.style.cssText = 'display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap';

  const lockInfo = _locked
    ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--gray-500);padding:3px 10px;border-radius:8px;background:var(--gray-50);border:1px solid var(--gray-200)">${_svgLock()} Mapa trancado</span>`
    : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--primary);padding:3px 10px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE">${_svgLockOpen()} Modo edição ativo</span>`;

  leg.innerHTML = `
    ${lockInfo}
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#10B981"></span> Férias utilizadas
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#F59E0B"></span> Férias previstas
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${WKND_BG};border:1px solid var(--gray-200)"></span> Fim de semana
    </div>
  `;
  cont.appendChild(leg);
}

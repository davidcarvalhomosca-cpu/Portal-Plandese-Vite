// ═══════════════════════════════════════
//  FÉRIAS — Mapa anual por colaborador
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt } from '../utils/helpers.js';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let _ano = new Date().getFullYear();
let _feriasUtilizadas = new Set(); // 'colab_numero|YYYY-MM-DD' — vêm das folhas de ponto
let _feriasPrevistas  = new Set(); // 'colab_numero|YYYY-MM-DD' — planeadas, editáveis

// ── Navegação de ano ──────────────────
export function feriasNavAno(delta) {
  _ano += delta;
  renderMapaFerias();
}

// ── Toggle férias previstas (click na célula) ─────────────────
export async function feriasTogglePrevista(colabN, dateStr) {
  const key = `${colabN}|${dateStr}`;
  // Não permitir editar dias já utilizados
  if (_feriasUtilizadas.has(key)) return;

  try {
    if (_feriasPrevistas.has(key)) {
      // Remover
      await sb.from('ferias_previstas')
        .delete()
        .eq('colab_numero', colabN)
        .eq('data', dateStr);
      _feriasPrevistas.delete(key);
    } else {
      // Adicionar
      await sb.from('ferias_previstas')
        .upsert({ colab_numero: colabN, data: dateStr }, { onConflict: 'colab_numero,data' });
      _feriasPrevistas.add(key);
    }
    // Re-render apenas a linha deste colaborador para ser rápido
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

      if (isUtil) {
        cell.style.background = '#10B981';
        cell.title = `Férias utilizadas — ${d} ${MESES_FULL[m]}`;
        cell.style.cursor = 'default';
      } else if (isPrev) {
        cell.style.background = '#F59E0B';
        cell.title = `Férias previstas — ${d} ${MESES_FULL[m]} (clique para remover)`;
        cell.style.cursor = 'pointer';
      } else if (isWknd) {
        cell.style.background = 'var(--gray-100)';
        cell.title = '';
        cell.style.cursor = 'default';
      } else {
        cell.style.background = '';
        cell.title = `Clique para marcar férias previstas — ${d} ${MESES_FULL[m]}`;
        cell.style.cursor = 'pointer';
      }
    }
  }

  // Atualizar badge total
  const badgeEl = document.getElementById(`fb-${colabN}`);
  if (badgeEl) {
    badgeEl.innerHTML = _buildBadges(totalUtil, totalPrev);
  }
}

function _buildBadges(totalUtil, totalPrev) {
  let html = '';
  if (totalUtil > 0) {
    html += `<span style="display:inline-block;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;background:#D1FAE5;color:#065F46;margin-bottom:2px">${totalUtil}d ✓</span>`;
  }
  if (totalPrev > 0) {
    html += `<span style="display:inline-block;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;background:#FEF3C7;color:#92400E">${totalPrev}d prev.</span>`;
  }
  if (totalUtil === 0 && totalPrev === 0) {
    html += `<span style="display:inline-block;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;background:var(--gray-100);color:var(--gray-400)">0d</span>`;
  }
  return html;
}

// ── Render principal ──────────────────
export async function renderMapaFerias() {
  const cont = document.getElementById('ferias-cont');
  if (!cont) return;

  // Atualizar label do ano
  const lbl = document.getElementById('ferias-ano-label');
  if (lbl) lbl.textContent = _ano;

  cont.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">A carregar...</div>';

  const dIni = `${_ano}-01-01`;
  const dFim = `${_ano}-12-31`;

  try {
    // Carregar férias utilizadas (folhas de ponto)
    const { data: dataUtil, error: errUtil } = await sb
      .from('registos_ponto')
      .select('colab_numero, data')
      .eq('tipo', 'Férias')
      .gte('data', dIni)
      .lte('data', dFim);
    if (errUtil) throw errUtil;
    _feriasUtilizadas = new Set((dataUtil || []).map(r => `${r.colab_numero}|${r.data}`));

    // Carregar férias previstas
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

  const colabs = S.COLABORADORES.filter(c => c.ativo).sort((a, b) => a.n - b.n);

  if (!colabs.length) {
    cont.innerHTML = '<div class="card" style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">Sem colaboradores ativos.</div>';
    return;
  }

  // Construir tabela
  cont.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'overflow-x:auto;border-radius:12px;border:1px solid var(--gray-200)';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;min-width:900px;font-size:12px';

  // Cabeçalho de meses
  let thead = '<thead>';
  thead += '<tr style="background:var(--gray-50)">';
  thead += '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:var(--gray-500);white-space:nowrap;border-bottom:2px solid var(--gray-200);min-width:140px;position:sticky;left:0;background:var(--gray-50);z-index:2">Colaborador</th>';

  for (let m = 0; m < 12; m++) {
    const diasNoMes = new Date(_ano, m + 1, 0).getDate();
    thead += `<th colspan="${diasNoMes}" style="padding:8px 4px;text-align:center;font-size:11px;font-weight:600;color:var(--gray-500);border-bottom:1px solid var(--gray-200);border-left:2px solid var(--gray-200)">${MESES[m]}</th>`;
  }
  thead += '<th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:600;color:var(--gray-500);border-bottom:2px solid var(--gray-200);border-left:2px solid var(--gray-300);white-space:nowrap">Total</th>';
  thead += '</tr>';

  // Sub-cabeçalho de dias
  thead += '<tr style="background:var(--gray-50)">';
  thead += '<th style="border-bottom:1px solid var(--gray-200);position:sticky;left:0;background:var(--gray-50);z-index:2"></th>';

  for (let m = 0; m < 12; m++) {
    const diasNoMes = new Date(_ano, m + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const dateObj = new Date(_ano, m, d);
      const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const bg = isWknd ? 'background:var(--gray-100)' : '';
      const borderL = d === 1 ? 'border-left:2px solid var(--gray-200)' : 'border-left:1px solid var(--gray-100)';
      thead += `<th style="padding:3px 0;text-align:center;font-size:9px;font-weight:500;color:var(--gray-400);border-bottom:1px solid var(--gray-200);width:18px;min-width:18px;${bg};${borderL}">${d}</th>`;
    }
  }
  thead += '<th style="border-bottom:1px solid var(--gray-200);border-left:2px solid var(--gray-300)"></th>';
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
          titleAttr = ` title="Férias previstas — ${d} ${MESES_FULL[m]} (clique para remover)"`;
          cursorStyle = 'cursor:pointer;';
          onclickAttr = ` onclick="feriasTogglePrevista(${colab.n},'${dateStr}')"`;
        } else if (isWknd) {
          bg = 'background:var(--gray-100);';
          cursorStyle = 'cursor:default;';
        } else {
          titleAttr = ` title="Clique para marcar férias previstas — ${d} ${MESES_FULL[m]}"`;
          cursorStyle = 'cursor:pointer;';
          onclickAttr = ` onclick="feriasTogglePrevista(${colab.n},'${dateStr}')"`;
        }

        cells += `<td id="fc-${colab.n}-${dateStr}" style="padding:0;height:28px;${bg}${cursorStyle}${borderL}"${titleAttr}${onclickAttr}></td>`;
      }
    }

    // Badges totais
    const totalBadge = `<div id="fb-${colab.n}" style="display:flex;flex-direction:column;align-items:center;gap:2px">${_buildBadges(totalUtil, totalPrev)}</div>`;

    tbody += `<tr style="border-bottom:1px solid var(--gray-100)">`;
    tbody += `<td style="padding:6px 14px;white-space:nowrap;font-weight:500;font-size:12px;color:var(--gray-700);position:sticky;left:0;background:white;z-index:1;border-right:1px solid var(--gray-200)">
      <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gray-400);margin-right:6px">${colab.n}</span>${colab.nome}
    </td>`;
    tbody += cells;
    tbody += `<td style="padding:4px 8px;text-align:center;border-left:2px solid var(--gray-300);background:var(--gray-50);min-width:70px">${totalBadge}</td>`;
    tbody += `</tr>`;
  }
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
  wrapper.appendChild(table);
  cont.appendChild(wrapper);

  // Legenda
  const leg = document.createElement('div');
  leg.style.cssText = 'display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap';
  leg.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#10B981"></span> Férias utilizadas
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#F59E0B"></span> Férias previstas
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:var(--gray-100);border:1px solid var(--gray-200)"></span> Fim de semana
    </div>
    <div style="font-size:11px;color:var(--gray-400);margin-left:8px">Clique num dia em branco para marcar férias previstas · Clique numa férias prevista para remover</div>
  `;
  cont.appendChild(leg);
}

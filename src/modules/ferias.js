// ═══════════════════════════════════════
//  FÉRIAS — Mapa anual por colaborador
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt } from '../utils/helpers.js';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let _ano = new Date().getFullYear();
let _feriasDias = new Set(); // 'colab_numero|YYYY-MM-DD'

// ── Navegação de ano ──────────────────
export function feriasNavAno(delta) {
  _ano += delta;
  renderMapaFerias();
}

// ── Render principal ──────────────────
export async function renderMapaFerias() {
  const cont = document.getElementById('ferias-cont');
  if (!cont) return;

  // Atualizar label do ano
  const lbl = document.getElementById('ferias-ano-label');
  if (lbl) lbl.textContent = _ano;

  cont.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">A carregar...</div>';

  // Carregar registos de férias do ano
  const dIni = `${_ano}-01-01`;
  const dFim = `${_ano}-12-31`;

  try {
    const { data, error } = await sb
      .from('registos_ponto')
      .select('colab_numero, data')
      .eq('tipo', 'Férias')
      .gte('data', dIni)
      .lte('data', dFim);

    if (error) throw error;

    _feriasDias = new Set((data || []).map(r => `${r.colab_numero}|${r.data}`));
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
    let totalFer = 0;
    let cells = '';

    for (let m = 0; m < 12; m++) {
      const diasNoMes = new Date(_ano, m + 1, 0).getDate();
      for (let d = 1; d <= diasNoMes; d++) {
        const dateObj = new Date(_ano, m, d);
        const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const dateStr = fmt(new Date(_ano, m, d, 12));
        const isFer = _feriasDias.has(`${colab.n}|${dateStr}`);

        if (isFer && !isWknd) totalFer++;

        const borderL = d === 1 ? 'border-left:2px solid var(--gray-200)' : 'border-left:1px solid var(--gray-100)';
        const bg = isFer
          ? 'background:#10B981;'
          : isWknd
            ? 'background:var(--gray-100);'
            : '';
        const title = isFer ? ` title="Férias — ${d} ${MESES_FULL[m]}"` : '';

        cells += `<td style="padding:0;height:28px;${bg};${borderL}"${title}></td>`;
      }
    }

    // Badge total
    const badgeColor = totalFer > 0 ? 'background:#D1FAE5;color:#065F46' : 'background:var(--gray-100);color:var(--gray-400)';
    const totalBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;${badgeColor}">${totalFer}d</span>`;

    tbody += `<tr style="border-bottom:1px solid var(--gray-100)">`;
    tbody += `<td style="padding:6px 14px;white-space:nowrap;font-weight:500;font-size:12px;color:var(--gray-700);position:sticky;left:0;background:white;z-index:1;border-right:1px solid var(--gray-200)">
      <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gray-400);margin-right:6px">${colab.n}</span>${colab.nome}
    </td>`;
    tbody += cells;
    tbody += `<td style="padding:4px 8px;text-align:center;border-left:2px solid var(--gray-300);background:var(--gray-50)">${totalBadge}</td>`;
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
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:#10B981"></span> Férias
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500)">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:var(--gray-100);border:1px solid var(--gray-200)"></span> Fim de semana
    </div>
  `;
  cont.appendChild(leg);
}

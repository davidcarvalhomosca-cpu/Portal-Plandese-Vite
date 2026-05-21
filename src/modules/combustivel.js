// ═══════════════════════════════════════
//  COMBUSTÍVEL — Vista admin
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast } from './navigation.js';

let _combView = 'tabela';

// ════════════════════════════════════════════════
//  COMBUSTÍVEL — ADMIN
// ════════════════════════════════════════════════
// ── Combustível — vista activa ('tabela' | 'obras') ──

async function loadCombustivelAdmin(){
  const ini=document.getElementById('comb-f-ini').value;
  const fim=document.getElementById('comb-f-fim').value;
  const equip=document.getElementById('comb-f-equip').value;
  const obraFilt=document.getElementById('comb-f-obra')?.value||'';
  const tbody=document.getElementById('comb-tbody');
  const empty=document.getElementById('comb-empty');
  tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--gray-400)">A carregar…</td></tr>';
  empty.style.display='none';
  try{
    // ── 1. Carregar TODOS os registos (sem filtro de data) para KPIs globais ──
    const {data:allRows,error:e1}=await sb.from('registos_combustivel').select('*').order('data',{ascending:false}).order('criado_em',{ascending:false});
    if(e1) throw e1;

    if(!allRows||!allRows.length){
      tbody.innerHTML='';
      empty.style.display='';
      document.getElementById('comb-kpis').style.display='none';
      document.getElementById('comb-toggle-bar').style.display='none';
      return;
    }

    // ── 2. Datas de referência para períodos ──
    const hoje=fmt(new Date());
    const now=new Date();
    const dow=now.getDay()||7; // 1=Seg … 7=Dom
    const segFair=new Date(now); segFair.setDate(now.getDate()-dow+1);
    const startSem=fmt(segFair);
    const startMes=hoje.slice(0,7)+'-01';
    const startAno=hoje.slice(0,4)+'-01-01';

    // ── 3. Helpers de classificação ──
    // Entrada no depósito: tipo_registo='deposito' com movimento='entrada' (ou sem movimento)
    const isEntDep=r=>r.tipo_registo==='deposito'&&(r.movimento==='entrada'||!r.movimento);
    // Saída: saída de depósito OU abastecimento directo de viatura
    const isSaida=r=>(r.tipo_registo==='deposito'&&r.movimento==='saida')||r.tipo_registo==='viatura';

    const sumL=(arr,filterFn,de,ate)=>
      arr.filter(r=>filterFn(r)&&r.data&&r.data>=de&&r.data<=ate)
         .reduce((s,r)=>s+(parseFloat(r.litros)||0),0);

    // ── 4. KPIs de período (sobre TODOS os registos — independente do filtro) ──
    const fL=v=>v.toFixed(1)+'L';
    const setTxt=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};

    setTxt('comb-k-ent-dia', fL(sumL(allRows,isEntDep,hoje,hoje)));
    setTxt('comb-k-ent-sem', fL(sumL(allRows,isEntDep,startSem,hoje)));
    setTxt('comb-k-ent-mes', fL(sumL(allRows,isEntDep,startMes,hoje)));
    setTxt('comb-k-ent-ano', fL(sumL(allRows,isEntDep,startAno,hoje)));
    setTxt('comb-k-sai-dia', fL(sumL(allRows,isSaida,hoje,hoje)));
    setTxt('comb-k-sai-sem', fL(sumL(allRows,isSaida,startSem,hoje)));
    setTxt('comb-k-sai-mes', fL(sumL(allRows,isSaida,startMes,hoje)));
    setTxt('comb-k-sai-ano', fL(sumL(allRows,isSaida,startAno,hoje)));

    // ── 5. Stock real acumulado (todos os registos de depósito) ──
    const stockReal=allRows.filter(r=>r.tipo_registo==='deposito').reduce((s,r)=>{
      const l=parseFloat(r.litros)||0;
      return s+(r.movimento==='saida'?-l:l);
    },0);
    const stockEl=document.getElementById('comb-k-stock');
    if(stockEl){
      stockEl.textContent=(stockReal>=0?'+':'')+stockReal.toFixed(1)+'L';
      stockEl.style.color=stockReal>=0?'var(--blue-700)':'#b91c1c';
      stockEl.closest('.card').style.background=stockReal>=0?'var(--blue-50)':'#fef2f2';
      stockEl.closest('.card').style.borderColor=stockReal>=0?'var(--blue-200)':'#fecaca';
    }

    document.getElementById('comb-kpis').style.display='';
    document.getElementById('comb-toggle-bar').style.display='flex';

    // ── 6. Filtrar registos para tabela / cartões de obra ──
    let filtered=allRows;
    if(ini) filtered=filtered.filter(r=>r.data&&r.data>=ini);
    if(fim) filtered=filtered.filter(r=>r.data&&r.data<=fim);
    if(equip) filtered=filtered.filter(r=>r.equipamento_id===equip);
    if(obraFilt) filtered=filtered.filter(r=>r.obra_id===obraFilt);

    if(!filtered.length){
      tbody.innerHTML='';
      empty.style.display='';
      document.getElementById('comb-obras-grid').innerHTML='';
      document.getElementById('comb-obras-empty').style.display='';
      return;
    }
    empty.style.display='none';
    document.getElementById('comb-obras-empty').style.display='none';

    // ── 7. Render tabela ──
    tbody.innerHTML=filtered.map(r=>{
      const obraNome=S.OBRAS.find(o=>o.id===r.obra_id)?.nome||r.obra_id||'—';
      const isEnt=r.movimento==='entrada'||(!r.movimento&&r.tipo_registo!=='viatura');
      const litrosVal=parseFloat(r.litros)||0;
      const litrosFormatado=r.litros!=null
        ?(isEnt
          ?`<span style="font-weight:700;color:#16a34a">+${litrosVal.toFixed(1)}L</span>`
          :`<span style="font-weight:700;color:#dc2626">−${litrosVal.toFixed(1)}L</span>`)
        :'—';
      const movBadge=r.tipo_registo==='deposito'
        ?(isEnt
          ?`<span class="badge b-green" style="font-size:11px">↓ Entrada</span>`
          :`<span class="badge b-red" style="font-size:11px">↑ Saída</span>`)
        :`<span class="badge b-gray" style="font-size:11px">Viatura</span>`;
      return `<tr>
        <td>${fmtPT(r.data)}</td>
        <td style="font-weight:600">${r.equipamento_nome||'—'}</td>
        <td>${obraNome}</td>
        <td>${movBadge}</td>
        <td>${litrosFormatado}</td>
        <td><span class="badge ${r.tipo_combustivel==='Gasóleo'?'b-blue':r.tipo_combustivel==='Gasolina'?'b-orange':'b-gray'}">${r.tipo_combustivel||'—'}</span></td>
        <td>${r.fornecedor||'—'}</td>
        <td>${r.encarregado_nome||'—'}</td>
        <td style="color:var(--gray-500);font-size:12px">${r.obs||'—'}</td>
      </tr>`;
    }).join('');

    // ── 8. Render cartões por obra ──
    renderCombObraCards(filtered);

  }catch(e){
    tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:24px;color:#b91c1c">Erro: ${e.message}</td></tr>`;
  }
}

// ── Toggle tabela / por obra ──────────────────────
function toggleCombView(view){
  _combView=view;
  const tbl=document.getElementById('comb-view-tabela');
  const obras=document.getElementById('comb-view-obras');
  const btnT=document.getElementById('comb-btn-tabela');
  const btnO=document.getElementById('comb-btn-obras');
  if(view==='tabela'){
    tbl.style.display='';
    obras.style.display='none';
    btnT.style.cssText+=';background:var(--white);color:var(--gray-800);box-shadow:0 1px 3px rgba(0,0,0,.1)';
    btnO.style.cssText+=';background:transparent;color:var(--gray-500);box-shadow:none';
  }else{
    tbl.style.display='none';
    obras.style.display='';
    btnO.style.cssText+=';background:var(--white);color:var(--gray-800);box-shadow:0 1px 3px rgba(0,0,0,.1)';
    btnT.style.cssText+=';background:transparent;color:var(--gray-500);box-shadow:none';
  }
}

// ── Cartões de obra ───────────────────────────────
function renderCombObraCards(rows){
  const grid=document.getElementById('comb-obras-grid');
  const emptyEl=document.getElementById('comb-obras-empty');
  if(!grid) return;
  // Agrupar por obra
  const map={};
  rows.forEach(r=>{
    const id=r.obra_id||'__sem_obra__';
    const nome=S.OBRAS.find(o=>o.id===r.obra_id)?.nome||(r.obra_id?r.obra_id:'Sem obra');
    if(!map[id]) map[id]={nome,rows:[]};
    map[id].rows.push(r);
  });
  const obras=Object.values(map);
  if(!obras.length){grid.innerHTML='';emptyEl.style.display='';return;}
  emptyEl.style.display='none';

  grid.innerHTML=obras.map(ob=>{
    const ent=ob.rows.filter(r=>r.tipo_registo==='deposito'&&(r.movimento==='entrada'||!r.movimento)).reduce((s,r)=>s+(parseFloat(r.litros)||0),0);
    const sai=ob.rows.filter(r=>(r.tipo_registo==='deposito'&&r.movimento==='saida')||r.tipo_registo==='viatura').reduce((s,r)=>s+(parseFloat(r.litros)||0),0);
    const stock=ob.rows.filter(r=>r.tipo_registo==='deposito').reduce((s,r)=>{const l=parseFloat(r.litros)||0;return s+(r.movimento==='saida'?-l:l);},0);
    const nReg=ob.rows.length;
    const tipos=[...new Set(ob.rows.map(r=>r.tipo_combustivel).filter(Boolean))].join(', ')||'—';
    const stockColor=stock>=0?'var(--blue-700)':'#b91c1c';
    const stockBg=stock>=0?'var(--blue-50)':'#fef2f2';
    const stockBorder=stock>=0?'var(--blue-200)':'#fecaca';
    return `<div class="card" style="padding:18px 20px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px">
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ob.nome}</div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:3px">${nReg} registo${nReg!==1?'s':''} · ${tipos}</div>
        </div>
        <div style="background:${stockBg};border:1.5px solid ${stockBorder};border-radius:10px;padding:8px 14px;text-align:center;flex-shrink:0">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${stockColor};margin-bottom:3px">Stock</div>
          <div style="font-size:18px;font-weight:700;color:${stockColor};line-height:1;font-variant-numeric:tabular-nums">${(stock>=0?'+':'')+stock.toFixed(1)}L</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;text-align:center">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#86efac;margin-bottom:5px">↓ Entradas</div>
          <div style="font-size:22px;font-weight:700;color:#16a34a;font-variant-numeric:tabular-nums">${ent.toFixed(1)}L</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;text-align:center">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#fca5a5;margin-bottom:5px">↑ Saídas</div>
          <div style="font-size:22px;font-weight:700;color:#dc2626;font-variant-numeric:tabular-nums">${sai.toFixed(1)}L</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function exportCombustivelXLSX(){
  const rows=[];
  document.querySelectorAll('#comb-tbody tr').forEach(tr=>{
    const cells=[...tr.querySelectorAll('td')].map(td=>td.innerText);
    if(cells.length) rows.push(cells);
  });
  if(!rows.length){showToast('Sem dados para exportar');return;}
  const ws=XLSX.utils.aoa_to_sheet([['Data','Viatura/Máquina','Obra','Movimento','Litros','Tipo','Fornecedor','Encarregado','Obs'],...rows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Combustível');
  XLSX.writeFile(wb,`combustivel_${fmt(new Date())}.xlsx`);
}

function _initCombustivelAdmin(){
  // Preencher datas padrão: mês corrente
  const hoje=fmt(new Date());
  const ini=hoje.slice(0,7)+'-01';
  document.getElementById('comb-f-ini').value=ini;
  document.getElementById('comb-f-fim').value=hoje;
  // Preencher select de equipamentos
  const sel=document.getElementById('comb-f-equip');
  sel.innerHTML='<option value="">Todos</option>';
  EQUIPAMENTOS.forEach(eq=>{const op=document.createElement('option');op.value=eq.id;op.textContent=eq.nome;sel.appendChild(op);});
  // Preencher select de obras
  const selObra=document.getElementById('comb-f-obra');
  if(selObra){
    selObra.innerHTML='<option value="">Todas as obras</option>';
    S.OBRAS.forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;selObra.appendChild(op);});
  }
  // Garantir vista tabela ao iniciar
  _combView='tabela';
  toggleCombView('tabela');
  loadCombustivelAdmin();
}

export { loadCombustivelAdmin, toggleCombView, renderCombObraCards, exportCombustivelXLSX, _initCombustivelAdmin };

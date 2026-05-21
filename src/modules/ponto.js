// ═══════════════════════════════════════
//  PONTO — Histórico semanal e exportação
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT, isWeekend, getMonday, dayShort, calcH, fmtH } from '../utils/helpers.js';
import { MESES_PT, DIAS_PT_EXP } from '../config.js';
import { showToast } from './navigation.js';

// ═══════════════════════════════════════
//  ADMIN — HISTÓRICO SEMANAL
// ═══════════════════════════════════════
let histSemanaRef = new Date(); // data de referência da semana atual no hist

export async function applyFilter(){
  const ds = document.getElementById('f-semana').value;
  if(!ds){ showToast('Selecione uma data da semana pretendida'); return; }
  histSemanaRef = new Date(ds+'T12:00:00');
  await renderHistSemana();
}

export function navSemana(delta){
  histSemanaRef = new Date(histSemanaRef);
  histSemanaRef.setDate(histSemanaRef.getDate() + delta*7);
  document.getElementById('f-semana').value = fmt(histSemanaRef);
  renderHistSemana();
}

export async function renderHistSemana(){
  const mon = getMonday(histSemanaRef);
  const days = [];
  for(let i=0;i<6;i++){ const d=new Date(mon); d.setDate(d.getDate()+i); days.push(d); }
  const dStrs = days.map(fmt);
  const semLabel = `${fmtPT(dStrs[0])} a ${fmtPT(dStrs[5])}`;
  const dayNames = ['2ª Feira','3ª Feira','4ª Feira','5ª Feira','6ª Feira','Sábado'];

  const nav = document.getElementById('hist-week-nav');
  if(!nav) return;
  nav.style.display='flex';
  document.getElementById('hist-week-title').textContent = `Semana ${semLabel}`;

  const cn = parseInt(document.getElementById('f-col').value)||0;
  const oo = document.getElementById('f-obra').value;

  const cont = document.getElementById('hist-resultado');
  cont.innerHTML='<div style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">A carregar...</div>';

  let regs;
  try {
    let query = sb.from('registos_ponto').select('*').in('data', dStrs);
    if(cn) query=query.eq('colab_numero',cn);
    if(oo) query=query.eq('obra_id',oo);
    const {data, error} = await query;
    if(error) throw error;
    regs = data;
  } catch(e) {
    cont.innerHTML=`<div class="card" style="text-align:center;color:var(--red);padding:32px;font-size:13px">⚠️ Erro ao carregar dados: ${e.message||'Verifique a ligação ao Supabase.'}</div>`;
    document.getElementById('export-btns-plandese').style.display='none';
    return;
  }

  if(!regs||!regs.length){
    cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px;font-size:13px">Sem registos para esta semana.</div>';
    document.getElementById('export-btns-plandese').style.display='none';
    return;
  }

  // Agrupar por obra → colaborador → dia
  const obraMap={};
  regs.forEach(r=>{
    const oId=r.obra_id||'_sem';
    if(!obraMap[oId]) obraMap[oId]={};
    if(!obraMap[oId][r.colab_numero]) obraMap[oId][r.colab_numero]=Array(6).fill(null);
    const di=dStrs.indexOf(r.data);
    if(di>=0) obraMap[oId][r.colab_numero][di]=r;
  });

  cont.innerHTML='';
  let grandN=0,grandE=0,grandT=0;

  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=S.OBRAS.find(o=>o.id===obraId)?.nome||'(sem obra)';
    const obraData=obraMap[obraId];

    const obraHdr=document.createElement('div');
    obraHdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin:18px 0 6px;flex-wrap:wrap;gap:8px';
    obraHdr.innerHTML=`<div style="display:flex;align-items:center;gap:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:var(--blue-500)"></div>
      <span style="font-size:14px;font-weight:600;color:var(--gray-800)">Obra: ${obraNome}</span>
    </div>`;
    cont.appendChild(obraHdr);

    const wrap=document.createElement('div');
    wrap.className='card';
    wrap.style.cssText='padding:0;overflow:hidden;margin-bottom:4px';
    const tblWrap=document.createElement('div');
    tblWrap.className='tbl-wrap';
    const tbl=document.createElement('table');

    let thead='<thead>';
    thead+=`<tr style="background:var(--blue-800)">
      <th style="color:white;background:var(--blue-800);min-width:36px">Nº</th>
      <th style="color:white;background:var(--blue-800);min-width:160px">Nome</th>
      <th style="color:white;background:var(--blue-800);min-width:90px">Função</th>`;
    days.forEach((d,i)=>{
      const we=isWeekend(d);
      const bg=we?'#C2410C':'var(--blue-600)';
      thead+=`<th colspan="3" style="color:white;background:${bg};text-align:center;border-left:2px solid rgba(255,255,255,.2)">
        <div style="font-size:12px;font-weight:700">${dayNames[i]}</div>
        <div style="font-size:10px;font-weight:400;opacity:.8">${fmtPT(dStrs[i])}</div>
      </th>`;
    });
    thead+=`<th style="color:white;background:#1e3a2f;text-align:center;border-left:2px solid rgba(255,255,255,.2)">H.Nor.</th>
      <th style="color:white;background:#1e3a2f;text-align:center">H.Ext.</th>
      <th style="color:white;background:#1e3a2f;text-align:center">Total</th></tr>`;
    thead+=`<tr style="background:var(--gray-50)">
      <th colspan="3" style="background:var(--gray-50)"></th>`;
    days.forEach(()=>{
      thead+=`<th style="font-size:10px;color:var(--gray-500);text-align:center;border-left:1px solid var(--gray-200)">H.Nor.</th>
        <th style="font-size:10px;color:var(--gray-500);text-align:center">H.Ext.</th>
        <th style="font-size:10px;color:var(--gray-500);text-align:center;border-right:1px solid var(--gray-200)">Total</th>`;
    });
    thead+=`<th></th><th></th><th></th></tr></thead>`;
    tbl.innerHTML=thead;

    let tbody='<tbody>';
    let totN=0,totE=0,totT=0;
    let rowNum=1;

    Object.keys(obraData).sort((a,b)=>{
      const ca=S.COLABORADORES.find(x=>x.n===parseInt(a));
      const cb=S.COLABORADORES.find(x=>x.n===parseInt(b));
      return (ca?.nome||'').localeCompare(cb?.nome||'');
    }).forEach(nStr=>{
      const n=parseInt(nStr);
      const c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      let dayCells='';
      obraData[n].forEach((r,i)=>{
        if(!r){dayCells+=`<td style="text-align:center;color:var(--gray-200);border-left:1px solid var(--gray-100);font-size:11px">—</td><td style="text-align:center;color:var(--gray-200);font-size:11px">—</td><td style="text-align:center;color:var(--gray-200);border-right:1px solid var(--gray-100);font-size:11px">—</td>`;return;}
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);
        rN+=h.n;rE+=h.e;rT+=h.t;
        const isFalta=r.tipo?.includes('Falta');
        const isFolga=r.tipo==='Folga';
        if(isFalta){
          dayCells+=`<td colspan="3" style="text-align:center;border-left:1px solid var(--gray-100);border-right:1px solid var(--gray-100)"><span class="badge b-red" style="font-size:10px">${r.tipo}</span></td>`;
        } else if(isFolga){
          dayCells+=`<td colspan="3" style="text-align:center;border-left:1px solid var(--gray-100);border-right:1px solid var(--gray-100)"><span class="badge b-yellow" style="font-size:10px">Folga</span></td>`;
        } else {
          dayCells+=`<td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;color:var(--green);border-left:1px solid var(--gray-100)">${h.n>0?fmtH(h.n):'—'}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;color:var(--orange)">${h.e>0?fmtH(h.e):'—'}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;font-weight:600;border-right:1px solid var(--gray-100)">${h.t>0?fmtH(h.t):'—'}</td>`;
        }
      });
      totN+=rN;totE+=rE;totT+=rT;
      grandN+=rN;grandE+=rE;grandT+=rT;
      tbody+=`<tr style="${rowNum%2===0?'background:var(--gray-50)':''}">
        <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-400);font-weight:700;text-align:center">${n}</td>
        <td style="font-weight:500;font-size:13px;white-space:nowrap">${c.nome}</td>
        <td style="font-size:11px;color:var(--gray-500)">${c.func}</td>
        ${dayCells}
        <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:700;text-align:center;border-left:2px solid var(--gray-200)">${fmtH(rN)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:700;text-align:center">${fmtH(rE)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;text-align:center;color:var(--blue-600)">${fmtH(rT)}</td>
      </tr>`;
      rowNum++;
    });

    let totCells='';
    for(let i=0;i<6;i++) totCells+=`<td colspan="3" style="border-left:1px solid var(--gray-200)"></td>`;
    tbody+=`<tr style="background:var(--gray-100);border-top:2px solid var(--gray-300)">
      <td colspan="3" style="font-weight:700;font-size:12px;padding:9px 12px;color:var(--gray-700)">TOTAL DA OBRA</td>
      ${totCells}
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:700;text-align:center;border-left:2px solid var(--gray-300)">${fmtH(totN)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:700;text-align:center">${fmtH(totE)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;text-align:center;color:var(--blue-600)">${fmtH(totT)}</td>
    </tr></tbody>`;

    tbl.innerHTML+=tbody;
    tblWrap.appendChild(tbl);
    wrap.appendChild(tblWrap);
    cont.appendChild(wrap);
  });

  window._histExportData={obraMap,days,dStrs,dayNames,semLabel,grandN,grandE,grandT};
  document.getElementById('export-btns-plandese').style.display='flex';
  const curM=new Date().getMonth()+1;
  document.getElementById('mes-mensal-sel').value=String(curM);
}

// ── ExcelJS helpers ─────────────────────────────────────────────────────────
export function exFill(hex8){ return {type:'pattern',pattern:'solid',fgColor:{argb:hex8}}; }
export function exFont(bold,size,argb,name='Roboto'){ const f={bold,size,name:'Roboto'}; if(argb)f.color={argb}; return f; }
export function exAlign(h='center',v='middle',wrap=false){ return {horizontal:h,vertical:v,wrapText:wrap}; }
export function exBorder(top,bot,left,right){
  const s=st=>st?{style:st}:undefined;
  const b={};
  if(top)b.top=s(top); if(bot)b.bottom=s(bot);
  if(left)b.left=s(left); if(right)b.right=s(right);
  return b;
}
export function setCells(ws, row, col, count, opts){
  for(let i=0;i<count;i++){
    const cell=ws.getCell(row, col+i);
    if(opts.border) cell.border=opts.border;
    if(opts.font) cell.font=opts.font;
    if(opts.alignment) cell.alignment=opts.alignment;
    if(opts.fill) cell.fill=opts.fill;
  }
}
export function applyToMerge(ws, r, c1, c2, opts){
  for(let ci=c1;ci<=c2;ci++){
    const cell=ws.getCell(r,ci);
    if(opts.border) cell.border=opts.border;
    if(opts.font) cell.font=opts.font;
    if(opts.alignment) cell.alignment=opts.alignment;
    if(opts.fill) cell.fill=opts.fill;
  }
}

export async function exportMensal(){
  const mesVal=parseInt(document.getElementById('mes-mensal-sel').value);
  const ano=2026;
  const mesNome=MESES_PT[mesVal-1];
  const dataIni=new Date(ano, mesVal===1?-1:mesVal-2, 22);
  const dataFim=new Date(ano, mesVal-1, 21);
  const datas=[];
  for(let d=new Date(dataIni);d<=dataFim;d.setDate(d.getDate()+1)) datas.push(new Date(d));
  const dStrs=datas.map(d=>fmt(d));

  showToast('A carregar dados do servidor...');
  const {data:regs}=await sb.from('registos_ponto').select('*').gte('data',dStrs[0]).lte('data',dStrs[dStrs.length-1]);
  const regMap={};
  (regs||[]).forEach(r=>{ if(!regMap[r.data])regMap[r.data]={}; regMap[r.data][r.colab_numero]=r; });

  showToast('A formatar ficheiro Excel...');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Plandese SA';

  const colabsAtivos=[...S.COLABORADORES].filter(c=>c.ativo).sort((a,b)=>a.n-b.n);
  const summaryData=[];
  const wsFecho=workbook.addWorksheet('Folha de Fecho');

  const CC_C='FF0000FF', H_C='FF00B050', TOT_C='FF002060', NORM_C='FFFF00FF', EXTRA_C='FF993300';
  const F_FER='FF00FF00', F_FAL='FFC00000', F_DES='FF00B0F0';
  const F_TR='FFFFFF00', F_FE='FF00FF00', F_FA='FFC00000', F_DE='FF00B0F0';

  for(const colab of colabsAtivos){
    const {n,nome,func}=colab;
    const parts=nome.split(' ');
    const inis=parts.slice(0,2).map(p=>p[0]).join('');
    const shName=`${n}_${inis}`.slice(0,31);
    const ws=workbook.addWorksheet(shName);

    ws.columns=[
      {width:1.5},{width:1.5},{width:8.43},{width:12.0},{width:5.0},{width:8.14},
      {width:4.29},{width:6.71},{width:4.71},{width:7.71},{width:4.71},{width:6.71},
      {width:7.86},{width:8.29},{width:8.43},{width:7.0},{width:13.0},{width:13.0},
      {width:1.14},{width:3.57},{width:8.0}
    ];

    ws.getRow(1).height=20.25; ws.getRow(2).height=3.75; ws.getRow(3).height=20.25;
    ws.getRow(4).height=18.0;  ws.getRow(5).height=15.0; ws.getRow(6).height=15.0;
    ws.getRow(7).height=15.75; ws.getRow(8).height=12.75;

    ws.mergeCells('C1:R1');
    const c1=ws.getCell('C1');
    c1.value='CONTROLE DE PONTO';
    c1.font=exFont(true,16,null,'Roboto');
    c1.alignment=exAlign();
    const bTitle=exBorder('thin','thin','thin','thin');
    c1.border=bTitle;
    for(let ci=4;ci<=18;ci++) ws.getCell(1,ci).border=exBorder('thin','thin');

    ws.mergeCells('C3:D3');
    let cell=ws.getCell('C3'); cell.value='Funcionário'; cell.font=exFont(false,11); cell.alignment=exAlign();

    ws.mergeCells('E3:L3');
    cell=ws.getCell('E3'); cell.value=`${n} - ${nome}`;
    cell.font=exFont(true,16); cell.alignment=exAlign(); cell.border=bTitle;
    for(let ci=6;ci<=12;ci++) ws.getCell(3,ci).border=exBorder('thin','thin');

    cell=ws.getCell('M3'); cell.value='Mês'; cell.font=exFont(false,11); cell.alignment=exAlign();
    ws.mergeCells('N3:P3');
    cell=ws.getCell('N3'); cell.value=mesNome; cell.font=exFont(true,14); cell.alignment=exAlign();
    ws.mergeCells('Q3:R3');
    cell=ws.getCell('Q3'); cell.value=ano; cell.font=exFont(true,14); cell.alignment=exAlign('center','top');
    cell.border=exBorder(null,null,'thick');

    ws.mergeCells('E4:L4');
    cell=ws.getCell('E4'); cell.value=func; cell.font=exFont(false,10); cell.alignment=exAlign();

    ws.mergeCells('C5:C6');
    cell=ws.getCell('C5'); cell.value='Mês\ninicial'; cell.font=exFont(false,10); cell.alignment=exAlign('center','middle',true);
    ws.mergeCells('D5:D6');
    cell=ws.getCell('D5'); cell.value=mesNome; cell.font=exFont(true,10); cell.alignment=exAlign();
    cell.border=exBorder('hair');

    const hdrBCD=exBorder('thin','dotted','thin','dotted');
    const hdrBCC=exBorder('thin','dotted','thin','thin');
    const hdrBFP=exBorder('thin','thin');
    const hdrBFPR=exBorder('thin','thin',null,'thin');
    const hdrs=[
      [3,'Data',hdrBCD,null],[4,'Dia',hdrBCD,null],
      [5,'CC1',hdrBCC,null],[6,'h',hdrBCC,null],[7,'CC2',hdrBCC,null],[8,'h',hdrBCC,null],
      [9,'CC3',hdrBCC,null],[10,'h',hdrBCC,null],[11,'CC4',hdrBCC,null],[12,'h',hdrBCC,null],
      [13,'Total',hdrBCC,null],[14,'Normais',hdrBCC,null],[15,'Extra',hdrBCC,null],
      [16,'Férias',hdrBFP,F_FER],[17,'Faltas',hdrBFP,F_FAL],[18,'Desloc.',hdrBFPR,F_DES],
    ];
    for(const [col,val,brd,fill] of hdrs){
      cell=ws.getCell(8,col); cell.value=val;
      cell.font=exFont(true,10); cell.alignment=exAlign(); cell.border=brd;
      if(fill) cell.fill=exFill(fill);
    }

    let totN=0,totE=0,dTrab=0,dFer=0,dFalt=0,dDes=0;
    const obraHoras={};

    for(let i=0;i<datas.length;i++){
      const d=datas[i]; const row=9+i;
      ws.getRow(row).height=15.0;
      const dStr=fmt(d); const isWE=d.getDay()===0||d.getDay()===6;
      const diaNome=DIAS_PT_EXP[d.getDay()===0?6:d.getDay()-1];

      const bDate=isWE?exBorder('thin','thin','thin','dotted'):exBorder('dotted','thin','thin','dotted');
      const bDay =isWE?exBorder('thin','thin','dotted'):exBorder('dotted','thin','dotted');
      const bData=isWE?exBorder('thin','thin','thin','thin'):exBorder('dotted','thin','thin','thin');

      cell=ws.getCell(row,3);
      cell.value=`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      cell.font=exFont(false,9); cell.alignment=exAlign(); cell.border=bDate;

      cell=ws.getCell(row,4); cell.value=diaNome;
      cell.font=exFont(false,9); cell.alignment=exAlign(); cell.border=bDay;

      const reg=(regMap[dStr]||{})[n];
      let normH='',extraH='',totalH='',ferV='',faltV='',desV='',obraNome='';

      if(reg){
        const tipo=reg.tipo||'Normal';
        const ent=(reg.entrada||'').slice(0,5); const sai=(reg.saida||'').slice(0,5);
        obraNome=S.OBRAS.find(o=>o.id===reg.obra_id)?.nome||'';
        const hc=calcH(ent,sai,d);
        if(tipo==='Férias'){ferV=1;dFer++;}
        else if(tipo&&tipo.includes('Falta')){faltV=1;dFalt++;}
        else if(tipo&&(tipo.includes('Desloc')||tipo==='Deslocado')){
          if(hc.t>0){normH=hc.n||'';extraH=hc.e||'';totalH=hc.t;totN+=hc.n;totE+=hc.e;dTrab++;
            if(reg.obra_id){if(!obraHoras[reg.obra_id])obraHoras[reg.obra_id]={n:0,e:0};obraHoras[reg.obra_id].n+=hc.n;obraHoras[reg.obra_id].e+=hc.e;}
          }
          desV=1;dDes++;
        } else {
          if(hc.t>0){normH=hc.n||'';extraH=hc.e||'';totalH=hc.t;totN+=hc.n;totE+=hc.e;dTrab++;
            if(reg.obra_id){if(!obraHoras[reg.obra_id])obraHoras[reg.obra_id]={n:0,e:0};obraHoras[reg.obra_id].n+=hc.n;obraHoras[reg.obra_id].e+=hc.e;}
          }
        }
      }

      function dc(col,val,argb,fillHex){
        cell=ws.getCell(row,col); cell.value=(val!==''&&val!==null&&val!==undefined)?val:null;
        cell.font=exFont(false,11,argb); cell.alignment=exAlign(); cell.border=bData;
        if(fillHex) cell.fill=exFill(fillHex);
      }

      dc(5,obraNome,CC_C);   dc(6,normH||null,H_C);
      dc(7,'',CC_C);         dc(8,'',H_C);
      dc(9,'',CC_C);         dc(10,'',H_C);
      dc(11,'',CC_C);        dc(12,extraH||null,H_C);
      dc(13,totalH||null,TOT_C); dc(14,normH||null,NORM_C); dc(15,extraH||null,EXTRA_C);

      cell=ws.getCell(row,16); cell.value=ferV||null; cell.alignment=exAlign(); cell.border=bData;
      if(ferV) cell.fill=exFill(F_FER);
      cell=ws.getCell(row,17); cell.value=faltV||null; cell.alignment=exAlign(); cell.border=bData;
      if(faltV) cell.fill=exFill(F_FAL);
      cell=ws.getCell(row,18); cell.value=desV||null; cell.alignment=exAlign(); cell.border=bData;
      if(desV) cell.fill=exFill(F_DES);
    }

    const sr=9+datas.length+1;
    function sc(row,col,val,bold,argb,fillHex,h='left'){
      cell=ws.getCell(row,col); cell.value=val;
      cell.font=exFont(bold||false,10,argb); cell.alignment=exAlign(h);
      if(fillHex) cell.fill=exFill(fillHex);
    }
    sc(sr,22,'total HORAS do ponto');
    sc(sr,28,'Total',true,null,null,'center'); sc(sr,29,Math.round((totN+totE)*100)/100,true,null,null,'center');
    sc(sr+1,28,'Normais',false,null,null,'center'); sc(sr+1,29,Math.round(totN*100)/100,false,NORM_C,null,'center');
    sc(sr+2,28,'Extra',false,null,null,'center'); sc(sr+2,29,Math.round(totE*100)/100,false,EXTRA_C,null,'center');
    sc(sr+4,22,'Total por MES');
    sc(sr+4,28,mesNome,false,null,null,'center'); sc(sr+4,29,Math.round((totN+totE)*100)/100,false,null,null,'center');
    sc(sr+5,28,mesNome,false,null,null,'center'); sc(sr+5,29,Math.round((totN+totE)*100)/100,false,null,null,'center');
    sc(sr+6,28,'Total',true,null,null,'center'); sc(sr+6,29,Math.round((totN+totE)*100)/100,true,null,null,'center'); sc(sr+6,30,'CERTO');
    sc(sr+8,22,'Dias');
    sc(sr+8,28,'Dias trabalho',false,null,F_TR); sc(sr+8,29,dTrab,false,null,null,'center');
    sc(sr+9,28,'Dias de férias',false,null,F_FE); sc(sr+9,29,dFer,false,null,null,'center');
    sc(sr+10,28,'Dias de falta',false,null,F_FA); sc(sr+10,29,dFalt,false,null,null,'center');
    sc(sr+11,28,'Dias deslocado',false,null,F_DE); sc(sr+11,29,dDes,false,null,null,'center');
    summaryData.push({n,nome,func,totN,totE,obraHoras});
  }

  // ── FOLHA DE FECHO ──
  try {
    const allObraIds=[...new Set(summaryData.flatMap(w=>Object.keys(w.obraHoras)))].sort(
      (a,b)=>(S.OBRAS.find(o=>o.id===a)?.nome||'').localeCompare(S.OBRAS.find(o=>o.id===b)?.nome||'')
    );
    const allObras=allObraIds.map(id=>({id,nome:S.OBRAS.find(o=>o.id===id)?.nome||id}));
    const fixedCount=6;
    const obraColStart=fixedCount+1;
    const totalCols=fixedCount+allObras.length*2;
    wsFecho.columns=[
      {width:6},{width:26},{width:14},{width:11},{width:11},{width:11},
      ...allObras.flatMap(()=>[{width:10},{width:9}])
    ];
    wsFecho.mergeCells(1,1,1,totalCols);
    let fc=wsFecho.getCell(1,1);
    fc.value='PLANDESE, SA — Folha de Fecho';
    fc.font=exFont(true,14,'FFFFFFFF');
    fc.alignment=exAlign();
    for(let ci=1;ci<=totalCols;ci++) wsFecho.getCell(1,ci).fill=exFill('FF002060');
    wsFecho.getRow(1).height=24;
    wsFecho.mergeCells(2,1,2,totalCols);
    fc=wsFecho.getCell(2,1);
    const pd1=`${String(dataIni.getDate()).padStart(2,'0')}/${String(dataIni.getMonth()+1).padStart(2,'0')}/${dataIni.getFullYear()}`;
    const pd2=`${String(dataFim.getDate()).padStart(2,'0')}/${String(dataFim.getMonth()+1).padStart(2,'0')}/${dataFim.getFullYear()}`;
    fc.value=`Período: ${pd1} a ${pd2}  —  Mês: ${mesNome} ${ano}`;
    fc.font=exFont(false,10,'FFFFFFFF');
    fc.alignment=exAlign();
    for(let ci=1;ci<=totalCols;ci++) wsFecho.getCell(2,ci).fill=exFill('FF1E3A5F');
    wsFecho.getRow(2).height=16;
    const hBg='FF1D4ED8',hBg2='FF1E40AF',hFg='FFFFFFFF';
    const bH=exBorder('thin','thin','thin','thin');
    const fixedHdrs=['Nº','Nome','Função','H.Normais','H.Extra','Total'];
    fixedHdrs.forEach((v,i)=>{
      wsFecho.mergeCells(3,i+1,4,i+1);
      fc=wsFecho.getCell(3,i+1);
      fc.value=v; fc.font=exFont(true,10,hFg);
      fc.alignment=exAlign('center','middle',true);
      for(let r=3;r<=4;r++){wsFecho.getCell(r,i+1).fill=exFill(hBg);wsFecho.getCell(r,i+1).border=bH;}
    });
    allObras.forEach((obra,i)=>{
      const cH=obraColStart+i*2; const cP=cH+1;
      wsFecho.mergeCells(3,cH,3,cP);
      fc=wsFecho.getCell(3,cH);
      fc.value=obra.nome; fc.font=exFont(true,9,hFg);
      fc.alignment=exAlign('center','middle',true);
      for(let ci=cH;ci<=cP;ci++){wsFecho.getCell(3,ci).fill=exFill(hBg2);wsFecho.getCell(3,ci).border=bH;}
      fc=wsFecho.getCell(4,cH); fc.value='Horas'; fc.font=exFont(false,8,hFg);
      fc.alignment=exAlign(); fc.fill=exFill(hBg2); fc.border=bH;
      fc=wsFecho.getCell(4,cP); fc.value='%'; fc.font=exFont(false,8,hFg);
      fc.alignment=exAlign(); fc.fill=exFill(hBg2); fc.border=bH;
    });
    wsFecho.getRow(3).height=28; wsFecho.getRow(4).height=16;
    const grandObraH={};
    allObraIds.forEach(id=>{grandObraH[id]={n:0,e:0};});
    let gN=0,gE=0;
    summaryData.forEach((w,idx)=>{
      const row=5+idx;
      const totW=Math.round((w.totN+w.totE)*100)/100;
      gN+=w.totN; gE+=w.totE;
      allObraIds.forEach(id=>{if(w.obraHoras[id]){grandObraH[id].n+=w.obraHoras[id].n;grandObraH[id].e+=w.obraHoras[id].e;}});
      const rowFg=idx%2===0?'FFFFFFFF':'FFF0F4FF';
      const bR=exBorder('thin','thin','thin','thin');
      const wc=(col,val,bold,argb,fg)=>{
        const cell=wsFecho.getCell(row,col);
        cell.value=(val!==null&&val!==undefined&&val!=='')?val:null;
        cell.font=exFont(bold||false,10,argb||null);
        cell.alignment=exAlign(typeof val==='number'?'center':'left','middle');
        cell.fill=exFill(fg||rowFg); cell.border=bR;
      };
      wc(1,w.n,false,'FF374151');wc(2,w.nome,true,'FF111827');wc(3,w.func,false,'FF6B7280');
      wc(4,Math.round(w.totN*100)/100,true,'FF00B050');wc(5,Math.round(w.totE*100)/100,true,'FF993300');wc(6,totW,true,'FF002060');
      allObras.forEach((obra,i)=>{
        const cH=obraColStart+i*2; const cP=cH+1;
        const oH=w.obraHoras[obra.id]||{n:0,e:0};
        const oT=Math.round((oH.n+oH.e)*100)/100;
        const pct=totW>0?Math.round(oT/totW*1000)/10:0;
        wc(cH,oT>0?oT:null,false,'FF1D4ED8');
        const pcell=wsFecho.getCell(row,cP);
        pcell.value=oT>0?pct:null;
        pcell.font=exFont(false,10,'FF6B7280');pcell.alignment=exAlign('center','middle');
        pcell.fill=exFill(rowFg);pcell.border=bR;
        if(oT>0)pcell.numFmt='0.0"%"';
      });
      wsFecho.getRow(row).height=18;
    });
    const totRow=5+summaryData.length;
    const gT=Math.round((gN+gE)*100)/100;
    const bTot=exBorder('medium','medium','medium','medium');
    const tc=(col,val,bold,argb)=>{
      const cell=wsFecho.getCell(totRow,col);
      cell.value=(val!==null&&val!==undefined)?val:null;
      cell.font=exFont(bold||false,10,argb||null);
      cell.alignment=exAlign(typeof val==='number'?'center':'left','middle');
      cell.fill=exFill('FFE8F0FE');cell.border=bTot;
    };
    wsFecho.mergeCells(totRow,1,totRow,3);tc(1,'TOTAL GERAL',true,'FF002060');
    tc(4,Math.round(gN*100)/100,true,'FF00B050');tc(5,Math.round(gE*100)/100,true,'FF993300');tc(6,gT,true,'FF002060');
    allObras.forEach((obra,i)=>{
      const cH=obraColStart+i*2; const cP=cH+1;
      const oH=grandObraH[obra.id]||{n:0,e:0};
      const oT=Math.round((oH.n+oH.e)*100)/100;
      const pct=gT>0?Math.round(oT/gT*1000)/10:0;
      tc(cH,oT>0?oT:null,true,'FF1D4ED8');
      const pcell=wsFecho.getCell(totRow,cP);
      pcell.value=oT>0?pct:null;
      pcell.font=exFont(true,10,'FF1D4ED8');pcell.alignment=exAlign('center','middle');
      pcell.fill=exFill('FFE8F0FE');pcell.border=bTot;
      if(oT>0)pcell.numFmt='0.0"%"';
    });
    wsFecho.getRow(totRow).height=22;
  } catch(eFecho){ console.warn('Folha de Fecho erro:', eFecho); }

  showToast('A gerar ficheiro...');
  const buffer=await workbook.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url;
  a.download=`Plandese_Folha_Ponto_${mesNome}_${ano}.xlsx`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Folha mensal gerada: ${mesNome} ${ano} ✓`);
}

export function exportHistSemana(){
  const d=window._histExportData;if(!d)return;
  const {obraMap,days,dStrs,dayNames,semLabel}=d;
  const wb=XLSX.utils.book_new();
  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=S.OBRAS.find(o=>o.id===obraId)?.nome||'Sem obra';
    const obraData=obraMap[obraId];
    const wd=[
      ['PLANDESE, SA — Folha de Ponto Semanal'],[`Obra nº: ${obraNome}`],[`Semana: ${semLabel}`],[`Exportado em: ${new Date().toLocaleString('pt-PT')}`],[],
      ['Nº','Nome','Função',...dayNames.flatMap(d=>[d+' H.Nor.',d+' H.Ext.',d+' Total']),'H.Normais','H.Extra','Total']
    ];
    let totN=0,totE=0,totT=0;
    Object.keys(obraData).sort().forEach(nStr=>{
      const n=parseInt(nStr),c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      const dc=obraData[n].flatMap((r,i)=>{
        if(!r)return['','',''];
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);
        rN+=h.n;rE+=h.e;rT+=h.t;
        if(r.tipo?.includes('Falta'))return[r.tipo,'',''];
        if(r.tipo==='Folga')return['Folga','',''];
        return[h.n||'',h.e||'',h.t||''];
      });
      totN+=rN;totE+=rE;totT+=rT;
      wd.push([n,c.nome,c.func,...dc,rN||'',rE||'',rT||'']);
    });
    wd.push([]);
    wd.push(['','','TOTAIS',...Array(18).fill(''),'',totN,totE,totT]);
    const ws=XLSX.utils.aoa_to_sheet(wd);
    ws['!cols']=[{wch:6},{wch:22},{wch:14},...Array(18).fill({wch:10}),{wch:10},{wch:10},{wch:10}];
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:21}},{s:{r:1,c:0},e:{r:1,c:21}},{s:{r:2,c:0},e:{r:2,c:21}},{s:{r:3,c:0},e:{r:3,c:21}}];
    XLSX.utils.book_append_sheet(wb,ws,obraNome.slice(0,31));
  });
  XLSX.writeFile(wb,`Plandese_Semana_${semLabel.replace(/\//g,'').replace(/\s/g,'').replace(/a/g,'_')}.xlsx`);
}

// ═══════════════════════════════════════
//  ADMIN — FECHO SEMANAL
// ═══════════════════════════════════════
export async function loadWeek(){
  const ds=document.getElementById('sw-data').value;if(!ds){alert('Selecione uma data.');return;}
  const ref=new Date(ds+'T12:00:00'),mon=getMonday(ref);
  const days=[];for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(d.getDate()+i);days.push(d);}
  const dStrs=days.map(fmt);
  const obraFilter=document.getElementById('sw-obra').value;
  const semLabel=`${fmtPT(dStrs[0])} — ${fmtPT(dStrs[6])}`;
  const cont=document.getElementById('week-content');
  cont.innerHTML='<div style="text-align:center;color:var(--gray-400);padding:32px">A carregar semana...</div>';
  let query=sb.from('registos_ponto').select('*').in('data',dStrs);
  if(obraFilter)query=query.eq('obra_id',obraFilter);
  const {data:regs}=await query;
  const obraMap={};
  (regs||[]).forEach(r=>{
    const obraId=r.obra_id||'_sem';
    if(obraFilter&&obraId!==obraFilter)return;
    const i=dStrs.indexOf(r.data);if(i<0)return;
    if(!obraMap[obraId])obraMap[obraId]={};
    if(!obraMap[obraId][r.colab_numero])obraMap[obraId][r.colab_numero]=Array(7).fill(null);
    obraMap[obraId][r.colab_numero][i]=r;
  });
  cont.innerHTML='';
  if(!Object.keys(obraMap).length){cont.innerHTML='<div class="card" style="text-align:center;color:var(--gray-400);padding:32px">Sem registos para esta semana.</div>';return;}
  const wi=document.createElement('div');wi.className='card';wi.style.cssText='margin-bottom:16px;background:var(--blue-50);border-color:var(--blue-100)';
  wi.innerHTML=`<div style="font-size:13px;color:var(--blue-600)">📅 Semana: <strong>${semLabel}</strong></div>`;cont.appendChild(wi);
  Object.keys(obraMap).sort().forEach(obraId=>{
    const obraNome=S.OBRAS.find(o=>o.id===obraId)?.nome||obraId;
    const obraData=obraMap[obraId];
    const hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px;flex-wrap:wrap;gap:8px';
    hdr.innerHTML=`<span style="font-size:14px;font-weight:600;color:var(--gray-700)">${obraNome}</span>`;
    const expBtn=document.createElement('button');expBtn.className='btn btn-green btn-sm';
    expBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Excel`;
    expBtn.onclick=()=>exportSemanaExcel(obraNome,obraData,days,semLabel);
    hdr.appendChild(expBtn);cont.appendChild(hdr);
    const card=document.createElement('div');card.className='card';card.style.cssText='padding:0;overflow:hidden;margin-bottom:4px';
    const wrap=document.createElement('div');wrap.className='tbl-wrap';const tbl=document.createElement('table');
    const dHdr=days.map((d,i)=>`<th>${dayShort(d)}<br><span style="font-weight:400;font-size:10px">${fmtPT(dStrs[i])}</span></th>`).join('');
    tbl.innerHTML=`<thead><tr><th>Nº</th><th>Colaborador</th><th>Função</th>${dHdr}<th>H.N.</th><th>H.E.</th><th>Total</th></tr></thead>`;
    let tbody='<tbody>',otN=0,otE=0,otT=0;
    Object.keys(obraData).forEach(nStr=>{
      const n=parseInt(nStr),c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
      let rN=0,rE=0,rT=0;
      const dCells=obraData[n].map((r,i)=>{
        if(!r)return`<td style="color:var(--gray-200);text-align:center">—</td>`;
        const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);rN+=h.n;rE+=h.e;rT+=h.t;
        if(r.tipo?.includes('Falta'))return`<td style="text-align:center"><span class="badge b-red" style="font-size:10px">${r.tipo}</span></td>`;
        if(r.tipo==='Folga')return`<td style="text-align:center"><span class="badge b-yellow" style="font-size:10px">Folga</span></td>`;
        return`<td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px">${h.t>0?fmtH(h.t):'—'}</td>`;
      }).join('');
      otN+=rN;otE+=rE;otT+=rT;
      tbody+=`<tr><td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gray-400)">${n}</td><td style="font-weight:500;font-size:13px">${c.nome}</td><td style="font-size:11px;color:var(--gray-500)">${c.func}</td>${dCells}<td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);font-weight:600">${fmtH(rN)}</td><td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--orange);font-weight:600">${fmtH(rE)}</td><td style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700">${fmtH(rT)}</td></tr>`;
    });
    tbody+=`<tr style="background:var(--gray-50);border-top:2px solid var(--gray-200)"><td colspan="3" style="font-weight:600;font-size:12px;padding:9px 12px">Total</td>${days.map(()=>'<td></td>').join('')}<td style="font-family:'DM Mono',monospace;color:var(--green);font-weight:700">${fmtH(otN)}</td><td style="font-family:'DM Mono',monospace;color:var(--orange);font-weight:700">${fmtH(otE)}</td><td style="font-family:'DM Mono',monospace;color:var(--blue-600);font-weight:700">${fmtH(otT)}</td></tr></tbody>`;
    tbl.innerHTML+=tbody;wrap.appendChild(tbl);card.appendChild(wrap);cont.appendChild(card);
  });
}

export function exportSemanaExcel(obraNome,obraData,days,semLabel){
  const wb=XLSX.utils.book_new();
  const dNames=days.map(d=>d.toLocaleDateString('pt-PT',{weekday:'long'})+' '+fmtPT(fmt(d)));
  const wd=[['PLANDESE, SA — Folha de Ponto Semanal'],[`Obra: ${obraNome}`],[`Semana: ${semLabel}`],[`Exportado: ${new Date().toLocaleString('pt-PT')}`],[],['Nº','Colaborador','Função',...dNames,'H.Normais','H.Extra','Total']];
  let totN=0,totE=0,totT=0;
  Object.keys(obraData).forEach(nStr=>{
    const n=parseInt(nStr),c=S.COLABORADORES.find(x=>x.n===n);if(!c)return;
    let rN=0,rE=0,rT=0;
    const dc=obraData[n].map((r,i)=>{if(!r)return'';const h=calcH(r.entrada?.slice(0,5),r.saida?.slice(0,5),days[i]);rN+=h.n;rE+=h.e;rT+=h.t;if(r.tipo?.includes('Falta'))return r.tipo;if(r.tipo==='Folga')return'Folga';return h.t>0?fmtH(h.t):'';});
    totN+=rN;totE+=rE;totT+=rT;
    wd.push([n,c.nome,c.func,...dc,rN||'',rE||'',rT||'']);
  });
  wd.push([]);wd.push(['','','TOTAIS',...Array(7).fill(''),totN,totE,totT]);
  const ws=XLSX.utils.aoa_to_sheet(wd);
  ws['!cols']=[{wch:6},{wch:22},{wch:16},...Array(7).fill({wch:16}),{wch:12},{wch:10},{wch:12}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}},{s:{r:2,c:0},e:{r:2,c:11}},{s:{r:3,c:0},e:{r:3,c:11}}];
  XLSX.utils.book_append_sheet(wb,ws,obraNome.slice(0,31));
  XLSX.writeFile(wb,`Plandese_${obraNome.replace(/\s/g,'_')}_${semLabel.replace(/\//g,'').replace(/\s/g,'').replace(/—/g,'_')}.xlsx`);
}

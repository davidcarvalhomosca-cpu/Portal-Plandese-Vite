// ═══════════════════════════════════════
//  PREÇOS UNITÁRIOS — Lista por obra
// ═══════════════════════════════════════
import { S } from '../state.js';
import { showToast } from './navigation.js';

let PRECOS_UNIT = [];
let _puState = { obraId: null, wired: false };

// ── Persistência ──────────────────────────────────────────────────────────────
function _puLoad(){ try{ PRECOS_UNIT = JSON.parse(localStorage.getItem('prod_precos_unit')||'[]'); }catch(e){ PRECOS_UNIT=[]; } }
function _puSave(){ localStorage.setItem('prod_precos_unit', JSON.stringify(PRECOS_UNIT)); }
_puLoad();

// ── Init / Render principal ───────────────────────────────────────────────────
function initPrecosUnit(){
  _puLoad();
  puGoList();
}

function puGoList(){
  _puState.obraId = null;
  const listEl   = document.getElementById('pu-list-view');
  const detailEl = document.getElementById('pu-detail');
  if(!listEl) return;
  listEl.style.display   = '';
  detailEl.style.display = 'none';
  _puRenderList();
}

function puOpenObra(obraId){
  _puState.obraId = obraId;
  document.getElementById('pu-list-view').style.display   = 'none';
  document.getElementById('pu-detail').style.display      = '';
  _puRenderDetail();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ── Lista de obras ────────────────────────────────────────────────────────────
function _puRenderList(){
  const obras = S.OBRAS.filter(o => o.ativa !== false);
  const grid  = document.getElementById('pu-obras-grid');
  if(!grid) return;

  if(!obras.length){
    grid.innerHTML = '<div class="pu-no-obras">Sem obras ativas. Adicione obras na secção Administração.</div>';
    return;
  }

  grid.innerHTML = obras.map(o => {
    const lista    = PRECOS_UNIT.find(l => l.obraId === o.id);
    const temLista = lista && lista.artigos?.length > 0;
    const totArt   = temLista ? lista.artigos.filter(a => !a.isCapitulo).length : 0;
    const totVal   = temLista ? lista.artigos.filter(a => !a.isCapitulo).reduce((s,a) => s+(a.precoUnit||0)*(a.quantidade||0),0) : 0;
    const dataImp  = temLista && lista.importadoEm ? new Date(lista.importadoEm).toLocaleDateString('pt-PT') : null;

    return `<div class="pu-obra-card ${temLista?'has-lista':''}" onclick="puOpenObra('${o.id}')">
      <div class="pu-obra-card-hd">
        <div class="pu-obra-status-pill ${temLista?'ok':'empty'}">
          ${temLista
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px"><polyline points="20 6 9 17 4 12"/></svg> Com lista'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M12 5v14M5 12h14"/></svg> Importar'}
        </div>
      </div>
      <div class="pu-obra-nome">${puEsc(o.nome)}</div>
      ${o.local ? `<div class="pu-obra-local"><svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>${puEsc(o.local)}</div>` : ''}
      <div class="pu-obra-card-ft">
        ${temLista
          ? `<div class="pu-obra-meta"><span>${totArt} artigo${totArt!==1?'s':''}</span><span class="pu-obra-total">${puFmtEur(totVal)}</span></div>
             <div class="pu-obra-date">Importado em ${dataImp}</div>`
          : `<div class="pu-obra-meta empty">Nenhum mapa de preços importado</div>`}
      </div>
      <div class="pu-obra-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
    </div>`;
  }).join('');
}

// ── Detalhe da obra ───────────────────────────────────────────────────────────
function _puRenderDetail(){
  const obraId = _puState.obraId;
  const o = S.OBRAS.find(x => x.id === obraId);
  if(!o) return;

  const lista    = PRECOS_UNIT.find(l => l.obraId === obraId);
  const temLista = lista && lista.artigos?.length > 0;

  // Breadcrumb + título
  document.getElementById('pu-dt-crumb').textContent = o.nome;
  document.getElementById('pu-dt-title').textContent = o.nome;

  // Botões de ação
  const actBar = document.getElementById('pu-dt-actions');
  if(actBar){
    actBar.innerHTML = temLista
      ? `<button class="btn btn-primary" onclick="puOpenImport()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
           Substituir lista
         </button>
         <button class="btn btn-green" onclick="puExportExcel()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
           Descarregar Excel
         </button>
         <button class="btn" style="color:var(--red);background:var(--red-bg);border:1px solid #fca5a5" onclick="puLimpar()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
           Limpar
         </button>`
      : `<button class="btn btn-primary" onclick="puOpenImport()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
           Importar lista de preços
         </button>`;
  }

  // KPIs
  const kpiZone = document.getElementById('pu-dt-kpis');
  if(kpiZone){
    if(temLista){
      const totArt  = lista.artigos.filter(a=>!a.isCapitulo).length;
      const totVal  = lista.artigos.filter(a=>!a.isCapitulo).reduce((s,a)=>s+(a.precoUnit||0)*(a.quantidade||0),0);
      const dataImp = lista.importadoEm ? new Date(lista.importadoEm).toLocaleDateString('pt-PT') : '—';
      const fonte   = lista.fonte || 'Excel';
      kpiZone.style.display = '';
      kpiZone.innerHTML = `
        <div class="pu-kpi"><div class="pu-kpi-lbl">Artigos</div><div class="pu-kpi-val">${totArt}</div></div>
        <div class="pu-kpi"><div class="pu-kpi-lbl">Total da obra</div><div class="pu-kpi-val" style="color:oklch(0.55 0.13 155)">${puFmtEur(totVal)}</div></div>
        <div class="pu-kpi"><div class="pu-kpi-lbl">Importado em</div><div class="pu-kpi-val" style="font-size:16px;color:var(--gray-600)">${dataImp}</div></div>
        <div class="pu-kpi"><div class="pu-kpi-lbl">Fonte</div><div class="pu-kpi-val" style="font-size:15px;color:var(--gray-600)">${puEsc(fonte)}</div></div>`;
    } else {
      kpiZone.style.display = 'none';
    }
  }

  // Conteúdo principal
  const body = document.getElementById('pu-dt-body');
  if(!body) return;

  if(!temLista){
    body.innerHTML = `<div class="pu-dropzone-big"
        onclick="puOpenImport()"
        ondragover="puDragOver(event)"
        ondragleave="puDragLeave(event)"
        ondrop="puHandleDrop(event)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pu-dz-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
      <div class="pu-dz-title">Importar mapa de quantidades</div>
      <div class="pu-dz-sub">Arraste um ficheiro Excel ou PDF, ou clique para escolher</div>
      <div class="pu-dz-formats">
        <span class="pu-dz-badge">.xlsx</span>
        <span class="pu-dz-badge">.xls</span>
        <span class="pu-dz-badge">.pdf</span>
      </div>
    </div>`;
    return;
  }

  // Pesquisa + tabela
  const q = (document.getElementById('pu-dt-q')?.value || '').toLowerCase().trim();
  let rows = '';
  lista.artigos.forEach(a => {
    if(a.isCapitulo){
      rows += `<tr class="pu-cap-row"><td colspan="6">${puEsc((a.codigo?a.codigo+' — ':'')+a.descricao)}</td></tr>`;
      return;
    }
    if(q && !(a.codigo+' '+a.descricao).toLowerCase().includes(q)) return;
    const tot = (a.quantidade||0)*(a.precoUnit||0);
    rows += `<tr>
      <td class="pu-cod">${puEsc(a.codigo||'—')}</td>
      <td class="pu-desc">${puEsc(a.descricao||'—')}</td>
      <td class="pu-un">${puEsc(a.unidade||'—')}</td>
      <td class="pu-num">${a.quantidade?puFmtNum(a.quantidade):'—'}</td>
      <td class="pu-num pu-price">${a.precoUnit?puFmtEur(a.precoUnit):'—'}</td>
      <td class="pu-num pu-total">${tot>0?puFmtEur(tot):'—'}</td>
    </tr>`;
  });

  body.innerHTML = `
    <div class="pu-tools">
      <div class="pu-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="pu-dt-q" placeholder="Pesquisar artigo ou código…" oninput="_puRefreshDetail()" value="${q}"/>
      </div>
    </div>
    <div class="pu-table-wrap">
      <table class="pu-table">
        <thead><tr>
          <th style="width:110px">Código</th>
          <th>Descrição</th>
          <th style="width:60px;text-align:center">Un.</th>
          <th style="width:90px;text-align:right">Qtd.</th>
          <th style="width:125px;text-align:right">P. Unit.</th>
          <th style="width:135px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px">Nenhum artigo corresponde à pesquisa.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function _puRefreshDetail(){ _puRenderDetail(); }

// ── Import ────────────────────────────────────────────────────────────────────
function puOpenImport(){
  if(!_puState.obraId){ showToast('Selecione uma obra primeiro'); return; }
  document.getElementById('pu-file-input').click();
}

function puHandleFile(e){
  const file = e.target.files?.[0]; if(!file) return;
  e.target.value = '';
  _puProcessFile(file);
}

function puHandleDrop(ev){
  ev.preventDefault();
  ev.currentTarget?.classList?.remove('drag');
  const file = ev.dataTransfer?.files?.[0]; if(!file) return;
  _puProcessFile(file);
}

function puDragOver(ev){
  ev.preventDefault();
  ev.currentTarget?.classList?.add('drag');
}

function puDragLeave(ev){
  ev.currentTarget?.classList?.remove('drag');
}

async function _puProcessFile(file){
  const isPDF = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  showToast(isPDF ? 'A ler PDF…' : 'A processar Excel…');
  try{
    const artigos = isPDF ? await _puParsePDF(file) : await _puParseExcel(file);
    if(!artigos || artigos.length === 0){ showToast('Nenhum artigo reconhecido no ficheiro'); return; }
    _puSaveLista(artigos, isPDF ? 'PDF' : 'Excel');
    showToast(`${artigos.filter(a=>!a.isCapitulo).length} artigos importados com sucesso`);
  }catch(err){
    console.error('_puProcessFile:', err);
    showToast('Erro ao processar o ficheiro: ' + err.message);
  }
}

function _puSaveLista(artigos, fonte){
  const obraObj  = S.OBRAS.find(o => o.id === _puState.obraId);
  const existing = PRECOS_UNIT.findIndex(l => l.obraId === _puState.obraId);
  const entry = {
    id:          existing >= 0 ? PRECOS_UNIT[existing].id : ('PU'+Date.now().toString(36).toUpperCase()),
    obraId:      _puState.obraId,
    obraNome:    obraObj?.nome || _puState.obraId,
    importadoEm: new Date().toISOString(),
    fonte,
    artigos
  };
  if(existing >= 0) PRECOS_UNIT[existing] = entry;
  else PRECOS_UNIT.push(entry);
  _puSave();
  _puRenderDetail();
  _puRenderList();
}

// ── Parser Excel ──────────────────────────────────────────────────────────────
function _puParseExcel(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try{
        const wb   = XLSX.read(ev.target.result, { type:'binary', cellDates:true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
        resolve(_puParseRows(rows));
      }catch(e){ reject(e); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function _puParseRows(rows){
  if(!rows.length) return [];

  // Detectar linha de cabeçalho nas primeiras 10 linhas
  let headerIdx = -1;
  for(let i = 0; i < Math.min(rows.length, 10); i++){
    const r = rows[i].map(c => _puNorm(String(c)));
    if(r.some(h => h.includes('descri') || h.includes('artigo') || h === 'un' || h === 'unidade' || h.includes('designa'))){
      headerIdx = i; break;
    }
  }

  const artigos = [];

  if(headerIdx >= 0){
    const hdr   = rows[headerIdx].map(c => _puNorm(String(c)));
    const iCod  = _findCol(hdr, ['codigo','cod','ref','artigo','n.','num','n°','item','cap']);
    const iDesc = _findCol(hdr, ['descri','designa','designacao','nome','artigo','trabalho','especif']);
    const iUn   = _findCol(hdr, ['unidade','un','und','unit']);
    const iQtd  = _findCol(hdr, ['quant','qtd','qt','medic']);
    const iPu   = _findCol(hdr, ['preco unit','p.unit','p.u.','pu','unit.price','unitario','preco un']);
    const iTot  = _findCol(hdr, ['total','montante','importe','valor']);

    for(let i = headerIdx+1; i < rows.length; i++){
      const row  = rows[i];
      if(!row || row.every(c => c === '' || c === null)) continue;
      const desc = String(iDesc>=0 ? row[iDesc]??'' : row[1]??'').trim();
      const cod  = String(iCod >=0 ? row[iCod] ??'' : row[0]??'').trim();
      if(!desc && !cod) continue;
      const un   = String(iUn  >=0 ? row[iUn] ??'' : row[2]??'').trim();
      const qtd  = _toNum(iQtd >=0 ? row[iQtd] : row[3]);
      const pu   = _toNum(iPu  >=0 ? row[iPu]  : row[4]);
      const tot  = iTot >=0 ? _toNum(row[iTot]) : qtd*pu;
      const isCapitulo = (!qtd && !pu) || _isChapterCode(cod);
      artigos.push({ codigo:cod, descricao:desc, unidade:un, quantidade:qtd, precoUnit:pu, total: isCapitulo?0:(tot||qtd*pu), isCapitulo });
    }
  } else {
    // Posicional
    for(let i = 0; i < rows.length; i++){
      const row = rows[i];
      if(!row || row.every(c => c===''||c===null)) continue;
      const cod  = String(row[0]??'').trim();
      const desc = String(row[1]??row[0]??'').trim();
      if(!desc) continue;
      const un   = String(row[2]??'').trim();
      const qtd  = _toNum(row[3]);
      const pu   = _toNum(row[4]);
      const tot  = _toNum(row[5]) || qtd*pu;
      const isCapitulo = (!qtd && !pu) || _isChapterCode(cod);
      artigos.push({ codigo:cod, descricao:desc, unidade:un, quantidade:qtd, precoUnit:pu, total:isCapitulo?0:tot, isCapitulo });
    }
  }
  return artigos;
}

// ── Parser PDF ────────────────────────────────────────────────────────────────
let _pdfjsPromise = null;
async function _getPdfjs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  if(!_pdfjsPromise) _pdfjsPromise = (async()=>{
    const mod   = await import('pdfjs-dist');
    const pdfjs = mod.getDocument ? mod : (mod.default || mod);
    try{
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.js?worker')).default;
      pdfjs.GlobalWorkerOptions.workerPort = new WorkerCtor();
    }catch(e){
      try{
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }catch(e2){ console.warn('PDF.js worker fallback'); }
    }
    window.pdfjsLib = pdfjs;
    return pdfjs;
  })();
  return _pdfjsPromise;
}

async function _puParsePDF(file){
  const pdfjs = await _getPdfjs();
  const buf   = await file.arrayBuffer();
  const pdf   = await pdfjs.getDocument({ data: buf }).promise;

  // Extrair texto de todas as páginas com posições X/Y
  const allItems = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(item => {
      allItems.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        page: p
      });
    });
  }

  // Agrupar itens por linha (Y próximo) dentro de cada página
  const lines = _puGroupByLine(allItems);

  // Tentar detectar tabela de preços nas linhas
  return _puParseTextLines(lines);
}

function _puGroupByLine(items){
  // Ordenar por página, depois Y desc (PDF tem Y crescente de baixo p/ cima), depois X
  const sorted = [...items].sort((a,b) => a.page!==b.page ? a.page-b.page : b.y-a.y || a.x-b.x);
  const lines  = [];
  let curLine  = null, curY = null, curPage = null;
  const TOL    = 4; // pixels de tolerância vertical

  sorted.forEach(item => {
    if(!item.text.trim()) return;
    if(curPage !== item.page || curY === null || Math.abs(item.y - curY) > TOL){
      curLine = []; lines.push(curLine);
      curY = item.y; curPage = item.page;
    }
    curLine.push(item.text.trim());
  });
  return lines.map(l => l.join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}

function _puParseTextLines(lines){
  const artigos = [];

  // Padrão 1: linha com código, descrição, unidade, quantidade, preço
  // Ex: "1.1 Escavação de terras m3 150,00 12,50 1.875,00"
  // Tentamos extrair colunas numéricas do fim da linha
  const reNums = /(-?[\d.,]+(?:\s?€)?)\s*$/;
  const reFullRow = /^(\S+)\s+(.+?)\s+([a-zA-Züçãõéáíó\/\.]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;
  const rePartRow = /^(\S+)\s+(.+?)\s+([\d.,]+)\s+([\d.,]+(?:\s?€)?)\s*$/; // sem un + qtd
  const reCapitulo = /^([IVXLCDM]+|[A-Z]{1,3}|\d+\.?)\s+[-–—]?\s*(.+)$/;

  // Detectar se há cabeçalho de tabela nas primeiras linhas
  let startLine = 0;
  for(let i = 0; i < Math.min(lines.length, 20); i++){
    const ln = _puNorm(lines[i]);
    if(ln.includes('descri') || ln.includes('artigo') || ln.includes('designa') || ln.includes('unidade')){
      startLine = i + 1; break;
    }
  }

  for(let i = startLine; i < lines.length; i++){
    const line = lines[i];
    if(!line || line.length < 3) continue;

    // Tentar linha completa
    let m = line.match(reFullRow);
    if(m){
      const cod  = m[1].trim();
      const desc = m[2].trim();
      const un   = m[3].trim();
      const qtd  = _toNum(m[4]);
      const pu   = _toNum(m[5]);
      const tot  = _toNum(m[6]);
      const isCapitulo = (!qtd && !pu) || _isChapterCode(cod);
      artigos.push({ codigo:cod, descricao:desc, unidade:un, quantidade:qtd, precoUnit:pu, total:isCapitulo?0:(tot||qtd*pu), isCapitulo });
      continue;
    }

    // Tentar linha parcial (código + descrição + 2 valores numéricos)
    m = line.match(rePartRow);
    if(m){
      const cod  = m[1].trim();
      const desc = m[2].trim();
      const qtd  = _toNum(m[3]);
      const pu   = _toNum(m[4]);
      const isCapitulo = (!qtd && !pu) || _isChapterCode(cod);
      artigos.push({ codigo:cod, descricao:desc, unidade:'', quantidade:qtd, precoUnit:pu, total:isCapitulo?0:qtd*pu, isCapitulo });
      continue;
    }

    // Capítulo / título
    m = line.match(reCapitulo);
    if(m && _isChapterCode(m[1])){
      artigos.push({ codigo:m[1].trim(), descricao:m[2].trim(), unidade:'', quantidade:0, precoUnit:0, total:0, isCapitulo:true });
      continue;
    }

    // Heurística: linha com pelo menos 2 valores numéricos no fim → artigo sem código claro
    const nums = line.match(/[\d.,]{2,}(?:\s?€)?/g);
    if(nums && nums.length >= 2){
      const vals = nums.slice(-3).map(_toNum);
      const desc = line.replace(/[\d.,]+(?:\s?€)?\s*$/g,'').replace(/[\d.,]+(?:\s?€)?\s*/g,'').trim();
      if(desc.length > 3){
        const pu  = vals[vals.length-2] || 0;
        const tot = vals[vals.length-1] || 0;
        artigos.push({ codigo:'', descricao:desc, unidade:'', quantidade:0, precoUnit:pu, total:tot, isCapitulo:false });
      }
    }
  }

  return artigos;
}

// ── Export Excel ──────────────────────────────────────────────────────────────
function puExportExcel(){
  const obraId = _puState.obraId;
  const lista  = PRECOS_UNIT.find(l => l.obraId === obraId);
  if(!lista?.artigos?.length){ showToast('Sem dados para exportar'); return; }
  const o = S.OBRAS.find(x => x.id === obraId);
  const nome = o?.nome || lista.obraNome || 'Obra';

  const data = [['Código','Descrição','Unidade','Quantidade','Preço Unitário','Total']];
  lista.artigos.forEach(a => {
    if(a.isCapitulo) data.push([(a.codigo||''), a.descricao||'', '','','','']);
    else data.push([a.codigo||'', a.descricao||'', a.unidade||'', a.quantidade||0, a.precoUnit||0, (a.quantidade||0)*(a.precoUnit||0)]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:14},{wch:60},{wch:10},{wch:12},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws, 'Preços Unitários');
  XLSX.writeFile(wb, `Precos_Unitarios_${nome.replace(/[^a-zA-Z0-9]/g,'_')}.xlsx`);
  showToast('Ficheiro exportado');
}

// ── Limpar ────────────────────────────────────────────────────────────────────
function puLimpar(){
  if(!_puState.obraId) return;
  if(!confirm('Eliminar a lista de preços desta obra?')) return;
  PRECOS_UNIT = PRECOS_UNIT.filter(l => l.obraId !== _puState.obraId);
  _puSave();
  _puRenderDetail();
  _puRenderList();
  showToast('Lista eliminada');
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function _puNorm(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim(); }

function _findCol(hdr, keys){
  for(const k of keys){ const i = hdr.findIndex(h => h.includes(k)); if(i>=0) return i; }
  return -1;
}

function _toNum(v){
  if(v===''||v===null||v===undefined) return 0;
  const n = parseFloat(String(v).replace(/[€\s ]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'));
  return isNaN(n) ? 0 : n;
}

function _isChapterCode(cod){
  if(!cod) return false;
  return /^[IVXLCDMivxlcdm]+$/i.test(cod) || /^[A-Z]{1,3}$/.test(cod) || /^\d+\.$/.test(cod) || /^CAP/i.test(cod);
}

function puFmtEur(v){ return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(v||0); }
function puFmtNum(v){ if(!v) return '—'; return new Intl.NumberFormat('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:4}).format(v); }
function puEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export {
  PRECOS_UNIT,
  initPrecosUnit, puGoList, puOpenObra,
  puOpenImport, puHandleFile, puHandleDrop, puDragOver, puDragLeave,
  puExportExcel, puLimpar, _puRefreshDetail,
  _puLoad, _puSave
};

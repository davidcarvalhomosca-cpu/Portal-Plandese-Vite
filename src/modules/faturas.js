// ═══════════════════════════════════════════════════════════════════
//  MÓDULO FATURAS — OCR + extração de campos
// ═══════════════════════════════════════════════════════════════════
import { S } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast, flashAlert, closeModal } from './navigation.js';

let FATURAS = [];
let FAT_QUEUE = [];
let _fatSeq = 0;
let _editFatId = null;

// ═══════════════════════════════════════════════════════════════════
//  MÓDULO FATURAS  (apenas perfil 'admin')
//  ───────────────────────────────────────────────────────────────────
//  Pipeline de extração 100% client-side (sem backend):
//    PDFs com texto       → PDF.js (extrai texto direto)
//    PDFs digitalizados   → PDF.js renderiza páginas → Tesseract.js OCR
//    Imagens (jpg/png)    → Tesseract.js OCR (por+eng)
//    Parsing dos campos   → regex específicas para faturas portuguesas
//
//  Em produção pode-se substituir por API mais precisa:
//    Azure Document Intelligence (prebuilt-invoice) | AWS Textract
//    AnalyzeExpense | Google Document AI | Mindee Invoice OCR.
// ═══════════════════════════════════════════════════════════════════


// (sem dados de demonstração — extração real do ficheiro carregado)
function seedFaturasDemo(){ /* no-op */ }

// ═══════════════════════════════════════
//  VALIDAÇÕES (boas práticas — checksums e coerência)
// ═══════════════════════════════════════
function validaNIF(nif){
  if(!nif) return false;
  const s = String(nif).replace(/\D/g,'');
  if(s.length!==9) return false;
  // Primeiro dígito tem de ser válido para PT
  if(!'12356789'.includes(s[0])) return false;
  let total=0;
  for(let i=0;i<8;i++) total += parseInt(s[i],10)*(9-i);
  let check = 11 - (total%11);
  if(check>=10) check = 0;
  return check === parseInt(s[8],10);
}
function coerenciaTotais(base, iva, total){
  if(base==null||iva==null||total==null) return true;
  return Math.abs((base+iva) - total) < 0.05;
}
function statusBadge(s){
  switch(s){
    case 'extraida': return '<span class="badge b-blue">Extraída</span>';
    case 'rever':    return '<span class="badge b-yellow">A rever</span>';
    case 'validada': return '<span class="badge b-green">Validada</span>';
    case 'paga':     return '<span class="badge b-gray">Paga</span>';
    default: return '<span class="badge b-gray">—</span>';
  }
}
function confBadge(c){
  if(c>=0.9) return `<span class="fat-conf high">${Math.round(c*100)}%</span>`;
  if(c>=0.75) return `<span class="fat-conf med">${Math.round(c*100)}%</span>`;
  return `<span class="fat-conf low">${Math.round(c*100)}%</span>`;
}
function eur(v){ if(v==null||isNaN(v)) return '—'; return Number(v).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }

// ═══════════════════════════════════════
//  UPLOAD + OCR SIMULADO
// ═══════════════════════════════════════
function handleFatFiles(fileList){
  const files = Array.from(fileList||[]);
  if(files.length===0) return;
  const MAX = 10*1024*1024;
  files.forEach(f=>{
    if(f.size>MAX){ showToast(`${f.name}: excede 10 MB`); return; }
    const ok = /\.(pdf|jpe?g|png)$/i.test(f.name);
    if(!ok){ showToast(`${f.name}: formato não suportado`); return; }
    const id = ++_fatSeq;
    const item = {id, name:f.name, size:f.size, status:'pending', progress:0, _file:f};
    FAT_QUEUE.push(item);
    renderQueue();
    // Inicia processamento simulado
    setTimeout(()=>processQueueItem(item), 200);
  });
  document.getElementById('fat-input').value='';
}

// ═══════════════════════════════════════
//  PROCESSAMENTO REAL: PDF.js (PDF) + Tesseract.js (imagens / PDFs digitalizados)
// ═══════════════════════════════════════
async function processQueueItem(item){
  item.status='processing'; item.progress=2; renderQueue();
  try{
    const isPDF = /\.pdf$/i.test(item.name) || item._file.type==='application/pdf';
    const isImg = /\.(jpe?g|png)$/i.test(item.name);
    let texto = '';

    if(isPDF){
      texto = await extractTextFromPDF(item);
      // Recorre a OCR se: (a) texto vazio, (b) texto curto, (c) texto "lixo" — fontes com glifos
      // personalizados que o PDF.js não consegue mapear para Unicode (caracteres fora do alfabeto PT/EN)
      const precisaOCR = !texto
        || texto.replace(/\s/g,'').length < 30
        || textoPareceLixo(texto);
      if(precisaOCR){
        showToast(`${item.name}: PDF com fontes não-padrão, a executar OCR…`);
        texto = await ocrPDFPagesToText(item);
      }
    } else if(isImg){
      texto = await ocrImageToText(item);
    } else {
      throw new Error('Formato não suportado');
    }

    if(!texto || texto.trim().length<10){
      throw new Error('Não foi possível extrair texto do ficheiro');
    }

    item.progress = 92; renderQueue();
    const fat = extractInvoiceFields(texto, item);
    FATURAS.push(fat);

    item.status='done'; item.progress=100; renderQueue();
    renderFaturas(); atualizaKPIs();
    const detetados = countCamposDetetados(fat);
    showToast(`${item.name}: ${detetados}/5 campos detetados`);
    setTimeout(()=>{ FAT_QUEUE = FAT_QUEUE.filter(q=>q.id!==item.id); renderQueue(); }, 4000);
  } catch(e){
    console.error('Erro processamento fatura:', e);
    item.status='error'; item.error = e.message || 'Erro ao processar';
    renderQueue();
    showToast(`Falha ao processar ${item.name}: ${item.error}`);
  }
}

// Deteta se o texto extraído é "lixo" — PDFs com fontes embutidas com encoding personalizado
// que o PDF.js não consegue mapear para Unicode devolvem caracteres no bloco Latin-1 Supplement
// (¡¢£¤¥¦§¨©ª…) ou Private Use Area, em vez das letras reais. Se a percentagem de "letras
// reconhecíveis PT/EN" for baixa, é melhor recorrer a OCR.
function textoPareceLixo(texto){
  const limpo = texto.replace(/\s/g,'');
  if(limpo.length < 50) return false;
  // Heurística 1: ratio global de letras reais < 75% → suspeito
  const letrasReais = (limpo.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g)||[]).length;
  const ratioGlobal = letrasReais / limpo.length;
  if(ratioGlobal < 0.75) return true;
  // Heurística 2: sequência consecutiva longa (>=15 chars) de símbolos Latin-1
  // (U+00A1–U+00BF e U+02XX) — sintoma típico de fonte com encoding personalizado
  // que o PDF.js não consegue mapear. Mesmo que o resto do texto esteja OK,
  // queremos OCR para extrair o cabeçalho/caixa de totais que vêm corrompidos.
  if(/[¡-¿ʰ-˿]{15,}/.test(texto)) return true;
  return false;
}

// Extrai texto direto de um PDF (sem OCR — para PDFs com texto)
async function extractTextFromPDF(item){
  if(!window.pdfjsLib) throw new Error('PDF.js indisponível');
  const buf = await item._file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  let txt = '';
  for(let i=1;i<=pdf.numPages;i++){
    item.progress = Math.round(((i-1)/pdf.numPages)*70)+5; renderQueue();
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruir linhas (item.str já vem em ordem de leitura)
    let lastY = null, line = '';
    const lines = [];
    content.items.forEach(it=>{
      const y = it.transform[5];
      if(lastY!==null && Math.abs(y-lastY)>2){ lines.push(line.trim()); line=''; }
      line += it.str + ' ';
      lastY = y;
    });
    if(line.trim()) lines.push(line.trim());
    txt += lines.join('\n') + '\n--PAGE--\n';
  }
  return txt;
}

// OCR de imagem (jpg/png) com Tesseract
async function ocrImageToText(item){
  if(!window.Tesseract) throw new Error('Tesseract.js indisponível');
  const url = URL.createObjectURL(item._file);
  try{
    const { data } = await Tesseract.recognize(url, 'por+eng', {
      logger: m => {
        if(m.status==='recognizing text'){
          item.progress = Math.round(m.progress*80)+10; renderQueue();
        } else if(m.status==='loading language traineddata' || m.status==='initializing api'){
          item.progress = Math.max(item.progress, 8); renderQueue();
        }
      }
    });
    return data.text;
  } finally { URL.revokeObjectURL(url); }
}

// PDF digitalizado: renderiza páginas em canvas e corre OCR em cada
async function ocrPDFPagesToText(item){
  if(!window.pdfjsLib || !window.Tesseract) throw new Error('Bibliotecas OCR indisponíveis');
  const buf = await item._file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  let texto = '';
  for(let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({scale:2.0});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext:ctx, viewport}).promise;
    const blob = await new Promise(r=>canvas.toBlob(r,'image/png'));
    const url = URL.createObjectURL(blob);
    try{
      const { data } = await Tesseract.recognize(url, 'por+eng', {
        logger: m => {
          if(m.status==='recognizing text'){
            const base = ((i-1)/pdf.numPages)*80;
            const dentro = (m.progress*80)/pdf.numPages;
            item.progress = Math.round(base+dentro)+5; renderQueue();
          }
        }
      });
      texto += data.text + '\n--PAGE--\n';
    } finally { URL.revokeObjectURL(url); }
  }
  return texto;
}

// ═══════════════════════════════════════
//  EXTRAÇÃO DE CAMPOS — regex específicas para faturas PT
// ═══════════════════════════════════════
function extractInvoiceFields(texto, item){
  const t = texto.replace(/ /g,' ').replace(/[ \t]+/g,' ');
  // NIF: tag explícita primeiro, depois fallback para qualquer 9 dígitos válido
  let nif = '';
  const nifTag = t.match(/(?:NIF|NIPC|N[ºo°.]?\s*Cont(?:ribuinte|\.?(?:\s*PT)?)|Contribuinte|VAT)[\s:.\-Nº°#PT]*([12356789]\d{8})/i);
  if(nifTag) nif = nifTag[1];
  else {
    const candidatos = [...t.matchAll(/\b([12356789]\d{8})\b/g)].map(m=>m[1]).filter(validaNIF);
    if(candidatos.length) nif = candidatos[0];
  }

  // Padrão para um número de fatura típico: "1 107.00", "1.107,00", "900.00", "207,00"
  // (1 dígito, depois até 15 chars [dígitos/espaços/pontos/vírgulas], depois separador decimal e 2 dígitos)
  const NUM_REGEX = '(\\d[\\d\\s.,]{0,15}[.,]\\d{2})';

  // Total — várias variantes em PT
  const total = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:a\\s*pagar|geral|c[\\/\\.]?\\s*IVA|com\\s*IVA|fatura|factura|documento|do\\s*documento)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Valor\\s*(?:total|a\\s*pagar)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*TOTAL[^\\d\\n]*?'+NUM_REGEX, 'm'),
  ]));
  // IVA — preferimos "Total IVA" para evitar apanhar células de tabela com 0,00
  const iva = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*IVA[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*IVA(?:\\s*\\(?\\d+\\s*%\\)?)?[^\\d\\n]+?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Imposto[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  // Base / sub-total — inclui "Total Serviços", "Total Mercadoria", "Total Bruto"
  let base = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:Servi[çc]os|Mercadoria|Mercadorias|Bruto)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*(?:Total\\s*)?(?:Base\\s*tribut[áa]vel|Subtotal|Sub-total|Total\\s*l[íi]quido|Sem\\s*IVA|Valor\\s*l[íi]quido|Incid[êe]ncia)[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  if(base==null && total!=null && iva!=null) base = Math.round((total-iva)*100)/100;
  if(total==null && base!=null && iva!=null) {/* mantemos null */}

  // Data emissão — suporta YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  let data = '';
  const dataTag =
        t.match(/(?:Data\s*(?:de\s*)?(?:emiss[ãa]o|fatura|factura|documento)?)[\s:]*?(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i)
     || t.match(/(?:Data\s*(?:de\s*)?(?:emiss[ãa]o|fatura|factura|documento)?)[\s:]*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i)
     || t.match(/(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/)
     || t.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
  if(dataTag) data = parseData(dataTag[1] || dataTag[0]);

  // Data de pagamento / vencimento — mesmos formatos
  let dataPag = '';
  const dpTag =
        t.match(/(?:Data\s*(?:de\s*)?(?:pagamento|liquida[çc][ãa]o|vencimento)|Venc\.?)[\s:]*?(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i)
     || t.match(/(?:Data\s*(?:de\s*)?(?:pagamento|liquida[çc][ãa]o|vencimento)|Venc\.?)[\s:]*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if(dpTag) dataPag = parseData(dpTag[1]);

  // Número da fatura (FACTURA Nº 261995, FT 2026/123, etc.)
  let numero = '';
  const numTag = t.match(/(?:FACTURA|FATURA|FACT|FAT|FT|FA|FR|FS)\s*N?[ºo°.]?\s*[:.]?\s*([A-Z0-9][\w\-\/]{2,30})/i);
  if(numTag) numero = numTag[1].replace(/[.\s]+$/,'');

  // Fornecedor — heurísticas:
  // 1) linha que contém Lda / S.A. / Unipessoal
  // 2) primeira linha "longa" não numérica antes do NIF
  let fornecedor = '';
  const empresaMatch = t.match(/^[ \t]*([^\n]*?(?:\b(?:Lda\.?|LDA|S\.?\s*A\.?|S\.?A\.?|Unipessoal|SGPS|SARL|& Cia|& C\.?ª|Sociedade)\b)[^\n]*)/im);
  if(empresaMatch) fornecedor = empresaMatch[1].trim().slice(0,80);
  if(!fornecedor){
    const linhas = t.split('\n').map(l=>l.trim()).filter(l=>l.length>=4 && l.length<=80 && !/^\d+[\d.,€\s/-]*$/.test(l));
    fornecedor = (linhas[0]||'').trim();
  }
  fornecedor = fornecedor.replace(/^[•\-\*\s]+/,'').trim();

  // Confiança = proporção dos 5 campos chave detetados, ponderada pela qualidade
  const detetados = [fornecedor, nif, total, iva, data].filter(v=>v!=null && v!=='').length;
  let confianca = detetados/5;
  // Penaliza se NIF inválido ou totais incoerentes
  const _flags = [];
  if(nif && !validaNIF(nif)){ confianca -= 0.15; _flags.push('invalid_nif'); }
  if(!coerenciaTotais(base,iva,total)){ confianca -= 0.10; _flags.push('totals_mismatch'); }
  if(confianca<0) confianca=0; if(confianca>1) confianca=1;
  if(detetados<3) _flags.push('low_extraction');

  return {
    id: ++_fatSeq,
    fornecedor: fornecedor || '',
    nif,
    numero,
    base, iva, total,
    data, dataPag,
    status: confianca<0.80 ? 'rever' : 'extraida',
    confianca,
    ficheiro: item.name,
    paginas: 1,
    notas: detetados<3 ? `Apenas ${detetados}/5 campos detetados — confirme manualmente.` : '',
    criadoEm: new Date().toISOString(),
    _flags,
    _rawText: t.slice(0,4000),
  };
}

function matchValor(texto, patterns){
  for(const p of patterns){
    const m = texto.match(p);
    if(m && m[1]) return m[1];
  }
  return null;
}
function parseEuro(s){
  if(s==null) return null;
  s = String(s).replace(/[€EUR\s]/gi,'').trim();
  if(!s) return null;
  // formatos: 1.234,56 (PT) | 1,234.56 (EN) | 1234,56 | 1234.56
  if(s.includes('.') && s.includes(',')){
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
  } else if(s.includes(',')){
    s = s.replace(',','.');
  }
  const n = parseFloat(s);
  if(isNaN(n)) return null;
  return Math.round(n*100)/100;
}
function parseData(s){
  if(!s) return '';
  s = s.trim();
  // ISO direto
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY.MM.DD ou YYYY/MM/DD ou YYYY-MM-DD (ano primeiro)
  const mYMD = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if(mYMD){
    const [,y,mo,d] = mYMD;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (dia primeiro)
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if(!m) return '';
  let [,d,mo,y] = m;
  if(y.length===2) y = (parseInt(y,10)>50?'19':'20')+y;
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function countCamposDetetados(f){
  return [f.fornecedor, f.nif, f.total, f.iva, f.data].filter(v=>v!=null && v!=='').length;
}

function renderQueue(){
  const wrap = document.getElementById('fat-queue');
  if(!wrap) return;
  if(FAT_QUEUE.length===0){ wrap.innerHTML=''; return; }
  wrap.innerHTML = FAT_QUEUE.map(q=>{
    const iconCls = q.status==='processing'?'processing':(q.status==='done'?'done':(q.status==='error'?'error':''));
    const icon = q.status==='done'
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
      : q.status==='error'
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>';
    const meta = q.status==='processing' ? `A ler com OCR/IA… ${q.progress}%`
              : q.status==='done' ? 'Concluído — dados extraídos'
              : q.status==='error' ? (q.error||'Erro')
              : 'Em fila';
    const sizeKB = (q.size/1024).toFixed(0);
    return `<div class="fat-queue-item">
      <div class="fat-queue-icon ${iconCls}">${icon}</div>
      <div class="fat-queue-info">
        <div class="fat-queue-name">${q.name} <span style="color:var(--gray-400);font-weight:400">· ${sizeKB} KB</span></div>
        <div class="fat-queue-meta">${meta}</div>
        ${q.status==='processing'?`<div class="fat-queue-progress"><div class="fat-queue-bar" style="width:${q.progress}%"></div></div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════
function setupFatDropzone(){
  const dz = document.getElementById('fat-drop');
  if(!dz || dz._wired) return;
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.add('dragging');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.remove('dragging');}));
  dz.addEventListener('drop', e=>{
    const files = e.dataTransfer?.files;
    if(files && files.length) handleFatFiles(files);
  });
  dz._wired = true;
}

// ═══════════════════════════════════════
//  RENDER TABELA + KPIs
// ═══════════════════════════════════════
function filtraFaturas(){
  const q = (document.getElementById('fat-f-search')?.value||'').trim().toLowerCase();
  const st = document.getElementById('fat-f-status')?.value||'';
  const de = document.getElementById('fat-f-de')?.value||'';
  const ate = document.getElementById('fat-f-ate')?.value||'';
  return FATURAS.filter(f=>{
    if(q && !(`${f.fornecedor} ${f.nif}`.toLowerCase().includes(q))) return false;
    if(st && f.status!==st) return false;
    if(de && f.data<de) return false;
    if(ate && f.data>ate) return false;
    return true;
  }).sort((a,b)=> (b.data||'').localeCompare(a.data||''));
}
function limparFatFiltros(){
  ['fat-f-search','fat-f-status','fat-f-de','fat-f-ate'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderFaturas();
}
function renderFaturas(){
  const tb = document.getElementById('fat-tbody');
  if(!tb) return;
  const lista = filtraFaturas();
  if(lista.length===0){
    tb.innerHTML = `<tr><td colspan="10"><div class="fat-empty">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
      <div>Sem faturas. Faça upload do primeiro documento acima.</div>
    </div></td></tr>`;
    atualizaKPIs(); return;
  }
  tb.innerHTML = lista.map(f=>{
    const warn = f._flags && f._flags.length>0;
    const rowCls = warn ? 'fat-row-warn' : '';
    const nifOk = validaNIF(f.nif);
    const nifHTML = nifOk ? f.nif : `<span style="color:var(--red)">${f.nif||'—'}</span>`;
    const totaisOK = coerenciaTotais(f.base,f.iva,f.total);
    const totalHTML = totaisOK ? eur(f.total) : `<span style="color:var(--yellow);" title="Base + IVA não corresponde ao total">${eur(f.total)} ⚠</span>`;
    return `<tr class="${rowCls}">
      <td>${f.data?fmtPT(f.data):'—'}</td>
      <td><strong>${f.fornecedor||'—'}</strong>${f.ficheiro?`<div style="font-size:11px;color:var(--gray-400);margin-top:1px">${f.ficheiro}</div>`:''}</td>
      <td class="fat-nif">${nifHTML}</td>
      <td class="fat-amount">${eur(f.base)}</td>
      <td class="fat-amount">${eur(f.iva)}</td>
      <td class="fat-amount">${totalHTML}</td>
      <td>${f.dataPag?fmtPT(f.dataPag):'<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${statusBadge(f.status)}</td>
      <td>${confBadge(f.confianca||0)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="editarFatura(${f.id})">Editar</button></td>
    </tr>`;
  }).join('');
  atualizaKPIs();
}

function atualizaKPIs(){
  const hoje = new Date();
  const mes = hoje.getMonth()+1, ano = hoje.getFullYear();
  const noMes = FATURAS.filter(f=>{
    if(!f.data) return false;
    const [y,m] = f.data.split('-').map(Number);
    return y===ano && m===mes;
  });
  const sum = (arr,k)=>arr.reduce((s,f)=>s+(Number(f[k])||0),0);
  const elc=document.getElementById('kpi-fat-count'); if(elc) elc.textContent = noMes.length;
  const elcs=document.getElementById('kpi-fat-count-sub'); if(elcs) elcs.textContent = `Total na BD: ${FATURAS.length}`;
  const eln=document.getElementById('kpi-fat-net'); if(eln) eln.textContent = eur(sum(noMes,'base'));
  const eli=document.getElementById('kpi-fat-iva'); if(eli) eli.textContent = eur(sum(noMes,'iva'));
  const aRever = FATURAS.filter(f=>f.status==='rever' || (f._flags&&f._flags.length>0)).length;
  const elr=document.getElementById('kpi-fat-rev'); if(elr) elr.textContent = aRever;
  const nb = document.getElementById('nb-fat'); if(nb) nb.textContent = aRever;
}

// ═══════════════════════════════════════
//  MODAL EDITAR
// ═══════════════════════════════════════
function editarFatura(id){
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  _editFatId = id;
  document.getElementById('mf-id').value = id;
  document.getElementById('mf-forn').value = f.fornecedor||'';
  document.getElementById('mf-nif').value = f.nif||'';
  const elNum = document.getElementById('mf-num'); if(elNum) elNum.value = f.numero||'';
  document.getElementById('mf-data').value = f.data||'';
  document.getElementById('mf-base').value = f.base??'';
  document.getElementById('mf-iva').value = f.iva??'';
  document.getElementById('mf-total').value = f.total??'';
  document.getElementById('mf-pago').value = f.dataPag||'';
  document.getElementById('mf-status').value = f.status||'extraida';
  document.getElementById('mf-notas').value = f.notas||'';
  const elRaw = document.getElementById('mf-rawtext');
  if(elRaw) elRaw.textContent = f._rawText || '(sem texto extraído)';
  validaCamposModal();
  document.getElementById('modal-fat').classList.add('open');
  ['mf-nif','mf-base','mf-iva','mf-total'].forEach(id=>{
    const el=document.getElementById(id);
    if(el && !el._wired){ el.addEventListener('input', validaCamposModal); el._wired=true; }
  });
}
function validaCamposModal(){
  const nif = document.getElementById('mf-nif').value;
  const base = parseFloat(document.getElementById('mf-base').value||0);
  const iva  = parseFloat(document.getElementById('mf-iva').value||0);
  const total= parseFloat(document.getElementById('mf-total').value||0);
  document.getElementById('mf-nif-warn').innerHTML = (nif && !validaNIF(nif))
    ? `<span class="fat-warn-pill"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>NIF inválido</span>` : '';
  document.getElementById('mf-iva-warn').innerHTML = (!coerenciaTotais(base,iva,total))
    ? `<span class="fat-warn-pill"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>Base+IVA ≠ Total</span>` : '';
}
function saveFatura(){
  const id = parseInt(document.getElementById('mf-id').value,10);
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  f.fornecedor = document.getElementById('mf-forn').value.trim();
  f.nif = document.getElementById('mf-nif').value.trim();
  const elNum2 = document.getElementById('mf-num'); if(elNum2) f.numero = elNum2.value.trim();
  f.data = document.getElementById('mf-data').value;
  f.base = parseFloat(document.getElementById('mf-base').value||0);
  f.iva  = parseFloat(document.getElementById('mf-iva').value||0);
  f.total= parseFloat(document.getElementById('mf-total').value||0);
  f.dataPag = document.getElementById('mf-pago').value;
  f.status = document.getElementById('mf-status').value;
  f.notas  = document.getElementById('mf-notas').value;
  // Re-avalia flags
  f._flags = [];
  if(!validaNIF(f.nif)) f._flags.push('invalid_nif');
  if(!coerenciaTotais(f.base,f.iva,f.total)) f._flags.push('totals_mismatch');
  // Edição manual aumenta confiança
  if(f.confianca<0.99) f.confianca = Math.min(0.99, (f.confianca||0.7)+0.15);
  closeModal('modal-fat');
  renderFaturas();
  flashAlert('fat-alert');
  showToast('Fatura atualizada');
}
function apagarFatura(){
  const id = parseInt(document.getElementById('mf-id').value,10);
  if(!confirm('Apagar esta fatura?')) return;
  FATURAS = FATURAS.filter(f=>f.id!==id);
  closeModal('modal-fat');
  renderFaturas();
  showToast('Fatura apagada');
}

// ═══════════════════════════════════════
//  EXPORT EXCEL (usa XLSX já carregado)
// ═══════════════════════════════════════
function exportFaturasXLSX(){
  if(FATURAS.length===0){ showToast('Sem faturas para exportar'); return; }
  const dados = FATURAS.map(f=>({
    'Data emissão': f.data, 'Fornecedor': f.fornecedor, 'NIF': f.nif,
    'Base (€)': f.base, 'IVA (€)': f.iva, 'Total (€)': f.total,
    'Data pagamento': f.dataPag||'', 'Estado': f.status,
    'Confiança (%)': Math.round((f.confianca||0)*100), 'Ficheiro': f.ficheiro||'', 'Notas': f.notas||''
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faturas');
  XLSX.writeFile(wb, `faturas_${fmt(new Date())}.xlsx`);
}

// ═══════════════════════════════════════

export {
  handleFatFiles, renderFaturas, limparFatFiltros, renderQueue,
  editarFatura, saveFatura, apagarFatura, exportFaturasXLSX,
  setupFatDropzone, atualizaKPIs, seedFaturasDemo,
  validaNIF, coerenciaTotais
};

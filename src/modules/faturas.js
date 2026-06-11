// ═══════════════════════════════════════════════════════════════════
//  MÓDULO FATURAS — OCR + extração de campos
// ═══════════════════════════════════════════════════════════════════
import { S, R } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast, flashAlert, closeModal } from './navigation.js';
import { sb } from '../supabase.js';
import { dropboxUpload, dropboxFatPath, dropboxIsConnected, dropboxGetSharedLink, dropboxMoveFile } from './dropbox.js';

let FATURAS = [];
let FAT_QUEUE = [];
let _fatSeq = 0;
let _editFatId = null;

// Memória de aprendizagem por fornecedor (NIF → template de âncoras), carregada do Supabase.
let FAT_TEMPLATES = {};

// Padrão de um valor monetário típico em faturas PT/EN (reutilizado na extração e na aprendizagem).
const NUM_REGEX_STR = '(\\d[\\d\\s.,]{0,15}[.,]\\d{2})';

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
    case 'extraida':           return '<span class="badge b-blue">Extraída</span>';
    case 'pendente_aprovacao': return '<span class="badge b-orange">⏳ Pendente</span>';
    case 'aprovada':           return '<span class="badge b-green">✓ Aprovada</span>';
    case 'rejeitada':          return '<span class="badge b-red">✗ Rejeitada</span>';
    case 'rever':              return '<span class="badge b-yellow">A rever</span>';
    case 'validada':           return '<span class="badge b-green">Validada</span>';
    case 'paga':               return '<span class="badge b-gray">Paga</span>';
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

    item.status='done'; item.progress=100; renderQueue();
    // Abrir anotador visual em vez de adicionar diretamente
    openFatSel(fat, item);
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

// ═══════════════════════════════════════
//  CARREGAMENTO LAZY das bibliotecas OCR (só quando há upload de fatura)
// ═══════════════════════════════════════
let _pdfjsPromise = null, _tessPromise = null;
async function getPdfjs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  if(!_pdfjsPromise) _pdfjsPromise = (async()=>{
    const mod = await import('pdfjs-dist');
    const pdfjs = mod.getDocument ? mod : (mod.default || mod);
    // Worker real via ?worker (independente do motor). Evita que o pdf.js
    // tente carregar/avaliar o script do worker — caminho que, em WebKit
    // (Safari/iOS), cai no "fake worker" em main-thread e rebenta com
    // "Attempted to assign to readonly property".
    try{
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.js?worker')).default;
      pdfjs.GlobalWorkerOptions.workerPort = new WorkerCtor();
    }catch(e){
      try{
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }catch(e2){ console.warn('Worker PDF.js não configurado, a usar fallback:', e2); }
    }
    window.pdfjsLib = pdfjs;
    return pdfjs;
  })();
  return _pdfjsPromise;
}
async function getTesseract(){
  if(window.Tesseract) return window.Tesseract;
  if(!_tessPromise) _tessPromise = (async()=>{
    const mod = await import('tesseract.js');
    window.Tesseract = mod.default || mod;
    return window.Tesseract;
  })();
  return _tessPromise;
}

// Extrai texto direto de um PDF (sem OCR — para PDFs com texto)
async function extractTextFromPDF(item){
  const pdfjsLib = await getPdfjs();
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
  const Tesseract = await getTesseract();
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
  const [pdfjsLib, Tesseract] = await Promise.all([getPdfjs(), getTesseract()]);
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

// Linhas a ignorar na extração do fornecedor: moradas, códigos postais, cabeçalhos comuns.
const _FORN_SKIP = /\b(rua|av\.|avenida|largo|travessa|r\/c|lote|bloco|apartado|nif|nipc|contribuinte|exmo|senhor|para:|a:|att:|subject|email|telef|fax|iban|bic|swift)\b|\d{4}[-\/]\d{3}|\b\d{4}\s\d{3}\b/i;

function extrairFornecedor(t){
  // Estratégia 1: linha com sufixo jurídico (Lda, SA, Unipessoal, etc.)
  const sufixoMatch = t.match(/^[ \t]*([^\n]{4,80}?\b(?:Lda\.?|LDA|S\.?\s*A\.?|Unipessoal|SGPS|SARL|& Cia\.?|Sociedade)\b[^\n]*)/im);
  if(sufixoMatch) return sufixoMatch[1].trim().replace(/^[•\-\*\s]+/,'').slice(0,80);

  // Estratégia 2: linha em MAIÚSCULAS predominantes (nome da empresa tipicamente em caps)
  const linhasUpper = t.split('\n').filter(l=>{
    const c = l.trim();
    if(c.length < 4 || c.length > 80) return false;
    if(_FORN_SKIP.test(c)) return false;
    if(/^\d+[\d.,€\s\-\/]*$/.test(c)) return false;
    const letras = (c.match(/[a-zA-Z]/g)||[]);
    const upper  = (c.match(/[A-Z]/g)||[]);
    return letras.length >= 4 && upper.length / letras.length > 0.65;
  });
  if(linhasUpper.length) return linhasUpper[0].trim().replace(/^[•\-\*\s]+/,'').slice(0,80);

  // Estratégia 3: primeira linha razoável não-endereço, não-numérica
  const linhas = t.split('\n').map(l=>l.trim()).filter(l=>
    l.length >= 4 && l.length <= 80
    && !/^\d+[\d.,€\s\-\/]*$/.test(l)
    && !_FORN_SKIP.test(l)
  );
  return (linhas[0]||'').replace(/^[•\-\*\s]+/,'').trim().slice(0,80);
}

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
  const NUM_REGEX = NUM_REGEX_STR;

  // Total — várias variantes em PT (let: pode ser derivado ou sobreescrito pela memória)
  let total = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:a\\s*pagar|geral|c[\\/\\.]?\\s*IVA|com\\s*IVA|fatura|factura|documento|do\\s*documento)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Valor\\s*(?:total|a\\s*pagar)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Montante\\s*(?:total|a\\s*pagar)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*A\\s*pagar[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*TOTAL[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  // IVA — preferimos "Total IVA" para evitar apanhar células de tabela com 0,00
  let iva = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*IVA[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*IVA(?:\\s*\\(?\\d+\\s*%\\)?)?[^\\d\\n]+?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*Imposto[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  // Base / sub-total — inclui "Total Serviços", "Total Mercadoria", "Total Bruto"
  let base = parseEuro(matchValor(t, [
    new RegExp('^\\s*Total\\s*(?:Servi[çc]os|Mercadoria|Mercadorias|Bruto)[^\\d\\n]*?'+NUM_REGEX, 'im'),
    new RegExp('^\\s*(?:Total\\s*)?(?:Base\\s*tribut[áa]vel|Subtotal|Sub-total|Total\\s*l[íi]quido|Sem\\s*IVA|Valor\\s*l[íi]quido|Incid[êe]ncia)[^\\d\\n]*?'+NUM_REGEX, 'im'),
  ]));
  // Derivar campos em falta a partir dos outros dois
  if(base==null && total!=null && iva!=null) base = Math.round((total-iva)*100)/100;
  if(total==null && base!=null && iva!=null) total = Math.round((base+iva)*100)/100;
  if(iva==null && total!=null && base!=null) iva = Math.round((total-base)*100)/100;

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

  // Número da fatura (FACTURA Nº 261995, FT 2026/123, REC 2024/00045, etc.)
  let numero = '';
  const numTag = t.match(/(?:FACTURA|FATURA|FACT|FAT|FT|FA|FR|FS|REC|VD|NC)\s*N?[ºo°.]?\s*[:.]?\s*([A-Z0-9][\w\-\/]{2,30})/i);
  if(numTag) numero = numTag[1].replace(/[.\s]+$/,'');

  // Fornecedor — 3 estratégias em cascata
  let fornecedor = extrairFornecedor(t);

  // ── Memória de aprendizagem por fornecedor ──
  // Se já vimos este NIF antes, usamos as âncoras aprendidas para preencher com precisão
  // (sobrepõe-se às regex genéricas) e autopreenchemos o nome canónico do fornecedor.
  let _fonte = 'ocr';
  let _exemplos = 0;
  const tpl = nif ? FAT_TEMPLATES[nif] : null;
  if(tpl){
    _fonte = 'memoria';
    _exemplos = tpl.exemplos || 0;
    if(tpl.fornecedor) fornecedor = tpl.fornecedor;
    const ap = aplicarTemplate(t, tpl);
    if(ap.total!=null)  total   = ap.total;
    if(ap.iva!=null)    iva     = ap.iva;
    if(ap.base!=null)   base    = ap.base;
    if(ap.numero)       numero  = ap.numero;
    if(ap.data)         data    = ap.data;
    if(ap.dataPag)      dataPag = ap.dataPag;
    // Re-derivar após aplicação do template
    if(base==null && total!=null && iva!=null) base  = Math.round((total-iva)*100)/100;
    if(total==null && base!=null && iva!=null) total = Math.round((base+iva)*100)/100;
  }

  // Confiança = proporção dos 5 campos chave detetados, ponderada pela qualidade
  const detetados = [fornecedor, nif, total, iva, data].filter(v=>v!=null && v!=='').length;
  let confianca = detetados/5;
  // Penaliza se NIF inválido ou totais incoerentes
  const _flags = [];
  if(nif && !validaNIF(nif)){ confianca -= 0.15; _flags.push('invalid_nif'); }
  if(!coerenciaTotais(base,iva,total)){ confianca -= 0.10; _flags.push('totals_mismatch'); }
  // Vindo da memória de um fornecedor conhecido (com total e NIF válido) → confiança alta
  if(_fonte==='memoria' && total!=null && validaNIF(nif)) confianca = Math.max(confianca, 0.92);
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
    notas: _fonte==='memoria'
      ? `Preenchido da memória do fornecedor (${_exemplos} ${_exemplos===1?'fatura aprendida':'faturas aprendidas'}).`
      : (detetados<3 ? `Apenas ${detetados}/5 campos detetados — confirme manualmente.` : ''),
    criadoEm: new Date().toISOString(),
    _flags,
    _fonte,
    _exemplos,
    _rawText: t,
  };
}

// ═══════════════════════════════════════
//  APRENDIZAGEM POR FORNECEDOR — memória de âncoras por NIF
// ═══════════════════════════════════════
// Remove acentos para comparar etiquetas de forma robusta (NFD → strip diacríticos).
function semAcentos(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g,''); }

// Palavras-chave de etiquetas de fatura — âncoras que as contenham são preferidas.
const ANCHOR_KEYWORDS = /\b(total|iva|base|liquido|fatura|factura|data|vencimento|pagamento|subtotal|valor|emiss|numero|referencia|ref|montante|pagar)\b/;

// Pontua a qualidade de uma âncora: >0 = utilizável, -1 = rejeitar.
function anchorScore(anchor){
  if(!anchor || anchor.length < 3) return -1;
  const letras = (anchor.match(/[a-z]/g)||[]).length;
  const nonSpace = anchor.replace(/\s/g,'').length;
  // Rejeita se menos de 50% dos chars são letras (ruído OCR / números)
  if(nonSpace > 0 && letras / nonSpace < 0.5) return -1;
  let score = anchor.length;
  if(ANCHOR_KEYWORDS.test(anchor)) score += 20;
  return score;
}

// Limpa o prefixo de uma linha para uma âncora estável: minúsculas, sem acentos,
// descarta números/percentagens soltos e fica com as últimas ~4 palavras alfabéticas.
function limpaAnchor(prefixo){
  const p = semAcentos(prefixo).toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
  if(!p) return '';
  const palavras = p.split(' ').filter(Boolean);
  const anchor = palavras.slice(-4).join(' ');
  // Rejeita se não passa o filtro de qualidade
  return anchorScore(anchor) >= 0 ? anchor : '';
}

// Localiza um valor confirmado no texto e devolve a melhor etiqueta que o antecede.
// Recolhe todos os candidatos e escolhe o de maior pontuação (preferência por keywords).
// tipo: 'money' (compara via parseEuro) | 'date' (compara via parseData) | 'text' (substring).
function extrairAnchor(texto, valor, tipo){
  if(valor==null || valor==='') return '';
  const linhas = String(texto).split('\n');
  const numRe = new RegExp(NUM_REGEX_STR, 'g');
  const dateRe = /\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g;
  let bestAnchor = '', bestScore = -1;
  for(const linha of linhas){
    if(tipo==='text'){
      const idx = linha.indexOf(String(valor));
      if(idx>0){ const a = limpaAnchor(linha.slice(0, idx)); const s = anchorScore(a); if(s > bestScore){ bestScore=s; bestAnchor=a; } }
      continue;
    }
    const re = tipo==='date' ? dateRe : numRe;
    const alvoOk = tipo==='date'
      ? (tok)=> parseData(tok) === valor
      : (tok)=>{ const n = parseEuro(tok); return n!=null && Math.abs(n - Number(valor)) < 0.005; };
    re.lastIndex = 0;
    let m;
    while((m = re.exec(linha))){
      if(alvoOk(m[0])){ const a = limpaAnchor(linha.slice(0, m.index)); const s = anchorScore(a); if(s > bestScore){ bestScore=s; bestAnchor=a; } }
    }
  }
  return bestAnchor;
}

// Aplica as âncoras aprendidas de um fornecedor ao texto de uma fatura nova.
// Âncoras de má qualidade (ruído de templates antigos) são ignoradas.
function aplicarTemplate(texto, tpl){
  const out = {};
  const campos = tpl.campos || {};
  const txt = semAcentos(texto);
  for(const campo of Object.keys(campos)){
    const def = campos[campo];
    if(!def || !def.anchor) continue;
    if(anchorScore(def.anchor) < 0) continue; // descarta âncoras de má qualidade
    const anchorRe = def.anchor.split(' ')
      .map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    const valPat = def.tipo==='money' ? NUM_REGEX_STR
      : def.tipo==='date' ? '(\\d{4}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{1,2}|\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})'
      : '([A-Z0-9][\\w\\-\\/]{2,30})';
    const m = txt.match(new RegExp(anchorRe + '[^\\d\\n]*?' + valPat, 'i'));
    if(m && m[1]){
      if(def.tipo==='money')      out[campo] = parseEuro(m[1]);
      else if(def.tipo==='date')  out[campo] = parseData(m[1]);
      else                        out[campo] = String(m[1]).replace(/[.\s]+$/,'');
    }
  }
  return out;
}

// Aprende/atualiza o template de um fornecedor a partir de uma fatura confirmada pelo utilizador.
function aprenderTemplate(f){
  if(!validaNIF(f.nif)) return;
  const texto = f._rawText || '';
  if(texto.length < 20) return;
  const tpl = FAT_TEMPLATES[f.nif] || { nif:f.nif, fornecedor:'', campos:{}, exemplos:0 };
  if(f.fornecedor) tpl.fornecedor = f.fornecedor;
  const campos = tpl.campos || {};
  const aprende = (campo, valor, tipo)=>{ const a = extrairAnchor(texto, valor, tipo); if(a) campos[campo] = {anchor:a, tipo}; };
  aprende('total',   f.total,   'money');
  aprende('iva',     f.iva,     'money');
  aprende('base',    f.base,    'money');
  aprende('numero',  f.numero,  'text');
  aprende('data',    f.data,    'date');
  aprende('dataPag', f.dataPag, 'date');
  tpl.campos = campos;
  tpl.exemplos = (tpl.exemplos||0) + 1;
  FAT_TEMPLATES[f.nif] = tpl;
  sbSaveTemplate(tpl);
}

// Persiste o template no Supabase (upsert por NIF).
async function sbSaveTemplate(tpl){
  try{
    await sb.from('fatura_fornecedores').upsert({
      nif: tpl.nif,
      fornecedor: tpl.fornecedor||null,
      campos: tpl.campos||{},
      exemplos: tpl.exemplos||0,
      atualizado_em: new Date().toISOString()
    }, { onConflict:'nif' });
  } catch(e){ console.warn('Erro ao guardar template de fatura:', e); }
}

// Carrega todos os templates aprendidos para memória (chamado ao entrar na secção Faturas).
async function carregarTemplatesFaturas(){
  try{
    const { data } = await sb.from('fatura_fornecedores').select('*');
    if(data){
      FAT_TEMPLATES = {};
      data.forEach(r=>{ FAT_TEMPLATES[r.nif] = { nif:r.nif, fornecedor:r.fornecedor||'', campos:r.campos||{}, exemplos:r.exemplos||0 }; });
    }
  } catch(e){ console.warn('Erro ao carregar templates de fatura:', e); }
  await carregarFaturas();
}

// ═══════════════════════════════════════
//  PERSISTÊNCIA SUPABASE — tabela faturas
// ═══════════════════════════════════════
function _fatToRow(f){
  return {
    id:           f._dbId || undefined,
    fornecedor:   f.fornecedor || null,
    nif:          f.nif || null,
    numero:       f.numero || null,
    data:         f.data || null,
    data_pag:     f.dataPag || null,
    base:         f.base ?? null,
    iva:          f.iva ?? null,
    total:        f.total ?? null,
    status:       f.status || 'extraida',
    confianca:    f.confianca ?? null,
    ficheiro:     f.ficheiro || null,
    notas:        f.notas || null,
    fonte:        f._fonte || 'ocr',
    flags:        f._flags || [],
    dropbox_path: f.dropboxPath || null,
    centro_custo: f.centroCusto || null,
    ficheiro_url: f.ficheiroUrl || null,
    aprovado_por: f.aprovadoPor || null,
    aprovado_em:  f.aprovadoEm  || null,
    criado_por:   S.currentUser?.username || null,
  };
}

function _rowToFat(r){
  return {
    id:         ++_fatSeq,
    _dbId:      r.id,
    fornecedor: r.fornecedor || '',
    nif:        r.nif || '',
    numero:     r.numero || '',
    data:       r.data || '',
    dataPag:    r.data_pag || '',
    base:       r.base != null ? Number(r.base) : null,
    iva:        r.iva  != null ? Number(r.iva)  : null,
    total:      r.total != null ? Number(r.total) : null,
    status:     r.status || 'extraida',
    confianca:  r.confianca != null ? Number(r.confianca) : 0,
    ficheiro:   r.ficheiro || '',
    notas:      r.notas || '',
    _fonte:     r.fonte || 'ocr',
    _flags:     r.flags || [],
    dropboxPath:  r.dropbox_path || '',
    centroCusto:  r.centro_custo || '',
    ficheiroUrl:  r.ficheiro_url || '',
    aprovadoPor:  r.aprovado_por || '',
    aprovadoEm:   r.aprovado_em  || '',
    criadoEm:     r.criado_em || '',
    _rawText:   '',
  };
}

async function carregarFaturas(){
  try{
    const { data, error } = await sb.from('faturas')
      .select('*').order('criado_em', { ascending: false }).limit(500);
    if(error) throw error;
    if(data){
      FATURAS = data.map(_rowToFat);
      renderFaturas(); atualizaKPIs();
    }
  } catch(e){ console.warn('Erro ao carregar faturas:', e); }
}

async function sbSaveFatura(f){
  try{
    const row = _fatToRow(f);
    if(f._dbId){
      // Atualizar registo existente
      const { error } = await sb.from('faturas').update(row).eq('id', f._dbId);
      if(error) throw error;
    } else {
      // Inserir novo
      const { data, error } = await sb.from('faturas').insert(row).select('id').single();
      if(error) throw error;
      f._dbId = data.id;
    }
  } catch(e){ console.warn('Erro ao guardar fatura:', e); }
}

async function sbDeleteFatura(dbId){
  if(!dbId) return;
  try{
    await sb.from('faturas').delete().eq('id', dbId);
  } catch(e){ console.warn('Erro ao apagar fatura:', e); }
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
  const elSub = document.getElementById('mf-sub');
  if(elSub) elSub.textContent = f._fonte==='memoria'
    ? `Fornecedor reconhecido — preenchido da memória (${f._exemplos||0} ${f._exemplos===1?'fatura':'faturas'}). Corrija se necessário; o sistema reaprende.`
    : 'Fornecedor novo — confirme os campos. Ao guardar, o sistema aprende para as próximas faturas deste fornecedor.';

  // Centro de custo
  const elCC = document.getElementById('mf-centro-custo');
  if(elCC) elCC.textContent = f.centroCusto || '—';

  // PDF preview
  const previewWrap = document.getElementById('mf-pdf-preview');
  if(previewWrap){
    if(f.ficheiroUrl){
      previewWrap.innerHTML = `<a href="${f.ficheiroUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display:inline-flex;gap:6px;align-items:center">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 16h8v2H8v-2zm0-4h8v2H8v-2z"/></svg>
        Ver Fatura (PDF)
      </a>`;
      previewWrap.style.display = 'block';
    } else {
      previewWrap.style.display = 'none';
    }
  }

  // Botões de aprovação — visíveis só para pendente_aprovacao
  const aproBar = document.getElementById('mf-aprovacao-bar');
  if(aproBar){
    const isPending = f.status === 'pendente_aprovacao';
    const canApprove = S.currentUser?.role === 'admin' ||
      S.OBRAS.find(o=>o.nome===f.centroCusto)?.encarregado_id === S.currentUser?.key;
    aproBar.style.display = (isPending && canApprove) ? 'flex' : 'none';
  }

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
  // Aprende com a confirmação do utilizador — memória do fornecedor por NIF
  aprenderTemplate(f);
  sbSaveFatura(f);
  closeModal('modal-fat');
  renderFaturas();
  flashAlert('fat-alert');
  showToast(validaNIF(f.nif) ? 'Fatura atualizada — memória do fornecedor atualizada' : 'Fatura atualizada');
  R.emitEvent?.({ acao:'Fatura atualizada: '+(f.fornecedor||'')+(f.total?' · '+f.total+'€':''), seccao:'faturas' });
}
function apagarFatura(){
  const id = parseInt(document.getElementById('mf-id').value,10);
  if(!confirm('Apagar esta fatura?')) return;
  const fat = FATURAS.find(f=>f.id===id);
  if(fat) sbDeleteFatura(fat._dbId);
  FATURAS = FATURAS.filter(f=>f.id!==id);
  closeModal('modal-fat');
  renderFaturas();
  showToast('Fatura apagada');
}

// ═══════════════════════════════════════
//  WORKFLOW DE APROVAÇÃO
// ═══════════════════════════════════════
async function aprovarFatura(){
  const id = parseInt(document.getElementById('mf-id').value, 10);
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  if(!confirm(`Aprovar fatura de ${f.fornecedor||'fornecedor'}${f.total?' · '+f.total+'€':''}?`)) return;

  f.status     = 'aprovada';
  f.aprovadoPor = S.currentUser?.nome || S.currentUser?.key || 'admin';
  f.aprovadoEm  = new Date().toISOString();

  // Mover ficheiro no Dropbox para pasta de aprovadas
  if(dropboxIsConnected() && f.dropboxPath){
    try{
      const novoPath = dropboxFatPath(f, f.ficheiro || (f.dropboxPath.split('/').pop()), true);
      const movedPath = await dropboxMoveFile(f.dropboxPath, novoPath);
      f.dropboxPath = movedPath || novoPath;
      const sharedUrl = await dropboxGetSharedLink(f.dropboxPath);
      if(sharedUrl) f.ficheiroUrl = sharedUrl;
    } catch(e){ console.warn('Dropbox move erro:', e); }
  }

  await sbSaveFatura(f);
  renderFaturas(); atualizaKPIs();
  closeModal('modal-fat');
  showToast(`Fatura aprovada${f.centroCusto?' — enviada para '+f.centroCusto:''}`);
  R.emitEvent?.({ acao:`Fatura aprovada: ${f.fornecedor||''}${f.total?' · '+f.total+'€':''} (${f.centroCusto||''})`, seccao:'faturas' });
}

async function rejeitarFatura(){
  const id = parseInt(document.getElementById('mf-id').value, 10);
  const f = FATURAS.find(x=>x.id===id); if(!f) return;
  const motivo = prompt('Motivo da rejeição (opcional):') ?? '';
  if(motivo === null) return;
  f.status = 'rejeitada';
  f.notas  = motivo ? `[Rejeitada] ${motivo}` : '[Rejeitada]';
  await sbSaveFatura(f);
  renderFaturas(); atualizaKPIs();
  closeModal('modal-fat');
  showToast('Fatura rejeitada');
  R.emitEvent?.({ acao:`Fatura rejeitada: ${f.fornecedor||''} (${f.centroCusto||''})`, seccao:'faturas' });
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
//  ANOTADOR VISUAL DE FATURAS
// ═══════════════════════════════════════
let _fssItem   = null;
let _fssFat    = null;
let _fssActive = null; // campo ativo (chave do campo)

const FSS_CAMPOS = [
  { key:'fornecedor',   label:'Fornecedor',       tipo:'text'  },
  { key:'nif',          label:'NIF',              tipo:'text'  },
  { key:'numero',       label:'Nº Fatura',        tipo:'text'  },
  { key:'data',         label:'Data emissão',     tipo:'date'  },
  { key:'base',         label:'Base s/IVA',       tipo:'money' },
  { key:'iva',          label:'IVA',              tipo:'money' },
  { key:'total',        label:'Total',            tipo:'money' },
  { key:'dataPag',      label:'Dt. pagamento',    tipo:'date'  },
  { key:'centroCusto',  label:'Centro de Custo',  tipo:'obra'  },
];

function openFatSel(fat, item){
  _fssFat    = { ...fat };
  _fssItem   = item;
  _fssActive = null;

  const el = document.getElementById('fss-filename');
  if(el) el.textContent = item.name;

  const badge = document.getElementById('fss-source-badge');
  if(badge) badge.textContent = fat._fonte === 'memoria'
    ? `✓ Fornecedor reconhecido (${fat._exemplos} fatura${fat._exemplos===1?'':'s'} aprendida${fat._exemplos===1?'':'s'})`
    : 'Fornecedor novo — confirme os campos para ensinar';

  const note = document.getElementById('fss-learn-note');
  if(note) note.textContent = fat._fonte === 'memoria'
    ? 'Verifique os valores. Ao guardar, a memória deste fornecedor é reforçada.'
    : 'Clique num campo, depois clique no texto da fatura. Ao guardar, o agente aprende este layout.';

  fssRenderFields();
  renderFatSelPages(item);
  fssSetActive('fornecedor');

  const modal = document.getElementById('modal-fat-sel');
  if(modal) modal.style.display = 'flex';
}

function fssClose(){
  const modal = document.getElementById('modal-fat-sel');
  if(modal) modal.style.display = 'none';
  // Remover o item da queue
  if(_fssItem) { FAT_QUEUE = FAT_QUEUE.filter(q=>q.id!==_fssItem.id); renderQueue(); }
  _fssItem = null; _fssFat = null; _fssActive = null;
}

function fssSetActive(campo){
  _fssActive = campo;
  document.querySelectorAll('.fss-field-row').forEach(r=>{
    r.classList.toggle('active', r.dataset.campo === campo);
  });
  const def = FSS_CAMPOS.find(f=>f.key===campo);
  const hint = document.getElementById('fss-hint');
  if(hint && def) hint.textContent = `Clique no texto da fatura para preencher "${def.label}"`;
}

function fssTextClick(text, span){
  if(!_fssActive || !_fssFat || !text.trim()) return;

  // Remove seleção anterior para este campo
  document.querySelectorAll(`.fss-span[data-campo="${_fssActive}"]`).forEach(s=>{
    s.classList.remove('fss-selected'); s.removeAttribute('data-campo');
  });
  span.classList.add('fss-selected');
  span.dataset.campo = _fssActive;

  // Parse valor conforme tipo do campo
  const def = FSS_CAMPOS.find(f=>f.key===_fssActive);
  let val = text.trim();
  if(def?.tipo==='money'){
    const n = parseEuro(val);
    if(n!=null) val = n; else val = text.trim();
  } else if(def?.tipo==='date'){
    const d = parseData(val); if(d) val = d;
  }
  _fssFat[_fssActive] = val;

  const input = document.getElementById(`fss-input-${_fssActive}`);
  if(input){ input.value = val!=null ? String(val) : ''; input.closest('.fss-field-row')?.classList.add('has-val'); }

  // Avançar para o próximo campo automaticamente
  const idx = FSS_CAMPOS.findIndex(f=>f.key===_fssActive);
  if(idx>=0 && idx<FSS_CAMPOS.length-1) fssSetActive(FSS_CAMPOS[idx+1].key);
}

function fssRenderFields(){
  const wrap = document.getElementById('fss-fields');
  if(!wrap||!_fssFat) return;
  wrap.innerHTML = FSS_CAMPOS.map(f=>{
    const val = _fssFat[f.key];
    const display = (val!=null && val!=='') ? String(val) : '';

    if(f.tipo === 'obra'){
      const opts = ['<option value="">— Selecionar obra —</option>',
        ...S.OBRAS.filter(o=>o.ativa).map(o=>{
          const sel = display===o.nome ? ' selected' : '';
          return `<option value="${o.nome.replace(/"/g,'&quot;')}"${sel}>${o.nome}</option>`;
        })
      ].join('');
      return `<div class="fss-field-row${display?' has-val':''}" data-campo="${f.key}" onclick="fssSetActive('${f.key}')">
        <div class="fss-field-label"><span class="fss-field-dot"></span>${f.label}</div>
        <select id="fss-input-${f.key}" class="fss-field-input fss-field-select"
          onchange="_fssFatInputChange('${f.key}',this.value)"
          onclick="event.stopPropagation();fssSetActive('${f.key}')">${opts}</select>
      </div>`;
    }

    return `<div class="fss-field-row${display?' has-val':''}" data-campo="${f.key}" onclick="fssSetActive('${f.key}')">
      <div class="fss-field-label"><span class="fss-field-dot"></span>${f.label}</div>
      <input id="fss-input-${f.key}" class="fss-field-input"
        value="${display.replace(/"/g,'&quot;')}"
        placeholder="${f.tipo==='money'?'0,00':f.tipo==='date'?'aaaa-mm-dd':'—'}"
        oninput="_fssFatInputChange('${f.key}',this.value)"
        onclick="event.stopPropagation();fssSetActive('${f.key}')"/>
    </div>`;
  }).join('');
}

function _fssFatInputChange(campo, value){
  if(!_fssFat) return;
  _fssFat[campo] = value;
  const row = document.querySelector(`.fss-field-row[data-campo="${campo}"]`);
  if(row) row.classList.toggle('has-val', !!value.trim());
}

async function fssSave(){
  if(!_fssFat) return;

  // Sincronizar todos os inputs para _fssFat
  FSS_CAMPOS.forEach(f=>{
    const input = document.getElementById(`fss-input-${f.key}`);
    if(!input) return;
    const v = input.value.trim();
    if(f.tipo==='money'){
      const n = parseEuro(v);
      _fssFat[f.key] = n!=null ? n : (v ? parseFloat(v.replace(',','.')) || null : null);
    } else {
      _fssFat[f.key] = v || (f.tipo==='date' ? '' : '');
    }
  });

  // Derivar campos em falta
  const {base, iva, total} = _fssFat;
  if(base==null && total!=null && iva!=null) _fssFat.base  = Math.round((total-iva)*100)/100;
  if(total==null && base!=null && iva!=null) _fssFat.total = Math.round((base+iva)*100)/100;
  if(iva==null && total!=null && base!=null) _fssFat.iva   = Math.round((total-base)*100)/100;

  // Re-avaliar flags e confiança
  _fssFat._flags = [];
  if(!validaNIF(_fssFat.nif)) _fssFat._flags.push('invalid_nif');
  if(!coerenciaTotais(_fssFat.base, _fssFat.iva, _fssFat.total)) _fssFat._flags.push('totals_mismatch');
  _fssFat.status = (_fssFat._flags.length===0) ? 'extraida' : 'rever';
  const det = countCamposDetetados(_fssFat);
  _fssFat.confianca = Math.min(0.99, 0.55 + (det/5)*0.45);
  // Confirmação manual → confiança alta
  if(det>=4 && _fssFat._flags.length===0) _fssFat.confianca = 0.97;

  // Aprender com a confirmação
  aprenderTemplate(_fssFat);

  // Se tem centro de custo → entra no fluxo de aprovação
  if(_fssFat.centroCusto) _fssFat.status = 'pendente_aprovacao';

  // Adicionar à lista, persistir e fechar
  FATURAS.push(_fssFat);
  renderFaturas(); atualizaKPIs();
  await sbSaveFatura(_fssFat);

  // Upload Dropbox (se ligado e ficheiro disponível)
  if(dropboxIsConnected() && _fssItem?._file){
    try{
      const path = dropboxFatPath(_fssFat, _fssItem.name, false);
      const dbxPath = await dropboxUpload(_fssItem._file, path);
      _fssFat.dropboxPath = dbxPath;
      // Gerar link partilhado para pré-visualização no portal
      const sharedUrl = await dropboxGetSharedLink(dbxPath);
      if(sharedUrl) _fssFat.ficheiroUrl = sharedUrl;
      await sbSaveFatura(_fssFat);
    } catch(e){
      console.error('Dropbox upload erro:', e);
    }
  }

  // Notificação
  if(_fssFat.centroCusto){
    const obra = S.OBRAS.find(o=>o.nome===_fssFat.centroCusto);
    const encUsername = obra?.encarregado_id;
    const msg = `Fatura pendente de aprovação: ${_fssFat.fornecedor||''}${_fssFat.total?' · '+_fssFat.total+'€':''} (${_fssFat.centroCusto})`;
    R.emitEvent?.({ acao: msg, seccao:'faturas' });
    // Notificação direta ao diretor de obra
    if(encUsername && encUsername !== S.currentUser?.key){
      try{
        await sb.from('notificacoes').insert({
          actor: S.currentUser?.key||null,
          actor_nome: S.currentUser?.nome||'Sistema',
          acao: msg, seccao:'faturas', destinatario: encUsername
        });
      } catch(e){ console.warn('Notif encarregado:', e); }
    }
    showToast(`Fatura enviada para aprovação — ${_fssFat.centroCusto}`);
  } else {
    R.emitEvent?.({ acao:'Fatura inserida: '+(_fssFat.fornecedor||'')+(_fssFat.total?' · '+_fssFat.total+'€':''), seccao:'faturas' });
    showToast(validaNIF(_fssFat.nif) ? `${_fssItem?.name||'Fatura'}: guardada e fornecedor memorizado` : `${_fssItem?.name||'Fatura'}: guardada`);
  }

  fssClose();
}

async function renderFatSelPages(item){
  const container = document.getElementById('fss-pages');
  if(!container) return;
  container.innerHTML = '<div style="padding:30px;color:#999;font-size:13px;text-align:center">A renderizar fatura…</div>';

  try{
    const isPDF = /\.pdf$/i.test(item.name)||item._file.type==='application/pdf';
    const isImg = /\.(jpe?g|png)$/i.test(item.name);
    container.innerHTML = '';

    if(isPDF){
      const pdfjsLib = await getPdfjs();
      const buf = await item._file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:buf}).promise;

      for(let p=1;p<=pdf.numPages;p++){
        const page = await pdf.getPage(p);
        const scale = 1.5;
        const vp = page.getViewport({scale});

        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise;

        // Overlay de texto clicável
        const layer = document.createElement('div');
        layer.className = 'fss-text-layer';

        const tc = await page.getTextContent();
        tc.items.forEach(ti=>{
          if(!ti.str.trim()) return;
          const [,,,d,e,f] = ti.transform;
          const x  = e * scale;
          const y  = vp.height - f * scale;
          const fh = Math.max(8, Math.abs(d)*scale);

          const span = document.createElement('span');
          span.className = 'fss-span';
          span.textContent = ti.str;
          span.title = ti.str.trim();
          span.style.cssText = `left:${x}px;top:${y-fh}px;font-size:${fh}px;`;
          span.addEventListener('click', ()=>fssTextClick(ti.str.trim(), span));
          layer.appendChild(span);
        });

        const wrap = document.createElement('div');
        wrap.className = 'fss-page-wrap';
        wrap.appendChild(canvas); wrap.appendChild(layer);
        container.appendChild(wrap);

        if(p<pdf.numPages){
          const sep=document.createElement('div');
          sep.className='fss-page-sep';
          sep.textContent=`— Página ${p+1} —`;
          container.appendChild(sep);
        }
      }
    } else if(isImg){
      const url = URL.createObjectURL(item._file);
      const img = document.createElement('img');
      img.src=url; img.style.cssText='max-width:100%;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.18)';
      img.onload=()=>URL.revokeObjectURL(url);
      container.appendChild(img);
      const msg=document.createElement('div');
      msg.style.cssText='padding:12px;color:#999;font-size:12px;text-align:center;';
      msg.textContent='Imagem: preencha os campos manualmente no painel à direita.';
      container.appendChild(msg);
    }
  } catch(e){
    container.innerHTML=`<div style="padding:20px;color:var(--red);font-size:13px">Erro ao renderizar: ${e.message}</div>`;
  }
}

export {
  handleFatFiles, renderFaturas, limparFatFiltros, renderQueue,
  editarFatura, saveFatura, apagarFatura, exportFaturasXLSX,
  setupFatDropzone, atualizaKPIs, seedFaturasDemo,
  carregarTemplatesFaturas, carregarFaturas,
  validaNIF, coerenciaTotais,
  openFatSel, fssClose, fssSetActive, fssTextClick, fssSave,
  _fssFatInputChange,
  aprovarFatura, rejeitarFatura,
};

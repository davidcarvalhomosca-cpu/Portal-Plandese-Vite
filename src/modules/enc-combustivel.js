// ════════════════════════════════════════════════
//  COMBUSTÍVEL — Encarregado (depósito + viatura + chat)
// ════════════════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { fmt, fmtPT } from '../utils/helpers.js';
import { showToast } from './navigation.js';

let _depMovimento = 'entrada';
let _combHtml5Qr = null;
let _combQrEquipId = null;
let _combModoManual = false;
let _chat = {
  step: 'material',
  artigos: [],
  prazo: null,
  obraId: null,
  obraNome: null,
};

function encGoCombustivel(){
  _encHideAll();
  stopCombQrScanner();
  const s=document.getElementById('enc-screen-combustivel');
  s.style.display='flex'; s.style.flexDirection='column';
}

// ── Depósito de Obra ────────────────────────────

function depSetMovimento(tipo){
  _depMovimento = tipo;
  const btnE=document.getElementById('dep-btn-entrada');
  const btnS=document.getElementById('dep-btn-saida');
  if(tipo==='entrada'){
    btnE.style.background='#22c55e'; btnE.style.borderColor='#22c55e'; btnE.style.color='white';
    btnE.style.boxShadow='0 0 0 4px rgba(34,197,94,.3),0 4px 12px rgba(34,197,94,.4)'; btnE.style.transform='scale(1.02)';
    btnS.style.background='#f3f4f6'; btnS.style.borderColor='#d1d5db'; btnS.style.color='#6b7280';
    btnS.style.boxShadow='none'; btnS.style.transform='scale(1)';
  } else {
    btnS.style.background='#ef4444'; btnS.style.borderColor='#ef4444'; btnS.style.color='white';
    btnS.style.boxShadow='0 0 0 4px rgba(239,68,68,.3),0 4px 12px rgba(239,68,68,.4)'; btnS.style.transform='scale(1.02)';
    btnE.style.background='#f3f4f6'; btnE.style.borderColor='#d1d5db'; btnE.style.color='#6b7280';
    btnE.style.boxShadow='none'; btnE.style.transform='scale(1)';
  }
}

function encGoCombDeposito(){
  _encHideAll();
  const s=document.getElementById('enc-screen-comb-deposito');
  s.style.display='flex'; s.style.flexDirection='column';
  document.getElementById('dep-data').value=fmt(new Date());
  const os=document.getElementById('dep-obra');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  document.getElementById('dep-litros').value='';
  document.getElementById('dep-obs').value='';
  document.getElementById('dep-tipo').value='Gasóleo';
  document.getElementById('dep-alert').style.display='none';
  _depMovimento='entrada';
  depSetMovimento('entrada');
}

async function encSubmeterCombDeposito(){
  const data=document.getElementById('dep-data').value;
  const obraEl=document.getElementById('dep-obra');
  const obraId=obraEl.value;
  const obraNome=obraEl.options[obraEl.selectedIndex]?.text||'';
  const litros=parseFloat(document.getElementById('dep-litros').value)||null;
  const tipo=document.getElementById('dep-tipo').value;
  const obs=document.getElementById('dep-obs').value.trim()||null;
  if(!data){showToast('Selecione a data');return;}
  if(!obraId){showToast('Selecione a obra do depósito');return;}
  if(!litros||litros<=0){showToast('Indique a quantidade de litros');return;}
  const btn=document.getElementById('dep-submit-btn');
  if(btn){btn.disabled=true;}
  try{
    const {error}=await sb.from('registos_combustivel').insert({
      data,
      equipamento_id:null,
      equipamento_nome:'Depósito de Obra',
      obra_id:obraId,
      obra_nome:obraNome,
      litros,
      tipo_combustivel:tipo,
      tipo_registo:'deposito',
      movimento:_depMovimento,
      encarregado_nome:S.currentUser?.nome||'',
      obs
    });
    if(error)throw error;
    document.getElementById('dep-alert').style.display='block';
    showToast((_depMovimento==='entrada'?'Entrada':'Saída')+' no depósito registada ✓');
    setTimeout(()=>{
      document.getElementById('dep-litros').value='';
      document.getElementById('dep-obs').value='';
      document.getElementById('dep-obra').value='';
      document.getElementById('dep-alert').style.display='none';
      if(btn){btn.disabled=false;}
    },1800);
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    if(btn){btn.disabled=false;}
  }
}

// ── Viaturas / Equipamentos — QR + Manual ───────

function _combViaturaShowState(state){
  document.getElementById('comb-viatura-state-scanner').style.display = state==='scanner'?'':'none';
  const fEl=document.getElementById('comb-viatura-state-form');
  fEl.style.display = state==='form'?'flex':'none';
  if(state==='form') fEl.style.flexDirection='column';
  const sEl=document.getElementById('comb-viatura-state-success');
  sEl.style.display = state==='success'?'flex':'none';
  if(state==='success') sEl.style.flexDirection='column';
}

async function encGoCombViatura(){
  _encHideAll();
  const s=document.getElementById('enc-screen-comb-viatura');
  s.style.display='flex'; s.style.flexDirection='column';
  _combQrEquipId=null; _combModoManual=false;
  _combViaturaShowState('scanner');
  document.getElementById('comb-qr-reader').innerHTML='';
  setTimeout(()=>startCombQrScanner(), 350);
}

function startCombQrScanner(){
  const readerEl=document.getElementById('comb-qr-reader');
  if(!readerEl) return;
  if(typeof Html5Qrcode==='undefined'){
    readerEl.innerHTML=`<div style="padding:28px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.6">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;display:block;margin:0 auto 10px;opacity:.7"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M20 5h-6v6h6V5z"/></svg>
      Leitor QR não disponível.</div>`; return;
  }
  if(_combHtml5Qr){try{_combHtml5Qr.stop();}catch(e){} _combHtml5Qr=null;}
  _combHtml5Qr=new Html5Qrcode('comb-qr-reader');
  _combHtml5Qr.start(
    {facingMode:'environment'},
    {fps:10, qrbox:{width:220,height:220}, aspectRatio:1.0},
    (decoded)=>{onCombQrScanned(decoded);},
    ()=>{}
  ).catch(err=>{
    console.warn('Comb QR scanner:',err);
    readerEl.innerHTML=`<div style="padding:24px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:32px;height:32px;display:block;margin:0 auto 10px;opacity:.7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      Câmara não acessível.<br>
      <span style="font-size:11px;opacity:.8">Utilize o botão abaixo para registo manual.</span>
    </div>`;
  });
}

function stopCombQrScanner(){
  if(_combHtml5Qr){try{_combHtml5Qr.stop();}catch(e){} _combHtml5Qr=null;}
}

async function onCombQrScanned(text){
  stopCombQrScanner();
  let equipId=null;
  try{const u=new URL(text); equipId=u.searchParams.get('reg');}catch(e){}
  if(!equipId && /^EQ[A-Z0-9]+$/.test(text)) equipId=text;
  if(!equipId){
    showToast('QR code não reconhecido como equipamento Plandese');
    setTimeout(()=>startCombQrScanner(), 2500);
    return;
  }
  _combQrEquipId=equipId; _combModoManual=false;
  let eq=EQUIPAMENTOS.find(e=>e.id===equipId);
  if(!eq){
    document.getElementById('comb-viatura-nome').textContent='A carregar…';
    document.getElementById('comb-viatura-cat').textContent='';
    _combViaturaShowState('form');
    eq=await sbFetchEquipamentoById(equipId).catch(()=>null);
    if(eq){EQUIPAMENTOS.push(eq); saveEqLocal();}
  } else {
    _combViaturaShowState('form');
  }
  document.getElementById('comb-viatura-info-box').style.display='flex';
  document.getElementById('comb-viatura-nome-field').style.display='none';
  document.getElementById('comb-viatura-scan-btn').style.display='inline-flex';
  document.getElementById('comb-viatura-nome').textContent=eq?eq.nome:`Equipamento ${equipId}`;
  document.getElementById('comb-viatura-cat').textContent=eq?(EQ_CATS[eq.categoria]?.label||'Equipamento'):'Equipamento';
  _combPreencherFormViatura();
}

function combViaturaManual(){
  stopCombQrScanner();
  _combQrEquipId=null; _combModoManual=true;
  _combViaturaShowState('form');
  document.getElementById('comb-viatura-info-box').style.display='none';
  document.getElementById('comb-viatura-nome-field').style.display='block';
  document.getElementById('comb-viatura-scan-btn').style.display='inline-flex';
  document.getElementById('comb-viatura-nome-input').value='';
  _combPreencherFormViatura();
}

function _combPreencherFormViatura(){
  document.getElementById('comb-viatura-data').value=fmt(new Date());
  const os=document.getElementById('comb-viatura-obra');
  os.innerHTML='<option value="">— Selecione uma obra —</option>';
  S.OBRAS.filter(o=>o.ativa).forEach(o=>{const op=document.createElement('option');op.value=o.id;op.textContent=o.nome;os.appendChild(op);});
  document.getElementById('comb-viatura-litros').value='';
  document.getElementById('comb-viatura-fornecedor').value='';
  document.getElementById('comb-viatura-obs').value='';
  document.getElementById('comb-viatura-tipo').value='Gasóleo';
  document.getElementById('comb-viatura-alert').style.display='none';
}

function combViaturaVoltarScanner(){
  _combQrEquipId=null; _combModoManual=false;
  document.getElementById('comb-qr-reader').innerHTML='';
  _combViaturaShowState('scanner');
  setTimeout(()=>startCombQrScanner(), 350);
}

async function encSubmeterCombViatura(){
  const data=document.getElementById('comb-viatura-data').value;
  const obraEl=document.getElementById('comb-viatura-obra');
  const obraId=obraEl.value;
  const obraNome=obraEl.options[obraEl.selectedIndex]?.text||'';
  const litros=parseFloat(document.getElementById('comb-viatura-litros').value)||null;
  const tipo=document.getElementById('comb-viatura-tipo').value;
  const fornecedor=document.getElementById('comb-viatura-fornecedor').value.trim()||null;
  const obs=document.getElementById('comb-viatura-obs').value.trim()||null;
  // Nome do equipamento
  let equipId=_combQrEquipId||null;
  let equipNome='';
  if(_combModoManual){
    equipNome=document.getElementById('comb-viatura-nome-input').value.trim();
    if(!equipNome){showToast('Indique o nome da viatura ou equipamento');return;}
  } else {
    const eq=EQUIPAMENTOS.find(e=>e.id===equipId);
    equipNome=eq?eq.nome:(equipId||'');
  }
  if(!data){showToast('Selecione a data');return;}
  if(!litros||litros<=0){showToast('Indique a quantidade de litros');return;}
  const btn=document.getElementById('comb-viatura-submit-btn');
  if(btn){btn.disabled=true;}
  try{
    const {error}=await sb.from('registos_combustivel').insert({
      data,
      equipamento_id:equipId,
      equipamento_nome:equipNome,
      obra_id:obraId||null,
      obra_nome:obraId?obraNome:null,
      litros,
      tipo_combustivel:tipo,
      tipo_registo:'viatura',
      movimento:'saida',
      fornecedor,
      encarregado_nome:S.currentUser?.nome||'',
      obs
    });
    if(error)throw error;
    showToast('Abastecimento registado ✓');
    const encNome=S.currentUser?.nome||'Encarregado';
    document.getElementById('comb-viatura-success-txt').innerHTML=
      `<strong>${encNome}</strong> registou<br>`+
      `<strong>${litros}L de ${tipo}</strong><br>`+
      `em <strong>${equipNome}</strong>`+
      (obraId?`<br>Obra: <strong>${obraNome}</strong>`:'')+
      `<br><span style="font-size:11px;opacity:.65;display:block;margin-top:6px">${eqFmtDt(new Date())}</span>`;
    _combViaturaShowState('success');
    if(btn){btn.disabled=false;}
  }catch(e){
    showToast('Erro ao guardar: '+(e.message||e));
    if(btn){btn.disabled=false;}
  }
}

// Manter compatibilidade com referências antigas ao encSubmeterCombustivel
function encSubmeterCombustivel(){ encSubmeterCombViatura(); }

// ════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  ASSISTENTE DE COMPRAS — CHAT INTELIGENTE
// ═══════════════════════════════════════════════════════════

// Abrir o ecrã do chat
function encGoComprasChat() {
  _encHideAll();
  const el = document.getElementById('enc-screen-compras-chat');
  if (el) { el.style.display = 'flex'; el.style.flexDirection = 'column'; }
  _chatReset();
  _chatWelcome();
}

// Reset total do estado
function _chatReset() {
  _chat = { step: 'material', artigos: [], currentMaterial: null, prazo: null, obraId: null, obraNome: null };
  const msgs = document.getElementById('chat-msgs');
  if (msgs) msgs.innerHTML = '';
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) { inp.value = ''; inp.disabled = false; }
}

// ── Mensagens ─────────────────────────────────────────────────
function _chatAddBot(text, delay = 0) {
  return new Promise(resolve => {
    const msgs = document.getElementById('chat-msgs');
    if (!msgs) return resolve();

    // Mostrar indicador "a escrever..."
    const typingRow = document.createElement('div');
    typingRow.className = 'chat-bubble-row bot';
    typingRow.innerHTML = '<div class="chat-bubble bot"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
    msgs.appendChild(typingRow);
    msgs.scrollTop = msgs.scrollHeight;

    setTimeout(() => {
      typingRow.remove();
      const row = document.createElement('div');
      row.className = 'chat-bubble-row bot';
      row.innerHTML = `<div class="chat-bubble bot">${text}</div>
        <div class="chat-time">${_chatTime()}</div>`;
      msgs.appendChild(row);
      msgs.scrollTop = msgs.scrollHeight;
      resolve();
    }, delay || 700);
  });
}

function _chatAddUser(text) {
  const msgs = document.getElementById('chat-msgs');
  if (!msgs) return;
  const row = document.createElement('div');
  row.className = 'chat-bubble-row user';
  row.innerHTML = `<div class="chat-bubble user">${_esc(text)}</div>
    <div class="chat-time">${_chatTime()}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function _chatTime() {
  return new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function _esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Sugestões / Chips ─────────────────────────────────────────
function _chatClearSuggestions() {
  const s = document.getElementById('chat-suggestions');
  if (s) s.innerHTML = '';
}

function _chatShowChips(chips) {
  // chips: [{label, value, cls}]
  const s = document.getElementById('chat-suggestions');
  if (!s) return;
  s.innerHTML = '';
  chips.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chat-chip ' + (c.cls || '');
    btn.textContent = c.label;
    btn.onclick = () => c.onclick();
    s.appendChild(btn);
  });
}

// ── Pesquisa de materiais no catálogo ─────────────────────────
function _chatSearchMateriais(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const results = [];
  if (typeof ARTIGOS_CATALOGO === 'undefined') return results;
  for (const cat of Object.values(ARTIGOS_CATALOGO)) {
    for (const item of (cat.items || [])) {
      const nome = (item[1] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (nome.includes(q)) {
        results.push({ ref: item[0], nome: item[1], unidade: item[2] || 'un' });
        if (results.length >= 8) return results;
      }
    }
  }
  return results;
}

// ── Fluxo da conversa ─────────────────────────────────────────

async function _chatWelcome() {
  const nome = S.currentUser?.nome?.split(' ')[0] || 'Encarregado';
  const inp = document.getElementById('chat-input');
  if (inp) inp.disabled = true;
  await _chatAddBot(`Olá <strong>${nome}</strong>! 👷 Vou ajudar-te a criar um pedido de compras.<br>O que necessitas?`, 400);
  if (inp) inp.disabled = false;
  _chat.step = 'material';
  _chatSetPlaceholder('Escreve o material (ex: cimento, varão...)');
}

function chatOnInput(val) {
  if (_chat.step !== 'material' && _chat.step !== 'quantidade') return;
  if (_chat.step === 'material') {
    const results = _chatSearchMateriais(val);
    if (results.length > 0) {
      _chatShowChips(results.map(r => ({
        label: r.nome.length > 42 ? r.nome.substring(0, 42) + '…' : r.nome,
        onclick: () => _chatSelectMaterial(r),
      })));
    } else {
      _chatClearSuggestions();
    }
  }
}

function _chatSelectMaterial(mat) {
  _chat.currentMaterial = mat;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  _chatAddUser(mat.nome);
  _chatAskQuantidade();
}

async function _chatAskQuantidade() {
  _chat.step = 'quantidade';
  await _chatAddBot('Qual a quantidade?');
  _chatSetPlaceholder('Ex: 50 sacos, 10 un, 200 kg...');
  // Chips de quantidade rápida
  const uni = _chat.currentMaterial?.unidade || 'un';
  const quickQtds = ['1', '5', '10', '20', '50', '100'].map(n => ({
    label: `${n} ${uni}`,
    onclick: () => { _chatAddUser(`${n} ${uni}`); _chatConfirmArtigo(`${n} ${uni}`); }
  }));
  _chatShowChips(quickQtds);
}

function _chatConfirmArtigo(qtdTxt) {
  const artigo = {
    ref: (_chat.currentMaterial && _chat.currentMaterial.ref) || '',
    nome: (_chat.currentMaterial && _chat.currentMaterial.nome) || '',
    unidade: (_chat.currentMaterial && _chat.currentMaterial.unidade) || 'un',
    quantidade: qtdTxt,
  };
  _chat.artigos.push(artigo);
  _chat.currentMaterial = null;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  // Vai directamente para o prazo — mais rápido e intuitivo
  _chatAskPrazoComResumo();
}

async function _chatAskPrazoComResumo() {
  _chat.step = 'prazo';
  const listaHtml = _chat.artigos.map(function(a) {
    return '• <strong>' + _esc(a.nome) + '</strong> — ' + _esc(a.quantidade);
  }).join('<br>');
  await _chatAddBot(
    'Adicionado ✅<br><div class="chat-items-preview">' + listaHtml + '</div><br>Para quando necessitas?'
  );
  _chatSetPlaceholder('Ex: sexta-feira, urgente, próxima semana...');
  _chatShowChips([
    { label: 'Hoje',           onclick: function() { _chatAddUser('Hoje');           _chatSetPrazo('Hoje'); } },
    { label: 'Amanhã',         onclick: function() { _chatAddUser('Amanhã');         _chatSetPrazo('Amanhã'); } },
    { label: 'Esta semana',    onclick: function() { _chatAddUser('Esta semana');    _chatSetPrazo('Esta semana'); } },
    { label: 'Próxima semana', onclick: function() { _chatAddUser('Próxima semana'); _chatSetPrazo('Próxima semana'); } },
    { label: '➕ Mais material', cls: 'green', onclick: function() { _chatAddUser('Mais um material'); _chat.step = 'material'; _chatSetPlaceholder('Escreve o próximo material...'); _chatAddBot('Qual o próximo material?'); _chatClearSuggestions(); } },
  ]);
}

// Mantido para compatibilidade mas já não usado no fluxo principal
async function _chatAskMais() {
  _chatAskPrazoComResumo();
}

async function _chatAskPrazo() {
  _chat.step = 'prazo';
  await _chatAddBot('Para quando necessitas?');
  _chatSetPlaceholder('Ex: sexta-feira, urgente, próxima semana...');
  _chatShowChips([
    { label: 'Hoje',          onclick: () => { _chatAddUser('Hoje');           _chatSetPrazo('Hoje'); } },
    { label: 'Amanhã',        onclick: () => { _chatAddUser('Amanhã');         _chatSetPrazo('Amanhã'); } },
    { label: 'Esta semana',   onclick: () => { _chatAddUser('Esta semana');    _chatSetPrazo('Esta semana'); } },
    { label: 'Próxima semana',onclick: () => { _chatAddUser('Próxima semana'); _chatSetPrazo('Próxima semana'); } },
  ]);
}

function _chatSetPrazo(val) {
  _chat.prazo = val;
  _chatClearSuggestions();
  const inp = document.getElementById('chat-input');
  if (inp) inp.value = '';
  _chatAskObra();
}

async function _chatAskObra() {
  _chat.step = 'obra';
  await _chatAddBot('Para que obra?');
  _chatSetPlaceholder('');
  const obras = (S.OBRAS || []).filter(o => o.ativa !== false);
  if (obras.length > 0) {
    _chatShowChips(obras.map(o => ({
      label: o.nome,
      cls: 'obra',
      onclick: () => { _chatAddUser(o.nome); _chatSelectObra(o.id, o.nome); }
    })));
  }
}

function _chatSelectObra(obraId, obraNome) {
  _chat.obraId = obraId;
  _chat.obraNome = obraNome;
  _chatClearSuggestions();
  _chatFinalize();
}

async function _chatFinalize() {
  _chat.step = 'done';
  const inp = document.getElementById('chat-input');
  if (inp) inp.disabled = true;
  await _chatAddBot('Um momento, a registar o pedido... ⏳', 300);

  try {
    // Validar dados antes de inserir
    if (!_chat.artigos || _chat.artigos.length === 0) throw new Error('Sem artigos');
    if (!_chat.obraId) throw new Error('Obra não seleccionada');

    const prazoLower = (_chat.prazo || '').toLowerCase();
    const urgencia = (prazoLower.includes('hoje') || prazoLower.includes('urgent') || prazoLower.includes('amanh'))
      ? 'Urgente' : 'Normal';

    const titulo = _chat.artigos.length === 1
      ? _chat.artigos[0].nome
      : (_chat.artigos.length + ' materiais — ' + _chat.artigos[0].nome + '...');

    const artigosJSON = _chat.artigos.map(function(a) {
      return { ref: a.ref || '', descricao: a.nome || '', unidade: a.unidade || 'un', quantidade: a.quantidade || '' };
    });

    const registo = {
      titulo:      titulo,
      descricao:   'Pedido via chat por ' + ((S.currentUser && S.currentUser.nome) || ''),
      obra_id:     _chat.obraId,
      urgencia:    urgencia,
      estado:      'pendente',
      notas:       'Prazo: ' + (_chat.prazo || ''),
      artigos:     artigosJSON,
      criado_por:  (S.currentUser && S.currentUser.username) || '',
      criado_nome: (S.currentUser && S.currentUser.nome) || '',
    };

    const res = await sb.from('pedidos_compra').insert(registo).select().single();

    if (res.error) {
      console.error('Supabase insert error:', res.error);
      throw new Error(res.error.message || 'Erro Supabase');
    }

    const pedidoId = res.data && res.data.id ? res.data.id.substring(0, 8).toUpperCase() : '---';
    const listaFinal = _chat.artigos.map(function(a) {
      return '• ' + _esc(a.nome) + ' — ' + _esc(a.quantidade);
    }).join('<br>');

    await _chatAddBot(
      '✅ <strong>Pedido registado com sucesso!</strong><br><br>' +
      '<div class="chat-items-preview">' +
      '📋 Ref: <strong>#' + pedidoId + '</strong><br>' +
      '🏗️ Obra: <strong>' + _esc(_chat.obraNome) + '</strong><br>' +
      '📅 Prazo: <strong>' + _esc(_chat.prazo || '') + '</strong><br><br>' +
      listaFinal +
      '</div><br>O responsável foi notificado. Obrigado! 👍', 600
    );

    _chatShowChips([
      { label: '🛒 Novo pedido', cls: 'green', onclick: function() { _chatReset(); _chatWelcome(); } },
      { label: '← Voltar ao início', onclick: function() { encVoltarHome(); } },
    ]);

    // Atualizar COMPRAS local e re-render se estiver na vista de compras
    if (res.data) {
      const novo = {
        id:          res.data.id,
        titulo:      registo.titulo,
        artigos:     artigosJSON,
        obraId:      registo.obra_id,
        urgencia:    registo.urgencia,
        estado:      registo.estado,
        notas:       registo.notas,
        criadoNome:  registo.criado_nome,
        criado_por:  registo.criado_por,
        created_at:  new Date().toISOString(),
        dataLimite:  '',
        fornecedor:  '',
        fornecedores:[],
        pedidoCotacao: false,
        aprovadoDO:  false,
        adjudicado:  false,
      };
      if (typeof COMPRAS !== 'undefined') COMPRAS.unshift(novo);
      if (typeof renderCompras === 'function') try { renderCompras(); } catch(e2) {}
    }

  } catch (e) {
    console.error('chatFinalize erro:', e);
    await _chatAddBot('⚠️ Erro: ' + (e.message || 'Falha ao registar. Verifica a consola.'));
    if (inp) inp.disabled = false;
    _chat.step = 'obra';
  }
}

// ── Envio manual (input + botão) ──────────────────────────────
async function chatSend() {
  const inp = document.getElementById('chat-input');
  const val = (inp?.value || '').trim();
  if (!val) return;

  _chatAddUser(val);
  inp.value = '';
  _chatClearSuggestions();

  if (_chat.step === 'material') {
    // Pesquisar e usar o primeiro resultado, ou texto livre
    const results = _chatSearchMateriais(val);
    const mat = results.length > 0
      ? results[0]
      : { ref: '', nome: val, unidade: 'un' };
    _chatSelectMaterial(mat);

  } else if (_chat.step === 'quantidade') {
    _chatConfirmArtigo(val);

  } else if (_chat.step === 'mais') {
    const v = val.toLowerCase();
    if (v.includes('sim') || v.includes('mais') || v.includes('s')) {
      _chat.step = 'material';
      _chatSetPlaceholder('Escreve o próximo material...');
      _chatAddBot('Qual o próximo material?');
    } else {
      _chatAskPrazo();
    }

  } else if (_chat.step === 'prazo') {
    _chatSetPrazo(val);

  } else if (_chat.step === 'obra') {
    const obras = (typeof S.OBRAS !== 'undefined' ? S.OBRAS : []).filter(function(o) { return o.ativa !== false; });
    const match = obras.find(function(o) { return o.nome.toLowerCase().includes(val.toLowerCase()); });
    if (match) {
      _chatSelectObra(match.id, match.nome);
    } else {
      await _chatAddBot('Não encontrei essa obra. Escolhe uma da lista acima 👆');
      _chatAskObra();
    }
  }
}

window.encGoComprasChat = encGoComprasChat;
window.chatSend         = chatSend;
window.chatOnInput      = chatOnInput;

export {
  depSetMovimento, encGoCombDeposito, encSubmeterCombDeposito,
  encGoCombViatura, startCombQrScanner, stopCombQrScanner, onCombQrScanned,
  combViaturaManual, combViaturaVoltarScanner, encSubmeterCombViatura, encSubmeterCombustivel,
  encGoComprasChat, _chatReset, _chatAddBot, _chatAddUser, chatOnInput, chatSend
};

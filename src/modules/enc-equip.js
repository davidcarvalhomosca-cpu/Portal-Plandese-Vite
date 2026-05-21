// ═══════════════════════════════════════
//  ENC-EQUIP — Scanner QR Encarregado
// ═══════════════════════════════════════
import { sb } from '../supabase.js';
import { S } from '../state.js';
import { showToast } from './navigation.js';
import { sbFetchEquipamentoById, sbUpdateEquipamentoLocal } from './equipamentos.js';

let _encHtml5Qr = null;
let _encQrEquipId = null;
let _encQrGpsLat = null, _encQrGpsLng = null;

function _encEquipShowState(state){
  document.getElementById('enc-equip-state-scanner').style.display = state==='scanner' ? '' : 'none';
  const fEl=document.getElementById('enc-equip-state-form');
  fEl.style.display = state==='form' ? 'flex' : 'none';
  if(state==='form') fEl.style.flexDirection='column';
  const sEl=document.getElementById('enc-equip-state-success');
  sEl.style.display = state==='success' ? 'flex' : 'none';
  if(state==='success') sEl.style.flexDirection='column';
}

// ── QR Scanner ─────────────────────────

function startEncQrScanner(){
  const readerEl = document.getElementById('enc-qr-reader');
  if(!readerEl) return;
  if(typeof Html5Qrcode === 'undefined'){
    readerEl.innerHTML=`<div style="padding:28px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.6">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;display:block;margin:0 auto 10px;opacity:.7"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M20 5h-6v6h6V5z"/></svg>
      Leitor QR não disponível.<br>
      <span style="font-size:11px;opacity:.8">Utilize a câmara nativa para fotografar o QR code — o link abrirá automaticamente.</span>
    </div>`;
    return;
  }
  if(_encHtml5Qr){ try{_encHtml5Qr.stop();}catch(e){} _encHtml5Qr=null; }
  _encHtml5Qr = new Html5Qrcode('enc-qr-reader');
  _encHtml5Qr.start(
    {facingMode:'environment'},
    {fps:10, qrbox:{width:220, height:220}, aspectRatio:1.0},
    (decoded)=>{ onEncQrScanned(decoded); },
    ()=>{}
  ).catch(err=>{
    console.warn('QR scanner:', err);
    readerEl.innerHTML=`<div style="padding:24px 20px;text-align:center;background:rgba(0,0,0,.25);border-radius:12px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.7">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:32px;height:32px;display:block;margin:0 auto 10px;opacity:.7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      Câmara não acessível.<br>
      <span style="font-size:11px;opacity:.8">Verifique as permissões do browser ou fotografe o QR code com a câmara nativa.</span>
    </div>`;
  });
}

function stopEncQrScanner(){
  if(_encHtml5Qr){
    try{_encHtml5Qr.stop();}catch(e){}
    _encHtml5Qr=null;
  }
}

async function onEncQrScanned(text){
  stopEncQrScanner();
  // Extrair equipId da URL ou texto directo
  let equipId=null;
  try{ const u=new URL(text); equipId=u.searchParams.get('reg'); }catch(e){}
  if(!equipId && /^EQ[A-Z0-9]+$/.test(text)) equipId=text;
  if(!equipId){
    showToast('QR code não reconhecido como equipamento Plandese');
    setTimeout(()=>startEncQrScanner(), 2500);
    return;
  }
  _encQrEquipId=equipId;
  _encQrGpsLat=null; _encQrGpsLng=null;
  // Info do equipamento — primeiro local, depois Supabase se não encontrar
  let eq=EQUIPAMENTOS.find(e=>e.id===equipId);
  if(!eq){
    // Mostrar estado de carregamento enquanto busca
    document.getElementById('enc-eq-nome').textContent='A carregar…';
    document.getElementById('enc-eq-cat').textContent='';
    _encEquipShowState('form');
    eq=await sbFetchEquipamentoById(equipId);
    if(eq){ EQUIPAMENTOS.push(eq); saveEqLocal(); }
  } else {
    _encEquipShowState('form');
  }
  document.getElementById('enc-eq-nome').textContent=eq?eq.nome:`Equipamento ${equipId}`;
  document.getElementById('enc-eq-cat').textContent=eq?(EQ_CATS[eq.categoria]?.label||'Equipamento'):'Equipamento';
  // Preencher obras
  const sel=document.getElementById('enc-eq-obra-sel');
  sel.innerHTML='<option value="">Selecionar obra…</option>';
  S.OBRAS.filter(o=>o.ativa).forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.nome; sel.appendChild(op); });
  // Reset form
  document.getElementById('enc-eq-obs').value='';
  document.getElementById('enc-eq-use-gps').checked=true;
  document.getElementById('enc-eq-loc-dot').className='qr-loc-dot loading';
  document.getElementById('enc-eq-loc-txt').textContent='A obter localização GPS…';
  // GPS
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      _encQrGpsLat=pos.coords.latitude; _encQrGpsLng=pos.coords.longitude;
      document.getElementById('enc-eq-loc-dot').className='qr-loc-dot ok';
      document.getElementById('enc-eq-loc-txt').textContent=`GPS: ${_encQrGpsLat.toFixed(5)}, ${_encQrGpsLng.toFixed(5)}`;
    },()=>{
      document.getElementById('enc-eq-loc-dot').className='qr-loc-dot err';
      document.getElementById('enc-eq-loc-txt').textContent='GPS não disponível';
      document.getElementById('enc-eq-use-gps').checked=false;
    },{timeout:8000,enableHighAccuracy:true});
  } else {
    document.getElementById('enc-eq-loc-dot').className='qr-loc-dot err';
    document.getElementById('enc-eq-loc-txt').textContent='GPS não suportado';
    document.getElementById('enc-eq-use-gps').checked=false;
  }
}

function encScanNovamente(){
  _encQrEquipId=null; _encQrGpsLat=null; _encQrGpsLng=null;
  document.getElementById('enc-qr-reader').innerHTML='';
  _encEquipShowState('scanner');
  setTimeout(()=>startEncQrScanner(), 350);
}

function submitEncEquipamento(){
  if(!_encQrEquipId){ showToast('Nenhum equipamento seleccionado'); return; }
  const obraId  =document.getElementById('enc-eq-obra-sel').value;
  const obs     =document.getElementById('enc-eq-obs').value.trim();
  const useGps  =document.getElementById('enc-eq-use-gps').checked;
  const encNome =S.currentUser?.nome || 'Encarregado';
  const selEl   =document.getElementById('enc-eq-obra-sel');
  const selOpt  =selEl.querySelector(`option[value="${obraId}"]`);
  const obraNome=selOpt&&obraId?selOpt.textContent:null;
  const mov={
    id:'MOV'+Date.now().toString(36).toUpperCase(),
    equipId:_encQrEquipId, obraId:obraId||null, obraNome:obraNome||null,
    lat:(useGps&&_encQrGpsLat)?_encQrGpsLat:null,
    lng:(useGps&&_encQrGpsLng)?_encQrGpsLng:null,
    obs, encarregado:encNome, criadoEm:new Date().toISOString()
  };
  EQ_MOVIMENTOS.push(mov);
  const idx=EQUIPAMENTOS.findIndex(e=>e.id===_encQrEquipId);
  if(idx>=0){
    EQUIPAMENTOS[idx].ultimoLocal   =obraNome||(mov.lat?`${mov.lat.toFixed(4)}, ${mov.lng.toFixed(4)}`:'Registado');
    EQUIPAMENTOS[idx].ultimoLat     =mov.lat;
    EQUIPAMENTOS[idx].ultimoLng     =mov.lng;
    EQUIPAMENTOS[idx].ultimoRegisto =mov.criadoEm;
  }
  saveEqLocal();
  // Guardar movimento em Supabase
  try{ sb.from('eq_movimentos').insert({equip_id:_encQrEquipId,obra_id:mov.obraId,obra_nome:mov.obraNome,lat:mov.lat,lng:mov.lng,obs:mov.obs,encarregado:mov.encarregado,criado_em:mov.criadoEm}).then(()=>{}).catch(()=>{}); }catch(e){}
  // Actualizar último local do equipamento em Supabase
  const _eIdx=EQUIPAMENTOS.findIndex(e=>e.id===_encQrEquipId);
  if(_eIdx>=0){ sbUpdateEquipamentoLocal(_encQrEquipId,EQUIPAMENTOS[_eIdx].ultimoLocal,EQUIPAMENTOS[_eIdx].ultimoLat,EQUIPAMENTOS[_eIdx].ultimoLng,EQUIPAMENTOS[_eIdx].ultimoRegisto); }
  const eq=EQUIPAMENTOS.find(e=>e.id===_encQrEquipId);
  document.getElementById('enc-eq-success-txt').innerHTML=
    `<strong>${encNome}</strong> registou<br>`+
    `<strong>${eq?eq.nome:_encQrEquipId}</strong><br>`+
    (obraNome?`em <strong>${obraNome}</strong>`:'sem obra associada')+
    `<br><span style="font-size:11px;opacity:.65;display:block;margin-top:6px">${eqFmtDt(new Date())}</span>`;
  _encEquipShowState('success');
}

// ═══════════════════════════════════════
//  PRODUÇÃO — DADOS E FUNÇÕES

export { _encEquipShowState, startEncQrScanner, stopEncQrScanner, onEncQrScanned, encScanNovamente, submitEncEquipamento };

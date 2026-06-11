// ═══════════════════════════════════════════════════
//  Dropbox PKCE OAuth + File Upload
// ═══════════════════════════════════════════════════
const APP_KEY      = '6xmi67376olea1l';
const TOKEN_KEY    = 'dbx_token';
const REFRESH_KEY  = 'dbx_refresh';
const VERIFIER_KEY = 'dbx_verifier';

function _redirectUri(){
  return window.location.origin;
}

function _b64url(buf){
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function _pkce(){
  const verifier  = _b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest    = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = _b64url(new Uint8Array(digest));
  return { verifier, challenge };
}

export function dropboxIsConnected(){
  return !!localStorage.getItem(TOKEN_KEY);
}

export async function dropboxLogin(){
  const { verifier, challenge } = await _pkce();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const p = new URLSearchParams({
    client_id:             APP_KEY,
    response_type:         'code',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    redirect_uri:          _redirectUri(),
    token_access_type:     'offline',
  });
  window.location.href = `https://www.dropbox.com/oauth2/authorize?${p}`;
}

export function dropboxLogout(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  _renderDbxBtn();
}

// Chamado no arranque da app — trata o redirect de volta da Dropbox
export async function dropboxInit(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if(!code) { _renderDbxBtn(); return; }

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if(!verifier){ window.history.replaceState({}, '', window.location.pathname); _renderDbxBtn(); return; }

  try{
    const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type:    'authorization_code',
        code_verifier: verifier,
        client_id:     APP_KEY,
        redirect_uri:  _redirectUri(),
      }),
    });
    if(!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    if(data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    sessionStorage.removeItem(VERIFIER_KEY);
    window.history.replaceState({}, '', window.location.pathname);
    _renderDbxBtn();
    if(typeof window.showToast === 'function') window.showToast('Dropbox ligada com sucesso');
  } catch(e){
    console.warn('Dropbox OAuth erro:', e);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

async function _refreshToken(){
  const refresh = localStorage.getItem(REFRESH_KEY);
  if(!refresh) return false;
  try{
    const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refresh,
        client_id:     APP_KEY,
      }),
    });
    if(!resp.ok) return false;
    const data = await resp.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return true;
  } catch{ return false; }
}

export async function dropboxUpload(file, destPath){
  let token = localStorage.getItem(TOKEN_KEY);
  if(!token) throw new Error('Dropbox não conectada');

  // Converter File/Blob para ArrayBuffer para garantir compatibilidade com Dropbox API
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();

  const _upload = async (tok) => fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${tok}`,
      'Dropbox-API-Arg': JSON.stringify({ path: destPath, mode: 'add', autorename: true, mute: false }),
      'Content-Type':    'application/octet-stream',
    },
    body: buf,
  });

  let resp = await _upload(token);
  if(resp.status === 401){
    const ok = await _refreshToken();
    if(!ok){ localStorage.removeItem(TOKEN_KEY); throw new Error('Sessão Dropbox expirada — ligue novamente'); }
    token = localStorage.getItem(TOKEN_KEY);
    resp = await _upload(token);
  }
  if(!resp.ok) throw new Error('Dropbox upload falhou: ' + await resp.text());
  const result = await resp.json();
  return result.path_display;
}

export function dropboxFatPath(fat, fileName, aprovada = false){
  const d   = fat.data || new Date().toISOString().slice(0,10);
  const ym  = d.slice(0,7);
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.pdf';
  const safe = s => (s||'').replace(/[^\wÀ-ÿ\-]/g,'_').replace(/_+/g,'_').slice(0,30);
  const name = [safe(fat.fornecedor), safe(fat.nif), safe(fat.numero)||safe(fileName.replace(/\.[^.]+$/,''))].filter(Boolean).join('_');
  if(aprovada && fat.centroCusto){
    return `/04_DP/${safe(fat.centroCusto)}/Faturas_Aprovadas/${ym}/${name}${ext}`;
  }
  if(fat.centroCusto){
    return `/04_DP/${safe(fat.centroCusto)}/Faturas_Pendentes/${ym}/${name}${ext}`;
  }
  return `/04_DP/Faturas/${ym}/${name}${ext}`;
}

export async function dropboxGetSharedLink(path){
  let token = localStorage.getItem(TOKEN_KEY);
  if(!token) return null;
  try{
    let resp = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, settings: { requested_visibility: { '.tag': 'public' } } }),
    });
    if(resp.status === 401){
      const ok = await _refreshToken();
      if(!ok) return null;
      token = localStorage.getItem(TOKEN_KEY);
      resp = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, settings: { requested_visibility: { '.tag': 'public' } } }),
      });
    }
    if(resp.status === 409){
      // Link já existe — extrair do body
      const err = await resp.json();
      return err?.error?.shared_link_already_exists?.metadata?.url?.replace('?dl=0','?dl=1') || null;
    }
    if(!resp.ok) return null;
    const data = await resp.json();
    return data.url?.replace('?dl=0','?dl=1') || null;
  } catch{ return null; }
}

export async function dropboxMoveFile(fromPath, toPath){
  let token = localStorage.getItem(TOKEN_KEY);
  if(!token) throw new Error('Dropbox não conectada');
  const _move = async (tok) => fetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: true }),
  });
  let resp = await _move(token);
  if(resp.status === 401){
    const ok = await _refreshToken();
    if(!ok){ localStorage.removeItem(TOKEN_KEY); throw new Error('Sessão Dropbox expirada'); }
    token = localStorage.getItem(TOKEN_KEY);
    resp = await _move(token);
  }
  if(!resp.ok) throw new Error('Dropbox move falhou: ' + await resp.text());
  const data = await resp.json();
  return data.metadata?.path_display;
}

// Atualiza o botão Dropbox na UI (se existir)
function _renderDbxBtn(){
  const btn = document.getElementById('dbx-btn');
  if(!btn) return;
  if(dropboxIsConnected()){
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM0 13l6 4 6-4-6-4-6 4zm18-4l-6 4 6 4 6-4-6-4zM6 18l6 4 6-4-6-4-6 4z"/></svg>Dropbox ligada`;
    btn.className = 'btn btn-success btn-sm';
    btn.onclick = () => { if(confirm('Desligar Dropbox?')) dropboxLogout(); };
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM0 13l6 4 6-4-6-4-6 4zm18-4l-6 4 6 4 6-4-6-4zM6 18l6 4 6-4-6-4-6 4z"/></svg>Ligar Dropbox`;
    btn.className = 'btn btn-secondary btn-sm';
    btn.onclick = dropboxLogin;
  }
}

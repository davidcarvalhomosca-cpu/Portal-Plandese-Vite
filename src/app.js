// ═══════════════════════════════════════
//  APP.JS — Orquestração (entry point modular)
//  Migrado para módulos ES reais
// ═══════════════════════════════════════
import { fmt, fmtPT, calcH, fmtH } from './utils/helpers.js';
import { S, R } from './state.js';
import { carregarDados } from './db.js';

// Auth
import { mostrarDiag, applyDeviceClass, updateDeviceBadge, doLogin, doLogout } from './modules/auth.js';

// Navigation
import { showToast, switchFPTab, initAdmin, populateFilterSelects, openModal, closeModal, goTo, refreshPortal, toggleNavGrp, syncNavGroups, flashAlert } from './modules/navigation.js';

// Ponto admin
import { applyFilter, navSemana, renderHistSemana, exportMensal, exportHistSemana, loadWeek, exportSemanaExcel } from './modules/ponto.js';

// Obras, Colaboradores, Utilizadores
import { renderObras, editObra, saveObra, toggleObra, novaObra } from './modules/obras.js';
import { renderColabs, editColab, saveColab, toggleColab } from './modules/colaboradores.js';
import { renderUsers, editUser, saveUser } from './modules/utilizadores.js';

// Permissões
import { loadPermissions, savePermissions, resetPermissions, readPermMatrixState, renderPermMatrix, onPermChange, switchUtilTab, applyStoredPermissions, applyRolePermissions } from './modules/permissions.js';

// Notificações
import { initNotifications, emitEvent, renderNotifPanel, notifClick, toggleNotifPanel, closeNotifPanel, markAllRead } from './modules/notifications.js';
import { renderNotifSubs, toggleNotifSub } from './modules/notif-subs.js';

// Faturas
import { handleFatFiles, renderFaturas, limparFatFiltros, editarFatura, saveFatura, apagarFatura, exportFaturasXLSX, setupFatDropzone, atualizaKPIs, seedFaturasDemo, carregarTemplatesFaturas, carregarFaturas, openFatSel, fssClose, fssSetActive, fssTextClick, fssSave, _fssFatInputChange, aprovarFatura, rejeitarFatura } from './modules/faturas.js';

// Compras
import { renderCompras, editarCompra, saveCompra, apagarCompra, exportComprasXLSX, abrirMapaPicker, fecharMapaPicker, geocodeSearch, confirmarLocalizacao, limparLocalizacao, cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty, cmpAddArtigoRapido, cmpAddForn, cmpRemoveForn, initCompras, atualizaKPIsCompras, populaCmpObras, cmpSetView, abrirListaMateriais, fecharListaMateriais, confirmarListaMateriais, uploadListaExcel, uploadListaExcelFile, cmpLstRender, cmpLstToggle, cmpLstRemoveSel, lstUpdateQty, cmpUpdateArtBtnBadge, abrirFornPicker, cmpFornPickerRender, cmpSelFornPicker, openCompraModal } from './modules/compras.js';

// Equipamentos
import { renderEquipamentos, openEqModal, editEquipamento, saveEquipamento, apagarEquipamento, refreshEqMap, showQrCode, printQrCode, showEqHistorico, exportEquipamentosXLSX, submitQrRegistration, initEquipamentos, initQrRegistration } from './modules/equipamentos.js';

// Combustível admin
import { loadCombustivelAdmin, toggleCombView, renderCombObraCards, exportCombustivelXLSX, _initCombustivelAdmin } from './modules/combustivel.js';

// Enc-ponto
import { initEnc, encPassarColaboradores, encVoltarScreen1, carregarEquipaAnterior, adicionarTodosOntem, encAddColab, encRemColab, encSubmeterRegisto, encGoMenuPonto, encGoFolhaPontoPlandese, encGoFolhaPonto, encGoHistoricoEnc, encLoadHistorico, encGoFolhaPontoAluguer, encGoEquipamentos, encGoCombustivel, encVoltarHome, encOpenWeatherModal, encCloseWeatherModal } from './modules/enc-ponto.js';

// Enc-equip
import { encScanNovamente, submitEncEquipamento } from './modules/enc-equip.js';

// Enc-combustivel + chat
import { depSetMovimento, encGoCombDeposito, encSubmeterCombDeposito, encGoCombViatura, combViaturaManual, combViaturaVoltarScanner, encSubmeterCombViatura, encGoComprasChat, chatOnInput, chatSend } from './modules/enc-combustivel.js';

// Enc-aluguer + MOA
import { loadEmpresasMOA, loadColaboradoresMOA, addColabMOA, removeColabMOA, renderEmpresasMOA, editEmpresaMOA, saveEmpresaMOA, toggleEmpresaMOA, encAlugPassarTrabalhadores, encAlugVoltarA, encAlugAddTrabalhador, encAlugSubmeter, encAlugRemover, applyMOAFilter, navMOASemana, exportMOAExcel, initMOAFilters } from './modules/enc-aluguer.js';

// Produção
import { initProducao, renderProdDashboard, coGoList, coOpenDetail, renderPrevFat, editPrevFat, savePrevFat, deletePrevFat, deletePrevFatFromDetail, editPrevFatFromDetail, renderAutos, editAuto, saveAuto, deleteAuto, deleteAutoFromDetail, editAutoFromDetail, clearCustoObra, custoHandleDrop, obraImportCustos, obraCustosHandleDrop, saveObraExtra } from './modules/producao.js';

// Admin/Painel
import { loadPainelConfig, savePainelConfig, renderPainel, buildWidget, openPainelCustomizer, closePainelCustomizer, savePainelCustomizer, painelWChkChange, painelObraChkChange, renderFechoMes, exportFechoMes } from './modules/admin.js';

// Fornecedores
import { sbLoadFornecedores, renderFornecedores, openModalFornecedor, saveFornecedor, apagarFornecedor, exportFornecedoresXLSX, fornPag, editarFornecedor } from './modules/fornecedores.js';

// Mapas comparativos
import { sbLoadMapasComp, renderMapasComp, openModalMapa, editarMapaComp, adicionarFornecedorMapa, removerFornecedorMapa, adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa, uploadListaMapaSecos, uploadListaMapaSecosFile, uploadProposta, uploadPropostaFile, mprToggleSel, mprSetLinha, mprUpdateCount, confirmarPropostaReview, saveMapaComp, apagarMapaComp, abrirMapaComparativo, abrirResumoMapa, exportResumoPDF, injectMapaCompBtns } from './modules/mapas-comp.js';

// Dropbox
import { dropboxInit, dropboxLogin, dropboxLogout, dropboxIsConnected } from './modules/dropbox.js';

// Férias
import { renderMapaFerias, feriasNavAno, feriasTogglePrevista, feriasToggleLock, feriasSetFiltro } from './modules/ferias.js';

// Preços Unitários
import { initPrecosUnit, puGoList, puOpenObra, puOpenImport, puHandleFile, puHandleDrop, puDragOver, puDragLeave, puExportExcel, puLimpar, _puRefreshDetail } from './modules/precos-unitarios.js';

// Advertências
import { openAdvertencias, closeAdvertencias, advShowForm, advShowLista, saveAdvertencia, advEliminar, advGerarPDF } from './modules/advertencias.js';

// Lembretes (quadro Trello)
import { renderLembretes, lembretesOpenModal, lembretesCloseModal, lembretesSave, lembretesApagar, lembretesSelectCor, lembretesDragStart, lembretesDragEnd, lembretesDragOver, lembretesDrop } from './modules/lembretes.js';

// ── Registry R — permite que módulos chamem funções de outros módulos sem imports circulares ──
Object.assign(R, {
  carregarDados,
  mostrarDiag,
  initEnc,
  initAdmin,
  applyStoredPermissions, applyRolePermissions, renderPermMatrix,
  initNotifications, emitEvent,
  renderPainel, renderFaturas, renderCompras, renderObras,
  renderColabs, renderUsers, renderEquipamentos,
  loadCombustivelAdmin, renderProdDashboard,
  renderFechoMes, applyFilter, renderEmpresasMOA,
  loadEmpresasMOA, loadColaboradoresMOA,
  initCompras, initMOAFilters,
});

// ── Polyfill: expõe helpers globalmente para compatibilidade com HTML inline ──
window.fmt = fmt; window.fmtPT = fmtPT; window.calcH = calcH; window.fmtH = fmtH;
// Expõe S globalmente para os handlers inline dos modais (ex: onchange="S._mcLinhas[i].valor_seco=...")
window.S = S;

// ── Device detection ao carregar ──
applyDeviceClass();
window.addEventListener('resize', () => {
  const dt = applyDeviceClass();
  if (S.currentUser?.role === 'admin') updateDeviceBadge(dt);
});

// ── QR Registration via URL param ──
initQrRegistration();

// ── Dropbox OAuth callback (se vier redirect de volta da Dropbox) ──
dropboxInit();

// ── Login com Enter ──
document.getElementById('lp')?.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

// ── Expor todas as funções ao window para handlers HTML inline ──
Object.assign(window, {
  // Auth
  doLogin, doLogout,

  // Dropbox
  dropboxLogin, dropboxLogout, dropboxIsConnected,

  // Painel Principal
  openPainelCustomizer, closePainelCustomizer, savePainelCustomizer,
  painelWChkChange, painelObraChkChange,

  // Navegação admin
  goTo, toggleNavGrp, refreshPortal,

  // Modais genéricos
  openModal, closeModal,

  // Histórico / Ponto
  applyFilter, navSemana, exportHistSemana, exportMensal,
  switchFPTab, loadWeek,

  // MOA
  applyMOAFilter, navMOASemana, exportMOAExcel,

  // Obras
  renderObras, saveObra, editObra, toggleObra, novaObra, saveObraExtra,

  // Colaboradores
  renderColabs, saveColab, editColab, toggleColab,

  // Advertências
  openAdvertencias, closeAdvertencias, advShowForm, advShowLista, saveAdvertencia, advEliminar, advGerarPDF,

  // Utilizadores
  renderUsers, saveUser, editUser, switchUtilTab,

  // Permissões
  savePermissions, resetPermissions, onPermChange,

  // Faturas
  handleFatFiles, renderFaturas, limparFatFiltros,
  editarFatura, saveFatura, apagarFatura, exportFaturasXLSX, carregarFaturas,
  aprovarFatura, rejeitarFatura,
  // Anotador visual
  openFatSel, fssClose, fssSetActive, fssTextClick, fssSave, _fssFatInputChange,

  // Compras
  renderCompras, editarCompra, saveCompra, apagarCompra,
  exportComprasXLSX, cmpSetView, abrirMapaPicker, fecharMapaPicker,
  geocodeSearch, confirmarLocalizacao, limparLocalizacao,
  cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty, cmpAddArtigoRapido,
  cmpAddForn, cmpRemoveForn,
  abrirListaMateriais, fecharListaMateriais, confirmarListaMateriais,
  uploadListaExcel, uploadListaExcelFile,
  cmpLstRender, cmpLstToggle, cmpLstRemoveSel, lstUpdateQty, cmpUpdateArtBtnBadge,
  abrirFornPicker, cmpFornPickerRender, cmpSelFornPicker,
  openCompraModal,

  // Empresas MOA
  saveEmpresaMOA, editEmpresaMOA, toggleEmpresaMOA,
  addColabMOA, removeColabMOA,

  // Equipamentos
  renderEquipamentos, openEqModal, editEquipamento,
  saveEquipamento, apagarEquipamento, refreshEqMap,
  showQrCode, printQrCode, showEqHistorico, exportEquipamentosXLSX,

  // QR Registration
  submitQrRegistration,

  // Combustível
  loadCombustivelAdmin, exportCombustivelXLSX,
  toggleCombView, renderCombObraCards,

  // Encarregado — navegação
  encVoltarHome, encGoMenuPonto, encGoFolhaPontoPlandese,
  encOpenWeatherModal, encCloseWeatherModal,
  encGoFolhaPontoAluguer, encGoHistoricoEnc,
  encGoEquipamentos, encGoCombustivel,

  // Encarregado — ponto
  encPassarColaboradores, encVoltarScreen1,
  encAddColab, encRemColab, encSubmeterRegisto,
  adicionarTodosOntem, encLoadHistorico,

  // Encarregado — equipamentos QR
  encScanNovamente, submitEncEquipamento,

  // Encarregado — combustível
  encGoCombDeposito, encGoCombViatura,
  depSetMovimento, encSubmeterCombDeposito,
  combViaturaManual, combViaturaVoltarScanner, encSubmeterCombViatura,

  // Encarregado — aluguer
  encAlugPassarTrabalhadores, encAlugVoltarA,
  encAlugAddTrabalhador, encAlugSubmeter, encAlugRemover,

  // Preços Unitários
  initPrecosUnit, puGoList, puOpenObra,
  puOpenImport, puHandleFile, puHandleDrop, puDragOver, puDragLeave,
  puExportExcel, puLimpar, _puRefreshDetail,

  // Produção / Controlo de Obras
  coGoList, coOpenDetail,
  editAutoFromDetail, deleteAutoFromDetail,
  editPrevFatFromDetail, deletePrevFatFromDetail,
  obraImportCustos, obraCustosHandleDrop, clearCustoObra,
  editPrevFat, deletePrevFat, savePrevFat,
  editAuto, deleteAuto, saveAuto,
  custoHandleDrop,
  exportSemanaExcel,

  // Notificações
  toggleNotifPanel, notifClick, markAllRead,
  renderNotifSubs, toggleNotifSub,

  // Folha de Fecho
  renderFechoMes, exportFechoMes,

  // Fornecedores
  sbLoadFornecedores, renderFornecedores,
  openModalFornecedor, saveFornecedor, apagarFornecedor, exportFornecedoresXLSX,
  fornPag, editarFornecedor,

  // Mapas Comparativos
  sbLoadMapasComp, renderMapasComp,
  openModalMapa, editarMapaComp,
  adicionarFornecedorMapa, removerFornecedorMapa,
  adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa,
  uploadListaMapaSecos, uploadListaMapaSecosFile,
  uploadProposta, uploadPropostaFile, mprToggleSel, mprSetLinha, mprUpdateCount, confirmarPropostaReview,
  saveMapaComp, apagarMapaComp, abrirMapaComparativo, abrirResumoMapa, exportResumoPDF,
  criarMapaFromPedido: function() {
    const id = document.getElementById('mcmp-id').value;
    if (!id) return;
    closeModal('modal-compra');
    goTo('mapas-comparativos', document.getElementById('nav-mapas-comp'));
    setTimeout(() => openModalMapa(id), 300);
  },

  // Chat compras
  encGoComprasChat, chatSend, chatOnInput,

  // Férias
  renderMapaFerias, feriasNavAno, feriasTogglePrevista, feriasToggleLock, feriasSetFiltro,

  // Lembretes
  renderLembretes, lembretesOpenModal, lembretesCloseModal, lembretesSave, lembretesApagar,
  lembretesSelectCor, lembretesDragStart, lembretesDragEnd, lembretesDragOver, lembretesDrop,
});

// ── Settings panel ──────────────────────────────────────────────────────────
(function () {
  let open = false;

  window.toggleSettingsPanel = function () {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    open = !open;
    panel.classList.toggle('open', open);
  };

  document.addEventListener('click', function (e) {
    if (!open) return;
    if (!e.target.closest('#settings-wrap')) {
      open = false;
      document.getElementById('settings-panel')?.classList.remove('open');
    }
  });
})();

// ── Dark mode ────────────────────────────────────────────────────────────────
(function () {
  const KEY = 'plandese-dark-mode';
  const MOON = '<path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>';
  const SUN  = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0zM7.05 18.36l-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0z"/>';
  function applyTheme(dark) {
    document.body.classList.toggle('dark-mode', dark);
    const lbl = document.getElementById('settings-theme-label');
    if (lbl) lbl.textContent = dark ? 'Ecrã Claro' : 'Ecrã Escuro';
    const encIcon = document.getElementById('enc-theme-icon');
    if (encIcon) encIcon.innerHTML = dark ? SUN : MOON;
    const settingsIcon = document.getElementById('settings-theme-icon');
    if (settingsIcon) settingsIcon.innerHTML = dark ? SUN : MOON;
  }
  // restore saved preference
  applyTheme(localStorage.getItem(KEY) === '1');

  window.toggleDarkMode = function () {
    const dark = !document.body.classList.contains('dark-mode');
    localStorage.setItem(KEY, dark ? '1' : '0');
    applyTheme(dark);
  };
})();

// ── Profile modal ─────────────────────────────────────────────────────────────
window.openProfileModal = function () {
  const u = S.currentUser;
  if (!u) return;
  document.getElementById('perfil-av-badge').textContent = u.initials || '';
  document.getElementById('perfil-nome-display').textContent = u.nome || '';
  document.getElementById('perfil-role-display').textContent = u.role || '';
  document.getElementById('perfil-nome-input').value = u.nome || '';
  document.getElementById('perfil-senha').value = '';
  document.getElementById('perfil-senha2').value = '';
  document.getElementById('modal-perfil').classList.add('open');
};

window.closePerfil = function () {
  document.getElementById('modal-perfil').classList.remove('open');
};

window.savePerfil = async function () {
  const nome = document.getElementById('perfil-nome-input').value.trim();
  const pass = document.getElementById('perfil-senha').value;
  const pass2 = document.getElementById('perfil-senha2').value;
  if (!nome) { showToast('Introduza um nome'); return; }
  if (pass && pass !== pass2) { showToast('As senhas não coincidem'); return; }
  const u = S.currentUser;
  if (!u) return;
  u.nome = nome;
  const initials = nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  u.initials = initials;
  document.getElementById('u-nm').textContent = nome;
  document.getElementById('u-av').textContent = initials;
  if (pass) {
    try {
      const { sb } = await import('./supabase.js');
      await sb.from('utilizadores').update({ nome, password: pass, initials }).eq('username', u.key);
    } catch (e) { showToast('Erro ao guardar no servidor'); return; }
  }
  closePerfil();
  showToast('Perfil actualizado');
};

// ── Hooks goTo: inicializa cada secção quando navegada ──
(function () {
  const _orig = window.goTo;
  window.goTo = function (id, btn) {
    _orig(id, btn);
    if (id === 'painel')       { renderPainel(); }
    if (id === 'faturas')      { seedFaturasDemo(); setupFatDropzone(); carregarTemplatesFaturas(); renderFaturas(); atualizaKPIs(); }
    if (id === 'compras')      { populaCmpObras(); renderCompras(); injectMapaCompBtns(); }
    if (id === 'equipamentos') { initEquipamentos(); }
    if (id === 'combustivel')  { _initCombustivelAdmin(); }
    if (id === 'fecho-mes')    { renderFechoMes(); }
    if (id === 'producao')          { renderProdDashboard(); }
    if (id === 'precos-unitarios')  { initPrecosUnit(); }
    if (id === 'fornecedores') { sbLoadFornecedores().then(() => renderFornecedores()); }
    if (id === 'mapas-comparativos') { sbLoadMapasComp().then(() => renderMapasComp()); }
    if (id === 'mapa-ferias')        { renderMapaFerias(); }
  };
})();

// ── Badge de compras ao iniciar ──
setTimeout(() => { try { atualizaKPIsCompras(); } catch (e) {} }, 500);

// ── Datetime widget ──
(function () {
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  let calVisible = null;
  let calYear, calMonth;

  function pad(n) { return String(n).padStart(2, '0'); }

  function updateClocks() {
    const now = new Date();
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateStr = `${DIAS[now.getDay()]}, ${now.getDate()} ${MESES_ABR[now.getMonth()]} ${now.getFullYear()}`;
    ['enc', 'adm'].forEach(function (s) {
      const c = document.getElementById('dw-clock-' + s);
      const d = document.getElementById('dw-date-' + s);
      if (c) c.textContent = timeStr;
      if (d) d.textContent = dateStr;
    });
  }

  function renderCal(suffix) {
    const cal = document.getElementById('dw-cal-' + suffix);
    if (!cal) return;
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const today = new Date();
    const y = calYear, m = calMonth;
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let html = `<div class="dw-cal-hdr">
      <button class="dw-cal-nav" onclick="dwNavCal('${suffix}',-1)">&#8592;</button>
      <span class="dw-cal-title">${MESES[m]} ${y}</span>
      <button class="dw-cal-nav" onclick="dwNavCal('${suffix}',1)">&#8594;</button>
    </div>
    <div class="dw-cal-grid">
      <div class="dw-cal-dow">Dom</div><div class="dw-cal-dow">Seg</div><div class="dw-cal-dow">Ter</div>
      <div class="dw-cal-dow">Qua</div><div class="dw-cal-dow">Qui</div><div class="dw-cal-dow">Sex</div><div class="dw-cal-dow">Sáb</div>`;
    for (var i = 0; i < firstDow; i++) html += '<div class="dw-cal-empty"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      html += `<button class="dw-cal-day${isToday ? ' today' : ''}">${d}</button>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  }

  window.dwToggleCal = function (suffix) {
    const cal = document.getElementById('dw-cal-' + suffix);
    const dateEl = document.getElementById('dw-date-' + suffix);
    if (!cal || !dateEl) return;
    if (calVisible === suffix) {
      cal.style.display = 'none'; calVisible = null;
    } else {
      if (calVisible) { const other = document.getElementById('dw-cal-' + calVisible); if (other) other.style.display = 'none'; }
      const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth();
      renderCal(suffix);
      const rect = dateEl.getBoundingClientRect();
      cal.style.top = (rect.bottom + 8) + 'px';
      cal.style.right = (window.innerWidth - rect.right) + 'px';
      cal.style.left = 'auto';
      cal.style.display = 'block';
      calVisible = suffix;
    }
  };

  window.dwNavCal = function (suffix, dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    renderCal(suffix);
  };

  document.addEventListener('click', function (e) {
    if (calVisible && !e.target.closest('.dw-wrap')) {
      const cal = document.getElementById('dw-cal-' + calVisible);
      if (cal) cal.style.display = 'none';
      calVisible = null;
    }
  });

  updateClocks();
  setInterval(updateClocks, 1000);
})();

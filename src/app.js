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
import { renderObras, editObra, saveObra, toggleObra } from './modules/obras.js';
import { renderColabs, editColab, saveColab, toggleColab } from './modules/colaboradores.js';
import { renderUsers, editUser, saveUser } from './modules/utilizadores.js';

// Permissões
import { loadPermissions, savePermissions, resetPermissions, readPermMatrixState, renderPermMatrix, onPermChange, switchUtilTab, applyStoredPermissions, applyRolePermissions } from './modules/permissions.js';

// Notificações
import { initNotifications, buildNotifications, agora, addNotification, renderNotifPanel, notifClick, toggleNotifPanel, closeNotifPanel, markAllRead } from './modules/notifications.js';

// Faturas
import { handleFatFiles, renderFaturas, limparFatFiltros, editarFatura, saveFatura, apagarFatura, exportFaturasXLSX, setupFatDropzone, atualizaKPIs, seedFaturasDemo } from './modules/faturas.js';

// Compras
import { renderCompras, editarCompra, saveCompra, apagarCompra, exportComprasXLSX, abrirMapaPicker, fecharMapaPicker, geocodeSearch, confirmarLocalizacao, limparLocalizacao, cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty, cmpAddForn, cmpRemoveForn, initCompras, atualizaKPIsCompras, populaCmpObras } from './modules/compras.js';

// Equipamentos
import { renderEquipamentos, openEqModal, editEquipamento, saveEquipamento, apagarEquipamento, refreshEqMap, showQrCode, printQrCode, showEqHistorico, exportEquipamentosXLSX, submitQrRegistration, initEquipamentos, initQrRegistration } from './modules/equipamentos.js';

// Combustível admin
import { loadCombustivelAdmin, toggleCombView, renderCombObraCards, exportCombustivelXLSX, _initCombustivelAdmin } from './modules/combustivel.js';

// Enc-ponto
import { initEnc, encPassarColaboradores, encVoltarScreen1, carregarEquipaAnterior, adicionarTodosOntem, encAddColab, encRemColab, encSubmeterRegisto, encGoMenuPonto, encGoFolhaPontoPlandese, encGoFolhaPonto, encGoHistoricoEnc, encLoadHistorico, encGoFolhaPontoAluguer, encGoEquipamentos, encGoCombustivel, encVoltarHome } from './modules/enc-ponto.js';

// Enc-equip
import { encScanNovamente, submitEncEquipamento } from './modules/enc-equip.js';

// Enc-combustivel + chat
import { depSetMovimento, encGoCombDeposito, encSubmeterCombDeposito, encGoCombViatura, combViaturaManual, combViaturaVoltarScanner, encSubmeterCombViatura, encGoComprasChat, chatOnInput, chatSend } from './modules/enc-combustivel.js';

// Enc-aluguer + MOA
import { loadEmpresasMOA, loadColaboradoresMOA, addColabMOA, removeColabMOA, renderEmpresasMOA, editEmpresaMOA, saveEmpresaMOA, toggleEmpresaMOA, encAlugPassarTrabalhadores, encAlugVoltarA, encAlugAddTrabalhador, encAlugSubmeter, encAlugRemover, applyMOAFilter, navMOASemana, exportMOAExcel, initMOAFilters } from './modules/enc-aluguer.js';

// Produção
import { initProducao, renderProdDashboard, coGoList, coOpenDetail, renderPrevFat, editPrevFat, savePrevFat, deletePrevFat, deletePrevFatFromDetail, editPrevFatFromDetail, renderAutos, editAuto, saveAuto, deleteAuto, deleteAutoFromDetail, editAutoFromDetail, clearCustoObra, custoDropzoneClick, custoHandleDrop, obraImportCustos, obraCustosHandleDrop, saveObraExtra, toggleAutosMes, toggleCustosPanel } from './modules/producao.js';

// Comercial
import { initComercial, renderComercial, openModalComercial, closeModalCom, editProposta, saveProposta, deleteProposta } from './modules/comercial.js';

// Admin/Painel
import { loadPainelConfig, savePainelConfig, renderPainel, buildWidget, openPainelCustomizer, closePainelCustomizer, savePainelCustomizer, painelWChkChange, painelObraChkChange, renderFechoMes, exportFechoMes } from './modules/admin.js';

// Fornecedores
import { sbLoadFornecedores, renderFornecedores, openModalFornecedor, saveFornecedor, apagarFornecedor, exportFornecedoresXLSX, fornPag, editarFornecedor } from './modules/fornecedores.js';

// Mapas comparativos
import { sbLoadMapasComp, renderMapasComp, openModalMapa, editarMapaComp, adicionarFornecedorMapa, removerFornecedorMapa, adicionarLinhaMapa, removerLinhaMapa, atualizarValorFornMapa, saveMapaComp, apagarMapaComp, abrirMapaComparativo, injectMapaCompBtns } from './modules/mapas-comp.js';

// Férias
import { renderMapaFerias, feriasNavAno, feriasTogglePrevista } from './modules/ferias.js';

// ── Registry R — permite que módulos chamem funções de outros módulos sem imports circulares ──
Object.assign(R, {
  carregarDados,
  mostrarDiag,
  initEnc,
  initAdmin,
  applyStoredPermissions, applyRolePermissions, renderPermMatrix,
  initNotifications,
  renderPainel, renderFaturas, renderCompras, renderObras,
  renderColabs, renderUsers, renderEquipamentos,
  loadCombustivelAdmin, renderProdDashboard, renderComercial,
  renderFechoMes, applyFilter, renderEmpresasMOA,
  loadEmpresasMOA, loadColaboradoresMOA,
  initCompras, initMOAFilters,
});

// ── Polyfill: expõe helpers globalmente para compatibilidade com HTML inline ──
window.fmt = fmt; window.fmtPT = fmtPT; window.calcH = calcH; window.fmtH = fmtH;

// ── Device detection ao carregar ──
applyDeviceClass();
window.addEventListener('resize', () => {
  const dt = applyDeviceClass();
  if (S.currentUser?.role === 'admin') updateDeviceBadge(dt);
});

// ── Login com Enter ──
document.getElementById('lp')?.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

// ── Expor todas as funções ao window para handlers HTML inline ──
Object.assign(window, {
  // Auth
  doLogin, doLogout,

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
  renderObras, saveObra, editObra, toggleObra, saveObraExtra,

  // Colaboradores
  renderColabs, saveColab, editColab, toggleColab,

  // Utilizadores
  renderUsers, saveUser, editUser, switchUtilTab,

  // Permissões
  savePermissions, resetPermissions, onPermChange,

  // Faturas
  handleFatFiles, renderFaturas, limparFatFiltros,
  editarFatura, saveFatura, apagarFatura, exportFaturasXLSX,

  // Compras
  renderCompras, editarCompra, saveCompra, apagarCompra,
  exportComprasXLSX, abrirMapaPicker, fecharMapaPicker,
  geocodeSearch, confirmarLocalizacao, limparLocalizacao,
  cmpRenderArtPicker, cmpAddArtigo, cmpRemoveArtigo, cmpUpdateArtigoQty,
  cmpAddForn, cmpRemoveForn,

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

  // Produção / Controlo de Obras
  coGoList, coOpenDetail,
  editAutoFromDetail, deleteAutoFromDetail,
  editPrevFatFromDetail, deletePrevFatFromDetail,
  obraImportCustos, obraCustosHandleDrop, clearCustoObra,
  editPrevFat, deletePrevFat, savePrevFat,
  editAuto, deleteAuto, saveAuto,
  custoDropzoneClick, custoHandleDrop,
  toggleAutosMes, toggleCustosPanel,
  exportSemanaExcel,

  // Comercial
  openModalComercial, closeModalCom,
  editProposta, saveProposta, deleteProposta,

  // Notificações
  toggleNotifPanel, notifClick,

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
  saveMapaComp, apagarMapaComp, abrirMapaComparativo,

  // Chat compras
  encGoComprasChat, chatSend, chatOnInput,

  // Férias
  renderMapaFerias, feriasNavAno, feriasTogglePrevista,
});

// ── Hooks goTo: inicializa cada secção quando navegada ──
(function () {
  const _orig = window.goTo;
  window.goTo = function (id, btn) {
    _orig(id, btn);
    if (id === 'painel')       { renderPainel(); }
    if (id === 'faturas')      { seedFaturasDemo(); setupFatDropzone(); renderFaturas(); atualizaKPIs(); }
    if (id === 'compras')      { populaCmpObras(); renderCompras(); injectMapaCompBtns(); }
    if (id === 'equipamentos') { initEquipamentos(); }
    if (id === 'combustivel')  { _initCombustivelAdmin(); }
    if (id === 'comercial')    { initComercial(); }
    if (id === 'fecho-mes')    { renderFechoMes(); }
    if (id === 'producao')     { renderProdDashboard(); }
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

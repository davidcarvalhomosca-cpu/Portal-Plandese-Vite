// ═══════════════════════════════════════
//  STATE — Estado partilhado mutável
// ═══════════════════════════════════════
import { COLABORADORES_BASE, USERS_BASE } from './config.js';

// Registry de callbacks — preenchido por app.js após todos os imports.
// Permite que módulos chamem funções de outros módulos sem imports circulares.
export const R = {};

export const S = {
  COLABORADORES: [...COLABORADORES_BASE],
  OBRAS: [],
  USERS: {...USERS_BASE},
  REGISTOS: {},
  activeRows: {},
  currentUser: null,
  currentDate: (() => { const d = new Date(); d.setHours(12,0,0,0); return d; })(),
  encObraId: '',
  saveTimer: null,
  encDataSel: '',
  encHoraIni: '08:00',
  encHoraFim: '17:00',
  NOTIFICACOES: [],
  notifPanelOpen: false,
  FORNECEDORES: [],
  _fornPage: 0,
  MAPAS_COMP: [],
  _mcMapaAtual: null,
  _mcFornecedores: [],
  _mcLinhas: [],
};

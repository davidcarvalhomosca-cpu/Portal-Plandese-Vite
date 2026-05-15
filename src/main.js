// ===================================================
//  MAIN.JS - Ponto de entrada Vite
//  Importa estilos e toda a logica da app
// ===================================================
import './styles/global.css';

// Leaflet — exposto como global para compatibilidade com app.js (usa L.map, L.tileLayer, etc.)
import L from 'leaflet';
window.L = L;

// Html5Qrcode — exposto como global para compatibilidade com app.js (usa Html5Qrcode para QR scanner)
import { Html5Qrcode } from 'html5-qrcode';
window.Html5Qrcode = Html5Qrcode;

// Importa a logica completa da aplicacao (migrada de portal_antigo.html)
// app.js ja importa: supabase.js, config.js, utils/helpers.js
import './app.js';

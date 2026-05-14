// ===================================================
//  MAIN.JS - Ponto de entrada Vite
//  Importa estilos e toda a logica da app
// ===================================================
import './styles/global.css';

// Leaflet — exposto como global para compatibilidade com app.js (usa L.map, L.tileLayer, etc.)
import L from 'leaflet';
window.L = L;

// Importa a logic
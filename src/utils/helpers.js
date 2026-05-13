// =======================================
//  UTILS - Funcoes auxiliares puras
// =======================================

export const fmt = (d) => d.toISOString().split('T')[0];

export const fmtPT = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

export const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

export function getMonday(d) {
  const c = new Date(d);
  const day = c.getDay(), diff = c.getDate() - day + (day === 0 ? -6 : 1);
  c.setDate(diff);
  return c;
}

export function dayShort(d) {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][d.getDay()];
}

export function dayLong(d) {
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function calcH(ent, sai, dateObj) {
  if (!ent || !sai) return { n: 0, e: 0, t: 0 };
  const [eh, em] = ent.split(':').map(Number);
  const [sh, sm] = sai.split(':').map(Number);
  let m = (sh * 60 + sm) - (eh * 60 + em);
  if (m <= 0) return { n: 0, e: 0, t: 0 };
  const eM = eh * 60 + em, sM = sh * 60 + sm;
  if (eM < 780 && sM > 720) {
    const ov = Math.min(sM, 780) - Math.max(eM, 720);
    if (ov > 0) m -= ov;
  }
  if (m <= 0) return { n: 0, e: 0, t: 0 };
  const t = m / 60, we = isWeekend(dateObj);
  const n = we ? 0 : Math.min(t, 8), e = we ? t : Math.max(0, t - 8);
  const r = v => Math.round(v * 100) / 100;
  return { n: r(n), e: r(e), t: r(t) };
}

export const fmtH = (h) => {
  if (!h || h === 0) return '—';
  const hrs = Math.floor(h), m = Math.round((h - hrs) * 60);
  return hrs + 'h' + (m > 0 ? String(m).padStart(2, '0') : '');
};

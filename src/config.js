// ═══════════════════════════════════════
//  CONFIG — CONSTANTES GLOBAIS
// ═══════════════════════════════════════

export const COLABORADORES_BASE = [
  {n:3,nome:'Leopoldo Martins',func:'Encarregado',ativo:true},{n:4,nome:'Artur Jorge',func:'Encarregado',ativo:true},
  {n:6,nome:'Orlando Cruz',func:'Manobrador',ativo:true},{n:7,nome:'Luis Vitor',func:'Encarregado',ativo:true},
  {n:11,nome:'Jesus Rosário',func:'Encarregado',ativo:true},{n:14,nome:'Fernando Costa',func:'Pedreiro',ativo:true},
  {n:15,nome:'João Coelho',func:'Encarregado',ativo:true},{n:17,nome:'Eidy Ramos',func:'Servente',ativo:true},
  {n:20,nome:'Valdimir Ferreira',func:'Pedreiro',ativo:true},{n:21,nome:'Mykhaylo Putsil',func:'Pedreiro',ativo:true},
  {n:24,nome:'Robert Martins',func:'Servente',ativo:true},{n:25,nome:'Vasyl Dychko',func:'Manobrador',ativo:true},
  {n:26,nome:'Hugo Luis',func:'Encarregado',ativo:true},{n:28,nome:'Sebastião Ferreira',func:'Servente',ativo:true},
  {n:35,nome:'Tiago Costa',func:'Servente',ativo:true},{n:37,nome:'Inocencio José',func:'Manobrador',ativo:true},
  {n:38,nome:'Elvis Ramos',func:'Servente',ativo:true},{n:39,nome:'Ronei Pedrouza',func:'Servente',ativo:true},
  {n:40,nome:'Suk Kooner',func:'Servente',ativo:true},{n:42,nome:'José Rodrigues',func:'Manobrador',ativo:true},
  {n:44,nome:'Domingos Cruz',func:'Servente',ativo:true},{n:45,nome:'Elves Fonseca',func:'Calceteiro',ativo:true},
  {n:49,nome:'Armindo Charrua',func:'Encarregado',ativo:true},{n:50,nome:'Diogo José',func:'Motorista',ativo:true},
  {n:51,nome:'Bruno Pereira',func:'Servente',ativo:true},{n:52,nome:'David Gonçalves',func:'Encarregado',ativo:true},
  {n:54,nome:'Sundeep Kumar',func:'Servente',ativo:true},{n:55,nome:'Lal Ji',func:'Servente',ativo:true},
  {n:56,nome:'Sukhvir Singh',func:'Servente',ativo:true},{n:57,nome:'Onkar Chand',func:'Canalizador',ativo:true},
  {n:58,nome:'Leandro Pires',func:'Manobrador',ativo:true},{n:60,nome:'Joaquim Pereira',func:'Manobrador',ativo:true},
  {n:61,nome:'Valdemar Rebelo',func:'Encarregado',ativo:true},{n:62,nome:'Domingos da Silva',func:'Servente',ativo:true},
  {n:63,nome:'José Carvalho',func:'Pedreiro',ativo:true},{n:64,nome:'Nuno Farinho',func:'Motorista',ativo:true},
  {n:65,nome:'Edilson Jorge',func:'Canalizador',ativo:true},{n:66,nome:'Said Moussa',func:'Motorista',ativo:true},
  {n:68,nome:'Manuel Mendonça',func:'Servente',ativo:true},{n:70,nome:'Eduardo Miguel',func:'Manobrador',ativo:true},
  {n:72,nome:'António Morgado',func:'Manobrador',ativo:true},{n:73,nome:'Vitor Arraes',func:'Manobrador',ativo:true},
  {n:74,nome:'Pablo Rocha',func:'Manobrador',ativo:true},{n:76,nome:'Dimas Moreira',func:'Servente',ativo:true},
  {n:77,nome:'Mamadu Serra',func:'Manobrador',ativo:true},{n:78,nome:'Horácio Freitas',func:'Manobrador',ativo:true},
  {n:79,nome:'Lucas Lopes',func:'Pedreiro',ativo:true},{n:80,nome:'Baldeep Singh',func:'Servente',ativo:true},
  {n:81,nome:'Harinder Singh',func:'Servente',ativo:true},{n:82,nome:'Manpreet',func:'Servente',ativo:true},
  {n:83,nome:'Kulwinder Pal',func:'Aj. Canalizador',ativo:true},{n:84,nome:'Sajan Kumar',func:'Aj. Canalizador',ativo:true},
];

export const USERS_BASE = {
  'admin':{pass:'plandese2024',nome:'Administrador',initials:'AD',role:'admin'},
};

export const ROLE_LABELS = {
  'admin':       'Administrador',
  'diretor_obra':'Diretor de Obra',
  'compras':     'Compras',
  'financeiro':  'Financeiro',
  'comercial':   'Comercial',
  'encarregado': 'Encarregado'
};

export const ROLE_ACCESS = {
  'admin':        {sections:['historico','compras','faturas','equipamentos','combustivel','producao','obras','colaboradores','utilizadores','empresas-moa'], default:'historico'},
  'diretor_obra': {sections:['historico','compras','faturas','equipamentos','combustivel','producao','obras','colaboradores','empresas-moa'], default:'historico'},
  'compras':      {sections:['compras'], default:'compras'},
  'financeiro':   {sections:['faturas','compras'], default:'faturas'},
  'comercial':    {sections:['comercial'], default:'comercial'},
};

export const NAV_GROUP_SECTIONS = {
  'rh':  ['historico'],
  'cmp': ['compras'],
  'fin': ['faturas'],
  'log': ['equipamentos','combustivel'],
  'prod':['producao'],
  'def': ['obras','colaboradores','utilizadores','empresas-moa'],
  'com': ['comercial']
};

export const TIPOS = ['Normal','Hora Extra','Falta Just.','Falta Injust.','Folga','Feriado'];
export const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const DIAS_PT_EXP = ['Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado','Domingo'];

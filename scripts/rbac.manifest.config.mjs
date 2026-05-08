export const RBAC_MANIFEST_VERSION = 1;

export const modules = [
  { key: 'DASHBOARD', nombre: 'Dashboard' },
  { key: 'PRODUCTOS', nombre: 'Productos' },
  { key: 'INVENTARIO', nombre: 'Inventario' },
  { key: 'FACTURAS', nombre: 'Facturas' },
  { key: 'RESERVAS', nombre: 'Reservas' },
  { key: 'CONTABILIDAD', nombre: 'Contabilidad' },
  { key: 'USUARIOS', nombre: 'Usuarios' },
];

export const modulePermissions = {
  DASHBOARD: ['DASHBOARD.VER'],
  PRODUCTOS: ['PRODUCTOS.VER', 'PRODUCTOS.CREAR'],
  INVENTARIO: ['INVENTARIO.VER', 'INVENTARIO.MOVIMIENTO.CREAR'],
  FACTURAS: ['FACTURAS.VER', 'FACTURAS.CREAR', 'FACTURAS.CERRAR'],
  RESERVAS: ['RESERVAS.VER', 'RESERVAS.CREAR', 'RESERVAS.REPROGRAMAR'],
  CONTABILIDAD: [
    'CONTABILIDAD.VER',
    'CONTABILIDAD.INGRESO.CREAR',
    'CONTABILIDAD.EGRESO.CREAR',
  ],
  USUARIOS: [
    'USUARIOS.VER',
    'USUARIOS.CREAR',
    'USUARIOS.ROL.CAMBIAR',
    'USUARIOS.ESTADO.CAMBIAR',
    'USUARIOS.ROLES_CREABLES.CONFIGURAR',
  ],
};

export const permissions = [
  { clave: 'DASHBOARD.VER', moduloKey: 'DASHBOARD', nombre: 'Ver dashboard' },

  { clave: 'PRODUCTOS.VER', moduloKey: 'PRODUCTOS', nombre: 'Ver productos' },
  { clave: 'PRODUCTOS.CREAR', moduloKey: 'PRODUCTOS', nombre: 'Crear productos' },

  { clave: 'INVENTARIO.VER', moduloKey: 'INVENTARIO', nombre: 'Ver inventario' },
  {
    clave: 'INVENTARIO.MOVIMIENTO.CREAR',
    moduloKey: 'INVENTARIO',
    nombre: 'Registrar movimientos de inventario',
  },

  { clave: 'FACTURAS.VER', moduloKey: 'FACTURAS', nombre: 'Ver facturas' },
  { clave: 'FACTURAS.CREAR', moduloKey: 'FACTURAS', nombre: 'Crear facturas' },
  { clave: 'FACTURAS.CERRAR', moduloKey: 'FACTURAS', nombre: 'Cerrar facturas' },

  { clave: 'RESERVAS.VER', moduloKey: 'RESERVAS', nombre: 'Ver reservas' },
  { clave: 'RESERVAS.CREAR', moduloKey: 'RESERVAS', nombre: 'Crear reservas' },
  {
    clave: 'RESERVAS.REPROGRAMAR',
    moduloKey: 'RESERVAS',
    nombre: 'Reprogramar reservas',
  },

  { clave: 'CONTABILIDAD.VER', moduloKey: 'CONTABILIDAD', nombre: 'Ver contabilidad' },
  {
    clave: 'CONTABILIDAD.INGRESO.CREAR',
    moduloKey: 'CONTABILIDAD',
    nombre: 'Registrar ingresos',
  },
  {
    clave: 'CONTABILIDAD.EGRESO.CREAR',
    moduloKey: 'CONTABILIDAD',
    nombre: 'Registrar egresos',
  },

  { clave: 'USUARIOS.VER', moduloKey: 'USUARIOS', nombre: 'Ver usuarios' },
  { clave: 'USUARIOS.CREAR', moduloKey: 'USUARIOS', nombre: 'Crear usuarios' },
  {
    clave: 'USUARIOS.ROL.CAMBIAR',
    moduloKey: 'USUARIOS',
    nombre: 'Cambiar rol de usuarios',
  },
  {
    clave: 'USUARIOS.ESTADO.CAMBIAR',
    moduloKey: 'USUARIOS',
    nombre: 'Cambiar estado de usuarios',
  },
  {
    clave: 'USUARIOS.ROLES_CREABLES.CONFIGURAR',
    moduloKey: 'USUARIOS',
    nombre: 'Configurar roles creables',
  },
];

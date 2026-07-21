/** Etiquetas legibles e íconos para claves de permisos RBAC. */

const VERBOS: Record<string, string> = {
  VER: 'Ver', CREAR: 'Crear', EDITAR: 'Editar', ELIMINAR: 'Eliminar',
  GESTIONAR: 'Gestionar', CERRAR: 'Cerrar', CAMBIAR: 'Cambiar',
  CONFIGURAR: 'Configurar', REPROGRAMAR: 'Reprogramar', INGRESO: 'Ingreso',
  EGRESO: 'Egreso', MOVIMIENTO: 'Movimiento', UNIDADES: 'Unidades',
  CONVERSIONES: 'Conversiones', TRANSFORMACIONES: 'Transformaciones',
  CATEGORIAS: 'Categorías', MARCAS: 'Marcas', RECETAS: 'Recetas', ROL: 'Rol',
  ESTADO: 'Estado', ROLES_CREABLES: 'Roles creables', MODIFICAR_PRECIO: 'Modificar precio',
}

const ICONOS_MODULO: Record<string, string> = {
  DASHBOARD: '📊', PRODUCTOS: '🏷️', INVENTARIO: '📦', FACTURAS: '🧾',
  RESERVAS: '📅', CONTABILIDAD: '💰', USUARIOS: '👥', CONFIGURACIONES: '⚙️',
  GLOBAL: '🌐', OTROS: '🔑',
}

/** Módulo derivado de la clave (parte antes del primer punto). `*` → GLOBAL. */
export function moduloDe(clave: string): string {
  if (!clave || clave === '*') return 'GLOBAL'
  return clave.includes('.') ? clave.split('.')[0] : 'GLOBAL'
}

export function iconoModulo(modulo: string): string {
  return ICONOS_MODULO[modulo] ?? '🔑'
}

/** Nombre legible de la acción (sin el prefijo del módulo). */
export function accionLabel(clave: string, modulo?: string | null): string {
  if (clave === '*') return 'Acceso total'
  const prefijo = (modulo ?? '').toUpperCase() + '.'
  const resto = clave.toUpperCase().startsWith(prefijo) ? clave.slice(prefijo.length) : clave
  return resto
    .split('.')
    .map(p => VERBOS[p] ?? (p.charAt(0) + p.slice(1).toLowerCase()))
    .join(' · ')
}

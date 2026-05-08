// ─────────────────────────────────────────────
// Types centrales derivados del modelo de BD
// ─────────────────────────────────────────────
// Convención de campos:
//   Auto-generados (no los llena el usuario):
//     - PK (cod*_*) → IDENTITY
//     - usercrea, usermod → desde JWT (audit)
//     - fechcrea, fechmod → GETDATE() en BD
//     - estado_* → default 'A', se cambia con acciones
//   FK (selección vía dropdown/modal, no texto libre):
//     - codneg_* → desde sesión activa
//     - codper_* → vía modal de búsqueda de persona
//     - codrol_* → vía dropdown de roles
//     - codcat_*, codmar_* → vía dropdown
//   Campos que el usuario llena directamente:
//     - nombre_*, codigo_*, precio_*, cantidad_*, detalle_*, etc.
// ─────────────────────────────────────────────

/* ══════════ Auditoría (común) ══════════ */
export interface AuditFields {
  usercrea?: number | null
  usermod?: number | null
  fechcrea?: string | null
  fechmod?: string | null
}

/* ══════════ Persona ══════════ */
export interface Persona extends AuditFields {
  codper: number                  // PK auto
  nombre_per: string              // usuario llena
  apellido_per: string            // usuario llena
  email_per?: string | null       // usuario llena (unique)
  telefono_per?: string | null    // usuario llena
  direccion_per?: string | null   // usuario llena
  codsex_per?: string | null      // FK → sexo (dropdown: M/F)
  fecnac_per?: string | null      // usuario llena (date picker)
  estado_per?: string | null      // auto: 'A' default
}

/** DTO para crear persona (campos que el usuario llena) */
export interface PersonaCreate {
  nombre: string
  apellido: string
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  codsex?: string | null
  fecnac?: string | null
}

/* ══════════ Sexo ══════════ */
export interface Sexo {
  codsex: string         // PK: 'M' | 'F'
  nombre: string         // (display)
}

/* ══════════ Negocio ══════════ */
export interface Negocio extends AuditFields {
  codneg: number                  // PK auto
  nombre: string                  // usuario llena
  codtng?: number | null          // FK → tipos_negocio (dropdown)
  direccion?: string | null       // usuario llena
  telefono?: string | null        // usuario llena
  estado?: string | null          // auto
}

export interface TipoNegocio {
  codtng: number
  nombre: string
}

/* ══════════ Rol ══════════ */
export interface Rol extends AuditFields {
  codrol: number                  // PK auto
  nombre: string                  // usuario llena
  descripcion?: string | null     // usuario llena
  nivel?: number | null           // usuario llena
  estado?: string | null          // auto
}

/* ══════════ Usuario ══════════ */
export interface Usuario extends AuditFields {
  codusr: string                  // PK (varchar(8)) — usuario lo define o se genera
  nombre_usr: string              // usuario llena (login name)
  codper?: number | null          // FK → persona (seleccionada vía modal)
  codrol?: number | null          // FK → rol (dropdown global)
  esdueno?: boolean               // admin define
  loginmulti?: boolean            // admin define
  estado?: string | null          // auto: 'A'
  // Campos de display (joins)
  persona_nombre?: string | null
  persona_apellido?: string | null
  rol_nombre?: string | null
}

/** DTO para crear usuario (lo que el usuario y admin llenan) */
export interface UsuarioCreate {
  codusr: string           // admin define (máx 8 chars)
  nombre_usr: string       // admin define (nombre de login)
  password: string         // admin define
  codper: number           // FK → persona (modal de búsqueda)
  codrol?: number | null   // FK → rol (dropdown)
  esdueno?: boolean
  loginmulti?: boolean
}

/* ══════════ Usuario–Negocio (asignación) ══════════ */
export interface UsuarioNegocio {
  codusr: string           // FK → usuario
  codneg: number           // FK → negocio (de sesión)
  codrol?: number | null   // FK → rol en ese negocio (dropdown)
  estado?: string | null
  // Display
  nombre_usr?: string
  persona_nombre?: string
  rol_nombre?: string
}

/* ══════════ Categoría ══════════ */
export interface Categoria extends AuditFields {
  codcat: number           // PK auto
  nombre: string           // usuario llena
  codneg?: number | null   // FK → negocio (de sesión)
  estado?: string | null   // auto
}

/* ══════════ Marca ══════════ */
export interface Marca extends AuditFields {
  codmar: number           // PK auto
  nombre: string           // usuario llena
  codneg?: number | null   // FK → negocio (de sesión)
  estado?: string | null   // auto
}

/* ══════════ Producto ══════════ */
export interface Producto extends AuditFields {
  codprd: number                  // PK auto
  codneg: number                  // FK → negocio (de sesión, auto)
  nombre: string                  // usuario llena
  codigo?: string | null          // usuario llena (opcional)
  codcat?: number | null          // FK → categoría (dropdown)
  codmar?: number | null          // FK → marca (dropdown)
  stockmin?: number | null        // usuario llena (opcional, ≥0)
  estado?: string | null          // auto
  // Display (joins)
  categoria_nombre?: string | null
  marca_nombre?: string | null
  precio?: number | null          // desde producto_det
  stock?: number | null           // desde inventario
}

/** DTO para crear producto */
export interface ProductoCreate {
  nombre: string
  codigo?: string | null
  codcat?: number | null
  codmar?: number | null
  stockmin?: number | null
}

/** DTO para editar producto */
export interface ProductoUpdate {
  nombre?: string
  codigo?: string | null
  codcat?: number | null
  codmar?: number | null
  stockmin?: number | null
  estado?: 'A' | 'I'
}

/* ══════════ Producto Detalle ══════════ */
export interface ProductoDetalle extends AuditFields {
  codpdt: number           // PK auto
  codprd: number           // FK → producto (auto)
  precio?: number | null   // compat: precio de venta
  precio_venta?: number | null
  precio_compra?: number | null
  costo_unitario_referencia?: number | null
  costo_unitario_estimado?: number | null
  existencia?: number      // legacy (usar inventario.stock_inv)
}

/* ══════════ Inventario ══════════ */
export interface InventarioItem {
  codinv: number           // PK auto
  codneg: number           // FK → negocio (de sesión)
  codprd: number           // FK → producto
  stock: number            // auto (actualizado por triggers)
  // Display
  producto_nombre?: string | null
  producto_codigo?: string | null
  stockmin?: number | null
}

/* ══════════ Movimiento de Inventario ══════════ */
export interface MovimientoInventario extends AuditFields {
  codmin: number                       // PK auto
  codinv: number                       // FK → inventario (auto-resuelto)
  tipo: 'entrada' | 'salida' | 'ajuste'  // usuario selecciona (dropdown)
  cantidad: number                     // usuario llena (>0)
  fecha?: string | null                // auto GETDATE()
  codusr?: string | null               // auto (desde JWT)
  detalle?: string | null              // usuario llena (opcional)
  // Display
  producto_nombre?: string | null
}

/** DTO para crear movimiento */
export interface MovimientoCreate {
  codprd: number                       // FK → producto (dropdown/búsqueda)
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  detalle?: string | null
}

/* ══════════ Cliente ══════════ */
export interface Cliente extends AuditFields {
  codcli: number           // PK auto
  codneg: number           // FK → negocio (de sesión)
  codper: number           // FK → persona (modal)
  estado?: string | null
  // Display
  persona_nombre?: string | null
  persona_apellido?: string | null
  email?: string | null
  telefono?: string | null
}

/* ══════════ Proveedor ══════════ */
export interface Proveedor extends AuditFields {
  codpro: number           // PK auto
  codneg: number           // FK → negocio (de sesión)
  codper: number           // FK → persona (modal)
  estado?: string | null
  // Display
  persona_nombre?: string | null
  persona_apellido?: string | null
  email?: string | null
  telefono?: string | null
}

/* ══════════ Factura ══════════ */
export interface Factura extends AuditFields {
  codfac: number                  // PK auto
  codneg: number                  // FK → negocio (de sesión, auto)
  tipo: 'venta' | 'compra'       // usuario selecciona (dropdown)
  estado?: string | null          // auto: 'abierta' → 'cerrada'
  fecha?: string | null           // auto GETDATE()
  codcli?: number | null          // FK → cliente (modal/dropdown)
  codpro?: number | null          // FK → proveedor (modal/dropdown)
  total?: number | null           // calculado
  detalle?: string | null         // usuario llena (opcional)
  // Display
  cliente_nombre?: string | null
  proveedor_nombre?: string | null
}

/** DTO para crear factura */
export interface FacturaCreate {
  tipo: 'venta' | 'compra'
  codcli?: number | null   // solo si es venta
  codpro?: number | null   // solo si es compra
  detalle?: string | null
}

/* ══════════ Factura Detalle (línea) ══════════ */
export interface FacturaLinea extends AuditFields {
  codfdt: number           // PK auto
  codfac: number           // FK → factura (auto, context)
  codprd: number           // FK → producto (dropdown/búsqueda)
  cantidad: number         // usuario llena
  precio?: number | null   // usuario llena o se toma del producto
  subtotal?: number | null // calculado
  // Display
  producto_nombre?: string | null
}

/** DTO para agregar línea a factura */
export interface FacturaLineaCreate {
  codprd: number           // FK → producto (búsqueda/dropdown)
  cantidad: number         // usuario llena
  precio?: number | null   // usuario llena (o auto del producto)
}

/* ══════════ Reserva ══════════ */
export interface Reserva extends AuditFields {
  codres: number                  // PK auto
  codneg: number                  // FK → negocio (de sesión)
  fecini: string                  // usuario llena (datetime picker)
  fecfin: string                  // usuario llena (datetime picker)
  estado?: string | null          // auto
  detalle?: string | null         // usuario llena
  codcli?: number | null          // FK → cliente (modal)
  codusr?: string | null          // auto (from JWT)
  // Display
  cliente_nombre?: string | null
}

/** DTO para crear reserva */
export interface ReservaCreate {
  fecini: string
  fecfin: string
  detalle?: string | null
  codcli?: number | null
}

/** DTO para reprogramar reserva */
export interface ReservaReprogramar {
  fecini: string
  fecfin: string
}

/* ══════════ Cuenta Contable ══════════ */
export interface CuentaContable extends AuditFields {
  codcta: number           // PK auto
  codneg: number           // FK → negocio (de sesión)
  nombre: string           // usuario llena
  tipo?: string | null     // usuario llena (dropdown: activo/pasivo/etc.)
  estado?: string | null   // auto
}

/* ══════════ Ingreso ══════════ */
export interface Ingreso extends AuditFields {
  coding: number                  // PK auto
  codneg: number                  // FK → negocio (de sesión)
  codcta?: number | null          // FK → cuenta (dropdown)
  monto: number                   // usuario llena
  fecha?: string | null           // usuario llena o auto
  detalle?: string | null         // usuario llena
  codusr?: string | null          // auto (JWT)
  // Display
  cuenta_nombre?: string | null
}

/** DTO para crear ingreso */
export interface IngresoCreate {
  codcta?: number | null   // FK → cuenta (dropdown)
  monto: number
  fecha?: string | null
  detalle?: string | null
}

/* ══════════ Egreso ══════════ */
export interface Egreso extends AuditFields {
  codegr: number                  // PK auto
  codneg: number                  // FK → negocio (de sesión)
  codcta?: number | null          // FK → cuenta (dropdown)
  monto: number                   // usuario llena
  fecha?: string | null           // usuario llena o auto
  detalle?: string | null         // usuario llena
  codusr?: string | null          // auto (JWT)
  // Display
  cuenta_nombre?: string | null
}

/** DTO para crear egreso */
export interface EgresoCreate {
  codcta?: number | null
  monto: number
  fecha?: string | null
  detalle?: string | null
}

/* ══════════ Unidades de Medida ══════════ */
export interface UnidadMedida extends AuditFields {
  codumd: number           // PK auto
  nombre: string           // usuario llena
  simbolo?: string | null  // usuario llena (ej: kg, ml, u)
  tipo: string             // usuario llena (ej: volumen, conteo, peso)
  estado?: string | null
}

/** DTO para crear unidad de medida */
export interface UnidadMedidaCreate {
  nombre: string
  simbolo?: string | null
  tipo: string
}

/* ══════════ Conversión de UM ══════════ */
export interface ConversionUM extends AuditFields {
  codcnv: number           // PK auto
  codneg: number           // FK → negocio (de sesión)
  codumd_origen: number    // FK → unidad (dropdown)
  codumd_destino: number   // FK → unidad (dropdown)
  factor: number           // usuario llena (cantidad_origen * factor = cantidad_destino)
  estado?: string | null
  // Display
  nombre_origen?: string | null
  simbolo_origen?: string | null
  nombre_destino?: string | null
  simbolo_destino?: string | null
}

/** DTO para crear conversión */
export interface ConversionUMCreate {
  codumd_origen: number
  codumd_destino: number
  factor: number
}

/* ══════════ Producto - Unidad de Medida (unidad base por producto) ══════════ */
export interface ProductoUM extends AuditFields {
  codpum: number           // PK auto
  codneg: number           // FK → negocio
  codprd: number           // FK → producto
  codumd: number           // FK → unidad (dropdown)
  factor_inventario?: number // usualmente 1
  // Display
  nombre_unidad?: string | null
  simbolo_unidad?: string | null
}

/* ══════════ Composición / Receta (BOM) ══════════ */
export interface ProductoComposicion extends AuditFields {
  codpco: number           // PK auto
  codneg: number           // FK → negocio
  codprd_final: number     // FK → producto final
  codprd_insumo: number    // FK → producto insumo (búsqueda)
  cantidad: number         // usuario llena
  estado?: string | null
  // Display
  nombre_insumo?: string | null
  codigo_insumo?: string | null
}

/** Producto con receta (vista resumida) */
export interface ProductoConReceta {
  codprd: number
  nombre: string
  codigo?: string | null
  num_insumos: number
}

/** DTO para definir composición/receta */
export interface ComposicionInsumoDTO {
  codprd_insumo: number
  cantidad: number
}

/* ══════════ Transformación ══════════ */
export interface Transformacion extends AuditFields {
  codtrf: number           // PK auto
  codneg: number           // FK → negocio
  fecha?: string | null    // auto GETDATE()
  tipo?: string | null     // usuario llena (default: 'manual')
  estado?: string | null   // auto (aplicada)
  codusr?: string | null   // auto (JWT)
  detalle?: string | null  // usuario llena
  num_items?: number       // conteo de items
}

export interface TransformacionDetalle {
  codtfd: number           // PK auto
  codtrf: number           // FK → transformación
  codprd: number           // FK → producto (búsqueda)
  tipo: 'salida' | 'entrada'  // usuario selecciona
  cantidad: number         // usuario llena
  detalle?: string | null  // usuario llena (opcional)
  // Display
  nombre_producto?: string | null
  codigo_producto?: string | null
}

/** Transformación completa con items */
export interface TransformacionCompleta extends Transformacion {
  items: TransformacionDetalle[]
}

/** DTO para crear item de transformación */
export interface TransformacionItemDTO {
  codprd: number
  tipo: 'entrada' | 'salida'
  cantidad: number
  detalle?: string | null
}

/* ══════════ Producto con Detalles (vista consolidada) ══════════ */
export interface ProductoConDetalles extends Producto {
  stock: number
  precio: number
  precio_venta?: number | null
  precio_compra?: number | null
  costo_unitario_referencia?: number | null
  costo_unitario_estimado?: number | null
  codumd?: number | null
  unidad?: string | null
  simbolo_unidad?: string | null
  tiene_receta: boolean
  categoria?: string | null
  marca?: string | null
}

/* ══════════ Configuración Sistema / Negocio ══════════ */
export interface ConfiguracionSistema {
  codcfs: number
  clave: string
  valor?: string | null
}

export interface ConfiguracionNegocio {
  codcfn: number
  codneg: number
  clave: string
  valor?: string | null
}

/* ══════════ Permisos / RBAC ══════════ */
export interface Permiso {
  clave: string
  nombre: string
  detalle?: string | null
  moduloKey?: string | null
}

export interface RolPermiso {
  codrol: number
  clave_prm: string
}

/* ══════════ Dashboard ══════════ */
export interface DashboardNegocio {
  codneg: number | string
  nombre: string
  productos_activos: number
  stock_total: number
  facturas_30d: number
  facturas_abiertas: number
  reservas_7d: number
  ingresos_30d: number
  egresos_30d: number
}

export interface DashboardResumen {
  productos_activos: number
  stock_total: number
  facturas_30d: number
  facturas_abiertas: number
  reservas_7d: number
  ingresos_30d: number
  egresos_30d: number
}

export interface DashboardAlerta {
  key: string
  titulo: string
  detalle: string
  items?: any[]
}

/* ══════════ Auth ══════════ */
export interface AuthUser {
  codusr: string
  codper?: number
  nombre?: string
  codrol?: string | number | null
  codneg?: string | number | null
  audit?: unknown
  esdueno?: boolean
  loginmulti?: boolean
  isAdmin?: boolean
}

export interface NegocioSesion {
  codneg: string | number
  nombre: string
  esdueno?: boolean
  esprincipal?: boolean
}

/* ══════════ API Response ══════════ */
export interface AuthzCheckResponse {
  ok?: boolean
  codneg?: number | null
  permisos?: Record<string, boolean>
}

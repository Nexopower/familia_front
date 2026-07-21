// Restore original centralized shared types for the frontend (compact aliases + interfaces)
// Centralized shared types for the frontend
export type AuthUser = {
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

export type Negocio = {
  codneg: string | number
  nombre: string
  esdueno?: boolean
  esprincipal?: boolean
}

export type NegocioUI = Negocio

export type MiNegocio = {
  codneg: number
  nombre: string
  esdueno?: boolean
  esprincipal?: boolean
  codrol?: number | null
  nombre_rol?: string | null
}

export type AdminNegocio = {
  codneg: number
  nombre: string
  telefono?: string | null
  estado: 'A' | 'I'
  direccion?: string | null
  coddir?: number | null
  stock_min_default?: number | null
}

export type NegocioTabla = {
  codneg: number
  nombre: string
  estado: 'A' | 'I'
  direccion?: string | null
  coddir?: number | null
  telefono?: string | null
  stock_min_default?: number | null
  accesoUsuario: boolean
  esdueno?: boolean
  esprincipal?: boolean
  codrol?: number | null
  nombre_rol?: string | null
}

export type PermisoItem = {
  codprm: number
  clave: string
  nombre: string
  modulo?: string | null
}

export type DuenoNegocio = {
  codneg: number
  codusr: string
  esprincipal?: boolean
  nombre_usr?: string | null
  nombre_per?: string | null
  apellido_per?: string | null
  email_per?: string | null
}

export type DuenoCandidate = {
  codusr: string
  nombre_usr?: string | null
  nombre_per?: string | null
  apellido_per?: string | null
  email_per?: string | null
}

export type NegocioMeta = {
  fields: {
    nombre: boolean
    estado: boolean
    direccion: boolean
    telefono: boolean
    stock_min_default: boolean
    codtng?: boolean
    codcfn?: boolean
  }
}

/* Productos */
export type UnidadMedida = { codumd: number; nombre: string; simbolo?: string | null; tipo?: string }
export type ProductoOpt = { codprd: number; nombre: string; codigo?: string; precio?: number; precio_compra?: number | null; es_contenido_empaque?: number | boolean; codumd?: number | null; simbolo_umd?: string | null; tipo_umd?: string | null }
export type ProductoOption = { codprd: number; nombre: string; codigo?: string }
export type TipoPrd = 'simple' | 'compuesto' | 'empaque'
/** @deprecated use TipoPrd */
export type TipoProductoVisual = 'simple' | 'receta' | 'subproducto'
export type Producto = {
  codprd: number
  codneg?: number
  nombre: string
  codigo?: string | null
  codcat?: number | null
  codmar?: number | null
  stockmin?: number | null
  tipo_prd?: TipoPrd | null
  estado?: string | null
  precio_venta?: number | null
  precio_compra?: number | null
  costo_unitario_referencia?: number | null
  costo_por_empaque?: number | null
  num_insumos?: number
  es_contenido_empaque?: number | boolean
  codumd?: number | null
  nombre_umd?: string | null
  simbolo_umd?: string | null
  tipo_umd?: string | null
}
export type ProductoEmpaque = {
  codpem: number
  codneg: number
  codprd_empaque: number
  nombre_empaque: string
  codprd_contenido: number
  nombre_contenido: string
  tipo_contenido?: TipoPrd | null
  cantidad: number
  estado?: string
}
export type JerarquiaEmpaque = {
  codprd_empaque: number
  nombre_empaque: string
  codigo_empaque?: string | null
  stock_empaque: number
  cantidad_por_contenido: number
  codprd_contenido: number
  nombre_contenido: string
  codigo_contenido?: string | null
  tipo_contenido?: TipoPrd | null
  stock_contenido: number
  unidades_teoricas_aportadas: number
}
export type Categoria = { codcat: number; nombre: string; codneg?: number | null; estado?: string | null }
export type Marca = { codmar: number; nombre: string; codneg?: number | null; estado?: string | null }

/* Usuarios / Personas */
export type PerfilData = { codusr: string; login?: string | null; nombre?: string | null; apellido?: string | null; email?: string | null; telefono?: string | null; rol?: string | null; estado?: string | null; esdueno?: boolean; loginmulti?: boolean }
export type PersonaRef = { codper: number; nombre: string; apellidos: string; email?: string | null }

/* Contabilidad */
export type CuentaContable = { codcta: number; nombre: string; tipo?: string; codneg: number; estado?: string }
export type Ingreso = { coding: number; codcta: number; monto: number; detalle?: string; fecha: string; cuenta_nombre?: string; cuenta_tipo?: string; refdoc?: string }
export type Egreso = { codegr: number; codcta: number; monto: number; detalle?: string; fecha: string; cuenta_nombre?: string; cuenta_tipo?: string; refdoc?: string }
export type ResumenPorCuenta = { codcta: number; cuenta_nombre: string; cuenta_tipo?: string; total_ingresos: number; total_egresos: number; balance: number; movimientos: number }
export type ResumenPorDia = { dia: string; total_ingresos: number; total_egresos: number }
export type ResumenContable = {
  total_ingresos: number
  total_egresos: number
  balance: number
  num_ingresos: number
  num_egresos: number
  por_cuenta: ResumenPorCuenta[]
  por_dia: ResumenPorDia[]
}
export type ConfigCuentaRef = { codcta: number; cuenta_nombre: string } | null
export type ContabilidadConfig = { venta: ConfigCuentaRef; compra: ConfigCuentaRef; default: ConfigCuentaRef }
/* Gestión de caja física */
export type CajaConfig = {
  fondoBilletes: number
  monedasModo: 'todas' | 'fijo'
  monedasFijo: number | null
  impresoraIp?: string | null
  impresoraPuerto?: number | null
  impresoraModo?: 'red' | 'usb' | null
  impresoraUsb?: string | null
}
export type CajaRegistro = {
  codcaj: number
  tipo: 'apertura' | 'cierre' | 'conteo_parcial'
  fecha: string
  turno?: string | null
  totalBilletes: number
  totalMonedas: number
  totalGeneral: number
  monedasDejar?: number | null
  billetesDejar?: number | null
  montoRetirado?: number | null
  notas?: string | null
  codusr?: string | null
}
export type CajaRegistroDet = { denominacion: number; esMoneda: boolean; cantidad: number; subtotal: number }
export type CajaRegistroDetalle = CajaRegistro & { codneg: number; detalle: CajaRegistroDet[] }
export type CajaEstado = {
  cajaAbierta: boolean
  ultimaApertura: { codcaj: number; fecha: string; total: number; turno?: string | null } | null
  ultimoCierre: { codcaj: number; fecha: string; fondoResultante: number; retirado?: number | null } | null
  fondoEsperado: number
  config: CajaConfig
}

export type CierreCaja = {
  fecha: string
  ventas_total: number
  ventas_cant: number
  fiado_total: number
  fiado_cant: number
  abonos_fiao: number
  fondo_total?: number
  compras_total: number
  compras_cant: number
  efectivo_ventas: number
  balance: number
  abiertas_venta_cant: number
  abiertas_venta_total: number
  abiertas_compra_cant: number
  abiertas_compra_total: number
}

/* Inventario */
export type StockItem = { codinv: number; codprd: number; nombre?: string; codigo?: string; stock: number; stockmin?: number | null; tipo_prd?: TipoPrd | null }
export type Movimiento = { codmin: number; tipo: string; cantidad: number; fecha: string; detalle?: string; producto?: string; simbolo_umd?: string | null; nombre_umd?: string | null }

/* Reservas */
export type Reserva = { codres: number; codneg: number; codcli?: number; fecini: string; fecfin: string; fecres: string; estado: string; detalle?: string; cliente_nombre?: string }
export type ClienteOpt = { codcli: number; nombre: string }

/* Facturación */
export type ClienteOptFull = { codcli: number; codper: number; nombre: string; apellidos?: string; cedula?: string | undefined; email?: string | undefined; telefono?: string | undefined; fiar?: boolean | number; limite_fiado?: number | null; deuda_fiao?: number }
export type ClienteOptShort = ClienteOpt
export type ProveedorOpt = { codpro: number; codper: number; nombre: string; apellidos?: string; cedula?: string | undefined; email?: string | undefined; telefono?: string | undefined }

export type DraftItem = { id: string; codprd: number | null; cantidad: number; preuni: number | null; precioOriginal?: number | null }

export type Factura = { rowKey?: string; codfac: number; codneg: number; tipo: string; estado: string; fecha: string; total?: number; detalle?: string; cliente_nombre?: string; proveedor_nombre?: string }
export type FacturaLinea = { codfdt: number; codprd: number; cantidad: number; precio: number; subtotal: number; producto_nombre?: string }

/* UI / Dashboard */
export type OverviewItem = {
  codneg: number; nombre: string; tipo?: string; esdueno?: boolean; rol?: string
  productos_activos?: number; stock_total?: number; facturas_30d?: number
  facturas_abiertas?: number; reservas_7d?: number; ingresos_30d?: number; egresos_30d?: number
}
export type Resumen = {
  productos_activos?: number
  stock_total?: number
  facturas_30d?: number
  facturas_abiertas?: number
  reservas_7d?: number
  ingresos_30d?: number
  egresos_30d?: number
}
export type Alerta = { key?: string; titulo?: string; detalle?: string; items?: any[] }

/* RBAC / Misc */
export type LookupRow = { codigo: string | number; nombre: string; raw: Record<string, any> }
export type LookupResponse = Record<string, any> | Array<Record<string, any>>
export type UsuarioRow = { codusr: string; nombre_usr?: string; codper?: number | null; codrol?: number | null; esdueno?: boolean; loginmulti?: boolean; estado?: string | null; persona_nombre?: string | null; persona_apellido?: string | null; rol_nombre?: string | null }
export type RolOption = { codrol: number; nombre: string }
export type RolRow = { codrol: number; nombre: string; detalle?: string | null; codneg?: number | null; negocio_nombre?: string | null }
export type RolPermisoRow = { codprm: number; clave: string; nombre: string; detalle?: string | null; estado?: 'A' | 'I' }

/* Helper / API DTOs (placeholders, extend as needed) */
export type AuthzCheckResponse = { permisos?: Record<string, boolean> }
export type ComposicionInsumoDTO = any
export type ProductoComposicion = any
export type ProductoConDetalles = any
export type ProductoConReceta = any
export type ProductoDetalle = any

/* Utils / shared component types */
export type SwitchNegocioResponse = {
  accessToken: string
  expiresIn: number
  codneg: string | number
  codrol: string | number
}

export type ThemeName =
  | 'corporativo-claro'
  | 'corporativo-oscuro'
  | 'natural-claro'
  | 'natural-oscuro'
  | 'premium-claro'
  | 'premium-oscuro'
  | 'rojo-claro'
  | 'rojo-oscuro'
  | 'rojo-neon-claro'
  | 'rojo-neon-oscuro'

export type ThemeOption = {
  name: ThemeName
  label: string
  group: 'Corporativo' | 'Natural' | 'Premium' | 'Rojo' | 'Neón'
}

export type ModuleKey =
  | 'PRODUCTOS'
  | 'INVENTARIO'
  | 'FACTURAS'
  | 'RESERVAS'
  | 'CONTABILIDAD'
  | 'USUARIOS'

export type VisibleModule = {
  key: ModuleKey | string
  visible?: boolean
  enabled?: boolean
}

export type TableColumn = {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
  sortable?: boolean
}

export type FacturaPreviewProduct = {
  nombre: string
  codigo?: string
  cantidad: number
  preuni: number
}

export type FacturaPreviewProps = {
  numero?: string | number
  fecha?: string
  tipo: 'venta' | 'compra'
  cliente?: { nombre: string; apellidos?: string; cedula?: string | null }
  proveedor?: { nombre: string; apellidos?: string; cedula?: string | null }
  items: FacturaPreviewProduct[]
  subtotal: number
  impuestos: number
  total: number
  monto_pagado?: number
  cambio?: number
  /** Parte del total pagada con el fondo del cliente. */
  fondo_aplicado?: number
  /** Parte del total que quedó fiada (a crédito). */
  fiado?: number
  negocio?: { nombre: string; direccion?: string; telefono?: string; ruc?: string }
}

export type CatalogPayload = {
  modulos?: Array<{ key: string; nombre: string }>
  moduloPermisos?: Record<string, string[]>
  permisos?: Array<{ clave: string; nombre: string; detalle?: string | null; moduloKey?: string }>
}

export default {}

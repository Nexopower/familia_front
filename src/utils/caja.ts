/**
 * Lógica de caja para previews en vivo en el frontend.
 * (El backend recalcula de forma autoritativa al guardar.)
 */

export interface Denominacion { valor: number; esMoneda: boolean }

export const DENOMINACIONES: Denominacion[] = [
  { valor: 2000, esMoneda: false },
  { valor: 1000, esMoneda: false },
  { valor: 500, esMoneda: false },
  { valor: 200, esMoneda: false },
  { valor: 100, esMoneda: false },
  { valor: 50, esMoneda: false },
  { valor: 25, esMoneda: true },
  { valor: 10, esMoneda: true },
  { valor: 5, esMoneda: true },
  { valor: 1, esMoneda: true },
]

export interface ConteoLinea { valor: number; esMoneda: boolean; cantidad: number; subtotal: number }

export function construirConteo(cantidades: Record<number, number>): ConteoLinea[] {
  return DENOMINACIONES.map((d) => {
    const cantidad = Math.max(0, Math.floor(Number(cantidades[d.valor] ?? 0)) || 0)
    return { valor: d.valor, esMoneda: d.esMoneda, cantidad, subtotal: cantidad * d.valor }
  })
}

export function calcularTotales(lineas: ConteoLinea[]) {
  let totalBilletes = 0
  let totalMonedas = 0
  for (const l of lineas) {
    if (l.esMoneda) totalMonedas += l.subtotal
    else totalBilletes += l.subtotal
  }
  return { totalBilletes, totalMonedas, totalGeneral: totalBilletes + totalMonedas }
}

export function calcularCierre(params: {
  lineas: ConteoLinea[]
  fondoBilletes: number
  monedasModo: 'todas' | 'fijo'
  monedasFijo?: number | null
}) {
  const { totalBilletes, totalMonedas, totalGeneral } = calcularTotales(params.lineas)
  const monedasDejar = params.monedasModo === 'fijo'
    ? Math.min(Math.max(0, Number(params.monedasFijo ?? 0)), totalMonedas)
    : totalMonedas
  const billetesDejar = Math.min(Math.max(0, Number(params.fondoBilletes ?? 0)), totalBilletes)
  const montoRetirar = Math.max(0, totalGeneral - monedasDejar - billetesDejar)
  return {
    totalContado: totalGeneral, totalBilletes, totalMonedas,
    monedasDejar, billetesDejar, montoRetirar, fondoResultante: billetesDejar + monedasDejar,
  }
}

export function sugerirRetiro(monto: number, disponibles?: ConteoLinea[] | null) {
  let restante = Math.max(0, Math.floor(Number(monto) || 0))
  const billetes = DENOMINACIONES.filter((d) => !d.esMoneda)
  const dispMap = new Map<number, number>()
  if (disponibles) for (const d of disponibles) if (!d.esMoneda) dispMap.set(d.valor, d.cantidad)
  const lineas: { valor: number; cantidad: number; subtotal: number }[] = []
  for (const b of billetes) {
    if (restante < b.valor) continue
    let cantidad = Math.floor(restante / b.valor)
    if (disponibles) cantidad = Math.min(cantidad, dispMap.get(b.valor) ?? 0)
    if (cantidad > 0) {
      lineas.push({ valor: b.valor, cantidad, subtotal: cantidad * b.valor })
      restante -= cantidad * b.valor
    }
  }
  const cubierto = lineas.reduce((s, l) => s + l.subtotal, 0)
  return { lineas, cubierto, restante }
}

export function fmtMoney(v: number) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
}

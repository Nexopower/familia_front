import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock de la capa de red: cada llamada real contaría contra Azure SQL.
vi.mock('@/utils/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/utils/api'
import {
  useClientesCache,
  useProveedoresCache,
  filtrarCatalogo,
  normalizarTexto,
} from './useCatalogosCache'

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>

describe('useCatalogosCache', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('Paso 7(a): escribir varios caracteres genera UNA sola petición de red', async () => {
    const cache = useClientesCache()
    apiFetchMock.mockResolvedValue([
      { codcli: 1, codper: 1, nombre: 'José', apellidos: 'Pérez' },
      { codcli: 2, codper: 2, nombre: 'María', apellidos: 'López' },
      { codcli: 3, codper: 3, nombre: 'Pedro', apellidos: 'Martínez' },
    ])

    // Primera necesidad de la lista: una petición.
    await cache.asegurar(1)

    // El usuario teclea "j", "jo", "jos", "josé": el filtro es 100% en memoria.
    const resultados = ['j', 'jo', 'jos', 'josé'].map(q =>
      filtrarCatalogo(cache.items.value, q, ['nombre', 'apellidos']),
    )

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(resultados[3]).toHaveLength(1)
    expect(resultados[3][0].nombre).toBe('José')
  })

  it('filtra sin acentos y sin distinguir mayúsculas', async () => {
    const cache = useClientesCache()
    // La lista ya quedó cargada por el test anterior (estado compartido real).
    const porNombre = filtrarCatalogo(cache.items.value, 'JOSE', ['nombre', 'apellidos'])
    expect(porNombre).toHaveLength(1)

    const porApellido = filtrarCatalogo(cache.items.value, 'martinez', ['nombre', 'apellidos'])
    expect(porApellido).toHaveLength(1)
    expect(normalizarTexto('Ñandú Á')).toBe('nandu a')
  })

  it('deduplica cargas concurrentes del mismo negocio (una sola petición)', async () => {
    const cache = useProveedoresCache()
    apiFetchMock.mockResolvedValue([{ codpro: 1, codper: 1, nombre: 'Distribuidora X' }])

    // Dos componentes piden el catálogo a la vez.
    await Promise.all([cache.asegurar(1), cache.asegurar(1)])

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('refrescar() fuerza una recarga manual', async () => {
    const cache = useProveedoresCache()
    apiFetchMock.mockResolvedValue([{ codpro: 2, codper: 2, nombre: 'Distribuidora Y' }])

    await cache.refrescar()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(cache.items.value[0].nombre).toBe('Distribuidora Y')
  })
})

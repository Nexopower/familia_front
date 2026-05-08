import { computed, ref, watch } from 'vue'
import { useSession } from './session'
import { fetchVisibleModuleKeys, getCachedVisibleModuleKeys, setCachedVisibleModuleKeys } from './rbac'

export function useRbac() {
  const { user } = useSession()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const visible = ref<Set<string>>(new Set())

  const codneg = computed(() => user.value?.codneg)

  async function refresh() {
    error.value = null

    const isAdmin = Boolean(user.value?.isAdmin || user.value?.codusr === 'admin')

    // Requisito: no mostrar módulos hasta seleccionar negocio (excepto admin).
    if (!user.value?.codusr) {
      visible.value = new Set()
      return
    }

    if (!codneg.value && !isAdmin) {
      visible.value = new Set()
      return
    }

    const cached = getCachedVisibleModuleKeys(user.value.codusr, codneg.value ?? null)
    if (cached) {
      visible.value = cached
      return
    }

    loading.value = true
    try {
      const keys = await fetchVisibleModuleKeys(codneg.value ?? null)
      visible.value = keys
      setCachedVisibleModuleKeys(user.value.codusr, codneg.value ?? null, keys)
    }
    catch (e: any) {
      visible.value = new Set()
      error.value = e?.message ? String(e.message) : 'Error cargando permisos'
    }
    finally {
      loading.value = false
    }
  }

  watch(
    () => String(user.value?.codusr ?? '') + '|' + String(user.value?.codneg ?? ''),
    () => {
      // Forzar recarga al cambiar de usuario o negocio.
      void refresh()
    },
    { immediate: true },
  )

  function can(moduleKey: string): boolean {
    return visible.value.has(moduleKey.trim().toUpperCase())
  }

  return { visible, can, loading, error, refresh }
}

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SESSION_CHANGED_EVENT, getNegocios, getUser } from './auth'
import type { AuthUser, Negocio } from '@/types'

export function useSession() {
  const user = ref<AuthUser | null>(getUser())
  const negocios = ref<Negocio[]>(getNegocios())

  function refresh() {
    user.value = getUser()
    negocios.value = getNegocios()
  }

  function onChange() {
    refresh()
  }

  onMounted(() => {
    refresh()
    window.addEventListener(SESSION_CHANGED_EVENT, onChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange)
  })

  return { user, negocios, refresh }
}

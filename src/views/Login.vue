<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { setSession } from '@/utils/auth'
import type { AuthUser, Negocio } from '@/types'
import { initThemeForCurrentUser } from '@/utils/theme'
import { apiFetch, ApiError } from '@/utils/api'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'

const router = useRouter()

/* ── State ── */
const codusr = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const negociosLogin = ref<Negocio[]>([])
const selectedCodneg = ref<string | number | null>(null)

// Recordar usuario: solo se persiste el NOMBRE de usuario (nunca la contraseña).
const REMEMBER_KEY = 'remember_usuario'
const rememberUser = ref(false)

/* ── Helpers ── */
const subtitle = computed(() =>
  'Inicia sesión para continuar',
)

function finish() {
  initThemeForCurrentUser()
  router.push('/')
}

const selectedCodnegNumber = computed<number | undefined>(() => {
  if (selectedCodneg.value === null || selectedCodneg.value === '' || selectedCodneg.value === '0')
    return undefined
  const n = Number(selectedCodneg.value)
  return Number.isFinite(n) && n > 0 ? n : undefined
})

async function loadNegociosLogin() {
  try {
    const rows = await apiFetch<Negocio[]>('auth/negocios')
    negociosLogin.value = Array.isArray(rows) ? rows : []
  } catch {
    negociosLogin.value = []
  }
}

async function doLogin() {
  if (!codusr.value.trim() || !password.value) { error.value = 'Completa usuario y contraseña.'; return }
  loading.value = true; error.value = null

  try {
    const data = await apiFetch<any>('auth/login', {
      method: 'POST',
      body: JSON.stringify({
        codusr: codusr.value.trim(),
        password: password.value,
        codneg: selectedCodnegNumber.value,
      }),
    })

    const userObj: AuthUser = {
      codusr: data.user?.codusr ?? data.codusr ?? codusr.value.trim(),
      codper: data.user?.codper,
      nombre: data.user?.nombre,
      codrol: data.user?.codrol ?? data.codrol,
      codneg: data.user?.codneg ?? data.codneg,
      esdueno: data.user?.esdueno,
      loginmulti: data.user?.loginmulti,
      isAdmin: data.user?.isAdmin,
    }

    if (rememberUser.value)
      localStorage.setItem(REMEMBER_KEY, codusr.value.trim())
    else
      localStorage.removeItem(REMEMBER_KEY)

    const negocios: Negocio[] = data.negocios ?? data.user?.negocios ?? []

    setSession(
      data.accessToken ?? data.access_token,
      userObj,
      data.refreshToken ?? data.refresh_token,
      negocios,
    )

    finish()
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 401) {
      error.value = e.message || 'Credenciales incorrectas.'
      return
    }
    error.value = e?.message ?? 'Error de autenticación'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadNegociosLogin()
  const recordado = localStorage.getItem(REMEMBER_KEY)
  if (recordado) {
    codusr.value = recordado
    rememberUser.value = true
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-app px-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-main">Familia</h1>
        <p class="text-sm text-muted mt-1">{{ subtitle }}</p>
      </div>

      <div class="card p-6 space-y-4">
        <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

        <div>
          <label class="block text-sm font-medium text-main mb-1">Usuario</label>
          <input v-model="codusr" type="text" class="w-full px-3 py-2 input" placeholder="Nombre de login o código" autocomplete="off" @keyup.enter="doLogin" />
        </div>
        <div>
          <label class="block text-sm font-medium text-main mb-1">Contraseña</label>
          <!-- autocomplete="new-password": evita que el navegador rellene solo
               las credenciales guardadas (ej. admin) encima del usuario recordado -->
          <input v-model="password" type="password" class="w-full px-3 py-2 input" placeholder="••••••••" autocomplete="new-password" @keyup.enter="doLogin" />
        </div>

        <label class="flex items-center gap-2 text-sm text-main">
          <input v-model="rememberUser" type="checkbox" class="rounded" /> Recordar usuario
        </label>

        <div>
          <label class="block text-sm font-medium text-main mb-1">Negocio (solo requerido para usuario normal)</label>
          <select v-model="selectedCodneg" class="w-full px-3 py-2 input">
            <option :value="null">No seleccionar (admin / dueño / multi-negocio)</option>
            <option v-for="n in negociosLogin" :key="n.codneg" :value="n.codneg">
              {{ n.nombre }}
            </option>
          </select>
          <p class="text-xs text-muted mt-1">
            Para usuarios normales, el negocio es obligatorio. Se validará junto con usuario y contraseña.
          </p>
        </div>

        <button type="button" class="w-full py-2.5 btn btn-primary text-sm font-medium disabled:opacity-60" :disabled="loading" @click="doLogin">
          {{ loading ? 'Verificando…' : 'Ingresar' }}
        </button>
      </div>
    </div>
  </div>
</template>

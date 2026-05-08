import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getToken, getUser, isAuthenticated } from '@/utils/auth'
import { getCachedVisibleModuleKeys, fetchVisibleModuleKeys, setCachedVisibleModuleKeys } from '@/utils/rbac'

/* ── Lazy-loaded views ── */
const Login = () => import('@/views/Login.vue')
const Home = () => import('@/views/home/Home.vue')
const Productos = () => import('@/views/productos/Productos.vue')
const Inventario = () => import('@/views/inventario/Inventario.vue')
const InventarioAvanzado = () => import('@/views/inventario/InventarioAvanzado.vue')
const Facturas = () => import('@/views/facturas/Facturas.vue')
const Reservas = () => import('@/views/reservas/Reservas.vue')
const Contabilidad = () => import('@/views/contabilidad/Contabilidad.vue')
const Usuarios = () => import('@/views/usuarios/Usuarios.vue')
const Configuraciones = () => import('@/views/configuraciones/Configuraciones.vue')
const Perfil = () => import('@/views/perfil/Perfil.vue')

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'empty' | 'default'
    requiresAuth?: boolean
    requiresNegocio?: boolean
    moduleKey?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { layout: 'empty', requiresAuth: false },
  },
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { requiresAuth: true },
  },
  {
    path: '/productos',
    name: 'Productos',
    component: Productos,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'PRODUCTOS' },
  },
  {
    path: '/inventario',
    name: 'Inventario',
    component: Inventario,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'INVENTARIO' },
  },
  {
    path: '/inventario-avanzado',
    name: 'InventarioAvanzado',
    component: InventarioAvanzado,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'INVENTARIO' },
  },
  {
    path: '/facturas',
    name: 'Facturas',
    component: Facturas,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'FACTURAS' },
  },
  {
    path: '/reservas',
    name: 'Reservas',
    component: Reservas,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'RESERVAS' },
  },
  {
    path: '/contabilidad',
    name: 'Contabilidad',
    component: Contabilidad,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'CONTABILIDAD' },
  },
  {
    path: '/usuarios',
    name: 'Usuarios',
    component: Usuarios,
    meta: { requiresAuth: true, requiresNegocio: true, moduleKey: 'USUARIOS' },
  },
  {
    path: '/configuraciones',
    name: 'Configuraciones',
    component: Configuraciones,
    meta: { requiresAuth: true, requiresNegocio: true },
  },
  {
    path: '/perfil',
    name: 'Perfil',
    component: Perfil,
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/* ── Navigation guard ── */
router.beforeEach(async (to, _from, next) => {
  const needsAuth = to.meta.requiresAuth !== false

  // 1. Auth check
  if (needsAuth) {
    const token = getToken()
    if (!token) return next({ name: 'Login' })

    const valid = await isAuthenticated()
    if (!valid) return next({ name: 'Login' })
  }

  // If going to login while authenticated, redirect home
  if (to.name === 'Login') {
    const token = getToken()
    if (token) return next({ name: 'Home' })
  }

  // 2. Negocio check
  if (to.meta.requiresNegocio) {
    const user = getUser()
    const isAdmin = Boolean(user?.isAdmin || user?.codusr === 'admin')
    const hasCodneg = user?.codneg && Number(user.codneg) > 0
    if (!isAdmin && !hasCodneg) return next({ name: 'Home' })
  }

  // 3. RBAC module check
  if (to.meta.moduleKey) {
    const user = getUser()
    if (!user) return next({ name: 'Login' })

    const isAdmin = Boolean(user.isAdmin || user.codusr === 'admin')
    if (!isAdmin) {
      const codneg = user.codneg ?? null
      let visible = getCachedVisibleModuleKeys(user.codusr, codneg)
      if (!visible) {
        try {
          visible = await fetchVisibleModuleKeys(codneg)
          setCachedVisibleModuleKeys(user.codusr, codneg, visible)
        } catch {
          visible = new Set()
        }
      }
      if (!visible.has(to.meta.moduleKey)) return next({ name: 'Home' })
    }
  }

  next()
})

export default router

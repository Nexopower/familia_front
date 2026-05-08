import './assets/main.css'

import { createApp } from 'vue'

import App from './App.vue'
import router from './router.ts'
import { initThemeForCurrentUser } from './utils/theme'

const app = createApp(App)

initThemeForCurrentUser()

app.use(router)

app.mount('#app')

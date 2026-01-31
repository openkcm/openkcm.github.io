import DefaultTheme from 'vitepress/theme'
import ZoomImage from './components/ZoomImage.vue'
import './custom.css'

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('ZoomImage', ZoomImage)
    }
}
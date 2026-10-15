import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import ZoomImage from './components/ZoomImage.vue'
import DiagramZoom from './components/DiagramZoom.vue'
import './custom.css'

export default {
    extends: DefaultTheme,
    // DiagramZoom is mounted once per page and turns every Mermaid diagram into
    // an expandable, zoomable view.
    Layout: () => h(DefaultTheme.Layout, null, {
        'layout-bottom': () => h(DiagramZoom),
    }),
    enhanceApp({ app }) {
        app.component('ZoomImage', ZoomImage)
    }
}

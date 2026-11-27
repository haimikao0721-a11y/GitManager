import ReactDOM from 'react-dom/client'
import App from './App'
import { installHttpBridge } from './lib/httpBridge'
import './index.css'

function installDesktopGuards(): void {
  window.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null
    const editable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      Boolean(target?.isContentEditable)
    if (!editable) {
      event.preventDefault()
    }
  })

  window.addEventListener('dragstart', (event) => {
    event.preventDefault()
  })

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey
    const devTools =
      event.key === 'F12' ||
      (mod && event.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
    const browserLeak = mod && (key === 'u' || key === 's' || key === 'p')
    if (devTools || browserLeak) {
      event.preventDefault()
    }
  })
}

installDesktopGuards()
installHttpBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)

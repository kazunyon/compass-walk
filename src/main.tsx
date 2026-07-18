import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { registerSW } from 'virtual:pwa-register'; import './index.css'; import App from './App.tsx';
let updateSW: (reloadPage?: boolean) => Promise<void>;updateSW=registerSW({onNeedRefresh(){window.dispatchEvent(new CustomEvent('compass-update-ready',{detail:()=>void updateSW(true)}))},onOfflineReady(){console.info('オフラインで利用できます')}});
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)

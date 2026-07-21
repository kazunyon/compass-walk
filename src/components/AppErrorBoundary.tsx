import { Component, type ErrorInfo, type ReactNode } from 'react'
import db from '../db'

type Props = { children: ReactNode }
type State = { hasError: boolean; repairing: 'weather' | 'draft' | null; repairFailed: boolean; errorMessage: string }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, repairing: null, repairFailed: false, errorMessage: '' }

  static getDerivedStateFromError(): Pick<State, 'hasError'> { return { hasError: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application rendering error', error, info)
    this.setState({ errorMessage: `${error.name}: ${error.message}` })
  }

  repair = async (target: 'weather' | 'draft') => {
    this.setState({ repairing: target, repairFailed: false })
    try {
      // Forecasts and unsaved drafts are disposable. Completed records stay untouched.
      if (target === 'weather') await db.weatherCache.clear()
      else await db.drafts.delete('record')
      window.location.reload()
    } catch {
      this.setState({ repairing: null, repairFailed: true })
    }
  }

  render() {
    const { repairing, repairFailed, errorMessage } = this.state
    if (this.state.hasError) return <main className="app-error" role="alert"><h1>画面を表示できませんでした</h1><p>保存済みの記録は消えません。</p>{errorMessage && <p className="weather-message">診断情報：{errorMessage}</p>}<button type="button" onClick={() => void this.repair('weather')} disabled={repairing !== null}>{repairing === 'weather' ? '修復中…' : '天気データを修復して開く'}</button><button type="button" onClick={() => void this.repair('draft')} disabled={repairing !== null}>{repairing === 'draft' ? '修復中…' : '下書きを破棄して開く'}</button><p>下書きの破棄では、保存前の入力だけが消えます。</p>{repairFailed && <p>修復できませんでした。Safariで開き直してください。</p>}<button type="button" onClick={() => window.location.reload()}>再読み込み</button></main>
    return this.props.children
  }
}
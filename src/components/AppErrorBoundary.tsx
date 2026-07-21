import { Component, type ErrorInfo, type ReactNode } from 'react'
import db from '../db'

type Props = { children: ReactNode }
type State = { hasError: boolean; repairing: boolean; repairFailed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, repairing: false, repairFailed: false }

  static getDerivedStateFromError(): Pick<State, 'hasError'> { return { hasError: true } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application rendering error', error, info) }

  repairWeather = async () => {
    this.setState({ repairing: true, repairFailed: false })
    try {
      // Forecasts are disposable. Records and drafts are stored in different tables.
      await db.weatherCache.clear()
      window.location.reload()
    } catch {
      this.setState({ repairing: false, repairFailed: true })
    }
  }

  render() {
    if (this.state.hasError) return <main className="app-error" role="alert"><h1>画面を表示できませんでした</h1><p>保存済みの記録は消えません。</p><button type="button" onClick={() => void this.repairWeather()} disabled={this.state.repairing}>{this.state.repairing ? '修復中…' : '天気データを修復して開く'}</button>{this.state.repairFailed && <p>修復できませんでした。Safariで開き直してください。</p>}<button type="button" onClick={() => window.location.reload()}>再読み込み</button></main>
    return this.props.children
  }
}
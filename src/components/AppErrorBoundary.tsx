import { Component, type ErrorInfo, type ReactNode } from 'react'
import db, { createBackup, downloadText } from '../db'

type Props = { children: ReactNode }
type State = { hasError: boolean; repairing: 'weather' | 'draft' | null; backingUp: boolean; backupFailed: boolean; repairFailed: boolean; errorMessage: string }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, repairing: null, backingUp: false, backupFailed: false, repairFailed: false, errorMessage: '' }

  static getDerivedStateFromError(): Pick<State, 'hasError'> { return { hasError: true } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application rendering error', error, info); this.setState({ errorMessage: `${error.name}: ${error.message}` }) }

  backup = async () => {
    this.setState({ backingUp: true, backupFailed: false })
    try {
      const backup = await createBackup()
      downloadText(JSON.stringify(backup, null, 2), `compass-walk-recovery-${backup.exportedAt.slice(0, 10)}.json`, 'application/json')
      this.setState({ backingUp: false })
    } catch {
      this.setState({ backingUp: false, backupFailed: true })
    }
  }

  repair = async (target: 'weather' | 'draft') => {
    this.setState({ repairing: target, repairFailed: false })
    try {
      if (target === 'weather') await db.weatherCache.clear()
      else await db.drafts.delete('record')
      window.location.reload()
    } catch {
      this.setState({ repairing: null, repairFailed: true })
    }
  }

  render() {
    const { repairing, backingUp, backupFailed, repairFailed, errorMessage } = this.state
    if (this.state.hasError) return <main className="app-error" role="alert"><h1>画面を表示できませんでした</h1><p>保存済みの記録は消えません。</p>{errorMessage && <p className="weather-message">診断情報：{errorMessage}</p>}<button type="button" onClick={() => void this.backup()} disabled={backingUp}>{backingUp ? '保存中…' : '記録をバックアップ'}</button>{backupFailed && <p>バックアップを保存できませんでした。</p>}<button type="button" onClick={() => void this.repair('weather')} disabled={repairing !== null}>{repairing === 'weather' ? '修復中…' : '天気データを修復して開く'}</button><button type="button" onClick={() => void this.repair('draft')} disabled={repairing !== null}>{repairing === 'draft' ? '修復中…' : '下書きを破棄して開く'}</button><p>下書きの破棄では、保存前の入力だけが消えます。</p>{repairFailed && <p>修復できませんでした。Safariで開き直してください。</p>}<button type="button" onClick={() => window.location.reload()}>再読み込み</button></main>
    return this.props.children
  }
}
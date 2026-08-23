import {Cloud,CloudOff,LoaderCircle} from 'lucide-react'
import {Link} from 'react-router-dom'
import {useSyncState} from '../hooks/useSyncState'

export function SyncIndicator(){
  const sync=useSyncState()
  const Icon=sync.phase==='syncing'||sync.phase==='starting'?LoaderCircle:sync.phase==='synced'?Cloud:CloudOff
  const label=sync.phase==='synced'?'同期済み':sync.phase==='syncing'?'同期中':sync.phase==='offline'?'オフライン':'同期設定'
  return <Link className={`sync-indicator ${sync.phase}`} to="/data" aria-label={`${label}。設定を開く`} title={sync.message}><Icon size={18}/><span>{label}</span></Link>
}

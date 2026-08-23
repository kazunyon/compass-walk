import {useState} from 'react'
import {Cloud,CloudOff,LogIn,LogOut,RefreshCw,UserPlus} from 'lucide-react'
import {useSyncState} from '../hooks/useSyncState'
import {signInForSync,signOutFromSync,signUpForSync,syncNow} from '../sync'

function errorMessage(error:unknown){
  const message=error instanceof Error?error.message:''
  if(message.includes('Invalid login credentials'))return'メールアドレスまたはパスワードが違います。'
  if(message.includes('already registered'))return'このメールアドレスは登録済みです。ログインしてください。'
  if(message.includes('Password should'))return'パスワードは8文字以上で入力してください。'
  return message||'操作に失敗しました。通信状態を確認してください。'
}

export function SyncAccountCard(){
  const sync=useSyncState()
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[formMessage,setFormMessage]=useState('')
  const authenticate=async(mode:'sign-in'|'sign-up')=>{
    if(!email||password.length<8){setFormMessage('メールアドレスと8文字以上のパスワードを入力してください。');return}
    setBusy(true);setFormMessage('')
    try{
      if(mode==='sign-in')await signInForSync(email,password)
      else{
        const signedIn=await signUpForSync(email,password)
        setFormMessage(signedIn?'アカウントを作成し、同期を開始しました。':'確認メールを送りました。メール内の案内を完了してからログインしてください。')
      }
    }catch(error){setFormMessage(errorMessage(error))}finally{setBusy(false)}
  }
  if(sync.email)return <section className="data-card sync-card"><div className="sync-title"><Cloud/><div><h2>端末間同期</h2><span>{sync.email}</span></div></div><p className={`sync-message ${sync.phase}`}><i/>{sync.message}</p>{sync.lastSyncedAt&&<p className="sync-time">最終同期：{new Date(sync.lastSyncedAt).toLocaleString('ja-JP')}</p>}<div className="sync-actions"><button className="data-action" type="button" onClick={()=>void syncNow()} disabled={sync.phase==='syncing'}><RefreshCw/>今すぐ同期</button><button className="data-action secondary" type="button" onClick={()=>void signOutFromSync()}><LogOut/>ログアウト</button></div></section>
  return <section className="data-card sync-card"><div className="sync-title"><CloudOff/><div><h2>PC・スマホで同期</h2><span>同じアカウントでログインします</span></div></div><p>予定・記録・担当者・選択肢をSupabaseへ安全に保存します。オフライン中は端末へ保存し、通信が戻ると自動同期します。</p><div className="sync-form"><label>メールアドレス<input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com"/></label><label>パスワード<input type="password" autoComplete="current-password" minLength={8} value={password} onChange={event=>setPassword(event.target.value)} placeholder="8文字以上"/></label></div><div className="sync-actions"><button className="data-action" type="button" onClick={()=>void authenticate('sign-in')} disabled={busy}><LogIn/>ログインして同期</button><button className="data-action secondary" type="button" onClick={()=>void authenticate('sign-up')} disabled={busy}><UserPlus/>初めての方</button></div>{formMessage&&<p className="sync-form-message" role="status">{formMessage}</p>}</section>
}

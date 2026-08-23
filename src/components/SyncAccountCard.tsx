import {useState} from 'react'
import {Cloud,CloudOff,KeyRound,LogIn,LogOut,Mail,RefreshCw} from 'lucide-react'
import {useSyncState} from '../hooks/useSyncState'
import {sendSyncOtp,signOutFromSync,syncNow,verifySyncOtp} from '../sync'

function errorMessage(error:unknown){
  const message=error instanceof Error?error.message:''
  if(message.includes('rate limit'))return'続けて送信できません。しばらく待ってから、もう一度お試しください。'
  if(message.includes('expired')||message.includes('invalid'))return'コードが違うか、有効期限が切れています。新しいコードを送信してください。'
  return message||'操作に失敗しました。通信状態を確認してください。'
}

export function SyncAccountCard(){
  const sync=useSyncState()
  const[email,setEmail]=useState(''),[code,setCode]=useState(''),[codeSent,setCodeSent]=useState(false)
  const[busy,setBusy]=useState(false),[formMessage,setFormMessage]=useState('')
  const sendCode=async()=>{
    const normalizedEmail=email.trim().toLowerCase()
    if(!normalizedEmail||!normalizedEmail.includes('@')){setFormMessage('メールアドレスを入力してください。');return}
    setBusy(true);setFormMessage('')
    try{
      await sendSyncOtp(normalizedEmail)
      setEmail(normalizedEmail);setCodeSent(true);setCode('')
      setFormMessage('6桁のログインコードをメールで送りました。')
    }catch(error){setFormMessage(errorMessage(error))}finally{setBusy(false)}
  }
  const verifyCode=async()=>{
    if(!/^\d{6}$/.test(code)){setFormMessage('メールに届いた6桁のコードを入力してください。');return}
    setBusy(true);setFormMessage('')
    try{await verifySyncOtp(email,code)}
    catch(error){setFormMessage(errorMessage(error))}
    finally{setBusy(false)}
  }
  if(sync.email)return <section className="data-card sync-card"><div className="sync-title"><Cloud/><div><h2>端末間同期</h2><span>{sync.email}</span></div></div><p className={`sync-message ${sync.phase}`}><i/>{sync.message}</p>{sync.lastSyncedAt&&<p className="sync-time">最終同期：{new Date(sync.lastSyncedAt).toLocaleString('ja-JP')}</p>}<div className="sync-actions"><button className="data-action" type="button" onClick={()=>void syncNow()} disabled={sync.phase==='syncing'}><RefreshCw/>今すぐ同期</button><button className="data-action secondary" type="button" onClick={()=>void signOutFromSync()}><LogOut/>ログアウト</button></div></section>
  return <section className="data-card sync-card"><div className="sync-title"><CloudOff/><div><h2>PC・スマホで同期</h2><span>メールに届く6桁コードでログインします</span></div></div><p>同じメールアドレスでログインすると、予定・記録・担当者・選択肢を自動同期します。パスワードの登録は不要です。</p><div className="sync-form"><label>メールアドレス<input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com" disabled={codeSent}/></label>{codeSent&&<label>6桁のログインコード<input className="sync-code-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="123456" autoFocus/></label>}</div>{codeSent?<div className="sync-actions"><button className="data-action" type="button" onClick={()=>void verifyCode()} disabled={busy}><LogIn/>コードを確認して同期</button><button className="data-action secondary" type="button" onClick={()=>{setCodeSent(false);setCode('');setFormMessage('')}} disabled={busy}><Mail/>メールアドレスを変更</button><button className="data-action secondary sync-resend" type="button" onClick={()=>void sendCode()} disabled={busy}><RefreshCw/>コードを再送信</button></div>:<button className="data-action sync-send-code" type="button" onClick={()=>void sendCode()} disabled={busy}><KeyRound/>6桁コードをメールで受け取る</button>}{formMessage&&<p className="sync-form-message" role="status" aria-live="polite">{formMessage}</p>}</section>
}

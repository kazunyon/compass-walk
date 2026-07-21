import{useState}from'react';import{useLiveQuery}from'dexie-react-hooks';import{Link}from'react-router-dom';import{CalendarPlus,ClipboardPenLine,HeartPulse}from'lucide-react';import db from'../db';

const t={regular:'通常利用',makeup:'振替利用',absence:'お休み',cancelled:'キャンセル'};
const messages=['今日も、無理なく一歩ずつ。','今日の調子に、耳を傾けよう。','あなたのペースで、今日も一歩。','今日も、からだを大切に。','小さな積み重ねを、大切に。','できたことを、今日の記録に。','今日のあなたを、記録しよう。','がんばりすぎず、少しずつ。','今日のからだを 大切に。'];
const messageKey='compass-walk:last-home-message';

function getGreeting(){
  const previous=localStorage.getItem(messageKey);
  const choices=messages.filter(message=>message!==previous);
  const message=choices[Math.floor(Math.random()*choices.length)];
  localStorage.setItem(messageKey,message);
  return message;
}

export function HomePage(){const s=useLiveQuery(()=>db.schedules.orderBy('date').filter(x=>x != null && typeof x.date === 'string' && x.date>=new Date().toISOString().slice(0,10)).limit(3).toArray(),[]);const upcoming=(s??[]).filter(x=>x != null && typeof x.date === 'string' && typeof x.type === 'string');const [greeting]=useState(getGreeting);return <><section className="hero"><p>こんにちは</p><h1>{greeting}</h1><Link className="primary" to="/record"><ClipboardPenLine/>今日を記録する</Link></section><h2>これからの予定</h2><section className="card">{upcoming.length?upcoming.map(x=><div className="row" key={x.id}><b>{new Date(x.date+'T00:00:00').toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'})}</b><em className={x.type}>{t[x.type]}</em></div>):<p>まだ予定がありません。</p>}</section><h2>かんたん操作</h2><div className="grid"><Link to="/calendar"><CalendarPlus/>利用予定を登録</Link><Link to="/record"><HeartPulse/>体調・バイタルを記録</Link></div></>}

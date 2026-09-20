const path=require('path');
const crypto=require('crypto');
const express=require('express');
const Database=require('better-sqlite3');

const app=express();
const PORT=process.env.PORT||3000;
const BOT_TOKEN=process.env.BOT_TOKEN||'';
const db=new Database(process.env.DB_PATH||path.join(__dirname,'orbit.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  balance REAL NOT NULL DEFAULT 0,
  mining_started_at INTEGER NOT NULL DEFAULT 0,
  last_spin_at INTEGER NOT NULL DEFAULT 0,
  spin_index INTEGER NOT NULL DEFAULT 0,
  referrals INTEGER NOT NULL DEFAULT 0,
  referral_earnings REAL NOT NULL DEFAULT 0,
  referrer_id TEXT,
  youtube_claimed INTEGER NOT NULL DEFAULT 0,
  telegram_claimed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
`);
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));

function validateInitData(initData){
  if(!BOT_TOKEN) return null;
  const params=new URLSearchParams(initData||'');
  const hash=params.get('hash'); if(!hash) return null;
  params.delete('hash');
  const pairs=[...params.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`${k}=${v}`);
  const secret=crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
  const expected=crypto.createHmac('sha256',secret).update(pairs.join('\n')).digest('hex');
  if(expected.length!==hash.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(hash))) return null;
  const authDate=Number(params.get('auth_date')||0);
  if(!authDate || Date.now()/1000-authDate>86400) return null;
  let user=null; try{user=JSON.parse(params.get('user')||'null')}catch{}
  return user&&user.id?user:null;
}
function auth(req,res){
  const user=validateInitData(req.get('x-telegram-init-data'));
  if(!user) return res.status(401).json({error:'Telegram authentication required'});
  return user;
}
function getUser(id){return db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(id));}
function publicUser(u){return {
  id:u.telegram_id, username:u.username||'', first_name:u.first_name||'', last_name:u.last_name||'',
  balance:Number(u.balance), mining_started_at:Number(u.mining_started_at), last_spin_at:Number(u.last_spin_at),
  spin_index:Number(u.spin_index), referrals:Number(u.referrals), referral_earnings:Number(u.referral_earnings),
  youtube_claimed:!!u.youtube_claimed, telegram_claimed:!!u.telegram_claimed
};}
function ensureUser(tgUser,refParam){
  const id=String(tgUser.id); let u=getUser(id); const now=Date.now();
  if(!u){
    let referrerId=null;
    if(typeof refParam==='string'&&refParam.startsWith('ref_')){
      const candidate=refParam.slice(4).split(/[^0-9]/)[0];
      if(candidate&&candidate!==id&&getUser(candidate)) referrerId=candidate;
    }
    db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,referrer_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .run(id,tgUser.username||'',tgUser.first_name||'',tgUser.last_name||'',referrerId,now,now);
    if(referrerId){
      db.prepare('UPDATE users SET referrals=referrals+1,balance=balance+?,referral_earnings=referral_earnings+?,updated_at=? WHERE telegram_id=?')
        .run(0.5,0.5,now,referrerId);
    }
    u=getUser(id);
  } else {
    db.prepare('UPDATE users SET username=?,first_name=?,last_name=?,updated_at=? WHERE telegram_id=?')
      .run(tgUser.username||'',tgUser.first_name||'',tgUser.last_name||'',now,id);
    u=getUser(id);
  }
  return u;
}

app.post('/api/register',(req,res)=>{
  const tg=auth(req,res); if(!tg||res.headersSent)return;
  const u=ensureUser(tg,req.body?.start_param||'');
  res.json({user:publicUser(u)});
});
app.get('/api/me',(req,res)=>{const tg=auth(req,res);if(!tg||res.headersSent)return;const u=getUser(tg.id);if(!u)return res.status(404).json({error:'User not registered'});res.json({user:publicUser(u)});});

app.post('/api/mining/start',(req,res)=>{const tg=auth(req,res);if(!tg||res.headersSent)return;const u=getUser(tg.id);if(!u)return res.status(404).json({error:'Register first'});if(u.mining_started_at)return res.status(409).json({error:'Mining already active'});const t=Date.now();db.prepare('UPDATE users SET mining_started_at=?,updated_at=? WHERE telegram_id=?').run(t,t,String(tg.id));res.json({user:publicUser(getUser(tg.id))});});
app.post('/api/mining/claim',(req,res)=>{const tg=auth(req,res);if(!tg||res.headersSent)return;const u=getUser(tg.id);if(!u||!u.mining_started_at)return res.status(409).json({error:'No active mining'});const elapsed=Date.now()-u.mining_started_at;if(elapsed<4*3600000)return res.status(409).json({error:'Mining is not complete yet'});const tx=db.transaction(()=>{db.prepare('UPDATE users SET balance=balance+1,mining_started_at=0,updated_at=? WHERE telegram_id=?').run(Date.now(),String(tg.id));if(u.referrer_id){const commission=0.05;db.prepare('UPDATE users SET balance=balance+?,referral_earnings=referral_earnings+?,updated_at=? WHERE telegram_id=?').run(commission,commission,Date.now(),u.referrer_id);}});tx();res.json({user:publicUser(getUser(tg.id)),claimed:1,referral_commission:u.referrer_id?0.05:0});});

// Safe fixed-sequence wheel: no random/chance generation.
const REWARDS=[0,0.1,0.2,0.3,0.5];
app.post('/api/spin',(req,res)=>{const tg=auth(req,res);if(!tg||res.headersSent)return;const u=getUser(tg.id);if(!u)return res.status(404).json({error:'Register first'});const left=3600000-(Date.now()-u.last_spin_at);if(left>0)return res.status(429).json({error:'Spin is not ready',retry_ms:left});const index=u.spin_index%REWARDS.length,reward=REWARDS[index],t=Date.now();db.prepare('UPDATE users SET balance=balance+?,last_spin_at=?,spin_index=?,updated_at=? WHERE telegram_id=?').run(reward,t,(index+1)%REWARDS.length,t,String(tg.id));res.json({user:publicUser(getUser(tg.id)),reward,index});});

function claimTask(field){return (req,res)=>{const tg=auth(req,res);if(!tg||res.headersSent)return;const u=getUser(tg.id);if(!u)return res.status(404).json({error:'Register first'});if(u[field])return res.status(409).json({error:'Task already claimed'});db.prepare(`UPDATE users SET ${field}=1,balance=balance+1,updated_at=? WHERE telegram_id=?`).run(Date.now(),String(tg.id));res.json({user:publicUser(getUser(tg.id))});};}
app.post('/api/task/youtube/claim',claimTask('youtube_claimed'));
app.post('/api/task/telegram/claim',claimTask('telegram_claimed'));

app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`ORBIT NETWORK server running on port ${PORT}`));

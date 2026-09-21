const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand();}
const HOUR=3600000,FOUR_HOURS=4*HOUR,RATE=.25;
const $=id=>document.getElementById(id),now=()=>Date.now();
const defaults={balance:0,mining_started_at:0,last_spin_at:0,spin_index:0,referrals:0,referral_earnings:0,youtube_claimed:false,telegram_claimed:false};
let state={...defaults},user=tg?.initDataUnsafe?.user||{id:'demo',first_name:'User',username:''},apiUser=null;
const initData=tg?.initData||'';
const api=async(path,opts={})=>{const r=await fetch(path,{...opts,headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData,...(opts.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{data:d,status:r.status});return d;};
const n=v=>Number(v).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
const fmt=ms=>{ms=Math.max(0,ms);let s=Math.floor(ms/1000),h=String(Math.floor(s/3600)).padStart(2,'0'),m=String(Math.floor(s%3600/60)).padStart(2,'0'),x=String(s%60).padStart(2,'0');return `${h}:${m}:${x}`};
function setAvatar(el,u){if(!el)return;if(u.photo_url)el.innerHTML=`<img src="${u.photo_url}" alt="Profile">`;else el.textContent=(u.first_name||'U').charAt(0).toUpperCase()}
function sync(u){if(!u)return;apiUser=u;state={...state,balance:Number(u.balance),miningStartedAt:Number(u.mining_started_at),lastBonusAt:Number(u.last_spin_at),spinIndex:Number(u.spin_index),referrals:Number(u.referrals),referralEarnings:Number(u.referral_earnings),youtubeTaskClaimed:!!u.youtube_claimed,telegramTaskClaimed:!!u.telegram_claimed};user={...user,id:u.id,username:u.username,first_name:u.first_name,last_name:u.last_name};}
function render(){
 $('balance').textContent=n(state.balance);$('walletBalance').textContent=n(state.balance);
 const full=[user.first_name,user.last_name].filter(Boolean).join(' ')||'User';$('name').textContent=full;$('username').textContent=user.username?'@'+user.username:'Telegram User';$('tgid').textContent=user.id;
 setAvatar($('userAvatar'),user);setAvatar($('walletAvatar'),user);
 const active=!!state.miningStartedAt,elapsed=active?Math.min(FOUR_HOURS,Math.max(0,now()-state.miningStartedAt)):0,left=active?Math.max(0,FOUR_HOURS-elapsed):0,mined=active?elapsed/HOUR*RATE:0;
 $('miningStatus').textContent=`${n(mined)} ORB`;$('timer').textContent=active?(left?'':'00:00:00')||fmt(left):'04:00:00';$('miningProgress').style.width=`${Math.min(100,elapsed/FOUR_HOURS*100)}%`;$('miningState').textContent=active?(left?'MINING IN PROGRESS':'READY TO CLAIM'):'READY TO MINE';$('heroHint').textContent=active?`${n(mined)} ORB being mined`:'Start mining to earn';$('mineBtn').classList.toggle('hidden',active);$('claimBtn').classList.toggle('hidden',!active||left>0);
 $('referrals').textContent=state.referrals||0;$('referralEarnings').textContent=n(state.referralEarnings||0);
 const bonusLeft=Math.max(0,HOUR-(now()-state.lastBonusAt));$('spinBtn').disabled=bonusLeft>0;$('spinBtn').textContent=bonusLeft>0?'WAIT '+fmt(bonusLeft):'SPIN';
 const yt=$('youtubeTaskBtn'),tt=$('telegramTaskBtn');yt.textContent=state.youtubeTaskClaimed?'CLAIMED ✓':'SUBSCRIBE';yt.disabled=!!state.youtubeTaskClaimed;tt.textContent=state.telegramTaskClaimed?'CLAIMED ✓':'JOIN';tt.disabled=!!state.telegramTaskClaimed;
}
async function refresh(){try{const d=await api('/api/me');sync(d.user);render()}catch(e){}}
$('mineBtn').onclick=async()=>{try{const d=await api('/api/mining/start',{method:'POST',body:'{}'});sync(d.user);render()}catch(e){tg?.showAlert?.(e.message)}};
$('claimBtn').onclick=async()=>{try{const d=await api('/api/mining/claim',{method:'POST',body:'{}'});sync(d.user);render();$('spinResult').textContent='Mining claimed: +1 ORB'}catch(e){tg?.showAlert?.(e.message)}};
const SPIN_REWARDS=[0,0.1,0.2,0.3,0.5],centers=[0,72,144,216,288];
$('spinBtn').onclick=async()=>{try{const d=await api('/api/spin',{method:'POST',body:'{}'});const reward=Number(d.reward),index=Number(d.index),current=Number(state.spinRotation||0),targetBase=current+360*5,currentMod=((current%360)+360)%360,targetMod=((360-centers[index])%360),delta=(targetMod-currentMod+360)%360;state.spinRotation=targetBase+delta;$('wheel').style.transform=`rotate(${state.spinRotation}deg)`;sync(d.user);render();$('spinResult').textContent=`Selected side: +${n(reward)} ORB`;}catch(e){tg?.showAlert?.(e.message)}};
function openPage(page){document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===page));window.scrollTo({top:0,behavior:'smooth'})}
$('userAvatar').onclick=()=>openPage('wallet');document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>openPage(b.dataset.page));
const bot='ORBITNETWORK_ORB_bot',invite=()=>`https://t.me/${bot}?startapp=ref_${user.id}`;$('inviteLink').value=invite();
$('copyBtn').onclick=async()=>{const link=invite();$('inviteLink').value=link;try{await navigator.clipboard.writeText(link)}catch{}$('copyBtn').textContent='COPIED ✓';setTimeout(()=>$('copyBtn').textContent='COPY',1200)};
function setupTask(buttonId,claimedKey,url,resultText,claimEndpoint){$(buttonId).onclick=async()=>{if(state[claimedKey])return;window.open(url,'_blank');try{const d=await api(claimEndpoint,{method:'POST',body:'{}'});sync(d.user);render();$('spinResult').textContent=resultText}catch(e){tg?.showAlert?.(e.message)}}}
setupTask('youtubeTaskBtn','youtubeTaskClaimed','https://www.youtube.com/@ORBITNETWORK_ORB','YouTube task claimed: +1 ORB','/api/task/youtube/claim');
setupTask('telegramTaskBtn','telegramTaskClaimed','https://t.me/ORBITNETWORKORB','Telegram task claimed: +1 ORB','/api/task/telegram/claim');
$('depositBtn').onclick=()=>tg?.showAlert?.('Deposit address is not available yet.');$('transferBtn').onclick=()=>tg?.showAlert?.('Transfer is coming soon.');$('swapBtn').onclick=()=>tg?.showAlert?.('Swap is coming soon.');
(async()=>{try{const startParam=tg?.initDataUnsafe?.start_param||new URLSearchParams(location.search).get('startapp')||new URLSearchParams(location.search).get('start')||'';if(initData){const d=await api('/api/register',{method:'POST',body:JSON.stringify({start_param:startParam})});sync(d.user)}else{state={...defaults};}render()}catch(e){console.error(e);render()}})();
if(state.spinRotation)$('wheel').style.transform=`rotate(${state.spinRotation}deg)`;setInterval(()=>{render();},1000);setInterval(refresh,15000);

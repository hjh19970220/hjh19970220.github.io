/* Supabase Auth public client. Session stays in this tab; no privileged keys. */
window.SorenAuth=(()=>{
'use strict';
const base='https://ttydbcejxqxdkcfoizkj.supabase.co/auth/v1';
const publicKey='sb_publishable_n5thZ1g6h93ronyzPfqhsg_N_lFaoSa';
let session=null,refreshing=null;
try{session=JSON.parse(sessionStorage.getItem('soren-session-v1')||'null');}catch{}
function save(value){session=value;try{if(value)sessionStorage.setItem('soren-session-v1',JSON.stringify(value));else sessionStorage.removeItem('soren-session-v1');}catch{}}
async function request(path,body,token,method='POST'){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(base+path,{method,headers:{apikey:publicKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});const data=await response.json().catch(()=>({}));if(!response.ok){const e=Error(response.status===429?'操作频繁，请稍后再试。':data.code==='email_not_confirmed'?'请先在邮箱中确认注册。':data.code==='invalid_credentials'?'邮箱或密码不正确，请重试。':data.code==='over_email_send_rate_limit'?'邮件发送频繁，请稍后再试。':response.status>=500?'账户服务暂时不可用，请稍后再试。':'操作未完成，请检查输入或稍后重试。');e.status=response.status;throw e;}return data;}catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('连接超时或网络不可用，请稍后重试。');throw e;}finally{clearTimeout(timeout);}
}
function setSession(data){if(!data.access_token||!data.refresh_token)throw Error('登录未完成，请重试。');save({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600)});}
async function token(){if(!session)return null;if(session.expires_at*1000>Date.now()+60000)return session.access_token;if(!refreshing)refreshing=request('/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(data=>{setSession(data);return session.access_token;}).catch(e=>{if(e.status===400||e.status===401)save(null);throw e;}).finally(()=>{refreshing=null;});return refreshing;}
async function user(){const t=await token();if(!t)return null;try{return await request('/user',null,t,'GET');}catch(e){if(e.status===401){save(null);return null;}throw e;}}
async function signIn(email,password){setSession(await request('/token?grant_type=password',{email,password}));return user();}
const redirect=()=> 'https://hjh19970220.github.io/';
async function signUp(email,password){const d=await request('/signup?redirect_to='+encodeURIComponent(redirect()),{email,password});if(d.access_token){setSession(d);return user();}return null;}
async function recover(email){await request('/recover?redirect_to='+encodeURIComponent(redirect()),{email});}
async function updatePassword(password){const t=await token();if(!t)throw Error('链接已失效，请重新获取找回密码邮件。');await request('/user',{password},t,'PUT');}
async function signOut(){try{const t=await token();if(t)await request('/logout?scope=local',null,t);}finally{save(null);}}
async function callback(){const p=new URLSearchParams(location.hash.slice(1));if(p.has('error')){history.replaceState(null,'',location.pathname+location.search+'#/login');throw Error('确认链接已失效，请重新登录或获取邮件。');}if(!p.has('access_token'))return false;const recovery=p.get('type')==='recovery';const access=p.get('access_token'),refresh=p.get('refresh_token');history.replaceState(null,'',location.pathname+location.search+(recovery?'#/reset':'#/user'));if(!refresh)throw Error('确认链接不完整，请重新登录。');await request('/user',null,access,'GET');setSession({access_token:access,refresh_token:refresh,expires_in:Number(p.get('expires_in'))||3600});return true;}
// Checkout is intentionally unavailable until an authenticated server endpoint is approved.
async function checkout(){throw Error('PRO 尚未开放购买，目前不会产生费用。');}
return {user,signIn,signUp,signOut,recover,updatePassword,callback,checkout};
})();

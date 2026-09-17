/* Customer presentation only. No prediction or model execution. */
(function(root){
'use strict';
const directions=['主胜','平','客胜','主队不败','客队不败','分胜负'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const identity=x=>[x.date,x.home,x.away,x.kickoff].join('|');
const key=x=>encodeURIComponent([x.date,x.no,x.home,x.away].join('|'));
function normalize(rows){if(!Array.isArray(rows))throw Error('INVALID_DATA');return rows.filter(x=>x&&typeof x.home==='string'&&typeof x.away==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x=>({date:x.date,no:String(x.no||''),league:String(x.league||'足球'),home:x.home,away:x.away,kickoff:x.kickoff||null,mode:x.mode,direction:directions.includes(x.direction)?x.direction:null,handicap:['让胜','让平','让负'].includes(x.handicap)?x.handicap:null,confidence:typeof x.confidence==='number'&&x.confidence>=0&&x.confidence<=100?x.confidence:null,verified:x.verified===true,result:['H','D','A'].includes(x.result)?x.result:null,top1Hit:typeof x.top1Hit==='boolean'?x.top1Hit:null,coverageHit:typeof x.coverageHit==='boolean'?x.coverageHit:null,handicapHit:typeof x.handicapHit==='boolean'?x.handicapHit:null,version:String(x.version||''),frozenAt:x.frozenAt||null,pregameVerified:x.pregameVerified===true}));}
function unique(rows){const counts=new Map();rows.forEach(x=>counts.set(identity(x),(counts.get(identity(x))||0)+1));return rows.filter(x=>counts.get(identity(x))===1);}
const published=x=>['SINGLE','DOUBLE'].includes(x.mode)&&!!x.direction;
const frozen=x=>x.pregameVerified===true&&Number.isFinite(Date.parse(x.frozenAt))&&Date.parse(x.frozenAt)<Date.parse(x.kickoff);
function eligible(rows){return unique(rows).filter(x=>published(x)&&frozen(x)&&x.verified&&x.result);}
function outcome(x,kind='coverage'){if(!published(x)||!frozen(x)||!x.verified||!x.result)return null;if(kind==='handicap')return x.handicap?x.handicapHit:null;if(kind==='top1')return x.top1Hit;return x.coverageHit;}
function stats(rows,kind='coverage'){const settled=eligible(rows).map(x=>outcome(x,kind)).filter(x=>typeof x==='boolean');const hits=settled.filter(Boolean).length;return {total:settled.length,hits,rate:settled.length?(hits/settled.length*100).toFixed(1):null};}
const api={escape,day,key,identity,normalize,unique,published,frozen,eligible,outcome,stats};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SorenData=api;
})(typeof window!=='undefined'?window:this);

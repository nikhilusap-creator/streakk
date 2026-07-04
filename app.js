(function(){
var TD="https://api.twelvedata.com";
var RANGES=[
  {label:"1D",interval:"5min",  outputsize:78, fmt:"time"},
  {label:"1W",interval:"30min", outputsize:65, fmt:"date"},
  {label:"1M",interval:"1day",  outputsize:22, fmt:"date"},
  {label:"3M",interval:"1day",  outputsize:65, fmt:"date"},
  {label:"1Y",interval:"1week", outputsize:52, fmt:"date"},
  {label:"5Y",interval:"1month",outputsize:60, fmt:"month"}
];
var watchlist=[],activeTicker=null,activeRI=2;
var chartMain=null,chartVol=null,chartRSI=null,chipPcts={};
var STREAK_DAYS=parseInt(localStorage.getItem("streak_days")||"30");
var API_KEY="";
try{watchlist=JSON.parse(localStorage.getItem("sv_wl")||"[]");API_KEY=localStorage.getItem("td_key")||"";}catch(e){}
if(!watchlist.length)watchlist=["AAPL","MSFT","NVDA","SPY"];
activeTicker=watchlist[0]||null;
function saveWL(){try{localStorage.setItem("sv_wl",JSON.stringify(watchlist));}catch(e){}}
function setStreakDays(n){
  STREAK_DAYS=Math.max(5,Math.min(100,parseInt(n)||30));
  localStorage.setItem("streak_days",STREAK_DAYS);
  if(activeTicker)loadTicker(activeTicker,activeRI);
}
function showKeyPanel(){document.getElementById("kpanel").style.display="block";}
function hideKeyPanel(){document.getElementById("kpanel").style.display="none";}
function submitKey(){
  var v=document.getElementById("ki").value.trim();
  if(!v){alert("Please paste your Twelve Data API key.");return;}
  API_KEY=v;try{localStorage.setItem("td_key",v);}catch(e){}
  hideKeyPanel();renderWL();
  if(activeTicker)loadTicker(activeTicker,activeRI);
}
function renderWL(){
  var el=document.getElementById("wl");if(!el)return;
  var out="";
  for(var i=0;i<watchlist.length;i++){
    var t=watchlist[i],p=chipPcts[t];
    var ps=(p!=null)?('<span class="cpct '+(p>=0?"up":"down")+'">'+(p>=0?"+":"")+p.toFixed(1)+"%</span>"):"";
    out+='<span class="chip '+(t===activeTicker?"active":"")+'" onclick="sel(\''+t+'\')">'+t+ps+'<span class="crm" onclick="event.stopPropagation();rm(\''+t+'\')">&#x2715;</span></span>';
  }
  el.innerHTML=out;
}
function addTicker(){
  var inp=document.getElementById("ti"),t=inp.value.trim().toUpperCase();inp.value="";
  if(!t)return;
  for(var i=0;i<watchlist.length;i++){if(watchlist[i]===t)return;}
  watchlist.push(t);saveWL();sel(t);
}
function rm(t){
  var n=[];for(var i=0;i<watchlist.length;i++){if(watchlist[i]!==t)n.push(watchlist[i]);}
  watchlist=n;delete chipPcts[t];saveWL();
  if(activeTicker===t)activeTicker=watchlist.length?watchlist[0]:null;
  renderWL();
  if(activeTicker)loadTicker(activeTicker,activeRI);
  else document.getElementById("cnt").innerHTML='<div class="stmsg">Add a ticker above.</div>';
}
function sel(t){activeTicker=t;renderWL();loadTicker(t,activeRI);}
function refresh(){if(activeTicker)loadTicker(activeTicker,activeRI);}
function selR(i){activeRI=i;if(activeTicker)loadTicker(activeTicker,i);}
window.addTicker=addTicker;window.refresh=refresh;window.sel=sel;
window.rm=rm;window.selR=selR;window.setStreakDays=setStreakDays;
window.submitKey=submitKey;window.showKeyPanel=showKeyPanel;
function fetchWT(url,ms){
  return new Promise(function(res,rej){
    var t=setTimeout(function(){rej(new Error("Timeout"));},ms);
    fetch(url,{cache:"no-store"}).then(function(r){clearTimeout(t);res(r);}).catch(function(e){clearTimeout(t);rej(e);});
  });
}
async function fetchSeries(ticker,ri){
  if(!API_KEY)throw new Error("NO_KEY");
  var rng=RANGES[ri];
  var url=TD+"/time_series?symbol="+encodeURIComponent(ticker)+"&interval="+rng.interval+"&outputsize="+rng.outputsize+"&order=ASC&apikey="+API_KEY+"&_="+Date.now();
  var r=await fetchWT(url,15000);
  if(!r.ok)throw new Error("HTTP "+r.status);
  var d=await r.json();
  if(d.status==="error"||d.code===400)throw new Error(d.message||"Invalid ticker or API error");
  if(d.code===429)throw new Error("Rate limit hit. Twelve Data free tier: 800 calls/day.");
  if(!d.values||!d.values.length)throw new Error("No data for "+ticker+". Check the symbol.");
  var entries=[];
  for(var i=0;i<d.values.length;i++){
    var v=d.values[i];
    var et=new Date(v.datetime).getTime();
    var eDay=new Date(et).getDay(); // 0=Sun, 6=Sat
    if(eDay===0||eDay===6) continue; // skip weekends
    var ec=parseFloat(v.close),eo=parseFloat(v.open);
    if(isNaN(ec)||ec===0) continue; // skip bad data
    entries.push({t:et,o:eo,h:parseFloat(v.high),l:parseFloat(v.low),c:ec,v:parseInt(v.volume||0)});
  }
  return entries;
}
function calcRSI(cl,p){
  p=p||14;if(cl.length<p+1)return cl.map(function(){return 50;});
  var gA=0,lA=0,i,d,g,l;
  for(i=1;i<=p;i++){d=cl[i]-cl[i-1];if(d>0)gA+=d;else lA-=d;}
  gA/=p;lA/=p;
  var rsi=[];for(i=0;i<p;i++)rsi.push(null);
  rsi.push(lA===0?100:100-100/(1+gA/lA));
  for(i=p+1;i<cl.length;i++){d=cl[i]-cl[i-1];g=d>0?d:0;l=d<0?-d:0;gA=(gA*(p-1)+g)/p;lA=(lA*(p-1)+l)/p;rsi.push(lA===0?100:100-100/(1+gA/lA));}
  return rsi;
}
function calcStreak(cl,ts){
  if(cl.length<2)return{count:0,dir:"flat",days:[],dates:[]};
  var dirs=[],i;
  for(i=1;i<cl.length;i++)dirs.push(cl[i]>cl[i-1]?"up":cl[i]<cl[i-1]?"down":"flat");
  var last=dirs[dirs.length-1],n=0;
  for(i=dirs.length-1;i>=0;i--){if(dirs[i]===last)n++;else break;}
  // dates align with dirs (dirs[0] = change from entry[0] to entry[1], so date = entry[1])
  var allDates=ts?ts.slice(1):dirs.map(function(){return null;});
  return{count:n,dir:last,days:dirs.slice(-STREAK_DAYS),dates:allDates.slice(-STREAK_DAYS)};
}
function calcReversals(entries){
  var rev=[],i,p,c,d;
  for(i=2;i<entries.length;i++){
    p=entries[i-1].c-entries[i-2].c;c=entries[i].c-entries[i-1].c;
    if((p>0&&c<0)||(p<0&&c>0)){d=new Date(entries[i].t);rev.push({time:d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),type:c>0?"up":"down",price:entries[i].c});}
  }
  return rev.slice(-6);
}
function getSignal(sk,rsi){
  if(sk.dir==="up"&&sk.count>=4&&rsi>70)return{cls:"sig-sell",txt:"Sell signal - long up streak + overbought RSI"};
  if(sk.dir==="down"&&sk.count>=4&&rsi<30)return{cls:"sig-buy",txt:"Buy signal - long down streak + oversold RSI"};
  if(sk.dir==="up"&&sk.count>=3)return{cls:"sig-watch",txt:"Watch - extended upward streak"};
  if(sk.dir==="down"&&sk.count>=3)return{cls:"sig-watch",txt:"Watch - extended downward streak"};
  return null;
}
function destroyC(){[chartMain,chartVol,chartRSI].forEach(function(c){if(c)c.destroy();});chartMain=chartVol=chartRSI=null;}
async function loadTicker(ticker,ri){
  if(!API_KEY){showKeyPanel();document.getElementById("cnt").innerHTML='<div class="stmsg">Enter your Twelve Data API key above.</div>';return;}
  activeRI=ri;destroyC();
  document.getElementById("cnt").innerHTML='<div class="stmsg"><div class="spin"></div><span>Loading '+ticker+'...</span></div>';
  renderWL();
  var entries;
  try{entries=await fetchSeries(ticker,ri);}
  catch(e){
    if(e.message==="NO_KEY"){showKeyPanel();return;}
    document.getElementById("cnt").innerHTML='<div class="errbox"><strong>Could not load '+ticker+'</strong><br><br>'+e.message+'</div>';
    return;
  }
  if(!entries.length){document.getElementById("cnt").innerHTML='<div class="stmsg">No data returned.</div>';return;}
  var cl=entries.map(function(e){return e.c;}),vl=entries.map(function(e){return e.v;});
  var last=entries[entries.length-1],prev=entries[entries.length-2];
  var price=last.c,prevClose=prev?prev.c:last.c,change=price-prevClose,changePct=(change/prevClose)*100;
  var hiQ=last.h,loQ=last.l,lastVol=last.v||0;
  var avgVol=vl.reduce(function(a,b){return a+b;},0)/vl.length;
  var allH=entries.map(function(e){return e.h;}).filter(Boolean);
  var allL=entries.map(function(e){return e.l;}).filter(Boolean);
  var w52Hi=allH.length?Math.max.apply(null,allH):price;
  var w52Lo=allL.length?Math.min.apply(null,allL):price;
  var w52Rng=w52Hi-w52Lo,w52Pos=w52Rng>0?((price-w52Lo)/w52Rng)*100:50;
  var pctFromHi=((price/w52Hi)-1)*100,pctFromLo=((price/w52Lo)-1)*100;
  var proxSig="Mid-range",proxColor="var(--muted)",proxBg="var(--surface)",proxBdr="var(--border)";
  if(w52Pos>=90){proxSig="Near 52W HIGH - resistance zone";proxColor="var(--red)";proxBg="var(--red-bg)";proxBdr="rgba(255,92,107,.3)";}
  else if(w52Pos>=75){proxSig="Upper range - extended territory";proxColor="var(--amber)";proxBg="var(--amber-bg)";proxBdr="rgba(255,181,71,.3)";}
  else if(w52Pos<=10){proxSig="Near 52W LOW - potential support";proxColor="var(--green)";proxBg="var(--green-bg)";proxBdr="rgba(0,212,160,.3)";}
  else if(w52Pos<=25){proxSig="Lower range - watch for bottoming";proxColor="var(--amber)";proxBg="var(--amber-bg)";proxBdr="rgba(255,181,71,.3)";}
  var streakEntries=entries;
  if(STREAK_DAYS>entries.length||ri<=1){
    var sRI=STREAK_DAYS<=22?2:STREAK_DAYS<=65?3:4;
    try{streakEntries=await fetchSeries(ticker,sRI);}catch(e){streakEntries=entries;}
  }
  var streakCl=streakEntries.map(function(e){return e.c;});
  var streakTs=streakEntries.map(function(e){return e.t;});
  var sk=calcStreak(streakCl,streakTs),rsi=calcRSI(cl);
  var lastRSI=rsi.filter(function(v){return v!=null;}).pop()||50;
  var revs=ri===0?calcReversals(entries):[],sig=getSignal(sk,lastRSI);
  chipPcts[ticker]=changePct;renderWL();
  var daysSince=(Date.now()-last.t)/864e5;
  var staleNote=daysSince>4?'<div class="stale-note">Data as of '+new Date(last.t).toLocaleDateString()+' - market may be closed</div>':"";
  document.getElementById("upd").textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  var rng=RANGES[ri];
  var labels=entries.map(function(e){var d=new Date(e.t);if(rng.fmt==="time")return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});if(rng.fmt==="month")return d.toLocaleDateString([],{month:"short",year:"2-digit"});return d.toLocaleDateString([],{month:"short",day:"numeric"});});
  var rsiLbl="Neutral",rsiCls="blue";
  if(lastRSI>70){rsiLbl="Overbought";rsiCls="down";}else if(lastRSI<30){rsiLbl="Oversold";rsiCls="up";}
  var dotsH="";
  for(var di=0;di<sk.days.length;di++){
    var dv=sk.days[di];
    var dt=sk.dates[di]?new Date(sk.dates[di]).toLocaleDateString([],{month:"short",day:"numeric"}):"";
    var arrow=dv==="up"?"&#9650;":dv==="down"?"&#9660;":"&#8212;";
    var tipHtml=dt?"<span class=\"dot-tip\">"+dt+"</span>":"";
    dotsH+="<div class=\"dot "+dv+(di===sk.days.length-1?" cur":"")+"\" title=\""+dt+"\" "+
            "onclick=\"var s=this.getAttribute('data-show');this.setAttribute('data-show',s==='1'?'0':'1')\" "+
            "style=\"position:relative;cursor:pointer\">"+arrow+tipHtml+"</div>";
  }
  var sigH=sig?'<div class="ssig '+sig.cls+'">'+sig.txt+"</div>":'<span style="font-size:12px;color:var(--dim)">No strong signal yet</span>';
  var revH="";
  if(revs.length){for(var ri2=0;ri2<revs.length;ri2++){var rv=revs[ri2];revH+='<div class="ritem '+rv.type+'"><span class="rtime">'+rv.time+'</span><span style="font-size:13px;color:var(--muted)">'+(rv.type==="up"?"Bounce":"Reversal")+'</span><span class="rprice">$'+rv.price.toFixed(2)+"</span></div>";}}
  else{revH='<div class="no-rev">No intraday reversals detected</div>';}
  var needlePct=Math.max(2,Math.min(98,w52Pos));
  var streakBtns="";var snV=[10,20,30,50];
  for(var si=0;si<snV.length;si++){var sn=snV[si],sa=(STREAK_DAYS===sn);streakBtns+='<span onclick="setStreakDays('+sn+')" style="padding:5px 14px;border-radius:20px;font-size:12px;font-family:DM Mono,monospace;cursor:pointer;user-select:none;border:1px solid '+(sa?"var(--green)":"var(--border2)")+';background:'+(sa?"var(--green-bg)":"var(--surface)")+';color:'+(sa?"var(--green)":"var(--muted)")+'">'+sn+'d</span>';}
  var rangeTabs="";
  for(var rti=0;rti<RANGES.length;rti++){rangeTabs+='<span class="rtab '+(rti===ri?"active":"")+'" onclick="selR('+rti+')">'+RANGES[rti].label+"</span>";}
  document.getElementById("cnt").innerHTML=
    '<div class="phero"><div class="pname">'+ticker+'</div><div class="prow"><span class="pbig">$'+price.toFixed(2)+'</span><span class="pchg '+(change>=0?"up":"down")+'">'+(change>=0?"+":"")+change.toFixed(2)+' ('+(changePct>=0?"+":"")+changePct.toFixed(2)+'%)</span></div>'+staleNote+'</div>'+
    '<div class="streak-wrap"><div class="slbl">Streak History</div><div class="shero"><div class="sbadge '+sk.dir+'">'+(sk.dir==="up"?"Up":sk.dir==="down"?"Down":"Flat")+' '+sk.count+'d</div><div class="smeta"><strong>'+(sk.dir==="up"?"Rising":sk.dir==="down"?"Falling":"Flat")+'</strong> '+sk.count+' session'+(sk.count===1?"":"s")+' in a row<br>'+sigH+'</div></div><div class="dots">'+dotsH+'</div><div style="display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap"><span style="font-size:11px;font-family:DM Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Show</span>'+streakBtns+'</div></div>'+
    '<div class="prox-wrap"><div class="slbl">52-Week Position</div><div class="prox-bar-track"><div class="prox-bar-fill"></div><div class="prox-needle" style="left:'+needlePct+'%"></div></div><div class="prox-labels"><span>52W Low<br><strong style="color:var(--text)">$'+w52Lo.toFixed(2)+'</strong></span><span style="text-align:center">Position<br><strong style="color:var(--text)">'+w52Pos.toFixed(0)+'%</strong></span><span style="text-align:right">52W High<br><strong style="color:var(--text)">$'+w52Hi.toFixed(2)+'</strong></span></div><div class="prox-stats"><div class="prox-stat"><div class="prox-stat-lbl">From 52W High</div><div class="prox-stat-val '+(pctFromHi>=-5?"down":"neu")+'">'+pctFromHi.toFixed(1)+'%</div><div class="prox-stat-sub">'+(pctFromHi>=-2?"At or near high":pctFromHi>=-10?"Close to high":"Well below high")+'</div></div><div class="prox-stat"><div class="prox-stat-lbl">From 52W Low</div><div class="prox-stat-val '+(pctFromLo<=15?"up":"neu")+'">+'+pctFromLo.toFixed(1)+'%</div><div class="prox-stat-sub">'+(pctFromLo<=5?"Near the low":pctFromLo<=25?"Above the low":"Well above low")+'</div></div></div><div class="prox-signal" style="background:'+proxBg+';border:1px solid '+proxBdr+';color:'+proxColor+'">'+proxSig+'</div></div>'+
    '<div class="metrics"><div class="mc"><div class="mlbl">RSI 14</div><div class="mval '+rsiCls+'">'+lastRSI.toFixed(1)+'</div><div class="msub '+rsiCls+'">'+rsiLbl+'</div></div><div class="mc"><div class="mlbl">Volume</div><div class="mval">'+(lastVol>=1e6?(lastVol/1e6).toFixed(2)+"M":(lastVol/1e3).toFixed(0)+"K")+'</div><div class="msub '+(lastVol>avgVol?"up":"down")+'">'+(lastVol>avgVol?"Above":"Below")+' avg ('+(avgVol/1e6).toFixed(1)+'M)</div></div><div class="mc"><div class="mlbl">Day High</div><div class="mval">$'+hiQ.toFixed(2)+'</div><div class="msub neu">Today</div></div><div class="mc"><div class="mlbl">Day Low</div><div class="mval">$'+loQ.toFixed(2)+'</div><div class="msub neu">Today</div></div></div>'+
    (ri===0?'<div class="rev-wrap"><div class="slbl">Intraday Reversals</div><div class="rev-list">'+revH+'</div></div>':'')+
    '<div class="chart-wrap"><div class="slbl">Price Chart</div><div class="rtabs">'+rangeTabs+'</div><div class="cwrap"><canvas id="cM"></canvas></div><div class="cgrid"><div class="ccard"><div class="ctitle">Volume</div><div class="cswrap"><canvas id="cV"></canvas></div></div><div class="ccard"><div class="ctitle">RSI 14 OB70 OS30</div><div class="cswrap"><canvas id="cR"></canvas></div></div></div></div>';
  var uC="#00d4a0",dC="#ff5c6b",bC="#6c8fff",pC=change>=0?uC:dC;
  var gO={color:"rgba(255,255,255,.05)",border:{display:false}};
  var tO={color:"#7b7a8e",font:{size:10,family:"DM Mono"}};
  var ttO={backgroundColor:"#1c1c26",borderColor:"rgba(255,255,255,.1)",borderWidth:1,titleColor:"#7b7a8e",bodyColor:"#f0eff8"};
  chartMain=new Chart(document.getElementById("cM"),{type:"line",data:{labels:labels,datasets:[{data:cl,borderColor:pC,borderWidth:2,pointRadius:0,tension:0.3,fill:true,backgroundColor:change>=0?"rgba(0,212,160,.07)":"rgba(255,92,107,.07)"}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:Object.assign({},ttO,{callbacks:{label:function(c){return "$"+c.parsed.y.toFixed(2);}}})},scales:{x:{ticks:Object.assign({},tO,{maxTicksLimit:7}),grid:gO,border:{display:false}},y:{ticks:Object.assign({},tO,{callback:function(v){return "$"+v.toFixed(0);}}),grid:gO,border:{display:false}}}}});
  var volC=cl.map(function(c,i){return i===0?uC:c>=cl[i-1]?uC:dC;});
  chartVol=new Chart(document.getElementById("cV"),{type:"bar",data:{labels:labels,datasets:[{data:vl,backgroundColor:volC,borderWidth:0,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{ticks:Object.assign({},tO,{maxTicksLimit:3,callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+"M":(v/1e3).toFixed(0)+"K";}}),grid:gO,border:{display:false}}}}});
  chartRSI=new Chart(document.getElementById("cR"),{type:"line",data:{labels:labels,datasets:[{data:rsi,borderColor:bC,borderWidth:1.5,pointRadius:0,tension:0.2},{data:rsi.map(function(){return 70;}),borderColor:dC,borderWidth:1,borderDash:[4,3],pointRadius:0},{data:rsi.map(function(){return 30;}),borderColor:uC,borderWidth:1,borderDash:[4,3],pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{min:0,max:100,ticks:Object.assign({},tO,{stepSize:25}),grid:gO,border:{display:false}}}}});
}
if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js",{scope:"./"}).then(function(){console.log("[Streakk] SW ok");}).catch(function(e){console.warn(e);});}
if(!API_KEY)showKeyPanel();
renderWL();
if(API_KEY&&activeTicker)loadTicker(activeTicker,activeRI);
})();

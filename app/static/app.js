const API="/api/v1"; let TOKEN=null, ME=null;

function tok(){return sessionStorage.getItem("bro_tok")}
async function api(path, opts={}){
  const h = {"Content-Type":"application/json"};
  if(tok()) h["Authorization"]="Bearer "+tok();
  const r = await fetch(API+path, {...opts, headers:{...h, ...(opts.headers||{})}});
  if(r.status===401){ logout(); throw new Error("session expired"); }
  if(!r.ok){ const e=await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||"error"); }
  return r.status===204?null:r.json();
}
function flash(msg){ const d=document.createElement("div"); d.className="flash"; d.textContent=msg;
  document.getElementById("flashRoot").appendChild(d); setTimeout(()=>d.remove(),2600); }
async function api2(path, opts={}){
  const h = {"Content-Type":"application/json"};
  if(tok()) h["Authorization"]="Bearer "+tok();
  const r = await fetch("/api/v2"+path, {...opts, headers:{...h, ...(opts.headers||{})}});
  if(r.status===401){ logout(); throw new Error("session expired"); }
  if(!r.ok){ const e=await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||"error"); }
  return r.status===204?null:r.json();
}
function esc(s){return (s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
/* ================= Global Regulations ================= */
let _greg={cat:null,attrs:[],order:[],extra:[],industries:[],sel:new Set(),favs:new Set(),
  added:new Set(),q:"",industry:{id:"banking"},updates:[],flags:{},assess:null,coverage:null,
  schedule:"off",timer:null,nextRun:null};
const REG_CAD={off:0,"5m":300000,hourly:3600000,daily:86400000,weekly:604800000};
const REG_CADLBL=[["off","Off"],["5m","Every 5 min"],["hourly","Hourly"],["daily","Daily"],["weekly","Weekly"]];
const regUrl=s=>typeof s==="string"&&/https?:\/\//i.test(s);
const regShort=t=>String(t||"").split("—")[0].split("(")[0].trim().slice(0,60);
async function regDownload(path,body,filename){
  try{ const h={"Content-Type":"application/json"}; if(tok())h["Authorization"]="Bearer "+tok();
    const r=await fetch("/api/v2"+path,{method:"POST",headers:h,body:JSON.stringify(body)});
    if(!r.ok){ flash("Export failed"); return; }
    const blob=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=filename; a.click(); URL.revokeObjectURL(a.href);
  }catch(e){ flash(e.message); }
}
function regRenderBar(){
  const bar=document.getElementById("regbar"); if(!bar)return;
  const count=_greg.updates.length;
  bar.innerHTML=`
    <input id="reg_q" value="${esc(_greg.q)}" oninput="_greg.q=this.value;regRender()" placeholder="🔍 Search regulations…" style="width:200px">
    <select onchange="_greg.industry={id:this.value};regRender()" title="Industry lens">
      ${_greg.industries.map(i=>`<option value="${i.id}" ${_greg.industry.id===i.id?'selected':''}>${esc(i.label)}</option>`).join("")}</select>
    <select onchange="regSchedule(this.value)" title="Schedule live updates" style="${_greg.schedule!=='off'?'border-color:var(--gold);color:var(--gold)':''}">
      ${REG_CADLBL.map(([v,l])=>`<option value="${v}" ${_greg.schedule===v?'selected':''}>⏱ ${l}</option>`).join("")}</select>
    <button class="btn sm" onclick="regRefresh()" title="Web-search live updates (AI)">⟳ Run now</button>
    <button class="btn sm ghost" onclick="regBell()" title="Updates">🔔 ${count?`<b>${count}</b>`:''}</button>
    <button class="btn sm ghost" onclick="regAssessOpen()" title="Gap assessment">📋 Assess</button>
    <button class="btn sm ghost" onclick="regExport()" title="Export Excel">⬇ Excel</button>`;
}
function regRender(){
  const el=document.getElementById("regbody"); if(!el)return;
  const codes=[..._greg.order,..._greg.added]; const q=_greg.q.toLowerCase();
  const chip=c=>{ const d=_greg.cat[c]; if(!d)return""; const on=_greg.sel.has(c); const fav=_greg.favs.has(c);
    return `<span class="reg-chip ${on?'on':''}" onclick="regToggle('${c}')">
      <span style="font-size:14px">${d.flag}</span> ${esc(c)} <span class="muted" style="font-size:10px">${d.I.length||'+'}</span>
      <span onclick="event.stopPropagation();regFav('${c}')" title="Favourite" style="cursor:pointer">${fav?'★':'☆'}</span></span>`; };
  const addable=_greg.extra.filter(c=>!_greg.added.has(c));
  let html=`<div class="card" style="margin-bottom:12px">
    <div class="row" style="justify-content:space-between;margin-bottom:8px"><div class="card-label">Jurisdictions</div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" onclick="regAll()">All</button><button class="btn sm ghost" onclick="regNone()">None</button>
      <select onchange="if(this.value){regAdd(this.value);this.value=''}" style="font-size:12px"><option value="">+ Add jurisdiction…</option>${addable.map(c=>`<option value="${c}">${_greg.cat[c].flag} ${_greg.cat[c].full}</option>`).join("")}</select></div></div>
    <div class="reg-chips">${codes.map(chip).join("")}</div></div>`;
  const sel=codes.filter(c=>_greg.sel.has(c));
  if(!sel.length){ el.innerHTML=html+`<div class="card muted">Select one or more jurisdictions to compare.</div>`; return; }
  for(const code of sel){
    const d=_greg.cat[code]; if(!d)continue;
    const flags=_greg.flags[code]||{};
    let insts=d.I.map((inst,i)=>({inst,i}));
    if(q) insts=insts.filter(({inst})=>inst.some(v=>String(v).toLowerCase().includes(q)) );
    html+=`<div class="card" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <div><span style="font-size:18px">${d.flag}</span> <b style="font-size:15px">${esc(d.full)}</b> <span class="muted" style="font-size:11px">${esc(d.reg)}</span></div>
        <button class="btn sm ghost" onclick="regRefreshOne('${code}')">⟳ Updates</button></div>`;
    if(!d.I.length){ html+=`<div class="muted" style="font-size:12px;margin-top:8px">Search-only jurisdiction — press <b>Run now</b> to populate via web search.</div></div>`; continue; }
    if(!insts.length){ html+=`<div class="muted" style="font-size:12px;margin-top:8px">No instruments match “${esc(_greg.q)}”.</div></div>`; continue; }
    html+=`<div style="overflow:auto;margin-top:8px"><table class="reg-table"><tr><th style="min-width:150px">Attribute</th>
      ${insts.map(({inst,i})=>`<th style="min-width:230px">${esc(regShort(inst[0]))}</th>`).join("")}</tr>
      ${_greg.attrs.map((attr,ai)=>`<tr><td class="reg-attr">${esc(attr)}</td>
        ${insts.map(({inst,i})=>{ const v=inst[ai]; const fl=flags[i+":"+ai];
          const val=regUrl(v)?`<a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\//,'').slice(0,50))} ↗</a>`:esc(v||'—');
          return `<td>${fl?'<span class="reg-new">NEW</span> ':''}${val}${fl&&fl.date?`<div class="muted" style="font-size:9px">↑ ${esc(fl.date)}</div>`:''}</td>`; }).join("")}</tr>`).join("")}
    </table></div></div>`;
  }
  el.innerHTML=html;
}
function regToggle(c){ _greg.sel.has(c)?_greg.sel.delete(c):_greg.sel.add(c); regRender(); }
function regFav(c){ _greg.favs.has(c)?_greg.favs.delete(c):_greg.favs.add(c); regRender(); }
function regAll(){ [..._greg.order,..._greg.added].forEach(c=>_greg.sel.add(c)); regRender(); }
function regNone(){ _greg.sel.clear(); regRender(); }
function regAdd(c){ _greg.added.add(c); _greg.sel.add(c); regRender(); }
function regSchedule(v){ _greg.schedule=v; if(_greg.timer){clearInterval(_greg.timer);_greg.timer=null;}
  if(REG_CAD[v]){ _greg.timer=setInterval(regRefresh,REG_CAD[v]); _greg.nextRun=Date.now()+REG_CAD[v]; flash("Live updates: "+v); }
  regRenderBar(); }
async function regRefresh(){ const codes=[..._greg.sel]; if(!codes.length){flash("Select jurisdictions");return;}
  flash("Searching the web for regulatory updates…");
  try{ const r=await api2("/regulations/refresh",{method:"POST",body:JSON.stringify({codes})});
    if(r.holding){ flash("AI engine not connected — connect in Settings"); return; }
    regMerge(r.updates||[]); regRenderBar(); regRender();
    flash((r.updates||[]).length?`${r.updates.length} update(s) found`:"No new updates");
  }catch(e){ flash(e.message); } }
async function regRefreshOne(code){ try{ const r=await api2("/regulations/refresh",{method:"POST",body:JSON.stringify({codes:[code]})});
    if(r.holding){ flash("AI engine not connected"); return; } regMerge(r.updates||[]); regRenderBar(); regRender();
    flash((r.updates||[]).length?`${r.updates.length} update(s)`:"No updates"); }catch(e){ flash(e.message); } }
function regMerge(ups){ for(const u of ups){ _greg.updates.unshift(u);
    const i=u.instrument, a=u.attr;
    if(typeof i==="number"&&i>=0&&typeof a==="number"&&a>=0){ (_greg.flags[u.code]=_greg.flags[u.code]||{})[i+":"+a]={date:u.date,source:u.source,isNew:true}; } }
  _greg.updates=_greg.updates.slice(0,60); }
function regBell(){ const ups=_greg.updates;
  modal(`<h3>Live updates — ${ups.length} found</h3>
    ${ups.length?`<div style="max-height:60vh;overflow:auto">${ups.map(u=>`<div class="card" style="margin-bottom:6px">
      <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:11px">${_greg.cat[u.code]?_greg.cat[u.code].flag+' '+esc(_greg.cat[u.code].full):esc(u.code)}</span>${u.date?`<span class="tag">${esc(u.date)}</span>`:''}</div>
      <div style="font-weight:600;font-size:13px;margin-top:3px">${esc(u.title||'')}</div>
      ${u.update?`<div class="muted" style="font-size:11px;margin-top:2px">${esc(u.update)}</div>`:''}
      ${u.source?`<div style="font-size:11px;margin-top:3px">${regUrl(u.source)?`<a href="${esc(u.source)}" target="_blank">${esc(String(u.source).replace(/^https?:\/\//,'').slice(0,46))} ↗</a>`:esc(u.source)}</div>`:''}</div>`).join("")}</div>`
    :'<div class="muted">No updates yet. Press “Run now” to web-search for regulatory changes; results are flagged in the tables.</div>'}
    <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button></div>`); }
function regExport(){ const codes=[..._greg.sel]; if(!codes.length){flash("Select jurisdictions");return;}
  regDownload("/regulations/export",{codes,updates:_greg.updates},"Global_Regulations.xlsx"); }
function regAssessOpen(){ const codes=[..._greg.sel];
  modal(`<h3>Regulatory gap assessment</h3>
    <div class="muted" style="font-size:12px;margin-bottom:8px">Paste your outsourcing / TPRM / resilience policy text. AI rates each instrument for the selected jurisdictions as Addressed / Partial / Gap (conservative). Industry lens: <b>${esc((_greg.industries.find(i=>i.id===_greg.industry.id)||{}).label||'All')}</b>.</div>
    <div class="muted" style="font-size:11px;margin-bottom:6px">Assessing: ${codes.map(c=>_greg.cat[c]?_greg.cat[c].flag:c).join(" ")||'<i>none selected</i>'}</div>
    <textarea id="reg_doc" rows="8" placeholder="Paste policy / process documentation here…" style="width:100%"></textarea>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="regAssessRun()">Assess</button></div>`); }
async function regAssessRun(){ const codes=[..._greg.sel]; const doc=val("reg_doc");
  if(!codes.length){flash("Select jurisdictions");return;} if(!doc){flash("Paste some documentation");return;}
  closeModal(); flash("AI assessing documentation against regulations…");
  try{ const r=await api2("/regulations/assess",{method:"POST",body:JSON.stringify({codes,doc_text:doc,industry:_greg.industry.id})});
    if(r.holding){ flash("AI engine not connected — connect in Settings"); return; }
    _greg.assess=r.results; _greg.coverage=r.coverage; regRenderAssess();
  }catch(e){ flash(e.message); } }
function regRenderAssess(){
  const cov=_greg.coverage||{}; const tot=(cov.addressed||0)+(cov.partial||0)+(cov.gap||0)||1;
  const pct=n=>Math.round((n||0)/tot*100);
  const TONE={addressed:["#0E9F6E","Addressed"],partial:["#F59E0B","Partial"],gap:["#DC2626","Gap"]};
  let html=`<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div class="card-label">Coverage gauge</div>
      <button class="btn sm ghost" onclick="regAssessExport()">⬇ Assessment report</button></div>
    <div style="display:flex;height:22px;border-radius:8px;overflow:hidden;margin:8px 0">
      ${["addressed","partial","gap"].map(k=>{const p=pct(cov[k]);return p?`<div style="width:${p}%;background:${TONE[k][0]};color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center">${p}%</div>`:''}).join("")}</div>
    <div class="row" style="gap:14px;font-size:12px">${["addressed","partial","gap"].map(k=>`<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${TONE[k][0]}"></span> ${TONE[k][1]}: <b>${cov[k]||0}</b></span>`).join("")}</div></div>`;
  for(const code in _greg.assess){ const r=_greg.assess[code];
    html+=`<div class="card" style="margin-bottom:10px"><b>${_greg.cat[code]?_greg.cat[code].flag+' '+esc(r.full):esc(code)}</b>
      <table style="margin-top:8px"><tr><th>Instrument</th><th>Status</th><th>Rationale</th><th>Gap</th></tr>
      ${(r.items||[]).map(it=>{const t=TONE[it.status]||TONE.gap;return `<tr><td>${esc(it.title||('#'+it.instrument))}</td>
        <td><span class="tag" style="background:${t[0]};color:#fff">${t[1]}</span></td>
        <td class="muted" style="font-size:11px">${esc(it.rationale||'')}</td><td class="muted" style="font-size:11px">${esc(it.gap||'')}</td></tr>`;}).join("")}</table></div>`; }
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 12px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">REGULATORY GAP ASSESSMENT</div><button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">${html}</div>`);
}
function regAssessExport(){ regDownload("/regulations/assess/export",{report:{results:_greg.assess,coverage:_greg.coverage}},"Regulatory_Assessment.xlsx"); }
// CR-6: key -> human label. Sentence case (capitalise first word only), preserving acronyms.
const _ACRONYMS={tcv:"TCV",acv:"ACV",rto:"RTO",rpo:"RPO",dpa:"DPA",po:"PO",fx:"FX",ict:"ICT",
  raci:"RACI",sla:"SLA",kpi:"KPI",ddq:"DDQ",irq:"IRQ",sic:"SIC",lei:"LEI",euid:"EUID",duns:"D-U-N-S",
  erp:"ERP",grc:"GRC",unspsc:"UNSPSC",nace:"NACE",naics:"NAICS",vat:"VAT",iban:"IBAN",swift:"SWIFT",
  bic:"BIC",esg:"ESG",pep:"PEP",abac:"ABAC",coi:"COI",ubo:"UBO",bcp:"BCP",id:"ID",url:"URL",ref:"ref"};
function lbl(k){
  if(k==null) return "";
  const words=String(k).replace(/_/g," ").trim().split(/\s+/);
  return words.map((w,i)=>{
    const low=w.toLowerCase();
    if(_ACRONYMS[low]) return _ACRONYMS[low];
    if(i===0) return w.charAt(0).toUpperCase()+w.slice(1);
    return w;
  }).join(" ");
}
// CR-8: canonical country list (ISO short names) — reused everywhere a country is needed
const COUNTRIES=["Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guyana","Haiti","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];
// CR-7: controlled vocabularies for Vendor Master Classification & segmentation
const VOCAB={
  supplier_category:["Strategic","Operational","Tactical","Commodity","Bottleneck","Leverage"],
  segmentation:["Strategic partner","Preferred","Approved","Transactional","Probationary","Exit"],
  tier:["Tier 1","Tier 2","Tier 3","Tier 4"],
  spend_band:["<£10k","£10k–£50k","£50k–£250k","£250k–£1m","£1m–£5m",">£5m"],
  substitutability:["Easily substitutable","Substitutable with effort","Hard to substitute","Sole source / no alternative"],
};
// field-type detection for typed inputs (CR-8)
function fieldType(k){
  const key=String(k).toLowerCase();
  if(/(^|_)country$|countries$|incorporation_country|tax_residency|^hq_country$|jurisdiction$|delivery_location$|receiving_location$/.test(key)) return "country";
  if(/date$|_date|dob$/.test(key)) return "date";
  if(/email/.test(key)) return "email";
  if(/phone|telephone|mobile|contact_number/.test(key)) return "phone";
  return "text";
}
function typedInput(idAttr,k,v){
  const t=fieldType(k); const val=(v==null?'':esc(String(v)));
  if(t==="country"){
    return `<select id="${idAttr}"><option value="">— select —</option>${COUNTRIES.map(c=>`<option ${String(v)===c?'selected':''}>${c}</option>`).join("")}</select>`;
  }
  if(t==="date") return `<input id="${idAttr}" type="date" value="${val}">`;
  if(t==="email") return `<input id="${idAttr}" type="email" placeholder="name@example.com" value="${val}">`;
  if(t==="phone") return `<input id="${idAttr}" type="tel" inputmode="tel" placeholder="+44…" value="${val}" oninput="this.value=this.value.replace(/(?!^\\+)[^0-9]/g,'').replace(/(?!^)\\+/g,'')">`;
  return `<input id="${idAttr}" value="${val}">`;
}

async function doLogin(){
  const u=document.getElementById("lu").value, p=document.getElementById("lp").value;
  try{
    const r = await fetch(API+"/login",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:u,password:p})});
    if(!r.ok) throw new Error("Invalid credentials");
    const d = await r.json();
    sessionStorage.setItem("bro_tok", d.token); ME=d;
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("whoName").textContent=d.username;
    document.getElementById("whoRole").textContent=d.role.toUpperCase();
    window._role=d.role;
    if(d.role==="admin"){ const nm=document.getElementById("navMethodology"); if(nm) nm.style.display=""; const nc=document.getElementById("navConfig"); if(nc) nc.style.display=""; }
    go("home"); initLang(); loadNavOrder(); loadFormats();
  }catch(e){ const el=document.getElementById("loginErr"); el.textContent=e.message; el.classList.remove("hidden"); }
}
function logout(){ sessionStorage.removeItem("bro_tok"); location.reload(); }

document.getElementById("nav").addEventListener("click",e=>{
  const a=e.target.closest("a"); if(!a)return;
  document.querySelectorAll("#nav a").forEach(x=>x.classList.remove("active"));
  a.classList.add("active"); go(a.dataset.v);
});

const V={};
V.globalreg=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Global Regulations</h1><div class="sub">TPRM / outsourcing / ICT-resilience reference · ${(_greg.order.length+_greg.extra.length)||''} jurisdictions · 16 attributes</div></div>
    <div id="regbar" class="row" style="gap:6px"></div></div>
    <div id="regbody" class="muted">Loading regulatory catalogue…</div>`;
  if(!_greg.cat){ try{ const d=await api2("/regulations");
      _greg.cat=d.catalog; _greg.attrs=d.attrs; _greg.order=d.order; _greg.extra=d.extra_order; _greg.industries=d.industries;
      if(!_greg.sel.size) ["UK","EU","US"].forEach(c=>_greg.sel.add(c));
    }catch(e){ document.getElementById("regbody").innerHTML=`<div class="err">${esc(e.message)}</div>`; return; } }
  regRenderBar(); regRender();
};
function go(v){ window._curView=v; (V[v]||V.dashboard)(); scrollViewTop(); }
function scrollViewTop(){ const m=document.getElementById("view"); if(m)m.scrollTop=0; try{window.scrollTo(0,0);}catch(e){} requestAnimationFrame(()=>{ const n=document.getElementById("view"); if(n)n.scrollTop=0; }); }
// navigate from the landing dropdown: sync the sidebar highlight, then render
function goTo(v){
  const a=document.querySelector('#nav a[data-v="'+v+'"]');
  if(a){ a.click(); }
  else { document.querySelectorAll("#nav a").forEach(x=>x.classList.remove("active")); go(v); }
}
function homeGo(){ const sel=document.getElementById("home-task"); if(sel&&sel.value) goTo(sel.value); }
function toggleNav(){ const a=document.getElementById("app"); if(!a) return;
  a.classList.toggle("nav-hidden");
  try{ sessionStorage.setItem("bro_nav_hidden", a.classList.contains("nav-hidden")?"1":"0"); }catch(e){} }
function navUiInit(){
  const nav=document.getElementById("nav"), app=document.getElementById("app");
  if(app){ try{ if(sessionStorage.getItem("bro_nav_hidden")==="1") app.classList.add("nav-hidden"); }catch(e){} }
  if(!nav || nav.dataset.uiInit) return; nav.dataset.uiInit="1";
  let collapsed=[]; try{ collapsed=JSON.parse(sessionStorage.getItem("bro_nav_collapsed")||"[]"); }catch(e){}
  nav.querySelectorAll(".nav-group").forEach(g=>{ const l=g.querySelector(".nav-group-label");
    if(l&&collapsed.includes(l.textContent.trim())) g.classList.add("collapsed"); });
  nav.addEventListener("click",ev=>{ const lab=ev.target.closest(".nav-group-label"); if(!lab) return;
    lab.closest(".nav-group").classList.toggle("collapsed");
    const set=[]; nav.querySelectorAll(".nav-group.collapsed .nav-group-label").forEach(x=>set.push(x.textContent.trim()));
    try{ sessionStorage.setItem("bro_nav_collapsed", JSON.stringify(set)); }catch(e){} });
}
navUiInit();

// ===== Formatting standards (#10) =====
window._fmt={date:"MM-DD-YYYY",currency:"USD"};
async function loadFormats(){ try{ const f=await api2("/format-settings"); if(f) window._fmt=f; }catch(e){} }
function fmtDate(iso){ if(!iso) return ""; const m=String(iso).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return String(iso);
  const f=(window._fmt&&window._fmt.date)||"MM-DD-YYYY"; return f.replace("YYYY",m[1]).replace("MM",m[2]).replace("DD",m[3]); }
const CURRENCIES=["USD","GBP","EUR","CHF","JPY","SGD","HKD","AED","INR","AUD","CAD","CNY"];
function fmtMoney(amt,ccy){ if(amt==null||amt==="") return ""; const n=Number(amt); if(isNaN(n)) return String(amt);
  ccy=ccy||(window._fmt&&window._fmt.currency)||"USD";
  try{ return new Intl.NumberFormat(undefined,{style:"currency",currency:ccy,maximumFractionDigits:0}).format(n); }
  catch(e){ return ccy+" "+n.toLocaleString(); } }
function currencySelect(id,sel){ sel=sel||(window._fmt&&window._fmt.currency)||"USD";
  return `<select id="${id}" class="ccy-select">${CURRENCIES.map(c=>`<option ${c===sel?"selected":""}>${c}</option>`).join("")}</select>`; }
function validEmail(s){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s||"").trim()); }
// global email validation: any email-ish input is checked on blur and flagged @domain.tld
function _isEmailInput(el){ if(!el||el.tagName!=="INPUT") return false; if(el.type==="email") return true;
  const h=((el.id||"")+(el.name||"")+(el.placeholder||"")).toLowerCase(); return /e-?mail/.test(h); }
document.addEventListener("blur",ev=>{ const el=ev.target; if(!_isEmailInput(el)) return;
  const v=(el.value||"").trim(); let msg=el.parentNode&&el.parentNode.querySelector(".input-err-msg");
  if(v&&!validEmail(v)){ el.classList.add("input-invalid");
    if(!msg){ msg=document.createElement("div"); msg.className="input-err-msg"; msg.textContent="Enter a valid email (name@domain.tld)"; el.insertAdjacentElement("afterend",msg); } }
  else { el.classList.remove("input-invalid"); if(msg) msg.remove(); } }, true);

// ===== "Help me" contextual panel (#9) =====
const HELP={
  home:{t:"Home",p:"Your launch pad — every capability grouped by theme (Assess · Monitor & Manage · Analyse · Understand). The supply-chain concentration map shows where risk clusters.",d:[
    ["Action tiles","Shortcuts to the most common tasks; click to jump straight to that workflow."],
    ["Concentration map","Force-directed graph of vendors, fourth parties and delivery locations; red = high concentration."]]},
  dashboard:{t:"Dashboard",p:"Portfolio risk posture at a glance — exposure, criticality and activity across the estate.",d:[
    ["Inherent / Residual band","Risk before controls (inherent) and after controls (residual); residual never exceeds inherent."],
    ["Critical vendors","Engagements flagged business-critical against the configurable criticality threshold."]]},
  engagements:{t:"Engagements",p:"The engagement register — the unit of risk. Each row is one third-party engagement with its scope, risk bands and reassessment timing.",d:[
    ["Stage","Lifecycle position: sourcing → triage → inherent → diligence → decision → contract → onboard → monitor → reassess → terminate."],
    ["Inherent / Residual","Exposure before / after control credit, banded LOW…CRITICAL."],
    ["Next due","Auto-calculated reassessment date (last assessed + cadence by inherent severity). A red badge means overdue."],
    ["Reassessment filter","Narrow the list to Overdue or Due ≤90 days."]]},
  proassess:{t:"ProAssess",p:"Agent-led, end-to-end assessment. BRO retrieves the right questions, drafts answers against evidence and proposes an outcome for your judgement.",d:[
    ["IRQ","Inherent Risk Questionnaire (Q1–Q12) — exposure captured before control credit."],
    ["DDQ","Due-Diligence Questionnaire across 15 control domains."],
    ["CLS","Confidence-Level Score — how complete the evidence is, per domain and overall."]]},
  assess:{t:"BRO Chat",p:"Conversational, multi-agent assessment. Describe the engagement and BRO works it through the methodology, handing the decision back to you.",d:[
    ["Stage stepper","Shows which of the eight assessment stages BRO is in."],
    ["Directives","BRO's structured outputs (scope, score, recommendation) parsed from the conversation."]]},
  pestle:{t:"PESTLE Threat Intelligence",p:"A 150-dimension PESTLE risk vector on every vendor and engagement, refreshed by a (synthetic) overnight News & Reputation sweep. Explore it as an interactive knowledge graph.",d:[
    ["Category heatmap","Mean exposure for each PESTLE category (Political, Economic, Social, Technological, Legal, Environmental)."],
    ["Top systemic threats","Threats with the highest mean exposure across the estate; click to focus the graph."],
    ["Overnight movers","Threats that moved in the last sweep (▲ worse / ▼ better)."],
    ["Knowledge graph","Drag to move, scroll to zoom, click to drill. Red nodes are risk-concentration hotspots."],
    ["Run overnight sweep","Re-derives the vectors from the News & Reputation pass (admin/controller)."]]},
  management:{t:"Management",p:"Leadership view of the whole estate — supply-chain, risk and operations dashboards, an Expired-Assessments report, and a natural-language chat over the live portfolio.",d:[
    ["Expired Assessments","Engagements whose reassessment is overdue, most-overdue first, with a by-severity breakdown."],
    ["Management Chat","Ask the portfolio anything; answers are grounded in live data and the latest exchange shows on top."]]},
  integrity:{t:"Data Integrity",p:"Automated data-quality sweep across the vendor master — completeness, validation, contradictions, stale, orphan and duplicate issues.",d:[
    ["Issue severity","How material the data-quality problem is."],
    ["Resolve","Fix the flagged field inline; the record is re-swept and a reassessment is scheduled."]]},
  config:{t:"Configuration",p:"Governed settings the risk function tunes without code — read at request time, so changes take effect immediately.",d:[
    ["Criticality threshold","Score at which an engagement becomes business-critical."],
    ["Reassessment cadence","Months between assessments by inherent severity (Low 36 / Medium 24 / High 12)."],
    ["Incident SLAs","Response clocks by incident severity."],
    ["Date format / Default currency","How dates and money are displayed across the app."]]},
  audit:{t:"Audit Trail",p:"Tamper-evident, hash-chained ledger of every state change — the defensible record for regulators and second line.",d:[
    ["Hash chain","Each entry references the previous, so tampering is detectable."]]},
  fdd:{t:"Financial Due Diligence",p:"Vendor financial-health assessment producing a band (Strong / Adequate / Watch / Distressed). (Representative data in the demonstrator.)",d:[
    ["Financial-health band","Synthesised from financial signals; surfaces distress risk alongside controls."]]},
  fourthparties:{t:"4th Party Register",p:"Onward (fourth-party) dependencies of your vendors — the basis for concentration and supply-chain analysis.",d:[
    ["Fourth party","A sub-processor or supplier your vendor itself depends on."]]},
  vendors:{t:"Vendor Register",p:"The vendor register — master data for every third-party company you work with. Open a vendor to see its full 360° profile."},
  vendor360:{t:"Vendor 360",p:"A single vendor's complete profile in one place — identity, engagements, risk, financials, certifications and history."},
  performance:{t:"Performance",p:"Vendor performance management — scorecards and KPIs tracked each period against agreed targets, rated RAG."},
  findings:{t:"Findings",p:"Every finding (an identified risk or control gap) and its action plan, tracked to closure."},
  issues:{t:"Issues Log",p:"The issues log — open problems and upcoming expiries (e.g., lapsing certificates) that need attention."},
  contracts:{t:"Contracts",p:"Contract management — key terms, clauses, obligations, renewal/notice dates and supporting documents."},
  reputation:{t:"Reputation",p:"Reputation screening — adverse-media and conduct signals about the vendor. (Representative data in the demonstrator.)"},
  exit:{t:"Exit Planning",p:"Exit planning — stressed-exit readiness (CMORG): could this vendor be exited in a crisis without disruption?"},
  copilot:{t:"Ask Anything",p:"Natural-language search and Q&A across your vendors, engagements, risks and findings."},
  boardpack:{t:"Board / Regulator Pack",p:"An evidence-backed, export-ready summary of portfolio risk for the board and regulators."},
  reports:{t:"Reports",p:"Report library — generate and download standard third-party-risk reports."},
  aireports:{t:"AI Reports",p:"AI-generated narrative reports drawing on the live portfolio. (Live model optional; deterministic otherwise.)"},
  entitygraph:{t:"Entity Graph",p:"The relationships between vendors, fourth parties and delivery locations across the estate."},
  geopolitical:{t:"Geopolitical",p:"Geopolitical exposure — third-party risk by country and region."},
  criticality:{t:"Critical Vendor Modelling",p:"Which engagements are business-critical, and the factors that make them so."},
  scenario:{t:"Scenario Simulator",p:"Model the impact of a vendor failure or a disruption cascading through the supply chain."},
  stressradar:{t:"Stress Radar",p:"Early-warning signals of rising vendor stress across the portfolio."},
  globalreg:{t:"Global Regulations",p:"A multi-jurisdiction reference of TPRM / outsourcing / ICT-resilience rules and obligations."},
  review:{t:"Review Queue",p:"Assessments awaiting your sign-off."},
  assessments:{t:"Assessments",p:"All assessments — completed and in-progress — with their outcomes and evidence confidence."},
  artefacts:{t:"Certifications",p:"Certifications & evidence — document-backed assurance (ISO 27001, SOC 2, etc.) with validity dates."},
  oss:{t:"Open Source Software",p:"A register of open-source components drawn from vendor SBOMs (CycloneDX & SPDX), tagged to every engagement that uses them — so blast-radius and concentration questions are answerable instantly.",d:[
    ["Blast radius","Given a component (± version), the engagements and vendors exposed to it — answered in one hop."],
    ["SBOM coverage","Share of engagements that have a current vendor SBOM on file."],
    ["Concentration","Components used across many engagements — systemic single points of exposure."],
    ["Upload SBOM","Ingest a CycloneDX or SPDX JSON SBOM and tag it to an engagement; components are deduplicated and scored."]]},
  remediation:{t:"Remediation Plans",p:"Remediation plans (RMD) that track findings to closure — each plan links to its finding, with an owner, target date, status and progress.",d:[
    ["RMD","A remediation plan identifier; created from a finding."],
    ["Progress","How far the plan is to completion (0–100%)."],
    ["Status","Planned → In Progress → Complete → Verified."]]},
  feedback:{t:"Feedback",p:"Feedback users have given on AI-generated answers. It is collected here and fed back into every AI query — recurring lessons are distilled into the prompt so answers keep improving.",d:[
    ["Rating","Whether a user marked an AI answer 👍 helpful or 👎 not helpful."],
    ["Surface","Which AI feature the rated answer came from (management, board, …)."],
    ["Comment","The user's note on what would make the answer better."],
    ["Used","Whether this feedback has been incorporated into the improvement loop."]]},
};
function _normKey(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
// definitions for the data fields/columns that appear across the app (novice-friendly)
const FIELD_GLOSSARY={
 "vendor":"The third-party company being assessed or managed.",
 "legal name":"The vendor's registered legal-entity name.",
 "trading name":"The name the vendor trades under, if different from its legal name.",
 "vendor id":"Brata's unique identifier for the vendor (VEN-…).",
 "group":"The corporate group the vendor belongs to — used for group-level concentration.",
 "lei":"Legal Entity Identifier — a global 20-character code that uniquely identifies the legal entity.",
 "duns":"Dun & Bradstreet D-U-N-S number — a business identifier used for identity and credit.",
 "registration number":"Company registration number from the incorporation registry.",
 "tax id":"The vendor's tax identification number.",
 "incorporation country":"Country where the vendor is legally incorporated.",
 "hq country":"Country of the vendor's headquarters.",
 "country":"The relevant country for this row — drives geographic and PESTLE exposure.",
 "operating countries":"Countries the vendor operates in.",
 "listing status":"Whether the vendor is publicly listed or privately held.",
 "ticker":"Stock-exchange ticker symbol (for listed vendors).",
 "ultimate parent":"The topmost owner in the vendor's ownership chain.",
 "employee count":"Approximate number of employees — a size and stability signal.",
 "annual revenue":"The vendor's reported annual revenue — a size and financial signal.",
 "website":"The vendor's primary website.",
 "tier":"Vendor importance tier (Tier 1 = most significant). Drives assessment depth and cadence.",
 "critical":"Whether this is business-critical — disruption would materially harm the firm.",
 "status":"Current status of the record (e.g., active, onboarding, terminated).",
 "engagement":"A specific service a vendor provides to you — the unit of risk that gets assessed.",
 "engagement id":"Brata's unique identifier for the engagement (ENG-…).",
 "service":"The service or product provided under this engagement.",
 "scope":"What the engagement covers — the systems, data and processes involved.",
 "business unit":"The internal business unit that owns or consumes the engagement.",
 "inherent band":"Risk BEFORE controls — based on data sensitivity, criticality and reach. Banded LOW→CRITICAL.",
 "residual band":"Risk AFTER control effectiveness is credited. Never higher than inherent.",
 "stage":"Lifecycle position: sourcing → triage → inherent → diligence → decision → contract → onboard → monitor → reassess → terminate.",
 "annual value":"Annual contract spend for the engagement — a materiality signal.",
 "currency":"The currency a monetary value is in (default USD; selectable per field).",
 "delivery location":"Where the service is delivered from — drives location concentration.",
 "owner":"The person internally accountable for this item.",
 "assessor":"The person performing or assigned to the assessment.",
 "last assessed":"Date the engagement was last assessed.",
 "next assessment due":"When the next reassessment is due (last assessed + the cadence for its risk level). A red badge means overdue.",
 "irq":"Inherent Risk Questionnaire — captures exposure BEFORE any control credit.",
 "ddq":"Due-Diligence Questionnaire — evidence-based questions across control domains.",
 "cls":"Confidence-Level Score (1–5) — how complete and reliable the evidence is.",
 "confidence":"How complete and reliable the underlying evidence is.",
 "domain":"A grouping of related controls (e.g., information security, resilience, privacy).",
 "control domain":"A grouping of related controls assessed in the DDQ.",
 "score":"A numeric rating — higher means greater exposure (or, for confidence, greater completeness).",
 "exposure":"How strongly an entity is affected by a threat (0–100).",
 "outcome":"The assessment conclusion (e.g., proceed, proceed with conditions, decline).",
 "decision":"The recorded conclusion and who signed it.",
 "recommendation":"The proposed action arising from the assessment.",
 "finding":"An identified risk or control gap requiring action.",
 "issue":"An open problem tracked to resolution, often with an expiry.",
 "severity":"How serious the finding, issue or incident is.",
 "priority":"The order of importance for working an item.",
 "due":"When the item must be completed.",
 "remediation":"The plan and actions to fix a finding and reduce risk.",
 "action":"The operation performed, or a task within a remediation plan.",
 "root cause":"The underlying reason a finding occurred.",
 "kri":"Key Risk Indicator — a metric that signals rising risk.",
 "sla":"Service-Level Agreement — a contractual performance commitment (e.g., uptime).",
 "kpi":"Key Performance Indicator — a metric tracking vendor performance.",
 "rag":"Red / Amber / Green — a quick performance or health rating.",
 "performance":"How well the vendor is meeting its commitments.",
 "period":"The time window the metric or review covers.",
 "measure":"A specific item being scored on the scorecard.",
 "target":"The agreed level a measure should meet.",
 "actual":"The observed level for the measure in the period.",
 "fourth party":"A sub-processor or supplier your vendor itself relies on (your vendor's vendor).",
 "concentration":"Over-reliance on one vendor, group, country or provider — a systemic risk.",
 "dependency":"A reliance of one party on another in the supply chain.",
 "political":"PESTLE — political / geopolitical threats (sanctions, instability, policy).",
 "economic":"PESTLE — economic threats (financial distress, FX, inflation).",
 "social":"PESTLE — social / reputational threats (labour, media, conduct).",
 "technological":"PESTLE — technology threats (cyber, cloud concentration, obsolescence).",
 "legal":"PESTLE — legal / regulatory threats (GDPR, DORA, sanctions screening).",
 "environmental":"PESTLE — environmental / climate threats (physical risk, transition).",
 "threat":"A specific PESTLE risk dimension — 150 are tracked.",
 "exit readiness":"Whether a vendor could be exited without undue disruption (stressed-exit / CMORG).",
 "obligations":"Contractual commitments tracked for compliance (e.g., right-to-audit).",
 "hash":"A cryptographic fingerprint linking audit entries so tampering is detectable.",
 "actor":"The user or system that performed the logged action.",
 "timestamp":"When the event occurred.",
 "notice period":"How much notice is required to terminate or change the contract.",
 "renewal":"Whether and when the contract renews.",
 "term":"The contract's duration.",
 "adverse media":"Negative news coverage about the vendor.",
 "sentiment":"The tone (positive / negative) of media or reputation signals.",
 "esg":"Environmental, Social and Governance considerations.",
 "financial health":"Overall financial-health rating: Strong / Adequate / Watch / Distressed.",
 "going concern":"Whether there is doubt the vendor can keep operating.",
 "liquidity":"The vendor's ability to meet short-term obligations.",
 "leverage":"How much debt the vendor carries relative to equity or earnings.",
 "as of":"The date the figures or report reflect.",
 "updated":"When the record was last changed.",
 "created by":"Who created the record.",
 "notes":"Free-text remarks or context.",
 "jurisdiction":"The country/regime whose rules apply.",
 "attribute":"A specific regulatory requirement compared across jurisdictions.",
 "title":"A short name or label for this engagement / item.",
 "reassessment":"Re-running an assessment on the cadence set for the engagement's risk level.",
 "id":"A unique identifier for this row.",
 "name":"The name of this record.",
 "type":"The category or kind of this item.",
 "date":"The relevant date for this row.",
 "category":"The grouping this item falls under.",
 "result":"The outcome produced for this item.",
 "cve":"A catalogued software vulnerability identifier.",
 "cvss":"Common Vulnerability Scoring System — severity from 0 to 10 (higher is worse).",
 "epss":"Exploit Prediction Scoring System — the probability the flaw will be exploited.",
 "kev":"CISA Known-Exploited Vulnerability — confirmed exploited in the wild; prioritise these.",
 "vex":"Vulnerability Exploitability eXchange — whether a known flaw actually affects this product.",
 "vex status":"Whether a known vulnerability is affected / not-affected / fixed / under-investigation here.",
 "sbom":"Software Bill of Materials — the list of components inside a product.",
 "purl":"Package URL — a standard package identifier, pkg:type/name@version.",
 "ecosystem":"The package ecosystem (maven, npm, pypi, golang, cargo…).",
 "ntia":"NTIA minimum-elements completeness of an SBOM (higher is more complete).",
 "component":"An open-source package included in a vendor's product.",
 "licence":"The open-source licence the component is released under.",
 "licence category":"Policy class of a licence: allowed / restricted / prohibited / review.",
 "maintenance":"Upkeep health of the component (healthy / unmaintained / end-of-life).",
 "engagements":"How many engagements use this component — its spread across the estate.",
 "risk":"Computed component risk, from its vulnerabilities, licence and maintenance.",
 "maint":"Upkeep health of the component (healthy / unmaintained / end-of-life).",
 "blast radius":"Which engagements and vendors are exposed to a given component.",
};
const FIELD_ALIASES={"next due":"next assessment due","next reassessment due":"next assessment due","next reassessment":"next assessment due",
 "inherent":"inherent band","residual":"residual band","inherent risk":"inherent band","residual risk":"residual band",
 "value":"annual value","bu":"business unit","is critical":"critical","criticality":"critical","revenue":"annual revenue",
 "employees":"employee count","hq":"hq country","incorporation":"incorporation country","sub processor":"fourth party",
 "4th party":"fourth party","4th parties":"fourth party","fourth parties":"fourth party","actions":"action","action plan":"action",
 "due date":"due","z score":"financial health","altman z":"financial health","financial health band":"financial health",
 "last updated":"updated","control":"control domain","confidence level":"cls","cls score":"cls","reg":"jurisdiction"};
function glossaryDef(label){ let k=_normKey(label); if(!k) return null;
  if(FIELD_ALIASES[k]) k=FIELD_ALIASES[k];
  if(FIELD_GLOSSARY[k]) return FIELD_GLOSSARY[k];
  let best=null; for(const g in FIELD_GLOSSARY){ if(k===g) return FIELD_GLOSSARY[g];
    if((" "+k+" ").includes(" "+g+" ")||(" "+g+" ").includes(" "+k+" ")){ if(!best||g.length>best.length) best=g; } }
  return best?FIELD_GLOSSARY[best]:null; }
const _HELP_SKIP=new Set(["actions","#","search","filter","filters","all","save","cancel","close","edit","delete","view","export",
 "run","back","prev","previous","submit","add","new","more","menu","ok","yes","no","details","open","select","none","total",
 "na","n a","loading","refresh","reset","apply","clear","go","ask","send","next"]);
// read the ACTUAL fields/columns shown on the current page
function harvestFields(){ const root=document.getElementById("view"); if(!root) return [];
  const sels=["table th",".card-label","label",".dk",".stat .l",".kpi .l",".k"];
  const seen=new Set(), out=[];
  sels.forEach(sel=>root.querySelectorAll(sel).forEach(el=>{
    if(el.closest(".help-drawer")) return;
    let t=(el.textContent||"").replace(/\s+/g," ").replace(/[*:]+$/,"").trim();
    t=t.replace(/^[▲▼↑↓•·\-\s]+/,"").replace(/\s*[?]$/,"").trim();
    if(!t||t.length<2||t.length>42) return;
    if(/^[\d.,%\/$£€+\-]+$/.test(t)) return;
    const k=_normKey(t); if(!k||_HELP_SKIP.has(k)||seen.has(k)) return;
    seen.add(k); out.push(t); }));
  return out.slice(0,46); }
function openHelp(){ const v=window._curView||"home"; const meta=HELP[v]||{};
  const h1=document.querySelector("#view h1"); const title=meta.t||(h1?h1.textContent.trim():"This page");
  const purpose=meta.p||`The ${title} page. Below, every field shown here is explained — in plain language.`;
  document.getElementById("helpTitle").textContent=title;
  document.getElementById("helpSub").textContent="What this page is for — and every field on it, explained";
  const cur={}; (meta.d||[]).forEach(([t,d])=>cur[_normKey(t)]=d);
  const fields=harvestFields(); const rows=[]; const used=new Set();
  fields.forEach(f=>{ const k=_normKey(f); const def=glossaryDef(f)||cur[k]||"A value shown on this page; see the page heading for its context.";
    rows.push([f,def]); used.add(k); });
  (meta.d||[]).forEach(([t,d])=>{ if(!used.has(_normKey(t))){ rows.push([t,d]); used.add(_normKey(t)); } });
  const fieldHtml=rows.length?rows.map(([t,d])=>`<div class="help-dp"><div class="term">${esc(t)}</div><div class="def">${esc(d)}</div></div>`).join("")
    :`<div class="help-dp"><div class="def">This view is mainly visual or interactive — hover items for details, or use the on-page controls.</div></div>`;
  document.getElementById("helpBody").innerHTML=`<div class="help-purpose">${esc(purpose)}</div>
    <div class="help-sec">Fields on this page (${rows.length})</div>${fieldHtml}
    <div class="help-sec" style="margin-top:18px">Conventions used everywhere</div>
    <div class="help-dp"><div class="term">Risk bands</div><div class="def">LOW · MODERATE · ELEVATED · HIGH · CRITICAL — increasing severity. Residual is never worse than inherent.</div></div>
    <div class="help-dp"><div class="term">Dates</div><div class="def">Shown as <b>${esc((window._fmt&&window._fmt.date)||"MM-DD-YYYY")}</b> — change in Configuration.</div></div>
    <div class="help-dp"><div class="term">Currency</div><div class="def">Default <b>${esc((window._fmt&&window._fmt.currency)||"USD")}</b>; selectable per money field.</div></div>
    <div class="help-dp"><div class="term">Email</div><div class="def">Validated as name@domain.tld.</div></div>`;
  document.getElementById("helpDrawer").classList.add("open");
  document.getElementById("helpOverlay").classList.add("open");
}
function closeHelp(){ document.getElementById("helpDrawer").classList.remove("open"); document.getElementById("helpOverlay").classList.remove("open"); }
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ closeHelp(); if(typeof closeDemo==="function"&&document.getElementById("demoOverlay")) closeDemo(); } });

// ===== 60-second cinematic guided demo (#6) =====
const DEMO_ACTS=[{key:"Assess",col:"#1A4D3C"},{key:"Monitor",col:"#1E3A5C"},
  {key:"Manage",col:"#8A2E3B"},{key:"Analyse",col:"#0E7490"},{key:"Understand",col:"#B8862B"}];
function dframe(title,col,badge,body){
  return `<div class="demo-frame"><div class="tb" style="background:linear-gradient(90deg,#11261F,${col})">
    <span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span>
    <span class="ttl">${title}</span><span class="badge">${badge}</span></div><div class="demo-body">${body}</div></div>`;
}
const DEMO_SCENES=[
 {act:"Assess",dur:6500,cap:"Every engagement starts once. <b>BRO</b> captures the deal — vendor, service, data, geography, spend — and the methodology takes it from there.",
  html:dframe("Assess · New engagement intake","#1A4D3C","ProAssess",
   `<div class="demo-stitle d-rise" style="--d:0ms">Northwind Cloud Services — onboarding</div>
    <div class="demo-field d-rise" style="--d:300ms"><span class="k">Vendor</span><span class="v">Northwind Cloud Services Ltd</span></div>
    <div class="demo-field d-rise" style="--d:700ms"><span class="k">Service</span><span class="v">Core-banking SaaS (hosted)</span></div>
    <div class="demo-field d-rise" style="--d:1100ms"><span class="k">Geography</span><span class="v">India · EU data subjects</span></div>
    <div class="demo-field d-rise" style="--d:1500ms"><span class="k">Data</span><span class="v">PII + Financial · Confidential</span></div>
    <div class="demo-field d-rise" style="--d:1900ms"><span class="k">Annual value</span><span class="v">$2,400,000</span></div>
    <div class="d-rise" style="--d:2600ms;margin-top:12px;color:#1A4D3C;font-weight:600">⚡ BRO is drafting the inherent-risk questionnaire…</div>`)},
 {act:"Assess",dur:7000,cap:"Inherent risk lands at <b>HIGH (78)</b>; the DDQ scores evidence across 15 control domains. BRO proposes <b>proceed with conditions</b> — your decision, on the record.",
  html:dframe("Assess · Inherent risk & decision","#1A4D3C","8-stage methodology",
   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="dcard d-pop" style="--d:200ms"><div class="k">Inherent risk</div><div class="demo-stat" style="color:#DC2626" data-count="78" data-suffix="/100">0</div><div>Band <b style="color:#DC2626">HIGH</b></div></div>
      <div class="dcard d-pop" style="--d:600ms"><div class="k">DDQ confidence · CLS</div><div class="demo-stat" style="color:#1A4D3C" data-count="3.8" data-dec="1" data-suffix="/5">0</div><div>15 control domains</div></div></div>
    <div class="demo-bar d-rise" style="--d:1100ms;margin-top:16px"><i data-w="78" style="background:#DC2626"></i></div>
    <div class="d-rise" style="--d:2300ms;margin-top:16px;padding:12px 14px;border-radius:10px;background:#eef5ee;border:1px solid #cfe3cf;font-size:14px">Decision: <b style="color:#1A4D3C">PROCEED — with conditions</b> &nbsp;·&nbsp; 3 remediations attached &nbsp;·&nbsp; signed by Risk Owner</div>`)},
 {act:"Monitor",dur:6000,cap:"Onboarded. The engagement now <b>monitors itself</b> — SLAs, performance and obligations tracked continuously against a RAG scorecard.",
  html:dframe("Monitor · Live performance scorecard","#1E3A5C","continuous",
   `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="dcard d-pop" style="--d:200ms"><div class="k">Performance</div><div class="demo-stat" style="color:#1A7F4B" data-count="91" data-suffix="%">0</div></div>
      <div class="dcard d-pop" style="--d:500ms"><div class="k">SLAs met</div><div class="demo-stat" style="color:#1A7F4B" data-count="14" data-suffix="/15">0</div></div>
      <div class="dcard d-pop" style="--d:800ms"><div class="k">Open issues</div><div class="demo-stat" style="color:#B8862B" data-count="2">0</div></div></div>
    ${["Availability 99.95%","Incident response","Patch cadence","Data-subject requests","Sub-processor changes"].map((m,j)=>`<div class="demo-field d-rise" style="--d:${1100+j*250}ms"><span class="v" style="font-weight:500">${m}</span><span class="demo-pill" style="background:${j===2?'#fdecea':'#eaf6ee'};color:${j===2?'#B23':'#1A7F4B'}">${j===2?'AMBER':'GREEN'}</span></div>`).join("")}`)},
 {act:"Monitor",dur:6000,cap:"Overnight, the <b>News &amp; Reputation sweep</b> re-scores 742 entities across 150 PESTLE threats — and flags a technological concentration signal moving against Northwind.",
  html:dframe("Monitor · Overnight News & Reputation sweep","#1E3A5C","🛰️ nightly",
   `<div class="demo-stitle d-rise" style="--d:0ms">PESTLE signal · last sweep 06-05-2026</div>
    <div class="demo-field d-rise" style="--d:400ms"><span class="v">🔺 Technological — Cloud-concentration / outage</span><span class="demo-pill" style="background:#fdecea;color:#B23">▲ +9</span></div>
    <div class="demo-field d-rise" style="--d:800ms"><span class="v">🔺 Legal — Cross-border data transfer (SCCs)</span><span class="demo-pill" style="background:#fdecea;color:#B23">▲ +6</span></div>
    <div class="demo-field d-rise" style="--d:1200ms"><span class="v">🔻 Economic — Liquidity / cash-flow</span><span class="demo-pill" style="background:#eaf6ee;color:#1A7F4B">▼ −4</span></div>
    <div class="d-rise" style="--d:2000ms;margin-top:12px;color:#1E3A5C;font-weight:600">→ A finding is raised automatically and routed for management.</div>`)},
 {act:"Manage",dur:6000,cap:"The signal becomes <b>action</b>. A finding opens, a remediation plan is attached, and owners work it to closure — every step on the audit trail.",
  html:dframe("Manage · Finding & remediation","#8A2E3B","remediation",
   `<div class="demo-stitle d-rise" style="--d:0ms">F-2041 · Cloud-concentration exposure</div>
    <div class="d-rise" style="--d:300ms;margin-bottom:10px"><span class="demo-pill" style="background:#fdecea;color:#B23">HIGH</span> &nbsp;Owner: Resilience Lead &nbsp;·&nbsp; Due 30 days</div>
    ${[["Map alternate region / DR","done"],["Negotiate exit & egress terms","done"],["Add concentration KRI to dashboard","wip"]].map((a,j)=>`<div class="demo-field d-rise" style="--d:${700+j*350}ms"><span class="v" style="font-weight:500">${a[0]}</span><span class="demo-pill" style="background:${a[1]==='done'?'#eaf6ee':'#fff5e6'};color:${a[1]==='done'?'#1A7F4B':'#9A6F18'}">${a[1]==='done'?'✓ closed':'in progress'}</span></div>`).join("")}
    <div class="demo-bar d-rise" style="--d:1900ms;margin-top:12px"><i data-w="67" style="background:#8A2E3B"></i></div>
    <div class="d-rise" style="--d:2400ms;margin-top:8px;font-size:12.5px;color:#7a7565">Remediation 67% complete</div>`)},
 {act:"Manage",dur:5500,cap:"Resilience by design: contractual obligations and a <b>stressed-exit plan</b> stay green, so an exit could be executed without disruption.",
  html:dframe("Manage · Contract & exit readiness","#8A2E3B","CMORG",
   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="dcard d-pop" style="--d:200ms"><div class="k">Obligations met</div><div class="demo-stat" style="color:#1A7F4B" data-count="18" data-suffix="/19">0</div></div>
      <div class="dcard d-pop" style="--d:550ms"><div class="k">Exit readiness</div><div class="demo-stat" style="color:#1A7F4B">READY</div><div style="font-size:12px">Tested 04-12-2026</div></div></div>
    <div class="d-rise" style="--d:1100ms;margin-top:14px">${["Right-to-audit","Sub-processor flow-down","Data return & deletion","Step-in rights"].map(o=>`<span class="demo-pill d-pop" style="background:#eaf6ee;color:#1A7F4B;margin:3px">✓ ${o}</span>`).join("")}</div>`)},
 {act:"Analyse",dur:6000,cap:"Step back to the <b>whole estate</b>. The knowledge graph maps vendors, threats and concentrations — and surfaces the red hotspots that need attention.",
  html:dframe("Analyse · Threat knowledge graph","#0E7490","interactive",
   `<svg viewBox="0 0 640 290" width="100%" height="270" style="display:block">
      ${[[120,80,'#0E6E45',0],[230,60,'#B45309',200],[340,120,'#1E3A5C',400],[470,70,'#7C3AED',600],[520,180,'#8A2E3B',800],[210,200,'#0E7490',1000],[400,220,'#B8862B',1200]].map(([x,y,c,d],j)=>`<line class="d-fade" style="--d:${d+200}ms" x1="320" y1="145" x2="${x}" y2="${y}" stroke="#cfd8d2" stroke-width="1.3"/>`).join("")}
      <circle class="d-fade d-hot" style="--d:1400ms" cx="340" cy="120" r="13" fill="#DC2626"/>
      <circle class="d-fade" style="--d:0ms" cx="320" cy="145" r="20" fill="#11261F"/>
      ${[[120,80,'#0E6E45',0,'Northwind'],[230,60,'#B45309',200,'Region A'],[470,70,'#7C3AED',600,'4th party'],[520,180,'#8A2E3B',800,'PII flow'],[210,200,'#0E7490',1000,'SCC'],[400,220,'#B8862B',1200,'Spend']].map(([x,y,c,d,l])=>`<g class="d-fade" style="--d:${d+300}ms"><circle cx="${x}" cy="${y}" r="10" fill="${c}"/><text x="${x}" y="${y-15}" text-anchor="middle" font-size="11" fill="#28332c" font-family="Spline Sans">${l}</text></g>`).join("")}
      <text x="320" y="150" text-anchor="middle" font-size="11" fill="#fff" font-family="Spline Sans">Estate</text>
      <text class="d-fade" style="--d:1700ms" x="340" y="100" text-anchor="middle" font-size="11" fill="#B91C1C" font-weight="700" font-family="Spline Sans">⚠ concentration</text>
    </svg>`)},
 {act:"Analyse",dur:6000,cap:"The PESTLE heatmap quantifies it: <b>Technological</b> is the hottest category, with cloud-concentration the top systemic threat across the portfolio.",
  html:dframe("Analyse · PESTLE category heatmap","#0E7490","150 threats",
   `${[["Technological",83,"#0E6E45"],["Legal",71,"#8A2E3B"],["Political",64,"#B45309"],["Economic",58,"#1E3A5C"],["Social",49,"#7C3AED"],["Environmental",44,"#0E7490"]].map((c,j)=>`
      <div class="d-rise" style="--d:${j*250}ms;display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:120px;font-size:12.5px;color:#3a463f">${c[0]}</div>
        <div class="demo-bar" style="flex:1"><i data-w="${c[1]}" style="background:${c[2]}"></i></div>
        <div style="width:34px;text-align:right;font-weight:600">${c[1]}</div></div>`).join("")}
    <div class="d-rise" style="--d:1700ms;margin-top:8px;color:#0E7490;font-weight:600">Top systemic threat: Cloud-concentration / outage</div>`)},
 {act:"Understand",dur:6000,cap:"Ask in plain language. The <b>expert-reviewed</b> answer is contextual, specific and action-oriented — grounded in the live portfolio and PESTLE signal.",
  html:dframe("Understand · Management chat","#B8862B","expert-reviewed ✓",
   `<div class="d-rise" style="--d:0ms;font-weight:600;color:#1A4D3C;margin-bottom:8px">Q&nbsp; Where is our biggest concentration risk right now?</div>
    <div class="dcard" style="border-left:3px solid #B8862B"><div data-type="Cloud-concentration on a single region is the top exposure: 11 critical engagements — incl. Northwind ($2.4m) — depend on one provider. Technological PESTLE is at 83. Action: enforce multi-region DR (F-2041, due 30d), add a concentration KRI, and pre-stage exits for the 3 highest-spend vendors." style="font-size:13.5px;line-height:1.55;color:#26302a;min-height:120px"></div></div>`)},
 {act:"Understand",dur:6500,cap:"One click turns it into the <b>board &amp; regulator pack</b> — evidence-backed and audit-ready. From intake to boardroom, in sixty seconds.",
  html:dframe("Understand · Board / Regulator pack","#B8862B","export ready",
   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="dcard d-pop" style="--d:150ms"><div class="k">Pack sections</div><div class="demo-stat" data-count="9">0</div></div>
      <div class="dcard d-pop" style="--d:450ms"><div class="k">Evidence items</div><div class="demo-stat" data-count="146">0</div></div></div>
    ${["Portfolio posture","Concentration & PESTLE","Critical vendors","Findings & remediation","Exit readiness"].map((s,j)=>`<div class="demo-field d-rise" style="--d:${800+j*200}ms"><span class="v" style="font-weight:500">${s}</span><span class="demo-pill" style="background:#eaf6ee;color:#1A7F4B">✓ included</span></div>`).join("")}
    <div class="d-rise" style="--d:2000ms;margin-top:12px;text-align:center;font-family:Fraunces,serif;font-size:17px;color:#1A4D3C">Brata — secure & compliant by design.</div>`)},
];
let _demo=null;
function openDemo(){
  if(document.getElementById("demoOverlay")) return;
  closeHelp();
  const ov=document.createElement("div"); ov.id="demoOverlay"; ov.className="demo-overlay";
  ov.innerHTML=`<div class="demo-top"><div class="demo-kicker">Brata · guided tour</div>
      <div class="demo-h">End-to-end vendor risk, in 60 seconds</div>
      <button class="demo-x" onclick="closeDemo()" aria-label="Close">✕</button>
      <div class="demo-timeline" id="demoTimeline">${DEMO_ACTS.map((a,k)=>`<div class="demo-seg" data-act="${k}" onclick="demoSeekAct(${k})"><div class="bar"><i></i></div><div class="lab">${k+1}. ${a.key}</div></div>`).join("")}</div></div>
    <div class="demo-stage-wrap"><div class="demo-stage" id="demoStage"></div></div>
    <div class="demo-cap-wrap"><div class="demo-cap" id="demoCap"></div></div>
    <div class="demo-controls">
      <button class="demo-btn" onclick="demoPrev()" title="Previous">⏮</button>
      <button class="demo-btn play" id="demoPlayBtn" onclick="demoToggle()" title="Play / pause">⏸</button>
      <button class="demo-btn" onclick="demoNext()" title="Next">⏭</button>
      <div class="demo-time" id="demoTime">0:00 / 1:00</div></div>`;
  document.body.appendChild(ov); document.body.style.overflow="hidden";
  requestAnimationFrame(()=>ov.classList.add("open"));
  _demo={i:0,playing:true,sceneElapsed:0,last:null,finished:false,total:DEMO_SCENES.reduce((s,x)=>s+x.dur,0)};
  demoRenderScene(0); _demo.raf=requestAnimationFrame(demoLoop);
}
function closeDemo(){ if(_demo&&_demo.raf) cancelAnimationFrame(_demo.raf); _demo=null;
  const ov=document.getElementById("demoOverlay"); if(ov){ ov.classList.remove("open"); setTimeout(()=>ov.remove(),350); }
  document.body.style.overflow=""; }
function demoBaseElapsed(i){ let s=0; for(let k=0;k<i;k++) s+=DEMO_SCENES[k].dur; return s; }
function demoRenderScene(i){
  const stage=document.getElementById("demoStage"); if(!stage) return;
  stage.classList.add("swap");
  setTimeout(()=>{ const sc=DEMO_SCENES[i]; if(!sc) return;
    stage.innerHTML=sc.html; stage.classList.remove("swap");
    const cap=document.getElementById("demoCap"); if(cap) cap.innerHTML=sc.cap;
    demoTimeline(); demoAnimateIns();
  },300);
}
function demoAnimateIns(){
  const stage=document.getElementById("demoStage"); if(!stage) return;
  stage.querySelectorAll("[data-count]").forEach(el=>{
    const tgt=parseFloat(el.getAttribute("data-count")), dec=parseInt(el.getAttribute("data-dec")||"0",10);
    const suf=el.getAttribute("data-suffix")||"", pre=el.getAttribute("data-prefix")||"";
    const t0=performance.now(), durc=1200;
    const step=now=>{ const p=Math.min(1,(now-t0)/durc); const e=1-Math.pow(1-p,3);
      el.textContent=pre+(tgt*e).toFixed(dec)+suf; if(p<1) requestAnimationFrame(step); else el.textContent=pre+tgt.toFixed(dec)+suf; };
    requestAnimationFrame(step);
  });
  setTimeout(()=>stage.querySelectorAll(".demo-bar i[data-w]").forEach(b=>b.style.width=b.getAttribute("data-w")+"%"),120);
  stage.querySelectorAll("[data-type]").forEach(el=>{ const txt=el.getAttribute("data-type"); let k=0;
    const iv=setInterval(()=>{ el.textContent=txt.slice(0,k++); if(k>txt.length) clearInterval(iv); },18); });
}
function demoTimeline(){
  const sf=_demo.i+(_demo.sceneElapsed/DEMO_SCENES[_demo.i].dur);
  const idx={}; DEMO_ACTS.forEach((a,k)=>idx[a.key]=k);
  const start={},count={}; DEMO_SCENES.forEach((s,j)=>{ if(start[s.act]==null)start[s.act]=j; count[s.act]=(count[s.act]||0)+1; });
  document.querySelectorAll("#demoTimeline .demo-seg").forEach(seg=>{
    const k=+seg.getAttribute("data-act"), a=DEMO_ACTS[k].key;
    const frac=Math.max(0,Math.min(1,(sf-start[a])/count[a]));
    seg.querySelector("i").style.width=(frac*100)+"%";
    seg.classList.toggle("active", _demo.i>=start[a] && _demo.i<start[a]+count[a]);
  });
}
function demoFmtTime(ms){ const s=Math.round(ms/1000); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }
function demoLoop(ts){
  if(!_demo||!_demo.playing) return;
  if(_demo.last==null)_demo.last=ts; const dt=ts-_demo.last; _demo.last=ts;
  _demo.sceneElapsed+=dt;
  const el=document.getElementById("demoTime"); if(el) el.textContent=demoFmtTime(demoBaseElapsed(_demo.i)+_demo.sceneElapsed)+" / 1:00";
  demoTimeline();
  if(_demo.sceneElapsed>=DEMO_SCENES[_demo.i].dur){ demoGo(_demo.i+1); }
  if(_demo&&_demo.playing)_demo.raf=requestAnimationFrame(demoLoop);
}
function demoGo(n){
  if(n>=DEMO_SCENES.length){ _demo.i=DEMO_SCENES.length-1; _demo.sceneElapsed=DEMO_SCENES[_demo.i].dur; _demo.playing=false; _demo.finished=true;
    const pb=document.getElementById("demoPlayBtn"); if(pb)pb.textContent="↻"; demoTimeline(); return; }
  if(n<0) n=0; _demo.i=n; _demo.sceneElapsed=0; _demo.last=null; _demo.finished=false;
  const pb=document.getElementById("demoPlayBtn"); if(pb)pb.textContent=_demo.playing?"⏸":"▶";
  demoRenderScene(n);
}
function demoToggle(){ if(!_demo) return;
  if(_demo.finished){ demoGo(0); _demo.playing=true; document.getElementById("demoPlayBtn").textContent="⏸"; _demo.last=null; _demo.raf=requestAnimationFrame(demoLoop); return; }
  _demo.playing=!_demo.playing; document.getElementById("demoPlayBtn").textContent=_demo.playing?"⏸":"▶";
  if(_demo.playing){ _demo.last=null; _demo.raf=requestAnimationFrame(demoLoop); } else if(_demo.raf) cancelAnimationFrame(_demo.raf); }
function demoNext(){ if(_demo) demoGo(_demo.i+1); }
function demoPrev(){ if(_demo) demoGo(_demo.i-1); }
function demoSeekAct(k){ if(!_demo) return; let start=0,seen=0; for(let j=0;j<DEMO_SCENES.length;j++){ if(DEMO_SCENES[j].act===DEMO_ACTS[k].key){start=j;break;} } demoGo(start);
  if(!_demo.playing){ _demo.playing=true; document.getElementById("demoPlayBtn").textContent="⏸"; _demo.last=null; _demo.raf=requestAnimationFrame(demoLoop);} }
V.guideddemo=()=>{ openDemo(); };
function modal(html){ document.getElementById("modalRoot").innerHTML=
  `<div class="ovl" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`; }
function modalFull(html){ document.getElementById("modalRoot").innerHTML=
  `<div class="ovl ovl-full" onclick="if(event.target===this)closeModal()"><div class="modal full">${html}</div></div>`; }
function closeModal(){ document.getElementById("modalRoot").innerHTML=""; }
document.addEventListener("keydown",function(ev){ if(ev.key==="Escape"){ const r=document.getElementById("modalRoot"); if(r&&r.innerHTML.trim())closeModal(); } });

/* ---------- Home (tile launcher) ---------- */
/* ================= Data Integrity (Phase 1) ================= */
let _dq=null, _dqSug=[];
V.integrity=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Data Integrity</h1><div class="sub">Overnight steward · completeness, validation, contradictions, duplicates &amp; orphans</div></div>
    <button class="btn" onclick="dqSweep(true)">⟳ Run sweep</button></div>
    <div id="dqbody" class="muted">Running data-integrity sweep…</div>`;
  dqSweep(false);
};
async function dqSweep(withFlash){ const el=document.getElementById("dqbody"); if(!el)return;
  if(withFlash) el.innerHTML='<div class="muted">Running data-integrity sweep…</div>';
  try{ _dq=await api2("/integrity/sweep",{method:"POST",body:JSON.stringify({})}); dqRender(); if(withFlash)flash("Sweep complete"); }
  catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function dqRender(){
  const el=document.getElementById("dqbody"); if(!el||!_dq)return; const h=_dq.health;
  const TONE={high:"#DC2626",medium:"#F59E0B",low:"#9CA3AF"};
  const TYPELBL={completeness:"Completeness gaps",validation:"Validation errors",contradiction:"Contradictions",stale:"Stale records",orphan:"Orphan records",duplicate:"Duplicate / alias"};
  let html=`<div class="grid g4" style="gap:10px;margin-bottom:14px">
     <div class="card stat"><div class="v">${h.overall}</div><div class="l">Data-health score</div></div>
     <div class="card stat"><div class="v">${h.completeness}%</div><div class="l">Avg completeness</div></div>
     <div class="card stat"><div class="v">${h.issue_count}</div><div class="l">Open issues</div></div>
     <div class="card stat"><div class="v">${_dq.vendors_checked}</div><div class="l">Vendors checked</div></div></div>`;
  const sev=h.by_severity||{}; const tot=(sev.high||0)+(sev.medium||0)+(sev.low||0)||1;
  html+=`<div class="card" style="margin-bottom:14px"><div class="card-label">Issues by severity</div>
    <div style="display:flex;height:18px;border-radius:7px;overflow:hidden;margin:8px 0">
    ${["high","medium","low"].map(k=>{const p=Math.round((sev[k]||0)/tot*100);return p?`<div style="width:${p}%;background:${TONE[k]};color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center">${sev[k]}</div>`:''}).join("")}</div>
    <div class="row" style="gap:12px;font-size:12px">${["high","medium","low"].map(k=>`<span><span style="display:inline-block;width:9px;height:9px;background:${TONE[k]};border-radius:2px"></span> ${k}: <b>${sev[k]||0}</b></span>`).join("")}</div></div>`;
  if((_dq.duplicate_clusters||[]).length){
    html+=`<div class="card" style="margin-bottom:14px"><div class="card-label">Duplicate / alias clusters</div>
    ${_dq.duplicate_clusters.map(cl=>`<div class="rev-row"><span class="rk">${cl.map(g=>esc(g.legal_name)).join(" · ")}</span>
      <span class="rv">${cl.slice(1).map(g=>`<button class="btn sm ghost" onclick="dqMerge('${cl[0].vendor_id}','${g.vendor_id}')">Merge ${esc(g.vendor_id)} → primary</button>`).join(" ")}</span></div>`).join("")}</div>`;
  }
  const groups={}; for(const it of _dq.issues){ (groups[it.type]=groups[it.type]||[]).push(it); }
  for(const typ of Object.keys(TYPELBL)){ const list=groups[typ]; if(!list||!list.length)continue;
    html+=`<div class="card" style="margin-bottom:12px"><div class="card-label">${TYPELBL[typ]} (${list.length})</div>
      <table style="margin-top:6px"><tr><th>Vendor</th><th>Issue</th><th>Sev</th><th></th></tr>
      ${list.slice(0,40).map(it=>`<tr class="click" onclick="dqIssueOpen('${it.id}')" title="Open the record to edit & resolve"><td>${esc(it.vendor)}<div class="muted" style="font-size:10px">${esc(it.vendor_id)}</div></td>
        <td style="font-size:11.5px">${esc(it.message)}</td>
        <td><span class="tag" style="background:${TONE[it.severity]};color:#fff">${it.severity}</span></td>
        <td style="text-align:right">${dqAction(it)}</td></tr>`).join("")}
      ${list.length>40?`<tr><td colspan="4" class="muted">…and ${list.length-40} more</td></tr>`:''}</table></div>`;
  }
  el.innerHTML=html;
}
function dqAction(it){
  if(it.fix_kind==='set'||it.fix_kind==='clear') return `<button class="btn sm" onclick="event.stopPropagation();dqFix('${it.vendor_id}','${it.field}','${esc(String(it.suggested_fix||''))}')">Fix → ${esc(String(it.suggested_fix||'clear'))}</button>`;
  if(it.type==='completeness') return `<button class="btn sm ghost" onclick="event.stopPropagation();dqEnrich('${it.vendor_id}')">Enrich</button>`;
  return '';
}
/* ---- click an issue → open the linked record, edit, resolve ---- */
let _dqResolveCtx=null;
const _DQ_FIELDS=[["lei","LEI"],["registration_number","Registration number"],["incorporation_country","Incorporation country"],["hq_country","HQ country"],["ultimate_parent","Ultimate parent"],["legal_form","Legal form"],["website","Website"],["listing_status","Listing status"],["status","Lifecycle status"],["tier","Tier"],["duns","DUNS"]];
async function dqIssueOpen(id){
  const it=(_dq&&_dq.issues||[]).find(x=>x.id===id); if(!it)return;
  if(it.type==='duplicate') return dqDupResolve(it);
  let vm=null; try{ vm=await api2('/vendor-master/'+it.vendor_id); }catch(e){ vm=null; }
  if(!vm){
    return modal(`<h3>Orphan / unresolved reference</h3>
      <div class="rev-row"><span class="rk">${esc(it.type)} <span class="tag" style="background:#DC2626;color:#fff">${esc(it.severity)}</span></span><span class="rv" style="font-size:12px">${esc(it.message)}</span></div>
      <div class="muted" style="font-size:12px;margin-top:8px">The referenced vendor <b>${esc(it.vendor_id)}</b> is not in the register. Re-link the affected record to a valid vendor or remove it; the issue clears on the next sweep.</div>
      <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button><button class="btn" onclick="closeModal();V.vendors()">Open Vendor Register</button></div>`);
  }
  _dqResolveCtx={id:it.id, vendor_id:it.vendor_id, field:it.field||'', type:it.type};
  const rows=_DQ_FIELDS.map(([k,l])=>{
    const cur=vm[k]==null?'':String(vm[k]); const isF=(k===it.field);
    const pre=(isF&&cur==='')?String(it.suggested_fix||''):cur;
    return `<div class="field"${isF?' style="outline:2px solid var(--gold,#B8862B);outline-offset:2px;border-radius:6px;padding:4px"':''}>
      <label>${esc(l)}${isF?' · <span style="color:#B8862B;font-weight:600">flagged</span>':''}</label>
      <input id="dqf_${k}" data-init="${esc(cur)}" value="${esc(pre)}"></div>`;
  }).join('');
  modalFull(`<h3>Resolve issue · ${esc(vm.legal_name||it.vendor)} <span class="muted" style="font-size:12px">${esc(it.vendor_id)}</span></h3>
    <div class="rev-row"><span class="rk">${esc(it.type)} <span class="tag" style="background:#666;color:#fff">${esc(it.severity)}</span></span><span class="rv" style="font-size:12px">${esc(it.message)}</span></div>
    <div class="muted" style="font-size:12px;margin:8px 0">Edit the record and save — the flagged field is highlighted. Saving updates the master record and re-checks the issue.</div>
    <div class="grid g3">${rows}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn ghost" onclick="closeModal();openVendorMaster('${it.vendor_id}')">📇 Open full record</button>
      <button class="btn" onclick="dqResolveSave()">Save &amp; resolve</button></div>`);
  setTimeout(()=>{ const f=document.getElementById('dqf_'+(it.field||'')); if(f){f.focus(); if(f.select)f.select();} },60);
}
async function dqResolveSave(){
  const ctx=_dqResolveCtx; if(!ctx)return;
  try{
    let changed=0;
    for(const [k] of _DQ_FIELDS){ const el=document.getElementById('dqf_'+k); if(!el)continue; const v=el.value.trim(); if(v===(el.dataset.init||''))continue; await api2('/integrity/fix',{method:'POST',body:JSON.stringify({vendor_id:ctx.vendor_id,field:k,value:v})}); changed++; }
    const r=await api2('/integrity/sweep',{method:'POST',body:JSON.stringify({vendor_ids:[ctx.vendor_id]})});
    const remain=(r.issues||[]).filter(i=>i.vendor_id===ctx.vendor_id && i.type===ctx.type && (i.field||'')===(ctx.field||''));
    closeModal(); _dqResolveCtx=null;
    flash(changed ? (remain.length ? 'Updated — issue still flagged' : 'Issue resolved ✓') : 'No changes made');
    dqSweep(false);
  }catch(e){ flash(e.message); }
}
function dqDupResolve(it){
  const cl=(_dq&&_dq.duplicate_clusters||[]).find(c=>c.some(g=>g.vendor_id===it.vendor_id));
  if(!cl){ return openVendorMaster(it.vendor_id); }
  modal(`<h3>Resolve duplicate / alias</h3>
    <div class="muted" style="font-size:12px;margin-bottom:8px">${esc(it.message)}</div>
    <div class="muted" style="font-size:12px">Keep one record as primary and merge the alias into it. Engagements, assessments, findings and documents move to the primary; the alias is removed.</div>
    ${cl.map(g=>`<div class="rev-row"><span class="rk">${esc(g.legal_name)} <span class="muted">${esc(g.vendor_id)}</span> · ${g.engagements} eng</span>
      <span class="rv">${cl.filter(o=>o.vendor_id!==g.vendor_id).map(o=>`<button class="btn sm ghost" onclick="closeModal();dqMerge('${g.vendor_id}','${o.vendor_id}')">keep ${esc(g.vendor_id)} ← merge ${esc(o.vendor_id)}</button>`).join(' ')}</span></div>`).join('')}
    <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button>
      <button class="btn ghost" onclick="closeModal();openVendorMaster('${it.vendor_id}')">📇 Open record</button></div>`);
}
async function dqFix(vid,field,value){ try{ await api2("/integrity/fix",{method:"POST",body:JSON.stringify({vendor_id:vid,field,value})}); flash("Fixed"); dqSweep(false); }catch(e){ flash(e.message); } }
async function dqMerge(primary,dup){ if(!confirm("Merge "+dup+" into "+primary+"? Engagements, assessments, findings and documents move to the primary and the duplicate is deleted.")) return;
  try{ const r=await api2("/integrity/merge",{method:"POST",body:JSON.stringify({primary_vendor_id:primary,duplicate_vendor_id:dup})}); const n=Object.values(r.moved).reduce((a,b)=>a+b,0); flash("Merged — "+n+" records moved"); dqSweep(false); }catch(e){ flash(e.message); } }
async function dqEnrich(vid){ flash("AI enriching…");
  try{ const r=await api2("/integrity/enrich",{method:"POST",body:JSON.stringify({vendor_id:vid})});
    if(r.holding){ flash("AI engine not connected — connect in Settings"); return; }
    _dqSug=r.suggestions||[]; if(!_dqSug.length){ flash("No enrichment suggestions"); return; }
    modal(`<h3>Enrichment suggestions</h3><div class="muted" style="font-size:12px;margin-bottom:8px">AI-proposed values for ${esc(vid)} — accept to apply (human-gated).</div>
      ${_dqSug.map((sg,i)=>`<div class="rev-row"><span class="rk">${esc(sg.field)} <span class="tag">${esc(String(sg.confidence||''))}%</span></span>
        <span class="rv">${esc(String(sg.value||''))} ${sg.source?`<a href="${esc(sg.source)}" target="_blank">↗</a>`:''}
        <button class="btn sm" onclick="dqAccept('${vid}',${i})">Accept</button></span></div>`).join("")}
      <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
  }catch(e){ flash(e.message); } }
async function dqAccept(vid,i){ const sg=_dqSug[i]; if(!sg)return;
  try{ await api2("/integrity/fix",{method:"POST",body:JSON.stringify({vendor_id:vid,field:sg.field,value:String(sg.value||'')})}); flash("Applied "+sg.field); }catch(e){ flash(e.message); } }
/* ================= Entity Graph (Phase 2) ================= */
let _eg=null;
V.entitygraph=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Entity Graph</h1><div class="sub">Ownership &amp; sub-provider concentration · contagion modelling</div></div></div>
   <div id="egbody" class="muted">Building entity graph…</div>`;
  try{ _eg=await api2("/graph/overview"); egRender(); }catch(e){ document.getElementById("egbody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function egRender(){
  const el=document.getElementById("egbody"); if(!el||!_eg)return; const st=_eg.stats;
  let html=`<div class="grid g4" style="gap:10px;margin-bottom:14px">
    <div class="card stat"><div class="v">${st.vendors}</div><div class="l">Vendors in graph</div></div>
    <div class="card stat"><div class="v">${st.shared_fourth_parties}</div><div class="l">Shared sub-providers</div></div>
    <div class="card stat"><div class="v">${st.spof_count}</div><div class="l">Single points of failure</div></div>
    <div class="card stat"><div class="v">${st.max_fanout_pct}%</div><div class="l">Largest fan-out (of estate)</div></div></div>`;
  html+=`<div class="card" style="margin-bottom:14px"><div class="card-label">Shared fourth parties — concentration &amp; single points of failure</div>
    <div style="margin-top:8px">${_eg.shared_fourth_parties.map(f=>`
      <div class="rev-row" style="align-items:center"><span class="rk" style="flex:1">
        <b>${esc(f.legal_name)}</b> ${f.spof?'<span class="tag" style="background:#DC2626;color:#fff">SPOF</span>':''}
        <div class="muted" style="font-size:10px">${esc(f.service||'')}${f.hq_country?' · '+esc(f.hq_country):''}</div>
        <div style="height:8px;background:#e8e2d4;border-radius:4px;margin-top:5px;max-width:340px"><div style="width:${f.reach_pct}%;height:100%;background:#1A4D3C;border-radius:4px"></div></div>
      </span>
      <span class="rv" style="text-align:right"><b>${f.vendor_count}</b> vendors (${f.reach_pct}%)<br><span class="muted" style="font-size:10px">${f.critical_count} critical</span><br>
        <button class="btn sm ghost" onclick="egContagion('fourth_party','${f.fourth_party_id}')">Contagion →</button></span></div>`).join("")}</div></div>`;
  if((_eg.ownership_clusters||[]).length){
    html+=`<div class="card" style="margin-bottom:14px"><div class="card-label">Common-ownership clusters (hidden concentration)</div>
      ${_eg.ownership_clusters.map(o=>`<div class="rev-row"><span class="rk"><b>${esc(o.owner)}</b> <span class="muted" style="font-size:10px">${esc(o.kind)}</span><div class="muted" style="font-size:11px">${o.vendors.map(v=>esc(v.legal_name)).join(" · ")}</div></span>
        <span class="rv">${o.vendor_count} vendors · ${o.critical_count} critical <button class="btn sm ghost" onclick="egContagion('owner','${esc(o.owner).replace(/'/g,'')}')">Contagion →</button></span></div>`).join("")}</div>`;
  } else {
    html+=`<div class="card muted" style="margin-bottom:14px">No common-ownership clusters surfaced yet — populate <b>ultimate parent</b> via Data Integrity → Enrich to reveal concealed common ownership.</div>`;
  }
  el.innerHTML=html;
}
async function egContagion(type,id){
  try{ const r=await api2("/graph/contagion",{method:"POST",body:JSON.stringify({node_type:type,node_id:id})});
    modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 12px">
        <div class="muted" style="font-size:11px;letter-spacing:.04em">CONTAGION · IF THIS ENTITY DEGRADES</div><button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
      <div class="full-body">
      <h3 style="margin:0 0 4px">${esc(r.label)}</h3>
      <div class="grid g4" style="gap:10px;margin:12px 0">
        <div class="card stat"><div class="v">${r.vendor_count}</div><div class="l">Vendors exposed</div></div>
        <div class="card stat"><div class="v">${r.critical_count}</div><div class="l">Critical vendors</div></div>
        <div class="card stat"><div class="v">${r.engagement_count}</div><div class="l">Engagements exposed</div></div>
        <div class="card stat"><div class="v">${(r.business_units||[]).length}</div><div class="l">Business units</div></div></div>
      ${(r.business_units||[]).length?`<div class="muted" style="font-size:12px;margin-bottom:8px">Business units: ${r.business_units.map(esc).join(", ")}</div>`:''}
      <table><tr><th>Vendor</th><th>Critical</th><th>Engagements</th></tr>
      ${r.affected_vendors.map(v=>`<tr><td>${esc(v.legal_name)} <span class="muted" style="font-size:10px">${esc(v.vendor_id)}</span></td>
        <td>${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':'—'}</td><td>${v.engagements}</td></tr>`).join("")}</table>
      </div>`);
  }catch(e){ flash(e.message); }
}
/* ================= BU Exposure & incident matching (Phase 3) ================= */
let _exp=null;
const RES_TONE={LOW:"#0E9F6E",MODERATE:"#84CC16",ELEVATED:"#F59E0B",HIGH:"#EA580C",CRITICAL:"#DC2626"};
V.exposure=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>BU Exposure</h1><div class="sub">Business-unit risk profiles · cross-BU shared vendors · incident → issue matching</div></div>
    <button class="btn" onclick="incMatchOpen()">⚡ Match an incident</button></div>
    <div id="expbody" class="muted">Building exposure profiles…</div>`;
  try{ _exp=await api2("/exposure/bu"); expRender(); }catch(e){ document.getElementById("expbody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function resBar(r){ const tot=Object.values(r).reduce((a,b)=>a+b,0)||1;
  return `<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;max-width:260px;margin-top:5px">
    ${["LOW","MODERATE","ELEVATED","HIGH","CRITICAL"].map(k=>{const p=Math.round((r[k]||0)/tot*100);return p?`<div style="width:${p}%;background:${RES_TONE[k]}"></div>`:''}).join("")}</div>`; }
function expRender(){
  const el=document.getElementById("expbody"); if(!el||!_exp)return;
  let html=`<div class="card" style="margin-bottom:14px"><div class="card-label">Business-unit exposure (ranked — highest unmanaged risk first)</div>
    <div style="margin-top:8px">${_exp.business_units.map((p,i)=>`<div class="rev-row" style="align-items:center">
      <span class="rk" style="flex:1"><b>${esc(p.business_unit)}</b> ${i===0?'<span class="tag" style="background:#DC2626;color:#fff">highest exposure</span>':''}
        <div class="muted" style="font-size:11px">${p.vendor_count} vendors · ${p.critical_count} critical · ${p.engagements} engagements · £${(p.spend).toLocaleString()} spend · ${p.open_findings} open findings</div>
        ${resBar(p.residual)}</span>
      <span class="rv" style="text-align:right"><div style="font-family:Fraunces,serif;font-size:22px;color:var(--gold)">${p.exposure_score}</div><div class="muted" style="font-size:10px">exposure score</div>
        <button class="btn sm ghost" onclick="expBrief('${esc(p.business_unit).replace(/'/g,'')}')">Brief →</button></span></div>`).join("")}</div></div>`;
  if((_exp.cross_bu_shared_vendors||[]).length){
    html+=`<div class="card"><div class="card-label">Cross-BU shared vendors (${_exp.shared_vendor_count}) — one vendor, multiple business units</div>
      <table style="margin-top:6px"><tr><th>Vendor</th><th>Critical</th><th>Business units</th></tr>
      ${_exp.cross_bu_shared_vendors.map(v=>`<tr><td>${esc(v.legal_name)} <span class="muted" style="font-size:10px">${esc(v.vendor_id)}</span></td>
        <td>${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':'—'}</td>
        <td style="font-size:11px">${v.business_units.map(esc).join(", ")} <b>(${v.bu_count})</b></td></tr>`).join("")}</table></div>`;
  }
  el.innerHTML=html;
}
async function expBrief(bu){ try{ const r=await api2("/exposure/brief",{method:"POST",body:JSON.stringify({business_unit:bu})});
  modal(`<h3>${esc(bu)} — exposure brief</h3><p style="font-size:13px;line-height:1.5;color:#333">${esc(r.brief)}</p>
    ${r.holding?'<div class="muted" style="font-size:11px">Deterministic summary — connect an AI engine in Settings for a written board note.</div>':''}
    <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button></div>`); }catch(e){ flash(e.message); } }
async function incMatchOpen(){
  let vendors=[]; try{ vendors=await api2("/vendors"); }catch(e){}
  modal(`<h3>Match an incident to open issues</h3>
    <div class="muted" style="font-size:12px;margin-bottom:8px">When an incident lands, find the open findings it materialises — and the peers carrying the same unremediated gap.</div>
    <div class="field"><label>Vendor</label><select id="im_v">${vendors.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name||v.vendor_id)}</option>`).join("")}</select></div>
    <div class="field"><label>Incident description</label><textarea id="im_d" rows="3" placeholder="e.g. Outage in eu-west-1; DR failover did not work; customer data exposed"></textarea></div>
    <div class="field"><label>Domain (optional)</label><input id="im_dom" placeholder="e.g. resilience, infosec, privacy"></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="incMatchRun()">Match</button></div>`);
}
async function incMatchRun(){ const vid=val("im_v"),d=val("im_d"),dom=val("im_dom");
  if(!vid){flash("Pick a vendor");return;} closeModal(); flash("Matching incident to open issues…");
  try{ const r=await api2("/incidents/match",{method:"POST",body:JSON.stringify({vendor_id:vid,description:d,domain:dom||null})});
    modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 12px">
        <div class="muted" style="font-size:11px;letter-spacing:.04em">INCIDENT → ISSUE MATCH</div><button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
      <div class="full-body">
      <h3 style="margin:0 0 8px">${esc(r.vendor)}</h3>
      <div class="card" style="margin-bottom:12px"><div class="card-label">Open findings this incident may materialise (${r.matched_findings.length})</div>
        ${r.matched_findings.length?`<table style="margin-top:6px"><tr><th>Finding</th><th>Severity</th><th>Status</th><th>Match</th></tr>
        ${r.matched_findings.map(f=>`<tr><td>${esc(f.finding_id)} · ${esc(f.title)}</td><td><span class="tag">${esc(f.severity)}</span></td><td>${esc(f.status)}</td><td>${f.match>0?'●'.repeat(Math.min(5,f.match)):'—'}</td></tr>`).join("")}</table>`
        :'<div class="muted">No open findings on this vendor match the incident.</div>'}</div>
      <div class="card"><div class="card-label">Peer exposure — same unremediated gap elsewhere (${r.peer_count})</div>
        ${r.peer_exposure.length?`<table style="margin-top:6px"><tr><th>Vendor</th><th>Critical</th><th>Shared gaps</th></tr>
        ${r.peer_exposure.map(p=>`<tr><td>${esc(p.legal_name)} <span class="muted" style="font-size:10px">${esc(p.vendor_id)}</span></td>
          <td>${p.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':'—'}</td>
          <td style="font-size:11px">${p.findings.slice(0,3).map(f=>esc(f.domain||f.title)).join(", ")}${p.findings.length>3?` +${p.findings.length-3}`:''}</td></tr>`).join("")}</table>`
        :'<div class="muted">No peers carry the same gap.</div>'}</div>
      </div>`);
  }catch(e){ flash(e.message); } }
/* ================= Geopolitical / export-control sensor (Phase 4) ================= */
let _geo=null;
const GEO_TONE={low:"#9CA3AF",moderate:"#F59E0B",elevated:"#EA580C",high:"#DC2626"};
V.geopolitical=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Geopolitical</h1><div class="sub">Export controls · sanctions · dual-use — mapped to vendor &amp; sub-processor geographies</div></div>
    <button class="btn" onclick="geoScan()">⟳ Scan live actions</button></div>
    <div id="geobody" class="muted">Mapping geographic exposure…</div>`;
  try{ _geo=await api2("/geopolitical/exposure"); geoRender(); }catch(e){ document.getElementById("geobody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function geoTag(l){ return `<span class="tag" style="background:${GEO_TONE[l]};color:#fff">${l}</span>`; }
function geoRender(){
  const el=document.getElementById("geobody"); if(!el||!_geo)return; const st=_geo.stats;
  let html=`<div class="grid g4" style="gap:10px;margin-bottom:14px">
    <div class="card stat"><div class="v">${st.exposed_vendors}</div><div class="l">Geo-exposed vendors</div></div>
    <div class="card stat"><div class="v">${st.component_shortage_vendors}</div><div class="l">Component-shortage risk</div></div>
    <div class="card stat"><div class="v">${st.high_risk_jurisdictions}</div><div class="l">High-risk jurisdictions</div></div>
    <div class="card stat"><div class="v">${st.vendors}</div><div class="l">Vendors mapped</div></div></div>`;
  html+=`<div id="geoEvents"></div>`;
  html+=`<div class="card" style="margin-bottom:14px"><div class="card-label">Jurisdiction exposure (ranked by risk)</div>
    <table style="margin-top:6px"><tr><th>Jurisdiction</th><th>Risk</th><th>Vendors (domicile)</th><th>As sub-processor</th><th>Drivers</th></tr>
    ${_geo.jurisdictions.map(j=>`<tr><td><b>${esc(j.country)}</b>${j.component?' <span class="muted" style="font-size:10px">component hub</span>':''}</td>
      <td>${geoTag(j.level)}</td><td>${j.vendor_count}</td><td>${j.as_subprocessor}</td>
      <td style="font-size:11px" class="muted">${(j.drivers||[]).join("; ")||'—'}</td></tr>`).join("")}</table></div>`;
  html+=`<div class="card"><div class="card-label">Export-control / sanctions-exposed vendors (${_geo.flagged_vendors.length})</div>
    <table style="margin-top:6px"><tr><th>Vendor</th><th>Exposure via</th><th>Risk</th><th>Component shortage</th><th>Drivers</th></tr>
    ${_geo.flagged_vendors.map(f=>`<tr><td>${esc(f.legal_name)} ${f.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':''}<div class="muted" style="font-size:10px">${esc(f.vendor_id)}</div></td>
      <td style="font-size:11px">${esc(f.country)} <span class="muted">(${esc(f.via)})</span></td>
      <td>${geoTag(f.level)}</td>
      <td>${f.component_shortage_risk?'<span class="tag" style="background:#EA580C;color:#fff">likely</span>':'—'}</td>
      <td style="font-size:11px" class="muted">${(f.drivers||[]).join("; ")||'—'}</td></tr>`).join("")}</table></div>`;
  el.innerHTML=html;
}
async function geoScan(){ flash("Web-searching live export-control & sanctions actions…");
  try{ const r=await api2("/geopolitical/scan",{method:"POST",body:JSON.stringify({})});
    if(r.holding){ flash("AI engine not connected — connect in Settings"); return; }
    const ev=document.getElementById("geoEvents"); if(!ev)return;
    if(!(r.events||[]).length){ ev.innerHTML=`<div class="card muted" style="margin-bottom:14px">No new export-control or sanctions actions found for ${(r.exposed_countries||[]).join(", ")}.</div>`; flash("No new actions"); return; }
    ev.innerHTML=`<div class="card" style="margin-bottom:14px"><div class="card-label">Live export-control / sanctions actions (${r.events.length})</div>
      ${r.events.map(e=>`<div class="rev-row"><span class="rk"><b>${esc(e.title||'')}</b> <span class="tag">${esc(e.country||'')}</span>${e.date?` <span class="muted" style="font-size:10px">${esc(e.date)}</span>`:''}
        <div class="muted" style="font-size:11px">${esc(e.summary||'')}</div>
        ${e.impact?`<div style="font-size:11px;color:#EA580C">⚠ ${esc(e.impact)}</div>`:''}
        ${(e.affected_vendors||[]).length?`<div class="muted" style="font-size:11px">Affected: ${e.affected_vendors.slice(0,6).map(v=>esc(v.legal_name)).join(", ")}${e.affected_vendors.length>6?` +${e.affected_vendors.length-6}`:''}</div>`:''}</span>
        <span class="rv">${e.source?(/^https?:/i.test(e.source)?`<a href="${esc(e.source)}" target="_blank">source ↗</a>`:esc(e.source)):''}</span></div>`).join("")}</div>`;
    flash(`${r.events.length} action(s) found`);
  }catch(e){ flash(e.message); } }
/* ================= Advanced Analysis hub ================= */
V.advanced=async()=>{
  const view=document.getElementById("view");
  const cards=[
    {v:"integrity",ico:"🩺",t:"Data Integrity",d:"Overnight steward — completeness, validation, contradictions, duplicates &amp; orphans across the estate.",s:"dq"},
    {v:"entitygraph",ico:"🕸️",t:"Entity Graph",d:"Ownership clusters, shared sub-providers and contagion — who falls over if an entity degrades.",s:"eg"},
    {v:"exposure",ico:"🎯",t:"BU Exposure",d:"Business-unit risk profiles, cross-BU shared vendors and incident → issue matching.",s:"exp"},
    {v:"geopolitical",ico:"🌍",t:"Geopolitical",d:"Export controls, sanctions &amp; dual-use mapped to vendor and sub-processor geographies.",s:"geo"},
  ];
  view.innerHTML=`<div class="top"><div><h1>Advanced Analysis</h1><div class="sub">Cross-portfolio risk analytics over the current estate</div></div></div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${cards.map(c=>`
     <div class="card" style="cursor:pointer" onclick="goTo('${c.v}')">
       <div style="font-size:26px">${c.ico}</div>
       <h3 style="margin:6px 0 4px">${c.t}</h3>
       <div class="muted" style="font-size:12.5px;line-height:1.5">${c.d}</div>
       <div id="adv_${c.s}" class="muted" style="font-size:11px;margin-top:8px">…</div>
       <button class="btn sm ghost" style="margin-top:10px" onclick="event.stopPropagation();goTo('${c.v}')">Open →</button>
     </div>`).join("")}</div>`;
  const set=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html;};
  try{ const d=await api2("/integrity/digest"); set("adv_dq",`Health <b>${d.health.overall}</b> · ${d.health.issue_count} open issues · ${d.health.completeness}% complete`); }catch(e){ set("adv_dq","—"); }
  try{ const d=await api2("/graph/overview"); set("adv_eg",`${d.stats.shared_fourth_parties} shared sub-providers · ${d.stats.spof_count} SPOFs · ${d.stats.max_fanout_pct}% max fan-out`); }catch(e){ set("adv_eg","—"); }
  try{ const d=await api2("/exposure/bu"); if(d.business_units.length) set("adv_exp",`${d.bu_count} BUs · highest <b>${esc(d.business_units[0].business_unit)}</b> (score ${d.business_units[0].exposure_score}) · ${d.shared_vendor_count} cross-BU vendors`); }catch(e){ set("adv_exp","—"); }
  try{ const d=await api2("/geopolitical/exposure"); set("adv_geo",`${d.stats.exposed_vendors} geo-exposed · ${d.stats.component_shortage_vendors} component-shortage · ${d.stats.high_risk_jurisdictions} high-risk jurisdictions`); }catch(e){ set("adv_geo","—"); }
};
/* ================= Multilingual display + workbench ================= */
function captureI18n(){
  document.querySelectorAll('#nav a').forEach(a=>{ const tn=[...a.childNodes].find(n=>n.nodeType===3&&n.textContent.trim()); if(tn&&!a.dataset.en)a.dataset.en=tn.textContent.trim(); });
  document.querySelectorAll('#nav .nav-group-label').forEach(e=>{ if(!e.dataset.en)e.dataset.en=e.textContent.trim(); });
}
function _setNavText(a,text){ const tn=[...a.childNodes].find(n=>n.nodeType===3); if(tn)tn.textContent=text; else a.appendChild(document.createTextNode(text)); }
async function applyLang(code){
  captureI18n();
  document.documentElement.dir = (code==='ar')?'rtl':'ltr';
  sessionStorage.setItem('bro_lang',code);
  const ls=document.getElementById('langSel'); if(ls)ls.value=code;
  const anchors=[...document.querySelectorAll('#nav a[data-en]')];
  const labels=[...document.querySelectorAll('#nav .nav-group-label[data-en]')];
  if(code==='en'){ anchors.forEach(a=>_setNavText(a,a.dataset.en)); labels.forEach(e=>e.textContent=e.dataset.en); return; }
  const strings=[...new Set([...anchors,...labels].map(e=>e.dataset.en))];
  let tr={}, ai=false;
  try{ const r=await api2('/i18n/translate',{method:'POST',body:JSON.stringify({strings,lang:code})}); tr=r.translations||{}; ai=r.ai; }catch(e){}
  anchors.forEach(a=> _setNavText(a, tr[a.dataset.en]||a.dataset.en));
  labels.forEach(e=> e.textContent = tr[e.dataset.en]||e.dataset.en);
  if(!Object.keys(tr).length && code!=='en') flash('Connect an AI engine in Settings → AI to translate the display into this language.');
}
function setLang(code){ applyLang(code); }
function initLang(){ try{ const sl=sessionStorage.getItem('bro_lang')||'en'; const ls=document.getElementById('langSel'); if(ls)ls.value=sl; if(sl!=='en')applyLang(sl); }catch(e){} }

V.language=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Translation workbench</h1><div class="sub">Type or paste in any language — AI normalises it to English for the record. The backend of record is always English.</div></div></div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
     <div class="card"><div class="card-label">Multilingual input → English (stored)</div>
       <textarea id="ti_in" rows="5" placeholder="Type in your language (e.g. Español, العربية, 中文)…"></textarea>
       <button class="btn sm" style="margin-top:8px" onclick="tiNormalize()">Normalise to English</button>
       <div id="ti_out" class="muted" style="font-size:12px;margin-top:10px"></div></div>
     <div class="card"><div class="card-label">Document translation &amp; logical correlation</div>
       <textarea id="td_in" rows="5" placeholder="Paste document text in any language…"></textarea>
       <button class="btn sm" style="margin-top:8px" onclick="tdRun()">Translate &amp; correlate</button>
       <div id="td_out" class="muted" style="font-size:12px;margin-top:10px"></div></div>
   </div>
   <div class="muted" style="font-size:11px;margin-top:12px">Display language is set from the selector at the foot of the menu. Stored records, audit trail and analytics remain in English regardless of the input language, so correlation and reporting stay consistent.</div>`;
};
async function tiNormalize(){ const t=val('ti_in'); if(!t){flash('Enter some text');return;} const o=document.getElementById('ti_out'); o.textContent='Translating…';
  try{ const r=await api2('/i18n/normalize',{method:'POST',body:JSON.stringify({text:t})});
    if(r.holding){ o.innerHTML='<span class="err">AI engine not connected — connect in Settings → AI.</span>'; return; }
    o.innerHTML=`<div><b>Detected language:</b> ${esc(r.detected_language)}</div><div style="margin-top:4px"><b>Stored (English):</b> ${esc(r.english)}</div>`;
  }catch(e){ o.textContent=e.message; } }
async function tdRun(){ const t=val('td_in'); if(!t){flash('Paste a document');return;} const o=document.getElementById('td_out'); o.textContent='Translating &amp; correlating…';
  try{ const r=await api2('/i18n/document',{method:'POST',body:JSON.stringify({text:t})});
    if(r.holding){ o.innerHTML='<span class="err">AI engine not connected — connect in Settings → AI.</span>'; return; }
    o.innerHTML=`<div><b>Detected language:</b> ${esc(r.detected_language)}</div><div style="margin-top:4px"><b>English:</b> ${esc(r.english)}</div><div style="margin-top:6px"><b>Logical correlation:</b> ${esc(r.correlation||'—')}</div>`;
  }catch(e){ o.textContent=e.message; } }
/* ================= Critical Vendor Modelling (transparency) ================= */
let _crit=null,_critTab='critical';
V.criticality=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Critical Vendor Modelling</h1><div class="sub">Transparency — exactly which IRQ &amp; impact data drives (or doesn't drive) criticality</div></div></div>
   <div id="critbody" class="muted">Running criticality model…</div>`;
  try{ _crit=await api2('/criticality/model'); critRender(); }catch(e){ document.getElementById('critbody').innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function critFactorBars(factors){
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${factors.map(f=>`
    <div style="min-width:140px;flex:1"><div style="font-size:10px;color:#6b7280">${esc(f.label)} <b>${f.points}/${f.max}</b></div>
      <div style="height:6px;background:#e8e2d4;border-radius:3px;margin-top:3px"><div style="width:${Math.round(f.points/f.max*100)}%;height:100%;background:${f.fired?'#1A4D3C':'#cbd5e1'};border-radius:3px"></div></div>
      <div style="font-size:9.5px;color:#9ca3af;margin-top:2px">${esc(f.detail)}</div></div>`).join('')}</div>`;
}
function critEngTable(engs){
  if(!engs.length) return '<div class="muted" style="font-size:11px">No engagements.</div>';
  return `<table style="margin-top:8px"><tr><th>Engagement</th><th>Inherent (IRQ)</th><th>Residual</th><th>BU</th><th>Annual value</th></tr>
    ${engs.map(e=>`<tr><td>${esc(e.engagement_id)} · ${esc(e.title||'')}</td>
      <td><span class="tag">${esc(e.inherent_band||'—')}</span>${e.inherent_score!=null?' '+e.inherent_score:''}</td>
      <td>${esc(e.residual_band||'—')}</td><td>${esc(e.business_unit||'—')}</td><td>${fmtMoney(e.annual_value,e.currency)||fmtMoney(0)}</td></tr>`).join('')}</table>`;
}
function critRender(){
  const el=document.getElementById('critbody'); if(!el||!_crit)return; const st=_crit.stats;
  const maxScore=_crit.factors_legend.reduce((a,f)=>a+f.max,0);
  let html=`<div class="grid g4" style="gap:10px;margin-bottom:12px">
    <div class="card stat"><div class="v">${st.critical}</div><div class="l">Critical vendors</div></div>
    <div class="card stat"><div class="v">${st.model_flag_agree}/${st.critical}</div><div class="l">Model agrees with flag</div></div>
    <div class="card stat"><div class="v">${st.subthreshold}</div><div class="l">High-risk, sub-threshold</div></div>
    <div class="card stat"><div class="v">${st.near_miss}</div><div class="l">Near-miss (within ${_crit.near_margin})</div></div></div>`;
  html+=`<div class="card" style="margin-bottom:12px"><div class="card-label">Criticality model — threshold ≥ ${_crit.threshold} of ${maxScore}</div>
    <div class="muted" style="font-size:11.5px;margin-top:6px;line-height:1.6">${_crit.factors_legend.map(f=>`<b>${esc(f.label)}</b> (max ${f.max}) — ${esc(f.detail)}`).join('<br>')}</div></div>`;
  html+=`<div class="seg" style="margin-bottom:12px">
    <button class="${_critTab==='critical'?'on':''}" onclick="critTab('critical')">Critical engagements — why</button>
    <button class="${_critTab==='sub'?'on':''}" onclick="critTab('sub')">High-risk, sub-threshold — why not</button></div>`;
  if(_critTab==='critical'){
    html+=`<div class="muted" style="font-size:11px;margin-bottom:8px">Vendors flagged critical — the factor breakdown and engagement IRQ/impact data show what makes each one critical.</div>`;
    html+=_crit.critical_vendors.map((r,i)=>critCard(r,'critical',i)).join('');
  } else {
    html+=`<div class="muted" style="font-size:11px;margin-bottom:8px">High-risk vendors NOT flagged critical — the breakdown shows why they fall short of the threshold.${_crit.subthreshold_high_risk.length>40?` Showing top 40 of ${_crit.subthreshold_high_risk.length}.`:''}</div>`;
    html+=_crit.subthreshold_high_risk.slice(0,40).map((r,i)=>critCard(r,'sub',i)).join('');
  }
  el.innerHTML=html;
}
function critCard(r,kind,i){
  const disagree = (kind==='critical' && !r.model_critical) || (kind==='sub' && r.model_critical);
  return `<div class="card" style="margin-bottom:10px">
    <div class="rev-row" style="align-items:center"><span class="rk" style="flex:1"><b>${esc(r.legal_name)}</b> <span class="muted" style="font-size:10px">${esc(r.vendor_id)} · ${esc(r.tier||'')}</span>
      ${disagree?`<span class="tag" style="background:#F59E0B;color:#fff">model: ${r.model_critical?'critical':'sub-threshold'}</span>`:''}
      ${kind==='sub'&&r.near_miss?'<span class="tag" style="background:#EA580C;color:#fff">near-miss</span>':''}</span>
      <span class="rv" style="text-align:right"><div style="font-family:Fraunces,serif;font-size:20px;color:var(--gold)">${r.score}<span style="font-size:12px;color:#9ca3af">/${r.max}</span></div>
      ${kind==='sub'?`<div class="muted" style="font-size:10px">gap ${r.gap_to_threshold} to threshold</div>`:''}</span></div>
    ${critFactorBars(r.factors)}
    ${kind==='sub'&&(r.why_not||[]).length?`<div class="muted" style="font-size:11px;margin-top:8px">Falls short on: ${r.why_not.map(esc).join(', ')}.</div>`:''}
    <button class="btn sm ghost" style="margin-top:8px" onclick="critToggleEng(this,'${kind}',${i})">Show engagements (${r.engagements.length})</button>
    <div class="critEng" style="display:none"></div></div>`;
}
function critToggleEng(btn,kind,i){
  const box=btn.nextElementSibling;
  const list=(kind==='critical'?_crit.critical_vendors:_crit.subthreshold_high_risk.slice(0,40));
  const r=list[i];
  if(box.style.display==='none'){ box.innerHTML=critEngTable(r.engagements); box.style.display='block'; btn.textContent='Hide engagements'; }
  else { box.style.display='none'; btn.textContent='Show engagements ('+r.engagements.length+')'; }
}
function critTab(t){ _critTab=t; critRender(); }
/* ================= Supplier Incidents ================= */
const INC_TYPES=["Service outage","Data breach","Security incident","SLA breach","Compliance breach","Operational","Financial","Reputational","Other"];
const INC_REGIONS=["Global","United Kingdom","United States","Ireland","Germany","India","Singapore","China","Hong Kong","Taiwan","Netherlands","France","Japan","Brazil","Australia"];
const SEV_TONE={Low:"#9CA3AF",Medium:"#F59E0B",High:"#EA580C",Critical:"#DC2626"};
const LIGHT_TONE={green:"#0E9F6E",amber:"#F59E0B",red:"#DC2626"};
let _incFilter={status:"",severity:""};
function lightDot(l){ return l?`<span title="notification ${l}" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${LIGHT_TONE[l]||'#ccc'}"></span>`:'—'; }
V.incidents=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Supplier Incidents</h1><div class="sub">Incident register · auto-tagged engagements · notification SLA traffic light</div></div>
    <button class="btn" onclick="incReport()">＋ Report incident</button></div>
    <div class="seg" style="margin-bottom:10px">
      <button class="${_incFilter.status===''?'on':''}" onclick="incSetF('status','')">All status</button>
      <button class="${_incFilter.status==='Drafted'?'on':''}" onclick="incSetF('status','Drafted')">Drafted</button>
      <button class="${_incFilter.status==='Under investigation'?'on':''}" onclick="incSetF('status','Under investigation')">Under investigation</button>
      <button class="${_incFilter.status==='Closed'?'on':''}" onclick="incSetF('status','Closed')">Closed</button>
    </div>
    <div id="incbody" class="muted">Loading incidents…</div>`;
  incLoad();
};
function incSetF(k,v){ _incFilter[k]=v; V.incidents(); }
async function incLoad(){
  const el=document.getElementById('incbody'); if(!el)return;
  try{ const q=new URLSearchParams(); if(_incFilter.status)q.set('status',_incFilter.status); if(_incFilter.severity)q.set('severity',_incFilter.severity);
    const rows=await api2('/incidents'+(q.toString()?'?'+q:''));
    if(!rows.length){ el.innerHTML='<div class="card muted">No incidents.</div>'; return; }
    el.innerHTML=`<table><tr><th>Incident</th><th>Date</th><th>Vendor</th><th>Type</th><th>Severity</th><th>Cust.</th><th>Status</th><th>Notif.</th></tr>
      ${rows.map(r=>`<tr class="click" onclick="incOpen('${r.incident_id}')">
        <td><b>${esc(r.incident_id)}</b></td><td style="font-size:11px">${esc((r.date_of_incident||'').slice(0,10))}</td>
        <td>${esc(r.vendor_name||r.vendor_id||'—')}</td><td style="font-size:11px">${esc(r.incident_type||'—')}</td>
        <td><span class="tag" style="background:${SEV_TONE[r.severity]||'#999'};color:#fff">${esc(r.severity)}</span></td>
        <td>${r.customer_impacting?'Yes':'No'}</td><td style="font-size:11px">${esc(r.status)}</td>
        <td style="text-align:center">${lightDot(r.notification_compliant)}</td></tr>`).join('')}</table>`;
  }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function incReport(){
  let vendors=[]; try{ vendors=await api2('/vendors'); }catch(e){}
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 12px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">REPORT SUPPLIER INCIDENT</div>
      <button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">
      <h3 style="margin:0 0 12px">Report supplier incident</h3>
      <div class="row"><div class="field" style="flex:1"><label>Vendor</label><select id="ir_v" onchange="incLoadEngs()"><option value="">—</option>${vendors.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name||v.vendor_id)}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label>Engagement</label><select id="ir_eng"><option value="">— select a vendor first —</option></select></div></div>
      <div class="row"><div class="field" style="flex:1"><label>Date of incident</label><input type="datetime-local" id="ir_date"></div>
        <div class="field" style="flex:1"><label>Vendor notified at</label><input type="datetime-local" id="ir_notif"></div></div>
      <div class="row"><div class="field" style="flex:1"><label>Incident type</label><select id="ir_type">${INC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label>Severity</label><select id="ir_sev"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></div></div>
      <div class="row"><label style="font-size:12px"><input type="checkbox" id="ir_cust"> Customer-impacting</label>
        <label style="font-size:12px"><input type="checkbox" id="ir_org"> Impacts client organisation</label></div>
      <div class="field"><label>Impact description</label><textarea id="ir_desc" rows="3"></textarea></div>
      <div class="field"><label>Region (multi-select)</label><select id="ir_region" multiple size="5" style="height:auto">${INC_REGIONS.map(r=>`<option>${r}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:6px"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="incCreate()">Create incident</button></div>
    </div>`);
}
async function incLoadEngs(){
  const vid=val('ir_v'); const sel=document.getElementById('ir_eng'); if(!sel) return;
  if(!vid){ sel.innerHTML='<option value="">— select a vendor first —</option>'; return; }
  try{ const engs=await api2('/engagements?vendor_id='+encodeURIComponent(vid));
    sel.innerHTML='<option value="">— (all active) —</option>'+engs.map(e=>`<option value="${e.engagement_id}">${esc(e.engagement_id)} · ${esc(e.title||'')}</option>`).join('');
  }catch(e){ sel.innerHTML='<option value="">— none —</option>'; }
}
async function incEngEditFill(iid,vid,cur){
  const sel=document.getElementById('id_eng'); if(!sel||sel.dataset.filled||!vid) return; sel.dataset.filled='1';
  try{ const engs=await api2('/engagements?vendor_id='+encodeURIComponent(vid));
    sel.innerHTML='<option value="">— (all active) —</option>'+engs.map(e=>`<option value="${e.engagement_id}" ${e.engagement_id===cur?'selected':''}>${esc(e.engagement_id)} · ${esc(e.title||'')}</option>`).join('');
  }catch(e){}
}
async function incCreate(){
  const region=[...document.getElementById('ir_region').selectedOptions].map(o=>o.value);
  const body={ vendor_id:val('ir_v')||null, engagement_id:val('ir_eng')||null, date_of_incident:val('ir_date')||null, vendor_notified_at:val('ir_notif')||null,
    incident_type:val('ir_type'), severity:val('ir_sev'),
    customer_impacting:document.getElementById('ir_cust').checked, impacts_client_org:document.getElementById('ir_org').checked,
    impact_description:val('ir_desc'), region };
  if(!body.date_of_incident){ flash('Set the date of incident'); return; }
  try{ const r=await api2('/incidents',{method:'POST',body:JSON.stringify(body)}); closeModal(); flash('Incident '+r.incident_id+' created'); incOpen(r.incident_id); }catch(e){ flash(e.message); }
}
async function incNotable(iid){
  if(!confirm("Flag this incident as a NOTABLE EVENT?\n\nThis immediately creates a management notification (even if that notification type is switched off).")) return;
  try{ await api2("/incidents/"+iid+"/notable",{method:"POST",body:"{}"});
    flash("⚑ Notable event flagged — management notified"); }
  catch(e){ flash(e.message); }
}
async function incOpen(iid){
  let r; try{ r=await api2('/incidents/'+iid); }catch(e){ flash(e.message); return; }
  const eng=(r.active_engagements||[]);
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 10px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">SUPPLIER INCIDENT · ${esc(r.incident_id)}</div><button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">
      <div class="rev-row" style="align-items:center"><span class="rk" style="flex:1"><h3 style="margin:0">${esc(r.incident_type||'Incident')} · ${esc(r.vendor_name||r.vendor_id||'')}</h3>
        <div class="muted" style="font-size:11px">${esc(r.vendor_id||'')} · incident ${esc((r.date_of_incident||'').replace('T',' ').slice(0,16))} · reported by ${esc(r.reported_by||'—')}</div></span>
        <span class="rv"><button class="btn sm" style="background:#8A2E3B" onclick="incNotable('${iid}')" title="Escalates to management notifications immediately — bypasses notification off-switches">⚑ Notable event</button> <button class="btn sm" onclick="incWarRoom('${iid}')">⚔ War Room</button> <span class="tag" style="background:${SEV_TONE[r.severity]||'#999'};color:#fff">${esc(r.severity)}</span></span></div>

      <div class="grid g4" style="gap:10px;margin:12px 0">
        <div class="card"><div class="card-label">Status</div><select id="id_status" onchange="incPut('${iid}',{status:this.value})"><option ${r.status==='Drafted'?'selected':''}>Drafted</option><option ${r.status==='Under investigation'?'selected':''}>Under investigation</option><option ${r.status==='Closed'?'selected':''}>Closed</option></select></div>
        <div class="card"><div class="card-label">Severity</div><select id="id_sev" onchange="incPut('${iid}',{severity:this.value})">${['Low','Medium','High','Critical'].map(x=>`<option ${r.severity===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="card"><div class="card-label">Incident type</div><select id="id_type" onchange="incPut('${iid}',{incident_type:this.value})">${INC_TYPES.map(x=>`<option ${r.incident_type===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="card"><div class="card-label">Engagement</div><select id="id_eng" onfocus="incEngEditFill('${iid}','${r.vendor_id||''}','${r.engagement_id||''}')" onchange="incPut('${iid}',{engagement_id:this.value||null})"><option value="${esc(r.engagement_id||'')}" selected>${r.engagement_id?esc(r.engagement_id):'— (all active) —'}</option></select></div>
      </div>
      <div class="grid g4" style="gap:10px;margin:0 0 12px">
        <div class="card"><div class="card-label">Date of incident</div><input id="id_doi" type="datetime-local" value="${(r.date_of_incident||'').slice(0,16)}" onchange="incPut('${iid}',{date_of_incident:this.value})"></div>
        <div class="card"><div class="card-label">Vendor notified at</div><input id="id_vna" type="datetime-local" value="${(r.vendor_notified_at||'').slice(0,16)}" onchange="incPut('${iid}',{vendor_notified_at:this.value})"></div>
        <div class="card"><div class="card-label">SLA hours</div><input id="id_sla" type="number" value="${r.notification_sla_hours||''}" onchange="incPut('${iid}',{notification_sla_hours:+this.value})"></div>
        <div class="card"><div class="card-label">Impact flags</div>
          <label style="font-size:11px;display:block"><input type="checkbox" ${r.customer_impacting?'checked':''} onchange="incPut('${iid}',{customer_impacting:this.checked})"> Customer-impacting</label>
          <label style="font-size:11px;display:block"><input type="checkbox" ${r.impacts_client_org?'checked':''} onchange="incPut('${iid}',{impacts_client_org:this.checked})"> Impacts client org</label></div>
      </div>
      <div class="card" style="margin-bottom:10px"><div class="card-label">Region</div>
        <select id="id_region" multiple size="4" style="height:auto;margin-top:6px" onchange="incPut('${iid}',{region:[...this.selectedOptions].map(o=>o.value)})">${INC_REGIONS.map(x=>`<option ${(r.region||[]).includes(x)?'selected':''}>${x}</option>`).join('')}</select></div>

      <div class="card" style="margin-bottom:10px"><div class="card-label">Impact description</div>
        <textarea id="id_desc" rows="3" style="margin-top:6px;width:100%">${esc(r.impact_description||'')}</textarea>
        <div class="row" style="margin-top:6px"><button class="btn sm ghost" onclick="incPut('${iid}',{impact_description:document.getElementById('id_desc').value})">Save description</button></div>
        <div class="card-label" style="margin-top:10px">Auto-tagged active engagements (${eng.length})</div><div style="font-size:11px;margin-top:4px">${eng.map(esc).join(', ')||'—'}</div></div>

      <div class="card" style="margin-bottom:10px"><div class="card-label">Vendor notification — SLA traffic light</div>
        <div class="row" style="align-items:center;gap:12px;margin-top:6px">
          <div style="font-size:22px">${lightDot(r.notification_compliant)}</div>
          <div style="font-size:12px"><b>${(r.notification_compliant||'—').toUpperCase()}</b> · required within <b>${r.notification_sla_hours||'—'}h</b> · notified ${esc((r.vendor_notified_at||'not yet').replace('T',' ').slice(0,16))}</div>
          <button class="btn sm ghost" style="margin-left:auto" onclick="incContract('${iid}')">AI: summarise notification obligation</button></div>
        <div id="id_contract" class="muted" style="font-size:12px;margin-top:10px">${r.contract_notification_summary?esc(r.contract_notification_summary):''}</div></div>

      <div class="card" style="margin-bottom:10px"><div class="card-label">Root cause assessment</div>
        <textarea id="id_rca" rows="3" style="margin-top:6px">${esc(r.root_cause_assessment||'')}</textarea>
        <div class="row" style="margin-top:6px"><label style="font-size:12px"><input type="checkbox" id="id_rneed" ${r.risk_entry_needed?'checked':''} onchange="incPut('${iid}',{risk_entry_needed:this.checked})"> Risk entry needed</label>
          <button class="btn sm ghost" onclick="incPut('${iid}',{root_cause_assessment:document.getElementById('id_rca').value})">Save RCA</button>
          <button class="btn sm" onclick="incDraftRisk('${iid}')">Draft risk entry from summary &amp; RCA</button>
          <span id="id_risk" class="muted" style="font-size:11px;align-self:center">${r.risk_entry_ref?('→ '+esc(r.risk_entry_ref)):''}</span></div></div>

      <div class="card" style="margin-bottom:10px"><div class="card-label">Notes log</div>
        <div id="id_notes" style="font-size:12px;margin-top:6px">${(r.notes_log||[]).map(n=>`<div class="rev-row"><span class="rk">${esc(n.note)}</span><span class="rv muted" style="font-size:10px">${esc(n.user)} · ${esc((n.ts||'').replace('T',' ').slice(0,16))}</span></div>`).join('')||'<span class="muted">No notes.</span>'}</div>
        <div class="row" style="margin-top:6px"><input id="id_note" placeholder="add a note" style="flex:1"><button class="btn sm" onclick="incNote('${iid}')">Add</button></div></div>

      <div class="card"><div class="card-label">Attachments</div>
        <div id="id_att" style="font-size:12px;margin-top:6px">${(r.attachments||[]).map(esc).join(', ')||'<span class="muted">None.</span>'}</div>
        <div class="row" style="margin-top:6px"><input id="id_attn" placeholder="document name (e.g. vendor_RCA.pdf)" style="flex:1"><button class="btn sm" onclick="incAttach('${iid}')">Attach</button></div></div>
    </div>`);
}
async function incPut(iid,patch){ try{ await api2('/incidents/'+iid,{method:'PUT',body:JSON.stringify(patch)}); flash('Saved'); if('status'in patch||'risk_entry_needed'in patch){} }catch(e){ flash(e.message); } }
async function incNote(iid){ const n=val('id_note'); if(!n)return; try{ await api2('/incidents/'+iid+'/note',{method:'POST',body:JSON.stringify({note:n})}); incOpen(iid); }catch(e){ flash(e.message); } }
async function incAttach(iid){ const n=val('id_attn'); if(!n)return; try{ await api2('/incidents/'+iid+'/attach',{method:'POST',body:JSON.stringify({name:n})}); incOpen(iid); }catch(e){ flash(e.message); } }
async function incDraftRisk(iid){ flash('Drafting risk entry…'); try{ const r=await api2('/incidents/'+iid+'/draft-risk',{method:'POST',body:'{}'}); const el=document.getElementById('id_risk'); if(el)el.textContent='→ '+r.finding_id+' created'; flash('Risk entry '+r.finding_id+' drafted'); }catch(e){ flash(e.message); } }
async function incWarRoom(iid){
  let w; try{ w=await api2('/incidents/'+iid+'/warroom'); }catch(e){ flash(e.message); return; }
  const s=w.stats, inc=w.incident;
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 10px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">⚔ INCIDENT WAR ROOM · ${esc(inc.incident_id)}</div><button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">
      <div class="rev-row" style="align-items:center"><span class="rk" style="flex:1"><h3 style="margin:0">${esc(inc.incident_type||'Incident')} · ${esc(inc.vendor_name||inc.vendor_id||'')}</h3>
        <div class="muted" style="font-size:11px">${esc((inc.date_of_incident||'').replace('T',' ').slice(0,16))} · ${esc(inc.status)}</div></span>
        <span class="rv" style="display:flex;gap:10px;align-items:center"><span class="tag" style="background:${SEV_TONE[inc.severity]||'#999'};color:#fff">${esc(inc.severity)}</span>
          <span style="display:flex;align-items:center;gap:5px">${lightDot(w.sla_light)}<span style="font-size:11px">notification ${(w.sla_light||'—').toUpperCase()}</span></span></span></div>
      <div class="card" style="margin:10px 0;border-left:3px solid var(--gold)"><div class="card-label">Situation note ${w.brief_ai?'<span class="tag">AI</span>':''}</div><div style="font-size:12.5px;margin-top:6px;line-height:1.5">${esc(w.brief)}</div></div>
      <div class="grid g4" style="gap:10px;margin-bottom:12px">
        <div class="card stat"><div class="v">${s.engagements_affected}</div><div class="l">Engagements affected</div></div>
        <div class="card stat"><div class="v">${s.bus_affected}</div><div class="l">Business units</div></div>
        <div class="card stat"><div class="v">${s.open_findings_matched}</div><div class="l">Open findings implicated</div></div>
        <div class="card stat"><div class="v">${(w.upstream_vendors||[]).length}</div><div class="l">Upstream vendors</div></div></div>
      ${s.spof_deps?`<div class="card" style="margin-bottom:10px;border-left:3px solid #DC2626"><div class="card-label">⚠ Concentration</div><div style="font-size:12px;margin-top:4px">Relies on ${s.spof_deps} single-point-of-failure sub-provider(s): ${w.fourth_party_deps.filter(f=>f.spof).map(f=>esc(f.legal_name)+' ('+f.shared_with+' vendors)').join(', ')}</div></div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="card"><div class="card-label">Open findings this incident implicates</div>${w.matched_findings.length?`<table style="margin-top:6px"><tr><th>Finding</th><th>Sev</th></tr>${w.matched_findings.map(f=>`<tr class="click" onclick="closeModal();openFinding('${esc(f.finding_id)}')"><td><a href="#" onclick="closeModal();openFinding('${esc(f.finding_id)}');return false">${esc(f.finding_id)}</a> · ${esc(f.title||'')}</td><td><span class="tag">${esc(f.severity)}</span></td></tr>`).join('')}</table>`:'<div class="muted" style="font-size:11px;margin-top:6px">None matched.</div>'}</div>
        <div class="card"><div class="card-label">Affected engagements &amp; BUs</div><table style="margin-top:6px"><tr><th>Engagement</th><th>BU</th><th>Inherent</th></tr>${w.affected_engagements.map(e=>`<tr class="click" onclick="closeModal();openEngagementRegister('${esc(e.engagement_id)}')"><td><a href="#" onclick="closeModal();openEngagementRegister('${esc(e.engagement_id)}');return false">${esc(e.engagement_id)}</a></td><td style="font-size:11px">${esc(e.business_unit||'—')}</td><td><span class="tag">${esc(e.inherent_band||'—')}</span></td></tr>`).join('')}</table></div>
      </div>
      <div class="card" style="margin-top:12px;border-left:3px solid var(--gold)"><div class="card-label">Ecosystem impact — upstream vendors that declared ${esc(inc.vendor_name||inc.vendor_id||'this vendor')} as their 4th party (${(w.upstream_vendors||[]).length})</div>
        ${(w.upstream_vendors||[]).length?`<table style="margin-top:6px"><tr><th>Vendor</th><th>Vendor ID</th></tr>${w.upstream_vendors.map(p=>`<tr class="click" onclick="closeModal();openV360('${esc(p.vendor_id)}')"><td>${esc(p.legal_name)}</td><td class="muted" style="font-size:11px">${esc(p.vendor_id)}</td></tr>`).join('')}</table>`:'<div class="muted" style="font-size:11px;margin-top:6px">No upstream vendors depend on this vendor as a fourth party.</div>'}</div>
      <div class="row" style="margin-top:12px"><button class="btn" onclick="incDraftRisk('${iid}')">Draft risk entry from this incident</button><button class="btn ghost" onclick="incOpen('${iid}')">Back to incident</button></div>
    </div>`);
}
async function incContract(iid){ const o=document.getElementById('id_contract'); if(o)o.textContent='Summarising contract notification obligation…';
  try{ const r=await api2('/incidents/'+iid+'/contract-summary',{method:'POST',body:'{}'});
    if(r.holding){ if(o)o.innerHTML='<span class="err">AI engine not connected — connect in Settings → AI. Traffic light ('+(r.traffic_light||'—')+') and SLA ('+(r.sla_hours||'—')+'h) are computed without AI.</span>'; return; }
    if(o)o.innerHTML='<b>Notification obligation:</b> '+esc(r.summary||'—');
  }catch(e){ if(o)o.textContent=e.message; } }
/* ================= Board / Regulator Pack ================= */
let _bp=null;
V.boardpack=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Board / Regulator Pack</h1><div class="sub">One-click, board-ready third-party-risk pack assembled from live data</div></div>
    <button class="btn" onclick="bpPrint()">📄 Generate PDF pack</button></div>
    <div id="bpbody" class="muted">Assembling board pack…</div>`;
  try{ _bp=await api2('/board-pack'); bpRender(); }catch(e){ document.getElementById('bpbody').innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function bpRender(){
  const el=document.getElementById('bpbody'); if(!el||!_bp)return; const b=_bp; const ex=b.exec;
  let h=`<div class="card" style="margin-bottom:12px;border-left:3px solid var(--gold)"><div class="card-label">Executive summary ${b.summary_ai?'<span class="tag">AI</span>':''}</div><div style="font-size:12.5px;margin-top:6px;line-height:1.55">${esc(b.summary)}</div></div>`;
  h+=`<div class="grid g4" style="gap:10px;margin-bottom:12px">
    <div class="card stat"><div class="v">${ex.vendors}</div><div class="l">Vendors (${ex.critical_vendors} critical)</div></div>
    <div class="card stat"><div class="v">£${(ex.annual_value/1e6).toFixed(0)}m</div><div class="l">Annual value</div></div>
    <div class="card stat"><div class="v">${ex.high_critical_findings}</div><div class="l">High/critical open findings</div></div>
    <div class="card stat"><div class="v">${b.data_health.overall}</div><div class="l">Data-health score</div></div></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="card"><div class="card-label">Concentration</div><div style="font-size:12px;margin-top:6px">${b.concentration.spof} single points of failure · largest serves ${b.concentration.max_fanout_pct}% of estate</div>
      ${b.concentration.top.map(t=>`<div class="rev-row"><span class="rk">${esc(t.legal_name)}${t.spof?' <span class="tag" style="background:#DC2626;color:#fff">SPOF</span>':''}</span><span class="rv">${t.vendor_count} (${t.reach_pct}%)</span></div>`).join('')}</div>
    <div class="card"><div class="card-label">Criticality model</div><div style="font-size:12px;margin-top:6px">${b.criticality.critical} flagged critical · <b>${b.criticality.disagreements}</b> flag-vs-model disagreements</div>
      ${b.criticality.top_disagreements.map(d=>`<div class="rev-row"><span class="rk">${esc(d.legal_name)}</span><span class="rv">model ${d.score}/${d.max}</span></div>`).join('')}</div></div>`;
  h+=`<div class="card" style="margin-top:12px"><div class="card-label">Business-unit exposure</div><table style="margin-top:6px"><tr><th>BU</th><th>Vendors</th><th>Critical</th><th>Spend</th><th>Open findings</th><th>Score</th></tr>
    ${b.bu_exposure.map(p=>`<tr><td>${esc(p.business_unit)}</td><td>${p.vendor_count}</td><td>${p.critical_count}</td><td>£${p.spend.toLocaleString()}</td><td>${p.open_findings}</td><td>${p.exposure_score}</td></tr>`).join('')}</table></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
    <div class="card"><div class="card-label">Geopolitical / export-control</div><div style="font-size:12px;margin-top:6px">${b.geopolitical.exposed} exposed · ${b.geopolitical.component_shortage} component-shortage · ${b.geopolitical.high_risk_jurisdictions} high-risk jurisdictions</div></div>
    <div class="card"><div class="card-label">Incidents</div><div style="font-size:12px;margin-top:6px">${b.incidents.total} total · ${b.incidents.open} open · <b style="color:#DC2626">${b.incidents.notification_breaches}</b> notification-SLA breaches</div></div></div>`;
  el.innerHTML=h;
}
function bpKpi(v,l){ return `<div style="flex:1;border:1px solid #E4DECF;border-radius:10px;padding:12px 14px"><div style="font-family:Fraunces,serif;font-size:26px;color:#14302A">${v}</div><div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#6E6A5E">${l}</div></div>`; }
function bpPrint(){
  if(!_bp){ flash('Pack still loading'); return; } const b=_bp,ex=b.exec;
  const row=(c)=>c.map(x=>`<tr>${x.map(y=>`<td>${y}</td>`).join('')}</tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Brata — Board Pack</title>
  <style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:'Spline Sans',system-ui,Arial,sans-serif;color:#23241F;margin:0}
  h1,h2{font-family:Fraunces,Georgia,serif;color:#14302A;margin:0}.eyebrow{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#B8862B;font-weight:600}
  .cover{background:#14302A;color:#fff;padding:34px 30px;border-radius:14px;margin-bottom:18px}.cover h1{color:#fff;font-size:34px;margin-top:8px}.cover .sub{color:#CFE2D5;margin-top:10px;font-size:13px}
  .sec{margin:16px 0;page-break-inside:avoid}.sec h2{font-size:17px;border-bottom:2px solid #14302A;padding-bottom:6px;margin-bottom:8px}
  .kpis{display:flex;gap:10px;margin:10px 0}.kpi{flex:1;border:1px solid #E4DECF;border-radius:10px;padding:12px}.kpi .v{font-family:Fraunces,serif;font-size:24px;color:#14302A}.kpi .l{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#6E6A5E}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}th,td{border:1px solid #E4DECF;padding:5px 8px;text-align:left}th{background:#F1ECDD;font-family:Fraunces,serif}
  .summary{background:#F1ECDD;border-left:3px solid #B8862B;padding:12px 14px;border-radius:0 8px 8px 0;font-size:12.5px;line-height:1.55}
  .red{color:#DC2626;font-weight:600}.tag{background:#DC2626;color:#fff;font-size:9px;padding:1px 6px;border-radius:9px}
  .foot{margin-top:20px;border-top:1px solid #E4DECF;padding-top:8px;font-size:9px;color:#6E6A5E;text-transform:uppercase;letter-spacing:.1em}
  @media print{.noprint{display:none}}</style></head><body>
  <div class="noprint" style="padding:10px;text-align:right"><button onclick="window.print()" style="padding:8px 16px;background:#14302A;color:#fff;border:0;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
  <div class="cover"><div class="eyebrow" style="color:#D8A94A">Board / Regulator Pack · Third-Party Risk</div><h1>Brata — Risk Posture</h1>
    <div class="sub">Generated ${esc((b.generated_at||'').replace('T',' ').slice(0,16))} · Internal · Demonstrator</div></div>
  <div class="sec"><h2>Executive summary ${b.summary_ai?'<span class="tag" style="background:#14302A">AI</span>':''}</h2><div class="summary">${esc(b.summary)}</div>
    <div class="kpis"><div class="kpi"><div class="v">${ex.vendors}</div><div class="l">Vendors (${ex.critical_vendors} critical)</div></div>
    <div class="kpi"><div class="v">£${(ex.annual_value/1e6).toFixed(0)}m</div><div class="l">Annual value</div></div>
    <div class="kpi"><div class="v">${ex.high_critical_findings}</div><div class="l">High/critical findings</div></div>
    <div class="kpi"><div class="v">${b.data_health.overall}/100</div><div class="l">Data-health</div></div></div></div>
  <div class="sec"><h2>Concentration &amp; single points of failure</h2><p style="font-size:12px">${b.concentration.spof} SPOFs · largest sub-provider serves ${b.concentration.max_fanout_pct}% of the estate.</p>
    <table><tr><th>Sub-provider</th><th>Vendors served</th><th>Reach</th><th>SPOF</th></tr>
    ${row(b.concentration.top.map(t=>[t.legal_name,t.vendor_count,t.reach_pct+'%',t.spof?'<span class="tag">SPOF</span>':'—']))}</table></div>
  <div class="sec"><h2>Business-unit exposure</h2><table><tr><th>Business unit</th><th>Vendors</th><th>Critical</th><th>Spend</th><th>Open findings</th><th>Exposure</th></tr>
    ${row(b.bu_exposure.map(p=>[p.business_unit,p.vendor_count,p.critical_count,'£'+p.spend.toLocaleString(),p.open_findings,p.exposure_score]))}</table></div>
  <div class="sec"><h2>Criticality model — transparency</h2><p style="font-size:12px">${b.criticality.critical} vendors flagged critical; <b>${b.criticality.disagreements}</b> flag-vs-model disagreements requiring review.</p>
    <table><tr><th>Vendor</th><th>Model score</th><th>Flagged critical?</th></tr>
    ${row(b.criticality.top_disagreements.map(d=>[d.legal_name,d.score+'/'+d.max,'No — model says critical']))}</table></div>
  <div class="sec"><h2>Geopolitical / export-control exposure</h2><p style="font-size:12px">${b.geopolitical.exposed} vendors exposed · ${b.geopolitical.component_shortage} with component-shortage risk · ${b.geopolitical.high_risk_jurisdictions} high-risk jurisdictions.</p>
    <table><tr><th>Vendor</th><th>Jurisdiction</th><th>Level</th><th>Component risk</th></tr>
    ${row(b.geopolitical.top.map(g=>[g.legal_name,g.country,g.level,g.component_shortage_risk?'<span class="tag">likely</span>':'—']))}</table></div>
  <div class="sec"><h2>Supplier incidents</h2><p style="font-size:12px">${b.incidents.total} incidents · ${b.incidents.open} open · <span class="red">${b.incidents.notification_breaches} notification-SLA breaches</span>.</p>
    <table><tr><th>Incident</th><th>Vendor</th><th>Type</th><th>Severity</th><th>Status</th><th>Notif.</th></tr>
    ${row((b.incidents.recent||[]).map(i=>[i.incident_id,i.vendor_name||'',i.incident_type||'',i.severity,i.status,(i.notification_compliant||'—').toUpperCase()]))}</table></div>
  <div class="foot">Brata — Board / Regulator Pack · figures describe platform capability over demonstrator data · backend of record in English</div>
  </body></html>`;
  const w=window.open('','_blank'); if(!w){ flash('Allow pop-ups to open the pack'); return; }
  w.document.write(html); w.document.close();
}
/* ================= Ask Anything — portfolio copilot ================= */
const COP_SUGGEST=["Critical vendors in China","Open high findings","Incidents with a notification breach","Single points of failure","Geopolitically exposed vendors","Expiring engagements in Technology"];
V.copilot=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Ask Anything</h1><div class="sub">Natural-language questions over the live estate — grounded answers with drill-through to the records</div></div></div>
    <div class="card" style="margin-bottom:12px"><div class="row" style="gap:8px"><input id="cop_q" placeholder="e.g. open high findings on critical vendors" style="flex:1;font-size:14px" onkeydown="if(event.key==='Enter')copAsk()"><button class="btn" onclick="copAsk()">Ask</button></div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${COP_SUGGEST.map(q=>`<button class="btn sm ghost" onclick="copChip('${q.replace(/'/g,"")}')">${esc(q)}</button>`).join('')}</div></div>
    <div id="cop_out" class="muted" style="font-size:12px">Ask a question to begin — answers are grounded in live data and link straight to the records.</div>`;
};
function copChip(q){ const i=document.getElementById('cop_q'); if(i){i.value=q;} copAsk(); }
async function copAsk(){
  const q=val('cop_q'); if(!q){flash('Type a question');return;}
  const o=document.getElementById('cop_out'); o.innerHTML='<span class="muted">Searching the estate…</span>';
  try{ const r=await api2('/copilot/ask',{method:'POST',body:JSON.stringify({text:q})});
    let h=`<div class="card" style="margin-bottom:10px;border-left:3px solid var(--gold)"><div style="font-size:13px"><b>${esc(r.answer)}</b></div>
      ${r.narrative?`<div class="muted" style="font-size:12px;margin-top:6px">${esc(r.narrative)} ${r.ai?'<span class="tag">AI</span>':''}</div>`:''}</div>`;
    if(!r.rows.length){ h+='<div class="card muted">No matching records. Try different terms (e.g. critical, open, high, SPOF, a country or business unit).</div>'; }
    else{ h+=`<div class="card"><div class="card-label">${r.count} record(s) — click to open</div>
      ${r.rows.map(row=>`<div class="rev-row click" onclick="copGo('${row.type}','${row.id}','${row.vendor_id||''}')" style="cursor:pointer">
        <span class="rk"><b>${esc(row.label)}</b> <span class="muted" style="font-size:10px">${esc(row.id)}</span><div class="muted" style="font-size:11px">${esc(row.sublabel||'')}</div></span>
        <span class="rv" style="font-size:11px;color:var(--gold)">open →</span></div>`).join('')}</div>`; }
    o.innerHTML=h;
  }catch(e){ o.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function copGo(type,id,vendorId){
  try{
    if(type==='incident'){ incOpen(id); }
    else if(type==='finding'){ openFinding(id); }
    else if(type==='vendor'){ openVendor(id); }
    else if(type==='engagement'){ if(vendorId) openVendor(vendorId); else goTo('engagements'); }
  }catch(e){ flash('Opening '+id); }
}
/* ================= Evidence on Demand (regulator mode) ================= */
V.evidence=async()=>{
  const view=document.getElementById('view');
  let vendors=[]; try{ vendors=await api2('/vendors'); }catch(e){}
  view.innerHTML=`<div class="top"><div><h1>Evidence on Demand</h1><div class="sub">Regulator mode — point at a vendor and assemble the full, defensible evidence trail</div></div></div>
    <div class="card" style="margin-bottom:12px"><div class="row" style="gap:8px;align-items:center"><label style="font-size:12px">Vendor</label>
      <select id="ev_v" onchange="evLoad(this.value)" style="flex:1"><option value="">— select a vendor —</option>${vendors.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name||v.vendor_id)}${v.is_critical?' (critical)':''}</option>`).join('')}</select></div></div>
    <div id="evbody" class="muted">Select a vendor to assemble its evidence pack.</div>`;
};
async function evLoad(vid){ if(!vid)return; const el=document.getElementById('evbody'); el.innerHTML='<div class="muted">Assembling evidence trail…</div>';
  try{ const e=await api2('/evidence/'+vid); el.innerHTML=evRender(e); }catch(err){ el.innerHTML=`<div class="err">${esc(err.message)}</div>`; }
}
function evRender(e){ const v=e.vendor,sm=e.summary;
  const chain=e.chain_intact?`<span class="tag" style="background:#0E9F6E;color:#fff">✓ audit chain intact</span>`:`<span class="tag" style="background:#DC2626;color:#fff">✗ chain broken</span>`;
  let h=`<div class="card" style="margin-bottom:12px"><div class="rev-row" style="align-items:center"><span class="rk" style="flex:1"><h3 style="margin:0">${esc(v.legal_name)} ${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':''}</h3>
      <div class="muted" style="font-size:11px">${esc(v.vendor_id)} · ${esc(v.tier||'')} · ${esc(v.hq_country||'—')} · LEI ${esc(v.lei||'—')} · ${esc(v.status||'')}</div></span><span class="rv">${chain}</span></div></div>`;
  h+=`<div class="grid g4" style="gap:10px;margin-bottom:12px">
    <div class="card stat"><div class="v">${sm.assessments}</div><div class="l">Assessments (${sm.signed_off} signed off)</div></div>
    <div class="card stat"><div class="v">${sm.findings}</div><div class="l">Findings</div></div>
    <div class="card stat"><div class="v">${sm.documents}</div><div class="l">Evidence documents</div></div>
    <div class="card stat"><div class="v">${sm.audit_entries}</div><div class="l">Audit entries</div></div></div>`;
  h+=`<div class="card" style="margin-bottom:10px"><div class="card-label">Assessments &amp; approvals</div><table style="margin-top:6px"><tr><th>Assessment</th><th>Inherent</th><th>Residual</th><th>Outcome</th><th>Signed off</th><th>Locked</th></tr>
    ${e.assessments.map(a=>`<tr><td>${esc(a.assessment_id)} <span class="muted" style="font-size:10px">${esc(a.status||'')}</span></td><td><span class="tag">${esc(a.inherent_band||'—')}</span></td><td>${esc(a.residual_band||'—')}</td><td style="font-size:11px">${esc(a.outcome||'—')}</td><td>${a.signed_off?'✓':'—'} <span class="muted" style="font-size:10px">${esc(a.assessor||'')}</span></td><td>${a.locked?'🔒':'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">None.</td></tr>'}</table></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="card"><div class="card-label">Engagements (IRQ outcome)</div><table style="margin-top:6px"><tr><th>Engagement</th><th>Inherent</th><th>BU</th></tr>${e.engagements.map(g=>`<tr><td>${esc(g.engagement_id)}</td><td><span class="tag">${esc(g.inherent_band||'—')}</span></td><td style="font-size:11px">${esc(g.business_unit||'—')}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">None.</td></tr>'}</table></div>
    <div class="card"><div class="card-label">Findings &amp; risk acceptances</div><table style="margin-top:6px"><tr><th>Finding</th><th>Sev</th><th>Status</th><th>Accepted</th></tr>${e.findings.map(f=>`<tr><td>${esc(f.finding_id)}</td><td><span class="tag">${esc(f.severity||'')}</span></td><td style="font-size:11px">${esc(f.status||'')}</td><td>${f.risk_accepted?('yes'+(f.acceptance_expiry?(' · exp '+esc(String(f.acceptance_expiry).slice(0,10))):'')):'—'}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">None.</td></tr>'}</table></div></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
    <div class="card"><div class="card-label">Evidence documents (${e.documents.length})</div><div style="font-size:11px;margin-top:6px">${e.documents.map(d=>`<div class="rev-row"><span class="rk">${esc(d.filename)} <span class="muted">${esc(d.purpose||'')}</span></span><span class="rv muted" style="font-size:10px">${esc(d.doc_id)}</span></div>`).join('')||'<span class="muted">None.</span>'}</div></div>
    <div class="card"><div class="card-label">Incidents (${e.incidents.length})</div><div style="font-size:11px;margin-top:6px">${e.incidents.map(i=>`<div class="rev-row"><span class="rk">${esc(i.incident_id)} · ${esc(i.incident_type||'')}</span><span class="rv">${esc(i.severity)} · ${esc(i.status)}</span></div>`).join('')||'<span class="muted">None.</span>'}</div></div></div>`;
  h+=`<div class="card" style="margin-top:10px"><div class="card-label">Audit trail (hash-chained) — ${sm.audit_entries} entries</div><table style="margin-top:6px"><tr><th>#</th><th>Action</th><th>Actor</th><th>When</th><th>Hash</th></tr>
    ${e.audit_trail.map(r=>`<tr><td>${r.seq}</td><td style="font-size:11px">${esc(r.action)}</td><td style="font-size:11px">${esc(r.actor)}</td><td style="font-size:10px">${esc((r.created_at||'').replace('T',' ').slice(0,16))}</td><td style="font-family:monospace;font-size:10px">${esc(r.entry_hash)}…</td></tr>`).join('')||'<tr><td colspan="5" class="muted">None.</td></tr>'}</table></div>`;
  return h;
}
/* ================= Scenario Simulator / digital twin ================= */
let _scenOpts=null; const SCEN_SEV={Severe:"#DC2626",High:"#EA580C",Moderate:"#F59E0B",Low:"#0E9F6E"};
V.scenario=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div class="top"><div><h1>Scenario Simulator</h1><div class="sub">Digital twin — simulate a sub-provider, vendor or region outage and cascade the impact</div></div></div>
    <div class="card" style="margin-bottom:12px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:end">
      <div class="field" style="margin:0"><label>Scenario</label><select id="sc_type" onchange="scenType()"><option value="fourth_party">Sub-provider outage</option><option value="country">Region / country outage</option><option value="vendor">Critical vendor outage</option></select></div>
      <div class="field" style="margin:0;flex:1;min-width:220px"><label>Target</label><select id="sc_target"></select></div>
      <div class="field" style="margin:0"><label>Duration</label><select id="sc_hours"><option value="12">12 hours</option><option value="24">24 hours</option><option value="48" selected>48 hours</option><option value="72">72 hours</option><option value="168">1 week</option></select></div>
      <button class="btn" onclick="scenRun()">Run simulation</button></div></div>
    <div id="scbody" class="muted">Choose a scenario and run the simulation to see the cascade.</div>`;
  try{ _scenOpts=await api2('/scenario/options'); scenType(); }catch(e){ document.getElementById('scbody').innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function scenType(){ if(!_scenOpts)return; const t=val('sc_type'); const sel=document.getElementById('sc_target'); if(!sel)return;
  const list = t==='fourth_party'?_scenOpts.fourth_parties : t==='country'?_scenOpts.countries : _scenOpts.vendors;
  sel.innerHTML=list.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}${o.vendor_count?(' · '+o.vendor_count+' vendors'):''}</option>`).join('');
}
async function scenRun(){
  const body={node_type:val('sc_type'),node_id:val('sc_target'),hours:parseInt(val('sc_hours'))};
  if(!body.node_id){flash('Pick a target');return;}
  const o=document.getElementById('scbody'); o.innerHTML='<div class="muted">Running cascade simulation…</div>';
  try{ const r=await api2('/scenario/simulate',{method:'POST',body:JSON.stringify(body)}); let html=scenRender(r);
    if(body.node_type==='vendor'){ try{ const imp=await api2('/scenario/fourth-party-impact/'+encodeURIComponent(body.node_id)); html+=scenFourthPartyImpact(imp); }catch(_e){} }
    o.innerHTML=html;
  }catch(e){ o.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function scenFourthPartyImpact(d){
  if(!d || !d.vendor) return '';
  const head=`<div class="card-label">4th-party impact — third parties that depend on ${esc(d.vendor.legal_name)}</div>`;
  if(!d.dependent_count){
    return `<div class="card" style="margin-top:14px">${head}
      <div class="muted" style="font-size:12.5px;margin-top:6px">No registered third parties have declared ${esc(d.vendor.legal_name)} as a sub-processor / 4th-party dependency, so there is no indirect downstream impact in the register.</div></div>`;
  }
  return `<div class="card" style="margin-top:14px;border-left:4px solid #B23A2F">${head}
    <p class="muted" style="font-size:12.5px;margin:6px 0 10px;line-height:1.5">These vendors declared <b>${esc(d.vendor.legal_name)}</b> as a sub-processor / dependency in their 4th-party register. If it goes down, they are <b>indirectly</b> impacted — a contagion path that direct vendor mapping misses.</p>
    <div class="grid g3" style="gap:10px;margin-bottom:10px">
      <div class="card stat"><div class="v">${d.dependent_count}</div><div class="l">Dependent third parties</div></div>
      <div class="card stat"><div class="v">${d.engagement_count}</div><div class="l">Engagements at indirect risk</div></div>
      <div class="card stat"><div class="v">${d.dependents.filter(x=>x.is_critical).length}</div><div class="l">…of which critical vendors</div></div>
    </div>
    <table><tr><th>Dependent vendor</th><th>Tier</th><th>Crit</th><th>Engagements (declared dependency)</th></tr>
      ${d.dependents.map(v=>`<tr class="click" onclick="openV360('${v.vendor_id}')">
        <td>${esc(v.legal_name)}</td><td>${esc(v.tier||'—')}</td>
        <td>${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">●</span>':'—'}</td>
        <td>${v.engagements.length}${v.engagements.length?` · <span class="muted" style="font-size:11px">${v.engagements.slice(0,2).map(e=>esc(e.title)).join(', ')}${v.engagements.length>2?'…':''}</span>`:''}</td></tr>`).join('')}
    </table></div>`;
}
function scenRender(r){ const s=r.stats; const tone=SCEN_SEV[r.severity]||'#999';
  let h=`<div class="card" style="margin-bottom:12px;border-left:4px solid ${tone}"><div class="rev-row" style="align-items:center"><span class="rk" style="flex:1"><div class="card-label">Simulated: ${esc(r.scenario.label)} · ${r.scenario.hours}h outage</div>
    <div style="font-size:12.5px;margin-top:6px;line-height:1.5">${esc(r.brief)} ${r.brief_ai?'<span class="tag">AI</span>':''}</div></span>
    <span class="rv"><span class="tag" style="background:${tone};color:#fff;font-size:13px;padding:4px 12px">${esc(r.severity)}</span></span></div></div>`;
  h+=`<div class="grid g4" style="gap:10px;margin-bottom:12px">
    <div class="card stat"><div class="v">${s.vendors_affected}</div><div class="l">Vendors affected (${s.critical_vendors} critical)</div></div>
    <div class="card stat"><div class="v">${s.engagements_affected}</div><div class="l">Engagements · ${s.bus_affected} BUs</div></div>
    <div class="card stat"><div class="v">£${(s.spend_at_risk/1e6).toFixed(0)}m</div><div class="l">Annual value at risk</div></div>
    <div class="card stat"><div class="v">${s.est_sla_breaches}<span style="font-size:13px;color:#9ca3af">/${s.sla_sensitive}</span></div><div class="l">Est. SLA breaches</div></div></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="card"><div class="card-label">Business-unit impact</div><table style="margin-top:6px"><tr><th>BU</th><th>Vendors</th><th>Engagements</th><th>Spend</th></tr>
      ${r.business_units.map(b=>`<tr><td>${esc(b.business_unit)}</td><td>${b.vendors}</td><td>${b.engagements} <span class="muted" style="font-size:10px">(${b.critical_engagements} crit)</span></td><td>£${b.spend.toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">None.</td></tr>'}</table></div>
    <div class="card"><div class="card-label">Affected vendors (top ${Math.min(r.affected_vendors.length,40)})</div><table style="margin-top:6px"><tr><th>Vendor</th><th>Crit</th><th>Engs</th><th>Spend</th></tr>
      ${r.affected_vendors.map(v=>`<tr><td>${esc(v.legal_name)}</td><td>${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">●</span>':'—'}</td><td>${v.engagements}</td><td>£${v.spend.toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">None.</td></tr>'}</table></div></div>`;
  return h;
}
/* ================= Supply-chain Stress Radar (DEMONSTRATOR) ================= */
const STRESS_TONE={Severe:"#DC2626",High:"#EA580C",Elevated:"#F59E0B",Stable:"#0E9F6E"};
V.stressradar=async()=>{
  const view=document.getElementById('view');
  view.innerHTML=`<div style="background:repeating-linear-gradient(45deg,#FEF3C7,#FEF3C7 10px,#FDE9B0 10px,#FDE9B0 20px);border:1px solid #E0A800;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">🧪</span><div style="font-size:12px;color:#7A5B00"><b>DEMONSTRATION ONLY.</b> This radar scores each vendor on <b>today's</b> signals — it is a point-in-time view, <b>not a predictive forecast</b>. Genuine distress prediction requires a time-series history of these signals, which the platform does not yet capture.</div></div>
    <div class="top"><div><h1>Supply-chain Stress Radar</h1><div class="sub">Point-in-time vendor stress from live signals — findings, incidents, breaches, concentration, geopolitical, residual risk</div></div></div>
    <div id="srbody" class="muted">Scanning the estate…</div>`;
  try{ const r=await api2('/stress-radar'); srRender(r); }catch(e){ document.getElementById('srbody').innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function srRender(r){ const el=document.getElementById('srbody'); if(!el)return; const st=r.stats;
  let h=`<div class="grid g4" style="gap:10px;margin-bottom:12px">
    <div class="card stat"><div class="v" style="color:#DC2626">${st.watchlist}</div><div class="l">Watchlist (High+Severe)</div></div>
    <div class="card stat"><div class="v">${st.Severe}</div><div class="l">Severe</div></div>
    <div class="card stat"><div class="v">${st.High}</div><div class="l">High</div></div>
    <div class="card stat"><div class="v">${st.Elevated}</div><div class="l">Elevated</div></div></div>`;
  h+=`<div class="card" style="margin-bottom:12px"><div class="card-label">Scoring model (point-in-time, transparent)</div><div class="muted" style="font-size:11.5px;margin-top:6px">${r.weights.map(w=>`${esc(w.label)} (max ${w.max})`).join(' · ')}</div></div>`;
  h+=`<div class="card"><div class="card-label">Vendors by stress score (${st.scored} scored — click to open)</div>
    ${r.vendors.map(v=>`<div class="rev-row click" onclick="srGo('${v.vendor_id}')" style="cursor:pointer;align-items:center">
      <span class="rk" style="flex:1"><b>${esc(v.legal_name)}</b> ${v.is_critical?'<span class="tag" style="background:#DC2626;color:#fff">critical</span>':''} <span class="muted" style="font-size:10px">${esc(v.tier||'')}</span>
        <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap">${v.drivers.map(d=>`<span class="tag" style="font-size:9.5px">${esc(d.label)} +${d.points}</span>`).join('')}</div></span>
      <span class="rv" style="min-width:160px"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
        <div style="width:90px;height:8px;background:#e8e2d4;border-radius:4px;overflow:hidden"><div style="width:${v.stress}%;height:100%;background:${STRESS_TONE[v.band]}"></div></div>
        <span style="font-family:Fraunces,serif;font-size:17px;color:${STRESS_TONE[v.band]};min-width:54px;text-align:right">${v.stress}<span style="font-size:10px"> ${esc(v.band)}</span></span></div></span></div>`).join('')}</div>`;
  el.innerHTML=h;
}
function srGo(vid){ try{ openVendor(vid); }catch(e){ flash('Opening '+vid); } }
/* ---------- Menu order (drag-to-reorder nav) ---------- */
function navGroupKey(g){ const l=g.querySelector('.nav-group-label'); return l?l.textContent.trim():'__top__'; }
function applyNavOrder(order){
  try{
    if(!order||!order.groups) return;
    const nav=document.getElementById('nav'); if(!nav) return;
    const groups=[...nav.querySelectorAll(':scope > .nav-group')];
    const byKey={}; groups.forEach(g=>{ byKey[navGroupKey(g)]=g; });
    // 1) reorder groups (unknown groups kept, appended at end in current order)
    order.groups.forEach(k=>{ if(byKey[k]) nav.appendChild(byKey[k]); });
    groups.forEach(g=>{ if(!order.groups.includes(navGroupKey(g))) nav.appendChild(g); });
    // 2) place items per group — supports moving an item into a DIFFERENT group
    const allAnchors={}; nav.querySelectorAll('a[data-v]').forEach(a=>{ allAnchors[a.dataset.v]=a; });
    const placed=new Set();
    const items=order.items||{};
    const placeInto=(k)=>{ const g=byKey[k]; if(!g)return; (items[k]||[]).forEach(v=>{ const a=allAnchors[v]; if(a&&!placed.has(v)){ g.appendChild(a); placed.add(v); } }); };
    order.groups.forEach(placeInto);
    for(const k in items){ if(!order.groups.includes(k)) placeInto(k); }
    // unplaced anchors (items added in code after this order was saved) stay where they are
  }catch(e){ /* never break the nav */ }
}
async function loadNavOrder(){ try{ const r=await api2('/nav-order'); if(r&&r.order) applyNavOrder(r.order); }catch(e){} }
function navGetAfter(container,sel,y){
  const els=[...container.querySelectorAll(sel+':not(.dragging)')]; let res=null,closest=-Infinity;
  for(const el of els){ const b=el.getBoundingClientRect(); const off=y-b.top-b.height/2; if(off<0&&off>closest){closest=off;res=el;} }
  return res;
}
function makeSortable(container,sel){
  if(!container) return;
  container.querySelectorAll(sel).forEach(it=>it.setAttribute('draggable','true'));
  let dragging=null;
  container.addEventListener('dragstart',e=>{ const it=e.target.closest(sel); if(!it||!container.contains(it))return; dragging=it; it.classList.add('dragging'); if(e.dataTransfer)e.dataTransfer.effectAllowed='move'; });
  container.addEventListener('dragend',()=>{ if(dragging){dragging.classList.remove('dragging');dragging=null;} });
  container.addEventListener('dragover',e=>{ if(!dragging||!container.contains(dragging))return; e.preventDefault(); const after=navGetAfter(container,sel,e.clientY); if(after==null)container.appendChild(dragging); else container.insertBefore(dragging,after); });
}
/* shared sortable across multiple lists — enables moving items BETWEEN groups */
function makeSortableGroup(containers,sel){
  let dragging=null;
  const clearTargets=()=>containers.forEach(c=>c.classList.remove('drop-target'));
  containers.forEach(container=>{
    container.querySelectorAll(sel).forEach(it=>it.setAttribute('draggable','true'));
    container.addEventListener('dragstart',e=>{ const it=e.target.closest(sel); if(!it||!container.contains(it))return; dragging=it; it.classList.add('dragging'); if(e.dataTransfer)e.dataTransfer.effectAllowed='move'; });
    container.addEventListener('dragend',()=>{ if(dragging){dragging.classList.remove('dragging');dragging=null;} clearTargets(); });
    container.addEventListener('dragover',e=>{ if(!dragging)return; e.preventDefault(); clearTargets(); container.classList.add('drop-target'); const after=navGetAfter(container,sel,e.clientY); if(after==null)container.appendChild(dragging); else container.insertBefore(dragging,after); });
    container.addEventListener('drop',e=>{ e.preventDefault(); clearTargets(); });
  });
}
function navEditorRender(){
  const host=document.getElementById('navEditor'); if(!host) return;
  const nav=document.getElementById('nav'); if(!nav){ host.innerHTML=''; return; }
  const groups=[...nav.querySelectorAll(':scope > .nav-group')];
  const label=(g)=>{ const k=navGroupKey(g); return k==='__top__'?'Home / Dashboard':k; };
  let gh='', ih='';
  groups.forEach(g=>{
    const key=navGroupKey(g);
    gh+=`<div class="navsort-row" data-key="${esc(key)}" draggable="true"><span class="grip">⠿</span> ${esc(label(g))}</div>`;
    const rows=[...g.querySelectorAll(':scope > a[data-v]')].map(a=>`<div class="navsort-row" data-v="${esc(a.dataset.v)}" draggable="true"><span class="grip">⠿</span> ${esc(a.textContent.trim())}</div>`).join('');
    ih+=`<div class="navsort-block"><div class="muted" style="font-size:11px;margin:8px 0 4px;font-weight:600">${esc(label(g))}</div><div class="navsort-items" data-key="${esc(key)}">${rows}</div></div>`;
  });
  host.innerHTML=`<div class="card" style="margin-top:10px"><div class="card-label">Menu order — drag to reorder</div>
    <div class="muted" style="font-size:12px;margin-bottom:8px">Reorder the sidebar for all users. Drag group names to reorder sections; drag items to reorder within a section <b>or move them between sections</b>.</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="min-width:200px"><div class="muted" style="font-size:11px;margin-bottom:4px">Groups</div><div id="navGroupsSort">${gh}</div></div>
      <div style="flex:1;min-width:280px"><div class="muted" style="font-size:11px;margin-bottom:4px">Items</div>${ih}</div>
    </div>
    <div class="row" style="margin-top:10px;gap:6px"><button class="btn sm" onclick="navOrderSave()">Save menu order</button>
      <button class="btn sm ghost" onclick="navOrderReset()">Reset to default</button></div></div>`;
  makeSortable(document.getElementById('navGroupsSort'), '.navsort-row');
  makeSortableGroup([...host.querySelectorAll('.navsort-items')], '.navsort-row');
}
async function navOrderSave(){
  const groups=[...document.querySelectorAll('#navGroupsSort .navsort-row')].map(r=>r.dataset.key);
  const items={}; document.querySelectorAll('#navEditor .navsort-items').forEach(c=>{ items[c.dataset.key]=[...c.querySelectorAll('.navsort-row')].map(r=>r.dataset.v); });
  try{ await api2('/nav-order',{method:'PUT',body:JSON.stringify({order:{groups,items}})}); applyNavOrder({groups,items}); flash('Menu order saved — applies for all users'); }
  catch(e){ flash(e.message); }
}
async function navOrderReset(){
  if(!confirm('Reset the sidebar to the default order?')) return;
  try{ await api2('/nav-order',{method:'PUT',body:JSON.stringify({order:null})}); flash('Reset — reloading'); setTimeout(()=>location.reload(),500); }
  catch(e){ flash(e.message); }
}

/* ---------- Configuration manager (admin-only) ---------- */
let _cfg=null;
V.config=async()=>{
  view.innerHTML=`<div class="top"><div><h1>Configuration</h1>
    <div class="muted">System parameters used by the risk engines. Changes apply immediately — no redeploy.</div></div></div>
    <div id="navEditor"></div>
    <div id="cfgBody" class="muted" style="margin-top:8px">Loading…</div>`;
  navEditorRender();
  try{ _cfg=await api2("/config"); cfgRender(); }
  catch(e){ document.getElementById("cfgBody").innerHTML=`<span class="err">${esc(e.message)}</span>`; }
};
function cfgRender(){
  const host=document.getElementById("cfgBody"); if(!host) return;
  if(!_cfg||!_cfg.categories.length){ host.innerHTML='<div class="muted">No configurable settings.</div>'; return; }
  let h="";
  for(const cat of _cfg.categories){
    h+=`<div class="card" style="margin-top:10px"><div class="card-label">${esc(cat.category)}</div>`;
    for(const it of cat.items){
      const isNum=(it.type==="int"||it.type==="number");
      h+=`<div class="rev-row" style="align-items:flex-start;gap:12px;padding:10px 0">
        <div style="flex:1">
          <div style="font-weight:600">${esc(it.label)}
            <span class="tag" style="margin-left:6px;background:${it.is_default?'#E8EFEA;color:#1A4D3C':'#FBEFD6;color:#8A5A12'}">${it.is_default?'default':'customised'}</span></div>
          <div class="muted" style="font-size:12px;margin-top:2px">${esc(it.description||"")}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">Default: ${esc(String(it.default))}${it.updated_by&&!it.is_default?` · set by ${esc(it.updated_by)}`:""}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="cfg_${cssId(it.key)}" ${isNum?'type="number" step="1"':'type="text"'} value="${esc(String(it.value))}" style="width:${isNum?'90px':'220px'}">
          <button class="btn sm" onclick="cfgSave('${esc(it.key)}')">Save</button>
          <button class="btn sm ghost" onclick="cfgReset('${esc(it.key)}')" ${it.is_default?'disabled':''}>Reset</button>
        </div></div>`;
    }
    h+=`</div>`;
  }
  host.innerHTML=h;
}
function cssId(k){ return k.replace(/[^a-zA-Z0-9]/g,"_"); }
async function cfgSave(key){
  const el=document.getElementById("cfg_"+cssId(key)); if(!el) return;
  let v=el.value; if(el.type==="number") v=Number(v);
  try{ await api2("/config/"+encodeURIComponent(key),{method:"PUT",body:JSON.stringify({value:v})});
    flash("Saved — applies immediately"); _cfg=await api2("/config"); cfgRender(); }
  catch(e){ flash(e.message); }
}
async function cfgReset(key){
  try{ await api2("/config/"+encodeURIComponent(key)+"/reset",{method:"POST"});
    flash("Reset to default"); _cfg=await api2("/config"); cfgRender(); }
  catch(e){ flash(e.message); }
}

// ---------- PESTLE threat intelligence ----------
window._pesFocus={type:"portfolio",id:null,label:""};
window._pesMin=55; window._PESCATS={};
V.pestle=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="sec-h"><h1>PESTLE Threat Intelligence</h1></div>
    <p class="muted" style="margin:-6px 0 14px">A 150-dimension PESTLE risk vector on every vendor and engagement, refreshed by an overnight News &amp; Reputation sweep. <span class="tag" style="background:#eee4d4;color:#9A6F18">synthetic signal</span></p>
    <div id="pesSummary" class="muted">Loading threat surface…</div>
    <div class="sec-h" style="margin-top:18px"><h2 style="font-size:15px">Interactive threat knowledge graph</h2><div class="rule"></div></div>
    <div id="pesControls"></div>
    <div id="pestleGraph" style="height:560px;border:1px solid var(--line,#e4decf);border-radius:12px;background:#fbfaf6;margin-top:10px;overflow:hidden"></div>
    <div id="pesLegend" style="margin-top:8px"></div>`;
  pesLoadSummary(); pesGraph();
};
async function pesLoadSummary(){
  const host=document.getElementById("pesSummary"); if(!host) return;
  let d; try{ d=await api2("/pestle/summary"); }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  if(d.empty){ host.innerHTML='<div class="card muted">No PESTLE data yet — run a sweep.</div>'; return; }
  window._PESCATS=d.categories||{};
  const cats=d.cat_means||{};
  const catCards=Object.keys(d.categories).map(c=>{
    const col=d.categories[c].color, sc=cats[c]||0;
    return `<div class="card" style="padding:12px 14px;border-top:3px solid ${col};cursor:pointer" onclick="pesFocus('category','${c}','${esc(d.categories[c].name)}')">
      <div class="card-label" style="margin:0;color:${col}">${esc(d.categories[c].name)}</div>
      <div style="font-family:'Fraunces',serif;font-size:24px;font-weight:600">${sc}</div>
      <div style="height:5px;background:#eee;border-radius:3px;margin-top:4px"><div style="height:5px;width:${sc}%;background:${col};border-radius:3px"></div></div></div>`;}).join("");
  const tt=(d.top_threats||[]).slice(0,10).map(t=>{const col=(d.categories[t.cat]||{}).color||"#777";
    return `<tr class="click" onclick="pesFocus('threat','${t.id}','${esc(t.name)}')"><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${col};margin-right:7px"></span>${esc(t.name)}</td>
      <td style="width:34%"><div style="height:7px;background:#eee;border-radius:4px"><div style="height:7px;width:${t.score}%;background:${col};border-radius:4px"></div></div></td>
      <td style="text-align:right;font-weight:600">${t.score}</td></tr>`;}).join("");
  const mv=(d.movers||[]).slice(0,8).map(m=>{const up=m.delta>=0;const col=up?"#DC2626":"#1A4D3C";
    return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:3px 0"><span>${esc(m.name)}</span><b style="color:${col}">${up?"▲":"▼"} ${Math.abs(m.delta).toFixed(1)}</b></div>`;}).join("");
  const canAdmin=(window._role==="admin"||window._role==="controller");
  host.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">
      <div class="muted" style="font-size:12.5px">Last overnight sweep: <b>${esc(fmtDate(d.as_of))}</b> · ${d.entities} entities scored across ${150} dimensions</div>
      <button class="btn sm" onclick="pesRefresh()">🛰️ Run overnight sweep</button></div>
    <div class="grid g6" style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px">${catCards}</div>
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:16px">
      <div><div class="card-label">Top systemic threats — click to focus the graph</div>
        <table style="margin-top:6px"><tr><th>Threat</th><th>Exposure</th><th style="text-align:right">Score</th></tr>${tt}</table></div>
      <div><div class="card-label">Overnight movers — News &amp; Reputation</div>
        <div class="card" style="margin-top:6px">${mv||'<span class="muted">No material moves in the last sweep.</span>'}</div>
        <div class="card-label" style="margin-top:14px">PESTLE Risk Exposure Summary <span id="pesSumAi"></span></div>
        <div class="card" id="pesExposureSummary" style="margin-top:6px"><span class="muted">Generating…</span></div></div>
    </div>`;
  pesExposureSummary();
}
async function pesExposureSummary(){
  const host=document.getElementById('pesExposureSummary'); if(!host) return;
  const f=window._pesFocus||{type:'portfolio'};
  host.innerHTML='<span class="muted"><span class="pa-spin"></span> Generating risk summary from the knowledge map…</span>';
  try{ const d=await api2(`/pestle/exposure-summary?focus_type=${encodeURIComponent(f.type)}${f.id?`&focus_id=${encodeURIComponent(f.id)}`:''}`);
    host.innerHTML=`<div style="font-size:12.5px;line-height:1.5">${esc(d.summary)}</div>`;
    const ai=document.getElementById('pesSumAi'); if(ai) ai.innerHTML=d.ai?'<span class="tag">AI</span>':'<span class="tag" style="background:#eee4d4;color:#9A6F18">deterministic</span>';
  }catch(e){ host.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}
async function pesRefresh(){
  const host=document.getElementById("pesSummary");
  try{ const r=await api2("/pestle/refresh",{method:"POST"});
    flash(`Overnight sweep complete — ${r.entities} entities re-scored (${r.as_of})`);
    pesLoadSummary(); pesGraph();
  }catch(e){ flash("Sweep needs admin/controller rights"); }
}
function pesFocus(type,id,label){
  window._pesFocus={type:type,id:id,label:label||""};
  pesGraph(); pesExposureSummary();
}
function pesControlsRender(meta){
  const host=document.getElementById("pesControls"); if(!host) return;
  const f=window._pesFocus;
  const chips=Object.keys(window._PESCATS||{}).map(c=>`<button class="btn sm ${f.type==='category'&&f.id===c?'':'ghost'}" style="border-color:${window._PESCATS[c].color}" onclick="pesFocus('category','${c}','${esc(window._PESCATS[c].name)}')">${esc(window._PESCATS[c].name)}</button>`).join(" ");
  const crumb=f.type==="portfolio"?`<b>Portfolio view</b> — top systemic threats and their most-exposed entities`:
     `<button class="btn sm ghost" onclick="pesFocus('portfolio',null,'')">← Portfolio</button> &nbsp; Focused on <b>${esc(f.label||f.id)}</b> <span class="tag">${f.type}</span>`+
     ((f.type==="vendor"||f.type==="engagement")?` &nbsp;<a href="#" onclick="pesOpenEntity();return false">open record →</a>`:"");
  host.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div style="font-size:13px">${crumb}</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:12px">min exposure
        <input type="range" min="0" max="90" value="${window._pesMin}" oninput="window._pesMin=+this.value;document.getElementById('pesMinV').textContent=this.value" onchange="pesGraph()" style="width:120px">
        <span id="pesMinV">${window._pesMin}</span></div></div>
    <div style="margin-top:8px">${chips}</div>`;
}
function pesOpenEntity(){const f=window._pesFocus;
  if(f.type==="vendor"&&typeof openVendorMaster==="function") openVendorMaster(f.id);
  else if(f.type==="engagement"&&typeof openEngagementRegister==="function") openEngagementRegister(f.id);}
async function pesGraph(){
  pesControlsRender();
  const host=document.getElementById("pestleGraph"); if(!host) return;
  const f=window._pesFocus;
  const qs=`focus_type=${f.type}&focus_id=${encodeURIComponent(f.id||"")}&min_score=${window._pesMin}`;
  let g; try{ g=await api2("/pestle/graph?"+qs); }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  drawPestleGraph(g);
  const L=document.getElementById("pesLegend");
  if(L) L.innerHTML=`<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:#6E6A5E">
    <span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#11261F;margin-right:5px"></span>PESTLE category</span>
    <span><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#B45309;margin-right:5px"></span>threat (coloured by category)</span>
    <span><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#1A4D3C;margin-right:5px"></span>vendor</span>
    <span><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#B8862B;margin-right:5px"></span>engagement</span>
    <span><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#DC2626;margin-right:5px"></span>⚠ risk-concentration hotspot</span>
    <span>· ${g.meta&&g.meta.node_count||0} nodes · drag to move · scroll to zoom · click to drill</span></div>`;
}
function drawPestleGraph(g){
  const host=document.getElementById("pestleGraph"); if(!host) return;
  const W=host.clientWidth||900, H=560;
  if(!g.nodes.length){ host.innerHTML=`<div class="muted" style="padding:30px;text-align:center">No nodes above the minimum exposure threshold.</div>`; return; }
  const CC=window._PESCATS||{};
  const nodes=g.nodes.map(n=>({...n,x:W/2+(Math.random()-.5)*W*0.7,y:H/2+(Math.random()-.5)*H*0.7,vx:0,vy:0}));
  const idx=Object.fromEntries(nodes.map((n,i)=>[n.id,i]));
  const links=g.edges.filter(e=>idx[e.source]!=null&&idx[e.target]!=null).map(e=>({s:idx[e.source],t:idx[e.target]}));
  const Krep=2600,Ks=0.018,L0=78,damp=0.85,ctr=0.005;
  for(let it=0;it<300;it++){
    for(let i=0;i<nodes.length;i++){const a=nodes[i];
      for(let j=i+1;j<nodes.length;j++){const b=nodes[j];let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy||0.01,d=Math.sqrt(d2);
        const fr=Krep/d2,fx=fr*dx/d,fy=fr*dy/d;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;}}
    for(const lk of links){const a=nodes[lk.s],b=nodes[lk.t];let dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||0.01;
      const fr=Ks*(d-L0),fx=fr*dx/d,fy=fr*dy/d;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;}
    for(const n of nodes){n.vx+=(W/2-n.x)*ctr;n.vy+=(H/2-n.y)*ctr;n.vx*=damp;n.vy*=damp;n.x+=n.vx;n.y+=n.vy;
      n.x=Math.max(20,Math.min(W-20,n.x));n.y=Math.max(20,Math.min(H-20,n.y));}}
  const colorOf=n=>{ if(n.kind==="cat")return "#11261F"; if(n.kind==="threat")return (CC[n.cat]||{}).color||"#777";
    if(n.kind==="vendor")return "#1A4D3C"; if(n.kind==="engagement")return "#B8862B"; return "#777"; };
  const radOf=n=>{ if(n.kind==="cat")return 17; if(n.kind==="threat")return Math.max(6,Math.min(14,5+ (n.score||0)/10)); return Math.max(5,Math.min(12,4+(n.score||0)/12)); };
  let svg=`<svg id="pesSvg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;cursor:grab"><g id="pesVP">`;
  links.forEach((lk,i)=>{const a=nodes[lk.s],b=nodes[lk.t];
    svg+=`<line data-li="${i}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#cfc7b5" stroke-width="0.7" opacity="0.6"/>`;});
  nodes.forEach((n,i)=>{const col=colorOf(n),r=radOf(n);
    const hot = n.kind!=="cat" && ((n.degree||0)>=5 || (n.score||0)>=78);
    const fill=hot?"#DC2626":col, strokeC=hot?"#7F1D1D":"#fff", strokeW=hot?2:1;
    if(hot) svg+=`<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(r+5).toFixed(1)}" fill="#DC2626" fill-opacity="0.18"/>`;
    svg+=`<circle class="pes-node" data-ni="${i}" data-id="${esc(n.id)}" data-kind="${n.kind}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="${n.kind==='cat'?0.95:0.85}" stroke="${strokeC}" stroke-width="${strokeW}"><title>${esc(n.label)}${n.score?(' · score '+Math.round(n.score)):''}${hot?' · ⚠ risk-concentration hotspot':''} — click to drill</title></circle>`;
    const lab=(n.label||'').slice(0, n.kind==="cat"?22:15);
    svg+=`<text data-ti="${i}" x="${n.x.toFixed(1)}" y="${(n.y-r-3).toFixed(1)}" text-anchor="middle" font-size="${n.kind==='cat'?11:8}" fill="${hot?'#B91C1C':'#28332c'}" style="pointer-events:none;font-family:Spline Sans,sans-serif">${esc(lab)}</text>`;});
  svg+=`</g></svg>`; host.innerHTML=svg;
  // ---- interactivity: zoom / pan / drag / click ----
  const svgEl=document.getElementById("pesSvg"), vp=document.getElementById("pesVP");
  let T={k:1,x:0,y:0}; const apply=()=>vp.setAttribute("transform",`translate(${T.x},${T.y}) scale(${T.k})`);
  const toG=ev=>{const R=svgEl.getBoundingClientRect();const sx=(ev.clientX-R.left)*(W/R.width),sy=(ev.clientY-R.top)*(H/R.height);
    return {x:(sx-T.x)/T.k,y:(sy-T.y)/T.k};};
  svgEl.addEventListener("wheel",ev=>{ev.preventDefault();const R=svgEl.getBoundingClientRect();
    const sx=(ev.clientX-R.left)*(W/R.width),sy=(ev.clientY-R.top)*(H/R.height);
    const f=ev.deltaY<0?1.12:0.89; const nk=Math.max(0.4,Math.min(3,T.k*f));
    T.x=sx-(sx-T.x)*(nk/T.k); T.y=sy-(sy-T.y)*(nk/T.k); T.k=nk; apply();},{passive:false});
  let drag=null,panning=null,moved=0;
  const incident=ni=>links.map((lk,i)=>({i,lk})).filter(o=>o.lk.s===ni||o.lk.t===ni);
  svgEl.addEventListener("pointerdown",ev=>{const c=ev.target.closest(".pes-node");
    if(c){const ni=+c.getAttribute("data-ni");drag={ni,el:c,lines:incident(ni),txt:svgEl.querySelector(`text[data-ti="${ni}"]`)};moved=0;}
    else{panning={x:ev.clientX,y:ev.clientY,ox:T.x,oy:T.y};svgEl.style.cursor="grabbing";}
    svgEl.setPointerCapture(ev.pointerId);});
  svgEl.addEventListener("pointermove",ev=>{
    if(drag){const p=toG(ev);const n=nodes[drag.ni];n.x=p.x;n.y=p.y;moved++;
      drag.el.setAttribute("cx",p.x);drag.el.setAttribute("cy",p.y);
      if(drag.txt){drag.txt.setAttribute("x",p.x);drag.txt.setAttribute("y",(p.y-(+drag.el.getAttribute("r"))-3));}
      for(const o of drag.lines){const ln=svgEl.querySelector(`line[data-li="${o.i}"]`);if(!ln)continue;
        if(o.lk.s===drag.ni){ln.setAttribute("x1",p.x);ln.setAttribute("y1",p.y);}else{ln.setAttribute("x2",p.x);ln.setAttribute("y2",p.y);}}}
    else if(panning){T.x=panning.ox+(ev.clientX-panning.x);T.y=panning.oy+(ev.clientY-panning.y);apply();}});
  const endp=ev=>{ if(drag&&moved<3){ const id=drag.el.getAttribute("data-id"),kind=drag.el.getAttribute("data-kind");pesNodeClick(kind,id);} drag=null;panning=null;svgEl.style.cursor="grab"; };
  svgEl.addEventListener("pointerup",endp); svgEl.addEventListener("pointercancel",endp);
}
function pesNodeClick(kind,id){
  const raw=id.indexOf(":")>=0?id.slice(id.indexOf(":")+1):id;
  const lab=(window._PESCATS&&kind==="cat")?(window._PESCATS[raw]||{}).name:"";
  if(kind==="cat") pesFocus("category",raw,lab||raw);
  else if(kind==="threat") pesFocus("threat",raw,raw);
  else if(kind==="vendor") pesFocus("vendor",raw,raw);
  else if(kind==="engagement") pesFocus("engagement",raw,raw);
}
// ---------- Open-Source Software register ----------
function ossBandCol(b){return {LOW:"#2E6A4F",MODERATE:"#B8862B",ELEVATED:"#C2410C",HIGH:"#DC2626",CRITICAL:"#991B1B"}[b]||"#777";}
function ossCatChip(cat){const m={allowed:["#eaf6ee","#1A7F4B"],restricted:["#fff5e6","#9A6F18"],prohibited:["#fdecea","#B22"],review:["#eef","#445"]};
  const c=m[cat]||m.review; return `<span class="demo-pill" style="background:${c[0]};color:${c[1]}">${esc(cat||"review")}</span>`;}
window._ossTab="components";
V.oss=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="sec-h"><h1>Open Source Software</h1><div style="margin-left:auto"><button class="btn sm" onclick="ossUpload()">⬆ Upload SBOM</button></div></div>
    <p class="muted" style="margin:-6px 0 14px">A register of open-source components from vendor SBOMs (CycloneDX &amp; SPDX), tagged to every engagement that uses them. <span class="tag" style="background:#eee4d4;color:#9A6F18">seeded intel</span></p>
    <div id="ossSummary" class="muted">Loading…</div>
    <div class="card" style="margin-top:14px"><div class="card-label">Blast radius — which engagements &amp; vendors are exposed to a component?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <input id="oss_blast_q" placeholder="component name or purl (e.g. log4j-core)" style="flex:1;min-width:220px">
        <input id="oss_blast_v" placeholder="version (optional)" style="width:150px">
        <button class="btn sm" onclick="ossBlast()">Search</button></div>
      <div id="oss_blast_res" style="margin-top:10px"></div></div>
    <div class="tabs" id="ossTabs" style="margin-top:16px;display:flex;gap:6px;flex-wrap:wrap">
      ${[["components","Components"],["vulnerabilities","Vulnerabilities"],["licences","Licences"],["concentration","Concentration"],["coverage","Coverage"]].map(t=>`<button class="btn sm ${t[0]===window._ossTab?'':'ghost'}" onclick="ossTab('${t[0]}')">${t[1]}</button>`).join("")}
    </div>
    <div id="ossTabBody" style="margin-top:12px">Loading…</div>
    <div id="ossModal"></div>`;
  ossLoadSummary(); ossRenderTab();
};
async function ossLoadSummary(){
  const host=document.getElementById("ossSummary"); if(!host) return;
  let d; try{ d=await api2("/oss/summary"); }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const dist=d.risk_dist||{}; const order=["CRITICAL","HIGH","ELEVATED","MODERATE","LOW"];
  const distBar=`<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;border:1px solid #e7e1d2">${order.map(b=>{const n=dist[b]||0; return n?`<div title="${b}: ${n}" style="flex:${n};background:${ossBandCol(b)}"></div>`:"";}).join("")}</div>`;
  host.innerHTML=`<div class="grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div class="card" style="padding:12px 14px"><div class="card-label" style="margin:0">SBOM coverage</div><div style="font-family:Fraunces,serif;font-size:24px;font-weight:600">${d.coverage_pct}%</div><div class="muted" style="font-size:11px">${d.covered_engagements}/${d.total_engagements} engagements</div></div>
      <div class="card" style="padding:12px 14px"><div class="card-label" style="margin:0">Components</div><div style="font-family:Fraunces,serif;font-size:24px;font-weight:600">${d.components}</div><div class="muted" style="font-size:11px">${d.sboms} active SBOMs</div></div>
      <div class="card" style="padding:12px 14px;border-top:3px solid #DC2626"><div class="card-label" style="margin:0">KEV components</div><div style="font-family:Fraunces,serif;font-size:24px;font-weight:600;color:#DC2626">${d.kev_components}</div><div class="muted" style="font-size:11px">known-exploited in use</div></div>
      <div class="card" style="padding:12px 14px;border-top:3px solid #B22"><div class="card-label" style="margin:0">Prohibited licences</div><div style="font-family:Fraunces,serif;font-size:24px;font-weight:600">${d.prohibited_licences}</div><div class="muted" style="font-size:11px">${d.restricted_licences} restricted</div></div>
      <div class="card" style="padding:12px 14px"><div class="card-label" style="margin:0">Component risk mix</div><div style="margin-top:10px">${distBar}</div><div class="muted" style="font-size:11px;margin-top:5px">CRITICAL→LOW</div></div>
    </div>`;
}
function ossTab(t){ window._ossTab=t; document.querySelectorAll("#ossTabs .btn").forEach(b=>{}); 
  const tabs=document.getElementById("ossTabs"); if(tabs) tabs.querySelectorAll("button").forEach(b=>b.classList.toggle("ghost", b.textContent.toLowerCase()!==({components:"components",vulnerabilities:"vulnerabilities",licences:"licences",concentration:"concentration",coverage:"coverage"})[t]));
  ossRenderTab(); }
async function ossRenderTab(){
  const host=document.getElementById("ossTabBody"); if(!host) return; host.innerHTML='<span class="muted">Loading…</span>';
  try{
    if(window._ossTab==="components"){
      const d=await api2("/oss/components"); host.innerHTML=`
        <input id="oss_csearch" placeholder="filter components…" oninput="ossCompFilter()" style="margin-bottom:8px;width:280px">
        <table id="oss_ctable"><tr><th>Component</th><th>Version</th><th>Ecosystem</th><th>Licence</th><th>Maint.</th><th>Risk</th><th>Engagements</th></tr>
        ${d.components.map(c=>ossCompRow(c)).join("")}</table>`;
    } else if(window._ossTab==="vulnerabilities"){
      const d=await api2("/oss/vulnerabilities"); host.innerHTML=`<table><tr><th>CVE</th><th>Severity</th><th>CVSS</th><th>EPSS</th><th>Component</th><th>Ver</th><th>Eng.</th><th>VEX</th></tr>
        ${d.vulnerabilities.map(v=>`<tr class="click" onclick="ossComponent(${v.component_id})">
          <td>${esc(v.cve)}</td><td>${v.kev?'<span class="demo-pill" style="background:#fdecea;color:#B22">KEV</span>':`<span class="demo-pill" style="background:#fff5e6;color:#9A6F18">${esc(v.severity||'')}</span>`}</td>
          <td>${v.cvss??'—'}</td><td>${v.epss!=null?(v.epss*100).toFixed(0)+'%':'—'}</td><td>${esc(v.component)}</td><td>${esc(v.version||'')}</td><td>${v.usage}</td><td>${esc(v.vex_status||'')}</td></tr>`).join("")}</table>`;
    } else if(window._ossTab==="licences"){
      const d=await api2("/oss/licences"); const bc=d.by_category;
      host.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:10px">${["prohibited","restricted","allowed","review"].map(k=>`<span class="demo-pill" style="background:#f3efe4;color:#333">${k}: <b>${bc[k]||0}</b></span>`).join("")}</div>
        <div class="card-label">Flagged components (prohibited / restricted)</div>
        <table><tr><th>Component</th><th>Version</th><th>Licence</th><th>Category</th><th>Engagements</th></tr>
        ${d.flagged.map(f=>`<tr class="click" onclick="ossComponent(${f.id})"><td>${esc(f.name)}</td><td>${esc(f.version||'')}</td><td>${esc(f.licence||'')}</td><td>${ossCatChip(f.category)}</td><td>${f.usage}</td></tr>`).join("")}</table>`;
    } else if(window._ossTab==="concentration"){
      const d=await api2("/oss/concentration"); host.innerHTML=`<p class="muted" style="font-size:12.5px">Components used across the most engagements — single points of systemic exposure.</p>
        <table><tr><th>Component</th><th>Version</th><th>Ecosystem</th><th>Engagements</th><th>Vendors</th><th>Risk</th></tr>
        ${d.components.map(c=>`<tr class="click" onclick="ossComponent(${c.id})"><td>${esc(c.name)}</td><td>${esc(c.version||'')}</td><td>${esc(c.ecosystem||'')}</td><td><b>${c.usage}</b></td><td>${c.vendors}</td><td><span class="demo-pill" style="background:${ossBandCol(c.band)}22;color:${ossBandCol(c.band)}">${c.band}</span></td></tr>`).join("")}</table>`;
    } else if(window._ossTab==="coverage"){
      const d=await api2("/oss/coverage"); const rows=d.rows;
      const missing=rows.filter(r=>!r.has_sbom).length, stale=rows.filter(r=>r.stale).length;
      host.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:10px"><span class="demo-pill" style="background:#eaf6ee;color:#1A7F4B">with SBOM: ${rows.length-missing}</span>
        <span class="demo-pill" style="background:#fdecea;color:#B22">missing: ${missing}</span><span class="demo-pill" style="background:#fff5e6;color:#9A6F18">stale (&gt;180d): ${stale}</span></div>
        <table><tr><th>Engagement</th><th>SBOM?</th><th>Last</th><th>Format</th><th>NTIA</th><th>Quality</th></tr>
        ${rows.slice(0,120).map(r=>`<tr><td>${esc(r.title)}</td><td>${r.has_sbom?'<span class="demo-pill" style="background:#eaf6ee;color:#1A7F4B">yes</span>':'<span class="demo-pill" style="background:#fdecea;color:#B22">missing</span>'}</td>
          <td>${r.last?esc(fmtDate(r.last)):'—'}${r.stale?' <span class="demo-pill" style="background:#fff5e6;color:#9A6F18">stale</span>':''}</td><td>${esc(r.fmt||'—')}</td><td>${r.ntia!=null?r.ntia:'—'}</td><td>${esc(r.quality||'—')}</td></tr>`).join("")}</table>`;
    }
  }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function ossCompRow(c){ return `<tr class="click oss-crow" data-n="${esc((c.name||'').toLowerCase())}" onclick="ossComponent(${c.id})">
  <td>${esc(c.name)}</td><td>${esc(c.version||'')}</td><td>${esc(c.ecosystem||'')}</td><td>${ossCatChip(c.licence_category)} <span class="muted" style="font-size:11px">${esc(c.licence||'')}</span></td>
  <td>${esc(c.maintenance||'')}</td><td><span class="demo-pill" style="background:${ossBandCol(c.band)}22;color:${ossBandCol(c.band)}">${c.band} ${Math.round(c.risk)}</span></td><td>${c.usage}</td></tr>`; }
function ossCompFilter(){ const q=(document.getElementById("oss_csearch").value||"").toLowerCase();
  document.querySelectorAll("#oss_ctable .oss-crow").forEach(r=>{ r.style.display=r.getAttribute("data-n").includes(q)?"":"none"; }); }
async function ossBlast(){
  const q=(document.getElementById("oss_blast_q").value||"").trim(); const v=(document.getElementById("oss_blast_v").value||"").trim();
  const res=document.getElementById("oss_blast_res"); if(!q){ res.innerHTML='<span class="muted">Enter a component name or purl.</span>'; return; }
  res.innerHTML='<span class="muted">Searching…</span>';
  try{ const d=await api2(`/oss/blast?q=${encodeURIComponent(q)}${v?`&version=${encodeURIComponent(v)}`:""}`);
    if(!d.matched_components.length){ res.innerHTML='<span class="muted">No matching components in the register.</span>'; return; }
    res.innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <span class="demo-pill" style="background:#11261F;color:#fff">${d.matched_components.length} component(s)</span>
      <span class="demo-pill" style="background:#fdecea;color:#B22">${d.engagement_count} engagements exposed</span>
      <span class="demo-pill" style="background:#fff5e6;color:#9A6F18">${d.vendor_count} vendors exposed</span></div>
      <div class="muted" style="font-size:12px;margin-bottom:4px">Matched: ${d.matched_components.map(m=>`${esc(m.name)}@${esc(m.version||'?')} (${m.band})`).join(" · ")}</div>
      <table><tr><th>Engagement</th><th>Vendor</th><th>Dependency</th></tr>${d.engagements.slice(0,60).map(e=>`<tr><td>${esc(e.title)}</td><td>${esc(e.vendor_id||'')}</td><td>${esc(e.dep_type||'')}</td></tr>`).join("")}</table>`;
  }catch(e){ res.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function ossComponent(cid){
  const m=document.getElementById("ossModal"); if(!m) return; m.innerHTML='';
  let d; try{ d=await api2(`/oss/component/${cid}`); }catch(e){ flash(e.message); return; }
  const vulns=d.vulnerabilities.length?`<table><tr><th>CVE</th><th>Sev</th><th>CVSS</th><th>EPSS</th><th>VEX</th><th>Summary</th></tr>
    ${d.vulnerabilities.map(v=>`<tr><td>${esc(v.cve)}</td><td>${v.kev?'<b style="color:#B22">KEV</b>':esc(v.severity||'')}</td><td>${v.cvss??'—'}</td><td>${v.epss!=null?(v.epss*100).toFixed(0)+'%':'—'}</td><td>${esc(v.vex_status||'')}</td><td style="font-size:12px">${esc(v.summary||'')}</td></tr>`).join("")}</table>`:'<span class="muted">No known vulnerabilities.</span>';
  m.innerHTML=`<div class="help-overlay open" onclick="document.getElementById('ossModal').innerHTML=''"></div>
    <div class="help-drawer open" style="width:520px">
      <div class="help-head" style="position:relative;background:linear-gradient(135deg,#11261F,${ossBandCol(d.band)})">
        <button class="hx" onclick="document.getElementById('ossModal').innerHTML=''">✕</button>
        <h3>${esc(d.name)} <span style="font-weight:400;font-size:14px">${esc(d.version||'')}</span></h3>
        <div class="hsub">${esc(d.ecosystem||'')} · ${esc(d.purl||'')}</div></div>
      <div class="help-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="demo-pill" style="background:${ossBandCol(d.band)}22;color:${ossBandCol(d.band)}">risk ${Math.round(d.risk)} · ${d.band}</span>
          ${ossCatChip(d.licence_category)} <span class="demo-pill" style="background:#f3efe4;color:#333">${esc(d.licence||'')}</span>
          <span class="demo-pill" style="background:#f3efe4;color:#333">maint: ${esc(d.maintenance||'')}</span></div>
        <div class="help-sec">Vulnerabilities</div>${vulns}
        <div class="help-sec" style="margin-top:16px">Blast radius — ${d.affected_engagements.length} engagement(s), ${d.vendors} vendor(s)</div>
        <table><tr><th>Engagement</th><th>Vendor</th><th>Dep</th><th>Scope</th></tr>
        ${d.affected_engagements.slice(0,80).map(e=>`<tr><td>${esc(e.title)}</td><td>${esc(e.vendor_id||'')}</td><td>${esc(e.dep_type||'')}</td><td>${esc(e.scope||'')}</td></tr>`).join("")}</table>
      </div></div>`;
}
function ossUpload(){
  const m=document.getElementById("ossModal"); if(!m) return;
  m.innerHTML=`<div class="help-overlay open" onclick="document.getElementById('ossModal').innerHTML=''"></div>
    <div class="help-drawer open" style="width:560px">
      <div class="help-head" style="position:relative"><button class="hx" onclick="document.getElementById('ossModal').innerHTML=''">✕</button>
        <h3>Upload SBOM</h3><div class="hsub">CycloneDX or SPDX JSON — tagged to an engagement</div></div>
      <div class="help-body">
        <label>Engagement ID</label><input id="oss_up_eng" placeholder="ENG-000123" style="width:100%;margin-bottom:8px">
        <label>Product</label><input id="oss_up_prod" placeholder="Product name" style="width:100%;margin-bottom:8px">
        <label>Product version</label><input id="oss_up_ver" placeholder="1.0.0" style="width:100%;margin-bottom:8px">
        <label>SBOM JSON</label><textarea id="oss_up_json" rows="9" placeholder='{"bomFormat":"CycloneDX", ...}' style="width:100%;font-family:JetBrains Mono,monospace;font-size:11px"></textarea>
        <div style="margin-top:10px"><button class="btn" onclick="ossUploadSubmit()">Ingest SBOM</button></div>
        <div id="oss_up_res" style="margin-top:8px"></div>
      </div></div>`;
}
async function ossUploadSubmit(){
  const eng=document.getElementById("oss_up_eng").value.trim(); const res=document.getElementById("oss_up_res");
  let sbom; try{ sbom=JSON.parse(document.getElementById("oss_up_json").value); }catch(e){ res.innerHTML='<div class="err">SBOM is not valid JSON.</div>'; return; }
  res.innerHTML='<span class="muted">Ingesting…</span>';
  try{ const r=await api2("/oss/ingest",{method:"POST",body:JSON.stringify({engagement_id:eng,product:document.getElementById("oss_up_prod").value.trim(),product_version:document.getElementById("oss_up_ver").value.trim(),sbom:sbom})});
    res.innerHTML=`<div style="color:#1A4D3C">✓ Ingested ${r.components} components (${esc(r.fmt)} ${esc(r.spec_version||'')}, NTIA ${r.ntia}, ${esc(r.quality)}).</div>`;
    flash("SBOM ingested"); ossLoadSummary(); ossRenderTab();
  }catch(e){ res.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
// ---------- AI answer feedback ----------
window._fbDone={};
function aiFeedbackBar(surface,idx,engine){
  const id=`${surface}_${idx}`;
  if(window._fbDone[id]) return `<div class="muted" style="font-size:11px;margin-top:5px;color:#1A7F4B">✓ Thanks — recorded. This helps improve future answers.</div>`;
  return `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <span class="muted" style="font-size:11px">Was this helpful?</span>
    <button class="btn sm ghost" title="Helpful" onclick="mgmtFeedback(${idx},'up')">👍</button>
    <button class="btn sm ghost" title="Not helpful" onclick="mgmtFeedback(${idx},'down')">👎</button>
    <button class="btn sm ghost" onclick="document.getElementById('fbc_${id}').style.display='flex'">＋ comment</button>
    <span id="fbc_${id}" style="display:none;gap:6px;flex:1;min-width:220px">
      <input id="fbi_${id}" placeholder="What would make this better?" style="flex:1">
      <button class="btn sm" onclick="mgmtFeedback(${idx},'na')">Send</button></span></div>`;
}
function mgmtFeedback(idx,rating){
  const t=_mgmtHistory[idx]; if(!t) return;
  const id=`management_${idx}`; const ci=document.getElementById('fbi_'+id);
  const comment=ci?ci.value.trim():"";
  submitFeedback('management',t.q,t.a,rating,comment,t.engine||'');
  window._fbDone[id]=true; mgmtRenderThread();
}
async function submitFeedback(surface,q,a,rating,comment,engine){
  try{ await api2('/feedback',{method:'POST',body:JSON.stringify({surface,query:q,answer:a,rating,comment,engine})}); flash('Feedback recorded — thank you'); }
  catch(e){ flash('Could not save feedback: '+e.message); }
}
V.feedback=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="sec-h"><h1>Feedback</h1></div>
   <p class="muted" style="margin:-6px 0 14px">Feedback users have given on AI-generated answers. It is collected here and fed back into <b>every AI query</b> — recurring lessons are distilled into the prompt so answers keep improving.</p>
   <div id="fbSummary" class="muted">Loading…</div>
   <div style="display:flex;gap:8px;margin:12px 0"><select id="fbFilterR" onchange="loadFeedback()">
     <option value="">All ratings</option><option value="up">👍 Helpful</option><option value="down">👎 Not helpful</option></select></div>
   <div id="fbTable">Loading…</div>`;
  loadFeedback();
};
async function loadFeedback(){
  const sumH=document.getElementById("fbSummary"), tH=document.getElementById("fbTable"); if(!tH) return;
  const r=(document.getElementById("fbFilterR")||{}).value||"";
  let d; try{ d=await api2('/feedback'+(r?`?rating=${r}`:'')); }catch(e){ tH.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const s=d.summary;
  sumH.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap">
    <span class="demo-pill" style="background:#11261F;color:#fff">${s.total} total</span>
    <span class="demo-pill" style="background:#eaf6ee;color:#1A7F4B">👍 ${s.up}</span>
    <span class="demo-pill" style="background:#fdecea;color:#B22">👎 ${s.down}</span>
    <span class="demo-pill" style="background:#fff5e6;color:#9A6F18">${s.with_comment} with comment</span>
    <span class="demo-pill" style="background:#eef;color:#445">${s.used} incorporated</span></div>`;
  if(!d.items.length){ tH.innerHTML='<p class="muted">No feedback yet. Use 👍 / 👎 on any AI answer (e.g. in Management chat) and it will appear here.</p>'; return; }
  tH.innerHTML=`<table><tr><th>When</th><th>User</th><th>Surface</th><th>Rating</th><th>Question</th><th>Comment</th><th>Engine</th><th>Used</th></tr>
   ${d.items.map(it=>`<tr>
     <td style="white-space:nowrap">${esc((it.created_at||'').replace('T',' ').slice(0,16))}</td>
     <td>${esc(it.username||'')}</td><td>${esc(it.surface||'')}</td>
     <td>${it.rating==='up'?'👍':it.rating==='down'?'👎':'—'}</td>
     <td style="max-width:280px">${esc((it.query||'').slice(0,160))}</td>
     <td style="max-width:260px">${esc(it.comment||'')}</td>
     <td>${esc(it.engine||'')}</td>
     <td><button class="btn sm ${it.used?'':'ghost'}" onclick="fbToggleUsed(${it.id},${it.used?'false':'true'})">${it.used?'✓ used':'mark used'}</button></td>
   </tr>`).join("")}</table>`;
}
async function fbToggleUsed(id,val){ try{ await api2(`/feedback/${id}/used`,{method:'POST',body:JSON.stringify({used:val})}); loadFeedback(); }catch(e){ flash(e.message); } }
V.home=async()=>{
  const view=document.getElementById("view");
  // [theme, icon, title, subtitle, target view, accent]
  const TILES=[
    ["Assess","⚡","Assess a new vendor","Autonomous end-to-end assessment","proassess","#1A4D3C"],
    ["Assess","🗣️","Assess a new engagement","Conversational multi-agent review","assess","#1E3A5C"],
    ["Assess","💰","Perform financial DD","Financial health & distress check","fdd","#7A4F2E"],
    ["Assess","📜","Certifications & evidence","Document-backed assurance","artefacts","#2E4A5C"],
    ["Assess","🏢","Vendor register","Master data & vendor 360","vendors","#3D6B3D"],
    ["Assess","🔎","Review queue","Assessments awaiting sign-off","review","#2E4A5C"],
    ["Monitor & Manage","📈","Manage vendor performance","Scorecards & KPIs by period","performance","#2E6A4F"],
    ["Monitor & Manage","⚖","Manage contracts","Terms, gap review & documents","contracts","#5C3A6B"],
    ["Monitor & Manage","✅","Findings & action plans","Track remediation to closure","findings","#1A4D3C"],
    ["Monitor & Manage","⚠️","Issues log","Open issues & expiries","issues","#8A2E3B"],
    ["Monitor & Manage","🔗","Fourth-party register","Sub-processor concentration","fourthparties","#967037"],
    ["Monitor & Manage","🚪","Exit planning","Stressed-exit readiness (CMORG)","exit","#7A4F2E"],
    ["Monitor & Manage","🗞","Vendor reputation check","Adverse media & conduct signals","reputation","#8A2E3B"],
    ["Analyse","🛰️","PESTLE threat surface","150-dimension risk & knowledge graph","pestle","#0E7490"],
    ["Analyse","▦","Explore concentration","Supply-chain network & map","management","#1E3A5C"],
    ["Analyse","✦","Board intelligence","AI horizon scan & board actions","intel","#B8862B"],
    ["Understand","📊","Understand risk posture","Portfolio exposure at a glance","dashboard","#14302A"],
    ["Understand","🔐","Audit trail","Tamper-evident activity ledger","audit","#14302A"],
    ["Miscellaneous","🗂️","Documents","Evidence & document library","documents","#3D5A4A"],
    ["Miscellaneous","🎛️","Configuration","Rules, thresholds & cadence","config","#5C3A6B"],
  ];
  const role=(window._role||"").toLowerCase();
  const priv = /admin|manage|review|vrm|lead|exec|cro|ciso/.test(role) || role==="";
  // adapt tiles to privilege: governance/board tiles only for privileged roles
  const PRIV_ONLY=new Set(["intel","audit","management","review","config"]);
  const shownTiles = priv ? TILES : TILES.filter(t=>!PRIV_ONLY.has(t[4]));
  const THEMES=["Assess","Monitor & Manage","Analyse","Understand","Miscellaneous"];
  const themedHome = THEMES.map(theme=>{
    const ts=shownTiles.filter(t=>t[0]===theme); if(!ts.length) return "";
    return `<h2 class="home-theme-label">${esc(theme)}</h2>
      <div class="home-tiles">${ts.map(([_th,ic,t,sub,v,ac])=>`
        <button class="home-tile" onclick="goTo('${v}')" style="--ac:${ac}">
          <span class="ht-ico" style="background:${ac}">${ic}</span>
          <span class="ht-body"><span class="ht-title">${esc(t)}</span><span class="ht-sub">${esc(sub)}</span></span>
          <span class="ht-arrow">→</span>
        </button>`).join("")}</div>`;
  }).join("");
  const heroBlock = priv ? `
    <div class="card" style="max-width:1100px;margin:0 auto 22px;cursor:pointer" onclick="goTo('management')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div><div class="card-label" style="margin:0">Supply-chain concentration</div>
          <div class="muted" style="font-size:11px">Vendors · fourth parties · delivery locations — click to explore</div></div>
        <div class="conc-legend" style="font-size:11px">
          <span><i class="cdot" style="background:#2563EB"></i> Vendor</span>
          <span style="margin-left:8px"><i class="cdot" style="background:#7C3AED"></i> 4th party</span>
          <span style="margin-left:8px"><i class="cdot" style="background:#0E9F6E"></i> Location</span>
          <span style="margin-left:8px"><i class="cdot" style="background:#DC2626"></i> High concentration</span>
        </div>
      </div>
      <div id="concGraph" style="min-height:360px"><div class="muted">Loading supply-chain graph…</div></div>
    </div>` : "";
  view.innerHTML=`<div class="home-hero">
    <div class="home-mark">
      <div class="home-logo">B</div>
      <h1 class="home-word">Brata <span>· Third-Party Risk</span></h1>
      <p class="home-tag">What would you like to do?</p>
      <button class="demo-launch" onclick="openDemo()">▶ &nbsp;Watch the 60-second guided demo</button>
    </div>
    ${heroBlock}
    ${themedHome}
    <p class="home-foot">Enterprise third-party risk management · powered by Claude</p>
  </div>`;
  if(priv){ try{ const g=await api2("/management/concentration"); setTimeout(()=>{ try{ drawConcGraph(g); }catch(_){} }, 40); }catch(_){ const h=document.getElementById("concGraph"); if(h) h.innerHTML='<div class="muted">Supply-chain graph unavailable.</div>'; } }
};

/* ---------- AI research canvas (FDD / Reputation) — Claude searches, infers, organises ---------- */
function aiResearchPanel(el, mode){
  const idp = mode==="fdd" ? "fdd" : "rep";
  // resolve the Target entity entered ABOVE (the entity selector at the top of the view)
  const ep = entityPayload(idp);
  let name = ep.other_name || "";
  let vid = ep.vendor_id || "";
  if(vid){ const v=(_secEntities||[]).find(x=>x.vendor_id===vid); if(v) name=v.legal_name; }
  const title = mode==="fdd" ? "Financial Due Diligence — AI research" : "Reputation & ESG — AI research";
  const haveTarget = !!(name || vid);
  const targetLine = haveTarget
    ? `<div class="note ok" style="margin-bottom:10px">Target entity: <b>${esc(name||vid)}</b>${vid?` <span class="muted">· ${esc(vid)} — results link to this Vendor ID</span>`:' <span class="muted">· not registered</span>'}</div>`
    : `<div class="note warn" style="margin-bottom:10px">⚠ Select or type a <b>Target entity</b> in the box above, then run.</div>`;
  el.innerHTML=`<div class="card">
      <div class="card-label">🤖 ${title}</div>
      <p class="muted" style="font-size:12px;margin-bottom:10px">Claude searches the open internet, interprets the findings against the methodology, organises them, and presents a decision-ready result. The output is auto-filed as a report and indicators update across the platform. AI must be connected.</p>
      ${targetLine}
      <div class="field" style="max-width:260px"><label>Jurisdiction</label><select id="air_jur">${["UK","US","EU","Ireland","Switzerland","Canada","Australia","India","Singapore","UAE","Other"].map(j=>`<option>${j}</option>`).join("")}</select></div>
      <button class="btn" ${haveTarget?"":"disabled style=opacity:.5"} onclick="runAIResearch('${mode}')">🔍 Run AI research</button>
    </div>
    <div id="airOut" class="muted" style="margin-top:6px">Results appear here.</div>
    <div class="sec-h" style="margin-top:14px"><h2 style="font-size:13px">Past ${mode==='fdd'?'FDD':'Reputation'} reports</h2><div class="rule"></div></div>
    <div id="air_past" class="muted">Loading past reports…</div>`;
  loadPastReports(mode, vid);
}
async function loadPastReports(mode, vid){
  const el=document.getElementById("air_past"); if(!el) return;
  const purpose=mode==='fdd'?'fdd_report':'reputation_report';
  try{ const d=await api2(`/documents?purpose=${purpose}`+(vid?`&vendor_id=${vid}`:""));
    const rows=d.documents||[];
    el.innerHTML=rows.length?`<div class="card">${rows.slice(0,30).map(r=>`<div class="dossier-row"><span class="dk">${esc(r.vendor_name||r.filename)} <span class="muted">· ${(r.created_at||'').slice(0,10)}</span></span><span class="dv"><button class="btn sm ghost" onclick="openAiReport('${r.doc_id}')">Open</button></span></div>`).join("")}</div>`
      : '<span class="muted">No past reports yet.</span>';
  }catch(e){ el.innerHTML=`<span class="muted">${esc(e.message)}</span>`; }
}
async function runAIResearch(mode){
  const idp = mode==="fdd" ? "fdd" : "rep";
  const ep = entityPayload(idp);
  let company = ep.other_name || "";
  const vid = ep.vendor_id || null;
  if(vid){ const v=(_secEntities||[]).find(x=>x.vendor_id===vid); if(v) company=v.legal_name; }
  if(!company && !vid){ flash("Select or type a Target entity in the box above"); return; }
  const out=document.getElementById("airOut");
  const body={company:company||null,jurisdiction:val("air_jur"),vendor_id:vid};
  if(out) out.innerHTML=`<div class="card"><div class="pa-spin"></div> Claude is searching the web and organising the result… <span class="muted">(this continues on the server and is filed in AI Reports even if you navigate away)</span></div>`;
  let d; try{ d=await api2("/research/"+(mode==="fdd"?"fdd":"reputation"),{method:"POST",body:JSON.stringify(body)}); }
  catch(e){ const o=document.getElementById("airOut"); if(o) o.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const o=document.getElementById("airOut"); if(!o) return;  // user navigated away; report already filed server-side
  if(d.holding || d.available===false){ o.innerHTML=`<div class="note warn"><b>${esc(d.message||"AI engines not available yet.")}</b><br><span class="muted">${esc(d.limitations||"")}</span></div>`; return; }
  o.innerHTML=renderAIResult(d);
  loadPastReports(mode, vid);
}
function renderAIResult(d){
  const filed=d.filed_report?`<span class="tag" style="background:#e3efe6;color:#1A4D3C">Filed: ${esc(d.filed_report)}</span>`:"";
  const upd=(d.indicators_updated||[]).length?`<span class="tag" style="background:#e8eef6;color:#1E3A5C">Indicators updated: ${(d.indicators_updated||[]).join(", ")}</span>`:"";
  const ent=d.entity||{}; const fin=d.financials||{}; const figs=fin.figures||{};
  const rep=d.reputation||{};
  const figRows=Object.entries(figs).filter(([k,v])=>v!=null).map(([k,v])=>`<div class="dossier-row"><span class="dk">${esc(k)}</span><span class="dv">${esc(String(v))}</span></div>`).join("")||'<span class="muted">No figures returned.</span>';
  const sigs=(rep.signals||[]).map(x=>`<div class="note ${x.severity==='high'?'crit':'warn'}" style="margin-bottom:6px"><b>${esc(x.category||'')}</b> — ${esc(x.summary||'')} ${x.date?`<span class="muted">· ${esc(x.date)}</span>`:''}</div>`).join("");
  const srcs=(d.sources||[]).map(x=>`<li><a href="${esc(x.url||'#')}" target="_blank" rel="noopener">${esc(x.title||x.url||'source')}</a> <span class="muted">· ${esc(x.type||'')} ${x.date?'· '+esc(x.date):''}</span></li>`).join("");
  return `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${filed} ${upd}</div>
      <h2 style="font-size:15px;margin:0">${esc(ent.legalName||d.company||'Result')}</h2>
      ${d.summary?`<p style="margin:6px 0">${esc(d.summary)}</p>`:''}
      ${d.financial_health_band?`<div>Financial health: <span class="pill info">${esc(d.financial_health_band)}</span></div>`:''}
      ${rep.verdict?`<div style="margin-top:4px">Reputation verdict: <span class="pill ${rep.verdict==='Adverse'?'crit':rep.verdict==='Caution'?'warn':'ok'}">${esc(rep.verdict)}</span> ${rep.adverseMedia?'<span class="tag" style="background:#f6e2de;color:#8A2E3B">adverse media</span>':''} ${rep.sanctionsOrPEP?'<span class="tag" style="background:#f6e2de;color:#8A2E3B">sanctions/PEP</span>':''}</div>`:''}
    </div>
    ${Object.keys(figs).length?`<div class="sec-h"><h2 style="font-size:13px">Financials${fin.period?' · '+esc(fin.period):''}${fin.currency?' ('+esc(fin.currency)+'m)':''}</h2><div class="rule"></div></div><div class="card">${figRows}</div>`:''}
    ${sigs?`<div class="sec-h"><h2 style="font-size:13px">Reputation signals</h2><div class="rule"></div></div><div class="card">${sigs}</div>`:''}
    ${srcs?`<div class="sec-h"><h2 style="font-size:13px">Sources</h2><div class="rule"></div></div><div class="card"><ul style="margin:0 0 0 18px;font-size:12.5px;line-height:1.8">${srcs}</ul></div>`:''}
    ${d.raw?`<div class="card"><div class="card-label">Raw</div><pre style="white-space:pre-wrap;font-size:11px">${esc(d.raw)}</pre></div>`:''}`;
}

/* ---------- Methodology library (admin-only) ---------- */
V.methodology=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Methodology Library</h1>
    <div class="sub">Admin-only · the AI-driven TPRM assessment lifecycle methodology that BRO Chat &amp; ProAssess follow strictly</div></div>
    <button class="btn" onclick="methAdd()">+ Add methodology</button></div>
    <div id="methBody" class="muted">Loading…</div>`;
  let d; try{ d=await api2("/methodology/docs"); }catch(e){ document.getElementById("methBody").innerHTML=`<div class="err">${esc(e.message)} — admin only</div>`; return; }
  const note=d.has_methodology
    ? `<div class="note ok">An active methodology is loaded. BRO Chat &amp; ProAssess inject it into the AI and comply with it strictly.</div>`
    : `<div class="note warn">No methodology document loaded. In its absence, the AI is instructed to follow recognised industry best practice (PRA SS2/21, EBA, DORA, FSB, NIST) scrupulously.</div>`;
  document.getElementById("methBody").innerHTML=note+
    `<div class="card">${d.docs.length?d.docs.map(x=>`<div class="dossier-row">
      <span class="dk"><b>${esc(x.title)}</b> <span class="muted">· ${esc(x.doc_id)} · ${x.chars} chars ${x.active?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">active</span>':'<span class="tag">inactive</span>'}</span><br>
        <span class="muted" style="font-size:11px">${esc(x.preview||'')}</span></span>
      <span class="dv"><button class="btn sm ghost" onclick="methToggle('${x.doc_id}',${x.active?'false':'true'})">${x.active?'Deactivate':'Activate'}</button>
        <button class="btn sm ghost" onclick="methView('${x.doc_id}')">View</button>
        <button class="btn sm ghost" onclick="methDel('${x.doc_id}')">×</button></span></div>`).join(""):'<span class="muted">No methodology documents yet.</span>'}</div>`;
};
function methAdd(){
  modal(`<h3>Add methodology document</h3>
    <div class="field"><label>Title</label><input id="m_title" value="TPRM Assessment Lifecycle Methodology"></div>
    <div class="field"><label>Paste methodology text (Markdown/plain)</label><textarea id="m_text" rows="10" placeholder="Stage 1 — Context… Stage 2 — Inherent risk… scoring, thresholds, decisioning rules…"></textarea></div>
    <div class="field"><label>…or upload a .md/.txt file</label><input type="file" id="m_file" accept=".md,.txt,.markdown,text/plain"></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="methSave()">Save</button></div>`);
}
async function methSave(){
  const title=val("m_title"), text=val("m_text"); const f=document.getElementById("m_file").files[0];
  const send=async(content,b64)=>{ try{ await api2("/methodology/docs",{method:"POST",body:JSON.stringify(b64?{title,data_b64:b64,filename:f?f.name:""}:{title,content_text:content})}); closeModal(); flash("Methodology saved"); V.methodology(); }catch(e){ flash(e.message); } };
  if(f){ const r=new FileReader(); r.onload=()=>{ const b64=r.result.split(",")[1]; send(null,b64); }; r.readAsDataURL(f); }
  else if(text.trim()){ send(text); }
  else flash("Paste text or choose a file");
}
async function methToggle(id,active){ try{ await api2(`/methodology/docs/${id}/active`,{method:"POST",body:JSON.stringify({active})}); V.methodology(); }catch(e){ flash(e.message); } }
async function methDel(id){ if(!confirm("Delete this methodology document?"))return; try{ await api2(`/methodology/docs/${id}`,{method:"DELETE"}); V.methodology(); }catch(e){ flash(e.message); } }
async function methView(id){ try{ const d=await api2(`/methodology/docs/${id}`); modal(`<h3>${esc(d.title)}</h3><pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;font-size:12px">${esc(d.content_text)}</pre><div class="row"><button class="btn" onclick="closeModal()">Close</button></div>`); }catch(e){ flash(e.message); } }

/* ---------- search helpers (type-ahead filtering) ---------- */
function liveFilter(containerSel, rowSel, q){
  const c=document.querySelector(containerSel); if(!c) return;
  q=(q||'').trim().toLowerCase();
  c.querySelectorAll(rowSel).forEach(r=>{ r.style.display = (!q || r.textContent.toLowerCase().includes(q))?'':'none'; });
}
function fillDatalist(id, names){
  const dl=document.getElementById(id); if(!dl) return;
  dl.innerHTML=[...new Set((names||[]).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join("");
}

/* ---------- AI Reports + Documents ---------- */
const AI_PURPOSE_LABEL={fdd_report:"Financial DD",reputation_report:"Reputation",fdd_reputation_report:"FDD + Reputation",proassess_report:"ProAssess"};
async function openAiReport(docId){
  try{ const r=await fetch("/api/v2/documents/"+docId,{headers:{Authorization:"Bearer "+tok()}}); const txt=await r.text();
    let body; try{ const j=JSON.parse(txt); body=renderAIResult(j); }catch(_){ body=`<pre style="white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto">${esc(txt.slice(0,8000))}</pre>`; }
    modal(`<h3>AI Report · ${esc(docId)}</h3>${body}<div class="row"><button class="btn" onclick="closeModal()">Close</button></div>`);
  }catch(e){ flash(e.message); }
}
V.aireports=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>AI Reports</h1><div class="sub">Every AI-generated FDD, Reputation &amp; ProAssess report · auto-filed and tagged to the vendor</div></div></div>
    <div class="field" style="max-width:380px"><input id="air_filter" placeholder="Filter by vendor or type…" oninput="airFilter()"></div>
    <div id="aiReportsBody" class="muted">Loading…</div>`;
  let d; try{ d=await api2("/documents?ai_only=true"); }catch(e){ document.getElementById("aiReportsBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  window._aiReports=d.documents||[];
  airRender(window._aiReports);
};
function airRender(rows){
  const el=document.getElementById("aiReportsBody"); if(!el) return;
  if(!rows.length){ el.innerHTML=emptyBox("🤖","No AI reports yet","Run an FDD, Reputation Check or ProAssess and the report is filed here automatically."); return; }
  el.innerHTML=`<table><tr><th>Report</th><th>Type</th><th>Vendor</th><th>Created</th><th></th></tr>
    ${rows.map(r=>`<tr class="click" onclick="openAiReport('${r.doc_id}')">
      <td><b>${esc(r.filename||r.doc_id)}</b></td>
      <td><span class="tag">${esc(AI_PURPOSE_LABEL[r.purpose]||r.purpose)}</span></td>
      <td>${r.vendor_name?esc(r.vendor_name):'<span class="muted">—</span>'}</td>
      <td class="muted">${(r.created_at||'').slice(0,10)}</td>
      <td><button class="btn sm ghost" onclick="event.stopPropagation();openAiReport('${r.doc_id}')">Open</button></td></tr>`).join("")}</table>`;
}
function airFilter(){ const q=(val("air_filter")||"").toLowerCase(); airRender((window._aiReports||[]).filter(r=>((r.vendor_name||'')+' '+(AI_PURPOSE_LABEL[r.purpose]||r.purpose)+' '+(r.filename||'')).toLowerCase().includes(q))); }

V.documents=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Documents</h1><div class="sub">All stored documents — contracts, certificates, evidence &amp; AI reports</div></div>
    <button class="btn" onclick="docUpload()">⬆ Upload document</button></div>
    <div class="field" style="max-width:380px"><input id="doc_filter" placeholder="Filter by name, vendor or purpose…" oninput="docFilter()"></div>
    <div id="docsBody" class="muted">Loading…</div>`;
  let d; try{ d=await api2("/documents"); }catch(e){ document.getElementById("docsBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  window._allDocs=d.documents||[];
  docRender(window._allDocs);
};
function docRender(rows){
  const el=document.getElementById("docsBody"); if(!el) return;
  if(!rows.length){ el.innerHTML=emptyBox("🗂️","No documents","Documents appear here as they are uploaded or generated."); return; }
  el.innerHTML=`<table><tr><th>Document</th><th>Purpose</th><th>Vendor</th><th>By</th><th>Created</th><th></th></tr>
    ${rows.map(r=>`<tr>
      <td><b>${esc(r.filename||r.doc_id)}</b></td>
      <td><span class="tag">${esc(r.purpose||'—')}</span></td>
      <td>${r.vendor_name?esc(r.vendor_name):'<span class="muted">—</span>'}</td>
      <td class="muted">${esc(r.uploaded_by||'')}</td>
      <td class="muted">${(r.created_at||'').slice(0,10)}</td>
      <td>${r.is_ai_report?`<button class="btn sm ghost" onclick="openAiReport('${r.doc_id}')">View</button>`:`<a class="btn sm ghost" href="/api/v2/documents/${r.doc_id}" target="_blank" rel="noopener">Fetch</a>`}</td></tr>`).join("")}</table>`;
}
function docFilter(){ const q=(val("doc_filter")||"").toLowerCase(); docRender((window._allDocs||[]).filter(r=>((r.vendor_name||'')+' '+(r.purpose||'')+' '+(r.filename||'')+' '+(r.uploaded_by||'')).toLowerCase().includes(q))); }
async function docUpload(){
  let vendors=[]; try{ vendors=await api2('/vendors'); }catch(e){}
  modal(`<h3>Upload document</h3>
    <div class="field"><label>Files</label><input id="du_files" type="file" multiple></div>
    <div class="row"><div class="field" style="flex:1"><label>Vendor (optional)</label><select id="du_v"><option value="">—</option>${vendors.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name||v.vendor_id)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1"><label>Engagement ID (optional)</label><input id="du_eng" placeholder="ENG-…"></div></div>
    <div class="field"><label>Purpose</label><select id="du_purpose"><option value="evidence">Evidence</option><option value="contract">Contract</option><option value="certificate">Certificate</option><option value="report">Report</option><option value="other">Other</option></select></div>
    <div id="du_res" class="muted" style="font-size:12px"></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="docDoUpload()">Upload</button></div>`);
}
async function docDoUpload(){
  const inp=document.getElementById('du_files'); const res=document.getElementById('du_res');
  if(!inp||!inp.files.length){ res.innerHTML='<span class="err">Choose at least one file.</span>'; return; }
  res.textContent='Reading files…';
  const files=[];
  for(const f of inp.files){
    const b64=await new Promise((ok,err)=>{ const r=new FileReader(); r.onload=()=>ok(String(r.result).split(',')[1]); r.onerror=()=>err(new Error('read failed')); r.readAsDataURL(f); });
    files.push({filename:f.name, content_type:f.type||'application/octet-stream', data_b64:b64});
  }
  res.textContent='Uploading…';
  try{ const r=await api2('/documents/upload',{method:'POST',body:JSON.stringify({files, vendor_id:val('du_v')||null, engagement_id:val('du_eng')||null, purpose:val('du_purpose')})});
    flash('Uploaded '+r.documents.length+' document(s)'); closeModal(); V.documents();
  }catch(e){ res.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}

/* ---------- Exit Planning (vendor-level, CMORG-aligned) ---------- */
const EXIT_BAND={GREEN:"#1A4D3C",AMBER:"#B8862B",RED:"#8A2E3B"};
V.exit=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Exit Planning</h1><div class="sub">Vendor-level exit strategy &amp; stressed-exit readiness · CMORG-aligned</div></div>
    <button class="btn ghost" onclick="exitScan()">⟳ Scan triggers</button></div>
    <div id="exitBody" class="muted">Loading…</div>`;
  let d; try{ d=await api2("/exit/portfolio"); }catch(e){ document.getElementById("exitBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const c=d.counts||{};
  const card=(n,l,col)=>`<div class="card" style="text-align:center"><div style="font-family:Fraunces,serif;font-size:30px;color:${col}">${n}</div><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${l}</div></div>`;
  const gap=(title,rows,render)=>`<div class="sec-h"><h2 style="font-size:13px">${title} (${rows.length})</h2><div class="rule"></div></div>
    <div class="card">${rows.length?rows.map(render).join(""):'<span class="muted">None</span>'}</div>`;
  document.getElementById("exitBody").innerHTML=`
    <div class="grid g4">
      ${card(d.total_plans,"Plans","#14302A")}
      ${card(c.GREEN||0,"Ready","#1A4D3C")}
      ${card(c.AMBER||0,"Developing","#B8862B")}
      ${card(c.RED||0,"Not ready","#8A2E3B")}
    </div>
    ${gap("⚠ Critical vendors with no exit plan", d.gaps.missing_critical, r=>`<div class="dossier-row"><span class="dk">${esc(r.vendor_name)}</span><span class="dv"><button class="btn sm" onclick="openExitPlan('${r.vendor_id}')">Create plan</button></span></div>`)}
    ${gap("⚠ Critical vendors with no tested plan", d.gaps.untested_critical, r=>`<div class="dossier-row"><span class="dk">${esc(r.vendor_name)}</span><span class="dv"><button class="btn sm ghost" onclick="openExitPlan('${r.vendor_id}')">Open</button></span></div>`)}
    ${gap("🔔 Vendors with a live exit trigger", d.gaps.triggered, r=>`<div class="dossier-row"><span class="dk">${esc(r.vendor_name)} <span class="tag" style="background:#f6e2de;color:#8A2E3B">${r.open_triggers} trigger(s)</span></span><span class="dv"><button class="btn sm ghost" onclick="openExitPlan('${r.vendor_id}')">Open</button></span></div>`)}
    <div class="sec-h"><h2 style="font-size:13px">All exit plans</h2><div class="rule"></div></div>
    <table><tr><th>Vendor</th><th>Critical</th><th>Readiness</th><th>Score</th><th>Status</th><th>Triggers</th></tr>
      ${d.rows.map(r=>`<tr class="click" onclick="openExitPlan('${r.vendor_id}')">
        <td><b>${esc(r.vendor_name)}</b></td><td>${r.is_critical?'★':''}</td>
        <td><span class="pill" style="background:${EXIT_BAND[r.band]};color:#fff">${r.band}</span></td>
        <td>${r.score}</td><td>${esc(r.status)}</td><td>${r.open_triggers||''}</td></tr>`).join("")}</table>`;
};
async function exitScan(){ try{ const r=await api2("/exit/triggers/scan",{method:"POST",body:"{}"}); flash(`${r.fired} trigger(s) raised`); V.exit(); }catch(e){ flash(e.message); } }

let _exId=null,_exD=null;
const _exSub='font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-top:8px';
async function exitAiDraft(){
  const o=document.getElementById("exDraft"); if(!o) return;
  o.innerHTML='<div class="card muted">Viny is drafting an exit plan from your organisation data…</div>';
  let r; try{ r=await api2("/exit/plan/"+_exId+"/ai-draft",{method:"POST",body:"{}"}); }
  catch(e){ o.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const d=r.draft||{};
  const setv=(id,v)=>{const el=document.getElementById(id); if(el&&v!=null&&v!=="") el.value=v;};
  setv("ex_strategy",d.strategy_type); setv("ex_window",d.target_window);
  setv("ex_rationale",d.rationale); setv("ex_impact",d.impact_summary);
  setv("ex_data",d.data_plan); setv("ex_comms",d.comms_plan);
  window._exDraftSteps=d.steps||[]; window._exDraftAlts=d.alternatives||[];
  const badge=r.engine==="ai"?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">AI · web-enriched</span>':'<span class="tag" style="background:#eee4d4;color:#B8862B">deterministic draft</span>';
  o.innerHTML=`<div class="card" style="border-left:4px solid #1F3A52">
    <div class="card-label">✦ Drafted by Viny ${badge}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 6px">Strategy, window, rationale, impact, data &amp; comms have been filled into the form below — review and <b>Save</b>. Proposed transition steps and alternatives:</p>
    <div style="${_exSub}">Transition steps (${(d.steps||[]).length})</div>
    <ol style="margin:4px 0 6px;padding-left:18px;font-size:12.5px">${(d.steps||[]).map(s=>`<li>${esc(s.description)} <span class="muted">· ${esc(s.owner||'')} · ${s.duration_days??'?'}d${s.rto&&s.rto!=='—'?' · RTO '+esc(s.rto):''}</span></li>`).join("")}</ol>
    ${(d.alternatives||[]).length?`<div style="${_exSub}">Suggested alternatives</div><ul style="margin:4px 0 6px;padding-left:18px;font-size:12.5px">${d.alternatives.map(a=>`<li>${esc(a.name)} <span class="muted">· lead ${a.lead_time_days??'?'}d · viability ${a.viability??'?'}/5${a.note?' · '+esc(a.note):''}</span></li>`).join("")}</ul>`:''}
    ${(r.sources||[]).length?`<div style="${_exSub}">Public sources</div><ul style="margin:4px 0 6px;padding-left:18px;font-size:12px">${r.sources.map(x=>`<li class="muted">${esc(x)}</li>`).join("")}</ul>`:''}
    <button class="btn sm" onclick="exitApplyDraftChildren()">Add steps &amp; alternatives to plan</button>
    <span class="muted" style="font-size:11px;margin-left:8px">then Save to persist the plan fields</span>
  </div>`;
  flash(`Viny drafted the plan (${r.engine==='ai'?'web-enriched':'from your data'}) — review and Save`);
}
async function exitApplyDraftChildren(){
  const steps=window._exDraftSteps||[], alts=window._exDraftAlts||[];
  try{
    for(const st of steps){ await api2("/exit/plan/"+_exId+"/child",{method:"POST",body:JSON.stringify({kind:"step",description:st.description,owner:st.owner||"",duration_days:st.duration_days||null,rto:st.rto||"",rpo:st.rpo||""})}); }
    for(const a of alts){ if(a.name && !/to identify|to be identified/i.test(a.name)) await api2("/exit/plan/"+_exId+"/child",{method:"POST",body:JSON.stringify({kind:"alternative",name:a.name,prequalified:!!a.prequalified,lead_time_days:a.lead_time_days||null,viability:a.viability||3,note:a.note||""})}); }
    flash("Added to plan"); openExitPlan(_exId);
  }catch(e){ flash(e.message); }
}
async function openExitPlan(vid){ _exId=vid; try{ _exD=await api2("/exit/plan/"+vid); }catch(e){ flash(e.message); return; } renderExitPlan(); }
function renderExitPlan(){
  const d=_exD, p=d.plan, r=d.readiness, view=document.getElementById("view");
  const opt=(v,list)=>list.map(([k,l])=>`<option value="${k}" ${p[v]===k?'selected':''}>${l}</option>`).join("");
  const comp=Object.entries(r.components||{}).map(([k,v])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="text-transform:capitalize">${k.replace(/_/g,' ')}</span><b>${v}</b></div>`).join("");
  const ro=d.rollup||{};
  view.innerHTML=`<div class="top"><div><h1>Exit Strategy — ${esc(d.vendor_name)}</h1>
    <div class="sub">${esc(d.vendor_id)} ${d.is_critical?'· ★ critical':''} · ${esc(p.plan_id)} · CMORG-aligned</div></div>
    <div><button class="btn ghost" onclick="V.exit()">← Exit Planning</button> <button class="btn" style="background:#1F3A52" onclick="exitAiDraft()">✦ Draft by AI (Viny)</button> <button class="btn" onclick="saveExitPlan()">Save</button></div></div>
    <div id="exDraft"></div>
    ${(window._dumpSpecs=window._dumpSpecs||{},window._dumpSpecs.ex={context:"Vendor exit plan",fields:[
      {id:"ex_window",label:"Target window"},{id:"ex_rationale",label:"Rationale"},
      {id:"ex_impact",label:"Impact summary"},{id:"ex_data",label:"Data plan"},
      {id:"ex_comms",label:"Comms plan"}]},dumpBox('ex'))}
    <div class="grid g2">
      <div class="card">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="text-align:center"><div style="font-family:Fraunces,serif;font-size:40px;color:${EXIT_BAND[r.band]}">${r.score}</div>
            <span class="pill" style="background:${EXIT_BAND[r.band]};color:#fff">${r.band}</span><div class="muted" style="font-size:10px;margin-top:3px">Exit Readiness</div></div>
          <div style="flex:1">${comp}</div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${ro.engagement_exit_tested?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">eng. exit tested</span>':'<span class="tag">eng. exit not tested</span>'}
          ${ro.contract_exit_clause?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">contract exit clause</span>':'<span class="tag" style="background:#f6e2de;color:#8A2E3B">no exit clause</span>'}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm ghost" onclick="exitAttest()">Attest review</button>
          <button class="btn sm ghost" onclick="exitTest()">Log test</button>
          <button class="btn sm" style="background:#8A2E3B" onclick="exitInvoke()">Invoke exit</button>
        </div>
      </div>
      <div class="card">
        <div class="grid g2">
          <div class="field"><label>Exit mode</label><select id="ex_mode">${opt('exit_mode',[['planned','Planned'],['stressed','Stressed'],['both','Both']])}</select></div>
          <div class="field"><label>Strategy</label><select id="ex_strategy">${opt('strategy_type',[['alternative_provider','Alternative provider'],['insource','Insource'],['multi_source','Multi-source'],['run_off','Run-off'],['market_exit','Market exit']])}</select></div>
          <div class="field"><label>Status</label><select id="ex_status">${opt('status',[['draft','Draft'],['approved','Approved'],['invoked','Invoked'],['retired','Retired']])}</select></div>
          <div class="field"><label>Target window</label><input id="ex_window" value="${esc(p.target_window||'')}"></div>
          <div class="field"><label>Owner</label><input id="ex_owner" value="${esc(p.owner||'')}"></div>
          <div class="field"><label>Approver</label><input id="ex_approver" value="${esc(p.approver||'')}"></div>
        </div>
        <div class="field"><label>Rationale</label><textarea id="ex_rationale" rows="2">${esc(p.rationale||'')}</textarea></div>
        <div class="field"><label>Impact &amp; tolerance summary</label><textarea id="ex_impact" rows="2">${esc(p.impact_summary||'')}</textarea></div>
        <div class="field"><label>Data management plan</label><textarea id="ex_data" rows="2">${esc(p.data_plan||'')}</textarea></div>
        <div class="field"><label>Communications plan</label><textarea id="ex_comms" rows="2">${esc(p.comms_plan||'')}</textarea></div>
        <div class="grid g3"><div class="field"><label>One-off cost</label><input id="ex_oneoff" type="number" value="${p.one_off_cost??''}"></div>
          <div class="field"><label>Dual-running</label><input id="ex_dual" type="number" value="${p.dual_running_cost??''}"></div>
          <div class="field"><label>Penalties</label><input id="ex_pen" type="number" value="${p.penalty_cost??''}"></div></div>
      </div>
    </div>
    ${exChild("Alternative providers","alternative",d.alternatives,a=>`${esc(a.name)} ${a.prequalified?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">pre-qualified</span>':''} <span class="muted">· ${a.lead_time_days??'?'}d lead · viability ${a.viability}/5</span>`)}
    ${exChild("Transition plan steps","step",d.steps,x=>`<b>${x.seq}.</b> ${esc(x.description)} <span class="muted">· ${esc(x.owner||'')} · ${x.duration_days??'?'}d · RTO ${esc(x.rto||'—')} / RPO ${esc(x.rpo||'—')}</span>`)}
    ${exChild("Dependent business services (impact tolerance)","dependency",d.dependencies,x=>`${esc(x.service_name)} <span class="muted">· tolerance ${esc(x.impact_tolerance||'—')} · max ${esc(x.max_downtime||'—')} · ${esc(x.criticality)}</span>`)}
    <div class="sec-h"><h2 style="font-size:13px">Exit triggers (live)</h2><div class="rule"></div></div>
    <div class="card">${d.triggers.length?d.triggers.map(t=>`<div class="note ${t.severity==='high'?'crit':'warn'}" style="margin-bottom:6px"><b>${esc(t.category)}</b> — ${esc(t.detail)} <span class="muted">· ${esc(t.source)}</span></div>`).join(""):'<span class="muted">No live triggers.</span>'}</div>
    <div class="sec-h"><h2 style="font-size:13px">Testing &amp; exercising</h2><div class="rule"></div></div>
    <div class="card">${d.tests.length?d.tests.map(t=>`<div class="dossier-row"><span class="dk">${(t.test_date||'').slice(0,10)} · ${esc(t.method)} ${t.passed?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">passed</span>':'<span class="tag" style="background:#f6e2de;color:#8A2E3B">failed</span>'}</span><span class="dv muted">${esc(t.outcome||'')}</span></div>`).join(""):'<span class="muted">No tests logged. Next due: '+(p.next_test_due? p.next_test_due.slice(0,10):'—')+'</span>'}</div>`;
}
function exChild(title,kind,rows,render){
  return `<div class="sec-h"><h2 style="font-size:13px">${title} (${rows.length})</h2><div class="rule"></div></div>
    <div class="card">${rows.map(r=>`<div class="dossier-row"><span class="dk">${render(r)}</span><span class="dv"><button class="btn sm ghost" onclick="exDelChild('${kind}',${r.id})">×</button></span></div>`).join("")||'<span class="muted">None</span>'}
    <button class="btn ghost sm" style="margin-top:8px" onclick="exAddChild('${kind}')">+ Add</button></div>`;
}
async function saveExitPlan(){
  const body={exit_mode:val("ex_mode"),strategy_type:val("ex_strategy"),status:val("ex_status"),
    target_window:val("ex_window"),owner:val("ex_owner"),approver:val("ex_approver"),
    rationale:val("ex_rationale"),impact_summary:val("ex_impact"),data_plan:val("ex_data"),comms_plan:val("ex_comms"),
    one_off_cost:val("ex_oneoff")||null,dual_running_cost:val("ex_dual")||null,penalty_cost:val("ex_pen")||null};
  try{ _exD=await api2("/exit/plan/"+_exId,{method:"PUT",body:JSON.stringify(body)}); flash("Exit plan saved · readiness "+_exD.readiness.score); renderExitPlan(); }catch(e){ flash(e.message); }
}
function exAddChild(kind){
  const f={alternative:`<div class="field"><label>Provider name</label><input id="c_name"></div>
      <div class="grid g3"><div class="field"><label>Lead time (days)</label><input id="c_lead" type="number"></div>
      <div class="field"><label>Viability 1-5</label><input id="c_via" type="number" value="3"></div>
      <div class="field"><label><input type="checkbox" id="c_pq"> Pre-qualified</label></div></div>`,
    step:`<div class="field"><label>Description</label><input id="c_desc"></div>
      <div class="grid g3"><div class="field"><label>Owner</label><input id="c_owner"></div>
      <div class="field"><label>Duration (days)</label><input id="c_dur" type="number"></div>
      <div class="field"><label>RTO</label><input id="c_rto" placeholder="4h"></div></div>`,
    dependency:`<div class="field"><label>Business service</label><input id="c_svc"></div>
      <div class="grid g2"><div class="field"><label>Impact tolerance</label><input id="c_tol" placeholder="4 hours"></div>
      <div class="field"><label>Max downtime</label><input id="c_max" placeholder="4h"></div></div>`}[kind];
  modal(`<h3>Add ${kind}</h3>${f}<div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="exSaveChild('${kind}')">Add</button></div>`);
}
async function exSaveChild(kind){
  const b={kind};
  if(kind==='alternative'){ b.name=val("c_name"); b.lead_time_days=parseInt(val("c_lead"))||null; b.viability=parseInt(val("c_via"))||3; b.prequalified=document.getElementById("c_pq").checked; }
  else if(kind==='step'){ b.description=val("c_desc"); b.owner=val("c_owner"); b.duration_days=parseInt(val("c_dur"))||null; b.rto=val("c_rto"); }
  else { b.service_name=val("c_svc"); b.impact_tolerance=val("c_tol"); b.max_downtime=val("c_max"); }
  try{ _exD=await api2("/exit/plan/"+_exId+"/child",{method:"POST",body:JSON.stringify(b)}); closeModal(); renderExitPlan(); }catch(e){ flash(e.message); }
}
async function exDelChild(kind,cid){ try{ _exD=await api2(`/exit/plan/${_exId}/child/${kind}/${cid}`,{method:"DELETE"}); renderExitPlan(); }catch(e){ flash(e.message); } }
function exitTest(){
  modal(`<h3>Log exit test / exercise</h3>
    <div class="field"><label>Method</label><select id="t_method"><option value="tabletop">Tabletop</option><option value="walkthrough">Walkthrough</option><option value="live">Live</option></select></div>
    <div class="field"><label>Outcome</label><textarea id="t_out" rows="2"></textarea></div>
    <div class="field"><label>Lessons</label><input id="t_les"></div>
    <div class="field"><label><input type="checkbox" id="t_pass" checked> Passed</label></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="exSaveTest()">Log test</button></div>`);
}
async function exSaveTest(){
  try{ _exD=await api2("/exit/plan/"+_exId+"/test",{method:"POST",body:JSON.stringify({method:val("t_method"),outcome:val("t_out"),lessons:val("t_les"),passed:document.getElementById("t_pass").checked})});
    closeModal(); flash("Test logged · readiness "+_exD.readiness.score); renderExitPlan(); }catch(e){ flash(e.message); }
}
async function exitAttest(){ try{ _exD=await api2("/exit/plan/"+_exId+"/attest",{method:"POST",body:"{}"}); flash("Review attested"); renderExitPlan(); }catch(e){ flash(e.message); } }
function exitInvoke(){
  modal(`<h3>Invoke exit</h3><p class="muted" style="margin-bottom:10px">This hands execution to the offboarding workflow for every engagement with this vendor.</p>
    <div class="field"><label>Mode</label><select id="i_mode"><option value="planned">Planned</option><option value="stressed">Stressed</option></select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" style="background:#8A2E3B" onclick="exDoInvoke()">Invoke</button></div>`);
}
async function exDoInvoke(){
  try{ const r=await api2("/exit/plan/"+_exId+"/invoke",{method:"POST",body:JSON.stringify({mode:val("i_mode")})});
    closeModal(); flash(`Exit invoked · ${r.engagements} engagement(s) → ${r.offboarding_steps} offboarding steps`); openExitPlan(_exId); }catch(e){ flash(e.message); }
}

/* ---------- Dashboard ---------- */
V.aicontrol=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>AI Control</h1><div class="sub">Central registry of every AI-feature prompt — edits apply live across the platform</div></div></div>
    <div class="card" style="margin-bottom:12px;border-left:4px solid var(--gold)"><div style="font-size:12.5px;color:var(--mute);line-height:1.5">These are the system prompts behind each AI feature. Editing one <b>overrides the built-in default everywhere that feature runs</b>; Reset restores the default. Overrides persist in system configuration. <span class="muted">(ProAssess multi-agent stage prompts and the BRO assessment rubric are generated dynamically and are managed separately.)</span></div></div>
    <div id="aicbody" class="muted">Loading prompts…</div>`;
  try{
    const d=await api("/ai/prompts");
    window._aicData={}; (d.prompts||[]).forEach(p=>{window._aicData[p.key]=p;});
    const groups=(d.groups&&d.groups.length)?d.groups:[...new Set((d.prompts||[]).map(p=>p.group))];
    let h="";
    groups.forEach(g=>{
      const items=(d.prompts||[]).filter(p=>p.group===g);
      if(!items.length) return;
      h+=`<div class="sec-h" style="margin-top:16px"><h2>${esc(g)}</h2><div class="rule"></div></div>`+items.map(aicCard).join("");
    });
    document.getElementById("aicbody").innerHTML=h||'<div class="muted">No prompts registered.</div>';
  }catch(e){ document.getElementById("aicbody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function aicCard(p){
  return `<div class="card" id="aic_${p.key}" style="margin-bottom:10px">
    <div class="rev-row" style="align-items:flex-start">
      <span style="flex:1"><span style="font-weight:600">${esc(p.label)}</span>
        ${p.overridden?'<span class="tag" style="background:var(--gold);color:#241a0e;margin-left:6px">customised</span>':'<span class="tag" style="margin-left:6px">default</span>'}
        <div class="muted" style="font-size:12px;margin-top:3px">${esc(p.description)} · <code style="font-size:11px">${esc(p.key)}</code></div></span>
      <span style="white-space:nowrap"><button class="btn sm" onclick="aicEdit('${p.key}')">Edit</button>${p.overridden?` <button class="btn sm ghost" onclick="aicReset('${p.key}')">Reset</button>`:''}</span>
    </div>
    <pre class="aicp" style="white-space:pre-wrap;font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0 0;font-family:'JetBrains Mono',monospace;line-height:1.5">${esc(p.current)}</pre>
  </div>`;
}
function aicEdit(key){
  const p=window._aicData[key]; const card=document.getElementById("aic_"+key); if(!p||!card) return;
  const pre=card.querySelector(".aicp"); if(!pre) return;
  pre.outerHTML=`<textarea id="aict_${key}" rows="7" style="width:100%;box-sizing:border-box;margin-top:8px;font-size:12px;font-family:'JetBrains Mono',monospace;line-height:1.5;padding:10px;border:1px solid var(--accent);border-radius:8px">${esc(p.current)}</textarea>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="aicSave('${key}')">Save</button><button class="btn sm ghost" onclick="V.aicontrol()">Cancel</button>${p.overridden?`<button class="btn sm ghost" onclick="aicReset('${key}')">Reset to default</button>`:''}</div>`;
}
async function aicSave(key){
  const ta=document.getElementById("aict_"+key); if(!ta) return; const text=(ta.value||"").trim();
  if(!text){ flash("Prompt cannot be empty"); return; }
  try{ await api("/ai/prompts/"+encodeURIComponent(key),{method:"POST",body:JSON.stringify({text})});
    flash("Prompt saved — now live across the platform"); V.aicontrol();
  }catch(e){ flash("Save failed: "+e.message); }
}
async function aicReset(key){
  if(!confirm("Reset this prompt to the built-in default?")) return;
  try{ await api("/ai/prompts/"+encodeURIComponent(key)+"/reset",{method:"POST",body:"{}"});
    flash("Reset to default"); V.aicontrol();
  }catch(e){ flash("Reset failed: "+e.message); }
}
V.dashboard=async()=>{
  const view=document.getElementById("view");
  const LIFE=[
    {n:"01",t:"Intake & Onboarding",tag:"Register the third party and capture who you're really dealing with.",
     acts:["Create the vendor — auto Vendor &amp; Group IDs","Capture beneficial owners &amp; key people","Resolve the corporate / entity graph","Stand up the engagement &amp; inherent-risk questionnaire"],
     items:[["vendors","🏢","Vendor Register"],["proassess","⚡","ProAssess intake"],["entitygraph","🕸️","Entity Graph"],["documents","🗂️","Documents"]]},
    {n:"02",t:"Assessment & Due Diligence",tag:"Quantify inherent risk across every domain — deterministically.",
     acts:["Score the IRQ &amp; run the multi-domain assessment","Financial DD — 17 ratios + Altman Z′-score","Reputation, ESG, sanctions/AML &amp; adverse media","Open-source / SBOM exposure &amp; PESTLE intelligence"],
     items:[["assessments","🗂️","Assessments"],["fdd","💰","Financial DD"],["reputation","🗞","Reputation & Sanctions"],["oss","📦","Open Source / SBOM"],["pestle","🛰️","PESTLE Intel"],["criticality","⭐","Criticality Model"]]},
    {n:"03",t:"Challenge & Decision",tag:"Second-line challenge, validation and a defensible decision.",
     acts:["Route HIGH / ELEVATED to the review queue","Raise, own &amp; track findings","Approve, condition or decline the engagement","Record the governance decision &amp; rationale"],
     items:[["review","🔎","Review Queue"],["findings","✅","Findings"],["engagements","▦","Engagements"],["governance","§","Governance"]]},
    {n:"04",t:"Contracting & Evidence",tag:"Lock obligations, certifications and escrow.",
     acts:["Capture contract terms, SLAs &amp; obligations","Record source-code / continuity escrow","Track certifications &amp; evidence with auto-revalidation"],
     items:[["contracts","⚖","Contracts"],["artefacts","📜","Certifications"]]},
    {n:"05",t:"Continuous Monitoring",tag:"Watch the whole estate — automatically, on a schedule.",
     acts:["Vendor 360 — the single pane of truth","Scheduled sanctions re-screen &amp; feed ingestion","Performance scorecards &amp; SLA breaches","Incidents, 4th-party concentration &amp; geopolitical stress"],
     items:[["vendor360","◎","Vendor 360"],["performance","📈","Performance"],["slamgmt","📋","SLA Management"],["perfissues","⚠️","Performance Issues"],["issues","⚠️","Issues Log"],["incidents","🚨","Incidents"],["fourthparties","🔗","4th Parties"],["stressradar","📡","Stress Radar"]]},
    {n:"06",t:"Reassess & Remediate",tag:"Re-rate on a risk-based cadence, remediate, and model what-ifs.",
     acts:["Periodic reassessment on risk-based cadence","Drive remediation plans to closure","Scenario simulation &amp; business-unit exposure"],
     items:[["lifecycle","♻️","Lifecycle"],["remediation","🛠️","Remediation"],["scenario","🎯","Scenario Sim"],["exposure","🎯","BU Exposure"]]},
    {n:"07",t:"Exit & Offboarding",tag:"Offboard safely with a tested, evidenced exit plan.",
     acts:["Trigger &amp; execute the exit plan","Confirm data return / destruction &amp; access removal","Close obligations &amp; archive the evidence trail"],
     items:[["exit","🚪","Exit Planning"]]},
  ];
  window._LIFE=LIFE;
  const CROSS=[["intel","✦","Intelligence"],["boardpack","📑","Board / Regulator Pack"],["reports","📁","Reports"],["aireports","🤖","AI Reports"],["globalreg","🌐","Global Regulations"],["management","📊","Management"],["evidence","🛡️","Evidence on Demand"],["audit","🔒","Audit Trail"],["integrity","🩺","Data Integrity"],["geopolitical","🌍","Geopolitical"]];
  view.innerHTML=`<style id="dxStyle">
  .dxwrap{animation:fadeUp .5s ease both;max-width:1200px}
  .dxhero{position:relative;overflow:hidden;border-radius:20px;padding:42px 38px;color:#fff;background:linear-gradient(120deg,#0E2E22 0%,#1A4D3C 44%,#1F3A52 100%)}
  .dxhero::after{content:"";position:absolute;inset:0;background:radial-gradient(900px 320px at 82% -25%,rgba(201,155,95,.38),transparent 60%);pointer-events:none}
  .dxhero::before{content:"";position:absolute;top:-50%;left:-40%;width:55%;height:200%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.09),transparent);transform:rotate(8deg);animation:dxsheen 7.5s linear infinite}
  @keyframes dxsheen{0%{left:-45%}100%{left:130%}}
  .dxeye{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);position:relative;z-index:1}
  .dxhero h1{font-family:'Fraunces',serif;font-size:40px;line-height:1.06;margin:10px 0 10px;max-width:20ch;font-weight:600;position:relative;z-index:1}
  .dxhero p{max-width:56ch;color:rgba(255,255,255,.85);font-size:15px;margin:0 0 20px;position:relative;z-index:1}
  .dxcta{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
  .dxbtn{background:var(--gold);color:#241a0e;border:none;border-radius:11px;padding:12px 20px;font-weight:600;cursor:pointer;font-family:inherit;font-size:14px;transition:transform .2s,box-shadow .2s}
  .dxbtn.alt{background:rgba(255,255,255,.13);color:#fff;border:1px solid rgba(255,255,255,.28)}
  .dxbtn:hover{transform:translateY(-2px);box-shadow:0 9px 24px rgba(0,0,0,.28)}
  .dxstats{display:flex;gap:14px;flex-wrap:wrap;margin-top:26px;position:relative;z-index:1}
  .dxstat{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.17);border-radius:14px;padding:14px 18px;min-width:118px}
  .dxstat .v{font-family:'Fraunces',serif;font-size:30px;font-weight:600;line-height:1}
  .dxstat .l{font-size:11px;letter-spacing:.04em;color:rgba(255,255,255,.8);margin-top:5px}
  .dxsection{margin-top:32px}
  .dxlabel{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin-bottom:14px}
  .dxstages{position:relative}
  .dxstage{position:relative;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--paper);opacity:0;transform:translateY(22px);transition:opacity .6s cubic-bezier(.22,.61,.36,1),transform .6s cubic-bezier(.22,.61,.36,1),box-shadow .25s}
  .dxstage.in{opacity:1;transform:none}
  .dxstage:hover{box-shadow:0 10px 30px rgba(20,48,42,.10)}
  .dxband{display:flex;align-items:center;gap:18px;padding:18px 26px;color:#fff;background:linear-gradient(115deg,var(--c),rgba(0,0,0,.34))}
  .dxbn{font-family:'Fraunces',serif;font-size:34px;font-weight:600;line-height:1;opacity:.92;min-width:42px}
  .dxbt h3{font-family:'Fraunces',serif;font-size:21px;margin:0;color:#fff}
  .dxbt p{margin:3px 0 0;font-size:13px;color:rgba(255,255,255,.87)}
  .dxbody{padding:24px 26px}
  .dxsep{height:26px;width:3px;margin:2px auto;border-radius:2px;background:linear-gradient(180deg,var(--gold),transparent)}
  .dxgrid2{display:grid;grid-template-columns:1fr 1.25fr;gap:26px}
  @media(max-width:820px){.dxgrid2{grid-template-columns:1fr}.dxhero h1{font-size:30px}}
  .dxsub{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);margin-bottom:10px}
  .dxacts ul{margin:0;padding:0;list-style:none}
  .dxacts li{padding:8px 0 8px 22px;position:relative;font-size:13.5px;color:var(--ink);border-bottom:1px dashed var(--line)}
  .dxacts li::before{content:"";position:absolute;left:1px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--gold)}
  .dxcaps{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}
  .dxcap{display:flex;align-items:center;gap:11px;text-align:left;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:13px 14px;cursor:pointer;font-family:inherit;transition:all .2s cubic-bezier(.22,.61,.36,1)}
  .dxcap:hover{border-color:var(--accent);transform:translateX(3px);box-shadow:0 7px 18px rgba(20,48,42,.13)}
  .dxcap .ic{font-size:18px}
  .dxcap .cl{flex:1;font-size:13px;font-weight:600;color:var(--ink)}
  .dxcap .ar{color:var(--gold);font-weight:700;transition:transform .2s}
  .dxcap:hover .ar{transform:translateX(4px)}
  .dxcross{display:flex;flex-wrap:wrap;gap:10px}
  .dxchip{display:flex;align-items:center;gap:8px;background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:9px 16px;cursor:pointer;font-size:13px;color:var(--ink);font-family:inherit;transition:all .2s}
  .dxchip:hover{background:#fff;border-color:var(--gold);transform:translateY(-2px);box-shadow:0 5px 14px rgba(20,48,42,.1)}
  .dxlive{display:flex;flex-wrap:wrap;gap:12px}
  .dxlc{flex:1 1 150px;border:1px solid var(--line);border-radius:14px;padding:16px 18px;background:var(--paper)}
  .dxlc .v{font-family:'Fraunces',serif;font-size:25px;font-weight:600;color:var(--accent)}
  .dxlc .l{font-size:12px;color:var(--mute);margin-top:4px}
  .dxlc.crit .v{color:var(--rust)}
  </style>
  <div class="dxwrap">
    <div class="dxhero">
      <div class="dxeye">Brata · Enterprise TPRM · powered by Claude</div>
      <h1>Third-party risk, managed end to end.</h1>
      <p>One connected platform that carries every supplier from first contact to safe exit — intake, due diligence, decision, contracting, continuous monitoring, reassessment and offboarding — with the intelligence and evidence to prove it.</p>
      <div class="dxcta">
        <button class="dxbtn" onclick="go('vendors')">Onboard a vendor →</button>
        <button class="dxbtn alt" onclick="go('proassess')">Run an assessment</button>
        <button class="dxbtn alt" onclick="go('guideddemo')">Guided tour</button>
      </div>
      <div class="dxstats">
        <div class="dxstat"><div class="v" id="dx_vendors">0</div><div class="l">Vendors</div></div>
        <div class="dxstat"><div class="v" id="dx_eng">0</div><div class="l">Engagements</div></div>
        <div class="dxstat"><div class="v" id="dx_crit">0</div><div class="l">Critical vendors</div></div>
        <div class="dxstat"><div class="v" id="dx_find">0</div><div class="l">Open findings</div></div>
      </div>
    </div>
    <div class="dxsection">
      <div class="dxlabel">The end-to-end lifecycle — scroll the journey</div>
      <div id="dxstages"></div>
    </div>
    <div class="dxsection">
      <div class="dxlabel">Always-on intelligence &amp; oversight — across every stage</div>
      <div class="dxcross">${CROSS.map(c=>`<button class="dxchip" onclick="go('${c[0]}')"><span>${c[1]}</span><span>${esc(c[2])}</span></button>`).join("")}</div>
    </div>
    <div class="dxsection">
      <div class="dxlabel">Live in your estate</div>
      <div id="dxlive" class="dxlive muted">Loading…</div>
    </div>
  </div>`;
  const COL=["#1A4D3C","#0E6E45","#1F3A52","#9A6E1E","#2E7D4F","#C97A1A","#B23A2F"];
  document.getElementById("dxstages").innerHTML=LIFE.map((s,i)=>`
    <section class="dxstage" style="--c:${COL[i]}">
      <div class="dxband"><span class="dxbn">${s.n}</span><div class="dxbt"><h3>${esc(s.t)}</h3><p>${s.tag}</p></div></div>
      <div class="dxbody"><div class="dxgrid2">
        <div class="dxacts"><div class="dxsub">Activities</div><ul>${s.acts.map(a=>`<li>${a}</li>`).join("")}</ul></div>
        <div><div class="dxsub">Solution menu — open any tool</div>
          <div class="dxcaps">${s.items.map(it=>`<button class="dxcap" onclick="go('${it[0]}')"><span class="ic">${it[1]}</span><span class="cl">${esc(it[2])}</span><span class="ar">→</span></button>`).join("")}</div></div>
      </div></div>
    </section>`).join('<div class="dxsep"></div>');
  // reveal each stage as it scrolls into view (robust to fast jumps)
  window._dxReveal=function(){
    const stages=document.querySelectorAll(".dxstage:not(.in)");
    if(!document.getElementById("dxstages")){ window.removeEventListener("scroll",window._dxReveal); return; }
    const h=window.innerHeight||800;
    stages.forEach(el=>{ if(el.getBoundingClientRect().top < h*0.9) el.classList.add("in"); });
  };
  window._dxReveal();
  window.addEventListener("scroll", window._dxReveal, {passive:true});
  setTimeout(window._dxReveal, 350);
  // live metrics
  try{
    const d=await api("/dashboard/executive");
    countUp("dx_vendors",d.vendors); countUp("dx_eng",d.engagements);
    countUp("dx_crit",d.critical_vendors); countUp("dx_find",d.open_findings);
    const rb=d.by_residual||{};
    const cards=[["Critical vendors",d.critical_vendors,d.critical_vendors?"crit":""],
                 ["Open findings",d.open_findings,d.open_findings?"crit":""],
                 ["Residual HIGH",rb.HIGH||0,(rb.HIGH?"crit":"")]];
    try{ const sc=await api2("/sanctions/summary"); const n=(sc.flagged||[]).length; cards.push(["Sanctions flags",n,n?"crit":""]); }catch(_e){}
    try{ const m=await api2("/monitoring/status"); cards.push(["Last monitoring",m.last_run?String(m.last_run).slice(0,10):"never run",""]); }catch(_e){}
    const el=document.getElementById("dxlive");
    if(el) el.innerHTML=cards.map(c=>`<div class="dxlc ${c[2]}"><div class="v">${esc(String(c[1]))}</div><div class="l">${esc(c[0])}</div></div>`).join("");
  }catch(e){ const el=document.getElementById("dxlive"); if(el) el.innerHTML=`<div class="muted">Live metrics unavailable.</div>`; }
};
window.countUp=function(id,to){ const el=document.getElementById(id); if(!el) return;
  to=+to||0; const start=performance.now(),dur=900;
  (function step(now){ const p=Math.min(1,(now-start)/dur); el.textContent=Math.round((p*(2-p))*to);
    if(p<1) requestAnimationFrame(step); })(performance.now());
};

/* ---------- Vendors ---------- */
async function importVendorsCsv(inp){
  const f=inp.files&&inp.files[0]; if(!f) return; inp.value="";
  const send=async(mode)=>{ const fd=new FormData(); fd.append("file",f); fd.append("mode",mode);
    const h={}; if(tok()) h["Authorization"]="Bearer "+tok();
    const r=await fetch("/api/v2/vendors/import",{method:"POST",headers:h,body:fd});
    const j=await r.json(); if(!r.ok) throw new Error(j.detail||"import failed"); return j; };
  try{
    const p=await send("preview");
    const errTxt=p.errors.length?` ${p.errors.length} row(s) skipped (e.g. row ${p.errors[0].row}: ${p.errors[0].error}).`:"";
    if(!p.valid){ flash("No importable rows."+errTxt); return; }
    if(!confirm(`Import ${p.valid} vendor(s) from ${p.total_rows} row(s)?${errTxt}`)) return;
    const c=await send("commit");
    flash(`Imported ${c.created.length} vendor(s)`); V.vendors();
  }catch(e){ flash(e.message); }
}
/* ============ v4.2: global search + ecosystem ============ */
let _gsT=null;
const _PAGE_INDEX=[["dashboard","Dashboard"],["vendors","Vendor Register"],["engagements","Engagements"],
 ["proassess","ProAssess"],["assessments","Assessments"],["findings","Findings"],["remediation","Remediation"],
 ["contracts","Contracts"],["fdd","Financial Due Diligence"],["monitoring","Monitoring"],["incidents","Incidents"],
 ["exit","Exit Planning"],["scenario","Scenario Simulator"],["fourthparties","Fourth Parties"],["oss","OSS Register"],
 ["performance","Performance"],["boardpack","Board Pack"],["aicontrol","AI Control"],["schedules","Schedules"],
 ["connections","Connections"],["notifications","Notifications"],["audit","Audit Trail"],["admin","Admin"]];
function gSearch(q){
  clearTimeout(_gsT);
  const box=document.getElementById("gsResults");
  if(!q||q.trim().length<2){ box.style.display="none"; return; }
  _gsT=setTimeout(async()=>{
    let data={results:[]};
    try{ data=await api("/search?q="+encodeURIComponent(q.trim())); }catch(e){}
    const pages=_PAGE_INDEX.filter(p=>p[1].toLowerCase().includes(q.trim().toLowerCase()))
      .map(p=>({kind:"page",id:p[0],title:p[1],sub:"open page"}));
    const all=[...pages.slice(0,3),...data.results];
    const kc={vendor:"#1A4D3C",engagement:"#1F3A52",incident:"#8A2E3B",contract:"#7a5c1e",page:"#555"};
    box.innerHTML=all.length?all.map(r=>`<div class="gs-row" onclick='goRef(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
      <span class="gk" style="background:${kc[r.kind]||"#555"}">${r.kind}</span>
      <span style="min-width:0"><div class="gt">${esc(r.title||"")}</div><div class="gsub">${esc(r.sub||"")}</div></span></div>`).join("")
      :'<div class="gs-row"><span class="gsub">No matches in vendors, engagements, incidents, contracts or pages.</span></div>';
    box.style.display="block";
  },220);
}
document.addEventListener("click",e=>{ const w=document.getElementById("gsWrap");
  if(w && !w.contains(e.target)){ const b=document.getElementById("gsResults"); if(b) b.style.display="none"; }});
function goRef(r){
  const box=document.getElementById("gsResults"); if(box) box.style.display="none";
  const gs=document.getElementById("gs"); if(gs) gs.value="";
  const nav=k=>{ const a=document.querySelector(`#nav a[data-v='${k}']`); if(a) a.click(); else if(V[k]) V[k](); };
  if(r.kind==="vendor"){ nav("vendors"); setTimeout(()=>{ try{openVendorMaster(r.id);}catch(e){} },350); }
  else if(r.kind==="engagement"){ nav("engagements"); setTimeout(()=>flash("Filtered to "+r.id),500); }
  else if(r.kind==="incident"){ nav("incidents"); setTimeout(()=>{ try{ incOpen(r.id); }catch(e){} },500); }
  else if(r.kind==="contract"){ nav("contracts"); }
  else if(r.kind==="page"){ nav(r.id); }
}
function vlink(vid,name){ return `<a class="reclink" onclick="event.stopPropagation();goRef({kind:'vendor',id:'${vid}'})">${esc(name||vid)}</a>`; }

/* ============ Connections (API · Webhooks · MCP) ============ */
let _connTab="api";
V.connections=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Connections</h1><div class="sub">REST API · outbound webhooks · MCP servers — one integration surface</div></div></div>
    <div class="seg" style="margin-bottom:12px">
      <button class="${_connTab==='api'?'on':''}" onclick="connTab('api')">REST API</button>
      <button class="${_connTab==='webhooks'?'on':''}" onclick="connTab('webhooks')">Webhooks</button>
      <button class="${_connTab==='mcp'?'on':''}" onclick="connTab('mcp')">MCP</button></div>
    <div id="connBody" class="muted">Loading…</div>`;
  connRender();
};
function connTab(t){ _connTab=t; V.connections(); }
async function connRender(){
  const el=document.getElementById("connBody"); if(!el) return;
  if(_connTab==="api"){
    el.innerHTML=`<div class="card"><div class="card-label">REST API access</div>
      <p style="font-size:13px;margin:8px 0">Everything in this UI is the API — base path <code>/api/v1</code> and <code>/api/v2</code> on this host. Authenticate with <code>POST /api/v1/login</code> → Bearer token. Role permissions apply identically to API calls.</p>
      <table><tr><th>Area</th><th>Key endpoints</th></tr>
        <tr><td>Vendors</td><td><code>GET/POST /api/v2/vendors</code> · <code>POST /api/v2/vendors/import</code> (CSV)</td></tr>
        <tr><td>Engagements & assessments</td><td><code>/api/v2/engagements</code> · <code>/api/v2/proassess/*</code></td></tr>
        <tr><td>Monitoring & incidents</td><td><code>/api/v1/monitoring/*</code> · <code>/api/v2/incidents</code></td></tr>
        <tr><td>Exit planning</td><td><code>/api/v2/exit/*</code> incl. <code>/ai-draft</code> (Viny)</td></tr>
        <tr><td>Search & health</td><td><code>GET /api/v1/search?q=</code> · <code>GET /healthz</code> (version)</td></tr></table>
      <div style="margin-top:10px"><button class="btn sm ghost" onclick="connTestApi()">Test my token now</button> <span id="connApiOut" class="muted" style="font-size:12px"></span></div></div>`;
  } else if(_connTab==="webhooks"){
    let hooks=[]; try{ hooks=await api("/admin/webhooks"); }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
    el.innerHTML=`<div class="card"><div class="card-label">Outbound webhooks</div>
      <p class="muted" style="font-size:12px;margin:6px 0">POSTs platform events (assessments, alerts, decisions) to your endpoints — wire into ServiceNow, Slack, Teams or a SIEM.</p>
      ${hooks.length?`<table><tr><th>URL</th><th>Events</th><th></th></tr>${hooks.map(h=>`<tr><td><code style="font-size:11px">${esc(h.url)}</code></td><td class="muted">${esc((h.events||[]).join(", ")||"all")}</td><td><button class="btn sm ghost" style="color:var(--rust)" onclick="connDelHook(${h.id})">Remove</button></td></tr>`).join("")}</table>`:'<div class="muted" style="font-size:12px">No webhooks configured.</div>'}
      <div class="grid g2" style="gap:10px;margin-top:10px">
        <div class="field"><label>Endpoint URL</label><input id="wh_url" placeholder="https://hooks.example.com/brata"></div>
        <div class="field"><label>Events (comma-sep, blank = all)</label><input id="wh_ev" placeholder="assessment.completed, monitoring.alert"></div></div>
      <button class="btn sm" onclick="connAddHook()">Add webhook</button></div>
      <p class="muted" style="font-size:11px;margin-top:8px">Inbound webhooks also exist — e.g. <code>POST /api/v2/webhooks/rapidratings</code> receives financial-health pushes.</p>`;
  } else {
    let d={connections:[]}; try{ d=await api("/connections/mcp"); }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
    el.innerHTML=`<div class="card"><div class="card-label">MCP servers (Model Context Protocol)</div>
      <p class="muted" style="font-size:12px;margin:6px 0">Register MCP servers so AI assistants (Claude, internal copilots) can act on Brata data through governed tools. Entries here are configuration — connectivity is exercised by the consuming assistant, not tested from this page.</p>
      ${d.connections.length?`<table><tr><th>Name</th><th>URL</th><th>Transport</th><th>Status</th><th></th></tr>${d.connections.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td><code style="font-size:11px">${esc(c.url)}</code></td><td>${esc(c.transport||"sse")}</td><td><span class="tag">${esc(c.status||"configured")}</span></td><td><button class="btn sm ghost" style="color:var(--rust)" onclick="connDelMcp('${esc(c.name)}')">Remove</button></td></tr>`).join("")}</table>`:'<div class="muted" style="font-size:12px">No MCP servers registered.</div>'}
      <div class="grid g2" style="gap:10px;margin-top:10px">
        <div class="field"><label>Name</label><input id="mcp_name" placeholder="brata-tprm"></div>
        <div class="field"><label>Server URL</label><input id="mcp_url" placeholder="https://mcp.yourhost.com/sse"></div></div>
      <button class="btn sm" onclick="connAddMcp()">Register MCP server</button></div>`;
  }
}
async function connTestApi(){ const o=document.getElementById("connApiOut");
  try{ const h=await fetch("/healthz").then(r=>r.json()); const me=await api("/me");
    o.innerHTML=`<span style="color:var(--moss)">✓ v${h.version} · authenticated as ${esc(me.username)} (${esc(me.role)})</span>`;
  }catch(e){ o.textContent="✗ "+e.message; } }
async function connAddHook(){ try{ await api("/admin/webhooks",{method:"POST",body:JSON.stringify({url:val("wh_url"),events:val("wh_ev")?val("wh_ev").split(",").map(x=>x.trim()):[]})}); flash("Webhook added"); connRender(); }catch(e){ flash(e.message); } }
async function connDelHook(id){ try{ await fetch("/api/v1/admin/webhooks/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+tok()}}); flash("Removed"); connRender(); }catch(e){ flash(e.message); } }
async function connAddMcp(){ try{ await api("/connections/mcp",{method:"POST",body:JSON.stringify({name:val("mcp_name"),url:val("mcp_url")})}); flash("MCP server registered"); connRender(); }catch(e){ flash(e.message); } }
async function connDelMcp(n){ try{ await api("/connections/mcp/"+encodeURIComponent(n)+"/delete",{method:"POST",body:"{}"}); flash("Removed"); connRender(); }catch(e){ flash(e.message); } }

/* ============ Schedules ============ */
V.schedules=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Schedules</h1><div class="sub">Every scheduled sweep — cadence, engine and status in one place</div></div></div>
    <div id="schBody" class="muted">Loading…</div>`;
  let d; try{ d=await api("/schedules"); }catch(e){ document.getElementById("schBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  document.getElementById("schBody").innerHTML=`
    <div class="card" style="margin-bottom:10px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="tag" style="${d.scheduler_running?'background:#e3efe6;color:var(--moss)':'background:#f3e7cf;color:#8a6116'}">${d.scheduler_running?'in-process scheduler RUNNING':'in-process scheduler OFF (set BRO_SCHEDULER_ENABLED=1, or use Render Cron)'}</span>
      ${d.monitoring_last_run?`<span class="muted" style="font-size:12px">last monitoring run: ${esc(d.monitoring_last_run)}</span>`:''}</div></div>
    <table><tr><th>Sweep</th><th>What it does</th><th>Engine</th><th>Cadence (h)</th><th>Enabled</th></tr>
    ${d.schedules.map(x=>`<tr><td><b>${esc(x.label)}</b></td><td class="muted" style="font-size:12px">${esc(x.what)}</td>
      <td class="muted" style="font-size:11px">${esc(x.engine)}</td>
      <td><input type="number" min="1" value="${x.cadence_hours}" style="max-width:80px" onchange="schSet('${x.id}',{cadence_hours:this.value})"></td>
      <td><input type="checkbox" ${x.enabled?'checked':''} onchange="schSet('${x.id}',{enabled:this.checked})" style="width:auto"></td></tr>`).join("")}</table>
    <p class="muted" style="font-size:11.5px;margin-top:10px">Honest note: the in-process scheduler executes the <b>monitoring sweep</b> today; the other sweeps run on demand from their pages — toggles here record the intended cadence (picked up as those sweeps move onto the scheduler / Render Cron).</p>`;
};
async function schSet(id,body){ try{ await api("/schedules/"+id,{method:"POST",body:JSON.stringify(body)}); flash("Schedule updated"); }catch(e){ flash(e.message); V.schedules(); } }

/* ============ Dump to Draft ============ */
function dumpBox(specId){
  return `<div class="card" style="margin-bottom:12px;background:linear-gradient(135deg,#f5f1e8,#fff);border:1px dashed #B8862B">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b style="font-size:13px">📥 Dump to Draft</b>
      <span class="muted" style="font-size:12px">Upload any document(s) — AI reads them and fills every feasible field below.</span>
      <input id="${specId}_files" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json" style="width:auto;flex:1;min-width:180px">
      <button class="btn sm" onclick="dumpToDraft('${specId}')">Read & fill</button>
      <span id="${specId}_out" class="muted" style="font-size:11.5px"></span></div></div>`;
}
async function dumpToDraft(specId){
  const spec=(window._dumpSpecs||{})[specId]; const inp=document.getElementById(specId+"_files");
  const out=document.getElementById(specId+"_out");
  if(!spec||!inp||!inp.files.length){ flash("Choose at least one document"); return; }
  out.textContent="Reading documents…";
  const fd=new FormData();
  for(const f of inp.files) fd.append("files",f);
  fd.append("fields",JSON.stringify(spec.fields)); fd.append("context",spec.context||"");
  try{
    const h={}; if(tok()) h["Authorization"]="Bearer "+tok();
    const r=await fetch("/api/v1/ai/dump-to-draft",{method:"POST",headers:h,body:fd});
    const j=await r.json(); if(!r.ok) throw new Error(j.detail||"failed");
    let n=0;
    for(const [k,v] of Object.entries(j.values||{})){ const el=document.getElementById(k);
      if(el&&v!=null&&v!==""){ el.value=v; el.style.background="#f3ecd9"; n++; } }
    out.innerHTML=`<span style="color:var(--moss)">✓ filled ${n}/${spec.fields.length} fields (${j.engine==="ai"?"AI":"offline label-matching"})</span>`;
    flash(n?`Drafted ${n} field(s) — review before saving`:"No confident matches found in the documents");
  }catch(e){ out.textContent="✗ "+e.message; }
}

/* ============ Auto slideshow demo ============ */
let _demoT=null,_demoI=0;
const _DEMO=[
 ["dashboard","One register, one truth","322 vendors, criticality, concentration and lifecycle state — the CRO view in one screen."],
 ["vendors","A living vendor register","Auto-IDs, grouping, tiering, CSV bulk import — and every record hyperlinked across the platform."],
 ["proassess","AI that does the assessment","ProAssess runs the full 8-stage methodology with 10 specialist agents — inherent to residual to decision."],
 ["fdd","Financial due diligence built in","Vera reads the accounts: 17 ratios, Altman Z′, distress signals — before they become supplier failures."],
 ["monitoring","Always-on monitoring","Scheduled sweeps re-screen the portfolio; alerts route to Notifications and management."],
 ["incidents","Incidents with teeth","SLA traffic lights, engagement auto-tagging — and notable events escalate straight to management."],
 ["exit","Exits you can actually execute","Viny drafts board-ready exit plans — strategy, stressed windows, data return — from your own data."],
 ["scenario","Stress the concentration","Simulate a critical-vendor outage and watch the 4th-party blast radius before regulators ask."],
 ["aicontrol","AI you can audit","Every prompt the platform uses is visible and editable here — governed AI, not a black box."],
 ["schedules","Operations on rails","Every sweep, its cadence and engine — one operational control surface."]];
function startAutoDemo(){
  stopAutoDemo(); _demoI=0; _demoStep();
  flash("Auto demo running — press Esc or ✕ to stop");
  document.addEventListener("keydown",_demoEsc);
}
function _demoEsc(e){ if(e.key==="Escape") stopAutoDemo(); }
function _demoStep(){
  const [v,t,b]=_DEMO[_demoI%_DEMO.length];
  const a=document.querySelector(`#nav a[data-v='${v}']`); if(a) a.click(); else if(V[v]) V[v]();
  document.querySelectorAll(".demo-cap").forEach(x=>x.remove());
  const d=document.createElement("div"); d.className="demo-cap";
  d.innerHTML=`<span class="dc-x" onclick="stopAutoDemo()">✕</span><div class="dc-t">${t} <span style="font-size:11px;color:#bbb">· ${(_demoI%_DEMO.length)+1}/${_DEMO.length}</span></div><div class="dc-b">${b}</div>`;
  document.body.appendChild(d);
  _demoI++; _demoT=setTimeout(_demoStep,8000);
}
function stopAutoDemo(){ clearTimeout(_demoT); _demoT=null;
  document.querySelectorAll(".demo-cap").forEach(x=>x.remove());
  document.removeEventListener("keydown",_demoEsc); }

V.vendors=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Vendors</h1><div class="sub">Supplier register · auto Vendor ID &amp; Group ID</div></div>
    <div><button class="btn ghost" onclick="document.getElementById('vcsv').click()">⬆ Import CSV</button><input id="vcsv" type="file" accept=".csv" style="display:none" onchange="importVendorsCsv(this)"> <button class="btn" onclick="newVendor()">+ New vendor</button></div></div>
    <div class="field" style="max-width:380px"><input id="vsearch" list="vsl" placeholder="🔍 Search vendors by name or ID…" oninput="liveFilter('#vt','tr.click',this.value)"><datalist id="vsl"></datalist></div>
    <div id="vt" class="muted">Loading…</div>`;
  try{
    if(!window._industries){ window._industries = await api2("/industries"); }
    const vs = await api2("/vendors");
    fillDatalist("vsl", vs.map(v=>v.legal_name));
    view.querySelector("#vt").innerHTML = vs.length? `<table><tr><th>Vendor ID</th><th>Legal name</th><th>Group</th><th>Tier</th><th>Industries</th><th>Status</th><th></th></tr>
      ${vs.map(v=>`<tr class="click" onclick="openVendorMaster('${v.vendor_id}')"><td><b>${esc(v.vendor_id)}</b></td>
        <td>${esc(v.legal_name)}</td><td class="muted">${esc(v.group_id||"—")}</td><td>${esc(v.tier)}</td>
        <td>${(v.industries||[]).slice(0,2).map(i=>`<span class="tag" style="margin:1px">${esc(i)}</span>`).join("")}${(v.industries||[]).length>2?' +'+((v.industries.length)-2):''}</td>
        <td>${v.is_critical?'<span class="tag crit">CRITICAL</span>':`<span class="muted">${esc(v.status)}</span>`}</td>
        <td style="text-align:right"><button class="btn sm ghost" onclick="event.stopPropagation();openVendor('${v.vendor_id}')">summary</button> →</td></tr>`).join("")}</table>`
      : `<div class="card muted">No vendors yet. Create one — a Vendor ID and Group ID are minted automatically.</div>`;
  }catch(e){ view.querySelector("#vt").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function newVendor(){
  const inds=(window._industries||[]).map(i=>`<option value="${esc(i.industry_id)}">${esc(i.industry_id)}</option>`).join("");
  window._dumpSpecs=window._dumpSpecs||{};
  window._dumpSpecs.nv={context:"New vendor registration form",fields:[
    {id:"nv_name",label:"Legal name"},{id:"nv_trading",label:"Trading name"},
    {id:"nv_reg",label:"Registration number"},{id:"nv_hq",label:"HQ country"},
    {id:"nv_web",label:"Website"},{id:"nv_parent",label:"Parent company"}]};
  modal(`<h3>New vendor</h3>
  <p class="muted" style="margin-bottom:10px">Vendor ID and Group ID are auto-generated. The group is proposed automatically and can be changed later.</p>
  ${dumpBox('nv')}
  <div class="field"><label>Legal name</label><input id="nv_name"></div>
  <div class="field"><label>Trading name</label><input id="nv_trade"></div>
  <div class="field"><label>Parent / group company (optional)</label><input id="nv_parent" placeholder="vendors sharing a parent share a Group ID"></div>
  <div class="grid g2"><div class="field"><label>HQ country</label><input id="nv_country"></div>
    <div class="field"><label>Tier</label><select id="nv_tier"><option>Tier 1</option><option>Tier 2</option><option selected>Tier 3</option></select></div></div>
  <div class="field"><label>Industries (SIC — Ctrl/Cmd-click for multiple)</label><select id="nv_inds" multiple size="5" style="height:auto">${inds}</select></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="saveVendor()">Create</button></div>`); }
async function saveVendor(){
  const inds=[...document.getElementById("nv_inds").selectedOptions].map(o=>o.value);
  try{ const r=await api2("/vendors",{method:"POST",body:JSON.stringify({
    legal_name:val("nv_name"), trading_name:val("nv_trade"), parent_company:val("nv_parent"),
    hq_country:val("nv_country"), tier:val("nv_tier"), industries:inds, created_via:"button"})});
    closeModal(); flash(`Vendor ${r.vendor_id} created (group ${r.group_id})`); V.vendors();
  }catch(e){ flash(e.message); } }
async function openVendor(vid){
  const v=await api2("/vendors/"+vid);
  const contacts=(v.contacts||[]).length?v.contacts.map(c=>`<div class="dossier-row"><span class="dk">${c.is_primary?'<b>Primary</b> · ':''}${esc(c.name)}${c.designation?' ('+esc(c.designation)+')':''}</span><span class="dv">${esc(c.email||'')} ${esc(c.phone||'')}</span></div>`).join(""):'<div class="muted" style="font-size:12px">No contacts yet.</div>';
  const engs=(v.engagements||[]).length?v.engagements.map(e=>`<span class="tag" style="margin:2px">${esc(e.engagement_id)} · ${esc(e.title)} (${esc(e.status)})</span>`).join(""):'<span class="muted" style="font-size:12px">None</span>';
  modal(`<h3>${esc(v.legal_name)} <span class="muted" style="font-size:13px">${esc(v.vendor_id)}</span></h3>
    <div class="dossier-row"><span class="dk">Group ID</span><span class="dv">${esc(v.group_id||'—')} <button class="btn sm ghost" onclick="overrideGroup('${v.vendor_id}')">change</button></span></div>
    <div class="dossier-row"><span class="dk">Tier / Status</span><span class="dv">${esc(v.tier)} · ${esc(v.status)}</span></div>
    <div class="dossier-row"><span class="dk">HQ country</span><span class="dv">${esc(v.hq_country||'—')}</span></div>
    <div class="dossier-row"><span class="dk">Industries</span><span class="dv">${(v.industries||[]).map(i=>esc(i)).join(', ')||'—'}</span></div>
    ${v.fourth_party_id?`<div class="dossier-row"><span class="dk">Also 4th party</span><span class="dv">${esc(v.fourth_party_id)}</span></div>`:''}
    <div class="sec-h" style="margin:14px 0 6px"><h2 style="font-size:13px">Contacts</h2><div class="rule"></div></div>${contacts}
    <button class="btn sm ghost" style="margin-top:6px" onclick="addContact('${v.vendor_id}')">+ Add contact</button>
    <div class="sec-h" style="margin:14px 0 6px"><h2 style="font-size:13px">Engagements</h2><div class="rule"></div></div>${engs}
    <div class="row"><button class="btn ghost" onclick="closeModal()">Close</button>
      <button class="btn ghost" onclick="closeModal();openVendorMaster('${v.vendor_id}')">📇 Master record</button>
      <button class="btn" onclick="closeModal();openVendorAttributes('${v.vendor_id}')">🛡 Risk attributes</button></div>`);
}
function addContact(vid){ modal(`<h3>Add contact</h3>
  <div class="field"><label>Name</label><input id="ct_name"></div>
  <div class="grid g2"><div class="field"><label>Email</label><input id="ct_email"></div>
    <div class="field"><label>Designation</label><input id="ct_desig"></div></div>
  <div class="grid g2"><div class="field"><label>Country code</label><input id="ct_cc" placeholder="+44"></div>
    <div class="field"><label>Phone</label><input id="ct_phone"></div></div>
  <div class="field"><label>Country</label><input id="ct_country"></div>
  <div class="field"><label>Mailing address</label><textarea id="ct_addr" rows="2"></textarea></div>
  <label style="display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" id="ct_primary" style="width:auto"> Primary contact (account manager)</label>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="saveContact('${vid}')">Add</button></div>`); }
async function saveContact(vid){
  try{ await api2("/contacts",{method:"POST",body:JSON.stringify({
    owner_type:"vendor", owner_id:vid, name:val("ct_name"), email:val("ct_email"),
    designation:val("ct_desig"), phone_country_code:val("ct_cc"), phone_number:val("ct_phone"),
    country:val("ct_country"), mailing_address:val("ct_addr"),
    is_primary:document.getElementById("ct_primary").checked})});
    flash("Contact added"); openVendor(vid);
  }catch(e){ flash(e.message); } }
function overrideGroup(vid){ modal(`<h3>Change Group ID</h3>
  <p class="muted" style="margin-bottom:10px">Override the AI-proposed group assignment.</p>
  <div class="field"><label>Group ID</label><input id="og_gid" placeholder="GRP-00001"></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="saveGroup('${vid}')">Save</button></div>`); }
async function saveGroup(vid){
  try{ await api2(`/vendors/${vid}/group`,{method:"POST",body:JSON.stringify({group_id:val("og_gid")})});
    flash("Group updated"); openVendor(vid);
  }catch(e){ flash(e.message); } }

/* ---------- Engagements ---------- */
V.engagements=async()=>{
  const view=document.getElementById("view");
  // capture current filter selections BEFORE re-render (innerHTML destroys the <select>s)
  const _sEl=document.getElementById("eg_stage"); if(_sEl) window._egStage=_sEl.value;
  const _rEl=document.getElementById("eg_reassess"); if(_rEl) window._egReassess=_rEl.value;
  view.innerHTML=`<div class="top"><div><h1>Engagements</h1><div class="sub">Exposure first · controls second · verdict last</div></div>
    <button class="btn" onclick="newEngagement()">+ New engagement</button></div>
    <div class="field" style="max-width:220px"><label>Filter by stage</label>
      <select id="eg_stage" onchange="V.engagements()">
        <option value="">All stages</option>${["sourcing","triage","inherent","diligence","decision","contract","onboard","monitor","reassess","terminate"].map(s=>`<option ${(window._egStage===s)?"selected":""}>${s}</option>`).join("")}</select></div>
    <div class="field" style="max-width:220px"><label>Reassessment</label>
      <select id="eg_reassess" onchange="V.engagements()">
        <option value="">All</option>
        <option value="overdue" ${window._egReassess==='overdue'?'selected':''}>Overdue</option>
        <option value="soon" ${window._egReassess==='soon'?'selected':''}>Due ≤90 days</option></select></div>
    <div class="field" style="max-width:380px"><input id="esearch" list="esl" placeholder="🔍 Search engagements by vendor, title or ID…" oninput="liveFilter('#et','tr.click',this.value)"><datalist id="esl"></datalist></div>
    <div id="et" class="muted">Loading…</div>`;
  try{
    window._vendors = await api2("/vendors");
    const rows = await api2("/engagements");   // v2 registry — one data layer
    let filtered = window._egStage ? rows.filter(e=>e.stage===window._egStage) : rows;
    if(window._egReassess){
      const soon=new Date(); soon.setDate(soon.getDate()+90); const soonIso=soon.toISOString().slice(0,10);
      const todayIso=new Date().toISOString().slice(0,10);
      filtered = filtered.filter(e=> window._egReassess==='overdue'
        ? e.reassessment_due
        : (e.next_assessment_due && e.next_assessment_due<=soonIso && e.next_assessment_due>todayIso));
    }
    const vmap = Object.fromEntries(window._vendors.map(v=>[v.vendor_id, v.legal_name]));
    fillDatalist("esl", filtered.map(e=>vmap[e.vendor_id]).concat(filtered.map(e=>e.title)));
    view.querySelector("#et").innerHTML = filtered.length? `<table><tr><th>ID</th><th>Vendor</th><th>Title</th><th>Stage</th><th>Inherent</th><th>Residual</th><th>Next due</th><th></th></tr>
      ${filtered.map(e=>`<tr class="click" onclick="openEngagementRegister('${esc(e.engagement_id)}')"><td><b>${esc(e.engagement_id)}</b></td>
        <td>${esc(vmap[e.vendor_id]||e.vendor_id||"—")}</td>
        <td>${esc(e.title||"")}</td>
        <td><span class="tag">${esc(e.stage||e.status||"—")}</span></td>
        <td>${e.inherent_band?`<span class="band ${e.inherent_band}">${e.inherent_band}</span>`:"—"}</td>
        <td>${e.residual_band?`<span class="band ${e.residual_band}">${e.residual_band}</span>`:"—"}</td>
        <td style="white-space:nowrap">${e.next_assessment_due?esc(fmtDate(e.next_assessment_due)):"—"}${e.reassessment_due?` <span class="tag" style="background:#DC2626;color:#fff">due</span>`:""}</td>
        <td style="text-align:right">open →</td></tr>`).join("")}</table>`
      : `<div class="card muted">No engagements. Create one to walk the lifecycle.</div>`;
  }catch(e){ view.querySelector("#et").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function newEngagement(){
  const opts=(window._vendors||[]).map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("");
  window._dumpSpecs=window._dumpSpecs||{};
  window._dumpSpecs.ne={context:"New third-party engagement form",fields:[
    {id:"ne_t",label:"Title"},{id:"ne_desc",label:"Description"},{id:"ne_val",label:"Annual value"}]};
  modal(`<h3>New engagement</h3>
    ${dumpBox('ne')}
    <div class="field"><label>Vendor</label><select id="ne_v">${opts||'<option value="">(create a vendor first)</option>'}</select></div>
    <div class="field"><label>Title</label><input id="ne_t" placeholder="e.g. Card processing service"></div>
    <div class="grid g2"><div class="field"><label>Annual value</label><input id="ne_val" type="number" placeholder="e.g. 250000"></div>
      <div class="field"><label>Currency</label>${currencySelect("ne_ccy")}</div></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveEngagement()">Create</button></div>`); }
async function saveEngagement(){
  const vid=document.getElementById("ne_v").value;
  if(!vid){ flash("Create a vendor first"); return; }
  try{ const r=await api2("/engagements",{method:"POST",body:JSON.stringify({
      vendor_id:vid,
      title:document.getElementById("ne_t").value,
      annual_value:parseFloat(document.getElementById("ne_val").value)||null,
      currency:document.getElementById("ne_ccy").value||null})});
    closeModal(); flash("Engagement created"); openEngagementRegister(r.engagement_id);
  }catch(e){ flash(e.message); } }

async function openEng(id){
  document.querySelectorAll("#nav a").forEach(x=>x.classList.remove("active"));
  const e = await api("/engagements/"+id);
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Engagement #${id}</h1>
    <div class="sub">Stage: <span class="tag">${esc(e.stage)}</span></div></div>
    <button class="btn ghost" onclick="V.engagements()">← Back</button></div>
    <div class="grid g3" style="margin-bottom:8px">
      <div class="card stat"><div class="v">${e.inherent_band||"—"}</div><div class="l">Inherent</div></div>
      <div class="card stat"><div class="v">${e.residual_band||"—"}</div><div class="l">Residual</div></div>
      <div class="card stat"><div class="v" style="font-size:18px">${esc(e.decision||"pending")}</div><div class="l">Decision</div></div>
    </div>
    <div class="sec-h"><h2>Assessment workflow</h2><div class="rule"></div></div>
    <div class="grid g2">
      <div class="card"><h3 style="font-size:14px;margin-bottom:8px">1 · Inherent Risk (IRQ)</h3>
        <p class="muted" style="margin-bottom:10px">Score exposure and route the engagement.</p>
        <button class="btn sm" onclick="runIRQ(${id})">Run IRQ</button></div>
      <div class="card"><h3 style="font-size:14px;margin-bottom:8px">2 · Due Diligence (DDQ)</h3>
        <p class="muted" style="margin-bottom:10px">Assess controls → residual band + decision.</p>
        <button class="btn sm" onclick="runDDQ(${id})">Run DDQ</button></div>
      <div class="card"><h3 style="font-size:14px;margin-bottom:8px">3 · Contract (Matt)</h3>
        <p class="muted" style="margin-bottom:10px">Generate tiered minimum terms.</p>
        <button class="btn sm ghost" onclick="genContract(${id})">Generate terms</button></div>
      <div class="card"><h3 style="font-size:14px;margin-bottom:8px">4 · Terminate</h3>
        <p class="muted" style="margin-bottom:10px">Begin the 8-step offboarding.</p>
        <button class="btn sm ghost" onclick="terminate(${id})">Offboard</button></div>
    </div>
    <div class="sec-h"><h2>Engagement actions</h2><div class="rule"></div></div>
    <div class="card">
      <button class="btn sm ghost" onclick="autopilot(${id})">AI autopilot (propose)</button>
      <button class="btn sm ghost" onclick="editEng(${id},'${esc(e.title||"")}')">Edit details</button>
      <button class="btn sm ghost" onclick="cancelEng(${id})">Cancel engagement</button>
    </div>
    <div id="engMsg"></div>`;
}
async function autopilot(id){
  try{ const r=await api(`/engagements/${id}/autopilot`,{method:"POST",
      body:JSON.stringify({answers:{Q1:"No",Q2:"Important"}})});
    document.getElementById("engMsg").innerHTML=`<div class="sec-h"><h2>Autopilot proposal</h2><div class="rule"></div></div>
      <div class="card"><b>${esc(r.status)}</b><br><span class="muted">Proposed inherent band:
      ${esc(r.proposed_inherent.band)} · routing ${esc(r.proposed_routing.route)}. A human must record the decision.</span></div>`;
    flash("Autopilot proposed (human records decision)");
  }catch(e){ flash(e.message); } }
function editEng(id,title){ modal(`<h3>Edit engagement #${id}</h3>
  <div class="field"><label>Title</label><input id="ee_t" value="${esc(title)}"></div>
  <div class="field"><label>Business contact email</label><input id="ee_bc"></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="saveEditEng(${id})">Save</button></div>`); }
async function saveEditEng(id){
  const b={title:val("ee_t")}; const bc=val("ee_bc"); if(bc) b.business_contact_email=bc;
  try{ await api("/engagements/"+id,{method:"PATCH",body:JSON.stringify(b)});
    closeModal(); flash("Engagement updated"); openEng(id);
  }catch(e){ flash(e.message); } }
async function cancelEng(id){
  try{ await api("/engagements/"+id,{method:"DELETE"}); flash("Engagement cancelled"); V.engagements();
  }catch(e){ flash(e.message); } }
function runIRQ(id){ modal(`<h3>Inherent Risk Questionnaire</h3>
  <div class="field"><label>Regulated data / criticality</label>
    <select id="q2"><option>Standard</option><option>Important</option><option selected>Mission-critical</option></select></div>
  <div class="field"><label>Data types</label>
    <select id="q3"><option>None</option><option selected>Payment Card</option><option>Personal/PII</option></select></div>
  <div class="field"><label>Cross-border data?</label><select id="q5"><option>No</option><option selected>Yes</option></select></div>
  <div class="field"><label>Record volume</label><select id="q4"><option>&lt;10,000</option><option selected>&gt;1,000,000</option></select></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="submitIRQ(${id})">Score</button></div>`); }
async function submitIRQ(id){
  const a={Q1:"No",Q2:val("q2"),Q3:[val("q3")],Q5:val("q5"),Q4:val("q4")};
  try{ const r=await api(`/engagements/${id}/irq`,{method:"POST",body:JSON.stringify({answers:a})});
    closeModal(); flash(`IRQ: ${r.inherent_band} · ${r.routing.route}`); openEng(id);
  }catch(e){ flash(e.message); } }
function runDDQ(id){ modal(`<h3>Due Diligence Questionnaire</h3>
  <p class="muted" style="margin-bottom:10px">Control outcomes drive the residual band. A marginal critical control forces HIGH.</p>
  <div class="field"><label>Encryption control (IS2 — critical)</label>
    <select id="is2"><option>SATISFIED</option><option selected>MARGINAL</option><option>FAILED</option></select></div>
  <div class="field"><label>Access management (IS1)</label>
    <select id="is1"><option selected>SATISFIED</option><option>MARGINAL</option></select></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="submitDDQ(${id})">Score residual</button></div>`); }
async function submitDDQ(id){
  const a={IS2:val("is2"),IS1:val("is1")};
  try{ const r=await api(`/engagements/${id}/ddq`,{method:"POST",body:JSON.stringify({answers:a})});
    closeModal(); flash(`Residual ${r.residual_band}: ${r.decision.text}`); openEng(id);
  }catch(e){ flash(e.message); } }
async function genContract(id){ try{ const r=await api(`/engagements/${id}/contract`,{method:"POST",body:"{}"});
  flash(`Contract: ${r.terms.length} terms for ${r.tier}`); openEng(id);}catch(e){flash(e.message);} }
async function terminate(id){ try{ const r=await api(`/engagements/${id}/terminate`,{method:"POST",body:"{}"});
  flash(`Offboarding started · ${r.offboarding_steps} steps`); openEng(id);}catch(e){flash(e.message);} }
function val(id){return document.getElementById(id).value}

/* ---------- Findings ---------- */
let _fndFilter={status:"",severity:"",source:"",accepted:""};
const FND_STATUSES=["Draft","Published","Under Remediation","Remediated","Verified","Closed"];
const SEVTONE={Critical:"crit",High:"warn",Medium:"info",Low:"ok"};
// ---------- Remediation plans (RMD) ----------
const RMD_STATUSES=["Planned","In Progress","Complete","Verified"];
async function fndRemediation(fid){
  try{ const r=await api2('/findings/'+fid+'/remediation',{method:'POST',body:'{}'});
    closeModal(); openRemediation(r.remediation_id);
  }catch(e){ flash(e.message); }
}
async function openRemediation(rid){
  let r; try{ r=await api2('/remediations/'+rid); }catch(e){ flash(e.message); return; }
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;max-width:1060px;width:100%;margin:0 auto 12px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">REMEDIATION PLAN · ${esc(r.remediation_id)}</div>
      <button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">
      <h3 style="margin:0">${esc(r.remediation_id)} <span style="font-weight:400;font-size:14px">· ${esc(r.severity||'')}</span></h3>
      <div class="muted" style="font-size:11px;margin-top:3px">For finding <a href="#" onclick="closeModal();openFinding('${esc(r.finding_id)}');return false">${esc(r.finding_id)}</a>${r.finding_title?' · '+esc(r.finding_title):''} · Vendor ${esc(r.vendor_id||'—')} · Engagement ${esc(r.engagement_id||'—')}</div>
      <div class="rev-row"><span class="rk">Plan</span><span class="rv"><textarea id="rmd_plan" rows="4" style="width:100%">${esc(r.plan||'')}</textarea></span></div>
      <div class="rev-row"><span class="rk">Owner</span><span class="rv"><input id="rmd_owner" value="${esc(r.owner||'')}" style="max-width:240px"></span></div>
      <div class="rev-row"><span class="rk">Target date</span><span class="rv"><input id="rmd_target" type="date" value="${esc(r.target_date||'')}"></span></div>
      <div class="rev-row"><span class="rk">Status</span><span class="rv"><select id="rmd_status">${RMD_STATUSES.map(x=>`<option ${r.status===x?'selected':''}>${x}</option>`).join('')}</select></span></div>
      <div class="rev-row"><span class="rk">Progress</span><span class="rv"><input id="rmd_prog" type="range" min="0" max="100" value="${r.progress_pct||0}" oninput="document.getElementById('rmd_progv').textContent=this.value+'%'"> <span id="rmd_progv">${r.progress_pct||0}%</span></span></div>
      <div class="rev-row"><span class="rk">Evidence</span><span class="rv"><textarea id="rmd_evid" rows="2" style="width:100%">${esc(r.evidence||'')}</textarea></span></div>
      <div class="row" style="margin-top:10px"><button class="btn" onclick="rmdSave('${rid}')">Save plan</button></div>
    </div>`);
}
async function rmdSave(rid){
  const body={ plan:val('rmd_plan'), owner:val('rmd_owner'), target_date:val('rmd_target'),
    status:val('rmd_status'), progress_pct:+(document.getElementById('rmd_prog').value), evidence:val('rmd_evid') };
  try{ await api2('/remediations/'+rid,{method:'PUT',body:JSON.stringify(body)}); flash('Remediation plan saved'); closeModal(); if(window._curView==='remediation') rmdLoad(); }
  catch(e){ flash(e.message); }
}
V.remediation=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Remediation Plans</h1><div class="sub">Remediation plans (RMD) tracking findings to closure</div></div></div>
    <div class="card" style="display:flex;gap:10px;align-items:flex-end;margin-bottom:12px">
      <div class="field" style="margin:0;min-width:170px"><label style="font-size:11px">Status</label>
      <select id="rmd_filter" onchange="rmdLoad()"><option value="">All</option>${RMD_STATUSES.map(x=>`<option>${x}</option>`).join('')}</select></div></div>
    <div id="rmdBody" class="muted">Loading…</div>`;
  rmdLoad();
};
async function rmdLoad(){
  const el=document.getElementById("rmdBody"); if(!el) return;
  const st=(document.getElementById("rmd_filter")||{}).value||"";
  let rows; try{ rows=await api2("/remediations"+(st?`?status=${encodeURIComponent(st)}`:"")); }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const open=rows.filter(r=>r.status!=='Verified'&&r.status!=='Complete').length;
  el.innerHTML=`<div class="grid g4" style="gap:10px;margin-bottom:14px">
      <div class="card stat"><div class="v">${rows.length}</div><div class="l">Total plans</div></div>
      <div class="card stat"><div class="v">${open}</div><div class="l">In flight</div></div>
      <div class="card stat"><div class="v">${rows.filter(r=>r.status==='Verified').length}</div><div class="l">Verified</div></div>
      <div class="card stat"><div class="v">${Math.round(rows.reduce((a,r)=>a+(r.progress_pct||0),0)/(rows.length||1))}%</div><div class="l">Avg progress</div></div></div>
    ${rows.length?`<table><tr><th>RMD</th><th>Finding</th><th>Severity</th><th>Vendor</th><th>Engagement</th><th>Owner</th><th>Target</th><th>Status</th><th>Progress</th></tr>
    ${rows.map(r=>`<tr class="click" onclick="openRemediation('${r.remediation_id}')">
      <td><b>${esc(r.remediation_id)}</b></td><td>${esc(r.finding_id)}</td>
      <td><span class="tag ${SEVTONE[r.severity]||''}">${esc(r.severity||'—')}</span></td>
      <td class="muted" style="font-size:11px">${esc(r.vendor_id||'—')}</td><td class="muted" style="font-size:11px">${esc(r.engagement_id||'—')}</td>
      <td class="muted">${esc(r.owner||'—')}</td><td class="muted" style="font-size:11px">${esc(r.target_date||'—')}</td>
      <td><span class="tag">${esc(r.status)}</span></td>
      <td><div style="height:6px;width:90px;background:#eee;border-radius:4px"><div style="height:6px;width:${r.progress_pct||0}%;background:#1A4D3C;border-radius:4px"></div></div></td></tr>`).join("")}</table>`
    :`<div class="card muted">No remediation plans yet. Open a finding and create one from the “Remediation plan (RMD)” link.</div>`}`;
}
V.findings=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Findings</h1><div class="sub">Findings register &middot; risk acceptance &middot; remediation to closure</div></div>
    <button class="btn" onclick="newFinding()">+ Raise finding</button></div>
    <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      ${fndSel("status","Status",["",...FND_STATUSES])}
      ${fndSel("severity","Severity",["","Critical","High","Medium","Low"])}
      ${fndSel("source","Source",["","AI","Assessor"])}
      ${fndSel("accepted","Risk acceptance",["","true","false"],{true:"Accepted",false:"Not accepted"})}
      <button class="btn sm ghost" onclick="fndClear()">Clear</button>
    </div>
    <div id="ft" class="muted">Loading…</div>`;
  fndLoad();
};
function fndSel(key,label,opts,labels){ return `<div class="field" style="margin:0;min-width:150px"><label style="font-size:11px">${label}</label>
  <select onchange="_fndFilter['${key}']=this.value;fndLoad()">${opts.map(o=>`<option value="${o}" ${_fndFilter[key]===o?'selected':''}>${o===''?'All':((labels&&labels[o])||o)}</option>`).join("")}</select></div>`; }
function fndClear(){ _fndFilter={status:"",severity:"",source:"",accepted:""}; V.findings(); }
async function fndLoad(){
  const el=document.getElementById("ft"); if(!el)return;
  const qs=Object.entries(_fndFilter).filter(([k,v])=>v).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("&");
  try{ const rows=await api2("/findings"+(qs?`?${qs}`:""));
    const bySev=k=>rows.filter(f=>f.severity===k).length;
    el.innerHTML=`<div class="grid g4" style="margin-bottom:14px;gap:10px">
        <div class="card stat"><div class="v">${rows.filter(f=>f.status!=='Closed').length}</div><div class="l">Open findings</div></div>
        <div class="card stat"><div class="v">${bySev("Critical")+bySev("High")}</div><div class="l">Critical / High</div></div>
        <div class="card stat"><div class="v">${rows.filter(f=>f.risk_accepted).length}</div><div class="l">Risk-accepted</div></div>
        <div class="card stat"><div class="v">${rows.filter(f=>f.source==='AI').length}</div><div class="l">AI-raised</div></div></div>
      ${rows.length?`<table><tr><th>Finding</th><th>Heading</th><th>Severity</th><th>Status</th><th>Owner</th><th>Vendor</th><th>Engagement</th><th>Remediation</th></tr>
      ${rows.map(f=>`<tr class="click" onclick="openFinding('${f.finding_id}')">
        <td><b>${esc(f.finding_id)}</b></td>
        <td>${esc(f.title||'')}${f.risk_accepted?' <span class="tag" style="background:#FBE8C6;color:#7A4E2D">accepted</span>':''}</td>
        <td><span class="tag ${SEVTONE[f.severity]||''}">${esc(f.severity)}</span></td>
        <td><span class="tag">${esc(f.status)}</span></td>
        <td class="muted">${esc(f.owner||'—')}</td>
        <td class="muted" style="font-size:11px">${esc(f.vendor_id||'—')}</td>
        <td class="muted" style="font-size:11px">${esc(f.engagement_id||'—')}</td>
        <td>${f.remediation_id?`<span class="tag" style="background:#E6EFEA;color:#1A4D3C">${esc(f.remediation_id)}</span>`:'<span class="muted">—</span>'}</td></tr>`).join("")}</table>`
      :`<div class="card muted">No findings match the filter.</div>`}`;
  }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function openFinding(fid){
  let f; try{ f=await api2("/findings/"+fid); }catch(e){ flash(e.message); return; }
  const ro=!f.can_modify;
  const notes=(f.progress_notes||[]).map(n=>`<div class="dossier-row"><span class="dk" style="font-size:10px">${esc((n.ts||'').slice(0,16))} · ${esc(n.user||'')}</span><span class="dv">${esc(n.note||'')}</span></div>`).join("")||'<span class="muted" style="font-size:11px">No notes yet.</span>';
  const atts=(f.attachments||[]).map(a=>`<span class="tag">📎 ${esc(a.name||a.doc_id)}</span>`).join(" ")||'<span class="muted" style="font-size:11px">None</span>';
  const link=(lbl,id,view)=>id?`<a href="#" onclick="closeModal();${view};return false">${esc(id)}</a>`:'—';
  modalFull(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;max-width:1060px;width:100%;margin:0 auto 12px">
      <div class="muted" style="font-size:11px;letter-spacing:.04em">FINDING · ${esc(f.finding_id)}</div>
      <button class="btn ghost sm" onclick="closeModal()">✕ Close</button></div>
    <div class="full-body">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div><h3 style="margin:0">${esc(f.finding_id)} · ${esc(f.title)}</h3>
      <div class="muted" style="font-size:11px;margin-top:3px">${esc(f.source)}-raised${ro?' · read-only (not your assigned engagement)':''}</div></div>
      <span class="tag ${SEVTONE[f.severity]||''}">${esc(f.severity)}</span></div>
    <div class="rev-row"><span class="rk">Status</span><span class="rv">${ro?`<span class="tag">${esc(f.status)}</span>`:`<select id="fd_status" onchange="fndStatus('${fid}',this.value)">${FND_STATUSES.map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join("")}</select>`}</span></div>
    <div class="rev-row"><span class="rk">Details</span><span class="rv">${esc(f.description||'—')}</span></div>
    <div class="rev-row"><span class="rk">Owner</span><span class="rv">${ro?esc(f.owner||'—'):`<input id="fd_owner" value="${esc(f.owner||'')}" placeholder="owner" style="max-width:200px">`}</span></div>
    <div class="rev-row"><span class="rk">Assessor</span><span class="rv">${esc(f.assessor||'—')}</span></div>
    <div class="rev-row"><span class="rk">Suggested remediation</span><span class="rv">${ro?esc(f.suggested_remediation||'—'):`<textarea id="fd_rem" rows="2" style="width:100%">${esc(f.suggested_remediation||'')}</textarea>`}</span></div>
    <div class="rev-row"><span class="rk">Suggested closure</span><span class="rv">${ro?esc(f.suggested_closure||'—'):`<textarea id="fd_clo" rows="2" style="width:100%">${esc(f.suggested_closure||'')}</textarea>`}</span></div>
    <div class="rev-row"><span class="rk">Links</span><span class="rv">Vendor ${link('v',f.vendor_id,`openV360('${f.vendor_id}')`)} · Engagement ${f.engagement_id?esc(f.engagement_id):'—'} · Assessment ${link('a',f.assessment_id,`openAssessmentReview('${f.assessment_id}')`)}</span></div>
    <div class="rev-row"><span class="rk">Remediation plan (RMD)</span><span class="rv">${f.remediation_id?`<a href="#" onclick="closeModal();openRemediation('${f.remediation_id}');return false">${esc(f.remediation_id)}</a>`:'<span class="muted">none yet</span>'} ${ro?'':`<button class="btn sm ghost" onclick="fndRemediation('${fid}')">${f.remediation_id?'Open / edit plan':'＋ Create remediation plan'}</button>`}</span></div>
    ${ro?'':`<div class="row" style="margin:8px 0"><button class="btn sm" onclick="fndSave('${fid}')">Save changes</button></div>`}
    <div class="sec-h" style="margin-top:10px"><h2 style="font-size:13px">Risk acceptance</h2><div class="rule"></div></div>
    ${f.risk_accepted?`<div class="note warn">Accepted by <b>${esc(f.accepted_by||'')}</b> · expires <b>${esc(f.acceptance_expiry||'')}</b><br><span class="muted">${esc(f.acceptance_rationale||'')}</span>
      <div style="margin-top:6px"><button class="btn sm ghost" onclick="fndRevoke('${fid}')">Revoke acceptance</button></div></div>`
      :`<div class="grid g2"><div class="field"><label>Rationale</label><input id="fd_ar" placeholder="why accept this risk"></div>
        <div class="field"><label>Acceptance expiry</label><input id="fd_ax" placeholder="YYYY-MM-DD"></div></div>
        <button class="btn sm" onclick="fndAccept('${fid}')">Record risk acceptance</button>`}
    <div class="sec-h" style="margin-top:12px"><h2 style="font-size:13px">Progress notes</h2><div class="rule"></div></div>
    <div id="fd_notes">${notes}</div>
    ${ro?'':`<div style="display:flex;gap:6px;margin-top:6px"><input id="fd_note" placeholder="add a progress note" style="flex:1"><button class="btn sm" onclick="fndNote('${fid}')">Add</button></div>`}
    <div class="sec-h" style="margin-top:12px"><h2 style="font-size:13px">Attachments</h2><div class="rule"></div></div>
    <div>${atts}</div>
    ${ro?'':`<div style="display:flex;gap:6px;margin-top:6px"><input id="fd_doc" placeholder="document ID (e.g. DOC-000123)" style="flex:1"><button class="btn sm ghost" onclick="fndAttach('${fid}')">Attach</button></div>`}
    <div class="row" style="margin-top:14px"><button class="btn ghost" onclick="closeModal()">Close</button></div>
  </div>`);
}
async function fndStatus(fid,v){ try{ await api2("/findings/"+fid,{method:"PUT",body:JSON.stringify({status:v})}); flash("Status: "+v); }catch(e){ flash(e.message); } }
async function fndSave(fid){ try{ await api2("/findings/"+fid,{method:"PUT",body:JSON.stringify({owner:val("fd_owner"),suggested_remediation:val("fd_rem"),suggested_closure:val("fd_clo")})}); flash("Saved"); closeModal(); fndLoad(); }catch(e){ flash(e.message); } }
async function fndAccept(fid){ const r=val("fd_ar"),x=val("fd_ax"); if(!r||!x){ flash("Rationale and expiry required"); return; } try{ await api2("/findings/"+fid+"/risk-accept",{method:"POST",body:JSON.stringify({rationale:r,expiry_date:x,accept:true})}); flash("Risk acceptance recorded"); closeModal(); openFinding(fid); }catch(e){ flash(e.message); } }
async function fndRevoke(fid){ try{ await api2("/findings/"+fid+"/risk-accept",{method:"POST",body:JSON.stringify({rationale:"",expiry_date:"",accept:false})}); flash("Acceptance revoked"); closeModal(); openFinding(fid); }catch(e){ flash(e.message); } }
async function fndNote(fid){ const n=val("fd_note"); if(!n)return; try{ await api2("/findings/"+fid+"/note",{method:"POST",body:JSON.stringify({note:n})}); openFinding(fid); }catch(e){ flash(e.message); } }
async function fndAttach(fid){ const d=val("fd_doc"); if(!d)return; try{ await api2("/findings/"+fid+"/attach",{method:"POST",body:JSON.stringify({doc_id:d})}); openFinding(fid); }catch(e){ flash(e.message); } }
function newFinding(){ modal(`<h3>Raise finding</h3>
  <div class="field"><label>Heading</label><input id="f_t"></div>
  <div class="field"><label>Details</label><textarea id="f_d" rows="2"></textarea></div>
  <div class="grid g2"><div class="field"><label>Severity</label><select id="f_s"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option></select></div>
  <div class="field"><label>Vendor ID (optional)</label><input id="f_v" placeholder="VEN-…"></div></div>
  <div class="field"><label>Suggested remediation</label><textarea id="f_r" rows="2"></textarea></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="saveFinding()">Raise</button></div>`); }
async function saveFinding(){ try{ await api2("/findings",{method:"POST",body:JSON.stringify({
    title:val("f_t"),description:val("f_d"),severity:val("f_s"),vendor_id:val("f_v")||null,
    suggested_remediation:val("f_r"),source:"Assessor",status:"Draft"})}); closeModal(); flash("Finding raised"); fndLoad();
  }catch(e){flash(e.message);} }

/* ---------- Monitoring ---------- */
V.monitoring=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Monitoring</h1><div class="sub">Financial & reputation sweeps</div></div></div>
    <div class="card"><p class="muted" style="margin-bottom:10px">Run a financial sweep on a vendor. ALERT/CRITICAL auto-raises a reassessment and notifies.</p>
    <div class="grid g2"><div class="field"><label>Vendor</label><select id="mv">${(await api("/vendors")).map(v=>`<option value="${v.vendor_id}">${esc(v.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Financial health (sim)</label><select id="mh"><option value="weak">Weak / distressed</option><option value="ok">Healthy</option></select></div></div>
    <button class="btn" onclick="sweep()">Run sweep</button></div><div id="ms"></div>`;
};
async function sweep(){
  const v=parseInt(val("mv")); const weak=val("mh")==="weak";
  const payload=weak?{current_ratio:0.3,debt_equity:4,net_margin:-0.2}:{current_ratio:2,debt_equity:0.5,net_margin:0.2};
  try{ const r=await api("/monitoring/sweep",{method:"POST",body:JSON.stringify({vendor_id:v,payload})});
    document.getElementById("ms").innerHTML=`<div class="sec-h"><h2>Result</h2><div class="rule"></div></div>
      <div class="card"><span class="band ${r.status==='OK'?'LOW':r.status==='ALERT'?'ELEVATED':'HIGH'}">${r.status}</span></div>`;
    flash("Sweep: "+r.status);
  }catch(e){flash(e.message);} }

/* ---------- Intelligence ---------- */
V.intel=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Board Intelligence</h1>
      <div class="sub">AI horizon scan · external PESTLE × internal estate · predictive oversight for the Board</div></div>
    <div style="display:flex;gap:8px">
      <button class="btn" id="btnGen" onclick="runBoardIntel()">✦ Generate insights</button>
    </div></div>
    <div class="intel-shell">
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <div class="intel-console" id="intelLog" style="height:330px"><div class="il-line muted">Idle. Press <b>Generate insights</b> — the AI will scan the external horizon, ingest the internal estate, correlate, predict, and brief the Board.</div></div>
        <div id="intelChatWrap" style="display:none">
          <div class="intel-console" id="intelChatLog" style="height:150px"><div class="il-line muted">Ask a follow-up deep-dive question — answered at Board/ExCo level.</div></div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <textarea id="intelQ" rows="1" placeholder="e.g. What is our biggest renewal-cliff exposure next quarter?" style="flex:1;background:#0e1f1a;color:#bfe3c9;border:1px solid #1d3a30;border-radius:8px;padding:9px;font-size:12px;resize:none" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();askBoard();}"></textarea>
            <button class="btn" onclick="askBoard()">Ask</button>
          </div>
        </div>
      </div>
      <div class="intel-canvas" id="intelCanvas">
        <div class="intel-empty">
          <div class="ie-mark">✦</div>
          <div>Board-grade intelligence will render here.</div>
          <div class="muted" style="font-size:12px;margin-top:6px">Graphical presentation, board observations and predictive analysis — generated by AI from every available data point.</div>
        </div>
      </div>
    </div>`;
};
function _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
let _boardHistory=[];
async function askBoard(){
  const inp=document.getElementById("intelQ"); const q=(inp.value||"").trim(); if(!q)return;
  inp.value="";
  const log=document.getElementById("intelChatLog"); if(!log) return;
  const add=(html,cls)=>{ const d=document.createElement("div"); d.className="il-line "+(cls||""); d.innerHTML=html; log.appendChild(d); log.scrollTop=log.scrollHeight; return d; };
  add(`<b style="color:#eaf6ef">▸ ${esc(q)}</b>`);
  const pend=add('<span class="muted">Board-level deep-dive analysis…</span>');
  try{
    const r=await api2("/intelligence/board/followup",{method:"POST",body:JSON.stringify({question:q,history:_boardHistory})});
    pend.remove();
    add(`<div style="color:#dcefe2;line-height:1.55">${md1(r.answer)}</div>`+(r.engine==='holding'||r.engine==='ai_failed'?'':'<div style="color:#7f9a86;font-size:9px;margin-top:3px">AI · BCG-grade</div>'));
    if(r.engine==='llm') _boardHistory.push({q,a:r.answer});
  }catch(e){ pend.remove(); add("Error: "+esc(e.message),"err"); }
}
function _ilog(html, cls){ const l=document.getElementById("intelLog"); if(!l) return;
  const d=document.createElement("div"); d.className="il-line "+(cls||""); d.innerHTML=html; l.appendChild(d); l.scrollTop=l.scrollHeight; }
async function runBoardIntel(){
  const bs=document.getElementById("btnStart"), bg=document.getElementById("btnGen");
  if(bs) bs.disabled=true; if(bg) bg.disabled=true;
  const log=document.getElementById("intelLog"); if(log) log.innerHTML="";
  const canvas=document.getElementById("intelCanvas");
  if(canvas) canvas.innerHTML=`<div class="intel-empty"><div class="ie-mark spin">✦</div><div class="muted">Analysing…</div></div>`;
  const phases=[
    ["Initialising board-intelligence engine…",260],
    ["Scanning external horizon — <b>Political · Regulatory · Environmental · Social · Technological</b>…",520],
    ["Ingesting internal estate — vendors, engagements, spend, expiry &amp; renewal calendar, delivery geography, findings, concentration…",560],
    ["Correlating external signals against internal exposure…",520],
    ["Running predictive models — renewal cliff · assurance-lapse · concentration drift · findings burn-down…",520],
    ["Drafting board observations and specific management actions…",460],
    ["Composing graphical presentation…",360],
  ];
  for(const [t,d] of phases){ _ilog(t); await _sleep(d); }
  try{
    const r=await api2("/intelligence/board",{method:"POST",body:"{}"});
    _ilog(`Analysis complete · <b>${r.observations.length}</b> board matters · <b>${r.predictions.length}</b> predictive calls · engine: ${esc(r.engine)}`,"ok");
    renderBoardIntel(r);
    _boardHistory=[];
    const cw=document.getElementById("intelChatWrap"); if(cw){ cw.style.display="block"; }
    const cl=document.getElementById("intelChatLog"); if(cl){ cl.innerHTML='<div class="il-line ok">Deep-dive complete. Ask a follow-up — answered at Board/ExCo level.</div>'; }
  }catch(e){ _ilog("Error: "+esc(e.message),"err"); if(canvas) canvas.innerHTML=`<div class="intel-empty"><div class="muted">${esc(e.message)}</div></div>`; }
  if(bs){ bs.disabled=false; bs.textContent="▶ Re-run analysis"; } if(bg) bg.disabled=false;
}
const SEVCOL={Critical:"#b3261e",High:"#d9534f",Elevated:"#e0913a",Moderate:"#2E6A4F"};
const FACCOL={Political:"#5C3A6B",Regulatory:"#1E3A5C",Environmental:"#3D6B3D",Social:"#8A2E3B",Technological:"#1A4D3C"};
function _barRow(label,val,max,col,suffix){ const w=Math.max(2,Math.round(100*val/(max||1)));
  return `<div class="bar-row"><div class="bar-lab">${esc(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${col}"></div></div><div class="bar-val">${esc(String(val))}${suffix||""}</div></div>`; }
function _miniChart(title,series,col,suffix){ const max=Math.max(1,...series.map(p=>p.value));
  return `<div class="ic-card"><div class="ic-title">${esc(title)}</div>${series.map(p=>_barRow(p.label,p.value,max,col,suffix)).join("")}</div>`; }
function renderBoardIntel(r){
  const c=document.getElementById("intelCanvas"); if(!c) return;
  const iv=r.internal;
  // executive briefing
  const brief = r.executive_briefing || r.headline;
  let html=`<div class="ib-brief"><div class="ib-kicker">Executive briefing · ${esc(r.generated)} · ${r.engine==='llm'?'live AI':'AI engine'}</div>
    <p>${esc(brief)}</p>
    <div class="ib-metrics">
      ${[["Vendors",iv.vendors],["Critical",iv.critical_vendors],["Engagements",iv.engagements],
         ["Spend","£"+iv.total_spend_m+"m"],["Top hub",iv.top_hub_share+"%"],["Open findings",iv.open_findings],
         ["Certs expiring (crit)",iv.certs_expiring_90_critical],["Renewals ≤90d",iv.renewals_90d]]
        .map(([k,v])=>`<div><div class="ibm-v">${esc(String(v))}</div><div class="ibm-k">${esc(k)}</div></div>`).join("")}
    </div></div>`;
  // PESTLE horizon
  html+=`<div class="sec-h" style="margin-top:18px"><h2>External horizon — PESTLE exposure</h2><div class="rule"></div></div>
    <div class="ic-card">${r.external.map(e=>{const col=SEVCOL[e.severity]||"#2E6A4F";
      return `<div class="pestle-row"><div class="pe-fac" style="color:${FACCOL[e.factor]}">${esc(e.factor)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${e.score}%;background:${col}"></div></div>
        <div class="pe-sev" style="color:${col}">${e.score} · ${esc(e.severity)}</div>
        <div class="pe-head muted">${esc(e.headline)}</div></div>`;}).join("")}</div>`;
  // graphical presentation grid
  html+=`<div class="sec-h" style="margin-top:18px"><h2>Graphical presentation</h2><div class="rule"></div></div>
    <div class="ic-grid">
      ${_miniChart("Residual risk distribution",r.charts.residual,"#1A4D3C")}
      ${_miniChart("Delivery geography (engagements)",r.charts.geography,"#1E3A5C")}
      ${_miniChart("Assurance expiry calendar",r.charts.expiry,"#d9534f")}
      ${_miniChart("Spend by residual band (£m)",r.charts.spend_by_band,"#B8862B")}
    </div>`;
  // board observations
  html+=`<div class="sec-h" style="margin-top:18px"><h2>Board observations &amp; management actions</h2><div class="rule"></div></div>
    <div class="obs-list">${r.observations.map(o=>{const col=SEVCOL[o.severity]||"#2E6A4F";
      return `<div class="obs-card" style="border-left-color:${col}">
        <div class="obs-top"><span class="obs-sev" style="background:${col}">${esc(o.severity)}</span>
          <span class="obs-fac" style="color:${FACCOL[o.factor]};border-color:${FACCOL[o.factor]}">${esc(o.factor)}</span>
          <span class="obs-hz muted">Horizon: ${esc(o.horizon)}</span></div>
        <h3>${esc(o.title)}</h3>
        <div class="obs-ev"><b>Evidence.</b> ${esc(o.evidence)}</div>
        <div class="obs-sw"><b>So what.</b> ${esc(o.so_what)}</div>
        <div class="obs-act"><span class="oa-tag">Board → Management</span> ${esc(o.board_action)}</div>
      </div>`;}).join("")}</div>`;
  // predictive analysis
  if((r.predictions||[]).length){
    html+=`<div class="sec-h" style="margin-top:18px"><h2>Predictive analysis</h2><div class="rule"></div></div>
      <div class="pred-grid">${r.predictions.map(p=>`<div class="pred-card">
        <div class="pred-top"><span class="pred-metric">${esc(p.metric)}</span><span class="pred-conf">${esc(p.confidence)} confidence</span></div>
        <h4>${esc(p.title)}</h4><p class="muted">${esc(p.detail)}</p></div>`).join("")}</div>`;
  }
  c.innerHTML=html;
}

/* ---------- Reports ---------- */
V.reports=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Reports & Export</h1><div class="sub">Registers and audit export</div></div></div>
    <div class="grid g2">
      <div class="card"><h3 style="font-size:14px;margin-bottom:6px">Vendor risk register</h3>
        <p class="muted" style="margin-bottom:10px">All vendors and engagements with bands and decisions.</p>
        <button class="btn sm" onclick="dl('/reports/register.csv','register.csv')">Download CSV</button></div>
      <div class="card"><h3 style="font-size:14px;margin-bottom:6px">Audit trail export</h3>
        <p class="muted" style="margin-bottom:10px">Full hash-chained audit log.</p>
        <button class="btn sm" onclick="dl('/audit/export.csv','audit.csv')">Download CSV</button></div>
    </div>`;
};
async function dl(path,fname){
  try{ const h={}; if(tok()) h["Authorization"]="Bearer "+tok();
    const r=await fetch(API+path,{headers:h}); const t=await r.text();
    const b=new Blob([t],{type:"text/csv"}); const a=document.createElement("a");
    a.href=URL.createObjectURL(b); a.download=fname; a.click(); flash("Downloaded "+fname);
  }catch(e){ flash(e.message); } }

/* ---------- Notifications ---------- */
async function nbLoadInbox(){
  const el=document.getElementById("nbInbox"); if(!el) return;
  let d; try{ d=await api("/notifications/inbox"); }catch(e){ return; }
  el.innerHTML=`<div class="card" style="margin:10px 0"><div class="card-label">Platform notifications <span class="tag">${d.unread} unread</span></div>
    ${d.items.length?`<table><tr><th>When (UTC)</th><th>Event</th><th>Detail</th><th>Audience</th><th></th></tr>
      ${d.items.slice(0,15).map(n=>`<tr style="${n.is_read?'opacity:.55':''}"><td class="muted" style="font-size:11px">${esc(n.ts||"")}</td>
        <td><b style="font-size:12.5px;${n.forced?'color:#8A2E3B':''}">${n.forced?'⚑ ':''}${esc(n.title||"")}</b><div class="muted" style="font-size:10.5px">${esc(n.type)}</div></td>
        <td class="muted" style="font-size:11.5px">${esc(n.body||"")}</td><td><span class="tag">${esc(n.audience||"")}</span></td>
        <td>${n.is_read?'':`<button class="btn sm ghost" onclick="nbRead(${n.id})">Mark read</button>`}</td></tr>`).join("")}</table>
      <div style="margin-top:8px"><button class="btn sm ghost" onclick="nbRead()">Mark all read</button></div>`
      :'<div class="muted" style="font-size:12px">No platform notifications yet — switch event types on below (admin) and they will land here as events occur.</div>'}</div>`;
}
async function nbRead(id){ try{ await api("/notifications/read",{method:"POST",body:JSON.stringify(id?{id}:{})}); nbLoadInbox(); }catch(e){} }
async function nbLoadSettings(){
  const el=document.getElementById("nbSettings"); if(!el) return;
  let d; try{ d=await api("/notifications/catalogue"); }catch(e){ return; }
  const groups=[...new Set(d.catalogue.map(c=>c.group))];
  el.innerHTML=`<div class="sec-h" style="margin-top:14px"><h2>Notification settings <span class="muted" style="font-size:12px;font-weight:400">(admin) — every notifiable event on the platform · all OFF by default</span></h2><div class="rule"></div></div>
    ${groups.map(g=>`<div class="card" style="margin-bottom:10px"><div class="card-label">${esc(g)}</div>
      <table><tr><th style="width:34%">Event</th><th>Description</th><th>Audience</th><th>On</th></tr>
      ${d.catalogue.filter(c=>c.group===g).map(c=>{const st=d.settings[c.id]||{};return `<tr>
        <td><b style="font-size:12.5px">${esc(c.label)}</b><div class="muted" style="font-size:10.5px">${esc(c.id)}</div></td>
        <td class="muted" style="font-size:11.5px">${esc(c.desc)}</td>
        <td><select onchange="nbSet('${c.id}',{audience:this.value})" style="max-width:140px">${d.audiences.map(a=>`<option ${st.audience===a?'selected':''}>${a}</option>`).join("")}</select></td>
        <td><input type="checkbox" ${st.enabled?'checked':''} onchange="nbSet('${c.id}',{enabled:this.checked})" style="width:auto"></td></tr>`;}).join("")}</table></div>`).join("")}
    <p class="muted" style="font-size:11.5px">⚑ <b>Notable event</b> notifications always reach management when flagged on an incident — that path deliberately bypasses the off switch.</p>`;
}
async function nbSet(id,patch){ try{ await api("/notifications/settings",{method:"POST",body:JSON.stringify({settings:{[id]:patch}})}); flash("Notification setting saved"); }catch(e){ flash(e.message); } }
V.notifications=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Notifications</h1><div class="sub">Monitoring, stage alerts and issues</div></div>
    <button class="btn ghost" onclick="readAll()">Mark all read</button></div>
    <div class="card"><div class="card-label">Continuous monitoring</div><div id="monCard" class="muted">Loading…</div></div>
    <div id="nbInbox"></div>
    <div id="nt" class="muted">Loading…</div>
    <div id="nbSettings"></div>`;
  monStatus(); nbLoadInbox(); nbLoadSettings();
  try{ const d=await api("/notifications");
    view.querySelector("#nt").innerHTML=`<p class="muted" style="margin-bottom:10px">${d.unread} unread</p>
      ${d.items.length?`<table><tr><th>Event</th><th>Audience</th><th>Read</th></tr>
      ${d.items.map(n=>`<tr><td>${esc(n.event)}</td><td><span class="tag">${esc(n.audience)}</span></td>
        <td>${n.read?'<span class="muted">read</span>':`<button class="btn sm ghost" onclick="readOne(${n.id})">mark read</button>`}</td></tr>`).join("")}</table>`
      :`<div class="card muted">No notifications.</div>`}`;
  }catch(e){ view.querySelector("#nt").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function _ts(x){ return x?String(x).slice(0,16).replace('T',' '):'—'; }
async function monStatus(){
  const el=document.getElementById("monCard"); if(!el) return;
  try{ const st=await api2("/monitoring/status");
    const t=st.tasks||{}; const sr=t.sanctions_rescreen||{}; const cr=t.certificate_revalidation||{};
    el.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn" onclick="monRunNow()">▶ Run monitoring now</button>
        <span class="muted" style="font-size:12px">Last run <b>${_ts(st.last_run)}</b>${st.trigger?` (${esc(st.trigger)})`:''} · next due ${_ts(st.next_due)} · every ${st.interval_hours}h · scheduler ${st.scheduler_enabled?'<span class="pill ok">on</span>':'<span class="pill mute">off (use cron)</span>'}</span></div>
      ${st.last_run?`<table><tr><th>Sweep</th><th>Last result</th></tr>
        <tr><td>Sanctions re-screen</td><td>${sr.screened!=null?`${sr.screened} screened · <b>${sr.hits||0}</b> hit · ${sr.reviews||0} review · ${sr.clear||0} clear${sr.live_entries?` · ${sr.live_entries} live`:''}`:'—'}</td></tr>
        <tr><td>Certificate revalidation</td><td>${cr.new_issues!=null?`${cr.new_issues} new issue(s) · ${cr.expiry_notices_7d||0} expiring ≤7d`:'—'}</td></tr>
        <tr><td>Evidence expiring (90d)</td><td>${(t.evidence_expiring||{}).expiring_90d ?? '—'}</td></tr>
        <tr><td>Reassessments due</td><td>${(t.reassessment_due||{}).reassessments_due ?? '—'}</td></tr></table>`
        :'<div class="muted">No monitoring run yet — click “Run monitoring now”.</div>'}`;
  }catch(e){ el.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}
async function monRunNow(){
  flash("Running monitoring sweeps…");
  try{ const r=await api2("/monitoring/run",{method:"POST",body:"{}"});
    flash(r.ok?"Monitoring run complete":"Monitoring run completed with errors"); monStatus();
  }catch(e){ flash(e.message); }
}
async function readAll(){ try{ await api("/notifications/read-all",{method:"POST",body:"{}"}); flash("All marked read"); V.notifications(); }catch(e){flash(e.message);} }
async function readOne(id){ try{ await api(`/notifications/${id}/read`,{method:"POST",body:"{}"}); V.notifications(); }catch(e){flash(e.message);} }

/* ---------- Admin ---------- */
function admToggle(k){
  const b=document.getElementById(k+"_body"); const c=document.getElementById(k+"_caret");
  if(!b) return; const open=b.style.display==="none";
  b.style.display=open?"block":"none";
  if(c) c.textContent=open?"▾ hide":"▸ show";
}
V.admin=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Administration</h1><div class="sub">AI integration, users, roles, webhooks & email</div></div></div>
    <div class="sec-h"><h2>AI integration</h2><div class="rule"></div></div>
    <div class="card" style="margin-bottom:8px"><div class="card-label">Provider API keys</div>
      <p class="muted" style="font-size:12px;margin-bottom:8px">Enter the keys to enable live AI. Applied immediately and stored in the system configuration (persists across restart). For production, prefer environment variables / a secret manager. Keys are write-only here — never echoed back.</p>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Anthropic (Claude)</label><input id="aik_anthropic" type="password" placeholder="sk-ant-…"></div>
        <div class="field"><label>OpenAI</label><input id="aik_openai" type="password" placeholder="sk-…"></div>
        <div class="field"><label>Grok (xAI)</label><input id="aik_grok" type="password" placeholder="xai-…"></div>
        <div class="field"><label>Manus</label><input id="aik_manus" type="password" placeholder="key…"></div>
        <div class="field"><label>NVIDIA (NIM / API Catalog)</label><input id="aik_nvidia" type="password" placeholder="nvapi-…"></div>
      </div>
      <button class="btn sm" style="margin-top:8px" onclick="saveAiKeys()">Save API keys</button></div>
    <div id="ai_status" class="muted">Loading…</div>
    <div id="ai_ledger"></div>
    <div class="sec-h"><h2>Roles &amp; permissions</h2><div class="rule"></div></div><div id="rt" class="muted">Loading…</div>
    <div class="sec-h"><h2>Webhooks</h2><div class="rule"></div></div>
    <div class="card" style="margin-bottom:8px"><div class="grid g2">
      <div class="field"><label>URL</label><input id="wh_url" placeholder="https://hooks.example/bro"></div>
      <div class="field"><label>Event</label><input id="wh_ev" value="*"></div></div>
      <button class="btn sm" onclick="addWebhook()">Add webhook</button></div>
    <div id="wt" class="muted">Loading…</div>
    <div class="sec-h"><h2>Email</h2><div class="rule"></div></div>
    <div class="card" style="margin-bottom:8px"><div class="grid g3">
      <div class="field"><label>To</label><input id="em_to" placeholder="vendor@x.com"></div>
      <div class="field"><label>Subject</label><input id="em_sub"></div>
      <div class="field"><label>Body</label><input id="em_body"></div></div>
      <button class="btn sm" onclick="sendEmail()">Send (SMTP or simulation)</button></div>
    <div id="eo" class="muted">Loading…</div>
    <div class="sec-h" onclick="admToggle('users')" style="cursor:pointer;user-select:none"><h2>Users <span id="users_caret" style="font-size:12px;color:var(--mute);font-weight:400">▸ show</span></h2><div class="rule"></div></div>
    <div id="users_body" style="display:none">
      <div style="margin-bottom:8px"><button class="btn sm" onclick="newUser()">+ New user</button></div>
      <div id="ut" class="muted">Loading…</div>
    </div>`;
  try{
    window._roles = await api("/admin/roles");
    const us=await api("/admin/users");
    view.querySelector("#ut").innerHTML=`<table><tr><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr>
      ${us.map(x=>`<tr><td><b>${esc(x.username)}</b></td><td>${esc(x.full_name||"")}</td>
        <td><span class="tag">${esc(x.role)}</span></td><td>${x.is_active?"✓":"—"}</td>
        <td style="text-align:right">
          <button class="btn sm ghost" onclick="editUser(${x.id},'${esc(x.role)}')">Edit role</button>
          ${x.username==="admin"?"":`<button class="btn sm ghost" onclick="deactivateUser(${x.id})">Deactivate</button>`}
        </td></tr>`).join("")}</table>`;
    view.querySelector("#rt").innerHTML=`<table><tr><th>Role</th><th>Permissions</th><th></th></tr>
      ${window._roles.map(r=>`<tr><td><b>${esc(r.label)}</b></td><td class="muted">${r.permissions.length} permissions</td>
        <td style="text-align:right"><button class="btn sm ghost" onclick="editRolePerms('${r.key}','${esc(r.label)}')">Edit permissions</button></td></tr>`).join("")}</table>`;
  }catch(e){ view.querySelector("#ut").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
  try{
    const ws=await api("/admin/webhooks");
    view.querySelector("#wt").innerHTML = ws.length?`<table><tr><th>URL</th><th>Event</th><th>Active</th><th></th></tr>
      ${ws.map(w=>`<tr><td>${esc(w.url)}</td><td><span class="tag">${esc(w.event)}</span></td><td>${w.active?"✓":"—"}</td>
        <td style="text-align:right"><button class="btn sm ghost" onclick="delWebhook(${w.id})">Delete</button></td></tr>`).join("")}</table>`
      :`<div class="card muted">No webhooks configured.</div>`;
  }catch(e){ view.querySelector("#wt").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
  try{
    const ob=await api("/email/outbox");
    view.querySelector("#eo").innerHTML = ob.length?`<table><tr><th>To</th><th>Subject</th><th>Mode</th></tr>
      ${ob.map(m=>`<tr><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td>${m.sent?'<span class="tag">sent</span>':'<span class="tag" style="background:#eee4d4;color:var(--amber)">simulation</span>'}</td></tr>`).join("")}</table>`
      :`<div class="card muted">Outbox empty.</div>`;
  }catch(e){ view.querySelector("#eo").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
  try{
    const ai=await api("/ai/status");
    const badge=ai.enabled?`<span class="tag" style="background:#e3efe6;color:var(--moss)">ENABLED · ${esc(ai.provider)} · ${esc(ai.model||"")}</span>`
      :`<span class="tag" style="background:#f6e2de;color:var(--rust)">DISABLED · deterministic-local</span>`;
    const provs=ai.providers||[];
    const enc=ai.secrets_encrypted?'<span class="tag" style="background:#e3efe6;color:var(--moss)">keys encrypted at rest</span>':'<span class="tag" style="background:#f3e7cf;color:#8a6116" title="Set the BRO_SECRET_KEY environment variable (any long random string) to encrypt stored provider keys">keys stored unencrypted — set BRO_SECRET_KEY</span>';
    const prod=ai.production_mode?'<span class="tag" style="background:#e3efe6;color:var(--moss)">production mode</span>':'';
    const opts=provs.map(p=>`<option value="${p.id}" ${ai.provider===p.id?'selected':''}>${esc(p.label)}</option>`).join("");
    const trow=p=>`<tr><td>${esc(p.label)}${p.custom?' <span class="tag" style="background:#e7e0f0;color:#5a4a86">custom</span>':''}
        <div class="muted" style="font-size:10.5px">${esc(p.base_url||(p.id==='claude'?'Anthropic SDK':'OpenAI SDK'))} · ${esc(p.model||'')}</div></td>
      <td>${p.key_present?'<span class="chk" style="color:var(--moss)">✓ set</span>':'<span class="muted">not set</span>'}</td>
      <td><button class="btn sm ghost" onclick="testAiProvider('${p.id}')">Test</button> <span id="ait_${p.id}" class="muted" style="font-size:11px"></span>${p.custom?` <button class="btn sm ghost" style="color:var(--rust)" onclick="delCustomProvider('${p.id}')">Remove</button>`:''}</td></tr>`;
    document.getElementById("ai_status").innerHTML=`<div class="card">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">${badge} ${enc} ${prod}
        <label class="muted" style="font-size:12px">Active provider</label>
        <select id="ai_prov" style="max-width:220px">${opts}</select>
        <button class="btn sm" onclick="setAiProvider()">Set active</button></div>
      <table><tr><th>Provider</th><th>Key present?</th><th>Connectivity test</th></tr>
        ${provs.map(trow).join("")}</table>
      <div class="card" style="margin-top:12px;background:var(--soft)">
        <div class="card-label">Add a custom LLM provider (OpenAI-compatible)</div>
        <div class="grid g2" style="gap:10px">
          <div class="field"><label>Display name</label><input id="cp_label" placeholder="e.g. Together AI"></div>
          <div class="field"><label>Model</label><input id="cp_model" placeholder="e.g. meta-llama/Llama-3-70b"></div>
          <div class="field"><label>Base URL (…/v1)</label><input id="cp_base" placeholder="https://api.together.xyz/v1"></div>
          <div class="field"><label>API key</label><input id="cp_key" type="password" placeholder="key…"></div>
        </div>
        <button class="btn sm" style="margin-top:8px" onclick="addCustomProvider()">Add provider</button>
        <p class="muted" style="font-size:11px;margin-top:6px">Any OpenAI-compatible endpoint — Together, Fireworks, OpenRouter, a self-hosted vLLM or NVIDIA NIM, etc. Stored in system config; key is write-only.</p>
      </div>
      <p class="muted" style="margin-top:10px">Claude uses the Anthropic SDK; everything else — OpenAI, Grok (<code>api.x.ai/v1</code>), Manus, <b>NVIDIA</b> (<code>integrate.api.nvidia.com/v1</code>) and any custom provider — uses the OpenAI-compatible path. Keys persist encrypted in the system configuration when <code>BRO_SECRET_KEY</code> is set. Use <b>Test</b> to confirm a key; the live SDKs must be installed on the server.</p>
    </div>`;
    try{ const lg=await api("/ai/ledger");
      document.getElementById("ai_ledger").innerHTML=`<div class="card" style="margin-top:8px">
        <div class="card-label">AI call ledger <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">(metadata only — prompt/response content is never stored)</span></div>
        <div style="display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap">
          <span class="tag">${lg.today_count} calls today</span>
          <label class="muted" style="font-size:12px">Daily call budget</label>
          <input id="ai_budget" type="number" min="0" style="max-width:110px" value="${lg.daily_budget||''}" placeholder="no cap">
          <button class="btn sm ghost" onclick="saveAiBudget()">Save cap</button></div>
        ${lg.recent.length?`<table><tr><th>When (UTC)</th><th>Provider</th><th>Domain</th><th>ms</th><th>Chars in/out</th><th>Status</th></tr>
          ${lg.recent.slice(0,10).map(r=>`<tr><td class="muted" style="font-size:11px">${esc(r.ts||"")}</td><td>${esc(r.provider||"")}</td><td>${esc(r.domain||"")}</td><td>${r.duration_ms??""}</td><td class="muted">${r.prompt_chars??0} / ${r.response_chars??0}</td><td>${r.success?'<span style="color:var(--moss)">✓</span>':`<span style="color:var(--rust)" title="${esc(r.error||"")}">✗</span>`}</td></tr>`).join("")}</table>`
          :`<div class="muted" style="font-size:12px">No AI calls recorded yet — the ledger fills as live AI features run.</div>`}</div>`;
    }catch(e){}
  }catch(e){ document.getElementById("ai_status").innerHTML=`<div class="muted" style="font-size:12px">AI status unavailable.</div>`; }
};
async function newUser(){
  const roles=window._roles||await api("/admin/roles");
  modal(`<h3>New user</h3>
    <div class="field"><label>Username</label><input id="u_un"></div>
    <div class="field"><label>Full name</label><input id="u_fn"></div>
    <div class="field"><label>Password</label><input id="u_pw" type="password"></div>
    <div class="field"><label>Role</label><select id="u_role">${roles.map(r=>`<option value="${r.key}">${esc(r.label)}</option>`).join("")}</select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveUser()">Create</button></div>`); }
async function saveUser(){
  try{ await api("/admin/users",{method:"POST",body:JSON.stringify({
    username:val("u_un"),full_name:val("u_fn"),password:val("u_pw"),role_key:val("u_role")})});
    closeModal(); flash("User created"); V.admin();
  }catch(e){ flash(e.message); } }
function editUser(id,current){
  const roles=window._roles||[];
  modal(`<h3>Edit user role</h3>
    <div class="field"><label>Role</label><select id="eu_role">
      ${roles.map(r=>`<option value="${r.key}" ${r.key===current?"selected":""}>${esc(r.label)}</option>`).join("")}</select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveUserRole(${id})">Save</button></div>`); }
async function saveUserRole(id){
  try{ await api("/admin/users/"+id,{method:"PATCH",body:JSON.stringify({role_key:val("eu_role")})});
    closeModal(); flash("User role updated"); V.admin();
  }catch(e){ flash(e.message); } }
async function deactivateUser(id){
  try{ await api("/admin/users/"+id,{method:"DELETE"}); flash("User deactivated"); V.admin();
  }catch(e){ flash(e.message); } }
async function editRolePerms(key,label){
  const all=await api("/admin/permissions");
  const role=(window._roles||[]).find(r=>r.key===key);
  const have=new Set(role?role.permissions:[]);
  const byCat={}; all.forEach(p=>{(byCat[p.category]=byCat[p.category]||[]).push(p)});
  const body=Object.entries(byCat).map(([cat,ps])=>`<div style="margin-bottom:8px"><b style="font-size:12px">${esc(cat)}</b><br>
    ${ps.map(p=>`<label style="display:inline-flex;align-items:center;gap:5px;margin:3px 10px 3px 0;font-weight:400">
      <input type="checkbox" style="width:auto" value="${p.key}" ${have.has(p.key)?"checked":""}> ${esc(p.key)}</label>`).join("")}</div>`).join("");
  modal(`<h3>Permissions — ${esc(label)}</h3><div style="max-height:50vh;overflow:auto">${body}</div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveRolePerms('${key}')">Save permissions</button></div>`); }
async function saveRolePerms(key){
  const keys=[...document.querySelectorAll('.modal input[type=checkbox]:checked')].map(c=>c.value);
  try{ await api(`/admin/roles/${key}/permissions`,{method:"PUT",body:JSON.stringify({permission_keys:keys})});
    closeModal(); flash("Permissions updated"); V.admin();
  }catch(e){ flash(e.message); } }
async function addWebhook(){
  try{ await api("/admin/webhooks",{method:"POST",body:JSON.stringify({url:val("wh_url"),event:val("wh_ev")})});
    flash("Webhook added"); V.admin();
  }catch(e){ flash(e.message); } }
async function delWebhook(id){
  try{ await api("/admin/webhooks/"+id,{method:"DELETE"}); flash("Webhook deleted"); V.admin();
  }catch(e){ flash(e.message); } }
async function sendEmail(){
  try{ const r=await api("/email/send",{method:"POST",body:JSON.stringify({
    to_addr:val("em_to"),subject:val("em_sub"),body:val("em_body")})});
    flash(`Email ${r.mode==='smtp'?'sent':'queued (simulation)'}`); V.admin();
  }catch(e){ flash(e.message); } }
async function saveAiKeys(){
  const body={anthropic:val("aik_anthropic"),openai:val("aik_openai"),grok:val("aik_grok"),manus:val("aik_manus"),nvidia:val("aik_nvidia")};
  if(!Object.values(body).some(v=>v&&v.trim())){ flash("Enter at least one key"); return; }
  try{ await api("/ai/keys",{method:"POST",body:JSON.stringify(body)});
    flash("API keys saved"); V.admin();
  }catch(e){ flash(e.message); } }
async function addCustomProvider(){
  const label=val("cp_label"),base_url=val("cp_base"),model=val("cp_model"),api_key=val("cp_key");
  if(!(label&&base_url&&model)){ flash("Name, base URL and model are required"); return; }
  try{ await api("/ai/custom-provider",{method:"POST",body:JSON.stringify({label,base_url,model,api_key})});
    flash("Custom provider added"); V.admin();
  }catch(e){ flash(e.message); } }
async function delCustomProvider(id){
  if(!confirm("Remove custom provider \""+id+"\"?")) return;
  try{ await api("/ai/custom-provider/"+id+"/delete",{method:"POST",body:"{}"});
    flash("Provider removed"); V.admin();
  }catch(e){ flash(e.message); } }
async function saveAiBudget(){
  const v=val("ai_budget");
  try{ await api("/ai/budget",{method:"POST",body:JSON.stringify({daily_calls:v?parseInt(v):null})});
    flash(v?("Daily AI budget set to "+v+" calls"):"Daily AI budget removed"); }
  catch(e){ flash(e.message); } }
async function setAiProvider(){
  const p=val("ai_prov"); try{ await api("/ai/provider",{method:"POST",body:JSON.stringify({provider:p})});
    flash("Active provider set to "+p); V.admin();
  }catch(e){ flash(e.message); } }
async function testAiProvider(p){
  const el=document.getElementById("ait_"+p); if(el){ el.textContent="testing…"; el.className="muted"; el.style.fontSize="11px"; }
  try{ const r=await api("/ai/test/"+p,{method:"POST",body:"{}"});
    if(el){ if(r.ok){ el.textContent="✓ "+(r.reply||"OK"); el.style.color="var(--moss)"; }
      else { el.textContent="✗ "+(r.error||"failed"); el.style.color="var(--rust)"; } }
  }catch(e){ if(el){ el.textContent="✗ "+e.message; el.style.color="var(--rust)"; } } }

/* ---------- Lifecycle (certs, evidence, reassessment, 4th parties, acceptances) ---------- */
V.lifecycle=async()=>{
  const view=document.getElementById("view");
  window._vendors = await api("/vendors").catch(()=>[]);
  view.innerHTML=`<div class="top"><div><h1>Lifecycle</h1><div class="sub">Evidence, reassessment, 4th parties</div></div></div>
    <div class="sec-h"><h2>Evidence expiring (next 90 days)</h2><div class="rule"></div></div><div id="lc_ev" class="muted">Loading…</div>
    <div class="sec-h"><h2>4th-party concentration</h2><div class="rule"></div></div><div id="lc_4p" class="muted">Loading…</div>
    <div class="sec-h"><h2>Reassessments</h2><div class="rule"></div></div>
    <div class="card"><button class="btn sm" onclick="runDue()">Run due (tier cadence)</button></div>
    <div class="sec-h"><h2>Certifications</h2><div class="rule"></div></div>
    <div class="card"><div class="grid g3">
      <div class="field"><label>Vendor</label><select id="ct_v">${(window._vendors||[]).map(v=>`<option value="${v.vendor_id}">${esc(v.name)}</option>`).join("")||'<option>(no vendors)</option>'}</select></div>
      <div class="field"><label>Certification</label><input id="ct_n" placeholder="ISO 27001"></div>
      <div class="field"><label>Valid until</label><input id="ct_d" type="date"></div></div>
      <button class="btn sm" onclick="addCert()">Add certification</button></div>`;
  try{
    const ev=await api("/evidence/expiring");
    view.querySelector("#lc_ev").innerHTML = ev.length?`<table><tr><th>Document</th><th>Next validation</th><th></th></tr>
      ${ev.map(d=>`<tr><td>${esc(d.name)}</td><td>${esc(d.next_validation||"")}</td>
        <td style="text-align:right"><button class="btn sm ghost" onclick="chase(${d.document_id})">Chase renewal</button></td></tr>`).join("")}</table>`
      :`<div class="card muted">Nothing expiring soon.</div>`;
  }catch(e){ view.querySelector("#lc_ev").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
  try{
    const fp=await api("/fourth-parties/concentration");
    view.querySelector("#lc_4p").innerHTML = fp.length?`<table><tr><th>4th party</th><th>Vendor</th></tr>
      ${fp.map(f=>`<tr><td><b>${esc(f.name)}</b></td><td>#${f.vendor_id}</td></tr>`).join("")}</table>`
      :`<div class="card muted">No concentration flags.</div>`;
  }catch(e){ view.querySelector("#lc_4p").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function chase(id){ try{ const r=await api(`/evidence/${id}/chase`,{method:"POST",body:"{}"});
  flash(`Renewal chased (${r.mode})`); }catch(e){flash(e.message);} }
async function runDue(){ try{ const r=await api("/reassessments/run-due",{method:"POST",body:"{}"});
  flash(`${r.created} reassessment(s) created`); }catch(e){flash(e.message);} }
async function addCert(){
  const d=val("ct_d");
  const body={vendor_id:parseInt(val("ct_v")),name:val("ct_n")};
  if(d) body.valid_until=d+"T00:00:00";
  try{ await api("/certifications",{method:"POST",body:JSON.stringify(body)});
    flash("Certification added");
  }catch(e){ flash(e.message); } }

/* ---------- Review Queue (Assessor) ---------- */
V.review=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Review Queue</h1><div class="sub">HIGH / ELEVATED engagements awaiting Assessor sign-off</div></div></div><div id="rq" class="muted">Loading…</div>`;
  try{ const q=await api("/review-queue");
    view.querySelector("#rq").innerHTML = q.length?`<table><tr><th>ID</th><th>Title</th><th>Residual</th><th>Decision</th><th></th></tr>
      ${q.map(e=>`<tr><td>#${e.engagement_id}</td><td>${esc(e.title)}</td>
        <td><span class="band ${e.residual_band}">${e.residual_band}</span></td><td>${esc(e.decision||"—")}</td>
        <td style="text-align:right">
          <button class="btn sm" onclick="signoff(${e.engagement_id},'approved')">Sign off</button>
          <button class="btn sm ghost" onclick="signoff(${e.engagement_id},'returned')">Return</button>
          <button class="btn sm ghost" onclick="overrideEng(${e.engagement_id})">Override</button>
        </td></tr>`).join("")}</table>`
      :`<div class="card muted">Nothing awaiting review.</div>`;
  }catch(e){ view.querySelector("#rq").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function signoff(id,decision){ try{ await api(`/engagements/${id}/signoff`,{method:"POST",
    body:JSON.stringify({decision})}); flash(`Engagement ${decision}`); V.review(); }catch(e){flash(e.message);} }
function overrideEng(id){ modal(`<h3>Override decision — #${id}</h3>
  <p class="muted" style="margin-bottom:10px">Requires justification and a second approver (human-only).</p>
  <div class="field"><label>New band</label><select id="ov_b"><option>LOW</option><option>MODERATE</option><option>ELEVATED</option><option>HIGH</option></select></div>
  <div class="field"><label>Justification</label><textarea id="ov_r" rows="2"></textarea></div>
  <div class="field"><label>Second approver</label><input id="ov_a"></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn amber" onclick="saveOverride(${id})">Apply override</button></div>`); }
async function saveOverride(id){ try{ await api(`/engagements/${id}/override`,{method:"POST",
    body:JSON.stringify({band:val("ov_b"),reason:val("ov_r"),second_approver:val("ov_a")})});
  closeModal(); flash("Override applied"); V.review(); }catch(e){flash(e.message);} }

/* ---------- Governance (BIA, incidents, CAP, methodology, procurement) ---------- */
V.governance=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Governance</h1><div class="sub">CAP · methodology · incidents · procurement</div></div></div>
    <div class="sec-h"><h2>Corrective Action Plan</h2><div class="rule"></div></div><div id="gv_cap" class="muted">Loading…</div>
    <div class="sec-h"><h2>Methodology version</h2><div class="rule"></div></div>
    <div class="card"><div class="field" style="max-width:200px"><label>Version label</label><input id="gv_ver" placeholder="v2.1"></div>
      <button class="btn sm" onclick="setMeth()">Record version</button></div>
    <div class="sec-h"><h2>Procurement PO intake</h2><div class="rule"></div></div>
    <div class="card"><div class="grid g2"><div class="field"><label>Vendor name</label><input id="gv_po_v"></div>
      <div class="field"><label>Amount</label><input id="gv_po_a" type="number" value="50000"></div></div>
      <button class="btn sm" onclick="poIntake()">Ingest PO (straight-through)</button></div>`;
  try{ const cap=await api("/cap");
    view.querySelector("#gv_cap").innerHTML=`<div class="card"><b>${cap.open_actions}</b> open action(s).
      ${Object.entries(cap.by_severity||{}).map(([k,v])=>`<span class="tag" style="margin:3px">${esc(k)}: ${v}</span>`).join("")}</div>`;
  }catch(e){ view.querySelector("#gv_cap").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function setMeth(){ try{ await api("/methodology/version",{method:"POST",body:JSON.stringify({version:val("gv_ver")})});
  flash("Methodology version recorded"); }catch(e){flash(e.message);} }
async function poIntake(){ try{ const r=await api("/procurement/po",{method:"POST",
    body:JSON.stringify({vendor_name:val("gv_po_v"),amount:parseFloat(val("gv_po_a"))})});
  flash(`PO ingested → engagement #${r.engagement_id}`); }catch(e){flash(e.message);} }

/* ---------- Settings (profile + password) ---------- */
V.settings=async()=>{
  const view=document.getElementById("view");
  const me=await api("/me");
  view.innerHTML=`<div class="top"><div><h1>Settings</h1><div class="sub">Your profile, password and AI provider</div></div></div>
    <div class="grid g2">
      <div class="card"><h3 style="font-size:14px;margin-bottom:10px">Profile</h3>
        <div class="field"><label>Full name</label><input id="st_fn" value="${esc(me.full_name||"")}"></div>
        <div class="field"><label>Email</label><input id="st_em" value="${esc(me.email||"")}"></div>
        <button class="btn sm" onclick="saveProfile()">Save profile</button></div>
      <div class="card"><h3 style="font-size:14px;margin-bottom:10px">Change password</h3>
        <div class="field"><label>Current password</label><input id="st_cp" type="password"></div>
        <div class="field"><label>New password</label><input id="st_np" type="password"></div>
        <button class="btn sm" onclick="changePw()">Update password</button></div>
    </div>
    <div class="sec-h" style="margin-top:18px"><h2>AI provider</h2><div class="rule"></div></div>
    <div class="card">
      <div id="ai_status" class="muted" style="margin-bottom:12px">Checking AI status…</div>
      <div class="grid g3">
        <div class="field"><label>Provider</label>
          <select id="ai_prov"><option value="claude" selected>Claude (Anthropic)</option><option value="openai">OpenAI</option></select></div>
        <div class="field"><label>API key</label>
          <input id="ai_key" type="password" placeholder="sk-ant-… (paste your key)" autocomplete="off"></div>
        <div class="field"><label>Model (optional)</label>
          <input id="ai_model" list="ai_model_list" placeholder="leave blank for default (claude-sonnet-4-6)">
          <datalist id="ai_model_list"></datalist>
          <button class="btn ghost sm" style="margin-top:6px" onclick="loadAiModels()">Load available models</button>
          <span id="ai_model_note" class="muted" style="font-size:11px"></span></div>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn" onclick="saveAiKey()">Save &amp; activate</button>
        <button class="btn ghost" onclick="clearAiKey()">Disable / clear key</button>
        <button class="btn ghost" onclick="testAi()">Test AI</button>
      </div>
      <div id="ai_test_out" style="margin-top:10px"></div>
      </div>
      <p class="muted" style="margin-top:12px;font-size:12px">The key activates the live model for <b>this running session only</b>. It is held in memory, never written to disk, the database or the app files, and is cleared when the server restarts. When no key is set, the tested deterministic engines run. Treat the key like a password.</p>
    </div>`;
  refreshAiStatus();
};
function _aiStatusHtml(s){
  const keyed = s.claude_key_present||s.openai_key_present;
  if(keyed && s.sdk_installed===false){
    return `<span class="tag" style="background:#f6e2de;color:#8A2E3B">▲ KEY SET BUT SDK NOT INSTALLED</span>`
      + ` &nbsp; The provider library isn't installed on the server, so live calls fall back to the deterministic engine.`
      + ` Add <b>anthropic&gt;=0.40</b> to requirements.txt and redeploy.`;
  }
  const on=s.live_ready!==undefined ? s.live_ready : s.enabled;
  const err = s.last_error ? `<div class="note warn" style="margin-top:8px">⚠ Last AI call error: <b>${esc(s.last_error)}</b></div>` : "";
  return `<span class="tag" style="background:${on?'#e3efe6':'#eee'};color:${on?'#1A4D3C':'#666'}">${on?'● LIVE AI READY':'○ Deterministic engine (no key)'}</span>`
    + (on?` &nbsp; provider: <b>${esc(s.provider||'')}</b> · model: <b>${esc(s.model||'')}</b> · prompt caching: <b>${s.prompt_cache?'on':'off'}</b>`:'')
    + err;
}
async function refreshAiStatus(){
  try{ const s=await api("/ai/status"); const el=document.getElementById("ai_status"); if(el) el.innerHTML=_aiStatusHtml(s); }
  catch(e){ const el=document.getElementById("ai_status"); if(el) el.innerHTML=`<span class="muted">AI status unavailable: ${esc(e.message)}</span>`; }
}
async function saveAiKey(){
  const key=val("ai_key");
  if(!key){ flash("Paste an API key first"); return; }
  try{ const s=await api("/ai/key",{method:"POST",body:JSON.stringify({provider:val("ai_prov"),api_key:key,model:val("ai_model")})});
    document.getElementById("ai_key").value="";
    document.getElementById("ai_status").innerHTML=_aiStatusHtml(s);
    flash(s.enabled?"Live AI activated for this session":"Saved");
  }catch(e){ flash(e.message); }
}
async function clearAiKey(){
  try{ const s=await api("/ai/key/clear",{method:"POST",body:"{}"});
    document.getElementById("ai_status").innerHTML=_aiStatusHtml(s);
    flash("Key cleared — deterministic engine active");
  }catch(e){ flash(e.message); }
}
async function loadAiModels(){
  const note=document.getElementById("ai_model_note"); if(note) note.textContent=" loading…";
  try{ const r=await api("/ai/models");
    if(!r.available){ if(note) note.textContent=" — "+(r.error||"unavailable; save a key first"); return; }
    const dl=document.getElementById("ai_model_list");
    if(dl) dl.innerHTML=(r.models||[]).map(m=>`<option value="${esc(m)}">`).join("");
    if(note) note.textContent=` — ${(r.models||[]).length} model(s) available; pick one and Save`;
    const inp=document.getElementById("ai_model");
    if(inp && !inp.value && (r.models||[]).length) inp.value=r.models.find(m=>m.includes("sonnet"))||r.models[0];
  }catch(e){ if(note) note.textContent=" — "+e.message; }
}
async function testAi(){
  const out=document.getElementById("ai_test_out"); if(out) out.innerHTML='<span class="muted">Testing live AI call…</span>';
  try{ const r=await api("/ai/test",{method:"POST",body:"{}"});
    if(!r.live_ready){ out.innerHTML=`<div class="note warn">AI not live: ${esc(r.error||'')}</div>`; return; }
    const row=(label,ok,reply,err)=>`<div class="dossier-row"><span class="dk">${label} ${ok?'<span class="tag" style="background:#e3efe6;color:#1A4D3C">OK</span>':'<span class="tag" style="background:#f6e2de;color:#8A2E3B">FAILED</span>'}</span><span class="dv muted">${esc(ok?(reply||''):(err||'')).slice(0,140)}</span></div>`;
    out.innerHTML=`<div class="card"><div class="muted" style="font-size:11px">provider ${esc(r.provider||'')} · model ${esc(r.model||'')}</div>
      ${row("Basic completion",r.basic_ok,r.basic_reply,r.basic_error)}
      ${row("Web search (FDD/Reputation)",r.web_ok,r.web_reply,r.web_error)}</div>`;
  }catch(e){ out.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function saveProfile(){ try{ await api("/me",{method:"PATCH",body:JSON.stringify({full_name:val("st_fn"),email:val("st_em")})});
  flash("Profile saved"); }catch(e){flash(e.message);} }
async function changePw(){ try{ await api("/me/password",{method:"POST",
    body:JSON.stringify({current_password:val("st_cp"),new_password:val("st_np")})});
  flash("Password updated"); val("st_cp"); }catch(e){flash(e.message);} }

/* ---------- AI Assessment (conversational multi-agent) ---------- */
let _reg=null, _sid=null;
const AGENT_COLORS={bro:"#0F1419",scope:"#335577",infosec:"#1A4D3C",resilience:"#7A4F2E",
  privacy:"#5C3A6B",reputation:"#8A2E3B",compliance:"#2E4A5C",physical:"#4A4A4A",esg:"#3D6B3D",researcher:"#967037"};
V.assess=async()=>{
  const view=document.getElementById("view");
  if(!_reg){ try{ _reg=await api("/agent/registry"); }catch(e){ view.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; } }
  if(!_sid){ const s=await api("/agent/sessions",{method:"POST",body:JSON.stringify({})}); _sid=s.session_id; }
  view.innerHTML=`<div class="top"><div><h1>AI Assessment</h1><div class="sub">Conversational multi-agent · exposure first, controls second, verdict last</div></div>
    <button class="btn ghost" onclick="newAssess()">↺ New engagement</button>
    <button class="btn ghost" onclick="broInterimReport()">📄 PDF Report</button>
    <button class="btn" onclick="captureAssessment()">⤓ Capture to assessment</button></div>
    <div id="aiHealth"></div>
    <div class="chat-wrap">
      <div class="chat-rail" id="rail-left"></div>
      <div class="chat-main">
        <div class="chat-scroll" id="chat-scroll"></div>
        <div class="chat-input">
          <textarea id="chat-in" rows="2" placeholder="Type your reply… (@privacy to address a specialist)"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat();}"></textarea>
          <button class="btn" onclick="sendChat()">Send</button>
        </div>
      </div>
      <div class="chat-rail" id="rail-right"></div>
    </div>`;
  broAiHealth();
  await refreshChat();
};
async function broAiHealth(){
  const el=document.getElementById("aiHealth"); if(!el)return;
  try{
    const st=await api("/ai/status");
    if(st.live_ready){ el.innerHTML=`<div class="ai-banner ok">✓ AI engine live — ${esc(st.provider||'provider')} ${st.model?'· '+esc(st.model):''}. Specialists will respond with full reasoning.</div>`; }
    else{ const why=st.last_error||(st.provider?('provider '+st.provider+' not ready'):'no AI provider key configured'); el.innerHTML=`<div class="ai-banner warn">⚠ AI engine not live — ${esc(why)}. The platform runs deterministically; set <code>ANTHROPIC_API_KEY</code> on the server to enable live specialists. <a href="#" onclick="go('aicontrol');return false;">Open AI Control →</a></div>`; }
  }catch(e){ el.innerHTML=`<div class="ai-banner warn">⚠ Could not read AI status (${esc(e.message)}). Admin rights are needed to view AI health.</div>`; }
}
async function broInterimReport(){
  if(!_sid){ flash("Open an engagement first"); return; }
  flash("Building interim report…");
  try{
    const r=await api2("/agent/sessions/"+_sid+"/interim-report",{method:"POST"});
    const w=window.open("","_blank");
    if(!w){ flash("Allow pop-ups to view the report"); return; }
    w.document.write(r.html); w.document.close();
    setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} }, 600);
    flash("Interim report ready ("+r.ai_mode+") — "+r.documents+" doc(s), "+r.inputs+" input(s)");
  }catch(e){ flash(e.message); }
}
async function newAssess(){ const s=await api("/agent/sessions",{method:"POST",body:JSON.stringify({})}); _sid=s.session_id; await refreshChat(); flash("New engagement opened"); }
async function captureAssessment(){
  // map this conversation to an engagement and file a structured assessment record
  const engs=await api2("/engagements").catch(()=>[]);
  const opts=engs.map(e=>`<option value="${e.engagement_id}" data-v="${e.vendor_id}">${esc(e.engagement_id)} · ${esc(e.title)}</option>`).join("");
  modal(`<h3>Capture conversation to assessment</h3>
    <p class="muted" style="margin-bottom:10px">Files this chat as a structured AssessmentRecord mapped to an engagement. HIGH inherent auto-assigns an assessor.</p>
    <div class="field"><label>Engagement</label><select id="cap_e">${opts||'<option value="">(create a v2 engagement first)</option>'}</select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="doCapture()">Capture</button></div>`);
}
async function doCapture(){
  const sel=document.getElementById("cap_e"); const eid=sel.value;
  if(!eid){ flash("Pick an engagement (create one under Engagements/v2 first)"); return; }
  const vid=sel.selectedOptions[0]?.getAttribute("data-v")||null;
  try{ const r=await api2("/assessments/from-session",{method:"POST",body:JSON.stringify({session_id:_sid,engagement_id:eid,vendor_id:vid})});
    closeModal(); flash(`Captured → ${r.assessment_id} (${r.status})`);
  }catch(e){ flash(e.message); }
}
async function refreshChat(){
  const d=await api("/agent/sessions/"+_sid);
  // stage strip + agents (left rail)
  const stages=_reg.stages.map(s=>`<div class="ststep ${s.id===d.stage?'cur':s.id<d.stage?'done':''}">${esc(s.short)}</div>`).join("");
  const agents=Object.entries(_reg.agents).map(([id,a])=>`<div class="agent-row ${id===d.active_agent?'active':''}" style="${id===d.active_agent?'--apc:'+(AGENT_COLORS[id]||'#14302A'):''}">
    <div class="adot" style="background:${AGENT_COLORS[id]||'#444'}">${esc(a.name[0])}</div>
    <div style="flex:1"><div class="an">${esc(a.name)}</div><div class="at">${esc(a.title)}</div></div>
    ${id===d.active_agent?'<span class="speaking">● on call</span>':''}</div>`).join("");
  const dossier=Object.keys(d.dossier||{}).length?Object.entries(d.dossier).map(([k,v])=>`<div class="dossier-row"><span class="dk">${esc(k)}</span><span class="dv">${esc(String(v))}</span></div>`).join(""):'<div class="muted" style="font-size:11.5px">Facts appear here as the conversation unfolds.</div>';
  document.getElementById("rail-left").innerHTML=`<h4>Stage</h4><div class="stagestrip">${stages}</div>
    <h4>Team on call</h4>${agents}<h4 style="margin-top:12px">Dossier</h4>${dossier}`;
  // messages
  const scroll=document.getElementById("chat-scroll");
  scroll.innerHTML=d.messages.map(m=>{
    if(m.role==="system") return `<div class="cmsg"><div class="cbub sys">${md1(m.body)}</div></div>`;
    if(m.role==="user") return `<div class="cmsg user"><div class="cbub user">${md1(m.body)}</div></div>`;
    const a=_reg.agents[m.agent]||{name:"?",title:""};
    const ac=AGENT_COLORS[m.agent]||'#444';
    return `<div class="cmsg"><div class="adot persona" style="background:${ac}">${esc(a.name[0])}</div>
      <div style="flex:1"><div class="persona-hdr"><span class="persona-name" style="color:${ac}">${esc(a.name)}</span><span class="persona-title">${esc(a.title)}</span></div>
      <div class="cbub agent" style="border-left:3px solid ${ac}">${md1(m.body)}</div></div></div>`;
  }).join("");
  if(d.stage===0 && !d.messages.some(m=>m.role==='user')){ scroll.innerHTML = broStage0Panel() + scroll.innerHTML; }
  scroll.scrollTop=scroll.scrollHeight;
  // right rail: insights + learnings
  const ins=(d.insights||[]).length?d.insights.map(i=>`<div class="insight ${esc(i.severity)}">
    <div class="ik">${i.kind==='contradiction'?'Contradiction':'Practicality flag'}</div>${esc(i.detail)}</div>`).join(""):'<div class="muted" style="font-size:11.5px">Sara checks every answer for contradictions. Findings appear here.</div>';
  const lrn=(d.learnings||[]).length?d.learnings.map(l=>`<div class="learn">${esc(l.text)}</div>`).join(""):'<div class="muted" style="font-size:11.5px">No calibration yet. Use Feedback to teach the team.</div>';
  document.getElementById("rail-right").innerHTML=`<h4>Background checks</h4>${ins}
    <h4 style="margin-top:14px">Calibrated learnings</h4>${lrn}
    <button class="btn sm ghost" style="margin-top:8px;width:100%" onclick="feedbackModal()">◐ Feedback</button>`;
}
/* ---------- BRO Chat Stage 0: PR pull + similarity + ProAssess hand-off ---------- */
function broStage0Panel(){
  return `<div class="cmsg"><div class="cbub agent" style="max-width:100%">
    <p style="font-weight:700;font-size:14px;margin-bottom:10px">Give me your PR number and I'll pull everything from the purchasing systems. Then drop in any documents you have — proposal, quote, system design, emails, anything. I'll analyse it all and ask you the minimum possible questions.</p>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin:0"><label style="font-size:11px">PR number</label><input id="bro_pr" placeholder="e.g. PR-48217" style="max-width:200px"></div>
      <button class="btn sm" onclick="broPull()">Pull from purchasing</button>
      <label class="btn sm ghost" style="cursor:pointer;margin:0">📎 Drop documents<input type="file" id="bro_docs" multiple style="display:none" onchange="broDocs()"></label>
    </div>
    <div id="bro_pulled" style="margin-top:10px"></div>
  </div></div>`;
}
function broDocs(){ const f=document.getElementById("bro_docs"); window._broDocs=[...f.files].map(x=>x.name);
  flash(f.files.length+" document(s) attached — I'll analyse them"); }
async function broPull(){
  const pr=val("bro_pr"); if(!pr){ flash("Enter a PR number"); return; }
  const out=document.getElementById("bro_pulled"); out.innerHTML='<span class="muted"><span class="pa-spin"></span> Pulling from purchasing systems…</span>';
  try{ const r=await api2("/procurement/pr-pull",{method:"POST",body:JSON.stringify({pr_number:pr})});
    window._broCtx={pr:r.pr_number,vendor_id:r.vendor_id,vendor_name:r.vendor_name,scope:r.scope,value:r.annual_value,documents:r.documents};
    out.innerHTML=`<div class="card"><div class="card-label">Pulled from purchasing · ${esc(r.pr_number)}</div>
      <div class="dossier-row"><span class="dk">Supplier</span><span class="dv">${esc(r.vendor_name)}${r.vendor_id?` <span class="muted">(${esc(r.vendor_id)})</span>`:''}</span></div>
      <div class="dossier-row"><span class="dk">Scope</span><span class="dv">${esc(r.scope)}</span></div>
      <div class="dossier-row"><span class="dk">Annual value</span><span class="dv">£${(r.annual_value||0).toLocaleString()}</span></div>
      <div class="dossier-row"><span class="dk">Documents</span><span class="dv">${(r.documents||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join(" ")}</span></div>
      <button class="btn sm" style="margin-top:8px" onclick="broCheckSimilar()">Analyse &amp; check for similar engagements</button>
      <div id="bro_similar" style="margin-top:8px"></div></div>`;
  }catch(e){ out.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function broCheckSimilar(){
  const c=window._broCtx||{}; const out=document.getElementById("bro_similar");
  out.innerHTML='<span class="muted"><span class="pa-spin"></span> Checking the Vendor &amp; Entity database for similar engagements…</span>';
  try{ const r=await api2("/engagements/similar",{method:"POST",body:JSON.stringify({entity:c.vendor_name,scope:c.scope})});
    if(!r.matches.length){ out.innerHTML='<div class="note ok">No similar engagement on record — proceeding fresh. Tell me about the engagement below and I\'ll keep questions to a minimum.</div>'; return; }
    out.innerHTML=`<div class="note ${r.very_similar?'warn':''}">${r.very_similar?'<b>A very similar engagement already exists.</b> Confirm the scope below — or reuse it via ProAssess.':'Possibly related engagements found — please confirm the scope matches.'}</div>
      <div class="card">${r.matches.map(m=>`<div class="dossier-row"><span class="dk"><b>${esc(m.vendor_name)}</b> · ${esc(m.engagement_id)}<br><span class="muted" style="font-size:11px">${esc(m.title||'')} · ${esc(m.stage||'')}${m.residual_band?' · residual '+m.residual_band:''}</span></span><span class="dv"><span class="tag">${Math.round(m.score*100)}% match</span></span></div>`).join("")}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn sm ghost" onclick="broConfirmContinue()">Confirm scope &amp; continue here</button>
        ${r.very_similar?`<button class="btn sm" onclick="broUseProAssess()">⚡ Use ProAssess — reuse everything submitted</button>`:''}
      </div>`;
  }catch(e){ out.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function broConfirmContinue(){ flash("Scope confirmed — continue below; I'll ask minimal questions."); }
function broUseProAssess(){
  const c=window._broCtx||{}; const docs=(window._broDocs||c.documents||[]);
  window._proassessSeed={
    free_text:`PR ${c.pr||''} — ${c.vendor_name||''}. Scope: ${c.scope||''}. Annual value: £${c.value||''}. Documents available: ${docs.join(", ")}.`,
    vendor_id:c.vendor_id||"", vendor_name:c.vendor_name||"", title:`${c.vendor_name||'Engagement'} — ${c.pr||''}`};
  goTo('proassess');
}

async function sendChat(){
  const t=document.getElementById("chat-in"); const msg=t.value.trim(); if(!msg)return;
  t.value=""; let agent=null;
  const m=msg.match(/^@(\w+)/); let body=msg;
  if(m){ const name=m[1].toLowerCase(); const found=Object.entries(_reg.agents).find(([id,a])=>id===name||a.name.toLowerCase()===name); if(found){agent=found[0];body=msg.replace(/^@\w+\s*/,"");} }
  try{ await api("/agent/send",{method:"POST",body:JSON.stringify({session_id:_sid,message:body,agent})}); await refreshChat(); }
  catch(e){ flash(e.message); }
}
function feedbackModal(){
  const agents=Object.entries(_reg.agents).map(([id,a])=>`<option value="${id}">${esc(a.name)}</option>`).join("");
  const issues=["Asked a question we'd already answered","Missed a contradiction","Wrong agent took the lead","Score floor not applied","Too eager to advance","Too cautious"];
  modal(`<h3>Calibrate this stage</h3>
    <p class="muted" style="margin-bottom:10px">Your feedback becomes a binding learning for every future engagement.</p>
    <div class="field"><label>Rating (1–5)</label><select id="fb_r"><option>1</option><option>2</option><option>3</option><option>4</option><option selected>5</option></select></div>
    <div class="field"><label>Which agent?</label><select id="fb_a">${agents}</select></div>
    <div class="field"><label>What happened?</label><select id="fb_i"><option value="">—</option>${issues.map(i=>`<option>${esc(i)}</option>`).join("")}</select></div>
    <div class="field"><label>Note (optional)</label><textarea id="fb_n" rows="2"></textarea></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveFeedback()">Save learning</button></div>`);
}
async function saveFeedback(){
  try{ await api("/agent/learnings",{method:"POST",body:JSON.stringify({
    rating:parseInt(val("fb_r")),agent:val("fb_a"),issue:val("fb_i"),note:val("fb_n"),stage:0})});
    closeModal(); flash("Calibration captured"); await refreshChat();
  }catch(e){ flash(e.message); }
}
// minimal markdown for chat (bold, code, line breaks)
function md1(s){ return esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\n/g,"<br>"); }

/* ---------- Assessments Data ---------- */
let _asmFilter={status:"",inherent:"",q:""};
V.assessments=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Assessments</h1><div class="sub">Structured assessment records · mapped to engagements</div></div></div>
    <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      <div class="field" style="margin:0;min-width:160px"><label style="font-size:11px">Status</label><select onchange="_asmFilter.status=this.value;asmFilterRender()"><option value="">All</option>${["Drafted","In-Progress","Completed","Approved","Recalled"].map(x=>`<option ${_asmFilter.status===x?'selected':''}>${x}</option>`).join("")}</select></div>
      <div class="field" style="margin:0;min-width:150px"><label style="font-size:11px">Inherent band</label><select onchange="_asmFilter.inherent=this.value;asmFilterRender()"><option value="">All</option>${["HIGH","ELEVATED","MODERATE","LOW"].map(x=>`<option ${_asmFilter.inherent===x?'selected':''}>${x}</option>`).join("")}</select></div>
      <div class="field" style="margin:0;flex:1;min-width:180px"><label style="font-size:11px">Search (ID, engagement, assessor)</label><input id="asm_q" value="${esc(_asmFilter.q)}" oninput="_asmFilter.q=this.value;asmFilterRender()" placeholder="type to filter…"></div>
      <button class="btn sm ghost" onclick="_asmFilter={status:'',inherent:'',q:''};V.assessments()">Clear</button>
    </div>
    <div id="at2" class="muted">Loading…</div>`;
  try{ window._asmRows=await api2("/assessments"); asmFilterRender(); }
  catch(e){ view.querySelector("#at2").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
function asmFilterRender(){
  const el=document.getElementById("at2"); if(!el)return; const f=_asmFilter; const q=(f.q||"").toLowerCase();
  const rows=(window._asmRows||[]).filter(a=>(!f.status||a.status===f.status)&&(!f.inherent||a.inherent_band===f.inherent)
    &&(!q||(a.assessment_id+' '+(a.engagement_id||'')+' '+(a.assessor_user||'')).toLowerCase().includes(q)));
  el.innerHTML = rows.length?`<div class="muted" style="font-size:11px;margin-bottom:6px">${rows.length} of ${(window._asmRows||[]).length} assessments</div>
    <table><tr><th>Assessment ID</th><th>Engagement</th><th>Inherent</th><th>Status</th><th>Assessor</th><th>Locked</th><th></th></tr>
      ${rows.map(a=>`<tr class="click" onclick="openAssessmentReview('${a.assessment_id}')"><td><b>${esc(a.assessment_id)}</b></td><td>${esc(a.engagement_id)}</td>
        <td>${a.inherent_band?`<span class="band ${a.inherent_band}">${a.inherent_band}</span>`:'—'}</td>
        <td><span class="tag">${esc(a.status)}</span></td>
        <td class="muted">${esc(a.assessor_user||'—')}${a.assessor_signed_off?' ✓':''}</td>
        <td>${a.locked?'🔒':'—'}</td>
        <td style="text-align:right">open review →</td></tr>`).join("")}</table>`
    :`<div class="card muted">No assessments match the filter.</div>`;
}
async function openAssessmentReview(aid){
  const view=document.getElementById("view");
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  view.innerHTML=`<div class="muted">Loading assessment…</div>`;
  let d; try{ d=await api2("/assessments/"+aid+"/review"); }catch(e){ view.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  const risks=(d.inherent.risks||[]), gaps=(d.gaps||[]), docs=(d.documents||[]), controls=(d.controls_assessed||[]);
  const bandPill=b=>b?`<span class="band ${b}">${b}</span>`:'—';
  view.innerHTML=`
    <div class="top"><div><h1 style="font-size:20px">Assessment review</h1>
      <div class="sub">${esc(d.assessment_id)} · engagement ${esc(d.engagement_id||'—')} · status ${esc(d.status)}${d.locked?' · 🔒 locked':''}</div></div>
      <div><button class="btn ghost" onclick="V.assessments()">← Assessments</button>
        ${d.can_assign?`<button class="btn ghost" onclick="asmAssign('${d.engagement_id}','${esc(d.assigned_assessor||'')}')">👤 ${d.assigned_assessor?'Reassign':'Assign'} assessor</button>`:''}
        ${d.can_approve?`<button class="btn" onclick="reviewApprove('${d.assessment_id}')">✓ Approve</button>`:(d.locked?'<span class="muted" style="font-size:12px">immutable</span>':'<span class="muted" style="font-size:12px">view only</span>')}</div></div>

    <div class="rev-grid">
      <div class="rev-panel"><h3>① Scope</h3>
        <div class="rev-row"><span class="rk">Service</span><span class="rv">${esc(d.scope.title||'—')}</span></div>
        <div class="rev-row"><span class="rk">Description</span><span class="rv">${esc(d.scope.service_description||'—')}</span></div>
        <div class="rev-row"><span class="rk">Data classification</span><span class="rv">${esc(d.scope.data_classification||'—')}</span></div>
        <div class="rev-row"><span class="rk">Critical</span><span class="rv">${d.scope.is_critical?'<span class="tag crit">CRITICAL</span>':'No'}</span></div>
      </div>
      <div class="rev-panel"><h3>② Inherent risk · ${bandPill(d.inherent.band)}</h3>
        ${risks.length?risks.map(r=>`<div class="rev-risk"><span class="v360-sevdot sev-${esc(r.severity||'Medium')}"></span><span style="flex:1">${esc(r.note||r.detail||'')}</span><span class="muted" style="font-size:11px">${esc(r.domain||'')}</span></div>`).join(""):'<div class="muted">No inherent risks recorded.</div>'}
      </div>
    </div>

    <div class="rev-panel" style="margin-bottom:14px"><h3>③ Controls assessed</h3>
      ${controls.length?controls.map(st=>`<div class="rev-stage"><div class="rev-stage-h">${esc(st.name||('Stage '+st.stage))}</div>
        ${(st.turns||[]).slice(0,6).map(t=>`<div class="rev-turn"><b>${esc(t.agent||t.role||'')}</b> ${esc((t.body||t.excerpt||'').slice(0,240))}</div>`).join("")}</div>`).join(""):'<div class="muted">No control dialogue captured. Controls assessed via DDQ where supplied.</div>'}
    </div>

    <div class="rev-panel" style="margin-bottom:14px">
      <div class="seg" style="margin-bottom:10px">
        <button id="asmtab_irq" class="on" onclick="asmReviewTab('irq')">IRQ — inherent risk questionnaire</button>
        <button id="asmtab_dd" onclick="asmReviewTab('dd')">Due diligence — questions reviewed</button>
      </div>
      <div id="asm_irq">${(d.irq||[]).length?`<table><tr><th>Question</th><th>Response</th></tr>${d.irq.map(q=>`<tr><td>${esc(q.question)}</td><td>${esc(String(q.answer))}</td></tr>`).join("")}</table>`:'<div class="muted">No IRQ responses captured for this assessment.</div>'}</div>
      <div id="asm_dd" style="display:none">${(d.due_diligence||[]).length?d.due_diligence.map(x=>`<div class="rev-turn"><b>${esc(x.area||'')}</b> ${esc((x.detail||'').slice(0,300))}${x.resolution?`<div class="muted" style="font-size:11px">Resolution: ${esc(x.resolution)}</div>`:''}</div>`).join(""):'<div class="muted">No due-diligence question review captured.</div>'}</div>
    </div>

    <div class="rev-panel" style="margin-bottom:14px"><h3>Documents available / referred (${(d.all_documents||docs).length})</h3>
      <div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px">
      ${(d.all_documents||docs).length?(d.all_documents||docs).map(x=>`<div class="rev-row"><span class="rk">${esc(x.title||x.artefact_id)} <span class="muted" style="font-size:10px">${esc(x.kind||'')}</span></span>
        <span class="rv">${x.doc_link?`<a href="${esc(x.doc_link)}" target="_blank">view</a>`:`<span class="tag">${esc(x.status||'on file')}</span>`}</span></div>`).join(""):'<div class="muted">No documents on file for this vendor.</div>'}
      </div>
    </div>

    ${(d.linked_findings||[]).length?`<div class="rev-panel" style="margin-bottom:14px"><h3>Linked findings (${d.linked_findings.length})</h3>
      ${d.linked_findings.map(f=>`<div class="rev-row"><span class="rk">${esc(f.finding_id)} · ${esc(f.title)}</span><span class="rv"><span class="tag">${esc(f.severity)}</span> <span class="tag">${esc(f.status)}</span> ${f.source==='AI'?'<span class="tag" style="background:#EEF3EC">AI</span>':''}</span></div>`).join("")}</div>`:''}

    <div class="rev-grid">
      <div class="rev-panel"><h3>④ Documents (${docs.length})</h3>
        ${docs.length?docs.map(x=>`<div class="rev-row"><span class="rk">${esc(x.title||x.artefact_id)} <span class="muted" style="font-size:10px">${esc(x.kind||'')}</span></span>
          <span class="rv">${x.doc_link?`<a href="${esc(x.doc_link)}" target="_blank">view</a>`:`<span class="tag">${esc(x.status||'on file')}</span>`}</span></div>`).join(""):'<div class="muted">No documents tagged to this vendor yet.</div>'}
      </div>
      <div class="rev-panel"><h3>⑤ Residual & recommendation · ${bandPill(d.residual.band)}</h3>
        <div class="rev-row"><span class="rk">Recommendation</span><span class="rv"><b>${esc(d.residual.recommendation||d.outcome||'—')}</b></span></div>
        ${d.residual.verdict?`<div class="rev-verdict">${esc(d.residual.verdict)}</div>`:''}
        ${gaps.length?`<div class="rev-gaps"><b>Gaps (resolved risk-averse):</b> ${gaps.map(g=>esc(g.issue||g.domain||'')).join("; ")}</div>`:''}
      </div>
    </div>
    <div class="muted" style="font-size:11px;text-align:center;padding:8px">Reviewer can examine scope, inherent risk, controls, documents and residual recommendation above before approving.</div>`;
}
async function reviewApprove(aid){
  if(!confirm("Approve this assessment? The record will be hard-locked and immutable.")) return;
  try{ await api2(`/assessments/${aid}/approve`,{method:"POST",body:"{}"}); flash("Approved — record hard-locked"); openAssessmentReview(aid); }catch(e){ flash(e.message); }
}
function asmReviewTab(t){ const irq=document.getElementById("asm_irq"),dd=document.getElementById("asm_dd");
  const bi=document.getElementById("asmtab_irq"),bd=document.getElementById("asmtab_dd");
  if(!irq||!dd)return; const on=t==='dd'; dd.style.display=on?'block':'none'; irq.style.display=on?'none':'block';
  bd.classList.toggle('on',on); bi.classList.toggle('on',!on); }
async function asmAssign(eid,current){
  let assessors=[]; try{ assessors=await api2("/assessors"); }catch(e){}
  modal(`<h3>Assign engagement to assessor</h3>
    <div class="muted" style="font-size:12px;margin-bottom:8px">Engagement ${esc(eid)} — the assessor may then modify this engagement's records; all others remain read-only to them.</div>
    <div class="field"><label>Assessor</label><select id="aa_u">${assessors.map(a=>`<option ${a.username===current?'selected':''}>${esc(a.username)}</option>`).join("")||'<option value="">— no assessors —</option>'}</select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="asmAssignSave('${eid}')">Assign</button></div>`);
}
async function asmAssignSave(eid){ const u=val("aa_u"); if(!u){flash("Pick an assessor");return;}
  try{ await api2(`/engagements/${eid}/assign`,{method:"POST",body:JSON.stringify({assessor_user:u})}); closeModal(); flash("Assigned to "+u); }catch(e){ flash(e.message); } }
async function asmSignoff(id){ try{ await api2(`/assessments/${id}/signoff`,{method:"POST",body:"{}"}); flash("Signed off"); V.assessments(); }catch(e){flash(e.message);} }
async function asmApprove(id){ try{ const r=await api2(`/assessments/${id}/approve`,{method:"POST",body:"{}"}); flash("Approved — record hard-locked"); V.assessments(); }catch(e){flash(e.message);} }
async function asmRecall(id){ try{ await api2(`/assessments/${id}/recall`,{method:"POST",body:"{}"}); flash("Recalled"); V.assessments(); }catch(e){flash(e.message);} }

/* ---------- Fourth Parties ---------- */
V.fourthparties=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Fourth Parties</h1><div class="sub">Sub-processors behind your vendors · concentration risk</div></div>
    <button class="btn" onclick="newFourth()">+ New fourth party</button></div><div id="fp" class="muted">Loading…</div>`;
  try{ const rows=await api2("/fourth-parties");
    view.querySelector("#fp").innerHTML = rows.length?`<table><tr><th>F4P ID</th><th>Name</th><th>Supports vendors</th><th>Concentration</th><th>Also a vendor</th></tr>
      ${rows.map(f=>`<tr class="click" onclick="openFourthParty('${f.fourth_party_id}')"><td><b>${esc(f.fourth_party_id)}</b></td><td>${esc(f.legal_name)}</td>
        <td>${(f.supports_vendors||[]).length}</td>
        <td>${f.concentration_flag?'<span class="tag crit">CONCENTRATION ≥3</span>':'<span class="muted">—</span>'}</td>
        <td class="muted">${esc(f.vendor_id||'—')} →</td></tr>`).join("")}</table>`
      :`<div class="card muted">No fourth parties yet.</div>`;
  }catch(e){ view.querySelector("#fp").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function openFourthParty(fpid){
  try{ const d=await api2("/fourth-parties/"+fpid+"/vendors");
    const list=d.vendors.length?d.vendors.map(v=>`<div class="dossier-row"><span class="dk"><b>${esc(v.legal_name)}</b> <span class="muted">· ${esc(v.vendor_id)}${v.tier?' · '+esc(v.tier):''}</span> ${v.is_critical?'<span class="tag crit">CRITICAL</span>':''}</span><span class="dv"><button class="btn sm ghost" onclick="closeModal();openVendorMaster('${v.vendor_id}')">Open vendor</button></span></div>`).join(""):'<span class="muted">No vendors recorded as relying on this fourth party.</span>';
    modal(`<h3>${esc(d.legal_name)} <span class="muted" style="font-size:12px">· ${esc(d.fourth_party_id)}</span></h3>
      <p class="muted" style="margin-bottom:8px">Supports <b>${d.supports_count}</b> vendor(s) ${d.concentration_flag?'<span class="tag crit">CONCENTRATION ≥3</span>':''}</p>
      <div class="card" style="max-height:50vh;overflow:auto">${list}</div>
      <div class="row"><button class="btn" onclick="closeModal()">Close</button></div>`);
  }catch(e){ flash(e.message); }
}
async function newFourth(){
  const vs=await api2("/vendors"); window._vendors=vs;
  const opts=vs.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("");
  modal(`<h3>New fourth party</h3>
    <div class="field"><label>Legal name</label><input id="f4_name"></div>
    <div class="field"><label>Service provided</label><input id="f4_svc"></div>
    <div class="field"><label>HQ country</label><input id="f4_country"></div>
    <div class="field"><label>Supports vendors (Ctrl/Cmd-click)</label><select id="f4_vs" multiple size="5" style="height:auto">${opts}</select></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveFourth()">Create</button></div>`); }
async function saveFourth(){
  const vids=[...document.getElementById("f4_vs").selectedOptions].map(o=>o.value);
  try{ const r=await api2("/fourth-parties",{method:"POST",body:JSON.stringify({
    legal_name:val("f4_name"),service_provided:val("f4_svc"),hq_country:val("f4_country"),vendor_ids:vids})});
    closeModal(); flash(`${r.fourth_party_id} created${r.concentration_flag?' — concentration flagged':''}`); V.fourthparties();
  }catch(e){ flash(e.message); } }

/* ---------- Artefacts ---------- */
V.artefacts=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Certificates</h1><div class="sub">Document-backed evidence · every record links its source document · revalidation engine</div></div>
    <button class="btn ghost" onclick="revalidate()">↻ Run revalidation</button>
    <button class="btn ghost" onclick="newArtefact()">+ Manual entry</button>
    <button class="btn" onclick="certUpload()">⤒ Upload documents</button></div><div id="ar" class="muted">Loading…</div>`;
  try{ const rows=await api2("/artefacts");
    view.querySelector("#ar").innerHTML = rows.length?`<table><tr><th>Certificate ID</th><th>Vendor</th><th>Name</th><th>Type</th><th>Expiry</th><th>Status</th><th>Via</th><th>Document</th></tr>
      ${rows.map(a=>`<tr style="${a.is_current?'':'opacity:.5'}"><td><b>${esc(a.artefact_id)}</b></td><td class="muted">${esc(a.vendor_id)}</td>
        <td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${esc(a.expiry_date||'—')}</td>
        <td>${a.status==='Expired'?`<span class="tag crit">Expired</span>`:a.status==='Expiring'?`<span class="tag" style="background:#f6ebda;color:var(--amber)">Expiring</span>`:`<span class="tag" style="background:#e3efe6;color:var(--moss)">Valid</span>`}</td>
        <td class="muted">${esc(a.received_via)}</td>
        <td>${a.doc_link?`<a href="${esc(a.doc_link)}" target="_blank" class="btn sm ghost">view</a>`:'<span class="muted" style="font-size:11px">—</span>'}</td></tr>`).join("")}</table>`
      :`<div class="card muted">No certificates yet. Use <b>Upload documents</b> to add certificates — each document is read automatically and filed with its source attached.</div>`;
  }catch(e){ view.querySelector("#ar").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function certUpload(){
  const vs=await api2("/vendors");
  const opts=vs.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("");
  modal(`<h3>Upload certificate documents</h3>
    <p class="muted" style="margin-bottom:8px">Select one or more documents. Each is read automatically — type, issue and expiry dates are extracted — and filed as a certificate with the document linked for viewing.</p>
    <div class="field"><label>Vendor</label><select id="cu_v">${opts||'<option value="">(create a vendor first)</option>'}</select></div>
    <div class="field"><label>Documents (multiple allowed)</label><input id="cu_files" type="file" multiple></div>
    <div id="cu_status" class="muted" style="font-size:12px"></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="certDoUpload()">Read &amp; file</button></div>`); }
async function certDoUpload(){
  const vid=val("cu_v"); const input=document.getElementById("cu_files");
  if(!vid){ flash("Pick a vendor"); return; }
  if(!input.files.length){ flash("Select at least one document"); return; }
  const st=document.getElementById("cu_status"); st.textContent="Reading documents…";
  const files=[];
  for(const f of input.files){
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
    files.push({filename:f.name,content_type:f.type||"application/octet-stream",data_b64:b64});
  }
  try{ const r=await api2("/certificates/ingest",{method:"POST",body:JSON.stringify({vendor_id:vid,files})});
    closeModal();
    const gaps=r.certificates.flatMap(c=>c.gaps||[]);
    flash(`${r.certificates.length} certificate(s) filed${gaps.length?' · '+gaps.length+' gap(s) flagged':''}`);
    V.artefacts();
  }catch(e){ st.textContent=e.message; } }
async function newArtefact(){
  const vs=await api2("/vendors");
  const opts=vs.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("");
  modal(`<h3>New artefact / certificate</h3>
    <div class="field"><label>Vendor</label><select id="ar_v">${opts||'<option>(create a vendor first)</option>'}</select></div>
    <div class="field"><label>Name</label><input id="ar_name" placeholder="ISO 27001 / SOC 2 Type II"></div>
    <div class="grid g2"><div class="field"><label>Type</label><select id="ar_type"><option>certificate</option><option>soc2</option><option>iso</option><option>other</option></select></div>
      <div class="field"><label>Expiry date</label><input id="ar_exp" type="date"></div></div>
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveArtefact()">Create</button></div>`); }
async function saveArtefact(){
  const exp=val("ar_exp");
  try{ const r=await api2("/artefacts",{method:"POST",body:JSON.stringify({
    vendor_id:val("ar_v"),name:val("ar_name"),artefact_type:val("ar_type"),
    expiry_date:exp?exp+"T00:00:00":null,received_via:"upload"})});
    closeModal(); flash(`${r.artefact_id} filed (${r.status})`); V.artefacts();
  }catch(e){ flash(e.message); } }
async function revalidate(){
  try{ const r=await api2("/artefacts/revalidate",{method:"POST",body:"{}"});
    flash(`Checked ${r.checked} · ${r.notify_7day.length} expiry notice(s) · ${r.new_issues.length} new issue(s)`); V.artefacts();
  }catch(e){ flash(e.message); } }

/* ---------- Issues Log ---------- */
V.issues=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Issues Log</h1><div class="sub">Certificates expired &gt;30 days · auto-closed on refresh or engagement close</div></div></div><div id="is" class="muted">Loading…</div>`;
  try{ const rows=await api2("/issues");
    view.querySelector("#is").innerHTML = rows.length?`<table><tr><th>Issue ID</th><th>Vendor</th><th>Vendor ID</th><th>Engagement ID</th><th>Artefact</th><th>Detail</th><th>Status</th></tr>
      ${rows.map(i=>`<tr style="${i.status==='Closed'?'opacity:.55':''}"><td><b>${esc(i.issue_id)}</b></td>
        <td>${esc(i.vendor_name)}</td><td class="muted" style="font-size:11px">${esc(i.vendor_id||'—')}</td>
        <td class="muted" style="font-size:11px">${i.engagement_id?esc(i.engagement_id):'—'}</td>
        <td class="muted">${esc(i.artefact_id||'—')}</td>
        <td>${esc(i.detail||'')}</td>
        <td>${i.status==='Open'?'<span class="tag crit">Open</span>':`<span class="muted">Closed · ${esc(i.closed_reason||'')}</span>`}</td></tr>`).join("")}</table>`
      :`<div class="card muted">No issues. Certificates expired over 30 days are logged here automatically by the revalidation engine.</div>`;
  }catch(e){ view.querySelector("#is").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};

/* ---------- Audit ---------- */
/* ---------- Management (Risk + Ops views + chat) ---------- */
let _mgmtView="supply";
V.management=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Management</h1><div class="sub">Portfolio risk &amp; operations · leadership view</div></div>
    <div><button class="btn sm ${_mgmtView==='supply'?'':'ghost'}" onclick="mgmtSwitch('supply')">Supply Chain</button>
    <button class="btn sm ${_mgmtView==='risk'?'':'ghost'}" onclick="mgmtSwitch('risk')">Risk View</button>
    <button class="btn sm ${_mgmtView==='ops'?'':'ghost'}" onclick="mgmtSwitch('ops')">Operations View</button>
    <button class="btn sm ${_mgmtView==='expired'?'':'ghost'}" onclick="mgmtSwitch('expired')">Expired Assessments</button></div></div>
    <div id="mgmt"></div>
    <div class="sec-h" style="margin-top:18px"><h2>Management Chat</h2><div class="rule"></div></div>
    <div id="mgmt_chips" style="margin-bottom:8px"></div>
    <div class="chat-input" style="border:1px solid var(--line);border-radius:10px">
      <textarea id="mq" rows="1" placeholder="Ask about the portfolio…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();askMgmt();}"></textarea>
      <button class="btn" onclick="askMgmt()">Ask</button></div>
    <div id="mgmt_ans"></div>`;
  try{
    const sug=await api2("/management/suggested");
    document.getElementById("mgmt_chips").innerHTML=sug.questions.map(q=>`<button class="btn sm ghost" style="margin:3px" onclick="askMgmtQ('${q.replace(/'/g,"")}')">${esc(q)}</button>`).join("");
  }catch(e){}
  mgmtRender();
};
function mgmtSwitch(v){ _mgmtView=v; V.management(); }
async function mgmtRender(){
  const el=document.getElementById("mgmt"); el.innerHTML='<div class="muted">Loading…</div>';
  try{
    if(_mgmtView==="risk"){
      const r=await api2("/management/risk-view");
      el.innerHTML=`<div class="grid g4">
        <div class="card stat"><div class="v">${r.totals.vendors}</div><div class="l">Vendors</div></div>
        <div class="card stat"><div class="v">${r.totals.critical_vendors}</div><div class="l">Critical (Tier 0)</div></div>
        <div class="card stat"><div class="v">${r.totals.engagements}</div><div class="l">Engagements</div></div>
        <div class="card stat"><div class="v">${r.totals.open_findings}</div><div class="l">Open findings</div></div></div>
        <div class="sec-h" style="margin-top:14px"><h2 style="font-size:14px">Residual distribution</h2><div class="rule"></div></div>
        <div class="grid g4">${["HIGH","ELEVATED","MODERATE","LOW"].map(b=>`<div class="card stat"><div class="v">${r.residual_distribution[b]||0}</div><div class="l"><span class="band ${b}">${b}</span></div></div>`).join("")}</div>
        <div class="grid g2" style="margin-top:14px">
          <div class="card"><h3 style="font-size:13px;margin-bottom:6px">HIGH / ELEVATED residual engagements</h3>
            ${r.high_residual_engagements.length?r.high_residual_engagements.map(e=>`<div class="dossier-row"><span class="dk">${esc(e.engagement_id)} · ${esc(e.title)}</span><span class="dv"><span class="band ${e.residual_band}">${e.residual_band}</span></span></div>`).join(""):'<span class="muted" style="font-size:12px">None</span>'}</div>
          <div class="card"><h3 style="font-size:13px;margin-bottom:6px">Fourth-party concentration · Certificate exposure</h3>
            <div class="dossier-row"><span class="dk">Concentration flags</span><span class="dv">${r.fourth_party_concentration.length}</span></div>
            <div class="dossier-row"><span class="dk">Expired certs</span><span class="dv">${r.certificate_status.Expired||0}</span></div>
            <div class="dossier-row"><span class="dk">Expiring ≤7d</span><span class="dv">${r.certificate_status.Expiring||0}</span></div>
            <div class="dossier-row"><span class="dk">Open issues</span><span class="dv">${r.open_issues}</span></div></div></div>`;
    } else if(_mgmtView==="ops"){
      const o=await api2("/management/ops-view");
      el.innerHTML=`<div class="grid g4">
        <div class="card stat"><div class="v">${o.actions.open}</div><div class="l">Open actions</div></div>
        <div class="card stat"><div class="v">${o.actions.closed}</div><div class="l">Closed actions</div></div>
        <div class="card stat"><div class="v">${o.locked_assessments}</div><div class="l">Approved (locked)</div></div>
        <div class="card stat"><div class="v">${o.awaiting_signoff.length}</div><div class="l">Awaiting sign-off</div></div></div>
        <div class="grid g2" style="margin-top:14px">
          <div class="card"><h3 style="font-size:13px;margin-bottom:6px">Assessment pipeline</h3>
            ${Object.keys(o.assessment_pipeline).length?Object.entries(o.assessment_pipeline).map(([k,v])=>`<div class="dossier-row"><span class="dk">${esc(k)}</span><span class="dv">${v}</span></div>`).join(""):'<span class="muted" style="font-size:12px">No assessments yet</span>'}</div>
          <div class="card"><h3 style="font-size:13px;margin-bottom:6px">Assessor workload · Engagement status</h3>
            ${Object.keys(o.assessor_workload).length?Object.entries(o.assessor_workload).map(([k,v])=>`<div class="dossier-row"><span class="dk">${esc(k)}</span><span class="dv">${v} open</span></div>`).join(""):'<span class="muted" style="font-size:12px">No assessors assigned</span>'}
            ${Object.entries(o.engagement_status).map(([k,v])=>`<div class="dossier-row"><span class="dk">Engagements ${esc(k)}</span><span class="dv">${v}</span></div>`).join("")}</div></div>`;
    } else if(_mgmtView==="supply"){
      const g=await api2("/management/concentration");
      el.innerHTML=`
        <div class="grid g4">
          <div class="card stat"><div class="v">${g.summary.vendors}</div><div class="l">Vendors</div></div>
          <div class="card stat"><div class="v">${g.summary.fourth_parties}</div><div class="l">Fourth parties</div></div>
          <div class="card stat"><div class="v">${g.summary.locations}</div><div class="l">Delivery locations</div></div>
          <div class="card stat"><div class="v">${g.summary.edges}</div><div class="l">Dependencies</div></div></div>
        <div class="sec-h" style="margin-top:16px"><h2 style="font-size:14px">Supply-chain concentration network</h2><div class="rule"></div></div>
        <div class="card"><div class="card-label">Hubs (large, red nodes) are shared dependencies many vendors funnel through — your concentration risks.</div>
          <div id="concGraph" style="width:100%;height:520px;overflow:hidden;position:relative"></div>
          <div class="conc-legend">
            <span><i class="cdot" style="background:#2563EB"></i> Vendor</span>
            <span><i class="cdot" style="background:#7C3AED"></i> Fourth party</span>
            <span><i class="cdot" style="background:#0E9F6E"></i> Delivery location</span>
            <span><i class="cdot" style="background:#DC2626"></i> High concentration</span>
          </div></div>
        ${g.hubs.length?`<div class="card" style="margin-top:12px"><h3 style="font-size:13px;margin-bottom:6px">Top concentration points</h3>
          ${g.hubs.map(h=>`<div class="dossier-row"><span class="dk">${esc(h.label)} <span class="muted" style="font-size:10px">${esc(h.kind.replace('_',' '))}</span></span>
            <span class="dv">${h.degree} vendors · <span class="band ${h.risk>=.66?'HIGH':h.risk>=.4?'ELEVATED':'MODERATE'}">${h.risk>=.66?'HIGH':h.risk>=.4?'ELEVATED':'MODERATE'}</span></span></div>`).join("")}</div>`:''}
        <div class="sec-h" style="margin-top:16px"><h2 style="font-size:14px">Supplier delivery locations</h2><div class="rule"></div></div>
        <div class="card"><div class="card-label">Geographic concentration — bubble size &amp; colour reflect how many engagements deliver from each country.</div>
          <div id="worldMap"></div></div>`;
      setTimeout(()=>{ drawConcGraph(g); drawWorldMap(g.locations); }, 30);
    } else if(_mgmtView==="expired"){
      const x=await api2("/reports/expired-assessments");
      const bandPill=b=>b?`<span class="band ${b}">${b}</span>`:"—";
      const cards=Object.entries(x.by_band||{}).map(([k,v])=>`<div class="card stat"><div class="v">${v}</div><div class="l">${esc(k)}</div></div>`).join("");
      el.innerHTML=`<div class="grid g4">
        <div class="card stat"><div class="v" style="color:#DC2626">${x.expired}</div><div class="l">Expired assessments</div></div>
        <div class="card stat"><div class="v">${x.total_with_due}</div><div class="l">Tracked (with due date)</div></div>
        <div class="card stat"><div class="v" style="font-size:18px">${esc(fmtDate(x.as_of))}</div><div class="l">As of</div></div>
        <div class="card stat"><div class="v">${x.total_with_due?Math.round(x.expired/x.total_with_due*100):0}%</div><div class="l">Portfolio overdue</div></div></div>
        ${cards?`<div class="sec-h" style="margin-top:14px"><h2 style="font-size:14px">Overdue by inherent severity</h2><div class="rule"></div></div><div class="grid g4">${cards}</div>`:""}
        <div class="sec-h" style="margin-top:14px"><h2 style="font-size:14px">Expired assessments · most overdue first</h2><div class="rule"></div></div>
        ${x.rows.length? `<table><tr><th>Engagement</th><th>Vendor</th><th>Inherent</th><th>Last assessed</th><th>Due</th><th>Overdue</th><th>Owner</th></tr>
          ${x.rows.map(r=>`<tr class="click" onclick="openEngagementRegister('${esc(r.engagement_id)}')">
            <td><b>${esc(r.engagement_id)}</b><div class="muted" style="font-size:11px">${esc(r.title||"")}</div></td>
            <td>${esc(r.vendor||r.vendor_id)}</td>
            <td>${bandPill(r.inherent_band)}${r.is_critical?' <span class="tag" style="background:#1E3A5C;color:#fff">critical</span>':''}</td>
            <td>${r.last_assessment_date?esc(fmtDate(r.last_assessment_date)):"—"}</td>
            <td>${r.next_assessment_due?esc(fmtDate(r.next_assessment_due)):"—"}</td>
            <td><span class="tag" style="background:#DC2626;color:#fff">${r.days_overdue!=null?r.days_overdue+"d":"—"}</span></td>
            <td>${esc(r.owner||"—")}</td></tr>`).join("")}</table>`
          : `<div class="card muted">No expired assessments — every tracked engagement is within its reassessment cadence.</div>`}`;
    }
  }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function askMgmtQ(q){ document.getElementById("mq").value=q; askMgmt(); }
let _mgmtHistory=[];
async function askMgmt(){
  const inp=document.getElementById("mq"); const q=(inp.value||"").trim(); if(!q)return;
  inp.value="";
  _mgmtHistory.push({q, a:null, pending:true});
  mgmtRenderThread();
  try{
    const r=await api2("/management/chat",{method:"POST",body:JSON.stringify({
      question:q, history:_mgmtHistory.filter(t=>t.a&&!t.pending).map(t=>({q:t.q,a:t.a}))})});
    const last=_mgmtHistory[_mgmtHistory.length-1];
    last.a=r.answer; last.pending=false; last.engine=r.engine;
    if(r.context) window._mgmtCtx=r.context;
    mgmtRenderThread();
  }catch(e){ const last=_mgmtHistory[_mgmtHistory.length-1]; last.a="⚠ "+e.message; last.pending=false; mgmtRenderThread(); }
}
function mgmtCtxStrip(){
  const c=window._mgmtCtx; if(!c) return "";
  const rd=(c.risks&&c.risks.residual_distribution)||{};
  const seg=(b,col)=>{ const n=rd[b]||0; return n?`<span style="background:${col};color:#fff;padding:2px 9px;border-radius:6px;font-size:11px;margin-right:4px;display:inline-block;margin-top:2px">${b} ${n}</span>`:""; };
  const he=(c.active_engagements&&c.active_engagements.high_elevated_residual)||[];
  return `<div class="card" style="margin-bottom:10px"><div class="card-label">Portfolio snapshot · live</div>
    <div class="grid g4" style="gap:8px">
      <div class="card stat"><div class="v">${c.vendors.total}</div><div class="l">Vendors · ${c.vendors.critical} critical</div></div>
      <div class="card stat"><div class="v">${c.active_engagements.count}</div><div class="l">Active engagements</div></div>
      <div class="card stat"><div class="v">${he.length}</div><div class="l">High/Elevated residual</div></div>
      <div class="card stat"><div class="v">${c.findings.open}</div><div class="l">Open findings</div></div>
    </div>
    <div style="margin-top:10px;font-size:12px"><span class="muted">Residual mix:</span> ${seg("HIGH","#DC2626")}${seg("ELEVATED","#F59E0B")}${seg("MODERATE","#2563EB")}${seg("LOW","#0E9F6E")||'<span class="muted">none scored yet</span>'}</div>
  </div>`;
}
function mgmtRenderThread(){
  const out=document.getElementById("mgmt_ans"); if(!out) return;
  out.innerHTML=mgmtCtxStrip()+_mgmtHistory.map((t,i)=>({t,i})).reverse().map(({t,i})=>`<div class="card" style="margin-top:8px">
    <div style="font-weight:600;color:#1A4D3C">Q&nbsp; ${esc(t.q)}</div>
    <div style="margin-top:6px">${t.pending?'<span class="muted"><span class="pa-spin"></span> Analysing Vendors · Active engagements · Risks · Findings…</span>':md1(t.a||"")}</div>
    ${(t.a&&!t.pending)?`<div class="muted" style="font-size:10px;margin-top:6px">${t.engine==='llm'?'AI · BCG-grade · PESTLE-aware':'deterministic'} · grounded in live data</div>${aiFeedbackBar('management',i,t.engine)}`:''}
  </div>`).join("");
}

/* ---------- Management (end) ---------- */
// CR: supply-chain concentration force-directed graph (vanilla SVG simulation)
const CONC_COLORS={vendor:"#2563EB",fourth_party:"#7C3AED",location:"#0E9F6E"};
function drawConcGraph(g){
  const host=document.getElementById("concGraph"); if(!host) return;
  const W=host.clientWidth||900, H=520;
  const nodes=g.nodes.map(n=>({...n, x:W/2+(Math.random()-.5)*W*0.6, y:H/2+(Math.random()-.5)*H*0.6, vx:0, vy:0}));
  const idx=Object.fromEntries(nodes.map((n,i)=>[n.id,i]));
  const links=g.edges.filter(e=>idx[e.source]!=null&&idx[e.target]!=null).map(e=>({s:idx[e.source],t:idx[e.target]}));
  // simple force simulation
  const K_rep=2400, K_spring=0.015, L=70, damp=0.86, center=0.004;
  for(let it=0;it<260;it++){
    for(let i=0;i<nodes.length;i++){
      const a=nodes[i];
      for(let j=i+1;j<nodes.length;j++){
        const b=nodes[j]; let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy||0.01; let d=Math.sqrt(d2);
        const f=K_rep/d2; const fx=f*dx/d, fy=f*dy/d;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      }
    }
    for(const lk of links){
      const a=nodes[lk.s], b=nodes[lk.t]; let dx=b.x-a.x, dy=b.y-a.y; let d=Math.sqrt(dx*dx+dy*dy)||0.01;
      const f=K_spring*(d-L); const fx=f*dx/d, fy=f*dy/d;
      a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
    }
    for(const n of nodes){
      n.vx+=(W/2-n.x)*center; n.vy+=(H/2-n.y)*center;
      n.vx*=damp; n.vy*=damp; n.x+=n.vx; n.y+=n.vy;
      n.x=Math.max(16,Math.min(W-16,n.x)); n.y=Math.max(16,Math.min(H-16,n.y));
    }
  }
  const riskColor=r=>r>=0.66?"#DC2626":r>=0.4?"#F59E0B":null;
  const svg=[`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">`];
  for(const lk of links){ const a=nodes[lk.s], b=nodes[lk.t];
    svg.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#c9c3b4" stroke-width="0.6" opacity="0.55"/>`); }
  for(const n of nodes){ const base=CONC_COLORS[n.kind]||"#777"; const col=riskColor(n.risk)||base;
    const r=Math.max(3, Math.min(22, 3+Math.sqrt(n.degree)*2.6));
    const nt=n.kind==="location"?"location":(n.kind==="fourth_party"?"fourth_party":"vendor");
    const nkey=n.kind==="location"?(n.label):n.id;
    svg.push(`<circle class="conc-node" data-nt="${nt}" data-key="${esc(String(nkey))}" data-label="${esc(n.label)}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.85" stroke="#fff" stroke-width="0.8" style="cursor:pointer"><title>${esc(n.label)} · ${esc(n.kind)} · ${n.degree} link(s) — click to explore</title></circle>`);
    if(r>=11) svg.push(`<text x="${n.x.toFixed(1)}" y="${(n.y-r-3).toFixed(1)}" text-anchor="middle" font-size="9" fill="${riskColor(n.risk)||'#3a463f'}" style="pointer-events:none">${esc((n.label||'').slice(0,18))}</text>`);
    else svg.push(`<text x="${n.x.toFixed(1)}" y="${(n.y-r-2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="${riskColor(n.risk)||'#6b7269'}" style="pointer-events:none">${esc((n.label||'').slice(0,12))}</text>`);
  }
  svg.push(`</svg>`);
  host.innerHTML=svg.join("");
  host.querySelectorAll(".conc-node").forEach(el=>el.addEventListener("click",()=>
    concDetail(el.getAttribute("data-nt"), el.getAttribute("data-key"), el.getAttribute("data-label"))));
}
// country centroids [lng,lat] for the delivery-location world map
const COUNTRY_LL={"United Kingdom":[-1.5,52.6],"United States":[-98,39.5],"Ireland":[-8,53.4],"France":[2.3,46.6],"Germany":[10.4,51.2],"Spain":[-3.7,40.3],"Italy":[12.5,42.8],"Netherlands":[5.3,52.1],"Switzerland":[8.2,46.8],"Poland":[19.1,52],"Sweden":[15,62],"Norway":[8.5,61],"Belgium":[4.5,50.6],"Portugal":[-8,39.6],"Austria":[14.5,47.6],"Denmark":[9.5,56],"Finland":[26,64],"Greece":[22,39],"Czech Republic":[15.5,49.8],"Romania":[25,46],"India":[79,22],"China":[104,35],"Japan":[138,37],"South Korea":[128,36],"Singapore":[103.8,1.35],"Hong Kong":[114.1,22.3],"Malaysia":[102,4],"Indonesia":[113,-2],"Philippines":[122,12],"Thailand":[101,15],"Vietnam":[106,16],"United Arab Emirates":[54,24],"Saudi Arabia":[45,24],"Israel":[35,31],"Turkey":[35,39],"Pakistan":[69,30],"Bangladesh":[90,24],"Australia":[134,-25],"New Zealand":[172,-41],"Canada":[-106,56],"Mexico":[-102,23],"Brazil":[-52,-10],"Argentina":[-64,-34],"Chile":[-71,-30],"Colombia":[-73,4],"South Africa":[24,-29],"Nigeria":[8,9.5],"Kenya":[38,0],"Egypt":[30,27],"Morocco":[-6,32],"Russia":[90,62],"Ukraine":[32,49]};
function drawWorldMap(locations){
  const host=document.getElementById("worldMap"); if(!host) return;
  const W=960, H=480; // equirectangular
  const proj=(lng,lat)=>[ (lng+180)/360*W, (90-lat)/180*H ];
  const maxc=Math.max(1,...(locations||[]).map(l=>l.count));
  // stylized continent backdrop (simplified equirectangular blobs) + graticule
  const grat=[];
  for(let lo=-180;lo<=180;lo+=30){ const [x]=proj(lo,0); grat.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#eceadf" stroke-width="0.6"/>`); }
  for(let la=-60;la<=80;la+=30){ const [,y]=proj(0,la); grat.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#eceadf" stroke-width="0.6"/>`); }
  // approximate land polygons (recognizable, not survey-accurate)
  const LAND=[
    [[-168,65],[-150,71],[-95,70],[-82,62],[-64,60],[-52,47],[-66,44],[-80,25],[-97,18],[-105,23],[-124,40],[-130,54],[-168,65]], // N America
    [[-81,8],[-60,5],[-50,-5],[-43,-23],[-58,-34],[-71,-52],[-75,-45],[-81,-5],[-81,8]], // S America
    [[-10,36],[2,40],[12,38],[18,40],[28,40],[30,46],[24,55],[12,55],[4,52],[-5,48],[-10,43],[-10,36]], // Europe
    [[-17,21],[10,33],[24,32],[33,31],[44,11],[51,12],[40,-5],[40,-18],[32,-28],[18,-34],[12,-17],[8,4],[-8,5],[-17,15],[-17,21]], // Africa
    [[26,40],[40,42],[55,40],[70,38],[90,45],[110,50],[135,48],[142,52],[130,35],[122,30],[120,22],[108,12],[98,8],[80,8],[72,20],[60,25],[45,30],[35,36],[26,40]], // Asia
    [[114,-22],[130,-12],[142,-12],[150,-25],[146,-38],[135,-35],[129,-32],[118,-34],[114,-22]] // Australia
  ];
  const land=LAND.map(poly=>`<polygon points="${poly.map(([lo,la])=>proj(lo,la).map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="#eef1ec" stroke="#dfe3da" stroke-width="0.8"/>`).join("");
  const bubbles=(locations||[]).map(l=>{
    const ll=COUNTRY_LL[l.country]; if(!ll) return "";
    const [x,y]=proj(ll[0],ll[1]); const t=l.count/maxc;
    const r=6+t*22; const col=t>=0.66?"#d9534f":t>=0.33?"#e0913a":"#1A4D3C";
    return `<g class="map-bubble" data-key="${esc(l.country)}" style="cursor:pointer"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="1.2"><title>${esc(l.country)} · ${l.count} engagement(s) — click to explore</title></circle>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${col}"/>
      <text x="${x.toFixed(1)}" y="${(y-r-4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#28332c" style="pointer-events:none">${esc(l.country)} (${l.count})</text></g>`;
  }).join("");
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:#f7f9f6;border-radius:10px">
    ${grat.join("")}${land}${bubbles}
    ${(!locations||!locations.length)?`<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#9aa39b" font-size="14">No delivery locations recorded yet — add them on engagement records</text>`:''}
  </svg>`;
  host.querySelectorAll(".map-bubble").forEach(el=>el.addEventListener("click",()=>
    concDetail("location", el.getAttribute("data-key"), el.getAttribute("data-key"))));
}
// ---- expandable drill-down drawer behind a concentration node / map bubble ----
async function concDetail(nodeType, key, label){
  let host=document.getElementById("concDrawer");
  if(!host){ host=document.createElement("div"); host.id="concDrawer"; host.className="conc-drawer"; document.body.appendChild(host); }
  host.classList.add("open");
  host.innerHTML=`<div class="cd-head"><div><div class="cd-kicker">${esc((nodeType||'').replace('_',' '))}</div><h3>${esc(label||key)}</h3></div>
    <button class="cd-x" onclick="closeConcDrawer()">✕</button></div><div class="cd-body muted">Loading…</div>`;
  try{
    const d=await api2(`/management/concentration/detail?node_type=${encodeURIComponent(nodeType)}&key=${encodeURIComponent(key)}`);
    concDetailRender(host, d);
  }catch(e){ host.querySelector(".cd-body").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function closeConcDrawer(){ const h=document.getElementById("concDrawer"); if(h) h.classList.remove("open"); }
function _fmtM(n){ if(!n) return "—"; return n>=1e6?`£${(n/1e6).toFixed(1)}m`:n>=1e3?`£${Math.round(n/1e3)}k`:`£${n}`; }
function _band(b){ return b?`<span class="band ${b}">${b}</span>`:'—'; }
function concDetailRender(host, d){
  const s=d.summary||{};
  let stat="";
  const statbits=[];
  if(s.vendors!=null) statbits.push([`${s.vendors}`,"Vendors"]);
  if(s.dependent_vendors!=null) statbits.push([`${s.dependent_vendors}`,"Dependent vendors"]);
  if(s.engagements!=null) statbits.push([`${s.engagements}`,"Engagements"]);
  if(s.critical_vendors!=null) statbits.push([`${s.critical_vendors}`,"Critical"]);
  if(s.critical_dependents!=null) statbits.push([`${s.critical_dependents}`,"Critical"]);
  if(s.fourth_parties!=null) statbits.push([`${s.fourth_parties}`,"4th parties"]);
  if(s.total_value!=null) statbits.push([_fmtM(s.total_value),"Annual value"]);
  stat=`<div class="cd-stats">${statbits.map(([v,l])=>`<div><div class="cv">${v}</div><div class="cl">${esc(l)}</div></div>`).join("")}</div>`;

  let body="";
  if(d.fourth_party){ const f=d.fourth_party;
    body+=`<div class="cd-card"><div class="cd-lab">Fourth party</div>
      <div class="cd-row"><span>Service</span><b>${esc(f.service||'—')}</b></div>
      <div class="cd-row"><span>HQ</span><b>${esc(f.hq_country||'—')}</b></div>
      <div class="cd-row"><span>Concentration flag</span><b>${f.concentration_flag?'<span class=\"tag crit\">Flagged</span>':'No'}</b></div></div>`; }
  if(d.vendor){ const v=d.vendor;
    body+=`<div class="cd-card"><div class="cd-lab">Vendor</div>
      <div class="cd-row"><span>Tier</span><b>${esc(v.tier||'—')}</b></div>
      <div class="cd-row"><span>Critical</span><b>${v.critical?'<span class=\"tag crit\">Critical</span>':'No'}</b></div></div>`; }

  if((d.vendors||[]).length){
    body+=`<div class="cd-lab">Vendors (${d.vendors.length})</div><div class="cd-list">`+
      d.vendors.map(v=>`<div class="cd-item" onclick="closeConcDrawer();openV360('${v.vendor_id}')" title="Open Vendor 360">
        <span class="ci-name">${esc(v.name)} ${v.critical?'<span class=\"tag crit\" style=\"font-size:9px\">CRIT</span>':''}</span>
        <span class="ci-meta">${esc(v.tier||'')} · ${esc(v.vendor_id)} ›</span></div>`).join("")+`</div>`;
  }
  if((d.engagements||[]).length){
    body+=`<div class="cd-lab" style="margin-top:14px">Engagements (${d.engagements.length})</div><div class="cd-list">`+
      d.engagements.slice(0,80).map(e=>`<div class="cd-item" onclick="closeConcDrawer();openEngagementRegister&&openEngagementRegister('${e.engagement_id}')" title="Open engagement register">
        <span class="ci-name">${esc(e.title)}</span>
        <span class="ci-meta">${e.vendor_name?esc(e.vendor_name)+' · ':''}${_band(e.inherent_band)}→${_band(e.residual_band)} · ${_fmtM(e.annual_value)}${e.delivery_location?' · '+esc(e.delivery_location):''}</span></div>`).join("")+`</div>`;
  }
  if((d.fourth_parties||[]).length){
    body+=`<div class="cd-lab" style="margin-top:14px">Fourth-party reliance (${d.fourth_parties.length})</div><div class="cd-list">`+
      d.fourth_parties.map(f=>`<div class="cd-item" onclick="concDetail('fourth_party','${f.id}','${esc(f.name).replace(/'/g,'')}')" title="Explore this dependency">
        <span class="ci-name">${esc(f.name)}</span><span class="ci-meta">${esc(f.id)} ›</span></div>`).join("")+`</div>`;
  }
  if(!body) body=`<div class="muted">No connected records.</div>`;
  host.querySelector(".cd-body").innerHTML=stat+body;
}
/* ============ Analysis sections: shared helpers ============ */
let _secEntities=null;
async function loadEntities(){ if(!_secEntities){ try{ _secEntities=await api2("/vendors"); }catch(e){ _secEntities=[]; } } return _secEntities; }
function entitySelector(idPrefix){
  const opts=(_secEntities||[]).map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("");
  return `<div class="ent-box"><div class="card-label" style="margin-bottom:10px">Target entity</div>
    <div class="row2">
      <div class="field"><label>Registered vendor</label><select id="${idPrefix}_v"><option value="">— select —</option>${opts}</select></div>
      <div class="field"><label>Other (not in register)</label><input id="${idPrefix}_o" placeholder="type any entity name"></div>
    </div><p class="muted" style="font-size:11.5px;margin-top:6px">Pick a registered vendor to link results to its Vendor ID, or type any entity in “Other”.</p></div>`;
}
function entityPayload(idPrefix){ const v=val(idPrefix+"_v"), o=val(idPrefix+"_o"); return { vendor_id: v||null, other_name: o||null }; }
function toneFor(score){ return score>=80?"ok":score>=60?"info":score>=45?"warn":"crit"; }
function gauge(label,value){
  const v=(value==null||isNaN(value))?null:value; const t=v==null?"info":toneFor(v);
  return `<div class="gauge"><div class="gauge-bar"><div class="gauge-fill ${t}" style="width:${v==null?0:Math.round(v)}%"></div></div>
    <div class="gauge-meta"><span class="gl">${esc(label)}</span><span class="gv">${v==null?"—":Math.round(v)}</span></div></div>`;
}
function entityBadge(ent){ if(!ent)return ""; return ent.registered
  ? `<span class="pill ok">${esc(ent.vendor_name)} · ${esc(ent.vendor_id)}</span>`
  : `<span class="pill mute">${esc(ent.vendor_name)} · not registered</span>`; }
function emptyBox(icon,title,sub){ return `<div class="card empty-box"><div class="ei">${icon}</div><div class="et">${esc(title)}</div><div class="muted">${esc(sub)}</div></div>`; }

/* ============ Financial DD ============ */
const FDD_FIELDS=[["revenue","Revenue"],["cogs","Cost of goods sold"],["grossProfit","Gross profit"],["ebit","EBIT"],["ebitda","EBITDA"],["netProfit","Net profit"],["interest","Interest expense"],["currentAssets","Current assets"],["currentLiabilities","Current liabilities"],["inventory","Inventory"],["cash","Cash & equivalents"],["totalAssets","Total assets"],["totalDebt","Total debt"],["equity","Shareholders equity"],["receivables","Trade receivables"],["payables","Trade payables"],["netDebt","Net debt"],["totalLiabilities","Total liabilities"],["retainedEarnings","Retained earnings"]];
const RATIO_ROWS=[["currentRatio","Current ratio","x","Liquidity"],["quickRatio","Quick ratio","x","Liquidity"],["cashRatio","Cash ratio","x","Liquidity"],["debtToEquity","Debt / equity","x","Solvency"],["debtRatio","Debt ratio","x","Solvency"],["netDebtEbitda","Net debt / EBITDA","x","Solvency"],["interestCover","Interest cover","x","Solvency"],["equityRatio","Equity ratio","x","Solvency"],["grossMargin","Gross margin","%","Profitability"],["ebitMargin","EBIT margin","%","Profitability"],["netMargin","Net margin","%","Profitability"],["ebitdaMargin","EBITDA margin","%","Profitability"],["roa","Return on assets","%","Profitability"],["roe","Return on equity","%","Profitability"],["assetTurnover","Asset turnover","x","Efficiency"],["receivableDays","Receivable days","d","Efficiency"],["payableDays","Payable days","d","Efficiency"]];
let _fddTab="setup", _fddFigs={}, _fddFlags={auditQualified:false,goingConcern:false,negativeEquity:false,filingsOnTime:true}, _fddResult=null, _fddSector="tech", _fddPeers=null, _fddEnt=null;
function fnum(n){ return (n==null||isNaN(n))?"—":(Math.abs(n)>=1000?Math.round(n).toLocaleString():(+n).toFixed(2)); }
function fpct(n){ return (n==null||isNaN(n))?"—":(n*100).toFixed(1)+"%"; }
V.fdd=async()=>{
  await loadEntities();
  let secs; try{ secs=await api2("/sectors"); }catch(e){ secs=[{id:"other",label:"Other"}]; }
  window._fddSecs=secs;
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Financial Due Diligence</h1><div class="sub">5-pillar model · 17 ratios · Altman Z′ · Peer benchmarking · Stress testing</div></div></div>
    ${entitySelector("fdd")}
    <div class="seg">${["setup","ratios","peers","stress","report","ai"].map(t=>`<button class="${_fddTab===t?'on':''}" onclick="fddTab('${t}')">${{setup:"⚙️ Setup",ratios:"📊 Ratios",peers:"🏛️ Peers",stress:"💥 Stress",report:"📑 Report",ai:"🤖 AI research"}[t]}</button>`).join("")}</div>
    <div id="fddBody"></div>`;
  fddRender();
};
function fddTab(t){ _fddTab=t; fddRender(); }
function fddRender(){
  const el=document.getElementById("fddBody");
  if(_fddTab==="ai"){ aiResearchPanel(el,"fdd"); return; }
  if(_fddTab==="setup"){
    el.innerHTML=`<div class="card"><div class="card-label">🔍 Research from published financials <span class="muted" style="font-weight:400;text-transform:none">— Vera + Rex search authoritative filings (needs AI key)</span></div>
      <div class="grid g3">
        <div class="field"><label>Jurisdiction</label><select id="fdd_jur">${["UK","US","EU","Ireland","Switzerland","Canada","Australia","India","Singapore","UAE","Other"].map(j=>`<option>${j}</option>`).join("")}</select></div>
        <div class="field"><label>Identifier / ticker (optional)</label><input id="fdd_id" placeholder="NASDAQ:CRM · Co. No. 09876543"></div>
        <div class="field"><label>Reporting year (optional)</label><input id="fdd_yr" placeholder="latest"></div></div>
      <button class="btn" style="margin-top:12px" onclick="fddResearch()">🔍 Research &amp; collect financials</button>
      <div id="fddProv"></div></div>
      <div class="card"><div class="card-label">Financial statement data (millions)</div>
      <div class="grid g3">${FDD_FIELDS.map(([k,l])=>`<div class="field"><label>${esc(l)}</label><input type="number" id="fdd_f_${k}" value="${_fddFigs[k]??""}" placeholder="0"></div>`).join("")}</div></div>
      <div class="card"><div class="card-label">Qualitative flags (viability pillar)</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap">${[["auditQualified","⚠ Audit qualified"],["goingConcern","⚠ Going concern note"],["negativeEquity","⚠ Negative equity"],["filingsOnTime","✓ Filings on time"]].map(([k,l])=>`<label style="display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" id="fdd_fl_${k}" ${_fddFlags[k]?"checked":""} style="width:auto"> ${l}</label>`).join("")}</div></div>
      <div class="field"><label>Industry sector (for peer benchmarking)</label><select id="fdd_sector" style="max-width:320px">${(window._fddSecs||[]).map(s=>`<option value="${s.id}" ${_fddSector===s.id?"selected":""}>${esc(s.label)}</option>`).join("")}</select></div>
      <button class="btn" style="margin-top:14px" onclick="fddCompute()">📊 Compute</button>`;
  } else if(_fddTab==="ratios"){
    if(!_fddResult){ el.innerHTML=emptyBox("📊","No figures computed yet","Enter financials in Setup and press Compute."); return; }
    const r=_fddResult, z=r.altman, zt=z.zone==="safe"?"ok":z.zone==="grey"?"warn":"crit";
    el.innerHTML=`<div class="card"><div class="score-strip">
        <div class="score-big"><div class="score-num">${r.overall==null?"—":Math.round(r.overall)}</div><div class="score-cap">Financial health</div>
          <span class="pill ${r.overall>=75?'ok':r.overall>=60?'info':r.overall>=45?'warn':'crit'}">${esc(r.banding)}</span></div>
        <div class="altman"><div class="altman-z">Altman Z′ <b class="${zt}">${z.z==null?"—":z.z.toFixed(2)}</b></div>
          <span class="pill ${zt}">${z.zone==="safe"?"Safe zone":z.zone==="grey"?"Grey zone":z.zone==="distress"?"Distress zone":"insufficient"}</span>
          <div class="muted" style="font-size:11px">&gt;2.9 safe · 1.23–2.9 grey · &lt;1.23 distress</div></div></div>
      <div class="pillar-row">${["liquidity","solvency","profitability","efficiency","viability"].map(k=>gauge(k[0].toUpperCase()+k.slice(1),r.pillars[k])).join("")}</div></div>
      <table><tr><th>Ratio</th><th>Pillar</th><th>Value</th></tr>
        ${RATIO_ROWS.map(([k,l,u,p])=>{const v=r.ratios[k];const d=v==null?"—":(u==="%"?fpct(v):u==="d"?Math.round(v)+"d":fnum(v)+"×");return `<tr><td>${esc(l)}</td><td class="muted">${esc(p)}</td><td><b>${d}</b></td></tr>`;}).join("")}</table>
      ${r.sara_checks.length?`<div class="card" style="margin-top:12px"><div class="card-label">Sara's consistency checks</div>${r.sara_checks.map(c=>`<div class="note ${c.tone==='crit'?'crit':'warn'}" style="margin-bottom:6px">${esc(c.text)}</div>`).join("")}</div>`:""}`;
  } else if(_fddTab==="peers"){
    if(!_fddPeers){ el.innerHTML=emptyBox("🏛️","Compute first","Peer comparison needs computed ratios."); return; }
    el.innerHTML=`<div class="card"><div class="card-label">Peer benchmarking — sector medians</div>
      <table><tr><th>Metric</th><th>Company</th><th>Sector median</th><th>Δ vs peers</th></tr>
      ${_fddPeers.peers.map(p=>{const d=x=>x==null?"—":(p.unit==="%"?fpct(x):fnum(x)+"×");return `<tr><td>${esc(p.metric)}</td><td><b>${d(p.company)}</b></td><td>${d(p.median)}</td><td><span class="pill ${p.verdict==='favourable'?'ok':p.verdict==='—'?'mute':'warn'}">${esc(p.verdict)}</span></td></tr>`;}).join("")}</table></div>`;
  } else if(_fddTab==="stress"){
    el.innerHTML=`<div class="card"><div class="card-label">Stress test — adjust the dials</div>
      <div class="stress-grid">
        <div class="field"><label>Revenue shock −<span id="sv">0</span>%</label><input type="range" min="0" max="50" value="0" oninput="document.getElementById('sv').textContent=this.value"></div>
        <div class="field"><label>Margin compression −<span id="sm">0</span> pts</label><input type="range" min="0" max="20" value="0" oninput="document.getElementById('sm').textContent=this.value"></div>
        <div class="field"><label>Interest rate +<span id="sr">0</span>%</label><input type="range" min="0" max="10" value="0" oninput="document.getElementById('sr').textContent=this.value"></div></div>
      <p class="muted">Deterministic engine recomputes against shocked figures.</p>
      <button class="btn" onclick="fddStress()">💥 Model this scenario</button><div id="fddStressOut"></div></div>`;
  } else if(_fddTab==="report"){
    if(!_fddResult){ el.innerHTML=emptyBox("📑","No report yet","Compute the figures in Setup first."); return; }
    const r=_fddResult;
    el.innerHTML=`<div class="card"><div class="card-label">📑 Financial due diligence summary</div>
      <div class="ai-out">Entity: ${_fddEnt?(_fddEnt.registered?_fddEnt.vendor_name+" ("+_fddEnt.vendor_id+")":_fddEnt.vendor_name+" — not registered"):"(unspecified)"}
Financial health: ${r.overall==null?"—":Math.round(r.overall)} / 100 — ${r.banding}
Altman Z′: ${r.altman.z==null?"—":r.altman.z.toFixed(2)} (${r.altman.zone} zone)

Pillars — Liquidity ${Math.round(r.pillars.liquidity||0)} · Solvency ${Math.round(r.pillars.solvency||0)} · Profitability ${Math.round(r.pillars.profitability||0)} · Efficiency ${Math.round(r.pillars.efficiency||0)} · Viability ${Math.round(r.pillars.viability||0)}

${r.sara_checks.length?"Consistency flags:\n"+r.sara_checks.map(c=>"• "+c.text).join("\n"):"Inputs internally consistent."}

Informational counterparty-risk analysis — not investment advice. Verify figures against the primary filing.</div></div>`;
  } else if(_fddTab==="web"){
    const ent=(window._fddEntity&&window._fddEntity.name)||"";
    el.innerHTML=`<div class="card">
      <div class="card-label">🌐 Internet research <span class="muted" style="font-weight:400;text-transform:none">— live web search across authoritative filings, regulators and news (needs AI key)</span></div>
      <div class="grid g3">
        <div class="field"><label>Company / legal name</label><input id="wr_co" value="${esc(ent)}" placeholder="e.g. Temenos AG"></div>
        <div class="field"><label>Jurisdiction</label><select id="wr_jur">${["UK","US","EU","Ireland","Switzerland","Canada","Australia","India","Singapore","UAE","Other"].map(j=>`<option>${j}</option>`).join("")}</select></div>
        <div class="field"><label>Identifier / ticker (optional)</label><input id="wr_id" placeholder="SIX:TEMN · Co. No."></div>
      </div>
      <button class="btn" style="margin-top:12px" onclick="runWebResearch()">🌐 Run internet research</button>
      <div id="wrOut" style="margin-top:14px"></div>
    </div>`;
  }
}
async function runWebResearch(){
  const co=val("wr_co"); if(!co){ flash("Enter a company name"); return; }
  const out=document.getElementById("wrOut");
  out.innerHTML=`<div class="muted">🔎 Searching the web and reading authoritative sources… this takes a few seconds.</div>`;
  try{
    const r=await api2("/research/web",{method:"POST",body:JSON.stringify({company:co,jurisdiction:val("wr_jur"),identifier:val("wr_id")})});
    renderWebResearch(out,r);
  }catch(e){ out.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
function renderWebResearch(host,r){
  if(r.available===false){ host.innerHTML=`<div class="note warn">${esc(r.limitations||"Live research unavailable.")}</div>`; return; }
  if(r.matched===false && !r.financials && !r.reputation){
    host.innerHTML=`<div class="note warn">No authoritative match found. ${esc(r.limitations||"")}</div>${r.raw?`<pre class="muted" style="white-space:pre-wrap;font-size:11px">${esc(r.raw)}</pre>`:""}`; return; }
  const fin=r.financials||{}, fig=fin.figures||{}, rep=r.reputation||{};
  const FN=[["revenue","Revenue"],["ebitda","EBITDA"],["ebit","EBIT"],["netProfit","Net profit"],["totalAssets","Total assets"],["totalDebt","Total debt"],["equity","Equity"],["cash","Cash"]];
  const figRows=FN.filter(([k])=>fig[k]!=null).map(([k,l])=>`<tr><td>${esc(l)}</td><td><b>${fmtNum(fig[k])}</b> ${esc(fin.currency||"")}m</td></tr>`).join("")||`<tr><td colspan=2 class="muted">No substantiated figures returned.</td></tr>`;
  const repCol={Positive:"#1A4D3C",Neutral:"#2E4A5C",Caution:"#B8862B",Adverse:"#8A2E3B"}[rep.verdict]||"#666";
  const sigs=(rep.signals||[]).map(sg=>`<div class="note ${sg.severity==='high'?'crit':'warn'}" style="margin-bottom:6px"><b>${esc(sg.category||"")}</b> ${esc(sg.summary||"")} <span class="muted">${esc(sg.date||"")}</span></div>`).join("")||`<div class="muted">No adverse signals surfaced.</div>`;
  const srcs=(r.sources||[]).map(sc=>`<li><a href="${esc(sc.url)}" target="_blank" rel="noopener">${esc(sc.title||sc.url)}</a> <span class="muted">${esc(sc.type||"")}${sc.date?" · "+esc(sc.date):""}</span></li>`).join("")||`<li class="muted">No sources returned.</li>`;
  const conf=r.confidence||"—";
  host.innerHTML=`
    <div class="note warn" style="margin-bottom:12px">⚠ AI internet research — a starting point, not the record of truth. <b>Verify every figure against the primary filing</b> before relying on it.</div>
    <div class="grid g2">
      <div class="card"><div class="card-label">💰 Financial DD ${fin.period?`· ${esc(fin.period)}`:""}</div>
        <table>${figRows}</table>
        ${fin.healthCommentary?`<p class="muted" style="margin-top:8px;font-size:12px">${esc(fin.healthCommentary)}</p>`:""}
        <button class="btn sm" style="margin-top:10px" onclick='loadWebFigures(${JSON.stringify(fig).replace(/'/g,"&#39;")})'>↧ Load figures into Setup &amp; compute</button>
      </div>
      <div class="card"><div class="card-label">🗞 Reputation</div>
        <div style="margin-bottom:8px"><span class="pill" style="background:${repCol};color:#fff">${esc(rep.verdict||"—")}</span>
          ${rep.adverseMedia?'<span class="tag" style="background:#f6e2de;color:#8A2E3B;margin-left:6px">adverse media</span>':""}
          ${rep.sanctionsOrPEP?'<span class="tag" style="background:#f6e2de;color:#8A2E3B;margin-left:6px">sanctions/PEP</span>':""}
          ${rep.litigation?'<span class="tag" style="background:#f6ebda;color:#9a6418;margin-left:6px">litigation</span>':""}</div>
        ${sigs}
      </div>
    </div>
    <div class="card" style="margin-top:12px"><div class="card-label">Sources · confidence: ${esc(conf)}</div>
      <ul style="margin:6px 0 0 18px;font-size:12.5px;line-height:1.7">${srcs}</ul>
      ${r.limitations?`<p class="muted" style="margin-top:8px;font-size:12px"><b>Limitations.</b> ${esc(r.limitations)}</p>`:""}
    </div>`;
}
function loadWebFigures(fig){
  _fddFigs=Object.assign({},_fddFigs,fig||{});
  _fddTab="setup"; fddRender();
  flash("Figures loaded into Setup — review, then Compute");
}
function fmtNum(n){ if(n==null)return"—"; return Number(n).toLocaleString(undefined,{maximumFractionDigits:1}); }
function fddCollect(){ const f={}; FDD_FIELDS.forEach(([k])=>{const e=document.getElementById("fdd_f_"+k); if(e&&e.value!=="")f[k]=parseFloat(e.value);}); _fddFigs=f;
  ["auditQualified","goingConcern","negativeEquity","filingsOnTime"].forEach(k=>{const e=document.getElementById("fdd_fl_"+k); if(e)_fddFlags[k]=e.checked;});
  const ss=document.getElementById("fdd_sector"); if(ss)_fddSector=ss.value; }
async function fddCompute(){
  fddCollect();
  if(!Object.keys(_fddFigs).length){ flash("Enter at least some figures"); return; }
  try{
    _fddResult=await api2("/financial-dd",{method:"POST",body:JSON.stringify({figures:_fddFigs,flags:_fddFlags})});
    _fddPeers=await api2("/financial-dd/peers",{method:"POST",body:JSON.stringify({figures:_fddFigs,flags:_fddFlags,sector:_fddSector})});
    const ep=entityPayload("fdd"); _fddEnt=(ep.vendor_id||ep.other_name)?(await api2("/reputation",{method:"POST",body:JSON.stringify({...ep,events:[]})})).entity:null;
    _fddTab="ratios"; fddRender(); flash("Computed");
  }catch(e){ flash(e.message); }
}
async function fddResearch(){
  const ep=entityPayload("fdd");
  const company=ep.other_name || (_secEntities.find(v=>v.vendor_id===ep.vendor_id)?.legal_name) || "";
  if(!company){ flash("Pick a vendor or type a company in Other"); return; }
  const prov=document.getElementById("fddProv"); prov.innerHTML='<div class="muted" style="margin-top:10px">Researching authoritative sources…</div>';
  try{
    const r=await api2("/financial-dd/research",{method:"POST",body:JSON.stringify({company,jurisdiction:val("fdd_jur"),identifier:val("fdd_id"),year:val("fdd_yr")})});
    if(r.matched && r.figures){ FDD_FIELDS.forEach(([k])=>{const e=document.getElementById("fdd_f_"+k); if(e&&r.figures[k]!=null)e.value=r.figures[k];});
      prov.innerHTML=`<div class="prov"><div class="prov-head"><span><b>${esc(r.entity?.legalName||company)}</b></span><span class="pill ${r.confidence==='high'?'ok':r.confidence==='medium'?'warn':'crit'}">${esc(r.confidence||'?')} confidence</span></div>
        <div class="prov-meta">Period: <b>${esc(r.period||'—')}</b> · Currency: <b>${esc(r.currency||'—')}</b></div>
        <div class="note warn" style="margin-top:10px"><b>Verify before reliance.</b> AI-extracted from public sources — confirm against the primary filing.</div></div>`;
      flash("Figures auto-filled — review then Compute");
    } else { prov.innerHTML=`<div class="note crit" style="margin-top:10px"><b>No authoritative match.</b> ${esc(r.limitations||"Enter figures manually.")}</div>`; }
  }catch(e){ prov.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function fddStress(){
  fddCollect();
  const rev=+document.getElementById("sv").textContent, mar=+document.getElementById("sm").textContent, rate=+document.getElementById("sr").textContent;
  const shocked={..._fddFigs};
  if(shocked.revenue){ shocked.revenue=shocked.revenue*(1-rev/100); }
  if(shocked.ebit){ shocked.ebit=shocked.ebit-(_fddFigs.revenue||0)*(mar/100); }
  if(shocked.interest){ shocked.interest=shocked.interest*(1+rate/100); }
  try{ const r=await api2("/financial-dd",{method:"POST",body:JSON.stringify({figures:shocked,flags:_fddFlags})});
    document.getElementById("fddStressOut").innerHTML=`<div class="ai-out">Stressed — revenue −${rev}%, margin −${mar}pts, rates +${rate}%
Financial health: ${r.overall==null?"—":Math.round(r.overall)} / 100 (was ${_fddResult?Math.round(_fddResult.overall):"—"}) — ${r.banding}
Altman Z′: ${r.altman.z==null?"—":r.altman.z.toFixed(2)} (${r.altman.zone} zone)
Interest cover: ${r.ratios.interestCover==null?"—":r.ratios.interestCover.toFixed(2)}×</div>`;
  }catch(e){ flash(e.message); }
}

/* ============ Reputation ============ */
let _repTab="setup", _repResult=null, _repEvents=[];
V.reputation=async()=>{
  await loadEntities();
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Reputation &amp; ESG Intelligence</h1><div class="sub">7-pillar model · Regulatory · Litigation · Cyber · ESG-E/S/G · Media</div></div></div>
    ${entitySelector("rep")}
    <div class="seg">${["setup","pillars","findings","sanctions","ai"].map(t=>`<button class="${_repTab===t?'on':''}" onclick="repTab('${t}')">${{setup:"⚙️ Setup",pillars:"📊 Pillars",findings:"🔎 Findings",sanctions:"🛡️ Sanctions/AML",ai:"🤖 AI research"}[t]}</button>`).join("")}</div>
    <div id="repBody"></div>`;
  repRender();
};
function repTab(t){ _repTab=t; repRender(); }
function repRender(){
  const el=document.getElementById("repBody");
  if(_repTab==="ai"){ aiResearchPanel(el,"reputation"); return; }
  if(_repTab==="sanctions"){ repSanctions(el); return; }
  if(_repTab==="setup"){
    el.innerHTML=`<div class="card"><div class="card-label">Reputation assessment setup</div>
      <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin-bottom:12px"><input type="checkbox" id="rep_cf" style="width:auto"> Customer-facing engagement (raises brand-transfer risk)</label>
      <div class="card-label">Known adverse events (optional)</div>
      <div id="repEvts">${_repEvents.map((e,i)=>`<div class="dossier-row"><span class="dk">${esc(e.pillar)} · ${esc(e.severity)}</span><span class="dv">${esc(e.title||"")} <button class="btn sm ghost" onclick="repDelEvt(${i})">×</button></span></div>`).join("")}</div>
      <div class="grid g3" style="margin-top:8px">
        <div class="field"><label>Pillar</label><select id="rep_p">${["regulatory","litigation","cyber","esg_environmental","esg_social","esg_governance","media"].map(p=>`<option>${p}</option>`).join("")}</select></div>
        <div class="field"><label>Severity</label><select id="rep_s"><option>critical</option><option>high</option><option selected>medium</option><option>low</option></select></div>
        <div class="field"><label>Title</label><input id="rep_t" placeholder="e.g. FCA settlement 2024"></div></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="repAddEvt()">+ Add event</button>
      <div style="margin-top:14px"><button class="btn" onclick="repRun()">🔎 Run reputation assessment</button></div>
      <p class="muted" style="margin-top:8px">With an AI key, Mira + Rex sweep authoritative sources across all 7 pillars. Offline, scoring is driven by the events above (clean = 100).</p></div>`;
  } else if(_repTab==="pillars"){
    if(!_repResult){ el.innerHTML=emptyBox("📊","No scores yet","Run the assessment from Setup."); return; }
    el.innerHTML=`<div class="card"><div class="score-strip"><div class="score-big"><div class="score-num">${_repResult.overall}</div><div class="score-cap">Overall reputation</div>
      <span class="pill ${toneFor(_repResult.overall)}">${esc(_repResult.verdict)}</span></div>
      <div>${entityBadge(_repResult.entity)}${_repResult.customer_facing?' <span class="pill warn">customer-facing</span>':''}</div></div>
      <div class="pillar-row wrap">${_repResult.pillars.map(p=>gauge(p.label,p.score)).join("")}</div></div>`;
  } else if(_repTab==="findings"){
    if(!_repResult){ el.innerHTML=emptyBox("🔎","No findings yet","Run the assessment from Setup."); return; }
    const wf=_repResult.pillars.filter(p=>p.findings&&p.findings.length);
    el.innerHTML=`<div class="card"><div class="card-label">Pillar findings</div>
      ${wf.length?wf.map(p=>`<div style="margin-bottom:12px"><b>${esc(p.label)}</b> <span class="pill ${toneFor(p.score)}">${p.score}</span><br>${p.findings.map(f=>`<span class="muted" style="font-size:12.5px">• ${esc(f.title)} (${esc(f.severity)})${f.date?` — ${esc(f.date)}`:""}</span>`).join("<br>")}</div>`).join(""):'<span class="muted">No adverse findings recorded — all pillars clean.</span>'}
      ${_repResult.timeline&&_repResult.timeline.length?`<div class="card-label" style="margin-top:14px">Adverse-event timeline</div>${_repResult.timeline.map(t=>`<div class="dossier-row"><span class="dk">${esc(t.date||"undated")}</span><span class="dv">${esc(t.title||"")} · ${esc(t.pillar||"")} (${esc(t.severity||"")})</span></div>`).join("")}`:""}</div>`;
  }
}
function repAddEvt(){ const p=val("rep_p"),s=val("rep_s"),t=val("rep_t"); if(!t){flash("Add a title");return;} _repEvents.push({pillar:p,severity:s,title:t}); repRender(); }
function repDelEvt(i){ _repEvents.splice(i,1); repRender(); }
async function repRun(){
  const cf=document.getElementById("rep_cf")?.checked||false; const ep=entityPayload("rep");
  try{ _repResult=await api2("/reputation",{method:"POST",body:JSON.stringify({...ep,events:_repEvents,customer_facing:cf})});
    _repTab="pillars"; repRender(); flash("Assessment complete");
  }catch(e){ flash(e.message); }
}

/* ---- Sanctions & AML screening (reputation tab) ---- */
function sancBandPill(b){ const t=b==='Hit'?'crit':b==='Review'?'warn':'ok'; return `<span class="pill ${t}">${esc(b)}</span>`; }
function sancRiskLine(risk){
  if(!risk||!risk.issue) return '';
  return `<div class="card" style="margin-top:8px;border-left:3px solid var(--gold,#B8862B)"><b>⚠ Risk action taken</b><br>
    <span class="muted" style="font-size:12px">Sanctions Issue <b>${esc(risk.issue)}</b> (${esc(risk.kind||'')}) raised in the Issues Log${risk.escalated?' · vendor <b>escalated to Critical</b>':''}.</span></div>`;
}
async function repSanctions(el){
  el.innerHTML=`<div class="card"><div class="card-label">Sanctions &amp; AML screening</div>
    <p class="muted" style="font-size:12px;margin-bottom:10px">Screens against OFAC · UN · EU · OFSI plus PEP and adverse-media sources, with DOB/nationality disambiguation. <span class="pill mute">representative + any loaded live feed</span></p>
    <div class="grid g2" style="gap:12px">
      <div class="field"><label>Screen the selected vendor &amp; its owners</label><div style="display:flex;gap:6px"><button class="btn" onclick="sancScreenVendorOwners()">🛡️ Screen vendor &amp; owners</button><button class="btn ghost" onclick="sancScreenVendor()">Entity only</button></div></div>
      <div class="field"><label>or screen any name (with secondary identifiers)</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><input id="sanc_name" placeholder="name" style="flex:1;min-width:120px">
          <input id="sanc_dob" placeholder="DOB YYYY-MM-DD" style="width:130px">
          <input id="sanc_nat" placeholder="nat." style="width:64px">
          <button class="btn ghost" onclick="sancScreenName()">Screen</button></div></div>
    </div>
    <div id="sancResult" style="margin-top:12px"></div></div>
  <div class="card"><div class="card-label">Live issuer feeds — OFAC · UN · EU · OFSI</div>
    <p class="muted" style="font-size:12px">These issuers are the system of record. Loading a feed makes screening live against it. <span class="pill mute">needs the issuer host allowlisted on the network</span></p>
    <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
      ${["OFAC","UN","EU","OFSI"].map(src=>`<button class="btn ghost sm" onclick="sancLoadFeed('${src}')">⤓ Load ${src} (live)</button>`).join("")}</div>
    <div id="sancFeeds" class="muted">Loading…</div></div>
  <div class="card"><div class="card-label">Portfolio screening (all registered vendors)</div><div id="sancSummary" class="muted">Loading…</div></div>
  <div class="card"><div class="card-label">Authoritative sources &amp; methodology</div><div id="sancSources" class="muted">Loading…</div></div>`;
  sancFeeds(); sancSummary(); sancSources();
}
function sancHitRows(hits){
  return hits.length?`<table style="margin-top:6px"><tr><th>Matched name</th><th>Cat.</th><th>Source</th><th>List / programme</th><th>Score</th></tr>
    ${hits.map(h=>`<tr><td>${esc(h.matched_name)}${h.live?' <span class="pill ok" style="font-size:10px">live</span>':''}${h.note?`<br><span class="muted" style="font-size:11px">${esc(h.note)}</span>`:''}</td>
      <td><span class="pill ${h.category==='sanction'?'crit':h.category==='pep'?'warn':'mute'}">${esc(h.category)}</span></td>
      <td>${esc(h.source)}</td><td style="font-size:11px">${esc(h.list||'')}${h.program?` · ${esc(h.program)}`:''}</td>
      <td><b>${h.score}</b> <span class="muted">${esc(h.strength)}</span></td></tr>`).join("")}</table>`
    :'<div class="muted" style="margin-top:6px">No matches — Clear.</div>';
}
function sancRender(r){
  const el=document.getElementById("sancResult"); if(!el) return;
  el.innerHTML=`<div class="score-strip"><div><b>${esc(r.name)}</b> ${r.country?`<span class="muted">${esc(r.country)}</span>`:''} ${r.dob?`<span class="muted">DOB ${esc(r.dob)}</span>`:''} ${sancBandPill(r.band)} <span class="muted">· ${r.hit_count} match(es)</span></div></div>
    ${sancHitRows(r.hits)}
    ${sancRiskLine(r.risk)}
    <p class="muted" style="font-size:11px;margin-top:6px">Possible matches require human adjudication. Screening logged for audit${r.screening_id?` (${esc(r.screening_id)})`:''}.</p>`;
}
function sancVendorRender(d){
  const el=document.getElementById("sancResult"); if(!el) return;
  el.innerHTML=`<div class="score-strip"><div><b>${esc(d.legal_name)}</b> ${sancBandPill(d.overall_band)} <span class="muted">· overall (entity + ${d.people.length} owner/officer)</span></div></div>
    <div class="card-label" style="margin-top:8px">Entity — ${sancBandPill(d.entity_result.band)}</div>${sancHitRows(d.entity_result.hits)}
    <div class="card-label" style="margin-top:10px">Beneficial owners &amp; key people</div>
    ${d.people.length?d.people.map(p=>`<div style="margin:8px 0;padding:8px;border:1px solid var(--line,#e4e0d6);border-radius:8px">
      <b>${esc(p.name)}</b> ${p.is_ubo?'<span class="pill warn" style="font-size:10px">UBO</span>':''} <span class="muted">${esc(p.role||'')}${p.dob?` · DOB ${esc(p.dob)}`:''}${p.nationality?` · ${esc(p.nationality)}`:''}</span> ${sancBandPill(p.result.band)}
      ${p.result.hits.length?sancHitRows(p.result.hits):''}</div>`).join("")
      :'<div class="muted">No beneficial owners recorded. Add them under Vendor 360 / people.</div>'}
    ${sancRiskLine(d.risk)}
    <p class="muted" style="font-size:11px;margin-top:6px">DOB &amp; nationality applied to disambiguate. All screens logged for audit.</p>`;
}
async function sancScreenVendor(){
  const ep=entityPayload("rep"); if(!ep.vendor_id && !ep.name){ flash("Select a vendor first"); return; }
  try{ sancRender(await api2("/sanctions/screen",{method:"POST",body:JSON.stringify(ep)})); }catch(e){ flash(e.message); }
}
async function sancScreenVendorOwners(){
  const ep=entityPayload("rep"); if(!ep.vendor_id){ flash("Select a registered vendor (owners are screened from its register entry)"); return; }
  try{ sancVendorRender(await api2(`/sanctions/screen-vendor/${ep.vendor_id}`,{method:"POST",body:"{}"})); }catch(e){ flash(e.message); }
}
async function sancScreenName(){
  const n=val("sanc_name"); if(!n){ flash("Enter a name"); return; }
  const body={name:n,dob:val("sanc_dob")||null,nationality:val("sanc_nat")||null};
  try{ sancRender(await api2("/sanctions/screen",{method:"POST",body:JSON.stringify(body)})); }catch(e){ flash(e.message); }
}
async function sancLoadFeed(src){
  flash(`Attempting ${src} live fetch…`);
  try{ const r=await api2("/sanctions/load-feed",{method:"POST",body:JSON.stringify({source:src})});
    flash(`${src} loaded: ${r.loaded} entries (${r.via})`); sancFeeds(); sancSummary();
  }catch(e){ flash(`${src} fetch blocked — allowlist the issuer host on this network, or load the file via the API. `+(e.message||"")); }
}
async function sancFeeds(){
  const el=document.getElementById("sancFeeds"); if(!el) return;
  try{ const f=await api2("/sanctions/feeds");
    el.innerHTML=f.feeds.length?`<table><tr><th>Feed</th><th>Entries</th><th>Last loaded</th></tr>${f.feeds.map(x=>`<tr><td>${esc(x.source)}</td><td>${x.count}</td><td class="muted" style="font-size:11px">${esc((x.last_loaded||'').slice(0,16).replace('T',' '))}</td></tr>`).join("")}</table>`
      :`<div class="muted">No live feed loaded yet — screening runs on the representative list. Source URL: <span style="font-size:11px">${esc(f.ofsi_url)}</span></div>`;
  }catch(e){ el.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}
async function sancSummary(){
  const el=document.getElementById("sancSummary"); if(!el) return;
  try{ const s=await api2("/sanctions/summary"); const d=s.distribution;
    el.innerHTML=`<div class="grid g3" style="gap:10px"><div class="card stat"><div class="v">${d.Clear}</div><div class="l">Clear</div></div>
      <div class="card stat"><div class="v">${d.Review}</div><div class="l">Review</div></div>
      <div class="card stat"><div class="v">${d.Hit}</div><div class="l">Hit</div></div></div>
      ${s.live_entries?`<p class="muted" style="font-size:11px">Including ${s.live_entries} live feed entr${s.live_entries==1?'y':'ies'}.</p>`:''}
      ${s.flagged.length?`<table style="margin-top:8px"><tr><th>Vendor</th><th>Band</th><th>Top match</th></tr>${s.flagged.map(f=>`<tr class="click" onclick="openV360('${f.vendor_id}')"><td>${esc(f.legal_name)}</td><td>${sancBandPill(f.band)}</td><td style="font-size:11px">${f.top?esc(f.top.matched_name)+' ('+f.top.score+')':''}</td></tr>`).join("")}</table>`:'<div class="muted" style="margin-top:8px">All registered vendors screen Clear.</div>'}`;
  }catch(e){ el.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}
async function sancSources(){
  const el=document.getElementById("sancSources"); if(!el) return;
  try{ const s=await api2("/sanctions/sources");
    el.innerHTML=`<p class="muted" style="font-size:12px">${esc(s.tier1_note)}</p>
      <div class="card-label" style="margin-top:8px">Sanctions issuers — system of record</div>
      <table style="margin-top:4px"><tr><th>Authority</th><th>Lists</th><th></th></tr>
      ${s.sanctions.map(x=>`<tr><td>${esc(x.authority)}<br><span class="muted" style="font-size:11px">${esc(x.access)}</span></td><td style="font-size:11px">${esc(x.lists)}</td><td>${x.tier1?'<span class="pill ok">tier-1</span>':''}</td></tr>`).join("")}</table>
      <div class="card-label" style="margin-top:10px">PEP definition anchors</div><div style="font-size:12px">${s.pep_anchors.map(esc).join("<br>")}</div>
      <div class="card-label" style="margin-top:10px">Adverse / enforcement scope</div><div style="font-size:12px">${s.adverse.map(esc).join("<br>")}</div>
      <div class="card-label" style="margin-top:10px">Provider evaluation checklist</div><ol style="font-size:12px;margin:0 0 0 16px;padding:0">${s.provider_checklist.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`;
  }catch(e){ el.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}

/* ============ Financial Monitoring ============ */
V.finmon=async()=>{
  await loadEntities();
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Financial Monitoring Panel</h1><div class="sub">Periodic sweep · financial health, disclosures, profit warnings, rating changes, distress signals</div></div>
    <button class="btn" onclick="finmonSweep()">▶ Run monitoring sweep</button></div>
    <div class="card"><div class="card-label">Empanel an entity for monitoring</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="field"><label>Registered vendor</label><select id="fm_v"><option value="">— select —</option>${(_secEntities||[]).map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("")}</select></div>
        <div class="field"><label>Other (not in register)</label><input id="fm_o" placeholder="company name"></div></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="finmonAdd()">+ Empanel</button></div>
    <div id="fmList" class="muted">Loading…</div>`;
  finmonList();
};
async function finmonList(){
  try{ const rows=await api2("/fin-monitor");
    document.getElementById("fmList").innerHTML = rows.length? rows.map(r=>`<div class="card"><div class="card-label">${esc(r.entity_name)} ${r.vendor_id?`<span class="pill ok" style="margin-left:6px">${esc(r.vendor_id)}</span>`:'<span class="pill mute" style="margin-left:6px">Other</span>'}
      <button class="btn sm ghost" style="float:right" onclick="finmonDel(${r.id})">Remove</button>
      ${r.last_signal?`<span class="pill ${r.last_signal==='distress'?'crit':r.last_signal==='watch'?'warn':'ok'}" style="float:right;margin-right:8px">${esc(r.last_signal)}</span>`:''}</div>
      ${r.last_result?`<div class="ai-out">${md1(r.last_result)}</div><p class="muted" style="font-size:11px;margin-top:6px">Last swept: ${esc(r.last_swept||'—')}</p>`:'<div class="muted">Not yet swept.</div>'}</div>`).join("")
      : emptyBox("📡","No entities empanelled","Add a vendor or Other entity above to monitor its financial health.");
  }catch(e){ document.getElementById("fmList").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function finmonAdd(){
  const v=val("fm_v"), o=val("fm_o");
  if(!v&&!o){ flash("Pick a vendor or type a name"); return; }
  try{ await api2("/fin-monitor",{method:"POST",body:JSON.stringify({vendor_id:v||null,other_name:o||null})}); flash("Empanelled"); finmonList(); }catch(e){ flash(e.message); }
}
async function finmonDel(id){ try{ await api2("/fin-monitor/"+id,{method:"DELETE"}); finmonList(); }catch(e){ flash(e.message); } }
async function finmonSweep(){
  try{ const r=await api2("/fin-monitor/sweep",{method:"POST",body:"{}"});
    flash(`Swept ${r.swept}${r.ai_enabled?"":" (offline — set AI key for live sources)"}`); finmonList();
  }catch(e){ flash(e.message); }
}

/* ============ Contracts ============ */
let _conTab="min", _conTerms=null, _conGap=null, _conDiff=null;
const CONTRACT_TIERS=[{tier:1,name:"Regulatory mandatory",tone:"crit",desc:"Clauses required by law. Absence = regulatory breach. e.g. GDPR Art.28 DPA, DORA Art.30, FCA outsourcing."},{tier:2,name:"Market standard",tone:"warn",desc:"Present in 90%+ of negotiated contracts. e.g. confidentiality, IP ownership, step-in, data deletion."},{tier:3,name:"Best practice",tone:"info",desc:"Present in well-negotiated contracts. e.g. personnel vetting, SLA granularity, change control, BCP testing."},{tier:4,name:"Commercial preference",tone:"mute",desc:"Useful when leverage permits. e.g. benchmarking, MFN pricing, source-code escrow, enhanced SLA credits."}];
V.contracts=async()=>{
  await loadEntities();
  const engs=await api2("/engagements").catch(()=>[]);
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>⚖️ Contract Management</h1><div class="sub">Minimum terms scaled to inherent risk · gap report · existing-vs-to-add · document-driven extraction</div></div></div>
    <div class="card"><div class="card-label" style="margin-bottom:10px">Engagement (registered) — inherits inherent band &amp; exposure automatically</div>
      <div class="field" style="max-width:520px"><label>Linked engagement</label>
        <select id="con_eng" onchange="conEngChange()"><option value="">— Other / unregistered (enter band manually) —</option>
        ${engs.map(e=>`<option value="${e.engagement_id}" data-band="${e.inherent_band||''}" data-v="${e.vendor_id}">${esc(e.engagement_id)} · ${esc(e.title)} ${e.inherent_band?'· '+e.inherent_band:''}</option>`).join("")}</select></div>
    </div>
    <div class="card" id="con_manual"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field"><label>Inherent risk band</label><select id="con_band"><option>LOW</option><option selected>MODERATE</option><option>ELEVATED</option><option>HIGH</option></select></div>
      <div class="field"><label>Exposure flags</label><div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:8px">
        ${[["personal_data","Personal data"],["cross_border","Cross-border"],["mission_critical","Mission-critical"],["regulated","Regulated"]].map(([k,l])=>`<label style="display:flex;align-items:center;gap:5px;font-weight:400;font-size:12px"><input type="checkbox" id="con_${k}" style="width:auto"> ${l}</label>`).join("")}</div></div></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Manual entry is used for an <b>Other</b> (unregistered) entity. Selecting a registered engagement above inherits these automatically.</p></div>
    <div class="seg">${["min","rev","diff"].map(t=>`<button class="${_conTab===t?'on':''}" onclick="conTab('${t}')">${{min:"📋 Minimum terms",rev:"🔎 Gap review",diff:"📑 Existing vs to-add"}[t]}</button>`).join("")}</div>
    <div id="conBody"></div>`;
  conRender();
};
function conEngChange(){
  const sel=document.getElementById("con_eng"); const manual=document.getElementById("con_manual");
  const opt=sel.selectedOptions[0];
  if(sel.value){
    // registered: inherit, hide manual entry
    const band=opt.getAttribute("data-band");
    if(band){ const bs=document.getElementById("con_band"); if(bs) bs.value=band; }
    manual.style.display="none";
  } else {
    manual.style.display="";
  }
}
function conEngId(){ const s=document.getElementById("con_eng"); return s&&s.value?s.value:null; }
function conTab(t){ _conTab=t; conRender(); }
function conExposure(){ const e={}; ["personal_data","cross_border","mission_critical","regulated"].forEach(k=>{const el=document.getElementById("con_"+k); if(el&&el.checked)e[k]=true;}); return e; }
function conRender(){
  const el=document.getElementById("conBody");
  if(_conTab==="min"){
    el.innerHTML=`<div class="card"><div class="card-label">Tiered minimum terms — scaled to inherent risk &amp; exposure</div>
      <div class="tier-grid">${CONTRACT_TIERS.map(t=>`<div class="tier-card ${t.tone}"><div class="tier-no">TIER ${t.tier}</div><b>${esc(t.name)}</b><p>${esc(t.desc)}</p></div>`).join("")}</div>
      <button class="btn" style="margin-top:14px" onclick="conTerms()">📋 Generate minimum terms</button><div id="conTermsOut"></div></div>`;
    if(_conTerms) renderConTerms();
  } else if(_conTab==="rev"){
    el.innerHTML=`<div class="card"><div class="card-label">Gap review — upload a contract document <span class="muted">(AI extracts terms)</span> or paste text</div>
      <div class="field"><label>Upload contract document</label><input id="con_doc" type="file"></div>
      <button class="btn" onclick="conGapDoc()">📄 Read document &amp; review gaps</button>
      <div style="margin:14px 0;text-align:center;color:var(--mut);font-size:12px">— or —</div>
      <textarea id="con_text" rows="6" placeholder="Paste contract clauses / heads of terms here…"></textarea>
      <button class="btn ghost" style="margin-top:10px" onclick="conGap()">🔎 Review pasted text</button><div id="conGapOut"></div></div>`;
  } else if(_conTab==="diff"){
    el.innerHTML=`<div class="card"><div class="card-label">Existing vs to-add — upload the existing contract <span class="muted">(AI extracts terms)</span> or paste text</div>
      <div class="field"><label>Upload existing contract</label><input id="con_pdoc" type="file"></div>
      <button class="btn" onclick="conDiffDoc()">📄 Read document &amp; compare</button>
      <div style="margin:14px 0;text-align:center;color:var(--mut);font-size:12px">— or —</div>
      <textarea id="con_prior" rows="6" placeholder="Paste prior/existing contract text…"></textarea>
      <button class="btn ghost" style="margin-top:10px" onclick="conDiff()">📑 Compare pasted text</button><div id="conDiffOut"></div></div>`;
  }
}
async function _fileToB64(input){
  const f=input.files[0]; if(!f) return null;
  const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
  return {filename:f.name,content_type:f.type||"application/octet-stream",data_b64:b64};
}
async function conGapDoc(){
  const file=await _fileToB64(document.getElementById("con_doc"));
  if(!file){ flash("Select a contract document"); return; }
  const body={file,engagement_id:conEngId(),inherent_band:val("con_band"),exposure:conExposure()};
  try{ const r=await api2("/contracts/gap-from-document",{method:"POST",body:JSON.stringify(body)});
    const g=r.gap_report;
    document.getElementById("conGapOut").innerHTML=`<div style="margin-top:12px">
      ${r.inherited_from_engagement?`<span class="pill ok">inherited ${esc(r.inherent_band)} from engagement</span> `:`<span class="pill mute">manual band ${esc(r.inherent_band)}</span> `}
      <a href="${esc(r.doc_link)}" target="_blank" class="pill info">view document</a>
      ${r.readable?'':' <span class="pill warn">document not machine-readable — gaps flagged conservatively</span>'}</div>
      <div style="margin-top:10px"><span class="pill ${g.critical_gaps?'crit':g.gaps.length?'warn':'ok'}">${esc(g.verdict)}</span></div>
      <table style="margin-top:10px"><tr><th>Gap</th><th>Tier</th><th>Severity</th><th>Basis</th></tr>
      ${g.gaps.map(x=>`<tr><td>${esc(x.clause)}</td><td>T${x.tier}</td><td><span class="pill ${x.severity==='Critical'?'crit':x.severity==='High'?'warn':'info'}">${esc(x.severity)}</span></td><td class="muted">${esc(x.basis)}</td></tr>`).join("")||'<tr><td colspan=4 class="muted">No gaps — all required terms present.</td></tr>'}</table>`;
  }catch(e){ flash(e.message); }
}
async function conDiffDoc(){
  const file=await _fileToB64(document.getElementById("con_pdoc"));
  if(!file){ flash("Select the existing contract document"); return; }
  // reuse gap-from-document to extract, then show present vs absent as existing/to-add
  const body={file,engagement_id:conEngId(),inherent_band:val("con_band"),exposure:conExposure()};
  try{ const r=await api2("/contracts/gap-from-document",{method:"POST",body:JSON.stringify(body)});
    const present=r.extracted_terms.present||[], gaps=r.gap_report.gaps||[];
    document.getElementById("conDiffOut").innerHTML=`<div style="margin-top:12px"><a href="${esc(r.doc_link)}" target="_blank" class="pill info">view document</a>
      ${r.readable?'':' <span class="pill warn">not machine-readable — conservative</span>'}</div>
      <div class="grid g2" style="margin-top:12px">
      <div class="card"><div class="card-label">✓ Terms detected in document (${present.length})</div>${present.map(t=>`<div class="dossier-row"><span class="dk">${esc(lbl(t))}</span><span class="dv">present</span></div>`).join("")||'<span class="muted">None detected</span>'}</div>
      <div class="card"><div class="card-label">+ Terms to be added (${gaps.length})</div>${gaps.map(t=>`<div class="dossier-row"><span class="dk">${esc(t.clause)}</span><span class="dv"><span class="pill ${t.severity==='Critical'?'crit':'warn'}">${esc(t.severity)}</span></span></div>`).join("")||'<span class="muted">None — fully covered</span>'}</div></div>`;
  }catch(e){ flash(e.message); }
}
async function conTerms(){
  const ep=entityPayload("con");
  try{ _conTerms=await api2("/contracts/terms",{method:"POST",body:JSON.stringify({inherent_band:val("con_band"),exposure:conExposure(),...ep})}); renderConTerms(); }
  catch(e){ flash(e.message); }
}
function renderConTerms(){
  const out=document.getElementById("conTermsOut"); if(!out)return;
  out.innerHTML=`<div style="margin-top:12px">${entityBadge(_conTerms.entity)} <span class="pill info">${_conTerms.count} terms · ${esc(_conTerms.inherent_band)}</span></div>
    <table style="margin-top:10px"><tr><th>Clause</th><th>Tier</th><th>Basis</th></tr>
    ${_conTerms.required_terms.map(t=>`<tr><td>${esc(t.name)}</td><td>T${t.tier}</td><td class="muted">${esc(t.basis)}</td></tr>`).join("")}</table>`;
}
async function conGap(){
  try{ _conGap=await api2("/contracts/gap-report",{method:"POST",body:JSON.stringify({contract_text:val("con_text"),inherent_band:val("con_band"),exposure:conExposure()})});
    document.getElementById("conGapOut").innerHTML=`<div style="margin-top:12px"><span class="pill ${_conGap.critical_gaps?'crit':_conGap.gaps.length?'warn':'ok'}">${esc(_conGap.verdict)}</span></div>
      <table style="margin-top:10px"><tr><th>Gap</th><th>Tier</th><th>Severity</th><th>Basis</th></tr>
      ${_conGap.gaps.map(g=>`<tr><td>${esc(g.clause)}</td><td>T${g.tier}</td><td><span class="pill ${g.severity==='Critical'?'crit':g.severity==='High'?'warn':'info'}">${esc(g.severity)}</span></td><td class="muted">${esc(g.basis)}</td></tr>`).join("")||'<tr><td colspan=4 class="muted">No gaps — all required terms present.</td></tr>'}</table>`;
  }catch(e){ flash(e.message); }
}
async function conDiff(){
  try{ _conDiff=await api2("/contracts/diff",{method:"POST",body:JSON.stringify({inherent_band:val("con_band"),exposure:conExposure(),prior_contract_texts:[val("con_prior")]})});
    document.getElementById("conDiffOut").innerHTML=`<div class="grid g2" style="margin-top:12px">
      <div class="card"><div class="card-label">✓ Terms already existing (${_conDiff.terms_already_existing.length})</div>${_conDiff.terms_already_existing.map(t=>`<div class="dossier-row"><span class="dk">${esc(t.clause)}</span><span class="dv">T${t.tier}</span></div>`).join("")||'<span class="muted">None detected</span>'}</div>
      <div class="card"><div class="card-label">+ Terms to be added (${_conDiff.terms_to_be_added.length})</div>${_conDiff.terms_to_be_added.map(t=>`<div class="dossier-row"><span class="dk">${esc(t.clause)}</span><span class="dv"><span class="pill ${t.severity==='Critical'?'crit':'warn'}">${esc(t.severity)}</span></span></div>`).join("")||'<span class="muted">None — fully covered</span>'}</div></div>`;
  }catch(e){ flash(e.message); }
}

/* ============ REQ 1 — Vendor Master record ============ */
let _vmId=null, _vmData={};
const VM_GROUPS=[
  ["Identifiers & keys",[["vendor_id","Vendor ID",1],["lei","LEI"],["euid","EUID"],["duns","D-U-N-S"],["registration_number","Reg. number"],["erp_id","ERP ID"],["sourcing_id","Sourcing ID"],["grc_id","GRC ID"],["group_id","Group ID",1]]],
  ["Legal identity",[["legal_name","Legal name"],["trading_name","Trading name"],["dba_names","DBA names"],["previous_names","Previous names"],["legal_form","Entity type"],["incorporation_country","Country of incorp."],["incorporation_date","Date of incorp."],["operating_status","Operating status"]]],
  ["Corporate structure & ownership",[["immediate_parent","Immediate parent"],["ultimate_parent","Ultimate parent",1],["subsidiaries","Subsidiaries"],["ownership_type","Ownership type"],["listing_status","Listing status",1],["ticker","Ticker"],["exchange","Exchange"]]],
  ["Classification & segmentation",[["sic_code","SIC code"],["unspsc_code","UNSPSC"],["nace_naics","NACE/NAICS"],["supplier_category","Supplier category"],["segmentation","Segmentation"],["tier","Tier"],["spend_band","Spend band"],["substitutability","Substitutability"]]],
  ["Relationship & internal ownership",[["relationship_owner","Relationship owner"],["sponsoring_bu","Sponsoring BU"],["cost_centre","Cost centre"],["strategic_importance","Strategic importance"],["business_dependency","Business dependency"],["relationship_health","Relationship health"]]],
  ["Addresses & geography",[["hq_address","HQ address",1],["billing_address","Billing address"],["remittance_address","Remittance address"],["operating_address","Operating address"],["service_countries","Service countries"],["data_locations","Data locations"],["geopolitical_risk","Geopolitical risk"],["sanctions_jurisdiction_exposure","Sanctions/jurisdiction exposure"]]],
  ["Financial & commercial",[["currency","Currency"],["payment_terms","Payment terms",1],["payment_method","Payment method"],["credit_limit","Credit limit"],["annual_spend","Annual spend"],["spend_trend","Spend trend"],["discount_terms","Discount terms"],["credit_rating","Credit rating"],["credit_rating_date","Rating date"],["financial_health_band","Fin-health band (rollup)"],["going_concern_flag","Going-concern flag"]]],
  ["Tax & regulatory",[["tax_id","Tax ID"],["vat_number","VAT number"],["w_form_status","W-8/W-9 status"],["tax_residency","Tax residency"],["regulatory_licences","Licences held"],["regulated_entity","Regulated entity"]]],
];
const VM_BANK=[["bank_account_name","Account name"],["iban","IBAN / account"],["swift_bic","SWIFT/BIC"],["routing_number","Routing"],["bank_verified","Verified"],["bank_verified_date","Verified date"],["bank_change_locked","Change-locked (dual-approve)"]];
async function openVendorMaster(vid){ _vmId=vid; try{ _vmData=await api2("/vendor-master/"+vid); }catch(e){ flash(e.message); return; } document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active')); renderVendorMaster(); }
function vmField(k,label,readonly){
  const v=_vmData[k]; const boolish=(k.endsWith("_flag")||k==="going_concern_flag"||k==="regulated_entity"||k==="sole_source"||k==="bank_verified"||k==="bank_change_locked");
  if(readonly) return `<div class="field"><label>${esc(label)}</label><input value="${v==null?'':esc(String(v))}" disabled style="background:#f1efe8"></div>`;
  if(boolish) return `<div class="field"><label>${esc(label)}</label><select id="vm_${k}"><option value="false" ${!v?'selected':''}>No</option><option value="true" ${v?'selected':''}>Yes</option></select></div>`;
  // CR-7: controlled vocabulary dropdown
  if(VOCAB[k]){
    return `<div class="field"><label>${esc(label)}</label><select id="vm_${k}"><option value="">— select —</option>${VOCAB[k].map(o=>`<option ${String(v)===o?'selected':''}>${esc(o)}</option>`).join("")}</select></div>`;
  }
  // CR-8: typed input (country/date/email/phone) where applicable
  if(fieldType(k)!=="text"){
    return `<div class="field"><label>${esc(label)}</label>${typedInput("vm_"+k,k,v)}</div>`;
  }
  return `<div class="field"><label>${esc(label)}</label><input id="vm_${k}" value="${v==null?'':esc(String(v))}"></div>`;
}
function renderVendorMaster(){
  const view=document.getElementById("view");
  const canBank = _vmData.iban!==undefined || _vmData.banking!=="restricted";
  view.innerHTML=`<div class="top"><div><h1>Vendor Master</h1><div class="sub">${esc(_vmData.legal_name||'')} · ${esc(_vmId)}</div></div>
    <div><button class="btn ghost" onclick="V.vendors()">← Register</button><button class="btn ghost" onclick="openVendorAttributes('${_vmId}')">🛡 Risk attributes</button><button class="btn ghost" onclick="openV360('${_vmId}')">◎ Vendor 360</button><button class="btn" onclick="saveVendorMaster()">Save master</button></div></div>
    <div class="crit-band ${_vmData.is_critical?'on':''}">
      <div><span class="crit-band-label">Critical vendor</span>
        <span class="crit-band-sub">${_vmData.criticality_reason?esc(_vmData.criticality_reason):'Set whether this vendor is business-critical'}</span></div>
      <div class="crit-toggle">
        <button class="crit-opt ${_vmData.is_critical?'sel':''}" onclick="vmSetCritical(true)">Yes</button>
        <button class="crit-opt ${_vmData.is_critical===false||_vmData.is_critical==null?'sel':''}" onclick="vmSetCritical(false)">No</button>
      </div></div>
    ${VM_GROUPS.map(([title,fields])=>`<div class="sec-h"><h2 style="font-size:14px">${esc(title)}</h2><div class="rule"></div></div>
      <div class="card"><div class="grid g3">${fields.map(([k,l,ro])=>vmField(k,l,ro)).join("")}</div></div>`).join("")}
    <div class="sec-h"><h2 style="font-size:14px">Ultimate beneficial owners</h2><div class="rule"></div></div>
    <div class="card"><div id="vm_ubo">${(_vmData.ubo||[]).map((o,i)=>`<div class="dossier-row"><span class="dk">${esc(o.name)}</span><span class="dv">${esc(String(o.pct||''))}% <button class="btn sm ghost" onclick="vmDelUbo(${i})">×</button></span></div>`).join("")||'<span class="muted">None recorded</span>'}</div>
      <div class="grid g3" style="margin-top:8px"><div class="field"><label>UBO name</label><input id="vm_ubo_n"></div><div class="field"><label>Ownership %</label><input id="vm_ubo_p" type="number"></div><div class="field"><label>&nbsp;</label><button class="btn ghost sm" onclick="vmAddUbo()">+ Add UBO</button></div></div></div>
    <div class="sec-h"><h2 style="font-size:14px">Engagements, contracts &amp; documents</h2><div class="rule"></div></div>
    <div id="vm_linkage" class="card muted">Loading linked records…</div>
    <div class="sec-h"><h2 style="font-size:14px">Banking & payment ${canBank?'<span class="pill warn" style="margin-left:8px">sensitive</span>':'<span class="pill mute" style="margin-left:8px">restricted — elevated permission required</span>'}</h2><div class="rule"></div></div>
    <div class="card">${canBank?`<div class="grid g3">${VM_BANK.map(([k,l])=>vmField(k,l)).join("")}</div>`:'<span class="muted">Banking fields are hidden for your role.</span>'}</div>`;
  vmLoadLinkage();
}
async function vmLoadLinkage(){
  const el=document.getElementById("vm_linkage"); if(!el) return;
  let d; try{ d=await api2("/vendor/"+_vmId+"/linkage"); }catch(e){ el.innerHTML=`<span class="muted">${esc(e.message)}</span>`; return; }
  const engs=d.engagements||[], cons=d.contracts||[], docs=d.documents||[];
  const engHtml = engs.length?engs.map(e=>`<div class="dossier-row"><span class="dk"><a style="cursor:pointer;color:#1A4D3C;text-decoration:underline" onclick="goEngagement('${e.engagement_id}')"><b>${esc(e.title||e.engagement_id)}</b></a> <span class="muted">· ${esc(e.engagement_id)} · ${esc(e.stage||'')}</span></span><span class="dv">${e.residual_band?`<span class="band ${e.residual_band}">${e.residual_band}</span> `:''}<span class="pill ${e.active?'ok':'mute'}">${e.active?'Active':'Inactive'}</span></span></div>`).join(""):'<span class="muted">No engagements.</span>';
  const conHtml = cons.length?cons.map(c=>`<div class="dossier-row"><span class="dk">${esc(c.type||'Contract')} <span class="muted">· ${esc(c.contract_id)}${c.status?' · '+esc(c.status):''}</span></span><span class="dv">${c.doc_link?`<a class="btn sm ghost" href="${esc(c.doc_link)}" target="_blank" rel="noopener">Fetch</a>`:'<span class="muted">no link</span>'}</span></div>`).join(""):'<span class="muted">No contracts.</span>';
  const docHtml = docs.length?docs.map(x=>`<div class="dossier-row"><span class="dk">${esc(x.filename||x.doc_id)} <span class="muted">· ${esc(x.purpose||'')}</span></span><span class="dv">${["fdd_report","reputation_report","fdd_reputation_report","proassess_report"].includes(x.purpose)?`<button class="btn sm ghost" onclick="openAiReport('${x.doc_id}')">View</button>`:`<a class="btn sm ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Fetch</a>`}</span></div>`).join(""):'<span class="muted">No documents.</span>';
  el.classList.remove("muted");
  el.innerHTML=`<div class="grid g3">
      <div><div class="card-label">Engagements <span class="muted">(${d.active_count} active · ${d.inactive_count} inactive)</span></div><div style="max-height:240px;overflow:auto">${engHtml}</div></div>
      <div><div class="card-label">Contracts</div><div style="max-height:240px;overflow:auto">${conHtml}</div></div>
      <div><div class="card-label">Documents</div><div style="max-height:240px;overflow:auto">${docHtml}</div></div>
    </div>`;
}
function goEngagement(eid){ window._egFocus=eid; goTo('engagements'); setTimeout(()=>{ const s=document.getElementById('esearch'); if(s){ s.value=eid; liveFilter('#et','tr.click',eid);} }, 400); }
let _vmUbo=null;
function vmAddUbo(){ _vmUbo=_vmUbo||(_vmData.ubo||[]); const n=val("vm_ubo_n"),p=val("vm_ubo_p"); if(!n)return; _vmData.ubo=[...(_vmData.ubo||[]),{name:n,pct:parseFloat(p)||0}]; renderVendorMaster(); }
function vmDelUbo(i){ _vmData.ubo.splice(i,1); renderVendorMaster(); }
async function vmSetCritical(flag){
  if(_vmData.is_critical===flag) return;
  let reason="";
  if(flag){ reason=prompt("Reason for marking this vendor critical:","Business-critical service")||"Business-critical"; }
  else { reason=prompt("Reason for marking this vendor NOT critical:","Compensating controls in place")||"Not critical"; }
  try{ await api2("/critical-vendors/"+_vmId+"/override",{method:"POST",body:JSON.stringify({is_critical:flag,reason})});
    _vmData=await api2("/vendor-master/"+_vmId); flash("Criticality updated"); renderVendorMaster();
  }catch(e){ flash(e.message); } }

async function saveVendorMaster(){
  const data={}; document.querySelectorAll('[id^="vm_"]').forEach(el=>{ const k=el.id.slice(3); if(["ubo_n","ubo_p"].includes(k))return; let v=el.value; if(v==="true")v=true; else if(v==="false")v=false; data[k]=v; });
  data.ubo=_vmData.ubo||[];
  const incBank = _vmData.banking!=="restricted";
  try{ _vmData=await api2("/vendor-master/"+_vmId,{method:"PUT",body:JSON.stringify({data,include_bank:incBank})}); flash("Master saved"); renderVendorMaster(); }catch(e){ flash(e.message); }
}

/* ============ REQ 2 — Vendor Attributes ============ */
let _vaId=null, _vaData={}, _vaTab="screening";
const SCREEN_LABELS={sanctions:"Sanctions",pep:"PEP",adverse_media:"Adverse media",abac:"ABAC",debarment:"Debarment",modern_slavery:"Modern slavery",coi:"Conflict of interest"};
async function openVendorAttributes(vid){ _vaId=vid; _vaTab="screening"; try{ _vaData=await api2("/vendor-attributes/"+vid); }catch(e){ flash(e.message); return; } renderVendorAttributes(); }
function renderVendorAttributes(){
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Vendor Risk Attributes</h1><div class="sub">${esc(_vaId)}</div></div>
    <div><button class="btn ghost" onclick="V.vendors()">← Register</button><button class="btn" onclick="vaRefresh()">↻ Refresh rollups</button></div></div>
    <div class="seg">${["screening","privacy","cyber","resilience","esg","insurance","monitoring","risk","governance"].map(t=>`<button class="${_vaTab===t?'on':''}" onclick="vaTab('${t}')">${({screening:"Screening",privacy:"Privacy",cyber:"Cyber",resilience:"Resilience",esg:"ESG",insurance:"Insurance",monitoring:"Monitoring",risk:"Risk profile",governance:"Governance"})[t]}</button>`).join("")}</div>
    <div id="vaBody"></div>`;
  vaRenderBody();
}
function vaTab(t){ _vaTab=t; vaRenderBody(); document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on', b.textContent.toLowerCase().startsWith(t.slice(0,4)))); }
function vaRenderBody(){
  const el=document.getElementById("vaBody"); const d=_vaData;
  if(_vaTab==="screening"){
    el.innerHTML=`<div class="card"><div class="card-label">Integrity screening — result · date · next-due</div>
      <table><tr><th>Type</th><th>Result</th><th>Detail</th><th>Screened</th><th>Next due</th><th></th></tr>
      ${d.screening.map(x=>`<tr><td>${esc(SCREEN_LABELS[x.screen_type]||x.screen_type)}</td>
        <td>${x.result?`<span class="pill ${x.result==='clear'||x.result==='on-file'?'ok':x.result==='hit'?'crit':'warn'}">${esc(x.result)}</span>`:'<span class="muted">—</span>'}</td>
        <td class="muted">${esc(x.detail||'')}</td><td>${esc(x.screened_date||'—')}</td>
        <td>${x.next_due?`${esc(x.next_due)} ${x.overdue?'<span class="pill crit">overdue</span>':''}`:'—'}</td>
        <td><button class="btn sm ghost" onclick="vaScreenEdit('${x.screen_type}')">edit</button></td></tr>`).join("")}</table></div>`;
  } else if(_vaTab==="insurance"){
    el.innerHTML=`<div class="card"><div class="card-label">Insurance policies</div>
      ${(d.insurance||[]).map(p=>`<div class="dossier-row"><span class="dk">${esc(p.policy_type)} · ${esc(p.insurer||'')}</span><span class="dv">${p.coverage_limit?esc(String(p.coverage_limit)):'—'} ${esc(p.currency||'')} · exp ${esc(p.certificate_expiry||'—')}</span></div>`).join("")||'<span class="muted">No policies</span>'}
      <div class="grid g3" style="margin-top:10px"><div class="field"><label>Policy type</label><select id="ins_t"><option>professional_indemnity</option><option>cyber</option><option>public_liability</option></select></div>
      <div class="field"><label>Coverage limit</label><input id="ins_l" type="number"></div><div class="field"><label>Insurer</label><input id="ins_i"></div></div>
      <div class="grid g2"><div class="field"><label>Currency</label><input id="ins_c" value="GBP"></div><div class="field"><label>Expiry</label><input id="ins_e" placeholder="YYYY-MM-DD"></div></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="vaAddInsurance()">+ Add policy</button></div>`;
  } else if(_vaTab==="monitoring"){
    el.innerHTML=`<div class="card"><div class="card-label">Continuous-monitoring signals — value · source · freshness (time-series)</div>
      <table><tr><th>Signal</th><th>Value</th><th>Source</th><th>Captured</th></tr>
      ${(d.monitor_signals||[]).map(s=>`<tr><td>${esc(s.signal_type)}</td><td><b>${esc(s.value||'')}</b></td><td class="muted">${esc(s.source||'')}</td><td>${esc(s.captured_at||'')}</td></tr>`).join("")||'<tr><td colspan=4 class="muted">No signals captured</td></tr>'}</table>
      <div class="grid g3" style="margin-top:10px"><div class="field"><label>Signal</label><select id="sig_t"><option>cyber_rating</option><option>financial_health</option><option>sanctions_media</option><option>news_sentiment</option><option>breach</option></select></div>
      <div class="field"><label>Value</label><input id="sig_v"></div><div class="field"><label>Source</label><input id="sig_s"></div></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="vaAddSignal()">+ Capture signal</button></div>`;
  } else if(_vaTab==="risk"){
    const r=d.risk_profile;
    el.innerHTML=`<div class="card"><div class="card-label">Risk profile (rollup, time-versioned)</div>
      ${r?`<div class="grid g4">
        <div class="card stat"><div class="v">${r.inherent_band||'—'}</div><div class="l">Inherent</div></div>
        <div class="card stat"><div class="v">${r.residual_band||'—'}</div><div class="l">Residual</div></div>
        <div class="card stat"><div class="v">${r.open_findings}</div><div class="l">Open findings</div></div>
        <div class="card stat"><div class="v">${r.max_severity||'—'}</div><div class="l">Max severity</div></div></div>
        <p class="muted" style="margin-top:10px">Last assessment: ${esc(r.last_assessment||'—')} · snapshot ${esc((r.snapshot_at||'').slice(0,10))}</p>`
        :'<span class="muted">No rollup yet — press “Refresh rollups”.</span>'}</div>`;
  } else {
    // generic domain editor (privacy/cyber/resilience/esg/governance)
    const domD=d[_vaTab]||{};
    const skip=new Set(["id","vendor_id","updated_at","certifications_json","nth_party_json","record_version","snapshot_at"]);
    const keys=Object.keys(domD).filter(k=>!skip.has(k));
    el.innerHTML=`<div class="card"><div class="card-label">${_vaTab[0].toUpperCase()+_vaTab.slice(1)} attributes</div>
      ${keys.length?`<div class="grid g3">${keys.map(k=>{const v=domD[k];const isBool=typeof v==="boolean";return `<div class="field"><label>${esc(lbl(k))}</label>${isBool?`<select id="dm_${k}"><option value="false" ${!v?'selected':''}>No</option><option value="true" ${v?'selected':''}>Yes</option></select>`:(fieldType(k)!=="text"?typedInput("dm_"+k,k,v):`<input id="dm_${k}" value="${v==null?'':esc(String(v))}">`)}</div>`;}).join("")}</div>`:'<span class="muted">No fields yet — fill and save to create.</span>'}
      ${_vaTab==="cyber"?`<p class="muted" style="margin-top:8px">Certifications roll up from the Artefact register automatically.</p>`:''}
      ${_vaTab==="resilience"?`<p class="muted" style="margin-top:8px">nth-party dependency tree is stored as structured JSON (set via API/import).</p>`:''}
      <button class="btn" style="margin-top:10px" onclick="vaSaveDomain('${_vaTab}')">Save ${_vaTab}</button></div>`;
  }
}
function vaScreenEdit(t){ modal(`<h3>Screening — ${esc(SCREEN_LABELS[t]||t)}</h3>
  <div class="field"><label>Result</label><select id="sc_r"><option value="">—</option><option>clear</option><option>hit</option><option>review</option><option>on-file</option><option>not-checked</option></select></div>
  <div class="field"><label>Detail (lists checked / notes)</label><input id="sc_d"></div>
  <div class="grid g2"><div class="field"><label>Screened date</label><input id="sc_sd" placeholder="YYYY-MM-DD"></div><div class="field"><label>Next due</label><input id="sc_nd" placeholder="YYYY-MM-DD"></div></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="vaSaveScreen('${t}')">Save</button></div>`); }
async function vaSaveScreen(t){ try{ await api2(`/vendor-attributes/${_vaId}/screening`,{method:"POST",body:JSON.stringify({screen_type:t,result:val("sc_r")||null,detail:val("sc_d")||null,screened_date:val("sc_sd")||null,next_due:val("sc_nd")||null})}); closeModal(); _vaData=await api2("/vendor-attributes/"+_vaId); renderVendorAttributes(); flash("Screening saved"); }catch(e){ flash(e.message); } }
async function vaSaveDomain(dom){ const data={}; document.querySelectorAll('[id^="dm_"]').forEach(el=>{ let v=el.value; if(v==="true")v=true;else if(v==="false")v=false; data[el.id.slice(3)]=v; }); try{ _vaData=await api2(`/vendor-attributes/${_vaId}/domain/${dom}`,{method:"POST",body:JSON.stringify({data})}); flash(dom+" saved"); renderVendorAttributes(); }catch(e){ flash(e.message); } }
async function vaAddInsurance(){ try{ await api2(`/vendor-attributes/${_vaId}/insurance`,{method:"POST",body:JSON.stringify({policy_type:val("ins_t"),coverage_limit:parseFloat(val("ins_l"))||null,insurer:val("ins_i"),currency:val("ins_c"),certificate_expiry:val("ins_e")})}); _vaData=await api2("/vendor-attributes/"+_vaId); renderVendorAttributes(); flash("Policy added"); }catch(e){ flash(e.message); } }
async function vaAddSignal(){ try{ await api2(`/vendor-attributes/${_vaId}/monitor-signal`,{method:"POST",body:JSON.stringify({signal_type:val("sig_t"),value:val("sig_v"),source:val("sig_s")})}); _vaData=await api2("/vendor-attributes/"+_vaId); renderVendorAttributes(); flash("Signal captured"); }catch(e){ flash(e.message); } }
async function vaRefresh(){ try{ await api2(`/vendor-attributes/${_vaId}/refresh-rollups`,{method:"POST",body:"{}"}); _vaData=await api2("/vendor-attributes/"+_vaId); flash("Rollups refreshed"); renderVendorAttributes(); }catch(e){ flash(e.message); } }

/* ============ REQ 3 — Engagement Register (full record) ============ */
let _erId=null, _erData={}, _erTab="contract";
const ER_GROUPS={
  origination:["business_justification","requested_by","procurement_category","sourcing_route","competitive_flag","competitive_rationale","requisition_ref","business_case_ref"],
  contract:["contract_reference","agreement_type","signatories","governing_law","governing_language","execution_date","effective_date","initial_term","renewal_type","renewal_window","notice_period","termination_rights","cure_period","change_of_control","assignment_rights","clause_flags","contract_status","contract_doc_link","contract_version"],
  scope:["scope_in","scope_out","objectives","assumptions","dependencies","delivery_location","receiving_location","delivery_locations","change_control_ref"],
  service:["service_type","supported_function","function_criticality","ict_flag","integration_points"],
  financial:["tcv","acv","pricing_model","rate_card","indexation_terms","payment_terms","invoicing_frequency","discounts","fx_terms","budget_allocation","po_numbers","goods_receipt_ref","invoice_refs","committed_spend","actual_spend"],
  governance:["engagement_owner","vendor_account_manager","governance_forum","governance_cadence","escalation_path","raci","relationship_sentiment","performance_reporting_cadence"],
  risk:["data_classification","data_volume","personal_data","data_subject_types","system_access","physical_access","mission_critical","cross_border","regulated_activity","fourth_party_reliance","concentration_contribution"],
  resilience:["rto","rpo","bcp_dependency","exit_plan","exit_plan_tested","transition_in_status","alternative_provider"],
  compliance:["dpa_in_place","audit_rights","audit_last_exercised","required_clauses_present","insurance_evidenced","regulatory_notifications"],
  lifecycle:["engagement_stage","approval_status","approver","approval_date","go_live_date","next_review_date","review_cadence","renewal_decision","renewal_decision_date","end_date","end_reason","transition_status"],
  escrow:["escrow_required","escrow_type","escrow_status","escrow_agent","escrow_agreement_ref","escrow_amount","escrow_deposit_frequency","escrow_beneficiaries","escrow_last_verified","escrow_release_conditions","escrow_notes"],
};
async function openEngagementRegister(eid){ _erId=eid; _erTab="contract"; try{ _erData=await api2("/engagement-register/"+eid); }catch(e){ flash(e.message); return; } renderEngReg(); }
function renderEngReg(){
  const view=document.getElementById("view"); const b=_erData.base||{};
  const tabs=["origination","contract","scope","service","financial","governance","risk","resilience","compliance","escrow","lifecycle","irqdd","children"];
  const TAB_LABEL={irqdd:"IRQ &amp; DD"};
  view.innerHTML=`<div class="top"><div><h1>Engagement Register</h1><div class="sub">${esc(b.engagement_id||'')} · ${esc(b.title||'')} · vendor ${esc(b.vendor_id||'')}</div></div>
    <div><button class="btn ghost" onclick="V.engagements()">← Engagements</button>${_erTab!=='children'?`<button class="btn" onclick="saveEngReg()">Save</button>`:''}</div></div>
    <div class="crit-band ${b.is_critical?'on':''}">
      <div><span class="crit-band-label">Critical engagement</span>
        <span class="crit-band-sub">Inherent ${esc(b.inherent_band||'—')} · residual ${esc(b.residual_band||'—')} — set whether this engagement is business-critical</span></div>
      <div class="crit-toggle">
        <button class="crit-opt ${b.is_critical?'sel':''}" onclick="erSetCritical(true)">Yes</button>
        <button class="crit-opt ${!b.is_critical?'sel':''}" onclick="erSetCritical(false)">No</button>
      </div></div>
    <div class="seg">${tabs.map(t=>`<button class="${_erTab===t?'on':''}" onclick="erTab('${t}')">${TAB_LABEL[t]||(t[0].toUpperCase()+t.slice(1))}</button>`).join("")}</div>
    <div id="erBody"></div>
    <div id="erAssessments" style="margin-top:18px"></div>`;
  erRenderBody();
  erLoadAssessments();
}
async function erLoadAssessments(){
  const host=document.getElementById('erAssessments'); if(!host) return;
  let d; try{ d=await api2('/engagement/'+_erId+'/assessments'); }catch(e){ host.innerHTML=''; return; }
  const BAND=b=>`<span class="pill ${b==='HIGH'||b==='CRITICAL'?'crit':b==='ELEVATED'?'warn':b==='MODERATE'?'info':'ok'}">${esc(b||'—')}</span>`;
  const dueBadge=d.reassessment_due?`<span class="tag" style="background:#DC2626;color:#fff;margin-left:6px">Reassessment due</span>`:'';
  const head=`<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">
     <div><div class="card-label" style="margin:0">Last assessed</div><b>${d.last_assessment_date?esc(fmtDate(d.last_assessment_date)):'—'}</b></div>
     <div><div class="card-label" style="margin:0">Next reassessment due</div><b>${d.next_assessment_due?esc(fmtDate(d.next_assessment_due)):'—'}</b>${dueBadge}</div>
     ${d.reassessment_reason?`<div style="flex:1;min-width:200px"><div class="card-label" style="margin:0">Reassessment trigger</div><span class="muted" style="font-size:12px">${esc(d.reassessment_reason)}</span></div>`:''}</div>`;
  const rows=(d.assessments||[]).map((a,i)=>`<tr>
     <td>${a.date?esc(fmtDate(a.date)):'—'}${i===0?' <span class="tag" style="background:#1A4D3C;color:#fff">latest</span>':''}</td>
     <td><b>${esc(a.assessment_id)}</b></td>
     <td>${esc(a.status||'—')}</td>
     <td>${BAND(a.inherent_band)} → ${BAND(a.residual_band)}</td>
     <td>${esc(a.outcome||'—')}</td>
     <td>${esc(a.assessor||'—')}</td>
     <td style="white-space:nowrap">${a.signed_off?'✓ signed':''}${a.locked?' 🔒':''}</td></tr>`).join('');
  host.innerHTML=`<div class="sec-h"><h2 style="font-size:14px">Assessment history (${d.count||0})</h2><div class="rule"></div></div>
    <div class="card">${head}
    ${rows?`<table style="margin-top:10px"><tr><th>Date</th><th>Assessment</th><th>Status</th><th>Inherent → Residual</th><th>Outcome</th><th>Assessor</th><th></th></tr>${rows}</table>`:'<div class="muted" style="margin-top:8px">No assessments recorded on this engagement yet.</div>'}</div>`;
}
async function erSetCritical(flag){
  const b=_erData.base||{}; if(!!b.is_critical===flag) return;
  const reason=prompt(flag?"Reason for marking this engagement critical:":"Reason for marking NOT critical:", flag?"Business-critical engagement":"Not critical")||"manual";
  try{ await api2("/engagements/"+_erId+"/criticality-override",{method:"POST",body:JSON.stringify({is_critical:flag,reason})});
    _erData=await api2("/engagement-register/"+_erId); flash("Criticality updated"); renderEngReg();
  }catch(e){ flash(e.message); } }
function erTab(t){ _erTab=t; renderEngReg(); }
async function erRenderIrqDd(){
  const el=document.getElementById("erBody"); if(!el) return;
  el.innerHTML=`<div class="muted">Loading IRQ &amp; due-diligence detail…</div>`;
  let d; try{ d=await api2("/engagement/"+_erId+"/irq-dd"); }catch(e){ el.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  if(!d.has_assessment){ el.innerHTML=emptyBox("📋","No assessment on this engagement yet","Run ProAssess or capture an assessment to populate the IRQ &amp; DDQ."); return; }
  const bandPill=b=>`<span class="pill ${b==='HIGH'?'crit':b==='ELEVATED'?'warn':b==='MODERATE'?'info':'ok'}">${esc(b||'—')}</span>`;
  const rmap={COMPLIANT:"ok",PARTIAL:"warn",MARGINAL:"crit","N/A":"info","—":"info"};
  const res=d.residual||{};
  const ds=d.domain_scores||{};
  const dsBars=Object.keys(ds).length?`<div class="card"><div class="card-label">Inherent domain scores · weighted ${d.weighted_pct!=null?d.weighted_pct+'%':'—'}</div>
    ${Object.entries(ds).map(([k,v])=>`<div style="display:flex;align-items:center;gap:10px;margin:5px 0">
      <span style="width:130px;font-size:12px;text-transform:capitalize">${esc(k)}</span>
      <div style="flex:1;height:8px;background:#eee;border-radius:6px;overflow:hidden"><div style="height:100%;width:${(v/4*100)}%;background:${v>=3?'#8A2E3B':v>=2?'#B8862B':'#1A4D3C'}"></div></div>
      <span class="muted" style="font-size:11px;width:28px;text-align:right">${v}/4</span></div>`).join("")}</div>`:"";
  el.innerHTML=`
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">
        <div><div class="card-label" style="margin:0">Inherent</div>${bandPill(d.inherent_band)}</div>
        <div><div class="card-label" style="margin:0">Residual</div>${bandPill(res.band)}</div>
        <div><div class="card-label" style="margin:0">Tier</div><b>${esc(d.tier||'—')}</b></div>
        <div><div class="card-label" style="margin:0">Completeness</div><b>CLS ${esc(String(d.completeness_cls||'—'))}</b></div>
        <div style="flex:1"></div>
        <div style="text-align:right"><div class="card-label" style="margin:0">Recommendation</div><b>${esc(d.recommendation||'—')}</b>
          ${d.route?`<div class="muted" style="font-size:11px">${esc(d.route)}</div>`:""}</div>
      </div>
      ${d.scope_summary?`<p class="muted" style="margin-top:10px;font-size:12px">${esc(d.scope_summary)}</p>`:""}
      <p class="muted" style="font-size:11px;margin-top:4px">Assessment ${esc(d.assessment_id||'')} · ${esc(d.status||'')}${d.assessor?` · assessor ${esc(d.assessor)}`:''} · residual reflects ${res.partial||0} partial / ${res.marginal||0} marginal control gap(s)</p>
    </div>
    <div class="sec-h"><h2 style="font-size:13px">Inherent Risk Questionnaire — all answers</h2><div class="rule"></div></div>
    <div class="card"><table><tr><th style="width:60px">#</th><th>Question</th><th style="width:40%">Answer</th></tr>
      ${d.irq.map(q=>`<tr><td class="muted">${esc(q.id)}</td><td>${esc(q.question)}</td>
        <td>${q.answered?`<b>${esc(q.answer)}</b>`:'<span class="muted">— not answered —</span>'}</td></tr>`).join("")}</table></div>
    <div class="sec-h"><h2 style="font-size:13px">Due-Diligence Questionnaire — by domain</h2><div class="rule"></div></div>
    ${d.ddq.map(dom=>`<div class="card"><div class="card-label">${esc(dom.name)}</div>
      <table>${dom.questions.map(q=>`<tr><td class="muted" style="width:60px">${esc(q.id)}</td>
        <td>${esc(q.question)} ${q.critical?'<span class="tag" style="background:#f6e2de;color:#8A2E3B">critical</span>':''}</td>
        <td style="width:130px"><span class="pill ${rmap[q.response]||'info'}">${esc(q.response)}</span></td></tr>`).join("")}</table></div>`).join("")}
    ${dsBars}
    <div class="sec-h"><h2 style="font-size:13px">Linked documents &amp; contracts</h2><div class="rule"></div></div>
    <div class="card">
      ${(d.documents||[]).length?`<ul style="margin:0 0 0 18px;font-size:12.5px;line-height:1.8">${d.documents.map(x=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.filename)}</a> <span class="muted">· ${esc(x.purpose||'')} · ${esc(x.scope)}</span></li>`).join("")}</ul>`:'<span class="muted">No documents linked.</span>'}
      ${(d.contracts||[]).length?`<div style="margin-top:10px"><div class="card-label">Contracts</div><ul style="margin:0 0 0 18px;font-size:12.5px;line-height:1.8">${d.contracts.map(c=>`<li>${esc(c.type)} · ${esc(c.status||'')} ${c.doc_link?`<a href="${esc(c.doc_link)}" target="_blank" rel="noopener">open</a>`:''}</li>`).join("")}</ul></div>`:''}
    </div>`;
}
function erRenderBody(){
  const el=document.getElementById("erBody"); const ext=_erData.ext||{};
  if(_erTab==="irqdd"){ erRenderIrqDd(); return; }
  if(_erTab==="children"){
    el.innerHTML=["deliverables","milestones","slas","obligations","personnel"].map(kind=>{
      const rows=_erData[kind]||[];
      return `<div class="sec-h"><h2 style="font-size:13px">${kind[0].toUpperCase()+kind.slice(1)} (${rows.length})</h2><div class="rule"></div></div>
        <div class="card">${rows.map(r=>`<div class="dossier-row"><span class="dk">${esc(r.description||r.name||r.metric||'')}</span><span class="dv">${esc(r.due_date||r.target||r.role||r.status||'')} <button class="btn sm ghost" onclick="erDelChild('${kindSingular(kind)}',${r.id})">×</button></span></div>`).join("")||'<span class="muted">None</span>'}
        <button class="btn ghost sm" style="margin-top:8px" onclick="erAddChild('${kindSingular(kind)}')">+ Add ${kindSingular(kind)}</button></div>`;
    }).join("");
    return;
  }
  const fields=ER_GROUPS[_erTab]||[];
  let contractsPanel="";
  if(_erTab==="contract"){
    contractsPanel=`<div class="sec-h" style="margin-top:14px"><h2 style="font-size:13px">Linked contract records</h2><div class="rule"></div></div>
      <div class="card" id="erContracts"><span class="muted">Loading…</span></div>`;
  }
  el.innerHTML=`<div class="card"><div class="grid g3">${fields.map(k=>{const v=ext[k];const isBool=typeof v==="boolean";return `<div class="field"><label>${esc(lbl(k))}</label>${isBool?`<select id="er_${k}"><option value="false" ${!v?'selected':''}>No</option><option value="true" ${v?'selected':''}>Yes</option></select>`:(fieldType(k)!=="text"?typedInput("er_"+k,k,v):`<input id="er_${k}" value="${v==null?'':esc(String(v))}">`)}</div>`;}).join("")}</div></div>${contractsPanel}`;
  if(_erTab==="contract") erLoadContracts();
}
async function erLoadContracts(){
  const host=document.getElementById("erContracts"); if(!host) return;
  const b=_erData.base||{};
  try{
    const list=await api2("/contracts?engagement_id="+_erId);
    host.innerHTML=`${list.length?`<table><tr><th>Contract ID</th><th>Type</th><th>Primary link</th><th>Parent MSA</th><th>Status</th><th>Critical</th></tr>
      ${list.map(c=>`<tr><td><b>${esc(c.contract_id)}</b></td><td>${esc(c.contract_type)}</td><td>${esc(c.primary_link)}</td>
        <td>${esc(c.parent_msa||'—')}</td><td><span class="tag">${esc(c.status||'draft')}</span></td>
        <td>${c.is_critical?'<span class="tag crit">CRITICAL</span>':'—'}</td></tr>`).join("")}</table>`
      :'<span class="muted">No first-class contract records linked yet.</span>'}
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn ghost sm" onclick="erSyncContract()">Sync from fields above</button>
      <button class="btn ghost sm" onclick="erNewContract('${esc(b.vendor_id||'')}')">+ New contract record</button></div>`;
  }catch(e){ host.innerHTML=`<span class="err">${esc(e.message)}</span>`; }
}
async function erSyncContract(){ try{ const r=await api2("/engagement-register/"+_erId+"/sync-contract",{method:"POST",body:"{}"}); flash(r.synced?("Synced "+r.contract_id):("Not synced: "+(r.reason||""))); erLoadContracts(); }catch(e){ flash(e.message); } }
function erNewContract(vid){ modal(`<h3>New contract record</h3>
  <div class="field"><label>Type</label><select id="ct_type"><option>Contract</option><option>MSA</option><option>SOW</option><option>PO</option><option>Order</option><option>NDA</option><option>DPA</option><option>Framework</option><option>Amendment</option></select></div>
  <div class="field"><label>Title</label><input id="ct_title"></div>
  <p class="muted" style="font-size:12px">MSA/Framework link to the vendor; Contract/PO/SOW link to this engagement.</p>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="erSaveContract('${vid}')">Create</button></div>`); }
async function erSaveContract(vid){ const type=val("ct_type"); const master=["MSA","Framework","Master"].includes(type);
  const body=master?{contract_type:type,vendor_id:vid,data:{title:val("ct_title")}}:{contract_type:type,engagement_id:_erId,data:{title:val("ct_title")}};
  try{ await api2("/contracts",{method:"POST",body:JSON.stringify(body)}); closeModal(); flash("Contract created"); erLoadContracts(); }catch(e){ flash(e.message); } }
function kindSingular(k){ return ({deliverables:"deliverable",milestones:"milestone",slas:"sla",obligations:"obligation",personnel:"personnel"})[k]; }
async function saveEngReg(){ const data={}; document.querySelectorAll('[id^="er_"]').forEach(el=>{ let v=el.value; if(v==="true")v=true;else if(v==="false")v=false; if(["tcv","acv","committed_spend","actual_spend"].includes(el.id.slice(3)))v=parseFloat(v)||null; data[el.id.slice(3)]=v; }); try{ _erData=await api2("/engagement-register/"+_erId,{method:"PUT",body:JSON.stringify({data})}); flash("Engagement saved"); renderEngReg(); }catch(e){ flash(e.message); } }
function erAddChild(kind){
  const f={deliverable:[["description","Description"],["due_date","Due date"],["acceptance_criteria","Acceptance"],["accountable_owner","Owner"]],
    milestone:[["name","Name"],["due_date","Due date"],["payment_trigger","Payment trigger"]],
    sla:[["metric","Metric"],["target","Target"],["measurement_window","Window"],["credit_penalty","Credit/penalty"]],
    obligation:[["description","Description"],["obl_type","Type"],["obligated_party","Party"],["due_date","Due date"],["accountable_owner","Owner"]],
    personnel:[["name","Name"],["role","Role"],["vetting_status","Vetting"],["access_level","Access level"],["location","Location"]]}[kind];
  modal(`<h3>Add ${kind}</h3>${f.map(([k,l])=>`<div class="field"><label>${esc(l)}</label><input id="ec_${k}"></div>`).join("")}
    <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="erSaveChild('${kind}')">Add</button></div>`);
}
async function erSaveChild(kind){ const data={}; document.querySelectorAll('[id^="ec_"]').forEach(el=>{ if(el.value)data[el.id.slice(3)]=el.value; }); try{ await api2(`/engagement-register/${_erId}/child`,{method:"POST",body:JSON.stringify({kind,data})}); closeModal(); _erData=await api2("/engagement-register/"+_erId); renderEngReg(); flash(kind+" added"); }catch(e){ flash(e.message); } }
async function erDelChild(kind,cid){ try{ await api2(`/engagement-register/${_erId}/child/${kind}/${cid}`,{method:"DELETE"}); _erData=await api2("/engagement-register/"+_erId); renderEngReg(); }catch(e){ flash(e.message); } }

/* ---------- Vendor 360 dashboard ---------- */
V.vendor360=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Vendor 360</h1>
    <div class="sub">Single-pane synthesis · correlated internal & external signals</div></div></div>
    <div class="field" style="max-width:380px"><input id="v360search" list="v360sl" placeholder="🔍 Search vendors…" oninput="liveFilter('#v360Body','.port-row[onclick]',this.value)"><datalist id="v360sl"></datalist></div>
    <div id="v360Body" class="muted">Loading portfolio…</div>`;
  try{
    const port = await api2("/vendor360/portfolio");
    if(!port.length){ view.querySelector("#v360Body").innerHTML=`<div class="card muted">No vendors yet. Register a vendor to see its 360 view.</div>`; return; }
    fillDatalist("v360sl", port.map(p=>p.legal_name));
    view.querySelector("#v360Body").innerHTML=`
      <div class="port-row" style="background:#f6f4ec;cursor:default;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7a8c84;font-weight:700">
        <div>Vendor</div><div>Tier</div><div>Posture</div><div>Residual</div><div style="text-align:right">Findings</div></div>
      ${port.map(p=>`<div class="port-row" onclick="openV360('${p.vendor_id}')">
        <div><b>${esc(p.legal_name)}</b> ${p.is_critical?'<span class="v360-crit" style="position:static;display:inline-block;padding:2px 7px;font-size:9px;margin-left:6px">CRITICAL</span>':''}<div class="muted" style="font-size:11px">${esc(p.vendor_id)}</div></div>
        <div class="muted">${esc(p.tier||'—')}</div>
        <div><span class="posture-pill pp-${p.posture_level}">${esc(p.posture)}</span></div>
        <div>${p.residual?`<span class="band ${p.residual}">${p.residual}</span>`:'<span class="muted">—</span>'}</div>
        <div style="text-align:right;font-weight:600">${p.open_findings}</div></div>`).join("")}`;
  }catch(e){ view.querySelector("#v360Body").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};

async function openV360(vid){
  const view=document.getElementById("view");
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  view.innerHTML=`<div class="muted">Compiling 360 view…</div>`;
  let d, attr={}; try{ d = await api2("/vendor360/"+vid); }catch(e){ view.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  try{ attr = await api2("/vendor-attributes/"+vid); }catch(e){ attr={}; }
  const dim=d.dimensions, pl=d.posture.level;
  const fmtMoney=n=>n?("$"+Number(n).toLocaleString()):"—";
  const exc=d.exceptions||[];
  view.innerHTML=`
    <div class="top"><div><h1 style="font-size:20px">Vendor 360</h1></div>
      <div><button class="btn ghost" onclick="V.vendor360()">← Portfolio</button>
        <button class="btn ghost" onclick="openVendorAttributes('${vid}')">Risk attributes</button></div></div>

    <div class="v360-hero">
      ${d.is_critical?`<div class="v360-crit">CRITICAL VENDOR</div>`:''}
      <div class="vname">${esc(d.legal_name)}</div>
      <div class="vmeta">${esc(vid)} · ${esc(d.tier||'Untiered')}${d.ultimate_parent?' · parent '+esc(d.ultimate_parent):''}</div>
      <div class="v360-verdict">
        <div class="v360-dot l${pl}"></div>
        <div><div class="v360-vlabel">${esc(d.posture.label)}</div>
          <div class="v360-vsub">Consolidated posture · residual ${esc(d.posture.band||'—')} · reconciled with risk profile</div></div>
      </div>
    </div>

    <div class="v360-dims">
      <div class="v360-dim"><div class="dv">${dim.risk.residual||dim.risk.inherent||'—'}</div><div class="dl">Risk</div></div>
      <div class="v360-dim"><div class="dv">${dim.financial.band||'—'}</div><div class="dl">Financial</div></div>
      <div class="v360-dim"><div class="dv">${dim.reputation.summary?'●':'—'}</div><div class="dl">Reputation</div></div>
      <div class="v360-dim"><div class="dv">${dim.monitoring.signal||'—'}</div><div class="dl">Monitoring</div></div>
      <div class="v360-dim"><div class="dv">${dim.performance.score!=null?dim.performance.score:'—'}</div><div class="dl">Performance</div></div>
      <div class="v360-dim"><div class="dv">${dim.compliance.open_findings}</div><div class="dl">Findings</div></div>
    </div>

    <div class="v360-grid">
      <div class="v360-panel"><h3>⚠ Ranked exceptions (${d.exception_count})</h3>
        ${exc.length?exc.map(x=>`<div class="v360-exc"><span class="v360-sevdot sev-${x.severity}"></span>
          <span style="flex:1">${esc(x.detail)}</span><span class="muted" style="font-size:11px">${esc(x.type.replace(/_/g,' '))}</span></div>`).join(""):'<div class="muted">No exceptions — clean posture.</div>'}
      </div>
      <div class="v360-panel"><h3>Concentration & dependency</h3>
        <div class="v360-metric"><span class="mk">Engagements</span><span class="mv">${d.concentration.engagement_count}</span></div>
        <div class="v360-metric"><span class="mk">Total annual value</span><span class="mv">${fmtMoney(d.concentration.total_annual_value)}</span></div>
        <div class="v360-metric"><span class="mk">Critical engagements</span><span class="mv">${d.concentration.critical_engagements.length}</span></div>
        <div class="v360-metric"><span class="mk">Contracts</span><span class="mv">${d.concentration.contract_count} (${d.concentration.critical_contracts} critical)</span></div>
      </div>
    </div>

    <div class="v360-grid">
      <div class="v360-panel"><h3>Exposure vs control</h3>
        <div class="v360-metric"><span class="mk">Inherent risk</span><span class="mv">${d.exposure_vs_control.inherent||'—'}</span></div>
        <div class="v360-metric"><span class="mk">Residual risk</span><span class="mv">${d.exposure_vs_control.residual||'—'}</span></div>
        <div class="v360-metric"><span class="mk">Open findings</span><span class="mv">${d.exposure_vs_control.open_findings}</span></div>
        <div class="v360-metric"><span class="mk">Max severity</span><span class="mv">${d.exposure_vs_control.max_severity||'—'}</span></div>
        <div class="v360-bar"><span style="width:${Math.min(100,(d.exposure_vs_control.gap||0)*33)}%;background:${d.exposure_vs_control.gap>1?'#e08a3c':'#4caf7e'}"></span></div>
        <div class="muted" style="font-size:11px;margin-top:5px">Control gap (inherent − residual): ${d.exposure_vs_control.gap}</div>
      </div>
      <div class="v360-panel"><h3>Performance & financial</h3>
        <div class="v360-metric"><span class="mk">Performance score</span><span class="mv">${dim.performance.score!=null?dim.performance.score+' / 5':'—'}</span></div>
        <div class="v360-metric"><span class="mk">Review cadence</span><span class="mv">${dim.performance.cadence||'—'}</span></div>
        <div class="v360-metric"><span class="mk">Last review</span><span class="mv">${dim.performance.last_review||'—'}</span></div>
        <div class="v360-metric"><span class="mk">Financial health</span><span class="mv">${dim.financial.band||'—'}</span></div>
        <div class="v360-metric"><span class="mk">Monitoring signal</span><span class="mv">${dim.monitoring.signal||'—'}</span></div>
      </div>
    </div>

    <div class="v360-panel" style="margin-bottom:14px">
      <h3 style="display:flex;justify-content:space-between;align-items:center">Risk attributes
        <button class="btn sm ghost" onclick="openVendorAttributes('${vid}')">Open editor →</button></h3>
      <div class="v360-attr-grid">
        ${(()=>{const cy=attr.cyber||{},pr=attr.privacy||{},re=attr.resilience||{},es=attr.esg||{},sc=attr.screening||[],ins=attr.insurance||[];
          const certs=(()=>{try{return JSON.parse(cy.certifications_json||"[]").length}catch(e){return 0}})();
          const screenAdverse=(Array.isArray(sc)?sc:[]).filter(x=>x&&(x.result==="hit"||x.result==="adverse")).length;
          return `
          <div class="v360-attr"><div class="al">Cyber assurance</div><div class="av">${esc(cy.assurance_status||'—')}</div><div class="as">${certs} cert(s) · rating ${esc(cy.external_rating||'—')}</div></div>
          <div class="v360-attr"><div class="al">Privacy</div><div class="av">${esc(pr.dpa_status||pr.data_processing_role||'—')}</div><div class="as">${pr.cross_border?'cross-border':'—'}</div></div>
          <div class="v360-attr"><div class="al">Resilience</div><div class="av">${re.bcp_status||re.exit_plan_status||'—'}</div><div class="as">RTO ${esc(re.rto||'—')} · RPO ${esc(re.rpo||'—')}</div></div>
          <div class="v360-attr"><div class="al">ESG</div><div class="av">${esc(es.esg_rating||es.rating||'—')}</div><div class="as">${esc(es.modern_slavery_status||'—')}</div></div>
          <div class="v360-attr"><div class="al">Screening</div><div class="av">${screenAdverse?'<span style="color:#c0392b">'+screenAdverse+' adverse</span>':'Clear'}</div><div class="as">${(Array.isArray(sc)?sc.length:0)} check(s)</div></div>
          <div class="v360-attr"><div class="al">Insurance</div><div class="av">${(Array.isArray(ins)?ins.length:0)} policy(ies)</div><div class="as">${esc((attr.risk_profile||{}).monitoring_signal||'—')}</div></div>`;})()}
      </div>
    </div>

    <div class="v360-panel" style="margin-bottom:14px"><h3>Engagements (${d.engagements.length})</h3>
      ${d.engagements.length?d.engagements.map(e=>`<div class="v360-metric"><span class="mk">${esc(e.title)} <span class="muted">${esc(e.engagement_id)}</span></span>
        <span class="mv">${e.residual_band?'<span class="band '+e.residual_band+'">'+e.residual_band+'</span>':'—'} · ${fmtMoney(e.annual_value)}</span></div>`).join(""):'<div class="muted">No engagements.</div>'}
    </div>

    <div class="v360-panel" style="margin-bottom:14px"><h3>📋 Assessment reports</h3>
      <div class="muted" style="font-size:11.5px;margin-bottom:8px">A detailed assessment report for each engagement — assessment history, findings, documents and decision.</div>
      ${d.engagements.length?d.engagements.map(e=>`<div class="asr-row"><span class="mk">${esc(e.title)} <span class="muted">${esc(e.engagement_id)}</span></span>
        <button class="btn ghost sm" onclick="openAssessmentReport('${e.engagement_id}')">View detailed report →</button></div>`).join(""):'<div class="muted">No engagements to report on.</div>'}
    </div>

    <div class="muted" style="font-size:11px;text-align:center;padding:8px">
      One version of the truth · reconciled with consolidated risk profile · snapshot ${esc((d.provenance.risk_profile_snapshot||'').slice(0,19).replace('T',' '))} · source: ${esc(d.provenance.source)}
    </div>`;
}

/* ---------- Vendor 360: detailed engagement assessment report ---------- */
async function openAssessmentReport(eid){
  flash("Compiling assessment report…");
  let r; try{ r=await api2("/engagements/"+eid+"/assessment-report"); }catch(e){ flash(e.message); return; }
  const esc2=t=>String(t==null?'':t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const v=r.vendor||{}, eng=r.engagement||{}, la=r.latest_assessment, fs=r.findings_summary||{};
  const sevColor={Critical:'#7A1F2B',High:'#C0392B',Medium:'#B8862B',Low:'#3F5566'};
  const stamp=new Date().toISOString().slice(0,16).replace('T',' ')+' UTC';
  const findRows=(r.findings||[]).map(f=>`<tr><td>${esc2(f.finding_id)}</td><td>${esc2(f.title)}</td><td><span style="color:${sevColor[f.severity]||'#444'};font-weight:700">${esc2(f.severity)}</span></td><td>${esc2(f.domain||'—')}</td><td>${esc2(f.status)}</td></tr>`).join("")||'<tr><td colspan="5" style="color:#888">No findings recorded.</td></tr>';
  const histRows=(r.assessment_history||[]).map(a=>`<tr><td>${esc2(a.assessment_id)}</td><td>${esc2(a.status)}</td><td>${esc2(a.inherent_band||'—')}</td><td>${esc2(a.residual_band||'—')}</td><td>${esc2(a.outcome||'—')}</td><td>${esc2((a.created_at||'').slice(0,10))}</td></tr>`).join("")||'<tr><td colspan="6" style="color:#888">No assessments.</td></tr>';
  const docRows=(r.documents||[]).map((d,i)=>`<tr><td>${i+1}</td><td>${esc2(d.filename)}</td><td>${esc2(d.purpose||'—')}</td><td>${Math.round((d.size_bytes||0)/1024)} KB</td><td>${esc2((d.created_at||'').slice(0,10))}</td></tr>`).join("")||'<tr><td colspan="5" style="color:#888">No documents on file.</td></tr>';
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Assessment Report — ${esc2(eng.engagement_id)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.6;max-width:900px;margin:0 auto;padding:40px}
h1{font-family:Georgia,serif;color:#14302A;font-size:27px;margin:0 0 2px}.sub{color:#5a6472;font-size:13px;margin-bottom:22px}
h2{font-family:Georgia,serif;color:#14302A;font-size:17px;border-bottom:2px solid #B8862B;padding-bottom:5px;margin:24px 0 11px}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px 22px;background:#F7F5F0;border:1px solid #E5DFD0;border-radius:10px;padding:16px;font-size:12.5px;margin-bottom:6px}
.meta b{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#7a8c84}
table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}th{background:#14302A;color:#fff;text-align:left;padding:7px 9px;font-size:10.5px}
td{border-bottom:1px solid #E5DFD0;padding:6px 9px}.pills span{display:inline-block;margin-right:8px;font-size:12px}
.foot{margin-top:28px;border-top:1px solid #E5DFD0;padding-top:11px;color:#888;font-size:11px}
@media print{body{padding:0}.noprint{display:none}}</style></head><body>
<h1>Engagement Assessment Report</h1>
<div class="sub">${esc2(v.name||'Vendor')} · ${esc2(eng.title||'')} · ${esc2(eng.engagement_id)} · generated ${stamp}</div>
<button class="noprint" onclick="window.print()" style="background:#14302A;color:#fff;border:0;padding:9px 16px;border-radius:8px;cursor:pointer;margin-bottom:14px">🖨 Save as PDF</button>
<h2>Summary</h2>
<div class="meta">
<div><b>Vendor</b>${esc2(v.name||'—')}${v.criticality?' · '+esc2(v.criticality):''}</div>
<div><b>Engagement</b>${esc2(eng.engagement_id)}</div>
<div><b>Owner</b>${esc2(eng.owner||'—')}</div>
<div><b>Latest status</b>${esc2(la?la.status:'—')}</div>
<div><b>Inherent → Residual</b>${esc2(la?(la.inherent_band||'—'):'—')} → ${esc2(la?(la.residual_band||'—'):'—')}</div>
<div><b>Outcome</b>${esc2(la?(la.outcome||'—'):'—')}</div>
<div><b>Assessor</b>${esc2(la?(la.assessor||'—'):'—')}</div>
<div><b>Signed off</b>${la&&la.signed_off?'Yes':'No'}</div>
<div><b>Service</b>${esc2(eng.service||'—')}</div>
</div>
<div class="pills" style="margin:10px 0">
<span style="color:#7A1F2B"><b>Critical:</b> ${fs.Critical||0}</span>
<span style="color:#C0392B"><b>High:</b> ${fs.High||0}</span>
<span style="color:#B8862B"><b>Medium:</b> ${fs.Medium||0}</span>
<span style="color:#3F5566"><b>Low:</b> ${fs.Low||0}</span>
</div>
<h2>Assessment history</h2>
<table><thead><tr><th>Assessment</th><th>Status</th><th>Inherent</th><th>Residual</th><th>Outcome</th><th>Date</th></tr></thead><tbody>${histRows}</tbody></table>
<h2>Findings (risk register)</h2>
<table><thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th>Domain</th><th>Status</th></tr></thead><tbody>${findRows}</tbody></table>
<h2>Documents &amp; evidence</h2>
<table><thead><tr><th>#</th><th>Document</th><th>Purpose</th><th>Size</th><th>Date</th></tr></thead><tbody>${docRows}</tbody></table>
<div class="foot">Brata (BRO Risk Oracle) · ${r.counts.assessments} assessment(s), ${r.counts.findings} finding(s), ${r.counts.documents} document(s). One version of the truth, reconciled with the consolidated risk profile.</div>
</body></html>`;
  const w=window.open("","_blank");
  if(!w){ flash("Allow pop-ups to view the report"); return; }
  w.document.write(html); w.document.close();
}


/* ---------- Vendor Performance Management (R4) ---------- */
let _pmVendor=null;
V.performance=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Vendor Performance</h1>
    <div class="sub">Scorecards · QBRs · closed-loop improvement · managed vendors</div></div>
    <button class="btn ghost" onclick="pmManage()">⊕ Manage list</button></div>
    <div id="pmBody" class="muted">Loading…</div>`;
  try{
    const enrolled = await api2("/performance/enrolment");
    if(!enrolled.length){
      view.querySelector("#pmBody").innerHTML=`<div class="card muted">No vendors under performance management yet. Use <b>Manage list</b> to add vendors. Critical vendors are added automatically.</div>`;
      return;
    }
    view.querySelector("#pmBody").innerHTML=`
      <div class="field" style="max-width:420px"><label>Search managed vendor</label>
        <input id="pm_search" list="pm_sl" placeholder="🔍 Type a vendor name…" oninput="pmSearchPick()"><datalist id="pm_sl">${enrolled.map(v=>`<option value="${esc(v.legal_name||v.vendor_id)}">`).join("")}</datalist></div>
      <div class="field" style="max-width:420px"><label>Managed vendor</label>
        <select id="pm_v" onchange="pmLoad()">${enrolled.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name||v.vendor_id)} (${v.vendor_id})${v.is_critical?' · CRITICAL':''}</option>`).join("")}</select></div>
      <div id="pmVendor"></div>`;
    _pmVendor = enrolled[0].vendor_id;
    pmLoad();
  }catch(e){ view.querySelector("#pmBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function pmManage(){
  const [enrolled, all] = await Promise.all([api2("/performance/enrolment"), api2("/vendors")]);
  const enrolledIds = new Set(enrolled.map(e=>e.vendor_id));
  const candidates = all.filter(v=>!enrolledIds.has(v.vendor_id));
  modal(`<h3>Manage performance list</h3>
    <p class="muted" style="margin-bottom:8px">Select vendors to add to performance management. Critical vendors are included automatically.</p>
    <div class="field"><label>Add vendors</label>
      <select id="pm_add" multiple size="8" style="min-height:160px">${candidates.map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})${v.is_critical?' · CRITICAL':''}</option>`).join("")||'<option disabled>All vendors already enrolled</option>'}</select></div>
    <div class="sec-h"><h2 style="font-size:13px">Currently managed (${enrolled.length})</h2><div class="rule"></div></div>
    <div style="max-height:140px;overflow:auto">${enrolled.map(e=>`<div class="dossier-row"><span class="dk">${esc(e.legal_name)} ${e.is_critical?'<span class="tag crit">CRITICAL</span>':''}<span class="muted" style="font-size:10px"> · ${esc(e.source)}</span></span>
      <span class="dv">${e.source==='auto-critical'?'<span class="muted" style="font-size:11px">auto</span>':`<button class="btn sm ghost" onclick="pmUnenrol('${e.vendor_id}')">remove</button>`}</span></div>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">Close</button>
      <button class="btn" onclick="pmAddSelected()">+ Add selected</button></div>`);
}
async function pmAddSelected(){
  const sel=document.getElementById("pm_add");
  const ids=Array.from(sel.selectedOptions).map(o=>o.value).filter(Boolean);
  if(!ids.length){ flash("Select at least one vendor"); return; }
  try{ await api2("/performance/enrolment",{method:"POST",body:JSON.stringify({vendor_ids:ids})});
    closeModal(); flash(`${ids.length} vendor(s) added`); V.performance();
  }catch(e){ flash(e.message); } }
async function pmUnenrol(vid){
  try{ await api2("/performance/enrolment/"+vid,{method:"DELETE"}); flash("Removed"); pmManage(); }catch(e){ flash(e.message); } }
function pmSearchPick(){
  const q=(val("pm_search")||"").toLowerCase().trim(); if(!q) return;
  const sel=document.getElementById("pm_v"); if(!sel) return;
  for(const o of sel.options){ if(o.textContent.toLowerCase().includes(q)){ sel.value=o.value; pmLoad(); break; } }
}
async function pmLoad(){
  const sel=document.getElementById("pm_v"); if(sel) _pmVendor=sel.value;
  const host=document.getElementById("pmVendor"); host.innerHTML=`<div class="muted">Loading scorecards…</div>`;
  try{
    const cards = await api2("/performance/vendor/"+_pmVendor);
    host.innerHTML=`<div class="sec-h" style="margin-top:16px"><h2 style="font-size:14px">Scorecards</h2><div class="rule"></div></div>
      <div class="row" style="margin-bottom:10px"><input id="pm_period" placeholder="Period e.g. 2026-Q3" style="max-width:200px">
        <button class="btn" onclick="pmCreate()">+ New scorecard</button></div>
      ${cards.length?`<table><tr><th>ID</th><th>Period</th><th>Status</th><th>Score</th><th>Band</th><th></th></tr>
        ${cards.map(s=>`<tr class="click" onclick="pmOpen('${s.scorecard_id}')"><td><b>${esc(s.scorecard_id)}</b></td>
          <td>${esc(s.period_label)}</td><td><span class="tag">${esc(s.status)}</span></td>
          <td>${s.composite_score!=null?s.composite_score+' / 5':'—'}</td>
          <td>${s.band?`<span class="posture-pill ${({Strong:'pp-0',Adequate:'pp-1',Watch:'pp-2',Underperforming:'pp-3'})[s.band]||'pp-1'}">${s.band}</span>`:'—'}</td>
          <td style="text-align:right">open →</td></tr>`).join("")}</table>`
        :'<div class="card muted">No scorecards yet for this vendor.</div>'}
      <div id="pmCard"></div>`;
  }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function pmCreate(){
  const period=val("pm_period")||("Period-"+new Date().toISOString().slice(0,10));
  try{ const r=await api2("/performance/scorecards",{method:"POST",body:JSON.stringify({vendor_id:_pmVendor,period_label:period})});
    flash("Scorecard created"); pmLoad(); setTimeout(()=>pmOpen(r.scorecard_id),300);
  }catch(e){ flash(e.message); } }
async function pmOpen(sid){
  const host=document.getElementById("pmCard"); host.innerHTML=`<div class="muted">Loading…</div>`;
  try{
    const sc=await api2("/performance/scorecards/"+sid);
    const dimBlocks={};
    sc.kpis.forEach(k=>{ (dimBlocks[k.dimension]=dimBlocks[k.dimension]||[]).push(k); });
    const dimMeta=Object.fromEntries(sc.dimensions.map(d=>[d.name,d]));
    host.innerHTML=`<div class="sec-h" style="margin-top:16px"><h2 style="font-size:14px">${esc(sc.scorecard_id)} · ${esc(sc.period_label)}</h2><div class="rule"></div></div>
      <div class="v360-hero" style="padding:18px 22px"><div class="v360-verdict" style="margin:0">
        <div class="v360-dot l${sc.band==='Strong'?0:sc.band==='Adequate'?1:sc.band==='Watch'?2:3}"></div>
        <div><div class="v360-vlabel">${sc.composite_score!=null?sc.composite_score+' / 5':'Not scored'} · ${esc(sc.band||'—')}</div>
        <div class="v360-vsub">Status: ${esc(sc.status)} · ${sc.agreed_with_vendor?'agreed with vendor':'not yet agreed'} · ${sc.published?'published':'unpublished'}</div></div></div></div>
      ${Object.keys(dimBlocks).map(dim=>`
        <div class="v360-panel" style="margin-bottom:12px"><h3>${esc(lbl(dim))} · weight ${dimMeta[dim]?dimMeta[dim].weight:'?'}% · score ${dimMeta[dim]&&dimMeta[dim].score!=null?dimMeta[dim].score:'—'}</h3>
          ${dimBlocks[dim].map(k=>`<div class="v360-metric"><span class="mk">${esc(k.metric)} ${k.data_source==='auto'?'<span class="tag" style="font-size:9px">auto</span>':''} ${k.auto_value?'<span class="muted">('+esc(k.auto_value)+')</span>':''}</span>
            <span class="mv"><select onchange="pmScore(${k.id},this.value,'${sid}')" style="padding:3px 6px">
              <option value="">—</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${k.score===n?'selected':''}>${n}</option>`).join("")}</select></span></div>`).join("")}
        </div>`).join("")}
      <div class="row" style="margin:14px 0;gap:8px;flex-wrap:wrap">
        <button class="btn ghost" onclick="pmAgree('${sid}')">Agree with vendor</button>
        <button class="btn" onclick="pmPublish('${sid}')">Publish (roll into risk profile)</button>
        <button class="btn ghost" onclick="pmReview()">+ Record QBR</button>
        <button class="btn ghost" onclick="pmCapa('${sid}')">+ Raise improvement action</button>
      </div>`;
  }catch(e){ host.innerHTML=`<div class="err">${esc(e.message)}</div>`; }
}
async function pmScore(kpiId,v,sid){ if(!v)return; try{ await api2("/performance/kpi/"+kpiId,{method:"PUT",body:JSON.stringify({score:parseInt(v)})}); pmOpen(sid); }catch(e){ flash(e.message); } }
async function pmAgree(sid){ try{ await api2("/performance/scorecards/"+sid+"/agree",{method:"POST",body:JSON.stringify({party:"Vendor representative"})}); flash("Agreed with vendor"); pmOpen(sid); }catch(e){ flash(e.message); } }
async function pmPublish(sid){ try{ const r=await api2("/performance/scorecards/"+sid+"/publish",{method:"POST",body:"{}"}); flash("Published · score "+(r.composite_score!=null?r.composite_score:'—')+" rolled into risk profile"); pmLoad(); }catch(e){ flash(e.message); } }
function pmReview(){ modal(`<h3>Record performance review (QBR)</h3>
  <div class="field"><label>Attendees</label><input id="qbr_att"></div>
  <div class="field"><label>Summary</label><textarea id="qbr_sum" rows="3"></textarea></div>
  <div class="field"><label>Outcomes</label><textarea id="qbr_out" rows="2"></textarea></div>
  <div class="field"><label>Next review date</label><input id="qbr_next" placeholder="YYYY-MM-DD"></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="pmReviewSave()">Save QBR</button></div>`); }
async function pmReviewSave(){ try{ await api2("/performance/vendor/"+_pmVendor+"/reviews",{method:"POST",body:JSON.stringify({data:{attendees:val("qbr_att"),summary:val("qbr_sum"),outcomes:val("qbr_out"),next_review_date:val("qbr_next")}})}); closeModal(); flash("QBR recorded"); }catch(e){ flash(e.message); } }
function pmCapa(sid){ modal(`<h3>Raise improvement action (closed-loop CAPA)</h3>
  <div class="field"><label>Performance gap</label><input id="capa_gap" placeholder="e.g. SLA attainment below target two periods"></div>
  <div class="field"><label>Accountable owner</label><input id="capa_owner"></div>
  <div class="field"><label>Due date</label><input id="capa_due" placeholder="YYYY-MM-DD"></div>
  <p class="muted" style="font-size:12px">This raises a tracked finding on the Findings register. It cannot be closed until verification of sustained effectiveness.</p>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="pmCapaSave('${sid}')">Raise action</button></div>`); }
async function pmCapaSave(sid){ try{ const r=await api2("/performance/capa",{method:"POST",body:JSON.stringify({scorecard_id:sid,gap:val("capa_gap"),owner:val("capa_owner"),due_date:val("capa_due")||null})}); closeModal(); flash("Improvement action raised: "+r.remediation_id); }catch(e){ flash(e.message); } }

/* ================= SLA Management (Performance) ================= */
let _slaEng=null, _slaTab="register", _slaRows=[];
function _slaPeriodLabel(p){ if(p.indexOf("-Q")>-1){ const x=p.split("-Q"); return "Q"+x[1]+" "+x[0]; } const m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; const x=p.split("-"); return m[(+x[1])-1]+" "+x[0]; }
function _slaFmt(n){ if(n===null||n===undefined||n==="")return "—"; const x=Number(n); return Number.isInteger(x)?String(x):String(parseFloat(x.toFixed(3))); }

V.slamgmt=async()=>{
  const view=document.getElementById("view");
  let engs=[]; try{ engs=await api2("/engagements"); }catch(e){}
  if(!engs.length){ view.innerHTML=`<div class="top"><div><h1>SLA Management</h1><div class="sub">Performance Management · service-level agreements</div></div></div><div class="card muted">No engagements available yet.</div>`; return; }
  if(!_slaEng || !engs.some(e=>e.engagement_id===_slaEng)) _slaEng=engs[0].engagement_id;
  view.innerHTML=`<div class="top"><div><h1>SLA Management</h1><div class="sub">Performance Management · service-level agreements</div></div></div>
    <div class="field" style="max-width:520px"><label>Engagement</label>
      <select id="sla_eng" onchange="_slaEng=this.value;V.slamgmt()">${engs.map(e=>`<option value="${e.engagement_id}" ${e.engagement_id===_slaEng?'selected':''}>${esc(e.title||e.engagement_id)} (${e.engagement_id})</option>`).join("")}</select></div>
    <div class="sla-tabs">
      <button class="sla-tab ${_slaTab==='register'?'active':''}" onclick="_slaTab='register';slaRender()">SLA register <span id="slaCount" class="tabnum">0</span></button>
      <button class="sla-tab ${_slaTab==='analysis'?'active':''}" onclick="_slaTab='analysis';slaRender()">SLA analysis summary <span id="slaDot" class="tabdot"></span></button>
    </div>
    <div id="slaPanel" class="muted">Loading…</div>`;
  await slaLoad();
};
async function slaLoad(){ try{ _slaRows=await api2("/slas?engagement_id="+encodeURIComponent(_slaEng)); }catch(e){ _slaRows=[]; } slaRender(); }

function slaRender(){
  const p=document.getElementById("slaPanel"); if(!p)return;
  const breaches=_slaRows.filter(r=>r.status==="breach").length;
  const cEl=document.getElementById("slaCount"); if(cEl)cEl.textContent=_slaRows.length;
  const dEl=document.getElementById("slaDot"); if(dEl)dEl.style.display=breaches?"inline-block":"none";
  document.querySelectorAll(".sla-tab").forEach(t=>t.classList.remove("active"));
  const tabs=document.querySelectorAll(".sla-tab"); if(tabs[_slaTab==='register'?0:1])tabs[_slaTab==='register'?0:1].classList.add("active");
  if(_slaTab==="register") slaRenderRegister(p); else slaRenderAnalysis(p);
}

function slaRenderRegister(p){
  let h=`<div class="sla-sources">
    <div class="card sla-src"><b>📄 Extract from contract</b><p class="muted">Read service levels from the contract linked to this engagement.</p><button class="btn" onclick="slaExtract('contract',this)">Extract SLAs from contract</button></div>
    <div class="card sla-src"><b>⬆️ Upload a document</b><p class="muted">Extract measurable terms from an SLA schedule or MSA.</p><button class="btn ghost" onclick="slaExtract('upload',this)">Extract from upload</button></div>
    <div class="card sla-src"><b>✏️ Add manually</b><p class="muted">Capture a service level by hand.</p><button class="btn ghost" onclick="slaAdd()">+ Add SLA manually</button></div>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="sla-panelh"><b>SLA register</b> <span class="tabnum">${_slaRows.length}</span><button class="btn ghost sm" style="margin-left:auto" onclick="slaAdd()">+ Add SLA</button></div>`;
  if(!_slaRows.length){ h+=`<div class="muted" style="padding:30px;text-align:center">No SLAs yet. Extract from the contract, upload a document, or add one manually.</div></div>`; p.innerHTML=h; return; }
  h+=`<table class="reg"><thead><tr><th>Status</th><th>SLA description</th><th>Threshold</th><th>Baseline</th><th>Window</th><th>Latest</th><th></th></tr></thead><tbody>`;
  _slaRows.forEach(r=>{
    const op=r.threshold_type==="min"?"≥":"≤";
    const dot=r.status==="met"?'<span class="sdot ok">✓</span> Meeting':r.status==="breach"?'<span class="sdot bad">!</span> Breached':'<span class="sdot none">–</span> No data';
    const sc=r.status==="met"?"s-ok":r.status==="breach"?"s-bad":"s-none";
    h+=`<tr class="reg-row"><td class="${sc}">${dot}</td>
      <td><b>${esc(r.description)}</b><div class="muted sm"><span class="srcb ${r.source}">${r.source}</span> ${r.latest_period?'latest: '+_slaPeriodLabel(r.latest_period):'awaiting first measurement'}</div></td>
      <td><b>${op} ${_slaFmt(r.threshold)}</b> <span class="muted">${esc(r.unit||'')}</span></td>
      <td>${_slaFmt(r.baseline)} <span class="muted">${esc(r.unit||'')}</span></td>
      <td><span class="winchip">${r.window==='monthly'?'Monthly':'Quarterly'}</span></td>
      <td>${r.latest_value!==null?'<b class="'+sc+'">'+_slaFmt(r.latest_value)+'</b>':'—'}</td>
      <td class="nowrap"><button class="iconb" title="Measurements" onclick="slaToggle('${r.sla_id}')">▤</button> <button class="iconb" title="Edit" onclick="slaEdit('${r.sla_id}')">✎</button> <button class="iconb" title="Remove" onclick="slaDel('${r.sla_id}')">🗑</button></td></tr>`;
    h+=`<tr class="sla-meas" id="meas_${r.sla_id}" style="display:none"><td colspan="7"><div class="meas-wrap"><div class="muted sm" style="margin-bottom:8px">Enter the observed value per ${r.window==='monthly'?'month':'quarter'}. Cells turn green when the value meets ${op} ${_slaFmt(r.threshold)}${esc(r.unit||'')} and red when it breaches.</div><div class="periods">`;
    r.periods.forEach(per=>{
      const v=(r.measurements&&r.measurements[per]!==undefined)?r.measurements[per]:"";
      let cls="",vd="";
      if(v!==""){ const ok=r.threshold_type==="min"?(Number(v)>=r.threshold):(Number(v)<=r.threshold); cls=ok?"met":"breach"; vd=ok?'<div class="vd">✓ Met</div>':'<div class="vd">! Breach</div>'; }
      h+=`<div class="per ${cls}" id="per_${r.sla_id}_${per}"><div class="pk">${_slaPeriodLabel(per)}</div><div class="pi"><input type="number" step="any" value="${v}" onchange="slaMeasure('${r.sla_id}','${per}',this.value)"><span class="muted">${esc(r.unit||'')}</span></div>${vd}</div>`;
    });
    h+=`</div></div></td></tr>`;
  });
  h+=`</tbody></table></div>`;
  p.innerHTML=h;
}

function slaToggle(id){ const el=document.getElementById("meas_"+id); if(el)el.style.display=el.style.display==="none"?"table-row":"none"; }
async function slaExtract(mode,btn){ const o=btn.textContent; btn.textContent="Extracting…"; btn.disabled=true; try{ const r=await api2("/slas/extract",{method:"POST",body:JSON.stringify({engagement_id:_slaEng,mode:mode})}); flash(r.extracted?("Extracted "+r.extracted+" SLA(s) — review & edit"):"No new SLAs found"); await slaLoad(); }catch(e){ flash(e.message); } btn.textContent=o; btn.disabled=false; }
async function slaMeasure(id,per,v){ try{ await api2("/slas/"+id+"/measurements",{method:"POST",body:JSON.stringify({period:per,value:v===""?null:Number(v)})}); const idx=_slaRows.findIndex(r=>r.sla_id===id); const fresh=await api2("/slas?engagement_id="+encodeURIComponent(_slaEng)); _slaRows=fresh; // recolor just this cell + status without full redraw
  const r=_slaRows.find(x=>x.sla_id===id); const cell=document.getElementById("per_"+id+"_"+per); if(cell&&r){ const ok=v===""?null:(r.threshold_type==="min"?(Number(v)>=r.threshold):(Number(v)<=r.threshold)); cell.className="per "+(v===""?"":(ok?"met":"breach")); const old=cell.querySelector(".vd"); if(old)old.remove(); if(v!==""){ const d=document.createElement("div"); d.className="vd"; d.innerHTML=ok?"✓ Met":"! Breach"; cell.appendChild(d);} }
  const br=_slaRows.filter(x=>x.status==="breach").length; const dEl=document.getElementById("slaDot"); if(dEl)dEl.style.display=br?"inline-block":"none";
  }catch(e){ flash(e.message); } }
function slaAdd(){ _slaModal(null); }
function slaEdit(id){ _slaModal(_slaRows.find(r=>r.sla_id===id)); }
function _slaModal(r){ modal(`<h3>${r?'Edit SLA':'Add SLA'}</h3>
  <div class="field"><label>SLA description</label><input id="sla_desc" value="${r?esc(r.description):''}" placeholder="e.g. System availability (uptime)"></div>
  <div class="row"><div class="field"><label>Threshold type</label><select id="sla_tt"><option value="min" ${r&&r.threshold_type==='min'?'selected':''}>Minimum (≥)</option><option value="max" ${r&&r.threshold_type==='max'?'selected':''}>Maximum (≤)</option></select></div>
  <div class="field"><label>Threshold</label><input id="sla_th" type="number" step="any" value="${r?r.threshold:''}"></div></div>
  <div class="row"><div class="field"><label>Unit</label><input id="sla_unit" value="${r?esc(r.unit||''):''}" placeholder="% / min / hrs"></div>
  <div class="field"><label>Baseline</label><input id="sla_base" type="number" step="any" value="${r&&r.baseline!=null?r.baseline:''}"></div></div>
  <div class="field"><label>Measurement window</label><select id="sla_win"><option value="monthly" ${!r||r.window==='monthly'?'selected':''}>Monthly</option><option value="quarterly" ${r&&r.window==='quarterly'?'selected':''}>Quarterly</option></select></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="slaSave('${r?r.sla_id:''}')">Save SLA</button></div>`); }
async function slaSave(id){ const body={engagement_id:_slaEng,description:val("sla_desc"),threshold_type:val("sla_tt"),threshold:Number(val("sla_th")||0),unit:val("sla_unit"),baseline:val("sla_base")===""?null:Number(val("sla_base")),window:val("sla_win")}; if(!body.description){ flash("Add a description"); return; }
  try{ if(id) await api2("/slas/"+id,{method:"PUT",body:JSON.stringify(body)}); else await api2("/slas",{method:"POST",body:JSON.stringify(body)}); closeModal(); flash(id?"SLA updated":"SLA added"); await slaLoad(); }catch(e){ flash(e.message); } }
async function slaDel(id){ if(!confirm("Remove this SLA?"))return; try{ await api2("/slas/"+id,{method:"DELETE"}); flash("SLA removed"); await slaLoad(); }catch(e){ flash(e.message); } }

async function slaRenderAnalysis(p){
  p.innerHTML=`<div class="card muted">Analysing…</div>`;
  let a; try{ a=await api2("/slas/summary?engagement_id="+encodeURIComponent(_slaEng)); }catch(e){ p.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  let h=`<div class="card ai-card"><div class="ai-h">✦ AI analysis summary <span class="ai-badge">AI · ${esc(a.ai_mode)}</span></div>
    <div class="ai-stats"><div class="ai-s"><div class="v">${a.compliance_rate}%</div><div class="l">SLAs met</div></div><div class="ai-s ok"><div class="v">${a.met}</div><div class="l">Meeting</div></div><div class="ai-s bad"><div class="v">${a.breached}</div><div class="l">In breach</div></div><div class="ai-s"><div class="v">${a.declining}</div><div class="l">Declining</div></div></div>
    <p>${esc(a.summary)}</p></div>
    <div class="card"><div class="ai-h" style="border:0">✦ AI enquiry — ask about these SLAs</div>
    <div class="chips">${["Which SLAs are breached?","What's the worst performer?","Any worsening trends?","Board-ready summary"].map(q=>`<button class="chip" onclick="slaAsk(this.textContent)">${q}</button>`).join("")}</div>
    <div class="row"><input id="sla_q" placeholder="e.g. which is the worst performer?" style="flex:1" onkeydown="if(event.key==='Enter')slaAsk(this.value)"><button class="btn" onclick="slaAsk(document.getElementById('sla_q').value)">Ask</button></div>
    <div id="sla_qa"></div></div>`;
  p.innerHTML=h;
}
async function slaAsk(q){ if(!q||!q.trim())return; try{ const r=await api2("/slas/enquiry",{method:"POST",body:JSON.stringify({engagement_id:_slaEng,question:q})}); const qa=document.getElementById("sla_qa"); const d=document.createElement("div"); d.className="qa"; d.innerHTML=`<div class="qa-q"><b>You:</b> ${esc(q)}</div><div class="qa-a">${esc(r.answer)}</div>`; qa.prepend(d); const qi=document.getElementById("sla_q"); if(qi)qi.value=""; }catch(e){ flash(e.message); } }

/* ================= Performance Issues (mirrors risk register) ================= */
let _piEng=null, _piFilters={status:"",severity:"",source:"",category:""};
const _PI_CATS=["Availability","Latency / performance","Service quality","Support responsiveness","Delivery / milestones","Capacity","Data integrity"];
const _PI_SEVCLS={Critical:"sev-crit",High:"sev-high",Medium:"sev-med",Low:"sev-low"};
const _PI_STCLS={"Open":"st-open","In Progress":"st-prog","In Review":"st-rev","Risk Accepted":"st-acc","Closed":"st-closed"};

V.perfissues=async()=>{
  const view=document.getElementById("view");
  let engs=[]; try{ engs=await api2("/engagements"); }catch(e){}
  if(!engs.length){ view.innerHTML=`<div class="top"><div><h1>Performance Issues</h1><div class="sub">Performance Management · issues register</div></div></div><div class="card muted">No engagements available yet.</div>`; return; }
  if(!_piEng || !engs.some(e=>e.engagement_id===_piEng)) _piEng=engs[0].engagement_id;
  view.innerHTML=`<div class="top"><div><h1>Performance Issues</h1><div class="sub">Performance Management · issues register (mirrors the risk register)</div></div></div>
    <div class="field" style="max-width:520px"><label>Engagement</label>
      <select id="pi_eng" onchange="_piEng=this.value;V.perfissues()">${engs.map(e=>`<option value="${e.engagement_id}" ${e.engagement_id===_piEng?'selected':''}>${esc(e.title||e.engagement_id)} (${e.engagement_id})</option>`).join("")}</select></div>
    <div id="piSev" class="sevstrip"></div>
    <div class="pi-toolbar">
      <select id="pi_fstatus" onchange="_piFilters.status=this.value;piRender()"><option value="">All statuses</option>${["Open","In Progress","In Review","Risk Accepted","Closed"].map(x=>`<option>${x}</option>`).join("")}</select>
      <select id="pi_fsource" onchange="_piFilters.source=this.value;piRender()"><option value="">All sources</option>${["SLA breach","Manual","AI","Incident"].map(x=>`<option>${x}</option>`).join("")}</select>
      <select id="pi_fcat" onchange="_piFilters.category=this.value;piRender()"><option value="">All categories</option>${_PI_CATS.map(x=>`<option>${x}</option>`).join("")}</select>
      <span style="flex:1"></span>
      <button class="btn gold sm" onclick="piRaiseFromSla()">⚡ Raise from SLA breach</button>
      <button class="btn sm" onclick="piAdd()">+ Add performance issue</button>
    </div>
    <div id="piPanel" class="muted">Loading…</div>`;
  await piLoad();
};
let _piRows=[];
async function piLoad(){
  let q="/performance-issues?engagement_id="+encodeURIComponent(_piEng);
  if(_piFilters.status)q+="&status="+encodeURIComponent(_piFilters.status);
  if(_piFilters.source)q+="&source="+encodeURIComponent(_piFilters.source);
  if(_piFilters.severity)q+="&severity="+encodeURIComponent(_piFilters.severity);
  if(_piFilters.category)q+="&category="+encodeURIComponent(_piFilters.category);
  try{ _piRows=await api2(q); }catch(e){ _piRows=[]; }
  try{ window._piSev=await api2("/performance-issues/summary?engagement_id="+encodeURIComponent(_piEng)); }catch(e){ window._piSev={}; }
  piRender();
}
function piRender(){
  const sev=window._piSev||{};
  const strip=document.getElementById("piSev");
  if(strip){ const cards=[["",'All open',sev.open_total||0,'all'],["Critical",'Critical',sev.Critical||0,'crit'],["High",'High',sev.High||0,'high'],["Medium",'Medium',sev.Medium||0,'med'],["Low",'Low',sev.Low||0,'low']];
    strip.innerHTML=cards.map(c=>`<div class="sevcard ${c[3]} ${_piFilters.severity===c[0]?'active':''}" onclick="_piFilters.severity=(_piFilters.severity==='${c[0]}'?'':'${c[0]}');piLoad()"><div class="n">${c[2]}</div><div class="l">${c[1]}</div></div>`).join(""); }
  const p=document.getElementById("piPanel"); if(!p)return;
  if(!_piRows.length){ p.innerHTML=`<div class="card muted" style="text-align:center;padding:30px">No performance issues match these filters.</div>`; return; }
  let h=`<div class="card" style="padding:0;overflow:hidden"><table class="reg"><thead><tr><th>Issue ID</th><th>Issue</th><th>Category</th><th>Severity</th><th>Source</th><th>Status</th><th>Owner</th><th>Due</th><th></th></tr></thead><tbody>`;
  _piRows.forEach(i=>{
    const due=i.status==="Closed"?"—":(i.due_date?(i.overdue?'<span class="s-bad">'+esc(i.due_date)+' (overdue)</span>':esc(i.due_date)):"—");
    const srcCls=({"SLA breach":"src-sla","Manual":"src-manual","AI":"src-ai","Incident":"src-incident"})[i.source]||"src-manual";
    h+=`<tr class="reg-row" onclick="piToggle('${i.pis_id}',event)"><td class="mono">${i.pis_id}</td>
      <td><b>${esc(i.title)}</b><div class="muted sm">${esc((i.description||'').slice(0,80))}${(i.description||'').length>80?'…':''}</div></td>
      <td>${esc(i.category||'—')}</td>
      <td><span class="tagp ${_PI_SEVCLS[i.severity]}">${i.severity}</span></td>
      <td><span class="srcb2 ${srcCls}">${esc(i.source)}</span></td>
      <td><span class="tagp ${_PI_STCLS[i.status]}">${esc(i.status)}</span></td>
      <td>${esc(i.owner||'—')}</td>
      <td>${due}</td><td>▶</td></tr>`;
    h+=`<tr class="pi-detail" id="pid_${i.pis_id}" style="display:none"><td colspan="9"><div class="pi-det">
      <div><div class="det-b"><h5>Description</h5><div>${esc(i.description||'—')}</div></div>
      <div class="det-b"><h5>Suggested remediation</h5><div class="rem-b">${esc(i.suggested_remediation||'—')}</div></div>
      <div class="det-acts">${i.status!=='Closed'&&i.status!=='Risk Accepted'?'<button class="btn ghost sm" onclick="piAdvance(\''+i.pis_id+'\')">→ Advance</button> <button class="btn ghost sm" onclick="piNote(\''+i.pis_id+'\')">+ Note</button> ':''}<button class="btn ghost sm" onclick="piEdit('${i.pis_id}')">✎ Edit</button> <button class="btn ghost sm" onclick="piDel('${i.pis_id}')">🗑 Remove</button></div></div>
      <div><div class="det-b"><h5>Details</h5>${_piKV('Linked ref',i.linked_ref||'—')}${_piKV('Source',i.source)}${_piKV('Raised by',i.raised_by||'—')}${_piKV('Raised',i.raised_date||'—')}${_piKV('Target date',i.due_date||'—')}${_piKV('Owner',i.owner||'—')}</div>
      <div class="det-b"><h5>Progress notes</h5><ul class="tl">${(i.progress_notes||[]).length?i.progress_notes.map(n=>`<li>${esc(n.note)}<div class="muted sm">${esc(n.user)} · ${esc(n.ts)}</div></li>`).join(""):'<li class="muted">No notes yet.</li>'}</ul></div></div>
    </div></td></tr>`;
  });
  h+=`</tbody></table></div>`;
  p.innerHTML=h;
}
function _piKV(k,v){ return `<div class="kv"><span class="muted">${k}</span><b>${esc(v)}</b></div>`; }
function piToggle(id,e){ if(e&&e.target.closest("button"))return; const el=document.getElementById("pid_"+id); if(el)el.style.display=el.style.display==="none"?"table-row":"none"; }
async function piAdvance(id){ try{ const r=await api2("/performance-issues/"+id+"/advance",{method:"POST"}); flash("Status → "+r.status); await piLoad(); }catch(e){ flash(e.message); } }
async function piDel(id){ if(!confirm("Remove this issue?"))return; try{ await api2("/performance-issues/"+id,{method:"DELETE"}); flash("Issue removed"); await piLoad(); }catch(e){ flash(e.message); } }
function piNote(id){ modal(`<h3>Add progress note</h3><div class="field"><label>Note</label><textarea id="pi_note"></textarea></div><div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="piNoteSave('${id}')">Add note</button></div>`); }
async function piNoteSave(id){ try{ await api2("/performance-issues/"+id+"/note",{method:"POST",body:JSON.stringify({note:val("pi_note")})}); closeModal(); flash("Note added"); await piLoad(); }catch(e){ flash(e.message); } }
function piAdd(){ _piModal(null); }
function piEdit(id){ _piModal(_piRows.find(i=>i.pis_id===id)); }
function _piModal(i){ modal(`<h3>${i?'Edit performance issue':'Add performance issue'}</h3>
  <div class="field"><label>Title</label><input id="pi_title" value="${i?esc(i.title):''}"></div>
  <div class="field"><label>Description</label><textarea id="pi_desc">${i?esc(i.description||''):''}</textarea></div>
  <div class="row"><div class="field"><label>Category</label><select id="pi_cat">${_PI_CATS.map(c=>`<option ${i&&i.category===c?'selected':''}>${c}</option>`).join("")}</select></div>
  <div class="field"><label>Severity</label><select id="pi_sev">${["Critical","High","Medium","Low"].map(s=>`<option ${i?(i.severity===s?'selected':''):(s==='Medium'?'selected':'')}>${s}</option>`).join("")}</select></div></div>
  <div class="row"><div class="field"><label>Source</label><select id="pi_src">${["Manual","SLA breach","AI","Incident"].map(s=>`<option ${i&&i.source===s?'selected':''}>${s}</option>`).join("")}</select></div>
  <div class="field"><label>Status</label><select id="pi_status">${["Open","In Progress","In Review","Risk Accepted","Closed"].map(s=>`<option ${i?(i.status===s?'selected':''):(s==='Open'?'selected':'')}>${s}</option>`).join("")}</select></div></div>
  <div class="row"><div class="field"><label>Owner</label><input id="pi_owner" value="${i?esc(i.owner||''):''}"></div>
  <div class="field"><label>Due date</label><input id="pi_due" type="date" value="${i?esc(i.due_date||''):''}"></div></div>
  <div class="field"><label>Linked SLA / reference</label><input id="pi_link" value="${i?esc(i.linked_ref||''):''}"></div>
  <div class="field"><label>Suggested remediation</label><textarea id="pi_rem">${i?esc(i.suggested_remediation||''):''}</textarea></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="piSave('${i?i.pis_id:''}')">Save issue</button></div>`); }
async function piSave(id){ const body={engagement_id:_piEng,title:val("pi_title"),description:val("pi_desc"),category:val("pi_cat"),severity:val("pi_sev"),source:val("pi_src"),status:val("pi_status"),owner:val("pi_owner"),due_date:val("pi_due")||null,linked_ref:val("pi_link"),suggested_remediation:val("pi_rem")}; if(!body.title){ flash("Add a title"); return; }
  try{ if(id) await api2("/performance-issues/"+id,{method:"PUT",body:JSON.stringify(body)}); else await api2("/performance-issues",{method:"POST",body:JSON.stringify(body)}); closeModal(); flash(id?"Issue updated":"Issue added"); await piLoad(); }catch(e){ flash(e.message); } }
async function piRaiseFromSla(){
  let slas=[]; try{ slas=await api2("/slas?engagement_id="+encodeURIComponent(_piEng)); }catch(e){}
  const breached=slas.filter(s=>s.status==="breach");
  if(!breached.length){ flash("No SLAs are currently in breach on this engagement"); return; }
  modal(`<h3>Raise issue from SLA breach</h3><div class="field"><label>Breached SLA</label><select id="pi_sla">${breached.map(s=>`<option value="${s.sla_id}">${esc(s.description)} (${_slaFmt(s.latest_value)}${esc(s.unit||'')})</option>`).join("")}</select></div><p class="muted sm">A linked performance issue will be opened with severity derived from the SLA.</p><div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="piRaiseSave()">Raise issue</button></div>`);
}
async function piRaiseSave(){ try{ const r=await api2("/performance-issues/raise-from-sla",{method:"POST",body:JSON.stringify({sla_id:val("pi_sla")})}); closeModal(); flash(r.raised?("Issue raised: "+r.issue.pis_id):"Not raised: "+(r.reason||"already open")); await piLoad(); }catch(e){ flash(e.message); } }

/* ================= Platform Documentation: SOP / Technical Details ================= */
V.sop=async()=>{ _docView("sop","SOP — Standard Operating Procedure"); };
V.techdetails=async()=>{ _docView("tda","Technical Design & Architecture"); };
function _docView(kind,label){
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>${label}</h1><div class="sub" id="docMeta">Loading…</div></div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button class="btn ghost" id="docAiBtn" onclick="docAiUpdate('${kind}')" title="Sync the document to the current build">✦ AI update</button>
      <button class="btn" onclick="docPrint()">🖨 Print / Save PDF</button>
    </div></div>
    <div class="doc-frame-wrap"><iframe id="docFrame" class="doc-frame" title="${label}"></iframe></div>`;
  docLoad(kind);
}
async function docLoad(kind){
  window._docKind=kind;
  try{
    const d=await api2("/platform-docs/"+kind);
    const blob=new Blob([d.html],{type:"text/html"}); const url=URL.createObjectURL(blob);
    const f=document.getElementById("docFrame"); if(f)f.src=url;
    const m=document.getElementById("docMeta");
    if(m)m.innerHTML=`Version <b>v${esc(d.doc_version||'')}</b> · last updated ${d.updated_at?esc(d.updated_at.slice(0,10)):'—'}${d.updated_by?' by '+esc(d.updated_by):''}`;
  }catch(e){ const m=document.getElementById("docMeta"); if(m)m.innerHTML=`<span class="s-bad">${esc(e.message)}</span>`; }
}
function docPrint(){ const f=document.getElementById("docFrame"); if(f&&f.contentWindow){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ flash("Use your browser's Print (Ctrl/Cmd+P) to save as PDF"); } } }
async function docAiUpdate(kind){ const btn=document.getElementById("docAiBtn"); if(!btn)return; const o=btn.innerHTML; btn.innerHTML="Updating…"; btn.disabled=true;
  try{ const r=await api2("/platform-docs/"+kind+"/ai-update",{method:"POST"}); flash("Document synced to v"+r.doc_version+" · "+r.ai_mode); await docLoad(kind); }
  catch(e){ flash(e.message.indexOf("permission")>-1?"AI update requires admin rights":e.message); }
  btn.innerHTML=o; btn.disabled=false; }

/* ================= Version Control ================= */
V.versions=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Version Control</h1><div class="sub">Release history &amp; update notes — every version, newest first</div></div></div><div id="verBody" class="muted">Loading…</div>`;
  try{
    const vh=await api2("/platform-docs/versions");
    if(!vh.length){ document.getElementById("verBody").innerHTML=`<div class="card muted">No version history available.</div>`; return; }
    let h=`<div class="ver-rail">`;
    vh.forEach((e,i)=>{
      const secs=Object.keys(e.sections||{}).map(sec=>`<div class="ver-sec"><div class="ver-sec-h">${esc(sec)}</div><ul>${(e.sections[sec]||[]).map(it=>`<li>${esc(it)}</li>`).join("")}</ul></div>`).join("");
      h+=`<div class="ver-card ${i===0?'latest':''}">
        <div class="ver-head"><span class="ver-tag">v${esc(e.version)}</span>${i===0?'<span class="ver-cur">CURRENT</span>':''}<span class="ver-date">${esc(e.date||'')}</span></div>
        ${e.title?`<div class="ver-title">${esc(e.title)}</div>`:''}
        ${secs||'<div class="muted sm">No itemised notes.</div>'}
      </div>`;
    });
    h+=`</div>`;
    document.getElementById("verBody").innerHTML=h;
  }catch(e){ document.getElementById("verBody").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};


/* ================= DASHBOARDS (multi-subtab management views) ================= */
let _dashTab="executive";
function _bar(label,val,max,color){ const pct=max>0?Math.round(val/max*100):0; return `<div class="dbar"><div class="dbar-l">${esc(label)}</div><div class="dbar-track"><div class="dbar-fill" style="width:${pct}%;background:${color||'#1A4D3C'}"></div></div><div class="dbar-v">${val}</div></div>`; }
function _distBars(obj,colors){ const ks=Object.keys(obj||{}); const max=Math.max(1,...ks.map(k=>obj[k]||0)); const cmap=colors||{Critical:'#7A1F2B',High:'#C0392B',Medium:'#B8862B',Low:'#3F5566'}; return ks.map(k=>_bar(k,obj[k]||0,max,cmap[k]||'#2C6E5A')).join(''); }
function _kpi(v,l,accent){ return `<div class="dkpi"><div class="dkpi-v" ${accent?`style="color:${accent}"`:''}>${v}</div><div class="dkpi-l">${esc(l)}</div></div>`; }

V.dashboards=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Management Dashboards</h1><div class="sub">Live portfolio intelligence — executive, risk, operations &amp; learning</div></div></div>
    <div class="dash-tabs">
      ${[["executive","◆ Executive"],["risk","⚠ Risk"],["operations","⚙ Operations"],["performance","📈 Performance"],["learning","🧠 Learning &amp; AI"]].map(t=>`<button class="dash-tab ${_dashTab===t[0]?'active':''}" onclick="_dashTab='${t[0]}';V.dashboards()">${t[1]}</button>`).join("")}
    </div>
    <div id="dashPanel" class="muted">Loading…</div>`;
  const fn={executive:dashExec,risk:dashRisk,operations:dashOps,performance:dashPerf,learning:dashLearn}[_dashTab];
  try{ await fn(); }catch(e){ document.getElementById("dashPanel").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};

async function dashExec(){
  const d=await api("/dashboard/executive");
  const p=document.getElementById("dashPanel");
  const dec=d.by_decision||{}; const res=d.by_residual||{};
  p.innerHTML=`
    <div class="dkpis">
      ${_kpi(d.vendors||0,"Vendors","#14302A")}
      ${_kpi(d.critical_vendors||0,"Critical vendors","#7A1F2B")}
      ${_kpi(d.engagements||0,"Engagements","#1A4D3C")}
      ${_kpi(d.open_findings||0,"Open findings","#C0392B")}
    </div>
    <div class="dgrid">
      <div class="dcard"><h4>Residual risk distribution</h4>${_distBars(res)||'<div class="muted">No data</div>'}</div>
      <div class="dcard"><h4>Decisions to date</h4>${_distBars(dec,{Approved:'#1A7F4B','Approved with findings':'#B8862B',Rejected:'#7A1F2B',Pending:'#3F5566'})||'<div class="muted">No data</div>'}</div>
    </div>`;
}

async function dashRisk(){
  const d=await api2("/management/risk-view");
  const p=document.getElementById("dashPanel");
  const t=d.totals||{};
  p.innerHTML=`
    <div class="dkpis">
      ${_kpi(t.vendors??'—',"Vendors")}
      ${_kpi(t.engagements??'—',"Engagements")}
      ${_kpi((d.critical_vendors||[]).length,"Critical vendors","#7A1F2B")}
      ${_kpi((d.high_residual_engagements||[]).length,"High residual","#C0392B")}
    </div>
    <div class="dgrid">
      <div class="dcard"><h4>Inherent risk</h4>${_distBars(d.inherent_distribution)}</div>
      <div class="dcard"><h4>Residual risk</h4>${_distBars(d.residual_distribution)}</div>
      <div class="dcard"><h4>Findings by severity</h4>${_distBars(d.findings_by_severity)}</div>
      <div class="dcard"><h4>Certificate status</h4>${_distBars(d.certificate_status,{Valid:'#1A7F4B','Expiring':'#B8862B',Expired:'#7A1F2B',Missing:'#3F5566'})}</div>
    </div>
    ${(d.high_residual_engagements||[]).length?`<div class="dcard" style="margin-top:13px"><h4>Top high-residual engagements</h4><table class="reg"><thead><tr><th>Engagement</th><th>Vendor</th><th>Residual</th></tr></thead><tbody>${d.high_residual_engagements.slice(0,8).map(e=>`<tr><td class="mono">${esc(e.engagement_id||e.id||'—')}</td><td>${esc(e.vendor||e.vendor_name||'—')}</td><td><span class="tagp sev-high">${esc(e.residual_band||e.residual||'—')}</span></td></tr>`).join("")}</tbody></table></div>`:''}`;
}

async function dashOps(){
  const d=await api2("/management/ops-view");
  const p=document.getElementById("dashPanel");
  const wl=d.assessor_workload||{};
  p.innerHTML=`
    <div class="dkpis">
      ${_kpi((d.awaiting_signoff||[]).length??'—',"Awaiting sign-off","#B8862B")}
      ${_kpi(d.locked_assessments??(d.locked||'—'),"Locked")}
      ${_kpi(Object.keys(wl).length,"Assessors active")}
      ${_kpi((d.actions||[]).length,"Open actions","#C0392B")}
    </div>
    <div class="dgrid">
      <div class="dcard"><h4>Assessment pipeline</h4>${_distBars(d.assessment_pipeline,{Drafted:'#3F5566','In-Progress':'#2d6ea3',Completed:'#B8862B',Approved:'#1A7F4B'})}</div>
      <div class="dcard"><h4>Engagement status</h4>${_distBars(d.engagement_status)}</div>
      <div class="dcard"><h4>Assessor workload</h4>${_distBars(wl,{})||'<div class="muted">No active assessors</div>'}</div>
    </div>
    ${(d.awaiting_signoff||[]).length?`<div class="dcard" style="margin-top:13px"><h4>Awaiting sign-off</h4><table class="reg"><thead><tr><th>Assessment</th><th>Engagement</th><th>Assessor</th></tr></thead><tbody>${d.awaiting_signoff.slice(0,8).map(a=>`<tr><td class="mono">${esc(a.assessment_id||'—')}</td><td class="mono">${esc(a.engagement_id||'—')}</td><td>${esc(a.assessor||a.assessor_user||'—')}</td></tr>`).join("")}</tbody></table></div>`:''}`;
}

async function dashPerf(){
  const p=document.getElementById("dashPanel");
  p.innerHTML=`<div class="muted">Aggregating SLA &amp; performance signals…</div>`;
  const engs=await api2("/engagements").catch(()=>[]);
  let totalSla=0,breached=0,issues={Critical:0,High:0,Medium:0,Low:0},openIssues=0,withData=0;
  // sample up to 25 engagements to keep it responsive
  for(const e of engs.slice(0,25)){
    try{ const slas=await api2("/slas?engagement_id="+encodeURIComponent(e.engagement_id));
      totalSla+=slas.length; breached+=slas.filter(x=>x.status==='breach').length; withData+=slas.filter(x=>x.status!=='none').length;
    }catch(_){}
    try{ const sev=await api2("/performance-issues/summary?engagement_id="+encodeURIComponent(e.engagement_id));
      ['Critical','High','Medium','Low'].forEach(k=>issues[k]+=(sev[k]||0)); openIssues+=(sev.open_total||0);
    }catch(_){}
  }
  const rate=withData>0?Math.round((withData-breached)/withData*100):0;
  p.innerHTML=`
    <div class="muted sm" style="margin-bottom:10px">Across the first ${Math.min(25,engs.length)} engagements.</div>
    <div class="dkpis">
      ${_kpi(totalSla,"SLAs tracked")}
      ${_kpi(rate+"%","SLA compliance",rate>=90?'#1A7F4B':'#C0392B')}
      ${_kpi(breached,"SLAs in breach","#C0392B")}
      ${_kpi(openIssues,"Open perf. issues","#B8862B")}
    </div>
    <div class="dgrid"><div class="dcard"><h4>Performance issues by severity</h4>${_distBars(issues)}</div>
    <div class="dcard"><h4>SLA health</h4>${_bar("Meeting",withData-breached,Math.max(1,withData),'#1A7F4B')}${_bar("In breach",breached,Math.max(1,withData),'#C0392B')}</div></div>`;
}

async function dashLearn(){
  const d=await api2("/learnings/summary");
  const p=document.getElementById("dashPanel");
  p.innerHTML=`
    <div class="dkpis">
      ${_kpi(d.total||0,"Total learnings","#14302A")}
      ${_kpi(d.auto||0,"Auto-captured","#2C6E5A")}
      ${_kpi(d.human||0,"Human-added","#B8862B")}
      ${_kpi(d.total_reuse||0,"Times reused","#1A7F4B")}
    </div>
    <div class="dgrid">
      <div class="dcard"><h4>Learnings by category</h4>${_distBars(d.by_category,{})||'<div class="muted">No learnings captured yet</div>'}</div>
      <div class="dcard"><h4>Reuse</h4>${_bar("Applied at least once",d.applied_unique||0,Math.max(1,d.total||1),'#1A7F4B')}${_bar("Not yet applied",(d.total||0)-(d.applied_unique||0),Math.max(1,d.total||1),'#3F5566')}<div class="muted sm" style="margin-top:8px">Open the <a href="#" onclick="go('learnings');return false;">Learnings</a> tab for the full log.</div></div>
    </div>`;
}

/* ================= LEARNINGS ================= */
let _learnCat="";
V.learnings=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Learnings</h1><div class="sub">What the system has learned from previous assessments — to guide future actions</div></div>
    <button class="btn" onclick="learnAdd()">+ Add learning</button></div>
    <div id="learnSummary"></div>
    <div class="learn-filters" id="learnFilters"></div>
    <div id="learnList" class="muted">Loading…</div>`;
  await learnLoad();
};
async function learnLoad(){
  let summ={},rows=[];
  try{ summ=await api2("/learnings/summary"); }catch(e){}
  try{ rows=await api2("/learnings"+(_learnCat?("?category="+encodeURIComponent(_learnCat)):"")); }catch(e){}
  const s=document.getElementById("learnSummary");
  if(s)s.innerHTML=`<div class="dkpis">
    ${_kpi(summ.total||0,"Total learnings","#14302A")}
    ${_kpi(summ.auto||0,"Auto-captured","#2C6E5A")}
    ${_kpi(summ.human||0,"Human-added","#B8862B")}
    ${_kpi(summ.total_reuse||0,"Times reused","#1A7F4B")}</div>`;
  const cats=Object.keys(summ.by_category||{});
  const f=document.getElementById("learnFilters");
  if(f)f.innerHTML=`<button class="lchip ${_learnCat===''?'active':''}" onclick="_learnCat='';learnLoad()">All (${summ.total||0})</button>`+
    cats.map(c=>`<button class="lchip ${_learnCat===c?'active':''}" onclick="_learnCat='${c}';learnLoad()">${esc(c)} (${summ.by_category[c]})</button>`).join("");
  const list=document.getElementById("learnList");
  if(!rows.length){ list.innerHTML=`<div class="card muted" style="text-align:center;padding:30px">No learnings yet. They are captured automatically when assessments complete, or add one manually.</div>`; return; }
  list.innerHTML=rows.map(l=>`<div class="learn-card">
    <div class="learn-head"><span class="lcat lcat-${(l.category||'').replace(/[^a-z]/gi,'').toLowerCase()}">${esc(l.category)}</span>
      <span class="lorigin ${l.origin}">${l.origin==='auto'?'⚙ auto':'✋ human'}</span>
      <span class="lconf c-${(l.confidence||'').toLowerCase()}">${esc(l.confidence)}</span>
      <span class="lreuse" title="Times reused">↻ ${l.applied_count||0}</span>
      <span style="flex:1"></span>
      <button class="iconb" title="Mark applied" onclick="learnApplied(${l.id})">✓</button>
      <button class="iconb" title="Delete" onclick="learnDel(${l.id})">🗑</button></div>
    <div class="learn-insight">${esc(l.insight)}</div>
    <div class="learn-src muted sm">${l.source_vendor?'Vendor '+esc(l.source_vendor):''}${l.source_assessment?' · '+esc(l.source_assessment):''}${l.created_at?' · '+esc(l.created_at.slice(0,10)):''}</div>
  </div>`).join("");
}
async function learnApplied(id){ try{ await api2("/learnings/"+id+"/applied",{method:"POST"}); flash("Marked as applied"); await learnLoad(); }catch(e){ flash(e.message); } }
async function learnDel(id){ if(!confirm("Delete this learning?"))return; try{ await api2("/learnings/"+id,{method:"DELETE"}); flash("Deleted"); await learnLoad(); }catch(e){ flash(e.message); } }
function learnAdd(){ const cats=["Risk pattern","Control gap","Evidence quality","Sector insight","Process improvement","Concentration","Methodology calibration"];
  modal(`<h3>Add a learning</h3>
  <div class="field"><label>Category</label><select id="ln_cat">${cats.map(c=>`<option>${c}</option>`).join("")}</select></div>
  <div class="field"><label>Confidence</label><select id="ln_conf"><option>High</option><option selected>Medium</option><option>Low</option></select></div>
  <div class="field"><label>Insight</label><textarea id="ln_ins" rows="3" placeholder="What did we learn that should guide future assessments?"></textarea></div>
  <div class="row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="learnSave()">Save learning</button></div>`); }
async function learnSave(){ const ins=val("ln_ins"); if(!ins){ flash("Add the insight"); return; }
  try{ await api2("/learnings",{method:"POST",body:JSON.stringify({category:val("ln_cat"),confidence:val("ln_conf"),insight:ins})}); closeModal(); flash("Learning saved"); await learnLoad(); }catch(e){ flash(e.message); } }

/* ---------- ProAssess (R5) ---------- */

let _paReport=null, _paMode='new';
V.proassess=async()=>{
  const view=document.getElementById("view");
  let vendors=[]; try{ vendors=await api2("/vendors"); }catch(e){}
  view.innerHTML=`<div class="top"><div><h1>ProAssess</h1>
    <div class="sub">Autonomous end-to-end assessment · works for new or existing vendors · no assumptions, gaps resolved risk-averse</div></div></div>
    <div class="card">
      <p class="muted" style="margin-bottom:12px">Describe the vendor and engagement in your own words and attach any documents you have. ProAssess reads internal records, your uploaded documents, public signals and your description together, computes inherent &amp; residual risk across the warranted domains, records every unestablished fact as a risk-averse gap, and — for a new vendor — creates the vendor, engagement, assessment and certificate records automatically. It asks no questions.</p>
      <div class="seg" style="margin-bottom:12px">
        <button class="${_paMode==='new'?'on':''}" onclick="paSetMode('new')">🆕 New vendor</button>
        <button class="${_paMode==='existing'?'on':''}" onclick="paSetMode('existing')">🏢 Existing vendor</button>
      </div>
      <div id="pa_target"></div>
      <div class="field" style="margin-top:10px"><label>Describe the vendor &amp; engagement — everything you know</label>
        <textarea id="pa_text" rows="6" placeholder="e.g. New SaaS payroll provider for EMEA. Processes employee personal and special-category data, ~50,000 records, hosted in AWS Frankfurt, some support offshore in India. We'll integrate via API. SOC 2 attached."></textarea></div>
      <div class="field"><label>Supporting documents (optional, multiple) — read automatically</label><input id="pa_files" type="file" multiple></div>
      <div class="field"><label><input type="checkbox" id="pa_ddq"> Control evidence (DDQ) supplied — without it, no mitigation is credited and residual = inherent</label></div>
      <button class="btn" onclick="paRunAuto()">⚡ Run ProAssess</button>
      <span class="muted" style="font-size:11px;margin-left:8px">Records are created automatically on completion.</span>
    </div>
    <div id="paReport"></div>`;
  // seed from a BRO Chat Stage-0 hand-off (reuse everything submitted so far)
  const _sd=window._proassessSeed; window._proassessSeed=null;
  if(_sd && _sd.vendor_id) _paMode='existing';
  paRenderTarget(vendors);
  if(_sd){
    const tx=document.getElementById("pa_text"); if(tx&&_sd.free_text) tx.value=_sd.free_text;
    const ti=document.getElementById("pa_title"); if(ti&&_sd.title) ti.value=_sd.title;
    if(_sd.vendor_id){ const sel=document.getElementById("pa_v"); if(sel) sel.value=_sd.vendor_id; }
    else { const nm=document.getElementById("pa_name"); if(nm&&_sd.vendor_name) nm.value=_sd.vendor_name; }
    flash("Carried over from BRO Chat — review and run ProAssess");
  }
};
let _paVendors=[];
function paSetMode(m){ _paMode=m; paRenderTarget(_paVendors); }
function paRenderTarget(vendors){
  if(vendors&&vendors.length!==undefined) _paVendors=vendors;
  const host=document.getElementById("pa_target"); if(!host) return;
  if(_paMode==='existing'){
    host.innerHTML=`<div class="field"><label>Registered vendor</label>
      <select id="pa_v"><option value="">— select —</option>${(_paVendors||[]).map(v=>`<option value="${v.vendor_id}">${esc(v.legal_name)} (${v.vendor_id})</option>`).join("")}</select></div>
      <div class="field"><label>Engagement title (optional)</label><input id="pa_title" placeholder="e.g. Payment processing"></div>`;
  } else {
    host.innerHTML=`<div class="grid g2">
      <div class="field"><label>New vendor legal name</label><input id="pa_name" placeholder="e.g. Globex Payments Ltd"></div>
      <div class="field"><label>Engagement title</label><input id="pa_title" placeholder="e.g. Payroll processing"></div></div>
      <p class="muted" style="font-size:11px">A duplicate check runs automatically — if this vendor already exists, ProAssess links to it rather than creating a second record.</p>`;
  }
}
async function paRunAuto(){
  const input=document.getElementById("pa_files");
  const files=[];
  if(input&&input.files){
    for(const f of input.files){
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
      files.push({filename:f.name,content_type:f.type||"application/octet-stream",data_b64:b64});
    }
  }
  const body={free_text:val("pa_text"),documents:files,engagement_title:val("pa_title")||null,create_records:true};
  if(_paMode==='existing'){ body.vendor_id=val("pa_v")||null; if(!body.vendor_id){ flash("Select a vendor"); return; } }
  else { body.new_vendor_name=val("pa_name")||null; if(!body.new_vendor_name){ flash("Enter the new vendor name"); return; } }
  if(document.getElementById("pa_ddq").checked) body.ddq={};
  const host=document.getElementById("paReport");
  // kick off the real assessment AND the choreographed animation in parallel
  let apiErr=null;
  const apiPromise=api2("/proassess/autonomous",{method:"POST",body:JSON.stringify(body)})
    .then(r=>{_paReport=r;}).catch(e=>{apiErr=e;});
  await paPlayAnimation(host, _paMode==='existing' ? (val("pa_v")||"vendor") : (val("pa_name")||"new vendor"));
  await apiPromise;
  if(apiErr){ host.innerHTML=`<div class="err">${esc(apiErr.message)}</div>`; return; }
  if(_paReport && (_paReport.holding || _paReport.available===false)){
    host.innerHTML=`<div class="note warn"><b>${esc(_paReport.message||"AI engines not available yet.")}</b><br><span class="muted">ProAssess is an AI-driven workflow and follows the methodology with adaptive analysis. Connect an AI provider in Settings → AI to run it.</span></div>`;
    return;
  }
  paRenderAuto();
}

/* ---- ProAssess choreographed assessment animation ---- */
const PA_STAGES=[
  ["Context","Establishing engagement context"],
  ["Intake","Reading records, documents & public signals"],
  ["Inherent risk","Scoring inherent exposure across domains"],
  ["Rating","Banding the inherent risk"],
  ["Scoping","Selecting the due-diligence domains warranted"],
  ["Due diligence","Specialists assessing their domains"],
  ["Residual risk","Crediting evidenced controls"],
  ["Decision","Compiling the assessment & recommendation"],
];
const PA_AGENTS=[
  ["Bro","Lead Orchestrator","bro","orchestrating"],
  ["Rex","Public-data Researcher","researcher","gathering signals"],
  ["Sara","Scope & Inherent","scope","scoping exposure"],
  ["Isaac","Information Security","infosec","Information Security"],
  ["Rhea","Operational Resilience","resilience","Operational Resilience & BCM"],
  ["Priya","Data Protection & Privacy","privacy","Privacy & data protection"],
  ["Mira","Reputation & Conduct","reputation","Reputation & adverse media"],
  ["Connor","Compliance & Regulatory","compliance","Regulatory compliance"],
  ["Finn","Physical & Personnel","physical","Physical & personnel security"],
  ["Elara","ESG & Sustainability","esg","ESG & sustainability"],
];
async function paPlayAnimation(host, subject){
  const stageRail=PA_STAGES.map((s,i)=>`<div class="pa-stage" data-i="${i}"><span class="pa-stage-dot"></span><span class="pa-stage-name">${esc(s[0])}</span></div>`).join('<span class="pa-stage-sep"></span>');
  const agentGrid=PA_AGENTS.map((a,i)=>`<div class="pa-agent" data-i="${i}">
      <span class="pa-av" style="background:${AGENT_COLORS[a[2]]||'#444'}">${esc(a[0][0])}</span>
      <span class="pa-ab"><span class="pa-an">${esc(a[0])}</span><span class="pa-ad">${esc(a[1])}</span></span>
      <span class="pa-as">idle</span></div>`).join("");
  host.innerHTML=`<div class="pa-anim">
    <div class="pa-anim-head"><span class="pa-spin"></span><div><b>Assessing ${esc(subject)}</b><div class="pa-status" id="pa_status">Initialising the assessment workflow…</div></div>
      <div class="pa-pct" id="pa_pct">0%</div></div>
    <div class="pa-bar"><div class="pa-bar-fill" id="pa_fill"></div></div>
    <div class="pa-stages" id="pa_stages">${stageRail}</div>
    <div class="pa-agents" id="pa_agents">${agentGrid}</div>
  </div>`;
  const $=s=>host.querySelector(s);
  const stages=[...host.querySelectorAll(".pa-stage")];
  const agents=[...host.querySelectorAll(".pa-agent")];
  const setPct=p=>{ $("#pa_fill").style.width=p+"%"; $("#pa_pct").textContent=Math.round(p)+"%"; };
  const say=t=>{ $("#pa_status").textContent=t; };
  const N=PA_STAGES.length;
  for(let i=0;i<N;i++){
    stages[i].classList.add("on"); say(PA_STAGES[i][1]+"…");
    setPct((i)/N*100);
    if(i===5){
      // due-diligence stage: specialists light up one by one
      for(let a=2;a<PA_AGENTS.length;a++){
        agents[a].classList.add("active"); agents[a].querySelector(".pa-as").textContent="assessing "+PA_AGENTS[a][3];
        say(PA_AGENTS[a][0]+" is assessing "+PA_AGENTS[a][3]+"…");
        await _sleep(360);
        agents[a].classList.remove("active"); agents[a].classList.add("done"); agents[a].querySelector(".pa-as").textContent="✓ done";
        setPct((5 + (a-1)/(PA_AGENTS.length-1))/N*100);
      }
    } else {
      // light the lead/researcher/scope agents on their stages
      const map={0:0,1:1,2:2,3:2,6:0,7:0};
      if(map[i]!=null){ const a=agents[map[i]]; a.classList.add("active"); a.querySelector(".pa-as").textContent=PA_AGENTS[map[i]][3];
        await _sleep(300); a.classList.remove("active"); a.classList.add("done"); a.querySelector(".pa-as").textContent="✓"; }
      else { await _sleep(420); }
    }
    stages[i].classList.remove("on"); stages[i].classList.add("done");
    setPct((i+1)/N*100);
  }
  agents.forEach(a=>{ if(!a.classList.contains("done")){ a.classList.add("done"); a.querySelector(".pa-as").textContent="✓"; }});
  say("Assessment complete — compiling the final report…"); setPct(100);
  await _sleep(500);
}
function paRenderAuto(){
  const d=_paReport; const host=document.getElementById("paReport");
  const recColor = (d.recommendation||"").startsWith("Approve")&&!(d.recommendation||"").includes("conditions")?"l0":(d.recommendation||"").includes("conditions")?"l1":"l3";
  const writes=d.tables_written||[];
  host.innerHTML=`
    <div class="sec-h" style="margin-top:18px"><h2 style="font-size:15px">Risk Report</h2><div class="rule"></div></div>
    <div class="v360-hero">
      <div class="vname">${esc(d.vendor_id||'unregistered')}${d.created_vendor?' · newly created':''}${d.duplicate_matched?' · matched existing':''}</div>
      <div class="vmeta">${d.engagement_id?esc(d.engagement_id):''} · ${d.documents_considered||0} document(s) · ${d.free_text_considered?'free-text considered':'no narrative'}</div>
      <div class="v360-verdict"><div class="v360-dot ${recColor}"></div>
        <div><div class="v360-vlabel">${esc(d.recommendation||'')}</div>
          <div class="v360-vsub">Inherent ${esc(d.inherent_band)} · Residual ${esc(d.residual_band)} · ${d.gap_count} gap(s) · monitoring ${esc(d.monitoring_cadence)}</div></div></div>
    </div>
    ${writes.length?`<div class="card" style="margin-bottom:12px;background:#f0f6f2;border-color:#cfe3d6">
      <div class="card-label" style="color:var(--green)">✓ Records created automatically</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${writes.map(w=>`<span class="tag" style="background:#e3efe6;color:var(--moss)">${esc(w)}</span>`).join("")}</div></div>`:''}
    <div class="v360-grid">
      <div class="v360-panel"><h3>Extracted inherent signals (IRQ)</h3>
        ${Object.keys(d.extracted_irq||{}).length?Object.entries(d.extracted_irq).map(([k,v])=>`<div class="v360-metric"><span class="mk">${esc(k)}</span><span class="mv">${esc(Array.isArray(v)?v.join(", "):String(v))}</span></div>`).join(""):'<div class="muted">No strong signals extracted — thin input scored conservatively.</div>'}
      </div>
      <div class="v360-panel"><h3>⚠ Gaps — resolved risk-averse (${d.gap_count})</h3>
        ${(d.gaps||[]).length?d.gaps.map(g=>`<div class="v360-metric"><span class="mk">${esc(g.domain)}: ${esc(g.issue)}</span><span class="mv" style="font-size:11px;color:#a85a1e">${esc(g.resolution)}</span></div>`).join(""):'<div class="muted">No gaps.</div>'}
      </div>
    </div>
    <div class="v360-panel" style="margin-bottom:12px"><h3>Risks (${(d.risks||[]).length})</h3>
      ${(d.risks||[]).length?d.risks.map(r=>`<div class="v360-exc"><span class="v360-sevdot sev-${r.severity}"></span><span style="flex:1">${esc(r.note)}</span><span class="muted" style="font-size:11px">${esc(r.domain)}</span></div>`).join(""):'<div class="muted">No material risks in scope.</div>'}
    </div>
    ${d.assessment_id?`<div class="row" style="margin-bottom:20px"><button class="btn ghost" onclick="openAssessmentReview('${d.assessment_id}')">Open assessment record →</button></div>`:''}`;
}

V.audit=async()=>{
  const view=document.getElementById("view");
  view.innerHTML=`<div class="top"><div><h1>Audit Trail</h1><div class="sub">Tamper-evident, hash-chained</div></div>
    <button class="btn ghost" onclick="verifyAudit()">Verify chain</button></div><div id="at" class="muted">Loading…</div>`;
  try{ const rows=await api("/audit");
    view.querySelector("#at").innerHTML=`<table><tr><th>#</th><th>Action</th><th>Actor</th><th>Hash</th></tr>
      ${rows.map(r=>`<tr><td>${r.seq}</td><td>${esc(r.action)}</td><td>${esc(r.actor)}</td>
        <td class="muted" style="font-family:monospace;font-size:11px">${esc(r.hash.slice(0,16))}…</td></tr>`).join("")}</table>`;
  }catch(e){ view.querySelector("#at").innerHTML=`<div class="err">${esc(e.message)}</div>`; }
};
async function verifyAudit(){ try{ const r=await api("/audit/verify");
  flash(r.intact?`✓ Chain intact (${r.entries} entries)`:`✗ Chain broken at #${r.broke_at}`);
  }catch(e){flash(e.message);} }

// boot: resume session if token present
if(tok()){ (async()=>{ try{
  const d=await api("/dashboard/executive"); // probe
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  try{ const me=await api("/me"); window._role=me.role;
    if(me.role==="admin"){ const nm=document.getElementById("navMethodology"); if(nm) nm.style.display=""; const nc=document.getElementById("navConfig"); if(nc) nc.style.display=""; }
    document.getElementById("whoName").textContent=me.username; document.getElementById("whoRole").textContent=me.role.toUpperCase(); }catch(_){}
  V.home(); initLang(); loadNavOrder();
}catch(_){ logout(); } })(); }
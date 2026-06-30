"""
The BRO Risk Oracle web UI.

Server-rendered, single-file styled interface over the existing API. Carries the
established BRO brand (forest green / navy / gold). It calls the same JSON API
the rest of the app exposes, via fetch, holding the JWT in memory (sessionStorage)
so the security model is identical to API clients — no separate auth path.

Mounted onto the FastAPI app at "/". The SPA-style shell talks to /api/v1/*.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

import hashlib as _hashlib
import os as _os
_APP_JS_PATH = _os.path.join(_os.path.dirname(__file__), "static", "app.js")
try:
    _APP_JS_VER = _hashlib.md5(open(_APP_JS_PATH, "rb").read()).hexdigest()[:10]
except Exception:
    _APP_JS_VER = "1"

ui = APIRouter()

_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brata</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  :root{
    --paper:#FFFFFF; --soft:#FAFAF8; --softer:#F2F3EE; --ink:#0F1419; --ink-2:#363B44;
    --mute:#727A84; --line:#E7E8E2; --line-2:#F1F2ED;
    --accent:#1A4D3C; --accent-2:#C99B5F; --crit:#B23A2F; --warn:#C97A1A; --ok:#2E7D4F; --info:#335577;
    --r-xs:7px; --r-sm:10px; --r-md:13px; --r-lg:16px; --r-xl:22px;
    --ease:cubic-bezier(.22,.61,.36,1); --ease-spring:cubic-bezier(.34,1.4,.5,1); --dur:.2s; --dur-lg:.42s;
    --sh-1:0 1px 2px rgba(15,20,25,.04),0 1px 3px rgba(15,20,25,.05);
    --sh-2:0 2px 6px rgba(15,20,25,.05),0 6px 16px rgba(15,20,25,.06);
    --sh-3:0 12px 32px rgba(15,20,25,.12),0 4px 10px rgba(15,20,25,.06);
    --ring:0 0 0 3px rgba(26,77,60,.18);
    /* legacy aliases kept so existing view markup keeps resolving */
    --green:#1A4D3C; --green-d:#196046; --navy:#1F3A52; --gold:#C99B5F; --card:#FFFFFF;
    --mut:#727A84; --moss:#2E7D4F; --amber:#C97A1A; --rust:#B23A2F;
    --high:#B23A2F; --elev:#C97A1A; --mod:#C9A227; --low:#2E7D4F;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  ::selection{background:rgba(201,155,95,.28)}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--soft);
       color:var(--ink);font-size:14px;line-height:1.55;letter-spacing:-.006em;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  h1,h2,h3{font-family:'Fraunces','Georgia',serif;letter-spacing:-.012em;font-optical-sizing:auto}
  .mono,.card-label,.nav-group-label,.brand-sub{font-family:'JetBrains Mono',monospace;letter-spacing:.03em}
  a{color:var(--accent);text-decoration:none}
  .hidden{display:none!important}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes growW{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  /* ---- simple animations (engaging, not distracting) ---- */
  @keyframes popIn{0%{opacity:0;transform:scale(.96) translateY(8px)}100%{opacity:1;transform:none}}
  @keyframes slideInRight{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
  @keyframes rowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulseCrit{0%{box-shadow:0 0 0 0 rgba(217,83,79,.35)}70%{box-shadow:0 0 0 8px rgba(217,83,79,0)}100%{box-shadow:0 0 0 0 rgba(217,83,79,0)}}
  @keyframes bandPop{0%{transform:scale(.8);opacity:.4}100%{transform:scale(1);opacity:1}}
  table tr{animation:rowIn var(--dur) var(--ease) both}
  table tr:nth-child(2){animation-delay:.02s}table tr:nth-child(3){animation-delay:.04s}
  table tr:nth-child(4){animation-delay:.06s}table tr:nth-child(5){animation-delay:.08s}
  table tr:nth-child(6){animation-delay:.10s}table tr:nth-child(7){animation-delay:.12s}
  table tr:nth-child(n+8){animation-delay:.14s}
  .v360-panel,.rev-panel,.tier-card,.stat,.v360-attr{animation:popIn var(--dur-lg) var(--ease) both}
  .btn:active{transform:translateY(1px) scale(.985)}
  .btn{transition:transform var(--dur) var(--ease),background var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
  .btn:hover{box-shadow:0 2px 8px rgba(20,48,42,.14)}
  .modal,.modal-card,.sheet{animation:popIn var(--dur-lg) var(--ease) both}
  .flash,.toast{animation:slideInRight var(--dur-lg) var(--ease) both}
  .crit-band.on{animation:bandPop var(--dur-lg) var(--ease) both}
  .crit-band.on .crit-opt.sel{animation:pulseCrit 1.8s ease-out 1}
  .spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);
        border-top-color:var(--green);border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px}
  #nav a{transition:background var(--dur) var(--ease),padding-left var(--dur) var(--ease)}
  #nav a:hover{padding-left:14px}
  .band,.posture-pill,.tag.crit{animation:bandPop var(--dur) var(--ease) both}
  @media (prefers-reduced-motion: reduce){
    *,#view>*,table tr,.v360-panel,.rev-panel,.tier-card,.stat,.v360-attr,.modal,.flash,.crit-band.on{
      animation:none!important;transition:none!important}
  }
  #view>*{animation:fadeUp var(--dur-lg) var(--ease) both}
  #view>*:nth-child(2){animation-delay:.04s} #view>*:nth-child(3){animation-delay:.08s}
  #view>*:nth-child(4){animation-delay:.12s} #view>*:nth-child(n+5){animation-delay:.16s}

  /* ---- shell: topbar + grouped sidebar + main ---- */
  #app{display:flex;flex-direction:column;min-height:100vh}
  .topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:16px;
          background:rgba(11,14,12,.86);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
          color:#fff;padding:13px 22px;border-bottom:1px solid rgba(201,155,95,.22);box-shadow:0 6px 20px rgba(0,0,0,.16)}
  .topbar .brand{display:flex;align-items:center;gap:13px}
  .topbar .logo{width:42px;height:42px;border-radius:12px;background:linear-gradient(150deg,#E2BD86,#C99B5F 58%,#A87E45);
        color:#0B0E0C;font-family:'Fraunces',serif;font-weight:700;font-size:24px;display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 10px rgba(201,155,95,.4),inset 0 1px 0 rgba(255,255,255,.4)}
  .topbar .brand-name{font-size:20px;font-weight:600;letter-spacing:-.01em;font-family:'Fraunces',serif}
  .topbar .brand-sub{font-size:9.5px;color:#a8b0a8;margin-top:3px;letter-spacing:.12em}
  .topbar-right{display:flex;align-items:center;gap:10px}
  .role-badge{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:6px 12px}
  .role-badge .role-ico{font-size:18px}
  .role-badge .role-name{font-size:13px;font-weight:600} .role-badge .role-kind{font-size:10px;color:#a8b0a8}
  .signout{color:#fff;background:rgba(255,255,255,.1);border-radius:10px;padding:7px 13px;font-size:12px;font-weight:500;cursor:pointer;border:none}
  .signout:hover{background:var(--crit)}
  .shell{display:flex;flex:1;min-height:0}
  aside{width:232px;background:var(--soft);border-right:1px solid var(--line);padding:18px 10px;flex-shrink:0;overflow-y:auto;transition:width .25s ease,padding .2s ease}
  .nav-group{margin-bottom:14px}
  .nav-group-label{font-size:11px;font-weight:700;color:#16241d;text-transform:uppercase;padding:5px 10px;letter-spacing:.07em;cursor:pointer;user-select:none;border-radius:7px;display:block}
  .nav-group-label:hover{background:rgba(0,0,0,.05)}
  .nav-group-label::before{content:"▾";font-size:9px;opacity:.55;display:inline-block;width:13px}
  .nav-group.collapsed .nav-group-label::before{content:"▸"}
  .nav-group.collapsed a,.nav-group.collapsed select{display:none!important}
  .nav-toggle{background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:9px;width:36px;height:36px;font-size:17px;cursor:pointer;line-height:1}
  .nav-toggle:hover{background:rgba(255,255,255,.2)}
  #view{flex:1 1 auto;min-width:0}
  #app.nav-hidden aside{width:0;padding-left:0;padding-right:0;border:none;overflow:hidden}
  .home-theme-label{font-family:'Fraunces',serif;font-weight:700;font-size:15px;color:#1A4D3C;margin:20px auto 10px;max-width:1100px;letter-spacing:.01em;display:flex;align-items:center;gap:12px}
  .home-theme-label::after{content:"";flex:1;height:1px;background:var(--line)}
  .help-btn{background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px}
  .help-btn:hover{background:rgba(216,169,74,.3)}
  .help-overlay{position:fixed;inset:0;background:rgba(11,14,12,.34);z-index:120;opacity:0;pointer-events:none;transition:opacity .25s}
  .help-overlay.open{opacity:1;pointer-events:auto}
  .help-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:92vw;background:#fff;z-index:121;box-shadow:-12px 0 40px rgba(0,0,0,.22);transform:translateX(100%);transition:transform .28s cubic-bezier(.2,.7,.2,1);display:flex;flex-direction:column}
  .help-drawer.open{transform:none}
  .help-head{background:linear-gradient(135deg,#11261F,#1A4D3C);color:#fff;padding:18px 20px}
  .help-head h3{font-family:'Fraunces',serif;font-size:20px;margin:0}
  .help-head .hsub{color:#cdd6cb;font-size:12px;margin-top:4px}
  .help-head .hx{position:absolute;top:14px;right:16px;background:rgba(255,255,255,.14);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px}
  .help-body{padding:18px 20px;overflow-y:auto;flex:1}
  .help-purpose{font-size:13.5px;color:#3a4a42;background:#F3EFE4;border-left:3px solid var(--gold,#B8862B);border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:16px}
  .help-dp{border-bottom:1px solid #efe9da;padding:10px 0}
  .help-dp .term{font-weight:600;color:#1A4D3C;font-size:13.5px}
  .help-dp .def{font-size:12.8px;color:#56554c;margin-top:2px}
  .help-sec{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9A6F18;margin:16px 0 6px}
  .input-invalid{border-color:#DC2626!important;background:#fff6f6!important}
  .input-err-msg{color:#DC2626;font-size:11px;margin-top:3px}
  .ccy-select{font-size:12px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff}
  /* ===== 60-second cinematic demo (#6) ===== */
  .demo-launch{margin-top:20px;background:linear-gradient(135deg,#E2BD86,#C99B5F 60%,#A87E45);color:#0B0E0C;border:none;border-radius:14px;padding:13px 24px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(201,155,95,.35);display:inline-flex;align-items:center;gap:9px;font-family:'Spline Sans',sans-serif;transition:transform .15s,box-shadow .15s}
  .demo-launch:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(201,155,95,.48)}
  .demo-overlay{position:fixed;inset:0;z-index:200;background:radial-gradient(1200px 720px at 50% -12%,#16302a,#0b1410 72%);display:flex;flex-direction:column;opacity:0;transition:opacity .4s;font-family:'Spline Sans',sans-serif}
  .demo-overlay.open{opacity:1}
  .demo-top{position:relative;padding:24px 36px 4px;color:#fff}
  .demo-kicker{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.24em;color:#D8A94A;text-transform:uppercase}
  .demo-h{font-family:'Fraunces',serif;font-size:26px;font-weight:600;margin:5px 0 0;letter-spacing:-.01em}
  .demo-x{position:absolute;top:22px;right:28px;background:rgba(255,255,255,.12);border:none;color:#fff;width:38px;height:38px;border-radius:10px;font-size:16px;cursor:pointer}
  .demo-x:hover{background:rgba(255,255,255,.22)}
  .demo-timeline{display:flex;gap:10px;margin:18px 36px 0}
  .demo-seg{flex:1;display:flex;flex-direction:column;gap:7px;cursor:pointer}
  .demo-seg .bar{height:5px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}
  .demo-seg .bar i{display:block;height:100%;width:0;background:#D8A94A;border-radius:3px}
  .demo-seg .lab{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#92a399;font-family:'JetBrains Mono',monospace;transition:color .3s}
  .demo-seg.active .lab{color:#fff}
  .demo-stage-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:18px 36px;min-height:0}
  .demo-stage{width:100%;max-width:1000px;transition:opacity .32s ease,transform .32s ease}
  .demo-stage.swap{opacity:0;transform:translateY(8px)}
  .demo-frame{background:#FAF8F2;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.5);overflow:hidden;border:1px solid rgba(255,255,255,.08)}
  .demo-frame .tb{display:flex;align-items:center;gap:7px;padding:11px 16px}
  .demo-frame .tb .dot{width:10px;height:10px;border-radius:50%}
  .demo-frame .tb .ttl{color:#fff;font-size:13px;font-weight:600;margin-left:7px}
  .demo-frame .tb .badge{margin-left:auto;font-size:10.5px;font-family:'JetBrains Mono',monospace;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.18);color:#fff}
  .demo-body{padding:22px 26px;min-height:312px}
  .demo-stitle{font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:#16241d;margin-bottom:14px}
  .d-rise{opacity:0;animation:dRise .55s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--d,0ms)}
  .d-pop{opacity:0;animation:dPop .5s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0ms)}
  @keyframes dRise{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
  @keyframes dPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
  .demo-field{display:flex;justify-content:space-between;gap:14px;padding:9px 13px;border:1px solid #e7e1d2;border-radius:9px;margin-bottom:8px;background:#fff;font-size:13.5px}
  .demo-field .k{color:#8a8472;font-size:10.5px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.06em;align-self:center}
  .demo-field .v{font-weight:600;color:#1A2A22}
  .dcard{background:#fff;border:1px solid #e7e1d2;border-radius:12px;padding:14px 16px}
  .dcard .k{color:#8a8472;font-size:10.5px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.07em}
  .demo-stat{font-family:'Fraunces',serif;font-size:30px;font-weight:600;line-height:1.1;margin:4px 0}
  .demo-bar{height:9px;background:#ece6d6;border-radius:6px;overflow:hidden}
  .demo-bar i{display:block;height:100%;width:0;border-radius:6px;transition:width 1.1s cubic-bezier(.2,.7,.2,1)}
  .demo-cap-wrap{padding:0 36px 6px}
  .demo-cap{max-width:1000px;margin:0 auto;color:#dfe6dc;font-size:15.5px;line-height:1.5;min-height:48px}
  .demo-cap b{color:#fff;font-weight:600}
  .demo-controls{display:flex;align-items:center;justify-content:center;gap:18px;padding:10px 0 28px;position:relative}
  .demo-btn{background:rgba(255,255,255,.12);border:none;color:#fff;width:46px;height:46px;border-radius:50%;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:filter .15s}
  .demo-btn.play{width:58px;height:58px;background:#D8A94A;color:#0B0E0C;font-size:20px}
  .demo-btn:hover{filter:brightness(1.14)}
  .demo-time{position:absolute;right:36px;bottom:38px;color:#92a399;font-family:'JetBrains Mono',monospace;font-size:12px}
  .demo-pill{display:inline-block;font-size:11px;font-family:'JetBrains Mono',monospace;padding:3px 10px;border-radius:20px}
  .d-fade{opacity:0;animation:dFade .55s ease forwards;animation-delay:var(--d,0ms)}
  @keyframes dFade{to{opacity:1}}
  @keyframes dPulse{0%,100%{r:13}50%{r:17}}
  .d-hot{animation:dPulse 1.6s ease-in-out infinite}
  .navsort-row{display:flex;align-items:center;gap:6px;padding:6px 8px;margin:3px 0;background:#fff;border:1px solid #e3e3e3;border-radius:6px;font-size:12px;cursor:grab;user-select:none}
  .navsort-row.dragging{opacity:.4;border-color:var(--gold,#B8862B)}
  .navsort-row .grip{color:#bbb}
  .navsort-items{min-height:28px;padding:2px 0;border-radius:6px}
  .navsort-items.drop-target{background:#F3F8F5;outline:1px dashed var(--gold,#B8862B)}
  .navsort-items:empty::after{content:'drop items here';display:block;color:#bbb;font-size:11px;font-style:italic;padding:6px 8px}
  .lang-select{width:calc(100% - 20px);margin:0 10px 6px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;font-size:12px;color:var(--ink,#14302A);cursor:pointer}
  nav a{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:9px 11px;border-radius:10px;
        color:var(--ink-2);font-size:14px;font-weight:450;cursor:pointer;position:relative;
        transition:background var(--dur) var(--ease),color var(--dur) var(--ease)}
  nav a:hover{background:var(--softer)}
  nav a.active{background:var(--paper);color:var(--accent);font-weight:600;box-shadow:var(--sh-1)}
  nav a.active::before{content:"";position:absolute;left:-1px;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:3px;background:var(--accent)}
  nav .ico{font-size:16px;width:20px;text-align:center;flex:none}

  main{flex:1;padding:28px 32px;overflow-y:auto;min-width:0;max-width:1280px}
  .top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}
  .top h1{font-size:33px;font-weight:600;letter-spacing:-.012em;line-height:1.08}
  .top .sub{color:var(--mute);font-size:14.5px;margin-top:8px;max-width:680px}

  .btn{background:var(--accent);color:#fff;border:none;padding:11px 17px;border-radius:var(--r-sm);
       font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;
       transition:transform var(--dur) var(--ease),box-shadow var(--dur) var(--ease),background var(--dur) var(--ease);
       box-shadow:0 1px 2px rgba(26,77,60,.2)}
  .btn:hover{background:#196046;transform:translateY(-1px);box-shadow:0 5px 16px rgba(26,77,60,.28)}
  .btn:active{transform:translateY(0)}
  .btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;transform:none}
  .btn.ghost{background:var(--paper);color:var(--accent);border:1px solid var(--line);box-shadow:none}
  .btn.ghost:hover{border-color:var(--accent);background:var(--soft)}
  .btn.amber{background:var(--warn)} .btn.sm{padding:7px 12px;font-size:12px}

  .grid{display:grid;gap:14px}
  .g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)}
  .g2{grid-template-columns:repeat(2,1fr)}
  .card{background:var(--paper);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;
        box-shadow:var(--sh-1);transition:transform var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
  .card:hover{box-shadow:var(--sh-2)}
  .stat{position:relative;overflow:hidden;text-align:left}
  .stat .v{font-family:'Fraunces',serif;font-size:30px;font-weight:600;color:var(--accent);line-height:1}
  .stat .l{font-size:12px;letter-spacing:.02em;color:var(--mute);font-weight:500;margin-top:7px}

  .sec-h{display:flex;align-items:center;gap:10px;margin:26px 0 14px}
  .sec-h h2{font-size:18px;font-weight:600} .sec-h .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}

  table{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--sh-1)}
  th{background:var(--softer);color:var(--ink-2);text-align:left;padding:11px 16px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;font-weight:600;font-family:'JetBrains Mono',monospace}
  td{padding:12px 16px;border-bottom:1px solid var(--line-2);font-size:13.5px}
  tr:last-child td{border-bottom:none}
  tr.click{cursor:pointer;transition:background var(--dur) var(--ease)} tr.click:hover td{background:var(--soft)}

  .band{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;color:#fff}
  .band.HIGH{background:var(--crit)} .band.ELEVATED{background:var(--warn)}
  .band.MODERATE{background:var(--mod)} .band.LOW{background:var(--ok)}
  .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:var(--softer);color:var(--ink-2)}
  .crit{background:#f7e6e3;color:var(--crit)}

  /* ---- analysis sections (FDD / Reputation / Monitoring / Contracts) ---- */
  .seg{display:flex;gap:4px;background:#efece2;border-radius:10px;padding:4px;margin-bottom:16px;flex-wrap:wrap}
  .seg button{flex:1;min-width:90px;border:none;background:transparent;padding:8px 10px;border-radius:7px;
        font-family:inherit;font-size:12.5px;font-weight:600;color:var(--mut);cursor:pointer;transition:.15s}
  .seg button.on{background:#fff;color:var(--green);box-shadow:0 1px 3px rgba(20,48,42,.12)}
  /* ---- CR-9 Critical top band ---- */
  .crit-band{display:flex;justify-content:space-between;align-items:center;gap:16px;
        background:#f6f4ec;border:1px solid var(--line);border-left:4px solid #9aa6a0;
        border-radius:12px;padding:14px 18px;margin-bottom:16px;transition:.25s}
  .crit-band.on{background:linear-gradient(90deg,#fbe7e6,#f7f1ea);border-left-color:#d9534f}
  .crit-band-label{font-family:'Fraunces',serif;font-size:16px;font-weight:600;color:var(--ink)}
  .crit-band-sub{display:block;font-size:11.5px;color:var(--mut);margin-top:2px;max-width:620px}
  .crit-toggle{display:flex;gap:4px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:3px}
  .crit-opt{border:none;background:transparent;padding:7px 18px;border-radius:7px;font-family:inherit;
        font-size:13px;font-weight:700;color:var(--mut);cursor:pointer;transition:.18s}
  .crit-opt.sel{background:var(--green);color:#fff}
  .crit-band.on .crit-opt.sel{background:#d9534f}
  /* ---- CR-10 risk attributes panel on 360 ---- */
  .v360-attr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .v360-attr{background:#faf9f4;border:1px solid var(--line);border-radius:10px;padding:11px 13px}
  .v360-attr .al{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
  .v360-attr .av{font-family:'Fraunces',serif;font-size:15px;font-weight:600;color:var(--ink);margin-top:3px}
  .v360-attr .as{font-size:11px;color:var(--mut);margin-top:2px}
  /* ---- CR-2 assessment review ---- */
  .rev-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
  .rev-panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}
  .rev-panel h3{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--green);margin:0 0 12px}
  .rev-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f0ede4;font-size:13px}
  .rev-row:last-child{border-bottom:none}
  .rev-row .rk{color:var(--mut)}.rev-row .rv{font-weight:600;color:var(--ink);text-align:right;max-width:60%}
  .rev-risk{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid #f0ede4;font-size:13px}
  .rev-risk:last-child{border-bottom:none}
  .rev-stage{margin-bottom:12px}
  .rev-stage-h{font-size:12px;font-weight:700;color:var(--green);margin-bottom:5px}
  .rev-turn{font-size:12px;color:#43504a;padding:4px 0 4px 10px;border-left:2px solid #e6e2d6;margin-bottom:3px}
  .rev-verdict{margin-top:10px;padding:10px 12px;background:#f6f4ec;border-radius:9px;font-size:12.5px;color:#3a463f;white-space:pre-wrap}
  .rev-gaps{margin-top:10px;font-size:12px;color:#9a6a1a;background:#fbf2d6;padding:9px 11px;border-radius:8px}
  /* supply-chain concentration legend */
  .conc-legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;color:var(--mut)}
  .conc-legend i.cdot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
  .v360-hero{background:linear-gradient(135deg,#14302a 0%,#1d4a40 100%);color:#f4f1e8;border-radius:16px;
        padding:24px 26px;margin-bottom:18px;position:relative;overflow:hidden}
  .v360-hero .vname{font-family:'Fraunces',serif;font-size:24px;font-weight:600;letter-spacing:-.01em}
  .v360-hero .vmeta{font-size:12.5px;opacity:.82;margin-top:3px}
  .v360-verdict{display:flex;align-items:center;gap:16px;margin-top:18px}
  .v360-dot{width:54px;height:54px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 5px rgba(255,255,255,.12)}
  .v360-dot.l0{background:#4caf7e}.v360-dot.l1{background:#d9b441}.v360-dot.l2{background:#e08a3c}.v360-dot.l3{background:#d9534f}
  .v360-vlabel{font-family:'Fraunces',serif;font-size:21px;font-weight:600}
  .v360-vsub{font-size:12px;opacity:.8}
  .v360-crit{position:absolute;top:18px;right:22px;background:var(--gold);color:#14302a;font-size:11px;
        font-weight:700;padding:5px 11px;border-radius:20px;letter-spacing:.03em}
  .v360-dims{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px}
  .v360-dim{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 12px;text-align:center}
  .v360-dim .dv{font-family:'Fraunces',serif;font-size:18px;font-weight:600;color:var(--green)}
  .v360-dim .dl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-top:4px}
  .v360-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
  .v360-panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}
  .v360-panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:0 0 12px}
  .v360-metric{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0ede4;font-size:13px}
  .v360-metric:last-child{border-bottom:none}
  .v360-metric .mk{color:var(--mut)}.v360-metric .mv{font-weight:600;color:var(--ink)}
  .v360-exc{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0ede4;font-size:13px}
  .v360-exc:last-child{border-bottom:none}
  .v360-sevdot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
  .sev-Critical{background:#d9534f}.sev-High{background:#e08a3c}.sev-Medium{background:#d9b441}.sev-Low{background:#7a8c84}
  .v360-bar{height:8px;border-radius:5px;background:#eee;overflow:hidden;margin-top:6px}
  .v360-bar span{display:block;height:100%}
  .port-row{display:grid;grid-template-columns:1.6fr .7fr .9fr .8fr .6fr;gap:10px;align-items:center;
        padding:11px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:7px;background:#fff;cursor:pointer;transition:.12s}
  .port-row:hover{border-color:var(--green);box-shadow:0 2px 8px rgba(20,48,42,.08)}
  .posture-pill{font-size:11px;font-weight:700;padding:4px 9px;border-radius:14px;text-align:center}
  .pp-0{background:#e3f3ea;color:#1f7a4d}.pp-1{background:#fbf2d6;color:#94701a}
  .pp-2{background:#fbe7d4;color:#a85a1e}.pp-3{background:#f7dcda;color:#a5322e}
  .ent-box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
  .ent-box .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .score-strip{display:flex;gap:20px;align-items:center;margin-bottom:18px;flex-wrap:wrap}
  .score-big{text-align:center;min-width:120px}
  .score-num{font-family:'Fraunces',serif;font-size:46px;font-weight:900;line-height:1;color:var(--green)}
  .score-cap{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em;margin-top:4px}
  .altman{display:flex;flex-direction:column;gap:4px}
  .altman-z{font-size:15px} .altman-z b{font-size:20px;margin-left:6px}
  .pillar-row{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:16px}
  .pillar-row.wrap{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
  .gauge{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}
  .gauge-bar{height:9px;background:#efece2;border-radius:6px;overflow:hidden}
  .gauge-fill{height:100%;border-radius:6px;transition:width .7s cubic-bezier(.16,.84,.44,1)}
  .gauge-fill.ok{background:var(--moss)} .gauge-fill.info{background:var(--navy)}
  .gauge-fill.warn{background:var(--amber)} .gauge-fill.crit{background:var(--rust)}
  .gauge-meta{display:flex;justify-content:space-between;font-size:11.5px}
  .gauge-meta .gl{color:var(--mut)} .gauge-meta .gv{font-weight:700}
  .tier-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  .tier-card{border-radius:11px;padding:14px;border:1px solid var(--line)}
  .tier-card.crit{background:#f9ece9} .tier-card.warn{background:#f8f0e2}
  .tier-card.info{background:#eaf0f4} .tier-card.mute{background:#f1efe8}
  .tier-no{font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--mut)}
  .tier-card p{margin-top:6px;font-size:12px;color:var(--mut)}
  .prov{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:15px;background:var(--paper)}
  .prov-head{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px}
  .prov-meta{font-size:12.5px;color:var(--mut);margin-top:7px}
  .ai-out{background:#fff;border:1px solid var(--line);border-radius:11px;padding:16px;margin-top:12px;font-size:13.5px;line-height:1.6;white-space:pre-wrap}
  .stress-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:12px}
  .stress-grid input[type=range]{width:100%}
  .pill{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
  .pill.ok{background:#e3efe6;color:var(--moss)} .pill.info{background:#e7eef3;color:var(--navy)}
  .pill.warn{background:#f6ebda;color:var(--amber)} .pill.crit{background:#f6e2de;color:var(--rust)}
  .pill.mute{background:#eee;color:var(--mut)}
  .empty-box{text-align:center;padding:38px;color:var(--mut)}
  .empty-box .ei{font-size:34px;margin-bottom:8px} .empty-box .et{font-weight:700;color:var(--ink);font-size:15px}

  /* forms */
  .field{margin-bottom:13px;text-align:left}
  .field textarea,.field input,textarea{text-align:left!important}
  .gsearch{position:relative;flex:1;max-width:430px}
  .gsearch input{width:100%;padding:8px 13px;border:1px solid rgba(255,255,255,.25);border-radius:10px;
    background:rgba(255,255,255,.10);color:#fff;font-size:12.5px}
  .gsearch input::placeholder{color:rgba(255,255,255,.55)}
  .gs-results{position:absolute;top:40px;left:0;right:0;background:#fff;border:1px solid var(--line);
    border-radius:12px;box-shadow:0 14px 40px rgba(15,30,25,.22);max-height:420px;overflow:auto;z-index:60}
  .gs-row{display:flex;gap:10px;align-items:center;padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--soft)}
  .gs-row:hover{background:var(--soft)} .gs-row .gk{font-size:10px;font-family:'JetBrains Mono',monospace;
    letter-spacing:.08em;text-transform:uppercase;color:#fff;border-radius:5px;padding:2px 7px;flex:none}
  .gs-row .gt{font-weight:600;font-size:13px;color:var(--ink)} .gs-row .gsub{font-size:11px;color:var(--mute)}
  .reclink{color:var(--green);font-weight:600;cursor:pointer;text-decoration:none;border-bottom:1px dotted var(--green)}
  .reclink:hover{color:var(--gold);border-color:var(--gold)}
  .demo-cap{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:120;background:#14302A;
    color:#fff;padding:14px 22px;border-radius:14px;max-width:680px;box-shadow:0 18px 50px rgba(0,0,0,.35);
    border:1px solid rgba(184,134,43,.5)}
  .demo-cap .dc-t{font-family:Fraunces,serif;font-size:16px;color:#E8C778;margin-bottom:3px}
  .demo-cap .dc-b{font-size:12.5px;line-height:1.5;opacity:.94}
  .demo-cap .dc-x{position:absolute;top:6px;right:10px;cursor:pointer;opacity:.7}
  label{display:block;font-size:12px;font-weight:600;color:var(--mut);margin-bottom:5px;letter-spacing:.02em}
  input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;
        font-family:inherit;font-size:13px;background:#fff;transition:border-color .15s,box-shadow .15s}
  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--green);
        box-shadow:0 0 0 3px rgba(26,77,60,.12)}

  /* modal */
  .ovl{position:fixed;inset:0;background:rgba(20,40,32,.42);display:flex;align-items:center;
       justify-content:center;z-index:50;padding:20px;backdrop-filter:blur(3px);
       animation:ovlIn .18s ease}
  .ovl.ovl-full{padding:0}
  .reg-chips{display:flex;flex-wrap:wrap;gap:7px}
  .reg-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:5px 10px;border-radius:999px;
    border:1px solid var(--line);background:#fff;cursor:pointer;user-select:none}
  .reg-chip.on{background:#14302A;color:#fff;border-color:#14302A}
  .reg-chip.on .muted{color:#9DBBA8}
  .reg-table{border-collapse:collapse;width:100%;font-size:11.5px}
  .reg-table th,.reg-table td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
  .reg-table th{background:#F1ECDD;font-weight:600;color:#1A4D3C;position:sticky;top:0}
  .reg-table .reg-attr{background:#FAF6EC;font-weight:600;color:#14302A;min-width:150px}
  .reg-new{background:#DC2626;color:#fff;font-size:8.5px;font-weight:700;padding:1px 5px;border-radius:4px;vertical-align:middle}
  @keyframes ovlIn{from{opacity:0}to{opacity:1}}
  .modal{background:#fff;border-radius:15px;padding:24px;width:480px;max-width:100%;max-height:90vh;
         overflow:auto;box-shadow:0 30px 80px rgba(0,0,0,.28);
         animation:modalIn .24s cubic-bezier(.16,.84,.44,1)}
  @keyframes modalIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
  .modal h3{font-size:18px;margin-bottom:16px}
  .modal .row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
  .modal.full{width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0;
         padding:24px 30px;overflow:hidden;display:flex;flex-direction:column;animation:modalFullIn .22s cubic-bezier(.16,.84,.44,1)}
  @keyframes modalFullIn{from{opacity:0;transform:scale(.99)}to{opacity:1;transform:none}}
  .modal.full .full-body{flex:1;overflow:auto;max-width:1060px;width:100%;margin:0 auto;padding-right:4px}

  /* login */
  #login{display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;
         background:radial-gradient(circle at 30% 20%,#15302a,#0B0E0C 70%)}
  #login .box{background:var(--paper);border-radius:var(--r-xl);padding:40px;width:392px;box-shadow:0 30px 80px rgba(0,0,0,.4)}
  #login .brand{text-align:center;margin-bottom:24px}
  #login .brand .logo{width:54px;height:54px;border-radius:14px;margin:0 auto 14px;
        background:linear-gradient(150deg,#E2BD86,#C99B5F 58%,#A87E45);color:#0B0E0C;
        font-family:'Fraunces',serif;font-weight:700;font-size:30px;display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 10px rgba(201,155,95,.4),inset 0 1px 0 rgba(255,255,255,.4)}
  #login .brand b{font-family:'Fraunces',serif;font-size:24px;font-weight:600;color:var(--ink);display:block}
  #login .brand span{font-size:9.5px;letter-spacing:.14em;color:var(--mute);font-family:'JetBrains Mono',monospace}
  #login .tag{font-style:italic;color:var(--mute);font-size:12px;margin-top:8px;text-align:center;display:block}
  .err{background:#f7e6e3;color:var(--crit);padding:9px 12px;border-radius:var(--r-sm);font-size:12px;margin-bottom:12px}
  .muted{color:var(--mute);font-size:12.5px}
  .flash{position:fixed;bottom:20px;right:20px;background:var(--accent);color:#fff;padding:12px 18px;
         border-radius:var(--r-sm);font-size:13px;box-shadow:var(--sh-3);z-index:60}

  /* ---- AI Assessment chat surface ---- */
  .chat-wrap{display:grid;grid-template-columns:200px 1fr 230px;gap:14px;height:calc(100vh - 150px)}
  .chat-rail{background:#fff;border:1px solid var(--line);border-radius:11px;padding:14px;overflow:auto}
  .chat-rail h4{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
  .agent-row{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:7px;font-size:12px}
  .agent-row.active{background:#f0ede3}
  .adot{width:26px;height:26px;border-radius:50%;color:#fff;display:flex;align-items:center;
        justify-content:center;font-weight:800;font-size:11px;flex-shrink:0}
  .agent-row .an{font-weight:600} .agent-row .at{color:var(--mut);font-size:10px}
  .stagestrip{display:flex;gap:3px;margin-bottom:10px;flex-wrap:wrap}
  .ststep{flex:1;min-width:54px;text-align:center;padding:5px 2px;border-radius:5px;font-size:9px;
          font-weight:700;letter-spacing:.04em;background:#efece2;color:var(--mut)}
  .ststep.cur{background:var(--green);color:#fff} .ststep.done{background:#dCeadF;color:var(--moss)}
  .chat-main{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
  .chat-scroll{flex:1;overflow:auto;padding:16px}
  .cmsg{margin-bottom:14px;display:flex;gap:9px}
  .cmsg.user{justify-content:flex-end}
  .cbub{max-width:78%;padding:9px 13px;border-radius:11px;font-size:13px;line-height:1.5}
  .cbub.agent{background:#f7f5ef;border:1px solid var(--line)}
  .cbub.user{background:var(--green);color:#fff}
  .cbub.sys{background:#f3eee0;color:var(--mut);font-size:11.5px;font-style:italic;max-width:100%;text-align:center;margin:0 auto}
  .cmsg-hdr{font-size:10px;font-weight:700;margin-bottom:3px}
  .chat-input{border-top:1px solid var(--line);padding:11px;display:flex;gap:8px;align-items:flex-end}
  .chat-input textarea{flex:1;border:1px solid var(--line);border-radius:8px;padding:9px;font-family:inherit;font-size:13px;resize:none}
  .insight{border-radius:7px;padding:8px 10px;margin-bottom:7px;font-size:11.5px;border-left:3px solid}
  .insight.high{background:#f6e2de;border-color:var(--rust)}
  .insight.medium{background:#f6ebda;border-color:var(--amber)}
  .insight.low{background:#eef2e8;border-color:var(--moss)}
  .insight .ik{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
  .learn{background:#f7f5ef;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-bottom:7px;font-size:11.5px}
  .dossier-row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:3px 0;border-bottom:1px solid #eee7d8}
  .dossier-row .dk{color:var(--mut)} .dossier-row .dv{font-weight:600;text-align:right}
  /* ---- supply-chain drill-down drawer ---- */
  .conc-drawer{position:fixed;top:0;right:0;height:100vh;width:420px;max-width:92vw;background:#fff;
    box-shadow:-8px 0 32px rgba(20,48,42,.18);border-left:1px solid var(--line);z-index:9000;
    transform:translateX(105%);transition:transform .26s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
  .conc-drawer.open{transform:translateX(0)}
  .conc-drawer .cd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
    padding:18px 20px;background:linear-gradient(135deg,#14302A,#1A4D3C);color:#f3efe3}
  .conc-drawer .cd-kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#bcae8a;font-weight:700}
  .conc-drawer .cd-head h3{margin:3px 0 0;font-size:18px;color:#fff;line-height:1.2}
  .conc-drawer .cd-x{background:rgba(255,255,255,.14);border:none;color:#fff;width:30px;height:30px;
    border-radius:8px;cursor:pointer;font-size:14px;flex:none}
  .conc-drawer .cd-x:hover{background:rgba(255,255,255,.28)}
  .conc-drawer .cd-body{padding:16px 20px;overflow-y:auto;flex:1}
  .cd-stats{display:flex;flex-wrap:wrap;gap:14px;padding-bottom:14px;margin-bottom:12px;border-bottom:1px solid var(--line)}
  .cd-stats .cv{font-size:22px;font-weight:700;color:var(--forest);font-family:Fraunces,Georgia,serif}
  .cd-stats .cl{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
  .cd-lab{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--moss);margin:4px 0 8px}
  .cd-card{background:#f7f5ef;border:1px solid var(--line);border-radius:9px;padding:10px 12px;margin-bottom:14px}
  .cd-row{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0}
  .cd-row span{color:var(--mut)} .cd-row b{text-align:right}
  .cd-list{display:flex;flex-direction:column;gap:6px}
  .cd-item{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border:1px solid var(--line);
    border-radius:8px;cursor:pointer;background:#fff;transition:border-color .15s,background .15s}
  .cd-item:hover{border-color:var(--moss);background:#f3f6f1}
  .cd-item .ci-name{font-size:13px;font-weight:600;color:var(--ink)}
  .cd-item .ci-meta{font-size:11px;color:var(--mut)}
  .band{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700}
  .band.HIGH{background:#f8d7d7;color:#a02929}.band.ELEVATED{background:#f6e2c8;color:#9a6418}
  .band.MODERATE{background:#e6eef6;color:#2a5a8a}.band.LOW{background:#e3efe6;color:#1A4D3C}
  .tag.crit{background:#f8d7d7;color:#a02929;padding:1px 6px;border-radius:4px;font-weight:700}
  /* ---- board intelligence ---- */
  .intel-shell{display:grid;grid-template-columns:340px 1fr;gap:16px;margin-top:6px}
  @media(max-width:1024px){.intel-shell{grid-template-columns:1fr}}
  .intel-console{background:#0e1f1a;color:#bfe3c9;border-radius:12px;padding:14px 16px;height:560px;overflow-y:auto;
    font-family:'Spline Sans Mono',ui-monospace,monospace;font-size:12px;line-height:1.55;box-shadow:inset 0 0 0 1px #1c3a30}
  .intel-console .il-line{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)}
  .intel-console .il-line b{color:#fff}
  .intel-console .il-line.muted{color:#7f9a86}
  .intel-console .il-line.ok{color:#7fe0a0;font-weight:600}
  .intel-console .il-line.err{color:#ff9b8a}
  .intel-canvas{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 22px;min-height:560px;
    max-height:760px;overflow-y:auto;box-shadow:var(--sh,0 1px 2px rgba(0,0,0,.05))}
  .intel-empty{height:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#5a6b62}
  .ie-mark{font-size:46px;color:#cdbd92;margin-bottom:10px}
  .ie-mark.spin{animation:spin 1.6s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .ib-brief{background:linear-gradient(135deg,#14302A,#1A4D3C);color:#eef2ec;border-radius:12px;padding:18px 20px}
  .ib-kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#bcae8a;font-weight:700}
  .ib-brief p{font-size:15px;line-height:1.5;margin:8px 0 14px;color:#f3f6f2}
  .ib-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  @media(max-width:560px){.ib-metrics{grid-template-columns:repeat(2,1fr)}}
  .ib-metrics .ibm-v{font-family:Fraunces,Georgia,serif;font-size:21px;font-weight:600;color:#fff}
  .ib-metrics .ibm-k{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#a9c1ad}
  .bar-row{display:grid;grid-template-columns:120px 1fr 64px;align-items:center;gap:10px;padding:4px 0;font-size:12px}
  .bar-lab{color:var(--mut);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{background:#eef0ea;border-radius:6px;height:14px;overflow:hidden}
  .bar-fill{height:100%;border-radius:6px;transition:width .5s ease}
  .bar-val{font-weight:600;font-size:12px}
  .ic-card{background:#fbfaf6;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .ic-title{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--moss);margin-bottom:8px}
  .ic-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:720px){.ic-grid{grid-template-columns:1fr}}
  .pestle-row{display:grid;grid-template-columns:120px 1fr 96px;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #efece1}
  .pestle-row:last-child{border-bottom:none}
  .pe-fac{font-weight:700;font-size:13px} .pe-sev{font-size:12px;font-weight:700;text-align:right}
  .pe-head{grid-column:1 / -1;font-size:11.5px;margin-top:-2px}
  .obs-list{display:flex;flex-direction:column;gap:12px}
  .obs-card{background:#fff;border:1px solid var(--line);border-left:4px solid #2E6A4F;border-radius:10px;padding:14px 16px}
  .obs-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .obs-sev{color:#fff;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:5px}
  .obs-fac{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border:1px solid;border-radius:5px}
  .obs-hz{font-size:11px;margin-left:auto}
  .obs-card h3{font-size:16px;margin:2px 0 8px;color:var(--ink)}
  .obs-ev,.obs-sw{font-size:12.5px;color:var(--ink-soft,#4a554f);margin-bottom:6px;line-height:1.5}
  .obs-ev b,.obs-sw b{color:var(--moss)}
  .obs-act{font-size:13px;background:#f3f6f1;border:1px solid #d8e6dc;border-radius:8px;padding:9px 11px;margin-top:6px;line-height:1.5}
  .oa-tag{display:inline-block;background:var(--forest,#14302A);color:#fff;font-size:9.5px;font-weight:700;letter-spacing:.05em;
    text-transform:uppercase;padding:2px 7px;border-radius:5px;margin-right:7px}
  .pred-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media(max-width:720px){.pred-grid{grid-template-columns:1fr}}
  .pred-card{background:#fbfaf6;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .pred-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
  .pred-metric{font-family:Fraunces,Georgia,serif;font-size:18px;font-weight:600;color:var(--forest)}
  .pred-conf{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gold,#B8862B)}
  .pred-card h4{font-size:14px;margin:2px 0 5px;color:var(--ink)}
  .pred-card p{font-size:12px;line-height:1.5;margin:0}
  /* ---- home tile launcher ---- */
  .home-hero{max-width:920px;margin:0 auto;padding:36px 16px 60px;text-align:center}
  .home-mark{margin-bottom:30px}
  .home-logo{width:64px;height:64px;border-radius:18px;margin:0 auto 16px;
    background:linear-gradient(145deg,#C99B5F,#9c6f23);display:flex;align-items:center;justify-content:center;
    font-family:Fraunces,Georgia,serif;font-weight:600;font-size:34px;color:#14302A;box-shadow:0 8px 22px rgba(20,48,42,.22)}
  .home-word{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:40px;color:var(--forest,#14302A);letter-spacing:-.02em}
  .home-word span{color:var(--gold,#B8862B);font-weight:400}
  .home-tag{font-size:16px;color:var(--mut,#5a6b62);margin-top:8px}
  .home-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:8px}
  .home-tile{display:flex;align-items:center;gap:14px;text-align:left;background:#fff;border:1px solid var(--line,#e1dcce);
    border-radius:14px;padding:16px 16px;cursor:pointer;box-shadow:0 1px 2px rgba(20,48,42,.05);
    transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;position:relative;overflow:hidden}
  .home-tile::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--ac,#1A4D3C);opacity:.85}
  .home-tile:hover{transform:translateY(-3px);box-shadow:0 6px 16px rgba(20,48,42,.12),0 16px 36px rgba(20,48,42,.1);border-color:var(--ac,#1A4D3C)}
  .ht-ico{flex:none;width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;
    font-size:20px;color:#fff}
  .ht-body{display:flex;flex-direction:column;min-width:0;flex:1}
  .ht-title{font-weight:600;font-size:14.5px;color:var(--ink,#15211c);line-height:1.25}
  .ht-sub{font-size:12px;color:var(--mut,#5a6b62);margin-top:2px;line-height:1.35}
  .ht-arrow{flex:none;color:var(--ac,#1A4D3C);font-size:16px;opacity:0;transform:translateX(-4px);transition:opacity .16s,transform .16s}
  .home-tile:hover .ht-arrow{opacity:1;transform:translateX(0)}
  .home-foot{margin-top:30px;font-size:12px;color:var(--mut,#5a6b62);letter-spacing:.02em}
  /* ---- ProAssess assessment animation ---- */
  .pa-anim{margin-top:16px;background:#0f1714;border-radius:16px;padding:20px 22px;color:#e8efe9;box-shadow:var(--sh)}
  .pa-anim-head{display:flex;align-items:center;gap:14px;margin-bottom:14px}
  .pa-anim-head>div{flex:1}
  .pa-anim-head b{font-family:Fraunces,Georgia,serif;font-size:18px;color:#fff}
  .pa-status{font-size:12.5px;color:#9fc4b2;margin-top:2px;font-family:'Spline Sans Mono',monospace}
  .pa-pct{font-family:Fraunces,Georgia,serif;font-size:26px;color:#C99B5F;font-weight:600}
  .pa-spin{width:26px;height:26px;border:3px solid rgba(255,255,255,.15);border-top-color:#C99B5F;border-radius:50%;animation:paspin .8s linear infinite;flex:none}
  @keyframes paspin{to{transform:rotate(360deg)}}
  .pa-bar{height:6px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden;margin-bottom:18px}
  .pa-bar-fill{height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#1A4D3C,#C99B5F);transition:width .4s ease}
  .pa-stages{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:18px}
  .pa-stage{display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:8px;opacity:.45;transition:opacity .3s,background .3s}
  .pa-stage-dot{width:9px;height:9px;border-radius:50%;background:#6b8378;transition:background .3s,box-shadow .3s}
  .pa-stage-name{font-size:11px;font-family:'Spline Sans Mono',monospace;color:#cfe0d6;white-space:nowrap}
  .pa-stage.on{opacity:1;background:rgba(201,155,95,.14)}
  .pa-stage.on .pa-stage-dot{background:#C99B5F;box-shadow:0 0 0 4px rgba(201,155,95,.25);animation:papulse 1s ease-in-out infinite}
  .pa-stage.done{opacity:1}
  .pa-stage.done .pa-stage-dot{background:#3fae7a}
  .pa-stage-sep{width:14px;height:1px;background:rgba(255,255,255,.18)}
  @keyframes papulse{0%,100%{box-shadow:0 0 0 3px rgba(201,155,95,.3)}50%{box-shadow:0 0 0 7px rgba(201,155,95,.08)}}
  .pa-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px}
  .pa-agent{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
    border-radius:11px;padding:9px 11px;opacity:.5;transition:opacity .3s,border-color .3s,background .3s,transform .2s}
  .pa-av{flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;
    font-family:Fraunces,Georgia,serif;font-weight:600;font-size:15px;color:#fff}
  .pa-ab{display:flex;flex-direction:column;min-width:0;flex:1}
  .pa-an{font-size:13px;font-weight:600;color:#fff;line-height:1.2}
  .pa-ad{font-size:10.5px;color:#8fae9f;line-height:1.3}
  .pa-as{font-size:10px;font-family:'Spline Sans Mono',monospace;color:#7d9488;white-space:nowrap}
  .pa-agent.active{opacity:1;border-color:#C99B5F;background:rgba(201,155,95,.12);transform:translateY(-2px)}
  .pa-agent.active .pa-as{color:#C99B5F}
  .pa-agent.done{opacity:1;border-color:rgba(63,174,122,.4)}
  .pa-agent.done .pa-as{color:#3fae7a}

  /* ===== Performance: SLA Management + Performance Issues ===== */
  .sla-tabs,.pi-toolbar{display:flex;gap:8px;align-items:center;margin:14px 0}
  .sla-tabs{border-bottom:2px solid var(--line);gap:2px}
  .sla-tab{padding:10px 18px;font-size:14px;font-weight:600;color:var(--mute);background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px}
  .sla-tab:hover{color:var(--accent)}
  .sla-tab.active{color:var(--accent);border-bottom-color:var(--accent-2)}
  .tabnum{font-size:11px;background:var(--softer);border:1px solid var(--line);padding:1px 8px;border-radius:20px;color:var(--mute);font-weight:600}
  .tabdot{width:8px;height:8px;border-radius:50%;background:var(--crit);display:none}
  .sla-sources{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
  .sla-src{display:flex;flex-direction:column;gap:6px;padding:16px}
  .sla-src p{flex:1;font-size:12px;margin:0}
  .sla-panelh{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line)}
  table.reg{width:100%;border-collapse:collapse}
  table.reg thead th{text-align:left;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--mute);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--soft);white-space:nowrap}
  table.reg tbody td{padding:11px 14px;border-bottom:1px solid var(--line-2);font-size:13px;vertical-align:middle}
  table.reg tbody tr.reg-row:hover{background:var(--soft);cursor:pointer}
  .sdot{display:inline-flex;width:20px;height:20px;border-radius:50%;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .sdot.ok{background:#E7F5EC;color:var(--ok)}.sdot.bad{background:#FBEAE8;color:var(--crit)}.sdot.none{background:#eee;color:#999}
  .s-ok{color:var(--ok)}.s-bad{color:var(--crit)}.s-none{color:#999}
  .winchip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:var(--softer);border:1px solid var(--line);color:var(--accent)}
  .srcb,.srcb2{font-size:9.5px;letter-spacing:.03em;text-transform:uppercase;padding:2px 7px;border-radius:5px;font-weight:700}
  .srcb.contract,.src-sla{background:#FBEAE8;color:var(--crit)}.srcb.upload,.src-ai{background:#F2E9FA;color:#6b21a8}
  .srcb.manual,.src-manual{background:#EAF0F4;color:#3F5566}.src-incident{background:#FBF1DC;color:#8a5a1a}
  .iconb{width:28px;height:28px;border-radius:7px;background:none;border:none;color:var(--mute);font-size:14px;cursor:pointer}
  .iconb:hover{background:var(--softer);color:var(--accent)}
  .nowrap{white-space:nowrap}.mono{font-family:'SF Mono','Consolas',monospace;font-size:12px;color:var(--green-d);font-weight:600}
  .sm{font-size:11.5px}
  .meas-wrap{padding:14px 18px;background:var(--soft)}
  .periods{display:flex;gap:10px;flex-wrap:wrap}
  .per{background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 11px;min-width:120px}
  .per .pk{font-size:11px;font-weight:600;color:var(--mute);margin-bottom:5px}
  .per .pi{display:flex;align-items:center;gap:6px}
  .per input{width:66px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:13px;text-align:right}
  .per.met{border-color:#bfe3cd;background:#E7F5EC}.per.breach{border-color:#f1c9c3;background:#FBEAE8}
  .per .vd{font-size:10px;font-weight:700;margin-top:5px}.per.met .vd{color:var(--ok)}.per.breach .vd{color:var(--crit)}
  .ai-card .ai-h,.ai-h{display:flex;align-items:center;gap:9px;font-weight:700;color:var(--accent);font-size:14px;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:12px}
  .ai-badge{margin-left:auto;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#8a5a1a;border:1px solid #e8c07a;padding:2px 8px;border-radius:20px;font-weight:600}
  .ai-stats{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
  .ai-s{background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:9px 14px;min-width:88px}
  .ai-s .v{font-size:22px;font-weight:700;color:var(--accent);line-height:1}.ai-s.ok .v{color:var(--ok)}.ai-s.bad .v{color:var(--crit)}
  .ai-s .l{font-size:10.5px;color:var(--mute);margin-top:3px}
  .chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
  .chip{font-size:11.5px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:5px 12px;color:var(--accent);cursor:pointer}
  .chip:hover{border-color:var(--accent-2);background:#FBF4E4}
  .qa{margin-top:12px}.qa-q{font-size:13px;color:var(--accent);margin-bottom:4px}
  .qa-a{font-size:13px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent-2);border-radius:8px;padding:10px 13px}
  .sevstrip{display:grid;grid-template-columns:repeat(5,1fr);gap:11px;margin:14px 0}
  .sevcard{background:#fff;border:1px solid var(--line);border-left-width:4px;border-radius:11px;padding:12px 15px;cursor:pointer}
  .sevcard:hover{box-shadow:0 2px 10px rgba(0,0,0,.06)}.sevcard.active{box-shadow:0 0 0 2px var(--accent-2)}
  .sevcard .n{font-size:24px;font-weight:700;line-height:1}.sevcard .l{font-size:11px;color:var(--mute);margin-top:4px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
  .sevcard.all{border-left-color:var(--accent)}.sevcard.all .n{color:var(--accent)}
  .sevcard.crit{border-left-color:#7A1F2B}.sevcard.crit .n{color:#7A1F2B}
  .sevcard.high{border-left-color:var(--crit)}.sevcard.high .n{color:var(--crit)}
  .sevcard.med{border-left-color:var(--warn)}.sevcard.med .n{color:var(--warn)}
  .sevcard.low{border-left-color:#3F5566}.sevcard.low .n{color:#3F5566}
  .tagp{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap}
  .sev-crit{background:#F7E4E6;color:#7A1F2B}.sev-high{background:#FBE7E3;color:var(--crit)}.sev-med{background:#FBF1DC;color:var(--warn)}.sev-low{background:#EAF0F4;color:#3F5566}
  .st-open{background:#FBE7E3;color:var(--crit)}.st-prog{background:#E7F0F8;color:#2d6ea3}.st-rev{background:#F2E9FA;color:#6b21a8}.st-closed{background:#E7F5EC;color:var(--ok)}.st-acc{background:#FBF1DC;color:#8a5a1a}
  .pi-toolbar select{border:1px solid var(--line);border-radius:8px;padding:8px 11px;background:#fff}
  .btn.gold{background:var(--accent-2);color:#fff}.btn.sm{padding:7px 12px;font-size:12px}
  .pi-det{display:grid;grid-template-columns:1.4fr 1fr;gap:22px;padding:16px 20px;background:var(--soft)}
  .det-b{margin-bottom:14px}.det-b h5{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute);margin:0 0 6px}
  .rem-b{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:10px 12px;font-size:12.5px}
  .det-acts{display:flex;gap:7px;flex-wrap:wrap}
  .kv{display:flex;gap:10px;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line-2)}.kv .muted{min-width:110px}
  .tl{list-style:none;padding:0;margin:0}.tl li{position:relative;padding:0 0 11px 17px;font-size:12px}
  .tl li::before{content:'';position:absolute;left:0;top:5px;width:8px;height:8px;border-radius:50%;background:var(--accent-2)}
  @media(max-width:900px){.sla-sources{grid-template-columns:1fr}.sevstrip{grid-template-columns:repeat(2,1fr)}.pi-det{grid-template-columns:1fr}}

  /* ===== Platform docs (SOP / Technical Details) + Version Control ===== */
  .doc-frame-wrap{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;height:calc(100vh - 180px);min-height:520px}
  .doc-frame{width:100%;height:100%;border:0;display:block;background:#fff}
  .ver-rail{position:relative;padding-left:8px;max-width:880px}
  .ver-card{position:relative;border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px 20px;margin:0 0 16px 22px}
  .ver-card::before{content:'';position:absolute;left:-22px;top:20px;width:11px;height:11px;border-radius:50%;background:var(--accent-2);border:2px solid #fff;box-shadow:0 0 0 1px var(--line)}
  .ver-card::after{content:'';position:absolute;left:-17px;top:31px;bottom:-16px;width:1px;background:var(--line)}
  .ver-card:last-child::after{display:none}
  .ver-card.latest{border-color:var(--accent-2);box-shadow:0 2px 14px rgba(201,155,95,.12)}
  .ver-card.latest::before{background:var(--accent);width:13px;height:13px;left:-23px}
  .ver-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .ver-tag{font-family:'SF Mono','Consolas',monospace;font-weight:700;font-size:15px;color:var(--accent)}
  .ver-cur{font-size:9.5px;letter-spacing:.06em;background:var(--accent);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700}
  .ver-date{font-size:12px;color:var(--mute);margin-left:auto}
  .ver-title{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:10px}
  .ver-sec{margin-bottom:9px}
  .ver-sec-h{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);font-weight:700;margin-bottom:3px}
  .ver-sec ul{margin:0 0 0 18px;padding:0}
  .ver-sec li{font-size:12.5px;line-height:1.5;color:var(--ink-2);margin-bottom:3px}
  @media print{aside,.top button,.help-drawer{display:none!important}}

  /* ===== Dashboards ===== */
  .dash-tabs,.sla-tabs{display:flex;gap:2px;border-bottom:2px solid var(--line);margin:14px 0}
  .dash-tab{padding:10px 18px;font-size:13.5px;font-weight:600;color:var(--mute);background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;border-radius:8px 8px 0 0}
  .dash-tab:hover{color:var(--accent)}.dash-tab.active{color:var(--accent);border-bottom-color:var(--accent-2)}
  .dkpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
  .dkpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .dkpi-v{font-family:Georgia,serif;font-size:30px;font-weight:700;color:var(--accent);line-height:1}
  .dkpi-l{font-size:11.5px;color:var(--mute);margin-top:5px;text-transform:uppercase;letter-spacing:.03em;font-weight:600}
  .dgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .dcard{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .dcard h4{font-size:13px;font-weight:700;color:var(--accent);margin:0 0 12px}
  .dbar{display:grid;grid-template-columns:120px 1fr 34px;align-items:center;gap:10px;margin-bottom:8px}
  .dbar-l{font-size:12px;color:var(--ink-2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dbar-track{background:var(--softer);border-radius:20px;height:18px;overflow:hidden}
  .dbar-fill{height:100%;border-radius:20px;min-width:2px;transition:width .4s ease}
  .dbar-v{font-size:12px;font-weight:700;color:var(--accent);text-align:right}
  /* ===== Learnings ===== */
  .learn-filters{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}
  .lchip{font-size:11.5px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:5px 13px;color:var(--accent);cursor:pointer}
  .lchip:hover{border-color:var(--accent-2)}.lchip.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  .learn-card{background:#fff;border:1px solid var(--line);border-radius:11px;padding:14px 16px;margin-bottom:11px}
  .learn-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .lcat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:6px;background:var(--gold-p,#FBF4E4);color:#7a5015}
  .lorigin{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:20px}
  .lorigin.auto{background:#E7F5EC;color:#15603f}.lorigin.human{background:#EAF2F6;color:#1f5066}
  .lconf{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px}
  .c-high{background:#FBE7E3;color:#7A1F2B}.c-medium{background:#FBF1DC;color:#8a5a1a}.c-low{background:#EAF0F4;color:#3F5566}
  .lreuse{font-size:11px;color:var(--mute);font-weight:600}
  .learn-insight{font-size:13.5px;line-height:1.55;color:var(--ink)}
  .learn-src{margin-top:6px}
  /* ===== BRO Chat persona highlight + AI banner ===== */
  .ai-banner{border-radius:10px;padding:11px 15px;font-size:12.5px;margin:0 0 12px;line-height:1.5}
  .ai-banner.ok{background:#E7F5EC;border:1px solid #9dcdb8;color:#15603f}
  .ai-banner.warn{background:#FDF6EC;border:1px solid #e8c07a;color:#7a5015}
  .ai-banner a{color:inherit;font-weight:700}
  .agent-row.active{background:linear-gradient(90deg,color-mix(in srgb,var(--apc,#14302A) 12%,#fff),#fff);border:1px solid var(--apc,var(--line));box-shadow:0 1px 6px rgba(0,0,0,.06)}
  .agent-row{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;border:1px solid transparent;margin-bottom:4px}
  .speaking{font-size:9.5px;font-weight:700;color:#15603f;background:#E7F5EC;border-radius:20px;padding:2px 8px;animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
  .adot.persona{width:34px;height:34px;font-size:14px;font-weight:700;flex-shrink:0}
  .persona-hdr{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
  .persona-name{font-weight:700;font-size:13.5px}
  .persona-title{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.03em}
  .cbub.agent{background:#fff;border:1px solid var(--line);border-radius:4px 12px 12px 12px;padding:11px 14px}
  .asr-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line-2)}
  .asr-row:last-child{border-bottom:none}
  @media(max-width:900px){.dkpis,.dgrid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login">
  <div class="box">
    <div class="brand"><div class="logo">B</div><b>Brata</b><span>ENTERPRISE TPRM</span>
      <span class="tag">Exposure first. Controls second. Verdict last.</span></div>
    <div id="loginErr" class="err hidden"></div>
    <div class="field"><label>Username</label><input id="lu" value="admin"></div>
    <div class="field"><label>Password</label><input id="lp" type="password" value="admin"></div>
    <button class="btn" style="width:100%" onclick="doLogin()">Sign in</button>
    <p class="muted" style="text-align:center;margin-top:14px">Default: admin / admin</p>
  </div>
</div>

<!-- APP -->
<div id="app" class="hidden">
  <header class="topbar">
    <div class="brand">
      <button class="nav-toggle" onclick="toggleNav()" title="Hide / show menu" aria-label="Toggle menu">☰</button>
      <div class="logo">B</div>
      <div><div class="brand-name">Brata</div>
        <div class="brand-sub">ENTERPRISE TPRM · POWERED BY CLAUDE</div></div>
    </div>
    <div class="topbar-right">
      <button class="help-btn" onclick="openHelp()" title="Explain this page">❔ Help me</button>
      <div class="role-badge"><span class="role-ico">🛡️</span>
        <div><div class="role-name" id="whoName">—</div><div class="role-kind" id="whoRole">—</div></div></div>
      <div class="gsearch" id="gsWrap">
        <input id="gs" placeholder="🔎  Search vendors, engagements, incidents, pages…" autocomplete="off"
               oninput="gSearch(this.value)" onfocus="gSearch(this.value)" aria-label="Global search">
        <div id="gsResults" class="gs-results" style="display:none"></div>
      </div>
      <button class="signout" style="background:#B8862B;border-color:#B8862B" onclick="startAutoDemo()" title="Auto slideshow demo">▶ Demo</button>
      <button class="signout" onclick="logout()">Sign out</button>
    </div>
  </header>
  <div class="help-overlay" id="helpOverlay" onclick="closeHelp()"></div>
  <aside class="help-drawer" id="helpDrawer" aria-label="Page help">
    <div class="help-head" style="position:relative">
      <button class="hx" onclick="closeHelp()" aria-label="Close help">✕</button>
      <h3 id="helpTitle">Help</h3><div class="hsub" id="helpSub"></div>
    </div>
    <div class="help-body" id="helpBody"></div>
  </aside>
  <div class="shell">
    <aside>
      <nav id="nav" role="navigation" aria-label="Primary">
        <div class="nav-group">
          <a data-v="home" class="active"><span class="ico">🏠</span>Home</a>
          <a data-v="methodology" id="navMethodology" style="display:none"><span class="ico">📐</span>Methodology</a>
          <a data-v="dashboards"><span class="ico">📊</span>Dashboards</a>
          <a data-v="learnings"><span class="ico">🧠</span>Learnings</a>
          <a data-v="dashboard"><span class="ico">📈</span>Snapshot</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Assess</div>
          <a data-v="assess"><span class="ico">🗣️</span>BRO Chat</a>
          <a data-v="proassess"><span class="ico">⚡</span>ProAssess</a>
          <a data-v="assessments"><span class="ico">🗂️</span>Assessments</a>
          <a data-v="engagements"><span class="ico">▦</span>Engagements</a>
          <a data-v="vendors"><span class="ico">🏢</span>Vendor Register</a>
          <a data-v="artefacts"><span class="ico">📜</span>Certifications</a>
          <a data-v="fdd"><span class="ico">💰</span>Financial DD</a>
          <a data-v="reputation"><span class="ico">🗞</span>Reputation</a>
          <a data-v="oss"><span class="ico">📦</span>Open Source (SBOM)</a>
          <a data-v="review"><span class="ico">🔎</span>Review Queue</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Monitor &amp; Manage</div>
          <a data-v="vendor360"><span class="ico">◎</span>Vendor 360</a>
          <a data-v="documents"><span class="ico">🗂️</span>Documents</a>
          <a data-v="performance"><span class="ico">📈</span>Performance</a>
          <a data-v="slamgmt"><span class="ico">📋</span>SLA Management</a>
          <a data-v="perfissues"><span class="ico">⚠️</span>Performance Issues</a>
          <a data-v="findings"><span class="ico">✅</span>Findings</a>
          <a data-v="issues"><span class="ico">⚠️</span>Issues Log</a>
          <a data-v="incidents"><span class="ico">🚨</span>Supplier Incidents</a>
          <a data-v="remediation"><span class="ico">🛠️</span>Remediation Plans</a>
          <a data-v="fourthparties"><span class="ico">🔗</span>4th Party Register</a>
          <a data-v="contracts"><span class="ico">⚖</span>Contracts</a>
          <a data-v="exit"><span class="ico">🚪</span>Exit Planning</a>
          <a data-v="notifications"><span class="ico">🔔</span>Notifications</a>
          <a data-v="schedules"><span class="ico">🗓️</span>Schedules</a>
          <a data-v="connections"><span class="ico">🔌</span>Connections</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Analyse</div>
          <a data-v="pestle"><span class="ico">🛰️</span>PESTLE Intelligence</a>
          <a data-v="intel"><span class="ico">✦</span>Intelligence</a>
          <a data-v="advanced"><span class="ico">🧠</span>Overview</a>
          <a data-v="integrity"><span class="ico">🩺</span>Data Integrity</a>
          <a data-v="entitygraph"><span class="ico">🕸️</span>Entity Graph</a>
          <a data-v="exposure"><span class="ico">🎯</span>BU Exposure</a>
          <a data-v="geopolitical"><span class="ico">🌍</span>Geopolitical</a>
          <a data-v="criticality"><span class="ico">⭐</span>Critical Vendor Modelling</a>
          <a data-v="scenario"><span class="ico">🎯</span>Scenario Simulator</a>
          <a data-v="stressradar"><span class="ico">📡</span>Stress Radar</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Understand</div>
          <a data-v="copilot"><span class="ico">🔎</span>Ask Anything</a>
          <a data-v="management"><span class="ico">📊</span>Management</a>
          <a data-v="globalreg"><span class="ico">🌐</span>Global Regulations</a>
          <a data-v="boardpack"><span class="ico">📑</span>Board / Regulator Pack</a>
          <a data-v="reports"><span class="ico">📁</span>Reports</a>
          <a data-v="aireports"><span class="ico">🤖</span>AI Reports</a>
          <a data-v="evidence"><span class="ico">🛡️</span>Evidence on Demand</a>
          <a data-v="lifecycle"><span class="ico">♻️</span>Lifecycle</a>
          <a data-v="governance"><span class="ico">§</span>Governance</a>
          <a data-v="audit"><span class="ico">🔒</span>Audit Trail</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Documentation</div>
          <a data-v="sop"><span class="ico">📘</span>SOP</a>
          <a data-v="techdetails"><span class="ico">🧩</span>Technical Details</a>
          <a data-v="versions"><span class="ico">🏷️</span>Version Control</a>
        </div>
        <div class="nav-group"><div class="nav-group-label">Miscellaneous</div>
          <a data-v="guideddemo"><span class="ico">🎬</span>Guided Demo</a>
          <a data-v="admin"><span class="ico">⚙️</span>Admin</a>
          <a data-v="aicontrol"><span class="ico">🧠</span>AI Control</a>
          <a data-v="config" id="navConfig" style="display:none"><span class="ico">🎛️</span>Configuration</a>
          <a data-v="settings"><span class="ico">⛭</span>Settings</a>
          <a data-v="language"><span class="ico">🌐</span>Translation workbench</a>
          <a data-v="feedback"><span class="ico">💬</span>Feedback</a>
          <select id="langSel" class="lang-select" onchange="setLang(this.value)" title="Display language">
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="es">Español</option>
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
            <option value="pt">Português</option>
            <option value="ru">Русский</option>
            <option value="hi">हिन्दी</option>
          </select>
        </div>
      </nav>
    </aside>
    <main id="view" role="main"></main>
  </div>
</div>

<div id="modalRoot"></div>
<div id="flashRoot" aria-live="polite" role="status"></div>

<script src="/static/app.js" defer></script>

</body>
</html>"""


@ui.get("/", response_class=HTMLResponse)
def index() -> str:
    return _PAGE.replace('/static/app.js"', f'/static/app.js?v={_APP_JS_VER}"')

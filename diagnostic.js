/* SKYHUNT DIAGNOSTIC BUILD
   Non-invasive: logs aircraft API traffic and provides manual endpoint probes.
*/
(function(){
  "use strict";

  const PROVIDERS = [
    {name:"adsb.lol", url:"https://api.adsb.lol/v2/point/51.4700/-0.4543/100"},
    {name:"Airplanes.live", url:"https://api.airplanes.live/v2/point/51.4700/-0.4543/100"}
  ];

  const state = { logs: [] };
  const originalFetch = window.fetch.bind(window);

  function now(){
    return new Date().toLocaleTimeString("en-GB");
  }

  function countAircraft(data){
    const rows = data?.ac || data?.aircraft || [];
    return Array.isArray(rows) ? rows.length : null;
  }

  function addLog(type, provider, detail){
    state.logs.unshift({
      time: now(),
      type,
      provider,
      detail
    });
    state.logs = state.logs.slice(0,50);
    render();
  }

  function isAircraftUrl(url){
    const s = String(url||"");
    return /api\.adsb\.lol|api\.airplanes\.live|opendata\.adsb\.fi|api\.adsb\.one/i.test(s);
  }

  function providerName(url){
    const s = String(url||"");
    if(/adsb\.lol/i.test(s)) return "adsb.lol";
    if(/airplanes\.live/i.test(s)) return "Airplanes.live";
    if(/adsb\.fi/i.test(s)) return "adsb.fi";
    if(/adsb\.one/i.test(s)) return "ADSB One";
    return "Aircraft API";
  }

  window.fetch = async function(input, init){
    const url = typeof input==="string" ? input : input?.url;
    if(!isAircraftUrl(url)){
      return originalFetch(input,init);
    }

    const provider = providerName(url);
    const started = performance.now();
    addLog("REQUEST",provider,String(url));

    try{
      const response = await originalFetch(input,init);
      const ms = Math.round(performance.now()-started);

      let detail = `HTTP ${response.status} ${response.statusText||""} Â· ${ms}ms`;
      try{
        const clone = response.clone();
        const text = await clone.text();
        let parsed = null;
        try{ parsed = JSON.parse(text); }catch(_){}
        if(parsed){
          const count = countAircraft(parsed);
          if(count!==null) detail += ` Â· ${count} aircraft`;
          detail += ` Â· JSON OK`;
        }else{
          detail += ` Â· body: ${text.slice(0,120).replace(/\s+/g," ")}`;
        }
      }catch(err){
        detail += ` Â· body unreadable: ${err.message}`;
      }

      addLog(response.ok?"SUCCESS":"HTTP ERROR",provider,detail);
      return response;
    }catch(err){
      const ms = Math.round(performance.now()-started);
      addLog("FETCH ERROR",provider,`${err.name||"Error"}: ${err.message||err} Â· ${ms}ms`);
      throw err;
    }
  };

  function createPanel(){
    if(document.getElementById("skyhuntDiag")) return;

    const wrap = document.createElement("div");
    wrap.id = "skyhuntDiag";
    wrap.innerHTML = `
      <button id="skyhuntDiagToggle" type="button">DIAGNOSTICS</button>
      <section id="skyhuntDiagPanel">
        <div class="diagHead">
          <div>
            <strong>Aircraft API diagnostics</strong>
            <small>Temporary diagnostic mode</small>
          </div>
          <button id="skyhuntDiagClose" type="button">Ã</button>
        </div>

        <div class="diagActions">
          <button id="skyhuntDiagProbe" type="button">RUN DIRECT API TEST</button>
          <button id="skyhuntDiagClear" type="button">CLEAR LOG</button>
        </div>

        <div class="diagExplain">
          Run a normal SKYHUNT hunt/radar scan first. This panel records the exact browser result from every aircraft provider.
        </div>

        <div id="skyhuntDiagSummary"></div>
        <div id="skyhuntDiagLogs"></div>
      </section>
    `;
    document.body.appendChild(wrap);

    const style = document.createElement("style");
    style.textContent = `
      #skyhuntDiag{position:fixed;right:10px;bottom:90px;z-index:999999;font-family:system-ui,-apple-system,sans-serif}
      #skyhuntDiagToggle{border:1px solid rgba(255,255,255,.18);background:#101820;color:#fff;border-radius:999px;padding:10px 13px;font-size:10px;font-weight:800;box-shadow:0 10px 35px rgba(0,0,0,.35)}
      #skyhuntDiagPanel{display:none;position:fixed;left:10px;right:10px;bottom:82px;max-height:72vh;overflow:auto;background:#071019;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:14px;box-shadow:0 30px 80px rgba(0,0,0,.55)}
      #skyhuntDiag.open #skyhuntDiagPanel{display:block}
      .diagHead{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
      .diagHead strong{display:block;font-size:16px}
      .diagHead small{display:block;color:#8fa3ae;margin-top:3px;font-size:10px}
      #skyhuntDiagClose{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#111d27;color:white;font-size:20px}
      .diagActions{display:flex;gap:8px;margin-bottom:10px}
      .diagActions button{flex:1;min-height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#11222d;color:#fff;font-size:9px;font-weight:800}
      .diagExplain{font-size:10px;line-height:1.45;color:#9fb0b8;background:rgba(255,255,255,.04);padding:10px;border-radius:10px;margin-bottom:10px}
      #skyhuntDiagSummary{font-size:11px;font-weight:700;margin-bottom:8px}
      .diagRow{padding:9px 0;border-top:1px solid rgba(255,255,255,.08)}
      .diagRowTop{display:flex;justify-content:space-between;gap:8px;font-size:9px;font-weight:800}
      .diagRow.success .diagType{color:#7ce0a8}
      .diagRow.error .diagType{color:#ff8f9f}
      .diagRow.request .diagType{color:#8bdff6}
      .diagDetail{margin-top:4px;color:#9caeb7;font-size:9px;line-height:1.45;word-break:break-word}
    `;

    document.head.appendChild(style);

    document.getElementById("skyhuntDiagToggle").onclick=()=>wrap.classList.add("open");
    document.getElementById("skyhuntDiagClose").onclick=()=>wrap.classList.remove("open");
    document.getElementById("skyhuntDiagClear").onclick=()=>{
      state.logs=[];
      render();
    };
    document.getElementById("skyhuntDiagProbe").onclick=runProbe;
  }

  function render(){
    const logEl = document.getElementById("skyhuntDiagLogs");
    const summary = document.getElementById("skyhuntDiagSummary");
    if(!logEl||!summary) return;

    const success = state.logs.filter(x=>x.type==="SUCCESS").length;
    const errors = state.logs.filter(x=>/ERROR/.test(x.type)).length;
    summary.textContent = `${success} successful responses Â· ${errors} errors`;

    logEl.innerHTML = state.logs.length
      ? state.logs.map(x=>{
          const cls=x.type==="SUCCESS"?"success":/ERROR/.test(x.type)?"error":"request";
          return `<div class="diagRow ${cls}">
            <div class="diagRowTop">
              <span>${x.time} Â· ${x.provider}</span>
              <span class="diagType">${x.type}</span>
            </div>
            <div class="diagDetail">${escapeHtml(x.detail)}</div>
          </div>`;
        }).join("")
      : `<div class="diagExplain">No aircraft requests logged yet.</div>`;
  }

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  async function runProbe(){
    addLog("REQUEST","DIAGNOSTIC","Starting manual London endpoint probes");

    for(const p of PROVIDERS){
      try{
        const ctl=new AbortController();
        const timer=setTimeout(()=>ctl.abort(),10000);
        try{
          const r=await window.fetch(p.url,{
            signal:ctl.signal,
            cache:"no-store",
            headers:{Accept:"application/json"}
          });
          // The wrapped fetch already logs details.
          if(r.ok){
            try{ await r.clone().json(); }catch(_){}
          }
        }finally{
          clearTimeout(timer);
        }
      }catch(_){}
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{
      createPanel();
      render();
    });
  }else{
    createPanel();
    render();
  }
})();

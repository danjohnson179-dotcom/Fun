/* SKYHUNT v1.2 — news.js
   Live aviation news via the GDELT DOC 2.0 API. */

const SKYHUNT_NEWS={
  category:"latest",
  query:"",
  articles:[],
  loading:false,
  loadedOnce:false,
  CACHE_MS:5*60*1000,

  categories:{
    latest:'(aviation OR airline OR airlines OR aircraft OR airport) sourcelang:english',
    airlines:'(airline OR airlines OR "air carrier" OR "commercial aviation") sourcelang:english',
    airports:'(airport OR airports OR "air traffic control" OR runway) sourcelang:english',
    aircraft:'(aircraft OR airliner OR Boeing OR Airbus OR Embraer) sourcelang:english',
    safety:'("aviation safety" OR "aircraft incident" OR "air accident" OR "emergency landing" OR "aircraft safety") sourcelang:english'
  },

  esc(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  },

  safeUrl(value){
    try{
      const u=new URL(String(value||""));
      return /^https?:$/.test(u.protocol)?u.href:"";
    }catch(_){return ""}
  },

  parseDate(value){
    if(!value)return null;
    const raw=String(value);
    // GDELT commonly returns YYYYMMDDTHHMMSSZ.
    const m=raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
    if(m){
      return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]));
    }
    const d=new Date(raw);
    return Number.isNaN(d.getTime())?null:d;
  },

  age(value){
    const d=this.parseDate(value);
    if(!d)return "RECENT";
    const seconds=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
    if(seconds<60)return "JUST NOW";
    if(seconds<3600)return `${Math.floor(seconds/60)}M AGO`;
    if(seconds<86400)return `${Math.floor(seconds/3600)}H AGO`;
    return `${Math.floor(seconds/86400)}D AGO`;
  },

  domainLabel(article){
    const domain=String(article.domain||"").replace(/^www\./,"");
    if(domain)return domain;
    try{return new URL(article.url).hostname.replace(/^www\./,"")}catch(_){return "Publisher"}
  },

  cacheKey(query){
    return "skyhuntNews:"+btoa(unescape(encodeURIComponent(query))).slice(0,120);
  },

  readCache(query){
    try{
      const raw=sessionStorage.getItem(this.cacheKey(query));
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed||Date.now()-parsed.saved>this.CACHE_MS)return null;
      return Array.isArray(parsed.articles)?parsed.articles:null;
    }catch(_){return null}
  },

  saveCache(query,articles){
    try{
      sessionStorage.setItem(this.cacheKey(query),JSON.stringify({saved:Date.now(),articles}));
    }catch(_){}
  },

  buildQuery(){
    if(this.query.trim()){
      const clean=this.query.trim().replace(/[()"]/g," ").replace(/\s+/g," ").slice(0,80);
      return `("${clean}") (aviation OR airline OR aircraft OR airport) sourcelang:english`;
    }
    return this.categories[this.category]||this.categories.latest;
  },

  apiUrl(query){
    const params=new URLSearchParams({
      query,
      mode:"artlist",
      maxrecords:"60",
      timespan:"3d",
      sort:"datedesc",
      format:"json"
    });
    return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
  },

  async fetchArticles(force=false){
    if(this.loading)return;
    this.loading=true;
    this.setLoading(true);

    const query=this.buildQuery();
    try{
      if(!force){
        const cached=this.readCache(query);
        if(cached){
          this.articles=this.cleanArticles(cached);
          this.render();
          this.setStatus(`${this.articles.length} stories · cached moments ago`);
          return;
        }
      }

      this.setStatus("Scanning the live aviation news index…");
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),12000);
      let response;
      try{
        response=await fetch(this.apiUrl(query),{
          signal:ctl.signal,
          cache:"no-store",
          headers:{Accept:"application/json"}
        });
      }finally{
        clearTimeout(timer);
      }

      if(!response.ok)throw new Error(`News service returned HTTP ${response.status}`);
      const data=await response.json();
      const rows=Array.isArray(data?.articles)?data.articles:
                 Array.isArray(data?.items)?data.items:[];
      this.articles=this.cleanArticles(rows);
      this.saveCache(query,this.articles);
      this.render();
      this.setStatus(`${this.articles.length} live stories · newest first`);
      this.loadedOnce=true;

    }catch(err){
      console.error("SKYHUNT News:",err);
      const message=/abort/i.test(String(err?.name||err?.message))
        ?"The aviation news request timed out."
        :"Aviation news is temporarily unavailable. Tap refresh to try again.";
      this.setStatus(message,true);
      if(!this.articles.length)this.renderEmpty(true);
    }finally{
      this.loading=false;
      this.setLoading(false);
    }
  },

  cleanArticles(rows){
    const seen=new Set();
    return rows.filter(row=>{
      if(!row||!row.title||!row.url)return false;
      const key=String(row.title).toLowerCase().replace(/\W/g,"").slice(0,100);
      if(!key||seen.has(key))return false;
      seen.add(key);
      return !!this.safeUrl(row.url);
    }).slice(0,40);
  },

  articleCard(article,index,lead=false){
    const title=this.esc(article.title||"Untitled story");
    const url=this.safeUrl(article.url);
    const image=this.safeUrl(article.socialimage||article.image||"");
    const domain=this.esc(this.domainLabel(article));
    const country=this.esc(article.sourcecountry||article.country||"");
    const age=this.esc(this.age(article.seendate||article.date));
    const meta=[domain,country,age].filter(Boolean).join(" · ");

    if(lead){
      return `<a class="newsLeadCard" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="newsLeadImage ${image?"":"noImage"}" ${image?`style="background-image:linear-gradient(180deg,transparent,rgba(7,13,18,.62)),url('${this.esc(image)}')"`:""}>
          ${image?"":'<div class="newsImageFallback">✈</div>'}
          <span class="newsBreaking">${this.age(article.seendate).includes("M AGO")||this.age(article.seendate).includes("H AGO")?"LATEST":"SKYWIRE"}</span>
        </div>
        <div class="newsLeadCopy">
          <div class="newsMeta">${meta}</div>
          <h3>${title}</h3>
          <span class="newsRead">READ ORIGINAL STORY <b>↗</b></span>
        </div>
      </a>`;
    }

    return `<a class="newsCard" href="${url}" target="_blank" rel="noopener noreferrer">
      <div class="newsCardImage ${image?"":"noImage"}" ${image?`style="background-image:url('${this.esc(image)}')"`:""}>
        ${image?"":'<span>✈</span>'}
      </div>
      <div class="newsCardBody">
        <div class="newsMeta">${meta}</div>
        <h4>${title}</h4>
        <div class="newsCardFoot"><span>${domain}</span><b>↗</b></div>
      </div>
    </a>`;
  },

  render(){
    const lead=document.querySelector("#newsLead");
    const grid=document.querySelector("#newsGrid");
    const empty=document.querySelector("#newsEmpty");
    const count=document.querySelector("#newsHeroCount");
    if(!lead||!grid||!empty)return;

    if(count)count.textContent=this.articles.length;

    if(!this.articles.length){
      lead.innerHTML="";
      grid.innerHTML="";
      empty.hidden=false;
      return;
    }

    empty.hidden=true;
    lead.innerHTML=this.articleCard(this.articles[0],0,true);
    grid.innerHTML=this.articles.slice(1).map((a,i)=>this.articleCard(a,i+1,false)).join("");
  },

  renderEmpty(error=false){
    const lead=document.querySelector("#newsLead");
    const grid=document.querySelector("#newsGrid");
    const empty=document.querySelector("#newsEmpty");
    if(lead)lead.innerHTML="";
    if(grid)grid.innerHTML="";
    if(empty){
      empty.hidden=false;
      const strong=empty.querySelector("strong");
      const span=empty.querySelector("span");
      if(strong)strong.textContent=error?"News feed unavailable.":"No stories found.";
      if(span)span.textContent=error?"Check your connection or try again shortly.":"Try another category or search phrase.";
    }
  },

  setStatus(text,error=false){
    const el=document.querySelector("#newsStatus");
    if(el)el.textContent=text;
    const bar=document.querySelector(".newsStatusBar");
    if(bar)bar.classList.toggle("error",!!error);
  },

  setLoading(loading){
    const btn=document.querySelector("#newsRefreshBtn");
    if(btn){
      btn.disabled=loading;
      btn.textContent=loading?"↻ LOADING…":"↻ REFRESH";
    }
    document.querySelector("#newsView")?.classList.toggle("newsLoading",loading);
  },

  activate(){
    if(!this.loadedOnce&&!this.loading)this.fetchArticles(false);
  },

  init(){
    document.querySelectorAll("[data-news-category]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        this.category=btn.dataset.newsCategory;
        this.query="";
        const input=document.querySelector("#newsSearchInput");
        if(input)input.value="";
        document.querySelectorAll("[data-news-category]").forEach(b=>b.classList.toggle("active",b===btn));
        this.fetchArticles(false);
      });
    });

    document.querySelector("#newsRefreshBtn")?.addEventListener("click",()=>this.fetchArticles(true));

    const input=document.querySelector("#newsSearchInput");
    if(input){
      let timer=null;
      input.addEventListener("input",()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{
          this.query=input.value.trim();
          if(this.query.length>=2||this.query.length===0)this.fetchArticles(false);
        },550);
      });
      input.addEventListener("keydown",e=>{
        if(e.key==="Enter"){
          e.preventDefault();
          clearTimeout(timer);
          this.query=input.value.trim();
          this.fetchArticles(true);
          input.blur();
        }
      });
    }
  }
};

window.SKYHUNT_NEWS=SKYHUNT_NEWS;
SKYHUNT_NEWS.init();

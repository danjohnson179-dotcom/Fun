/* SKYHUNT v1.2.2 — news.js
   Live aviation news via the GDELT DOC 2.0 API. */

const SKYHUNT_NEWS={
  category:"latest",
  query:"",
  articles:[],
  loading:false,
  loadedOnce:false,
  CACHE_MS:10*60*1000,

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

  apiUrl(query,{maxrecords=24,timespan="1d"}={}){
    const params=new URLSearchParams({
      query,
      mode:"artlist",
      maxrecords:String(maxrecords),
      timespan,
      sort:"datedesc",
      format:"json"
    });
    return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
  },

  jsonpAttempt(query,{maxrecords=24,timespan="1d",timeout=18000}={}){
    return new Promise((resolve,reject)=>{
      const callbackName=`__skyhuntGdelt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement("script");
      let finished=false;

      const cleanup=()=>{
        try{delete window[callbackName]}catch(_){window[callbackName]=undefined}
        if(script.parentNode)script.parentNode.removeChild(script);
      };

      const timer=setTimeout(()=>{
        if(finished)return;
        finished=true;
        cleanup();
        reject(new Error("JSONP timeout"));
      },timeout);

      window[callbackName]=(data)=>{
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        cleanup();

        const rows=Array.isArray(data?.articles)?data.articles:
                   Array.isArray(data?.items)?data.items:[];

        resolve(this.cleanArticles(rows));
      };

      script.onerror=()=>{
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        cleanup();
        reject(new Error("JSONP load failed"));
      };

      const params=new URLSearchParams({
        query,
        mode:"artlist",
        maxrecords:String(maxrecords),
        timespan,
        sort:"datedesc",
        format:"jsonp",
        callback:callbackName
      });

      script.src=`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
      script.async=true;
      document.head.appendChild(script);
    });
  },

  async fetchAttempt(query,{maxrecords=18,timespan="1d",timeout=18000}={}){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);

    try{
      const response=await fetch(this.apiUrl(query,{maxrecords,timespan}),{
        signal:ctl.signal,
        cache:"no-store",
        headers:{Accept:"application/json"}
      });

      if(!response.ok){
        throw new Error(`News service returned HTTP ${response.status}`);
      }

      const data=await response.json();
      const rows=Array.isArray(data?.articles)?data.articles:
                 Array.isArray(data?.items)?data.items:[];

      return this.cleanArticles(rows);
    }finally{
      clearTimeout(timer);
    }
  },

  async requestNews(query,options={}){
    // JSONP is primary because it is more reliable on iOS static-hosted pages.
    try{
      return await this.jsonpAttempt(query,options);
    }catch(jsonpError){
      console.warn("SKYHUNT News JSONP failed:",jsonpError);

      // Fall back to fetch if script transport fails.
      return await this.fetchAttempt(query,{
        maxrecords:Math.min(options.maxrecords||18,18),
        timespan:options.timespan||"1d",
        timeout:18000
      });
    }
  },

  fallbackQuery(){
    const category=this.category;
    if(this.query.trim()){
      const clean=this.query.trim().replace(/[()"]/g," ").replace(/\s+/g," ").slice(0,60);
      return `${clean} aviation sourcelang:english`;
    }

    const simple={
      latest:"aviation sourcelang:english",
      airlines:"airline sourcelang:english",
      airports:"airport sourcelang:english",
      aircraft:"aircraft sourcelang:english",
      safety:'"aviation safety" sourcelang:english'
    };

    return simple[category]||simple.latest;
  },

  async fetchArticles(force=false){
    if(this.loading)return;

    this.loading=true;
    this.setLoading(true);

    const query=this.buildQuery();
    const hadArticles=this.articles.length>0;

    try{
      if(!force){
        const cached=this.readCache(query);
        if(cached){
          this.articles=this.cleanArticles(cached);
          this.render();
          this.setStatus(`${this.articles.length} stories · cached moments ago`);
          this.loadedOnce=true;
          return;
        }
      }

      // Keep existing stories visible while refreshing.
      if(!hadArticles){
        this.setStatus("Scanning the latest aviation coverage…");
      }else{
        this.setStatus("Refreshing aviation coverage…");
      }

      let articles=[];
      let sourceNote="";

      // Attempt 1: focused query, smaller result set, recent window.
      try{
        articles=await this.requestNews(query,{
          maxrecords:24,
          timespan:"1d",
          timeout:18000
        });
        sourceNote="live";
      }catch(firstError){
        console.warn("SKYHUNT News primary request failed:",firstError);

        // Attempt 2: much simpler GDELT query. Complex OR expressions can be slower.
        this.setStatus("Trying a lighter aviation news search…");

        try{
          articles=await this.requestNews(this.fallbackQuery(),{
            maxrecords:18,
            timespan:"3d",
            timeout:20000
          });
          sourceNote="live · fallback search";
        }catch(secondError){
          console.warn("SKYHUNT News fallback request failed:",secondError);
          throw secondError;
        }
      }

      // A successful empty result should not look like a network failure.
      this.articles=articles;
      this.saveCache(query,articles);
      this.render();
      this.loadedOnce=true;

      this.setStatus(
        articles.length
          ? `${articles.length} ${sourceNote} stories · newest first`
          : "Live news search completed · no matching stories found"
      );

    }catch(err){
      console.error("SKYHUNT News:",err);

      const timeout=/abort/i.test(String(err?.name||err?.message));
      const message=timeout
        ?"The aviation news index is taking too long to respond."
        :"Aviation news is temporarily unavailable.";

      this.setStatus(
        hadArticles
          ? `${message} Showing your previously loaded stories.`
          : `${message} Tap refresh to try again.`,
        true
      );

      // Never wipe a working feed just because refresh failed.
      if(!hadArticles){
        this.renderEmpty(true);
      }

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
      if(span)span.textContent=error?"The external news index may be slow. Tap refresh to retry.":"Try another category or search phrase.";
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

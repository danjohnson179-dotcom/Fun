/* SKYHUNT v1.2.5 — news.js
   Skywire aviation news.
   Google News RSS + rss2json JSONP/fetch + AllOrigins RSS fallback. */

const SKYHUNT_NEWS={
  category:"latest",
  query:"",
  articles:[],
  loading:false,
  loadedOnce:false,
  CACHE_MS:10*60*1000,

  categories:{
    latest:"aviation OR airline OR aircraft OR airport",
    airlines:'airline OR airlines OR "commercial aviation"',
    airports:'airport OR airports OR runway OR "air traffic control"',
    aircraft:"aircraft OR Boeing OR Airbus OR Embraer",
    safety:'"aviation safety" OR "aircraft incident" OR "emergency landing"'
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

  extractImage(...values){
    for(const value of values){
      if(!value)continue;

      if(typeof value==="object"){
        const objectUrl=this.safeUrl(value.url||value.link||value.href||"");
        if(objectUrl)return objectUrl;
        continue;
      }

      const raw=String(value);

      const direct=this.safeUrl(raw);
      if(direct && /\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(direct)){
        return direct;
      }

      const img=raw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if(img){
        const found=this.safeUrl(img[1].replace(/&amp;/g,"&"));
        if(found)return found;
      }
    }
    return "";
  },

  age(value){
    if(!value)return "RECENT";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "RECENT";
    const seconds=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
    if(seconds<60)return "JUST NOW";
    if(seconds<3600)return `${Math.floor(seconds/60)}M AGO`;
    if(seconds<86400)return `${Math.floor(seconds/3600)}H AGO`;
    return `${Math.floor(seconds/86400)}D AGO`;
  },

  currentSearch(){
    if(this.query.trim()){
      return `${this.query.trim().replace(/\s+/g," ").slice(0,80)} aviation`;
    }
    return this.categories[this.category]||this.categories.latest;
  },

  googleFeedUrl(){
    const params=new URLSearchParams({
      q:this.currentSearch(),
      hl:"en-GB",
      gl:"GB",
      ceid:"GB:en"
    });
    return `https://news.google.com/rss/search?${params.toString()}`;
  },

  cacheKey(){
    return "skyhuntNewsV123:"+encodeURIComponent(`${this.category}|${this.query}`).slice(0,150);
  },

  readCache(){
    try{
      const raw=sessionStorage.getItem(this.cacheKey());
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed||Date.now()-parsed.saved>this.CACHE_MS)return null;
      return Array.isArray(parsed.articles)?parsed.articles:null;
    }catch(_){return null}
  },

  saveCache(articles){
    try{
      sessionStorage.setItem(this.cacheKey(),JSON.stringify({
        saved:Date.now(),
        articles
      }));
    }catch(_){}
  },

  normaliseRss2Json(items){
    const rows=(Array.isArray(items)?items:[]).map(item=>{
      const title=String(item.title||"").trim();
      const url=this.safeUrl(item.link||item.url||"");
      const date=item.pubDate||item.publishedAt||"";
      let publisher="";
      const match=title.match(/\s-\s([^-]{2,80})$/);
      if(match)publisher=match[1].trim();

      return {
        title,
        url,
        domain:publisher||"Google News",
        sourcecountry:"",
        seendate:date,
        socialimage:this.extractImage(
          item.thumbnail,
          item.enclosure,
          item.image,
          item.description,
          item.content
        )
      };
    });

    return this.cleanArticles(rows);
  },

  cleanArticles(rows){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(row=>{
      if(!row||!row.title||!row.url)return false;
      const url=this.safeUrl(row.url);
      if(!url)return false;
      row.url=url;
      const key=String(row.title).toLowerCase().replace(/\W/g,"").slice(0,120);
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    }).slice(0,40);
  },

  rss2jsonJsonp(feedUrl,timeout=12000){
    return new Promise((resolve,reject)=>{
      const callback=`__skyhunt_rss_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement("script");
      let done=false;

      const cleanup=()=>{
        clearTimeout(timer);
        try{delete window[callback]}catch(_){window[callback]=undefined}
        script.remove();
      };

      const timer=setTimeout(()=>{
        if(done)return;
        done=true;
        cleanup();
        reject(new Error("rss2json JSONP timeout"));
      },timeout);

      window[callback]=(data)=>{
        if(done)return;
        done=true;
        cleanup();

        if(!data||data.status!=="ok"){
          reject(new Error(data?.message||"rss2json JSONP failed"));
          return;
        }

        resolve(this.normaliseRss2Json(data.items));
      };

      script.onerror=()=>{
        if(done)return;
        done=true;
        cleanup();
        reject(new Error("rss2json JSONP network error"));
      };

      const endpoint=new URL("https://api.rss2json.com/v1/api.json");
      endpoint.searchParams.set("rss_url",feedUrl);
      endpoint.searchParams.set("callback",callback);
      script.src=endpoint.href;
      script.async=true;
      document.head.appendChild(script);
    });
  },

  async rss2jsonFetch(feedUrl,timeout=12000){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);

    try{
      const endpoint=new URL("https://api.rss2json.com/v1/api.json");
      endpoint.searchParams.set("rss_url",feedUrl);

      const response=await fetch(endpoint.href,{
        signal:ctl.signal,
        cache:"no-store",
        headers:{Accept:"application/json"}
      });

      if(!response.ok)throw new Error(`rss2json HTTP ${response.status}`);
      const data=await response.json();
      if(!data||data.status!=="ok")throw new Error(data?.message||"rss2json failed");
      return this.normaliseRss2Json(data.items);
    }finally{
      clearTimeout(timer);
    }
  },

  parseRssXml(xml){
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.querySelector("parsererror"))throw new Error("RSS XML parse failed");

    const rows=[...doc.querySelectorAll("item")].map(item=>{
      const text=(tag)=>item.querySelector(tag)?.textContent?.trim()||"";
      const title=text("title");
      const url=this.safeUrl(text("link"));
      const pubDate=text("pubDate");
      const sourceNode=item.querySelector("source");
      const publisher=sourceNode?.textContent?.trim()||"Google News";
      const description=text("description");
      const enclosure=item.querySelector("enclosure");
      const mediaContent=item.getElementsByTagName("media:content")[0];
      const mediaThumb=item.getElementsByTagName("media:thumbnail")[0];

      const socialimage=this.extractImage(
        enclosure?.getAttribute("url"),
        mediaContent?.getAttribute("url"),
        mediaThumb?.getAttribute("url"),
        description
      );

      return {
        title,
        url,
        domain:publisher,
        sourcecountry:"",
        seendate:pubDate,
        socialimage
      };
    });

    return this.cleanArticles(rows);
  },

  async allOriginsFetch(feedUrl,timeout=14000){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);

    try{
      const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;
      const response=await fetch(proxy,{
        signal:ctl.signal,
        cache:"no-store"
      });

      if(!response.ok)throw new Error(`AllOrigins HTTP ${response.status}`);
      const xml=await response.text();
      return this.parseRssXml(xml);
    }finally{
      clearTimeout(timer);
    }
  },

  async loadFeed(){
    const feedUrl=this.googleFeedUrl();
    const errors=[];

    // 1. JSONP: best chance on Safari because it avoids CORS entirely.
    try{
      const rows=await this.rss2jsonJsonp(feedUrl,12000);
      if(rows.length)return {rows,source:"Google News · JSONP"};
      errors.push("JSONP returned no stories");
    }catch(e){
      console.warn("Skywire JSONP failed",e);
      errors.push(String(e.message||e));
    }

    // 2. Direct JSON conversion.
    try{
      const rows=await this.rss2jsonFetch(feedUrl,12000);
      if(rows.length)return {rows,source:"Google News · RSS"};
      errors.push("rss2json returned no stories");
    }catch(e){
      console.warn("Skywire rss2json fetch failed",e);
      errors.push(String(e.message||e));
    }

    // 3. Raw RSS through an independent CORS proxy.
    try{
      const rows=await this.allOriginsFetch(feedUrl,14000);
      if(rows.length)return {rows,source:"Google News · fallback"};
      errors.push("RSS fallback returned no stories");
    }catch(e){
      console.warn("Skywire AllOrigins fallback failed",e);
      errors.push(String(e.message||e));
    }

    throw new Error(errors.join(" | "));
  },

  async fetchArticles(force=false){
    if(this.loading)return;
    this.loading=true;
    this.setLoading(true);

    const hadArticles=this.articles.length>0;

    try{
      if(!force){
        const cached=this.readCache();
        if(cached?.length){
          this.articles=this.cleanArticles(cached);
          this.render();
          this.loadedOnce=true;
          this.setStatus(`${this.articles.length} stories · cached`);
          this.enrichImages();
          return;
        }
      }

      this.setStatus(hadArticles?"Refreshing aviation coverage…":"Loading aviation news…");

      const result=await this.loadFeed();
      this.articles=result.rows;
      this.saveCache(this.articles);
      this.render();
      this.loadedOnce=true;
      this.setStatus(`${this.articles.length} stories · ${result.source}`);
      this.enrichImages();

    }catch(err){
      console.error("Skywire could not load news",err);
      this.setStatus(
        hadArticles
          ?"Live refresh failed · showing your previously loaded stories."
          :"All live news sources are temporarily unavailable. Tap refresh to retry.",
        true
      );

      if(!hadArticles)this.renderEmpty(true);

    }finally{
      this.loading=false;
      this.setLoading(false);
    }
  },

  domainLabel(article){
    return String(article.domain||"Google News").replace(/^www\./,"");
  },

  articleCard(article,index,lead=false){
    const title=this.esc(article.title||"Untitled story");
    const url=this.safeUrl(article.url);
    const image=this.safeUrl(article.socialimage||article.image||"");
    const domain=this.esc(this.domainLabel(article));
    const age=this.esc(this.age(article.seendate||article.date));
    const meta=[domain,age].filter(Boolean).join(" · ");

    if(lead){
      return `<a class="newsLeadCard" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="newsLeadImage ${image?"":"noImage"}" ${image?`style="background-image:linear-gradient(180deg,transparent,rgba(7,13,18,.62)),url('${this.esc(image)}')"`:""}>
          ${image?"":'<div class="newsImageFallback">✈</div>'}
          <span class="newsBreaking">LATEST</span>
        </div>
        <div class="newsLeadCopy">
          <div class="newsMeta">${meta}</div>
          <h3>${title}</h3>
          <span class="newsRead">READ STORY <b>↗</b></span>
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

  async fetchArticleImage(article){
    if(article.socialimage)return article.socialimage;

    const target=this.safeUrl(article.url);
    if(!target)return "";

    try{
      const endpoint=new URL("https://api.microlink.io/");
      endpoint.searchParams.set("url",target);
      endpoint.searchParams.set("filter","image.url");

      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),9000);

      try{
        const response=await fetch(endpoint.href,{
          signal:ctl.signal,
          cache:"force-cache",
          headers:{Accept:"application/json"}
        });

        if(!response.ok)return "";

        const payload=await response.json();
        const image=this.safeUrl(
          payload?.data?.image?.url ||
          payload?.data?.image ||
          ""
        );

        return image;
      }finally{
        clearTimeout(timer);
      }
    }catch(err){
      console.warn("Skywire image metadata unavailable",err);
      return "";
    }
  },

  async enrichImages(){
    // Keep this deliberately small so the free metadata endpoint is not hammered.
    const candidates=this.articles
      .map((article,index)=>({article,index}))
      .filter(({article})=>!article.socialimage)
      .slice(0,8);

    if(!candidates.length)return;

    // Two at a time keeps mobile/network load restrained.
    for(let i=0;i<candidates.length;i+=2){
      const batch=candidates.slice(i,i+2);

      const results=await Promise.all(
        batch.map(async ({article,index})=>({
          index,
          image:await this.fetchArticleImage(article)
        }))
      );

      let changed=false;

      results.forEach(({index,image})=>{
        if(image && this.articles[index] && !this.articles[index].socialimage){
          this.articles[index].socialimage=image;
          changed=true;
        }
      });

      if(changed){
        this.saveCache(this.articles);
        this.render();
      }
    }
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
    const count=document.querySelector("#newsHeroCount");

    if(lead)lead.innerHTML="";
    if(grid)grid.innerHTML="";
    if(count)count.textContent="0";

    if(empty){
      empty.hidden=false;
      const strong=empty.querySelector("strong");
      const span=empty.querySelector("span");
      if(strong)strong.textContent=error?"News feed unavailable.":"No stories found.";
      if(span)span.textContent=error
        ?"Skywire tried all three feed routes. Tap refresh to try again."
        :"Try another category or search phrase.";
    }
  },

  setStatus(text,error=false){
    const el=document.querySelector("#newsStatus");
    if(el)el.textContent=text;
    document.querySelector(".newsStatusBar")?.classList.toggle("error",!!error);
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
        this.category=btn.dataset.newsCategory||"latest";
        this.query="";

        const input=document.querySelector("#newsSearchInput");
        if(input)input.value="";

        document.querySelectorAll("[data-news-category]").forEach(b=>{
          b.classList.toggle("active",b===btn);
        });

        this.fetchArticles(true);
      });
    });

    document.querySelector("#newsRefreshBtn")?.addEventListener("click",()=>{
      this.fetchArticles(true);
    });

    const input=document.querySelector("#newsSearchInput");
    if(input){
      let timer=null;

      input.addEventListener("input",()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{
          this.query=input.value.trim();
          if(this.query.length>=2||this.query.length===0){
            this.fetchArticles(true);
          }
        },650);
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

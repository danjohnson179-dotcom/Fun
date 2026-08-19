/* SKYHUNT v5.3.0 — legal.js */
// ===== v5.2.5 — TERMS / PRIVACY / DATA / SAFETY =====
const firstRunGate=$("#firstRunGate"),acceptTermsBtn=$("#acceptTermsBtn"),readTermsBtn=$("#readTermsBtn");
const legalBackdrop=$("#legalBackdrop"),legalClose=$("#legalClose"),legalTitle=$("#legalTitle"),legalContent=$("#legalContent");
const termsLink=$("#termsLink"),privacyLink=$("#privacyLink"),sourcesLink=$("#sourcesLink"),safetyLink=$("#safetyLink");
const SKYHUNT_TERMS_KEY="skyhuntTermsAccepted_v4_demo";

const LEGAL_DOCS={
terms:{
 title:"Terms of Use",
 html:`
 <div class="legalSection"><h3>1. What SKYHUNT is</h3><p>SKYHUNT is an entertainment, discovery and educational web application that displays and derives information from public or third-party aviation data. It is not an air-navigation, air-traffic-control, emergency, operational or safety system.</p></div>
 <div class="legalSection"><h3>2. No operational reliance</h3><p>Do not rely on SKYHUNT to navigate, operate, dispatch, intercept, identify, avoid or make safety decisions concerning any aircraft. Data may be delayed, incomplete, inaccurate, unavailable or misidentified.</p></div>
 <div class="legalSection"><h3>3. Availability</h3><p>SKYHUNT is provided on an “as available” basis. Features may stop working because of browser restrictions, device permissions, network conditions, third-party service changes, API limits or outages.</p></div>
 <div class="legalSection"><h3>4. Acceptable use</h3><p>Use SKYHUNT only for lawful discovery, entertainment and educational purposes. Do not use it to harass, stalk, threaten, interfere with aviation operations, facilitate unlawful activity, bypass service limits or overload connected services.</p></div>
 <div class="legalSection"><h3>5. Collector features</h3><p>Hangar cards, rarity labels, levels and collection mechanics are SKYHUNT game features. They are not official aviation classifications and do not imply ownership of, affiliation with or rights in an aircraft.</p></div>
 <div class="legalSection"><h3>6. Third-party data</h3><p>SKYHUNT relies on third-party aircraft-data and mapping services. Their availability, licensing and terms are separate from SKYHUNT and may change.</p></div>
 <div class="legalSection"><h3>7. Demo status</h3><p>This build is a SKYHUNTnstration. Before commercial use, data-provider licensing, hosting, legal terms, privacy obligations and infrastructure should be reviewed for the intended deployment.</p></div>`
},
privacy:{
 title:"Privacy & Data Notice",
 html:`
 <div class="legalSection"><h3>Browser storage</h3><p>SKYHUNT stores your Hangar, collection progress and acceptance of these terms in your browser using localStorage. This data is local to the browser/device unless a future account service is introduced.</p></div>
 <div class="legalSection"><h3>Location</h3><p>Nearby and Sky Lens request location only after you choose to start them. Coordinates are used to request nearby aircraft from connected live-data services. SKYHUNT does not intentionally add your personal location to Hangar cards.</p></div>
 <div class="legalSection"><h3>Camera & orientation</h3><p>Sky Lens may request camera and device-orientation access. The camera stream is displayed locally in the browser and is not intentionally recorded or uploaded by SKYHUNT. Device orientation is used to estimate target direction.</p></div>
 <div class="legalSection"><h3>Third parties</h3><p>Aircraft-data providers, map-tile providers and other third-party services can receive ordinary technical request data such as IP address, user agent and requested coordinates as part of normal internet requests.</p></div>
 <div class="legalSection"><h3>Accounts</h3><p>This demo does not require a SKYHUNT account and does not intentionally collect passwords or payment-card details.</p></div>`
},
sources:{
 title:"Data & Sources",
 html:`
 <div class="legalSection"><h3>Live aircraft data</h3><p>SKYHUNT uses open live ADS-B/MLAT aircraft data. adsb.lol is used as a primary feed in the current build. Airplanes.live is retained as a fallback in selected demo features.</p></div>
 <div class="legalSection"><h3>Maps</h3><p>Interactive maps use Leaflet and OpenStreetMap tiles/attribution in the current demo.</p></div>
 <div class="legalSection"><h3>What the data means</h3><p>Aircraft fields are shown only when returned by the connected feed where practical. Coverage depends on receivers, aircraft broadcasts, MLAT availability and the upstream service. “Live” does not mean zero-delay or guaranteed completeness.</p></div>
 <div class="legalSection"><h3>AI Finder</h3><p>AI Finder currently uses a local natural-language query parser rather than a generative AI service. It searches sampled live aircraft data and does not invent a target when no match is found.</p></div>
 <div class="legalSection"><h3>Game rarity</h3><p>Common, Uncommon, Rare and Ultra Rare labels are SKYHUNT gameplay classifications, not authoritative measures of worldwide aircraft rarity.</p></div>`
},
safety:{
 title:"Safety Notice",
 html:`
 <div class="legalSection"><h3>Do not use while driving or operating equipment</h3><p>Do not interact with SKYHUNT, maps or Sky Lens while driving, cycling, operating machinery or doing anything that requires your full attention.</p></div>
 <div class="legalSection"><h3>Sky Lens</h3><p>Sky Lens is experimental approximate AR. Phone compass drift, pitch estimation, camera field-of-view assumptions, ADS-B latency and coverage can place labels away from the aircraft you can actually see.</p></div>
 <div class="legalSection"><h3>Respect people and property</h3><p>Do not trespass, enter restricted areas, obstruct roads, airports or emergency access, or use SKYHUNT to target or harass individuals.</p></div>
 <div class="legalSection"><h3>Emergency information</h3><p>SKYHUNT is not an emergency information source. Follow official authorities and aviation services for safety-critical information.</p></div>`
}
};

function openLegal(which){
  const d=LEGAL_DOCS[which]||LEGAL_DOCS.terms;
  legalTitle.textContent=d.title;
  legalContent.innerHTML=d.html;
  legalBackdrop.classList.add("show");
  legalBackdrop.setAttribute("aria-hidden","false");
}
function closeLegal(){
  legalBackdrop.classList.remove("show");
  legalBackdrop.setAttribute("aria-hidden","true");
}
termsLink.addEventListener("click",()=>openLegal("terms"));
privacyLink.addEventListener("click",()=>openLegal("privacy"));
sourcesLink.addEventListener("click",()=>openLegal("sources"));
safetyLink.addEventListener("click",()=>openLegal("safety"));
readTermsBtn.addEventListener("click",()=>openLegal("terms"));
legalClose.addEventListener("click",closeLegal);
legalBackdrop.addEventListener("click",e=>{if(e.target===legalBackdrop)closeLegal()});
acceptTermsBtn.addEventListener("click",()=>{
  localStorage.setItem(SKYHUNT_TERMS_KEY,new Date().toISOString());
  firstRunGate.classList.remove("show");
  firstRunGate.setAttribute("aria-hidden","true");
});
if(!localStorage.getItem(SKYHUNT_TERMS_KEY)){
  firstRunGate.classList.add("show");
  firstRunGate.setAttribute("aria-hidden","false");
}

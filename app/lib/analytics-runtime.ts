import { analyticsConsentKey,readAnalyticsConsent,writeAnalyticsConsent,analyticsRoute,ownedAnalyticsCookie,type AnalyticsConfig,type AnalyticsChoice,type AnalyticsAction } from './analytics-consent';
type AnalyticsWindow=Window & {dataLayer?:unknown[];gtag?:(...args:unknown[])=>void;[key:string]:unknown};
export class HubAnalytics {
  private win:AnalyticsWindow;
  private route:ReturnType<typeof analyticsRoute>=null;
  private ready=false;private starting=false;private generation=0;private lastPage:string|null=null;
  private script:HTMLScriptElement|null=null;
  private ownTag:((...args:unknown[])=>void)|undefined;
  private choice:AnalyticsChoice='unknown';
  private storageAvailable=false;
  private blocked=true;
  constructor(private config:AnalyticsConfig,win:Window,private changed:(choice:AnalyticsChoice,available:boolean)=>void) {
    this.win=win as AnalyticsWindow;
    // The loaded SDK's own automatic sends also consult Google's documented opt-out flag.
    // Recheck local consent/context at read time, not only when a React handler runs.
    if(config.measurementId)Object.defineProperty(this.win,`ga-disable-${config.measurementId}`,{
      configurable:true,get:()=>this.blocked||!this.permitted(),set:value=>{this.blocked=value===true;}
    });
    this.sync();
  }
  private storage(){return this.win.localStorage;}
  private permitted() {
    if(!this.config.enabled||!this.config.measurementId||!this.route||this.choice!=='granted'||!this.storageAvailable)return false;
    try{
      if(this.win.location && (this.win.self!==this.win.top || analyticsRoute(this.win.location.href)?.path!==this.route.path))return false;
      return readAnalyticsConsent(this.storage()).choice==='granted';
    }catch{return false;}
  }
  sync() {
    let result:{choice:AnalyticsChoice;available:boolean};
    try{result=readAnalyticsConsent(this.storage());}catch{result={choice:'unknown',available:false};}
    this.choice=result.choice;this.storageAvailable=result.available;this.changed(this.choice,this.storageAvailable);
    if(!this.permitted())this.stop();else this.start();
  }
  choose(choice:Exclude<AnalyticsChoice,'unknown'>) {
    // Blocking happens before a failing persistence operation could leave a stale grant.
    if(choice!=='granted')this.stop();
    let saved=false;try{saved=writeAnalyticsConsent(this.storage(),choice);}catch{/* fail closed */}
    this.choice=saved?choice:'unknown';this.storageAvailable=saved;
    if(!saved){try{this.storage().removeItem(analyticsConsentKey);}catch{/* current visit still blocked */}}
    this.changed(this.choice,this.storageAvailable);
    if(this.permitted())this.start();else this.stop();
  }
  navigate(href:string,embedded=false) {
    this.route=analyticsRoute(href,embedded);
    if(!this.permitted()){this.stop();return;}
    if(this.ready)this.page();else this.start();
  }
  private start() {
    if(!this.permitted()||this.ready||this.starting)return;
    this.starting=true;const generation=++this.generation,id=this.config.measurementId!;
    this.win[`ga-disable-${id}`]=false;
    this.win.dataLayer=[];
    // Only configuration is queued; no pre-consent or loading-time interaction queue exists.
    const tag=(...args:unknown[])=>{if(this.permitted())this.win.dataLayer!.push(args);};
    this.ownTag=tag;this.win.gtag=tag;
    tag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    tag('set',{allow_google_signals:false,allow_ad_personalization_signals:false,ads_data_redaction:true,url_passthrough:false});
    tag('js',new Date());
    tag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,
      cookie_prefix:'aaw_hub',cookie_domain:'none',cookie_path:'/',cookie_flags:'SameSite=Lax;Secure',
      page_location:this.route!.location,page_title:this.route!.title,page_referrer:''});
    const script=this.win.document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${id}`;
    script.dataset.hubAnalytics='true';this.script=script;
    script.onload=()=>{if(generation!==this.generation)return;if(!this.permitted()){this.stop();return;}this.starting=false;this.ready=true;this.page();};
    script.onerror=()=>{if(generation===this.generation)this.stop();};
    this.win.document.head.appendChild(script);
  }
  private page() {
    if(!this.ready||!this.permitted()||!this.route)return;
    if(this.lastPage===this.route.path)return;
    this.lastPage=this.route.path;
    this.win.gtag?.('event','page_view',{send_to:this.config.measurementId,page_location:this.route.location,page_title:this.route.title,page_referrer:'',league:this.route.league,section:this.route.section});
  }
  action(name:AnalyticsAction) {
    if(!this.ready||!this.permitted()||!this.route){if(!this.permitted())this.stop();return;}
    // Closed payload whitelist: callers cannot pass game IDs, tier/team values or participant data.
    if(!['tier_interaction','favourite_interaction','preferences_open','feature_navigation'].includes(name))return;
    this.win.gtag?.('event',name,{send_to:this.config.measurementId,page_location:this.route.location,page_title:this.route.title,page_referrer:'',league:this.route.league,section:this.route.section});
  }
  stop() {
    this.generation++;this.ready=false;this.starting=false;this.lastPage=null;
    if(this.config.measurementId)this.win[`ga-disable-${this.config.measurementId}`]=true;
    this.script?.remove();this.script=null;
    // The already executed tag cannot be unloaded; disable it and discard unsent commands.
    if(this.ownTag){this.win.dataLayer=[];this.win.gtag=()=>{};}
    try {
      for(const part of this.win.document.cookie.split(';')) {
        const name=part.trim().split('=')[0];
        if(ownedAnalyticsCookie(name))this.win.document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      }
      for(const storage of [this.win.localStorage,this.win.sessionStorage]) {
        for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('aaw_hub_ga'))storage.removeItem(key);}
      }
    } catch { /* Browser/HttpOnly/third-party restrictions are not a deletion guarantee. */ }
  }
}

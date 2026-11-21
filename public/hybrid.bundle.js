var wt=()=>{};var At=function(e){let t=[],n=0;for(let s=0;s<e.length;s++){let o=e.charCodeAt(s);o<128?t[n++]=o:o<2048?(t[n++]=o>>6|192,t[n++]=o&63|128):(o&64512)===55296&&s+1<e.length&&(e.charCodeAt(s+1)&64512)===56320?(o=65536+((o&1023)<<10)+(e.charCodeAt(++s)&1023),t[n++]=o>>18|240,t[n++]=o>>12&63|128,t[n++]=o>>6&63|128,t[n++]=o&63|128):(t[n++]=o>>12|224,t[n++]=o>>6&63|128,t[n++]=o&63|128)}return t},Bn=function(e){let t=[],n=0,s=0;for(;n<e.length;){let o=e[n++];if(o<128)t[s++]=String.fromCharCode(o);else if(o>191&&o<224){let i=e[n++];t[s++]=String.fromCharCode((o&31)<<6|i&63)}else if(o>239&&o<365){let i=e[n++],r=e[n++],a=e[n++],c=((o&7)<<18|(i&63)<<12|(r&63)<<6|a&63)-65536;t[s++]=String.fromCharCode(55296+(c>>10)),t[s++]=String.fromCharCode(56320+(c&1023))}else{let i=e[n++],r=e[n++];t[s++]=String.fromCharCode((o&15)<<12|(i&63)<<6|r&63)}}return t.join("")},le={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(e,t){if(!Array.isArray(e))throw Error("encodeByteArray takes an array as a parameter");this.init_();let n=t?this.byteToCharMapWebSafe_:this.byteToCharMap_,s=[];for(let o=0;o<e.length;o+=3){let i=e[o],r=o+1<e.length,a=r?e[o+1]:0,c=o+2<e.length,l=c?e[o+2]:0,h=i>>2,m=(i&3)<<4|a>>4,p=(a&15)<<2|l>>6,T=l&63;c||(T=64,r||(p=64)),s.push(n[h],n[m],n[p],n[T])}return s.join("")},encodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?btoa(e):this.encodeByteArray(At(e),t)},decodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?atob(e):Bn(this.decodeStringToByteArray(e,t))},decodeStringToByteArray(e,t){this.init_();let n=t?this.charToByteMapWebSafe_:this.charToByteMap_,s=[];for(let o=0;o<e.length;){let i=n[e.charAt(o++)],a=o<e.length?n[e.charAt(o)]:0;++o;let l=o<e.length?n[e.charAt(o)]:64;++o;let m=o<e.length?n[e.charAt(o)]:64;if(++o,i==null||a==null||l==null||m==null)throw new Re;let p=i<<2|a>>4;if(s.push(p),l!==64){let T=a<<4&240|l>>2;if(s.push(T),m!==64){let C=l<<6&192|m;s.push(C)}}}return s},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let e=0;e<this.ENCODED_VALS.length;e++)this.byteToCharMap_[e]=this.ENCODED_VALS.charAt(e),this.charToByteMap_[this.byteToCharMap_[e]]=e,this.byteToCharMapWebSafe_[e]=this.ENCODED_VALS_WEBSAFE.charAt(e),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[e]]=e,e>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(e)]=e,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(e)]=e)}}},Re=class extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}},Fn=function(e){let t=At(e);return le.encodeByteArray(t,!0)},Ie=function(e){return Fn(e).replace(/\./g,"")},St=function(e){try{return le.decodeString(e,!0)}catch(t){console.error("base64Decode failed: ",t)}return null};function q(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}var $n=()=>q().__FIREBASE_DEFAULTS__,Hn=()=>{if(typeof process>"u"||typeof process.env>"u")return;let e=process.env.__FIREBASE_DEFAULTS__;if(e)return JSON.parse(e)},Gn=()=>{if(typeof document>"u")return;let e;try{e=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}let t=e&&St(e[1]);return t&&JSON.parse(t)},Vn=()=>{try{return wt()||$n()||Hn()||Gn()}catch(e){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${e}`);return}};var ve=()=>Vn()?.config;var R=class{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((t,n)=>{this.resolve=t,this.reject=n})}wrapCallback(t){return(n,s)=>{n?this.reject(n):this.resolve(s),typeof t=="function"&&(this.promise.catch(()=>{}),t.length===1?t(n):t(n,s))}}};function J(){try{return typeof indexedDB=="object"}catch{return!1}}function Ct(){return new Promise((e,t)=>{try{let n=!0,s="validate-browser-context-for-indexeddb-analytics-module",o=self.indexedDB.open(s);o.onsuccess=()=>{o.result.close(),n||self.indexedDB.deleteDatabase(s),e(!0)},o.onupgradeneeded=()=>{n=!1},o.onerror=()=>{t(o.error?.message||"")}}catch(n){t(n)}})}var jn="FirebaseError",D=class e extends Error{constructor(t,n,s){super(n),this.code=t,this.customData=s,this.name=jn,Object.setPrototypeOf(this,e.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,$.prototype.create)}},$=class{constructor(t,n,s){this.service=t,this.serviceName=n,this.errors=s}create(t,...n){let s=n[0]||{},o=`${this.service}/${t}`,i=this.errors[t],r=i?Wn(i,s):"Error",a=`${this.serviceName}: ${r} (${o}).`;return new D(o,a,s)}};function Wn(e,t){try{let n=0,s="";for(;n<e.length;){let o=e.indexOf("{$",n);if(o===-1){s+=e.substring(n);break}let i=e.indexOf("}",o+2);if(i===-1){s+=e.substring(n);break}let r=e.substring(o+2,i),a=t[r];s+=e.substring(n,o)+(a!=null?String(a):`<${r}?>`),n=i+1}return s}catch{return e}}function de(e,t){if(e===t)return!0;let n=Object.keys(e),s=Object.keys(t);for(let o of n){if(!s.includes(o))return!1;let i=e[o],r=t[o];if(yt(i)&&yt(r)){if(!de(i,r))return!1}else if(i!==r)return!1}for(let o of s)if(!n.includes(o))return!1;return!0}function yt(e){return e!==null&&typeof e=="object"}var Kn=1e3,zn=2,Yn=14400*1e3,qn=.5;function Ot(e,t=Kn,n=zn){let s=t*Math.pow(n,e),o=Math.round(qn*s*(Math.random()-.5)*2);return Math.min(Yn,s+o)}function ue(e){return e&&e._delegate?e._delegate:e}var O=class{constructor(t,n,s){this.name=t,this.instanceFactory=n,this.type=s,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(t){return this.instantiationMode=t,this}setMultipleInstances(t){return this.multipleInstances=t,this}setServiceProps(t){return this.serviceProps=t,this}setInstanceCreatedCallback(t){return this.onInstanceCreated=t,this}};var H="[DEFAULT]";var ke=class{constructor(t,n){this.name=t,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(t){let n=this.normalizeInstanceIdentifier(t);if(!this.instancesDeferred.has(n)){let s=new R;if(this.instancesDeferred.set(n,s),this.isInitialized(n)||this.shouldAutoInitialize())try{let o=this.getOrInitializeService({instanceIdentifier:n});o&&s.resolve(o)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(t){let n=this.normalizeInstanceIdentifier(t?.identifier),s=t?.optional??!1;if(this.isInitialized(n)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:n})}catch(o){if(s)return null;throw o}else{if(s)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(t){if(t.name!==this.name)throw Error(`Mismatching Component ${t.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=t,!!this.shouldAutoInitialize()){if(Xn(t))try{this.getOrInitializeService({instanceIdentifier:H})}catch{}for(let[n,s]of this.instancesDeferred.entries()){let o=this.normalizeInstanceIdentifier(n);try{let i=this.getOrInitializeService({instanceIdentifier:o});s.resolve(i)}catch{}}}}clearInstance(t=H){this.instancesDeferred.delete(t),this.instancesOptions.delete(t),this.instances.delete(t)}async delete(){let t=Array.from(this.instances.values());await Promise.all([...t.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...t.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(t=H){return this.instances.has(t)}getOptions(t=H){return this.instancesOptions.get(t)||{}}initialize(t={}){let{options:n={}}=t,s=this.normalizeInstanceIdentifier(t.instanceIdentifier);if(this.isInitialized(s))throw Error(`${this.name}(${s}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);let o=this.getOrInitializeService({instanceIdentifier:s,options:n});for(let[i,r]of this.instancesDeferred.entries()){let a=this.normalizeInstanceIdentifier(i);s===a&&r.resolve(o)}return o}onInit(t,n){let s=this.normalizeInstanceIdentifier(n),o=this.onInitCallbacks.get(s)??new Set;o.add(t),this.onInitCallbacks.set(s,o);let i=this.instances.get(s);return i&&t(i,s),()=>{o.delete(t)}}invokeOnInitCallbacks(t,n){let s=this.onInitCallbacks.get(n);if(s)for(let o of s)try{o(t,n)}catch{}}getOrInitializeService({instanceIdentifier:t,options:n={}}){let s=this.instances.get(t);if(!s&&this.component&&(s=this.component.instanceFactory(this.container,{instanceIdentifier:Jn(t),options:n}),this.instances.set(t,s),this.instancesOptions.set(t,n),this.invokeOnInitCallbacks(s,t),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,t,s)}catch{}return s||null}normalizeInstanceIdentifier(t=H){return this.component?this.component.multipleInstances?t:H:t}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}};function Jn(e){return e===H?void 0:e}function Xn(e){return e.instantiationMode==="EAGER"}var he=class{constructor(t){this.name=t,this.providers=new Map}addComponent(t){let n=this.getProvider(t.name);if(n.isComponentSet())throw new Error(`Component ${t.name} has already been registered with ${this.name}`);n.setComponent(t)}addOrOverwriteComponent(t){this.getProvider(t.name).isComponentSet()&&this.providers.delete(t.name),this.addComponent(t)}getProvider(t){if(this.providers.has(t))return this.providers.get(t);let n=new ke(t,this);return this.providers.set(t,n),n}getProviders(){return Array.from(this.providers.values())}};var Qn=[],g;(function(e){e[e.DEBUG=0]="DEBUG",e[e.VERBOSE=1]="VERBOSE",e[e.INFO=2]="INFO",e[e.WARN=3]="WARN",e[e.ERROR=4]="ERROR",e[e.SILENT=5]="SILENT"})(g||(g={}));var Zn={debug:g.DEBUG,verbose:g.VERBOSE,info:g.INFO,warn:g.WARN,error:g.ERROR,silent:g.SILENT},es=g.INFO,ts={[g.DEBUG]:"log",[g.VERBOSE]:"log",[g.INFO]:"info",[g.WARN]:"warn",[g.ERROR]:"error"},ns=(e,t,...n)=>{if(t<e.logLevel)return;let s=new Date().toISOString(),o=ts[t];if(o)console[o](`[${s}]  ${e.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${t})`)},M=class{constructor(t){this.name=t,this._logLevel=es,this._logHandler=ns,this._userLogHandler=null,Qn.push(this)}get logLevel(){return this._logLevel}set logLevel(t){if(!(t in g))throw new TypeError(`Invalid value "${t}" assigned to \`logLevel\``);this._logLevel=t}setLogLevel(t){this._logLevel=typeof t=="string"?Zn[t]:t}get logHandler(){return this._logHandler}set logHandler(t){if(typeof t!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=t}get userLogHandler(){return this._userLogHandler}set userLogHandler(t){this._userLogHandler=t}debug(...t){this._userLogHandler&&this._userLogHandler(this,g.DEBUG,...t),this._logHandler(this,g.DEBUG,...t)}log(...t){this._userLogHandler&&this._userLogHandler(this,g.VERBOSE,...t),this._logHandler(this,g.VERBOSE,...t)}info(...t){this._userLogHandler&&this._userLogHandler(this,g.INFO,...t),this._logHandler(this,g.INFO,...t)}warn(...t){this._userLogHandler&&this._userLogHandler(this,g.WARN,...t),this._logHandler(this,g.WARN,...t)}error(...t){this._userLogHandler&&this._userLogHandler(this,g.ERROR,...t),this._logHandler(this,g.ERROR,...t)}};var ss=(e,t)=>t.some(n=>e instanceof n),Tt,Rt;function os(){return Tt||(Tt=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function is(){return Rt||(Rt=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}var It=new WeakMap,Ne=new WeakMap,vt=new WeakMap,De=new WeakMap,Pe=new WeakMap;function rs(e){let t=new Promise((n,s)=>{let o=()=>{e.removeEventListener("success",i),e.removeEventListener("error",r)},i=()=>{n(I(e.result)),o()},r=()=>{s(e.error),o()};e.addEventListener("success",i),e.addEventListener("error",r)});return t.then(n=>{n instanceof IDBCursor&&It.set(n,e)}).catch(()=>{}),Pe.set(t,e),t}function as(e){if(Ne.has(e))return;let t=new Promise((n,s)=>{let o=()=>{e.removeEventListener("complete",i),e.removeEventListener("error",r),e.removeEventListener("abort",r)},i=()=>{n(),o()},r=()=>{s(e.error||new DOMException("AbortError","AbortError")),o()};e.addEventListener("complete",i),e.addEventListener("error",r),e.addEventListener("abort",r)});Ne.set(e,t)}var Le={get(e,t,n){if(e instanceof IDBTransaction){if(t==="done")return Ne.get(e);if(t==="objectStoreNames")return e.objectStoreNames||vt.get(e);if(t==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return I(e[t])},set(e,t,n){return e[t]=n,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function kt(e){Le=e(Le)}function cs(e){return e===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(t,...n){let s=e.call(fe(this),t,...n);return vt.set(s,t.sort?t.sort():[t]),I(s)}:is().includes(e)?function(...t){return e.apply(fe(this),t),I(It.get(this))}:function(...t){return I(e.apply(fe(this),t))}}function ls(e){return typeof e=="function"?cs(e):(e instanceof IDBTransaction&&as(e),ss(e,os())?new Proxy(e,Le):e)}function I(e){if(e instanceof IDBRequest)return rs(e);if(De.has(e))return De.get(e);let t=ls(e);return t!==e&&(De.set(e,t),Pe.set(t,e)),t}var fe=e=>Pe.get(e);function Nt(e,t,{blocked:n,upgrade:s,blocking:o,terminated:i}={}){let r=indexedDB.open(e,t),a=I(r);return s&&r.addEventListener("upgradeneeded",c=>{s(I(r.result),c.oldVersion,c.newVersion,I(r.transaction),c)}),n&&r.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),a.then(c=>{i&&c.addEventListener("close",()=>i()),o&&c.addEventListener("versionchange",l=>o(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}var ds=["get","getKey","getAll","getAllKeys","count"],us=["put","add","delete","clear"],Me=new Map;function Dt(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if(Me.get(t))return Me.get(t);let n=t.replace(/FromIndex$/,""),s=t!==n,o=us.includes(n);if(!(n in(s?IDBIndex:IDBObjectStore).prototype)||!(o||ds.includes(n)))return;let i=async function(r,...a){let c=this.transaction(r,o?"readwrite":"readonly"),l=c.store;return s&&(l=l.index(a.shift())),(await Promise.all([l[n](...a),o&&c.done]))[0]};return Me.set(t,i),i}kt(e=>({...e,get:(t,n,s)=>Dt(t,n)||e.get(t,n,s),has:(t,n)=>!!Dt(t,n)||e.has(t,n)}));var Ue=class{constructor(t){this.container=t}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(hs(n)){let s=n.getImmediate();return`${s.library}/${s.version}`}else return null}).filter(n=>n).join(" ")}};function hs(e){return e.getComponent()?.type==="VERSION"}var Be="@firebase/app",Lt="0.16.2";var L=new M("@firebase/app"),fs="@firebase/app-compat",ps="@firebase/analytics-compat",ms="@firebase/analytics",gs="@firebase/app-check-compat",Es="@firebase/app-check",_s="@firebase/auth",bs="@firebase/auth-compat",ws="@firebase/database",ys="@firebase/data-connect",As="@firebase/database-compat",Ss="@firebase/functions",Cs="@firebase/functions-compat",Os="@firebase/installations",Ts="@firebase/installations-compat",Rs="@firebase/messaging",Is="@firebase/messaging-compat",vs="@firebase/performance",ks="@firebase/performance-compat",Ds="@firebase/remote-config",Ns="@firebase/remote-config-compat",Ls="@firebase/storage",Ps="@firebase/storage-compat",Ms="@firebase/firestore",xs="@firebase/ai",Us="@firebase/firestore-compat",Bs="firebase";var Fe="[DEFAULT]",Fs={[Be]:"fire-core",[fs]:"fire-core-compat",[ms]:"fire-analytics",[ps]:"fire-analytics-compat",[Es]:"fire-app-check",[gs]:"fire-app-check-compat",[_s]:"fire-auth",[bs]:"fire-auth-compat",[ws]:"fire-rtdb",[ys]:"fire-data-connect",[As]:"fire-rtdb-compat",[Ss]:"fire-fn",[Cs]:"fire-fn-compat",[Os]:"fire-iid",[Ts]:"fire-iid-compat",[Rs]:"fire-fcm",[Is]:"fire-fcm-compat",[vs]:"fire-perf",[ks]:"fire-perf-compat",[Ds]:"fire-rc",[Ns]:"fire-rc-compat",[Ls]:"fire-gcs",[Ps]:"fire-gcs-compat",[Ms]:"fire-fst",[Us]:"fire-fst-compat",[xs]:"fire-vertex","fire-js":"fire-js",[Bs]:"fire-js-all"};var pe=new Map,$s=new Map,$e=new Map;function Pt(e,t){try{e.container.addComponent(t)}catch(n){L.debug(`Component ${t.name} failed to register with FirebaseApp ${e.name}`,n)}}function x(e){let t=e.name;if($e.has(t))return L.debug(`There were multiple attempts to register component ${t}.`),!1;$e.set(t,e);for(let n of pe.values())Pt(n,e);for(let n of $s.values())Pt(n,e);return!0}function Q(e,t){let n=e.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),e.container.getProvider(t)}function Bt(e){return e==null?!1:e.settings!==void 0}var Hs={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different {$mismatchedParam}. Existing: '{$oldValue}'. New: '{$newValue}'.","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},N=new $("app","Firebase",Hs);var He=class{constructor(t,n,s){this._isDeleted=!1,this._options={...t},this._config={...n},this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=s,this.container.addComponent(new O("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(t){this.checkDestroyed(),this._automaticDataCollectionEnabled=t}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(t){this._isDeleted=t}checkDestroyed(){if(this.isDeleted)throw N.create("app-deleted",{appName:this._name})}};function je(e,t={}){let n=e;typeof t!="object"&&(t={name:t});let s={name:Fe,automaticDataCollectionEnabled:!0,...t},o=s.name;if(typeof o!="string"||!o)throw N.create("bad-app-name",{appName:String(o)});if(n||(n=ve()),!n)throw N.create("no-options");let i=pe.get(o);if(i)if(de(n,i.options)){if(de(s,i.config))return i;throw N.create("duplicate-app",{appName:o,mismatchedParam:"config",oldValue:JSON.stringify(i.config),newValue:JSON.stringify(s)})}else throw N.create("duplicate-app",{appName:o,mismatchedParam:"options",oldValue:JSON.stringify(i.options),newValue:JSON.stringify(n)});let r=new he(o);for(let c of $e.values())r.addComponent(c);let a=new He(n,s,r);return pe.set(o,a),a}function me(e=Fe){let t=pe.get(e);if(!t&&e===Fe&&ve())return je();if(!t)throw N.create("no-app",{appName:e});return t}function v(e,t,n){let s=Fs[e]??e;n&&(s+=`-${n}`);let o=s.match(/\s|\//),i=t.match(/\s|\//);if(o||i){let r=[`Unable to register library "${s}" with version "${t}":`];o&&r.push(`library name "${s}" contains illegal characters (whitespace or "/")`),o&&i&&r.push("and"),i&&r.push(`version name "${t}" contains illegal characters (whitespace or "/")`),L.warn(r.join(" "));return}x(new O(`${s}-version`,()=>({library:s,version:t}),"VERSION"))}var Gs="firebase-heartbeat-database",Vs=1,X="firebase-heartbeat-store",xe=null;function Ft(){return xe||(xe=Nt(Gs,Vs,{upgrade:(e,t)=>{switch(t){case 0:try{e.createObjectStore(X)}catch(n){console.warn(n)}}}}).catch(e=>{throw N.create("idb-open",{originalErrorMessage:e.message})})),xe}async function js(e){try{let n=(await Ft()).transaction(X),s=await n.objectStore(X).get($t(e));return await n.done,s}catch(t){if(t instanceof D)L.warn(t.message);else{let n=N.create("idb-get",{originalErrorMessage:t?.message});L.warn(n.message)}}}async function Mt(e,t){try{let s=(await Ft()).transaction(X,"readwrite");await s.objectStore(X).put(t,$t(e)),await s.done}catch(n){if(n instanceof D)L.warn(n.message);else{let s=N.create("idb-set",{originalErrorMessage:n?.message});L.warn(s.message)}}}function $t(e){return`${e.name}!${e.options.appId}`}var Ws=1024,Ks=30,Ge=class{constructor(t){this.container=t,this._heartbeatsCache=null;let n=this.container.getProvider("app").getImmediate();this._storage=new Ve(n),this._heartbeatsCachePromise=this._storage.read().then(s=>(this._heartbeatsCache=s,s))}async triggerHeartbeat(){try{let n=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),s=xt();if(this._heartbeatsCache?.heartbeats==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null)||this._heartbeatsCache.lastSentHeartbeatDate===s||this._heartbeatsCache.heartbeats.some(o=>o.date===s))return;if(this._heartbeatsCache.heartbeats.push({date:s,agent:n}),this._heartbeatsCache.heartbeats.length>Ks){let o=Ys(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(t){L.warn(t)}}async getHeartbeatsHeader(){try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null||this._heartbeatsCache.heartbeats.length===0)return"";let t=xt(),{heartbeatsToSend:n,unsentEntries:s}=zs(this._heartbeatsCache.heartbeats),o=Ie(JSON.stringify({version:2,heartbeats:n}));return this._heartbeatsCache.lastSentHeartbeatDate=t,s.length>0?(this._heartbeatsCache.heartbeats=s,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),o}catch(t){return L.warn(t),""}}};function xt(){return new Date().toISOString().substring(0,10)}function zs(e,t=Ws){let n=[],s=e.slice();for(let o of e){let i=n.find(r=>r.agent===o.agent);if(i){if(i.dates.push(o.date),Ut(n)>t){i.dates.pop();break}}else if(n.push({agent:o.agent,dates:[o.date]}),Ut(n)>t){n.pop();break}s=s.slice(1)}return{heartbeatsToSend:n,unsentEntries:s}}var Ve=class{constructor(t){this.app=t,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return J()?Ct().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){let n=await js(this.app);return n?.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(t){if(await this._canUseIndexedDBPromise){let s=await this.read();return Mt(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??s.lastSentHeartbeatDate,heartbeats:t.heartbeats})}else return}async add(t){if(await this._canUseIndexedDBPromise){let s=await this.read();return Mt(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??s.lastSentHeartbeatDate,heartbeats:[...s.heartbeats,...t.heartbeats]})}else return}};function Ut(e){return Ie(JSON.stringify({version:2,heartbeats:e})).length}function Ys(e){if(e.length===0)return-1;let t=0,n=e[0].date;for(let s=1;s<e.length;s++)e[s].date<n&&(n=e[s].date,t=s);return t}function qs(e){x(new O("platform-logger",t=>new Ue(t),"PRIVATE")),x(new O("heartbeat",t=>new Ge(t),"PRIVATE")),v(Be,Lt,e),v(Be,Lt,"esm2020"),v("fire-js","")}qs("");var Js="firebase",Xs="12.19.0";v(Js,Xs,"app");var ze=new Map,Kt={activated:!1,tokenObservers:[]},Qs={initialized:!1,enabled:!1};function E(e){return ze.get(e)||{...Kt}}function Zs(e,t){return ze.set(e,t),ze.get(e)}function we(){return Qs}var zt="https://content-firebaseappcheck.googleapis.com/v1";var eo="exchangeRecaptchaEnterpriseToken",to="exchangeDebugToken",Ht={RETRIAL_MIN_WAIT:30*1e3,RETRIAL_MAX_WAIT:960*1e3},no=1440*60*1e3;var Ye=class{constructor(t,n,s,o,i){if(this.operation=t,this.retryPolicy=n,this.getWaitDuration=s,this.lowerBound=o,this.upperBound=i,this.pending=null,this.nextErrorWaitInterval=o,o>i)throw new Error("Proactive refresh lower bound greater than upper bound!")}start(){this.nextErrorWaitInterval=this.lowerBound,this.process(!0).catch(()=>{})}stop(){this.pending&&(this.pending.reject("cancelled"),this.pending=null)}isRunning(){return!!this.pending}async process(t){this.stop();try{this.pending=new R,this.pending.promise.catch(n=>{}),await so(this.getNextRun(t)),this.pending.resolve(),await this.pending.promise,this.pending=new R,this.pending.promise.catch(n=>{}),await this.operation(),this.pending.resolve(),await this.pending.promise,this.process(!0).catch(()=>{})}catch(n){this.retryPolicy(n)?this.process(!1).catch(()=>{}):this.stop()}}getNextRun(t){if(t)return this.nextErrorWaitInterval=this.lowerBound,this.getWaitDuration();{let n=this.nextErrorWaitInterval;return this.nextErrorWaitInterval*=2,this.nextErrorWaitInterval>this.upperBound&&(this.nextErrorWaitInterval=this.upperBound),n}}};function so(e){return new Promise(t=>{setTimeout(t,e)})}var oo={"already-initialized":"You have already called initializeAppCheck() for FirebaseApp {$appName} with different options. To avoid this error, call initializeAppCheck() with the same options as when it was originally called. This will return the already initialized instance.","use-before-activation":"App Check is being used before initializeAppCheck() is called for FirebaseApp {$appName}. Call initializeAppCheck() before instantiating other Firebase services.","fetch-network-error":"Fetch failed to connect to a network. Check Internet connection. Original error: {$originalErrorMessage}.","fetch-parse-error":"Fetch client could not parse response. Original error: {$originalErrorMessage}.","fetch-status-error":"Fetch server returned an HTTP error status. HTTP status: {$httpStatus}.","storage-open":"Error thrown when opening storage. Original error: {$originalErrorMessage}.","storage-get":"Error thrown when reading from storage. Original error: {$originalErrorMessage}.","storage-set":"Error thrown when writing to storage. Original error: {$originalErrorMessage}.","recaptcha-error":"ReCAPTCHA error.","initial-throttle":"{$httpStatus} error. Attempts allowed again after {$time}",throttled:"Requests throttled due to previous {$httpStatus} error. Attempts allowed again after {$time}"},A=new $("appCheck","AppCheck",oo);function Gt(e=!1){return e?self.grecaptcha?.enterprise:self.grecaptcha}function Je(e){if(!E(e).activated)throw A.create("use-before-activation",{appName:e.name})}function Yt(e){let t=Math.round(e/1e3),n=Math.floor(t/(3600*24)),s=Math.floor((t-n*3600*24)/3600),o=Math.floor((t-n*3600*24-s*3600)/60),i=t-n*3600*24-s*3600-o*60,r="";return n&&(r+=ge(n)+"d:"),s&&(r+=ge(s)+"h:"),r+=ge(o)+"m:"+ge(i)+"s",r}function ge(e){return e===0?"00":e>=10?e.toString():"0"+e}async function Xe({url:e,body:t},n){let s={"Content-Type":"application/json"},o=n.getImmediate({optional:!0});if(o){let m=await o.getHeartbeatsHeader();m&&(s["X-Firebase-Client"]=m)}let i={method:"POST",body:JSON.stringify(t),headers:s},r;try{r=await fetch(e,i)}catch(m){throw A.create("fetch-network-error",{originalErrorMessage:m?.message})}if(r.status!==200)throw A.create("fetch-status-error",{httpStatus:r.status});let a;try{a=await r.json()}catch(m){throw A.create("fetch-parse-error",{originalErrorMessage:m?.message})}let c=a.ttl.match(/^([\d.]+)(s)$/);if(!c||!c[2]||isNaN(Number(c[1])))throw A.create("fetch-parse-error",{originalErrorMessage:`ttl field (timeToLive) is not in standard Protobuf Duration format: ${a.ttl}`});let l=Number(c[1])*1e3,h=Date.now();return{token:a.token,expireTimeMillis:h+l,issuedAtTimeMillis:h}}function io(e,t){let{projectId:n,appId:s,apiKey:o}=e.options;return{url:`${zt}/projects/${n}/apps/${s}:${eo}?key=${o}`,body:{recaptcha_enterprise_token:t}}}function qt(e,t){let{projectId:n,appId:s,apiKey:o}=e.options;return{url:`${zt}/projects/${n}/apps/${s}:${to}?key=${o}`,body:{debug_token:t}}}var ro="firebase-app-check-database",ao=1,Z="firebase-app-check-store",Jt="debug-token",Ee=null;function Xt(){return Ee||(Ee=new Promise((e,t)=>{try{let n=indexedDB.open(ro,ao);n.onsuccess=s=>{e(s.target.result)},n.onerror=s=>{t(A.create("storage-open",{originalErrorMessage:s.target.error?.message}))},n.onupgradeneeded=s=>{let o=s.target.result;switch(s.oldVersion){case 0:o.createObjectStore(Z,{keyPath:"compositeKey"})}}}catch(n){t(A.create("storage-open",{originalErrorMessage:n?.message}))}}),Ee)}function co(e){return Zt(en(e))}function lo(e,t){return Qt(en(e),t)}function uo(e){return Qt(Jt,e)}function ho(){return Zt(Jt)}async function Qt(e,t){let s=(await Xt()).transaction(Z,"readwrite"),i=s.objectStore(Z).put({compositeKey:e,value:t});return new Promise((r,a)=>{i.onsuccess=c=>{r()},s.onerror=c=>{a(A.create("storage-set",{originalErrorMessage:c.target.error?.message}))}})}async function Zt(e){let n=(await Xt()).transaction(Z,"readonly"),o=n.objectStore(Z).get(e);return new Promise((i,r)=>{o.onsuccess=a=>{let c=a.target.result;i(c?c.value:void 0)},n.onerror=a=>{r(A.create("storage-get",{originalErrorMessage:a.target.error?.message}))}})}function en(e){return`${e.options.appId}-${e.name}`}var U=new M("@firebase/app-check");async function fo(e){if(J()){let t;try{t=await co(e)}catch(n){U.warn(`Failed to read token from IndexedDB. Error: ${n}`)}return t}}function We(e,t){return J()?lo(e,t).catch(n=>{U.warn(`Failed to write token to IndexedDB. Error: ${n}`)}):Promise.resolve()}async function po(e){let t;try{t=await ho()}catch{}if(t)return t;{let n=crypto.randomUUID(),s=`To use this token for app debugging, register it with your project.

Firebase App Check debug token: ${n}

`,o=e?.options.appId,i=e?.options.projectId;return i&&o?s+=`You can do so in the Firebase Console:
https://console.firebase.google.com/project/${i}/appcheck/apps?selectedAppId=${o}

Or using the Firebase CLI:
firebase appcheck:debugtokens:create ${n} --project ${i} --app ${o}

`:s+=`You will need to add it to your app's App Check settings in the Firebase Console for it to work.

`,s+=`Note: To keep your project secure, please revoke and delete this token using the
Firebase Console or the CLI (\`firebase appcheck:debugtokens:delete\`) when you finish debugging.

Warning: This debug token is a secret and should not be shared or uploaded to source code.

Debug Token Guide: https://firebase.google.com/docs/app-check/web/debug-provider
Firebase CLI install instructions: https://firebase.google.com/docs/cli
`,console.log(s),uo(n).catch(r=>U.warn(`Failed to persist debug token to IndexedDB. Error: ${r}`)),n}}function Qe(){return we().enabled}async function Ze(){let e=we();if(e.enabled&&e.token)return e.token.promise;throw Error(`
            Can't get debug token in production mode.
        `)}function mo(e){let t=q(),n=we();if(n.initialized=!0,typeof t.FIREBASE_APPCHECK_DEBUG_TOKEN!="string"&&t.FIREBASE_APPCHECK_DEBUG_TOKEN!==!0)return;n.enabled=!0;let s=new R;n.token=s,typeof t.FIREBASE_APPCHECK_DEBUG_TOKEN=="string"?s.resolve(t.FIREBASE_APPCHECK_DEBUG_TOKEN):s.resolve(po(e))}var go={error:"UNKNOWN_ERROR"};function Eo(e){return le.encodeString(JSON.stringify(e),!1)}async function _e(e,t=!1,n=!1){let s=e.app;Je(s);let o=E(s),i=o.token,r;if(i&&!K(i)&&(o.token=void 0,i=void 0),!i){let l=await o.cachedTokenPromise;l&&(K(l)?i=l:await We(s,void 0))}if(!t&&i&&K(i))return{token:i.token};let a=!1;if(Qe())try{let l=await Ze();o.exchangeTokenPromise||(o.exchangeTokenPromise=Xe(qt(s,l),e.heartbeatServiceProvider).finally(()=>{o.exchangeTokenPromise=void 0}),a=!0);let h=await o.exchangeTokenPromise;return await We(s,h),o.token=h,{token:h.token}}catch(l){return l.code==="appCheck/throttled"||l.code==="appCheck/initial-throttle"?U.warn(l.message):n&&U.error(l),Ke(l)}try{o.exchangeTokenPromise||(o.exchangeTokenPromise=o.provider.getToken().finally(()=>{o.exchangeTokenPromise=void 0}),a=!0),i=await E(s).exchangeTokenPromise}catch(l){l.code==="appCheck/throttled"||l.code==="appCheck/initial-throttle"?U.warn(l.message):n&&U.error(l),r=l}let c;return i?r?K(i)?c={token:i.token,internalError:r}:c=Ke(r):(c={token:i.token},o.token=i,await We(s,i)):c=Ke(r),a&&sn(s,c),c}async function _o(e){let t=e.app;Je(t);let{provider:n}=E(t);if(Qe()){let s=await Ze(),o=qt(t,s);o.body.limited_use=!0;let{token:i}=await Xe(o,e.heartbeatServiceProvider);return{token:i}}else{let{token:s}=await n.getToken(!0);return{token:s}}}function tn(e,t,n,s){let{app:o}=e,i=E(o),r={next:n,error:s,type:t};if(i.tokenObservers=[...i.tokenObservers,r],i.token&&K(i.token)){let a=i.token;Promise.resolve().then(()=>{n({token:a.token}),Vt(e)}).catch(()=>{})}i.cachedTokenPromise.then(()=>Vt(e))}function nn(e,t){let n=E(e),s=n.tokenObservers.filter(o=>o.next!==t);s.length===0&&n.tokenRefresher&&n.tokenRefresher.isRunning()&&n.tokenRefresher.stop(),n.tokenObservers=s}function Vt(e){let{app:t}=e,n=E(t),s=n.tokenRefresher;s||(s=bo(e),n.tokenRefresher=s),!s.isRunning()&&n.isTokenAutoRefreshEnabled&&s.start()}function bo(e){let{app:t}=e;return new Ye(async()=>{let n=E(t),s;if(n.token?s=await _e(e,!0):s=await _e(e),s.error)throw s.error;if(s.internalError)throw s.internalError},()=>!0,()=>{let n=E(t);if(n.token){let s=n.token.issuedAtTimeMillis+(n.token.expireTimeMillis-n.token.issuedAtTimeMillis)*.5+3e5,o=n.token.expireTimeMillis-300*1e3;return s=Math.min(s,o),Math.max(0,s-Date.now())}else return 0},Ht.RETRIAL_MIN_WAIT,Ht.RETRIAL_MAX_WAIT)}function sn(e,t){let n=E(e).tokenObservers;for(let s of n)try{s.type==="EXTERNAL"&&t.error!=null?s.error(t.error):s.next(t)}catch{}}function K(e){return e.expireTimeMillis-Date.now()>0}function Ke(e){return{token:Eo(go),error:e}}var qe=class{constructor(t,n){this.app=t,this.heartbeatServiceProvider=n}_delete(){let{tokenObservers:t}=E(this.app);for(let n of t)nn(this.app,n.next);return Promise.resolve()}};function wo(e,t){return new qe(e,t)}function yo(e){return{getToken:t=>_e(e,t),getLimitedUseToken:()=>_o(e),addTokenListener:t=>tn(e,"INTERNAL",t),removeTokenListener:t=>nn(e.app,t)}}var Ao="@firebase/app-check",So="0.13.1";var Co="https://www.google.com/recaptcha/enterprise.js";function Oo(e,t){let n=new R,s=E(e);s.reCAPTCHAState={initialized:n};let o=To(e),i=Gt(!0);return i?jt(e,t,i,o,n):vo(()=>{let r=Gt(!0);if(!r)throw new Error("no recaptcha");jt(e,t,r,o,n)}),n.promise}function jt(e,t,n,s,o){n.ready(()=>{Io(e,t,n,s),o.resolve(n)})}function To(e){let t=`fire_app_check_${e.name}`,n=document.createElement("div");return n.id=t,n.style.display="none",document.body.appendChild(n),t}async function Ro(e){Je(e);let n=await E(e).reCAPTCHAState.initialized.promise;return new Promise((s,o)=>{let i=E(e).reCAPTCHAState;n.ready(()=>{s(n.execute(i.widgetId,{action:"fire_app_check"}))})})}function Io(e,t,n,s){let o=n.render(s,{sitekey:t,size:"invisible",callback:()=>{E(e).reCAPTCHAState.succeeded=!0},"error-callback":()=>{E(e).reCAPTCHAState.succeeded=!1}}),i=E(e);i.reCAPTCHAState={...i.reCAPTCHAState,widgetId:o}}function vo(e){let t=document.createElement("script");t.src=Co+"?render=explicit",t.onload=e,document.head.appendChild(t)}var be=class e{constructor(t){this._siteKey=t,this._throttleData=null}async getToken(t=!1){Do(this._throttleData);let n=await Ro(this._app).catch(o=>{throw A.create("recaptcha-error")});if(!E(this._app).reCAPTCHAState?.succeeded)throw A.create("recaptcha-error");let s;try{let o=io(this._app,n);t&&(o.body.limited_use=!0),s=await Xe(o,this._heartbeatServiceProvider)}catch(o){throw o.code?.includes("fetch-status-error")?(this._throttleData=ko(Number(o.customData?.httpStatus),this._throttleData),A.create("initial-throttle",{time:Yt(this._throttleData.allowRequestsAfter-Date.now()),httpStatus:this._throttleData.httpStatus})):o}return this._throttleData=null,s}initialize(t){this._app=t,this._heartbeatServiceProvider=Q(t,"heartbeat"),Oo(t,this._siteKey).catch(()=>{})}isEqual(t){return t instanceof e?this._siteKey===t._siteKey:!1}};function ko(e,t){if(e===404||e===403)return{backoffCount:1,allowRequestsAfter:Date.now()+no,httpStatus:e};{let n=t?t.backoffCount:0,s=Ot(n,1e3,2);return{backoffCount:n+1,allowRequestsAfter:Date.now()+s,httpStatus:e}}}function Do(e){if(e&&Date.now()-e.allowRequestsAfter<=0)throw A.create("throttled",{time:Yt(e.allowRequestsAfter-Date.now()),httpStatus:e.httpStatus})}function on(e=me(),t){e=ue(e);let n=Q(e,"app-check");if(we().initialized||mo(e),Qe()&&Ze().then(o=>{console.log(`Firebase App Check debug token: ${o}`)}),n.isInitialized()){let o=n.getImmediate(),i=n.getOptions();if(i&&!!i.isTokenAutoRefreshEnabled==!!t.isTokenAutoRefreshEnabled&&i.provider?.isEqual(t.provider))return o;throw A.create("already-initialized",{appName:e.name})}let s=n.initialize({options:t});return No(e,t.provider,t.isTokenAutoRefreshEnabled),E(e).isTokenAutoRefreshEnabled&&tn(s,"INTERNAL",()=>{}),s}function No(e,t,n=!1){let s=Zs(e,{...Kt});s.activated=!0,s.provider=t,s.cachedTokenPromise=fo(e).then(o=>(o&&K(o)&&(s.token=o,sn(e,{token:o.token})),o)),s.isTokenAutoRefreshEnabled=n&&e.automaticDataCollectionEnabled,!e.automaticDataCollectionEnabled&&n&&U.warn("`isTokenAutoRefreshEnabled` is true but `automaticDataCollectionEnabled` was set to false during `initializeApp()`. This blocks automatic token refresh."),s.provider.initialize(e)}async function rn(e,t){let n=await _e(e,t);if(n.error)throw n.error;if(n.internalError)throw n.internalError;return{token:n.token}}var Lo="app-check",Wt="app-check-internal";function Po(){x(new O(Lo,e=>{let t=e.getProvider("app").getImmediate(),n=e.getProvider("heartbeat");return wo(t,n)},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,t,n)=>{e.getProvider(Wt).initialize()})),x(new O(Wt,e=>{let t=e.getProvider("app-check").getImmediate();return yo(t)},"PUBLIC").setInstantiationMode("EXPLICIT")),v(Ao,So)}Po();var an="@firebase/ai",ot="2.16.0";var V="AI",Mo="us-central1",xo="global",Uo="firebasevertexai.googleapis.com",z="v1beta",cn=ot,Bo="gl-js",Fo="hybrid",$o=180*1e3,Ho="gemini-2.5-flash-lite";var f=class e extends D{constructor(t,n,s){let o=V,i=`${o}/${t}`,r=`${o}: ${n} (${i})`;super(t,r),this.code=t,this.customErrorData=s,Error.captureStackTrace&&Error.captureStackTrace(this,e),Object.setPrototypeOf(this,e.prototype),this.toString=()=>r}};var ln=["user","model","function","system"];var gn={HARM_SEVERITY_NEGLIGIBLE:"HARM_SEVERITY_NEGLIGIBLE",HARM_SEVERITY_LOW:"HARM_SEVERITY_LOW",HARM_SEVERITY_MEDIUM:"HARM_SEVERITY_MEDIUM",HARM_SEVERITY_HIGH:"HARM_SEVERITY_HIGH",HARM_SEVERITY_UNSUPPORTED:"HARM_SEVERITY_UNSUPPORTED"};var w={STOP:"STOP",MAX_TOKENS:"MAX_TOKENS",SAFETY:"SAFETY",RECITATION:"RECITATION",OTHER:"OTHER",BLOCKLIST:"BLOCKLIST",PROHIBITED_CONTENT:"PROHIBITED_CONTENT",SPII:"SPII",MALFORMED_FUNCTION_CALL:"MALFORMED_FUNCTION_CALL",IMAGE_SAFETY:"IMAGE_SAFETY",IMAGE_PROHIBITED_CONTENT:"IMAGE_PROHIBITED_CONTENT",IMAGE_OTHER:"IMAGE_OTHER",NO_IMAGE:"NO_IMAGE",IMAGE_RECITATION:"IMAGE_RECITATION",LANGUAGE:"LANGUAGE",UNEXPECTED_TOOL_CALL:"UNEXPECTED_TOOL_CALL",TOO_MANY_TOOL_CALLS:"TOO_MANY_TOOL_CALLS",MISSING_THOUGHT_SIGNATURE:"MISSING_THOUGHT_SIGNATURE",MALFORMED_RESPONSE:"MALFORMED_RESPONSE"};var y={PREFER_ON_DEVICE:"prefer_on_device",ONLY_ON_DEVICE:"only_on_device",ONLY_IN_CLOUD:"only_in_cloud",PREFER_IN_CLOUD:"prefer_in_cloud"},B={ON_DEVICE:"on_device",IN_CLOUD:"in_cloud"};var u={ERROR:"error",REQUEST_ERROR:"request-error",RESPONSE_ERROR:"response-error",FETCH_ERROR:"fetch-error",SESSION_CLOSED:"session-closed",INVALID_CONTENT:"invalid-content",API_NOT_ENABLED:"api-not-enabled",INVALID_SCHEMA:"invalid-schema",NO_API_KEY:"no-api-key",NO_APP_ID:"no-app-id",NO_MODEL:"no-model",NO_PROJECT_ID:"no-project-id",PARSE_FAILED:"parse-failed",UNSUPPORTED:"unsupported"};var k={AGENT_PLATFORM:"AGENT_PLATFORM",VERTEX_AI:"VERTEX_AI",GOOGLE_AI:"GOOGLE_AI"};var te=class{constructor(t){this.backendType=t}},j=class extends te{constructor(){super(k.GOOGLE_AI)}_getModelPath(t,n){return`/${z}/projects/${t}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/templates/${n}`}},ne=class extends te{constructor(t){super(k.VERTEX_AI),this.location=Mo,t&&(this.location=t)}_getModelPath(t,n){return`/${z}/projects/${t}/locations/${this.location}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/locations/${this.location}/templates/${n}`}},se=class extends te{constructor(t){super(k.AGENT_PLATFORM),this.location=xo,t&&(this.location=t)}_getModelPath(t,n){return`/${z}/projects/${t}/locations/${this.location}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/locations/${this.location}/templates/${n}`}};function Go(e){if(e instanceof j)return`${V}/googleai`;if(e instanceof ne)return`${V}/vertexai/${e.location}`;if(e instanceof se)return`${V}/agentplatform/${e.location}`;throw new f(u.ERROR,`Invalid backend: ${JSON.stringify(e.backendType)}`)}function Vo(e){let t=e.split("/");if(t[0]!==V)throw new f(u.ERROR,`Invalid instance identifier, unknown prefix '${t[0]}'`);switch(t[1]){case"vertexai":let s=t[2];if(!s)throw new f(u.ERROR,`Invalid instance identifier, unknown location '${e}'`);return new ne(s);case"agentplatform":let o=t[2];if(!o)throw new f(u.ERROR,`Invalid instance identifier, unknown location '${e}'`);return new se(o);case"googleai":return new j;default:throw new f(u.ERROR,`Invalid instance identifier string: '${e}'`)}}var _=new M("@firebase/vertexai"),P;(function(e){e.UNAVAILABLE="unavailable",e.DOWNLOADABLE="downloadable",e.DOWNLOADING="downloading",e.AVAILABLE="available"})(P||(P={}));var En={type:"text",languages:["en"]},et=[En,{type:"image"}],tt=[En],Ae=class e{constructor(t,n,s){this.languageModelProvider=t,this.mode=n,this.downloadPromise=null,this.onDeviceParams={createOptions:{expectedInputs:et,expectedOutputs:tt}},s&&(this.onDeviceParams=s,this.onDeviceParams.createOptions?(this.onDeviceParams.createOptions.expectedInputs||(this.onDeviceParams.createOptions.expectedInputs=et),this.onDeviceParams.createOptions.expectedOutputs||(this.onDeviceParams.createOptions.expectedOutputs=tt)):this.onDeviceParams.createOptions={expectedInputs:et,expectedOutputs:tt})}async isAvailable(t){if(!this.mode)return _.debug("On-device inference unavailable because mode is undefined."),!1;if(this.mode===y.ONLY_IN_CLOUD)return _.debug('On-device inference unavailable because mode is "only_in_cloud".'),!1;let n=await this.languageModelProvider?.availability(this.onDeviceParams.createOptions);if(this.mode===y.ONLY_ON_DEVICE){if(n===P.UNAVAILABLE)throw new f(u.API_NOT_ENABLED,"Local LanguageModel API not available in this environment.");if(n===P.DOWNLOADABLE||n===P.DOWNLOADING){_.debug("Waiting for download of LanguageModel to complete.");try{await this.downloadPromise}catch(s){throw new f(u.ERROR,s.message)}return!0}return!0}return n!==P.AVAILABLE?(_.debug(`On-device inference unavailable because availability is "${n}".`),!1):e.isOnDeviceRequest(t)?!0:(_.debug("On-device inference unavailable because request is incompatible."),!1)}async generateContent(t){let n=await this.createSession(),s=await Promise.all(t.contents.map(e.toLanguageModelMessage)),o=await n.prompt(s,this.onDeviceParams.promptOptions);return e.toResponse(o)}async generateContentStream(t){let n=await this.createSession(),s=await Promise.all(t.contents.map(e.toLanguageModelMessage)),o=n.promptStreaming(s,this.onDeviceParams.promptOptions);return e.toStreamResponse(o)}async countTokens(t){throw new f(u.REQUEST_ERROR,"Count Tokens is not yet available for on-device model.")}static isOnDeviceRequest(t){if(t.contents.length===0)return _.debug("Empty prompt rejected for on-device inference."),!1;for(let n of t.contents){if(n.parts.some(s=>"functionResponse"in s))return _.debug("Content with a function response part rejected for on-device inference."),!1;for(let s of n.parts)if(s.inlineData&&e.SUPPORTED_MIME_TYPES.indexOf(s.inlineData.mimeType)===-1)return _.debug(`Unsupported mime type "${s.inlineData.mimeType}" rejected for on-device inference.`),!1}return!0}async downloadIfAvailable(t){let n=await this.languageModelProvider?.availability(this.onDeviceParams.createOptions);return(n===P.DOWNLOADABLE||n===P.DOWNLOADING)&&this.download(t),n}download(t){if(this.downloadPromise)return;let n={...this.onDeviceParams.createOptions};n&&!n.monitor&&t&&(n.monitor=s=>{s.addEventListener("downloadprogress",o=>{t(o.loaded)})}),this.downloadPromise=this.languageModelProvider?.create(n).finally(()=>{this.downloadPromise=null})}static async toLanguageModelMessage(t){let n=await Promise.all(t.parts.map(e.toLanguageModelMessageContent));return{role:e.toLanguageModelMessageRole(t.role),content:n}}static async toLanguageModelMessageContent(t){if(t.text)return{type:"text",value:t.text};if(t.inlineData){let s=await(await fetch(`data:${t.inlineData.mimeType};base64,${t.inlineData.data}`)).blob();return{type:"image",value:await createImageBitmap(s)}}throw new f(u.REQUEST_ERROR,"Processing of this Part type is not currently supported.")}static toLanguageModelMessageRole(t){return t==="model"?"assistant":"user"}async createSession(){if(!this.languageModelProvider)throw new f(u.UNSUPPORTED,"Chrome AI requested for unsupported browser version.");let t=await this.languageModelProvider.create(this.onDeviceParams.createOptions);return this.oldSession&&this.oldSession.destroy(),this.oldSession=t,t}static toResponse(t){return{json:async()=>({candidates:[{content:{parts:[{text:t}]}}]})}}static toStreamResponse(t){let n=new TextEncoder;return{body:t.pipeThrough(new TransformStream({transform(s,o){let i=JSON.stringify({candidates:[{content:{role:"model",parts:[{text:s}]}}]});o.enqueue(n.encode(`data: ${i}

`))}}))}}};Ae.SUPPORTED_MIME_TYPES=["image/jpeg","image/png"];function jo(e,t,n){let o=(t||q()).LanguageModel;if(o&&e)return new Ae(o,e,n)}var it=class{constructor(t,n,s,o,i){this.app=t,this.backend=n,this.chromeAdapterFactory=i;let r=o?.getImmediate({optional:!0}),a=s?.getImmediate({optional:!0});this.auth=a||null,this.appCheck=r||null,n instanceof ne||n instanceof se?this.location=n.location:this.location=""}_delete(){return Promise.resolve()}set options(t){this._options=t}get options(){return this._options}};function Wo(e,{instanceIdentifier:t}){if(!t)throw new f(u.ERROR,"AIService instance identifier is undefined.");let n=Vo(t),s=e.getProvider("app").getImmediate(),o=e.getProvider("auth-internal"),i=e.getProvider("app-check-internal");return new it(s,n,o,i,jo)}function Ko(e){if(e.app?.options?.apiKey)if(e.app?.options?.projectId){if(!e.app?.options?.appId)throw new f(u.NO_APP_ID,'The "appId" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid app ID.')}else throw new f(u.NO_PROJECT_ID,'The "projectId" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid project ID.');else throw new f(u.NO_API_KEY,'The "apiKey" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid API key.');let t={apiKey:e.app.options.apiKey,project:e.app.options.projectId,appId:e.app.options.appId,automaticDataCollectionEnabled:e.app.automaticDataCollectionEnabled,location:e.location,backend:e.backend};if(Bt(e.app)&&e.app.settings.appCheckToken){let n=e.app.settings.appCheckToken;t.getAppCheckToken=()=>Promise.resolve({token:n})}else e.appCheck&&(e.options?.useLimitedUseAppCheckTokens?t.getAppCheckToken=()=>e.appCheck.getLimitedUseToken():t.getAppCheckToken=()=>e.appCheck.getToken());return e.auth&&(t.getAuthToken=()=>e.auth.getToken()),t}var rt=class e{constructor(t,n){this._apiSettings=Ko(t),this.model=e.normalizeModelName(n,this._apiSettings.backend.backendType)}static normalizeModelName(t,n){return n===k.GOOGLE_AI?e.normalizeGoogleAIModelName(t):e.normalizeVertexAIModelName(t)}static normalizeGoogleAIModelName(t){return`models/${t}`}static normalizeVertexAIModelName(t){let n;return t.includes("/")?t.startsWith("models/")?n=`publishers/google/${t}`:n=t:n=`publishers/google/models/${t}`,n}};var zo="Timeout has expired.",nt="AbortError",at=class{constructor(t){this.params=t}toString(){let t=new URL(this.baseUrl);return t.pathname=this.pathname,t.search=this.queryParams.toString(),t.toString()}get pathname(){return this.params.templateId?`${this.params.apiSettings.backend._getTemplatePath(this.params.apiSettings.project,this.params.templateId)}:${this.params.task}`:`${this.params.apiSettings.backend._getModelPath(this.params.apiSettings.project,this.params.model)}:${this.params.task}`}get baseUrl(){return this.params.singleRequestOptions?.baseUrl??`https://${Uo}`}get queryParams(){let t=new URLSearchParams;return this.params.stream&&t.set("alt","sse"),t}};function Yo(e){let t=[];return t.push(`${Bo}/${cn}`),t.push(`fire/${cn}`),(e.params.apiSettings.inferenceMode===y.PREFER_ON_DEVICE||e.params.apiSettings.inferenceMode===y.PREFER_IN_CLOUD)&&t.push(Fo),t.join(" ")}async function qo(e){let t=new Headers;if(t.append("Content-Type","application/json"),t.append("x-goog-api-client",Yo(e)),t.append("x-goog-api-key",e.params.apiSettings.apiKey),e.params.apiSettings.automaticDataCollectionEnabled&&t.append("X-Firebase-Appid",e.params.apiSettings.appId),e.params.apiSettings.getAppCheckToken){let n=await e.params.apiSettings.getAppCheckToken();n&&(t.append("X-Firebase-AppCheck",n.token),n.error&&_.warn(`Unable to obtain a valid App Check token: ${n.error.message}`))}if(e.params.apiSettings.getAuthToken){let n=await e.params.apiSettings.getAuthToken();n&&t.append("Authorization",`Firebase ${n.accessToken}`)}return t}async function ut(e,t){let n=new at(e),s,o=e.singleRequestOptions?.signal,i=e.singleRequestOptions?.timeout!=null&&e.singleRequestOptions.timeout>=0?e.singleRequestOptions.timeout:$o,r=new AbortController,a=setTimeout(()=>{r.abort(new DOMException(zo,nt)),_.debug(`Aborting request to ${n} due to timeout (${i}ms)`)},i),c=AbortSignal.any(o?[o,r.signal]:[r.signal]);if(o&&o.aborted)throw clearTimeout(a),new DOMException(o.reason??"Aborted externally before fetch",nt);try{let l={method:"POST",headers:await qo(n),signal:c,body:t};if(s=await fetch(n.toString(),l),!s.ok){let h="",m;try{let p=await s.json();h=p.error.message,p.error.details&&(h+=` ${JSON.stringify(p.error.details)}`,m=p.error.details)}catch{}throw s.status===403&&m&&m.some(p=>p.reason==="SERVICE_DISABLED")&&m.some(p=>p.links?.[0]?.description.includes("Google developers console API activation"))?new f(u.API_NOT_ENABLED,`The Firebase AI SDK requires the Firebase AI API ('firebasevertexai.googleapis.com') to be enabled in your Firebase project. Enable this API by visiting the Firebase Console at https://console.firebase.google.com/project/${n.params.apiSettings.project}/ailogic/ and clicking "Get started". If you enabled this API recently, wait a few minutes for the action to propagate to our systems and then retry.`,{status:s.status,statusText:s.statusText,errorDetails:m}):new f(u.FETCH_ERROR,`Error fetching from ${n}: [${s.status} ${s.statusText}] ${h}`,{status:s.status,statusText:s.statusText,errorDetails:m})}}catch(l){let h=l;throw l.code!==u.FETCH_ERROR&&l.code!==u.API_NOT_ENABLED&&l instanceof Error&&l.name!==nt&&(h=new f(u.ERROR,`Error fetching from ${n.toString()}: ${l.message}`),h.stack=l.stack),h}finally{clearTimeout(a)}return s}function ye(e){if(e.candidates&&e.candidates.length>0){if(e.candidates.length>1&&_.warn(`This response had ${e.candidates.length} candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`),bn(e.candidates[0]))throw new f(u.RESPONSE_ERROR,`Response error: ${G(e)}. Response body stored in error.response`,{response:e});return!0}else return!1}function Se(e,t=B.IN_CLOUD){e.candidates&&!e.candidates[0].hasOwnProperty("index")&&(e.candidates[0].index=0);let n=Jo(e);return n.inferenceSource=t,n}function Jo(e){return e.text=()=>{if(ye(e))return dn(e,t=>!t.thought);if(e.promptFeedback)throw new f(u.RESPONSE_ERROR,`Text not available. ${G(e)}`,{response:e});return""},e.thoughtSummary=()=>{if(ye(e)){let t=dn(e,n=>!!n.thought);return t===""?void 0:t}else if(e.promptFeedback)throw new f(u.RESPONSE_ERROR,`Thought summary not available. ${G(e)}`,{response:e})},e.inlineDataParts=()=>{if(ye(e))return Xo(e);if(e.promptFeedback)throw new f(u.RESPONSE_ERROR,`Data not available. ${G(e)}`,{response:e})},e.functionCalls=()=>{if(ye(e))return _n(e);if(e.promptFeedback)throw new f(u.RESPONSE_ERROR,`Function call not available. ${G(e)}`,{response:e})},e}function dn(e,t){let n=[];if(e.candidates?.[0].content?.parts)for(let s of e.candidates?.[0].content?.parts)s.text&&t(s)&&n.push(s.text);return n.length>0?n.join(""):""}function _n(e){if(!e)return;let t=[];if(e.candidates?.[0].content?.parts)for(let n of e.candidates?.[0].content?.parts)n.functionCall&&t.push(n.functionCall);if(t.length>0)return t}function Xo(e){let t=[];if(e.candidates?.[0].content?.parts)for(let n of e.candidates?.[0].content?.parts)n.inlineData&&t.push(n);if(t.length>0)return t}var Qo=[w.RECITATION,w.SAFETY,w.BLOCKLIST,w.PROHIBITED_CONTENT,w.SPII,w.MALFORMED_FUNCTION_CALL,w.IMAGE_SAFETY,w.IMAGE_PROHIBITED_CONTENT,w.IMAGE_OTHER,w.NO_IMAGE,w.IMAGE_RECITATION,w.LANGUAGE,w.UNEXPECTED_TOOL_CALL,w.TOO_MANY_TOOL_CALLS,w.MISSING_THOUGHT_SIGNATURE,w.MALFORMED_RESPONSE];function bn(e){return!!e.finishReason&&Qo.some(t=>t===e.finishReason)}function G(e){let t="";if((!e.candidates||e.candidates.length===0)&&e.promptFeedback)t+="Response was blocked",e.promptFeedback?.blockReason&&(t+=` due to ${e.promptFeedback.blockReason}`),e.promptFeedback?.blockReasonMessage&&(t+=`: ${e.promptFeedback.blockReasonMessage}`);else if(e.candidates?.[0]){let n=e.candidates[0];bn(n)&&(t+=`Candidate was blocked due to ${n.finishReason}`,n.finishMessage&&(t+=`: ${n.finishMessage}`))}return t}function wn(e){if(e.safetySettings?.forEach(t=>{if(t.method)throw new f(u.UNSUPPORTED,"SafetySetting.method is not supported in the the Gemini Developer API. Please remove this property.")}),e.generationConfig?.topK){let t=Math.round(e.generationConfig.topK);t!==e.generationConfig.topK&&(_.warn("topK in GenerationConfig has been rounded to the nearest integer to match the format for requests to the Gemini Developer API."),e.generationConfig.topK=t)}return e}function ht(e){return{candidates:e.candidates?ei(e.candidates):void 0,prompt:e.promptFeedback?ti(e.promptFeedback):void 0,usageMetadata:e.usageMetadata}}function Zo(e,t){return{generateContentRequest:{model:t,...e}}}function ei(e){let t=[],n;return t&&e.forEach(s=>{let o;if(s.citationMetadata&&(o={citations:s.citationMetadata.citationSources}),s.safetyRatings&&(n=s.safetyRatings.map(r=>({...r,severity:r.severity??gn.HARM_SEVERITY_UNSUPPORTED,probabilityScore:r.probabilityScore??0,severityScore:r.severityScore??0}))),s.content?.parts?.some(r=>r?.videoMetadata))throw new f(u.UNSUPPORTED,"Part.videoMetadata is not supported in the Gemini Developer API. Please remove this property.");let i={index:s.index,content:s.content,finishReason:s.finishReason,finishMessage:s.finishMessage,safetyRatings:n,citationMetadata:o,groundingMetadata:s.groundingMetadata,urlContextMetadata:s.urlContextMetadata};t.push(i)}),t}function ti(e){let t=[];return e.safetyRatings.forEach(s=>{t.push({category:s.category,probability:s.probability,severity:s.severity??gn.HARM_SEVERITY_UNSUPPORTED,probabilityScore:s.probabilityScore??0,severityScore:s.severityScore??0,blocked:s.blocked})}),{blockReason:e.blockReason,safetyRatings:t,blockReasonMessage:e.blockReasonMessage}}var un=/^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;async function ni(e,t,n){let s=e.body.pipeThrough(new TextDecoderStream("utf8",{fatal:!0})),o=ri(s),[i,r]=o.tee(),{response:a,firstValue:c}=await si(r,t,n);return{stream:ii(i,t,n),response:a,firstValue:c}}async function si(e,t,n){let[s,o]=e.tee(),i=s.getReader(),{value:r}=await i.read();return{firstValue:r,response:oi(o,t,n)}}async function oi(e,t,n){let s=[],o=e.getReader();for(;;){let{done:i,value:r}=await o.read();if(i){let a=ai(s);return t.backend.backendType===k.GOOGLE_AI&&(a=ht(a)),Se(a,n)}s.push(r)}}async function*ii(e,t,n){let s=e.getReader();for(;;){let{value:o,done:i}=await s.read();if(i)break;let r;t.backend.backendType===k.GOOGLE_AI?r=Se(ht(o),n):r=Se(o,n);let a=r.candidates?.[0];!a?.content?.parts&&!a?.finishReason&&!a?.citationMetadata&&!a?.urlContextMetadata||(yield r)}}function ri(e){let t=e.getReader();return new ReadableStream({start(s){let o="";return i();function i(){return t.read().then(({value:r,done:a})=>{if(a){if(o.trim()){s.error(new f(u.PARSE_FAILED,"Failed to parse stream"));return}s.close();return}o+=r;let c=o.match(un),l;for(;c;){try{l=JSON.parse(c[1])}catch{s.error(new f(u.PARSE_FAILED,`Error parsing JSON response: "${c[1]}`));return}s.enqueue(l),o=o.substring(c[0].length),c=o.match(un)}return i()})}}})}function ai(e){let n={promptFeedback:e[e.length-1]?.promptFeedback};for(let s of e)if(s.candidates)for(let o of s.candidates){let i=o.index||0;n.candidates||(n.candidates=[]),n.candidates[i]||(n.candidates[i]={index:o.index}),n.candidates[i].citationMetadata=o.citationMetadata,n.candidates[i].finishReason=o.finishReason,n.candidates[i].finishMessage=o.finishMessage,n.candidates[i].safetyRatings=o.safetyRatings,n.candidates[i].groundingMetadata=o.groundingMetadata;let r=o.urlContextMetadata;if(typeof r=="object"&&r!==null&&Object.keys(r).length>0&&(n.candidates[i].urlContextMetadata=r),o.content){if(!o.content.parts)continue;n.candidates[i].content||(n.candidates[i].content={role:o.content.role||"user",parts:[]});for(let a of o.content.parts){let c={...a};a.text!==""&&Object.keys(c).length>0&&n.candidates[i].content.parts.push(c)}}}return n}var ci=[u.FETCH_ERROR,u.ERROR,u.API_NOT_ENABLED];async function yn(e,t,n,s){if(!t)return{response:await s(),inferenceSource:B.IN_CLOUD};switch(t.mode){case y.ONLY_ON_DEVICE:if(await t.isAvailable(e))return{response:await n(),inferenceSource:B.ON_DEVICE};throw new f(u.UNSUPPORTED,"Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.");case y.ONLY_IN_CLOUD:return{response:await s(),inferenceSource:B.IN_CLOUD};case y.PREFER_IN_CLOUD:try{return{response:await s(),inferenceSource:B.IN_CLOUD}}catch(o){if(o instanceof f&&ci.includes(o.code)&&await t.isAvailable(e))return{response:await n(),inferenceSource:B.ON_DEVICE};throw o}case y.PREFER_ON_DEVICE:return await t.isAvailable(e)?{response:await n(),inferenceSource:B.ON_DEVICE}:{response:await s(),inferenceSource:B.IN_CLOUD};default:throw new f(u.ERROR,`Unexpected infererence mode: ${t.mode}`)}}async function li(e,t,n,s){return e.backend.backendType===k.GOOGLE_AI&&(n=wn(n)),ut({task:"streamGenerateContent",model:t,apiSettings:e,stream:!0,singleRequestOptions:s},JSON.stringify(n))}async function An(e,t,n,s,o){let i=await yn(n,s,()=>s.generateContentStream(n),()=>li(e,t,n,o));return ni(i.response,e,i.inferenceSource)}async function di(e,t,n,s){return e.backend.backendType===k.GOOGLE_AI&&(n=wn(n)),ut({model:t,task:"generateContent",apiSettings:e,stream:!1,singleRequestOptions:s},JSON.stringify(n))}async function Sn(e,t,n,s,o){let i=await yn(n,s,()=>s.generateContent(n),()=>di(e,t,n,o)),r=await ui(i.response,e);return{response:Se(r,i.inferenceSource)}}async function ui(e,t){let n=await e.json();return t.backend.backendType===k.GOOGLE_AI?ht(n):n}function ft(e){if(e!=null){if(typeof e=="string")return{role:"system",parts:[{text:e}]};if(e.text)return{role:"system",parts:[e]};if(e.parts)return e.role?e:{role:"system",parts:e.parts}}}function ee(e){let t=[];if(typeof e=="string")t=[{text:e}];else for(let n of e)typeof n=="string"?t.push({text:n}):t.push(n);return hi(t)}function hi(e){let t={role:"user",parts:[]},n=!1,s=!1;for(let o of e)"functionResponse"in o?s=!0:n=!0,t.parts.push(o);if(n&&s)throw new f(u.INVALID_CONTENT,"Within a single message, FunctionResponse cannot be mixed with other type of Part in the request for sending chat message.");if(!n&&!s)throw new f(u.INVALID_CONTENT,"No Content is provided for sending chat message.");return t}function st(e){let t;return e.contents?t=e:t={contents:[ee(e)]},e.systemInstruction&&(t.systemInstruction=ft(e.systemInstruction)),t}var hn="SILENT_ERROR",fn=10,ct=class{constructor(t,n,s){this.params=n,this.requestOptions=s,this._history=[],this._sendPromise=Promise.resolve(),this._apiSettings=t}async getHistory(){return await this._sendPromise,this._history}async _sendMessage(t,n){let s={};await this._sendPromise;let o=[];return this._sendPromise=this._sendPromise.then(async()=>{let i,r=0,a=this.requestOptions?.maxSequentialFunctionCalls??fn;do{let c;if(i){r++;let m=await this._callFunctionsAsNeeded(i);c=ee(m)}else c=ee(t);let l=this._formatRequest(c,[...o]);o.push(c);let h=await this._callGenerateContent(l,n);if(h)if(s=h,i=this._getCallableFunctionCalls(h.response),h.response.candidates&&h.response.candidates.length>0){let m={parts:h.response.candidates?.[0].content.parts||[],role:h.response.candidates?.[0].content.role||"model"};o.push(m)}else{let m=G(h.response);m&&_.warn(`sendMessage() was unsuccessful. ${m}. Inspect response object for details.`)}else i=void 0}while(i&&r<a);i&&r>=a&&_.warn(`Automatic function calling exceeded the limit of ${a} function calls. Returning last model response.`)}),await this._sendPromise,this._history=this._history.concat(o),s}async _sendMessageStream(t,n){await this._sendPromise;let s=[],i=(async()=>{let r,a=0,c=this.requestOptions?.maxSequentialFunctionCalls??fn,l;do{let h;if(r){a++;let p=await this._callFunctionsAsNeeded(r);h=ee(p)}else h=ee(t);let m=this._formatRequest(h,[...s]);if(s.push(h),l=await this._callGenerateContentStream(m,n),r=this._getCallableFunctionCalls(l.firstValue),r&&l.firstValue&&l.firstValue.candidates&&l.firstValue.candidates.length>0){let p={...l.firstValue.candidates[0].content};p.role||(p.role="model"),s.push(p)}}while(r&&a<c);return r&&a>=c&&_.warn(`Automatic function calling exceeded the limit of ${c} function calls. Returning last model response.`),{stream:l.stream,response:l.response}})();return this._sendPromise=this._sendPromise.then(async()=>i).catch(r=>{throw new Error(hn)}).then(r=>r.response).then(r=>{if(r.candidates&&r.candidates.length>0){this._history=this._history.concat(s);let a={...r.candidates[0].content};a.role||(a.role="model"),this._history.push(a)}else{let a=G(r);a&&_.warn(`sendMessageStream() was unsuccessful. ${a}. Inspect response object for details.`)}}).catch(r=>{r.message!==hn&&r.name!=="AbortError"&&_.error(r)}),i}_getCallableFunctionCalls(t){let n=this.params?.tools?.find(o=>o.functionDeclarations);if(!n?.functionDeclarations)return;let s=_n(t);if(s){for(let o of s)if(!n.functionDeclarations?.some(r=>r.name===o.name&&typeof r.functionReference=="function"))return;return s}}async _callFunctionsAsNeeded(t){let n=[],s=[],o=this.params?.tools?.find(i=>i.functionDeclarations);if(o&&o.functionDeclarations){for(let r of t){let a=o.functionDeclarations.find(c=>c.name===r.name);if(a?.functionReference){let c=Promise.resolve(a.functionReference(r.args)).catch(l=>{let h=new f(u.ERROR,`Error in user-defined function "${a.name}": ${l.message}`);throw h.stack=l.stack,h});n.push({name:r.name,id:r.id,results:c}),s.push(c)}}await Promise.all(s);let i=[];for(let{name:r,id:a,results:c}of n){let l={name:r,response:await c};a&&(l.id=a),i.push({functionResponse:l})}return i}else throw new f(u.REQUEST_ERROR,'No function declarations were provided in "tools".')}};var pn=["text","inlineData","functionCall","functionResponse","thought","thoughtSignature"],fi={user:["text","inlineData","functionResponse"],function:["functionResponse"],model:["text","functionCall","thought","thoughtSignature"],system:["text"]},mn={user:["model"],function:["model"],model:["user","function"],system:[]};function pi(e){let t=null;for(let n of e){let{role:s,parts:o}=n;if(!t&&s!=="user")throw new f(u.INVALID_CONTENT,`First Content should be with role 'user', got ${s}`);if(!ln.includes(s))throw new f(u.INVALID_CONTENT,`Each item should include role field. Got ${s} but valid roles are: ${JSON.stringify(ln)}`);if(!Array.isArray(o))throw new f(u.INVALID_CONTENT,"Content should have 'parts' property with an array of Parts");if(o.length===0)throw new f(u.INVALID_CONTENT,"Each Content should have at least one part");let i={text:0,inlineData:0,functionCall:0,functionResponse:0,thought:0,thoughtSignature:0,executableCode:0,codeExecutionResult:0};for(let a of o)for(let c of pn)c in a&&(i[c]+=1);let r=fi[s];for(let a of pn)if(!r.includes(a)&&i[a]>0)throw new f(u.INVALID_CONTENT,`Content with role '${s}' can't contain '${a}' part`);if(t&&!mn[s].includes(t.role))throw new f(u.INVALID_CONTENT,`Content with role '${s}' can't follow '${t.role}'. Valid previous roles: ${JSON.stringify(mn)}`);t=n}}var lt=class extends ct{constructor(t,n,s,o,i){super(t,o,i),this.model=n,this.chromeAdapter=s,this.params=o,this.requestOptions=i,o?.history&&(pi(o.history),this._history=o.history),this.params?.systemInstruction!=null&&(this.params={...this.params,systemInstruction:ft(this.params.systemInstruction)})}_formatRequest(t,n){return{safetySettings:this.params?.safetySettings,generationConfig:this.params?.generationConfig,tools:this.params?.tools,toolConfig:this.params?.toolConfig,systemInstruction:this.params?.systemInstruction,contents:[...this._history,...n,t]}}_callGenerateContent(t,n){return Sn(this._apiSettings,this.model,t,this.chromeAdapter,{...this.requestOptions,...n})}_callGenerateContentStream(t,n){return An(this._apiSettings,this.model,t,this.chromeAdapter,{...this.requestOptions,...n})}async sendMessage(t,n){return this._sendMessage(t,n)}async sendMessageStream(t,n){return this._sendMessageStream(t,n)}};async function mi(e,t,n,s){let o="";if(e.backend.backendType===k.GOOGLE_AI){let r=Zo(n,t);o=JSON.stringify(r)}else o=JSON.stringify(n);return(await ut({model:t,task:"countTokens",apiSettings:e,stream:!1,singleRequestOptions:s},o)).json()}async function gi(e,t,n,s,o){if(s?.mode===y.ONLY_ON_DEVICE)throw new f(u.UNSUPPORTED,"countTokens() is not supported for on-device models.");return mi(e,t,n,o)}var dt=class extends rt{constructor(t,n,s,o){super(t,n.model),this.chromeAdapter=o,this.generationConfig=n.generationConfig||{},Ei(this.generationConfig),this.safetySettings=n.safetySettings||[],this.tools=n.tools,this.toolConfig=n.toolConfig,this.systemInstruction=ft(n.systemInstruction),this.requestOptions=s||{}}async initializeDeviceModel(t){if(!this.chromeAdapter||this.chromeAdapter.mode===y.ONLY_IN_CLOUD)return;if(await this.chromeAdapter.downloadIfAvailable(t)===P.UNAVAILABLE){let s=new f(u.API_NOT_ENABLED,"Local LanguageModel API not available in this environment.");if(this.chromeAdapter.mode===y.ONLY_ON_DEVICE)throw s;_.debug(s.message)}await this.chromeAdapter.downloadPromise}async generateContent(t,n){let s=st(t);return Sn(this._apiSettings,this.model,{generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,...s},this.chromeAdapter,{...this.requestOptions,...n})}async generateContentStream(t,n){let s=st(t),{stream:o,response:i}=await An(this._apiSettings,this.model,{generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,...s},this.chromeAdapter,{...this.requestOptions,...n});return{stream:o,response:i}}startChat(t){return new lt(this._apiSettings,this.model,this.chromeAdapter,{tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,generationConfig:this.generationConfig,safetySettings:this.safetySettings,...t},this.requestOptions)}async countTokens(t,n){let s=st(t);return gi(this._apiSettings,this.model,s,this.chromeAdapter,{...this.requestOptions,...n})}};function Ei(e){if(e.thinkingConfig?.thinkingBudget!=null&&e.thinkingConfig?.thinkingLevel)throw new f(u.UNSUPPORTED,"Cannot set both thinkingBudget and thinkingLevel in a config.");if(e.responseSchema!=null&&e.responseJsonSchema!=null)throw new f(u.UNSUPPORTED,"Cannot set both responseSchema and responseJsonSchema in a config.");if((e.responseSchema!=null||e.responseJsonSchema!=null)&&e.responseMimeType!=="application/json"&&e.responseMimeType!=="text/x.enum")throw new f(u.UNSUPPORTED,'responseMimeType must be set to "application/json" or "text/x.enum" if responseSchema or responseJsonSchema are set.')}var _i="audio-processor",fr=`
  class AudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.targetSampleRate = options.processorOptions.targetSampleRate;
      // 'sampleRate' is a global variable available inside the AudioWorkletGlobalScope,
      // representing the native sample rate of the AudioContext.
      this.inputSampleRate = sampleRate;
    }

    /**
     * This method is called by the browser's audio engine for each block of audio data.
     * Input is a single input, with a single channel (input[0][0]).
     */
    process(inputs) {
      const input = inputs[0];
      if (input && input.length > 0 && input[0].length > 0) {
        const pcmData = input[0]; // Float32Array of raw audio samples.
        
        // Simple linear interpolation for resampling.
        const resampled = new Float32Array(Math.round(pcmData.length * this.targetSampleRate / this.inputSampleRate));
        const ratio = pcmData.length / resampled.length;
        for (let i = 0; i < resampled.length; i++) {
          resampled[i] = pcmData[Math.floor(i * ratio)];
        }

        // Convert Float32 (-1, 1) samples to Int16 (-32768, 32767)
        const resampledInt16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          const sample = Math.max(-1, Math.min(1, resampled[i]));
          if (sample < 0) {
            resampledInt16[i] = sample * 32768;
          } else {
            resampledInt16[i] = sample * 32767;
          }
        }
        
        this.port.postMessage(resampledInt16);
      }
      // Return true to keep the processor alive and processing the next audio block.
      return true;
    }
  }

  // Register the processor with a name that can be used to instantiate it from the main thread.
  registerProcessor('${_i}', AudioProcessor);
`;function Cn(e=me(),t){e=ue(e);let n=Q(e,V),s=t?.backend??new j,o={useLimitedUseAppCheckTokens:t?.useLimitedUseAppCheckTokens??!1},i=Go(s),r=n.getImmediate({identifier:i});return r.options=o,r}var bi=["mode","onDeviceParams","inCloudParams"];function On(e,t,n){let s=t,o;if(s.mode){for(let a of Object.keys(t))bi.includes(a)||_.warn(`When a hybrid inference mode is specified (mode is currently set to ${s.mode}), "${a}" cannot be configured at the top level. Configuration for in-cloud and on-device must be done separately in inCloudParams and onDeviceParams. Configuration values set outside of inCloudParams and onDeviceParams will be ignored.`);o=s.inCloudParams||{model:Ho}}else o=t;if(!o.model)throw new f(u.NO_MODEL,"Must provide a model name. Example: getGenerativeModel({ model: 'my-model-name' })");let i=e.chromeAdapterFactory?.(s.mode,typeof window>"u"?void 0:window,s.onDeviceParams),r=new dt(e,o,n,i);return r._apiSettings.inferenceMode=s.mode,r}function wi(){x(new O(V,Wo,"PUBLIC").setMultipleInstances(!0)),v(an,ot),v(an,ot,"esm2020")}wi();var yi={apiKey:"AIzaSyDHK53_j09cnCJfGhtdjleUBn654JJe2xM",authDomain:"aion-hybrid-ai.firebaseapp.com",projectId:"aion-hybrid-ai",storageBucket:"aion-hybrid-ai.firebasestorage.app",messagingSenderId:"55910897023",appId:"1:55910897023:web:cb220aba6e2da44f20f64a"},In="6LdmoCouAAAAAF9w5FhIjQOyP6q3VtKIm3aM3QeQ",ie=["gemini-3.5-flash-lite","gemini-4-hydrogen"],oe="aion_hybrid_mode",_t="aion_hybrid_offline_demo",bt="prefer_in_cloud",Ce="aion_appcheck_debug_token",Y={prefer_on_device:y.PREFER_ON_DEVICE,only_on_device:y.ONLY_ON_DEVICE,prefer_in_cloud:y.PREFER_IN_CLOUD},d=window.AionHybridState={ready:!1,mode:bt,nano:"checking",nanoDetail:"",appCheck:{status:"off",detail:""},offlineDemo:!1,cloudModel:ie[0],debugToken:""},b=e=>document.getElementById(e),F=e=>{try{return localStorage.getItem(e)}catch{return null}},vn=(e,t)=>{try{localStorage.setItem(e,t)}catch{}},Oe,Te=null;try{Oe=je(yi)}catch(e){console.error("[hybrid] Firebase init failed",e),d.appCheck={status:"error",detail:"Firebase init failed: "+e.message}}var kn=["aion-hybrid-ai.web.app","aion-hybrid-ai.firebaseapp.com"],Ai=["localhost","127.0.0.1","[::1]"];function Si(){let e=location.hostname;return kn.includes(e)?!1:Ai.includes(e)?!0:new URLSearchParams(location.search).has("appcheck_debug")||!In}d.isProductionHost=kn.includes(location.hostname);if(Oe){try{let e=Si();if(e){let n=F(Ce);if(n)self.FIREBASE_APPCHECK_DEBUG_TOKEN=n,d.debugToken=n;else{self.FIREBASE_APPCHECK_DEBUG_TOKEN=!0;let s=console.log,o=Date.now()+8e3;console.log=function(...i){try{let r=String(i[0]||"").match(/App Check debug token:\s*([0-9a-fA-F-]{36})/);r&&(d.debugToken=r[1],W())}catch{}s.apply(console,i),Date.now()>o&&(console.log=s)}}}let t=on(Oe,{provider:new be(In||"recaptcha-site-key-not-configured"),isTokenAutoRefreshEnabled:!0});if(!window.AION_OFFLINE_DEMO&&F(_t)!=="1"){let n=performance.now();d.appCheckWarm="warming",rn(t,!1).then(s=>{if(s&&s.error){d.appCheckWarm="failed",console.warn("[hybrid] App Check warm-up failed:",s.error&&s.error.message);return}d.appCheckWarm="ready",d.appCheckWarmMs=Math.round(performance.now()-n)},s=>{d.appCheckWarm="failed",console.warn("[hybrid] App Check warm-up failed:",s&&s.message)})}d.appCheck=e?{status:"debug",detail:"App Check debug provider. The debug token must be registered in Firebase console (App Check > Apps > Manage debug tokens)."}:{status:"recaptcha",detail:"App Check with reCAPTCHA Enterprise."}}catch(e){console.error("[hybrid] App Check init failed",e),d.appCheck={status:"error",detail:"App Check failed to start: "+e.message}}try{Te=Cn(Oe,{backend:new j})}catch(e){console.error("[hybrid] AI Logic init failed",e)}}var pt={};function Dn(e,t){if(!Te)throw new Error("Firebase AI Logic is not initialised.");let n=e+"|"+(t||ie[0]);return pt[n]||(pt[n]=On(Te,{mode:Y[e],inCloudParams:{model:t||ie[0]}})),pt[n]}function Ci(e){let t=[String(e&&e.message||e)];e&&e.code&&t.push("code="+e.code);let n=e&&e.customErrorData;if(n&&(n.status&&t.push("http="+n.status+(n.statusText?" "+n.statusText:"")),n.errorDetails))try{t.push("details="+JSON.stringify(n.errorDetails).slice(0,600))}catch{}return t.join(" | ")}var Oi={expectedInputs:[{type:"text",languages:["en"]}],expectedOutputs:[{type:"text",languages:["en"]}]};function Ti(){let e=navigator.userAgent.match(/\bChrome\/(\d+)/),t=/\b(Edg|OPR)\//.test(navigator.userAgent);return e&&!t?parseInt(e[1],10):null}async function re(){let e=Ti(),t="unsupported",n="";if(typeof window.LanguageModel>"u")e===null?n="Use desktop Chrome 139 or newer for on-device AI.":e<139?n="Chrome "+e+" is too old - on-device AI needs Chrome 139+.":n="Chrome's Prompt API is off. See README (chrome://flags).";else try{let s=await window.LanguageModel.availability(Oi);t=s==="available"?"ready":s==="downloadable"?"downloadable":s==="downloading"?"downloading":"unavailable",t==="unavailable"&&(n="This device cannot run Gemini Nano (needs enough storage and a supported computer).")}catch(s){t="unavailable",n="Could not check Gemini Nano: "+s.message}d.nano==="downloading"&&t==="downloading"&&d.nanoDetail.indexOf("%")>=0||(t!==d.nano||n!==d.nanoDetail)&&(d.nano=t,d.nanoDetail=n,W())}async function Nn(){if(!(d.nano!=="downloadable"&&d.nano!=="downloading")){d.nano="downloading",d.nanoDetail="0%",W();try{await Dn("only_on_device").initializeDeviceModel(e=>{d.nanoDetail=Math.round(e*100)+"%",W()})}catch(e){d.nanoDetail="Download failed: "+e.message}d.nanoDetail="",await re()}}var S={on_device:"on_device",in_cloud:"in_cloud"},Ln=15e3,Pn=12e4;function Ri(e){return e==="only_on_device"?S.on_device:e==="prefer_on_device"?d.nano==="ready"?S.on_device:S.in_cloud:navigator.onLine===!1?S.on_device:S.in_cloud}var gt=class extends Error{constructor(t){super(t),this.name="InferenceTimeoutError",this.code="timeout"}};function Ii(e,t,n,s,o){let i=typeof AbortController=="function"?new AbortController:null,r=!1;return new Promise((a,c)=>{let l=null,h=p=>{clearTimeout(l),l=setTimeout(()=>{if(!r){r=!0;try{i&&i.abort()}catch{}c(new gt(o+" did not "+p+" within "+Math.round(s/1e3)+" s - stopped waiting (timeout). Nothing was retried automatically."))}},s)},m=performance.now();h("start answering"),(async()=>{let p=await e.generateContentStream(t,i?{signal:i.signal}:void 0),T="",C=null;for await(let xn of p.stream){if(r)return;let ce="";try{ce=xn.text()}catch{ce=""}if(h("send more text"),!!ce&&(C===null&&(C=Math.round(performance.now()-m)),T+=ce,typeof n=="function"))try{n(T)}catch{}}let ae=await p.response;r||(r=!0,clearTimeout(l),a({response:ae,soFar:T,firstChunkMs:C,latencyMs:Math.round(performance.now()-m)}))})().catch(p=>{r||(r=!0,clearTimeout(l),c(p))})})}async function vi(e,t,n){let s=n&&Y[n.mode]?n.mode:d.mode;if(n&&n.sealed===!1&&s!=="only_on_device"){let a=new Error("Refused: this prompt contains unsealed private context and the route ("+s.replace(/_/g," ")+") can reach the cloud. Nothing was sent.");throw a.code="unsealed_refused",a}let o=[],i=s==="only_on_device"?[ie[0]]:ie,r=Ri(s);for(let a=0;a<i.length;a++){let c=i[a];try{let l=Dn(s,c),h=r===S.on_device?Pn:Ln,m=r===S.on_device?"On-device Gemini Nano":"Cloud model "+c,p=await Ii(l,e,t,h,m),T=p.soFar||p.response.text(),C=p.response.inferenceSource,ae=C===S.on_device||C===S.in_cloud;return ae||(C=s==="only_on_device"||s==="prefer_on_device"&&d.nano==="ready"?S.on_device:S.in_cloud),C===S.in_cloud&&(d.cloudModel=c),{text:T||"(The model returned an empty reply.)",source:C,latencyMs:p.latencyMs,firstChunkMs:p.firstChunkMs,mode:s,requested_mode:s,actual_source:C,source_verified:ae,model:C===S.on_device?"Gemini Nano":c}}catch(l){if(l&&l.name==="InferenceTimeoutError"){o.push(i.length>1?c+": "+l.message:l.message);let p=new Error(o.join(`
`));throw p.code="timeout",p}let h=Ci(l);if(o.push(i.length>1?c+": "+h:h),!(/model|not found|404|unsupported|not supported|invalid argument|400/i.test(h)&&!/app.?check|api.?key|permission|quota|network|failed to fetch/i.test(h))||a===i.length-1){let p=new Error(o.join(`
`));throw p.code=l&&l.code,p}}}}var Tn={checking:"Gemini Nano: checking\u2026",ready:"Gemini Nano: ready",downloadable:"Gemini Nano: needs download",downloading:"Gemini Nano: downloading",unavailable:"Gemini Nano: unavailable",unsupported:"Gemini Nano: not supported here"},ki={ready:"ok",downloading:"warn",downloadable:"warn",checking:"warn"};function W(){let e=b("nanoPill");if(!e)return;let t=ki[d.nano]||"bad";e.className="pill hy-nano hy-"+t,e.title=d.nanoDetail||Tn[d.nano];let n=Tn[d.nano];d.nano==="downloading"&&d.nanoDetail&&(n+=" "+d.nanoDetail),b("nanoLabel").textContent=n;let s=b("nanoDownloadBtn");s.hidden=d.nano!=="downloadable";let o=b("nanoHint");o&&(o.textContent=d.nano==="ready"||d.nano==="checking"||d.nano==="downloading"?"":d.nanoDetail);let i=b("offlineDemo");i&&(i.checked=d.offlineDemo);let r=b("inferenceMode");r&&(r.value=d.mode,r.disabled=d.offlineDemo);let a=b("appCheckPill");if(a){let h=d.appCheck.status==="recaptcha"||d.appCheck.status==="debug";a.className="pill hy-"+(h?d.appCheck.status==="debug"?"warn":"ok":"bad"),b("appCheckLabel").textContent="App Check: "+d.appCheck.status,a.title=d.appCheck.detail}let c=b("appCheckCopyBtn");c&&(c.hidden=!(d.appCheck.status==="debug"&&d.debugToken));let l=b("appCheckSetBtn");l&&(l.hidden=d.appCheck.status!=="debug")}function mt(e){let t=b("backendLabel");t&&(t.textContent=e==="live"?"Local AION backend":"Standalone demo data",b("backendPill").title=e==="live"?"A local AION server answered; chat goes through it, not through Firebase.":"No backend connected - memories, tasks and approvals live in this browser (IndexedDB).")}function Mn(e){Y[e]&&(d.mode=e,vn(oe,e),W())}function Et(e){d.offlineDemo=!!e,window.AION_OFFLINE_DEMO=!!e,vn(_t,e?"1":"0"),e?(d.modeBeforeOffline=d.mode,d.mode="only_on_device"):d.modeBeforeOffline?(d.mode=d.modeBeforeOffline,d.modeBeforeOffline=null):d.mode=F(oe)&&Y[F(oe)]?F(oe):bt,document.body.classList.toggle("offline-demo",!!e);let t=b("offlineNote");t&&(t.hidden=!e,t.textContent="Offline Demo Mode: this page blocks all external network calls and answers only with on-device Gemini Nano. Turn on airplane mode as well to prove it."),W()}function Di(){let e=b("inferenceMode");if(!e)return;e.addEventListener("change",()=>Mn(e.value)),b("offlineDemo").addEventListener("change",s=>Et(s.target.checked)),b("nanoDownloadBtn").addEventListener("click",Nn);let t=b("appCheckCopyBtn");t&&t.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(d.debugToken),t.textContent="COPIED"}catch{window.prompt("Copy this debug token:",d.debugToken)}setTimeout(()=>{t.textContent="COPY TOKEN"},1800)});let n=b("appCheckSetBtn");n&&n.addEventListener("click",()=>{let s=window.prompt("Paste the App Check debug token that is registered in Firebase console (leave empty to forget the saved one). The page reloads to use it.",F(Ce)||"");if(s===null)return;let o=s.trim();if(o&&!/^[0-9a-fA-F-]{36}$/.test(o)){window.alert("That does not look like a debug token (36 characters, letters, digits and dashes).");return}try{o?localStorage.setItem(Ce,o):localStorage.removeItem(Ce)}catch{}location.reload()}),window.addEventListener("online",re),window.addEventListener("offline",re),window.addEventListener("aion:backend-mode",s=>mt(s.detail)),window.AionBackendMode?mt(window.AionBackendMode):window.AionStandalone&&window.AionStandalone.detectMode().then(mt)}function Rn(){let e=F(oe);d.mode=e&&Y[e]?e:bt,Di(),F(_t)==="1"&&Et(!0),W(),re(),setInterval(re,6e3),d.ready=!!Te,window.AionHybrid={generate:vi,getMode:()=>d.mode,setMode:Mn,setOfflineDemo:Et,downloadNano:Nn,state:d,modes:Object.keys(Y),mayReachCloud:t=>(t||d.mode)!=="only_on_device",timeouts:{cloudMs:Ln,localMs:Pn}},window.__resolveAionHybrid&&window.__resolveAionHybrid(window.AionHybrid)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Rn):Rn();
/*! Bundled license information:

@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
@firebase/logger/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/util/dist/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/component/dist/esm/index.esm.js:
@firebase/app/dist/esm/index.esm.js:
@firebase/app/dist/esm/index.esm.js:
@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2019 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

firebase/app/dist/esm/index.esm.js:
@firebase/app-check/dist/esm/index.esm.js:
@firebase/app-check/dist/esm/index.esm.js:
@firebase/app-check/dist/esm/index.esm.js:
@firebase/app-check/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/app-check/dist/esm/index.esm.js:
@firebase/app-check/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2024 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/ai/dist/esm/index.esm.js:
@firebase/ai/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2024 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/ai/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2024 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2026 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
  (**
   * @license
   * Copyright 2025 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@firebase/ai/dist/esm/index.esm.js:
  (**
   * @license
   * Copyright 2026 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
*/

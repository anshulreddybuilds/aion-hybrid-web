var bt=()=>{};var yt=function(e){let t=[],n=0;for(let s=0;s<e.length;s++){let o=e.charCodeAt(s);o<128?t[n++]=o:o<2048?(t[n++]=o>>6|192,t[n++]=o&63|128):(o&64512)===55296&&s+1<e.length&&(e.charCodeAt(s+1)&64512)===56320?(o=65536+((o&1023)<<10)+(e.charCodeAt(++s)&1023),t[n++]=o>>18|240,t[n++]=o>>12&63|128,t[n++]=o>>6&63|128,t[n++]=o&63|128):(t[n++]=o>>12|224,t[n++]=o>>6&63|128,t[n++]=o&63|128)}return t},Pn=function(e){let t=[],n=0,s=0;for(;n<e.length;){let o=e[n++];if(o<128)t[s++]=String.fromCharCode(o);else if(o>191&&o<224){let i=e[n++];t[s++]=String.fromCharCode((o&31)<<6|i&63)}else if(o>239&&o<365){let i=e[n++],r=e[n++],a=e[n++],c=((o&7)<<18|(i&63)<<12|(r&63)<<6|a&63)-65536;t[s++]=String.fromCharCode(55296+(c>>10)),t[s++]=String.fromCharCode(56320+(c&1023))}else{let i=e[n++],r=e[n++];t[s++]=String.fromCharCode((o&15)<<12|(i&63)<<6|r&63)}}return t.join("")},ce={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(e,t){if(!Array.isArray(e))throw Error("encodeByteArray takes an array as a parameter");this.init_();let n=t?this.byteToCharMapWebSafe_:this.byteToCharMap_,s=[];for(let o=0;o<e.length;o+=3){let i=e[o],r=o+1<e.length,a=r?e[o+1]:0,c=o+2<e.length,l=c?e[o+2]:0,f=i>>2,p=(i&3)<<4|a>>4,m=(a&15)<<2|l>>6,j=l&63;c||(j=64,r||(m=64)),s.push(n[f],n[p],n[m],n[j])}return s.join("")},encodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?btoa(e):this.encodeByteArray(yt(e),t)},decodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?atob(e):Pn(this.decodeStringToByteArray(e,t))},decodeStringToByteArray(e,t){this.init_();let n=t?this.charToByteMapWebSafe_:this.charToByteMap_,s=[];for(let o=0;o<e.length;){let i=n[e.charAt(o++)],a=o<e.length?n[e.charAt(o)]:0;++o;let l=o<e.length?n[e.charAt(o)]:64;++o;let p=o<e.length?n[e.charAt(o)]:64;if(++o,i==null||a==null||l==null||p==null)throw new Re;let m=i<<2|a>>4;if(s.push(m),l!==64){let j=a<<4&240|l>>2;if(s.push(j),p!==64){let Te=l<<6&192|p;s.push(Te)}}}return s},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let e=0;e<this.ENCODED_VALS.length;e++)this.byteToCharMap_[e]=this.ENCODED_VALS.charAt(e),this.charToByteMap_[this.byteToCharMap_[e]]=e,this.byteToCharMapWebSafe_[e]=this.ENCODED_VALS_WEBSAFE.charAt(e),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[e]]=e,e>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(e)]=e,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(e)]=e)}}},Re=class extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}},Mn=function(e){let t=yt(e);return ce.encodeByteArray(t,!0)},Ie=function(e){return Mn(e).replace(/\./g,"")},At=function(e){try{return ce.decodeString(e,!0)}catch(t){console.error("base64Decode failed: ",t)}return null};function Y(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}var xn=()=>Y().__FIREBASE_DEFAULTS__,Un=()=>{if(typeof process>"u"||typeof process.env>"u")return;let e=process.env.__FIREBASE_DEFAULTS__;if(e)return JSON.parse(e)},Bn=()=>{if(typeof document>"u")return;let e;try{e=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}let t=e&&At(e[1]);return t&&JSON.parse(t)},Fn=()=>{try{return bt()||xn()||Un()||Bn()}catch(e){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${e}`);return}};var ve=()=>Fn()?.config;var C=class{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((t,n)=>{this.resolve=t,this.reject=n})}wrapCallback(t){return(n,s)=>{n?this.reject(n):this.resolve(s),typeof t=="function"&&(this.promise.catch(()=>{}),t.length===1?t(n):t(n,s))}}};function q(){try{return typeof indexedDB=="object"}catch{return!1}}function St(){return new Promise((e,t)=>{try{let n=!0,s="validate-browser-context-for-indexeddb-analytics-module",o=self.indexedDB.open(s);o.onsuccess=()=>{o.result.close(),n||self.indexedDB.deleteDatabase(s),e(!0)},o.onupgradeneeded=()=>{n=!1},o.onerror=()=>{t(o.error?.message||"")}}catch(n){t(n)}})}var $n="FirebaseError",I=class e extends Error{constructor(t,n,s){super(n),this.code=t,this.customData=s,this.name=$n,Object.setPrototypeOf(this,e.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,U.prototype.create)}},U=class{constructor(t,n,s){this.service=t,this.serviceName=n,this.errors=s}create(t,...n){let s=n[0]||{},o=`${this.service}/${t}`,i=this.errors[t],r=i?Hn(i,s):"Error",a=`${this.serviceName}: ${r} (${o}).`;return new I(o,a,s)}};function Hn(e,t){try{let n=0,s="";for(;n<e.length;){let o=e.indexOf("{$",n);if(o===-1){s+=e.substring(n);break}let i=e.indexOf("}",o+2);if(i===-1){s+=e.substring(n);break}let r=e.substring(o+2,i),a=t[r];s+=e.substring(n,o)+(a!=null?String(a):`<${r}?>`),n=i+1}return s}catch{return e}}function le(e,t){if(e===t)return!0;let n=Object.keys(e),s=Object.keys(t);for(let o of n){if(!s.includes(o))return!1;let i=e[o],r=t[o];if(wt(i)&&wt(r)){if(!le(i,r))return!1}else if(i!==r)return!1}for(let o of s)if(!n.includes(o))return!1;return!0}function wt(e){return e!==null&&typeof e=="object"}var Gn=1e3,Vn=2,jn=14400*1e3,Wn=.5;function Ct(e,t=Gn,n=Vn){let s=t*Math.pow(n,e),o=Math.round(Wn*s*(Math.random()-.5)*2);return Math.min(jn,s+o)}function de(e){return e&&e._delegate?e._delegate:e}var S=class{constructor(t,n,s){this.name=t,this.instanceFactory=n,this.type=s,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(t){return this.instantiationMode=t,this}setMultipleInstances(t){return this.multipleInstances=t,this}setServiceProps(t){return this.serviceProps=t,this}setInstanceCreatedCallback(t){return this.onInstanceCreated=t,this}};var B="[DEFAULT]";var ke=class{constructor(t,n){this.name=t,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(t){let n=this.normalizeInstanceIdentifier(t);if(!this.instancesDeferred.has(n)){let s=new C;if(this.instancesDeferred.set(n,s),this.isInitialized(n)||this.shouldAutoInitialize())try{let o=this.getOrInitializeService({instanceIdentifier:n});o&&s.resolve(o)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(t){let n=this.normalizeInstanceIdentifier(t?.identifier),s=t?.optional??!1;if(this.isInitialized(n)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:n})}catch(o){if(s)return null;throw o}else{if(s)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(t){if(t.name!==this.name)throw Error(`Mismatching Component ${t.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=t,!!this.shouldAutoInitialize()){if(zn(t))try{this.getOrInitializeService({instanceIdentifier:B})}catch{}for(let[n,s]of this.instancesDeferred.entries()){let o=this.normalizeInstanceIdentifier(n);try{let i=this.getOrInitializeService({instanceIdentifier:o});s.resolve(i)}catch{}}}}clearInstance(t=B){this.instancesDeferred.delete(t),this.instancesOptions.delete(t),this.instances.delete(t)}async delete(){let t=Array.from(this.instances.values());await Promise.all([...t.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...t.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(t=B){return this.instances.has(t)}getOptions(t=B){return this.instancesOptions.get(t)||{}}initialize(t={}){let{options:n={}}=t,s=this.normalizeInstanceIdentifier(t.instanceIdentifier);if(this.isInitialized(s))throw Error(`${this.name}(${s}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);let o=this.getOrInitializeService({instanceIdentifier:s,options:n});for(let[i,r]of this.instancesDeferred.entries()){let a=this.normalizeInstanceIdentifier(i);s===a&&r.resolve(o)}return o}onInit(t,n){let s=this.normalizeInstanceIdentifier(n),o=this.onInitCallbacks.get(s)??new Set;o.add(t),this.onInitCallbacks.set(s,o);let i=this.instances.get(s);return i&&t(i,s),()=>{o.delete(t)}}invokeOnInitCallbacks(t,n){let s=this.onInitCallbacks.get(n);if(s)for(let o of s)try{o(t,n)}catch{}}getOrInitializeService({instanceIdentifier:t,options:n={}}){let s=this.instances.get(t);if(!s&&this.component&&(s=this.component.instanceFactory(this.container,{instanceIdentifier:Kn(t),options:n}),this.instances.set(t,s),this.instancesOptions.set(t,n),this.invokeOnInitCallbacks(s,t),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,t,s)}catch{}return s||null}normalizeInstanceIdentifier(t=B){return this.component?this.component.multipleInstances?t:B:t}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}};function Kn(e){return e===B?void 0:e}function zn(e){return e.instantiationMode==="EAGER"}var ue=class{constructor(t){this.name=t,this.providers=new Map}addComponent(t){let n=this.getProvider(t.name);if(n.isComponentSet())throw new Error(`Component ${t.name} has already been registered with ${this.name}`);n.setComponent(t)}addOrOverwriteComponent(t){this.getProvider(t.name).isComponentSet()&&this.providers.delete(t.name),this.addComponent(t)}getProvider(t){if(this.providers.has(t))return this.providers.get(t);let n=new ke(t,this);return this.providers.set(t,n),n}getProviders(){return Array.from(this.providers.values())}};var Yn=[],g;(function(e){e[e.DEBUG=0]="DEBUG",e[e.VERBOSE=1]="VERBOSE",e[e.INFO=2]="INFO",e[e.WARN=3]="WARN",e[e.ERROR=4]="ERROR",e[e.SILENT=5]="SILENT"})(g||(g={}));var qn={debug:g.DEBUG,verbose:g.VERBOSE,info:g.INFO,warn:g.WARN,error:g.ERROR,silent:g.SILENT},Jn=g.INFO,Xn={[g.DEBUG]:"log",[g.VERBOSE]:"log",[g.INFO]:"info",[g.WARN]:"warn",[g.ERROR]:"error"},Qn=(e,t,...n)=>{if(t<e.logLevel)return;let s=new Date().toISOString(),o=Xn[t];if(o)console[o](`[${s}]  ${e.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${t})`)},N=class{constructor(t){this.name=t,this._logLevel=Jn,this._logHandler=Qn,this._userLogHandler=null,Yn.push(this)}get logLevel(){return this._logLevel}set logLevel(t){if(!(t in g))throw new TypeError(`Invalid value "${t}" assigned to \`logLevel\``);this._logLevel=t}setLogLevel(t){this._logLevel=typeof t=="string"?qn[t]:t}get logHandler(){return this._logHandler}set logHandler(t){if(typeof t!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=t}get userLogHandler(){return this._userLogHandler}set userLogHandler(t){this._userLogHandler=t}debug(...t){this._userLogHandler&&this._userLogHandler(this,g.DEBUG,...t),this._logHandler(this,g.DEBUG,...t)}log(...t){this._userLogHandler&&this._userLogHandler(this,g.VERBOSE,...t),this._logHandler(this,g.VERBOSE,...t)}info(...t){this._userLogHandler&&this._userLogHandler(this,g.INFO,...t),this._logHandler(this,g.INFO,...t)}warn(...t){this._userLogHandler&&this._userLogHandler(this,g.WARN,...t),this._logHandler(this,g.WARN,...t)}error(...t){this._userLogHandler&&this._userLogHandler(this,g.ERROR,...t),this._logHandler(this,g.ERROR,...t)}};var Zn=(e,t)=>t.some(n=>e instanceof n),Ot,Tt;function es(){return Ot||(Ot=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function ts(){return Tt||(Tt=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}var Rt=new WeakMap,Ne=new WeakMap,It=new WeakMap,De=new WeakMap,Pe=new WeakMap;function ns(e){let t=new Promise((n,s)=>{let o=()=>{e.removeEventListener("success",i),e.removeEventListener("error",r)},i=()=>{n(O(e.result)),o()},r=()=>{s(e.error),o()};e.addEventListener("success",i),e.addEventListener("error",r)});return t.then(n=>{n instanceof IDBCursor&&Rt.set(n,e)}).catch(()=>{}),Pe.set(t,e),t}function ss(e){if(Ne.has(e))return;let t=new Promise((n,s)=>{let o=()=>{e.removeEventListener("complete",i),e.removeEventListener("error",r),e.removeEventListener("abort",r)},i=()=>{n(),o()},r=()=>{s(e.error||new DOMException("AbortError","AbortError")),o()};e.addEventListener("complete",i),e.addEventListener("error",r),e.addEventListener("abort",r)});Ne.set(e,t)}var Le={get(e,t,n){if(e instanceof IDBTransaction){if(t==="done")return Ne.get(e);if(t==="objectStoreNames")return e.objectStoreNames||It.get(e);if(t==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return O(e[t])},set(e,t,n){return e[t]=n,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function vt(e){Le=e(Le)}function os(e){return e===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(t,...n){let s=e.call(he(this),t,...n);return It.set(s,t.sort?t.sort():[t]),O(s)}:ts().includes(e)?function(...t){return e.apply(he(this),t),O(Rt.get(this))}:function(...t){return O(e.apply(he(this),t))}}function is(e){return typeof e=="function"?os(e):(e instanceof IDBTransaction&&ss(e),Zn(e,es())?new Proxy(e,Le):e)}function O(e){if(e instanceof IDBRequest)return ns(e);if(De.has(e))return De.get(e);let t=is(e);return t!==e&&(De.set(e,t),Pe.set(t,e)),t}var he=e=>Pe.get(e);function Dt(e,t,{blocked:n,upgrade:s,blocking:o,terminated:i}={}){let r=indexedDB.open(e,t),a=O(r);return s&&r.addEventListener("upgradeneeded",c=>{s(O(r.result),c.oldVersion,c.newVersion,O(r.transaction),c)}),n&&r.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),a.then(c=>{i&&c.addEventListener("close",()=>i()),o&&c.addEventListener("versionchange",l=>o(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}var rs=["get","getKey","getAll","getAllKeys","count"],as=["put","add","delete","clear"],Me=new Map;function kt(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if(Me.get(t))return Me.get(t);let n=t.replace(/FromIndex$/,""),s=t!==n,o=as.includes(n);if(!(n in(s?IDBIndex:IDBObjectStore).prototype)||!(o||rs.includes(n)))return;let i=async function(r,...a){let c=this.transaction(r,o?"readwrite":"readonly"),l=c.store;return s&&(l=l.index(a.shift())),(await Promise.all([l[n](...a),o&&c.done]))[0]};return Me.set(t,i),i}vt(e=>({...e,get:(t,n,s)=>kt(t,n)||e.get(t,n,s),has:(t,n)=>!!kt(t,n)||e.has(t,n)}));var Ue=class{constructor(t){this.container=t}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(cs(n)){let s=n.getImmediate();return`${s.library}/${s.version}`}else return null}).filter(n=>n).join(" ")}};function cs(e){return e.getComponent()?.type==="VERSION"}var Be="@firebase/app",Nt="0.16.2";var k=new N("@firebase/app"),ls="@firebase/app-compat",ds="@firebase/analytics-compat",us="@firebase/analytics",hs="@firebase/app-check-compat",fs="@firebase/app-check",ps="@firebase/auth",gs="@firebase/auth-compat",ms="@firebase/database",Es="@firebase/data-connect",_s="@firebase/database-compat",bs="@firebase/functions",ws="@firebase/functions-compat",ys="@firebase/installations",As="@firebase/installations-compat",Ss="@firebase/messaging",Cs="@firebase/messaging-compat",Os="@firebase/performance",Ts="@firebase/performance-compat",Rs="@firebase/remote-config",Is="@firebase/remote-config-compat",vs="@firebase/storage",ks="@firebase/storage-compat",Ds="@firebase/firestore",Ns="@firebase/ai",Ls="@firebase/firestore-compat",Ps="firebase";var Fe="[DEFAULT]",Ms={[Be]:"fire-core",[ls]:"fire-core-compat",[us]:"fire-analytics",[ds]:"fire-analytics-compat",[fs]:"fire-app-check",[hs]:"fire-app-check-compat",[ps]:"fire-auth",[gs]:"fire-auth-compat",[ms]:"fire-rtdb",[Es]:"fire-data-connect",[_s]:"fire-rtdb-compat",[bs]:"fire-fn",[ws]:"fire-fn-compat",[ys]:"fire-iid",[As]:"fire-iid-compat",[Ss]:"fire-fcm",[Cs]:"fire-fcm-compat",[Os]:"fire-perf",[Ts]:"fire-perf-compat",[Rs]:"fire-rc",[Is]:"fire-rc-compat",[vs]:"fire-gcs",[ks]:"fire-gcs-compat",[Ds]:"fire-fst",[Ls]:"fire-fst-compat",[Ns]:"fire-vertex","fire-js":"fire-js",[Ps]:"fire-js-all"};var fe=new Map,xs=new Map,$e=new Map;function Lt(e,t){try{e.container.addComponent(t)}catch(n){k.debug(`Component ${t.name} failed to register with FirebaseApp ${e.name}`,n)}}function L(e){let t=e.name;if($e.has(t))return k.debug(`There were multiple attempts to register component ${t}.`),!1;$e.set(t,e);for(let n of fe.values())Lt(n,e);for(let n of xs.values())Lt(n,e);return!0}function X(e,t){let n=e.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),e.container.getProvider(t)}function Ut(e){return e==null?!1:e.settings!==void 0}var Us={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different {$mismatchedParam}. Existing: '{$oldValue}'. New: '{$newValue}'.","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},v=new U("app","Firebase",Us);var He=class{constructor(t,n,s){this._isDeleted=!1,this._options={...t},this._config={...n},this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=s,this.container.addComponent(new S("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(t){this.checkDestroyed(),this._automaticDataCollectionEnabled=t}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(t){this._isDeleted=t}checkDestroyed(){if(this.isDeleted)throw v.create("app-deleted",{appName:this._name})}};function je(e,t={}){let n=e;typeof t!="object"&&(t={name:t});let s={name:Fe,automaticDataCollectionEnabled:!0,...t},o=s.name;if(typeof o!="string"||!o)throw v.create("bad-app-name",{appName:String(o)});if(n||(n=ve()),!n)throw v.create("no-options");let i=fe.get(o);if(i)if(le(n,i.options)){if(le(s,i.config))return i;throw v.create("duplicate-app",{appName:o,mismatchedParam:"config",oldValue:JSON.stringify(i.config),newValue:JSON.stringify(s)})}else throw v.create("duplicate-app",{appName:o,mismatchedParam:"options",oldValue:JSON.stringify(i.options),newValue:JSON.stringify(n)});let r=new ue(o);for(let c of $e.values())r.addComponent(c);let a=new He(n,s,r);return fe.set(o,a),a}function pe(e=Fe){let t=fe.get(e);if(!t&&e===Fe&&ve())return je();if(!t)throw v.create("no-app",{appName:e});return t}function T(e,t,n){let s=Ms[e]??e;n&&(s+=`-${n}`);let o=s.match(/\s|\//),i=t.match(/\s|\//);if(o||i){let r=[`Unable to register library "${s}" with version "${t}":`];o&&r.push(`library name "${s}" contains illegal characters (whitespace or "/")`),o&&i&&r.push("and"),i&&r.push(`version name "${t}" contains illegal characters (whitespace or "/")`),k.warn(r.join(" "));return}L(new S(`${s}-version`,()=>({library:s,version:t}),"VERSION"))}var Bs="firebase-heartbeat-database",Fs=1,J="firebase-heartbeat-store",xe=null;function Bt(){return xe||(xe=Dt(Bs,Fs,{upgrade:(e,t)=>{switch(t){case 0:try{e.createObjectStore(J)}catch(n){console.warn(n)}}}}).catch(e=>{throw v.create("idb-open",{originalErrorMessage:e.message})})),xe}async function $s(e){try{let n=(await Bt()).transaction(J),s=await n.objectStore(J).get(Ft(e));return await n.done,s}catch(t){if(t instanceof I)k.warn(t.message);else{let n=v.create("idb-get",{originalErrorMessage:t?.message});k.warn(n.message)}}}async function Pt(e,t){try{let s=(await Bt()).transaction(J,"readwrite");await s.objectStore(J).put(t,Ft(e)),await s.done}catch(n){if(n instanceof I)k.warn(n.message);else{let s=v.create("idb-set",{originalErrorMessage:n?.message});k.warn(s.message)}}}function Ft(e){return`${e.name}!${e.options.appId}`}var Hs=1024,Gs=30,Ge=class{constructor(t){this.container=t,this._heartbeatsCache=null;let n=this.container.getProvider("app").getImmediate();this._storage=new Ve(n),this._heartbeatsCachePromise=this._storage.read().then(s=>(this._heartbeatsCache=s,s))}async triggerHeartbeat(){try{let n=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),s=Mt();if(this._heartbeatsCache?.heartbeats==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null)||this._heartbeatsCache.lastSentHeartbeatDate===s||this._heartbeatsCache.heartbeats.some(o=>o.date===s))return;if(this._heartbeatsCache.heartbeats.push({date:s,agent:n}),this._heartbeatsCache.heartbeats.length>Gs){let o=js(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(t){k.warn(t)}}async getHeartbeatsHeader(){try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null||this._heartbeatsCache.heartbeats.length===0)return"";let t=Mt(),{heartbeatsToSend:n,unsentEntries:s}=Vs(this._heartbeatsCache.heartbeats),o=Ie(JSON.stringify({version:2,heartbeats:n}));return this._heartbeatsCache.lastSentHeartbeatDate=t,s.length>0?(this._heartbeatsCache.heartbeats=s,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),o}catch(t){return k.warn(t),""}}};function Mt(){return new Date().toISOString().substring(0,10)}function Vs(e,t=Hs){let n=[],s=e.slice();for(let o of e){let i=n.find(r=>r.agent===o.agent);if(i){if(i.dates.push(o.date),xt(n)>t){i.dates.pop();break}}else if(n.push({agent:o.agent,dates:[o.date]}),xt(n)>t){n.pop();break}s=s.slice(1)}return{heartbeatsToSend:n,unsentEntries:s}}var Ve=class{constructor(t){this.app=t,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return q()?St().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){let n=await $s(this.app);return n?.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(t){if(await this._canUseIndexedDBPromise){let s=await this.read();return Pt(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??s.lastSentHeartbeatDate,heartbeats:t.heartbeats})}else return}async add(t){if(await this._canUseIndexedDBPromise){let s=await this.read();return Pt(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??s.lastSentHeartbeatDate,heartbeats:[...s.heartbeats,...t.heartbeats]})}else return}};function xt(e){return Ie(JSON.stringify({version:2,heartbeats:e})).length}function js(e){if(e.length===0)return-1;let t=0,n=e[0].date;for(let s=1;s<e.length;s++)e[s].date<n&&(n=e[s].date,t=s);return t}function Ws(e){L(new S("platform-logger",t=>new Ue(t),"PRIVATE")),L(new S("heartbeat",t=>new Ge(t),"PRIVATE")),T(Be,Nt,e),T(Be,Nt,"esm2020"),T("fire-js","")}Ws("");var Ks="firebase",zs="12.19.0";T(Ks,zs,"app");var ze=new Map,Wt={activated:!1,tokenObservers:[]},Ys={initialized:!1,enabled:!1};function E(e){return ze.get(e)||{...Wt}}function qs(e,t){return ze.set(e,t),ze.get(e)}function be(){return Ys}var Kt="https://content-firebaseappcheck.googleapis.com/v1";var Js="exchangeRecaptchaEnterpriseToken",Xs="exchangeDebugToken",$t={RETRIAL_MIN_WAIT:30*1e3,RETRIAL_MAX_WAIT:960*1e3},Qs=1440*60*1e3;var Ye=class{constructor(t,n,s,o,i){if(this.operation=t,this.retryPolicy=n,this.getWaitDuration=s,this.lowerBound=o,this.upperBound=i,this.pending=null,this.nextErrorWaitInterval=o,o>i)throw new Error("Proactive refresh lower bound greater than upper bound!")}start(){this.nextErrorWaitInterval=this.lowerBound,this.process(!0).catch(()=>{})}stop(){this.pending&&(this.pending.reject("cancelled"),this.pending=null)}isRunning(){return!!this.pending}async process(t){this.stop();try{this.pending=new C,this.pending.promise.catch(n=>{}),await Zs(this.getNextRun(t)),this.pending.resolve(),await this.pending.promise,this.pending=new C,this.pending.promise.catch(n=>{}),await this.operation(),this.pending.resolve(),await this.pending.promise,this.process(!0).catch(()=>{})}catch(n){this.retryPolicy(n)?this.process(!1).catch(()=>{}):this.stop()}}getNextRun(t){if(t)return this.nextErrorWaitInterval=this.lowerBound,this.getWaitDuration();{let n=this.nextErrorWaitInterval;return this.nextErrorWaitInterval*=2,this.nextErrorWaitInterval>this.upperBound&&(this.nextErrorWaitInterval=this.upperBound),n}}};function Zs(e){return new Promise(t=>{setTimeout(t,e)})}var eo={"already-initialized":"You have already called initializeAppCheck() for FirebaseApp {$appName} with different options. To avoid this error, call initializeAppCheck() with the same options as when it was originally called. This will return the already initialized instance.","use-before-activation":"App Check is being used before initializeAppCheck() is called for FirebaseApp {$appName}. Call initializeAppCheck() before instantiating other Firebase services.","fetch-network-error":"Fetch failed to connect to a network. Check Internet connection. Original error: {$originalErrorMessage}.","fetch-parse-error":"Fetch client could not parse response. Original error: {$originalErrorMessage}.","fetch-status-error":"Fetch server returned an HTTP error status. HTTP status: {$httpStatus}.","storage-open":"Error thrown when opening storage. Original error: {$originalErrorMessage}.","storage-get":"Error thrown when reading from storage. Original error: {$originalErrorMessage}.","storage-set":"Error thrown when writing to storage. Original error: {$originalErrorMessage}.","recaptcha-error":"ReCAPTCHA error.","initial-throttle":"{$httpStatus} error. Attempts allowed again after {$time}",throttled:"Requests throttled due to previous {$httpStatus} error. Attempts allowed again after {$time}"},A=new U("appCheck","AppCheck",eo);function Ht(e=!1){return e?self.grecaptcha?.enterprise:self.grecaptcha}function Je(e){if(!E(e).activated)throw A.create("use-before-activation",{appName:e.name})}function zt(e){let t=Math.round(e/1e3),n=Math.floor(t/(3600*24)),s=Math.floor((t-n*3600*24)/3600),o=Math.floor((t-n*3600*24-s*3600)/60),i=t-n*3600*24-s*3600-o*60,r="";return n&&(r+=ge(n)+"d:"),s&&(r+=ge(s)+"h:"),r+=ge(o)+"m:"+ge(i)+"s",r}function ge(e){return e===0?"00":e>=10?e.toString():"0"+e}async function Xe({url:e,body:t},n){let s={"Content-Type":"application/json"},o=n.getImmediate({optional:!0});if(o){let p=await o.getHeartbeatsHeader();p&&(s["X-Firebase-Client"]=p)}let i={method:"POST",body:JSON.stringify(t),headers:s},r;try{r=await fetch(e,i)}catch(p){throw A.create("fetch-network-error",{originalErrorMessage:p?.message})}if(r.status!==200)throw A.create("fetch-status-error",{httpStatus:r.status});let a;try{a=await r.json()}catch(p){throw A.create("fetch-parse-error",{originalErrorMessage:p?.message})}let c=a.ttl.match(/^([\d.]+)(s)$/);if(!c||!c[2]||isNaN(Number(c[1])))throw A.create("fetch-parse-error",{originalErrorMessage:`ttl field (timeToLive) is not in standard Protobuf Duration format: ${a.ttl}`});let l=Number(c[1])*1e3,f=Date.now();return{token:a.token,expireTimeMillis:f+l,issuedAtTimeMillis:f}}function to(e,t){let{projectId:n,appId:s,apiKey:o}=e.options;return{url:`${Kt}/projects/${n}/apps/${s}:${Js}?key=${o}`,body:{recaptcha_enterprise_token:t}}}function Yt(e,t){let{projectId:n,appId:s,apiKey:o}=e.options;return{url:`${Kt}/projects/${n}/apps/${s}:${Xs}?key=${o}`,body:{debug_token:t}}}var no="firebase-app-check-database",so=1,Q="firebase-app-check-store",qt="debug-token",me=null;function Jt(){return me||(me=new Promise((e,t)=>{try{let n=indexedDB.open(no,so);n.onsuccess=s=>{e(s.target.result)},n.onerror=s=>{t(A.create("storage-open",{originalErrorMessage:s.target.error?.message}))},n.onupgradeneeded=s=>{let o=s.target.result;switch(s.oldVersion){case 0:o.createObjectStore(Q,{keyPath:"compositeKey"})}}}catch(n){t(A.create("storage-open",{originalErrorMessage:n?.message}))}}),me)}function oo(e){return Qt(Zt(e))}function io(e,t){return Xt(Zt(e),t)}function ro(e){return Xt(qt,e)}function ao(){return Qt(qt)}async function Xt(e,t){let s=(await Jt()).transaction(Q,"readwrite"),i=s.objectStore(Q).put({compositeKey:e,value:t});return new Promise((r,a)=>{i.onsuccess=c=>{r()},s.onerror=c=>{a(A.create("storage-set",{originalErrorMessage:c.target.error?.message}))}})}async function Qt(e){let n=(await Jt()).transaction(Q,"readonly"),o=n.objectStore(Q).get(e);return new Promise((i,r)=>{o.onsuccess=a=>{let c=a.target.result;i(c?c.value:void 0)},n.onerror=a=>{r(A.create("storage-get",{originalErrorMessage:a.target.error?.message}))}})}function Zt(e){return`${e.options.appId}-${e.name}`}var P=new N("@firebase/app-check");async function co(e){if(q()){let t;try{t=await oo(e)}catch(n){P.warn(`Failed to read token from IndexedDB. Error: ${n}`)}return t}}function We(e,t){return q()?io(e,t).catch(n=>{P.warn(`Failed to write token to IndexedDB. Error: ${n}`)}):Promise.resolve()}async function lo(e){let t;try{t=await ao()}catch{}if(t)return t;{let n=crypto.randomUUID(),s=`To use this token for app debugging, register it with your project.

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
`,console.log(s),ro(n).catch(r=>P.warn(`Failed to persist debug token to IndexedDB. Error: ${r}`)),n}}function Qe(){return be().enabled}async function Ze(){let e=be();if(e.enabled&&e.token)return e.token.promise;throw Error(`
            Can't get debug token in production mode.
        `)}function uo(e){let t=Y(),n=be();if(n.initialized=!0,typeof t.FIREBASE_APPCHECK_DEBUG_TOKEN!="string"&&t.FIREBASE_APPCHECK_DEBUG_TOKEN!==!0)return;n.enabled=!0;let s=new C;n.token=s,typeof t.FIREBASE_APPCHECK_DEBUG_TOKEN=="string"?s.resolve(t.FIREBASE_APPCHECK_DEBUG_TOKEN):s.resolve(lo(e))}var ho={error:"UNKNOWN_ERROR"};function fo(e){return ce.encodeString(JSON.stringify(e),!1)}async function Ee(e,t=!1,n=!1){let s=e.app;Je(s);let o=E(s),i=o.token,r;if(i&&!K(i)&&(o.token=void 0,i=void 0),!i){let l=await o.cachedTokenPromise;l&&(K(l)?i=l:await We(s,void 0))}if(!t&&i&&K(i))return{token:i.token};let a=!1;if(Qe())try{let l=await Ze();o.exchangeTokenPromise||(o.exchangeTokenPromise=Xe(Yt(s,l),e.heartbeatServiceProvider).finally(()=>{o.exchangeTokenPromise=void 0}),a=!0);let f=await o.exchangeTokenPromise;return await We(s,f),o.token=f,{token:f.token}}catch(l){return l.code==="appCheck/throttled"||l.code==="appCheck/initial-throttle"?P.warn(l.message):n&&P.error(l),Ke(l)}try{o.exchangeTokenPromise||(o.exchangeTokenPromise=o.provider.getToken().finally(()=>{o.exchangeTokenPromise=void 0}),a=!0),i=await E(s).exchangeTokenPromise}catch(l){l.code==="appCheck/throttled"||l.code==="appCheck/initial-throttle"?P.warn(l.message):n&&P.error(l),r=l}let c;return i?r?K(i)?c={token:i.token,internalError:r}:c=Ke(r):(c={token:i.token},o.token=i,await We(s,i)):c=Ke(r),a&&nn(s,c),c}async function po(e){let t=e.app;Je(t);let{provider:n}=E(t);if(Qe()){let s=await Ze(),o=Yt(t,s);o.body.limited_use=!0;let{token:i}=await Xe(o,e.heartbeatServiceProvider);return{token:i}}else{let{token:s}=await n.getToken(!0);return{token:s}}}function en(e,t,n,s){let{app:o}=e,i=E(o),r={next:n,error:s,type:t};if(i.tokenObservers=[...i.tokenObservers,r],i.token&&K(i.token)){let a=i.token;Promise.resolve().then(()=>{n({token:a.token}),Gt(e)}).catch(()=>{})}i.cachedTokenPromise.then(()=>Gt(e))}function tn(e,t){let n=E(e),s=n.tokenObservers.filter(o=>o.next!==t);s.length===0&&n.tokenRefresher&&n.tokenRefresher.isRunning()&&n.tokenRefresher.stop(),n.tokenObservers=s}function Gt(e){let{app:t}=e,n=E(t),s=n.tokenRefresher;s||(s=go(e),n.tokenRefresher=s),!s.isRunning()&&n.isTokenAutoRefreshEnabled&&s.start()}function go(e){let{app:t}=e;return new Ye(async()=>{let n=E(t),s;if(n.token?s=await Ee(e,!0):s=await Ee(e),s.error)throw s.error;if(s.internalError)throw s.internalError},()=>!0,()=>{let n=E(t);if(n.token){let s=n.token.issuedAtTimeMillis+(n.token.expireTimeMillis-n.token.issuedAtTimeMillis)*.5+3e5,o=n.token.expireTimeMillis-300*1e3;return s=Math.min(s,o),Math.max(0,s-Date.now())}else return 0},$t.RETRIAL_MIN_WAIT,$t.RETRIAL_MAX_WAIT)}function nn(e,t){let n=E(e).tokenObservers;for(let s of n)try{s.type==="EXTERNAL"&&t.error!=null?s.error(t.error):s.next(t)}catch{}}function K(e){return e.expireTimeMillis-Date.now()>0}function Ke(e){return{token:fo(ho),error:e}}var qe=class{constructor(t,n){this.app=t,this.heartbeatServiceProvider=n}_delete(){let{tokenObservers:t}=E(this.app);for(let n of t)tn(this.app,n.next);return Promise.resolve()}};function mo(e,t){return new qe(e,t)}function Eo(e){return{getToken:t=>Ee(e,t),getLimitedUseToken:()=>po(e),addTokenListener:t=>en(e,"INTERNAL",t),removeTokenListener:t=>tn(e.app,t)}}var _o="@firebase/app-check",bo="0.13.1";var wo="https://www.google.com/recaptcha/enterprise.js";function yo(e,t){let n=new C,s=E(e);s.reCAPTCHAState={initialized:n};let o=Ao(e),i=Ht(!0);return i?Vt(e,t,i,o,n):Oo(()=>{let r=Ht(!0);if(!r)throw new Error("no recaptcha");Vt(e,t,r,o,n)}),n.promise}function Vt(e,t,n,s,o){n.ready(()=>{Co(e,t,n,s),o.resolve(n)})}function Ao(e){let t=`fire_app_check_${e.name}`,n=document.createElement("div");return n.id=t,n.style.display="none",document.body.appendChild(n),t}async function So(e){Je(e);let n=await E(e).reCAPTCHAState.initialized.promise;return new Promise((s,o)=>{let i=E(e).reCAPTCHAState;n.ready(()=>{s(n.execute(i.widgetId,{action:"fire_app_check"}))})})}function Co(e,t,n,s){let o=n.render(s,{sitekey:t,size:"invisible",callback:()=>{E(e).reCAPTCHAState.succeeded=!0},"error-callback":()=>{E(e).reCAPTCHAState.succeeded=!1}}),i=E(e);i.reCAPTCHAState={...i.reCAPTCHAState,widgetId:o}}function Oo(e){let t=document.createElement("script");t.src=wo+"?render=explicit",t.onload=e,document.head.appendChild(t)}var _e=class e{constructor(t){this._siteKey=t,this._throttleData=null}async getToken(t=!1){Ro(this._throttleData);let n=await So(this._app).catch(o=>{throw A.create("recaptcha-error")});if(!E(this._app).reCAPTCHAState?.succeeded)throw A.create("recaptcha-error");let s;try{let o=to(this._app,n);t&&(o.body.limited_use=!0),s=await Xe(o,this._heartbeatServiceProvider)}catch(o){throw o.code?.includes("fetch-status-error")?(this._throttleData=To(Number(o.customData?.httpStatus),this._throttleData),A.create("initial-throttle",{time:zt(this._throttleData.allowRequestsAfter-Date.now()),httpStatus:this._throttleData.httpStatus})):o}return this._throttleData=null,s}initialize(t){this._app=t,this._heartbeatServiceProvider=X(t,"heartbeat"),yo(t,this._siteKey).catch(()=>{})}isEqual(t){return t instanceof e?this._siteKey===t._siteKey:!1}};function To(e,t){if(e===404||e===403)return{backoffCount:1,allowRequestsAfter:Date.now()+Qs,httpStatus:e};{let n=t?t.backoffCount:0,s=Ct(n,1e3,2);return{backoffCount:n+1,allowRequestsAfter:Date.now()+s,httpStatus:e}}}function Ro(e){if(e&&Date.now()-e.allowRequestsAfter<=0)throw A.create("throttled",{time:zt(e.allowRequestsAfter-Date.now()),httpStatus:e.httpStatus})}function sn(e=pe(),t){e=de(e);let n=X(e,"app-check");if(be().initialized||uo(e),Qe()&&Ze().then(o=>{console.log(`Firebase App Check debug token: ${o}`)}),n.isInitialized()){let o=n.getImmediate(),i=n.getOptions();if(i&&!!i.isTokenAutoRefreshEnabled==!!t.isTokenAutoRefreshEnabled&&i.provider?.isEqual(t.provider))return o;throw A.create("already-initialized",{appName:e.name})}let s=n.initialize({options:t});return Io(e,t.provider,t.isTokenAutoRefreshEnabled),E(e).isTokenAutoRefreshEnabled&&en(s,"INTERNAL",()=>{}),s}function Io(e,t,n=!1){let s=qs(e,{...Wt});s.activated=!0,s.provider=t,s.cachedTokenPromise=co(e).then(o=>(o&&K(o)&&(s.token=o,nn(e,{token:o.token})),o)),s.isTokenAutoRefreshEnabled=n&&e.automaticDataCollectionEnabled,!e.automaticDataCollectionEnabled&&n&&P.warn("`isTokenAutoRefreshEnabled` is true but `automaticDataCollectionEnabled` was set to false during `initializeApp()`. This blocks automatic token refresh."),s.provider.initialize(e)}async function on(e,t){let n=await Ee(e,t);if(n.error)throw n.error;if(n.internalError)throw n.internalError;return{token:n.token}}var vo="app-check",jt="app-check-internal";function ko(){L(new S(vo,e=>{let t=e.getProvider("app").getImmediate(),n=e.getProvider("heartbeat");return mo(t,n)},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,t,n)=>{e.getProvider(jt).initialize()})),L(new S(jt,e=>{let t=e.getProvider("app-check").getImmediate();return Eo(t)},"PUBLIC").setInstantiationMode("EXPLICIT")),T(_o,bo)}ko();var rn="@firebase/ai",ot="2.16.0";var $="AI",Do="us-central1",No="global",Lo="firebasevertexai.googleapis.com",z="v1beta",an=ot,Po="gl-js",Mo="hybrid",xo=180*1e3,Uo="gemini-2.5-flash-lite";var h=class e extends I{constructor(t,n,s){let o=$,i=`${o}/${t}`,r=`${o}: ${n} (${i})`;super(t,r),this.code=t,this.customErrorData=s,Error.captureStackTrace&&Error.captureStackTrace(this,e),Object.setPrototypeOf(this,e.prototype),this.toString=()=>r}};var cn=["user","model","function","system"];var gn={HARM_SEVERITY_NEGLIGIBLE:"HARM_SEVERITY_NEGLIGIBLE",HARM_SEVERITY_LOW:"HARM_SEVERITY_LOW",HARM_SEVERITY_MEDIUM:"HARM_SEVERITY_MEDIUM",HARM_SEVERITY_HIGH:"HARM_SEVERITY_HIGH",HARM_SEVERITY_UNSUPPORTED:"HARM_SEVERITY_UNSUPPORTED"};var w={STOP:"STOP",MAX_TOKENS:"MAX_TOKENS",SAFETY:"SAFETY",RECITATION:"RECITATION",OTHER:"OTHER",BLOCKLIST:"BLOCKLIST",PROHIBITED_CONTENT:"PROHIBITED_CONTENT",SPII:"SPII",MALFORMED_FUNCTION_CALL:"MALFORMED_FUNCTION_CALL",IMAGE_SAFETY:"IMAGE_SAFETY",IMAGE_PROHIBITED_CONTENT:"IMAGE_PROHIBITED_CONTENT",IMAGE_OTHER:"IMAGE_OTHER",NO_IMAGE:"NO_IMAGE",IMAGE_RECITATION:"IMAGE_RECITATION",LANGUAGE:"LANGUAGE",UNEXPECTED_TOOL_CALL:"UNEXPECTED_TOOL_CALL",TOO_MANY_TOOL_CALLS:"TOO_MANY_TOOL_CALLS",MISSING_THOUGHT_SIGNATURE:"MISSING_THOUGHT_SIGNATURE",MALFORMED_RESPONSE:"MALFORMED_RESPONSE"};var y={PREFER_ON_DEVICE:"prefer_on_device",ONLY_ON_DEVICE:"only_on_device",ONLY_IN_CLOUD:"only_in_cloud",PREFER_IN_CLOUD:"prefer_in_cloud"},M={ON_DEVICE:"on_device",IN_CLOUD:"in_cloud"};var u={ERROR:"error",REQUEST_ERROR:"request-error",RESPONSE_ERROR:"response-error",FETCH_ERROR:"fetch-error",SESSION_CLOSED:"session-closed",INVALID_CONTENT:"invalid-content",API_NOT_ENABLED:"api-not-enabled",INVALID_SCHEMA:"invalid-schema",NO_API_KEY:"no-api-key",NO_APP_ID:"no-app-id",NO_MODEL:"no-model",NO_PROJECT_ID:"no-project-id",PARSE_FAILED:"parse-failed",UNSUPPORTED:"unsupported"};var R={AGENT_PLATFORM:"AGENT_PLATFORM",VERTEX_AI:"VERTEX_AI",GOOGLE_AI:"GOOGLE_AI"};var ee=class{constructor(t){this.backendType=t}},H=class extends ee{constructor(){super(R.GOOGLE_AI)}_getModelPath(t,n){return`/${z}/projects/${t}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/templates/${n}`}},te=class extends ee{constructor(t){super(R.VERTEX_AI),this.location=Do,t&&(this.location=t)}_getModelPath(t,n){return`/${z}/projects/${t}/locations/${this.location}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/locations/${this.location}/templates/${n}`}},ne=class extends ee{constructor(t){super(R.AGENT_PLATFORM),this.location=No,t&&(this.location=t)}_getModelPath(t,n){return`/${z}/projects/${t}/locations/${this.location}/${n}`}_getTemplatePath(t,n){return`/${z}/projects/${t}/locations/${this.location}/templates/${n}`}};function Bo(e){if(e instanceof H)return`${$}/googleai`;if(e instanceof te)return`${$}/vertexai/${e.location}`;if(e instanceof ne)return`${$}/agentplatform/${e.location}`;throw new h(u.ERROR,`Invalid backend: ${JSON.stringify(e.backendType)}`)}function Fo(e){let t=e.split("/");if(t[0]!==$)throw new h(u.ERROR,`Invalid instance identifier, unknown prefix '${t[0]}'`);switch(t[1]){case"vertexai":let s=t[2];if(!s)throw new h(u.ERROR,`Invalid instance identifier, unknown location '${e}'`);return new te(s);case"agentplatform":let o=t[2];if(!o)throw new h(u.ERROR,`Invalid instance identifier, unknown location '${e}'`);return new ne(o);case"googleai":return new H;default:throw new h(u.ERROR,`Invalid instance identifier string: '${e}'`)}}var _=new N("@firebase/vertexai"),D;(function(e){e.UNAVAILABLE="unavailable",e.DOWNLOADABLE="downloadable",e.DOWNLOADING="downloading",e.AVAILABLE="available"})(D||(D={}));var mn={type:"text",languages:["en"]},et=[mn,{type:"image"}],tt=[mn],ye=class e{constructor(t,n,s){this.languageModelProvider=t,this.mode=n,this.downloadPromise=null,this.onDeviceParams={createOptions:{expectedInputs:et,expectedOutputs:tt}},s&&(this.onDeviceParams=s,this.onDeviceParams.createOptions?(this.onDeviceParams.createOptions.expectedInputs||(this.onDeviceParams.createOptions.expectedInputs=et),this.onDeviceParams.createOptions.expectedOutputs||(this.onDeviceParams.createOptions.expectedOutputs=tt)):this.onDeviceParams.createOptions={expectedInputs:et,expectedOutputs:tt})}async isAvailable(t){if(!this.mode)return _.debug("On-device inference unavailable because mode is undefined."),!1;if(this.mode===y.ONLY_IN_CLOUD)return _.debug('On-device inference unavailable because mode is "only_in_cloud".'),!1;let n=await this.languageModelProvider?.availability(this.onDeviceParams.createOptions);if(this.mode===y.ONLY_ON_DEVICE){if(n===D.UNAVAILABLE)throw new h(u.API_NOT_ENABLED,"Local LanguageModel API not available in this environment.");if(n===D.DOWNLOADABLE||n===D.DOWNLOADING){_.debug("Waiting for download of LanguageModel to complete.");try{await this.downloadPromise}catch(s){throw new h(u.ERROR,s.message)}return!0}return!0}return n!==D.AVAILABLE?(_.debug(`On-device inference unavailable because availability is "${n}".`),!1):e.isOnDeviceRequest(t)?!0:(_.debug("On-device inference unavailable because request is incompatible."),!1)}async generateContent(t){let n=await this.createSession(),s=await Promise.all(t.contents.map(e.toLanguageModelMessage)),o=await n.prompt(s,this.onDeviceParams.promptOptions);return e.toResponse(o)}async generateContentStream(t){let n=await this.createSession(),s=await Promise.all(t.contents.map(e.toLanguageModelMessage)),o=n.promptStreaming(s,this.onDeviceParams.promptOptions);return e.toStreamResponse(o)}async countTokens(t){throw new h(u.REQUEST_ERROR,"Count Tokens is not yet available for on-device model.")}static isOnDeviceRequest(t){if(t.contents.length===0)return _.debug("Empty prompt rejected for on-device inference."),!1;for(let n of t.contents){if(n.parts.some(s=>"functionResponse"in s))return _.debug("Content with a function response part rejected for on-device inference."),!1;for(let s of n.parts)if(s.inlineData&&e.SUPPORTED_MIME_TYPES.indexOf(s.inlineData.mimeType)===-1)return _.debug(`Unsupported mime type "${s.inlineData.mimeType}" rejected for on-device inference.`),!1}return!0}async downloadIfAvailable(t){let n=await this.languageModelProvider?.availability(this.onDeviceParams.createOptions);return(n===D.DOWNLOADABLE||n===D.DOWNLOADING)&&this.download(t),n}download(t){if(this.downloadPromise)return;let n={...this.onDeviceParams.createOptions};n&&!n.monitor&&t&&(n.monitor=s=>{s.addEventListener("downloadprogress",o=>{t(o.loaded)})}),this.downloadPromise=this.languageModelProvider?.create(n).finally(()=>{this.downloadPromise=null})}static async toLanguageModelMessage(t){let n=await Promise.all(t.parts.map(e.toLanguageModelMessageContent));return{role:e.toLanguageModelMessageRole(t.role),content:n}}static async toLanguageModelMessageContent(t){if(t.text)return{type:"text",value:t.text};if(t.inlineData){let s=await(await fetch(`data:${t.inlineData.mimeType};base64,${t.inlineData.data}`)).blob();return{type:"image",value:await createImageBitmap(s)}}throw new h(u.REQUEST_ERROR,"Processing of this Part type is not currently supported.")}static toLanguageModelMessageRole(t){return t==="model"?"assistant":"user"}async createSession(){if(!this.languageModelProvider)throw new h(u.UNSUPPORTED,"Chrome AI requested for unsupported browser version.");let t=await this.languageModelProvider.create(this.onDeviceParams.createOptions);return this.oldSession&&this.oldSession.destroy(),this.oldSession=t,t}static toResponse(t){return{json:async()=>({candidates:[{content:{parts:[{text:t}]}}]})}}static toStreamResponse(t){let n=new TextEncoder;return{body:t.pipeThrough(new TransformStream({transform(s,o){let i=JSON.stringify({candidates:[{content:{role:"model",parts:[{text:s}]}}]});o.enqueue(n.encode(`data: ${i}

`))}}))}}};ye.SUPPORTED_MIME_TYPES=["image/jpeg","image/png"];function $o(e,t,n){let o=(t||Y()).LanguageModel;if(o&&e)return new ye(o,e,n)}var it=class{constructor(t,n,s,o,i){this.app=t,this.backend=n,this.chromeAdapterFactory=i;let r=o?.getImmediate({optional:!0}),a=s?.getImmediate({optional:!0});this.auth=a||null,this.appCheck=r||null,n instanceof te||n instanceof ne?this.location=n.location:this.location=""}_delete(){return Promise.resolve()}set options(t){this._options=t}get options(){return this._options}};function Ho(e,{instanceIdentifier:t}){if(!t)throw new h(u.ERROR,"AIService instance identifier is undefined.");let n=Fo(t),s=e.getProvider("app").getImmediate(),o=e.getProvider("auth-internal"),i=e.getProvider("app-check-internal");return new it(s,n,o,i,$o)}function Go(e){if(e.app?.options?.apiKey)if(e.app?.options?.projectId){if(!e.app?.options?.appId)throw new h(u.NO_APP_ID,'The "appId" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid app ID.')}else throw new h(u.NO_PROJECT_ID,'The "projectId" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid project ID.');else throw new h(u.NO_API_KEY,'The "apiKey" field is empty in the local Firebase config. Firebase AI requires this field to contain a valid API key.');let t={apiKey:e.app.options.apiKey,project:e.app.options.projectId,appId:e.app.options.appId,automaticDataCollectionEnabled:e.app.automaticDataCollectionEnabled,location:e.location,backend:e.backend};if(Ut(e.app)&&e.app.settings.appCheckToken){let n=e.app.settings.appCheckToken;t.getAppCheckToken=()=>Promise.resolve({token:n})}else e.appCheck&&(e.options?.useLimitedUseAppCheckTokens?t.getAppCheckToken=()=>e.appCheck.getLimitedUseToken():t.getAppCheckToken=()=>e.appCheck.getToken());return e.auth&&(t.getAuthToken=()=>e.auth.getToken()),t}var rt=class e{constructor(t,n){this._apiSettings=Go(t),this.model=e.normalizeModelName(n,this._apiSettings.backend.backendType)}static normalizeModelName(t,n){return n===R.GOOGLE_AI?e.normalizeGoogleAIModelName(t):e.normalizeVertexAIModelName(t)}static normalizeGoogleAIModelName(t){return`models/${t}`}static normalizeVertexAIModelName(t){let n;return t.includes("/")?t.startsWith("models/")?n=`publishers/google/${t}`:n=t:n=`publishers/google/models/${t}`,n}};var Vo="Timeout has expired.",nt="AbortError",at=class{constructor(t){this.params=t}toString(){let t=new URL(this.baseUrl);return t.pathname=this.pathname,t.search=this.queryParams.toString(),t.toString()}get pathname(){return this.params.templateId?`${this.params.apiSettings.backend._getTemplatePath(this.params.apiSettings.project,this.params.templateId)}:${this.params.task}`:`${this.params.apiSettings.backend._getModelPath(this.params.apiSettings.project,this.params.model)}:${this.params.task}`}get baseUrl(){return this.params.singleRequestOptions?.baseUrl??`https://${Lo}`}get queryParams(){let t=new URLSearchParams;return this.params.stream&&t.set("alt","sse"),t}};function jo(e){let t=[];return t.push(`${Po}/${an}`),t.push(`fire/${an}`),(e.params.apiSettings.inferenceMode===y.PREFER_ON_DEVICE||e.params.apiSettings.inferenceMode===y.PREFER_IN_CLOUD)&&t.push(Mo),t.join(" ")}async function Wo(e){let t=new Headers;if(t.append("Content-Type","application/json"),t.append("x-goog-api-client",jo(e)),t.append("x-goog-api-key",e.params.apiSettings.apiKey),e.params.apiSettings.automaticDataCollectionEnabled&&t.append("X-Firebase-Appid",e.params.apiSettings.appId),e.params.apiSettings.getAppCheckToken){let n=await e.params.apiSettings.getAppCheckToken();n&&(t.append("X-Firebase-AppCheck",n.token),n.error&&_.warn(`Unable to obtain a valid App Check token: ${n.error.message}`))}if(e.params.apiSettings.getAuthToken){let n=await e.params.apiSettings.getAuthToken();n&&t.append("Authorization",`Firebase ${n.accessToken}`)}return t}async function ut(e,t){let n=new at(e),s,o=e.singleRequestOptions?.signal,i=e.singleRequestOptions?.timeout!=null&&e.singleRequestOptions.timeout>=0?e.singleRequestOptions.timeout:xo,r=new AbortController,a=setTimeout(()=>{r.abort(new DOMException(Vo,nt)),_.debug(`Aborting request to ${n} due to timeout (${i}ms)`)},i),c=AbortSignal.any(o?[o,r.signal]:[r.signal]);if(o&&o.aborted)throw clearTimeout(a),new DOMException(o.reason??"Aborted externally before fetch",nt);try{let l={method:"POST",headers:await Wo(n),signal:c,body:t};if(s=await fetch(n.toString(),l),!s.ok){let f="",p;try{let m=await s.json();f=m.error.message,m.error.details&&(f+=` ${JSON.stringify(m.error.details)}`,p=m.error.details)}catch{}throw s.status===403&&p&&p.some(m=>m.reason==="SERVICE_DISABLED")&&p.some(m=>m.links?.[0]?.description.includes("Google developers console API activation"))?new h(u.API_NOT_ENABLED,`The Firebase AI SDK requires the Firebase AI API ('firebasevertexai.googleapis.com') to be enabled in your Firebase project. Enable this API by visiting the Firebase Console at https://console.firebase.google.com/project/${n.params.apiSettings.project}/ailogic/ and clicking "Get started". If you enabled this API recently, wait a few minutes for the action to propagate to our systems and then retry.`,{status:s.status,statusText:s.statusText,errorDetails:p}):new h(u.FETCH_ERROR,`Error fetching from ${n}: [${s.status} ${s.statusText}] ${f}`,{status:s.status,statusText:s.statusText,errorDetails:p})}}catch(l){let f=l;throw l.code!==u.FETCH_ERROR&&l.code!==u.API_NOT_ENABLED&&l instanceof Error&&l.name!==nt&&(f=new h(u.ERROR,`Error fetching from ${n.toString()}: ${l.message}`),f.stack=l.stack),f}finally{clearTimeout(a)}return s}function we(e){if(e.candidates&&e.candidates.length>0){if(e.candidates.length>1&&_.warn(`This response had ${e.candidates.length} candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`),_n(e.candidates[0]))throw new h(u.RESPONSE_ERROR,`Response error: ${F(e)}. Response body stored in error.response`,{response:e});return!0}else return!1}function Ae(e,t=M.IN_CLOUD){e.candidates&&!e.candidates[0].hasOwnProperty("index")&&(e.candidates[0].index=0);let n=Ko(e);return n.inferenceSource=t,n}function Ko(e){return e.text=()=>{if(we(e))return ln(e,t=>!t.thought);if(e.promptFeedback)throw new h(u.RESPONSE_ERROR,`Text not available. ${F(e)}`,{response:e});return""},e.thoughtSummary=()=>{if(we(e)){let t=ln(e,n=>!!n.thought);return t===""?void 0:t}else if(e.promptFeedback)throw new h(u.RESPONSE_ERROR,`Thought summary not available. ${F(e)}`,{response:e})},e.inlineDataParts=()=>{if(we(e))return zo(e);if(e.promptFeedback)throw new h(u.RESPONSE_ERROR,`Data not available. ${F(e)}`,{response:e})},e.functionCalls=()=>{if(we(e))return En(e);if(e.promptFeedback)throw new h(u.RESPONSE_ERROR,`Function call not available. ${F(e)}`,{response:e})},e}function ln(e,t){let n=[];if(e.candidates?.[0].content?.parts)for(let s of e.candidates?.[0].content?.parts)s.text&&t(s)&&n.push(s.text);return n.length>0?n.join(""):""}function En(e){if(!e)return;let t=[];if(e.candidates?.[0].content?.parts)for(let n of e.candidates?.[0].content?.parts)n.functionCall&&t.push(n.functionCall);if(t.length>0)return t}function zo(e){let t=[];if(e.candidates?.[0].content?.parts)for(let n of e.candidates?.[0].content?.parts)n.inlineData&&t.push(n);if(t.length>0)return t}var Yo=[w.RECITATION,w.SAFETY,w.BLOCKLIST,w.PROHIBITED_CONTENT,w.SPII,w.MALFORMED_FUNCTION_CALL,w.IMAGE_SAFETY,w.IMAGE_PROHIBITED_CONTENT,w.IMAGE_OTHER,w.NO_IMAGE,w.IMAGE_RECITATION,w.LANGUAGE,w.UNEXPECTED_TOOL_CALL,w.TOO_MANY_TOOL_CALLS,w.MISSING_THOUGHT_SIGNATURE,w.MALFORMED_RESPONSE];function _n(e){return!!e.finishReason&&Yo.some(t=>t===e.finishReason)}function F(e){let t="";if((!e.candidates||e.candidates.length===0)&&e.promptFeedback)t+="Response was blocked",e.promptFeedback?.blockReason&&(t+=` due to ${e.promptFeedback.blockReason}`),e.promptFeedback?.blockReasonMessage&&(t+=`: ${e.promptFeedback.blockReasonMessage}`);else if(e.candidates?.[0]){let n=e.candidates[0];_n(n)&&(t+=`Candidate was blocked due to ${n.finishReason}`,n.finishMessage&&(t+=`: ${n.finishMessage}`))}return t}function bn(e){if(e.safetySettings?.forEach(t=>{if(t.method)throw new h(u.UNSUPPORTED,"SafetySetting.method is not supported in the the Gemini Developer API. Please remove this property.")}),e.generationConfig?.topK){let t=Math.round(e.generationConfig.topK);t!==e.generationConfig.topK&&(_.warn("topK in GenerationConfig has been rounded to the nearest integer to match the format for requests to the Gemini Developer API."),e.generationConfig.topK=t)}return e}function ht(e){return{candidates:e.candidates?Jo(e.candidates):void 0,prompt:e.promptFeedback?Xo(e.promptFeedback):void 0,usageMetadata:e.usageMetadata}}function qo(e,t){return{generateContentRequest:{model:t,...e}}}function Jo(e){let t=[],n;return t&&e.forEach(s=>{let o;if(s.citationMetadata&&(o={citations:s.citationMetadata.citationSources}),s.safetyRatings&&(n=s.safetyRatings.map(r=>({...r,severity:r.severity??gn.HARM_SEVERITY_UNSUPPORTED,probabilityScore:r.probabilityScore??0,severityScore:r.severityScore??0}))),s.content?.parts?.some(r=>r?.videoMetadata))throw new h(u.UNSUPPORTED,"Part.videoMetadata is not supported in the Gemini Developer API. Please remove this property.");let i={index:s.index,content:s.content,finishReason:s.finishReason,finishMessage:s.finishMessage,safetyRatings:n,citationMetadata:o,groundingMetadata:s.groundingMetadata,urlContextMetadata:s.urlContextMetadata};t.push(i)}),t}function Xo(e){let t=[];return e.safetyRatings.forEach(s=>{t.push({category:s.category,probability:s.probability,severity:s.severity??gn.HARM_SEVERITY_UNSUPPORTED,probabilityScore:s.probabilityScore??0,severityScore:s.severityScore??0,blocked:s.blocked})}),{blockReason:e.blockReason,safetyRatings:t,blockReasonMessage:e.blockReasonMessage}}var dn=/^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;async function Qo(e,t,n){let s=e.body.pipeThrough(new TextDecoderStream("utf8",{fatal:!0})),o=ni(s),[i,r]=o.tee(),{response:a,firstValue:c}=await Zo(r,t,n);return{stream:ti(i,t,n),response:a,firstValue:c}}async function Zo(e,t,n){let[s,o]=e.tee(),i=s.getReader(),{value:r}=await i.read();return{firstValue:r,response:ei(o,t,n)}}async function ei(e,t,n){let s=[],o=e.getReader();for(;;){let{done:i,value:r}=await o.read();if(i){let a=si(s);return t.backend.backendType===R.GOOGLE_AI&&(a=ht(a)),Ae(a,n)}s.push(r)}}async function*ti(e,t,n){let s=e.getReader();for(;;){let{value:o,done:i}=await s.read();if(i)break;let r;t.backend.backendType===R.GOOGLE_AI?r=Ae(ht(o),n):r=Ae(o,n);let a=r.candidates?.[0];!a?.content?.parts&&!a?.finishReason&&!a?.citationMetadata&&!a?.urlContextMetadata||(yield r)}}function ni(e){let t=e.getReader();return new ReadableStream({start(s){let o="";return i();function i(){return t.read().then(({value:r,done:a})=>{if(a){if(o.trim()){s.error(new h(u.PARSE_FAILED,"Failed to parse stream"));return}s.close();return}o+=r;let c=o.match(dn),l;for(;c;){try{l=JSON.parse(c[1])}catch{s.error(new h(u.PARSE_FAILED,`Error parsing JSON response: "${c[1]}`));return}s.enqueue(l),o=o.substring(c[0].length),c=o.match(dn)}return i()})}}})}function si(e){let n={promptFeedback:e[e.length-1]?.promptFeedback};for(let s of e)if(s.candidates)for(let o of s.candidates){let i=o.index||0;n.candidates||(n.candidates=[]),n.candidates[i]||(n.candidates[i]={index:o.index}),n.candidates[i].citationMetadata=o.citationMetadata,n.candidates[i].finishReason=o.finishReason,n.candidates[i].finishMessage=o.finishMessage,n.candidates[i].safetyRatings=o.safetyRatings,n.candidates[i].groundingMetadata=o.groundingMetadata;let r=o.urlContextMetadata;if(typeof r=="object"&&r!==null&&Object.keys(r).length>0&&(n.candidates[i].urlContextMetadata=r),o.content){if(!o.content.parts)continue;n.candidates[i].content||(n.candidates[i].content={role:o.content.role||"user",parts:[]});for(let a of o.content.parts){let c={...a};a.text!==""&&Object.keys(c).length>0&&n.candidates[i].content.parts.push(c)}}}return n}var oi=[u.FETCH_ERROR,u.ERROR,u.API_NOT_ENABLED];async function wn(e,t,n,s){if(!t)return{response:await s(),inferenceSource:M.IN_CLOUD};switch(t.mode){case y.ONLY_ON_DEVICE:if(await t.isAvailable(e))return{response:await n(),inferenceSource:M.ON_DEVICE};throw new h(u.UNSUPPORTED,"Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.");case y.ONLY_IN_CLOUD:return{response:await s(),inferenceSource:M.IN_CLOUD};case y.PREFER_IN_CLOUD:try{return{response:await s(),inferenceSource:M.IN_CLOUD}}catch(o){if(o instanceof h&&oi.includes(o.code)&&await t.isAvailable(e))return{response:await n(),inferenceSource:M.ON_DEVICE};throw o}case y.PREFER_ON_DEVICE:return await t.isAvailable(e)?{response:await n(),inferenceSource:M.ON_DEVICE}:{response:await s(),inferenceSource:M.IN_CLOUD};default:throw new h(u.ERROR,`Unexpected infererence mode: ${t.mode}`)}}async function ii(e,t,n,s){return e.backend.backendType===R.GOOGLE_AI&&(n=bn(n)),ut({task:"streamGenerateContent",model:t,apiSettings:e,stream:!0,singleRequestOptions:s},JSON.stringify(n))}async function yn(e,t,n,s,o){let i=await wn(n,s,()=>s.generateContentStream(n),()=>ii(e,t,n,o));return Qo(i.response,e,i.inferenceSource)}async function ri(e,t,n,s){return e.backend.backendType===R.GOOGLE_AI&&(n=bn(n)),ut({model:t,task:"generateContent",apiSettings:e,stream:!1,singleRequestOptions:s},JSON.stringify(n))}async function An(e,t,n,s,o){let i=await wn(n,s,()=>s.generateContent(n),()=>ri(e,t,n,o)),r=await ai(i.response,e);return{response:Ae(r,i.inferenceSource)}}async function ai(e,t){let n=await e.json();return t.backend.backendType===R.GOOGLE_AI?ht(n):n}function ft(e){if(e!=null){if(typeof e=="string")return{role:"system",parts:[{text:e}]};if(e.text)return{role:"system",parts:[e]};if(e.parts)return e.role?e:{role:"system",parts:e.parts}}}function Z(e){let t=[];if(typeof e=="string")t=[{text:e}];else for(let n of e)typeof n=="string"?t.push({text:n}):t.push(n);return ci(t)}function ci(e){let t={role:"user",parts:[]},n=!1,s=!1;for(let o of e)"functionResponse"in o?s=!0:n=!0,t.parts.push(o);if(n&&s)throw new h(u.INVALID_CONTENT,"Within a single message, FunctionResponse cannot be mixed with other type of Part in the request for sending chat message.");if(!n&&!s)throw new h(u.INVALID_CONTENT,"No Content is provided for sending chat message.");return t}function st(e){let t;return e.contents?t=e:t={contents:[Z(e)]},e.systemInstruction&&(t.systemInstruction=ft(e.systemInstruction)),t}var un="SILENT_ERROR",hn=10,ct=class{constructor(t,n,s){this.params=n,this.requestOptions=s,this._history=[],this._sendPromise=Promise.resolve(),this._apiSettings=t}async getHistory(){return await this._sendPromise,this._history}async _sendMessage(t,n){let s={};await this._sendPromise;let o=[];return this._sendPromise=this._sendPromise.then(async()=>{let i,r=0,a=this.requestOptions?.maxSequentialFunctionCalls??hn;do{let c;if(i){r++;let p=await this._callFunctionsAsNeeded(i);c=Z(p)}else c=Z(t);let l=this._formatRequest(c,[...o]);o.push(c);let f=await this._callGenerateContent(l,n);if(f)if(s=f,i=this._getCallableFunctionCalls(f.response),f.response.candidates&&f.response.candidates.length>0){let p={parts:f.response.candidates?.[0].content.parts||[],role:f.response.candidates?.[0].content.role||"model"};o.push(p)}else{let p=F(f.response);p&&_.warn(`sendMessage() was unsuccessful. ${p}. Inspect response object for details.`)}else i=void 0}while(i&&r<a);i&&r>=a&&_.warn(`Automatic function calling exceeded the limit of ${a} function calls. Returning last model response.`)}),await this._sendPromise,this._history=this._history.concat(o),s}async _sendMessageStream(t,n){await this._sendPromise;let s=[],i=(async()=>{let r,a=0,c=this.requestOptions?.maxSequentialFunctionCalls??hn,l;do{let f;if(r){a++;let m=await this._callFunctionsAsNeeded(r);f=Z(m)}else f=Z(t);let p=this._formatRequest(f,[...s]);if(s.push(f),l=await this._callGenerateContentStream(p,n),r=this._getCallableFunctionCalls(l.firstValue),r&&l.firstValue&&l.firstValue.candidates&&l.firstValue.candidates.length>0){let m={...l.firstValue.candidates[0].content};m.role||(m.role="model"),s.push(m)}}while(r&&a<c);return r&&a>=c&&_.warn(`Automatic function calling exceeded the limit of ${c} function calls. Returning last model response.`),{stream:l.stream,response:l.response}})();return this._sendPromise=this._sendPromise.then(async()=>i).catch(r=>{throw new Error(un)}).then(r=>r.response).then(r=>{if(r.candidates&&r.candidates.length>0){this._history=this._history.concat(s);let a={...r.candidates[0].content};a.role||(a.role="model"),this._history.push(a)}else{let a=F(r);a&&_.warn(`sendMessageStream() was unsuccessful. ${a}. Inspect response object for details.`)}}).catch(r=>{r.message!==un&&r.name!=="AbortError"&&_.error(r)}),i}_getCallableFunctionCalls(t){let n=this.params?.tools?.find(o=>o.functionDeclarations);if(!n?.functionDeclarations)return;let s=En(t);if(s){for(let o of s)if(!n.functionDeclarations?.some(r=>r.name===o.name&&typeof r.functionReference=="function"))return;return s}}async _callFunctionsAsNeeded(t){let n=[],s=[],o=this.params?.tools?.find(i=>i.functionDeclarations);if(o&&o.functionDeclarations){for(let r of t){let a=o.functionDeclarations.find(c=>c.name===r.name);if(a?.functionReference){let c=Promise.resolve(a.functionReference(r.args)).catch(l=>{let f=new h(u.ERROR,`Error in user-defined function "${a.name}": ${l.message}`);throw f.stack=l.stack,f});n.push({name:r.name,id:r.id,results:c}),s.push(c)}}await Promise.all(s);let i=[];for(let{name:r,id:a,results:c}of n){let l={name:r,response:await c};a&&(l.id=a),i.push({functionResponse:l})}return i}else throw new h(u.REQUEST_ERROR,'No function declarations were provided in "tools".')}};var fn=["text","inlineData","functionCall","functionResponse","thought","thoughtSignature"],li={user:["text","inlineData","functionResponse"],function:["functionResponse"],model:["text","functionCall","thought","thoughtSignature"],system:["text"]},pn={user:["model"],function:["model"],model:["user","function"],system:[]};function di(e){let t=null;for(let n of e){let{role:s,parts:o}=n;if(!t&&s!=="user")throw new h(u.INVALID_CONTENT,`First Content should be with role 'user', got ${s}`);if(!cn.includes(s))throw new h(u.INVALID_CONTENT,`Each item should include role field. Got ${s} but valid roles are: ${JSON.stringify(cn)}`);if(!Array.isArray(o))throw new h(u.INVALID_CONTENT,"Content should have 'parts' property with an array of Parts");if(o.length===0)throw new h(u.INVALID_CONTENT,"Each Content should have at least one part");let i={text:0,inlineData:0,functionCall:0,functionResponse:0,thought:0,thoughtSignature:0,executableCode:0,codeExecutionResult:0};for(let a of o)for(let c of fn)c in a&&(i[c]+=1);let r=li[s];for(let a of fn)if(!r.includes(a)&&i[a]>0)throw new h(u.INVALID_CONTENT,`Content with role '${s}' can't contain '${a}' part`);if(t&&!pn[s].includes(t.role))throw new h(u.INVALID_CONTENT,`Content with role '${s}' can't follow '${t.role}'. Valid previous roles: ${JSON.stringify(pn)}`);t=n}}var lt=class extends ct{constructor(t,n,s,o,i){super(t,o,i),this.model=n,this.chromeAdapter=s,this.params=o,this.requestOptions=i,o?.history&&(di(o.history),this._history=o.history),this.params?.systemInstruction!=null&&(this.params={...this.params,systemInstruction:ft(this.params.systemInstruction)})}_formatRequest(t,n){return{safetySettings:this.params?.safetySettings,generationConfig:this.params?.generationConfig,tools:this.params?.tools,toolConfig:this.params?.toolConfig,systemInstruction:this.params?.systemInstruction,contents:[...this._history,...n,t]}}_callGenerateContent(t,n){return An(this._apiSettings,this.model,t,this.chromeAdapter,{...this.requestOptions,...n})}_callGenerateContentStream(t,n){return yn(this._apiSettings,this.model,t,this.chromeAdapter,{...this.requestOptions,...n})}async sendMessage(t,n){return this._sendMessage(t,n)}async sendMessageStream(t,n){return this._sendMessageStream(t,n)}};async function ui(e,t,n,s){let o="";if(e.backend.backendType===R.GOOGLE_AI){let r=qo(n,t);o=JSON.stringify(r)}else o=JSON.stringify(n);return(await ut({model:t,task:"countTokens",apiSettings:e,stream:!1,singleRequestOptions:s},o)).json()}async function hi(e,t,n,s,o){if(s?.mode===y.ONLY_ON_DEVICE)throw new h(u.UNSUPPORTED,"countTokens() is not supported for on-device models.");return ui(e,t,n,o)}var dt=class extends rt{constructor(t,n,s,o){super(t,n.model),this.chromeAdapter=o,this.generationConfig=n.generationConfig||{},fi(this.generationConfig),this.safetySettings=n.safetySettings||[],this.tools=n.tools,this.toolConfig=n.toolConfig,this.systemInstruction=ft(n.systemInstruction),this.requestOptions=s||{}}async initializeDeviceModel(t){if(!this.chromeAdapter||this.chromeAdapter.mode===y.ONLY_IN_CLOUD)return;if(await this.chromeAdapter.downloadIfAvailable(t)===D.UNAVAILABLE){let s=new h(u.API_NOT_ENABLED,"Local LanguageModel API not available in this environment.");if(this.chromeAdapter.mode===y.ONLY_ON_DEVICE)throw s;_.debug(s.message)}await this.chromeAdapter.downloadPromise}async generateContent(t,n){let s=st(t);return An(this._apiSettings,this.model,{generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,...s},this.chromeAdapter,{...this.requestOptions,...n})}async generateContentStream(t,n){let s=st(t),{stream:o,response:i}=await yn(this._apiSettings,this.model,{generationConfig:this.generationConfig,safetySettings:this.safetySettings,tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,...s},this.chromeAdapter,{...this.requestOptions,...n});return{stream:o,response:i}}startChat(t){return new lt(this._apiSettings,this.model,this.chromeAdapter,{tools:this.tools,toolConfig:this.toolConfig,systemInstruction:this.systemInstruction,generationConfig:this.generationConfig,safetySettings:this.safetySettings,...t},this.requestOptions)}async countTokens(t,n){let s=st(t);return hi(this._apiSettings,this.model,s,this.chromeAdapter,{...this.requestOptions,...n})}};function fi(e){if(e.thinkingConfig?.thinkingBudget!=null&&e.thinkingConfig?.thinkingLevel)throw new h(u.UNSUPPORTED,"Cannot set both thinkingBudget and thinkingLevel in a config.");if(e.responseSchema!=null&&e.responseJsonSchema!=null)throw new h(u.UNSUPPORTED,"Cannot set both responseSchema and responseJsonSchema in a config.");if((e.responseSchema!=null||e.responseJsonSchema!=null)&&e.responseMimeType!=="application/json"&&e.responseMimeType!=="text/x.enum")throw new h(u.UNSUPPORTED,'responseMimeType must be set to "application/json" or "text/x.enum" if responseSchema or responseJsonSchema are set.')}var pi="audio-processor",ir=`
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
  registerProcessor('${pi}', AudioProcessor);
`;function Sn(e=pe(),t){e=de(e);let n=X(e,$),s=t?.backend??new H,o={useLimitedUseAppCheckTokens:t?.useLimitedUseAppCheckTokens??!1},i=Bo(s),r=n.getImmediate({identifier:i});return r.options=o,r}var gi=["mode","onDeviceParams","inCloudParams"];function Cn(e,t,n){let s=t,o;if(s.mode){for(let a of Object.keys(t))gi.includes(a)||_.warn(`When a hybrid inference mode is specified (mode is currently set to ${s.mode}), "${a}" cannot be configured at the top level. Configuration for in-cloud and on-device must be done separately in inCloudParams and onDeviceParams. Configuration values set outside of inCloudParams and onDeviceParams will be ignored.`);o=s.inCloudParams||{model:Uo}}else o=t;if(!o.model)throw new h(u.NO_MODEL,"Must provide a model name. Example: getGenerativeModel({ model: 'my-model-name' })");let i=e.chromeAdapterFactory?.(s.mode,typeof window>"u"?void 0:window,s.onDeviceParams),r=new dt(e,o,n,i);return r._apiSettings.inferenceMode=s.mode,r}function mi(){L(new S($,Ho,"PUBLIC").setMultipleInstances(!0)),T(rn,ot),T(rn,ot,"esm2020")}mi();var Ei={apiKey:"AIzaSyDHK53_j09cnCJfGhtdjleUBn654JJe2xM",authDomain:"aion-hybrid-ai.firebaseapp.com",projectId:"aion-hybrid-ai",storageBucket:"aion-hybrid-ai.firebasestorage.app",messagingSenderId:"55910897023",appId:"1:55910897023:web:cb220aba6e2da44f20f64a"},On="6LdmoCouAAAAAF9w5FhIjQOyP6q3VtKIm3aM3QeQ",oe=["gemini-3.5-flash-lite","gemini-4-hydrogen"],se="aion_hybrid_mode",Et="aion_hybrid_offline_demo",_t="prefer_in_cloud",Se="aion_appcheck_debug_token",ie={prefer_on_device:y.PREFER_ON_DEVICE,only_on_device:y.ONLY_ON_DEVICE,prefer_in_cloud:y.PREFER_IN_CLOUD},d=window.AionHybridState={ready:!1,mode:_t,nano:"checking",nanoDetail:"",appCheck:{status:"off",detail:""},offlineDemo:!1,cloudModel:oe[0],debugToken:""},b=e=>document.getElementById(e),x=e=>{try{return localStorage.getItem(e)}catch{return null}},In=(e,t)=>{try{localStorage.setItem(e,t)}catch{}},Ce,Oe=null;try{Ce=je(Ei)}catch(e){console.error("[hybrid] Firebase init failed",e),d.appCheck={status:"error",detail:"Firebase init failed: "+e.message}}if(Ce){try{let t=["localhost","127.0.0.1","[::1]"].includes(location.hostname)||new URLSearchParams(location.search).has("appcheck_debug")||!On;if(t){let s=x(Se);if(s)self.FIREBASE_APPCHECK_DEBUG_TOKEN=s,d.debugToken=s;else{self.FIREBASE_APPCHECK_DEBUG_TOKEN=!0;let o=console.log,i=Date.now()+8e3;console.log=function(...r){try{let a=String(r[0]||"").match(/App Check debug token:\s*([0-9a-fA-F-]{36})/);a&&(d.debugToken=a[1],V())}catch{}o.apply(console,r),Date.now()>i&&(console.log=o)}}}let n=sn(Ce,{provider:new _e(On||"recaptcha-site-key-not-configured"),isTokenAutoRefreshEnabled:!0});if(!window.AION_OFFLINE_DEMO&&x(Et)!=="1"){let s=performance.now();d.appCheckWarm="warming",on(n,!1).then(o=>{if(o&&o.error){d.appCheckWarm="failed",console.warn("[hybrid] App Check warm-up failed:",o.error&&o.error.message);return}d.appCheckWarm="ready",d.appCheckWarmMs=Math.round(performance.now()-s)},o=>{d.appCheckWarm="failed",console.warn("[hybrid] App Check warm-up failed:",o&&o.message)})}d.appCheck=t?{status:"debug",detail:"App Check debug provider. The debug token must be registered in Firebase console (App Check > Apps > Manage debug tokens)."}:{status:"recaptcha",detail:"App Check with reCAPTCHA Enterprise."}}catch(e){console.error("[hybrid] App Check init failed",e),d.appCheck={status:"error",detail:"App Check failed to start: "+e.message}}try{Oe=Sn(Ce,{backend:new H})}catch(e){console.error("[hybrid] AI Logic init failed",e)}}var pt={};function vn(e,t){if(!Oe)throw new Error("Firebase AI Logic is not initialised.");let n=e+"|"+(t||oe[0]);return pt[n]||(pt[n]=Cn(Oe,{mode:ie[e],inCloudParams:{model:t||oe[0]}})),pt[n]}function _i(e){let t=[String(e&&e.message||e)];e&&e.code&&t.push("code="+e.code);let n=e&&e.customErrorData;if(n&&(n.status&&t.push("http="+n.status+(n.statusText?" "+n.statusText:"")),n.errorDetails))try{t.push("details="+JSON.stringify(n.errorDetails).slice(0,600))}catch{}return t.join(" | ")}var bi={expectedInputs:[{type:"text",languages:["en"]}],expectedOutputs:[{type:"text",languages:["en"]}]};function wi(){let e=navigator.userAgent.match(/\bChrome\/(\d+)/),t=/\b(Edg|OPR)\//.test(navigator.userAgent);return e&&!t?parseInt(e[1],10):null}async function re(){let e=wi(),t="unsupported",n="";if(typeof window.LanguageModel>"u")e===null?n="Use desktop Chrome 139 or newer for on-device AI.":e<139?n="Chrome "+e+" is too old - on-device AI needs Chrome 139+.":n="Chrome's Prompt API is off. See README (chrome://flags).";else try{let s=await window.LanguageModel.availability(bi);t=s==="available"?"ready":s==="downloadable"?"downloadable":s==="downloading"?"downloading":"unavailable",t==="unavailable"&&(n="This device cannot run Gemini Nano (needs enough storage and a supported computer).")}catch(s){t="unavailable",n="Could not check Gemini Nano: "+s.message}d.nano==="downloading"&&t==="downloading"&&d.nanoDetail.indexOf("%")>=0||(t!==d.nano||n!==d.nanoDetail)&&(d.nano=t,d.nanoDetail=n,V())}async function kn(){if(!(d.nano!=="downloadable"&&d.nano!=="downloading")){d.nano="downloading",d.nanoDetail="0%",V();try{await vn("only_on_device").initializeDeviceModel(e=>{d.nanoDetail=Math.round(e*100)+"%",V()})}catch(e){d.nanoDetail="Download failed: "+e.message}d.nanoDetail="",await re()}}var G={on_device:"on_device",in_cloud:"in_cloud"};async function yi(e,t){let n=d.mode,s=[],o=n==="only_on_device"?[oe[0]]:oe;for(let i=0;i<o.length;i++){let r=o[i];try{let a=vn(n,r),c=performance.now(),l=await a.generateContentStream(e),f="",p=null;for await(let Nn of l.stream){let ae="";try{ae=Nn.text()}catch{ae=""}if(ae&&(p===null&&(p=Math.round(performance.now()-c)),f+=ae,typeof t=="function"))try{t(f)}catch{}}let m={response:await l.response},j=Math.round(performance.now()-c),Te=f||m.response.text(),W=m.response.inferenceSource;return W!==G.on_device&&W!==G.in_cloud&&(W=n==="only_on_device"||n==="prefer_on_device"&&d.nano==="ready"?G.on_device:G.in_cloud),W===G.in_cloud&&(d.cloudModel=r),{text:Te||"(The model returned an empty reply.)",source:W,latencyMs:j,firstChunkMs:p,mode:n,model:W===G.on_device?"Gemini Nano":r}}catch(a){let c=_i(a);if(s.push(o.length>1?r+": "+c:c),!(/model|not found|404|unsupported|not supported|invalid argument|400/i.test(c)&&!/app.?check|api.?key|permission|quota|network|failed to fetch/i.test(c))||i===o.length-1){let f=new Error(s.join(`
`));throw f.code=a&&a.code,f}}}}var Tn={checking:"Gemini Nano: checking\u2026",ready:"Gemini Nano: ready",downloadable:"Gemini Nano: needs download",downloading:"Gemini Nano: downloading",unavailable:"Gemini Nano: unavailable",unsupported:"Gemini Nano: not supported here"},Ai={ready:"ok",downloading:"warn",downloadable:"warn",checking:"warn"};function V(){let e=b("nanoPill");if(!e)return;let t=Ai[d.nano]||"bad";e.className="pill hy-nano hy-"+t,e.title=d.nanoDetail||Tn[d.nano];let n=Tn[d.nano];d.nano==="downloading"&&d.nanoDetail&&(n+=" "+d.nanoDetail),b("nanoLabel").textContent=n;let s=b("nanoDownloadBtn");s.hidden=d.nano!=="downloadable";let o=b("nanoHint");o&&(o.textContent=d.nano==="ready"||d.nano==="checking"||d.nano==="downloading"?"":d.nanoDetail);let i=b("offlineDemo");i&&(i.checked=d.offlineDemo);let r=b("inferenceMode");r&&(r.value=d.mode,r.disabled=d.offlineDemo);let a=b("appCheckPill");if(a){let f=d.appCheck.status==="recaptcha"||d.appCheck.status==="debug";a.className="pill hy-"+(f?d.appCheck.status==="debug"?"warn":"ok":"bad"),b("appCheckLabel").textContent="App Check: "+d.appCheck.status,a.title=d.appCheck.detail}let c=b("appCheckCopyBtn");c&&(c.hidden=!(d.appCheck.status==="debug"&&d.debugToken));let l=b("appCheckSetBtn");l&&(l.hidden=d.appCheck.status!=="debug")}function gt(e){let t=b("backendLabel");t&&(t.textContent=e==="live"?"Local AION backend":"Standalone demo data",b("backendPill").title=e==="live"?"A local AION server answered; chat goes through it, not through Firebase.":"No backend connected - memories, tasks and approvals live in this browser (IndexedDB).")}function Dn(e){ie[e]&&(d.mode=e,In(se,e),V())}function mt(e){d.offlineDemo=!!e,window.AION_OFFLINE_DEMO=!!e,In(Et,e?"1":"0"),e?(d.modeBeforeOffline=d.mode,d.mode="only_on_device"):d.modeBeforeOffline?(d.mode=d.modeBeforeOffline,d.modeBeforeOffline=null):d.mode=x(se)&&ie[x(se)]?x(se):_t,document.body.classList.toggle("offline-demo",!!e);let t=b("offlineNote");t&&(t.hidden=!e,t.textContent="Offline Demo Mode: this page blocks all external network calls and answers only with on-device Gemini Nano. Turn on airplane mode as well to prove it."),V()}function Si(){let e=b("inferenceMode");if(!e)return;e.addEventListener("change",()=>Dn(e.value)),b("offlineDemo").addEventListener("change",s=>mt(s.target.checked)),b("nanoDownloadBtn").addEventListener("click",kn);let t=b("appCheckCopyBtn");t&&t.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(d.debugToken),t.textContent="COPIED"}catch{window.prompt("Copy this debug token:",d.debugToken)}setTimeout(()=>{t.textContent="COPY TOKEN"},1800)});let n=b("appCheckSetBtn");n&&n.addEventListener("click",()=>{let s=window.prompt("Paste the App Check debug token that is registered in Firebase console (leave empty to forget the saved one). The page reloads to use it.",x(Se)||"");if(s===null)return;let o=s.trim();if(o&&!/^[0-9a-fA-F-]{36}$/.test(o)){window.alert("That does not look like a debug token (36 characters, letters, digits and dashes).");return}try{o?localStorage.setItem(Se,o):localStorage.removeItem(Se)}catch{}location.reload()}),window.addEventListener("online",re),window.addEventListener("offline",re),window.addEventListener("aion:backend-mode",s=>gt(s.detail)),window.AionBackendMode?gt(window.AionBackendMode):window.AionStandalone&&window.AionStandalone.detectMode().then(gt)}function Rn(){let e=x(se);d.mode=e&&ie[e]?e:_t,Si(),x(Et)==="1"&&mt(!0),V(),re(),setInterval(re,6e3),d.ready=!!Oe,window.AionHybrid={generate:yi,getMode:()=>d.mode,setMode:Dn,setOfflineDemo:mt,downloadNano:kn,state:d,modes:Object.keys(ie)},window.__resolveAionHybrid&&window.__resolveAionHybrid(window.AionHybrid)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Rn):Rn();
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

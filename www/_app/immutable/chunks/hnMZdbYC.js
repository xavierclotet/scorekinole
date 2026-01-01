import{_ as vc}from"./C1FmrZbK.js";import{w as _c}from"./C__xTf-N.js";var us={};/**
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
 */const ao=function(t){const e=[];let n=0;for(let r=0;r<t.length;r++){let s=t.charCodeAt(r);s<128?e[n++]=s:s<2048?(e[n++]=s>>6|192,e[n++]=s&63|128):(s&64512)===55296&&r+1<t.length&&(t.charCodeAt(r+1)&64512)===56320?(s=65536+((s&1023)<<10)+(t.charCodeAt(++r)&1023),e[n++]=s>>18|240,e[n++]=s>>12&63|128,e[n++]=s>>6&63|128,e[n++]=s&63|128):(e[n++]=s>>12|224,e[n++]=s>>6&63|128,e[n++]=s&63|128)}return e},wc=function(t){const e=[];let n=0,r=0;for(;n<t.length;){const s=t[n++];if(s<128)e[r++]=String.fromCharCode(s);else if(s>191&&s<224){const a=t[n++];e[r++]=String.fromCharCode((s&31)<<6|a&63)}else if(s>239&&s<365){const a=t[n++],l=t[n++],h=t[n++],g=((s&7)<<18|(a&63)<<12|(l&63)<<6|h&63)-65536;e[r++]=String.fromCharCode(55296+(g>>10)),e[r++]=String.fromCharCode(56320+(g&1023))}else{const a=t[n++],l=t[n++];e[r++]=String.fromCharCode((s&15)<<12|(a&63)<<6|l&63)}}return e.join("")},co={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(t,e){if(!Array.isArray(t))throw Error("encodeByteArray takes an array as a parameter");this.init_();const n=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let s=0;s<t.length;s+=3){const a=t[s],l=s+1<t.length,h=l?t[s+1]:0,g=s+2<t.length,I=g?t[s+2]:0,A=a>>2,S=(a&3)<<4|h>>4;let P=(h&15)<<2|I>>6,N=I&63;g||(N=64,l||(P=64)),r.push(n[A],n[S],n[P],n[N])}return r.join("")},encodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(t):this.encodeByteArray(ao(t),e)},decodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(t):wc(this.decodeStringToByteArray(t,e))},decodeStringToByteArray(t,e){this.init_();const n=e?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let s=0;s<t.length;){const a=n[t.charAt(s++)],h=s<t.length?n[t.charAt(s)]:0;++s;const I=s<t.length?n[t.charAt(s)]:64;++s;const S=s<t.length?n[t.charAt(s)]:64;if(++s,a==null||h==null||I==null||S==null)throw new Ic;const P=a<<2|h>>4;if(r.push(P),I!==64){const N=h<<4&240|I>>2;if(r.push(N),S!==64){const k=I<<6&192|S;r.push(k)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let t=0;t<this.ENCODED_VALS.length;t++)this.byteToCharMap_[t]=this.ENCODED_VALS.charAt(t),this.charToByteMap_[this.byteToCharMap_[t]]=t,this.byteToCharMapWebSafe_[t]=this.ENCODED_VALS_WEBSAFE.charAt(t),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[t]]=t,t>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(t)]=t,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(t)]=t)}}};class Ic extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const Ec=function(t){const e=ao(t);return co.encodeByteArray(e,!0)},Pn=function(t){return Ec(t).replace(/\./g,"")},lo=function(t){try{return co.decodeString(t,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
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
 */function Tc(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
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
 */const bc=()=>Tc().__FIREBASE_DEFAULTS__,Ac=()=>{if(typeof process>"u"||typeof us>"u")return;const t=us.__FIREBASE_DEFAULTS__;if(t)return JSON.parse(t)},Sc=()=>{if(typeof document>"u")return;let t;try{t=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=t&&lo(t[1]);return e&&JSON.parse(e)},Hi=()=>{try{return bc()||Ac()||Sc()}catch(t){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${t}`);return}},uo=t=>{var e,n;return(n=(e=Hi())===null||e===void 0?void 0:e.emulatorHosts)===null||n===void 0?void 0:n[t]},Pc=t=>{const e=uo(t);if(!e)return;const n=e.lastIndexOf(":");if(n<=0||n+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const r=parseInt(e.substring(n+1),10);return e[0]==="["?[e.substring(1,n-1),r]:[e.substring(0,n),r]},ho=()=>{var t;return(t=Hi())===null||t===void 0?void 0:t.config},fo=t=>{var e;return(e=Hi())===null||e===void 0?void 0:e[`_${t}`]};/**
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
 */class kc{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,n)=>{this.resolve=e,this.reject=n})}wrapCallback(e){return(n,r)=>{n?this.reject(n):this.resolve(r),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(n):e(n,r))}}}/**
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
 */function Rc(t,e){if(t.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const n={alg:"none",type:"JWT"},r=e||"demo-project",s=t.iat||0,a=t.sub||t.user_id;if(!a)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const l=Object.assign({iss:`https://securetoken.google.com/${r}`,aud:r,iat:s,exp:s+3600,auth_time:s,sub:a,user_id:a,firebase:{sign_in_provider:"custom",identities:{}}},t);return[Pn(JSON.stringify(n)),Pn(JSON.stringify(l)),""].join(".")}/**
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
 */function ae(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function Cc(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(ae())}function Oc(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function po(){const t=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof t=="object"&&t.id!==void 0}function Dc(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Nc(){const t=ae();return t.indexOf("MSIE ")>=0||t.indexOf("Trident/")>=0}function go(){try{return typeof indexedDB=="object"}catch{return!1}}function mo(){return new Promise((t,e)=>{try{let n=!0;const r="validate-browser-context-for-indexeddb-analytics-module",s=self.indexedDB.open(r);s.onsuccess=()=>{s.result.close(),n||self.indexedDB.deleteDatabase(r),t(!0)},s.onupgradeneeded=()=>{n=!1},s.onerror=()=>{var a;e(((a=s.error)===null||a===void 0?void 0:a.message)||"")}}catch(n){e(n)}})}function Lc(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}/**
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
 */const Mc="FirebaseError";class Ie extends Error{constructor(e,n,r){super(n),this.code=e,this.customData=r,this.name=Mc,Object.setPrototypeOf(this,Ie.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,st.prototype.create)}}class st{constructor(e,n,r){this.service=e,this.serviceName=n,this.errors=r}create(e,...n){const r=n[0]||{},s=`${this.service}/${e}`,a=this.errors[e],l=a?Uc(a,r):"Error",h=`${this.serviceName}: ${l} (${s}).`;return new Ie(s,h,r)}}function Uc(t,e){return t.replace(Fc,(n,r)=>{const s=e[r];return s!=null?String(s):`<${r}?>`})}const Fc=/\{\$([^}]+)}/g;function xc(t){for(const e in t)if(Object.prototype.hasOwnProperty.call(t,e))return!1;return!0}function zt(t,e){if(t===e)return!0;const n=Object.keys(t),r=Object.keys(e);for(const s of n){if(!r.includes(s))return!1;const a=t[s],l=e[s];if(hs(a)&&hs(l)){if(!zt(a,l))return!1}else if(a!==l)return!1}for(const s of r)if(!n.includes(s))return!1;return!0}function hs(t){return t!==null&&typeof t=="object"}/**
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
 */function wt(t){const e=[];for(const[n,r]of Object.entries(t))Array.isArray(r)?r.forEach(s=>{e.push(encodeURIComponent(n)+"="+encodeURIComponent(s))}):e.push(encodeURIComponent(n)+"="+encodeURIComponent(r));return e.length?"&"+e.join("&"):""}function Ft(t){const e={};return t.replace(/^\?/,"").split("&").forEach(r=>{if(r){const[s,a]=r.split("=");e[decodeURIComponent(s)]=decodeURIComponent(a)}}),e}function xt(t){const e=t.indexOf("?");if(!e)return"";const n=t.indexOf("#",e);return t.substring(e,n>0?n:void 0)}function jc(t,e){const n=new $c(t,e);return n.subscribe.bind(n)}class $c{constructor(e,n){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=n,this.task.then(()=>{e(this)}).catch(r=>{this.error(r)})}next(e){this.forEachObserver(n=>{n.next(e)})}error(e){this.forEachObserver(n=>{n.error(e)}),this.close(e)}complete(){this.forEachObserver(e=>{e.complete()}),this.close()}subscribe(e,n,r){let s;if(e===void 0&&n===void 0&&r===void 0)throw new Error("Missing Observer.");Vc(e,["next","error","complete"])?s=e:s={next:e,error:n,complete:r},s.next===void 0&&(s.next=Ii),s.error===void 0&&(s.error=Ii),s.complete===void 0&&(s.complete=Ii);const a=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?s.error(this.finalError):s.complete()}catch{}}),this.observers.push(s),a}unsubscribeOne(e){this.observers===void 0||this.observers[e]===void 0||(delete this.observers[e],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(e){if(!this.finalized)for(let n=0;n<this.observers.length;n++)this.sendOne(n,e)}sendOne(e,n){this.task.then(()=>{if(this.observers!==void 0&&this.observers[e]!==void 0)try{n(this.observers[e])}catch(r){typeof console<"u"&&console.error&&console.error(r)}})}close(e){this.finalized||(this.finalized=!0,e!==void 0&&(this.finalError=e),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}}function Vc(t,e){if(typeof t!="object"||t===null)return!1;for(const n of e)if(n in t&&typeof t[n]=="function")return!0;return!1}function Ii(){}/**
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
 */const Bc=1e3,Hc=2,Wc=4*60*60*1e3,zc=.5;function ds(t,e=Bc,n=Hc){const r=e*Math.pow(n,t),s=Math.round(zc*r*(Math.random()-.5)*2);return Math.min(Wc,r+s)}/**
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
 */function D(t){return t&&t._delegate?t._delegate:t}class we{constructor(e,n,r){this.name=e,this.instanceFactory=n,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
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
 */const et="[DEFAULT]";/**
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
 */class Gc{constructor(e,n){this.name=e,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const n=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(n)){const r=new kc;if(this.instancesDeferred.set(n,r),this.isInitialized(n)||this.shouldAutoInitialize())try{const s=this.getOrInitializeService({instanceIdentifier:n});s&&r.resolve(s)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(e){var n;const r=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),s=(n=e==null?void 0:e.optional)!==null&&n!==void 0?n:!1;if(this.isInitialized(r)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:r})}catch(a){if(s)return null;throw a}else{if(s)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(Kc(e))try{this.getOrInitializeService({instanceIdentifier:et})}catch{}for(const[n,r]of this.instancesDeferred.entries()){const s=this.normalizeInstanceIdentifier(n);try{const a=this.getOrInitializeService({instanceIdentifier:s});r.resolve(a)}catch{}}}}clearInstance(e=et){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...e.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=et){return this.instances.has(e)}getOptions(e=et){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:n={}}=e,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const s=this.getOrInitializeService({instanceIdentifier:r,options:n});for(const[a,l]of this.instancesDeferred.entries()){const h=this.normalizeInstanceIdentifier(a);r===h&&l.resolve(s)}return s}onInit(e,n){var r;const s=this.normalizeInstanceIdentifier(n),a=(r=this.onInitCallbacks.get(s))!==null&&r!==void 0?r:new Set;a.add(e),this.onInitCallbacks.set(s,a);const l=this.instances.get(s);return l&&e(l,s),()=>{a.delete(e)}}invokeOnInitCallbacks(e,n){const r=this.onInitCallbacks.get(n);if(r)for(const s of r)try{s(e,n)}catch{}}getOrInitializeService({instanceIdentifier:e,options:n={}}){let r=this.instances.get(e);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:qc(e),options:n}),this.instances.set(e,r),this.instancesOptions.set(e,n),this.invokeOnInitCallbacks(r,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,r)}catch{}return r||null}normalizeInstanceIdentifier(e=et){return this.component?this.component.multipleInstances?e:et:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function qc(t){return t===et?void 0:t}function Kc(t){return t.instantiationMode==="EAGER"}/**
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
 */class Jc{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const n=this.getProvider(e.name);if(n.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);n.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const n=new Gc(e,this);return this.providers.set(e,n),n}getProviders(){return Array.from(this.providers.values())}}/**
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
 */var O;(function(t){t[t.DEBUG=0]="DEBUG",t[t.VERBOSE=1]="VERBOSE",t[t.INFO=2]="INFO",t[t.WARN=3]="WARN",t[t.ERROR=4]="ERROR",t[t.SILENT=5]="SILENT"})(O||(O={}));const Yc={debug:O.DEBUG,verbose:O.VERBOSE,info:O.INFO,warn:O.WARN,error:O.ERROR,silent:O.SILENT},Xc=O.INFO,Qc={[O.DEBUG]:"log",[O.VERBOSE]:"log",[O.INFO]:"info",[O.WARN]:"warn",[O.ERROR]:"error"},Zc=(t,e,...n)=>{if(e<t.logLevel)return;const r=new Date().toISOString(),s=Qc[e];if(s)console[s](`[${r}]  ${t.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class Fn{constructor(e){this.name=e,this._logLevel=Xc,this._logHandler=Zc,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in O))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?Yc[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,O.DEBUG,...e),this._logHandler(this,O.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,O.VERBOSE,...e),this._logHandler(this,O.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,O.INFO,...e),this._logHandler(this,O.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,O.WARN,...e),this._logHandler(this,O.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,O.ERROR,...e),this._logHandler(this,O.ERROR,...e)}}const el=(t,e)=>e.some(n=>t instanceof n);let fs,ps;function tl(){return fs||(fs=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function nl(){return ps||(ps=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const yo=new WeakMap,Li=new WeakMap,vo=new WeakMap,Ei=new WeakMap,Wi=new WeakMap;function il(t){const e=new Promise((n,r)=>{const s=()=>{t.removeEventListener("success",a),t.removeEventListener("error",l)},a=()=>{n(qe(t.result)),s()},l=()=>{r(t.error),s()};t.addEventListener("success",a),t.addEventListener("error",l)});return e.then(n=>{n instanceof IDBCursor&&yo.set(n,t)}).catch(()=>{}),Wi.set(e,t),e}function rl(t){if(Li.has(t))return;const e=new Promise((n,r)=>{const s=()=>{t.removeEventListener("complete",a),t.removeEventListener("error",l),t.removeEventListener("abort",l)},a=()=>{n(),s()},l=()=>{r(t.error||new DOMException("AbortError","AbortError")),s()};t.addEventListener("complete",a),t.addEventListener("error",l),t.addEventListener("abort",l)});Li.set(t,e)}let Mi={get(t,e,n){if(t instanceof IDBTransaction){if(e==="done")return Li.get(t);if(e==="objectStoreNames")return t.objectStoreNames||vo.get(t);if(e==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return qe(t[e])},set(t,e,n){return t[e]=n,!0},has(t,e){return t instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in t}};function sl(t){Mi=t(Mi)}function ol(t){return t===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...n){const r=t.call(Ti(this),e,...n);return vo.set(r,e.sort?e.sort():[e]),qe(r)}:nl().includes(t)?function(...e){return t.apply(Ti(this),e),qe(yo.get(this))}:function(...e){return qe(t.apply(Ti(this),e))}}function al(t){return typeof t=="function"?ol(t):(t instanceof IDBTransaction&&rl(t),el(t,tl())?new Proxy(t,Mi):t)}function qe(t){if(t instanceof IDBRequest)return il(t);if(Ei.has(t))return Ei.get(t);const e=al(t);return e!==t&&(Ei.set(t,e),Wi.set(e,t)),e}const Ti=t=>Wi.get(t);function _o(t,e,{blocked:n,upgrade:r,blocking:s,terminated:a}={}){const l=indexedDB.open(t,e),h=qe(l);return r&&l.addEventListener("upgradeneeded",g=>{r(qe(l.result),g.oldVersion,g.newVersion,qe(l.transaction),g)}),n&&l.addEventListener("blocked",g=>n(g.oldVersion,g.newVersion,g)),h.then(g=>{a&&g.addEventListener("close",()=>a()),s&&g.addEventListener("versionchange",I=>s(I.oldVersion,I.newVersion,I))}).catch(()=>{}),h}const cl=["get","getKey","getAll","getAllKeys","count"],ll=["put","add","delete","clear"],bi=new Map;function gs(t,e){if(!(t instanceof IDBDatabase&&!(e in t)&&typeof e=="string"))return;if(bi.get(e))return bi.get(e);const n=e.replace(/FromIndex$/,""),r=e!==n,s=ll.includes(n);if(!(n in(r?IDBIndex:IDBObjectStore).prototype)||!(s||cl.includes(n)))return;const a=async function(l,...h){const g=this.transaction(l,s?"readwrite":"readonly");let I=g.store;return r&&(I=I.index(h.shift())),(await Promise.all([I[n](...h),s&&g.done]))[0]};return bi.set(e,a),a}sl(t=>({...t,get:(e,n,r)=>gs(e,n)||t.get(e,n,r),has:(e,n)=>!!gs(e,n)||t.has(e,n)}));/**
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
 */class ul{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(hl(n)){const r=n.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(n=>n).join(" ")}}function hl(t){const e=t.getComponent();return(e==null?void 0:e.type)==="VERSION"}const Ui="@firebase/app",ms="0.10.13";/**
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
 */const Ne=new Fn("@firebase/app"),dl="@firebase/app-compat",fl="@firebase/analytics-compat",pl="@firebase/analytics",gl="@firebase/app-check-compat",ml="@firebase/app-check",yl="@firebase/auth",vl="@firebase/auth-compat",_l="@firebase/database",wl="@firebase/data-connect",Il="@firebase/database-compat",El="@firebase/functions",Tl="@firebase/functions-compat",bl="@firebase/installations",Al="@firebase/installations-compat",Sl="@firebase/messaging",Pl="@firebase/messaging-compat",kl="@firebase/performance",Rl="@firebase/performance-compat",Cl="@firebase/remote-config",Ol="@firebase/remote-config-compat",Dl="@firebase/storage",Nl="@firebase/storage-compat",Ll="@firebase/firestore",Ml="@firebase/vertexai-preview",Ul="@firebase/firestore-compat",Fl="firebase",xl="10.14.1";/**
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
 */const Fi="[DEFAULT]",jl={[Ui]:"fire-core",[dl]:"fire-core-compat",[pl]:"fire-analytics",[fl]:"fire-analytics-compat",[ml]:"fire-app-check",[gl]:"fire-app-check-compat",[yl]:"fire-auth",[vl]:"fire-auth-compat",[_l]:"fire-rtdb",[wl]:"fire-data-connect",[Il]:"fire-rtdb-compat",[El]:"fire-fn",[Tl]:"fire-fn-compat",[bl]:"fire-iid",[Al]:"fire-iid-compat",[Sl]:"fire-fcm",[Pl]:"fire-fcm-compat",[kl]:"fire-perf",[Rl]:"fire-perf-compat",[Cl]:"fire-rc",[Ol]:"fire-rc-compat",[Dl]:"fire-gcs",[Nl]:"fire-gcs-compat",[Ll]:"fire-fst",[Ul]:"fire-fst-compat",[Ml]:"fire-vertex","fire-js":"fire-js",[Fl]:"fire-js-all"};/**
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
 */const kn=new Map,$l=new Map,xi=new Map;function ys(t,e){try{t.container.addComponent(e)}catch(n){Ne.debug(`Component ${e.name} failed to register with FirebaseApp ${t.name}`,n)}}function Te(t){const e=t.name;if(xi.has(e))return Ne.debug(`There were multiple attempts to register component ${e}.`),!1;xi.set(e,t);for(const n of kn.values())ys(n,t);for(const n of $l.values())ys(n,t);return!0}function ot(t,e){const n=t.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),t.container.getProvider(e)}function K(t){return t.settings!==void 0}/**
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
 */const Vl={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},Ke=new st("app","Firebase",Vl);/**
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
 */class Bl{constructor(e,n,r){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},n),this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new we("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw Ke.create("app-deleted",{appName:this._name})}}/**
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
 */const It=xl;function wo(t,e={}){let n=t;typeof e!="object"&&(e={name:e});const r=Object.assign({name:Fi,automaticDataCollectionEnabled:!1},e),s=r.name;if(typeof s!="string"||!s)throw Ke.create("bad-app-name",{appName:String(s)});if(n||(n=ho()),!n)throw Ke.create("no-options");const a=kn.get(s);if(a){if(zt(n,a.options)&&zt(r,a.config))return a;throw Ke.create("duplicate-app",{appName:s})}const l=new Jc(s);for(const g of xi.values())l.addComponent(g);const h=new Bl(n,r,l);return kn.set(s,h),h}function zi(t=Fi){const e=kn.get(t);if(!e&&t===Fi&&ho())return wo();if(!e)throw Ke.create("no-app",{appName:t});return e}function ge(t,e,n){var r;let s=(r=jl[t])!==null&&r!==void 0?r:t;n&&(s+=`-${n}`);const a=s.match(/\s|\//),l=e.match(/\s|\//);if(a||l){const h=[`Unable to register library "${s}" with version "${e}":`];a&&h.push(`library name "${s}" contains illegal characters (whitespace or "/")`),a&&l&&h.push("and"),l&&h.push(`version name "${e}" contains illegal characters (whitespace or "/")`),Ne.warn(h.join(" "));return}Te(new we(`${s}-version`,()=>({library:s,version:e}),"VERSION"))}/**
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
 */const Hl="firebase-heartbeat-database",Wl=1,Gt="firebase-heartbeat-store";let Ai=null;function Io(){return Ai||(Ai=_o(Hl,Wl,{upgrade:(t,e)=>{switch(e){case 0:try{t.createObjectStore(Gt)}catch(n){console.warn(n)}}}}).catch(t=>{throw Ke.create("idb-open",{originalErrorMessage:t.message})})),Ai}async function zl(t){try{const n=(await Io()).transaction(Gt),r=await n.objectStore(Gt).get(Eo(t));return await n.done,r}catch(e){if(e instanceof Ie)Ne.warn(e.message);else{const n=Ke.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});Ne.warn(n.message)}}}async function vs(t,e){try{const r=(await Io()).transaction(Gt,"readwrite");await r.objectStore(Gt).put(e,Eo(t)),await r.done}catch(n){if(n instanceof Ie)Ne.warn(n.message);else{const r=Ke.create("idb-set",{originalErrorMessage:n==null?void 0:n.message});Ne.warn(r.message)}}}function Eo(t){return`${t.name}!${t.options.appId}`}/**
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
 */const Gl=1024,ql=30*24*60*60*1e3;class Kl{constructor(e){this.container=e,this._heartbeatsCache=null;const n=this.container.getProvider("app").getImmediate();this._storage=new Yl(n),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){var e,n;try{const s=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),a=_s();return((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((n=this._heartbeatsCache)===null||n===void 0?void 0:n.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===a||this._heartbeatsCache.heartbeats.some(l=>l.date===a)?void 0:(this._heartbeatsCache.heartbeats.push({date:a,agent:s}),this._heartbeatsCache.heartbeats=this._heartbeatsCache.heartbeats.filter(l=>{const h=new Date(l.date).valueOf();return Date.now()-h<=ql}),this._storage.overwrite(this._heartbeatsCache))}catch(r){Ne.warn(r)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const n=_s(),{heartbeatsToSend:r,unsentEntries:s}=Jl(this._heartbeatsCache.heartbeats),a=Pn(JSON.stringify({version:2,heartbeats:r}));return this._heartbeatsCache.lastSentHeartbeatDate=n,s.length>0?(this._heartbeatsCache.heartbeats=s,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),a}catch(n){return Ne.warn(n),""}}}function _s(){return new Date().toISOString().substring(0,10)}function Jl(t,e=Gl){const n=[];let r=t.slice();for(const s of t){const a=n.find(l=>l.agent===s.agent);if(a){if(a.dates.push(s.date),ws(n)>e){a.dates.pop();break}}else if(n.push({agent:s.agent,dates:[s.date]}),ws(n)>e){n.pop();break}r=r.slice(1)}return{heartbeatsToSend:n,unsentEntries:r}}class Yl{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return go()?mo().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const n=await zl(this.app);return n!=null&&n.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var n;if(await this._canUseIndexedDBPromise){const s=await this.read();return vs(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:s.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var n;if(await this._canUseIndexedDBPromise){const s=await this.read();return vs(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:s.lastSentHeartbeatDate,heartbeats:[...s.heartbeats,...e.heartbeats]})}else return}}function ws(t){return Pn(JSON.stringify({version:2,heartbeats:t})).length}/**
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
 */function Xl(t){Te(new we("platform-logger",e=>new ul(e),"PRIVATE")),Te(new we("heartbeat",e=>new Kl(e),"PRIVATE")),ge(Ui,ms,t),ge(Ui,ms,"esm2017"),ge("fire-js","")}Xl("");var Ql="firebase",Zl="10.14.1";/**
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
 */ge(Ql,Zl,"app");function Gi(t,e){var n={};for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&e.indexOf(r)<0&&(n[r]=t[r]);if(t!=null&&typeof Object.getOwnPropertySymbols=="function")for(var s=0,r=Object.getOwnPropertySymbols(t);s<r.length;s++)e.indexOf(r[s])<0&&Object.prototype.propertyIsEnumerable.call(t,r[s])&&(n[r[s]]=t[r[s]]);return n}function To(){return{"dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK."}}const eu=To,bo=new st("auth","Firebase",To());/**
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
 */const Rn=new Fn("@firebase/auth");function tu(t,...e){Rn.logLevel<=O.WARN&&Rn.warn(`Auth (${It}): ${t}`,...e)}function En(t,...e){Rn.logLevel<=O.ERROR&&Rn.error(`Auth (${It}): ${t}`,...e)}/**
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
 */function me(t,...e){throw Ki(t,...e)}function ue(t,...e){return Ki(t,...e)}function qi(t,e,n){const r=Object.assign(Object.assign({},eu()),{[e]:n});return new st("auth","Firebase",r).create(e,{appName:t.name})}function oe(t){return qi(t,"operation-not-supported-in-this-environment","Operations that alter the current user are not supported in conjunction with FirebaseServerApp")}function xn(t,e,n){const r=n;if(!(e instanceof r))throw r.name!==e.constructor.name&&me(t,"argument-error"),qi(t,"argument-error",`Type of ${e.constructor.name} does not match expected instance.Did you pass a reference from a different Auth SDK?`)}function Ki(t,...e){if(typeof t!="string"){const n=e[0],r=[...e.slice(1)];return r[0]&&(r[0].appName=t.name),t._errorFactory.create(n,...r)}return bo.create(t,...e)}function b(t,e,...n){if(!t)throw Ki(e,...n)}function Ce(t){const e="INTERNAL ASSERTION FAILED: "+t;throw En(e),new Error(e)}function Le(t,e){t||Ce(e)}/**
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
 */function qt(){var t;return typeof self<"u"&&((t=self.location)===null||t===void 0?void 0:t.href)||""}function Ji(){return Is()==="http:"||Is()==="https:"}function Is(){var t;return typeof self<"u"&&((t=self.location)===null||t===void 0?void 0:t.protocol)||null}/**
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
 */function nu(){return typeof navigator<"u"&&navigator&&"onLine"in navigator&&typeof navigator.onLine=="boolean"&&(Ji()||po()||"connection"in navigator)?navigator.onLine:!0}function iu(){if(typeof navigator>"u")return null;const t=navigator;return t.languages&&t.languages[0]||t.language||null}/**
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
 */class Xt{constructor(e,n){this.shortDelay=e,this.longDelay=n,Le(n>e,"Short delay should be less than long delay!"),this.isMobile=Cc()||Dc()}get(){return nu()?this.isMobile?this.longDelay:this.shortDelay:Math.min(5e3,this.shortDelay)}}/**
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
 */function Yi(t,e){Le(t.emulator,"Emulator should always be set here");const{url:n}=t.emulator;return e?`${n}${e.startsWith("/")?e.slice(1):e}`:n}/**
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
 */class Ao{static initialize(e,n,r){this.fetchImpl=e,n&&(this.headersImpl=n),r&&(this.responseImpl=r)}static fetch(){if(this.fetchImpl)return this.fetchImpl;if(typeof self<"u"&&"fetch"in self)return self.fetch;if(typeof globalThis<"u"&&globalThis.fetch)return globalThis.fetch;if(typeof fetch<"u")return fetch;Ce("Could not find fetch implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static headers(){if(this.headersImpl)return this.headersImpl;if(typeof self<"u"&&"Headers"in self)return self.Headers;if(typeof globalThis<"u"&&globalThis.Headers)return globalThis.Headers;if(typeof Headers<"u")return Headers;Ce("Could not find Headers implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static response(){if(this.responseImpl)return this.responseImpl;if(typeof self<"u"&&"Response"in self)return self.Response;if(typeof globalThis<"u"&&globalThis.Response)return globalThis.Response;if(typeof Response<"u")return Response;Ce("Could not find Response implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}}/**
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
 */const ru={CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_PASSWORD:"wrong-password",MISSING_PASSWORD:"missing-password",INVALID_LOGIN_CREDENTIALS:"invalid-credential",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_REQ_TYPE:"internal-error",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",PASSWORD_DOES_NOT_MEET_REQUIREMENTS:"password-does-not-meet-requirements",INVALID_CODE:"invalid-verification-code",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_SESSION_INFO:"missing-verification-id",SESSION_EXPIRED:"code-expired",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",BLOCKING_FUNCTION_ERROR_RESPONSE:"internal-error",RECAPTCHA_NOT_ENABLED:"recaptcha-not-enabled",MISSING_RECAPTCHA_TOKEN:"missing-recaptcha-token",INVALID_RECAPTCHA_TOKEN:"invalid-recaptcha-token",INVALID_RECAPTCHA_ACTION:"invalid-recaptcha-action",MISSING_CLIENT_TYPE:"missing-client-type",MISSING_RECAPTCHA_VERSION:"missing-recaptcha-version",INVALID_RECAPTCHA_VERSION:"invalid-recaptcha-version",INVALID_REQ_TYPE:"invalid-req-type"};/**
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
 */const su=new Xt(3e4,6e4);function H(t,e){return t.tenantId&&!e.tenantId?Object.assign(Object.assign({},e),{tenantId:t.tenantId}):e}async function W(t,e,n,r,s={}){return So(t,s,async()=>{let a={},l={};r&&(e==="GET"?l=r:a={body:JSON.stringify(r)});const h=wt(Object.assign({key:t.config.apiKey},l)).slice(1),g=await t._getAdditionalHeaders();g["Content-Type"]="application/json",t.languageCode&&(g["X-Firebase-Locale"]=t.languageCode);const I=Object.assign({method:e,headers:g},a);return Oc()||(I.referrerPolicy="no-referrer"),Ao.fetch()(Po(t,t.config.apiHost,n,h),I)})}async function So(t,e,n){t._canInitEmulator=!1;const r=Object.assign(Object.assign({},ru),e);try{const s=new au(t),a=await Promise.race([n(),s.promise]);s.clearNetworkTimeout();const l=await a.json();if("needConfirmation"in l)throw jt(t,"account-exists-with-different-credential",l);if(a.ok&&!("errorMessage"in l))return l;{const h=a.ok?l.errorMessage:l.error.message,[g,I]=h.split(" : ");if(g==="FEDERATED_USER_ID_ALREADY_LINKED")throw jt(t,"credential-already-in-use",l);if(g==="EMAIL_EXISTS")throw jt(t,"email-already-in-use",l);if(g==="USER_DISABLED")throw jt(t,"user-disabled",l);const A=r[g]||g.toLowerCase().replace(/[_\s]+/g,"-");if(I)throw qi(t,A,I);me(t,A)}}catch(s){if(s instanceof Ie)throw s;me(t,"network-request-failed",{message:String(s)})}}async function Ue(t,e,n,r,s={}){const a=await W(t,e,n,r,s);return"mfaPendingCredential"in a&&me(t,"multi-factor-auth-required",{_serverResponse:a}),a}function Po(t,e,n,r){const s=`${e}${n}?${r}`;return t.config.emulator?Yi(t.config,s):`${t.config.apiScheme}://${s}`}function ou(t){switch(t){case"ENFORCE":return"ENFORCE";case"AUDIT":return"AUDIT";case"OFF":return"OFF";default:return"ENFORCEMENT_STATE_UNSPECIFIED"}}class au{constructor(e){this.auth=e,this.timer=null,this.promise=new Promise((n,r)=>{this.timer=setTimeout(()=>r(ue(this.auth,"network-request-failed")),su.get())})}clearNetworkTimeout(){clearTimeout(this.timer)}}function jt(t,e,n){const r={appName:t.name};n.email&&(r.email=n.email),n.phoneNumber&&(r.phoneNumber=n.phoneNumber);const s=ue(t,e,r);return s.customData._tokenResponse=n,s}/**
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
 */function Es(t){return t!==void 0&&t.getResponse!==void 0}function Ts(t){return t!==void 0&&t.enterprise!==void 0}class cu{constructor(e){if(this.siteKey="",this.recaptchaEnforcementState=[],e.recaptchaKey===void 0)throw new Error("recaptchaKey undefined");this.siteKey=e.recaptchaKey.split("/")[3],this.recaptchaEnforcementState=e.recaptchaEnforcementState}getProviderEnforcementState(e){if(!this.recaptchaEnforcementState||this.recaptchaEnforcementState.length===0)return null;for(const n of this.recaptchaEnforcementState)if(n.provider&&n.provider===e)return ou(n.enforcementState);return null}isProviderEnabled(e){return this.getProviderEnforcementState(e)==="ENFORCE"||this.getProviderEnforcementState(e)==="AUDIT"}}/**
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
 */async function lu(t){return(await W(t,"GET","/v1/recaptchaParams")).recaptchaSiteKey||""}async function uu(t,e){return W(t,"GET","/v2/recaptchaConfig",H(t,e))}/**
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
 */async function hu(t,e){return W(t,"POST","/v1/accounts:delete",e)}async function du(t,e){return W(t,"POST","/v1/accounts:update",e)}async function ko(t,e){return W(t,"POST","/v1/accounts:lookup",e)}/**
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
 */function $t(t){if(t)try{const e=new Date(Number(t));if(!isNaN(e.getTime()))return e.toUTCString()}catch{}}async function fu(t,e=!1){const n=D(t),r=await n.getIdToken(e),s=jn(r);b(s&&s.exp&&s.auth_time&&s.iat,n.auth,"internal-error");const a=typeof s.firebase=="object"?s.firebase:void 0,l=a==null?void 0:a.sign_in_provider;return{claims:s,token:r,authTime:$t(Si(s.auth_time)),issuedAtTime:$t(Si(s.iat)),expirationTime:$t(Si(s.exp)),signInProvider:l||null,signInSecondFactor:(a==null?void 0:a.sign_in_second_factor)||null}}function Si(t){return Number(t)*1e3}function jn(t){const[e,n,r]=t.split(".");if(e===void 0||n===void 0||r===void 0)return En("JWT malformed, contained fewer than 3 sections"),null;try{const s=lo(n);return s?JSON.parse(s):(En("Failed to decode base64 JWT payload"),null)}catch(s){return En("Caught error parsing JWT payload as JSON",s==null?void 0:s.toString()),null}}function bs(t){const e=jn(t);return b(e,"internal-error"),b(typeof e.exp<"u","internal-error"),b(typeof e.iat<"u","internal-error"),Number(e.exp)-Number(e.iat)}/**
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
 */async function nt(t,e,n=!1){if(n)return e;try{return await e}catch(r){throw r instanceof Ie&&pu(r)&&t.auth.currentUser===t&&await t.auth.signOut(),r}}function pu({code:t}){return t==="auth/user-disabled"||t==="auth/user-token-expired"}/**
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
 */class gu{constructor(e){this.user=e,this.isRunning=!1,this.timerId=null,this.errorBackoff=3e4}_start(){this.isRunning||(this.isRunning=!0,this.schedule())}_stop(){this.isRunning&&(this.isRunning=!1,this.timerId!==null&&clearTimeout(this.timerId))}getInterval(e){var n;if(e){const r=this.errorBackoff;return this.errorBackoff=Math.min(this.errorBackoff*2,96e4),r}else{this.errorBackoff=3e4;const s=((n=this.user.stsTokenManager.expirationTime)!==null&&n!==void 0?n:0)-Date.now()-3e5;return Math.max(0,s)}}schedule(e=!1){if(!this.isRunning)return;const n=this.getInterval(e);this.timerId=setTimeout(async()=>{await this.iteration()},n)}async iteration(){try{await this.user.getIdToken(!0)}catch(e){(e==null?void 0:e.code)==="auth/network-request-failed"&&this.schedule(!0);return}this.schedule()}}/**
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
 */class ji{constructor(e,n){this.createdAt=e,this.lastLoginAt=n,this._initializeTime()}_initializeTime(){this.lastSignInTime=$t(this.lastLoginAt),this.creationTime=$t(this.createdAt)}_copy(e){this.createdAt=e.createdAt,this.lastLoginAt=e.lastLoginAt,this._initializeTime()}toJSON(){return{createdAt:this.createdAt,lastLoginAt:this.lastLoginAt}}}/**
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
 */async function Kt(t){var e;const n=t.auth,r=await t.getIdToken(),s=await nt(t,ko(n,{idToken:r}));b(s==null?void 0:s.users.length,n,"internal-error");const a=s.users[0];t._notifyReloadListener(a);const l=!((e=a.providerUserInfo)===null||e===void 0)&&e.length?Ro(a.providerUserInfo):[],h=yu(t.providerData,l),g=t.isAnonymous,I=!(t.email&&a.passwordHash)&&!(h!=null&&h.length),A=g?I:!1,S={uid:a.localId,displayName:a.displayName||null,photoURL:a.photoUrl||null,email:a.email||null,emailVerified:a.emailVerified||!1,phoneNumber:a.phoneNumber||null,tenantId:a.tenantId||null,providerData:h,metadata:new ji(a.createdAt,a.lastLoginAt),isAnonymous:A};Object.assign(t,S)}async function mu(t){const e=D(t);await Kt(e),await e.auth._persistUserIfCurrent(e),e.auth._notifyListenersIfCurrent(e)}function yu(t,e){return[...t.filter(r=>!e.some(s=>s.providerId===r.providerId)),...e]}function Ro(t){return t.map(e=>{var{providerId:n}=e,r=Gi(e,["providerId"]);return{providerId:n,uid:r.rawId||"",displayName:r.displayName||null,email:r.email||null,phoneNumber:r.phoneNumber||null,photoURL:r.photoUrl||null}})}/**
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
 */async function vu(t,e){const n=await So(t,{},async()=>{const r=wt({grant_type:"refresh_token",refresh_token:e}).slice(1),{tokenApiHost:s,apiKey:a}=t.config,l=Po(t,s,"/v1/token",`key=${a}`),h=await t._getAdditionalHeaders();return h["Content-Type"]="application/x-www-form-urlencoded",Ao.fetch()(l,{method:"POST",headers:h,body:r})});return{accessToken:n.access_token,expiresIn:n.expires_in,refreshToken:n.refresh_token}}async function _u(t,e){return W(t,"POST","/v2/accounts:revokeToken",H(t,e))}/**
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
 */class pt{constructor(){this.refreshToken=null,this.accessToken=null,this.expirationTime=null}get isExpired(){return!this.expirationTime||Date.now()>this.expirationTime-3e4}updateFromServerResponse(e){b(e.idToken,"internal-error"),b(typeof e.idToken<"u","internal-error"),b(typeof e.refreshToken<"u","internal-error");const n="expiresIn"in e&&typeof e.expiresIn<"u"?Number(e.expiresIn):bs(e.idToken);this.updateTokensAndExpiration(e.idToken,e.refreshToken,n)}updateFromIdToken(e){b(e.length!==0,"internal-error");const n=bs(e);this.updateTokensAndExpiration(e,null,n)}async getToken(e,n=!1){return!n&&this.accessToken&&!this.isExpired?this.accessToken:(b(this.refreshToken,e,"user-token-expired"),this.refreshToken?(await this.refresh(e,this.refreshToken),this.accessToken):null)}clearRefreshToken(){this.refreshToken=null}async refresh(e,n){const{accessToken:r,refreshToken:s,expiresIn:a}=await vu(e,n);this.updateTokensAndExpiration(r,s,Number(a))}updateTokensAndExpiration(e,n,r){this.refreshToken=n||null,this.accessToken=e||null,this.expirationTime=Date.now()+r*1e3}static fromJSON(e,n){const{refreshToken:r,accessToken:s,expirationTime:a}=n,l=new pt;return r&&(b(typeof r=="string","internal-error",{appName:e}),l.refreshToken=r),s&&(b(typeof s=="string","internal-error",{appName:e}),l.accessToken=s),a&&(b(typeof a=="number","internal-error",{appName:e}),l.expirationTime=a),l}toJSON(){return{refreshToken:this.refreshToken,accessToken:this.accessToken,expirationTime:this.expirationTime}}_assign(e){this.accessToken=e.accessToken,this.refreshToken=e.refreshToken,this.expirationTime=e.expirationTime}_clone(){return Object.assign(new pt,this.toJSON())}_performRefresh(){return Ce("not implemented")}}/**
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
 */function Ve(t,e){b(typeof t=="string"||typeof t>"u","internal-error",{appName:e})}class Oe{constructor(e){var{uid:n,auth:r,stsTokenManager:s}=e,a=Gi(e,["uid","auth","stsTokenManager"]);this.providerId="firebase",this.proactiveRefresh=new gu(this),this.reloadUserInfo=null,this.reloadListener=null,this.uid=n,this.auth=r,this.stsTokenManager=s,this.accessToken=s.accessToken,this.displayName=a.displayName||null,this.email=a.email||null,this.emailVerified=a.emailVerified||!1,this.phoneNumber=a.phoneNumber||null,this.photoURL=a.photoURL||null,this.isAnonymous=a.isAnonymous||!1,this.tenantId=a.tenantId||null,this.providerData=a.providerData?[...a.providerData]:[],this.metadata=new ji(a.createdAt||void 0,a.lastLoginAt||void 0)}async getIdToken(e){const n=await nt(this,this.stsTokenManager.getToken(this.auth,e));return b(n,this.auth,"internal-error"),this.accessToken!==n&&(this.accessToken=n,await this.auth._persistUserIfCurrent(this),this.auth._notifyListenersIfCurrent(this)),n}getIdTokenResult(e){return fu(this,e)}reload(){return mu(this)}_assign(e){this!==e&&(b(this.uid===e.uid,this.auth,"internal-error"),this.displayName=e.displayName,this.photoURL=e.photoURL,this.email=e.email,this.emailVerified=e.emailVerified,this.phoneNumber=e.phoneNumber,this.isAnonymous=e.isAnonymous,this.tenantId=e.tenantId,this.providerData=e.providerData.map(n=>Object.assign({},n)),this.metadata._copy(e.metadata),this.stsTokenManager._assign(e.stsTokenManager))}_clone(e){const n=new Oe(Object.assign(Object.assign({},this),{auth:e,stsTokenManager:this.stsTokenManager._clone()}));return n.metadata._copy(this.metadata),n}_onReload(e){b(!this.reloadListener,this.auth,"internal-error"),this.reloadListener=e,this.reloadUserInfo&&(this._notifyReloadListener(this.reloadUserInfo),this.reloadUserInfo=null)}_notifyReloadListener(e){this.reloadListener?this.reloadListener(e):this.reloadUserInfo=e}_startProactiveRefresh(){this.proactiveRefresh._start()}_stopProactiveRefresh(){this.proactiveRefresh._stop()}async _updateTokensIfNecessary(e,n=!1){let r=!1;e.idToken&&e.idToken!==this.stsTokenManager.accessToken&&(this.stsTokenManager.updateFromServerResponse(e),r=!0),n&&await Kt(this),await this.auth._persistUserIfCurrent(this),r&&this.auth._notifyListenersIfCurrent(this)}async delete(){if(K(this.auth.app))return Promise.reject(oe(this.auth));const e=await this.getIdToken();return await nt(this,hu(this.auth,{idToken:e})),this.stsTokenManager.clearRefreshToken(),this.auth.signOut()}toJSON(){return Object.assign(Object.assign({uid:this.uid,email:this.email||void 0,emailVerified:this.emailVerified,displayName:this.displayName||void 0,isAnonymous:this.isAnonymous,photoURL:this.photoURL||void 0,phoneNumber:this.phoneNumber||void 0,tenantId:this.tenantId||void 0,providerData:this.providerData.map(e=>Object.assign({},e)),stsTokenManager:this.stsTokenManager.toJSON(),_redirectEventId:this._redirectEventId},this.metadata.toJSON()),{apiKey:this.auth.config.apiKey,appName:this.auth.name})}get refreshToken(){return this.stsTokenManager.refreshToken||""}static _fromJSON(e,n){var r,s,a,l,h,g,I,A;const S=(r=n.displayName)!==null&&r!==void 0?r:void 0,P=(s=n.email)!==null&&s!==void 0?s:void 0,N=(a=n.phoneNumber)!==null&&a!==void 0?a:void 0,k=(l=n.photoURL)!==null&&l!==void 0?l:void 0,x=(h=n.tenantId)!==null&&h!==void 0?h:void 0,M=(g=n._redirectEventId)!==null&&g!==void 0?g:void 0,fe=(I=n.createdAt)!==null&&I!==void 0?I:void 0,te=(A=n.lastLoginAt)!==null&&A!==void 0?A:void 0,{uid:z,emailVerified:ne,isAnonymous:Ae,providerData:Y,stsTokenManager:m}=n;b(z&&m,e,"internal-error");const d=pt.fromJSON(this.name,m);b(typeof z=="string",e,"internal-error"),Ve(S,e.name),Ve(P,e.name),b(typeof ne=="boolean",e,"internal-error"),b(typeof Ae=="boolean",e,"internal-error"),Ve(N,e.name),Ve(k,e.name),Ve(x,e.name),Ve(M,e.name),Ve(fe,e.name),Ve(te,e.name);const f=new Oe({uid:z,auth:e,email:P,emailVerified:ne,displayName:S,isAnonymous:Ae,photoURL:k,phoneNumber:N,tenantId:x,stsTokenManager:d,createdAt:fe,lastLoginAt:te});return Y&&Array.isArray(Y)&&(f.providerData=Y.map(y=>Object.assign({},y))),M&&(f._redirectEventId=M),f}static async _fromIdTokenResponse(e,n,r=!1){const s=new pt;s.updateFromServerResponse(n);const a=new Oe({uid:n.localId,auth:e,stsTokenManager:s,isAnonymous:r});return await Kt(a),a}static async _fromGetAccountInfoResponse(e,n,r){const s=n.users[0];b(s.localId!==void 0,"internal-error");const a=s.providerUserInfo!==void 0?Ro(s.providerUserInfo):[],l=!(s.email&&s.passwordHash)&&!(a!=null&&a.length),h=new pt;h.updateFromIdToken(r);const g=new Oe({uid:s.localId,auth:e,stsTokenManager:h,isAnonymous:l}),I={uid:s.localId,displayName:s.displayName||null,photoURL:s.photoUrl||null,email:s.email||null,emailVerified:s.emailVerified||!1,phoneNumber:s.phoneNumber||null,tenantId:s.tenantId||null,providerData:a,metadata:new ji(s.createdAt,s.lastLoginAt),isAnonymous:!(s.email&&s.passwordHash)&&!(a!=null&&a.length)};return Object.assign(g,I),g}}/**
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
 */const As=new Map;function De(t){Le(t instanceof Function,"Expected a class definition");let e=As.get(t);return e?(Le(e instanceof t,"Instance stored in cache mismatched with class"),e):(e=new t,As.set(t,e),e)}/**
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
 */class Co{constructor(){this.type="NONE",this.storage={}}async _isAvailable(){return!0}async _set(e,n){this.storage[e]=n}async _get(e){const n=this.storage[e];return n===void 0?null:n}async _remove(e){delete this.storage[e]}_addListener(e,n){}_removeListener(e,n){}}Co.type="NONE";const Ss=Co;/**
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
 */function Tn(t,e,n){return`firebase:${t}:${e}:${n}`}class gt{constructor(e,n,r){this.persistence=e,this.auth=n,this.userKey=r;const{config:s,name:a}=this.auth;this.fullUserKey=Tn(this.userKey,s.apiKey,a),this.fullPersistenceKey=Tn("persistence",s.apiKey,a),this.boundEventHandler=n._onStorageEvent.bind(n),this.persistence._addListener(this.fullUserKey,this.boundEventHandler)}setCurrentUser(e){return this.persistence._set(this.fullUserKey,e.toJSON())}async getCurrentUser(){const e=await this.persistence._get(this.fullUserKey);return e?Oe._fromJSON(this.auth,e):null}removeCurrentUser(){return this.persistence._remove(this.fullUserKey)}savePersistenceForRedirect(){return this.persistence._set(this.fullPersistenceKey,this.persistence.type)}async setPersistence(e){if(this.persistence===e)return;const n=await this.getCurrentUser();if(await this.removeCurrentUser(),this.persistence=e,n)return this.setCurrentUser(n)}delete(){this.persistence._removeListener(this.fullUserKey,this.boundEventHandler)}static async create(e,n,r="authUser"){if(!n.length)return new gt(De(Ss),e,r);const s=(await Promise.all(n.map(async I=>{if(await I._isAvailable())return I}))).filter(I=>I);let a=s[0]||De(Ss);const l=Tn(r,e.config.apiKey,e.name);let h=null;for(const I of n)try{const A=await I._get(l);if(A){const S=Oe._fromJSON(e,A);I!==a&&(h=S),a=I;break}}catch{}const g=s.filter(I=>I._shouldAllowMigration);return!a._shouldAllowMigration||!g.length?new gt(a,e,r):(a=g[0],h&&await a._set(l,h.toJSON()),await Promise.all(n.map(async I=>{if(I!==a)try{await I._remove(l)}catch{}})),new gt(a,e,r))}}/**
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
 */function Ps(t){const e=t.toLowerCase();if(e.includes("opera/")||e.includes("opr/")||e.includes("opios/"))return"Opera";if(Lo(e))return"IEMobile";if(e.includes("msie")||e.includes("trident/"))return"IE";if(e.includes("edge/"))return"Edge";if(Oo(e))return"Firefox";if(e.includes("silk/"))return"Silk";if(Uo(e))return"Blackberry";if(Fo(e))return"Webos";if(Do(e))return"Safari";if((e.includes("chrome/")||No(e))&&!e.includes("edge/"))return"Chrome";if(Mo(e))return"Android";{const n=/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/,r=t.match(n);if((r==null?void 0:r.length)===2)return r[1]}return"Other"}function Oo(t=ae()){return/firefox\//i.test(t)}function Do(t=ae()){const e=t.toLowerCase();return e.includes("safari/")&&!e.includes("chrome/")&&!e.includes("crios/")&&!e.includes("android")}function No(t=ae()){return/crios\//i.test(t)}function Lo(t=ae()){return/iemobile/i.test(t)}function Mo(t=ae()){return/android/i.test(t)}function Uo(t=ae()){return/blackberry/i.test(t)}function Fo(t=ae()){return/webos/i.test(t)}function Xi(t=ae()){return/iphone|ipad|ipod/i.test(t)||/macintosh/i.test(t)&&/mobile/i.test(t)}function wu(t=ae()){var e;return Xi(t)&&!!(!((e=window.navigator)===null||e===void 0)&&e.standalone)}function Iu(){return Nc()&&document.documentMode===10}function xo(t=ae()){return Xi(t)||Mo(t)||Fo(t)||Uo(t)||/windows phone/i.test(t)||Lo(t)}/**
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
 */function jo(t,e=[]){let n;switch(t){case"Browser":n=Ps(ae());break;case"Worker":n=`${Ps(ae())}-${t}`;break;default:n=t}const r=e.length?e.join(","):"FirebaseCore-web";return`${n}/JsCore/${It}/${r}`}/**
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
 */class Eu{constructor(e){this.auth=e,this.queue=[]}pushCallback(e,n){const r=a=>new Promise((l,h)=>{try{const g=e(a);l(g)}catch(g){h(g)}});r.onAbort=n,this.queue.push(r);const s=this.queue.length-1;return()=>{this.queue[s]=()=>Promise.resolve()}}async runMiddleware(e){if(this.auth.currentUser===e)return;const n=[];try{for(const r of this.queue)await r(e),r.onAbort&&n.push(r.onAbort)}catch(r){n.reverse();for(const s of n)try{s()}catch{}throw this.auth._errorFactory.create("login-blocked",{originalMessage:r==null?void 0:r.message})}}}/**
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
 */async function Tu(t,e={}){return W(t,"GET","/v2/passwordPolicy",H(t,e))}/**
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
 */const bu=6;class Au{constructor(e){var n,r,s,a;const l=e.customStrengthOptions;this.customStrengthOptions={},this.customStrengthOptions.minPasswordLength=(n=l.minPasswordLength)!==null&&n!==void 0?n:bu,l.maxPasswordLength&&(this.customStrengthOptions.maxPasswordLength=l.maxPasswordLength),l.containsLowercaseCharacter!==void 0&&(this.customStrengthOptions.containsLowercaseLetter=l.containsLowercaseCharacter),l.containsUppercaseCharacter!==void 0&&(this.customStrengthOptions.containsUppercaseLetter=l.containsUppercaseCharacter),l.containsNumericCharacter!==void 0&&(this.customStrengthOptions.containsNumericCharacter=l.containsNumericCharacter),l.containsNonAlphanumericCharacter!==void 0&&(this.customStrengthOptions.containsNonAlphanumericCharacter=l.containsNonAlphanumericCharacter),this.enforcementState=e.enforcementState,this.enforcementState==="ENFORCEMENT_STATE_UNSPECIFIED"&&(this.enforcementState="OFF"),this.allowedNonAlphanumericCharacters=(s=(r=e.allowedNonAlphanumericCharacters)===null||r===void 0?void 0:r.join(""))!==null&&s!==void 0?s:"",this.forceUpgradeOnSignin=(a=e.forceUpgradeOnSignin)!==null&&a!==void 0?a:!1,this.schemaVersion=e.schemaVersion}validatePassword(e){var n,r,s,a,l,h;const g={isValid:!0,passwordPolicy:this};return this.validatePasswordLengthOptions(e,g),this.validatePasswordCharacterOptions(e,g),g.isValid&&(g.isValid=(n=g.meetsMinPasswordLength)!==null&&n!==void 0?n:!0),g.isValid&&(g.isValid=(r=g.meetsMaxPasswordLength)!==null&&r!==void 0?r:!0),g.isValid&&(g.isValid=(s=g.containsLowercaseLetter)!==null&&s!==void 0?s:!0),g.isValid&&(g.isValid=(a=g.containsUppercaseLetter)!==null&&a!==void 0?a:!0),g.isValid&&(g.isValid=(l=g.containsNumericCharacter)!==null&&l!==void 0?l:!0),g.isValid&&(g.isValid=(h=g.containsNonAlphanumericCharacter)!==null&&h!==void 0?h:!0),g}validatePasswordLengthOptions(e,n){const r=this.customStrengthOptions.minPasswordLength,s=this.customStrengthOptions.maxPasswordLength;r&&(n.meetsMinPasswordLength=e.length>=r),s&&(n.meetsMaxPasswordLength=e.length<=s)}validatePasswordCharacterOptions(e,n){this.updatePasswordCharacterOptionsStatuses(n,!1,!1,!1,!1);let r;for(let s=0;s<e.length;s++)r=e.charAt(s),this.updatePasswordCharacterOptionsStatuses(n,r>="a"&&r<="z",r>="A"&&r<="Z",r>="0"&&r<="9",this.allowedNonAlphanumericCharacters.includes(r))}updatePasswordCharacterOptionsStatuses(e,n,r,s,a){this.customStrengthOptions.containsLowercaseLetter&&(e.containsLowercaseLetter||(e.containsLowercaseLetter=n)),this.customStrengthOptions.containsUppercaseLetter&&(e.containsUppercaseLetter||(e.containsUppercaseLetter=r)),this.customStrengthOptions.containsNumericCharacter&&(e.containsNumericCharacter||(e.containsNumericCharacter=s)),this.customStrengthOptions.containsNonAlphanumericCharacter&&(e.containsNonAlphanumericCharacter||(e.containsNonAlphanumericCharacter=a))}}/**
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
 */class Su{constructor(e,n,r,s){this.app=e,this.heartbeatServiceProvider=n,this.appCheckServiceProvider=r,this.config=s,this.currentUser=null,this.emulatorConfig=null,this.operations=Promise.resolve(),this.authStateSubscription=new ks(this),this.idTokenSubscription=new ks(this),this.beforeStateQueue=new Eu(this),this.redirectUser=null,this.isProactiveRefreshEnabled=!1,this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION=1,this._canInitEmulator=!0,this._isInitialized=!1,this._deleted=!1,this._initializationPromise=null,this._popupRedirectResolver=null,this._errorFactory=bo,this._agentRecaptchaConfig=null,this._tenantRecaptchaConfigs={},this._projectPasswordPolicy=null,this._tenantPasswordPolicies={},this.lastNotifiedUid=void 0,this.languageCode=null,this.tenantId=null,this.settings={appVerificationDisabledForTesting:!1},this.frameworks=[],this.name=e.name,this.clientVersion=s.sdkClientVersion}_initializeWithPersistence(e,n){return n&&(this._popupRedirectResolver=De(n)),this._initializationPromise=this.queue(async()=>{var r,s;if(!this._deleted&&(this.persistenceManager=await gt.create(this,e),!this._deleted)){if(!((r=this._popupRedirectResolver)===null||r===void 0)&&r._shouldInitProactively)try{await this._popupRedirectResolver._initialize(this)}catch{}await this.initializeCurrentUser(n),this.lastNotifiedUid=((s=this.currentUser)===null||s===void 0?void 0:s.uid)||null,!this._deleted&&(this._isInitialized=!0)}}),this._initializationPromise}async _onStorageEvent(){if(this._deleted)return;const e=await this.assertedPersistence.getCurrentUser();if(!(!this.currentUser&&!e)){if(this.currentUser&&e&&this.currentUser.uid===e.uid){this._currentUser._assign(e),await this.currentUser.getIdToken();return}await this._updateCurrentUser(e,!0)}}async initializeCurrentUserFromIdToken(e){try{const n=await ko(this,{idToken:e}),r=await Oe._fromGetAccountInfoResponse(this,n,e);await this.directlySetCurrentUser(r)}catch(n){console.warn("FirebaseServerApp could not login user with provided authIdToken: ",n),await this.directlySetCurrentUser(null)}}async initializeCurrentUser(e){var n;if(K(this.app)){const l=this.app.settings.authIdToken;return l?new Promise(h=>{setTimeout(()=>this.initializeCurrentUserFromIdToken(l).then(h,h))}):this.directlySetCurrentUser(null)}const r=await this.assertedPersistence.getCurrentUser();let s=r,a=!1;if(e&&this.config.authDomain){await this.getOrInitRedirectPersistenceManager();const l=(n=this.redirectUser)===null||n===void 0?void 0:n._redirectEventId,h=s==null?void 0:s._redirectEventId,g=await this.tryRedirectSignIn(e);(!l||l===h)&&(g!=null&&g.user)&&(s=g.user,a=!0)}if(!s)return this.directlySetCurrentUser(null);if(!s._redirectEventId){if(a)try{await this.beforeStateQueue.runMiddleware(s)}catch(l){s=r,this._popupRedirectResolver._overrideRedirectResult(this,()=>Promise.reject(l))}return s?this.reloadAndSetCurrentUserOrClear(s):this.directlySetCurrentUser(null)}return b(this._popupRedirectResolver,this,"argument-error"),await this.getOrInitRedirectPersistenceManager(),this.redirectUser&&this.redirectUser._redirectEventId===s._redirectEventId?this.directlySetCurrentUser(s):this.reloadAndSetCurrentUserOrClear(s)}async tryRedirectSignIn(e){let n=null;try{n=await this._popupRedirectResolver._completeRedirectFn(this,e,!0)}catch{await this._setRedirectUser(null)}return n}async reloadAndSetCurrentUserOrClear(e){try{await Kt(e)}catch(n){if((n==null?void 0:n.code)!=="auth/network-request-failed")return this.directlySetCurrentUser(null)}return this.directlySetCurrentUser(e)}useDeviceLanguage(){this.languageCode=iu()}async _delete(){this._deleted=!0}async updateCurrentUser(e){if(K(this.app))return Promise.reject(oe(this));const n=e?D(e):null;return n&&b(n.auth.config.apiKey===this.config.apiKey,this,"invalid-user-token"),this._updateCurrentUser(n&&n._clone(this))}async _updateCurrentUser(e,n=!1){if(!this._deleted)return e&&b(this.tenantId===e.tenantId,this,"tenant-id-mismatch"),n||await this.beforeStateQueue.runMiddleware(e),this.queue(async()=>{await this.directlySetCurrentUser(e),this.notifyAuthListeners()})}async signOut(){return K(this.app)?Promise.reject(oe(this)):(await this.beforeStateQueue.runMiddleware(null),(this.redirectPersistenceManager||this._popupRedirectResolver)&&await this._setRedirectUser(null),this._updateCurrentUser(null,!0))}setPersistence(e){return K(this.app)?Promise.reject(oe(this)):this.queue(async()=>{await this.assertedPersistence.setPersistence(De(e))})}_getRecaptchaConfig(){return this.tenantId==null?this._agentRecaptchaConfig:this._tenantRecaptchaConfigs[this.tenantId]}async validatePassword(e){this._getPasswordPolicyInternal()||await this._updatePasswordPolicy();const n=this._getPasswordPolicyInternal();return n.schemaVersion!==this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION?Promise.reject(this._errorFactory.create("unsupported-password-policy-schema-version",{})):n.validatePassword(e)}_getPasswordPolicyInternal(){return this.tenantId===null?this._projectPasswordPolicy:this._tenantPasswordPolicies[this.tenantId]}async _updatePasswordPolicy(){const e=await Tu(this),n=new Au(e);this.tenantId===null?this._projectPasswordPolicy=n:this._tenantPasswordPolicies[this.tenantId]=n}_getPersistence(){return this.assertedPersistence.persistence.type}_updateErrorMap(e){this._errorFactory=new st("auth","Firebase",e())}onAuthStateChanged(e,n,r){return this.registerStateListener(this.authStateSubscription,e,n,r)}beforeAuthStateChanged(e,n){return this.beforeStateQueue.pushCallback(e,n)}onIdTokenChanged(e,n,r){return this.registerStateListener(this.idTokenSubscription,e,n,r)}authStateReady(){return new Promise((e,n)=>{if(this.currentUser)e();else{const r=this.onAuthStateChanged(()=>{r(),e()},n)}})}async revokeAccessToken(e){if(this.currentUser){const n=await this.currentUser.getIdToken(),r={providerId:"apple.com",tokenType:"ACCESS_TOKEN",token:e,idToken:n};this.tenantId!=null&&(r.tenantId=this.tenantId),await _u(this,r)}}toJSON(){var e;return{apiKey:this.config.apiKey,authDomain:this.config.authDomain,appName:this.name,currentUser:(e=this._currentUser)===null||e===void 0?void 0:e.toJSON()}}async _setRedirectUser(e,n){const r=await this.getOrInitRedirectPersistenceManager(n);return e===null?r.removeCurrentUser():r.setCurrentUser(e)}async getOrInitRedirectPersistenceManager(e){if(!this.redirectPersistenceManager){const n=e&&De(e)||this._popupRedirectResolver;b(n,this,"argument-error"),this.redirectPersistenceManager=await gt.create(this,[De(n._redirectPersistence)],"redirectUser"),this.redirectUser=await this.redirectPersistenceManager.getCurrentUser()}return this.redirectPersistenceManager}async _redirectUserForId(e){var n,r;return this._isInitialized&&await this.queue(async()=>{}),((n=this._currentUser)===null||n===void 0?void 0:n._redirectEventId)===e?this._currentUser:((r=this.redirectUser)===null||r===void 0?void 0:r._redirectEventId)===e?this.redirectUser:null}async _persistUserIfCurrent(e){if(e===this.currentUser)return this.queue(async()=>this.directlySetCurrentUser(e))}_notifyListenersIfCurrent(e){e===this.currentUser&&this.notifyAuthListeners()}_key(){return`${this.config.authDomain}:${this.config.apiKey}:${this.name}`}_startProactiveRefresh(){this.isProactiveRefreshEnabled=!0,this.currentUser&&this._currentUser._startProactiveRefresh()}_stopProactiveRefresh(){this.isProactiveRefreshEnabled=!1,this.currentUser&&this._currentUser._stopProactiveRefresh()}get _currentUser(){return this.currentUser}notifyAuthListeners(){var e,n;if(!this._isInitialized)return;this.idTokenSubscription.next(this.currentUser);const r=(n=(e=this.currentUser)===null||e===void 0?void 0:e.uid)!==null&&n!==void 0?n:null;this.lastNotifiedUid!==r&&(this.lastNotifiedUid=r,this.authStateSubscription.next(this.currentUser))}registerStateListener(e,n,r,s){if(this._deleted)return()=>{};const a=typeof n=="function"?n:n.next.bind(n);let l=!1;const h=this._isInitialized?Promise.resolve():this._initializationPromise;if(b(h,this,"internal-error"),h.then(()=>{l||a(this.currentUser)}),typeof n=="function"){const g=e.addObserver(n,r,s);return()=>{l=!0,g()}}else{const g=e.addObserver(n);return()=>{l=!0,g()}}}async directlySetCurrentUser(e){this.currentUser&&this.currentUser!==e&&this._currentUser._stopProactiveRefresh(),e&&this.isProactiveRefreshEnabled&&e._startProactiveRefresh(),this.currentUser=e,e?await this.assertedPersistence.setCurrentUser(e):await this.assertedPersistence.removeCurrentUser()}queue(e){return this.operations=this.operations.then(e,e),this.operations}get assertedPersistence(){return b(this.persistenceManager,this,"internal-error"),this.persistenceManager}_logFramework(e){!e||this.frameworks.includes(e)||(this.frameworks.push(e),this.frameworks.sort(),this.clientVersion=jo(this.config.clientPlatform,this._getFrameworks()))}_getFrameworks(){return this.frameworks}async _getAdditionalHeaders(){var e;const n={"X-Client-Version":this.clientVersion};this.app.options.appId&&(n["X-Firebase-gmpid"]=this.app.options.appId);const r=await((e=this.heartbeatServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getHeartbeatsHeader());r&&(n["X-Firebase-Client"]=r);const s=await this._getAppCheckToken();return s&&(n["X-Firebase-AppCheck"]=s),n}async _getAppCheckToken(){var e;const n=await((e=this.appCheckServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getToken());return n!=null&&n.error&&tu(`Error while retrieving App Check token: ${n.error}`),n==null?void 0:n.token}}function J(t){return D(t)}class ks{constructor(e){this.auth=e,this.observer=null,this.addObserver=jc(n=>this.observer=n)}get next(){return b(this.observer,this.auth,"internal-error"),this.observer.next.bind(this.observer)}}/**
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
 */let Qt={async loadJS(){throw new Error("Unable to load external scripts")},recaptchaV2Script:"",recaptchaEnterpriseScript:"",gapiScript:""};function Pu(t){Qt=t}function Qi(t){return Qt.loadJS(t)}function ku(){return Qt.recaptchaV2Script}function Ru(){return Qt.recaptchaEnterpriseScript}function Cu(){return Qt.gapiScript}function $o(t){return`__${t}${Math.floor(Math.random()*1e6)}`}const Ou="recaptcha-enterprise",Du="NO_RECAPTCHA";class Nu{constructor(e){this.type=Ou,this.auth=J(e)}async verify(e="verify",n=!1){async function r(a){if(!n){if(a.tenantId==null&&a._agentRecaptchaConfig!=null)return a._agentRecaptchaConfig.siteKey;if(a.tenantId!=null&&a._tenantRecaptchaConfigs[a.tenantId]!==void 0)return a._tenantRecaptchaConfigs[a.tenantId].siteKey}return new Promise(async(l,h)=>{uu(a,{clientType:"CLIENT_TYPE_WEB",version:"RECAPTCHA_ENTERPRISE"}).then(g=>{if(g.recaptchaKey===void 0)h(new Error("recaptcha Enterprise site key undefined"));else{const I=new cu(g);return a.tenantId==null?a._agentRecaptchaConfig=I:a._tenantRecaptchaConfigs[a.tenantId]=I,l(I.siteKey)}}).catch(g=>{h(g)})})}function s(a,l,h){const g=window.grecaptcha;Ts(g)?g.enterprise.ready(()=>{g.enterprise.execute(a,{action:e}).then(I=>{l(I)}).catch(()=>{l(Du)})}):h(Error("No reCAPTCHA enterprise script loaded."))}return new Promise((a,l)=>{r(this.auth).then(h=>{if(!n&&Ts(window.grecaptcha))s(h,a,l);else{if(typeof window>"u"){l(new Error("RecaptchaVerifier is only supported in browser"));return}let g=Ru();g.length!==0&&(g+=h),Qi(g).then(()=>{s(h,a,l)}).catch(I=>{l(I)})}}).catch(h=>{l(h)})})}}async function Rs(t,e,n,r=!1){const s=new Nu(t);let a;try{a=await s.verify(n)}catch{a=await s.verify(n,!0)}const l=Object.assign({},e);return r?Object.assign(l,{captchaResp:a}):Object.assign(l,{captchaResponse:a}),Object.assign(l,{clientType:"CLIENT_TYPE_WEB"}),Object.assign(l,{recaptchaVersion:"RECAPTCHA_ENTERPRISE"}),l}async function Jt(t,e,n,r){var s;if(!((s=t._getRecaptchaConfig())===null||s===void 0)&&s.isProviderEnabled("EMAIL_PASSWORD_PROVIDER")){const a=await Rs(t,e,n,n==="getOobCode");return r(t,a)}else return r(t,e).catch(async a=>{if(a.code==="auth/missing-recaptcha-token"){console.log(`${n} is protected by reCAPTCHA Enterprise for this project. Automatically triggering the reCAPTCHA flow and restarting the flow.`);const l=await Rs(t,e,n,n==="getOobCode");return r(t,l)}else return Promise.reject(a)})}/**
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
 */function Lu(t,e){const n=ot(t,"auth");if(n.isInitialized()){const s=n.getImmediate(),a=n.getOptions();if(zt(a,e??{}))return s;me(s,"already-initialized")}return n.initialize({options:e})}function Mu(t,e){const n=(e==null?void 0:e.persistence)||[],r=(Array.isArray(n)?n:[n]).map(De);e!=null&&e.errorMap&&t._updateErrorMap(e.errorMap),t._initializeWithPersistence(r,e==null?void 0:e.popupRedirectResolver)}function Uu(t,e,n){const r=J(t);b(r._canInitEmulator,r,"emulator-config-failed"),b(/^https?:\/\//.test(e),r,"invalid-emulator-scheme");const s=!1,a=Vo(e),{host:l,port:h}=Fu(e),g=h===null?"":`:${h}`;r.config.emulator={url:`${a}//${l}${g}/`},r.settings.appVerificationDisabledForTesting=!0,r.emulatorConfig=Object.freeze({host:l,port:h,protocol:a.replace(":",""),options:Object.freeze({disableWarnings:s})}),xu()}function Vo(t){const e=t.indexOf(":");return e<0?"":t.substr(0,e+1)}function Fu(t){const e=Vo(t),n=/(\/\/)?([^?#/]+)/.exec(t.substr(e.length));if(!n)return{host:"",port:null};const r=n[2].split("@").pop()||"",s=/^(\[[^\]]+\])(:|$)/.exec(r);if(s){const a=s[1];return{host:a,port:Cs(r.substr(a.length+1))}}else{const[a,l]=r.split(":");return{host:a,port:Cs(l)}}}function Cs(t){if(!t)return null;const e=Number(t);return isNaN(e)?null:e}function xu(){function t(){const e=document.createElement("p"),n=e.style;e.innerText="Running in emulator mode. Do not use with production credentials.",n.position="fixed",n.width="100%",n.backgroundColor="#ffffff",n.border=".1em solid #000000",n.color="#b50000",n.bottom="0px",n.left="0px",n.margin="0px",n.zIndex="10000",n.textAlign="center",e.classList.add("firebase-emulator-warning"),document.body.appendChild(e)}typeof console<"u"&&typeof console.info=="function"&&console.info("WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials."),typeof window<"u"&&typeof document<"u"&&(document.readyState==="loading"?window.addEventListener("DOMContentLoaded",t):t())}/**
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
 */class $n{constructor(e,n){this.providerId=e,this.signInMethod=n}toJSON(){return Ce("not implemented")}_getIdTokenResponse(e){return Ce("not implemented")}_linkToIdToken(e,n){return Ce("not implemented")}_getReauthenticationResolver(e){return Ce("not implemented")}}/**
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
 */async function ju(t,e){return W(t,"POST","/v1/accounts:resetPassword",H(t,e))}async function $u(t,e){return W(t,"POST","/v1/accounts:update",e)}async function Vu(t,e){return W(t,"POST","/v1/accounts:signUp",e)}async function Bu(t,e){return W(t,"POST","/v1/accounts:update",H(t,e))}/**
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
 */async function Hu(t,e){return Ue(t,"POST","/v1/accounts:signInWithPassword",H(t,e))}async function Vn(t,e){return W(t,"POST","/v1/accounts:sendOobCode",H(t,e))}async function Wu(t,e){return Vn(t,e)}async function zu(t,e){return Vn(t,e)}async function Gu(t,e){return Vn(t,e)}async function qu(t,e){return Vn(t,e)}/**
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
 */async function Ku(t,e){return Ue(t,"POST","/v1/accounts:signInWithEmailLink",H(t,e))}async function Ju(t,e){return Ue(t,"POST","/v1/accounts:signInWithEmailLink",H(t,e))}/**
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
 */class Yt extends $n{constructor(e,n,r,s=null){super("password",r),this._email=e,this._password=n,this._tenantId=s}static _fromEmailAndPassword(e,n){return new Yt(e,n,"password")}static _fromEmailAndCode(e,n,r=null){return new Yt(e,n,"emailLink",r)}toJSON(){return{email:this._email,password:this._password,signInMethod:this.signInMethod,tenantId:this._tenantId}}static fromJSON(e){const n=typeof e=="string"?JSON.parse(e):e;if(n!=null&&n.email&&(n!=null&&n.password)){if(n.signInMethod==="password")return this._fromEmailAndPassword(n.email,n.password);if(n.signInMethod==="emailLink")return this._fromEmailAndCode(n.email,n.password,n.tenantId)}return null}async _getIdTokenResponse(e){switch(this.signInMethod){case"password":const n={returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return Jt(e,n,"signInWithPassword",Hu);case"emailLink":return Ku(e,{email:this._email,oobCode:this._password});default:me(e,"internal-error")}}async _linkToIdToken(e,n){switch(this.signInMethod){case"password":const r={idToken:n,returnSecureToken:!0,email:this._email,password:this._password,clientType:"CLIENT_TYPE_WEB"};return Jt(e,r,"signUpPassword",Vu);case"emailLink":return Ju(e,{idToken:n,email:this._email,oobCode:this._password});default:me(e,"internal-error")}}_getReauthenticationResolver(e){return this._getIdTokenResponse(e)}}/**
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
 */async function mt(t,e){return Ue(t,"POST","/v1/accounts:signInWithIdp",H(t,e))}/**
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
 */const Yu="http://localhost";class Me extends $n{constructor(){super(...arguments),this.pendingToken=null}static _fromParams(e){const n=new Me(e.providerId,e.signInMethod);return e.idToken||e.accessToken?(e.idToken&&(n.idToken=e.idToken),e.accessToken&&(n.accessToken=e.accessToken),e.nonce&&!e.pendingToken&&(n.nonce=e.nonce),e.pendingToken&&(n.pendingToken=e.pendingToken)):e.oauthToken&&e.oauthTokenSecret?(n.accessToken=e.oauthToken,n.secret=e.oauthTokenSecret):me("argument-error"),n}toJSON(){return{idToken:this.idToken,accessToken:this.accessToken,secret:this.secret,nonce:this.nonce,pendingToken:this.pendingToken,providerId:this.providerId,signInMethod:this.signInMethod}}static fromJSON(e){const n=typeof e=="string"?JSON.parse(e):e,{providerId:r,signInMethod:s}=n,a=Gi(n,["providerId","signInMethod"]);if(!r||!s)return null;const l=new Me(r,s);return l.idToken=a.idToken||void 0,l.accessToken=a.accessToken||void 0,l.secret=a.secret,l.nonce=a.nonce,l.pendingToken=a.pendingToken||null,l}_getIdTokenResponse(e){const n=this.buildRequest();return mt(e,n)}_linkToIdToken(e,n){const r=this.buildRequest();return r.idToken=n,mt(e,r)}_getReauthenticationResolver(e){const n=this.buildRequest();return n.autoCreate=!1,mt(e,n)}buildRequest(){const e={requestUri:Yu,returnSecureToken:!0};if(this.pendingToken)e.pendingToken=this.pendingToken;else{const n={};this.idToken&&(n.id_token=this.idToken),this.accessToken&&(n.access_token=this.accessToken),this.secret&&(n.oauth_token_secret=this.secret),n.providerId=this.providerId,this.nonce&&!this.pendingToken&&(n.nonce=this.nonce),e.postBody=wt(n)}return e}}/**
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
 */async function Xu(t,e){return W(t,"POST","/v1/accounts:sendVerificationCode",H(t,e))}async function Qu(t,e){return Ue(t,"POST","/v1/accounts:signInWithPhoneNumber",H(t,e))}async function Zu(t,e){const n=await Ue(t,"POST","/v1/accounts:signInWithPhoneNumber",H(t,e));if(n.temporaryProof)throw jt(t,"account-exists-with-different-credential",n);return n}const eh={USER_NOT_FOUND:"user-not-found"};async function th(t,e){const n=Object.assign(Object.assign({},e),{operation:"REAUTH"});return Ue(t,"POST","/v1/accounts:signInWithPhoneNumber",H(t,n),eh)}/**
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
 */class Vt extends $n{constructor(e){super("phone","phone"),this.params=e}static _fromVerification(e,n){return new Vt({verificationId:e,verificationCode:n})}static _fromTokenResponse(e,n){return new Vt({phoneNumber:e,temporaryProof:n})}_getIdTokenResponse(e){return Qu(e,this._makeVerificationRequest())}_linkToIdToken(e,n){return Zu(e,Object.assign({idToken:n},this._makeVerificationRequest()))}_getReauthenticationResolver(e){return th(e,this._makeVerificationRequest())}_makeVerificationRequest(){const{temporaryProof:e,phoneNumber:n,verificationId:r,verificationCode:s}=this.params;return e&&n?{temporaryProof:e,phoneNumber:n}:{sessionInfo:r,code:s}}toJSON(){const e={providerId:this.providerId};return this.params.phoneNumber&&(e.phoneNumber=this.params.phoneNumber),this.params.temporaryProof&&(e.temporaryProof=this.params.temporaryProof),this.params.verificationCode&&(e.verificationCode=this.params.verificationCode),this.params.verificationId&&(e.verificationId=this.params.verificationId),e}static fromJSON(e){typeof e=="string"&&(e=JSON.parse(e));const{verificationId:n,verificationCode:r,phoneNumber:s,temporaryProof:a}=e;return!r&&!n&&!s&&!a?null:new Vt({verificationId:n,verificationCode:r,phoneNumber:s,temporaryProof:a})}}/**
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
 */function nh(t){switch(t){case"recoverEmail":return"RECOVER_EMAIL";case"resetPassword":return"PASSWORD_RESET";case"signIn":return"EMAIL_SIGNIN";case"verifyEmail":return"VERIFY_EMAIL";case"verifyAndChangeEmail":return"VERIFY_AND_CHANGE_EMAIL";case"revertSecondFactorAddition":return"REVERT_SECOND_FACTOR_ADDITION";default:return null}}function ih(t){const e=Ft(xt(t)).link,n=e?Ft(xt(e)).deep_link_id:null,r=Ft(xt(t)).deep_link_id;return(r?Ft(xt(r)).link:null)||r||n||e||t}class Bn{constructor(e){var n,r,s,a,l,h;const g=Ft(xt(e)),I=(n=g.apiKey)!==null&&n!==void 0?n:null,A=(r=g.oobCode)!==null&&r!==void 0?r:null,S=nh((s=g.mode)!==null&&s!==void 0?s:null);b(I&&A&&S,"argument-error"),this.apiKey=I,this.operation=S,this.code=A,this.continueUrl=(a=g.continueUrl)!==null&&a!==void 0?a:null,this.languageCode=(l=g.languageCode)!==null&&l!==void 0?l:null,this.tenantId=(h=g.tenantId)!==null&&h!==void 0?h:null}static parseLink(e){const n=ih(e);try{return new Bn(n)}catch{return null}}}/**
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
 */class at{constructor(){this.providerId=at.PROVIDER_ID}static credential(e,n){return Yt._fromEmailAndPassword(e,n)}static credentialWithLink(e,n){const r=Bn.parseLink(n);return b(r,"argument-error"),Yt._fromEmailAndCode(e,r.code,r.tenantId)}}at.PROVIDER_ID="password";at.EMAIL_PASSWORD_SIGN_IN_METHOD="password";at.EMAIL_LINK_SIGN_IN_METHOD="emailLink";/**
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
 */class Et{constructor(e){this.providerId=e,this.defaultLanguageCode=null,this.customParameters={}}setDefaultLanguage(e){this.defaultLanguageCode=e}setCustomParameters(e){return this.customParameters=e,this}getCustomParameters(){return this.customParameters}}/**
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
 */class Tt extends Et{constructor(){super(...arguments),this.scopes=[]}addScope(e){return this.scopes.includes(e)||this.scopes.push(e),this}getScopes(){return[...this.scopes]}}class bn extends Tt{static credentialFromJSON(e){const n=typeof e=="string"?JSON.parse(e):e;return b("providerId"in n&&"signInMethod"in n,"argument-error"),Me._fromParams(n)}credential(e){return this._credential(Object.assign(Object.assign({},e),{nonce:e.rawNonce}))}_credential(e){return b(e.idToken||e.accessToken,"argument-error"),Me._fromParams(Object.assign(Object.assign({},e),{providerId:this.providerId,signInMethod:this.providerId}))}static credentialFromResult(e){return bn.oauthCredentialFromTaggedObject(e)}static credentialFromError(e){return bn.oauthCredentialFromTaggedObject(e.customData||{})}static oauthCredentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:n,oauthAccessToken:r,oauthTokenSecret:s,pendingToken:a,nonce:l,providerId:h}=e;if(!r&&!s&&!n&&!a||!h)return null;try{return new bn(h)._credential({idToken:n,accessToken:r,nonce:l,pendingToken:a})}catch{return null}}}/**
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
 */class Be extends Tt{constructor(){super("facebook.com")}static credential(e){return Me._fromParams({providerId:Be.PROVIDER_ID,signInMethod:Be.FACEBOOK_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return Be.credentialFromTaggedObject(e)}static credentialFromError(e){return Be.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return Be.credential(e.oauthAccessToken)}catch{return null}}}Be.FACEBOOK_SIGN_IN_METHOD="facebook.com";Be.PROVIDER_ID="facebook.com";/**
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
 */class He extends Tt{constructor(){super("google.com"),this.addScope("profile")}static credential(e,n){return Me._fromParams({providerId:He.PROVIDER_ID,signInMethod:He.GOOGLE_SIGN_IN_METHOD,idToken:e,accessToken:n})}static credentialFromResult(e){return He.credentialFromTaggedObject(e)}static credentialFromError(e){return He.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:n,oauthAccessToken:r}=e;if(!n&&!r)return null;try{return He.credential(n,r)}catch{return null}}}He.GOOGLE_SIGN_IN_METHOD="google.com";He.PROVIDER_ID="google.com";/**
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
 */class We extends Tt{constructor(){super("github.com")}static credential(e){return Me._fromParams({providerId:We.PROVIDER_ID,signInMethod:We.GITHUB_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return We.credentialFromTaggedObject(e)}static credentialFromError(e){return We.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return We.credential(e.oauthAccessToken)}catch{return null}}}We.GITHUB_SIGN_IN_METHOD="github.com";We.PROVIDER_ID="github.com";/**
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
 */class ze extends Tt{constructor(){super("twitter.com")}static credential(e,n){return Me._fromParams({providerId:ze.PROVIDER_ID,signInMethod:ze.TWITTER_SIGN_IN_METHOD,oauthToken:e,oauthTokenSecret:n})}static credentialFromResult(e){return ze.credentialFromTaggedObject(e)}static credentialFromError(e){return ze.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthAccessToken:n,oauthTokenSecret:r}=e;if(!n||!r)return null;try{return ze.credential(n,r)}catch{return null}}}ze.TWITTER_SIGN_IN_METHOD="twitter.com";ze.PROVIDER_ID="twitter.com";/**
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
 */async function Bo(t,e){return Ue(t,"POST","/v1/accounts:signUp",H(t,e))}/**
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
 */class be{constructor(e){this.user=e.user,this.providerId=e.providerId,this._tokenResponse=e._tokenResponse,this.operationType=e.operationType}static async _fromIdTokenResponse(e,n,r,s=!1){const a=await Oe._fromIdTokenResponse(e,r,s),l=Os(r);return new be({user:a,providerId:l,_tokenResponse:r,operationType:n})}static async _forOperation(e,n,r){await e._updateTokensIfNecessary(r,!0);const s=Os(r);return new be({user:e,providerId:s,_tokenResponse:r,operationType:n})}}function Os(t){return t.providerId?t.providerId:"phoneNumber"in t?"phone":null}/**
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
 */async function Vp(t){var e;if(K(t.app))return Promise.reject(oe(t));const n=J(t);if(await n._initializationPromise,!((e=n.currentUser)===null||e===void 0)&&e.isAnonymous)return new be({user:n.currentUser,providerId:null,operationType:"signIn"});const r=await Bo(n,{returnSecureToken:!0}),s=await be._fromIdTokenResponse(n,"signIn",r,!0);return await n._updateCurrentUser(s.user),s}/**
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
 */class Cn extends Ie{constructor(e,n,r,s){var a;super(n.code,n.message),this.operationType=r,this.user=s,Object.setPrototypeOf(this,Cn.prototype),this.customData={appName:e.name,tenantId:(a=e.tenantId)!==null&&a!==void 0?a:void 0,_serverResponse:n.customData._serverResponse,operationType:r}}static _fromErrorAndOperation(e,n,r,s){return new Cn(e,n,r,s)}}function Ho(t,e,n,r){return(e==="reauthenticate"?n._getReauthenticationResolver(t):n._getIdTokenResponse(t)).catch(a=>{throw a.code==="auth/multi-factor-auth-required"?Cn._fromErrorAndOperation(t,a,e,r):a})}/**
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
 */function Wo(t){return new Set(t.map(({providerId:e})=>e).filter(e=>!!e))}/**
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
 */async function Bp(t,e){const n=D(t);await Hn(!0,n,e);const{providerUserInfo:r}=await du(n.auth,{idToken:await n.getIdToken(),deleteProvider:[e]}),s=Wo(r||[]);return n.providerData=n.providerData.filter(a=>s.has(a.providerId)),s.has("phone")||(n.phoneNumber=null),await n.auth._persistUserIfCurrent(n),n}async function zo(t,e,n=!1){const r=await nt(t,e._linkToIdToken(t.auth,await t.getIdToken()),n);return be._forOperation(t,"link",r)}async function Hn(t,e,n){await Kt(e);const r=Wo(e.providerData),s=t===!1?"provider-already-linked":"no-such-provider";b(r.has(n)===t,e.auth,s)}/**
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
 */async function rh(t,e,n=!1){const{auth:r}=t;if(K(r.app))return Promise.reject(oe(r));const s="reauthenticate";try{const a=await nt(t,Ho(r,s,e,t),n);b(a.idToken,r,"internal-error");const l=jn(a.idToken);b(l,r,"internal-error");const{sub:h}=l;return b(t.uid===h,r,"user-mismatch"),be._forOperation(t,s,a)}catch(a){throw(a==null?void 0:a.code)==="auth/user-not-found"&&me(r,"user-mismatch"),a}}/**
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
 */async function Go(t,e,n=!1){if(K(t.app))return Promise.reject(oe(t));const r="signIn",s=await Ho(t,r,e),a=await be._fromIdTokenResponse(t,r,s);return n||await t._updateCurrentUser(a.user),a}async function Zi(t,e){return Go(J(t),e)}async function sh(t,e){const n=D(t);return await Hn(!1,n,e.providerId),zo(n,e)}/**
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
 */async function oh(t,e){return Ue(t,"POST","/v1/accounts:signInWithCustomToken",H(t,e))}/**
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
 */async function Hp(t,e){if(K(t.app))return Promise.reject(oe(t));const n=J(t),r=await oh(n,{token:e,returnSecureToken:!0}),s=await be._fromIdTokenResponse(n,"signIn",r);return await n._updateCurrentUser(s.user),s}/**
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
 */function Wn(t,e,n){var r;b(((r=n.url)===null||r===void 0?void 0:r.length)>0,t,"invalid-continue-uri"),b(typeof n.dynamicLinkDomain>"u"||n.dynamicLinkDomain.length>0,t,"invalid-dynamic-link-domain"),e.continueUrl=n.url,e.dynamicLinkDomain=n.dynamicLinkDomain,e.canHandleCodeInApp=n.handleCodeInApp,n.iOS&&(b(n.iOS.bundleId.length>0,t,"missing-ios-bundle-id"),e.iOSBundleId=n.iOS.bundleId),n.android&&(b(n.android.packageName.length>0,t,"missing-android-pkg-name"),e.androidInstallApp=n.android.installApp,e.androidMinimumVersionCode=n.android.minimumVersion,e.androidPackageName=n.android.packageName)}/**
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
 */async function er(t){const e=J(t);e._getPasswordPolicyInternal()&&await e._updatePasswordPolicy()}async function Wp(t,e,n){const r=J(t),s={requestType:"PASSWORD_RESET",email:e,clientType:"CLIENT_TYPE_WEB"};n&&Wn(r,s,n),await Jt(r,s,"getOobCode",zu)}async function zp(t,e,n){await ju(D(t),{oobCode:e,newPassword:n}).catch(async r=>{throw r.code==="auth/password-does-not-meet-requirements"&&er(t),r})}async function Gp(t,e){await Bu(D(t),{oobCode:e})}async function qp(t,e,n){if(K(t.app))return Promise.reject(oe(t));const r=J(t),l=await Jt(r,{returnSecureToken:!0,email:e,password:n,clientType:"CLIENT_TYPE_WEB"},"signUpPassword",Bo).catch(g=>{throw g.code==="auth/password-does-not-meet-requirements"&&er(t),g}),h=await be._fromIdTokenResponse(r,"signIn",l);return await r._updateCurrentUser(h.user),h}function Kp(t,e,n){return K(t.app)?Promise.reject(oe(t)):Zi(D(t),at.credential(e,n)).catch(async r=>{throw r.code==="auth/password-does-not-meet-requirements"&&er(t),r})}/**
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
 */async function Jp(t,e,n){const r=J(t),s={requestType:"EMAIL_SIGNIN",email:e,clientType:"CLIENT_TYPE_WEB"};function a(l,h){b(h.handleCodeInApp,r,"argument-error"),h&&Wn(r,l,h)}a(s,n),await Jt(r,s,"getOobCode",Gu)}function Yp(t,e){const n=Bn.parseLink(e);return(n==null?void 0:n.operation)==="EMAIL_SIGNIN"}async function Xp(t,e,n){if(K(t.app))return Promise.reject(oe(t));const r=D(t),s=at.credentialWithLink(e,n||qt());return b(s._tenantId===(r.tenantId||null),r,"tenant-id-mismatch"),Zi(r,s)}/**
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
 */async function ah(t,e){return W(t,"POST","/v1/accounts:createAuthUri",H(t,e))}/**
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
 */async function Qp(t,e){const n=Ji()?qt():"http://localhost",r={identifier:e,continueUri:n},{signinMethods:s}=await ah(D(t),r);return s||[]}async function Zp(t,e){const n=D(t),s={requestType:"VERIFY_EMAIL",idToken:await t.getIdToken()};e&&Wn(n.auth,s,e);const{email:a}=await Wu(n.auth,s);a!==t.email&&await t.reload()}async function eg(t,e,n){const r=D(t),a={requestType:"VERIFY_AND_CHANGE_EMAIL",idToken:await t.getIdToken(),newEmail:e};n&&Wn(r.auth,a,n);const{email:l}=await qu(r.auth,a);l!==t.email&&await t.reload()}/**
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
 */async function ch(t,e){return W(t,"POST","/v1/accounts:update",e)}/**
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
 */async function tg(t,{displayName:e,photoURL:n}){if(e===void 0&&n===void 0)return;const r=D(t),a={idToken:await r.getIdToken(),displayName:e,photoUrl:n,returnSecureToken:!0},l=await nt(r,ch(r.auth,a));r.displayName=l.displayName||null,r.photoURL=l.photoUrl||null;const h=r.providerData.find(({providerId:g})=>g==="password");h&&(h.displayName=r.displayName,h.photoURL=r.photoURL),await r._updateTokensIfNecessary(l)}function ng(t,e){const n=D(t);return K(n.auth.app)?Promise.reject(oe(n.auth)):qo(n,e,null)}function ig(t,e){return qo(D(t),null,e)}async function qo(t,e,n){const{auth:r}=t,a={idToken:await t.getIdToken(),returnSecureToken:!0};e&&(a.email=e),n&&(a.password=n);const l=await nt(t,$u(r,a));await t._updateTokensIfNecessary(l,!0)}/**
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
 */function lh(t){var e,n;if(!t)return null;const{providerId:r}=t,s=t.rawUserInfo?JSON.parse(t.rawUserInfo):{},a=t.isNewUser||t.kind==="identitytoolkit#SignupNewUserResponse";if(!r&&(t!=null&&t.idToken)){const l=(n=(e=jn(t.idToken))===null||e===void 0?void 0:e.firebase)===null||n===void 0?void 0:n.sign_in_provider;if(l){const h=l!=="anonymous"&&l!=="custom"?l:null;return new yt(a,h)}}if(!r)return null;switch(r){case"facebook.com":return new uh(a,s);case"github.com":return new hh(a,s);case"google.com":return new dh(a,s);case"twitter.com":return new fh(a,s,t.screenName||null);case"custom":case"anonymous":return new yt(a,null);default:return new yt(a,r,s)}}class yt{constructor(e,n,r={}){this.isNewUser=e,this.providerId=n,this.profile=r}}class Ko extends yt{constructor(e,n,r,s){super(e,n,r),this.username=s}}class uh extends yt{constructor(e,n){super(e,"facebook.com",n)}}class hh extends Ko{constructor(e,n){super(e,"github.com",n,typeof(n==null?void 0:n.login)=="string"?n==null?void 0:n.login:null)}}class dh extends yt{constructor(e,n){super(e,"google.com",n)}}class fh extends Ko{constructor(e,n,r){super(e,"twitter.com",n,r)}}function rg(t){const{user:e,_tokenResponse:n}=t;return e.isAnonymous&&!n?{providerId:null,isNewUser:!1,profile:null}:lh(n)}/**
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
 */function sg(t,e){return D(t).setPersistence(e)}function ph(t,e,n,r){return D(t).onIdTokenChanged(e,n,r)}function gh(t,e,n){return D(t).beforeAuthStateChanged(e,n)}function mh(t,e,n,r){return D(t).onAuthStateChanged(e,n,r)}function yh(t){return D(t).signOut()}function og(t,e){return J(t).revokeAccessToken(e)}async function ag(t){return D(t).delete()}/**
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
 */function vh(t,e){return W(t,"POST","/v2/accounts/mfaEnrollment:start",H(t,e))}const On="__sak";/**
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
 */class Jo{constructor(e,n){this.storageRetriever=e,this.type=n}_isAvailable(){try{return this.storage?(this.storage.setItem(On,"1"),this.storage.removeItem(On),Promise.resolve(!0)):Promise.resolve(!1)}catch{return Promise.resolve(!1)}}_set(e,n){return this.storage.setItem(e,JSON.stringify(n)),Promise.resolve()}_get(e){const n=this.storage.getItem(e);return Promise.resolve(n?JSON.parse(n):null)}_remove(e){return this.storage.removeItem(e),Promise.resolve()}get storage(){return this.storageRetriever()}}/**
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
 */const _h=1e3,wh=10;class Yo extends Jo{constructor(){super(()=>window.localStorage,"LOCAL"),this.boundEventHandler=(e,n)=>this.onStorageEvent(e,n),this.listeners={},this.localCache={},this.pollTimer=null,this.fallbackToPolling=xo(),this._shouldAllowMigration=!0}forAllChangedKeys(e){for(const n of Object.keys(this.listeners)){const r=this.storage.getItem(n),s=this.localCache[n];r!==s&&e(n,s,r)}}onStorageEvent(e,n=!1){if(!e.key){this.forAllChangedKeys((l,h,g)=>{this.notifyListeners(l,g)});return}const r=e.key;n?this.detachListener():this.stopPolling();const s=()=>{const l=this.storage.getItem(r);!n&&this.localCache[r]===l||this.notifyListeners(r,l)},a=this.storage.getItem(r);Iu()&&a!==e.newValue&&e.newValue!==e.oldValue?setTimeout(s,wh):s()}notifyListeners(e,n){this.localCache[e]=n;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(n&&JSON.parse(n))}startPolling(){this.stopPolling(),this.pollTimer=setInterval(()=>{this.forAllChangedKeys((e,n,r)=>{this.onStorageEvent(new StorageEvent("storage",{key:e,oldValue:n,newValue:r}),!0)})},_h)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}attachListener(){window.addEventListener("storage",this.boundEventHandler)}detachListener(){window.removeEventListener("storage",this.boundEventHandler)}_addListener(e,n){Object.keys(this.listeners).length===0&&(this.fallbackToPolling?this.startPolling():this.attachListener()),this.listeners[e]||(this.listeners[e]=new Set,this.localCache[e]=this.storage.getItem(e)),this.listeners[e].add(n)}_removeListener(e,n){this.listeners[e]&&(this.listeners[e].delete(n),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.detachListener(),this.stopPolling())}async _set(e,n){await super._set(e,n),this.localCache[e]=JSON.stringify(n)}async _get(e){const n=await super._get(e);return this.localCache[e]=JSON.stringify(n),n}async _remove(e){await super._remove(e),delete this.localCache[e]}}Yo.type="LOCAL";const Ih=Yo;/**
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
 */class Xo extends Jo{constructor(){super(()=>window.sessionStorage,"SESSION")}_addListener(e,n){}_removeListener(e,n){}}Xo.type="SESSION";const Qo=Xo;/**
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
 */function Eh(t){return Promise.all(t.map(async e=>{try{return{fulfilled:!0,value:await e}}catch(n){return{fulfilled:!1,reason:n}}}))}/**
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
 */class zn{constructor(e){this.eventTarget=e,this.handlersMap={},this.boundEventHandler=this.handleEvent.bind(this)}static _getInstance(e){const n=this.receivers.find(s=>s.isListeningto(e));if(n)return n;const r=new zn(e);return this.receivers.push(r),r}isListeningto(e){return this.eventTarget===e}async handleEvent(e){const n=e,{eventId:r,eventType:s,data:a}=n.data,l=this.handlersMap[s];if(!(l!=null&&l.size))return;n.ports[0].postMessage({status:"ack",eventId:r,eventType:s});const h=Array.from(l).map(async I=>I(n.origin,a)),g=await Eh(h);n.ports[0].postMessage({status:"done",eventId:r,eventType:s,response:g})}_subscribe(e,n){Object.keys(this.handlersMap).length===0&&this.eventTarget.addEventListener("message",this.boundEventHandler),this.handlersMap[e]||(this.handlersMap[e]=new Set),this.handlersMap[e].add(n)}_unsubscribe(e,n){this.handlersMap[e]&&n&&this.handlersMap[e].delete(n),(!n||this.handlersMap[e].size===0)&&delete this.handlersMap[e],Object.keys(this.handlersMap).length===0&&this.eventTarget.removeEventListener("message",this.boundEventHandler)}}zn.receivers=[];/**
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
 */function Gn(t="",e=10){let n="";for(let r=0;r<e;r++)n+=Math.floor(Math.random()*10);return t+n}/**
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
 */class Th{constructor(e){this.target=e,this.handlers=new Set}removeMessageHandler(e){e.messageChannel&&(e.messageChannel.port1.removeEventListener("message",e.onMessage),e.messageChannel.port1.close()),this.handlers.delete(e)}async _send(e,n,r=50){const s=typeof MessageChannel<"u"?new MessageChannel:null;if(!s)throw new Error("connection_unavailable");let a,l;return new Promise((h,g)=>{const I=Gn("",20);s.port1.start();const A=setTimeout(()=>{g(new Error("unsupported_event"))},r);l={messageChannel:s,onMessage(S){const P=S;if(P.data.eventId===I)switch(P.data.status){case"ack":clearTimeout(A),a=setTimeout(()=>{g(new Error("timeout"))},3e3);break;case"done":clearTimeout(a),h(P.data.response);break;default:clearTimeout(A),clearTimeout(a),g(new Error("invalid_response"));break}}},this.handlers.add(l),s.port1.addEventListener("message",l.onMessage),this.target.postMessage({eventType:e,eventId:I,data:n},[s.port2])}).finally(()=>{l&&this.removeMessageHandler(l)})}}/**
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
 */function $(){return window}function bh(t){$().location.href=t}/**
 * @license
 * Copyright 2020 Google LLC.
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
 */function tr(){return typeof $().WorkerGlobalScope<"u"&&typeof $().importScripts=="function"}async function Ah(){if(!(navigator!=null&&navigator.serviceWorker))return null;try{return(await navigator.serviceWorker.ready).active}catch{return null}}function Sh(){var t;return((t=navigator==null?void 0:navigator.serviceWorker)===null||t===void 0?void 0:t.controller)||null}function Ph(){return tr()?self:null}/**
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
 */const Zo="firebaseLocalStorageDb",kh=1,Dn="firebaseLocalStorage",ea="fbase_key";class Zt{constructor(e){this.request=e}toPromise(){return new Promise((e,n)=>{this.request.addEventListener("success",()=>{e(this.request.result)}),this.request.addEventListener("error",()=>{n(this.request.error)})})}}function qn(t,e){return t.transaction([Dn],e?"readwrite":"readonly").objectStore(Dn)}function Rh(){const t=indexedDB.deleteDatabase(Zo);return new Zt(t).toPromise()}function $i(){const t=indexedDB.open(Zo,kh);return new Promise((e,n)=>{t.addEventListener("error",()=>{n(t.error)}),t.addEventListener("upgradeneeded",()=>{const r=t.result;try{r.createObjectStore(Dn,{keyPath:ea})}catch(s){n(s)}}),t.addEventListener("success",async()=>{const r=t.result;r.objectStoreNames.contains(Dn)?e(r):(r.close(),await Rh(),e(await $i()))})})}async function Ds(t,e,n){const r=qn(t,!0).put({[ea]:e,value:n});return new Zt(r).toPromise()}async function Ch(t,e){const n=qn(t,!1).get(e),r=await new Zt(n).toPromise();return r===void 0?null:r.value}function Ns(t,e){const n=qn(t,!0).delete(e);return new Zt(n).toPromise()}const Oh=800,Dh=3;class ta{constructor(){this.type="LOCAL",this._shouldAllowMigration=!0,this.listeners={},this.localCache={},this.pollTimer=null,this.pendingWrites=0,this.receiver=null,this.sender=null,this.serviceWorkerReceiverAvailable=!1,this.activeServiceWorker=null,this._workerInitializationPromise=this.initializeServiceWorkerMessaging().then(()=>{},()=>{})}async _openDb(){return this.db?this.db:(this.db=await $i(),this.db)}async _withRetries(e){let n=0;for(;;)try{const r=await this._openDb();return await e(r)}catch(r){if(n++>Dh)throw r;this.db&&(this.db.close(),this.db=void 0)}}async initializeServiceWorkerMessaging(){return tr()?this.initializeReceiver():this.initializeSender()}async initializeReceiver(){this.receiver=zn._getInstance(Ph()),this.receiver._subscribe("keyChanged",async(e,n)=>({keyProcessed:(await this._poll()).includes(n.key)})),this.receiver._subscribe("ping",async(e,n)=>["keyChanged"])}async initializeSender(){var e,n;if(this.activeServiceWorker=await Ah(),!this.activeServiceWorker)return;this.sender=new Th(this.activeServiceWorker);const r=await this.sender._send("ping",{},800);r&&!((e=r[0])===null||e===void 0)&&e.fulfilled&&!((n=r[0])===null||n===void 0)&&n.value.includes("keyChanged")&&(this.serviceWorkerReceiverAvailable=!0)}async notifyServiceWorker(e){if(!(!this.sender||!this.activeServiceWorker||Sh()!==this.activeServiceWorker))try{await this.sender._send("keyChanged",{key:e},this.serviceWorkerReceiverAvailable?800:50)}catch{}}async _isAvailable(){try{if(!indexedDB)return!1;const e=await $i();return await Ds(e,On,"1"),await Ns(e,On),!0}catch{}return!1}async _withPendingWrite(e){this.pendingWrites++;try{await e()}finally{this.pendingWrites--}}async _set(e,n){return this._withPendingWrite(async()=>(await this._withRetries(r=>Ds(r,e,n)),this.localCache[e]=n,this.notifyServiceWorker(e)))}async _get(e){const n=await this._withRetries(r=>Ch(r,e));return this.localCache[e]=n,n}async _remove(e){return this._withPendingWrite(async()=>(await this._withRetries(n=>Ns(n,e)),delete this.localCache[e],this.notifyServiceWorker(e)))}async _poll(){const e=await this._withRetries(s=>{const a=qn(s,!1).getAll();return new Zt(a).toPromise()});if(!e)return[];if(this.pendingWrites!==0)return[];const n=[],r=new Set;if(e.length!==0)for(const{fbase_key:s,value:a}of e)r.add(s),JSON.stringify(this.localCache[s])!==JSON.stringify(a)&&(this.notifyListeners(s,a),n.push(s));for(const s of Object.keys(this.localCache))this.localCache[s]&&!r.has(s)&&(this.notifyListeners(s,null),n.push(s));return n}notifyListeners(e,n){this.localCache[e]=n;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(n)}startPolling(){this.stopPolling(),this.pollTimer=setInterval(async()=>this._poll(),Oh)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}_addListener(e,n){Object.keys(this.listeners).length===0&&this.startPolling(),this.listeners[e]||(this.listeners[e]=new Set,this._get(e)),this.listeners[e].add(n)}_removeListener(e,n){this.listeners[e]&&(this.listeners[e].delete(n),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&this.stopPolling()}}ta.type="LOCAL";const Nh=ta;/**
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
 */function Lh(t,e){return W(t,"POST","/v2/accounts/mfaSignIn:start",H(t,e))}/**
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
 */const Mh=500,Uh=6e4,_n=1e12;class Fh{constructor(e){this.auth=e,this.counter=_n,this._widgets=new Map}render(e,n){const r=this.counter;return this._widgets.set(r,new xh(e,this.auth.name,n||{})),this.counter++,r}reset(e){var n;const r=e||_n;(n=this._widgets.get(r))===null||n===void 0||n.delete(),this._widgets.delete(r)}getResponse(e){var n;const r=e||_n;return((n=this._widgets.get(r))===null||n===void 0?void 0:n.getResponse())||""}async execute(e){var n;const r=e||_n;return(n=this._widgets.get(r))===null||n===void 0||n.execute(),""}}class xh{constructor(e,n,r){this.params=r,this.timerId=null,this.deleted=!1,this.responseToken=null,this.clickHandler=()=>{this.execute()};const s=typeof e=="string"?document.getElementById(e):e;b(s,"argument-error",{appName:n}),this.container=s,this.isVisible=this.params.size!=="invisible",this.isVisible?this.execute():this.container.addEventListener("click",this.clickHandler)}getResponse(){return this.checkIfDeleted(),this.responseToken}delete(){this.checkIfDeleted(),this.deleted=!0,this.timerId&&(clearTimeout(this.timerId),this.timerId=null),this.container.removeEventListener("click",this.clickHandler)}execute(){this.checkIfDeleted(),!this.timerId&&(this.timerId=window.setTimeout(()=>{this.responseToken=jh(50);const{callback:e,"expired-callback":n}=this.params;if(e)try{e(this.responseToken)}catch{}this.timerId=window.setTimeout(()=>{if(this.timerId=null,this.responseToken=null,n)try{n()}catch{}this.isVisible&&this.execute()},Uh)},Mh))}checkIfDeleted(){if(this.deleted)throw new Error("reCAPTCHA mock was already deleted!")}}function jh(t){const e=[],n="1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";for(let r=0;r<t;r++)e.push(n.charAt(Math.floor(Math.random()*n.length)));return e.join("")}/**
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
 */const Pi=$o("rcb"),$h=new Xt(3e4,6e4);class Vh{constructor(){var e;this.hostLanguage="",this.counter=0,this.librarySeparatelyLoaded=!!(!((e=$().grecaptcha)===null||e===void 0)&&e.render)}load(e,n=""){return b(Bh(n),e,"argument-error"),this.shouldResolveImmediately(n)&&Es($().grecaptcha)?Promise.resolve($().grecaptcha):new Promise((r,s)=>{const a=$().setTimeout(()=>{s(ue(e,"network-request-failed"))},$h.get());$()[Pi]=()=>{$().clearTimeout(a),delete $()[Pi];const h=$().grecaptcha;if(!h||!Es(h)){s(ue(e,"internal-error"));return}const g=h.render;h.render=(I,A)=>{const S=g(I,A);return this.counter++,S},this.hostLanguage=n,r(h)};const l=`${ku()}?${wt({onload:Pi,render:"explicit",hl:n})}`;Qi(l).catch(()=>{clearTimeout(a),s(ue(e,"internal-error"))})})}clearedOneInstance(){this.counter--}shouldResolveImmediately(e){var n;return!!(!((n=$().grecaptcha)===null||n===void 0)&&n.render)&&(e===this.hostLanguage||this.counter>0||this.librarySeparatelyLoaded)}}function Bh(t){return t.length<=6&&/^\s*[a-zA-Z0-9\-]*\s*$/.test(t)}class Hh{async load(e){return new Fh(e)}clearedOneInstance(){}}/**
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
 */const na="recaptcha",Wh={theme:"light",type:"image"};class cg{constructor(e,n,r=Object.assign({},Wh)){this.parameters=r,this.type=na,this.destroyed=!1,this.widgetId=null,this.tokenChangeListeners=new Set,this.renderPromise=null,this.recaptcha=null,this.auth=J(e),this.isInvisible=this.parameters.size==="invisible",b(typeof document<"u",this.auth,"operation-not-supported-in-this-environment");const s=typeof n=="string"?document.getElementById(n):n;b(s,this.auth,"argument-error"),this.container=s,this.parameters.callback=this.makeTokenCallback(this.parameters.callback),this._recaptchaLoader=this.auth.settings.appVerificationDisabledForTesting?new Hh:new Vh,this.validateStartingState()}async verify(){this.assertNotDestroyed();const e=await this.render(),n=this.getAssertedRecaptcha(),r=n.getResponse(e);return r||new Promise(s=>{const a=l=>{l&&(this.tokenChangeListeners.delete(a),s(l))};this.tokenChangeListeners.add(a),this.isInvisible&&n.execute(e)})}render(){try{this.assertNotDestroyed()}catch(e){return Promise.reject(e)}return this.renderPromise?this.renderPromise:(this.renderPromise=this.makeRenderPromise().catch(e=>{throw this.renderPromise=null,e}),this.renderPromise)}_reset(){this.assertNotDestroyed(),this.widgetId!==null&&this.getAssertedRecaptcha().reset(this.widgetId)}clear(){this.assertNotDestroyed(),this.destroyed=!0,this._recaptchaLoader.clearedOneInstance(),this.isInvisible||this.container.childNodes.forEach(e=>{this.container.removeChild(e)})}validateStartingState(){b(!this.parameters.sitekey,this.auth,"argument-error"),b(this.isInvisible||!this.container.hasChildNodes(),this.auth,"argument-error"),b(typeof document<"u",this.auth,"operation-not-supported-in-this-environment")}makeTokenCallback(e){return n=>{if(this.tokenChangeListeners.forEach(r=>r(n)),typeof e=="function")e(n);else if(typeof e=="string"){const r=$()[e];typeof r=="function"&&r(n)}}}assertNotDestroyed(){b(!this.destroyed,this.auth,"internal-error")}async makeRenderPromise(){if(await this.init(),!this.widgetId){let e=this.container;if(!this.isInvisible){const n=document.createElement("div");e.appendChild(n),e=n}this.widgetId=this.getAssertedRecaptcha().render(e,this.parameters)}return this.widgetId}async init(){b(Ji()&&!tr(),this.auth,"internal-error"),await zh(),this.recaptcha=await this._recaptchaLoader.load(this.auth,this.auth.languageCode||void 0);const e=await lu(this.auth);b(e,this.auth,"internal-error"),this.parameters.sitekey=e}getAssertedRecaptcha(){return b(this.recaptcha,this.auth,"internal-error"),this.recaptcha}}function zh(){let t=null;return new Promise(e=>{if(document.readyState==="complete"){e();return}t=()=>e(),window.addEventListener("load",t)}).catch(e=>{throw t&&window.removeEventListener("load",t),e})}/**
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
 */class ia{constructor(e,n){this.verificationId=e,this.onConfirmation=n}confirm(e){const n=Vt._fromVerification(this.verificationId,e);return this.onConfirmation(n)}}async function lg(t,e,n){if(K(t.app))return Promise.reject(oe(t));const r=J(t),s=await ra(r,e,D(n));return new ia(s,a=>Zi(r,a))}async function ug(t,e,n){const r=D(t);await Hn(!1,r,"phone");const s=await ra(r.auth,e,D(n));return new ia(s,a=>sh(r,a))}async function ra(t,e,n){var r;const s=await n.verify();try{b(typeof s=="string",t,"argument-error"),b(n.type===na,t,"argument-error");let a;if(typeof e=="string"?a={phoneNumber:e}:a=e,"session"in a){const l=a.session;if("phoneNumber"in a)return b(l.type==="enroll",t,"internal-error"),(await vh(t,{idToken:l.credential,phoneEnrollmentInfo:{phoneNumber:a.phoneNumber,recaptchaToken:s}})).phoneSessionInfo.sessionInfo;{b(l.type==="signin",t,"internal-error");const h=((r=a.multiFactorHint)===null||r===void 0?void 0:r.uid)||a.multiFactorUid;return b(h,t,"missing-multi-factor-info"),(await Lh(t,{mfaPendingCredential:l.credential,mfaEnrollmentId:h,phoneSignInInfo:{recaptchaToken:s}})).phoneResponseInfo.sessionInfo}}else{const{sessionInfo:l}=await Xu(t,{phoneNumber:a.phoneNumber,recaptchaToken:s});return l}}finally{n._reset()}}/**
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
 */function en(t,e){return e?De(e):(b(t._popupRedirectResolver,t,"argument-error"),t._popupRedirectResolver)}/**
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
 */class nr extends $n{constructor(e){super("custom","custom"),this.params=e}_getIdTokenResponse(e){return mt(e,this._buildIdpRequest())}_linkToIdToken(e,n){return mt(e,this._buildIdpRequest(n))}_getReauthenticationResolver(e){return mt(e,this._buildIdpRequest())}_buildIdpRequest(e){const n={requestUri:this.params.requestUri,sessionId:this.params.sessionId,postBody:this.params.postBody,tenantId:this.params.tenantId,pendingToken:this.params.pendingToken,returnSecureToken:!0,returnIdpCredential:!0};return e&&(n.idToken=e),n}}function Gh(t){return Go(t.auth,new nr(t),t.bypassAuthState)}function qh(t){const{auth:e,user:n}=t;return b(n,e,"internal-error"),rh(n,new nr(t),t.bypassAuthState)}async function Kh(t){const{auth:e,user:n}=t;return b(n,e,"internal-error"),zo(n,new nr(t),t.bypassAuthState)}/**
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
 */class sa{constructor(e,n,r,s,a=!1){this.auth=e,this.resolver=r,this.user=s,this.bypassAuthState=a,this.pendingPromise=null,this.eventManager=null,this.filter=Array.isArray(n)?n:[n]}execute(){return new Promise(async(e,n)=>{this.pendingPromise={resolve:e,reject:n};try{this.eventManager=await this.resolver._initialize(this.auth),await this.onExecution(),this.eventManager.registerConsumer(this)}catch(r){this.reject(r)}})}async onAuthEvent(e){const{urlResponse:n,sessionId:r,postBody:s,tenantId:a,error:l,type:h}=e;if(l){this.reject(l);return}const g={auth:this.auth,requestUri:n,sessionId:r,tenantId:a||void 0,postBody:s||void 0,user:this.user,bypassAuthState:this.bypassAuthState};try{this.resolve(await this.getIdpTask(h)(g))}catch(I){this.reject(I)}}onError(e){this.reject(e)}getIdpTask(e){switch(e){case"signInViaPopup":case"signInViaRedirect":return Gh;case"linkViaPopup":case"linkViaRedirect":return Kh;case"reauthViaPopup":case"reauthViaRedirect":return qh;default:me(this.auth,"internal-error")}}resolve(e){Le(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.resolve(e),this.unregisterAndCleanUp()}reject(e){Le(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.reject(e),this.unregisterAndCleanUp()}unregisterAndCleanUp(){this.eventManager&&this.eventManager.unregisterConsumer(this),this.pendingPromise=null,this.cleanUp()}}/**
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
 */const Jh=new Xt(2e3,1e4);async function hg(t,e,n){if(K(t.app))return Promise.reject(ue(t,"operation-not-supported-in-this-environment"));const r=J(t);xn(t,e,Et);const s=en(r,n);return new Ge(r,"signInViaPopup",e,s).executeNotNull()}async function dg(t,e,n){const r=D(t);xn(r.auth,e,Et);const s=en(r.auth,n);return new Ge(r.auth,"linkViaPopup",e,s,r).executeNotNull()}class Ge extends sa{constructor(e,n,r,s,a){super(e,n,s,a),this.provider=r,this.authWindow=null,this.pollId=null,Ge.currentPopupAction&&Ge.currentPopupAction.cancel(),Ge.currentPopupAction=this}async executeNotNull(){const e=await this.execute();return b(e,this.auth,"internal-error"),e}async onExecution(){Le(this.filter.length===1,"Popup operations only handle one event");const e=Gn();this.authWindow=await this.resolver._openPopup(this.auth,this.provider,this.filter[0],e),this.authWindow.associatedEvent=e,this.resolver._originValidation(this.auth).catch(n=>{this.reject(n)}),this.resolver._isIframeWebStorageSupported(this.auth,n=>{n||this.reject(ue(this.auth,"web-storage-unsupported"))}),this.pollUserCancellation()}get eventId(){var e;return((e=this.authWindow)===null||e===void 0?void 0:e.associatedEvent)||null}cancel(){this.reject(ue(this.auth,"cancelled-popup-request"))}cleanUp(){this.authWindow&&this.authWindow.close(),this.pollId&&window.clearTimeout(this.pollId),this.authWindow=null,this.pollId=null,Ge.currentPopupAction=null}pollUserCancellation(){const e=()=>{var n,r;if(!((r=(n=this.authWindow)===null||n===void 0?void 0:n.window)===null||r===void 0)&&r.closed){this.pollId=window.setTimeout(()=>{this.pollId=null,this.reject(ue(this.auth,"popup-closed-by-user"))},8e3);return}this.pollId=window.setTimeout(e,Jh.get())};e()}}Ge.currentPopupAction=null;/**
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
 */const Yh="pendingRedirect",An=new Map;class Xh extends sa{constructor(e,n,r=!1){super(e,["signInViaRedirect","linkViaRedirect","reauthViaRedirect","unknown"],n,void 0,r),this.eventId=null}async execute(){let e=An.get(this.auth._key());if(!e){try{const r=await Qh(this.resolver,this.auth)?await super.execute():null;e=()=>Promise.resolve(r)}catch(n){e=()=>Promise.reject(n)}An.set(this.auth._key(),e)}return this.bypassAuthState||An.set(this.auth._key(),()=>Promise.resolve(null)),e()}async onAuthEvent(e){if(e.type==="signInViaRedirect")return super.onAuthEvent(e);if(e.type==="unknown"){this.resolve(null);return}if(e.eventId){const n=await this.auth._redirectUserForId(e.eventId);if(n)return this.user=n,super.onAuthEvent(e);this.resolve(null)}}async onExecution(){}cleanUp(){}}async function Qh(t,e){const n=ca(e),r=aa(t);if(!await r._isAvailable())return!1;const s=await r._get(n)==="true";return await r._remove(n),s}async function oa(t,e){return aa(t)._set(ca(e),"true")}function Zh(t,e){An.set(t._key(),e)}function aa(t){return De(t._redirectPersistence)}function ca(t){return Tn(Yh,t.config.apiKey,t.name)}/**
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
 */function fg(t,e,n){return ed(t,e,n)}async function ed(t,e,n){if(K(t.app))return Promise.reject(oe(t));const r=J(t);xn(t,e,Et),await r._initializationPromise;const s=en(r,n);return await oa(s,r),s._openRedirect(r,e,"signInViaRedirect")}function pg(t,e,n){return td(t,e,n)}async function td(t,e,n){const r=D(t);xn(r.auth,e,Et),await r.auth._initializationPromise;const s=en(r.auth,n);await Hn(!1,r,e.providerId),await oa(s,r.auth);const a=await nd(r);return s._openRedirect(r.auth,e,"linkViaRedirect",a)}async function gg(t,e){return await J(t)._initializationPromise,la(t,e,!1)}async function la(t,e,n=!1){if(K(t.app))return Promise.reject(oe(t));const r=J(t),s=en(r,e),l=await new Xh(r,s,n).execute();return l&&!n&&(delete l.user._redirectEventId,await r._persistUserIfCurrent(l.user),await r._setRedirectUser(null,e)),l}async function nd(t){const e=Gn(`${t.uid}:::`);return t._redirectEventId=e,await t.auth._setRedirectUser(t),await t.auth._persistUserIfCurrent(t),e}/**
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
 */const id=10*60*1e3;class rd{constructor(e){this.auth=e,this.cachedEventUids=new Set,this.consumers=new Set,this.queuedRedirectEvent=null,this.hasHandledPotentialRedirect=!1,this.lastProcessedEventTime=Date.now()}registerConsumer(e){this.consumers.add(e),this.queuedRedirectEvent&&this.isEventForConsumer(this.queuedRedirectEvent,e)&&(this.sendToConsumer(this.queuedRedirectEvent,e),this.saveEventToCache(this.queuedRedirectEvent),this.queuedRedirectEvent=null)}unregisterConsumer(e){this.consumers.delete(e)}onEvent(e){if(this.hasEventBeenHandled(e))return!1;let n=!1;return this.consumers.forEach(r=>{this.isEventForConsumer(e,r)&&(n=!0,this.sendToConsumer(e,r),this.saveEventToCache(e))}),this.hasHandledPotentialRedirect||!sd(e)||(this.hasHandledPotentialRedirect=!0,n||(this.queuedRedirectEvent=e,n=!0)),n}sendToConsumer(e,n){var r;if(e.error&&!ua(e)){const s=((r=e.error.code)===null||r===void 0?void 0:r.split("auth/")[1])||"internal-error";n.onError(ue(this.auth,s))}else n.onAuthEvent(e)}isEventForConsumer(e,n){const r=n.eventId===null||!!e.eventId&&e.eventId===n.eventId;return n.filter.includes(e.type)&&r}hasEventBeenHandled(e){return Date.now()-this.lastProcessedEventTime>=id&&this.cachedEventUids.clear(),this.cachedEventUids.has(Ls(e))}saveEventToCache(e){this.cachedEventUids.add(Ls(e)),this.lastProcessedEventTime=Date.now()}}function Ls(t){return[t.type,t.eventId,t.sessionId,t.tenantId].filter(e=>e).join("-")}function ua({type:t,error:e}){return t==="unknown"&&(e==null?void 0:e.code)==="auth/no-auth-event"}function sd(t){switch(t.type){case"signInViaRedirect":case"linkViaRedirect":case"reauthViaRedirect":return!0;case"unknown":return ua(t);default:return!1}}/**
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
 */async function od(t,e={}){return W(t,"GET","/v1/projects",e)}/**
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
 */const ad=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,cd=/^https?/;async function ld(t){if(t.config.emulator)return;const{authorizedDomains:e}=await od(t);for(const n of e)try{if(ud(n))return}catch{}me(t,"unauthorized-domain")}function ud(t){const e=qt(),{protocol:n,hostname:r}=new URL(e);if(t.startsWith("chrome-extension://")){const l=new URL(t);return l.hostname===""&&r===""?n==="chrome-extension:"&&t.replace("chrome-extension://","")===e.replace("chrome-extension://",""):n==="chrome-extension:"&&l.hostname===r}if(!cd.test(n))return!1;if(ad.test(t))return r===t;const s=t.replace(/\./g,"\\.");return new RegExp("^(.+\\."+s+"|"+s+")$","i").test(r)}/**
 * @license
 * Copyright 2020 Google LLC.
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
 */const hd=new Xt(3e4,6e4);function Ms(){const t=$().___jsl;if(t!=null&&t.H){for(const e of Object.keys(t.H))if(t.H[e].r=t.H[e].r||[],t.H[e].L=t.H[e].L||[],t.H[e].r=[...t.H[e].L],t.CP)for(let n=0;n<t.CP.length;n++)t.CP[n]=null}}function dd(t){return new Promise((e,n)=>{var r,s,a;function l(){Ms(),gapi.load("gapi.iframes",{callback:()=>{e(gapi.iframes.getContext())},ontimeout:()=>{Ms(),n(ue(t,"network-request-failed"))},timeout:hd.get()})}if(!((s=(r=$().gapi)===null||r===void 0?void 0:r.iframes)===null||s===void 0)&&s.Iframe)e(gapi.iframes.getContext());else if(!((a=$().gapi)===null||a===void 0)&&a.load)l();else{const h=$o("iframefcb");return $()[h]=()=>{gapi.load?l():n(ue(t,"network-request-failed"))},Qi(`${Cu()}?onload=${h}`).catch(g=>n(g))}}).catch(e=>{throw Sn=null,e})}let Sn=null;function fd(t){return Sn=Sn||dd(t),Sn}/**
 * @license
 * Copyright 2020 Google LLC.
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
 */const pd=new Xt(5e3,15e3),gd="__/auth/iframe",md="emulator/auth/iframe",yd={style:{position:"absolute",top:"-100px",width:"1px",height:"1px"},"aria-hidden":"true",tabindex:"-1"},vd=new Map([["identitytoolkit.googleapis.com","p"],["staging-identitytoolkit.sandbox.googleapis.com","s"],["test-identitytoolkit.sandbox.googleapis.com","t"]]);function _d(t){const e=t.config;b(e.authDomain,t,"auth-domain-config-required");const n=e.emulator?Yi(e,md):`https://${t.config.authDomain}/${gd}`,r={apiKey:e.apiKey,appName:t.name,v:It},s=vd.get(t.config.apiHost);s&&(r.eid=s);const a=t._getFrameworks();return a.length&&(r.fw=a.join(",")),`${n}?${wt(r).slice(1)}`}async function wd(t){const e=await fd(t),n=$().gapi;return b(n,t,"internal-error"),e.open({where:document.body,url:_d(t),messageHandlersFilter:n.iframes.CROSS_ORIGIN_IFRAMES_FILTER,attributes:yd,dontclear:!0},r=>new Promise(async(s,a)=>{await r.restyle({setHideOnLeave:!1});const l=ue(t,"network-request-failed"),h=$().setTimeout(()=>{a(l)},pd.get());function g(){$().clearTimeout(h),s(r)}r.ping(g).then(g,()=>{a(l)})}))}/**
 * @license
 * Copyright 2020 Google LLC.
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
 */const Id={location:"yes",resizable:"yes",statusbar:"yes",toolbar:"no"},Ed=500,Td=600,bd="_blank",Ad="http://localhost";class Us{constructor(e){this.window=e,this.associatedEvent=null}close(){if(this.window)try{this.window.close()}catch{}}}function Sd(t,e,n,r=Ed,s=Td){const a=Math.max((window.screen.availHeight-s)/2,0).toString(),l=Math.max((window.screen.availWidth-r)/2,0).toString();let h="";const g=Object.assign(Object.assign({},Id),{width:r.toString(),height:s.toString(),top:a,left:l}),I=ae().toLowerCase();n&&(h=No(I)?bd:n),Oo(I)&&(e=e||Ad,g.scrollbars="yes");const A=Object.entries(g).reduce((P,[N,k])=>`${P}${N}=${k},`,"");if(wu(I)&&h!=="_self")return Pd(e||"",h),new Us(null);const S=window.open(e||"",h,A);b(S,t,"popup-blocked");try{S.focus()}catch{}return new Us(S)}function Pd(t,e){const n=document.createElement("a");n.href=t,n.target=e;const r=document.createEvent("MouseEvent");r.initMouseEvent("click",!0,!0,window,1,0,0,0,0,!1,!1,!1,!1,1,null),n.dispatchEvent(r)}/**
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
 */const kd="__/auth/handler",Rd="emulator/auth/handler",Cd=encodeURIComponent("fac");async function Fs(t,e,n,r,s,a){b(t.config.authDomain,t,"auth-domain-config-required"),b(t.config.apiKey,t,"invalid-api-key");const l={apiKey:t.config.apiKey,appName:t.name,authType:n,redirectUrl:r,v:It,eventId:s};if(e instanceof Et){e.setDefaultLanguage(t.languageCode),l.providerId=e.providerId||"",xc(e.getCustomParameters())||(l.customParameters=JSON.stringify(e.getCustomParameters()));for(const[A,S]of Object.entries({}))l[A]=S}if(e instanceof Tt){const A=e.getScopes().filter(S=>S!=="");A.length>0&&(l.scopes=A.join(","))}t.tenantId&&(l.tid=t.tenantId);const h=l;for(const A of Object.keys(h))h[A]===void 0&&delete h[A];const g=await t._getAppCheckToken(),I=g?`#${Cd}=${encodeURIComponent(g)}`:"";return`${Od(t)}?${wt(h).slice(1)}${I}`}function Od({config:t}){return t.emulator?Yi(t,Rd):`https://${t.authDomain}/${kd}`}/**
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
 */const ki="webStorageSupport";class Dd{constructor(){this.eventManagers={},this.iframes={},this.originValidationPromises={},this._redirectPersistence=Qo,this._completeRedirectFn=la,this._overrideRedirectResult=Zh}async _openPopup(e,n,r,s){var a;Le((a=this.eventManagers[e._key()])===null||a===void 0?void 0:a.manager,"_initialize() not called before _openPopup()");const l=await Fs(e,n,r,qt(),s);return Sd(e,l,Gn())}async _openRedirect(e,n,r,s){await this._originValidation(e);const a=await Fs(e,n,r,qt(),s);return bh(a),new Promise(()=>{})}_initialize(e){const n=e._key();if(this.eventManagers[n]){const{manager:s,promise:a}=this.eventManagers[n];return s?Promise.resolve(s):(Le(a,"If manager is not set, promise should be"),a)}const r=this.initAndGetManager(e);return this.eventManagers[n]={promise:r},r.catch(()=>{delete this.eventManagers[n]}),r}async initAndGetManager(e){const n=await wd(e),r=new rd(e);return n.register("authEvent",s=>(b(s==null?void 0:s.authEvent,e,"invalid-auth-event"),{status:r.onEvent(s.authEvent)?"ACK":"ERROR"}),gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER),this.eventManagers[e._key()]={manager:r},this.iframes[e._key()]=n,r}_isIframeWebStorageSupported(e,n){this.iframes[e._key()].send(ki,{type:ki},s=>{var a;const l=(a=s==null?void 0:s[0])===null||a===void 0?void 0:a[ki];l!==void 0&&n(!!l),me(e,"internal-error")},gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER)}_originValidation(e){const n=e._key();return this.originValidationPromises[n]||(this.originValidationPromises[n]=ld(e)),this.originValidationPromises[n]}get _shouldInitProactively(){return xo()||Do()||Xi()}}const Nd=Dd;var xs="@firebase/auth",js="1.7.9";/**
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
 */class Ld{constructor(e){this.auth=e,this.internalListeners=new Map}getUid(){var e;return this.assertAuthConfigured(),((e=this.auth.currentUser)===null||e===void 0?void 0:e.uid)||null}async getToken(e){return this.assertAuthConfigured(),await this.auth._initializationPromise,this.auth.currentUser?{accessToken:await this.auth.currentUser.getIdToken(e)}:null}addAuthTokenListener(e){if(this.assertAuthConfigured(),this.internalListeners.has(e))return;const n=this.auth.onIdTokenChanged(r=>{e((r==null?void 0:r.stsTokenManager.accessToken)||null)});this.internalListeners.set(e,n),this.updateProactiveRefresh()}removeAuthTokenListener(e){this.assertAuthConfigured();const n=this.internalListeners.get(e);n&&(this.internalListeners.delete(e),n(),this.updateProactiveRefresh())}assertAuthConfigured(){b(this.auth._initializationPromise,"dependent-sdk-initialized-before-auth")}updateProactiveRefresh(){this.internalListeners.size>0?this.auth._startProactiveRefresh():this.auth._stopProactiveRefresh()}}/**
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
 */function Md(t){switch(t){case"Node":return"node";case"ReactNative":return"rn";case"Worker":return"webworker";case"Cordova":return"cordova";case"WebExtension":return"web-extension";default:return}}function Ud(t){Te(new we("auth",(e,{options:n})=>{const r=e.getProvider("app").getImmediate(),s=e.getProvider("heartbeat"),a=e.getProvider("app-check-internal"),{apiKey:l,authDomain:h}=r.options;b(l&&!l.includes(":"),"invalid-api-key",{appName:r.name});const g={apiKey:l,authDomain:h,clientPlatform:t,apiHost:"identitytoolkit.googleapis.com",tokenApiHost:"securetoken.googleapis.com",apiScheme:"https",sdkClientVersion:jo(t)},I=new Su(r,s,a,g);return Mu(I,n),I},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,n,r)=>{e.getProvider("auth-internal").initialize()})),Te(new we("auth-internal",e=>{const n=J(e.getProvider("auth").getImmediate());return(r=>new Ld(r))(n)},"PRIVATE").setInstantiationMode("EXPLICIT")),ge(xs,js,Md(t)),ge(xs,js,"esm2017")}/**
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
 */const Fd=5*60,xd=fo("authIdTokenMaxAge")||Fd;let $s=null;const jd=t=>async e=>{const n=e&&await e.getIdTokenResult(),r=n&&(new Date().getTime()-Date.parse(n.issuedAtTime))/1e3;if(r&&r>xd)return;const s=n==null?void 0:n.token;$s!==s&&($s=s,await fetch(t,{method:s?"POST":"DELETE",headers:s?{Authorization:`Bearer ${s}`}:{}}))};function $d(t=zi()){const e=ot(t,"auth");if(e.isInitialized())return e.getImmediate();const n=Lu(t,{popupRedirectResolver:Nd,persistence:[Nh,Ih,Qo]}),r=fo("authTokenSyncURL");if(r&&typeof isSecureContext=="boolean"&&isSecureContext){const a=new URL(r,location.origin);if(location.origin===a.origin){const l=jd(a.toString());gh(n,l,()=>l(n.currentUser)),ph(n,h=>l(h))}}const s=uo("auth");return s&&Uu(n,`http://${s}`),n}function Vd(){var t,e;return(e=(t=document.getElementsByTagName("head"))===null||t===void 0?void 0:t[0])!==null&&e!==void 0?e:document}Pu({loadJS(t){return new Promise((e,n)=>{const r=document.createElement("script");r.setAttribute("src",t),r.onload=e,r.onerror=s=>{const a=ue("internal-error");a.customData=s,n(a)},r.type="text/javascript",r.charset="UTF-8",Vd().appendChild(r)})},gapiScript:"https://apis.google.com/js/api.js",recaptchaV2Script:"https://www.google.com/recaptcha/api.js",recaptchaEnterpriseScript:"https://www.google.com/recaptcha/enterprise.js?render="});Ud("Browser");var Vs=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var ha;(function(){var t;/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/function e(m,d){function f(){}f.prototype=d.prototype,m.D=d.prototype,m.prototype=new f,m.prototype.constructor=m,m.C=function(y,v,_){for(var p=Array(arguments.length-2),ye=2;ye<arguments.length;ye++)p[ye-2]=arguments[ye];return d.prototype[v].apply(y,p)}}function n(){this.blockSize=-1}function r(){this.blockSize=-1,this.blockSize=64,this.g=Array(4),this.B=Array(this.blockSize),this.o=this.h=0,this.s()}e(r,n),r.prototype.s=function(){this.g[0]=1732584193,this.g[1]=4023233417,this.g[2]=2562383102,this.g[3]=271733878,this.o=this.h=0};function s(m,d,f){f||(f=0);var y=Array(16);if(typeof d=="string")for(var v=0;16>v;++v)y[v]=d.charCodeAt(f++)|d.charCodeAt(f++)<<8|d.charCodeAt(f++)<<16|d.charCodeAt(f++)<<24;else for(v=0;16>v;++v)y[v]=d[f++]|d[f++]<<8|d[f++]<<16|d[f++]<<24;d=m.g[0],f=m.g[1],v=m.g[2];var _=m.g[3],p=d+(_^f&(v^_))+y[0]+3614090360&4294967295;d=f+(p<<7&4294967295|p>>>25),p=_+(v^d&(f^v))+y[1]+3905402710&4294967295,_=d+(p<<12&4294967295|p>>>20),p=v+(f^_&(d^f))+y[2]+606105819&4294967295,v=_+(p<<17&4294967295|p>>>15),p=f+(d^v&(_^d))+y[3]+3250441966&4294967295,f=v+(p<<22&4294967295|p>>>10),p=d+(_^f&(v^_))+y[4]+4118548399&4294967295,d=f+(p<<7&4294967295|p>>>25),p=_+(v^d&(f^v))+y[5]+1200080426&4294967295,_=d+(p<<12&4294967295|p>>>20),p=v+(f^_&(d^f))+y[6]+2821735955&4294967295,v=_+(p<<17&4294967295|p>>>15),p=f+(d^v&(_^d))+y[7]+4249261313&4294967295,f=v+(p<<22&4294967295|p>>>10),p=d+(_^f&(v^_))+y[8]+1770035416&4294967295,d=f+(p<<7&4294967295|p>>>25),p=_+(v^d&(f^v))+y[9]+2336552879&4294967295,_=d+(p<<12&4294967295|p>>>20),p=v+(f^_&(d^f))+y[10]+4294925233&4294967295,v=_+(p<<17&4294967295|p>>>15),p=f+(d^v&(_^d))+y[11]+2304563134&4294967295,f=v+(p<<22&4294967295|p>>>10),p=d+(_^f&(v^_))+y[12]+1804603682&4294967295,d=f+(p<<7&4294967295|p>>>25),p=_+(v^d&(f^v))+y[13]+4254626195&4294967295,_=d+(p<<12&4294967295|p>>>20),p=v+(f^_&(d^f))+y[14]+2792965006&4294967295,v=_+(p<<17&4294967295|p>>>15),p=f+(d^v&(_^d))+y[15]+1236535329&4294967295,f=v+(p<<22&4294967295|p>>>10),p=d+(v^_&(f^v))+y[1]+4129170786&4294967295,d=f+(p<<5&4294967295|p>>>27),p=_+(f^v&(d^f))+y[6]+3225465664&4294967295,_=d+(p<<9&4294967295|p>>>23),p=v+(d^f&(_^d))+y[11]+643717713&4294967295,v=_+(p<<14&4294967295|p>>>18),p=f+(_^d&(v^_))+y[0]+3921069994&4294967295,f=v+(p<<20&4294967295|p>>>12),p=d+(v^_&(f^v))+y[5]+3593408605&4294967295,d=f+(p<<5&4294967295|p>>>27),p=_+(f^v&(d^f))+y[10]+38016083&4294967295,_=d+(p<<9&4294967295|p>>>23),p=v+(d^f&(_^d))+y[15]+3634488961&4294967295,v=_+(p<<14&4294967295|p>>>18),p=f+(_^d&(v^_))+y[4]+3889429448&4294967295,f=v+(p<<20&4294967295|p>>>12),p=d+(v^_&(f^v))+y[9]+568446438&4294967295,d=f+(p<<5&4294967295|p>>>27),p=_+(f^v&(d^f))+y[14]+3275163606&4294967295,_=d+(p<<9&4294967295|p>>>23),p=v+(d^f&(_^d))+y[3]+4107603335&4294967295,v=_+(p<<14&4294967295|p>>>18),p=f+(_^d&(v^_))+y[8]+1163531501&4294967295,f=v+(p<<20&4294967295|p>>>12),p=d+(v^_&(f^v))+y[13]+2850285829&4294967295,d=f+(p<<5&4294967295|p>>>27),p=_+(f^v&(d^f))+y[2]+4243563512&4294967295,_=d+(p<<9&4294967295|p>>>23),p=v+(d^f&(_^d))+y[7]+1735328473&4294967295,v=_+(p<<14&4294967295|p>>>18),p=f+(_^d&(v^_))+y[12]+2368359562&4294967295,f=v+(p<<20&4294967295|p>>>12),p=d+(f^v^_)+y[5]+4294588738&4294967295,d=f+(p<<4&4294967295|p>>>28),p=_+(d^f^v)+y[8]+2272392833&4294967295,_=d+(p<<11&4294967295|p>>>21),p=v+(_^d^f)+y[11]+1839030562&4294967295,v=_+(p<<16&4294967295|p>>>16),p=f+(v^_^d)+y[14]+4259657740&4294967295,f=v+(p<<23&4294967295|p>>>9),p=d+(f^v^_)+y[1]+2763975236&4294967295,d=f+(p<<4&4294967295|p>>>28),p=_+(d^f^v)+y[4]+1272893353&4294967295,_=d+(p<<11&4294967295|p>>>21),p=v+(_^d^f)+y[7]+4139469664&4294967295,v=_+(p<<16&4294967295|p>>>16),p=f+(v^_^d)+y[10]+3200236656&4294967295,f=v+(p<<23&4294967295|p>>>9),p=d+(f^v^_)+y[13]+681279174&4294967295,d=f+(p<<4&4294967295|p>>>28),p=_+(d^f^v)+y[0]+3936430074&4294967295,_=d+(p<<11&4294967295|p>>>21),p=v+(_^d^f)+y[3]+3572445317&4294967295,v=_+(p<<16&4294967295|p>>>16),p=f+(v^_^d)+y[6]+76029189&4294967295,f=v+(p<<23&4294967295|p>>>9),p=d+(f^v^_)+y[9]+3654602809&4294967295,d=f+(p<<4&4294967295|p>>>28),p=_+(d^f^v)+y[12]+3873151461&4294967295,_=d+(p<<11&4294967295|p>>>21),p=v+(_^d^f)+y[15]+530742520&4294967295,v=_+(p<<16&4294967295|p>>>16),p=f+(v^_^d)+y[2]+3299628645&4294967295,f=v+(p<<23&4294967295|p>>>9),p=d+(v^(f|~_))+y[0]+4096336452&4294967295,d=f+(p<<6&4294967295|p>>>26),p=_+(f^(d|~v))+y[7]+1126891415&4294967295,_=d+(p<<10&4294967295|p>>>22),p=v+(d^(_|~f))+y[14]+2878612391&4294967295,v=_+(p<<15&4294967295|p>>>17),p=f+(_^(v|~d))+y[5]+4237533241&4294967295,f=v+(p<<21&4294967295|p>>>11),p=d+(v^(f|~_))+y[12]+1700485571&4294967295,d=f+(p<<6&4294967295|p>>>26),p=_+(f^(d|~v))+y[3]+2399980690&4294967295,_=d+(p<<10&4294967295|p>>>22),p=v+(d^(_|~f))+y[10]+4293915773&4294967295,v=_+(p<<15&4294967295|p>>>17),p=f+(_^(v|~d))+y[1]+2240044497&4294967295,f=v+(p<<21&4294967295|p>>>11),p=d+(v^(f|~_))+y[8]+1873313359&4294967295,d=f+(p<<6&4294967295|p>>>26),p=_+(f^(d|~v))+y[15]+4264355552&4294967295,_=d+(p<<10&4294967295|p>>>22),p=v+(d^(_|~f))+y[6]+2734768916&4294967295,v=_+(p<<15&4294967295|p>>>17),p=f+(_^(v|~d))+y[13]+1309151649&4294967295,f=v+(p<<21&4294967295|p>>>11),p=d+(v^(f|~_))+y[4]+4149444226&4294967295,d=f+(p<<6&4294967295|p>>>26),p=_+(f^(d|~v))+y[11]+3174756917&4294967295,_=d+(p<<10&4294967295|p>>>22),p=v+(d^(_|~f))+y[2]+718787259&4294967295,v=_+(p<<15&4294967295|p>>>17),p=f+(_^(v|~d))+y[9]+3951481745&4294967295,m.g[0]=m.g[0]+d&4294967295,m.g[1]=m.g[1]+(v+(p<<21&4294967295|p>>>11))&4294967295,m.g[2]=m.g[2]+v&4294967295,m.g[3]=m.g[3]+_&4294967295}r.prototype.u=function(m,d){d===void 0&&(d=m.length);for(var f=d-this.blockSize,y=this.B,v=this.h,_=0;_<d;){if(v==0)for(;_<=f;)s(this,m,_),_+=this.blockSize;if(typeof m=="string"){for(;_<d;)if(y[v++]=m.charCodeAt(_++),v==this.blockSize){s(this,y),v=0;break}}else for(;_<d;)if(y[v++]=m[_++],v==this.blockSize){s(this,y),v=0;break}}this.h=v,this.o+=d},r.prototype.v=function(){var m=Array((56>this.h?this.blockSize:2*this.blockSize)-this.h);m[0]=128;for(var d=1;d<m.length-8;++d)m[d]=0;var f=8*this.o;for(d=m.length-8;d<m.length;++d)m[d]=f&255,f/=256;for(this.u(m),m=Array(16),d=f=0;4>d;++d)for(var y=0;32>y;y+=8)m[f++]=this.g[d]>>>y&255;return m};function a(m,d){var f=h;return Object.prototype.hasOwnProperty.call(f,m)?f[m]:f[m]=d(m)}function l(m,d){this.h=d;for(var f=[],y=!0,v=m.length-1;0<=v;v--){var _=m[v]|0;y&&_==d||(f[v]=_,y=!1)}this.g=f}var h={};function g(m){return-128<=m&&128>m?a(m,function(d){return new l([d|0],0>d?-1:0)}):new l([m|0],0>m?-1:0)}function I(m){if(isNaN(m)||!isFinite(m))return S;if(0>m)return M(I(-m));for(var d=[],f=1,y=0;m>=f;y++)d[y]=m/f|0,f*=4294967296;return new l(d,0)}function A(m,d){if(m.length==0)throw Error("number format error: empty string");if(d=d||10,2>d||36<d)throw Error("radix out of range: "+d);if(m.charAt(0)=="-")return M(A(m.substring(1),d));if(0<=m.indexOf("-"))throw Error('number format error: interior "-" character');for(var f=I(Math.pow(d,8)),y=S,v=0;v<m.length;v+=8){var _=Math.min(8,m.length-v),p=parseInt(m.substring(v,v+_),d);8>_?(_=I(Math.pow(d,_)),y=y.j(_).add(I(p))):(y=y.j(f),y=y.add(I(p)))}return y}var S=g(0),P=g(1),N=g(16777216);t=l.prototype,t.m=function(){if(x(this))return-M(this).m();for(var m=0,d=1,f=0;f<this.g.length;f++){var y=this.i(f);m+=(0<=y?y:4294967296+y)*d,d*=4294967296}return m},t.toString=function(m){if(m=m||10,2>m||36<m)throw Error("radix out of range: "+m);if(k(this))return"0";if(x(this))return"-"+M(this).toString(m);for(var d=I(Math.pow(m,6)),f=this,y="";;){var v=ne(f,d).g;f=fe(f,v.j(d));var _=((0<f.g.length?f.g[0]:f.h)>>>0).toString(m);if(f=v,k(f))return _+y;for(;6>_.length;)_="0"+_;y=_+y}},t.i=function(m){return 0>m?0:m<this.g.length?this.g[m]:this.h};function k(m){if(m.h!=0)return!1;for(var d=0;d<m.g.length;d++)if(m.g[d]!=0)return!1;return!0}function x(m){return m.h==-1}t.l=function(m){return m=fe(this,m),x(m)?-1:k(m)?0:1};function M(m){for(var d=m.g.length,f=[],y=0;y<d;y++)f[y]=~m.g[y];return new l(f,~m.h).add(P)}t.abs=function(){return x(this)?M(this):this},t.add=function(m){for(var d=Math.max(this.g.length,m.g.length),f=[],y=0,v=0;v<=d;v++){var _=y+(this.i(v)&65535)+(m.i(v)&65535),p=(_>>>16)+(this.i(v)>>>16)+(m.i(v)>>>16);y=p>>>16,_&=65535,p&=65535,f[v]=p<<16|_}return new l(f,f[f.length-1]&-2147483648?-1:0)};function fe(m,d){return m.add(M(d))}t.j=function(m){if(k(this)||k(m))return S;if(x(this))return x(m)?M(this).j(M(m)):M(M(this).j(m));if(x(m))return M(this.j(M(m)));if(0>this.l(N)&&0>m.l(N))return I(this.m()*m.m());for(var d=this.g.length+m.g.length,f=[],y=0;y<2*d;y++)f[y]=0;for(y=0;y<this.g.length;y++)for(var v=0;v<m.g.length;v++){var _=this.i(y)>>>16,p=this.i(y)&65535,ye=m.i(v)>>>16,Se=m.i(v)&65535;f[2*y+2*v]+=p*Se,te(f,2*y+2*v),f[2*y+2*v+1]+=_*Se,te(f,2*y+2*v+1),f[2*y+2*v+1]+=p*ye,te(f,2*y+2*v+1),f[2*y+2*v+2]+=_*ye,te(f,2*y+2*v+2)}for(y=0;y<d;y++)f[y]=f[2*y+1]<<16|f[2*y];for(y=d;y<2*d;y++)f[y]=0;return new l(f,0)};function te(m,d){for(;(m[d]&65535)!=m[d];)m[d+1]+=m[d]>>>16,m[d]&=65535,d++}function z(m,d){this.g=m,this.h=d}function ne(m,d){if(k(d))throw Error("division by zero");if(k(m))return new z(S,S);if(x(m))return d=ne(M(m),d),new z(M(d.g),M(d.h));if(x(d))return d=ne(m,M(d)),new z(M(d.g),d.h);if(30<m.g.length){if(x(m)||x(d))throw Error("slowDivide_ only works with positive integers.");for(var f=P,y=d;0>=y.l(m);)f=Ae(f),y=Ae(y);var v=Y(f,1),_=Y(y,1);for(y=Y(y,2),f=Y(f,2);!k(y);){var p=_.add(y);0>=p.l(m)&&(v=v.add(f),_=p),y=Y(y,1),f=Y(f,1)}return d=fe(m,v.j(d)),new z(v,d)}for(v=S;0<=m.l(d);){for(f=Math.max(1,Math.floor(m.m()/d.m())),y=Math.ceil(Math.log(f)/Math.LN2),y=48>=y?1:Math.pow(2,y-48),_=I(f),p=_.j(d);x(p)||0<p.l(m);)f-=y,_=I(f),p=_.j(d);k(_)&&(_=P),v=v.add(_),m=fe(m,p)}return new z(v,m)}t.A=function(m){return ne(this,m).h},t.and=function(m){for(var d=Math.max(this.g.length,m.g.length),f=[],y=0;y<d;y++)f[y]=this.i(y)&m.i(y);return new l(f,this.h&m.h)},t.or=function(m){for(var d=Math.max(this.g.length,m.g.length),f=[],y=0;y<d;y++)f[y]=this.i(y)|m.i(y);return new l(f,this.h|m.h)},t.xor=function(m){for(var d=Math.max(this.g.length,m.g.length),f=[],y=0;y<d;y++)f[y]=this.i(y)^m.i(y);return new l(f,this.h^m.h)};function Ae(m){for(var d=m.g.length+1,f=[],y=0;y<d;y++)f[y]=m.i(y)<<1|m.i(y-1)>>>31;return new l(f,m.h)}function Y(m,d){var f=d>>5;d%=32;for(var y=m.g.length-f,v=[],_=0;_<y;_++)v[_]=0<d?m.i(_+f)>>>d|m.i(_+f+1)<<32-d:m.i(_+f);return new l(v,m.h)}r.prototype.digest=r.prototype.v,r.prototype.reset=r.prototype.s,r.prototype.update=r.prototype.u,l.prototype.add=l.prototype.add,l.prototype.multiply=l.prototype.j,l.prototype.modulo=l.prototype.A,l.prototype.compare=l.prototype.l,l.prototype.toNumber=l.prototype.m,l.prototype.toString=l.prototype.toString,l.prototype.getBits=l.prototype.i,l.fromNumber=I,l.fromString=A,ha=l}).apply(typeof Vs<"u"?Vs:typeof self<"u"?self:typeof window<"u"?window:{});var wn=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};(function(){var t,e=typeof Object.defineProperties=="function"?Object.defineProperty:function(i,o,c){return i==Array.prototype||i==Object.prototype||(i[o]=c.value),i};function n(i){i=[typeof globalThis=="object"&&globalThis,i,typeof window=="object"&&window,typeof self=="object"&&self,typeof wn=="object"&&wn];for(var o=0;o<i.length;++o){var c=i[o];if(c&&c.Math==Math)return c}throw Error("Cannot find global object")}var r=n(this);function s(i,o){if(o)e:{var c=r;i=i.split(".");for(var u=0;u<i.length-1;u++){var w=i[u];if(!(w in c))break e;c=c[w]}i=i[i.length-1],u=c[i],o=o(u),o!=u&&o!=null&&e(c,i,{configurable:!0,writable:!0,value:o})}}function a(i,o){i instanceof String&&(i+="");var c=0,u=!1,w={next:function(){if(!u&&c<i.length){var E=c++;return{value:o(E,i[E]),done:!1}}return u=!0,{done:!0,value:void 0}}};return w[Symbol.iterator]=function(){return w},w}s("Array.prototype.values",function(i){return i||function(){return a(this,function(o,c){return c})}});/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/var l=l||{},h=this||self;function g(i){var o=typeof i;return o=o!="object"?o:i?Array.isArray(i)?"array":o:"null",o=="array"||o=="object"&&typeof i.length=="number"}function I(i){var o=typeof i;return o=="object"&&i!=null||o=="function"}function A(i,o,c){return i.call.apply(i.bind,arguments)}function S(i,o,c){if(!i)throw Error();if(2<arguments.length){var u=Array.prototype.slice.call(arguments,2);return function(){var w=Array.prototype.slice.call(arguments);return Array.prototype.unshift.apply(w,u),i.apply(o,w)}}return function(){return i.apply(o,arguments)}}function P(i,o,c){return P=Function.prototype.bind&&Function.prototype.bind.toString().indexOf("native code")!=-1?A:S,P.apply(null,arguments)}function N(i,o){var c=Array.prototype.slice.call(arguments,1);return function(){var u=c.slice();return u.push.apply(u,arguments),i.apply(this,u)}}function k(i,o){function c(){}c.prototype=o.prototype,i.aa=o.prototype,i.prototype=new c,i.prototype.constructor=i,i.Qb=function(u,w,E){for(var T=Array(arguments.length-2),L=2;L<arguments.length;L++)T[L-2]=arguments[L];return o.prototype[w].apply(u,T)}}function x(i){const o=i.length;if(0<o){const c=Array(o);for(let u=0;u<o;u++)c[u]=i[u];return c}return[]}function M(i,o){for(let c=1;c<arguments.length;c++){const u=arguments[c];if(g(u)){const w=i.length||0,E=u.length||0;i.length=w+E;for(let T=0;T<E;T++)i[w+T]=u[T]}else i.push(u)}}class fe{constructor(o,c){this.i=o,this.j=c,this.h=0,this.g=null}get(){let o;return 0<this.h?(this.h--,o=this.g,this.g=o.next,o.next=null):o=this.i(),o}}function te(i){return/^[\s\xa0]*$/.test(i)}function z(){var i=h.navigator;return i&&(i=i.userAgent)?i:""}function ne(i){return ne[" "](i),i}ne[" "]=function(){};var Ae=z().indexOf("Gecko")!=-1&&!(z().toLowerCase().indexOf("webkit")!=-1&&z().indexOf("Edge")==-1)&&!(z().indexOf("Trident")!=-1||z().indexOf("MSIE")!=-1)&&z().indexOf("Edge")==-1;function Y(i,o,c){for(const u in i)o.call(c,i[u],u,i)}function m(i,o){for(const c in i)o.call(void 0,i[c],c,i)}function d(i){const o={};for(const c in i)o[c]=i[c];return o}const f="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function y(i,o){let c,u;for(let w=1;w<arguments.length;w++){u=arguments[w];for(c in u)i[c]=u[c];for(let E=0;E<f.length;E++)c=f[E],Object.prototype.hasOwnProperty.call(u,c)&&(i[c]=u[c])}}function v(i){var o=1;i=i.split(":");const c=[];for(;0<o&&i.length;)c.push(i.shift()),o--;return i.length&&c.push(i.join(":")),c}function _(i){h.setTimeout(()=>{throw i},0)}function p(){var i=Ye;let o=null;return i.g&&(o=i.g,i.g=i.g.next,i.g||(i.h=null),o.next=null),o}class ye{constructor(){this.h=this.g=null}add(o,c){const u=Se.get();u.set(o,c),this.h?this.h.next=u:this.g=u,this.h=u}}var Se=new fe(()=>new nn,i=>i.reset());class nn{constructor(){this.next=this.g=this.h=null}set(o,c){this.h=o,this.g=c,this.next=null}reset(){this.next=this.g=this.h=null}}let Fe,Je=!1,Ye=new ye,V=()=>{const i=h.Promise.resolve(void 0);Fe=()=>{i.then(X)}};var X=()=>{for(var i;i=p();){try{i.h.call(i.g)}catch(c){_(c)}var o=Se;o.j(i),100>o.h&&(o.h++,i.next=o.g,o.g=i)}Je=!1};function B(){this.s=this.s,this.C=this.C}B.prototype.s=!1,B.prototype.ma=function(){this.s||(this.s=!0,this.N())},B.prototype.N=function(){if(this.C)for(;this.C.length;)this.C.shift()()};function U(i,o){this.type=i,this.g=this.target=o,this.defaultPrevented=!1}U.prototype.h=function(){this.defaultPrevented=!0};var Ee=function(){if(!h.addEventListener||!Object.defineProperty)return!1;var i=!1,o=Object.defineProperty({},"passive",{get:function(){i=!0}});try{const c=()=>{};h.addEventListener("test",c,o),h.removeEventListener("test",c,o)}catch{}return i}();function G(i,o){if(U.call(this,i?i.type:""),this.relatedTarget=this.g=this.target=null,this.button=this.screenY=this.screenX=this.clientY=this.clientX=0,this.key="",this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1,this.state=null,this.pointerId=0,this.pointerType="",this.i=null,i){var c=this.type=i.type,u=i.changedTouches&&i.changedTouches.length?i.changedTouches[0]:null;if(this.target=i.target||i.srcElement,this.g=o,o=i.relatedTarget){if(Ae){e:{try{ne(o.nodeName);var w=!0;break e}catch{}w=!1}w||(o=null)}}else c=="mouseover"?o=i.fromElement:c=="mouseout"&&(o=i.toElement);this.relatedTarget=o,u?(this.clientX=u.clientX!==void 0?u.clientX:u.pageX,this.clientY=u.clientY!==void 0?u.clientY:u.pageY,this.screenX=u.screenX||0,this.screenY=u.screenY||0):(this.clientX=i.clientX!==void 0?i.clientX:i.pageX,this.clientY=i.clientY!==void 0?i.clientY:i.pageY,this.screenX=i.screenX||0,this.screenY=i.screenY||0),this.button=i.button,this.key=i.key||"",this.ctrlKey=i.ctrlKey,this.altKey=i.altKey,this.shiftKey=i.shiftKey,this.metaKey=i.metaKey,this.pointerId=i.pointerId||0,this.pointerType=typeof i.pointerType=="string"?i.pointerType:ct[i.pointerType]||"",this.state=i.state,this.i=i,i.defaultPrevented&&G.aa.h.call(this)}}k(G,U);var ct={2:"touch",3:"pen",4:"mouse"};G.prototype.h=function(){G.aa.h.call(this);var i=this.i;i.preventDefault?i.preventDefault():i.returnValue=!1};var Pe="closure_listenable_"+(1e6*Math.random()|0),ja=0;function $a(i,o,c,u,w){this.listener=i,this.proxy=null,this.src=o,this.type=c,this.capture=!!u,this.ha=w,this.key=++ja,this.da=this.fa=!1}function rn(i){i.da=!0,i.listener=null,i.proxy=null,i.src=null,i.ha=null}function sn(i){this.src=i,this.g={},this.h=0}sn.prototype.add=function(i,o,c,u,w){var E=i.toString();i=this.g[E],i||(i=this.g[E]=[],this.h++);var T=Xn(i,o,u,w);return-1<T?(o=i[T],c||(o.fa=!1)):(o=new $a(o,this.src,E,!!u,w),o.fa=c,i.push(o)),o};function Yn(i,o){var c=o.type;if(c in i.g){var u=i.g[c],w=Array.prototype.indexOf.call(u,o,void 0),E;(E=0<=w)&&Array.prototype.splice.call(u,w,1),E&&(rn(o),i.g[c].length==0&&(delete i.g[c],i.h--))}}function Xn(i,o,c,u){for(var w=0;w<i.length;++w){var E=i[w];if(!E.da&&E.listener==o&&E.capture==!!c&&E.ha==u)return w}return-1}var Qn="closure_lm_"+(1e6*Math.random()|0),Zn={};function fr(i,o,c,u,w){if(Array.isArray(o)){for(var E=0;E<o.length;E++)fr(i,o[E],c,u,w);return null}return c=mr(c),i&&i[Pe]?i.K(o,c,I(u)?!!u.capture:!1,w):Va(i,o,c,!1,u,w)}function Va(i,o,c,u,w,E){if(!o)throw Error("Invalid event type");var T=I(w)?!!w.capture:!!w,L=ti(i);if(L||(i[Qn]=L=new sn(i)),c=L.add(o,c,u,T,E),c.proxy)return c;if(u=Ba(),c.proxy=u,u.src=i,u.listener=c,i.addEventListener)Ee||(w=T),w===void 0&&(w=!1),i.addEventListener(o.toString(),u,w);else if(i.attachEvent)i.attachEvent(gr(o.toString()),u);else if(i.addListener&&i.removeListener)i.addListener(u);else throw Error("addEventListener and attachEvent are unavailable.");return c}function Ba(){function i(c){return o.call(i.src,i.listener,c)}const o=Ha;return i}function pr(i,o,c,u,w){if(Array.isArray(o))for(var E=0;E<o.length;E++)pr(i,o[E],c,u,w);else u=I(u)?!!u.capture:!!u,c=mr(c),i&&i[Pe]?(i=i.i,o=String(o).toString(),o in i.g&&(E=i.g[o],c=Xn(E,c,u,w),-1<c&&(rn(E[c]),Array.prototype.splice.call(E,c,1),E.length==0&&(delete i.g[o],i.h--)))):i&&(i=ti(i))&&(o=i.g[o.toString()],i=-1,o&&(i=Xn(o,c,u,w)),(c=-1<i?o[i]:null)&&ei(c))}function ei(i){if(typeof i!="number"&&i&&!i.da){var o=i.src;if(o&&o[Pe])Yn(o.i,i);else{var c=i.type,u=i.proxy;o.removeEventListener?o.removeEventListener(c,u,i.capture):o.detachEvent?o.detachEvent(gr(c),u):o.addListener&&o.removeListener&&o.removeListener(u),(c=ti(o))?(Yn(c,i),c.h==0&&(c.src=null,o[Qn]=null)):rn(i)}}}function gr(i){return i in Zn?Zn[i]:Zn[i]="on"+i}function Ha(i,o){if(i.da)i=!0;else{o=new G(o,this);var c=i.listener,u=i.ha||i.src;i.fa&&ei(i),i=c.call(u,o)}return i}function ti(i){return i=i[Qn],i instanceof sn?i:null}var ni="__closure_events_fn_"+(1e9*Math.random()>>>0);function mr(i){return typeof i=="function"?i:(i[ni]||(i[ni]=function(o){return i.handleEvent(o)}),i[ni])}function Q(){B.call(this),this.i=new sn(this),this.M=this,this.F=null}k(Q,B),Q.prototype[Pe]=!0,Q.prototype.removeEventListener=function(i,o,c,u){pr(this,i,o,c,u)};function ie(i,o){var c,u=i.F;if(u)for(c=[];u;u=u.F)c.push(u);if(i=i.M,u=o.type||o,typeof o=="string")o=new U(o,i);else if(o instanceof U)o.target=o.target||i;else{var w=o;o=new U(u,i),y(o,w)}if(w=!0,c)for(var E=c.length-1;0<=E;E--){var T=o.g=c[E];w=on(T,u,!0,o)&&w}if(T=o.g=i,w=on(T,u,!0,o)&&w,w=on(T,u,!1,o)&&w,c)for(E=0;E<c.length;E++)T=o.g=c[E],w=on(T,u,!1,o)&&w}Q.prototype.N=function(){if(Q.aa.N.call(this),this.i){var i=this.i,o;for(o in i.g){for(var c=i.g[o],u=0;u<c.length;u++)rn(c[u]);delete i.g[o],i.h--}}this.F=null},Q.prototype.K=function(i,o,c,u){return this.i.add(String(i),o,!1,c,u)},Q.prototype.L=function(i,o,c,u){return this.i.add(String(i),o,!0,c,u)};function on(i,o,c,u){if(o=i.i.g[String(o)],!o)return!0;o=o.concat();for(var w=!0,E=0;E<o.length;++E){var T=o[E];if(T&&!T.da&&T.capture==c){var L=T.listener,q=T.ha||T.src;T.fa&&Yn(i.i,T),w=L.call(q,u)!==!1&&w}}return w&&!u.defaultPrevented}function yr(i,o,c){if(typeof i=="function")c&&(i=P(i,c));else if(i&&typeof i.handleEvent=="function")i=P(i.handleEvent,i);else throw Error("Invalid listener argument");return 2147483647<Number(o)?-1:h.setTimeout(i,o||0)}function vr(i){i.g=yr(()=>{i.g=null,i.i&&(i.i=!1,vr(i))},i.l);const o=i.h;i.h=null,i.m.apply(null,o)}class Wa extends B{constructor(o,c){super(),this.m=o,this.l=c,this.h=null,this.i=!1,this.g=null}j(o){this.h=arguments,this.g?this.i=!0:vr(this)}N(){super.N(),this.g&&(h.clearTimeout(this.g),this.g=null,this.i=!1,this.h=null)}}function bt(i){B.call(this),this.h=i,this.g={}}k(bt,B);var _r=[];function wr(i){Y(i.g,function(o,c){this.g.hasOwnProperty(c)&&ei(o)},i),i.g={}}bt.prototype.N=function(){bt.aa.N.call(this),wr(this)},bt.prototype.handleEvent=function(){throw Error("EventHandler.handleEvent not implemented")};var ii=h.JSON.stringify,za=h.JSON.parse,Ga=class{stringify(i){return h.JSON.stringify(i,void 0)}parse(i){return h.JSON.parse(i,void 0)}};function ri(){}ri.prototype.h=null;function Ir(i){return i.h||(i.h=i.i())}function qa(){}var At={OPEN:"a",kb:"b",Ja:"c",wb:"d"};function si(){U.call(this,"d")}k(si,U);function oi(){U.call(this,"c")}k(oi,U);var lt={},Er=null;function ai(){return Er=Er||new Q}lt.La="serverreachability";function Tr(i){U.call(this,lt.La,i)}k(Tr,U);function St(i){const o=ai();ie(o,new Tr(o))}lt.STAT_EVENT="statevent";function br(i,o){U.call(this,lt.STAT_EVENT,i),this.stat=o}k(br,U);function re(i){const o=ai();ie(o,new br(o,i))}lt.Ma="timingevent";function Ar(i,o){U.call(this,lt.Ma,i),this.size=o}k(Ar,U);function Pt(i,o){if(typeof i!="function")throw Error("Fn must not be null and must be a function");return h.setTimeout(function(){i()},o)}function kt(){this.g=!0}kt.prototype.xa=function(){this.g=!1};function Ka(i,o,c,u,w,E){i.info(function(){if(i.g)if(E)for(var T="",L=E.split("&"),q=0;q<L.length;q++){var C=L[q].split("=");if(1<C.length){var Z=C[0];C=C[1];var ee=Z.split("_");T=2<=ee.length&&ee[1]=="type"?T+(Z+"="+C+"&"):T+(Z+"=redacted&")}}else T=null;else T=E;return"XMLHTTP REQ ("+u+") [attempt "+w+"]: "+o+`
`+c+`
`+T})}function Ja(i,o,c,u,w,E,T){i.info(function(){return"XMLHTTP RESP ("+u+") [ attempt "+w+"]: "+o+`
`+c+`
`+E+" "+T})}function ut(i,o,c,u){i.info(function(){return"XMLHTTP TEXT ("+o+"): "+Xa(i,c)+(u?" "+u:"")})}function Ya(i,o){i.info(function(){return"TIMEOUT: "+o})}kt.prototype.info=function(){};function Xa(i,o){if(!i.g)return o;if(!o)return null;try{var c=JSON.parse(o);if(c){for(i=0;i<c.length;i++)if(Array.isArray(c[i])){var u=c[i];if(!(2>u.length)){var w=u[1];if(Array.isArray(w)&&!(1>w.length)){var E=w[0];if(E!="noop"&&E!="stop"&&E!="close")for(var T=1;T<w.length;T++)w[T]=""}}}}return ii(c)}catch{return o}}var ci={NO_ERROR:0,TIMEOUT:8},Qa={},li;function an(){}k(an,ri),an.prototype.g=function(){return new XMLHttpRequest},an.prototype.i=function(){return{}},li=new an;function xe(i,o,c,u){this.j=i,this.i=o,this.l=c,this.R=u||1,this.U=new bt(this),this.I=45e3,this.H=null,this.o=!1,this.m=this.A=this.v=this.L=this.F=this.S=this.B=null,this.D=[],this.g=null,this.C=0,this.s=this.u=null,this.X=-1,this.J=!1,this.O=0,this.M=null,this.W=this.K=this.T=this.P=!1,this.h=new Sr}function Sr(){this.i=null,this.g="",this.h=!1}var Pr={},ui={};function hi(i,o,c){i.L=1,i.v=hn(ke(o)),i.m=c,i.P=!0,kr(i,null)}function kr(i,o){i.F=Date.now(),cn(i),i.A=ke(i.v);var c=i.A,u=i.R;Array.isArray(u)||(u=[String(u)]),Br(c.i,"t",u),i.C=0,c=i.j.J,i.h=new Sr,i.g=os(i.j,c?o:null,!i.m),0<i.O&&(i.M=new Wa(P(i.Y,i,i.g),i.O)),o=i.U,c=i.g,u=i.ca;var w="readystatechange";Array.isArray(w)||(w&&(_r[0]=w.toString()),w=_r);for(var E=0;E<w.length;E++){var T=fr(c,w[E],u||o.handleEvent,!1,o.h||o);if(!T)break;o.g[T.key]=T}o=i.H?d(i.H):{},i.m?(i.u||(i.u="POST"),o["Content-Type"]="application/x-www-form-urlencoded",i.g.ea(i.A,i.u,i.m,o)):(i.u="GET",i.g.ea(i.A,i.u,null,o)),St(),Ka(i.i,i.u,i.A,i.l,i.R,i.m)}xe.prototype.ca=function(i){i=i.target;const o=this.M;o&&Re(i)==3?o.j():this.Y(i)},xe.prototype.Y=function(i){try{if(i==this.g)e:{const ee=Re(this.g);var o=this.g.Ba();const ft=this.g.Z();if(!(3>ee)&&(ee!=3||this.g&&(this.h.h||this.g.oa()||Jr(this.g)))){this.J||ee!=4||o==7||(o==8||0>=ft?St(3):St(2)),di(this);var c=this.g.Z();this.X=c;t:if(Rr(this)){var u=Jr(this.g);i="";var w=u.length,E=Re(this.g)==4;if(!this.h.i){if(typeof TextDecoder>"u"){Xe(this),Rt(this);var T="";break t}this.h.i=new h.TextDecoder}for(o=0;o<w;o++)this.h.h=!0,i+=this.h.i.decode(u[o],{stream:!(E&&o==w-1)});u.length=0,this.h.g+=i,this.C=0,T=this.h.g}else T=this.g.oa();if(this.o=c==200,Ja(this.i,this.u,this.A,this.l,this.R,ee,c),this.o){if(this.T&&!this.K){t:{if(this.g){var L,q=this.g;if((L=q.g?q.g.getResponseHeader("X-HTTP-Initial-Response"):null)&&!te(L)){var C=L;break t}}C=null}if(c=C)ut(this.i,this.l,c,"Initial handshake response via X-HTTP-Initial-Response"),this.K=!0,fi(this,c);else{this.o=!1,this.s=3,re(12),Xe(this),Rt(this);break e}}if(this.P){c=!0;let ve;for(;!this.J&&this.C<T.length;)if(ve=Za(this,T),ve==ui){ee==4&&(this.s=4,re(14),c=!1),ut(this.i,this.l,null,"[Incomplete Response]");break}else if(ve==Pr){this.s=4,re(15),ut(this.i,this.l,T,"[Invalid Chunk]"),c=!1;break}else ut(this.i,this.l,ve,null),fi(this,ve);if(Rr(this)&&this.C!=0&&(this.h.g=this.h.g.slice(this.C),this.C=0),ee!=4||T.length!=0||this.h.h||(this.s=1,re(16),c=!1),this.o=this.o&&c,!c)ut(this.i,this.l,T,"[Invalid Chunked Response]"),Xe(this),Rt(this);else if(0<T.length&&!this.W){this.W=!0;var Z=this.j;Z.g==this&&Z.ba&&!Z.M&&(Z.j.info("Great, no buffering proxy detected. Bytes received: "+T.length),_i(Z),Z.M=!0,re(11))}}else ut(this.i,this.l,T,null),fi(this,T);ee==4&&Xe(this),this.o&&!this.J&&(ee==4?ns(this.j,this):(this.o=!1,cn(this)))}else mc(this.g),c==400&&0<T.indexOf("Unknown SID")?(this.s=3,re(12)):(this.s=0,re(13)),Xe(this),Rt(this)}}}catch{}finally{}};function Rr(i){return i.g?i.u=="GET"&&i.L!=2&&i.j.Ca:!1}function Za(i,o){var c=i.C,u=o.indexOf(`
`,c);return u==-1?ui:(c=Number(o.substring(c,u)),isNaN(c)?Pr:(u+=1,u+c>o.length?ui:(o=o.slice(u,u+c),i.C=u+c,o)))}xe.prototype.cancel=function(){this.J=!0,Xe(this)};function cn(i){i.S=Date.now()+i.I,Cr(i,i.I)}function Cr(i,o){if(i.B!=null)throw Error("WatchDog timer not null");i.B=Pt(P(i.ba,i),o)}function di(i){i.B&&(h.clearTimeout(i.B),i.B=null)}xe.prototype.ba=function(){this.B=null;const i=Date.now();0<=i-this.S?(Ya(this.i,this.A),this.L!=2&&(St(),re(17)),Xe(this),this.s=2,Rt(this)):Cr(this,this.S-i)};function Rt(i){i.j.G==0||i.J||ns(i.j,i)}function Xe(i){di(i);var o=i.M;o&&typeof o.ma=="function"&&o.ma(),i.M=null,wr(i.U),i.g&&(o=i.g,i.g=null,o.abort(),o.ma())}function fi(i,o){try{var c=i.j;if(c.G!=0&&(c.g==i||pi(c.h,i))){if(!i.K&&pi(c.h,i)&&c.G==3){try{var u=c.Da.g.parse(o)}catch{u=null}if(Array.isArray(u)&&u.length==3){var w=u;if(w[0]==0){e:if(!c.u){if(c.g)if(c.g.F+3e3<i.F)yn(c),gn(c);else break e;vi(c),re(18)}}else c.za=w[1],0<c.za-c.T&&37500>w[2]&&c.F&&c.v==0&&!c.C&&(c.C=Pt(P(c.Za,c),6e3));if(1>=Nr(c.h)&&c.ca){try{c.ca()}catch{}c.ca=void 0}}else Ze(c,11)}else if((i.K||c.g==i)&&yn(c),!te(o))for(w=c.Da.g.parse(o),o=0;o<w.length;o++){let C=w[o];if(c.T=C[0],C=C[1],c.G==2)if(C[0]=="c"){c.K=C[1],c.ia=C[2];const Z=C[3];Z!=null&&(c.la=Z,c.j.info("VER="+c.la));const ee=C[4];ee!=null&&(c.Aa=ee,c.j.info("SVER="+c.Aa));const ft=C[5];ft!=null&&typeof ft=="number"&&0<ft&&(u=1.5*ft,c.L=u,c.j.info("backChannelRequestTimeoutMs_="+u)),u=c;const ve=i.g;if(ve){const vn=ve.g?ve.g.getResponseHeader("X-Client-Wire-Protocol"):null;if(vn){var E=u.h;E.g||vn.indexOf("spdy")==-1&&vn.indexOf("quic")==-1&&vn.indexOf("h2")==-1||(E.j=E.l,E.g=new Set,E.h&&(gi(E,E.h),E.h=null))}if(u.D){const wi=ve.g?ve.g.getResponseHeader("X-HTTP-Session-Id"):null;wi&&(u.ya=wi,F(u.I,u.D,wi))}}c.G=3,c.l&&c.l.ua(),c.ba&&(c.R=Date.now()-i.F,c.j.info("Handshake RTT: "+c.R+"ms")),u=c;var T=i;if(u.qa=ss(u,u.J?u.ia:null,u.W),T.K){Lr(u.h,T);var L=T,q=u.L;q&&(L.I=q),L.B&&(di(L),cn(L)),u.g=T}else es(u);0<c.i.length&&mn(c)}else C[0]!="stop"&&C[0]!="close"||Ze(c,7);else c.G==3&&(C[0]=="stop"||C[0]=="close"?C[0]=="stop"?Ze(c,7):yi(c):C[0]!="noop"&&c.l&&c.l.ta(C),c.v=0)}}St(4)}catch{}}var ec=class{constructor(i,o){this.g=i,this.map=o}};function Or(i){this.l=i||10,h.PerformanceNavigationTiming?(i=h.performance.getEntriesByType("navigation"),i=0<i.length&&(i[0].nextHopProtocol=="hq"||i[0].nextHopProtocol=="h2")):i=!!(h.chrome&&h.chrome.loadTimes&&h.chrome.loadTimes()&&h.chrome.loadTimes().wasFetchedViaSpdy),this.j=i?this.l:1,this.g=null,1<this.j&&(this.g=new Set),this.h=null,this.i=[]}function Dr(i){return i.h?!0:i.g?i.g.size>=i.j:!1}function Nr(i){return i.h?1:i.g?i.g.size:0}function pi(i,o){return i.h?i.h==o:i.g?i.g.has(o):!1}function gi(i,o){i.g?i.g.add(o):i.h=o}function Lr(i,o){i.h&&i.h==o?i.h=null:i.g&&i.g.has(o)&&i.g.delete(o)}Or.prototype.cancel=function(){if(this.i=Mr(this),this.h)this.h.cancel(),this.h=null;else if(this.g&&this.g.size!==0){for(const i of this.g.values())i.cancel();this.g.clear()}};function Mr(i){if(i.h!=null)return i.i.concat(i.h.D);if(i.g!=null&&i.g.size!==0){let o=i.i;for(const c of i.g.values())o=o.concat(c.D);return o}return x(i.i)}function tc(i){if(i.V&&typeof i.V=="function")return i.V();if(typeof Map<"u"&&i instanceof Map||typeof Set<"u"&&i instanceof Set)return Array.from(i.values());if(typeof i=="string")return i.split("");if(g(i)){for(var o=[],c=i.length,u=0;u<c;u++)o.push(i[u]);return o}o=[],c=0;for(u in i)o[c++]=i[u];return o}function nc(i){if(i.na&&typeof i.na=="function")return i.na();if(!i.V||typeof i.V!="function"){if(typeof Map<"u"&&i instanceof Map)return Array.from(i.keys());if(!(typeof Set<"u"&&i instanceof Set)){if(g(i)||typeof i=="string"){var o=[];i=i.length;for(var c=0;c<i;c++)o.push(c);return o}o=[],c=0;for(const u in i)o[c++]=u;return o}}}function Ur(i,o){if(i.forEach&&typeof i.forEach=="function")i.forEach(o,void 0);else if(g(i)||typeof i=="string")Array.prototype.forEach.call(i,o,void 0);else for(var c=nc(i),u=tc(i),w=u.length,E=0;E<w;E++)o.call(void 0,u[E],c&&c[E],i)}var Fr=RegExp("^(?:([^:/?#.]+):)?(?://(?:([^\\\\/?#]*)@)?([^\\\\/?#]*?)(?::([0-9]+))?(?=[\\\\/?#]|$))?([^?#]+)?(?:\\?([^#]*))?(?:#([\\s\\S]*))?$");function ic(i,o){if(i){i=i.split("&");for(var c=0;c<i.length;c++){var u=i[c].indexOf("="),w=null;if(0<=u){var E=i[c].substring(0,u);w=i[c].substring(u+1)}else E=i[c];o(E,w?decodeURIComponent(w.replace(/\+/g," ")):"")}}}function Qe(i){if(this.g=this.o=this.j="",this.s=null,this.m=this.l="",this.h=!1,i instanceof Qe){this.h=i.h,ln(this,i.j),this.o=i.o,this.g=i.g,un(this,i.s),this.l=i.l;var o=i.i,c=new Dt;c.i=o.i,o.g&&(c.g=new Map(o.g),c.h=o.h),xr(this,c),this.m=i.m}else i&&(o=String(i).match(Fr))?(this.h=!1,ln(this,o[1]||"",!0),this.o=Ct(o[2]||""),this.g=Ct(o[3]||"",!0),un(this,o[4]),this.l=Ct(o[5]||"",!0),xr(this,o[6]||"",!0),this.m=Ct(o[7]||"")):(this.h=!1,this.i=new Dt(null,this.h))}Qe.prototype.toString=function(){var i=[],o=this.j;o&&i.push(Ot(o,jr,!0),":");var c=this.g;return(c||o=="file")&&(i.push("//"),(o=this.o)&&i.push(Ot(o,jr,!0),"@"),i.push(encodeURIComponent(String(c)).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),c=this.s,c!=null&&i.push(":",String(c))),(c=this.l)&&(this.g&&c.charAt(0)!="/"&&i.push("/"),i.push(Ot(c,c.charAt(0)=="/"?oc:sc,!0))),(c=this.i.toString())&&i.push("?",c),(c=this.m)&&i.push("#",Ot(c,cc)),i.join("")};function ke(i){return new Qe(i)}function ln(i,o,c){i.j=c?Ct(o,!0):o,i.j&&(i.j=i.j.replace(/:$/,""))}function un(i,o){if(o){if(o=Number(o),isNaN(o)||0>o)throw Error("Bad port number "+o);i.s=o}else i.s=null}function xr(i,o,c){o instanceof Dt?(i.i=o,lc(i.i,i.h)):(c||(o=Ot(o,ac)),i.i=new Dt(o,i.h))}function F(i,o,c){i.i.set(o,c)}function hn(i){return F(i,"zx",Math.floor(2147483648*Math.random()).toString(36)+Math.abs(Math.floor(2147483648*Math.random())^Date.now()).toString(36)),i}function Ct(i,o){return i?o?decodeURI(i.replace(/%25/g,"%2525")):decodeURIComponent(i):""}function Ot(i,o,c){return typeof i=="string"?(i=encodeURI(i).replace(o,rc),c&&(i=i.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),i):null}function rc(i){return i=i.charCodeAt(0),"%"+(i>>4&15).toString(16)+(i&15).toString(16)}var jr=/[#\/\?@]/g,sc=/[#\?:]/g,oc=/[#\?]/g,ac=/[#\?@]/g,cc=/#/g;function Dt(i,o){this.h=this.g=null,this.i=i||null,this.j=!!o}function je(i){i.g||(i.g=new Map,i.h=0,i.i&&ic(i.i,function(o,c){i.add(decodeURIComponent(o.replace(/\+/g," ")),c)}))}t=Dt.prototype,t.add=function(i,o){je(this),this.i=null,i=ht(this,i);var c=this.g.get(i);return c||this.g.set(i,c=[]),c.push(o),this.h+=1,this};function $r(i,o){je(i),o=ht(i,o),i.g.has(o)&&(i.i=null,i.h-=i.g.get(o).length,i.g.delete(o))}function Vr(i,o){return je(i),o=ht(i,o),i.g.has(o)}t.forEach=function(i,o){je(this),this.g.forEach(function(c,u){c.forEach(function(w){i.call(o,w,u,this)},this)},this)},t.na=function(){je(this);const i=Array.from(this.g.values()),o=Array.from(this.g.keys()),c=[];for(let u=0;u<o.length;u++){const w=i[u];for(let E=0;E<w.length;E++)c.push(o[u])}return c},t.V=function(i){je(this);let o=[];if(typeof i=="string")Vr(this,i)&&(o=o.concat(this.g.get(ht(this,i))));else{i=Array.from(this.g.values());for(let c=0;c<i.length;c++)o=o.concat(i[c])}return o},t.set=function(i,o){return je(this),this.i=null,i=ht(this,i),Vr(this,i)&&(this.h-=this.g.get(i).length),this.g.set(i,[o]),this.h+=1,this},t.get=function(i,o){return i?(i=this.V(i),0<i.length?String(i[0]):o):o};function Br(i,o,c){$r(i,o),0<c.length&&(i.i=null,i.g.set(ht(i,o),x(c)),i.h+=c.length)}t.toString=function(){if(this.i)return this.i;if(!this.g)return"";const i=[],o=Array.from(this.g.keys());for(var c=0;c<o.length;c++){var u=o[c];const E=encodeURIComponent(String(u)),T=this.V(u);for(u=0;u<T.length;u++){var w=E;T[u]!==""&&(w+="="+encodeURIComponent(String(T[u]))),i.push(w)}}return this.i=i.join("&")};function ht(i,o){return o=String(o),i.j&&(o=o.toLowerCase()),o}function lc(i,o){o&&!i.j&&(je(i),i.i=null,i.g.forEach(function(c,u){var w=u.toLowerCase();u!=w&&($r(this,u),Br(this,w,c))},i)),i.j=o}function uc(i,o){const c=new kt;if(h.Image){const u=new Image;u.onload=N($e,c,"TestLoadImage: loaded",!0,o,u),u.onerror=N($e,c,"TestLoadImage: error",!1,o,u),u.onabort=N($e,c,"TestLoadImage: abort",!1,o,u),u.ontimeout=N($e,c,"TestLoadImage: timeout",!1,o,u),h.setTimeout(function(){u.ontimeout&&u.ontimeout()},1e4),u.src=i}else o(!1)}function hc(i,o){const c=new kt,u=new AbortController,w=setTimeout(()=>{u.abort(),$e(c,"TestPingServer: timeout",!1,o)},1e4);fetch(i,{signal:u.signal}).then(E=>{clearTimeout(w),E.ok?$e(c,"TestPingServer: ok",!0,o):$e(c,"TestPingServer: server error",!1,o)}).catch(()=>{clearTimeout(w),$e(c,"TestPingServer: error",!1,o)})}function $e(i,o,c,u,w){try{w&&(w.onload=null,w.onerror=null,w.onabort=null,w.ontimeout=null),u(c)}catch{}}function dc(){this.g=new Ga}function fc(i,o,c){const u=c||"";try{Ur(i,function(w,E){let T=w;I(w)&&(T=ii(w)),o.push(u+E+"="+encodeURIComponent(T))})}catch(w){throw o.push(u+"type="+encodeURIComponent("_badmap")),w}}function dn(i){this.l=i.Ub||null,this.j=i.eb||!1}k(dn,ri),dn.prototype.g=function(){return new fn(this.l,this.j)},dn.prototype.i=function(i){return function(){return i}}({});function fn(i,o){Q.call(this),this.D=i,this.o=o,this.m=void 0,this.status=this.readyState=0,this.responseType=this.responseText=this.response=this.statusText="",this.onreadystatechange=null,this.u=new Headers,this.h=null,this.B="GET",this.A="",this.g=!1,this.v=this.j=this.l=null}k(fn,Q),t=fn.prototype,t.open=function(i,o){if(this.readyState!=0)throw this.abort(),Error("Error reopening a connection");this.B=i,this.A=o,this.readyState=1,Lt(this)},t.send=function(i){if(this.readyState!=1)throw this.abort(),Error("need to call open() first. ");this.g=!0;const o={headers:this.u,method:this.B,credentials:this.m,cache:void 0};i&&(o.body=i),(this.D||h).fetch(new Request(this.A,o)).then(this.Sa.bind(this),this.ga.bind(this))},t.abort=function(){this.response=this.responseText="",this.u=new Headers,this.status=0,this.j&&this.j.cancel("Request was aborted.").catch(()=>{}),1<=this.readyState&&this.g&&this.readyState!=4&&(this.g=!1,Nt(this)),this.readyState=0},t.Sa=function(i){if(this.g&&(this.l=i,this.h||(this.status=this.l.status,this.statusText=this.l.statusText,this.h=i.headers,this.readyState=2,Lt(this)),this.g&&(this.readyState=3,Lt(this),this.g)))if(this.responseType==="arraybuffer")i.arrayBuffer().then(this.Qa.bind(this),this.ga.bind(this));else if(typeof h.ReadableStream<"u"&&"body"in i){if(this.j=i.body.getReader(),this.o){if(this.responseType)throw Error('responseType must be empty for "streamBinaryChunks" mode responses.');this.response=[]}else this.response=this.responseText="",this.v=new TextDecoder;Hr(this)}else i.text().then(this.Ra.bind(this),this.ga.bind(this))};function Hr(i){i.j.read().then(i.Pa.bind(i)).catch(i.ga.bind(i))}t.Pa=function(i){if(this.g){if(this.o&&i.value)this.response.push(i.value);else if(!this.o){var o=i.value?i.value:new Uint8Array(0);(o=this.v.decode(o,{stream:!i.done}))&&(this.response=this.responseText+=o)}i.done?Nt(this):Lt(this),this.readyState==3&&Hr(this)}},t.Ra=function(i){this.g&&(this.response=this.responseText=i,Nt(this))},t.Qa=function(i){this.g&&(this.response=i,Nt(this))},t.ga=function(){this.g&&Nt(this)};function Nt(i){i.readyState=4,i.l=null,i.j=null,i.v=null,Lt(i)}t.setRequestHeader=function(i,o){this.u.append(i,o)},t.getResponseHeader=function(i){return this.h&&this.h.get(i.toLowerCase())||""},t.getAllResponseHeaders=function(){if(!this.h)return"";const i=[],o=this.h.entries();for(var c=o.next();!c.done;)c=c.value,i.push(c[0]+": "+c[1]),c=o.next();return i.join(`\r
`)};function Lt(i){i.onreadystatechange&&i.onreadystatechange.call(i)}Object.defineProperty(fn.prototype,"withCredentials",{get:function(){return this.m==="include"},set:function(i){this.m=i?"include":"same-origin"}});function Wr(i){let o="";return Y(i,function(c,u){o+=u,o+=":",o+=c,o+=`\r
`}),o}function mi(i,o,c){e:{for(u in c){var u=!1;break e}u=!0}u||(c=Wr(c),typeof i=="string"?c!=null&&encodeURIComponent(String(c)):F(i,o,c))}function j(i){Q.call(this),this.headers=new Map,this.o=i||null,this.h=!1,this.v=this.g=null,this.D="",this.m=0,this.l="",this.j=this.B=this.u=this.A=!1,this.I=null,this.H="",this.J=!1}k(j,Q);var pc=/^https?$/i,gc=["POST","PUT"];t=j.prototype,t.Ha=function(i){this.J=i},t.ea=function(i,o,c,u){if(this.g)throw Error("[goog.net.XhrIo] Object is active with another request="+this.D+"; newUri="+i);o=o?o.toUpperCase():"GET",this.D=i,this.l="",this.m=0,this.A=!1,this.h=!0,this.g=this.o?this.o.g():li.g(),this.v=this.o?Ir(this.o):Ir(li),this.g.onreadystatechange=P(this.Ea,this);try{this.B=!0,this.g.open(o,String(i),!0),this.B=!1}catch(E){zr(this,E);return}if(i=c||"",c=new Map(this.headers),u)if(Object.getPrototypeOf(u)===Object.prototype)for(var w in u)c.set(w,u[w]);else if(typeof u.keys=="function"&&typeof u.get=="function")for(const E of u.keys())c.set(E,u.get(E));else throw Error("Unknown input type for opt_headers: "+String(u));u=Array.from(c.keys()).find(E=>E.toLowerCase()=="content-type"),w=h.FormData&&i instanceof h.FormData,!(0<=Array.prototype.indexOf.call(gc,o,void 0))||u||w||c.set("Content-Type","application/x-www-form-urlencoded;charset=utf-8");for(const[E,T]of c)this.g.setRequestHeader(E,T);this.H&&(this.g.responseType=this.H),"withCredentials"in this.g&&this.g.withCredentials!==this.J&&(this.g.withCredentials=this.J);try{Kr(this),this.u=!0,this.g.send(i),this.u=!1}catch(E){zr(this,E)}};function zr(i,o){i.h=!1,i.g&&(i.j=!0,i.g.abort(),i.j=!1),i.l=o,i.m=5,Gr(i),pn(i)}function Gr(i){i.A||(i.A=!0,ie(i,"complete"),ie(i,"error"))}t.abort=function(i){this.g&&this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1,this.m=i||7,ie(this,"complete"),ie(this,"abort"),pn(this))},t.N=function(){this.g&&(this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1),pn(this,!0)),j.aa.N.call(this)},t.Ea=function(){this.s||(this.B||this.u||this.j?qr(this):this.bb())},t.bb=function(){qr(this)};function qr(i){if(i.h&&typeof l<"u"&&(!i.v[1]||Re(i)!=4||i.Z()!=2)){if(i.u&&Re(i)==4)yr(i.Ea,0,i);else if(ie(i,"readystatechange"),Re(i)==4){i.h=!1;try{const T=i.Z();e:switch(T){case 200:case 201:case 202:case 204:case 206:case 304:case 1223:var o=!0;break e;default:o=!1}var c;if(!(c=o)){var u;if(u=T===0){var w=String(i.D).match(Fr)[1]||null;!w&&h.self&&h.self.location&&(w=h.self.location.protocol.slice(0,-1)),u=!pc.test(w?w.toLowerCase():"")}c=u}if(c)ie(i,"complete"),ie(i,"success");else{i.m=6;try{var E=2<Re(i)?i.g.statusText:""}catch{E=""}i.l=E+" ["+i.Z()+"]",Gr(i)}}finally{pn(i)}}}}function pn(i,o){if(i.g){Kr(i);const c=i.g,u=i.v[0]?()=>{}:null;i.g=null,i.v=null,o||ie(i,"ready");try{c.onreadystatechange=u}catch{}}}function Kr(i){i.I&&(h.clearTimeout(i.I),i.I=null)}t.isActive=function(){return!!this.g};function Re(i){return i.g?i.g.readyState:0}t.Z=function(){try{return 2<Re(this)?this.g.status:-1}catch{return-1}},t.oa=function(){try{return this.g?this.g.responseText:""}catch{return""}},t.Oa=function(i){if(this.g){var o=this.g.responseText;return i&&o.indexOf(i)==0&&(o=o.substring(i.length)),za(o)}};function Jr(i){try{if(!i.g)return null;if("response"in i.g)return i.g.response;switch(i.H){case"":case"text":return i.g.responseText;case"arraybuffer":if("mozResponseArrayBuffer"in i.g)return i.g.mozResponseArrayBuffer}return null}catch{return null}}function mc(i){const o={};i=(i.g&&2<=Re(i)&&i.g.getAllResponseHeaders()||"").split(`\r
`);for(let u=0;u<i.length;u++){if(te(i[u]))continue;var c=v(i[u]);const w=c[0];if(c=c[1],typeof c!="string")continue;c=c.trim();const E=o[w]||[];o[w]=E,E.push(c)}m(o,function(u){return u.join(", ")})}t.Ba=function(){return this.m},t.Ka=function(){return typeof this.l=="string"?this.l:String(this.l)};function Mt(i,o,c){return c&&c.internalChannelParams&&c.internalChannelParams[i]||o}function Yr(i){this.Aa=0,this.i=[],this.j=new kt,this.ia=this.qa=this.I=this.W=this.g=this.ya=this.D=this.H=this.m=this.S=this.o=null,this.Ya=this.U=0,this.Va=Mt("failFast",!1,i),this.F=this.C=this.u=this.s=this.l=null,this.X=!0,this.za=this.T=-1,this.Y=this.v=this.B=0,this.Ta=Mt("baseRetryDelayMs",5e3,i),this.cb=Mt("retryDelaySeedMs",1e4,i),this.Wa=Mt("forwardChannelMaxRetries",2,i),this.wa=Mt("forwardChannelRequestTimeoutMs",2e4,i),this.pa=i&&i.xmlHttpFactory||void 0,this.Xa=i&&i.Tb||void 0,this.Ca=i&&i.useFetchStreams||!1,this.L=void 0,this.J=i&&i.supportsCrossDomainXhr||!1,this.K="",this.h=new Or(i&&i.concurrentRequestLimit),this.Da=new dc,this.P=i&&i.fastHandshake||!1,this.O=i&&i.encodeInitMessageHeaders||!1,this.P&&this.O&&(this.O=!1),this.Ua=i&&i.Rb||!1,i&&i.xa&&this.j.xa(),i&&i.forceLongPolling&&(this.X=!1),this.ba=!this.P&&this.X&&i&&i.detectBufferingProxy||!1,this.ja=void 0,i&&i.longPollingTimeout&&0<i.longPollingTimeout&&(this.ja=i.longPollingTimeout),this.ca=void 0,this.R=0,this.M=!1,this.ka=this.A=null}t=Yr.prototype,t.la=8,t.G=1,t.connect=function(i,o,c,u){re(0),this.W=i,this.H=o||{},c&&u!==void 0&&(this.H.OSID=c,this.H.OAID=u),this.F=this.X,this.I=ss(this,null,this.W),mn(this)};function yi(i){if(Xr(i),i.G==3){var o=i.U++,c=ke(i.I);if(F(c,"SID",i.K),F(c,"RID",o),F(c,"TYPE","terminate"),Ut(i,c),o=new xe(i,i.j,o),o.L=2,o.v=hn(ke(c)),c=!1,h.navigator&&h.navigator.sendBeacon)try{c=h.navigator.sendBeacon(o.v.toString(),"")}catch{}!c&&h.Image&&(new Image().src=o.v,c=!0),c||(o.g=os(o.j,null),o.g.ea(o.v)),o.F=Date.now(),cn(o)}rs(i)}function gn(i){i.g&&(_i(i),i.g.cancel(),i.g=null)}function Xr(i){gn(i),i.u&&(h.clearTimeout(i.u),i.u=null),yn(i),i.h.cancel(),i.s&&(typeof i.s=="number"&&h.clearTimeout(i.s),i.s=null)}function mn(i){if(!Dr(i.h)&&!i.s){i.s=!0;var o=i.Ga;Fe||V(),Je||(Fe(),Je=!0),Ye.add(o,i),i.B=0}}function yc(i,o){return Nr(i.h)>=i.h.j-(i.s?1:0)?!1:i.s?(i.i=o.D.concat(i.i),!0):i.G==1||i.G==2||i.B>=(i.Va?0:i.Wa)?!1:(i.s=Pt(P(i.Ga,i,o),is(i,i.B)),i.B++,!0)}t.Ga=function(i){if(this.s)if(this.s=null,this.G==1){if(!i){this.U=Math.floor(1e5*Math.random()),i=this.U++;const w=new xe(this,this.j,i);let E=this.o;if(this.S&&(E?(E=d(E),y(E,this.S)):E=this.S),this.m!==null||this.O||(w.H=E,E=null),this.P)e:{for(var o=0,c=0;c<this.i.length;c++){t:{var u=this.i[c];if("__data__"in u.map&&(u=u.map.__data__,typeof u=="string")){u=u.length;break t}u=void 0}if(u===void 0)break;if(o+=u,4096<o){o=c;break e}if(o===4096||c===this.i.length-1){o=c+1;break e}}o=1e3}else o=1e3;o=Zr(this,w,o),c=ke(this.I),F(c,"RID",i),F(c,"CVER",22),this.D&&F(c,"X-HTTP-Session-Id",this.D),Ut(this,c),E&&(this.O?o="headers="+encodeURIComponent(String(Wr(E)))+"&"+o:this.m&&mi(c,this.m,E)),gi(this.h,w),this.Ua&&F(c,"TYPE","init"),this.P?(F(c,"$req",o),F(c,"SID","null"),w.T=!0,hi(w,c,null)):hi(w,c,o),this.G=2}}else this.G==3&&(i?Qr(this,i):this.i.length==0||Dr(this.h)||Qr(this))};function Qr(i,o){var c;o?c=o.l:c=i.U++;const u=ke(i.I);F(u,"SID",i.K),F(u,"RID",c),F(u,"AID",i.T),Ut(i,u),i.m&&i.o&&mi(u,i.m,i.o),c=new xe(i,i.j,c,i.B+1),i.m===null&&(c.H=i.o),o&&(i.i=o.D.concat(i.i)),o=Zr(i,c,1e3),c.I=Math.round(.5*i.wa)+Math.round(.5*i.wa*Math.random()),gi(i.h,c),hi(c,u,o)}function Ut(i,o){i.H&&Y(i.H,function(c,u){F(o,u,c)}),i.l&&Ur({},function(c,u){F(o,u,c)})}function Zr(i,o,c){c=Math.min(i.i.length,c);var u=i.l?P(i.l.Na,i.l,i):null;e:{var w=i.i;let E=-1;for(;;){const T=["count="+c];E==-1?0<c?(E=w[0].g,T.push("ofs="+E)):E=0:T.push("ofs="+E);let L=!0;for(let q=0;q<c;q++){let C=w[q].g;const Z=w[q].map;if(C-=E,0>C)E=Math.max(0,w[q].g-100),L=!1;else try{fc(Z,T,"req"+C+"_")}catch{u&&u(Z)}}if(L){u=T.join("&");break e}}}return i=i.i.splice(0,c),o.D=i,u}function es(i){if(!i.g&&!i.u){i.Y=1;var o=i.Fa;Fe||V(),Je||(Fe(),Je=!0),Ye.add(o,i),i.v=0}}function vi(i){return i.g||i.u||3<=i.v?!1:(i.Y++,i.u=Pt(P(i.Fa,i),is(i,i.v)),i.v++,!0)}t.Fa=function(){if(this.u=null,ts(this),this.ba&&!(this.M||this.g==null||0>=this.R)){var i=2*this.R;this.j.info("BP detection timer enabled: "+i),this.A=Pt(P(this.ab,this),i)}},t.ab=function(){this.A&&(this.A=null,this.j.info("BP detection timeout reached."),this.j.info("Buffering proxy detected and switch to long-polling!"),this.F=!1,this.M=!0,re(10),gn(this),ts(this))};function _i(i){i.A!=null&&(h.clearTimeout(i.A),i.A=null)}function ts(i){i.g=new xe(i,i.j,"rpc",i.Y),i.m===null&&(i.g.H=i.o),i.g.O=0;var o=ke(i.qa);F(o,"RID","rpc"),F(o,"SID",i.K),F(o,"AID",i.T),F(o,"CI",i.F?"0":"1"),!i.F&&i.ja&&F(o,"TO",i.ja),F(o,"TYPE","xmlhttp"),Ut(i,o),i.m&&i.o&&mi(o,i.m,i.o),i.L&&(i.g.I=i.L);var c=i.g;i=i.ia,c.L=1,c.v=hn(ke(o)),c.m=null,c.P=!0,kr(c,i)}t.Za=function(){this.C!=null&&(this.C=null,gn(this),vi(this),re(19))};function yn(i){i.C!=null&&(h.clearTimeout(i.C),i.C=null)}function ns(i,o){var c=null;if(i.g==o){yn(i),_i(i),i.g=null;var u=2}else if(pi(i.h,o))c=o.D,Lr(i.h,o),u=1;else return;if(i.G!=0){if(o.o)if(u==1){c=o.m?o.m.length:0,o=Date.now()-o.F;var w=i.B;u=ai(),ie(u,new Ar(u,c)),mn(i)}else es(i);else if(w=o.s,w==3||w==0&&0<o.X||!(u==1&&yc(i,o)||u==2&&vi(i)))switch(c&&0<c.length&&(o=i.h,o.i=o.i.concat(c)),w){case 1:Ze(i,5);break;case 4:Ze(i,10);break;case 3:Ze(i,6);break;default:Ze(i,2)}}}function is(i,o){let c=i.Ta+Math.floor(Math.random()*i.cb);return i.isActive()||(c*=2),c*o}function Ze(i,o){if(i.j.info("Error code "+o),o==2){var c=P(i.fb,i),u=i.Xa;const w=!u;u=new Qe(u||"//www.google.com/images/cleardot.gif"),h.location&&h.location.protocol=="http"||ln(u,"https"),hn(u),w?uc(u.toString(),c):hc(u.toString(),c)}else re(2);i.G=0,i.l&&i.l.sa(o),rs(i),Xr(i)}t.fb=function(i){i?(this.j.info("Successfully pinged google.com"),re(2)):(this.j.info("Failed to ping google.com"),re(1))};function rs(i){if(i.G=0,i.ka=[],i.l){const o=Mr(i.h);(o.length!=0||i.i.length!=0)&&(M(i.ka,o),M(i.ka,i.i),i.h.i.length=0,x(i.i),i.i.length=0),i.l.ra()}}function ss(i,o,c){var u=c instanceof Qe?ke(c):new Qe(c);if(u.g!="")o&&(u.g=o+"."+u.g),un(u,u.s);else{var w=h.location;u=w.protocol,o=o?o+"."+w.hostname:w.hostname,w=+w.port;var E=new Qe(null);u&&ln(E,u),o&&(E.g=o),w&&un(E,w),c&&(E.l=c),u=E}return c=i.D,o=i.ya,c&&o&&F(u,c,o),F(u,"VER",i.la),Ut(i,u),u}function os(i,o,c){if(o&&!i.J)throw Error("Can't create secondary domain capable XhrIo object.");return o=i.Ca&&!i.pa?new j(new dn({eb:c})):new j(i.pa),o.Ha(i.J),o}t.isActive=function(){return!!this.l&&this.l.isActive(this)};function as(){}t=as.prototype,t.ua=function(){},t.ta=function(){},t.sa=function(){},t.ra=function(){},t.isActive=function(){return!0},t.Na=function(){};function pe(i,o){Q.call(this),this.g=new Yr(o),this.l=i,this.h=o&&o.messageUrlParams||null,i=o&&o.messageHeaders||null,o&&o.clientProtocolHeaderRequired&&(i?i["X-Client-Protocol"]="webchannel":i={"X-Client-Protocol":"webchannel"}),this.g.o=i,i=o&&o.initMessageHeaders||null,o&&o.messageContentType&&(i?i["X-WebChannel-Content-Type"]=o.messageContentType:i={"X-WebChannel-Content-Type":o.messageContentType}),o&&o.va&&(i?i["X-WebChannel-Client-Profile"]=o.va:i={"X-WebChannel-Client-Profile":o.va}),this.g.S=i,(i=o&&o.Sb)&&!te(i)&&(this.g.m=i),this.v=o&&o.supportsCrossDomainXhr||!1,this.u=o&&o.sendRawJson||!1,(o=o&&o.httpSessionIdParam)&&!te(o)&&(this.g.D=o,i=this.h,i!==null&&o in i&&(i=this.h,o in i&&delete i[o])),this.j=new dt(this)}k(pe,Q),pe.prototype.m=function(){this.g.l=this.j,this.v&&(this.g.J=!0),this.g.connect(this.l,this.h||void 0)},pe.prototype.close=function(){yi(this.g)},pe.prototype.o=function(i){var o=this.g;if(typeof i=="string"){var c={};c.__data__=i,i=c}else this.u&&(c={},c.__data__=ii(i),i=c);o.i.push(new ec(o.Ya++,i)),o.G==3&&mn(o)},pe.prototype.N=function(){this.g.l=null,delete this.j,yi(this.g),delete this.g,pe.aa.N.call(this)};function cs(i){si.call(this),i.__headers__&&(this.headers=i.__headers__,this.statusCode=i.__status__,delete i.__headers__,delete i.__status__);var o=i.__sm__;if(o){e:{for(const c in o){i=c;break e}i=void 0}(this.i=i)&&(i=this.i,o=o!==null&&i in o?o[i]:void 0),this.data=o}else this.data=i}k(cs,si);function ls(){oi.call(this),this.status=1}k(ls,oi);function dt(i){this.g=i}k(dt,as),dt.prototype.ua=function(){ie(this.g,"a")},dt.prototype.ta=function(i){ie(this.g,new cs(i))},dt.prototype.sa=function(i){ie(this.g,new ls)},dt.prototype.ra=function(){ie(this.g,"b")},pe.prototype.send=pe.prototype.o,pe.prototype.open=pe.prototype.m,pe.prototype.close=pe.prototype.close,ci.NO_ERROR=0,ci.TIMEOUT=8,ci.HTTP_ERROR=6,Qa.COMPLETE="complete",qa.EventType=At,At.OPEN="a",At.CLOSE="b",At.ERROR="c",At.MESSAGE="d",Q.prototype.listen=Q.prototype.K,j.prototype.listenOnce=j.prototype.L,j.prototype.getLastError=j.prototype.Ka,j.prototype.getLastErrorCode=j.prototype.Ba,j.prototype.getStatus=j.prototype.Z,j.prototype.getResponseJson=j.prototype.Oa,j.prototype.getResponseText=j.prototype.oa,j.prototype.send=j.prototype.ea,j.prototype.setWithCredentials=j.prototype.Ha}).apply(typeof wn<"u"?wn:typeof self<"u"?self:typeof window<"u"?window:{});const Bs="@firebase/firestore";/**
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
 */class se{constructor(e){this.uid=e}isAuthenticated(){return this.uid!=null}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}}se.UNAUTHENTICATED=new se(null),se.GOOGLE_CREDENTIALS=new se("google-credentials-uid"),se.FIRST_PARTY=new se("first-party-uid"),se.MOCK_USER=new se("mock-user");/**
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
 */let tn="10.14.0";/**
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
 */const vt=new Fn("@firebase/firestore");function _e(t,...e){if(vt.logLevel<=O.DEBUG){const n=e.map(ir);vt.debug(`Firestore (${tn}): ${t}`,...n)}}function da(t,...e){if(vt.logLevel<=O.ERROR){const n=e.map(ir);vt.error(`Firestore (${tn}): ${t}`,...n)}}function Bd(t,...e){if(vt.logLevel<=O.WARN){const n=e.map(ir);vt.warn(`Firestore (${tn}): ${t}`,...n)}}function ir(t){if(typeof t=="string")return t;try{/**
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
*/return function(n){return JSON.stringify(n)}(t)}catch{return t}}/**
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
 */function rr(t="Unexpected state"){const e=`FIRESTORE (${tn}) INTERNAL ASSERTION FAILED: `+t;throw da(e),new Error(e)}function Bt(t,e){t||rr()}/**
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
 */const ce={CANCELLED:"cancelled",INVALID_ARGUMENT:"invalid-argument",FAILED_PRECONDITION:"failed-precondition"};class le extends Ie{constructor(e,n){super(e,n),this.code=e,this.message=n,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}}/**
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
 */class Ht{constructor(){this.promise=new Promise((e,n)=>{this.resolve=e,this.reject=n})}}/**
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
 */class fa{constructor(e,n){this.user=n,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}}class Hd{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,n){e.enqueueRetryable(()=>n(se.UNAUTHENTICATED))}shutdown(){}}class Wd{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,n){this.changeListener=n,e.enqueueRetryable(()=>n(this.token.user))}shutdown(){this.changeListener=null}}class zd{constructor(e){this.t=e,this.currentUser=se.UNAUTHENTICATED,this.i=0,this.forceRefresh=!1,this.auth=null}start(e,n){Bt(this.o===void 0);let r=this.i;const s=g=>this.i!==r?(r=this.i,n(g)):Promise.resolve();let a=new Ht;this.o=()=>{this.i++,this.currentUser=this.u(),a.resolve(),a=new Ht,e.enqueueRetryable(()=>s(this.currentUser))};const l=()=>{const g=a;e.enqueueRetryable(async()=>{await g.promise,await s(this.currentUser)})},h=g=>{_e("FirebaseAuthCredentialsProvider","Auth detected"),this.auth=g,this.o&&(this.auth.addAuthTokenListener(this.o),l())};this.t.onInit(g=>h(g)),setTimeout(()=>{if(!this.auth){const g=this.t.getImmediate({optional:!0});g?h(g):(_e("FirebaseAuthCredentialsProvider","Auth not yet detected"),a.resolve(),a=new Ht)}},0),l()}getToken(){const e=this.i,n=this.forceRefresh;return this.forceRefresh=!1,this.auth?this.auth.getToken(n).then(r=>this.i!==e?(_e("FirebaseAuthCredentialsProvider","getToken aborted due to token change."),this.getToken()):r?(Bt(typeof r.accessToken=="string"),new fa(r.accessToken,this.currentUser)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.auth&&this.o&&this.auth.removeAuthTokenListener(this.o),this.o=void 0}u(){const e=this.auth&&this.auth.getUid();return Bt(e===null||typeof e=="string"),new se(e)}}class Gd{constructor(e,n,r){this.l=e,this.h=n,this.P=r,this.type="FirstParty",this.user=se.FIRST_PARTY,this.I=new Map}T(){return this.P?this.P():null}get headers(){this.I.set("X-Goog-AuthUser",this.l);const e=this.T();return e&&this.I.set("Authorization",e),this.h&&this.I.set("X-Goog-Iam-Authorization-Token",this.h),this.I}}class qd{constructor(e,n,r){this.l=e,this.h=n,this.P=r}getToken(){return Promise.resolve(new Gd(this.l,this.h,this.P))}start(e,n){e.enqueueRetryable(()=>n(se.FIRST_PARTY))}shutdown(){}invalidateToken(){}}class Kd{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}}class Jd{constructor(e){this.A=e,this.forceRefresh=!1,this.appCheck=null,this.R=null}start(e,n){Bt(this.o===void 0);const r=a=>{a.error!=null&&_e("FirebaseAppCheckTokenProvider",`Error getting App Check token; using placeholder token instead. Error: ${a.error.message}`);const l=a.token!==this.R;return this.R=a.token,_e("FirebaseAppCheckTokenProvider",`Received ${l?"new":"existing"} token.`),l?n(a.token):Promise.resolve()};this.o=a=>{e.enqueueRetryable(()=>r(a))};const s=a=>{_e("FirebaseAppCheckTokenProvider","AppCheck detected"),this.appCheck=a,this.o&&this.appCheck.addTokenListener(this.o)};this.A.onInit(a=>s(a)),setTimeout(()=>{if(!this.appCheck){const a=this.A.getImmediate({optional:!0});a?s(a):_e("FirebaseAppCheckTokenProvider","AppCheck not yet detected")}},0)}getToken(){const e=this.forceRefresh;return this.forceRefresh=!1,this.appCheck?this.appCheck.getToken(e).then(n=>n?(Bt(typeof n.token=="string"),this.R=n.token,new Kd(n.token)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.appCheck&&this.o&&this.appCheck.removeTokenListener(this.o),this.o=void 0}}function Yd(t){return t.name==="IndexedDbTransactionError"}class Nn{constructor(e,n){this.projectId=e,this.database=n||"(default)"}static empty(){return new Nn("","")}get isDefaultDatabase(){return this.database==="(default)"}isEqual(e){return e instanceof Nn&&e.projectId===this.projectId&&e.database===this.database}}/**
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
 */var Hs,R;(R=Hs||(Hs={}))[R.OK=0]="OK",R[R.CANCELLED=1]="CANCELLED",R[R.UNKNOWN=2]="UNKNOWN",R[R.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",R[R.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",R[R.NOT_FOUND=5]="NOT_FOUND",R[R.ALREADY_EXISTS=6]="ALREADY_EXISTS",R[R.PERMISSION_DENIED=7]="PERMISSION_DENIED",R[R.UNAUTHENTICATED=16]="UNAUTHENTICATED",R[R.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",R[R.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",R[R.ABORTED=10]="ABORTED",R[R.OUT_OF_RANGE=11]="OUT_OF_RANGE",R[R.UNIMPLEMENTED=12]="UNIMPLEMENTED",R[R.INTERNAL=13]="INTERNAL",R[R.UNAVAILABLE=14]="UNAVAILABLE",R[R.DATA_LOSS=15]="DATA_LOSS";/**
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
 */new ha([4294967295,4294967295],0);function Ri(){return typeof document<"u"?document:null}/**
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
 */class Xd{constructor(e,n,r=1e3,s=1.5,a=6e4){this.ui=e,this.timerId=n,this.ko=r,this.qo=s,this.Qo=a,this.Ko=0,this.$o=null,this.Uo=Date.now(),this.reset()}reset(){this.Ko=0}Wo(){this.Ko=this.Qo}Go(e){this.cancel();const n=Math.floor(this.Ko+this.zo()),r=Math.max(0,Date.now()-this.Uo),s=Math.max(0,n-r);s>0&&_e("ExponentialBackoff",`Backing off for ${s} ms (base delay: ${this.Ko} ms, delay with jitter: ${n} ms, last attempt: ${r} ms ago)`),this.$o=this.ui.enqueueAfterDelay(this.timerId,s,()=>(this.Uo=Date.now(),e())),this.Ko*=this.qo,this.Ko<this.ko&&(this.Ko=this.ko),this.Ko>this.Qo&&(this.Ko=this.Qo)}jo(){this.$o!==null&&(this.$o.skipDelay(),this.$o=null)}cancel(){this.$o!==null&&(this.$o.cancel(),this.$o=null)}zo(){return(Math.random()-.5)*this.Ko}}/**
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
 */class sr{constructor(e,n,r,s,a){this.asyncQueue=e,this.timerId=n,this.targetTimeMs=r,this.op=s,this.removalCallback=a,this.deferred=new Ht,this.then=this.deferred.promise.then.bind(this.deferred.promise),this.deferred.promise.catch(l=>{})}get promise(){return this.deferred.promise}static createAndSchedule(e,n,r,s,a){const l=Date.now()+r,h=new sr(e,n,l,s,a);return h.start(r),h}start(e){this.timerHandle=setTimeout(()=>this.handleDelayElapsed(),e)}skipDelay(){return this.handleDelayElapsed()}cancel(e){this.timerHandle!==null&&(this.clearTimeout(),this.deferred.reject(new le(ce.CANCELLED,"Operation cancelled"+(e?": "+e:""))))}handleDelayElapsed(){this.asyncQueue.enqueueAndForget(()=>this.timerHandle!==null?(this.clearTimeout(),this.op().then(e=>this.deferred.resolve(e))):Promise.resolve())}clearTimeout(){this.timerHandle!==null&&(this.removalCallback(this),clearTimeout(this.timerHandle),this.timerHandle=null)}}var Ws,zs;(zs=Ws||(Ws={})).ea="default",zs.Cache="cache";/**
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
 */function Qd(t){const e={};return t.timeoutSeconds!==void 0&&(e.timeoutSeconds=t.timeoutSeconds),e}/**
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
 */const Gs=new Map;function Zd(t,e,n,r){if(e===!0&&r===!0)throw new le(ce.INVALID_ARGUMENT,`${t} and ${n} cannot be used together.`)}function ef(t){if(t===void 0)return"undefined";if(t===null)return"null";if(typeof t=="string")return t.length>20&&(t=`${t.substring(0,20)}...`),JSON.stringify(t);if(typeof t=="number"||typeof t=="boolean")return""+t;if(typeof t=="object"){if(t instanceof Array)return"an array";{const e=function(r){return r.constructor?r.constructor.name:null}(t);return e?`a custom ${e} object`:"an object"}}return typeof t=="function"?"a function":rr()}function tf(t,e){if("_delegate"in t&&(t=t._delegate),!(t instanceof e)){if(e.name===t.constructor.name)throw new le(ce.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{const n=ef(t);throw new le(ce.INVALID_ARGUMENT,`Expected type '${e.name}', but it was: ${n}`)}}return t}/**
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
 */class qs{constructor(e){var n,r;if(e.host===void 0){if(e.ssl!==void 0)throw new le(ce.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host="firestore.googleapis.com",this.ssl=!0}else this.host=e.host,this.ssl=(n=e.ssl)===null||n===void 0||n;if(this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,e.cacheSizeBytes===void 0)this.cacheSizeBytes=41943040;else{if(e.cacheSizeBytes!==-1&&e.cacheSizeBytes<1048576)throw new le(ce.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}Zd("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:e.experimentalAutoDetectLongPolling===void 0?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=Qd((r=e.experimentalLongPollingOptions)!==null&&r!==void 0?r:{}),function(a){if(a.timeoutSeconds!==void 0){if(isNaN(a.timeoutSeconds))throw new le(ce.INVALID_ARGUMENT,`invalid long polling timeout: ${a.timeoutSeconds} (must not be NaN)`);if(a.timeoutSeconds<5)throw new le(ce.INVALID_ARGUMENT,`invalid long polling timeout: ${a.timeoutSeconds} (minimum allowed value is 5)`);if(a.timeoutSeconds>30)throw new le(ce.INVALID_ARGUMENT,`invalid long polling timeout: ${a.timeoutSeconds} (maximum allowed value is 30)`)}}(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams}isEqual(e){return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&function(r,s){return r.timeoutSeconds===s.timeoutSeconds}(this.experimentalLongPollingOptions,e.experimentalLongPollingOptions)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams}}class pa{constructor(e,n,r,s){this._authCredentials=e,this._appCheckCredentials=n,this._databaseId=r,this._app=s,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new qs({}),this._settingsFrozen=!1,this._terminateTask="notTerminated"}get app(){if(!this._app)throw new le(ce.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return this._terminateTask!=="notTerminated"}_setSettings(e){if(this._settingsFrozen)throw new le(ce.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new qs(e),e.credentials!==void 0&&(this._authCredentials=function(r){if(!r)return new Hd;switch(r.type){case"firstParty":return new qd(r.sessionIndex||"0",r.iamToken||null,r.authTokenFactory||null);case"provider":return r.client;default:throw new le(ce.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}}(e.credentials))}_getSettings(){return this._settings}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return this._terminateTask==="notTerminated"&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){this._terminateTask==="notTerminated"?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return function(n){const r=Gs.get(n);r&&(_e("ComponentProvider","Removing Datastore"),Gs.delete(n),r.terminate())}(this),Promise.resolve()}}function nf(t,e,n,r={}){var s;const a=(t=tf(t,pa))._getSettings(),l=`${e}:${n}`;if(a.host!=="firestore.googleapis.com"&&a.host!==l&&Bd("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used."),t._setSettings(Object.assign(Object.assign({},a),{host:l,ssl:!1})),r.mockUserToken){let h,g;if(typeof r.mockUserToken=="string")h=r.mockUserToken,g=se.MOCK_USER;else{h=Rc(r.mockUserToken,(s=t._app)===null||s===void 0?void 0:s.options.projectId);const I=r.mockUserToken.sub||r.mockUserToken.user_id;if(!I)throw new le(ce.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");g=new se(I)}t._authCredentials=new Wd(new fa(h,g))}}/**
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
 */class Ks{constructor(e=Promise.resolve()){this.Pu=[],this.Iu=!1,this.Tu=[],this.Eu=null,this.du=!1,this.Au=!1,this.Ru=[],this.t_=new Xd(this,"async_queue_retry"),this.Vu=()=>{const r=Ri();r&&_e("AsyncQueue","Visibility state changed to "+r.visibilityState),this.t_.jo()},this.mu=e;const n=Ri();n&&typeof n.addEventListener=="function"&&n.addEventListener("visibilitychange",this.Vu)}get isShuttingDown(){return this.Iu}enqueueAndForget(e){this.enqueue(e)}enqueueAndForgetEvenWhileRestricted(e){this.fu(),this.gu(e)}enterRestrictedMode(e){if(!this.Iu){this.Iu=!0,this.Au=e||!1;const n=Ri();n&&typeof n.removeEventListener=="function"&&n.removeEventListener("visibilitychange",this.Vu)}}enqueue(e){if(this.fu(),this.Iu)return new Promise(()=>{});const n=new Ht;return this.gu(()=>this.Iu&&this.Au?Promise.resolve():(e().then(n.resolve,n.reject),n.promise)).then(()=>n.promise)}enqueueRetryable(e){this.enqueueAndForget(()=>(this.Pu.push(e),this.pu()))}async pu(){if(this.Pu.length!==0){try{await this.Pu[0](),this.Pu.shift(),this.t_.reset()}catch(e){if(!Yd(e))throw e;_e("AsyncQueue","Operation failed with retryable error: "+e)}this.Pu.length>0&&this.t_.Go(()=>this.pu())}}gu(e){const n=this.mu.then(()=>(this.du=!0,e().catch(r=>{this.Eu=r,this.du=!1;const s=function(l){let h=l.message||"";return l.stack&&(h=l.stack.includes(l.message)?l.stack:l.message+`
`+l.stack),h}(r);throw da("INTERNAL UNHANDLED ERROR: ",s),r}).then(r=>(this.du=!1,r))));return this.mu=n,n}enqueueAfterDelay(e,n,r){this.fu(),this.Ru.indexOf(e)>-1&&(n=0);const s=sr.createAndSchedule(this,e,n,r,a=>this.yu(a));return this.Tu.push(s),s}fu(){this.Eu&&rr()}verifyOperationInProgress(){}async wu(){let e;do e=this.mu,await e;while(e!==this.mu)}Su(e){for(const n of this.Tu)if(n.timerId===e)return!0;return!1}bu(e){return this.wu().then(()=>{this.Tu.sort((n,r)=>n.targetTimeMs-r.targetTimeMs);for(const n of this.Tu)if(n.skipDelay(),e!=="all"&&n.timerId===e)break;return this.wu()})}Du(e){this.Ru.push(e)}yu(e){const n=this.Tu.indexOf(e);this.Tu.splice(n,1)}}class rf extends pa{constructor(e,n,r,s){super(e,n,r,s),this.type="firestore",this._queue=new Ks,this._persistenceKey=(s==null?void 0:s.name)||"[DEFAULT]"}async _terminate(){if(this._firestoreClient){const e=this._firestoreClient.terminate();this._queue=new Ks(e),this._firestoreClient=void 0,await e}}}function sf(t,e){const n=typeof t=="object"?t:zi(),r=typeof t=="string"?t:"(default)",s=ot(n,"firestore").getImmediate({identifier:r});if(!s._initialized){const a=Pc("firestore");a&&nf(s,...a)}return s}(function(e,n=!0){(function(s){tn=s})(It),Te(new we("firestore",(r,{instanceIdentifier:s,options:a})=>{const l=r.getProvider("app").getImmediate(),h=new rf(new zd(r.getProvider("auth-internal")),new Jd(r.getProvider("app-check-internal")),function(I,A){if(!Object.prototype.hasOwnProperty.apply(I.options,["projectId"]))throw new le(ce.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new Nn(I.options.projectId,A)}(l,s),l);return a=Object.assign({useFetchStreams:n},a),h._setSettings(a),h},"PUBLIC").setMultipleInstances(!0)),ge(Bs,"4.7.3",e),ge(Bs,"4.7.3","esm2017")})();const ga="@firebase/installations",or="0.6.9";/**
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
 */const ma=1e4,ya=`w:${or}`,va="FIS_v2",of="https://firebaseinstallations.googleapis.com/v1",af=60*60*1e3,cf="installations",lf="Installations";/**
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
 */const uf={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},it=new st(cf,lf,uf);function _a(t){return t instanceof Ie&&t.code.includes("request-failed")}/**
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
 */function wa({projectId:t}){return`${of}/projects/${t}/installations`}function Ia(t){return{token:t.token,requestStatus:2,expiresIn:df(t.expiresIn),creationTime:Date.now()}}async function Ea(t,e){const r=(await e.json()).error;return it.create("request-failed",{requestName:t,serverCode:r.code,serverMessage:r.message,serverStatus:r.status})}function Ta({apiKey:t}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":t})}function hf(t,{refreshToken:e}){const n=Ta(t);return n.append("Authorization",ff(e)),n}async function ba(t){const e=await t();return e.status>=500&&e.status<600?t():e}function df(t){return Number(t.replace("s","000"))}function ff(t){return`${va} ${t}`}/**
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
 */async function pf({appConfig:t,heartbeatServiceProvider:e},{fid:n}){const r=wa(t),s=Ta(t),a=e.getImmediate({optional:!0});if(a){const I=await a.getHeartbeatsHeader();I&&s.append("x-firebase-client",I)}const l={fid:n,authVersion:va,appId:t.appId,sdkVersion:ya},h={method:"POST",headers:s,body:JSON.stringify(l)},g=await ba(()=>fetch(r,h));if(g.ok){const I=await g.json();return{fid:I.fid||n,registrationStatus:2,refreshToken:I.refreshToken,authToken:Ia(I.authToken)}}else throw await Ea("Create Installation",g)}/**
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
 */function Aa(t){return new Promise(e=>{setTimeout(e,t)})}/**
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
 */function gf(t){return btoa(String.fromCharCode(...t)).replace(/\+/g,"-").replace(/\//g,"_")}/**
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
 */const mf=/^[cdef][\w-]{21}$/,Vi="";function yf(){try{const t=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(t),t[0]=112+t[0]%16;const n=vf(t);return mf.test(n)?n:Vi}catch{return Vi}}function vf(t){return gf(t).substr(0,22)}/**
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
 */function Kn(t){return`${t.appName}!${t.appId}`}/**
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
 */const Sa=new Map;function Pa(t,e){const n=Kn(t);ka(n,e),_f(n,e)}function ka(t,e){const n=Sa.get(t);if(n)for(const r of n)r(e)}function _f(t,e){const n=wf();n&&n.postMessage({key:t,fid:e}),If()}let tt=null;function wf(){return!tt&&"BroadcastChannel"in self&&(tt=new BroadcastChannel("[Firebase] FID Change"),tt.onmessage=t=>{ka(t.data.key,t.data.fid)}),tt}function If(){Sa.size===0&&tt&&(tt.close(),tt=null)}/**
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
 */const Ef="firebase-installations-database",Tf=1,rt="firebase-installations-store";let Ci=null;function ar(){return Ci||(Ci=_o(Ef,Tf,{upgrade:(t,e)=>{switch(e){case 0:t.createObjectStore(rt)}}})),Ci}async function Ln(t,e){const n=Kn(t),s=(await ar()).transaction(rt,"readwrite"),a=s.objectStore(rt),l=await a.get(n);return await a.put(e,n),await s.done,(!l||l.fid!==e.fid)&&Pa(t,e.fid),e}async function Ra(t){const e=Kn(t),r=(await ar()).transaction(rt,"readwrite");await r.objectStore(rt).delete(e),await r.done}async function Jn(t,e){const n=Kn(t),s=(await ar()).transaction(rt,"readwrite"),a=s.objectStore(rt),l=await a.get(n),h=e(l);return h===void 0?await a.delete(n):await a.put(h,n),await s.done,h&&(!l||l.fid!==h.fid)&&Pa(t,h.fid),h}/**
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
 */async function cr(t){let e;const n=await Jn(t.appConfig,r=>{const s=bf(r),a=Af(t,s);return e=a.registrationPromise,a.installationEntry});return n.fid===Vi?{installationEntry:await e}:{installationEntry:n,registrationPromise:e}}function bf(t){const e=t||{fid:yf(),registrationStatus:0};return Ca(e)}function Af(t,e){if(e.registrationStatus===0){if(!navigator.onLine){const s=Promise.reject(it.create("app-offline"));return{installationEntry:e,registrationPromise:s}}const n={fid:e.fid,registrationStatus:1,registrationTime:Date.now()},r=Sf(t,n);return{installationEntry:n,registrationPromise:r}}else return e.registrationStatus===1?{installationEntry:e,registrationPromise:Pf(t)}:{installationEntry:e}}async function Sf(t,e){try{const n=await pf(t,e);return Ln(t.appConfig,n)}catch(n){throw _a(n)&&n.customData.serverCode===409?await Ra(t.appConfig):await Ln(t.appConfig,{fid:e.fid,registrationStatus:0}),n}}async function Pf(t){let e=await Js(t.appConfig);for(;e.registrationStatus===1;)await Aa(100),e=await Js(t.appConfig);if(e.registrationStatus===0){const{installationEntry:n,registrationPromise:r}=await cr(t);return r||n}return e}function Js(t){return Jn(t,e=>{if(!e)throw it.create("installation-not-found");return Ca(e)})}function Ca(t){return kf(t)?{fid:t.fid,registrationStatus:0}:t}function kf(t){return t.registrationStatus===1&&t.registrationTime+ma<Date.now()}/**
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
 */async function Rf({appConfig:t,heartbeatServiceProvider:e},n){const r=Cf(t,n),s=hf(t,n),a=e.getImmediate({optional:!0});if(a){const I=await a.getHeartbeatsHeader();I&&s.append("x-firebase-client",I)}const l={installation:{sdkVersion:ya,appId:t.appId}},h={method:"POST",headers:s,body:JSON.stringify(l)},g=await ba(()=>fetch(r,h));if(g.ok){const I=await g.json();return Ia(I)}else throw await Ea("Generate Auth Token",g)}function Cf(t,{fid:e}){return`${wa(t)}/${e}/authTokens:generate`}/**
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
 */async function lr(t,e=!1){let n;const r=await Jn(t.appConfig,a=>{if(!Oa(a))throw it.create("not-registered");const l=a.authToken;if(!e&&Nf(l))return a;if(l.requestStatus===1)return n=Of(t,e),a;{if(!navigator.onLine)throw it.create("app-offline");const h=Mf(a);return n=Df(t,h),h}});return n?await n:r.authToken}async function Of(t,e){let n=await Ys(t.appConfig);for(;n.authToken.requestStatus===1;)await Aa(100),n=await Ys(t.appConfig);const r=n.authToken;return r.requestStatus===0?lr(t,e):r}function Ys(t){return Jn(t,e=>{if(!Oa(e))throw it.create("not-registered");const n=e.authToken;return Uf(n)?Object.assign(Object.assign({},e),{authToken:{requestStatus:0}}):e})}async function Df(t,e){try{const n=await Rf(t,e),r=Object.assign(Object.assign({},e),{authToken:n});return await Ln(t.appConfig,r),n}catch(n){if(_a(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await Ra(t.appConfig);else{const r=Object.assign(Object.assign({},e),{authToken:{requestStatus:0}});await Ln(t.appConfig,r)}throw n}}function Oa(t){return t!==void 0&&t.registrationStatus===2}function Nf(t){return t.requestStatus===2&&!Lf(t)}function Lf(t){const e=Date.now();return e<t.creationTime||t.creationTime+t.expiresIn<e+af}function Mf(t){const e={requestStatus:1,requestTime:Date.now()};return Object.assign(Object.assign({},t),{authToken:e})}function Uf(t){return t.requestStatus===1&&t.requestTime+ma<Date.now()}/**
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
 */async function Ff(t){const e=t,{installationEntry:n,registrationPromise:r}=await cr(e);return r?r.catch(console.error):lr(e).catch(console.error),n.fid}/**
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
 */async function xf(t,e=!1){const n=t;return await jf(n),(await lr(n,e)).token}async function jf(t){const{registrationPromise:e}=await cr(t);e&&await e}/**
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
 */function $f(t){if(!t||!t.options)throw Oi("App Configuration");if(!t.name)throw Oi("App Name");const e=["projectId","apiKey","appId"];for(const n of e)if(!t.options[n])throw Oi(n);return{appName:t.name,projectId:t.options.projectId,apiKey:t.options.apiKey,appId:t.options.appId}}function Oi(t){return it.create("missing-app-config-values",{valueName:t})}/**
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
 */const Da="installations",Vf="installations-internal",Bf=t=>{const e=t.getProvider("app").getImmediate(),n=$f(e),r=ot(e,"heartbeat");return{app:e,appConfig:n,heartbeatServiceProvider:r,_delete:()=>Promise.resolve()}},Hf=t=>{const e=t.getProvider("app").getImmediate(),n=ot(e,Da).getImmediate();return{getId:()=>Ff(n),getToken:s=>xf(n,s)}};function Wf(){Te(new we(Da,Bf,"PUBLIC")),Te(new we(Vf,Hf,"PRIVATE"))}Wf();ge(ga,or);ge(ga,or,"esm2017");/**
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
 */const Mn="analytics",zf="firebase_id",Gf="origin",qf=60*1e3,Kf="https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig",ur="https://www.googletagmanager.com/gtag/js";/**
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
 */const he=new Fn("@firebase/analytics");/**
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
 */const Jf={"already-exists":"A Firebase Analytics instance with the appId {$id}  already exists. Only one Firebase Analytics instance can be created for each appId.","already-initialized":"initializeAnalytics() cannot be called again with different options than those it was initially called with. It can be called again with the same options to return the existing instance, or getAnalytics() can be used to get a reference to the already-initialized instance.","already-initialized-settings":"Firebase Analytics has already been initialized.settings() must be called before initializing any Analytics instanceor it will have no effect.","interop-component-reg-failed":"Firebase Analytics Interop Component failed to instantiate: {$reason}","invalid-analytics-context":"Firebase Analytics is not supported in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","indexeddb-unavailable":"IndexedDB unavailable or restricted in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","fetch-throttle":"The config fetch request timed out while in an exponential backoff state. Unix timestamp in milliseconds when fetch request throttling ends: {$throttleEndTimeMillis}.","config-fetch-failed":"Dynamic config fetch failed: [{$httpStatus}] {$responseMessage}","no-api-key":'The "apiKey" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid API key.',"no-app-id":'The "appId" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid app ID.',"no-client-id":'The "client_id" field is empty.',"invalid-gtag-resource":"Trusted Types detected an invalid gtag resource: {$gtagURL}."},de=new st("analytics","Analytics",Jf);/**
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
 */function Yf(t){if(!t.startsWith(ur)){const e=de.create("invalid-gtag-resource",{gtagURL:t});return he.warn(e.message),""}return t}function Na(t){return Promise.all(t.map(e=>e.catch(n=>n)))}function Xf(t,e){let n;return window.trustedTypes&&(n=window.trustedTypes.createPolicy(t,e)),n}function Qf(t,e){const n=Xf("firebase-js-sdk-policy",{createScriptURL:Yf}),r=document.createElement("script"),s=`${ur}?l=${t}&id=${e}`;r.src=n?n==null?void 0:n.createScriptURL(s):s,r.async=!0,document.head.appendChild(r)}function Zf(t){let e=[];return Array.isArray(window[t])?e=window[t]:window[t]=e,e}async function ep(t,e,n,r,s,a){const l=r[s];try{if(l)await e[l];else{const g=(await Na(n)).find(I=>I.measurementId===s);g&&await e[g.appId]}}catch(h){he.error(h)}t("config",s,a)}async function tp(t,e,n,r,s){try{let a=[];if(s&&s.send_to){let l=s.send_to;Array.isArray(l)||(l=[l]);const h=await Na(n);for(const g of l){const I=h.find(S=>S.measurementId===g),A=I&&e[I.appId];if(A)a.push(A);else{a=[];break}}}a.length===0&&(a=Object.values(e)),await Promise.all(a),t("event",r,s||{})}catch(a){he.error(a)}}function np(t,e,n,r){async function s(a,...l){try{if(a==="event"){const[h,g]=l;await tp(t,e,n,h,g)}else if(a==="config"){const[h,g]=l;await ep(t,e,n,r,h,g)}else if(a==="consent"){const[h,g]=l;t("consent",h,g)}else if(a==="get"){const[h,g,I]=l;t("get",h,g,I)}else if(a==="set"){const[h]=l;t("set",h)}else t(a,...l)}catch(h){he.error(h)}}return s}function ip(t,e,n,r,s){let a=function(...l){window[r].push(arguments)};return window[s]&&typeof window[s]=="function"&&(a=window[s]),window[s]=np(a,t,e,n),{gtagCore:a,wrappedGtag:window[s]}}function rp(t){const e=window.document.getElementsByTagName("script");for(const n of Object.values(e))if(n.src&&n.src.includes(ur)&&n.src.includes(t))return n;return null}/**
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
 */const sp=30,op=1e3;class ap{constructor(e={},n=op){this.throttleMetadata=e,this.intervalMillis=n}getThrottleMetadata(e){return this.throttleMetadata[e]}setThrottleMetadata(e,n){this.throttleMetadata[e]=n}deleteThrottleMetadata(e){delete this.throttleMetadata[e]}}const La=new ap;function cp(t){return new Headers({Accept:"application/json","x-goog-api-key":t})}async function lp(t){var e;const{appId:n,apiKey:r}=t,s={method:"GET",headers:cp(r)},a=Kf.replace("{app-id}",n),l=await fetch(a,s);if(l.status!==200&&l.status!==304){let h="";try{const g=await l.json();!((e=g.error)===null||e===void 0)&&e.message&&(h=g.error.message)}catch{}throw de.create("config-fetch-failed",{httpStatus:l.status,responseMessage:h})}return l.json()}async function up(t,e=La,n){const{appId:r,apiKey:s,measurementId:a}=t.options;if(!r)throw de.create("no-app-id");if(!s){if(a)return{measurementId:a,appId:r};throw de.create("no-api-key")}const l=e.getThrottleMetadata(r)||{backoffCount:0,throttleEndTimeMillis:Date.now()},h=new fp;return setTimeout(async()=>{h.abort()},qf),Ma({appId:r,apiKey:s,measurementId:a},l,h,e)}async function Ma(t,{throttleEndTimeMillis:e,backoffCount:n},r,s=La){var a;const{appId:l,measurementId:h}=t;try{await hp(r,e)}catch(g){if(h)return he.warn(`Timed out fetching this Firebase app's measurement ID from the server. Falling back to the measurement ID ${h} provided in the "measurementId" field in the local Firebase config. [${g==null?void 0:g.message}]`),{appId:l,measurementId:h};throw g}try{const g=await lp(t);return s.deleteThrottleMetadata(l),g}catch(g){const I=g;if(!dp(I)){if(s.deleteThrottleMetadata(l),h)return he.warn(`Failed to fetch this Firebase app's measurement ID from the server. Falling back to the measurement ID ${h} provided in the "measurementId" field in the local Firebase config. [${I==null?void 0:I.message}]`),{appId:l,measurementId:h};throw g}const A=Number((a=I==null?void 0:I.customData)===null||a===void 0?void 0:a.httpStatus)===503?ds(n,s.intervalMillis,sp):ds(n,s.intervalMillis),S={throttleEndTimeMillis:Date.now()+A,backoffCount:n+1};return s.setThrottleMetadata(l,S),he.debug(`Calling attemptFetch again in ${A} millis`),Ma(t,S,r,s)}}function hp(t,e){return new Promise((n,r)=>{const s=Math.max(e-Date.now(),0),a=setTimeout(n,s);t.addEventListener(()=>{clearTimeout(a),r(de.create("fetch-throttle",{throttleEndTimeMillis:e}))})})}function dp(t){if(!(t instanceof Ie)||!t.customData)return!1;const e=Number(t.customData.httpStatus);return e===429||e===500||e===503||e===504}class fp{constructor(){this.listeners=[]}addEventListener(e){this.listeners.push(e)}abort(){this.listeners.forEach(e=>e())}}async function pp(t,e,n,r,s){if(s&&s.global){t("event",n,r);return}else{const a=await e,l=Object.assign(Object.assign({},r),{send_to:a});t("event",n,l)}}/**
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
 */async function gp(){if(go())try{await mo()}catch(t){return he.warn(de.create("indexeddb-unavailable",{errorInfo:t==null?void 0:t.toString()}).message),!1}else return he.warn(de.create("indexeddb-unavailable",{errorInfo:"IndexedDB is not available in this environment."}).message),!1;return!0}async function mp(t,e,n,r,s,a,l){var h;const g=up(t);g.then(N=>{n[N.measurementId]=N.appId,t.options.measurementId&&N.measurementId!==t.options.measurementId&&he.warn(`The measurement ID in the local Firebase config (${t.options.measurementId}) does not match the measurement ID fetched from the server (${N.measurementId}). To ensure analytics events are always sent to the correct Analytics property, update the measurement ID field in the local config or remove it from the local config.`)}).catch(N=>he.error(N)),e.push(g);const I=gp().then(N=>{if(N)return r.getId()}),[A,S]=await Promise.all([g,I]);rp(a)||Qf(a,A.measurementId),s("js",new Date);const P=(h=l==null?void 0:l.config)!==null&&h!==void 0?h:{};return P[Gf]="firebase",P.update=!0,S!=null&&(P[zf]=S),s("config",A.measurementId,P),A.measurementId}/**
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
 */class yp{constructor(e){this.app=e}_delete(){return delete Wt[this.app.options.appId],Promise.resolve()}}let Wt={},Xs=[];const Qs={};let Di="dataLayer",vp="gtag",Zs,Ua,eo=!1;function _p(){const t=[];if(po()&&t.push("This is a browser extension environment."),Lc()||t.push("Cookies are not available."),t.length>0){const e=t.map((r,s)=>`(${s+1}) ${r}`).join(" "),n=de.create("invalid-analytics-context",{errorInfo:e});he.warn(n.message)}}function wp(t,e,n){_p();const r=t.options.appId;if(!r)throw de.create("no-app-id");if(!t.options.apiKey)if(t.options.measurementId)he.warn(`The "apiKey" field is empty in the local Firebase config. This is needed to fetch the latest measurement ID for this Firebase app. Falling back to the measurement ID ${t.options.measurementId} provided in the "measurementId" field in the local Firebase config.`);else throw de.create("no-api-key");if(Wt[r]!=null)throw de.create("already-exists",{id:r});if(!eo){Zf(Di);const{wrappedGtag:a,gtagCore:l}=ip(Wt,Xs,Qs,Di,vp);Ua=a,Zs=l,eo=!0}return Wt[r]=mp(t,Xs,Qs,e,Zs,Di,n),new yp(t)}function Ip(t=zi()){t=D(t);const e=ot(t,Mn);return e.isInitialized()?e.getImmediate():Ep(t)}function Ep(t,e={}){const n=ot(t,Mn);if(n.isInitialized()){const s=n.getImmediate();if(zt(e,n.getOptions()))return s;throw de.create("already-initialized")}return n.initialize({options:e})}function Tp(t,e,n,r){t=D(t),pp(Ua,Wt[t.app.options.appId],e,n,r).catch(s=>he.error(s))}const to="@firebase/analytics",no="0.10.8";function bp(){Te(new we(Mn,(e,{options:n})=>{const r=e.getProvider("app").getImmediate(),s=e.getProvider("installations-internal").getImmediate();return wp(r,s,n)},"PUBLIC")),Te(new we("analytics-internal",t,"PRIVATE")),ge(to,no),ge(to,no,"esm2017");function t(e){try{const n=e.getProvider(Mn).getImmediate();return{logEvent:(r,s,a)=>Tp(n,r,s,a)}}catch(n){throw de.create("interop-component-reg-failed",{reason:n})}}}bp();const Ap={apiKey:"AIzaSyBbKubMMxI0HdlezQjJ9CI3Ire-mfkN6jY",authDomain:"scorekinole.firebaseapp.com",projectId:"scorekinole",storageBucket:"scorekinole.firebasestorage.app",messagingSenderId:"648322505256",appId:"1:648322505256:web:493cc54cf18305a6b4f31d",measurementId:"G-D7GNRCF32W"};let In=null,hr=null,Sp=null,Pp=null;try{In=wo(Ap),hr=$d(In),Sp=sf(In),Pp=Ip(In),console.log("✅ Firebase initialized successfully")}catch(t){console.error("❌ Firebase initialization error:",t)}/*! Capacitor: https://capacitorjs.com/ - MIT License */const kp=t=>{const e=new Map;e.set("web",{name:"web"});const n=t.CapacitorPlatforms||{currentPlatform:{name:"web"},platforms:e},r=(a,l)=>{n.platforms.set(a,l)},s=a=>{n.platforms.has(a)&&(n.currentPlatform=n.platforms.get(a))};return n.addPlatform=r,n.setPlatform=s,n},Rp=t=>t.CapacitorPlatforms=kp(t),Fa=Rp(typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});Fa.addPlatform;Fa.setPlatform;var _t;(function(t){t.Unimplemented="UNIMPLEMENTED",t.Unavailable="UNAVAILABLE"})(_t||(_t={}));class Ni extends Error{constructor(e,n,r){super(e),this.message=e,this.code=n,this.data=r}}const Cp=t=>{var e,n;return t!=null&&t.androidBridge?"android":!((n=(e=t==null?void 0:t.webkit)===null||e===void 0?void 0:e.messageHandlers)===null||n===void 0)&&n.bridge?"ios":"web"},Op=t=>{var e,n,r,s,a;const l=t.CapacitorCustomPlatform||null,h=t.Capacitor||{},g=h.Plugins=h.Plugins||{},I=t.CapacitorPlatforms,A=()=>l!==null?l.name:Cp(t),S=((e=I==null?void 0:I.currentPlatform)===null||e===void 0?void 0:e.getPlatform)||A,P=()=>S()!=="web",N=((n=I==null?void 0:I.currentPlatform)===null||n===void 0?void 0:n.isNativePlatform)||P,k=m=>{const d=ne.get(m);return!!(d!=null&&d.platforms.has(S())||fe(m))},x=((r=I==null?void 0:I.currentPlatform)===null||r===void 0?void 0:r.isPluginAvailable)||k,M=m=>{var d;return(d=h.PluginHeaders)===null||d===void 0?void 0:d.find(f=>f.name===m)},fe=((s=I==null?void 0:I.currentPlatform)===null||s===void 0?void 0:s.getPluginHeader)||M,te=m=>t.console.error(m),z=(m,d,f)=>Promise.reject(`${f} does not have an implementation of "${d}".`),ne=new Map,Ae=(m,d={})=>{const f=ne.get(m);if(f)return console.warn(`Capacitor plugin "${m}" already registered. Cannot register plugins twice.`),f.proxy;const y=S(),v=fe(m);let _;const p=async()=>(!_&&y in d?_=typeof d[y]=="function"?_=await d[y]():_=d[y]:l!==null&&!_&&"web"in d&&(_=typeof d.web=="function"?_=await d.web():_=d.web),_),ye=(V,X)=>{var B,U;if(v){const Ee=v==null?void 0:v.methods.find(G=>X===G.name);if(Ee)return Ee.rtype==="promise"?G=>h.nativePromise(m,X.toString(),G):(G,ct)=>h.nativeCallback(m,X.toString(),G,ct);if(V)return(B=V[X])===null||B===void 0?void 0:B.bind(V)}else{if(V)return(U=V[X])===null||U===void 0?void 0:U.bind(V);throw new Ni(`"${m}" plugin is not implemented on ${y}`,_t.Unimplemented)}},Se=V=>{let X;const B=(...U)=>{const Ee=p().then(G=>{const ct=ye(G,V);if(ct){const Pe=ct(...U);return X=Pe==null?void 0:Pe.remove,Pe}else throw new Ni(`"${m}.${V}()" is not implemented on ${y}`,_t.Unimplemented)});return V==="addListener"&&(Ee.remove=async()=>X()),Ee};return B.toString=()=>`${V.toString()}() { [capacitor code] }`,Object.defineProperty(B,"name",{value:V,writable:!1,configurable:!1}),B},nn=Se("addListener"),Fe=Se("removeListener"),Je=(V,X)=>{const B=nn({eventName:V},X),U=async()=>{const G=await B;Fe({eventName:V,callbackId:G},X)},Ee=new Promise(G=>B.then(()=>G({remove:U})));return Ee.remove=async()=>{console.warn("Using addListener() without 'await' is deprecated."),await U()},Ee},Ye=new Proxy({},{get(V,X){switch(X){case"$$typeof":return;case"toJSON":return()=>({});case"addListener":return v?Je:nn;case"removeListener":return Fe;default:return Se(X)}}});return g[m]=Ye,ne.set(m,{name:m,proxy:Ye,platforms:new Set([...Object.keys(d),...v?[y]:[]])}),Ye},Y=((a=I==null?void 0:I.currentPlatform)===null||a===void 0?void 0:a.registerPlugin)||Ae;return h.convertFileSrc||(h.convertFileSrc=m=>m),h.getPlatform=S,h.handleError=te,h.isNativePlatform=N,h.isPluginAvailable=x,h.pluginMethodNoop=z,h.registerPlugin=Y,h.Exception=Ni,h.DEBUG=!!h.DEBUG,h.isLoggingEnabled=!!h.isLoggingEnabled,h.platform=h.getPlatform(),h.isNative=h.isNativePlatform(),h},Dp=t=>t.Capacitor=Op(t),Un=Dp(typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{}),dr=Un.registerPlugin;Un.Plugins;class xa{constructor(e){this.listeners={},this.retainedEventArguments={},this.windowListeners={},e&&(console.warn(`Capacitor WebPlugin "${e.name}" config object was deprecated in v3 and will be removed in v4.`),this.config=e)}addListener(e,n){let r=!1;this.listeners[e]||(this.listeners[e]=[],r=!0),this.listeners[e].push(n);const a=this.windowListeners[e];a&&!a.registered&&this.addWindowListener(a),r&&this.sendRetainedArgumentsForEvent(e);const l=async()=>this.removeListener(e,n);return Promise.resolve({remove:l})}async removeAllListeners(){this.listeners={};for(const e in this.windowListeners)this.removeWindowListener(this.windowListeners[e]);this.windowListeners={}}notifyListeners(e,n,r){const s=this.listeners[e];if(!s){if(r){let a=this.retainedEventArguments[e];a||(a=[]),a.push(n),this.retainedEventArguments[e]=a}return}s.forEach(a=>a(n))}hasListeners(e){return!!this.listeners[e].length}registerWindowListener(e,n){this.windowListeners[n]={registered:!1,windowEventName:e,pluginEventName:n,handler:r=>{this.notifyListeners(n,r)}}}unimplemented(e="not implemented"){return new Un.Exception(e,_t.Unimplemented)}unavailable(e="not available"){return new Un.Exception(e,_t.Unavailable)}async removeListener(e,n){const r=this.listeners[e];if(!r)return;const s=r.indexOf(n);this.listeners[e].splice(s,1),this.listeners[e].length||this.removeWindowListener(this.windowListeners[e])}addWindowListener(e){window.addEventListener(e.windowEventName,e.handler),e.registered=!0}removeWindowListener(e){e&&(window.removeEventListener(e.windowEventName,e.handler),e.registered=!1)}sendRetainedArgumentsForEvent(e){const n=this.retainedEventArguments[e];n&&(delete this.retainedEventArguments[e],n.forEach(r=>{this.notifyListeners(e,r)}))}}const io=t=>encodeURIComponent(t).replace(/%(2[346B]|5E|60|7C)/g,decodeURIComponent).replace(/[()]/g,escape),ro=t=>t.replace(/(%[\dA-F]{2})+/gi,decodeURIComponent);class Np extends xa{async getCookies(){const e=document.cookie,n={};return e.split(";").forEach(r=>{if(r.length<=0)return;let[s,a]=r.replace(/=/,"CAP_COOKIE").split("CAP_COOKIE");s=ro(s).trim(),a=ro(a).trim(),n[s]=a}),n}async setCookie(e){try{const n=io(e.key),r=io(e.value),s=`; expires=${(e.expires||"").replace("expires=","")}`,a=(e.path||"/").replace("path=",""),l=e.url!=null&&e.url.length>0?`domain=${e.url}`:"";document.cookie=`${n}=${r||""}${s}; path=${a}; ${l};`}catch(n){return Promise.reject(n)}}async deleteCookie(e){try{document.cookie=`${e.key}=; Max-Age=0`}catch(n){return Promise.reject(n)}}async clearCookies(){try{const e=document.cookie.split(";")||[];for(const n of e)document.cookie=n.replace(/^ +/,"").replace(/=.*/,`=;expires=${new Date().toUTCString()};path=/`)}catch(e){return Promise.reject(e)}}async clearAllCookies(){try{await this.clearCookies()}catch(e){return Promise.reject(e)}}}dr("CapacitorCookies",{web:()=>new Np});const Lp=async t=>new Promise((e,n)=>{const r=new FileReader;r.onload=()=>{const s=r.result;e(s.indexOf(",")>=0?s.split(",")[1]:s)},r.onerror=s=>n(s),r.readAsDataURL(t)}),Mp=(t={})=>{const e=Object.keys(t);return Object.keys(t).map(s=>s.toLocaleLowerCase()).reduce((s,a,l)=>(s[a]=t[e[l]],s),{})},Up=(t,e=!0)=>t?Object.entries(t).reduce((r,s)=>{const[a,l]=s;let h,g;return Array.isArray(l)?(g="",l.forEach(I=>{h=e?encodeURIComponent(I):I,g+=`${a}=${h}&`}),g.slice(0,-1)):(h=e?encodeURIComponent(l):l,g=`${a}=${h}`),`${r}&${g}`},"").substr(1):null,Fp=(t,e={})=>{const n=Object.assign({method:t.method||"GET",headers:t.headers},e),s=Mp(t.headers)["content-type"]||"";if(typeof t.data=="string")n.body=t.data;else if(s.includes("application/x-www-form-urlencoded")){const a=new URLSearchParams;for(const[l,h]of Object.entries(t.data||{}))a.set(l,h);n.body=a.toString()}else if(s.includes("multipart/form-data")||t.data instanceof FormData){const a=new FormData;if(t.data instanceof FormData)t.data.forEach((h,g)=>{a.append(g,h)});else for(const h of Object.keys(t.data))a.append(h,t.data[h]);n.body=a;const l=new Headers(n.headers);l.delete("content-type"),n.headers=l}else(s.includes("application/json")||typeof t.data=="object")&&(n.body=JSON.stringify(t.data));return n};class xp extends xa{async request(e){const n=Fp(e,e.webFetchExtra),r=Up(e.params,e.shouldEncodeUrlParams),s=r?`${e.url}?${r}`:e.url,a=await fetch(s,n),l=a.headers.get("content-type")||"";let{responseType:h="text"}=a.ok?e:{};l.includes("application/json")&&(h="json");let g,I;switch(h){case"arraybuffer":case"blob":I=await a.blob(),g=await Lp(I);break;case"json":g=await a.json();break;case"document":case"text":default:g=await a.text()}const A={};return a.headers.forEach((S,P)=>{A[P]=S}),{data:g,headers:A,status:a.status,url:a.url}}async get(e){return this.request(Object.assign(Object.assign({},e),{method:"GET"}))}async post(e){return this.request(Object.assign(Object.assign({},e),{method:"POST"}))}async put(e){return this.request(Object.assign(Object.assign({},e),{method:"PUT"}))}async patch(e){return this.request(Object.assign(Object.assign({},e),{method:"PATCH"}))}async delete(e){return this.request(Object.assign(Object.assign({},e),{method:"DELETE"}))}}dr("CapacitorHttp",{web:()=>new xp});var so;(function(t){t.IndexedDbLocal="INDEXED_DB_LOCAL",t.InMemory="IN_MEMORY",t.BrowserLocal="BROWSER_LOCAL",t.BrowserSession="BROWSER_SESSION"})(so||(so={}));var oo;(function(t){t.APPLE="apple.com",t.FACEBOOK="facebook.com",t.GAME_CENTER="gc.apple.com",t.GITHUB="github.com",t.GOOGLE="google.com",t.MICROSOFT="microsoft.com",t.PLAY_GAMES="playgames.google.com",t.TWITTER="twitter.com",t.YAHOO="yahoo.com",t.PASSWORD="password",t.PHONE="phone"})(oo||(oo={}));dr("FirebaseAuthentication",{web:()=>vc(()=>import("./Rb4mhpvK.js"),[],import.meta.url).then(t=>new t.FirebaseAuthenticationWeb)});const Bi=_c(null);async function mg(){try{await yh(hr),Bi.set(null),console.log("✅ User signed out")}catch(t){throw console.error("❌ Sign out error:",t),t}}function yg(){mh(hr,t=>{if(t){const e={id:t.uid,name:t.displayName||"Unknown",email:t.email,photo:t.photoURL};Bi.set(e)}else Bi.set(null)})}export{Uu as A,eg as B,fg as C,hg as D,at as E,Be as F,We as G,pg as H,dg as I,sh as J,Me as K,rg as L,Ss as M,Nh as N,bn as O,oo as P,Qo as Q,cg as R,Ih as S,ze as T,yg as U,mg as V,xa as W,Bi as X,Gp as a,zp as b,qp as c,ag as d,gg as e,Qp as f,$d as g,He as h,Yp as i,og as j,Wp as k,ug as l,Jp as m,so as n,sg as o,Vp as p,Hp as q,mu as r,Zp as s,Kp as t,Xp as u,lg as v,Bp as w,ng as x,ig as y,tg as z};

import { createHmac, randomInt } from 'node:crypto';
import {
  countWhatsAppConnectionsByWaba,
  getBusiness,
  getWhatsAppConnection,
  saveEmbeddedWhatsAppConnection,
  setWhatsAppConnectionHealth,
  clearWhatsAppConnection,
} from './db.mjs';

function graphVersion(){ return process.env.META_GRAPH_VERSION || 'v26.0'; }
function graphBase(){ return `https://graph.facebook.com/${graphVersion()}`; }
function required(name){ const v=String(process.env[name]||'').trim(); if(!v) throw new Error(`${name} is not configured on the server.`); return v; }
function safeMetaError(status,text){
  try{
    const j=JSON.parse(text||'{}');
    const msg=j?.error?.message||j?.error?.error_user_msg||j?.message;
    if(msg) return `Meta API error ${status}: ${String(msg).slice(0,500)}`;
  }catch{}
  return `Meta API error ${status}.`;
}
async function readJson(r){ const text=await r.text(); if(!r.ok) throw new Error(safeMetaError(r.status,text)); try{return text?JSON.parse(text):{};}catch{throw new Error('Meta returned an invalid response.');} }
function appSecretProof(token){ const secret=process.env.META_APP_SECRET||''; return secret?createHmac('sha256',secret).update(String(token)).digest('hex'):''; }
async function tokenGraph(path,token,{method='GET',body=null}={}){
  const url=new URL(`${graphBase()}${path.startsWith('/')?path:`/${path}`}`);
  // App Secret Proof is optional unless enabled in Meta, but including it makes
  // authenticated server-to-server calls compatible with that security setting.
  const proof=appSecretProof(token); if(proof) url.searchParams.set('appsecret_proof',proof);
  const headers={Authorization:`Bearer ${token}`};
  const opts={method,headers};
  if(body!==null){headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  return readJson(await fetch(url,opts));
}

export function metaPublicConfig(){
  return {
    appId:String(process.env.META_APP_ID||''),
    embeddedSignupConfigId:String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID||''),
    graphVersion:graphVersion(),
    esVersion:String(process.env.META_EMBEDDED_SIGNUP_ES_VERSION||'v4'),
    sessionInfoVersion:String(process.env.META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION||'3'),
    featureType:String(process.env.META_EMBEDDED_SIGNUP_FEATURE_TYPE||''),
    ready:Boolean(process.env.META_APP_ID&&process.env.META_EMBEDDED_SIGNUP_CONFIG_ID&&process.env.META_APP_SECRET),
  };
}

export async function exchangeEmbeddedSignupCode(code){
  const appId=required('META_APP_ID'), appSecret=required('META_APP_SECRET');
  code=String(code||'').trim(); if(!code) throw new Error('Meta authorization code is missing. Please reconnect WhatsApp.');
  const url=new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set('client_id',appId);
  url.searchParams.set('client_secret',appSecret);
  url.searchParams.set('code',code);
  // Most JS SDK Embedded Signup flows do not need redirect_uri on exchange.
  // If a Meta configuration explicitly requires one, set this env var to the
  // exact value used to start the OAuth flow.
  const redirect=String(process.env.META_OAUTH_REDIRECT_URI||'').trim();
  if(redirect) url.searchParams.set('redirect_uri',redirect);
  const out=await readJson(await fetch(url,{method:'GET',headers:{Accept:'application/json'}}));
  if(!out?.access_token) throw new Error('Meta did not return an access token. Please reconnect WhatsApp.');
  return out;
}

async function debugToken(token){
  const appId=required('META_APP_ID'), appSecret=required('META_APP_SECRET');
  const url=new URL(`${graphBase()}/debug_token`); url.searchParams.set('input_token',token);
  return readJson(await fetch(url,{headers:{Authorization:`Bearer ${appId}|${appSecret}`}}));
}

async function listPhoneNumbers(wabaId,token){
  return tokenGraph(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,token);
}

function discoverWabaFromDebug(debug){
  const scopes=debug?.data?.granular_scopes||[];
  const ids=[];
  for(const g of scopes){
    if(!['whatsapp_business_management','whatsapp_business_messaging'].includes(g?.scope)) continue;
    for(const id of g?.target_ids||[]) if(id&&!ids.includes(String(id))) ids.push(String(id));
  }
  if(ids.length===1) return ids[0];
  return '';
}

async function resolveAssets(token,{wabaId='',phoneNumberId=''}){
  let debug=null;
  if(!wabaId){
    debug=await debugToken(token);
    if(debug?.data?.is_valid===false) throw new Error('Meta returned an invalid business access token. Please reconnect WhatsApp.');
    const appId=String(process.env.META_APP_ID||'');
    if(debug?.data?.app_id && String(debug.data.app_id)!==appId) throw new Error('The Meta authorization belongs to a different app.');
    wabaId=discoverWabaFromDebug(debug);
    if(!wabaId) throw new Error('ClinicChatDesk could not determine the WhatsApp Business Account. Please run Connect WhatsApp again.');
  }
  const phones=await listPhoneNumbers(wabaId,token);
  const list=Array.isArray(phones?.data)?phones.data:[];
  let phone=null;
  if(phoneNumberId) phone=list.find(x=>String(x.id)===String(phoneNumberId))||null;
  else if(list.length===1) phone=list[0];
  if(!phone){
    if(phoneNumberId) throw new Error('The selected WhatsApp phone number does not belong to the authorized WhatsApp Business Account.');
    throw new Error(list.length>1?'More than one WhatsApp number is available. Please reconnect and select the number you want to use.':'Meta did not return a WhatsApp phone number for this account.');
  }
  return {wabaId:String(wabaId),phoneNumberId:String(phone.id),displayNumber:phone.display_phone_number||'',verifiedName:phone.verified_name||'',debug};
}


function generateTwoStepPin(){
  const bad=new Set(['000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321']);
  for(let i=0;i<20;i++){const pin=String(randomInt(0,1_000_000)).padStart(6,'0');if(!bad.has(pin))return pin;}
  return String(randomInt(100000,1_000_000));
}

export async function registerPhoneNumber(phoneNumberId,token,pin){
  return tokenGraph(`/${encodeURIComponent(phoneNumberId)}/register`,token,{method:'POST',body:{messaging_product:'whatsapp',pin:String(pin)}});
}

export async function subscribeWaba(wabaId,token){
  const result=await tokenGraph(`/${encodeURIComponent(wabaId)}/subscribed_apps`,token,{method:'POST'});
  if(result?.success===false) throw new Error('Meta did not subscribe ClinicChatDesk to this WhatsApp account.');
  return result;
}

export async function getWabaSubscriptions(wabaId,token){ return tokenGraph(`/${encodeURIComponent(wabaId)}/subscribed_apps`,token); }

export async function completeEmbeddedSignup({businessId,code,wabaId='',phoneNumberId='',metaBusinessId='',onboardingMode=''}){
  const biz=getBusiness(businessId); if(!biz) throw new Error('Clinic not found.');
  if(biz.is_demo) throw new Error('A public demo workspace cannot connect a real WhatsApp account.');
  const tokenData=await exchangeEmbeddedSignupCode(code);
  const token=tokenData.access_token;
  let assets;
  try{ assets=await resolveAssets(token,{wabaId:String(wabaId||''),phoneNumberId:String(phoneNumberId||'')}); }
  catch(e){ throw new Error(`Meta authorized the account, but ClinicChatDesk could not verify the selected number: ${e.message}`); }

  const expiresAt=tokenData.expires_in?new Date(Date.now()+Number(tokenData.expires_in)*1000).toISOString():null;
  const mode=String(onboardingMode||'').toLowerCase()==='new'?'new':'existing';
  const pin=mode==='new'?generateTwoStepPin():'';
  const base={
    status:'pending',connection_source:'embedded_signup',display_number:assets.displayNumber,
    verified_name:assets.verifiedName,phone_number_id:assets.phoneNumberId,waba_id:assets.wabaId,
    meta_business_id:String(metaBusinessId||''),onboarding_mode:mode,access_token:token,two_step_pin:pin,token_type:tokenData.token_type||'bearer',token_expires_at:expiresAt,
    subscribed_at:null,last_error:null,
  };
  // Save the business token (and, for a new Cloud API number, its generated
  // two-step PIN) before follow-up calls. The OAuth code is single-use.
  saveEmbeddedWhatsAppConnection(businessId,base);
  try{
    // Coexistence numbers are already registered in the WhatsApp Business App.
    // New/standard Cloud API numbers must be registered after Embedded Signup.
    if(mode==='new') await registerPhoneNumber(assets.phoneNumberId,token,pin);
    await subscribeWaba(assets.wabaId,token);
    const t=new Date().toISOString();
    saveEmbeddedWhatsAppConnection(businessId,{...base,status:'connected',subscribed_at:t,last_verified_at:t,last_error:null});
    return {connection:getWhatsAppConnection(businessId),meta:{verified_name:assets.verifiedName}};
  }catch(e){
    setWhatsAppConnectionHealth(businessId,{status:'attention',last_error:e.message});
    throw new Error(`WhatsApp was authorized, but ClinicChatDesk could not finish the Meta connection. Use “Retry connection” in ClinicChatDesk. ${e.message}`);
  }
}

export async function retryEmbeddedConnection(businessId){
  const w=getWhatsAppConnection(businessId,true); if(!w?.access_token||!w?.waba_id||!w?.phone_number_id) throw new Error('No recoverable WhatsApp authorization was found. Please use Connect WhatsApp again.');
  try{
    const assets=await resolveAssets(w.access_token,{wabaId:w.waba_id,phoneNumberId:w.phone_number_id});
    if(w.onboarding_mode==='new'){
      const pin=w.two_step_pin||generateTwoStepPin();
      await registerPhoneNumber(w.phone_number_id,w.access_token,pin);
      if(!w.two_step_pin) saveEmbeddedWhatsAppConnection(businessId,{...w,two_step_pin:pin,access_token:w.access_token});
    }
    await subscribeWaba(w.waba_id,w.access_token);
    const t=new Date().toISOString();
    saveEmbeddedWhatsAppConnection(businessId,{...w,status:'connected',connection_source:w.connection_source||'embedded_signup',display_number:assets.displayNumber||w.display_number,verified_name:assets.verifiedName||w.verified_name,subscribed_at:w.subscribed_at||t,last_verified_at:t,last_error:null,access_token:w.access_token});
    return getWhatsAppConnection(businessId);
  }catch(e){ setWhatsAppConnectionHealth(businessId,{status:'attention',last_error:e.message}); throw e; }
}

export async function verifyEmbeddedConnection(businessId){
  const w=getWhatsAppConnection(businessId,true); if(!w?.access_token||!w?.waba_id||!w?.phone_number_id) throw new Error('WhatsApp is not connected for this clinic.');
  try{
    const assets=await resolveAssets(w.access_token,{wabaId:w.waba_id,phoneNumberId:w.phone_number_id});
    const subs=await getWabaSubscriptions(w.waba_id,w.access_token);
    const appId=String(process.env.META_APP_ID||'');
    const subscribed=(subs?.data||[]).some(x=>String(x?.whatsapp_business_api_data?.id||x?.id||'')===appId);
    if(!subscribed) throw new Error('ClinicChatDesk is not currently subscribed to this WhatsApp Business Account.');
    const t=new Date().toISOString();
    setWhatsAppConnectionHealth(businessId,{status:'connected',last_verified_at:t,last_error:null,display_number:assets.displayNumber,verified_name:assets.verifiedName});
    return {ok:true,connection:getWhatsAppConnection(businessId)};
  }catch(e){ setWhatsAppConnectionHealth(businessId,{status:'attention',last_error:e.message}); return {ok:false,error:e.message,connection:getWhatsAppConnection(businessId)}; }
}

export async function disconnectEmbeddedConnection(businessId){
  const w=getWhatsAppConnection(businessId,true); if(!w) return {ok:true};
  let warning='';
  if(w.access_token&&w.waba_id&&countWhatsAppConnectionsByWaba(w.waba_id)<=1){
    try{ await tokenGraph(`/${encodeURIComponent(w.waba_id)}/subscribed_apps`,w.access_token,{method:'DELETE'}); }
    catch(e){ warning=e.message; }
  }
  clearWhatsAppConnection(businessId);
  return {ok:true,warning};
}

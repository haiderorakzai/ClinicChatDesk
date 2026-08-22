import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadEnv, envBool } from './env.mjs';
loadEnv();
import { verifyPassword } from './crypto.mjs';
import { clearCookie, getCurrentUser, logout, requireUser, sessionCookie, startSession } from './auth.mjs';
import { automationStats, businessByPhoneNumberId, cancelAppointment, cleanupExpiredDemoClinics, cleanupSessions, connectWhatsAppManaged, createClinicWithOwner, createDemoClinic, createService, createStaff, dashboard, dbInfo, findUserByEmail, getBusinessBundle, getConversationMessages, getConversationTarget, getOnboardingState, getOrCreateConversation, getUserById, getWhatsAppConnection, initDb, listAppointments, listCancellationOpportunities, listClinics, listConversations, listStaff, listRecoveryCases, purgeOldMessages, saveMessage, setHandoff, superAutomationStats, superSetClinic, updateBusiness, updateConfig, updateOnboarding, updateService, updateStaff } from './db.mjs';
import { processIncoming, transcribeAudio } from './ai.mjs';
import { runAutomationTick } from './automation.mjs';
import { handleWhatsAppPayload, sendWhatsApp, verifyMetaSignature, verifyWebhook } from './whatsapp.mjs';
import { canUseMetaReviewConnection, completeEmbeddedSignup, connectMetaReviewNumber, createMessageTemplate, disconnectEmbeddedConnection, listMessageTemplates, metaPublicConfig, retryEmbeddedConnection, verifyEmbeddedConnection } from './meta.mjs';

initDb(); cleanupSessions(); cleanupExpiredDemoClinics(); purgeOldMessages(Number(process.env.MESSAGE_RETENTION_DAYS||30));
setInterval(()=>{try{cleanupSessions();cleanupExpiredDemoClinics();purgeOldMessages(Number(process.env.MESSAGE_RETENTION_DAYS||30));}catch{}},12*60*60*1000).unref();
setInterval(()=>runAutomationTick().catch(e=>console.error('Automation tick error:',e.message)),60_000).unref();
setTimeout(()=>runAutomationTick().catch(e=>console.error('Initial automation tick error:',e.message)),5_000).unref();

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(__dirname,'../public');
const port=Number(process.env.PORT||3100);
const isProd=(process.env.NODE_ENV||'development')==='production';
const publicUrl=process.env.PUBLIC_URL||`http://localhost:${port}`;

function securityHeaders(){return{'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), geolocation=()','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://connect.facebook.net; connect-src 'self' https://connect.facebook.net https://graph.facebook.com https://www.facebook.com; frame-src https://www.facebook.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"};}
function send(res,status,data,extra={}){const isText=typeof data==='string';const body=isText?data:JSON.stringify(data);res.writeHead(status,{'Content-Type':isText?'text/plain; charset=utf-8':'application/json; charset=utf-8','Cache-Control':'no-store',...securityHeaders(),...extra});res.end(body);}
async function readRaw(req,limit=1_000_000){const chunks=[];let total=0;for await(const c of req){total+=c.length;if(total>limit)throw new Error('Request too large.');chunks.push(c);}return Buffer.concat(chunks);}
async function parseBody(req,limit=1_000_000){const raw=await readRaw(req,limit);let json={};if(raw.length){try{json=JSON.parse(raw.toString('utf8'));}catch{throw new Error('Invalid JSON.');}}return{raw,json};}
function sameOrigin(req){if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return true;const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host;}catch{return false;}}
function staticFile(res,rel){rel=path.normalize(rel).replace(/^(\.\.[/\\])+/, '');const full=path.join(publicDir,rel);if(!full.startsWith(publicDir)||!fs.existsSync(full)||fs.statSync(full).isDirectory())return false;const ext=path.extname(full);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':(ext==='.html'||ext==='.js'||ext==='.css')?'no-store':'public, max-age=3600',...securityHeaders()});fs.createReadStream(full).pipe(res);return true;}
function redirect(res,to){res.writeHead(302,{Location:to,'Cache-Control':'no-store',...securityHeaders()});res.end();}
function authedClinic(req,res){cleanupExpiredDemoClinics();const u=requireUser(req,['clinic_admin']);if(!u){send(res,401,{error:'Authentication required.'});return null;}return u;}
function authedSuper(req,res){const u=requireUser(req,['super_admin']);if(!u){send(res,401,{error:'Super admin required.'});return null;}return u;}

const loginAttempts=new Map();
function rateLimitLogin(ip){const t=Date.now();let x=loginAttempts.get(ip)||{n:0,reset:t+15*60_000};if(t>x.reset)x={n:0,reset:t+15*60_000};x.n++;loginAttempts.set(ip,x);return x.n<=12;}

const demoStarts=new Map();
function rateLimitDemo(ip){const t=Date.now(),limit=Math.max(1,Number(process.env.DEMO_STARTS_PER_IP_PER_HOUR||3));let x=demoStarts.get(ip)||{n:0,reset:t+60*60_000};if(t>x.reset)x={n:0,reset:t+60*60_000};x.n++;demoStarts.set(ip,x);return x.n<=limit;}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if(!sameOrigin(req)) return send(res,403,{error:'Origin rejected.'});
    if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'clinicchatdesk-saas',version:'2.6.11',demoMode:envBool('DEMO_MODE',true)});
    if(req.method==='GET'&&url.pathname==='/api/public-config')return send(res,200,{appName:process.env.APP_NAME||'ClinicChatDesk',publicUrl,trialDays:Number(process.env.TRIAL_DAYS||14),prices:{starter:Number(process.env.STARTER_PRICE_USD||99),pro:Number(process.env.PRO_PRICE_USD||249),growth:Number(process.env.GROWTH_PRICE_USD||499)},meta:metaPublicConfig()});
    if(req.method==='GET'&&url.pathname==='/api/me'){const u=getCurrentUser(req);return send(res,200,{user:u?getUserById(u.id):null});}

    if(req.method==='POST'&&url.pathname==='/api/demo/start'){
      const ip=req.headers['x-forwarded-for']?.split(',')[0]?.trim()||req.socket.remoteAddress||'unknown';
      if(!rateLimitDemo(ip))return send(res,429,{error:'Too many demo sessions from this network. Please try again later.'});
      const {json}=await parseBody(req);logout(req);const demo=createDemoClinic(json);const s=startSession(demo.userId);return send(res,201,{ok:true,expires:demo.expires},{'Set-Cookie':sessionCookie(s.token,s.expires,isProd)});
    }

    if(req.method==='POST'&&url.pathname==='/api/auth/signup'){
      const {json}=await parseBody(req);const result=createClinicWithOwner(json);const user=findUserByEmail(json.email);const s=startSession(user.id);return send(res,201,{ok:true,businessId:result.businessId,user:getUserById(user.id)},{'Set-Cookie':sessionCookie(s.token,s.expires,isProd)});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/login'){
      const ip=req.socket.remoteAddress||'unknown';if(!rateLimitLogin(ip))return send(res,429,{error:'Too many login attempts. Try again later.'});
      const {json}=await parseBody(req);const user=findUserByEmail(json.email||'');if(!user||!user.active||!verifyPassword(json.password||'',user.password_hash))return send(res,401,{error:'Invalid email or password.'});const s=startSession(user.id);return send(res,200,{ok:true,user:getUserById(user.id)},{'Set-Cookie':sessionCookie(s.token,s.expires,isProd)});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/logout'){logout(req);return send(res,200,{ok:true},{'Set-Cookie':clearCookie(isProd)});}

    if(url.pathname.startsWith('/api/clinic/')){
      const u=authedClinic(req,res);if(!u)return;
      if(req.method==='GET'&&url.pathname==='/api/clinic/dashboard')return send(res,200,{...dashboard(u.business_id),metaReview:{allowed:canUseMetaReviewConnection(u)}});
      if(req.method==='GET'&&url.pathname==='/api/clinic/business')return send(res,200,getBusinessBundle(u.business_id));
      if(req.method==='POST'&&url.pathname==='/api/clinic/business'){const {json}=await parseBody(req);return send(res,200,{business:updateBusiness(u.business_id,json)});}
      if(req.method==='POST'&&url.pathname==='/api/clinic/config'){const {json}=await parseBody(req);return send(res,200,{config:updateConfig(u.business_id,json)});}
      if(req.method==='POST'&&url.pathname==='/api/clinic/services'){const {json}=await parseBody(req);return send(res,201,{service:createService(u.business_id,json)});}
      const sm=url.pathname.match(/^\/api\/clinic\/services\/([^/]+)$/);if(req.method==='POST'&&sm){const {json}=await parseBody(req);return send(res,200,{service:updateService(u.business_id,sm[1],json)});}
      if(req.method==='GET'&&url.pathname==='/api/clinic/staff')return send(res,200,{staff:listStaff(u.business_id)});
      if(req.method==='POST'&&url.pathname==='/api/clinic/staff'){const {json}=await parseBody(req);return send(res,201,{staff:createStaff(u.business_id,json)});}
      const stm=url.pathname.match(/^\/api\/clinic\/staff\/([^/]+)$/);if(req.method==='POST'&&stm){const {json}=await parseBody(req);return send(res,200,{staff:updateStaff(u.business_id,stm[1],json)});}
      if(req.method==='GET'&&url.pathname==='/api/clinic/onboarding')return send(res,200,getOnboardingState(u.business_id));
      if(req.method==='POST'&&url.pathname==='/api/clinic/onboarding'){const {json}=await parseBody(req);return send(res,200,updateOnboarding(u.business_id,json));}
      if(req.method==='GET'&&url.pathname==='/api/clinic/conversations')return send(res,200,{conversations:listConversations(u.business_id)});
      const mm=url.pathname.match(/^\/api\/clinic\/conversations\/([^/]+)\/messages$/);
      if(req.method==='GET'&&mm)return send(res,200,{messages:getConversationMessages(u.business_id,mm[1])});
      if(req.method==='POST'&&mm){const target=getConversationTarget(u.business_id,mm[1]);if(!target)return send(res,404,{error:'Conversation not found.'});if(target.channel!=='whatsapp')return send(res,400,{error:'Manual sending is available for WhatsApp conversations only.'});const {json}=await parseBody(req);const text=String(json.text||'').trim();if(!text)return send(res,400,{error:'Message text is required.'});if(text.length>4096)return send(res,400,{error:'Message is too long.'});setHandoff(u.business_id,mm[1],true);try{const result=await sendWhatsApp(u.business_id,target.customer_phone,text);const externalId=result?.messages?.[0]?.id||null;saveMessage(mm[1],'assistant',text,externalId,{manual:true,sent_by:u.id});return send(res,200,{ok:true,message_id:externalId});}catch(e){return send(res,502,{error:e.message});}}
      const hm=url.pathname.match(/^\/api\/clinic\/conversations\/([^/]+)\/handoff$/);if(req.method==='POST'&&hm){const {json}=await parseBody(req);setHandoff(u.business_id,hm[1],!!json.enabled);return send(res,200,{ok:true});}
      if(req.method==='GET'&&url.pathname==='/api/clinic/appointments')return send(res,200,{appointments:listAppointments(u.business_id)});
      const cam=url.pathname.match(/^\/api\/clinic\/appointments\/([^/]+)\/cancel$/);if(req.method==='POST'&&cam){const {json}=await parseBody(req);const result=cancelAppointment(u.business_id,cam[1],json.reason||'Cancelled by clinic');setImmediate(()=>runAutomationTick({businessId:u.business_id}).catch(()=>{}));return send(res,200,result);}
      if(req.method==='GET'&&url.pathname==='/api/clinic/revenue-recovery')return send(res,200,{stats:automationStats(u.business_id),recoveryCases:listRecoveryCases(u.business_id),cancellations:listCancellationOpportunities(u.business_id)});
      if(req.method==='POST'&&url.pathname==='/api/clinic/automation/run'){const results=await runAutomationTick({businessId:u.business_id});return send(res,200,{ok:true,results});}
      if(req.method==='GET'&&url.pathname==='/api/clinic/whatsapp')return send(res,200,{whatsapp:getWhatsAppConnection(u.business_id),meta:metaPublicConfig(),review:{allowed:canUseMetaReviewConnection(u)}});
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/review-connect'){
        const bundle=getBusinessBundle(u.business_id);if(bundle.business?.is_demo)return send(res,403,{error:'The public demo cannot connect a real WhatsApp account.'});
        try{const result=await connectMetaReviewNumber(u.business_id,u);return send(res,200,{ok:true,...result});}catch(e){return send(res,403,{error:e.message});}
      }
      if(req.method==='GET'&&url.pathname==='/api/clinic/whatsapp/templates'){try{return send(res,200,{templates:await listMessageTemplates(u.business_id)});}catch(e){return send(res,502,{error:e.message});}}
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/templates'){const bundle=getBusinessBundle(u.business_id);if(bundle.business?.is_demo)return send(res,403,{error:'The public demo cannot manage a real WhatsApp account.'});const {json}=await parseBody(req,100_000);try{return send(res,201,{ok:true,template:await createMessageTemplate(u.business_id,json)});}catch(e){return send(res,502,{error:e.message});}}
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/embedded/complete'){
        const bundle=getBusinessBundle(u.business_id);if(bundle.business?.is_demo)return send(res,403,{error:'The public demo cannot connect a real WhatsApp account.'});
        const {json}=await parseBody(req,100_000);const result=await completeEmbeddedSignup({businessId:u.business_id,code:json.code,wabaId:json.waba_id||json.wabaId,phoneNumberId:json.phone_number_id||json.phoneNumberId,metaBusinessId:json.business_id||json.businessId,onboardingMode:json.onboarding_mode||json.onboardingMode});return send(res,200,{ok:true,...result});
      }
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/retry'){const result=await retryEmbeddedConnection(u.business_id);return send(res,200,{ok:true,whatsapp:result});}
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/verify'){const result=await verifyEmbeddedConnection(u.business_id);return send(res,result.ok?200:409,result);}
      if(req.method==='POST'&&url.pathname==='/api/clinic/whatsapp/disconnect'){const result=await disconnectEmbeddedConnection(u.business_id);return send(res,200,result);}
      if(req.method==='POST'&&url.pathname==='/api/clinic/test-chat'){const {json}=await parseBody(req);const phone=String(json.phone||'+10000000000');const {customer,conversation}=getOrCreateConversation(u.business_id,phone,json.name||'Test Patient','web');const result=await processIncoming({businessId:u.business_id,customer,conversation,text:String(json.message||'')});return send(res,200,result);}
      if(req.method==='POST'&&url.pathname==='/api/clinic/test-voice'){
        if(envBool('DEMO_MODE',true)||!process.env.OPENAI_API_KEY)return send(res,400,{error:'Voice-note transcription needs live OpenAI mode. Set OPENAI_API_KEY and DEMO_MODE=false.'});
        const bundle=getBusinessBundle(u.business_id),cfg=bundle.config;if(!cfg.voice_notes_enabled)return send(res,400,{error:'Voice-note receptionist is disabled in AI Settings.'});
        if(bundle.business?.is_demo && automationStats(u.business_id).voiceNotes>=3)return send(res,429,{error:'This demo allows up to 3 voice-note tests. Start your own trial for continued testing.'});
        const raw=await readRaw(req,16*1024*1024);if(!raw.length)return send(res,400,{error:'Choose an audio file first.'});
        const mime=String(req.headers['content-type']||'audio/ogg').split(';')[0];let filename=decodeURIComponent(url.searchParams.get('filename')||'voice-note.ogg');
        if(/\.opus$/i.test(filename))filename=filename.replace(/\.opus$/i,'.ogg');
        try{
          const transcript=await transcribeAudio({buffer:raw,mimeType:mime,filename,businessId:u.business_id});if(!transcript)return send(res,422,{error:'The voice note was received but no speech could be transcribed. Try a clearer recording.'});
          const {customer,conversation}=getOrCreateConversation(u.business_id,'+10000000001','Voice Demo Patient','web');const result=await processIncoming({businessId:u.business_id,customer,conversation,text:transcript,messageMeta:{message_type:'voice',transcription_status:'completed',local_demo:true}});return send(res,200,{transcript,...result});
        }catch(e){
          console.error('Voice-note test error:',e.message);
          const msg=String(e.message||'');
          if(/transcription error 4\d\d/i.test(msg))return send(res,422,{error:'This audio file could not be transcribed. WhatsApp .opus files are handled as OGG in v2.6.2; if it still fails, try an OGG, MP3, M4A, WAV, or WEBM file.'});
          return send(res,502,{error:'Voice-note transcription failed. Check the OpenAI transcription model/API configuration and Railway logs for the exact provider error.'});
        }
      }
    }

    if(url.pathname.startsWith('/api/super/')){
      const u=authedSuper(req,res);if(!u)return;
      if(req.method==='GET'&&url.pathname==='/api/super/clinics')return send(res,200,{clinics:listClinics(),automation:superAutomationStats()});
      const cm=url.pathname.match(/^\/api\/super\/clinics\/([^/]+)$/);if(req.method==='POST'&&cm){const {json}=await parseBody(req);return send(res,200,{business:superSetClinic(cm[1],json)});}
      const wm=url.pathname.match(/^\/api\/super\/clinics\/([^/]+)\/whatsapp$/);if(req.method==='POST'&&wm){const {json}=await parseBody(req);return send(res,200,{whatsapp:connectWhatsAppManaged(wm[1],json)});}
      if(req.method==='GET'&&url.pathname==='/api/super/system')return send(res,200,{db:dbInfo(),publicUrl,environment:process.env.NODE_ENV||'development',openaiConfigured:!!process.env.OPENAI_API_KEY,transcribeModel:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',metaConfigured:metaPublicConfig().ready,automation:superAutomationStats()});
    }

    if(req.method==='GET'&&url.pathname==='/webhook/whatsapp'){const c=verifyWebhook(url);return c===null?send(res,403,'Forbidden'):send(res,200,c);}
    if(req.method==='POST'&&url.pathname==='/webhook/whatsapp'){const {raw,json}=await parseBody(req);if(!verifyMetaSignature(raw,req.headers['x-hub-signature-256']))return send(res,401,{error:'Invalid webhook signature.'});send(res,200,{received:true});setImmediate(()=>handleWhatsAppPayload(json).catch(e=>console.error('WhatsApp webhook error:',e.message)));return;}

    if(req.method==='GET'){
      if(url.pathname==='/')return staticFile(res,'index.html')||send(res,404,'Not found');
      if(url.pathname==='/login')return staticFile(res,'login.html')||send(res,404,'Not found');
      if(url.pathname==='/signup')return staticFile(res,'signup.html')||send(res,404,'Not found');
      if(url.pathname==='/demo')return staticFile(res,'demo.html')||send(res,404,'Not found');
      if(url.pathname==='/app'){const u=getCurrentUser(req);if(!u)return redirect(res,'/login');if(u.role==='super_admin')return redirect(res,'/super-admin');return staticFile(res,'app.html')||send(res,404,'Not found');}
      if(url.pathname==='/super-admin'){const u=getCurrentUser(req);if(!u)return redirect(res,'/login');if(u.role!=='super_admin')return redirect(res,'/app');return staticFile(res,'super.html')||send(res,404,'Not found');}
      if(url.pathname==='/privacy')return staticFile(res,'privacy.html')||send(res,404,'Not found');
      if(url.pathname==='/terms')return staticFile(res,'terms.html')||send(res,404,'Not found');
      if(url.pathname==='/pricing')return staticFile(res,'pricing.html')||send(res,404,'Not found');
      if(url.pathname==='/meta/embedded-signup/callback')return redirect(res,'/app?whatsapp=return');
      if(staticFile(res,url.pathname.slice(1)))return;
    }
    return send(res,404,{error:'Not found'});
  }catch(e){console.error(e);return send(res,500,{error:isProd?'Something went wrong.':e.message});}
});

server.on('error',(err)=>{
  if(err?.code==='EADDRINUSE'){
    console.error(`\nPort ${port} is already in use. Close the older ClinicChatDesk/ClinicAI window and run START_LOCAL_WINDOWS.bat again.`);
  } else {
    console.error(err);
  }
});

server.listen(port,'0.0.0.0',()=>{
  const url=`http://localhost:${port}`;
  console.log(`ClinicChatDesk SaaS running on ${url}`);
  if(process.platform==='win32' && envBool('AUTO_OPEN_BROWSER',false)){
    try{
      const child=spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',`Start-Process '${url}'`],{detached:true,stdio:'ignore'});
      child.unref();
    }catch(e){
      console.log(`Open ${url} in your browser.`);
    }
  }
});

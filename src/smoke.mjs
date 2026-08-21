import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { DatabaseSync } from 'node:sqlite';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clinicchatdesk-smoke-'));process.env.DATA_DIR=dir;process.env.SUPER_ADMIN_EMAIL='smoke-owner@example.com';process.env.SUPER_ADMIN_PASSWORD='SmokePassword123!';process.env.DEMO_MODE='true';process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');process.env.META_APP_ID='123456789';process.env.META_APP_SECRET='smoke-meta-secret';process.env.META_EMBEDDED_SIGNUP_CONFIG_ID='smoke-config';process.env.META_GRAPH_VERSION='v26.0';
const db=await import('./db.mjs');db.initDb();
const c=db.createClinicWithOwner({clinicName:'Smoke Dental',ownerName:'Owner',email:'smoke-clinic@example.com',password:'Password123!'});
const hours={sun:['09:00','18:00'],mon:['09:00','18:00'],tue:['09:00','18:00'],wed:['09:00','18:00'],thu:['09:00','18:00'],fri:['09:00','18:00'],sat:['09:00','18:00']};db.updateConfig(c.businessId,{opening_hours:hours,recovery_delay_minutes:15,lost_lead_recovery:true,cancellation_autofill:true,voice_notes_enabled:true});db.createService(c.businessId,{name:'Dental Cleaning',price:200,duration_minutes:30});
const bundle=db.getBusinessBundle(c.businessId);if(bundle.business.name!=='Smoke Dental'||bundle.business.currency!=='USD'||bundle.business.timezone!=='UTC'||bundle.services.length!==1||bundle.services[0].currency!=='USD')throw new Error('Base clinic/localization smoke failed');
const staff=db.createStaff(c.businessId,{name:'Dr. Smoke',specialty:'Dentist'});if(!staff.id||db.listStaff(c.businessId).length!==1)throw new Error('Clinic team smoke failed');db.updateOnboarding(c.businessId,{step:4});if(db.getOnboardingState(c.businessId).step!==4)throw new Error('Onboarding progress smoke failed');

// Lost-lead recovery detection.
const lost=db.getOrCreateConversation(c.businessId,'+10001','Lost Lead','whatsapp');db.saveMessage(lost.conversation.id,'user','How much is Dental Cleaning?');db.upsertLead(c.businessId,lost.customer.id,'Dental Cleaning');
const raw=new DatabaseSync(db.dbInfo().dbPath);const old=new Date(Date.now()-2*60*60*1000).toISOString();raw.prepare("UPDATE messages SET created_at=? WHERE conversation_id=? AND role='user'").run(old,lost.conversation.id);raw.close();
const queued=db.queueLostLeadRecoveries(c.businessId);if(queued<1||!db.listRecoveryCases(c.businessId).some(x=>x.customer_id===lost.customer.id&&x.status==='queued'))throw new Error('Lost Lead Recovery smoke failed');

// Cancellation auto-fill: one patient is interested, another cancels the slot.
const candidate=db.getOrCreateConversation(c.businessId,'+10002','Waitlist Patient','whatsapp');db.saveMessage(candidate.conversation.id,'user','I want Dental Cleaning');db.upsertLead(c.businessId,candidate.customer.id,'Dental Cleaning');
const booked=db.getOrCreateConversation(c.businessId,'+10003','Booked Patient','whatsapp');const date=new Date(Date.now()+86400000).toISOString().slice(0,10);const apt=db.createAppointment(c.businessId,booked.customer.id,'Dental Cleaning',date,'10:00');const cancelled=db.cancelAppointment(c.businessId,apt.id,'Smoke cancellation');if(!cancelled.opportunity)throw new Error('Cancellation opportunity not created');
const next=db.nextCancellationOffers(c.businessId,5)[0];if(!next||next.customer_id!==candidate.customer.id)throw new Error('Cancellation candidate queue failed');db.markCancellationOfferSent(next.id,20);const refilled=db.acceptCancellationOffer(c.businessId,next.id,candidate.customer.id);if(refilled.source!=='cancellation_autofill')throw new Error('Cancellation auto-fill source failed');

// Voice-note audit path (actual OpenAI transcription requires a live API key).
const voice=db.getOrCreateConversation(c.businessId,'+10004','Voice Patient','whatsapp');db.saveMessage(voice.conversation.id,'user','I need an appointment',null,{message_type:'voice',transcription_status:'completed'});const stats=db.automationStats(c.businessId);if(stats.cancellation.filled!==1||stats.cancellation.recoveredValue!==200||stats.voiceNotes!==1)throw new Error('Revenue/voice stats smoke failed');
const demo=db.createDemoClinic({countryCode:'PK',phoneCountryCode:'+92',currency:'PKR',timezone:'Asia/Karachi'});const demoDash=db.dashboard(demo.businessId);if(!demoDash.business.is_demo||demoDash.business.currency!=='PKR'||demoDash.services.some(x=>x.currency!=='PKR')||demoDash.automation.totalRecoveredValue<=0)throw new Error('Live demo/localization smoke failed');db.updateBusiness(demo.businessId,{currency:'AED',phone_country_code:'+971',country_code:'AE'});if(db.getBusinessBundle(demo.businessId).services.some(x=>x.currency!=='AED'))throw new Error('Clinic-level currency sync failed');

// v2.5 Meta Embedded Signup backend path. Network calls are mocked; secrets must
// still be encrypted in the real SQLite connection record.
const realFetch=globalThis.fetch;const metaCalls=[];
globalThis.fetch=async(input,opts={})=>{
  const url=String(input);metaCalls.push({url,method:opts.method||'GET'});
  const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
  if(url.includes('/oauth/access_token'))return json({access_token:'SMOKE_BISU_TOKEN',token_type:'bearer'});
  if(url.includes('/debug_token'))return json({data:{app_id:'123456789',is_valid:true,granular_scopes:[{scope:'whatsapp_business_management',target_ids:['waba_smoke']},{scope:'whatsapp_business_messaging',target_ids:['waba_smoke']}]}});
  if(url.includes('/waba_smoke/phone_numbers'))return json({data:[{id:'phone_smoke',display_phone_number:'+15551234567',verified_name:'Smoke Dental'}]});
  if(url.includes('/waba_new/phone_numbers'))return json({data:[{id:'phone_new',display_phone_number:'+15557654321',verified_name:'New Number Clinic'}]});
  if(url.includes('/phone_new/register')&&(opts.method||'GET')==='POST')return json({success:true});
  if(url.includes('/waba_smoke/subscribed_apps')&&(opts.method||'GET')==='POST')return json({success:true});
  if(url.includes('/waba_new/subscribed_apps')&&(opts.method||'GET')==='POST')return json({success:true});
  if(url.includes('/waba_smoke/subscribed_apps'))return json({data:[{whatsapp_business_api_data:{id:'123456789',name:'ClinicChatDesk'}}]});
  if(url.includes('/waba_new/subscribed_apps'))return json({data:[{whatsapp_business_api_data:{id:'123456789',name:'ClinicChatDesk'}}]});
  return json({error:{message:'Unexpected mock request'}},404);
};
try{
  const meta=await import('./meta.mjs');
  const completed=await meta.completeEmbeddedSignup({businessId:c.businessId,code:'smoke-code',wabaId:'waba_smoke',phoneNumberId:'phone_smoke',metaBusinessId:'business_smoke'});
  const wa=db.getWhatsAppConnection(c.businessId);if(completed.connection.status!=='connected'||wa.connection_source!=='embedded_signup'||wa.phone_number_id!=='phone_smoke'||wa.display_number!=='+15551234567'||!wa.access_token_configured)throw new Error('Embedded Signup save/encryption smoke failed');
  if('access_token' in wa)throw new Error('Access token leaked through public WhatsApp connection getter');
  if(db.getWhatsAppConnection(c.businessId,true).access_token!=='SMOKE_BISU_TOKEN')throw new Error('Encrypted WhatsApp token could not be recovered server-side');
  const verified=await meta.verifyEmbeddedConnection(c.businessId);if(!verified.ok)throw new Error('Embedded Signup verification smoke failed');
  if(!metaCalls.some(x=>x.url.includes('/subscribed_apps')&&x.method==='POST'))throw new Error('WABA subscription call was not made');
  const c2=db.createClinicWithOwner({clinicName:'New Number Clinic',ownerName:'Owner 2',email:'new-number@example.com',password:'Password123!'});
  await meta.completeEmbeddedSignup({businessId:c2.businessId,code:'smoke-code-new',wabaId:'waba_new',phoneNumberId:'phone_new',onboardingMode:'new'});
  const wa2=db.getWhatsAppConnection(c2.businessId,true);if(wa2.status!=='connected'||wa2.onboarding_mode!=='new'||!wa2.two_step_pin||!/^[0-9]{6}$/.test(wa2.two_step_pin))throw new Error('New-number auto-registration/PIN smoke failed');
  if(!metaCalls.some(x=>x.url.includes('/phone_new/register')&&x.method==='POST'))throw new Error('New Cloud API phone registration call was not made');
}finally{globalThis.fetch=realFetch;}

console.log('ClinicChatDesk v2.6 smoke test passed: onboarding wizard, clinic team, automatic Meta Embedded Signup, encrypted WhatsApp credentials, webhook subscription, localization, live demo, Revenue Recovery, Cancellation Auto-Fill, and Voice-Note tracking.');fs.rmSync(dir,{recursive:true,force:true});

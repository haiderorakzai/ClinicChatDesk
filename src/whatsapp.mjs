import { createHmac, timingSafeEqual } from 'node:crypto';
import { businessByPhoneNumberId, getBusinessConfig, getOrCreateConversation, getWhatsAppConnection, saveMessage } from './db.mjs';
import { processIncoming, transcribeAudio } from './ai.mjs';

export function verifyWebhook(url){const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');return mode==='subscribe'&&token===process.env.WHATSAPP_VERIFY_TOKEN?challenge:null;}
export function verifyMetaSignature(raw,header){if(!process.env.META_APP_SECRET)return process.env.NODE_ENV!=='production';if(!header?.startsWith('sha256='))return false;const expected='sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(raw).digest('hex');const a=Buffer.from(expected),b=Buffer.from(header);return a.length===b.length&&timingSafeEqual(a,b);}

function graphVersion(){return process.env.META_GRAPH_VERSION||'v26.0';}
async function graphJson(url,token,opts={}){const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});if(!r.ok)throw new Error(`Meta API error ${r.status}: ${await r.text()}`);return r.json();}

export async function sendWhatsApp(businessId,to,text){
  const w=getWhatsAppConnection(businessId,true);if(!w?.access_token||!w.phone_number_id)throw new Error('WhatsApp is not connected for this clinic.');
  return graphJson(`https://graph.facebook.com/${graphVersion()}/${w.phone_number_id}/messages`,w.access_token,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})});
}

export async function sendWhatsAppTemplate(businessId,to,templateName,language='en_US'){
  const w=getWhatsAppConnection(businessId,true);if(!w?.access_token||!w.phone_number_id)throw new Error('WhatsApp is not connected for this clinic.');
  if(!templateName)throw new Error('WhatsApp template name is required.');
  return graphJson(`https://graph.facebook.com/${graphVersion()}/${w.phone_number_id}/messages`,w.access_token,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:templateName,language:{code:language}}})});
}

export async function downloadWhatsAppMedia(businessId,mediaId){
  const w=getWhatsAppConnection(businessId,true);if(!w?.access_token)throw new Error('WhatsApp is not connected for this clinic.');
  const meta=await graphJson(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}`,w.access_token);
  if(!meta?.url)throw new Error('Meta did not return a media URL.');
  const r=await fetch(meta.url,{headers:{Authorization:`Bearer ${w.access_token}`}});if(!r.ok)throw new Error(`WhatsApp media download error ${r.status}: ${await r.text()}`);
  const len=Number(r.headers.get('content-length')||0);if(len>16*1024*1024)throw new Error('Voice note exceeds the supported 16 MB limit.');
  const buffer=Buffer.from(await r.arrayBuffer());if(buffer.length>16*1024*1024)throw new Error('Voice note exceeds the supported 16 MB limit.');
  return {buffer,mimeType:r.headers.get('content-type')||meta.mime_type||'audio/ogg'};
}

async function handleTextMessage({business,phone,name,msg}){
  const {customer,conversation}=getOrCreateConversation(business.id,phone,name,'whatsapp');
  const text=msg.text?.body||'';const inserted=saveMessage(conversation.id,'user',text,msg.id);if(!inserted)return;
  const result=await processIncoming({businessId:business.id,customer,conversation,text,alreadySaved:true});if(result.reply)await sendWhatsApp(business.id,phone,result.reply);
}

async function handleAudioMessage({business,phone,name,msg}){
  const cfg=getBusinessConfig(business.id);const {customer,conversation}=getOrCreateConversation(business.id,phone,name,'whatsapp');
  if(!cfg?.voice_notes_enabled){const placeholder='[Voice note received — voice-note AI is disabled for this clinic]';const inserted=saveMessage(conversation.id,'user',placeholder,msg.id,{message_type:'voice',media_id:msg.audio?.id||'',transcription_status:'disabled'});if(inserted)await sendWhatsApp(business.id,phone,'Please type your message, or the clinic team can enable voice-note assistance.');return;}
  const mediaId=msg.audio?.id;if(!mediaId)return;
  try{
    const media=await downloadWhatsAppMedia(business.id,mediaId);const ext=(media.mimeType.includes('mpeg')?'mp3':media.mimeType.includes('mp4')?'m4a':media.mimeType.includes('amr')?'amr':'ogg');
    const transcript=await transcribeAudio({buffer:media.buffer,mimeType:media.mimeType,filename:`voice-note.${ext}`,businessId:business.id});
    if(!transcript)throw new Error('Empty transcription.');
    const inserted=saveMessage(conversation.id,'user',transcript,msg.id,{message_type:'voice',media_id:mediaId,mime_type:media.mimeType,transcription_status:'completed'});if(!inserted)return;
    const result=await processIncoming({businessId:business.id,customer,conversation,text:transcript,alreadySaved:true,messageMeta:{message_type:'voice'}});if(result.reply)await sendWhatsApp(business.id,phone,result.reply);
  }catch(e){
    const inserted=saveMessage(conversation.id,'user','[Voice note could not be transcribed]',msg.id,{message_type:'voice',media_id:mediaId,transcription_status:'failed',error:String(e.message).slice(0,300)});
    if(inserted)await sendWhatsApp(business.id,phone,'I couldn’t clearly process that voice note. Please send it again or type your message, and clinic staff can also take over if needed.');
  }
}

export async function handleWhatsAppPayload(payload){
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const v=change?.value;const phoneNumberId=v?.metadata?.phone_number_id;if(!phoneNumberId)continue;const business=businessByPhoneNumberId(phoneNumberId);if(!business)continue;
    for(const msg of v?.messages||[]){
      const phone=msg.from;const name=v?.contacts?.find(c=>c.wa_id===phone)?.profile?.name||null;
      if(msg.type==='text')await handleTextMessage({business,phone,name,msg});
      else if(msg.type==='audio')await handleAudioMessage({business,phone,name,msg});
    }
  }
}

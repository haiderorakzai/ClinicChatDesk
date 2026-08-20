import { dueRecoveryCases, getBusinessConfig, getConversationState, markCancellationOfferSent, markCancellationOfferTemplateRequired, markRecoveryDismissed, markRecoverySent, markRecoveryTemplateRequired, nextCancellationOffers, queueLostLeadRecoveries, requeueTemplateRequiredAutomations, saveMessage, setConversationState } from './db.mjs';
import { sendWhatsApp, sendWhatsAppTemplate } from './whatsapp.mjs';

const withinCustomerWindow = iso => !!iso && (Date.now()-Date.parse(iso) < 24*60*60*1000);

function recoveryText(item){
  const who=item.customer_name?` ${item.customer_name}`:'';
  const service=item.service_name?` for ${item.service_name}`:'';
  return `Hi${who} — just checking in. Would you like me to help you find an appointment${service}? I can check available times here.`;
}
function cancellationText(item){
  const op=item.opportunity;
  return `An earlier ${op.service_name} appointment just became available on ${op.date} at ${op.time}. Would you like me to reserve this slot for you? Reply YES or NO.`;
}

async function sendRecovery(item){
  if(item.channel!=='whatsapp'){markRecoveryDismissed(item.id);return {kind:'recovery',id:item.id,status:'skipped_non_whatsapp'};}
  const text=recoveryText(item);
  if(withinCustomerWindow(item.last_user_at)){
    await sendWhatsApp(item.business_id,item.customer_phone,text);saveMessage(item.conversation_id,'assistant',text,null,{automation:'lost_lead_recovery'});markRecoverySent(item.id);return {kind:'recovery',id:item.id,status:'sent'};
  }
  const template=process.env.WHATSAPP_RECOVERY_TEMPLATE_NAME||'';
  if(template){
    await sendWhatsAppTemplate(item.business_id,item.customer_phone,template,process.env.WHATSAPP_RECOVERY_TEMPLATE_LANG||'en_US');
    saveMessage(item.conversation_id,'assistant',process.env.WHATSAPP_RECOVERY_TEMPLATE_PREVIEW||'[Approved lost-lead recovery template sent]',null,{automation:'lost_lead_recovery',template});markRecoverySent(item.id);return {kind:'recovery',id:item.id,status:'template_sent'};
  }
  markRecoveryTemplateRequired(item.id);return {kind:'recovery',id:item.id,status:'template_required'};
}

async function sendCancellationOffer(item){
  const cfg=getBusinessConfig(item.business_id);if(!cfg?.cancellation_autofill)return {kind:'cancellation',id:item.id,status:'disabled'};
  const text=cancellationText(item);let mode='freeform';
  if(withinCustomerWindow(item.last_user_at)) await sendWhatsApp(item.business_id,item.customer_phone,text);
  else {
    const template=process.env.WHATSAPP_CANCELLATION_TEMPLATE_NAME||'';
    if(!template){markCancellationOfferTemplateRequired(item.id);return {kind:'cancellation',id:item.id,status:'template_required'};}
    await sendWhatsAppTemplate(item.business_id,item.customer_phone,template,process.env.WHATSAPP_CANCELLATION_TEMPLATE_LANG||'en_US');mode='template';
  }
  const sent=markCancellationOfferSent(item.id,Number(process.env.CANCELLATION_OFFER_EXPIRY_MINUTES||20));
  const state=getConversationState(item.conversation_id);state.cancellation_offer={offer_id:item.id,opportunity_id:item.opportunity_id,service_name:item.opportunity.service_name,date:item.opportunity.date,time:item.opportunity.time,expires_at:sent.expires_at};setConversationState(item.conversation_id,state);
  saveMessage(item.conversation_id,'assistant',mode==='freeform'?text:(process.env.WHATSAPP_CANCELLATION_TEMPLATE_PREVIEW||'[Approved cancellation-slot offer template sent]'),null,{automation:'cancellation_autofill',template:mode==='template'});
  return {kind:'cancellation',id:item.id,status:mode==='freeform'?'sent':'template_sent'};
}

export async function runAutomationTick({businessId=null}={}){
  const results=[];
  requeueTemplateRequiredAutomations({businessId,recovery:!!process.env.WHATSAPP_RECOVERY_TEMPLATE_NAME,cancellation:!!process.env.WHATSAPP_CANCELLATION_TEMPLATE_NAME});
  queueLostLeadRecoveries(businessId);
  for(const item of dueRecoveryCases(businessId,20)){
    try{results.push(await sendRecovery(item));}catch(e){results.push({kind:'recovery',id:item.id,status:'error',error:e.message});}
  }
  for(const item of nextCancellationOffers(businessId,10)){
    try{results.push(await sendCancellationOffer(item));}catch(e){results.push({kind:'cancellation',id:item.id,status:'error',error:e.message});}
  }
  return results;
}

import { acceptCancellationOffer, cancelNextAppointmentForCustomer, createAppointment, declineCancellationOffer, findServiceByName, getBusinessBundle, getBusinessConfig, getConversationState, getUsage, incrementUsage, listServices, recentMessages, saveMessage, setConversationState, setHandoff, slotsForDate, upsertLead } from './db.mjs';
import { envBool } from './env.mjs';

const emergency = /\b(severe bleeding|can'?t breathe|cannot breathe|difficulty breathing|unconscious|chest pain|medical emergency|fainted|heavy bleeding)\b/i;
const yes = /^\s*(yes|yeah|yep|ok|okay|confirm|confirmed|please do|book it|go ahead|sure|نعم|ہاں|جی)\b/i;
const no = /^\s*(no|nope|cancel|not now|don't|do not|لا|نہیں)\b/i;

function businessDate(timezone='UTC'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); return `${o.year}-${o.month}-${o.day}`;
}

function systemPrompt(bundle) {
  const b=bundle.business,c=bundle.config; const services=bundle.services.map(s=>`${s.name}: ${s.currency} ${s.price} (${s.duration_minutes} min)`).join('\n');
  const faqs=(c.faqs||[]).map(x=>`Q: ${x.q||x.question||''}\nA: ${x.a||x.answer||''}`).join('\n');
  return `You are ${c.ai_name}, the AI receptionist for ${b.name}. You are a receptionist, not a doctor.\n\nToday in the clinic timezone (${b.timezone}) is ${businessDate(b.timezone)}.\n\nRules:\n- Keep replies short and natural for WhatsApp.\n- Never diagnose, prescribe, or give medical treatment advice.\n- Never invent prices, services, opening hours, doctors, policies, or appointment availability. Use tools for factual clinic data.\n- If a customer describes an urgent or medically concerning situation, call handoff_to_human.\n- For booking: use prepare_booking. Never claim an appointment is confirmed until the server confirms it on a later customer turn.\n- If the patient asks to cancel an upcoming appointment, use cancel_next_appointment.\n- Treat voice-note transcripts exactly like typed patient messages; do not mention transcription unless useful.\n- When unsure, say you will connect clinic staff.\n- Supported languages: ${(c.languages||[]).join(', ')}. Reply in the user's language when practical.\n- Tone: ${c.tone}.\n\nClinic address: ${b.address||'Not set'}\nClinic phone: ${b.phone||'Not set'}\n\nServices:\n${services||'No services configured yet.'}\n\nFAQs:\n${faqs||'No additional FAQs configured.'}`;
}

const toolDefs=[
  {type:'function',name:'get_service',description:'Get the clinic-approved price, duration and description for a service. Use when the patient asks about price/details.',parameters:{type:'object',properties:{service_name:{type:'string'}},required:['service_name'],additionalProperties:false}},
  {type:'function',name:'check_availability',description:'Check available appointment times for a specific service and date. This also records booking intent for lead recovery.',parameters:{type:'object',properties:{service_name:{type:'string'},date:{type:'string',description:'YYYY-MM-DD'}},required:['service_name','date'],additionalProperties:false}},
  {type:'function',name:'prepare_booking',description:'Prepare an appointment for customer confirmation. This DOES NOT book it yet.',parameters:{type:'object',properties:{service_name:{type:'string'},date:{type:'string'},time:{type:'string',description:'24h HH:MM'}},required:['service_name','date','time'],additionalProperties:false}},
  {type:'function',name:'cancel_next_appointment',description:'Cancel the patient’s next upcoming appointment, optionally matching a service.',parameters:{type:'object',properties:{service_name:{type:'string'}},required:[],additionalProperties:false}},
  {type:'function',name:'handoff_to_human',description:'Pause AI and request human clinic staff.',parameters:{type:'object',properties:{reason:{type:'string'}},required:['reason'],additionalProperties:false}}
];

async function toolCall({businessId,customerId,conversationId,name,args}){
  if(name==='get_service'){
    const s=findServiceByName(businessId,args.service_name); if(s) upsertLead(businessId,customerId,s.name);
    return s?{found:true,service:{name:s.name,description:s.description,price:s.price,currency:s.currency,duration_minutes:s.duration_minutes}}:{found:false};
  }
  if(name==='check_availability'){
    const r=slotsForDate(businessId,args.date,args.service_name); if(!r.error) upsertLead(businessId,customerId,r.service.name);
    return r.error?r:{service:r.service.name,date:args.date,slots:r.slots};
  }
  if(name==='prepare_booking'){
    const r=slotsForDate(businessId,args.date,args.service_name); if(r.error) return r; if(!r.slots.includes(args.time)) return {ok:false,error:'That slot is not available.',available_slots:r.slots};
    const state=getConversationState(conversationId); state.pending_booking={service_name:r.service.name,date:args.date,time:args.time,created_at:new Date().toISOString()}; setConversationState(conversationId,state); upsertLead(businessId,customerId,r.service.name);
    return {ok:true,needs_customer_confirmation:true,summary:{service:r.service.name,date:args.date,time:args.time,price:r.service.price,currency:r.service.currency},instruction:'Ask the customer to explicitly confirm. Do not say it is booked.'};
  }
  if(name==='cancel_next_appointment'){
    const result=cancelNextAppointmentForCustomer(businessId,customerId,args.service_name||'');
    return {ok:true,cancelled:{service:result.appointment.service_name,date:result.appointment.date,time:result.appointment.time},autofill_started:!!result.opportunity};
  }
  if(name==='handoff_to_human'){setHandoff(businessId,conversationId,true);return{ok:true,handoff:true};}
  return {error:'Unknown tool'};
}

async function demoReply({businessId,customerId,text}){
  const services=listServices(businessId); const found=services.find(s=>text.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
  if(/price|how much|cost/i.test(text)&&found){upsertLead(businessId,customerId,found.name);return `${found.name} is ${found.currency} ${found.price}. Would you like me to check appointment times?`;}
  if(/appointment|book|availability|available/i.test(text)&&found){upsertLead(businessId,customerId,found.name);return `I can help book ${found.name}. In live AI mode I’ll check the clinic's real configured slots and confirm only after you approve a time.`;}
  return `Thanks for contacting the clinic. I can help with services, prices and appointment booking. What would you like to know?`;
}

export async function transcribeAudio({buffer,mimeType='audio/ogg',filename='voice-note.ogg',businessId=null}){
  if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for voice-note transcription.');
  const form=new FormData();
  form.append('file',new Blob([buffer],{type:mimeType||'audio/ogg'}),filename||'voice-note.ogg');
  form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');
  const resp=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form});
  if(!resp.ok) throw new Error(`OpenAI transcription error ${resp.status}: ${await resp.text()}`);
  const data=await resp.json();
  if(businessId && data.usage?.type==='tokens') incrementUsage(businessId,{input_tokens:data.usage.input_tokens||0,output_tokens:data.usage.output_tokens||0});
  return String(data.text||'').trim();
}

export async function processIncoming({businessId,customer,conversation,text,alreadySaved=false,messageMeta={}}){
  if(!alreadySaved) saveMessage(conversation.id,'user',text,null,messageMeta);
  const cfg=getBusinessConfig(businessId); const state=getConversationState(conversation.id);

  // Cancellation auto-fill acceptance gets priority over normal booking logic.
  if(state.cancellation_offer){
    if(yes.test(text)){
      try{
        const apt=acceptCancellationOffer(businessId,state.cancellation_offer.offer_id,customer.id); delete state.cancellation_offer; setConversationState(conversation.id,state);
        const reply=`✅ Great — the earlier slot is yours. Your ${apt.service_name} appointment is booked for ${apt.date} at ${apt.time}.`; saveMessage(conversation.id,'assistant',reply); return{reply,booked:true,appointment:apt,cancellationAutofill:true};
      }catch(e){delete state.cancellation_offer;setConversationState(conversation.id,state);const reply='That cancellation slot is no longer available. I can help you check another appointment time.';saveMessage(conversation.id,'assistant',reply);return{reply};}
    }
    if(no.test(text)){declineCancellationOffer(businessId,state.cancellation_offer.offer_id,customer.id);delete state.cancellation_offer;setConversationState(conversation.id,state);const reply='No problem — I’ll leave that earlier slot for another patient.';saveMessage(conversation.id,'assistant',reply);return{reply,cancellationAutofillDeclined:true};}
  }

  if(state.pending_booking){
    if(yes.test(text)){
      try{const p=state.pending_booking;const apt=createAppointment(businessId,customer.id,p.service_name,p.date,p.time);delete state.pending_booking;setConversationState(conversation.id,state);const reply=`✅ Confirmed. Your ${apt.service_name} appointment is booked for ${apt.date} at ${apt.time}.`;saveMessage(conversation.id,'assistant',reply);return{reply,booked:true,appointment:apt};}
      catch(e){delete state.pending_booking;setConversationState(conversation.id,state);const reply=`That slot is no longer available. I can check another time for you.`;saveMessage(conversation.id,'assistant',reply);return{reply};}
    }
    if(no.test(text)){delete state.pending_booking;setConversationState(conversation.id,state);const reply='No problem — I did not book it. Would you like another time?';saveMessage(conversation.id,'assistant',reply);return{reply};}
  }
  if(emergency.test(text)){setHandoff(businessId,conversation.id,true);const reply='I’m connecting you with clinic staff. I can’t provide medical advice. If this is an emergency, please seek urgent medical care through your local emergency service.';saveMessage(conversation.id,'assistant',reply);return{reply,handoff:true};}
  if(conversation.human_handoff){return{reply:null,handoff:true};}
  if(!cfg?.auto_reply){return{reply:null,paused:true};}
  if(envBool('DEMO_MODE',true)||!process.env.OPENAI_API_KEY){const reply=await demoReply({businessId,customerId:customer.id,text});saveMessage(conversation.id,'assistant',reply);return{reply,demo:true};}

  const bundle=getBusinessBundle(businessId);
  if(bundle.business?.is_demo && getUsage(businessId).ai_requests>=Math.max(5,Number(process.env.DEMO_AI_REQUEST_LIMIT||15))){const reply='You have reached the AI message limit for this temporary demo. Start a free trial to continue testing with your own clinic workspace.';saveMessage(conversation.id,'assistant',reply);return{reply,demoLimit:true};}
  const input=[{role:'system',content:systemPrompt(bundle)},...recentMessages(conversation.id,14).map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.text}))];
  let payload={model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input,tools:toolDefs,store:false};
  for(let round=0;round<4;round++){
    const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!resp.ok) throw new Error(`OpenAI API error ${resp.status}: ${await resp.text()}`);
    const data=await resp.json(); incrementUsage(businessId,{input_tokens:data.usage?.input_tokens||0,output_tokens:data.usage?.output_tokens||0});
    const calls=(data.output||[]).filter(x=>x.type==='function_call');
    if(!calls.length){const reply=data.output_text||extractText(data)||'I’m sorry, I could not complete that request.';saveMessage(conversation.id,'assistant',reply);return{reply};}
    const outputs=[]; for(const call of calls){let args={};try{args=JSON.parse(call.arguments||'{}')}catch{} const result=await toolCall({businessId,customerId:customer.id,conversationId:conversation.id,name:call.name,args});outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});}
    payload={...payload,input:[...payload.input,...(data.output||[]),...outputs]};
  }
  const reply='I’m connecting you with clinic staff so they can help further.';setHandoff(businessId,conversation.id,true);saveMessage(conversation.id,'assistant',reply);return{reply,handoff:true};
}
function extractText(data){for(const o of data.output||[])for(const c of o.content||[])if(c.type==='output_text'&&c.text)return c.text;return'';}

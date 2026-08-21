const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
async function api(url,opts={}){const headers={...(opts.headers||{})};if(opts.body && typeof opts.body==='string' && !headers['Content-Type'])headers['Content-Type']='application/json';const r=await fetch(url,{...opts,headers});if(r.status===401){location.href='/login';throw new Error('Authentication required')}const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}
async function post(url,data){return api(url,{method:'POST',body:JSON.stringify(data)})}
let data=null,currentConv=null,localizationBound=false,setupLocalizationBound=false,publicConfig=null,metaSdkPromise=null,metaSdkReady=false,setupStep=1;
console.info('ClinicChatDesk frontend v2.6.5 loaded');
const days=['sun','mon','tue','wed','thu','fri','sat'];
function esc(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function money(v,currency){const n=Number(v||0);try{return new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'USD',maximumFractionDigits:0}).format(n)}catch{return `${currency||''} ${n.toFixed(0)}`}}
function niceStatus(s=''){return String(s).replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase())}
function ensureUiLayer(){
  let modal=qs('#ccdModal');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend',`<div id="ccdModal" class="ccd-modal-backdrop hidden" aria-hidden="true"><div class="ccd-modal" role="dialog" aria-modal="true" aria-labelledby="ccdModalTitle"><div class="ccd-modal-head"><div><span id="ccdModalKicker" class="page-kicker">ClinicChatDesk</span><h2 id="ccdModalTitle"></h2><p id="ccdModalSubtitle"></p></div><button type="button" class="ccd-modal-close" data-modal-close aria-label="Close">×</button></div><form id="ccdModalForm"><div id="ccdModalBody" class="ccd-modal-body"></div><div id="ccdModalError" class="ccd-modal-error hidden"></div><div class="ccd-modal-actions"><button type="button" class="btn ghost" data-modal-close>Cancel</button><button id="ccdModalSubmit" type="submit" class="btn brand">Save</button></div></form></div></div><div id="ccdToasts" class="ccd-toasts" aria-live="polite"></div>`);
    modal=qs('#ccdModal');
  }
  return modal;
}
function showToast(message,type='success',timeout=3400){
  ensureUiLayer();const box=qs('#ccdToasts'),item=document.createElement('div');item.className=`ccd-toast ${type}`;item.innerHTML=`<span class="ccd-toast-icon">${type==='error'?'!':type==='warn'?'i':'✓'}</span><div>${esc(message)}</div>`;box.appendChild(item);requestAnimationFrame(()=>item.classList.add('show'));setTimeout(()=>{item.classList.remove('show');setTimeout(()=>item.remove(),220)},timeout);
}
function uiDialog({title,subtitle='',kicker='ClinicChatDesk',fields=[],confirmText='Save',danger=false}={}){
  ensureUiLayer();const modal=qs('#ccdModal'),form=qs('#ccdModalForm'),body=qs('#ccdModalBody'),error=qs('#ccdModalError'),submit=qs('#ccdModalSubmit');
  qs('#ccdModalTitle').textContent=title||'Continue';qs('#ccdModalSubtitle').textContent=subtitle||'';qs('#ccdModalSubtitle').classList.toggle('hidden',!subtitle);qs('#ccdModalKicker').textContent=kicker;submit.textContent=confirmText;submit.className=`btn ${danger?'danger':'brand'}`;error.textContent='';error.classList.add('hidden');
  body.innerHTML=fields.map(f=>{const common=`name="${esc(f.name)}" ${f.required?'required':''} ${f.placeholder?`placeholder="${esc(f.placeholder)}"`:''}`;if(f.type==='textarea')return `<div class="field"><label>${esc(f.label)}</label><textarea ${common} rows="${f.rows||3}">${esc(f.value||'')}</textarea></div>`;return `<div class="field"><label>${esc(f.label)}</label><input ${common} type="${esc(f.type||'text')}" value="${esc(f.value??'')}" ${f.min!==undefined?`min="${esc(f.min)}"`:''} ${f.step!==undefined?`step="${esc(f.step)}"`:''} ${f.inputmode?`inputmode="${esc(f.inputmode)}"`:''}></div>`}).join('');
  modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  setTimeout(()=>body.querySelector('input,textarea')?.focus(),40);
  return new Promise(resolve=>{
    let done=false;const close=value=>{if(done)return;done=true;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');form.onsubmit=null;modal.querySelectorAll('[data-modal-close]').forEach(x=>x.onclick=null);modal.onclick=null;document.removeEventListener('keydown',onKey);resolve(value)};
    const onKey=e=>{if(e.key==='Escape')close(null)};document.addEventListener('keydown',onKey);
    modal.querySelectorAll('[data-modal-close]').forEach(x=>x.onclick=()=>close(null));modal.onclick=e=>{if(e.target===modal)close(null)};
    form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form),out=Object.fromEntries(fd);for(const f of fields){if(f.required&&!String(out[f.name]||'').trim()){error.textContent=`${f.label} is required.`;error.classList.remove('hidden');body.querySelector(`[name="${CSS.escape(f.name)}"]`)?.focus();return}}close(out)};
  });
}
function page(name){qsa('[id^="page-"]').forEach(x=>x.classList.add('hidden'));qs('#page-'+name).classList.remove('hidden');qsa('.side-nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(innerWidth<901)qs('#sidebar').classList.remove('open');if(name==='conversations')loadConversations();if(name==='appointments')loadAppointments();if(name==='recovery')loadRecovery();if(name==='team')renderStaff();if(name==='setup')renderSetup();}
qsa('.side-nav button[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));qsa('[data-go]').forEach(b=>b.onclick=()=>page(b.dataset.go));qs('#menu').onclick=()=>qs('#sidebar').classList.toggle('open');
qs('#logout').onclick=async()=>{const wasDemo=!!data?.business?.is_demo;await post('/api/auth/logout',{});location.href=wasDemo?'/':'/login'};

function render(){
  const b=data.business,c=data.config,w=data.whatsapp,a=data.automation||{};const cur=b.currency||'USD';
  qs('#clinicTop').textContent=b.name;qs('#planTop').textContent=b.is_demo?'INTERACTIVE DEMO • temporary sandbox':`${b.plan.toUpperCase()} • ${b.status}`;qs('#trialBadge').textContent=b.is_demo?'Live demo':(b.status==='trial'?'Trial active':b.status);qs('#demoBanner').classList.toggle('hidden',!b.is_demo);qs('#logout').textContent=b.is_demo?'Exit demo':'Log out';qs('#aiStatus').textContent=c.auto_reply?'AI active':'AI paused';qs('#aiStatus').className='status'+(c.auto_reply?'':' warn');
  const ob=data.onboarding||{percent:0,complete:false,step:1};qs('#onboardingCard').classList.toggle('hidden',!!b.is_demo||!!ob.complete);qs('#overviewSetupPercent').textContent=`${ob.percent||0}%`;const ring=qs('.progress-ring');if(ring)ring.style.setProperty('--progress',`${ob.percent||0}%`);qs('#setupPercent').textContent=`${ob.percent||0}%`;setupStep=Math.max(1,Math.min(7,Number(ob.step||1)));
  qs('#statConv').textContent=data.counts.conversations;qs('#statApt').textContent=data.counts.appointmentsToday;qs('#statLeads').textContent=data.counts.leads;qs('#statRecovered').textContent=money(a.totalRecoveredValue||0,cur);qs('#overviewRecoveredLeads').textContent=a.lostLead?.recovered||0;qs('#overviewRefilled').textContent=a.cancellation?.filled||0;qs('#overviewVoice').textContent=a.voiceNotes||0;
  qs('#recentConvs').innerHTML=data.recentConversations.length?data.recentConversations.map(x=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><strong>${x.last_message_type==='voice'?'🎤 ':''}${esc(x.customer_name||x.customer_phone)}</strong><div style="font-size:12px;color:var(--muted)">${esc(x.last_message||'')}</div></div>`).join(''):'<p style="color:var(--muted)">No conversations yet.</p>';
  qs('#recentApts').innerHTML=data.appointments.length?data.appointments.map(x=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><strong>${esc(x.service_name)}</strong><div style="font-size:12px;color:var(--muted)">${esc(x.customer_name||x.customer_phone)} • ${x.date} ${x.time} • ${niceStatus(x.source)}</div></div>`).join(''):'<p style="color:var(--muted)">No appointments yet.</p>';
  qs('#bName').value=b.name||'';const dial=b.phone_country_code||'';const full=String(b.phone||'');qs('#bPhone').value=dial&&full.startsWith(dial)?full.slice(dial.length):full;qs('#bAddress').value=b.address||'';
  qs('#sName').value=b.name||'';qs('#sPhone').value=dial&&full.startsWith(dial)?full.slice(dial.length):full;qs('#sAddress').value=b.address||'';
  if(!localizationBound){ClinicLocalization.bind({country:qs('#bCountry'),dial:qs('#bPhoneCode'),currency:qs('#bCurrency'),timezone:qs('#bTimezone'),initialCountry:b.country_code||'OTHER',initialDial:dial,initialCurrency:b.currency||'USD',initialTimezone:b.timezone||'UTC'});localizationBound=true}else{qs('#bCountry').value=ClinicLocalization.byCode[b.country_code]?b.country_code:'OTHER';qs('#bPhoneCode').value=dial;qs('#bTimezone').value=b.timezone||'';qs('#bCurrency').value=b.currency||'';}
  if(!setupLocalizationBound){ClinicLocalization.bind({country:qs('#sCountry'),dial:qs('#sPhoneCode'),currency:qs('#sCurrency'),timezone:qs('#sTimezone'),initialCountry:b.country_code||'OTHER',initialDial:dial,initialCurrency:b.currency||'USD',initialTimezone:b.timezone||'UTC'});setupLocalizationBound=true}else{qs('#sCountry').value=ClinicLocalization.byCode[b.country_code]?b.country_code:'OTHER';qs('#sPhoneCode').value=dial;qs('#sTimezone').value=b.timezone||'';qs('#sCurrency').value=b.currency||'';}
  qs('#aiName').value=c.ai_name||'';qs('#aiGreeting').value=c.greeting||'';qs('#aiTone').value=c.tone||'';qs('#aiLanguages').value=(c.languages||[]).join(', ');qs('#autoReply').checked=!!c.auto_reply;qs('#bookingEnabled').checked=!!c.booking_enabled;qs('#safetyHandoff').checked=!!c.safety_handoff;
  qs('#sAiName').value=c.ai_name||'';qs('#sAiGreeting').value=c.greeting||'';qs('#sAiTone').value=c.tone||'';qs('#sAiLanguages').value=(c.languages||[]).join(', ');
  qs('#recoveryEnabled').checked=!!c.lost_lead_recovery;qs('#recoveryDelay').value=String(c.recovery_delay_minutes||120);qs('#cancelAutoFill').checked=!!c.cancellation_autofill;qs('#cancelMaxOffers').value=String(c.cancellation_max_offers||5);qs('#voiceNotesEnabled').checked=!!c.voice_notes_enabled;
  qs('#hours').innerHTML=days.map(d=>{const r=c.opening_hours?.[d]||['',''];return `<div style="display:grid;grid-template-columns:70px 1fr 1fr;gap:8px;margin:8px 0;align-items:center"><strong style="text-transform:capitalize">${d}</strong><input data-day="${d}" data-i="0" value="${esc(r?.[0]||'')}" placeholder="09:00"><input data-day="${d}" data-i="1" value="${esc(r?.[1]||'')}" placeholder="18:00"></div>`}).join('');
  qs('#faqs').value=(c.faqs||[]).map(x=>`${x.q||x.question||''} | ${x.a||x.answer||''}`).join('\n');qs('#extraAiNotes').value=c.extra_ai_notes||'';renderServices();renderStaff();renderSetup();
  renderWhatsApp();
}
function staffInitials(name=''){return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'DR'}
function renderStaff(){
  const items=data?.staff||[];const grid=qs('#teamGrid');if(grid)grid.innerHTML=items.length?items.map(x=>`<div class="team-card"><div class="team-person"><span class="team-avatar">${esc(staffInitials(x.name))}</span><div><strong>${esc(x.name)}</strong><small>${esc(x.specialty||'Clinic team')}</small></div></div><button class="btn ghost small edit-staff" data-id="${x.id}">Edit</button></div>`).join(''):'<div class="team-empty">No team members yet. Add a doctor, nurse or receptionist to complete your clinic setup.</div>';
  qsa('.edit-staff').forEach(btn=>btn.onclick=async()=>{const x=items.find(y=>y.id===btn.dataset.id);if(!x)return;const v=await uiDialog({title:'Edit team member',subtitle:'Update the name or specialty patients will see.',fields:[{name:'name',label:'Doctor / staff name',value:x.name,required:true},{name:'specialty',label:'Specialty / role',value:x.specialty||'',placeholder:'General Dentist'}],confirmText:'Save changes'});if(!v)return;try{await post('/api/clinic/staff/'+x.id,{name:v.name.trim(),specialty:v.specialty.trim()});await load();page('team');showToast('Team member updated.')}catch(e){showToast(e.message,'error')}});
}
function renderSetup(){
  if(!data)return;const b=data.business,c=data.config,w=data.whatsapp;const ob=data.onboarding||{};setupStep=Math.max(1,Math.min(7,Number(setupStep||ob.step||1)));
  qsa('.setup-pane').forEach((x,i)=>x.classList.toggle('hidden',i!==setupStep-1));qsa('.setup-step').forEach(x=>x.classList.toggle('active',Number(x.dataset.setupStep)===setupStep));
  const cur=b.currency||'USD';const ss=qs('#setupServices');if(ss)ss.innerHTML=(data.services||[]).length?(data.services||[]).map(x=>`<div class="setup-list-item"><div><strong>${esc(x.name)}</strong><small>${money(x.price,cur)} · ${x.duration_minutes} min</small></div><span class="status">Ready</span></div>`).join(''):'<div class="team-empty">No services added yet. Add at least one service so the AI knows what your clinic offers.</div>';
  const st=qs('#setupStaff');if(st)st.innerHTML=(data.staff||[]).length?(data.staff||[]).map(x=>`<div class="setup-list-item"><div><strong>${esc(x.name)}</strong><small>${esc(x.specialty||'Clinic team')}</small></div><span class="status">Added</span></div>`).join(''):'<div class="team-empty">No doctors or staff added yet.</div>';
  const sh=qs('#setupHours');if(sh)sh.innerHTML=days.map(d=>{const r=c.opening_hours?.[d]||['',''];return `<div class="hours-row"><strong style="text-transform:capitalize">${d}</strong><input data-setup-day="${d}" data-i="0" value="${esc(r?.[0]||'')}" placeholder="09:00"><input data-setup-day="${d}" data-i="1" value="${esc(r?.[1]||'')}" placeholder="18:00"></div>`}).join('');
  const ws=qs('#setupWaState');if(ws)ws.innerHTML=w?.status==='connected'?`<span class="status">Connected</span> <strong>${esc(w.display_number||'WhatsApp Business')}</strong>`:'<span class="status warn">Not connected yet</span>';
}
async function setSetupStep(step,{persist=true}={}){setupStep=Math.max(1,Math.min(7,Number(step)));if(persist&&!data?.business?.is_demo){try{data.onboarding=await post('/api/clinic/onboarding',{step:setupStep})}catch{}}renderSetup()}
async function saveSetupDetails(){await post('/api/clinic/business',{name:qs('#sName').value,country_code:qs('#sCountry').value==='OTHER'?'ZZ':qs('#sCountry').value,phone_country_code:qs('#sPhoneCode').value,phone:qs('#sPhone').value,address:qs('#sAddress').value,timezone:qs('#sTimezone').value,currency:qs('#sCurrency').value.toUpperCase()});await load();await setSetupStep(2)}
async function saveSetupHours(){const opening_hours={};for(const d of days){const vals=qsa(`[data-setup-day="${d}"]`).map(i=>i.value.trim());opening_hours[d]=vals[0]&&vals[1]?vals:null}await post('/api/clinic/config',{opening_hours});await load();await setSetupStep(5)}
async function saveSetupAI(){await post('/api/clinic/config',{ai_name:qs('#sAiName').value,greeting:qs('#sAiGreeting').value,tone:qs('#sAiTone').value,languages:qs('#sAiLanguages').value.split(',').map(x=>x.trim()).filter(Boolean)});await load();await setSetupStep(6)}

function renderServices(){const cur=data?.business?.currency||'USD';qs('#services').innerHTML=(data.services||[]).map(s=>`<div class="service-row"><input data-s="${s.id}" data-k="name" value="${esc(s.name)}"><input data-s="${s.id}" data-k="price" type="number" value="${s.price}"><span class="currency-chip">${esc(cur)}</span><input data-s="${s.id}" data-k="duration_minutes" type="number" value="${s.duration_minutes}"><button class="btn ghost small save-service" data-id="${s.id}">Save</button></div>`).join('')||'<p style="color:var(--muted)">No services yet.</p>';qsa('.save-service').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,obj={};qsa(`[data-s="${id}"]`).forEach(i=>obj[i.dataset.k]=i.type==='number'?Number(i.value):i.value);await post('/api/clinic/services/'+id,obj);await load();});}
async function addServiceWithModal(after){const cur=data?.business?.currency||'USD';const v=await uiDialog({title:'Add service',subtitle:'This exact service name, price and duration can be used by the AI receptionist.',fields:[{name:'name',label:'Service name',placeholder:'Dental Cleaning',required:true},{name:'price',label:`Price (${cur})`,type:'number',value:'0',min:'0',step:'0.01',required:true},{name:'duration_minutes',label:'Duration (minutes)',type:'number',value:'30',min:'5',step:'5',required:true}],confirmText:'Add service'});if(!v)return;try{await post('/api/clinic/services',{name:v.name.trim(),price:Number(v.price||0),duration_minutes:Number(v.duration_minutes||30)});await load();if(after)after();showToast('Service added.')}catch(e){showToast(e.message,'error')}}
qs('#addService').onclick=()=>addServiceWithModal(()=>page('knowledge'));
const addTeam=async()=>{const v=await uiDialog({title:'Add team member',subtitle:'Add a doctor, nurse, receptionist or other staff member patients may ask for.',fields:[{name:'name',label:'Doctor / staff name',placeholder:'Dr. Sarah Ahmed',required:true},{name:'specialty',label:'Specialty / role',placeholder:'General Dentist'}],confirmText:'Add team member'});if(!v)return;try{await post('/api/clinic/staff',{name:v.name.trim(),specialty:v.specialty.trim()});await load();page('team');showToast('Team member added.')}catch(e){showToast(e.message,'error')}};qs('#addTeamMember').onclick=addTeam;
qs('#setupAddService').onclick=()=>addServiceWithModal(()=>{setupStep=2;renderSetup()});
qs('#setupAddStaff').onclick=async()=>{const name=qs('#setupStaffName').value.trim();if(!name){showToast('Enter a doctor or staff name.','error');qs('#setupStaffName').focus();return}try{await post('/api/clinic/staff',{name,specialty:qs('#setupStaffSpecialty').value.trim()});qs('#setupStaffName').value='';qs('#setupStaffSpecialty').value='';await load();setupStep=3;renderSetup();showToast('Team member added.')}catch(e){showToast(e.message,'error')}};
qsa('.setup-step').forEach(b=>b.onclick=()=>setSetupStep(Number(b.dataset.setupStep)));
qsa('[data-setup-back]').forEach(b=>b.onclick=()=>setSetupStep(Number(b.dataset.setupBack)-1));
qsa('[data-setup-next]').forEach(b=>b.onclick=async()=>{const step=Number(b.dataset.setupNext);try{if(step===1)return await saveSetupDetails();if(step===2){if(!(data.services||[]).length){showToast('Add at least one service before continuing.','error');return}return await setSetupStep(3)}if(step===3)return await setSetupStep(4);if(step===4)return await saveSetupHours();if(step===5)return await saveSetupAI();if(step===6)return await setSetupStep(7)}catch(e){showToast(e.message,'error')}});
qs('#setupConnectExisting').onclick=()=>{page('whatsapp');startWhatsAppSignup('existing')};qs('#setupConnectNew').onclick=()=>{page('whatsapp');startWhatsAppSignup('new')};qs('#setupLiveTest').onclick=()=>page('test');qs('#finishSetup').onclick=async()=>{try{data.onboarding=await post('/api/clinic/onboarding',{step:7,complete:true});await load();page('overview');showToast('Clinic setup completed.')}catch(e){showToast(e.message,'error')}};

qs('#saveBusiness').onclick=async()=>{const opening_hours={};for(const d of days){const vals=qsa(`[data-day="${d}"]`).map(i=>i.value.trim());opening_hours[d]=vals[0]&&vals[1]?vals:null}const faqs=qs('#faqs').value.split('\n').map(l=>l.split('|')).filter(x=>x[0]?.trim()&&x[1]?.trim()).map(([q,...a])=>({q:q.trim(),a:a.join('|').trim()}));await post('/api/clinic/business',{name:qs('#bName').value,country_code:qs('#bCountry').value==='OTHER'?'ZZ':qs('#bCountry').value,phone_country_code:qs('#bPhoneCode').value,phone:qs('#bPhone').value,address:qs('#bAddress').value,timezone:qs('#bTimezone').value,currency:qs('#bCurrency').value.toUpperCase()});await post('/api/clinic/config',{opening_hours,faqs,extra_ai_notes:qs('#extraAiNotes').value});await load();showToast('Business knowledge saved.')};
qs('#saveAI').onclick=async()=>{await post('/api/clinic/config',{ai_name:qs('#aiName').value,greeting:qs('#aiGreeting').value,tone:qs('#aiTone').value,languages:qs('#aiLanguages').value.split(',').map(x=>x.trim()).filter(Boolean),auto_reply:qs('#autoReply').checked,booking_enabled:qs('#bookingEnabled').checked,safety_handoff:qs('#safetyHandoff').checked});await load();showToast('AI settings saved.')};
qs('#saveRecovery').onclick=async()=>{await post('/api/clinic/config',{lost_lead_recovery:qs('#recoveryEnabled').checked,recovery_delay_minutes:Number(qs('#recoveryDelay').value),cancellation_autofill:qs('#cancelAutoFill').checked,cancellation_max_offers:Number(qs('#cancelMaxOffers').value),voice_notes_enabled:qs('#voiceNotesEnabled').checked});await load();await loadRecovery();showToast('Revenue Recovery settings saved.')};
qs('#runAutomation').onclick=async()=>{qs('#runAutomation').disabled=true;try{const r=await post('/api/clinic/automation/run',{});await load();await loadRecovery();showToast(r.results?.length?`Automation checked ${r.results.length} due action(s).`:'Automation checked — nothing is due right now.')}catch(e){showToast(e.message,'error')}finally{qs('#runAutomation').disabled=false}};

async function loadConversations(){const r=await api('/api/clinic/conversations');qs('#convList').innerHTML=r.conversations.map(c=>`<div class="conv" data-id="${c.id}" data-human="${c.human_handoff}"><strong>${c.last_message_type==='voice'?'🎤 ':''}${esc(c.customer_name||c.customer_phone)}</strong><small>${esc(c.last_message||'')}</small></div>`).join('')||'<div style="padding:18px;color:var(--muted)">No conversations.</div>';qsa('.conv').forEach(x=>x.onclick=()=>openConv(x.dataset.id,x.dataset.human==='1',x.querySelector('strong').textContent));}
async function openConv(id,human,name){currentConv={id,human};qs('#convTitle').textContent=name;qs('#handoffBtn').classList.remove('hidden');qs('#handoffBtn').textContent=human?'Return to AI':'Take over';const r=await api(`/api/clinic/conversations/${id}/messages`);qs('#messages').innerHTML=r.messages.map(m=>`<div class="msg ${m.role==='assistant'?'assistant':'user'}">${m.message_type==='voice'?'<div class="voice-chip">🎤 Voice note transcript</div>':''}${esc(m.text)}</div>`).join('');qs('#messages').scrollTop=qs('#messages').scrollHeight;}
qs('#handoffBtn').onclick=async()=>{if(!currentConv)return;await post(`/api/clinic/conversations/${currentConv.id}/handoff`,{enabled:!currentConv.human});currentConv.human=!currentConv.human;qs('#handoffBtn').textContent=currentConv.human?'Return to AI':'Take over';await loadConversations()};

async function loadAppointments(){const r=await api('/api/clinic/appointments');qs('#aptTable').innerHTML=r.appointments.map(a=>`<tr><td>${a.date}</td><td>${a.time}</td><td>${esc(a.customer_name||a.customer_phone)}</td><td>${esc(a.service_name)}</td><td><span class="source-pill ${esc(a.source)}">${niceStatus(a.source)}</span></td><td><span class="status ${a.status==='cancelled'?'danger':''}">${niceStatus(a.status)}</span></td><td>${a.status==='confirmed'?`<button class="btn ghost small cancel-apt" data-id="${a.id}">Cancel + refill</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7">No appointments yet.</td></tr>';qsa('.cancel-apt').forEach(b=>b.onclick=async()=>{const v=await uiDialog({title:'Cancel appointment',subtitle:'The appointment will be cancelled and Cancellation Auto-Fill can immediately look for a replacement patient.',fields:[{name:'reason',label:'Cancellation reason (optional)',type:'textarea',value:'Clinic cancellation',rows:3}],confirmText:'Cancel & start auto-fill',danger:true});if(!v)return;try{const r=await post(`/api/clinic/appointments/${b.dataset.id}/cancel`,{reason:v.reason.trim()||'Clinic cancellation'});showToast(r.opportunity?'Appointment cancelled. Auto-fill candidate search started.':'Appointment cancelled. Auto-fill is disabled or no workflow was created.',r.opportunity?'success':'warn');await load();await loadAppointments();await loadRecovery();}catch(e){showToast(e.message,'error')}})}

async function loadRecovery(){const r=await api('/api/clinic/revenue-recovery');const s=r.stats,cur=data?.business?.currency||'USD';qs('#rrRecovered').textContent=s.lostLead.recovered;qs('#rrRecoveryValue').textContent=money(s.lostLead.recoveredValue,cur)+' recovered';qs('#rrRefilled').textContent=s.cancellation.filled;qs('#rrCancelValue').textContent=money(s.cancellation.recoveredValue,cur)+' recovered';qs('#rrPending').textContent=s.lostLead.pending;qs('#rrVoice').textContent=s.voiceNotes;qs('#recoveryRows').innerHTML=r.recoveryCases.map(x=>`<tr><td>${esc(x.customer_name||x.customer_phone)}</td><td>${esc(x.service_name||'General enquiry')}</td><td><span class="status ${x.status==='template_required'?'warn':''}">${niceStatus(x.status)}</span></td><td>${money(x.estimated_value||0,cur)}</td><td>${x.last_sent_at?new Date(x.last_sent_at).toLocaleString():new Date(x.scheduled_at).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="5">No recovery cases yet. They appear after a high-intent patient leaves without booking.</td></tr>';qs('#cancelRows').innerHTML=r.cancellations.map(x=>`<tr><td>${x.date}<br><small>${x.time}</small></td><td>${esc(x.service_name)}</td><td><span class="status ${x.status==='template_required'?'warn':''}">${niceStatus(x.status)}</span></td><td>${x.offer_count||0}</td><td>${money(x.recovered_value||0,cur)}</td></tr>`).join('')||'<tr><td colspan="5">No cancelled-slot opportunities yet.</td></tr>'}

async function sendTest(text){if(!text.trim())return;const box=qs('#testChat');box.insertAdjacentHTML('beforeend',`<div class="msg user">${esc(text)}</div>`);qs('#testInput').value='';try{const r=await post('/api/clinic/test-chat',{phone:`${data?.business?.phone_country_code||'+1'}5550000000`,name:'Demo Patient',message:text});if(r.reply)box.insertAdjacentHTML('beforeend',`<div class="msg assistant">${esc(r.reply)}</div>`);box.scrollTop=box.scrollHeight;await load()}catch(e){box.insertAdjacentHTML('beforeend',`<div class="msg assistant">${esc(e.message)}</div>`)} }
qs('#testSend').onclick=()=>sendTest(qs('#testInput').value);qs('#testInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendTest(e.target.value)});qsa('.quick').forEach(b=>b.onclick=()=>sendTest(b.textContent));
qs('#voiceSend').onclick=async()=>{const f=qs('#voiceFile').files?.[0];if(!f){showToast('Choose an audio file first.','error');return}qs('#voiceSend').disabled=true;qs('#voiceResult').textContent='Transcribing and processing…';try{const r=await api(`/api/clinic/test-voice?filename=${encodeURIComponent(f.name)}`,{method:'POST',headers:{'Content-Type':f.type||'audio/ogg'},body:f});qs('#voiceResult').innerHTML=`<strong>Transcript:</strong> ${esc(r.transcript)}<br><strong>AI:</strong> ${esc(r.reply||'No automatic reply — human takeover or AI pause may be active.')}`;const box=qs('#testChat');box.insertAdjacentHTML('beforeend',`<div class="msg user"><div class="voice-chip">🎤 Voice note transcript</div>${esc(r.transcript)}</div>`);if(r.reply)box.insertAdjacentHTML('beforeend',`<div class="msg assistant">${esc(r.reply)}</div>`);await load();}catch(e){qs('#voiceResult').textContent=e.message}finally{qs('#voiceSend').disabled=false}};

function waShowError(message=''){
  const box=qs('#waError');if(!box)return;box.textContent=message;box.classList.toggle('hidden',!message);
}
function waProgress(show,title='Connecting WhatsApp…',text='Complete the Meta window. ClinicChatDesk will finish the connection automatically.'){
  const box=qs('#waProgress');if(!box)return;box.classList.toggle('hidden',!show);qs('#waProgressTitle').textContent=title;qs('#waProgressText').textContent=text;
}
function formatWhen(v){if(!v)return '';try{return new Date(v).toLocaleString()}catch{return ''}}
function renderWhatsApp(){
  if(!data||!qs('#waStatus'))return;
  const b=data.business,w=data.whatsapp||{},m=publicConfig?.meta||{};const status=String(w.status||'not_connected');
  waShowError('');waProgress(false);
  if(b.is_demo){
    qs('#waStatus').innerHTML=`<span class="status warn">Demo sandbox</span><h3>Real WhatsApp is disabled in the public demo</h3><p style="color:var(--muted)">Create a clinic workspace to connect an actual WhatsApp Business number.</p>`;
    qs('#waActions').innerHTML='<a class="btn brand" href="/signup">Create clinic workspace</a>';return;
  }
  if(status==='connected'){
    const title=w.verified_name||w.display_number||'WhatsApp connected';
    qs('#waStatus').innerHTML=`<div class="wa-connected-head"><div><span class="status">Connected ✓</span><h2>${esc(title)}</h2><p>${esc(w.display_number||'')}</p></div><div class="wa-live-dot"><i></i> AI channel live</div></div><div class="wa-meta-grid"><div><span>Connection</span><strong>${w.connection_source==='embedded_signup'?'Meta Embedded Signup':'Managed connection'}</strong></div><div><span>Last checked</span><strong>${esc(formatWhen(w.last_verified_at)||'Not checked yet')}</strong></div></div><p class="kpi-note">Incoming patient messages on this number are routed to this clinic’s AI receptionist and dashboard.</p>`;
    qs('#waActions').innerHTML='<button id="waVerify" class="btn ghost">Check connection</button><button id="waReconnect" class="btn ghost">Reconnect existing number</button><button id="waDisconnect" class="btn danger">Disconnect</button>';
    qs('#waVerify').onclick=verifyWhatsApp;qs('#waReconnect').onclick=()=>startWhatsAppSignup('existing');qs('#waDisconnect').onclick=disconnectWhatsApp;return;
  }
  if(status==='attention'||status==='pending'){
    qs('#waStatus').innerHTML=`<span class="status warn">${status==='pending'?'Finishing setup':'Needs attention'}</span><h3>${esc(w.display_number||'WhatsApp authorization received')}</h3><p style="color:var(--muted)">${esc(w.last_error||'Meta authorized the account, but ClinicChatDesk still needs to finish the webhook connection.')}</p>`;
    qs('#waActions').innerHTML=`${w.access_token_configured?'<button id="waRetry" class="btn brand">Retry connection</button>':''}<button id="waReconnect" class="btn ghost">Reconnect existing number</button>`;
    const r=qs('#waRetry');if(r)r.onclick=retryWhatsApp;qs('#waReconnect').onclick=()=>startWhatsAppSignup('existing');return;
  }
  qs('#waStatus').innerHTML=`<span class="status warn">Not connected</span><h2>Turn your clinic’s WhatsApp into an AI front desk</h2><p style="color:var(--muted);max-width:650px">Connect through Meta’s secure signup. You can choose an eligible existing WhatsApp Business App number or set up a new number. ClinicChatDesk completes the API connection automatically.</p>`;
  if(!m.ready){
    qs('#waActions').innerHTML='<button class="btn brand" disabled>Connect WhatsApp</button><span class="kpi-note">Platform Meta configuration is not complete yet.</span>';
  }else qs('#waActions').innerHTML='<button id="waConnectExisting" class="btn brand wa-connect-btn">Connect existing WhatsApp Business <span>→</span></button><button id="waConnectNew" class="btn ghost">Set up a new number</button>';
  const ce=qs('#waConnectExisting'),cn=qs('#waConnectNew');if(ce)ce.onclick=()=>startWhatsAppSignup('existing');if(cn)cn.onclick=()=>startWhatsAppSignup('new');
}

async function loadMetaSdk(){
  const m=publicConfig?.meta||{};if(!m.appId)throw new Error('Meta App ID is not configured.');
  if(metaSdkReady&&window.FB&&typeof window.FB.login==='function')return window.FB;
  if(metaSdkPromise)return metaSdkPromise;
  metaSdkPromise=new Promise((resolve,reject)=>{
    let settled=false;
    const done=()=>{
      if(settled)return;
      try{
        if(!window.FB||typeof window.FB.init!=='function')return;
        // Initialize only after sdk.js has actually finished loading. In v2.5.2
        // an early partial window.FB object could be mistaken for a ready SDK,
        // which caused Meta to report: "FB.login() called before FB.init()".
        window.FB.init({appId:String(m.appId),cookie:true,xfbml:false,version:m.graphVersion||'v26.0'});
        metaSdkReady=true;settled=true;clearTimeout(timeout);
        console.info('Meta Facebook SDK initialized for ClinicChatDesk');
        resolve(window.FB);
      }catch(e){settled=true;clearTimeout(timeout);metaSdkPromise=null;reject(e)}
    };
    const fail=()=>{if(settled)return;settled=true;clearTimeout(timeout);metaSdkPromise=null;reject(new Error('Could not load Meta login. Check browser privacy/ad-blocking settings and try again.'))};
    const timeout=setTimeout(()=>{if(settled)return;settled=true;metaSdkPromise=null;reject(new Error('Meta login could not be initialized. Please refresh the page and try again.'))},15000);

    // Official SDK pattern: define fbAsyncInit BEFORE loading sdk.js.
    window.fbAsyncInit=done;

    let script=document.getElementById('facebook-jssdk');
    if(script){
      script.addEventListener('load',done,{once:true});
      script.addEventListener('error',fail,{once:true});
      // A previously loaded script may already be complete. Wait one task so the
      // SDK can finish assigning window.FB, then initialize it.
      setTimeout(done,0);
      return;
    }
    script=document.createElement('script');
    script.id='facebook-jssdk';script.async=true;script.defer=true;script.crossOrigin='anonymous';
    script.src='https://connect.facebook.net/en_US/sdk.js';
    script.addEventListener('load',done,{once:true});script.addEventListener('error',fail,{once:true});
    document.head.appendChild(script);
  });
  return metaSdkPromise;
}
function normalizeMetaSession(raw){
  let payload=raw;try{if(typeof payload==='string')payload=JSON.parse(payload)}catch{return null}
  const items=Array.isArray(payload)?payload:[payload];
  for(const item of items){if(item?.type!=='WA_EMBEDDED_SIGNUP')continue;const ev=String(item.event||'');if(ev.startsWith('FINISH'))return{kind:'finish',data:item.data||{}};if(ev==='CANCEL'||ev==='ERROR')return{kind:'stop',data:item.data||{},event:ev};}
  return null;
}

async function startWhatsAppSignup(mode='existing'){
  if(data?.business?.is_demo)return;
  const m=publicConfig?.meta||{};if(!m.ready){waShowError('ClinicChatDesk’s Meta connection is not configured on the server yet.');return}
  waShowError('');waProgress(true,'Opening Meta…',mode==='existing'?'Choose the option to connect the clinic’s existing WhatsApp Business App number.':'Choose the clinic business and set up the new WhatsApp number in Meta.');
  let authCode='',sessionData=null,submitted=false,forceTimer=null;
  const allowed=new Set(['https://www.facebook.com','https://web.facebook.com','https://business.facebook.com']);
  const cleanup=()=>{window.removeEventListener('message',onMessage);if(forceTimer)clearTimeout(forceTimer)};
  const complete=async(force=false)=>{
    if(submitted||!authCode||(!sessionData&&!force))return;submitted=true;cleanup();
    waProgress(true,'Securing the connection…','ClinicChatDesk is exchanging Meta’s one-time code, verifying the selected number and subscribing your webhook.');
    try{
      await post('/api/clinic/whatsapp/embedded/complete',{code:authCode,waba_id:sessionData?.waba_id||'',phone_number_id:sessionData?.phone_number_id||'',business_id:sessionData?.business_id||'',onboarding_mode:mode});
      authCode='';await load();page('whatsapp');waProgress(false);
    }catch(e){authCode='';waProgress(false);waShowError(e.message);await load().catch(()=>{});page('whatsapp')}
  };
  const onMessage=e=>{if(!allowed.has(e.origin))return;const x=normalizeMetaSession(e.data);if(!x)return;if(x.kind==='finish'){sessionData=x.data;complete(false)}else{cleanup();waProgress(false);waShowError(x.event==='CANCEL'?'WhatsApp connection was cancelled in Meta.':'Meta could not complete WhatsApp signup.')}};
  window.addEventListener('message',onMessage);
  try{
    // FB.login must run directly from the user's click to avoid popup blockers.
    // The SDK is preloaded when the dashboard starts; if it is still loading,
    // ask for a second click instead of launching an unsolicited popup later.
    if(!metaSdkReady||!window.FB){cleanup();waProgress(false);waShowError('Meta login is still loading. Please wait a moment and click Connect WhatsApp again.');loadMetaSdk().catch(()=>{});return}
    const extras={setup:{},version:m.esVersion||'v4',sessionInfoVersion:String(m.sessionInfoVersion||'3')};const featureType=mode==='existing'?'whatsapp_business_app_onboarding':(m.featureType||'');if(featureType)extras.featureType=featureType;
    window.FB.login(response=>{
      authCode=response?.authResponse?.code||'';
      if(!authCode){cleanup();waProgress(false);waShowError('Meta did not return an authorization code. Please complete the signup and try again.');return}
      // Session info normally arrives through postMessage. If Meta omits it,
      // the backend can discover a single authorized WABA/phone from the token.
      forceTimer=setTimeout(()=>complete(true),1800);complete(false);
    },{config_id:m.embeddedSignupConfigId,response_type:'code',override_default_response_type:true,extras});
  }catch(e){cleanup();waProgress(false);waShowError(e.message)}
}

async function verifyWhatsApp(){waShowError('');waProgress(true,'Checking Meta connection…','Verifying the phone number and webhook subscription.');try{await post('/api/clinic/whatsapp/verify',{});await load();page('whatsapp')}catch(e){waShowError(e.message);await load().catch(()=>{});page('whatsapp')}finally{waProgress(false)}}
async function retryWhatsApp(){waShowError('');waProgress(true,'Retrying connection…','Reusing the secure authorization already stored for this clinic.');try{await post('/api/clinic/whatsapp/retry',{});await load();page('whatsapp')}catch(e){waShowError(e.message);await load().catch(()=>{});page('whatsapp')}finally{waProgress(false)}}
async function disconnectWhatsApp(){const ok=await uiDialog({title:'Disconnect WhatsApp?',subtitle:'ClinicChatDesk automation will stop for this clinic. The clinic’s WhatsApp account itself will not be deleted.',confirmText:'Disconnect',danger:true});if(!ok)return;waShowError('');waProgress(true,'Disconnecting…','Removing ClinicChatDesk’s local connection and webhook subscription.');try{const r=await post('/api/clinic/whatsapp/disconnect',{});await load();page('whatsapp');showToast(r.warning?'Disconnected. Meta also returned a webhook warning: '+r.warning:'WhatsApp disconnected.',r.warning?'warn':'success')}catch(e){waShowError(e.message)}finally{waProgress(false)}}

async function load(){if(!publicConfig){publicConfig=await api('/api/public-config').catch(()=>({meta:{}}));if(publicConfig?.meta?.appId)loadMetaSdk().catch(()=>{})}data=await api('/api/clinic/dashboard');render()}load().then(()=>{const q=new URLSearchParams(location.search);if(q.get('setup')==='1'&&!data?.business?.is_demo){setupStep=Number(data?.onboarding?.step||1);page('setup');history.replaceState({},'',location.pathname)} });

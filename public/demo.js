const form=document.getElementById('demoForm'),err=document.getElementById('error');
ClinicLocalization.bind({country:document.getElementById('demoCountry'),dial:document.getElementById('demoDial'),currency:document.getElementById('demoCurrency'),timezone:document.getElementById('demoTimezone')});

function setDemoBusy(busy){
  const btn=document.getElementById('demoSubmit');
  if(!btn)return;
  btn.disabled=busy;
  btn.classList.toggle('is-loading',busy);
  btn.setAttribute('aria-busy',busy?'true':'false');
  btn.innerHTML=busy
    ? '<span class="demo-submit-spinner" aria-hidden="true"></span><span class="demo-submit-label">Launching demo…</span>'
    : '<span class="demo-submit-label">Launch live demo</span>';
}

form.addEventListener('submit',async e=>{
  e.preventDefault();
  err.style.display='none';
  setDemoBusy(true);
  const d=Object.fromEntries(new FormData(form));
  d.currency=String(d.currency||'').toUpperCase().trim();
  try{
    const r=await fetch('/api/demo/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Could not start demo');
    location.href='/app?demo=1';
  }catch(x){
    err.textContent=x.message;
    err.style.display='block';
    setDemoBusy(false);
  }
});

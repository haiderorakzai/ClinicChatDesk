(function(){
  const countries=[
    ['US','United States','+1','USD'],['CA','Canada','+1','CAD'],['GB','United Kingdom','+44','GBP'],['AE','United Arab Emirates','+971','AED'],['SA','Saudi Arabia','+966','SAR'],['PK','Pakistan','+92','PKR'],['IN','India','+91','INR'],['QA','Qatar','+974','QAR'],['KW','Kuwait','+965','KWD'],['BH','Bahrain','+973','BHD'],['OM','Oman','+968','OMR'],
    ['AU','Australia','+61','AUD'],['NZ','New Zealand','+64','NZD'],['DE','Germany','+49','EUR'],['FR','France','+33','EUR'],['IT','Italy','+39','EUR'],['ES','Spain','+34','EUR'],['NL','Netherlands','+31','EUR'],['BE','Belgium','+32','EUR'],['CH','Switzerland','+41','CHF'],['SE','Sweden','+46','SEK'],['NO','Norway','+47','NOK'],['DK','Denmark','+45','DKK'],['FI','Finland','+358','EUR'],['IE','Ireland','+353','EUR'],['PT','Portugal','+351','EUR'],['PL','Poland','+48','PLN'],['TR','Türkiye','+90','TRY'],
    ['EG','Egypt','+20','EGP'],['JO','Jordan','+962','JOD'],['LB','Lebanon','+961','LBP'],['ZA','South Africa','+27','ZAR'],['NG','Nigeria','+234','NGN'],['KE','Kenya','+254','KES'],['GH','Ghana','+233','GHS'],['MY','Malaysia','+60','MYR'],['SG','Singapore','+65','SGD'],['ID','Indonesia','+62','IDR'],['PH','Philippines','+63','PHP'],['TH','Thailand','+66','THB'],['JP','Japan','+81','JPY'],['KR','South Korea','+82','KRW'],['BR','Brazil','+55','BRL'],['MX','Mexico','+52','MXN'],['OTHER','Other / custom','','']
  ].map(([code,name,dial,currency])=>({code,name,dial,currency}));
  const currencies=[...new Set(countries.map(x=>x.currency).filter(Boolean).concat(['CNY','HKD','TWD','BDT','LKR','NPR','MAD','DZD','TND','IQD','ILS','ARS','CLP','COP','PEN','CZK','HUF','RON']))].sort();
  const byCode=Object.fromEntries(countries.map(x=>[x.code,x]));
  function fillCountrySelect(el,value=''){
    if(!el)return; el.innerHTML=countries.map(x=>`<option value="${x.code}">${x.name}</option>`).join('');
    if(value && byCode[value])el.value=value; else if(value)el.value='OTHER';
  }
  function fillDatalist(id,values){let d=document.getElementById(id);if(!d){d=document.createElement('datalist');d.id=id;document.body.appendChild(d)}d.innerHTML=values.map(v=>`<option value="${v}"></option>`).join('');}
  function browserTimezone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}}
  function bind({country,dial,currency,timezone,initialCountry='',initialDial='',initialCurrency='',initialTimezone=''}){
    fillCountrySelect(country,initialCountry||'US');
    fillDatalist('dialCodeList',[...new Set(countries.map(x=>x.dial).filter(Boolean))]);
    fillDatalist('currencyCodeList',currencies);
    if(dial){dial.setAttribute('list','dialCodeList');dial.value=initialDial||byCode[country?.value]?.dial||''}
    if(currency){currency.setAttribute('list','currencyCodeList');currency.value=initialCurrency||byCode[country?.value]?.currency||'USD'}
    if(timezone)timezone.value=initialTimezone||browserTimezone();
    if(country)country.addEventListener('change',()=>{const m=byCode[country.value];if(!m)return;if(dial&&m.dial)dial.value=m.dial;if(currency&&m.currency)currency.value=m.currency;});
  }
  function countryName(code){return byCode[code]?.name||(code||'Not set')}
  window.ClinicLocalization={countries,currencies,byCode,bind,countryName,browserTimezone};
})();

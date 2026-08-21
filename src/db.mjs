import './env.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { hashPassword, sha256, encryptSecret, decryptSecret } from './crypto.mjs';

const fallback = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'ClinicChatDesk-SaaS')
  : path.join(os.homedir(), '.clinicchatdesk-saas');
const dataDir = process.env.DATA_DIR || fallback;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'clinicchatdesk.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

const now = () => new Date().toISOString();
const id = p => `${p}_${randomUUID()}`;
const trialDays = Number(process.env.TRIAL_DAYS || 14);
const bool = v => !!Number(v || 0);

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      country_code TEXT NOT NULL DEFAULT 'US',
      phone_country_code TEXT NOT NULL DEFAULT '+1',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      currency TEXT NOT NULL DEFAULT 'USD',
      is_demo INTEGER NOT NULL DEFAULT 0,
      demo_expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'trial',
      plan TEXT NOT NULL DEFAULT 'starter',
      trial_ends_at TEXT,
      onboarding_step INTEGER NOT NULL DEFAULT 1,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS business_configs (
      business_id TEXT PRIMARY KEY,
      ai_name TEXT NOT NULL DEFAULT 'Sara',
      greeting TEXT NOT NULL DEFAULT 'Hello! How can I help you today?',
      tone TEXT NOT NULL DEFAULT 'Warm & professional',
      languages_json TEXT NOT NULL DEFAULT '["English"]',
      opening_hours_json TEXT NOT NULL DEFAULT '{}',
      faq_json TEXT NOT NULL DEFAULT '[]',
      auto_reply INTEGER NOT NULL DEFAULT 1,
      booking_enabled INTEGER NOT NULL DEFAULT 1,
      safety_handoff INTEGER NOT NULL DEFAULT 1,
      lost_lead_recovery INTEGER NOT NULL DEFAULT 1,
      recovery_delay_minutes INTEGER NOT NULL DEFAULT 120,
      recovery_max_attempts INTEGER NOT NULL DEFAULT 1,
      cancellation_autofill INTEGER NOT NULL DEFAULT 1,
      cancellation_max_offers INTEGER NOT NULL DEFAULT 5,
      voice_notes_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(business_id,name),
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      specialty TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(business_id,phone),
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      human_handoff INTEGER NOT NULL DEFAULT 0,
      state_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(business_id,customer_id,channel),
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      external_message_id TEXT UNIQUE,
      message_type TEXT NOT NULL DEFAULT 'text',
      media_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      service_name TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      last_intent_at TEXT,
      converted_appointment_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'ai',
      cancel_reason TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS recovery_cases (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      service_name TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      scheduled_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at TEXT,
      recovered_appointment_id TEXT,
      estimated_value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cancellation_opportunities (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      cancelled_appointment_id TEXT NOT NULL UNIQUE,
      service_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      filled_appointment_id TEXT,
      recovered_value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(cancelled_appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS cancellation_offers (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      offered_at TEXT,
      expires_at TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(opportunity_id) REFERENCES cancellation_opportunities(id) ON DELETE CASCADE,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS whatsapp_connections (
      business_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'not_connected',
      display_number TEXT,
      phone_number_id TEXT UNIQUE,
      waba_id TEXT,
      meta_business_id TEXT,
      connection_source TEXT NOT NULL DEFAULT 'managed',
      onboarding_mode TEXT,
      verified_name TEXT,
      access_token_enc TEXT,
      two_step_pin_enc TEXT,
      token_type TEXT,
      token_expires_at TEXT,
      subscribed_at TEXT,
      last_verified_at TEXT,
      last_error TEXT,
      connected_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS usage_monthly (
      business_id TEXT NOT NULL,
      month TEXT NOT NULL,
      ai_requests INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(business_id,month),
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_leads_recovery ON leads(business_id,status,updated_at);
    CREATE INDEX IF NOT EXISTS idx_recovery_due ON recovery_cases(status,scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_cancel_open ON cancellation_opportunities(status,created_at);
    CREATE INDEX IF NOT EXISTS idx_cancel_offers ON cancellation_offers(opportunity_id,status,created_at);
  `);

  // Safe migrations from ClinicAI Production v1 databases.
  ensureColumn('businesses','country_code',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('businesses','phone_country_code',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('businesses','is_demo','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('businesses','demo_expires_at','TEXT');
  ensureColumn('businesses','onboarding_step','INTEGER NOT NULL DEFAULT 1');
  ensureColumn('businesses','onboarding_complete','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('business_configs','lost_lead_recovery','INTEGER NOT NULL DEFAULT 1');
  ensureColumn('business_configs','recovery_delay_minutes','INTEGER NOT NULL DEFAULT 120');
  ensureColumn('business_configs','recovery_max_attempts','INTEGER NOT NULL DEFAULT 1');
  ensureColumn('business_configs','cancellation_autofill','INTEGER NOT NULL DEFAULT 1');
  ensureColumn('business_configs','cancellation_max_offers','INTEGER NOT NULL DEFAULT 5');
  ensureColumn('business_configs','voice_notes_enabled','INTEGER NOT NULL DEFAULT 1');
  ensureColumn('messages','message_type',"TEXT NOT NULL DEFAULT 'text'");
  ensureColumn('messages','media_id','TEXT');
  ensureColumn('messages','metadata_json',"TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('leads','last_intent_at','TEXT');
  ensureColumn('leads','converted_appointment_id','TEXT');
  ensureColumn('appointments','cancel_reason','TEXT');
  ensureColumn('appointments','cancelled_at','TEXT');
  ensureColumn('whatsapp_connections','meta_business_id','TEXT');
  ensureColumn('whatsapp_connections','connection_source',"TEXT NOT NULL DEFAULT 'managed'");
  ensureColumn('whatsapp_connections','onboarding_mode','TEXT');
  ensureColumn('whatsapp_connections','verified_name','TEXT');
  ensureColumn('whatsapp_connections','two_step_pin_enc','TEXT');
  ensureColumn('whatsapp_connections','token_type','TEXT');
  ensureColumn('whatsapp_connections','token_expires_at','TEXT');
  ensureColumn('whatsapp_connections','subscribed_at','TEXT');
  ensureColumn('whatsapp_connections','last_verified_at','TEXT');
  ensureColumn('whatsapp_connections','last_error','TEXT');
  seedSuperAdmin();
}

function seedSuperAdmin() {
  const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
  if (!email || !password) return;
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!exists) db.prepare('INSERT INTO users (id,business_id,name,email,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
    .run(id('usr'), null, 'Platform Owner', email, hashPassword(password), 'super_admin', now());
}

function slugify(s) {
  const base = String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45) || 'clinic';
  let slug = base, i=1;
  while (db.prepare('SELECT 1 FROM businesses WHERE slug=?').get(slug)) slug = `${base}-${++i}`;
  return slug;
}

function cleanCountryCode(v, fallback='US'){const x=String(v||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(x)?x:fallback;}
function cleanDial(v, fallback='+1'){const x=String(v||'').trim().replace(/\s+/g,'');return /^\+\d{1,4}$/.test(x)?x:fallback;}
function cleanCurrency(v, fallback='USD'){const x=String(v||'').trim().toUpperCase();return /^[A-Z]{3}$/.test(x)?x:fallback;}
function cleanTimezone(v, fallback='UTC'){const x=String(v||'').trim();try{new Intl.DateTimeFormat('en',{timeZone:x}).format();return x||fallback}catch{return fallback;}}
function normalizePhone(dial, phone){const raw=String(phone||'').trim();if(!raw)return '';if(raw.startsWith('+'))return raw.replace(/[\s()-]/g,'');const local=raw.replace(/[^0-9]/g,'').replace(/^0+/,'');return local?`${dial}${local}`:'';}

export function createClinicWithOwner({clinicName, ownerName, email, password, phone='', countryCode='US', phoneCountryCode='+1', currency='USD', timezone='UTC'}) {
  const e = String(email).trim().toLowerCase();
  if (!clinicName || !ownerName || !e || String(password).length < 8) throw new Error('Clinic, owner, email and password (8+ chars) are required.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw new Error('An account already exists for this email.');
  const cc=cleanCountryCode(countryCode), dial=cleanDial(phoneCountryCode), cur=cleanCurrency(currency), tz=cleanTimezone(timezone);
  const businessId=id('biz'), userId=id('usr'), t=now();
  const trialEnd=new Date(Date.now()+trialDays*86400000).toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO businesses (id,name,slug,phone,address,country_code,phone_country_code,timezone,currency,is_demo,demo_expires_at,status,plan,trial_ends_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(businessId,String(clinicName).trim(),slugify(clinicName),normalizePhone(dial,phone),'',cc,dial,tz,cur,0,null,'trial','starter',trialEnd,t,t);
    db.prepare('INSERT INTO users (id,business_id,name,email,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
      .run(userId,businessId,String(ownerName).trim(),e,hashPassword(password),'clinic_admin',t);
    db.prepare('INSERT INTO business_configs (business_id,updated_at) VALUES (?,?)').run(businessId,t);
    db.prepare('INSERT INTO whatsapp_connections (business_id,updated_at) VALUES (?,?)').run(businessId,t);
    db.exec('COMMIT');
    return {businessId,userId};
  } catch (e2) { db.exec('ROLLBACK'); throw e2; }
}

export function createDemoClinic({countryCode='US',phoneCountryCode='+1',phone='5551234567',currency='USD',timezone='UTC'}={}){
  const cc=cleanCountryCode(countryCode),dial=cleanDial(phoneCountryCode),cur=cleanCurrency(currency),tz=cleanTimezone(timezone);
  const businessId=id('biz'),userId=id('usr'),t=now(),expires=new Date(Date.now()+2*60*60*1000).toISOString();
  const email=`demo-${randomUUID()}@demo.clinicchatdesk.local`;
  db.exec('BEGIN');
  try{
    db.prepare('INSERT INTO businesses (id,name,slug,phone,address,country_code,phone_country_code,timezone,currency,is_demo,demo_expires_at,status,plan,trial_ends_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(businessId,'BrightSmile Dental Demo',slugify(`brightsmile-demo-${randomUUID().slice(0,8)}`),normalizePhone(dial,phone||'5551234567'),'123 Demo Avenue',cc,dial,tz,cur,1,expires,'demo','pro',expires,t,t);
    db.prepare('INSERT INTO users (id,business_id,name,email,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
      .run(userId,businessId,'Demo Visitor',email,hashPassword(randomUUID()),'clinic_admin',t);
    const hours={sun:['09:00','18:00'],mon:['09:00','18:00'],tue:['09:00','18:00'],wed:['09:00','18:00'],thu:['09:00','18:00'],fri:['09:00','18:00'],sat:['09:00','16:00']};
    db.prepare('INSERT INTO business_configs (business_id,ai_name,greeting,tone,languages_json,opening_hours_json,faq_json,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(businessId,'Mia','Hello! Welcome to BrightSmile Dental. How can I help you today?','Warm & professional',JSON.stringify(['English']),JSON.stringify(hours),JSON.stringify([{q:'Do you accept walk-ins?',a:'Walk-ins are welcome subject to availability.'},{q:'Where are you located?',a:'123 Demo Avenue.'}]),t);
    db.prepare('INSERT INTO whatsapp_connections (business_id,updated_at) VALUES (?,?)').run(businessId,t);
    const addService=(name,price,duration)=>{const sid=id('svc');db.prepare('INSERT INTO services (id,business_id,name,description,price,currency,duration_minutes,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(sid,businessId,name,'Demo clinic service',price,cur,duration,1,t);return sid;};
    const cleaningId=addService('Dental Cleaning',120,30), whiteningId=addService('Teeth Whitening',450,60), consultId=addService('Dental Consultation',80,30);
    db.prepare('INSERT INTO staff (id,business_id,name,specialty,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(id('stf'),businessId,'Dr. Sarah Ahmed','General Dentist',t,t);
    db.prepare('INSERT INTO staff (id,business_id,name,specialty,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(id('stf'),businessId,'Dr. Omar Khan','Cosmetic Dentistry',t,t);
    const addCustomer=(name,phone)=>{const cid=id('cus');db.prepare('INSERT INTO customers (id,business_id,name,phone,created_at) VALUES (?,?,?,?,?)').run(cid,businessId,name,phone,t);const conv=id('con');db.prepare('INSERT INTO conversations (id,business_id,customer_id,channel,human_handoff,state_json,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?)').run(conv,businessId,cid,'web','{}',t,t);return{cid,conv};};
    const sarah=addCustomer('Sarah Lee',`${dial}5551001`);db.prepare('INSERT INTO messages (id,conversation_id,role,text,message_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').run(id('msg'),sarah.conv,'user','How much is teeth whitening?','text','{}',t);db.prepare('INSERT INTO messages (id,conversation_id,role,text,message_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').run(id('msg'),sarah.conv,'assistant',`Teeth Whitening is ${cur} 450. Would you like me to check appointment times?`,'text','{}',t);db.prepare("INSERT INTO leads (id,business_id,customer_id,service_name,status,last_intent_at,created_at,updated_at) VALUES (?,?,?,?, 'new',?,?,?)").run(id('lead'),businessId,sarah.cid,'Teeth Whitening',t,t,t);
    const omar=addCustomer('Omar Khan',`${dial}5551002`);const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);const apt1=id('apt');db.prepare('INSERT INTO appointments (id,business_id,customer_id,service_id,date,time,duration_minutes,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(apt1,businessId,omar.cid,cleaningId,tomorrow,'10:00',30,'confirmed','ai',t);db.prepare('INSERT INTO messages (id,conversation_id,role,text,message_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').run(id('msg'),omar.conv,'user','Please book a dental cleaning tomorrow.','text','{}',t);db.prepare('INSERT INTO messages (id,conversation_id,role,text,message_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').run(id('msg'),omar.conv,'assistant',`✅ Confirmed. Your Dental Cleaning appointment is booked for ${tomorrow} at 10:00.`,'text','{}',t);
    const lina=addCustomer('Lina Ahmed',`${dial}5551003`);db.prepare('INSERT INTO messages (id,conversation_id,role,text,message_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').run(id('msg'),lina.conv,'user','I sent a voice note asking for whitening this week.','voice',JSON.stringify({transcription_status:'completed'}),t);const recApt=id('apt');const recDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);db.prepare('INSERT INTO appointments (id,business_id,customer_id,service_id,date,time,duration_minutes,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(recApt,businessId,lina.cid,whiteningId,recDate,'15:00',60,'confirmed','recovered_lead',t);db.prepare("INSERT INTO recovery_cases (id,business_id,customer_id,conversation_id,service_name,status,scheduled_at,attempts,last_sent_at,recovered_appointment_id,estimated_value,created_at,updated_at) VALUES (?,?,?,?,?,'recovered',?,1,?,?,?,?,?)").run(id('rec'),businessId,lina.cid,lina.conv,'Teeth Whitening',t,t,recApt,450,t,t);
    const cancelled=addCustomer('James Miller',`${dial}5551004`);const gapDate=new Date(Date.now()+3*86400000).toISOString().slice(0,10);const cancelledApt=id('apt');db.prepare('INSERT INTO appointments (id,business_id,customer_id,service_id,date,time,duration_minutes,status,source,cancel_reason,cancelled_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(cancelledApt,businessId,cancelled.cid,consultId,gapDate,'14:00',30,'cancelled','ai','Demo cancellation',t,t);const refill=addCustomer('Maya Patel',`${dial}5551005`);const refillApt=id('apt');db.prepare('INSERT INTO appointments (id,business_id,customer_id,service_id,date,time,duration_minutes,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(refillApt,businessId,refill.cid,consultId,gapDate,'14:00',30,'confirmed','cancellation_autofill',t);db.prepare("INSERT INTO cancellation_opportunities (id,business_id,cancelled_appointment_id,service_id,date,time,status,filled_appointment_id,recovered_value,created_at,updated_at) VALUES (?,?,?,?,?,?,'filled',?,?,?,?)").run(id('gap'),businessId,cancelledApt,consultId,gapDate,'14:00',refillApt,80,t,t);
    db.exec('COMMIT');return{businessId,userId,expires};
  }catch(e){db.exec('ROLLBACK');throw e;}
}

export function cleanupExpiredDemoClinics(){return db.prepare('DELETE FROM businesses WHERE is_demo=1 AND demo_expires_at IS NOT NULL AND demo_expires_at < ?').run(now()).changes;}

export function findUserByEmail(email) { return db.prepare('SELECT * FROM users WHERE email=?').get(String(email).trim().toLowerCase()); }
export function getUserById(userId) { return db.prepare('SELECT id,business_id,name,email,role,active,created_at FROM users WHERE id=?').get(userId); }
export function createSession(userId, rawToken, expiresAt) { db.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)').run(id('ses'),userId,sha256(rawToken),expiresAt,now()); }
export function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const row=db.prepare(`SELECT u.id,u.business_id,u.name,u.email,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha256(rawToken));
  if (!row || !row.active || Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}
export function deleteSession(rawToken) { if (rawToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(rawToken)); }
export function cleanupSessions() { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()); }

export function getBusiness(businessId) { return db.prepare('SELECT * FROM businesses WHERE id=?').get(businessId); }
export function getBusinessConfig(businessId) {
  const r=db.prepare('SELECT * FROM business_configs WHERE business_id=?').get(businessId);
  if (!r) return null;
  return {...r,
    languages:JSON.parse(r.languages_json||'[]'), opening_hours:JSON.parse(r.opening_hours_json||'{}'), faqs:JSON.parse(r.faq_json||'[]'),
    auto_reply:bool(r.auto_reply), booking_enabled:bool(r.booking_enabled), safety_handoff:bool(r.safety_handoff),
    lost_lead_recovery:bool(r.lost_lead_recovery), cancellation_autofill:bool(r.cancellation_autofill), voice_notes_enabled:bool(r.voice_notes_enabled)
  };
}
export function getWhatsAppConnection(businessId, includeSecret=false) {
  const r=db.prepare('SELECT * FROM whatsapp_connections WHERE business_id=?').get(businessId);
  if (!r) return null;
  const out={...r,access_token_configured:!!r.access_token_enc,two_step_pin_configured:!!r.two_step_pin_enc}; delete out.access_token_enc; delete out.two_step_pin_enc;
  if (includeSecret && r.access_token_enc) out.access_token=decryptSecret(r.access_token_enc);
  if (includeSecret && r.two_step_pin_enc) out.two_step_pin=decryptSecret(r.two_step_pin_enc);
  return out;
}
export function getBusinessBundle(businessId) { return {business:getBusiness(businessId),config:getBusinessConfig(businessId),whatsapp:getWhatsAppConnection(businessId),services:listServices(businessId),staff:listStaff(businessId)}; }

export function updateBusiness(businessId, patch={}) {
  const cur=getBusiness(businessId); if(!cur) throw new Error('Clinic not found.');
  const name=String(patch.name ?? cur.name).trim() || cur.name;
  const countryCode=cleanCountryCode(patch.country_code ?? patch.countryCode ?? cur.country_code,cur.country_code||'US');
  const phoneCountryCode=cleanDial(patch.phone_country_code ?? patch.phoneCountryCode ?? cur.phone_country_code,cur.phone_country_code||'+1');
  const timezone=cleanTimezone(patch.timezone ?? cur.timezone,cur.timezone||'UTC');
  const currency=cleanCurrency(patch.currency ?? cur.currency,cur.currency||'USD');
  const rawPhone=patch.phone===undefined?(cur.phone||''):String(patch.phone||'');
  const phone=patch.phone===undefined?rawPhone:normalizePhone(phoneCountryCode,rawPhone);
  const address=String(patch.address ?? cur.address ?? '').trim();
  db.exec('BEGIN');
  try{db.prepare('UPDATE businesses SET name=?,phone=?,address=?,country_code=?,phone_country_code=?,timezone=?,currency=?,updated_at=? WHERE id=?').run(name,phone,address,countryCode,phoneCountryCode,timezone,currency,now(),businessId);if(currency!==cur.currency)db.prepare('UPDATE services SET currency=? WHERE business_id=?').run(currency,businessId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return getBusiness(businessId);
}

export function updateConfig(businessId, patch={}) {
  const cur=getBusinessConfig(businessId); if(!cur) throw new Error('Config not found.');
  const langs=Array.isArray(patch.languages)?patch.languages.map(String).slice(0,8):cur.languages;
  const hours=patch.opening_hours && typeof patch.opening_hours==='object'?patch.opening_hours:cur.opening_hours;
  const faqs=Array.isArray(patch.faqs)?patch.faqs.slice(0,100):cur.faqs;
  const bounded=(v,current,min,max)=>Math.max(min,Math.min(max,Number(v ?? current)));
  db.prepare(`UPDATE business_configs SET ai_name=?,greeting=?,tone=?,languages_json=?,opening_hours_json=?,faq_json=?,auto_reply=?,booking_enabled=?,safety_handoff=?,lost_lead_recovery=?,recovery_delay_minutes=?,recovery_max_attempts=?,cancellation_autofill=?,cancellation_max_offers=?,voice_notes_enabled=?,updated_at=? WHERE business_id=?`)
    .run(String(patch.ai_name ?? cur.ai_name).trim()||cur.ai_name,String(patch.greeting ?? cur.greeting).trim()||cur.greeting,String(patch.tone ?? cur.tone).trim()||cur.tone,
      JSON.stringify(langs),JSON.stringify(hours),JSON.stringify(faqs),
      patch.auto_reply===undefined?(cur.auto_reply?1:0):(patch.auto_reply?1:0), patch.booking_enabled===undefined?(cur.booking_enabled?1:0):(patch.booking_enabled?1:0), patch.safety_handoff===undefined?(cur.safety_handoff?1:0):(patch.safety_handoff?1:0),
      patch.lost_lead_recovery===undefined?(cur.lost_lead_recovery?1:0):(patch.lost_lead_recovery?1:0), bounded(patch.recovery_delay_minutes,cur.recovery_delay_minutes,15,1440), bounded(patch.recovery_max_attempts,cur.recovery_max_attempts,1,3),
      patch.cancellation_autofill===undefined?(cur.cancellation_autofill?1:0):(patch.cancellation_autofill?1:0), bounded(patch.cancellation_max_offers,cur.cancellation_max_offers,1,20), patch.voice_notes_enabled===undefined?(cur.voice_notes_enabled?1:0):(patch.voice_notes_enabled?1:0), now(),businessId);
  return getBusinessConfig(businessId);
}

export function listServices(businessId) { return db.prepare('SELECT * FROM services WHERE business_id=? AND active=1 ORDER BY name').all(businessId); }
export function createService(businessId, p={}) {
  const b=getBusiness(businessId); if(!b) throw new Error('Clinic not found.');
  const service={id:id('svc'),name:String(p.name||'').trim(),description:String(p.description||'').trim(),price:Number(p.price||0),currency:String(p.currency||b.currency||'USD').toUpperCase().slice(0,3),duration_minutes:Math.max(5,Math.min(480,Number(p.duration_minutes||30)))};
  if(!service.name) throw new Error('Service name is required.');
  db.prepare('INSERT INTO services (id,business_id,name,description,price,currency,duration_minutes,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(service.id,businessId,service.name,service.description,service.price,service.currency,service.duration_minutes,1,now()); return service;
}
export function updateService(businessId, serviceId, p={}) {
  const cur=db.prepare('SELECT * FROM services WHERE id=? AND business_id=?').get(serviceId,businessId); if(!cur) throw new Error('Service not found.');
  db.prepare('UPDATE services SET name=?,description=?,price=?,currency=?,duration_minutes=?,active=? WHERE id=? AND business_id=?')
    .run(String(p.name??cur.name).trim()||cur.name,String(p.description??cur.description??'').trim(),Number(p.price??cur.price),String(p.currency??cur.currency).toUpperCase().slice(0,3),Math.max(5,Math.min(480,Number(p.duration_minutes??cur.duration_minutes))),p.active===undefined?cur.active:(p.active?1:0),serviceId,businessId);
  return db.prepare('SELECT * FROM services WHERE id=?').get(serviceId);
}


export function listStaff(businessId) { return db.prepare('SELECT * FROM staff WHERE business_id=? AND active=1 ORDER BY name').all(businessId); }
export function createStaff(businessId, p={}) {
  if(!getBusiness(businessId)) throw new Error('Clinic not found.');
  const name=String(p.name||'').trim(), specialty=String(p.specialty||'').trim();
  if(!name) throw new Error('Doctor / staff name is required.');
  const sid=id('stf'),t=now(); db.prepare('INSERT INTO staff (id,business_id,name,specialty,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(sid,businessId,name,specialty,t,t);
  return db.prepare('SELECT * FROM staff WHERE id=?').get(sid);
}
export function updateStaff(businessId, staffId, p={}) {
  const cur=db.prepare('SELECT * FROM staff WHERE id=? AND business_id=?').get(staffId,businessId); if(!cur) throw new Error('Team member not found.');
  const name=String(p.name??cur.name).trim()||cur.name, specialty=String(p.specialty??cur.specialty??'').trim(), active=p.active===undefined?cur.active:(p.active?1:0);
  db.prepare('UPDATE staff SET name=?,specialty=?,active=?,updated_at=? WHERE id=? AND business_id=?').run(name,specialty,active,now(),staffId,businessId);
  return db.prepare('SELECT * FROM staff WHERE id=?').get(staffId);
}
export function getOnboardingState(businessId){
  const b=getBusiness(businessId),cfg=getBusinessConfig(businessId),wa=getWhatsAppConnection(businessId);
  const checks={details:!!(b?.name&&b?.country_code&&b?.currency&&b?.timezone),services:listServices(businessId).length>0,team:listStaff(businessId).length>0,hours:Object.values(cfg?.opening_hours||{}).some(v=>Array.isArray(v)&&v[0]&&v[1]),ai:!!(cfg?.ai_name&&cfg?.greeting),whatsapp:wa?.status==='connected'};
  const step=Math.max(1,Math.min(7,Number(b?.onboarding_step||1))), complete=!!Number(b?.onboarding_complete||0);
  const completedCount=Object.values(checks).filter(Boolean).length;
  return {step,complete,percent:complete?100:Math.max(Math.round(completedCount/6*86),Math.round((step-1)/7*86)),checks};
}
export function updateOnboarding(businessId,{step,complete}={}){
  const b=getBusiness(businessId);if(!b)throw new Error('Clinic not found.');
  const next=Math.max(1,Math.min(7,Number(step??b.onboarding_step??1))), done=complete===undefined?Number(b.onboarding_complete||0):(complete?1:0);
  db.prepare('UPDATE businesses SET onboarding_step=?,onboarding_complete=?,updated_at=? WHERE id=?').run(next,done,now(),businessId);
  return getOnboardingState(businessId);
}

export function listConversations(businessId, limit=100) {
  return db.prepare(`SELECT c.id,c.customer_id,c.channel,c.human_handoff,c.updated_at,cu.name customer_name,cu.phone customer_phone,
    (SELECT text FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message,
    (SELECT message_type FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message_type
    FROM conversations c JOIN customers cu ON cu.id=c.customer_id WHERE c.business_id=? ORDER BY c.updated_at DESC LIMIT ?`).all(businessId,limit);
}
export function getConversationMessages(businessId, conversationId, limit=100) {
  const c=db.prepare('SELECT id FROM conversations WHERE id=? AND business_id=?').get(conversationId,businessId); if(!c) return [];
  return db.prepare('SELECT id,role,text,message_type,media_id,metadata_json,created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?').all(conversationId,limit).map(m=>{let metadata={};try{metadata=JSON.parse(m.metadata_json||'{}')}catch{}return{...m,metadata};});
}
export function setHandoff(businessId, conversationId, enabled) { db.prepare('UPDATE conversations SET human_handoff=?,updated_at=? WHERE id=? AND business_id=?').run(enabled?1:0,now(),conversationId,businessId); }
export function listAppointments(businessId, limit=100) {
  return db.prepare(`SELECT a.*,cu.name customer_name,cu.phone customer_phone,s.name service_name,s.currency,s.price FROM appointments a
    JOIN customers cu ON cu.id=a.customer_id JOIN services s ON s.id=a.service_id WHERE a.business_id=? ORDER BY a.date DESC,a.time DESC LIMIT ?`).all(businessId,limit);
}

export function getOrCreateConversation(businessId, phone, name=null, channel='whatsapp') {
  let customer=db.prepare('SELECT * FROM customers WHERE business_id=? AND phone=?').get(businessId,phone);
  if(!customer){ const cid=id('cus'); db.prepare('INSERT INTO customers (id,business_id,name,phone,created_at) VALUES (?,?,?,?,?)').run(cid,businessId,name,phone,now()); customer=db.prepare('SELECT * FROM customers WHERE id=?').get(cid); }
  else if(name && !customer.name){ db.prepare('UPDATE customers SET name=? WHERE id=?').run(name,customer.id); customer={...customer,name}; }
  let conv=db.prepare('SELECT * FROM conversations WHERE business_id=? AND customer_id=? AND channel=?').get(businessId,customer.id,channel);
  if(!conv){ const cid=id('con'); db.prepare('INSERT INTO conversations (id,business_id,customer_id,channel,human_handoff,state_json,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?)').run(cid,businessId,customer.id,channel,'{}',now(),now()); conv=db.prepare('SELECT * FROM conversations WHERE id=?').get(cid); }
  return {customer,conversation:conv};
}
export function saveMessage(conversationId, role, text, externalId=null, meta={}) {
  const messageType=String(meta.message_type||'text'); const mediaId=meta.media_id?String(meta.media_id):null; const metadata={...meta}; delete metadata.message_type; delete metadata.media_id;
  try { db.prepare('INSERT INTO messages (id,conversation_id,role,text,external_message_id,message_type,media_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id('msg'),conversationId,role,String(text),externalId,messageType,mediaId,JSON.stringify(metadata),now()); db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now(),conversationId); return true; } catch(e){ if(String(e.message).includes('UNIQUE')) return false; throw e; }
}
export function recentMessages(conversationId, limit=12) { return db.prepare('SELECT role,text,created_at FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT ?').all(conversationId,limit).reverse(); }
export function getConversationState(conversationId){ const r=db.prepare('SELECT state_json FROM conversations WHERE id=?').get(conversationId); try{return JSON.parse(r?.state_json||'{}')}catch{return{}} }
export function setConversationState(conversationId,state){ db.prepare('UPDATE conversations SET state_json=?,updated_at=? WHERE id=?').run(JSON.stringify(state||{}),now(),conversationId); }

export function findServiceByName(businessId,name){ const q=`%${String(name).trim()}%`; return db.prepare('SELECT * FROM services WHERE business_id=? AND active=1 AND (LOWER(name)=LOWER(?) OR LOWER(name) LIKE LOWER(?)) ORDER BY LENGTH(name) LIMIT 1').get(businessId,String(name).trim(),q); }
export function slotsForDate(businessId,date,serviceName) {
  const service=findServiceByName(businessId,serviceName); if(!service) return {error:'Service not found.'};
  const cfg=getBusinessConfig(businessId); const dow=['sun','mon','tue','wed','thu','fri','sat'][new Date(date+'T12:00:00Z').getUTCDay()]; const range=cfg.opening_hours[dow];
  if(!range) return {service,slots:[]};
  const [start,end]=range; const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3)); const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const occupied=db.prepare("SELECT time,duration_minutes FROM appointments WHERE business_id=? AND date=? AND status='confirmed'").all(businessId,date).map(a=>[toMin(a.time),toMin(a.time)+a.duration_minutes]);
  const slots=[]; for(let m=toMin(start);m+service.duration_minutes<=toMin(end);m+=30){ if(!occupied.some(([a,b])=>m<b&&m+service.duration_minutes>a)) slots.push(fmt(m)); if(slots.length>=12) break; }
  return {service,slots};
}

export function upsertLead(businessId,customerId,serviceName='') {
  const exists=db.prepare("SELECT id FROM leads WHERE business_id=? AND customer_id=? AND status='new' ORDER BY updated_at DESC LIMIT 1").get(businessId,customerId);
  const t=now();
  if(exists){db.prepare('UPDATE leads SET service_name=?,last_intent_at=?,updated_at=? WHERE id=?').run(serviceName,t,t,exists.id);return exists.id;}
  const lid=id('lead');db.prepare("INSERT INTO leads (id,business_id,customer_id,service_name,status,last_intent_at,created_at,updated_at) VALUES (?,?,?,?,'new',?,?,?)").run(lid,businessId,customerId,serviceName,t,t,t);return lid;
}
function markLeadConverted(businessId,customerId,appointmentId){db.prepare("UPDATE leads SET status='converted',converted_appointment_id=?,updated_at=? WHERE business_id=? AND customer_id=? AND status='new'").run(appointmentId,now(),businessId,customerId);}

function recoverySourceForCustomer(businessId,customerId){return db.prepare("SELECT id FROM recovery_cases WHERE business_id=? AND customer_id=? AND status='sent' AND last_sent_at>=? ORDER BY last_sent_at DESC LIMIT 1").get(businessId,customerId,new Date(Date.now()-7*86400000).toISOString());}
function cancellationOfferForCustomer(businessId,customerId){return db.prepare("SELECT co.id offer_id,co.opportunity_id FROM cancellation_offers co JOIN cancellation_opportunities op ON op.id=co.opportunity_id WHERE co.business_id=? AND co.customer_id=? AND co.status='sent' AND op.status='open' ORDER BY co.offered_at DESC LIMIT 1").get(businessId,customerId);}

export function createAppointment(businessId, customerId, serviceName, date, time, source='ai') {
  const service=findServiceByName(businessId,serviceName); if(!service) throw new Error('Service not found.');
  const available=slotsForDate(businessId,date,serviceName).slots.includes(time); if(!available) throw new Error('That time is no longer available.');
  let actualSource=source;
  if(source==='ai' && cancellationOfferForCustomer(businessId,customerId)) actualSource='cancellation_autofill';
  else if(source==='ai' && recoverySourceForCustomer(businessId,customerId)) actualSource='recovered_lead';
  const aid=id('apt'); db.prepare('INSERT INTO appointments (id,business_id,customer_id,service_id,date,time,duration_minutes,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(aid,businessId,customerId,service.id,date,time,service.duration_minutes,'confirmed',actualSource,now());
  markLeadConverted(businessId,customerId,aid);
  const rc=actualSource==='recovered_lead'?recoverySourceForCustomer(businessId,customerId):null; if(rc) db.prepare("UPDATE recovery_cases SET status='recovered',recovered_appointment_id=?,estimated_value=?,updated_at=? WHERE id=?").run(aid,service.price,now(),rc.id);
  return db.prepare(`SELECT a.*,s.name service_name,s.price,s.currency FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id=?`).get(aid);
}

export function cancelNextAppointmentForCustomer(businessId, customerId, serviceName='') {
  const today=new Date().toISOString().slice(0,10);
  const params=[businessId,customerId,today]; let extra='';
  if(String(serviceName||'').trim()){extra=' AND LOWER(s.name) LIKE LOWER(?)';params.push(`%${String(serviceName).trim()}%`);}
  const apt=db.prepare(`SELECT a.id FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.business_id=? AND a.customer_id=? AND a.status='confirmed' AND a.date>=? ${extra} ORDER BY a.date,a.time LIMIT 1`).get(...params);
  if(!apt) throw new Error('No matching upcoming appointment was found.');
  return cancelAppointment(businessId,apt.id,'Cancelled by patient');
}

export function cancelAppointment(businessId, appointmentId, reason='Cancelled by clinic') {
  const apt=db.prepare(`SELECT a.*,s.name service_name,s.price,s.currency,cu.name customer_name,cu.phone customer_phone FROM appointments a JOIN services s ON s.id=a.service_id JOIN customers cu ON cu.id=a.customer_id WHERE a.id=? AND a.business_id=?`).get(appointmentId,businessId);
  if(!apt) throw new Error('Appointment not found.'); if(apt.status!=='confirmed') throw new Error('Only confirmed appointments can be cancelled.');
  db.prepare("UPDATE appointments SET status='cancelled',cancel_reason=?,cancelled_at=? WHERE id=?").run(String(reason||'Cancelled'),now(),appointmentId);
  const cfg=getBusinessConfig(businessId); let opportunity=null;
  if(cfg?.cancellation_autofill) opportunity=createCancellationOpportunity(apt);
  return {appointment:{...apt,status:'cancelled'},opportunity};
}

function createCancellationOpportunity(apt){
  const oid=id('gap'),t=now(); db.prepare(`INSERT INTO cancellation_opportunities (id,business_id,cancelled_appointment_id,service_id,date,time,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'open',?,?)`).run(oid,apt.business_id,apt.id,apt.service_id,apt.date,apt.time,t,t);
  const cfg=getBusinessConfig(apt.business_id); const candidates=db.prepare(`SELECT l.customer_id,c.id conversation_id FROM leads l JOIN conversations c ON c.business_id=l.business_id AND c.customer_id=l.customer_id AND c.channel='whatsapp'
    WHERE l.business_id=? AND l.status='new' AND LOWER(COALESCE(l.service_name,''))=LOWER(?) AND l.customer_id<>? AND c.human_handoff=0
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.business_id=l.business_id AND a.customer_id=l.customer_id AND a.service_id=? AND a.date=? AND a.status='confirmed')
    GROUP BY l.customer_id,c.id ORDER BY MAX(l.updated_at) DESC LIMIT ?`).all(apt.business_id,apt.service_name,apt.customer_id,apt.service_id,apt.date,Number(cfg?.cancellation_max_offers||5));
  for(const x of candidates) db.prepare(`INSERT INTO cancellation_offers (id,opportunity_id,business_id,customer_id,conversation_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?)`).run(id('off'),oid,apt.business_id,x.customer_id,x.conversation_id,t,t);
  if(!candidates.length) db.prepare("UPDATE cancellation_opportunities SET status='no_candidates',updated_at=? WHERE id=?").run(now(),oid);
  return getCancellationOpportunity(apt.business_id,oid);
}
export function getCancellationOpportunity(businessId, opportunityId){return db.prepare(`SELECT o.*,s.name service_name,s.price,s.currency FROM cancellation_opportunities o JOIN services s ON s.id=o.service_id WHERE o.id=? AND o.business_id=?`).get(opportunityId,businessId);}
export function listCancellationOpportunities(businessId,limit=100){return db.prepare(`SELECT o.*,s.name service_name,s.price,s.currency,(SELECT COUNT(*) FROM cancellation_offers x WHERE x.opportunity_id=o.id) offer_count,(SELECT COUNT(*) FROM cancellation_offers x WHERE x.opportunity_id=o.id AND x.status='sent') sent_count FROM cancellation_opportunities o JOIN services s ON s.id=o.service_id WHERE o.business_id=? ORDER BY o.created_at DESC LIMIT ?`).all(businessId,limit);}
export function listCancellationOffers(businessId,opportunityId){return db.prepare(`SELECT x.*,cu.name customer_name,cu.phone customer_phone FROM cancellation_offers x JOIN customers cu ON cu.id=x.customer_id WHERE x.business_id=? AND x.opportunity_id=? ORDER BY x.created_at`).all(businessId,opportunityId);}

export function nextCancellationOffers(businessId=null,limit=10){
  const t=now(); const exp=db.prepare(`SELECT id,conversation_id FROM cancellation_offers WHERE status='sent' AND expires_at IS NOT NULL AND expires_at<=? ${businessId?'AND business_id=?':''}`).all(...(businessId?[t,businessId]:[t]));
  for(const x of exp){db.prepare("UPDATE cancellation_offers SET status='expired',updated_at=? WHERE id=?").run(t,x.id);const st=getConversationState(x.conversation_id);if(st.cancellation_offer?.offer_id===x.id){delete st.cancellation_offer;setConversationState(x.conversation_id,st);}}
  const opportunities=db.prepare(`SELECT o.*,s.name service_name,s.price,s.currency FROM cancellation_opportunities o JOIN services s ON s.id=o.service_id WHERE o.status='open' ${businessId?'AND o.business_id=?':''} ORDER BY o.created_at LIMIT ?`).all(...(businessId?[businessId,limit*2]:[limit*2]));
  const out=[];
  for(const op of opportunities){
    const active=db.prepare("SELECT 1 FROM cancellation_offers WHERE opportunity_id=? AND status='sent' LIMIT 1").get(op.id); if(active) continue;
    const offer=db.prepare(`SELECT x.*,cu.name customer_name,cu.phone customer_phone,c.channel,(SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id AND m.role='user') last_user_at FROM cancellation_offers x JOIN customers cu ON cu.id=x.customer_id JOIN conversations c ON c.id=x.conversation_id WHERE x.opportunity_id=? AND x.status='queued' ORDER BY x.created_at LIMIT 1`).get(op.id);
    if(!offer){const blocked=db.prepare("SELECT 1 FROM cancellation_offers WHERE opportunity_id=? AND status='template_required' LIMIT 1").get(op.id);db.prepare("UPDATE cancellation_opportunities SET status=?,updated_at=? WHERE id=?").run(blocked?'template_required':'exhausted',now(),op.id);continue;}
    out.push({...offer,opportunity:op}); if(out.length>=limit)break;
  }
  return out;
}
export function markCancellationOfferSent(offerId,expiryMinutes=20){const offered=now(),expires=new Date(Date.now()+Number(expiryMinutes)*60000).toISOString();db.prepare("UPDATE cancellation_offers SET status='sent',offered_at=?,expires_at=?,updated_at=? WHERE id=? AND status='queued'").run(offered,expires,offered,offerId);return db.prepare('SELECT * FROM cancellation_offers WHERE id=?').get(offerId);}
export function markCancellationOfferTemplateRequired(offerId){db.prepare("UPDATE cancellation_offers SET status='template_required',updated_at=? WHERE id=? AND status='queued'").run(now(),offerId);return db.prepare('SELECT * FROM cancellation_offers WHERE id=?').get(offerId);}
export function declineCancellationOffer(businessId,offerId,customerId){const x=db.prepare("SELECT * FROM cancellation_offers WHERE id=? AND business_id=? AND customer_id=? AND status='sent'").get(offerId,businessId,customerId);if(!x)return false;db.prepare("UPDATE cancellation_offers SET status='declined',responded_at=?,updated_at=? WHERE id=?").run(now(),now(),offerId);return true;}
export function acceptCancellationOffer(businessId,offerId,customerId){
  const offer=db.prepare(`SELECT x.*,o.service_id,o.date,o.time,o.status opportunity_status,s.name service_name,s.price,s.currency FROM cancellation_offers x JOIN cancellation_opportunities o ON o.id=x.opportunity_id JOIN services s ON s.id=o.service_id WHERE x.id=? AND x.business_id=? AND x.customer_id=?`).get(offerId,businessId,customerId);
  if(!offer||offer.status!=='sent'||offer.opportunity_status!=='open') throw new Error('This cancellation slot is no longer available.');
  if(offer.expires_at&&Date.parse(offer.expires_at)<Date.now()) throw new Error('This cancellation offer has expired.');
  const apt=createAppointment(businessId,customerId,offer.service_name,offer.date,offer.time,'cancellation_autofill');
  db.exec('BEGIN');try{db.prepare("UPDATE cancellation_offers SET status='accepted',responded_at=?,updated_at=? WHERE id=?").run(now(),now(),offerId);db.prepare("UPDATE cancellation_offers SET status='expired',updated_at=? WHERE opportunity_id=? AND id<>? AND status IN ('queued','sent')").run(now(),offer.opportunity_id,offerId);db.prepare("UPDATE cancellation_opportunities SET status='filled',filled_appointment_id=?,recovered_value=?,updated_at=? WHERE id=?").run(apt.id,offer.price,now(),offer.opportunity_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return apt;
}

export function queueLostLeadRecoveries(businessId=null){
  const leads=db.prepare(`SELECT l.*,c.id conversation_id,c.channel,c.human_handoff,(SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id AND m.role='user') last_user_at,bc.recovery_delay_minutes,bc.recovery_max_attempts,s.price service_price
    FROM leads l JOIN business_configs bc ON bc.business_id=l.business_id JOIN conversations c ON c.business_id=l.business_id AND c.customer_id=l.customer_id LEFT JOIN services s ON s.business_id=l.business_id AND LOWER(s.name)=LOWER(l.service_name)
    WHERE l.status='new' AND bc.lost_lead_recovery=1 AND bc.auto_reply=1 AND c.human_handoff=0 ${businessId?'AND l.business_id=?':''} ORDER BY l.updated_at`).all(...(businessId?[businessId]:[]));
  let queued=0;
  for(const l of leads){ if(!l.last_user_at)continue; const due=new Date(Date.parse(l.last_user_at)+Number(l.recovery_delay_minutes||120)*60000).toISOString(); if(Date.parse(due)>Date.now())continue;
    const active=db.prepare("SELECT id FROM recovery_cases WHERE business_id=? AND customer_id=? AND status IN ('queued','sent','template_required') AND created_at>=? LIMIT 1").get(l.business_id,l.customer_id,new Date(Date.now()-7*86400000).toISOString()); if(active)continue;
    const hasApt=db.prepare("SELECT 1 FROM appointments WHERE business_id=? AND customer_id=? AND status='confirmed' AND created_at>=? LIMIT 1").get(l.business_id,l.customer_id,l.created_at); if(hasApt)continue;
    const t=now();db.prepare(`INSERT INTO recovery_cases (id,business_id,customer_id,conversation_id,service_name,status,scheduled_at,attempts,estimated_value,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,0,?,?,?)`).run(id('rec'),l.business_id,l.customer_id,l.conversation_id,l.service_name||'',due,Number(l.service_price||0),t,t);queued++;
  }
  return queued;
}
export function dueRecoveryCases(businessId=null,limit=20){return db.prepare(`SELECT r.*,cu.name customer_name,cu.phone customer_phone,c.channel,(SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id AND m.role='user') last_user_at,bc.recovery_max_attempts FROM recovery_cases r JOIN customers cu ON cu.id=r.customer_id JOIN conversations c ON c.id=r.conversation_id JOIN business_configs bc ON bc.business_id=r.business_id WHERE r.status='queued' AND r.scheduled_at<=? ${businessId?'AND r.business_id=?':''} ORDER BY r.scheduled_at LIMIT ?`).all(...(businessId?[now(),businessId,limit]:[now(),limit]));}
export function markRecoverySent(caseId){const r=db.prepare('SELECT * FROM recovery_cases WHERE id=?').get(caseId);if(!r)return null;const attempts=Number(r.attempts||0)+1;db.prepare("UPDATE recovery_cases SET status='sent',attempts=?,last_sent_at=?,updated_at=? WHERE id=?").run(attempts,now(),now(),caseId);return db.prepare('SELECT * FROM recovery_cases WHERE id=?').get(caseId);}
export function markRecoveryTemplateRequired(caseId){db.prepare("UPDATE recovery_cases SET status='template_required',updated_at=? WHERE id=?").run(now(),caseId);}
export function markRecoveryDismissed(caseId){db.prepare("UPDATE recovery_cases SET status='dismissed',updated_at=? WHERE id=?").run(now(),caseId);}

export function requeueTemplateRequiredAutomations({businessId=null,recovery=false,cancellation=false}={}){
  const t=now();
  let recoveries=0,offers=0,opportunities=0;
  if(recovery){
    const sql=`UPDATE recovery_cases SET status='queued',updated_at=? WHERE status='template_required' ${businessId?'AND business_id=?':''}`;
    recoveries=db.prepare(sql).run(...(businessId?[t,businessId]:[t])).changes;
  }
  if(cancellation){
    const sql=`UPDATE cancellation_offers SET status='queued',updated_at=? WHERE status='template_required' ${businessId?'AND business_id=?':''}`;
    offers=db.prepare(sql).run(...(businessId?[t,businessId]:[t])).changes;
    const opSql=`UPDATE cancellation_opportunities SET status='open',updated_at=? WHERE status='template_required' ${businessId?'AND business_id=?':''} AND EXISTS (SELECT 1 FROM cancellation_offers x WHERE x.opportunity_id=cancellation_opportunities.id AND x.status='queued')`;
    opportunities=db.prepare(opSql).run(...(businessId?[t,businessId]:[t])).changes;
  }
  return {recoveries,offers,opportunities};
}
export function listRecoveryCases(businessId,limit=100){return db.prepare(`SELECT r.*,cu.name customer_name,cu.phone customer_phone FROM recovery_cases r JOIN customers cu ON cu.id=r.customer_id WHERE r.business_id=? ORDER BY r.created_at DESC LIMIT ?`).all(businessId,limit);}

export function automationStats(businessId){
  const recovery=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='recovered' THEN 1 ELSE 0 END) recovered,SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,SUM(CASE WHEN status IN ('queued','template_required') THEN 1 ELSE 0 END) pending,COALESCE(SUM(CASE WHEN status='recovered' THEN estimated_value ELSE 0 END),0) recovered_value FROM recovery_cases WHERE business_id=?`).get(businessId);
  const cancels=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='filled' THEN 1 ELSE 0 END) filled,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open,COALESCE(SUM(recovered_value),0) recovered_value FROM cancellation_opportunities WHERE business_id=?`).get(businessId);
  const voice=db.prepare("SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.business_id=? AND m.message_type='voice' AND m.created_at>=?").get(businessId,new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()).n;
  return {lostLead:{total:Number(recovery.total||0),recovered:Number(recovery.recovered||0),sent:Number(recovery.sent||0),pending:Number(recovery.pending||0),recoveredValue:Number(recovery.recovered_value||0)},cancellation:{total:Number(cancels.total||0),filled:Number(cancels.filled||0),open:Number(cancels.open||0),recoveredValue:Number(cancels.recovered_value||0)},voiceNotes:Number(voice||0),totalRecoveredValue:Number(recovery.recovered_value||0)+Number(cancels.recovered_value||0)};
}

export function dashboard(businessId) {
  const counts={conversations:db.prepare('SELECT COUNT(*) n FROM conversations WHERE business_id=?').get(businessId).n,appointmentsToday:db.prepare("SELECT COUNT(*) n FROM appointments WHERE business_id=? AND date=? AND status='confirmed'").get(businessId,new Date().toISOString().slice(0,10)).n,leads:db.prepare("SELECT COUNT(*) n FROM leads WHERE business_id=? AND status='new'").get(businessId).n,handoffs:db.prepare('SELECT COUNT(*) n FROM conversations WHERE business_id=? AND human_handoff=1').get(businessId).n};
  return {...getBusinessBundle(businessId),counts,automation:automationStats(businessId),recentConversations:listConversations(businessId,8),appointments:listAppointments(businessId,8),usage:getUsage(businessId),onboarding:getOnboardingState(businessId)};
}

function upsertWhatsAppConnection(businessId,{status='connected',display_number='',phone_number_id='',waba_id='',meta_business_id='',connection_source='managed',onboarding_mode='',verified_name='',access_token='',two_step_pin='',token_type='',token_expires_at=null,subscribed_at=null,last_verified_at=null,last_error=null}={}) {
  if(!getBusiness(businessId)) throw new Error('Clinic not found.');
  const existing=db.prepare('SELECT * FROM whatsapp_connections WHERE business_id=?').get(businessId)||{};
  const tokenEnc=access_token?encryptSecret(access_token):(existing.access_token_enc||null);
  const pinEnc=two_step_pin?encryptSecret(two_step_pin):(existing.two_step_pin_enc||null);
  const connectedAt=status==='connected'?(existing.connected_at||now()):(existing.connected_at||null);
  try{
    db.prepare(`INSERT INTO whatsapp_connections (business_id,status,display_number,phone_number_id,waba_id,meta_business_id,connection_source,onboarding_mode,verified_name,access_token_enc,two_step_pin_enc,token_type,token_expires_at,subscribed_at,last_verified_at,last_error,connected_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET status=excluded.status,display_number=excluded.display_number,phone_number_id=excluded.phone_number_id,waba_id=excluded.waba_id,meta_business_id=excluded.meta_business_id,connection_source=excluded.connection_source,onboarding_mode=excluded.onboarding_mode,verified_name=excluded.verified_name,access_token_enc=excluded.access_token_enc,two_step_pin_enc=excluded.two_step_pin_enc,token_type=excluded.token_type,token_expires_at=excluded.token_expires_at,subscribed_at=excluded.subscribed_at,last_verified_at=excluded.last_verified_at,last_error=excluded.last_error,connected_at=excluded.connected_at,updated_at=excluded.updated_at`)
      .run(businessId,status,display_number||existing.display_number||'',phone_number_id||existing.phone_number_id||'',waba_id||existing.waba_id||'',meta_business_id||existing.meta_business_id||'',connection_source||existing.connection_source||'managed',onboarding_mode||existing.onboarding_mode||'',verified_name||existing.verified_name||'',tokenEnc,pinEnc,token_type||existing.token_type||'',token_expires_at??existing.token_expires_at??null,subscribed_at??existing.subscribed_at??null,last_verified_at??existing.last_verified_at??null,last_error,connectedAt,now());
  }catch(e){
    if(String(e.message).toLowerCase().includes('unique')) throw new Error('This WhatsApp phone number is already connected to another ClinicChatDesk clinic.');
    throw e;
  }
  return getWhatsAppConnection(businessId);
}

export function connectWhatsAppManaged(businessId,{display_number='',phone_number_id='',waba_id='',access_token=''}) {
  if(!phone_number_id || !access_token) throw new Error('Phone Number ID and access token are required.');
  return upsertWhatsAppConnection(businessId,{status:'connected',display_number,phone_number_id,waba_id,access_token,connection_source:'managed',last_verified_at:now(),last_error:null});
}

export function saveEmbeddedWhatsAppConnection(businessId,patch={}) { return upsertWhatsAppConnection(businessId,{...patch,connection_source:patch.connection_source||'embedded_signup'}); }
export function setWhatsAppConnectionHealth(businessId,{status,last_verified_at,last_error,display_number,verified_name}={}){
  const cur=db.prepare('SELECT * FROM whatsapp_connections WHERE business_id=?').get(businessId);if(!cur)return null;
  db.prepare('UPDATE whatsapp_connections SET status=?,last_verified_at=?,last_error=?,display_number=?,verified_name=?,updated_at=? WHERE business_id=?')
    .run(status||cur.status,last_verified_at??cur.last_verified_at??null,last_error??null,display_number??cur.display_number??'',verified_name??cur.verified_name??'',now(),businessId);
  return getWhatsAppConnection(businessId);
}
export function clearWhatsAppConnection(businessId){
  db.prepare(`UPDATE whatsapp_connections SET status='not_connected',display_number=NULL,phone_number_id=NULL,waba_id=NULL,meta_business_id=NULL,onboarding_mode=NULL,verified_name=NULL,access_token_enc=NULL,two_step_pin_enc=NULL,token_type=NULL,token_expires_at=NULL,subscribed_at=NULL,last_verified_at=NULL,last_error=NULL,connection_source='managed',connected_at=NULL,updated_at=? WHERE business_id=?`).run(now(),businessId);
  return getWhatsAppConnection(businessId);
}
export function countWhatsAppConnectionsByWaba(wabaId){return Number(db.prepare("SELECT COUNT(*) n FROM whatsapp_connections WHERE waba_id=? AND status!='not_connected'").get(String(wabaId||'')).n||0);}
export function businessByPhoneNumberId(phoneNumberId){ const w=db.prepare('SELECT business_id FROM whatsapp_connections WHERE phone_number_id=? AND status IN ("connected","attention")').get(phoneNumberId); return w?getBusiness(w.business_id):null; }

export function incrementUsage(businessId,{input_tokens=0,output_tokens=0}={}){ const month=new Date().toISOString().slice(0,7); db.prepare(`INSERT INTO usage_monthly (business_id,month,ai_requests,input_tokens,output_tokens) VALUES (?,?,1,?,?) ON CONFLICT(business_id,month) DO UPDATE SET ai_requests=ai_requests+1,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens`).run(businessId,month,Number(input_tokens||0),Number(output_tokens||0)); }
export function getUsage(businessId){ const month=new Date().toISOString().slice(0,7); return db.prepare('SELECT * FROM usage_monthly WHERE business_id=? AND month=?').get(businessId,month)||{business_id:businessId,month,ai_requests:0,input_tokens:0,output_tokens:0}; }

export function listClinics(){ return db.prepare(`SELECT b.*,(SELECT email FROM users u WHERE u.business_id=b.id AND u.role='clinic_admin' ORDER BY u.created_at LIMIT 1) owner_email,(SELECT COUNT(*) FROM conversations c WHERE c.business_id=b.id) conversations,(SELECT ai_requests FROM usage_monthly um WHERE um.business_id=b.id AND um.month=substr(date('now'),1,7)) ai_requests,(SELECT COALESCE(SUM(estimated_value),0) FROM recovery_cases r WHERE r.business_id=b.id AND r.status='recovered') recovered_lead_value,(SELECT COALESCE(SUM(recovered_value),0) FROM cancellation_opportunities o WHERE o.business_id=b.id) cancellation_value FROM businesses b WHERE COALESCE(b.is_demo,0)=0 ORDER BY b.created_at DESC`).all(); }
export function superAutomationStats(){const businesses=db.prepare('SELECT id FROM businesses WHERE COALESCE(is_demo,0)=0').all();return businesses.reduce((a,b)=>{const s=automationStats(b.id);a.recoveredLeads+=s.lostLead.recovered;a.refilled+=s.cancellation.filled;a.voiceNotes+=s.voiceNotes;a.recoveredValue+=s.totalRecoveredValue;return a;},{recoveredLeads:0,refilled:0,voiceNotes:0,recoveredValue:0});}
export function superSetClinic(businessId,{status,plan}){ const b=getBusiness(businessId);if(!b)throw new Error('Clinic not found.');const s=['trial','active','suspended','cancelled'].includes(status)?status:b.status;const p=['starter','pro','growth','custom'].includes(plan)?plan:b.plan;db.prepare('UPDATE businesses SET status=?,plan=?,updated_at=? WHERE id=?').run(s,p,now(),businessId);return getBusiness(businessId); }

export function purgeOldMessages(days=30){ const cutoff=new Date(Date.now()-Number(days)*86400000).toISOString(); return db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff).changes; }
export function dbInfo(){ return {dbPath}; }

import './env.mjs';
import { randomBytes } from 'node:crypto';
import { createSession, deleteSession, getSessionUser } from './db.mjs';

const cookieName = process.env.SESSION_COOKIE_NAME || 'clinicchatdesk_session';
const sessionDays = Number(process.env.SESSION_DAYS || 7);

export function parseCookies(req) {
  const out={}; const h=req.headers.cookie||'';
  for(const part of h.split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}
  return out;
}
export function getCurrentUser(req){ return getSessionUser(parseCookies(req)[cookieName]); }
export function requireUser(req, roles=null){ const u=getCurrentUser(req); if(!u) return null; if(roles && !roles.includes(u.role)) return null; return u; }
export function startSession(userId){ const token=randomBytes(32).toString('base64url'); const exp=new Date(Date.now()+sessionDays*86400000); createSession(userId,token,exp.toISOString()); return {token,expires:exp}; }
export function sessionCookie(token, expires, secure=true){ return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure?'; Secure':''}`; }
export function clearCookie(secure=true){ return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`; }
export function logout(req){ const token=parseCookies(req)[cookieName]; deleteSession(token); }

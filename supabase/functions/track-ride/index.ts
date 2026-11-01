import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const origin='https://lavender333.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply({error:'Origin not allowed.'},403);
  try{
    const raw=await request.text();if(raw.length>16000)return reply({error:'Request too large.'},413);
    const body=JSON.parse(raw);
    if(!/^[a-f0-9-]{36}$/i.test(body.id||''))return reply({error:'Invalid tracking link.'},400);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    if(body.action==='driver-link'){
      if(typeof body.staff_token!=='string')return reply({error:'Staff sign-in required.'},401);
      const {data:{user},error}=await db.auth.getUser(body.staff_token);
      if(error||!user?.email||!user.email_confirmed_at)return reply({error:'Staff sign-in required.'},401);
      const {data:member}=await db.from('staff_access').select('email').eq('email',user.email.toLowerCase()).maybeSingle();
      if(!member)return reply({error:'Access denied.'},403);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const {data,error:updateError}=await db.from('ride_requests').update({driver_token_hash:await hash(token)}).eq('id',body.id).eq('status','assigned').not('driver_id','is',null).select('id');
      if(updateError||!data?.length)return reply({error:'Assign a driver before creating a tracking link.'},409);
      return reply({token});
    }
    if(!/^[a-f0-9]{64}$/.test(body.token||''))return reply({error:'Invalid tracking link.'},400);
    const tokenHash=await hash(body.token);
    if(body.action==='location'){
      const {lat,lng,accuracy}=body;
      if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180||!Number.isFinite(accuracy)||accuracy < 0||accuracy>100000)return reply({error:'Invalid location.'},400);
      const {data,error}=await db.from('ride_requests').update({driver_lat:lat,driver_lng:lng,driver_accuracy:accuracy,location_updated_at:new Date().toISOString()}).eq('id',body.id).eq('driver_token_hash',tokenHash).eq('status','assigned').select('id');
      if(error)return reply({error:'Unable to save location.'},503);
      if(!data?.length)return reply({error:'This tracking link is no longer active.'},410);
      return reply({saved:true});
    }
    if(body.action==='read'){
      const {data:ride,error}=await db.from('ride_requests').select('status,driver_id,driver_lat,driver_lng,driver_accuracy,location_updated_at').eq('id',body.id).eq('customer_token_hash',tokenHash).maybeSingle();
      if(error)return reply({error:'Tracking is temporarily unavailable.'},503);
      if(!ride)return reply({error:'Tracking link not found.'},404);
      let driver=null;
      if(ride.driver_id){const {data}=await db.from('drivers').select('name,vehicle').eq('id',ride.driver_id).maybeSingle();if(data)driver={name:data.name.split(' ')[0],vehicle:data.vehicle};}
      return reply({status:ride.status,driver,location:ride.status==='assigned'&&ride.location_updated_at?{lat:ride.driver_lat,lng:ride.driver_lng,accuracy:ride.driver_accuracy,updated_at:ride.location_updated_at}:null});
    }
    return reply({error:'Unknown action.'},400);
  }catch{return reply({error:'Unable to process tracking request.'},400);}
});

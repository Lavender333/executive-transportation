const config=window.TRANSPORT_CONFIG||{}, $=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1)), id=params.get('id'), token=params.get('token');
const valid=/^[a-f0-9-]{36}$/i.test(id||'')&&/^[a-f0-9]{64}$/.test(token||'');
const driver=location.pathname.endsWith('/driver.html');
const say=(text,error=false)=>{$('tracking-message').textContent=text;$('tracking-message').classList.toggle('error',error);};
async function call(action,extra={}){
  const response=await fetch(config.url+'/functions/v1/track-ride',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.functionKey,Authorization:'Bearer '+config.functionKey},body:JSON.stringify({id,token,action,...extra}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Unable to update tracking.');error.status=response.status;throw error;}return data;
}
if(!valid||!config.url||!config.functionKey){say('This tracking link is incomplete or unavailable. Contact the transportation team.',true);document.querySelectorAll('button').forEach(button=>button.disabled=true);}
else if(driver){
  let watch=null,lastSent=0,sending=false,generation=0;
  const stop=(text='Location sharing stopped.')=>{generation++;if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;$('start-sharing').disabled=false;$('stop-sharing').disabled=true;say(text);};
  $('stop-sharing').addEventListener('click',()=>stop());
  window.addEventListener('pagehide',()=>stop());
  $('start-sharing').addEventListener('click',()=>{
    if(!navigator.geolocation){say('This browser does not support location sharing.',true);return;}
    $('start-sharing').disabled=true;$('stop-sharing').disabled=false;say('Waiting for location permission and GPS…');
    const active=++generation;lastSent=0;
    watch=navigator.geolocation.watchPosition(async position=>{
      if(active!==generation||sending||Date.now()-lastSent<10000)return;
      sending=true;lastSent=Date.now();
      try{await call('location',{lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy});if(active===generation){say('Location sharing is active.');$('location-details').textContent='Last sent: '+new Date().toLocaleTimeString();}}
      catch(error){if(active===generation){if(error.status===410)stop('This trip’s location-sharing link is no longer active.');else say('Location update failed. Retrying when a new position is available.',true);}}
      finally{sending=false;}
    },error=>{stop(error.code===1?'Location permission was denied. Enable it in your browser before starting again.':'Unable to obtain a location. Try again where GPS is available.');},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  });
}else{
  const statuses={pending:'Awaiting confirmation',confirmed:'Trip confirmed',assigned:'Driver assigned',completed:'Trip completed',cancelled:'Trip cancelled'};
  let loading=false;
  async function refresh(){if(loading)return;loading=true;try{
    const data=await call('read');$('trip-status').textContent=statuses[data.status]||'Status unavailable';
    $('driver-details').textContent=data.driver?data.driver.name+' · '+data.driver.vehicle:'A driver has not been assigned yet.';
    $('map-link').hidden=true;
    if(data.location){const stamp=new Date(data.location.updated_at),age=Date.now()-stamp.getTime(),stale=age>90000;
      $('location-details').textContent=(stale?'Last known location (not live)':'Live location')+': '+data.location.lat.toFixed(5)+', '+data.location.lng.toFixed(5)+' · Updated '+stamp.toLocaleTimeString()+' · Accuracy about '+Math.round(data.location.accuracy)+' m';
      $('map-link').href='https://www.openstreetmap.org/?mlat='+encodeURIComponent(data.location.lat)+'&mlon='+encodeURIComponent(data.location.lng)+'#map=16/'+data.location.lat+'/'+data.location.lng;$('map-link').hidden=false;
      say(stale?'The driver has not sent a recent location.':'Receiving driver location updates.');
    }else{$('location-details').textContent='No live location is currently being shared.';say(['completed','cancelled'].includes(data.status)?'Location sharing has ended.':'Waiting for the assigned driver to start sharing.');}
  }catch(error){say(error.message||'Tracking is temporarily unavailable.',true);$('location-details').textContent='Unable to verify a current location.';$('map-link').hidden=true;}finally{loading=false;}}
  $('refresh-tracking').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);
}

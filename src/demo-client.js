// This practice environment never calls Supabase or reads production data.
export function createDemoClient() {
  const key='transport-demo-data', authKey='transport-demo-signed-in';
  let listeners=[];
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const initial={drivers:[{id:'demo-driver',name:'Jordan Sample',phone:'555-010-0200',vehicle:'Black sedan / DEMO',active:true,updated_at:'2026-01-01T00:00:00Z'}],ride_requests:[{id:'demo-request',customer_name:'Alex Sample',email:'alex@example.test',phone:'555-010-0100',service:'Airport transfer',pickup_date:tomorrow,pickup_time:'14:30:00',pickup_timezone:'America/New_York',passengers:2,pickup:'Sample Airport',destination:'Sample Hotel',notes:'Practice request — no real passenger.',status:'pending',driver_id:null,staff_notes:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}],staff_access:[{email:'demo@example.test'}]};
  let data; try{data=JSON.parse(sessionStorage.getItem(key))||initial;}catch{data=initial;}
  const persist=()=>sessionStorage.setItem(key,JSON.stringify(data));
  const session=()=>sessionStorage.getItem(authKey)?{access_token:'demo-only',user:{email:'demo@example.test'}}:null;
  function from(table){
    let filters=[],operation='select',patch,options={},range=[0,1000];
    const query={
      select(_columns,opts){options=opts||{};return query;},order(){return query;},eq(field,value){filters.push(row=>row[field]===value);return query;},limit(n){range=[0,n-1];return query;},range(a,b){range=[a,b];return query;},
      update(value){operation='update';patch=value;return query;},insert(value){operation='insert';patch=value;return query;},
      then(resolve,reject){try{
        if(!session())return Promise.resolve({data:[],error:{message:'Sign in to the demo.'}}).then(resolve,reject);
        let rows=(data[table]||[]).filter(row=>filters.every(filter=>filter(row)));
        if(operation==='insert'){const row={id:crypto.randomUUID(),active:true,updated_at:new Date().toISOString(),created_at:new Date().toISOString(),...patch};data[table].push(row);rows=[row];persist();}
        if(operation==='update'){rows.forEach(row=>Object.assign(row,patch,{updated_at:new Date().toISOString()}));persist();}
        return Promise.resolve({data:options.head?null:structuredClone(rows.slice(range[0],range[1]+1)),count:rows.length,error:null}).then(resolve,reject);
      }catch(error){return Promise.reject(error).then(resolve,reject);}}
    };return query;
  }
  return {from,auth:{
    async signInWithPassword({email,password}){if(email.toLowerCase()!=='demo@example.test'||password!=='demo123')return{error:{message:'Incorrect demo credentials'}};sessionStorage.setItem(authKey,'yes');return{data:{session:session()},error:null};},
    async signOut(){sessionStorage.removeItem(authKey);sessionStorage.removeItem(key);listeners.forEach(fn=>fn('SIGNED_OUT'));return{error:null};},
    async getSession(){return{data:{session:session()}};},onAuthStateChange(fn){listeners.push(fn);return{data:{subscription:{unsubscribe(){listeners=listeners.filter(x=>x!==fn);}}}};}
  }};
}

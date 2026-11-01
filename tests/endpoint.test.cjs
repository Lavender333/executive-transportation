const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const valid = { tracking_token: "a".repeat(64), id:'f1db366b-20cd-42ca-b22c-ddf7c9fec55a',customer_name:'Test Passenger',email:'customer@example.test',phone:'5550101234',service:'Airport transfer',pickup_date:'',pickup_time:'14:30',pickup_timezone:'UTC',passengers:1,pickup:'Test airport',destination:'Test hotel',notes:'',consent:true,website:'' };
valid.pickup_date = new Date(Date.now()+86400000).toISOString().slice(0,10);
async function handler(options={}) {
  const { validateRequest } = await import('../supabase/functions/submit-ride/validation.mjs');
  const saved = [];
  const db = {
    rpc: async()=>({data:options.limit !== false,error:null}),
    from: ()=>({
      insert: async value=>{saved.push(value);return {error:options.duplicate ? {code:'23505'} : null};},
      select: ()=>({eq:()=>({single:async()=>({data:options.previous,error:null})})})
    })
  };
  const source = fs.readFileSync('supabase/functions/submit-ride/index.ts','utf8').replace(/^import .*;\n/gm,'');
  let serve;
  vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,{
    createClient:()=>db, validateRequest, Response, Request, TextDecoder, TextEncoder, crypto:require('node:crypto').webcrypto,
    Deno:{env:{get:()=> 'test-server-only-value'},serve:fn=>{serve=fn;}}
  });
  return {serve,saved};
}
function request(body,headers={}) {return new Request('https://example.test/submit-ride',{method:'POST',headers:{'content-type':'application/json',origin:'https://lavender333.github.io',...headers},body:JSON.stringify(body)});}
test('Request endpoint validates, rate limits, and accepts only safe fields',async()=>{
  const {serve,saved}=await handler();
  assert.equal((await serve(request({...valid,passengers:0}))).status,400);
  assert.equal((await serve(request(valid,{origin:'https://other.example'}))).status,403);
  assert.equal((await serve(request({...valid,notes:'x'.repeat(13000)}))).status,413);
  const response=await serve(request({...valid,status:'confirmed',staff_notes:'admin-only'}));
  assert.equal(response.status,201); assert.equal((await response.json()).id,valid.id);
  assert.equal(saved.length,1); assert.equal(saved[0].status,undefined); assert.equal(saved[0].staff_notes,undefined);
  const limited=await handler({limit:false});assert.equal((await limited.serve(request(valid))).status,429);assert.equal(limited.saved.length,0);
});
test('Duplicate retries are accepted only for matching original details',async()=>{
  const {validateRequest}=await import('../supabase/functions/submit-ride/validation.mjs');
  const previous={...validateRequest(valid),pickup_time:'14:30:00',customer_token_hash:require('node:crypto').createHash('sha256').update(valid.tracking_token).digest('hex')}; delete previous.tracking_token;
  const same=await handler({duplicate:true,previous});assert.equal((await same.serve(request(valid))).status,201);
  const changed=await handler({duplicate:true,previous:{...previous,pickup:'Different pickup'}});assert.equal((await changed.serve(request(valid))).status,409);
});

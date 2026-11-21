import test from 'node:test';import assert from 'node:assert/strict';
import {CircuitBreaker,EventBus,AuditObserver,NotificationObserver,MovementProxy,TransportAdapter} from '../src/patterns.mjs';
import {MovementService} from '../src/service.mjs';
test('Circuit Breaker rechaza sin llamar y recupera con prueba unica',async()=>{let now=0,calls=0,events=[];const cb=new CircuitBreaker({clock:()=>now,timeout:5,log:(_,s)=>events.push(s)});for(let i=0;i<3;i++)await assert.rejects(cb.execute(async()=>{calls++;throw Error('fallo')}));assert.equal(cb.state,'OPEN');await assert.rejects(cb.execute(async()=>{calls++}));assert.equal(calls,3);now=6;await cb.execute(async()=>++calls);assert.equal(cb.state,'CLOSED');assert.deepEqual(events,['OPEN','HALF-OPEN','CLOSED']);});
test('dos observadores intercambiables reciben evento e integración solo tras éxito',async()=>{let events=[];const bus=new EventBus([new AuditObserver((...a)=>events.push(a)),new NotificationObserver((...a)=>events.push(a))]);const service=new MovementService({move:async()=>({orderId:1,transaction:'COMMIT'})},{authorize:async()=>({approved:true})},bus);await service.execute({actor:'A'});assert.equal(events.length,2);const failed=new MovementService({move:async()=>{throw Error('rollback')}},{authorize:async()=>({approved:true})},bus);await assert.rejects(failed.execute({actor:'A'}));assert.equal(events.length,2);});
test('Proxy rechaza datos inválidos antes del servicio real',async()=>{let called=0;const proxy=new MovementProxy({execute:async()=>++called},()=>{});await assert.rejects(proxy.execute({actor:'',product:1,source:1,destination:2,quantity:1}));assert.equal(called,0);assert.equal(await proxy.execute({actor:'A',product:1,source:1,destination:2,quantity:1}),1);});

test('Adapter transforma la solicitud y respuesta del proveedor',async t=>{
  let request;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    request={url,body:JSON.parse(options.body)};
    return {ok:true,json:async()=>({resultCode:'ACCEPTED',ticket:'TEST-001'})};
  });
  const adapter=new TransportAdapter(new CircuitBreaker(),'http://proveedor.test');
  assert.deepEqual(await adapter.authorize({product:12,quantity:3}),{approved:true,reference:'TEST-001'});
  assert.deepEqual(request,{url:'http://proveedor.test/dispatch',body:{articleCode:'12',units:3}});
});

test('Circuit Breaker vuelve a OPEN si falla HALF-OPEN',async()=>{
  let now=0; const transitions=[];
  const cb=new CircuitBreaker({limit:1,timeout:5,clock:()=>now,log:(_,state)=>transitions.push(state)});
  await assert.rejects(cb.execute(async()=>{throw Error('fallo inicial')}));
  now=6;
  await assert.rejects(cb.execute(async()=>{throw Error('servicio aún indisponible')}));
  assert.equal(cb.state,'OPEN');
  assert.deepEqual(transitions,['OPEN','HALF-OPEN','OPEN']);
});


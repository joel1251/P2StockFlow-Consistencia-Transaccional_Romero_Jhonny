import test from 'node:test';
import assert from 'node:assert/strict';
import {AppError,errorResponse} from '../src/errors.mjs';
import {MovementProxy,CircuitBreaker} from '../src/patterns.mjs';
import {InventoryRepository} from '../src/db.mjs';

test('AppError conserva status, código, mensaje, requestId y transacción',()=>{
  const result=errorResponse(new AppError(409,'TRANSACTION_ROLLBACK','Fallo simulado',{transaction:'ROLLBACK'}),'req-1','CLOSED');
  assert.deepEqual(result,{status:409,code:'TRANSACTION_ROLLBACK',message:'Fallo simulado',requestId:'req-1',error:'Fallo simulado',transaction:'ROLLBACK',circuit:'CLOSED'});
});
test('Una excepción inesperada produce HTTP 500 sin exponer información interna',()=>{
  const result=errorResponse(new Error('detalle interno'),'req-2','CLOSED');
  assert.equal(result.status,500);assert.equal(result.code,'INTERNAL_ERROR');assert.equal(result.message,'Error interno del servidor');assert.equal(result.requestId,'req-2');
  assert.ok(!JSON.stringify(result).includes('detalle interno'));
});
test('Proxy y repositorio devuelven excepciones tipadas',async()=>{
  const proxy=new MovementProxy({execute:async()=>{throw Error('No debe ejecutarse')}},()=>{});
  await assert.rejects(proxy.execute({actor:'',product:1,source:1,destination:2,quantity:1}),e=>e instanceof AppError&&e.statusCode===400&&e.code==='INVALID_ACTOR');
  const repository=new InventoryRepository({query:async()=>'{"transaction":"ROLLBACK"}'});
  await assert.rejects(repository.move({product:1,source:1,destination:2,quantity:1,actor:'Prueba',fail:true}),e=>e instanceof AppError&&e.statusCode===409&&e.code==='TRANSACTION_ROLLBACK');
});
test('Circuito abierto comunica HTTP 503 y código CIRCUIT_OPEN',async()=>{
  const breaker=new CircuitBreaker({limit:1,timeout:5000,clock:()=>0});
  await assert.rejects(breaker.execute(async()=>{throw Error('Fallo')}));
  await assert.rejects(breaker.execute(async()=>{throw Error('No debe ejecutarse')}),e=>e instanceof AppError&&e.statusCode===503&&e.code==='CIRCUIT_OPEN');
});

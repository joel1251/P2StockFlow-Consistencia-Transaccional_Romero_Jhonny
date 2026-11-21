import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';

const url='http://127.0.0.1:4300/api/';
const results=[];
async function call(path,method='GET',payload){
  const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(10000)});
  return {status:r.status,requestId:r.headers.get('X-Request-Id'),body:await r.json()};
}
function expect(label,result,status,code){
  assert.equal(result.status,status);assert.equal(result.body.status,status);assert.equal(result.body.code,code);
  assert.ok(result.requestId);assert.equal(result.body.requestId,result.requestId);
  assert.equal(typeof result.body.message,'string');
  results.push({label,...result});
  console.log(`\n${status} ${code}\n  ${result.body.message}\n  requestId: ${result.requestId}\n  transaction: ${result.body.transaction??'null'} | circuit: ${result.body.circuit}`);
}
const before=(await call('state')).body;
const base={product:1,source:1,destination:2,quantity:1,actor:'Jhonny Romero',fail:false};
const move=p=>call('move','POST',p);
expect('Responsable omitido',await move({...base,actor:''}),400,'INVALID_ACTOR');
expect('Cantidad cero',await move({...base,quantity:0}),400,'INVALID_REQUEST');
expect('Ruta no registrada',await call('ruta-inexistente'),404,'NOT_FOUND');
expect('Fallo transaccional simulado',await move({...base,fail:true}),409,'TRANSACTION_ROLLBACK');
const available=before.inventory.find(i=>i.product_id===1&&i.warehouse_id===1).quantity_in_stock;
expect('Stock insuficiente',await move({...base,quantity:available+1}),409,'STOCK_CONFLICT');
try{
  assert.equal((await call('fail','POST')).status,200);
  for(let i=0;i<3;i++)expect(`Fallo externo ${i+1}`,await move(base),503,'SERVICE_UNAVAILABLE');
  const blocked=await move(base);expect('Solicitud bloqueada por circuito abierto',blocked,503,'CIRCUIT_OPEN');
  assert.equal(blocked.body.circuit,'OPEN');
}finally{
  assert.equal((await call('recover','POST')).status,200);
  await new Promise(r=>setTimeout(r,5200));
  // Una consulta externa exitosa cierra el circuito; el traslado se revierte.
  const recovered=await move({...base,fail:true});
  expect('Circuito recuperado; traslado de prueba revertido',recovered,409,'TRANSACTION_ROLLBACK');
  assert.equal(recovered.body.circuit,'CLOSED');
}
const after=(await call('state')).body;
assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.orders,before.orders);
assert.deepEqual(after.products,before.products);assert.equal(after.circuit,'CLOSED');
const output=new URL('../../resultados/errores_http.json',import.meta.url);
await mkdir(new URL('../../resultados/',import.meta.url),{recursive:true});
await writeFile(output,JSON.stringify({date:new Date().toISOString(),results,inventoryUnchanged:true,ordersUnchanged:true,productsUnchanged:true,circuit:after.circuit},null,2));
console.log(`\nCOMPROBACION FINAL: ${results.length} respuestas verificadas; inventario y órdenes intactos; circuito CLOSED.`);

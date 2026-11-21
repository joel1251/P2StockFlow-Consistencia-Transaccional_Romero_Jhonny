import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../../resultados/pruebas.json',import.meta.url);
const data=JSON.parse(await readFile(file,'utf8'));
const r=await fetch('http://127.0.0.1:4300/api/state');assert.equal(r.status,200);const state=await r.json();
assert.ok(state.orders.some(o=>o.order_id===data.confirmedOrder));assert.deepEqual(state.inventory,data.snapshot.inventory);
data.results=data.results.filter(result=>result.name!=='Durabilidad tras reiniciar PostgreSQL y aplicación');
data.results.push({name:'Durabilidad tras reiniciar PostgreSQL y aplicación',details:{confirmedOrder:data.confirmedOrder,found:true,inventoryUnchanged:true}});
await writeFile(file,JSON.stringify(data,null,2));console.log('Durabilidad comprobada: orden',data.confirmedOrder);

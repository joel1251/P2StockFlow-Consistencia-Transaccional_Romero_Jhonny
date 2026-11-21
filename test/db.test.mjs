import test from 'node:test';
import assert from 'node:assert/strict';
import {Postgres, InventoryRepository} from '../src/db.mjs';

test('Postgres interpreta el documento JSON completo aunque contenga saltos de línea', async () => {
  const pg=new Postgres();
  pg.query=async()=>'{"products": [{"product_id":1},\n {"product_id":2}],\n "orders": []}\n';
  assert.deepEqual(await pg.json('SELECT json_build_object(...)'),{
    products:[{product_id:1},{product_id:2}], orders:[]
  });
});

test('Repositorio conserva el resultado transaccional JSON multilínea', async () => {
  const repository=new InventoryRepository({query:async()=>'{"orderId": 1,\n "quantity": 2,\n "sourceRemaining": 8}'});
  assert.deepEqual(await repository.move({product:1,source:1,destination:2,quantity:2,actor:'Prueba',fail:false}),{
    orderId:1,quantity:2,sourceRemaining:8,transaction:'COMMIT'
  });
});

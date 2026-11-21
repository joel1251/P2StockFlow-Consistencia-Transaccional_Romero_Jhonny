import {spawn} from 'node:child_process';
import {AppError} from './errors.mjs';
export class Postgres {
  constructor(executable=process.env.PSQL || 'psql'){this.executable=executable;}
  query(sql,variables={}){
    return new Promise((resolve,reject)=>{
      const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
      for(const [key,value] of Object.entries(variables)) args.push('-v',key+'='+String(value));
      const child=spawn(this.executable,args,{env:{...process.env,PGHOST:process.env.PGHOST||'127.0.0.1',PGPORT:process.env.PGPORT||'55432',PGUSER:process.env.PGUSER||'stockflow',PGDATABASE:process.env.PGDATABASE||'postgres',PGCLIENTENCODING:'UTF8'}});
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      let stdout='',stderr='';
      child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d);
      child.on('error',reject);
      child.on('close',code=>code===0?resolve(stdout.trim()):reject(new Error(stderr.trim()||'PostgreSQL rechazó la consulta')));
      child.stdin.end(sql+'\n');
    });
  }
  async json(sql,params){
    // json_agg y json_build_object pueden devolver un único documento JSON
    // distribuido en varias líneas. Debe interpretarse toda la salida.
    const s=await this.query(sql,params);
    return JSON.parse(s.trim()||'null');
  }
}
export class ProductRepository {
  constructor(db){this.db=db;}
  list(){return this.db.json("SELECT coalesce(json_agg(p ORDER BY product_id),'[]') FROM products p;");}
  create(name,sku){return this.db.json("WITH p AS (INSERT INTO products(product_name,sku) VALUES(:'name',:'sku') RETURNING *), i AS (INSERT INTO inventory(product_id,warehouse_id,quantity_in_stock) SELECT p.product_id,w.warehouse_id,0 FROM p CROSS JOIN warehouses w) SELECT row_to_json(p) FROM p;",{name,sku});}
  update(id,name,sku){return this.db.json("WITH p AS (UPDATE products SET product_name=:'name',sku=:'sku' WHERE product_id=:'id'::int AND is_active RETURNING *) SELECT row_to_json(p) FROM p;",{id,name,sku});}
  remove(id){return this.db.json("WITH p AS (UPDATE products SET is_active=false WHERE product_id=:'id'::int RETURNING *) SELECT row_to_json(p) FROM p;",{id});}
}
export class InventoryRepository {
  constructor(db){this.db=db;}
  snapshot(){return this.db.json("SELECT json_build_object('products',(SELECT coalesce(json_agg(p ORDER BY product_id),'[]') FROM products p),'warehouses',(SELECT json_agg(w ORDER BY warehouse_id) FROM warehouses w),'inventory',(SELECT json_agg(i ORDER BY product_id,warehouse_id) FROM inventory i),'orders',(SELECT coalesce(json_agg(o ORDER BY order_id DESC),'[]') FROM orders o));");}
  async move({product,source,destination,quantity,actor,fail}){
    // SQL real: psql permanece en una única sesión entre BEGIN y COMMIT.
    const sql="\\set ON_ERROR_STOP off\nBEGIN;\nSELECT move_stock(:'product'::int,:'source'::int,:'destination'::int,:'quantity'::int,:'actor',:'fail'::boolean);\n\\if :ERROR\nROLLBACK;\nSELECT json_build_object('transaction','ROLLBACK');\n\\else\nCOMMIT;\n\\endif";
    const output=await this.db.query(sql,{product,source,destination,quantity,actor,fail});
    const result=JSON.parse(output.trim());
    if(result.transaction==='ROLLBACK') throw new AppError(409,fail?'TRANSACTION_ROLLBACK':'STOCK_CONFLICT',fail?'Fallo simulado; ROLLBACK ejecutado':'Operación rechazada: stock o recurso inválido; ROLLBACK ejecutado',{transaction:'ROLLBACK'});
    return {...result,transaction:'COMMIT'};
  }
}


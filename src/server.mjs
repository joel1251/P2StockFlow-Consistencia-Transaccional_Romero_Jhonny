import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {AppError,errorResponse} from './errors.mjs';
import {Postgres,ProductRepository,InventoryRepository} from './db.mjs';
import {EventBus,AuditObserver,NotificationObserver,CircuitBreaker,TransportAdapter,MovementProxy} from './patterns.mjs';
import {MovementService} from './service.mjs';
const db=new Postgres(),products=new ProductRepository(db),inventory=new InventoryRepository(db);
const events=[];const log=(type,value)=>{const event={at:new Date().toISOString(),type,value};events.push(event);if(events.length>200)events.shift();console.log(JSON.stringify(event));};
const breaker=new CircuitBreaker({log});
const external=process.env.EXTERNAL_URL||'http://127.0.0.1:4301';
const proxy=new MovementProxy(new MovementService(inventory,new TransportAdapter(breaker,external),new EventBus([new AuditObserver(log),new NotificationObserver(log)])),log);
const response=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
async function body(req){
 let s='';for await(const chunk of req){s+=chunk;if(s.length>10000)throw new AppError(413,'PAYLOAD_TOO_LARGE','Solicitud demasiado grande');}
 let value;try{value=JSON.parse(s||'{}');}catch{throw new AppError(400,'INVALID_JSON','JSON inválido');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError(400,'INVALID_REQUEST','Se requiere un objeto JSON');
 return value;
}
async function externalRequest(path,method='GET'){
 try{return await fetch(external+path,{method,signal:AbortSignal.timeout(2000)});}
 catch(e){throw new AppError(503,'SERVICE_UNAVAILABLE','Servicio externo no disponible',{cause:e});}
}
async function handler(req,res){
 const requestId=randomUUID();
 res.setHeader('X-Request-Id',requestId);
 let path=new URL(req.url,'http://localhost').pathname;
 try{
  if(path==='/'&&req.method==='GET'){const page=await readFile(new URL('../public/index.html',import.meta.url));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page);}
  if(req.method==='GET'&&path==='/api/state')return response(res,200,{...await inventory.snapshot(),circuit:breaker.state,events});
  if(req.method==='POST'&&path==='/api/move')return response(res,200,await proxy.execute(await body(req)));
  if(req.method==='POST'&&['/api/fail','/api/recover'].includes(path)){let r=await externalRequest('/'+path.split('/').at(-1),'POST');return response(res,r.status,await r.json());}
  if(req.method==='GET'&&path==='/api/external'){let r=await externalRequest('/status');return response(res,r.status,await r.json());}
  if(path==='/api/products'&&req.method==='POST'){const {name,sku}=await body(req);validateProduct(name,sku);return response(res,201,await products.create(name.trim(),sku.trim()));}
  const match=path.match(/^\/api\/products\/(\d+)$/);
  if(match){const id=Number(match[1]);if(req.method==='PUT'){const {name,sku}=await body(req);validateProduct(name,sku);const p=await products.update(id,name.trim(),sku.trim());if(!p)throw new AppError(404,'NOT_FOUND','Producto no encontrado');return response(res,200,p);}if(req.method==='DELETE'){const p=await products.remove(id);if(!p)throw new AppError(404,'NOT_FOUND','Producto no encontrado');return response(res,200,p);}}
  throw new AppError(404,'NOT_FOUND','Ruta inexistente');
 }catch(e){const result=errorResponse(e,requestId,breaker.state);log('ERROR',{status:result.status,code:result.code,message:e.message,transaction:result.transaction,requestId});response(res,result.status,result);}
}
function validateProduct(name,sku){if(typeof name!=='string'||!name.trim()||name.length>150||typeof sku!=='string'||!sku.trim()||sku.length>50)throw new AppError(400,'INVALID_REQUEST','Nombre o SKU inválidos');}
http.createServer(handler).listen(Number(process.env.PORT||4300),process.env.BIND_HOST||'127.0.0.1',()=>console.log('StockFlow disponible'));


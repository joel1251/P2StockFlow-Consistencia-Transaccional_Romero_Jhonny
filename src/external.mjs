import http from 'node:http';
import {randomUUID} from 'node:crypto';
let failing=false, calls=0;
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
http.createServer(async(req,res)=>{
  if(req.url==='/status')return send(res,200,{failing,calls});
  if(req.url==='/fail'&&req.method==='POST'){failing=true;return send(res,200,{failing,calls});}
  if(req.url==='/recover'&&req.method==='POST'){failing=false;return send(res,200,{failing,calls});}
  if(req.url==='/dispatch'&&req.method==='POST'){
    calls++; if(failing)return send(res,503,{error:'Transporte temporalmente fuera de servicio'});
    try{let s='';for await(const part of req){s+=part;if(s.length>8192)return send(res,413,{error:'Solicitud grande'});}
      const {articleCode,units}=JSON.parse(s);
      if(!articleCode||!Number.isInteger(units)||units<1)return send(res,400,{error:'Entrada inválida'});
      return send(res,200,{resultCode:'ACCEPTED',ticket:randomUUID()});
    }catch{return send(res,400,{error:'JSON inválido'});}
  }
  send(res,404,{error:'No encontrado'});
}).listen(Number(process.env.EXTERNAL_PORT||4301),process.env.BIND_HOST||'127.0.0.1',()=>console.log('Servicio externo listo'));


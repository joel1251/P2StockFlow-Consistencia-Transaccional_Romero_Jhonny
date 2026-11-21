import {AppError} from './errors.mjs';
export class EventBus {
  constructor(observers=[]){this.observers=observers;}
  subscribe(observer){this.observers.push(observer);}
  async publish(event){return Promise.allSettled(this.observers.map(o=>Promise.resolve().then(()=>o.notify(event))));}
}
export class AuditObserver {
  constructor(log){this.log=log;}
  notify(event){this.log('AUDITORÍA',event);}
}
export class NotificationObserver {
  constructor(log){this.log=log;}
  notify(event){this.log('NOTIFICACIÓN',{message:'Traslado confirmado',orderId:event.orderId});}
}
export class CircuitBreaker {
  constructor({limit=3,timeout=5000,log=()=>{},clock=Date.now}={}){Object.assign(this,{limit,timeout,log,clock,state:'CLOSED',failures:0,opened:0});}
  transition(state){this.state=state;this.log('CIRCUIT',state);}
  async execute(fn){
    if(this.state==='OPEN'){
      if(this.clock()-this.opened<this.timeout) throw new AppError(503,'CIRCUIT_OPEN','Circuito OPEN: solicitud bloqueada');
      this.transition('HALF-OPEN');
    }else if(this.state==='HALF-OPEN') throw new AppError(503,'CIRCUIT_PROBE_IN_PROGRESS','Prueba HALF-OPEN en curso');
    try{const value=await fn();this.failures=0;if(this.state==='HALF-OPEN')this.transition('CLOSED');return value;}
    catch(e){if(++this.failures>=this.limit||this.state==='HALF-OPEN'){this.opened=this.clock();this.transition('OPEN');}throw e;}
  }
}
export class TransportAdapter {
  constructor(breaker,url){this.breaker=breaker;this.url=url;}
  async authorize({product,quantity}){
    return this.breaker.execute(async()=>{
      const response=await fetch(this.url+'/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({articleCode:String(product),units:quantity}),signal:AbortSignal.timeout(2000)});
      if(!response.ok)throw new AppError(503,'SERVICE_UNAVAILABLE','Servicio externo no disponible');
      const data=await response.json();
      if(data.resultCode!=='ACCEPTED')throw new AppError(503,'TRANSPORT_REJECTED','Transporte rechazado');
      return {approved:true,reference:data.ticket};
    });
  }
}
export class MovementProxy {
  constructor(service,log){this.service=service;this.log=log;}
  async execute(input){
    const actor=String(input.actor||'').trim();
    this.log('PROXY',{actor,at:new Date().toISOString(),action:'MOVIMIENTO'});
    if(!actor||actor.length>100)throw new AppError(400,'INVALID_ACTOR','Identifique al responsable');
    const values=['product','source','destination','quantity'];
    for(const k of values)if(!Number.isSafeInteger(input[k])||input[k]<1||input[k]>2147483647)throw new AppError(400,'INVALID_REQUEST','Valor inválido: '+k);
    if(input.source===input.destination)throw new AppError(400,'SAME_WAREHOUSE','Bodegas deben ser distintas');
    return this.service.execute({...input,actor,fail:input.fail===true});
  }
}


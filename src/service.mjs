import {AppError} from './errors.mjs';
// Dependencias inyectadas: contrato de movimiento, autorización y publicación.
export class MovementService {
  constructor(repository,authorization,bus){Object.assign(this,{repository,authorization,bus});}
  async execute(input){
    // La autorización externa es una consulta de simulación, sin efectos persistentes.
    // Se ejecuta antes de abrir la transacción para evitar una llamada de red con bloqueos.
    let authorization;
    try{authorization=await this.authorization.authorize(input);}
    catch(e){if(e instanceof AppError)throw e;throw new AppError(503,'SERVICE_UNAVAILABLE','Servicio externo no disponible',{cause:e});}
    const result=await this.repository.move(input);
    await this.bus.publish({...result,actor:input.actor});
    return {...result,authorization};
  }
}


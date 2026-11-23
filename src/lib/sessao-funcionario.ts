import 'server-only';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';

export const COOKIE_FUNCIONARIO='evolux_funcionario_sessao';
const DURACAO_SEGUNDOS=8*60*60;
type Identidade={empresaId:string;funcionarioId:string;usuarioAuthId:string;exp:number};

function segredo(){
 const value=process.env.EVOLUX_SESSION_SECRET;
 if(!value||value.length<32)throw new Error('EVOLUX_SESSION_SECRET ausente ou muito curto (mínimo 32 caracteres)');
 return value;
}
function assinatura(payload:string){return createHmac('sha256',segredo()).update(payload).digest('base64url');}
export function emitirSessaoFuncionario(empresaId:string,funcionarioId:string,usuarioAuthId:string){
 const identidade:Identidade={empresaId,funcionarioId,usuarioAuthId,exp:Math.floor(Date.now()/1000)+DURACAO_SEGUNDOS};
 const payload=Buffer.from(JSON.stringify(identidade)).toString('base64url');
 return `${payload}.${assinatura(payload)}`;
}
export function lerSessaoFuncionario(req:NextRequest):Identidade|null{
 const token=req.cookies.get(COOKIE_FUNCIONARIO)?.value;
 if(!token)return null;
 const partes=token.split('.');if(partes.length!==2)return null;
 const [payload,assinaturaRecebida]=partes;
 try{
  const a=Buffer.from(assinaturaRecebida,'base64url');
  const b=Buffer.from(assinatura(payload),'base64url');
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  const dados=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as Partial<Identidade>;
  if(typeof dados.empresaId!=='string'||typeof dados.funcionarioId!=='string'||typeof dados.usuarioAuthId!=='string'||typeof dados.exp!=='number'||dados.exp<=Date.now()/1000)return null;
  return dados as Identidade;
 }catch{return null;}
}
export function definirCookieFuncionario(res:NextResponse,token:string){
 res.cookies.set(COOKIE_FUNCIONARIO,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:DURACAO_SEGUNDOS});
}
export function limparCookieFuncionario(res:NextResponse){
 res.cookies.set(COOKIE_FUNCIONARIO,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
}
// Esta função deve ser chamada pelas rotas financeiras, junto à autenticação Supabase.
// A assinatura prova a origem do cookie; a consulta verifica funcionário ativo e vínculo à empresa.
export async function validarSessaoFuncionario(req:NextRequest,usuarioAuthId:string,admin:{from:(table:string)=>any}){
 const sessao=lerSessaoFuncionario(req);
 if(!sessao||sessao.usuarioAuthId!==usuarioAuthId)return null;
 const {data,error}=await admin.from('evolux_funcionarios').select('id,empresa_id,nome,papel,ativo').eq('id',sessao.funcionarioId).eq('empresa_id',sessao.empresaId).eq('ativo',true).maybeSingle();
 if(error||!data)return null;
 const {data:vinculo,error:erroVinculo}=await admin.from('empresa_usuarios').select('empresa_id').eq('empresa_id',sessao.empresaId).eq('usuario_id',usuarioAuthId).maybeSingle();
 if(erroVinculo||!vinculo)return null;
 return {empresaId:sessao.empresaId,funcionarioId:data.id,nome:data.nome,papel:data.papel};
}

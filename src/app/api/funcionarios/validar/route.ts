import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
export async function POST(req:NextRequest){
 try{const c=await company(req);if(!c)return NextResponse.json({error:'Sessão inválida'},{status:401});
 const {empresaId,id,pin}=await req.json();
 if(!c.links.some(l=>l.empresa_id===empresaId))return NextResponse.json({error:'Empresa não autorizada'},{status:403});
 const {data,error}=await c.admin.rpc('evolux_verificar_pin_funcionario',{p_empresa:empresaId,p_funcionario:id,p_pin:pin});
 if(error){
  console.error('EVOLUX_VALIDAR_PIN_RPC', {
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
  return NextResponse.json({error:'Falha ao validar PIN',codigo:'ERRO_VALIDACAO_PIN'},{status:500});
 }
 const result=data?.[0];if(!result?.autorizado)return NextResponse.json({error:result?.motivo||'Credenciais inválidas'},{status:401});
 return NextResponse.json({ok:true,papel:result.perfil});
 }catch(e){
  console.error('EVOLUX_VALIDAR_PIN_API', {tipo:e instanceof Error?e.name:'Erro desconhecido'});
  return NextResponse.json({error:'Falha de autenticação'},{status:500});
 }
}

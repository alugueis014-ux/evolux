import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
export async function POST(req:NextRequest){
 try{const c=await company(req);if(!c)return NextResponse.json({error:'Sessão inválida'},{status:401});
 const {empresaId,id,pin}=await req.json();
 if(!c.links.some(l=>l.empresa_id===empresaId))return NextResponse.json({error:'Empresa não autorizada'},{status:403});
 const {data,error}=await c.admin.rpc('evolux_verificar_pin_funcionario',{p_empresa:empresaId,p_funcionario:id,p_pin:pin});
 if(error)return NextResponse.json({error:'Falha ao validar PIN'},{status:500});
 const result=data?.[0];if(!result?.autorizado)return NextResponse.json({error:result?.motivo||'Credenciais inválidas'},{status:401});
 return NextResponse.json({ok:true,papel:result.perfil});
 }catch{return NextResponse.json({error:'Falha de autenticação'},{status:500})}
}

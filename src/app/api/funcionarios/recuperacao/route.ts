import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {company} from '@/lib/funcionarios-server';
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
const hash=(code:string)=>createHash('sha256').update(code).digest('hex');
export async function POST(req:NextRequest){
 try{
  const c=await company(req);if(!c)return fail('Sessão da empresa inválida',401);
  const b=await req.json();const empresaId=String(b.empresaId||''),funcionarioId=String(b.funcionarioId||'');
  if(!c.links.some(l=>l.empresa_id===empresaId))return fail('Empresa não autorizada',403);
  const {data:f,error:fe}=await c.admin.from('evolux_funcionarios').select('id,ativo').eq('empresa_id',empresaId).eq('id',funcionarioId).maybeSingle();
  if(fe||!f||!f.ativo)return fail('Funcionário indisponível',404);
  if(b.action==='solicitar'){
   const {data:pending}=await c.admin.from('evolux_recuperacoes_pin').select('id').eq('funcionario_id',funcionarioId).eq('situacao','pendente').maybeSingle();
   if(pending)return NextResponse.json({ok:true});
   const {error}=await c.admin.from('evolux_recuperacoes_pin').insert({empresa_id:empresaId,funcionario_id:funcionarioId});
   if(error)return fail(error.code==='23505'?'Solicitação já registrada':'Falha ao registrar solicitação',409);
   return NextResponse.json({ok:true});
  }
  if(b.action==='redefinir'){
   const codigo=String(b.codigo||'').trim(),novoPin=String(b.novoPin||'');
   if(!/^[a-f0-9]{32}$/i.test(codigo)||novoPin.length<3||novoPin.length>64)return fail('Código ou PIN inválido');
   const {data,error}=await c.admin.rpc('evolux_consumir_recuperacao_pin',{p_empresa:empresaId,p_funcionario:funcionarioId,p_codigo_hash:hash(codigo.toLowerCase()),p_novo_pin:novoPin});
   if(error)return fail('Falha ao redefinir PIN',500);
   if(!data)return fail('Código inválido, expirado ou já utilizado',401);
   return NextResponse.json({ok:true});
  }
  return fail('Operação inválida');
 }catch{return fail('Falha na recuperação',500)}
}

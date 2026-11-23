export async function GET(req:NextRequest){
 try{
  const c=await company(req);if(!c)return fail("Sessão inválida",401);
  const empresaId=new URL(req.url).searchParams.get("empresaId")||"";
  if(!c.links.some(l=>l.empresa_id===empresaId&&l.papel==="administrador"))return fail("Acesso restrito",403);
  const {data,error}=await c.admin.from("evolux_recuperacoes_pin").select("id,funcionario_id,solicitado_em").eq("empresa_id",empresaId).eq("situacao","pendente").order("solicitado_em",{ascending:false}).limit(50);
  if(error)return fail("Falha ao consultar pendências",500);
  const {data:funcionarios}=await c.admin.from("evolux_funcionarios").select("id,nome").eq("empresa_id",empresaId);
  return NextResponse.json({solicitacoes:(data||[]).map(x=>({...x,nome:funcionarios?.find(f=>f.id===x.funcionario_id)?.nome||"Funcionário"}))},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("Falha ao consultar pendências",500)}
}
import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {company} from '@/lib/funcionarios-server';
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
async function adminAutorizado(c:NonNullable<Awaited<ReturnType<typeof company>>>,empresaId:string,adminId:string,pin:string){
 if(!c.links.some(l=>l.empresa_id===empresaId&&l.papel==='administrador'))return false;
 const {data,error}=await c.admin.rpc('evolux_verificar_pin_funcionario',{p_empresa:empresaId,p_funcionario:adminId,p_pin:pin});
 return !error&&data?.[0]?.autorizado===true&&data[0].perfil==='administrador';
}
export async function POST(req:NextRequest){
 try{
  const c=await company(req);if(!c)return fail('Sessão inválida',401);
  const b=await req.json(),empresaId=String(b.empresaId||''),adminId=String(b.adminId||''),pin=String(b.pin||'');
  if(!await adminAutorizado(c,empresaId,adminId,pin))return fail('Administrador não autorizado',403);
  if(b.action==='listar'){
   const {data,error}=await c.admin.from('evolux_recuperacoes_pin').select('id,funcionario_id,solicitado_em,situacao').eq('empresa_id',empresaId).eq('situacao','pendente').order('solicitado_em',{ascending:false}).limit(50);
   if(error)return fail('Falha ao consultar solicitações',500);
   const {data:users}=await c.admin.from('evolux_funcionarios').select('id,nome').eq('empresa_id',empresaId);
   return NextResponse.json({solicitacoes:(data||[]).map(x=>({...x,nome:users?.find(u=>u.id===x.funcionario_id)?.nome||'Funcionário'}))});
  }
  if(b.action==='decidir'){
   const id=String(b.id||'');if(!['aprovar','recusar'].includes(b.decisao))return fail('Decisão inválida');
   const codigo=randomBytes(16).toString('hex');
   const {data,error}=await c.admin.from('evolux_recuperacoes_pin').update({situacao:b.decisao==='aprovar'?'aprovada':'recusada',decidido_em:new Date().toISOString(),codigo_hash:b.decisao==='aprovar'?createHash('sha256').update(codigo).digest('hex'):null,expira_em:b.decisao==='aprovar'?new Date(Date.now()+10*60*1000).toISOString():null}).eq('id',id).eq('empresa_id',empresaId).eq('situacao','pendente').select('id').maybeSingle();
   if(error||!data)return fail('Solicitação já analisada ou indisponível',409);
   return NextResponse.json({ok:true,...(b.decisao==='aprovar'?{codigo}:{})});
  }
  return fail('Operação inválida');
 }catch{return fail('Falha na análise',500)}
}

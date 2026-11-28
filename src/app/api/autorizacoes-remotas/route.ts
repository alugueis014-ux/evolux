import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
import {validarSessaoFuncionario} from '@/lib/sessao-funcionario';
const tabela='evolux_autorizacoes_remotas';
const campos='id,operador_id,administrador_id,operacao,referencia,dados,status,criada_em,expira_em,decidida_em,motivo_recusa';
const resposta=(dados:unknown,status=200)=>NextResponse.json(dados,{status,headers:{'Cache-Control':'no-store'}});
const falha=(error:string,status=400)=>resposta({error},status);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function contexto(req:NextRequest){
 const c=await company(req);if(!c)return null;
 const f=await validarSessaoFuncionario(req,c.user.id,c.admin);
 return f?{...c,f}:null;
}
export async function GET(req:NextRequest){
 try{
  const c=await contexto(req);if(!c)return falha('Sessão inválida.',401);
  const {f,admin}=c;const id=req.nextUrl.searchParams.get('id');
  let q=admin.from(tabela).select(campos).eq('empresa_id',f.empresaId);
  if(id){if(!uuid(id))return falha('Identificador inválido.');q=q.eq('id',id).eq('operador_id',f.funcionarioId).eq('usuario_auth_id',c.user.id);}
  else{if(f.papel!=='administrador')return falha('Acesso restrito.',403);q=q.eq('administrador_id',f.funcionarioId).eq('status','pendente').gt('expira_em',new Date().toISOString());}
  const {data,error}=await q.order('criada_em',{ascending:false}).limit(100);
  if(error)return falha('Falha na consulta.',500);
  return resposta({solicitacoes:(data||[]).map(a=>({...a,status:['pendente','aprovada'].includes(a.status)&&Date.parse(a.expira_em)<=Date.now()?'expirada':a.status}))});
 }catch{return falha('Falha na consulta.',500);}
}
export async function POST(req:NextRequest){
 try{
  const c=await contexto(req);if(!c)return falha('Sessão inválida.',401);
  const {f,admin}=c;const b=await req.json();
  if(!b||typeof b!=='object')return falha('Dados inválidos.');
  if(b.acao==='solicitar'){
   // Operações locais e financeiras.
   if(!['apagar_item','cancelar_lancamento','cancelar_venda','corrigir_pagamento'].includes(b.operacao)||!uuid(b.administradorId)||b.administradorId===f.funcionarioId||typeof b.referencia!=='string'||b.referencia.length>128||!b.referencia||!b.dados||typeof b.dados!=='object'||Array.isArray(b.dados)||JSON.stringify(b.dados).length>16000)return falha('Solicitação inválida.');
   if(['cancelar_venda','corrigir_pagamento'].includes(b.operacao)){
    if(!uuid(b.referencia)||typeof b.dados.motivo!=='string'||b.dados.motivo.trim().length<5||b.dados.motivo.length>1000)return falha('Dados financeiros inválidos.');
    if(b.operacao==='corrigir_pagamento'&&(!Array.isArray(b.dados.pagamentos)||b.dados.pagamentos.length<1||b.dados.pagamentos.length>4))return falha('Pagamentos inválidos.');
    const {data:v,error:ve}=await admin.from('vendas').select('id,situacao').eq('id',b.referencia).eq('empresa_id',f.empresaId).maybeSingle();
    if(ve||!v||v.situacao!=='concluida')return falha('Venda indisponível.',409);
    b.dados=b.operacao==='cancelar_venda'?{motivo:b.dados.motivo.trim()}:{motivo:b.dados.motivo.trim(),pagamentos:b.dados.pagamentos};
   }
   const {data:a,error:e}=await admin.from('evolux_funcionarios').select('id').eq('empresa_id',f.empresaId).eq('id',b.administradorId).eq('papel','administrador').eq('ativo',true).maybeSingle();
   if(e||!a)return falha('Administrador indisponível.',403);
   const {data,error}=await admin.from(tabela).insert({empresa_id:f.empresaId,operador_id:f.funcionarioId,usuario_auth_id:c.user.id,administrador_id:a.id,operacao:b.operacao,referencia:b.referencia,dados:b.dados}).select(campos).single();
   if(error)return falha('Falha ao solicitar.',500);return resposta({solicitacao:data},201);
  }
  if(!uuid(b.id))return falha('Identificador inválido.');
  const agora=new Date().toISOString();
  if(b.acao==='decidir'){
   if(f.papel!=='administrador'||!['aprovar','recusar'].includes(b.decisao))return falha('Decisão não autorizada.',403);
   const {data,error}=await admin.from(tabela).update({status:b.decisao==='aprovar'?'aprovada':'recusada',decidida_em:agora,motivo_recusa:b.decisao==='recusar'?String(b.motivo||'').slice(0,1000):null}).eq('id',b.id).eq('empresa_id',f.empresaId).eq('administrador_id',f.funcionarioId).neq('operador_id',f.funcionarioId).eq('status','pendente').gt('expira_em',agora).select(campos).maybeSingle();
   if(error)return falha('Falha na decisão.',500);if(!data)return falha('Solicitação indisponível ou expirada.',409);return resposta({solicitacao:data});
  }
  if(b.acao==='cancelar'){
   const {data,error}=await admin.from(tabela).update({status:'cancelada',cancelada_em:agora}).eq('id',b.id).eq('empresa_id',f.empresaId).eq('operador_id',f.funcionarioId).eq('usuario_auth_id',c.user.id).in('status',['pendente','aprovada']).gt('expira_em',agora).select(campos).maybeSingle();
   if(error)return falha('Falha ao cancelar.',500);if(!data)return falha('Solicitação indisponível.',409);return resposta({solicitacao:data});
  }
  if(b.acao==='executar_financeiro'){
   const {data:r,error:e}=await admin.from(tabela).select('operacao,referencia,dados,status').eq('id',b.id).eq('empresa_id',f.empresaId).eq('operador_id',f.funcionarioId).eq('usuario_auth_id',c.user.id).maybeSingle();
   if(e||!r||!['cancelar_venda','corrigir_pagamento'].includes(r.operacao))return falha('Solicitação indisponível.',409);
   if(r.status==='utilizada')return resposta({ok:true});
   if(r.status!=='aprovada')return falha('Solicitação não aprovada.',409);
   const args={p_venda_id:r.referencia,p_motivo:r.dados.motivo,p_autorizacao:b.id,p_empresa:f.empresaId,p_operador:f.funcionarioId,p_usuario:c.user.id};
   const {data,error}=r.operacao==='cancelar_venda'?await admin.rpc('evolux_cancelar_venda_remota',args):await admin.rpc('evolux_corrigir_pagamento_remoto',{...args,p_pagamentos:r.dados.pagamentos});
   if(error||!data?.sucesso)return falha(error?.message||'Operação não confirmada.',409);
   return resposta({ok:true});
  }
  if(b.acao==='consumir'){
   if(!['apagar_item','cancelar_lancamento'].includes(b.operacao)||typeof b.referencia!=='string'||!b.dados||typeof b.dados!=='object')return falha('Operação inválida.');
   const {data,error}=await admin.rpc('evolux_consumir_autorizacao_remota',{p_id:b.id,p_empresa:f.empresaId,p_operador:f.funcionarioId,p_usuario_auth:c.user.id,p_operacao:b.operacao,p_referencia:b.referencia,p_dados:b.dados});
   if(error||!data)return falha('Autorização indisponível, expirada ou utilizada.',409);return resposta({ok:true});
  }
  return falha('Ação inválida.');
 }catch{return falha('Falha na autorização remota.',500);}
}

import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {company} from '@/lib/funcionarios-server';
import {validarSessaoFuncionario} from '@/lib/sessao-funcionario';
import {temAteDuasCasas} from '@/lib/dinheiro';
const headers={'Cache-Control':'no-store'};
function fail(message:string,status=400){return NextResponse.json({error:message},{status,headers});}
async function handle(req:NextRequest,method:'GET'|'POST'){
 try{
  const c=await company(req);if(!c)return fail('Sessão Supabase inválida',401);
  const f=await validarSessaoFuncionario(req,c.user.id,c.admin);
  if(!f)return fail('Sessão do funcionário inválida. Selecione o usuário novamente.',401);
  const body:Record<string,unknown>=method==='POST'?await req.json():{};
  const action=method==='GET'?'turno':String(body.acao||'');
  const admin=c.admin;
  // As rotinas de fechamento chamam evolux_resumo_caixa(), que exige auth.uid().
  // O cliente service_role nao possui a identidade do usuario autenticado.
  // Este cliente usa o JWT ja validado por company(req), sem expor chaves privilegiadas.
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim()||'';
  if(!url||!key||!token)return fail('Autenticacao Supabase nao configurada',401);
  const usuario=createClient(url,key,{
   global:{headers:{Authorization:`Bearer ${token}`}},
   auth:{persistSession:false,autoRefreshToken:false}
  });
  if(action==='turno'){
   const {data,error}=await admin.from('caixa_turnos').select('id,numero,saldo_inicial,aberto_em,operador_id').eq('empresa_id',f.empresaId).eq('funcionario_id',f.funcionarioId).eq('situacao','aberto').maybeSingle();
   if(error)throw new Error(error.message);
   return NextResponse.json({turno:data,funcionario:f.nome},{headers});
  }
  if(action==='abrir'){
   const valor=Number(body.saldo_inicial);
   if(!Number.isFinite(valor)||valor<0||!temAteDuasCasas(valor))return fail('Saldo inicial inválido');
   const {data,error}=await admin.from('caixa_turnos').insert({empresa_id:f.empresaId,operador_id:c.user.id,funcionario_id:f.funcionarioId,saldo_inicial:valor}).select('id,numero,saldo_inicial').single();
   if(error)return fail(error.code==='23505'?'Já existe um turno aberto para este funcionário':error.message,error.code==='23505'?409:400);
   return NextResponse.json({turno:data},{headers});
  }
  if(action==='enviar'){
   const {data,error}=await usuario.rpc('evolux_caixa_enviar_individual',{p_turno_id:body.turno_id,p_funcionario_id:f.funcionarioId,p_usuario_auth_id:c.user.id,p_dinheiro:body.dinheiro,p_pix:body.pix,p_cartao:body.cartao,p_justificativa:body.justificativa||null});
   if(error)return fail(error.message);return NextResponse.json(data,{headers});
  }
  if(action==='decidir'){
   if(f.papel!=='administrador')return fail('Somente administrador pode aprovar ou devolver',403);
   const {data,error}=await usuario.rpc('evolux_caixa_decidir_individual',{p_revisao_id:body.revisao_id,p_aprovar:body.aprovar,p_parecer:body.parecer||null,p_supervisor_funcionario_id:f.funcionarioId,p_usuario_auth_id:c.user.id});
   if(error)return fail(error.message);return NextResponse.json(data,{headers});
  }
  if(action==='regularizar_legado'){
   if(f.papel!=='administrador')return fail('Somente administrador pode regularizar turno legado',403);
   const parecer=String(body.parecer||'').trim();
   if(!parecer||parecer.length>900||typeof body.aprovar!=='boolean'||!Number.isSafeInteger(Number(body.revisao_id)))return fail('Decisão ou justificativa inválida');
   const {data,error}=await usuario.rpc('evolux_regularizar_caixa_legado',{
    p_revisao_id:body.revisao_id,p_aprovar:body.aprovar,p_parecer:parecer,
    p_supervisor_funcionario_id:f.funcionarioId,p_usuario_auth_id:c.user.id
   });
   if(error)return fail(error.message);return NextResponse.json(data,{headers});
  }
  if(action==='recontar_legado'){
   if(f.papel!=='administrador')return fail('Somente administrador pode registrar recontagem legada',403);
   const justificativa=String(body.justificativa||'').trim();
   const valores=[body.dinheiro,body.pix,body.cartao].map(Number);
   if(!justificativa||justificativa.length>900||valores.some(v=>!Number.isFinite(v)||v<0||Math.abs(v*100-Math.round(v*100))>0.000001))return fail('Valores ou justificativa inválidos');
   const {data,error}=await usuario.rpc('evolux_recontar_caixa_legado',{
    p_turno_id:body.turno_id,p_dinheiro:valores[0],p_pix:valores[1],p_cartao:valores[2],
    p_justificativa:justificativa,p_supervisor_funcionario_id:f.funcionarioId,p_usuario_auth_id:c.user.id
   });
   if(error)return fail(error.message);return NextResponse.json(data,{headers});
  }
  if(action==='comprovante_historico'){
   if(f.papel!=='administrador')return fail('Somente o administrador pode reimprimir o fechamento completo',403);
   const numero=Number(body.numero);
   if(!Number.isSafeInteger(numero)||numero<=0)return fail('Número de turno inválido');
   const {data:turno,error:et}=await admin.from('caixa_turnos')
    .select('id,numero,empresa_id,funcionario_id,situacao,fechado_em')
    .eq('empresa_id',f.empresaId).eq('numero',numero).maybeSingle();
   if(et)return fail(et.message,500);
   if(!turno||turno.situacao!=='fechado'||!turno.fechado_em)return fail('Fechamento não encontrado',404);
   // A API ja validou o JWT, o PIN e a empresa do administrador.
   // A leitura do registro arquivado ocorre apenas no servidor, por service_role.
   // Nao depende de SELECT/RLS no cliente authenticated.
   const {data:fechamento,error:ef}=await admin.from('caixa_fechamentos')
    .select('id,saldo_esperado,saldo_informado').eq('empresa_id',f.empresaId)
    .eq('caixa_turno_id',turno.id).maybeSingle();
   if(ef)return fail(ef.message,500);
   if(!fechamento)return fail('Registro de fechamento não encontrado',404);
   const {data:contagem,error:ec}=await admin.from('evolux_caixa_revisoes')
    .select('dinheiro,pix,cartao,parecer,supervisor_funcionario_id')
    .eq('empresa_id',f.empresaId).eq('caixa_turno_id',turno.id)
    .eq('status','aprovado').order('tentativa',{ascending:false}).limit(1).maybeSingle();
   if(ec)return fail(ec.message,500);
   if(!contagem)return fail('Contagem aprovada não encontrada',404);
   const {data:resumo,error:er}=await usuario.rpc('evolux_resumo_caixa',{p_caixa_turno_id:turno.id});
   if(er)return fail(er.message,500);
   if(!resumo)return fail('Resumo financeiro indisponível',500);
   // Verifica que o dinheiro esperado é consistente com o fechamento arquivado.
   const esperado=Number((resumo as Record<string,unknown>).saldo_esperado);
   if(!Number.isFinite(esperado)||Math.abs(esperado-Number(fechamento.saldo_esperado))>0.01)
    return fail('Resumo atual difere do fechamento arquivado. Impressão bloqueada para evitar valores incorretos.',409);
   const ids=[turno.funcionario_id,contagem.supervisor_funcionario_id].filter((x):x is string=>typeof x==='string');
   const nomes=new Map<string,string>();
   if(ids.length){
    const {data:funcs,error:en}=await admin.from('evolux_funcionarios')
     .select('id,nome').eq('empresa_id',f.empresaId).in('id',ids);
    if(en)return fail(en.message,500);
    for(const item of funcs||[])nomes.set(item.id,item.nome);
   }
   return NextResponse.json({turno,contagem,resumo,
    operador_nome:turno.funcionario_id?nomes.get(turno.funcionario_id)||'Operador não identificado':'Não identificado (turno antigo)',
    aprovador_nome:contagem.supervisor_funcionario_id?nomes.get(contagem.supervisor_funcionario_id)||'Administrador':'Administrador'
   },{headers});
  }
  if(action==='pendentes'){
   if(f.papel!=='administrador')return fail('Acesso restrito à administração',403);
   const {data,error}=await usuario.rpc('evolux_listar_caixas_supervisao',{p_empresa_id:f.empresaId});
   if(error)return fail(error.message);
   const lista=(data||[]) as Record<string,unknown>[];
   const {data:legados,error:el}=await admin.from('caixa_turnos')
    .select('id,numero').eq('empresa_id',f.empresaId).eq('situacao','aberto').is('funcionario_id',null);
   if(el)throw new Error(el.message);
   for(const t of legados||[]){
    const {data:ultima,error:er}=await admin.from('evolux_caixa_revisoes')
     .select('id,caixa_turno_id,operador_id,tentativa,criado_em,justificativa,dinheiro,pix,cartao,status')
     .eq('caixa_turno_id',t.id).order('tentativa',{ascending:false}).limit(1).maybeSingle();
    if(er)throw new Error(er.message);
    if(ultima?.status==='devolvido')lista.push({...ultima,numero:t.numero,operador_nome:'Operador não identificado (turno antigo)',legado_devolvido:true});
   }

   const ids=lista.map(r=>String(r.caixa_turno_id));
   if(!ids.length)return NextResponse.json({pendentes:[]},{headers});
   const {data:turnos,error:et}=await admin.from('caixa_turnos').select('id,funcionario_id').eq('empresa_id',f.empresaId).in('id',ids);
   if(et)throw new Error(et.message);
   const mapa=new Map((turnos||[]).map(t=>[t.id,t.funcionario_id]));
   const fids=[...new Set([...mapa.values()].filter(Boolean))];
   const nomes=new Map<string,string>();
   if(fids.length){const {data:funcs,error:ef}=await admin.from('evolux_funcionarios').select('id,nome').eq('empresa_id',f.empresaId).in('id',fids);if(ef)throw new Error(ef.message);for(const x of funcs||[])nomes.set(x.id,x.nome);}
   return NextResponse.json({pendentes:lista.map(r=>({...r,funcionario_id:mapa.get(String(r.caixa_turno_id))||null,operador_nome:nomes.get(String(mapa.get(String(r.caixa_turno_id))))||'Operador não identificado (turno antigo)'}))},{headers});
  }
  return fail('Ação não reconhecida');
 }catch(e){return fail(e instanceof Error?e.message:'Falha na operação',500);}
}
export async function GET(req:NextRequest){return handle(req,'GET');}
export async function POST(req:NextRequest){return handle(req,'POST');}

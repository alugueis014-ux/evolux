import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
import {validarSessaoFuncionario} from '@/lib/sessao-funcionario';
export async function GET(req:NextRequest){
 try{
 const c=await company(req); if(!c)return NextResponse.json({error:'Sessão inválida'},{status:401});
 const f=await validarSessaoFuncionario(req,c.user.id,c.admin); if(!f||f.papel!=='administrador')return NextResponse.json({error:'Acesso restrito'},{status:403});
 const inicio=req.nextUrl.searchParams.get('inicio')||'', fim=req.nextUrl.searchParams.get('fim')||'';
 const a=new Date(inicio+'T00:00:00-03:00'), b=new Date(fim+'T00:00:00-03:00');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)||!Number.isFinite(+a)||!Number.isFinite(+b)||a>b)return NextResponse.json({error:'Período inválido'},{status:400});
 b.setUTCDate(b.getUTCDate()+1);
 const registros=[];
 for(let offset=0;;offset+=200){
 const r=await c.admin.from('vendas').select('id,numero,criada_em,situacao,subtotal,desconto,total,troco,cliente_id,caixa_turno_id').eq('empresa_id',f.empresaId).in('situacao',['concluida','cancelada']).gte('criada_em',a.toISOString()).lt('criada_em',b.toISOString()).order('criada_em').order('id').range(offset,offset+199);
 if(r.error)throw r.error; registros.push(...r.data); if(r.data.length<200)break; if(registros.length>=20000)return NextResponse.json({error:'Período muito amplo. Reduza as datas.'},{status:400});
 }
 const itens:Record<string,unknown>[]=[], pagamentos:Record<string,unknown>[]=[];
 for(let i=0;i<registros.length;i+=100){const ids=registros.slice(i,i+100).map(v=>v.id);
 for(const [t,cols,dest] of [['venda_itens','id,venda_id,produto_id,descricao,quantidade,subtotal,custo_unitario',itens],['venda_pagamentos','id,venda_id,forma,modalidade,valor',pagamentos]] as const){for(let o=0;;o+=500){const r=await c.admin.from(t).select(cols).in('venda_id',ids).order('id').range(o,o+499);if(r.error)throw r.error;dest.push(...(r.data as unknown as Record<string,unknown>[]));if(r.data.length<500)break;}}
 }
 async function cadastro(t:string,cols:string){const rows=[];for(let o=0;;o+=500){const r=await c!.admin.from(t).select(cols).eq('empresa_id',f!.empresaId).order('id').range(o,o+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)return rows;}}
 const [clientes,turnos,funcionarios]=await Promise.all([cadastro('clientes','id,nome'),cadastro('caixa_turnos','id,numero,funcionario_id'),cadastro('evolux_funcionarios','id,nome')]);
 const emp=await c.admin.from('empresas').select('razao_social,nome_fantasia,documento').eq('id',f.empresaId).maybeSingle();
 return NextResponse.json({registros,itens,pagamentos,clientes,turnos,funcionarios,empresa:emp.error||!emp.data?[]:[emp.data]},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error("[Relatório de vendas]",error);return NextResponse.json({error:'Falha ao consultar vendas. '+(typeof error==='object'&&error!==null&&'code' in error?String(error.code):'Erro interno')},{status:500});}
}

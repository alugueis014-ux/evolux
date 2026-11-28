import {NextRequest,NextResponse,connection} from 'next/server';
import {company} from '@/lib/funcionarios-server';
import {validarSessaoFuncionario} from '@/lib/sessao-funcionario';
export async function GET(req:NextRequest){
 await connection();
 const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try{
 const c=await company(req);if(!c)return reply({error:'Sessão inválida'},401);
 const f=await validarSessaoFuncionario(req,c.user.id,c.admin);if(!f||f.papel!=='administrador')return reply({error:'Acesso restrito ao administrador'},403);
 const id=f.empresaId,tipo=req.nextUrl.searchParams.get('tipo');
 const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 if(tipo==='pendentes'){
 const r=await c.admin.from('evolux_contas_pagar').select('descricao,valor,vencimento,situacao').eq('empresa_id',id).eq('situacao','pendente').order('vencimento').limit(1000);if(r.error)throw r.error;
 return reply({registros:r.data.map(x=>({'Descrição':x.descricao,'Valor':money(Number(x.valor)),'Vencimento':x.vencimento,'Situação':x.situacao}))});
 }
 if(tipo==='acessos'){
 const min=new Date(Date.now()-60*86400000).toISOString();const inicio=req.nextUrl.searchParams.get('inicio'),fim=req.nextUrl.searchParams.get('fim');let q=c.admin.from('evolux_historico_acessos').select('id,nome,papel,criado_em').eq('empresa_id',id).gte('criado_em',min);if(inicio)q=q.gte('criado_em',inicio+'T00:00:00-03:00');if(fim)q=q.lte('criado_em',fim+'T23:59:59-03:00');const r=await q.order('criado_em',{ascending:false}).limit(1000);if(r.error)throw r.error;return reply({registros:r.data,limitado:r.data.length===1000});
 }
 if(tipo==='balancete'){
 let receita=0,despesas=0;
 for(let offset=0;;offset+=500){const r=await c.admin.from('vendas').select('id,total').eq('empresa_id',id).eq('situacao','concluida').order('id').range(offset,offset+499);if(r.error)throw r.error;for(const x of r.data)receita+=Number(x.total);if(r.data.length<500)break;}
 for(let offset=0;;offset+=500){const r=await c.admin.from('evolux_contas_pagar').select('id,valor,valor_pago').eq('empresa_id',id).eq('situacao','pago').order('id').range(offset,offset+499);if(r.error)throw r.error;for(const x of r.data)despesas+=Number(x.valor_pago??x.valor);if(r.data.length<500)break;}
 return reply({registros:[{Indicador:'Vendas concluídas (histórico)',Valor:money(receita)},{Indicador:'Contas registradas como pagas',Valor:money(despesas)},{Indicador:'Diferença gerencial parcial (não é saldo de caixa)',Valor:money(receita-despesas)}]});
 }
 if(tipo==='informacoes'){
 const e=await c.admin.from('empresas').select('razao_social,nome_fantasia,documento').eq('id',id).single();if(e.error)throw e.error;
 const registros=[{Indicador:'Empresa',Valor:e.data.nome_fantasia||e.data.razao_social},{Indicador:'CPF/CNPJ',Valor:e.data.documento}];
 for(const [t,n] of [['produtos','Produtos'],['clientes','Clientes'],['fornecedores','Fornecedores'],['vendas','Vendas concluídas']]){let q=c.admin.from(t).select('id',{count:'exact',head:true}).eq('empresa_id',id);if(t==='vendas')q=q.eq('situacao','concluida');const r=await q;if(r.error)throw r.error;registros.push({Indicador:n,Valor:String(r.count??0)});}
 let estoque=0,custo=0,venda=0,receita=0,contas=0;for(let i=0;;i+=500){const r=await c.admin.from('produtos').select('id,estoque_atual,preco_custo,preco_venda').eq('empresa_id',id).order('id').range(i,i+499);if(r.error)throw r.error;for(const x of r.data){estoque+=Number(x.estoque_atual);custo+=Number(x.estoque_atual)*Number(x.preco_custo);venda+=Number(x.estoque_atual)*Number(x.preco_venda);}if(r.data.length<500)break;}for(let i=0;;i+=500){const r=await c.admin.from('vendas').select('id,total').eq('empresa_id',id).eq('situacao','concluida').order('id').range(i,i+499);if(r.error)throw r.error;for(const x of r.data)receita+=Number(x.total);if(r.data.length<500)break;}let quantidade=0;for(let i=0;;i+=500){const r=await c.admin.from('evolux_contas_pagar').select('id,valor').eq('empresa_id',id).neq('situacao','cancelado').order('id').range(i,i+499);if(r.error)throw r.error;for(const x of r.data){quantidade++;contas+=Number(x.valor);}if(r.data.length<500)break;}registros.push({Indicador:'Quantidade em estoque',Valor:String(estoque)},{Indicador:'Estoque a custo',Valor:money(custo)},{Indicador:'Estoque a venda',Valor:money(venda)},{Indicador:'Valor das vendas concluídas',Valor:money(receita)},{Indicador:'Contas registradas',Valor:String(quantidade)},{Indicador:'Valor nominal das contas',Valor:money(contas)});return reply({registros});
 }
 return reply({error:'Relatório inválido'},400);
 }catch(e){console.error('Relatórios:',e);return reply({error:'Falha ao consultar relatório. Confira o terminal.'},500);}
}

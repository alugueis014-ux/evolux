import {NextRequest,NextResponse,connection} from "next/server";
import {company} from "@/lib/funcionarios-server";
export async function GET(req:NextRequest){
 await connection();
 try{
  const c=await company(req);if(!c)return NextResponse.json({error:"Sessão inválida"},{status:401});
  const empresa=c.links.find(l=>l.papel==="administrador");
  if(!empresa)return NextResponse.json({error:"Acesso restrito ao administrador"},{status:403});
  const tabelas=["empresas","produtos","clientes","fornecedores","vendas","venda_itens","venda_pagamentos","caixa_turnos","caixa_fechamentos","produto_movimentacoes"];
  const dados:Record<string,unknown[]>={};
  const {data:vendasIds,error:erroIds}=await c.admin.from("vendas").select("id").eq("empresa_id",empresa.empresa_id);
  if(erroIds)throw erroIds;
  const ids=(vendasIds||[]).map(v=>v.id);
  if(ids.length>=1000)return NextResponse.json({error:"A empresa possui muitas vendas para exportação segura neste formato. Use exportação paginada."},{status:409});
  for(const tabela of tabelas){
   const linhas:unknown[]=[];
   for(let inicio=0;inicio<100000;inicio+=500){
    if((tabela==="venda_itens"||tabela==="venda_pagamentos")&&!ids.length)break;
    let q=c.admin.from(tabela).select("*");
    if(tabela==="empresas")q=q.eq("id",empresa.empresa_id);
    else if(tabela==="venda_itens"||tabela==="venda_pagamentos")q=q.in("venda_id",ids);
    else q=q.eq("empresa_id",empresa.empresa_id);
    const {data,error}=await q.range(inicio,inicio+499);
    // Venda_itens e venda_pagamentos não têm empresa_id: consulta por IDs de vendas, abaixo.
    if(error){if(tabela==="empresas"){const r=await c.admin.from("empresas").select("*").eq("id",empresa.empresa_id);if(r.error)throw r.error;dados[tabela]=(r.data||[]).map(({id,nome_fantasia,razao_social,cnpj,...rest}:Record<string,unknown>)=>({id,nome_fantasia,razao_social,cnpj}));break;}throw error;}
    linhas.push(...(tabela==="empresas"?(data||[]).map((v:Record<string,unknown>)=>({id:v.id,nome_fantasia:v.nome_fantasia,razao_social:v.razao_social,cnpj:v.cnpj})):(data||[])));if((data||[]).length<500)break;
   }
   dados[tabela]=linhas;
  }
  return new NextResponse(JSON.stringify({formato:"EVOLUX-exportacao-dados-v1",empresa_id:empresa.empresa_id,exportado_em:new Date().toISOString(),dados}),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=evolux-backup.json","Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Não foi possível exportar os dados."},{status:500});}
}

import {NextRequest,NextResponse,connection} from "next/server";
import {company} from "@/lib/funcionarios-server";
export async function GET(req:NextRequest){
 await connection();
 try{
  const c=await company(req);if(!c)return NextResponse.json({error:"Sessão inválida"},{status:401});
  const empresa=c.links.find(l=>l.papel==="administrador");
  if(!empresa)return NextResponse.json({error:"Acesso restrito ao administrador"},{status:403});
  const id=empresa.empresa_id;
  const tipo=new URL(req.url).searchParams.get("tipo");
  let registros:Record<string,unknown>[]=[];
  if(tipo==="vendas"){
    const r=await c.admin.from("vendas").select("numero,criada_em,total,situacao").eq("empresa_id",id).order("criada_em",{ascending:false}).limit(1000);if(r.error)throw r.error;registros=r.data||[];
  }else if(tipo==="pendentes"){
    const r=await c.admin.from("despesas").select("*").eq("empresa_id",id).limit(1000);if(r.error)throw r.error;
    registros=(r.data||[]).filter((x:Record<string,unknown>)=>String(x.situacao||x.status||"").toLowerCase()!=="pago").map((x:Record<string,unknown>)=>({descricao:x.descricao||x.nome,valor:x.valor,vencimento:x.vencimento||x.data_vencimento,situacao:x.situacao||x.status||"Não informado"}));
  }else if(tipo==="balancete"){
    const [v,d]=await Promise.all([c.admin.from("vendas").select("total,situacao").eq("empresa_id",id).limit(10000),c.admin.from("despesas").select("valor").eq("empresa_id",id).limit(10000)]);
    if(v.error||d.error)throw v.error||d.error;
    const receita=(v.data||[]).filter(x=>x.situacao==="concluida").reduce((a,x)=>a+Number(x.total||0),0);
    const despesas=(d.data||[]).reduce((a,x)=>a+Number(x.valor||0),0);
    registros=[{indicador:"Vendas concluídas (histórico)",valor:receita},{indicador:"Despesas cadastradas (histórico)",valor:despesas},{indicador:"Saldo simplificado, não contábil",valor:receita-despesas}];
  }else if(tipo==="acessos"){
    return NextResponse.json({error:"Histórico de acesso exige eventos de auditoria autenticados; ainda não há fonte verificada para este relatório."},{status:501});
  }else if(tipo==="informacoes"){
    const [e,p,cx]=await Promise.all([c.admin.from("empresas").select("razao_social,nome_fantasia,cnpj").eq("id",id).single(),c.admin.from("produtos").select("id",{count:"exact",head:true}).eq("empresa_id",id),c.admin.from("clientes").select("id",{count:"exact",head:true}).eq("empresa_id",id)]);
    if(e.error||p.error||cx.error)throw e.error||p.error||cx.error;
    registros=[{empresa:e.data.nome_fantasia||e.data.razao_social,cnpj:e.data.cnpj,produtos:p.count||0,clientes:cx.count||0}];
  }else return NextResponse.json({error:"Relatório inválido"},{status:400});
  return NextResponse.json({registros},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Falha ao consultar relatório; confira tabelas e permissões."},{status:500});}
}

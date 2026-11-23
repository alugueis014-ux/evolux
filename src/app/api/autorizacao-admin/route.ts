import {NextRequest,NextResponse} from "next/server";
import {company} from "@/lib/funcionarios-server";
import {validarSessaoFuncionario} from "@/lib/sessao-funcionario";

export async function POST(req:NextRequest){
  try{
    const c=await company(req);
    if(!c)return NextResponse.json({error:"Sessão inválida."},{status:401});
    const body=await req.json();
    const empresaId=String(body.empresaId||"");
    const administradorId=String(body.administradorId||"");
    const pin=String(body.pin||"");
    const produtoId=String(body.produtoId||"");
    if(!["apagar_item","cancelar_lancamento"].includes(body.operacao)||!produtoId||pin.length<3||pin.length>64)
      return NextResponse.json({error:"Operação inválida."},{status:400});
    if(!c.links.some(l=>l.empresa_id===empresaId))
      return NextResponse.json({error:"Empresa não autorizada."},{status:403});
    const operador=await validarSessaoFuncionario(req,c.user.id,c.admin);
    if(!operador||operador.empresaId!==empresaId)
      return NextResponse.json({error:"Sessão do funcionário inválida."},{status:403});
    const {data:admin,error:erroAdmin}=await c.admin.from("evolux_funcionarios")
      .select("id,nome,papel,ativo").eq("id",administradorId).eq("empresa_id",empresaId).maybeSingle();
    if(erroAdmin||!admin?.ativo||admin.papel!=="administrador")
      return NextResponse.json({error:"Administrador não autorizado."},{status:403});
    const {data,error}=await c.admin.rpc("evolux_verificar_pin_funcionario",{
      p_empresa:empresaId,p_funcionario:administradorId,p_pin:pin
    });
    if(error)return NextResponse.json({error:"Falha na validação."},{status:500});
    const resultado=Array.isArray(data)?data[0]:null;
    if(!resultado?.autorizado||resultado.perfil!=="administrador")
      return NextResponse.json({error:resultado?.motivo||"PIN inválido."},{status:401});
    const {error:erroAuditoria}=await c.admin.from("evolux_autorizacoes_pdv").insert({
      empresa_id:empresaId,operador_id:operador.funcionarioId,administrador_id:administradorId,
      usuario_auth_id:c.user.id,operacao:body.operacao,referencia:produtoId
    });
    if(erroAuditoria)return NextResponse.json({error:"Falha ao registrar autorização. Operação bloqueada."},{status:500});
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Não foi possível autorizar."},{status:500});}
}

export async function GET(req:NextRequest){
  try{
    const c=await company(req);
    if(!c)return NextResponse.json({error:"Sessão inválida."},{status:401});
    const operador=await validarSessaoFuncionario(req,c.user.id,c.admin);
    if(!operador||!c.links.some(l=>l.empresa_id===operador.empresaId))
      return NextResponse.json({error:"Funcionário sem sessão válida."},{status:403});
    return NextResponse.json({empresaId:operador.empresaId,papel:operador.papel});
  }catch{return NextResponse.json({error:"Falha ao verificar permissão."},{status:500});}
}

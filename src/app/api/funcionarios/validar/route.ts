import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
import {definirCookieFuncionario,emitirSessaoFuncionario,limparCookieFuncionario} from '@/lib/sessao-funcionario';

export async function POST(req:NextRequest){
 try{
  const c=await company(req);
  if(!c)return NextResponse.json({error:'Sessão inválida'},{status:401});
  const body=await req.json();
  const empresaId=String(body.empresaId||'');
  const id=String(body.id||'');
  const pin=String(body.pin||'');
  if(!c.links.some(l=>l.empresa_id===empresaId))return NextResponse.json({error:'Empresa não autorizada'},{status:403});
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||pin.length<3||pin.length>64)return NextResponse.json({error:'Credenciais inválidas'},{status:400});
  const {data,error}=await c.admin.rpc('evolux_verificar_pin_funcionario',{p_empresa:empresaId,p_funcionario:id,p_pin:pin});
  if(error)return NextResponse.json({error:'Falha ao validar PIN'},{status:500});
  const result=Array.isArray(data)?data[0]:null;
  if(!result?.autorizado)return NextResponse.json({error:result?.motivo||'Credenciais inválidas'},{status:401});
  const {data:funcionario,error:erroFuncionario}=await c.admin.from('evolux_funcionarios')
   .select('id,papel,ativo,nome').eq('empresa_id',empresaId).eq('id',id).maybeSingle();
  if(erroFuncionario||!funcionario?.ativo||funcionario.papel!==result.perfil)return NextResponse.json({error:'Funcionário não autorizado'},{status:403});
  const token=emitirSessaoFuncionario(empresaId,id,c.user.id);
  const registro=await c.admin.from('evolux_historico_acessos').insert({empresa_id:empresaId,funcionario_id:id,nome:funcionario.nome,papel:funcionario.papel});
  if(registro.error)console.error('Falha na auditoria de acesso',registro.error.code);
  const response=NextResponse.json({ok:true,papel:funcionario.papel});
  definirCookieFuncionario(response,token);
  return response;
 }catch{return NextResponse.json({error:'Falha de autenticação ou configuração da sessão'},{status:500});}
}

// A troca de funcionário deve chamar DELETE antes de retornar à seleção de usuário.
export async function DELETE(){
 const response=NextResponse.json({ok:true});
 limparCookieFuncionario(response);
 return response;
}

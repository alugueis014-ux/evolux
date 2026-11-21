import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(req:NextRequest){
 try{const c=await company(req);if(!c)return fail('Sessão da empresa inválida',401);
 const id=req.nextUrl.searchParams.get('empresaId')||c.links[0]?.empresa_id;
 if(!id||!c.links.some(l=>l.empresa_id===id))return fail('Empresa não autorizada',403);
 const {data,error}=await c.admin.from('evolux_funcionarios').select('id,nome,papel,ativo').eq('empresa_id',id).order('criado_em');
 if(error)return fail('Falha ao listar funcionários: '+error.code,500);
 return NextResponse.json({empresaId:id,usuarios:data||[]});
 }catch{return fail('Falha ao consultar funcionários',500)}
}
export async function POST(req:NextRequest){
 try{const c=await company(req);if(!c)return fail('Sessão da empresa inválida',401);
 const b=await req.json(),empresaId=String(b.empresaId||''),nome=String(b.nome||'').trim(),pin=String(b.pin||''),papel=String(b.papel||'');
 if(!c.links.some(l=>l.empresa_id===empresaId&&l.papel==='administrador'))return fail('Somente administrador da empresa',403);
 if(nome.length<3||nome.length>80||pin.length<3||pin.length>64||!['administrador','vendedor'].includes(papel))return fail('Dados inválidos',400);
 const normal=nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
 const {error}=await c.admin.rpc('evolux_criar_funcionario',{p_empresa:empresaId,p_nome:nome,p_normalizado:normal,p_papel:papel,p_pin:pin});
 if(error)return fail(error.code==='23505'?'Nome já cadastrado':'Falha no cadastro: '+error.code,409);
 return NextResponse.json({ok:true});
 }catch{return fail('Não foi possível cadastrar',500)}
}
export async function PATCH(req:NextRequest){
 try{const c=await company(req);if(!c)return fail('Sessão da empresa inválida',401);
 const b=await req.json(),empresaId=String(b.empresaId||''),id=String(b.id||'');
 if(!c.links.some(l=>l.empresa_id===empresaId&&l.papel==='administrador'))return fail('Somente administrador',403);
 if(typeof b.ativo!=='boolean')return fail('Situação inválida');
 const {data:target,error:e}=await c.admin.from('evolux_funcionarios').select('id,papel,ativo').eq('empresa_id',empresaId).eq('id',id).maybeSingle();
 if(e||!target)return fail('Funcionário não encontrado',404);
 if(!b.ativo&&target.papel==='administrador'&&target.ativo){
 const {count}=await c.admin.from('evolux_funcionarios').select('id',{count:'exact',head:true}).eq('empresa_id',empresaId).eq('papel','administrador').eq('ativo',true);
 if((count||0)<=1)return fail('Não é permitido desativar o último administrador',409);
 }
 const {error}=await c.admin.from('evolux_funcionarios').update({ativo:b.ativo}).eq('empresa_id',empresaId).eq('id',id);
 if(error)return fail('Falha ao atualizar: '+error.code,500);
 return NextResponse.json({ok:true});
 }catch{return fail('Falha ao atualizar funcionário',500)}
}

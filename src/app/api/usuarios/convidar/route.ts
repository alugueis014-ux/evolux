import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
const bad=(error:string,status=400)=>NextResponse.json({error},{status});
export async function POST(req:NextRequest){
 try{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, pub=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return bad('Configure as variáveis do Supabase no servidor',503);
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return bad('Não autenticado',401);
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await auth.auth.getUser(token);if(!user)return bad('Sessão inválida',401);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const b=await req.json(),empresaId=String(b.empresaId||''),nome=String(b.nome||'').trim(),usuario=nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,'.'),senha=String(b.senha||''),papel=String(b.papel||'');
 if(!/^[0-9a-f-]{36}$/i.test(empresaId)||nome.length<3||nome.length>80||!(/^[a-z][a-z0-9._-]{2,31}$/.test(usuario))||senha.length<3||senha.length>128||!['administrador','vendedor'].includes(papel))return bad('Use um nome de usuário de 3 a 32 caracteres (letras, números e espaços) e uma senha de pelo menos 3 caracteres');
 const {data:me}=await admin.from('empresa_usuarios').select('papel').eq('empresa_id',empresaId).eq('usuario_id',user.id).maybeSingle();
 const {data:ativo}=await admin.from('evolux_usuarios_acesso').select('ativo').eq('usuario_id',user.id).maybeSingle();
 if(me?.papel!=='administrador'||ativo?.ativo===false)return bad('Acesso restrito ao administrador ativo',403);
 const {data:existing,error:lookupError}=await admin.from('evolux_usuarios_acesso').select('usuario_id').eq('usuario',usuario).maybeSingle();if(lookupError)return bad('Execute a migração SQL de usuários antes de cadastrar',503);if(existing)return bad('Nome de usuário já utilizado',409);
 const email=`${usuario}@usuarios.evolux.invalid`;
 const {data:created,error:creationError}=await admin.auth.admin.createUser({email,password:senha,email_confirm:true,user_metadata:{nome,usuario}});
 if(creationError||!created.user)return bad(creationError?.message||'Erro ao criar usuário',409);
 const id=created.user.id;
 const {error:profileError}=await admin.from('evolux_usuarios_acesso').insert({usuario_id:id,empresa_id:empresaId,nome,usuario,ativo:true});
 if(profileError){await admin.auth.admin.deleteUser(id);return bad('Falha ao registrar usuário: '+profileError.message,500);}
 const {error:membershipError}=await admin.from('empresa_usuarios').insert({empresa_id:empresaId,usuario_id:id,papel});
 if(membershipError){await admin.from('evolux_usuarios_acesso').delete().eq('usuario_id',id);await admin.auth.admin.deleteUser(id);return bad('Falha ao vincular usuário: '+membershipError.message,500);}
 return NextResponse.json({ok:true});
 }catch{return bad('Não foi possível cadastrar o usuário',500)}
}

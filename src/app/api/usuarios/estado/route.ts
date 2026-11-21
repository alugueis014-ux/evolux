import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:'Servidor não configurado'},{status:503});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return NextResponse.json({error:'Não autenticado'},{status:401});
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await auth.auth.getUser(token);if(!user)return NextResponse.json({error:'Sessão inválida'},{status:401});
 const {empresaId,usuarioId,ativo}=await req.json();if(typeof ativo!=='boolean'||!(/^[0-9a-f-]{36}$/i.test(String(empresaId)))||!(/^[0-9a-f-]{36}$/i.test(String(usuarioId))))return NextResponse.json({error:'Dados inválidos'},{status:400});
 const {data:me}=await admin.from('empresa_usuarios').select('papel').eq('empresa_id',empresaId).eq('usuario_id',user.id).maybeSingle();
 const {data:meProfile}=await admin.from('evolux_usuarios_acesso').select('ativo').eq('usuario_id',user.id).maybeSingle();
 if(me?.papel!=='administrador'||meProfile?.ativo===false)return NextResponse.json({error:'Apenas administradores ativos'},{status:403});
 if(usuarioId===user.id)return NextResponse.json({error:'Não é permitido desativar a própria conta'},{status:403});
 const {data:target}=await admin.from('empresa_usuarios').select('papel').eq('empresa_id',empresaId).eq('usuario_id',usuarioId).maybeSingle();if(!target)return NextResponse.json({error:'Usuário não vinculado'},{status:404});
 if(!ativo&&target.papel==='administrador'){
 const {data:admins}=await admin.from('empresa_usuarios').select('usuario_id').eq('empresa_id',empresaId).eq('papel','administrador');
 const {data:profiles}=await admin.from('evolux_usuarios_acesso').select('usuario_id,ativo').eq('empresa_id',empresaId);
 const active=new Set((profiles||[]).filter(x=>x.ativo).map(x=>x.usuario_id));
 if((admins||[]).filter(x=>active.has(x.usuario_id)||!(profiles||[]).some(p=>p.usuario_id===x.usuario_id)).length<=1)return NextResponse.json({error:'Não é possível desativar o último administrador'},{status:409});
 }
 const {data:profile,error:readError}=await admin.from('evolux_usuarios_acesso').select('usuario_id').eq('usuario_id',usuarioId).eq('empresa_id',empresaId).maybeSingle();
 if(readError||!profile)return NextResponse.json({error:'Conta anterior sem perfil de acesso. Migre o usuário antes de alterar seu estado.'},{status:409});
 // Ban at Auth level prevents new logins and refresh; existing JWTs require RLS checks.
 const {error:banError}=await admin.auth.admin.updateUserById(usuarioId,{ban_duration:ativo?'none':'876000h'});
 if(banError)return NextResponse.json({error:banError.message},{status:500});
 const {error}=await admin.from('evolux_usuarios_acesso').update({ativo}).eq('usuario_id',usuarioId).eq('empresa_id',empresaId);
 if(error)return NextResponse.json({error:'Bloqueio no Auth alterado, mas perfil não atualizado: '+error.message},{status:500});
 return NextResponse.json({ok:true});
}

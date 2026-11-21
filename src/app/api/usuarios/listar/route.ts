import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export async function GET(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, pub=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:'Servidor não configurado'},{status:503});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return NextResponse.json({error:'Não autenticado'},{status:401});
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await auth.auth.getUser(token);if(error||!user)return NextResponse.json({error:'Sessão inválida'},{status:401});
 const {data:links,error:linkError}=await admin.from('empresa_usuarios').select('empresa_id,papel').eq('usuario_id',user.id);
 if (linkError) {
  console.error('EVOLUX - Erro ao consultar vínculo:', {
   code: linkError.code,
   message: linkError.message,
   details: linkError.details,
  });
  return NextResponse.json({error:'Falha ao consultar vínculo da empresa',codigo:'ERRO_CONSULTA_VINCULO'},{status:500});
 }
 if(!links?.length)return NextResponse.json({error:'Esta conta não possui vínculo com uma empresa. É necessário corrigir o vínculo no Supabase antes de selecionar funcionários.',codigo:'CONTA_SEM_EMPRESA'},{status:403});
 const empresaId=req.nextUrl.searchParams.get('empresaId')||links[0].empresa_id;
 if(!links.some(l=>l.empresa_id===empresaId))return NextResponse.json({error:'A conta não tem acesso à empresa selecionada',codigo:'EMPRESA_NAO_AUTORIZADA'},{status:403});
 const {data:profiles,error:profileError}=await admin.from('evolux_usuarios_acesso').select('usuario_id,nome,usuario,ativo').eq('empresa_id',empresaId).eq('ativo',true);
 if(profileError)return NextResponse.json({error:'Migração de usuários não configurada'},{status:503});
 const {data:members,error:memberError}=await admin.from('empresa_usuarios').select('usuario_id,papel').eq('empresa_id',empresaId);
 if(memberError)return NextResponse.json({error:'Falha ao consultar vínculos'},{status:500});
 const pessoas=(profiles||[]).filter(x=>(members||[]).some(m=>m.usuario_id===x.usuario_id&&['administrador','vendedor'].includes(m.papel))).map(x=>({id:x.usuario_id,nome:x.nome,usuario:x.usuario,papel:members?.find(m=>m.usuario_id===x.usuario_id)?.papel}));
 // Contas administrativas anteriores podem ainda não possuir perfil migrado.
 if(!pessoas.some(x=>x.id===user.id)&&links.some(l=>l.empresa_id===empresaId&&l.papel==='administrador'))pessoas.unshift({id:user.id,nome:String(user.user_metadata?.nome||'Administrador principal'),usuario:'',papel:'administrador'});
 return NextResponse.json({empresaId,usuarios:pessoas});
}

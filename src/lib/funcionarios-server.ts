import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
export function clients(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)throw new Error('Configuração Supabase ausente');
 return {auth:createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}}),admin:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})};
}
export async function company(req:NextRequest){
 const {auth,admin}=clients();
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return null;
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user)return null;
 const {data:links,error:le}=await admin.from('empresa_usuarios').select('empresa_id,papel').eq('usuario_id',user.id);
 if(le)throw new Error('Falha de vínculo: '+le.code);
 return {user,links:links||[],admin};
}

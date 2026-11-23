import {createClient} from '@supabase/supabase-js';
export async function caixaIndividual(acao:string,parametros:Record<string,unknown>={}){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('Supabase não configurado');
 const db=createClient(url,key);
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session)throw new Error('Faça login novamente');
 const r=await fetch('/api/caixa-individual',{method:acao==='turno'?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},...(acao==='turno'?{}:{body:JSON.stringify({acao,...parametros})})});
 const resposta=await r.json();
 if(!r.ok)throw new Error(resposta.error||'Falha ao consultar o caixa');
 return resposta;
}

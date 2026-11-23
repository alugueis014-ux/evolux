import 'server-only';
import {Suspense} from 'react';
import {cookies} from 'next/headers';
import {connection} from 'next/server';
import {redirect} from 'next/navigation';
import {NextRequest} from 'next/server';
import {clients} from '@/lib/funcionarios-server';
import {COOKIE_FUNCIONARIO,lerSessaoFuncionario,validarSessaoFuncionario} from '@/lib/sessao-funcionario';

// O limite Suspense permite a leitura dinâmica de cookies com Cache Components
// no Next.js 16 sem expor o conteúdo administrativo durante o carregamento.
async function DashboardAutorizado({children}:{children:React.ReactNode}){
 // Validação da expiração da sessão depende da hora atual da requisição.
 await connection();
 const cookie=(await cookies()).get(COOKIE_FUNCIONARIO)?.value;
 if(!cookie)redirect('/selecionar-usuario');
 const req=new NextRequest('http://localhost/dashboard',{
  headers:{cookie:`${COOKIE_FUNCIONARIO}=${encodeURIComponent(cookie)}`}
 });
 const sessao=lerSessaoFuncionario(req);
 if(!sessao)redirect('/selecionar-usuario');
 let autorizado=false;
 try{
  const {admin}=clients();
  const funcionario=await validarSessaoFuncionario(req,sessao.usuarioAuthId,admin);
  autorizado=Boolean(funcionario&&funcionario.papel==='administrador');
 }catch{
  autorizado=false;
 }
 if(!autorizado)redirect('/pdv');
 return <>{children}</>;
}

export default function DashboardLayout({children}:{children:React.ReactNode}){
 return <Suspense fallback={<main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f3f6fb',color:'#0b2454',fontFamily:'Arial,sans-serif'}}>Verificando acesso ao painel...</main>}><DashboardAutorizado>{children}</DashboardAutorizado></Suspense>;
}

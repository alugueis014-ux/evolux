import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';

export async function POST(req:NextRequest){
 try {
  const c=await company(req);
  if(!c)return NextResponse.json({error:'Sessão da empresa inválida'},{status:401});
  const body=await req.json();
  const empresaId=String(body.empresaId||'');
  const nome=String(body.nome||'').trim();
  const pin=String(body.pin||'');
  if(!c.links.some(l=>l.empresa_id===empresaId&&l.papel==='administrador'))
   return NextResponse.json({error:'A ativação exige a conta administradora da empresa'},{status:403});
  if(nome.length<3||nome.length>80||pin.length<3||pin.length>64)
   return NextResponse.json({error:'Informe nome de 3 a 80 caracteres e PIN de 3 a 64 caracteres'},{status:400});
  const normal=nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
  const {data,error}=await c.admin.rpc('evolux_ativar_administrador_inicial',{
   p_empresa:empresaId,p_nome:nome,p_normalizado:normal,p_pin:pin
  });
  if(error){
   if(error.message?.includes('JÁ_INICIALIZADA'))return NextResponse.json({error:'A empresa já possui funcionários. Entre com um administrador existente.'},{status:409});
   return NextResponse.json({error:'Não foi possível ativar o administrador inicial',codigo:error.code},{status:500});
  }
  return NextResponse.json({ok:true,id:data});
 }catch{return NextResponse.json({error:'Falha ao ativar administrador'},{status:500});}
}

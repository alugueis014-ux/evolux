import {NextRequest,NextResponse} from 'next/server';
import {company} from '@/lib/funcionarios-server';
import {validarSessaoFuncionario} from '@/lib/sessao-funcionario';
export async function GET(req:NextRequest){return run(req,false)}
export async function POST(req:NextRequest){return run(req,true)}
async function run(req:NextRequest,write:boolean){
 const reply=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'no-store'}});
 try{const c=await company(req);if(!c)return reply({error:'Sessão inválida'},401);const f=await validarSessaoFuncionario(req,c.user.id,c.admin);if(!f||f.papel!=='administrador')return reply({error:'Acesso restrito'},403);
 if(!write){const rows=[];for(let i=0;;i+=500){const r=await c.admin.from('evolux_contas_pagar').select('*').eq('empresa_id',f.empresaId).order('vencimento').order('id').range(i,i+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)break;}return reply({rows});}
 const b=await req.json();const r=await c.admin.rpc('evolux_boleto_operacao',{p_empresa:f.empresaId,p_operador:f.funcionarioId,p_acao:b.acao,p_dados:b});if(r.error)return reply({error:r.error.message},400);return reply({ok:true});
 }catch(e){console.error(e);return reply({error:'Falha na gestão de boletos'},500);}}

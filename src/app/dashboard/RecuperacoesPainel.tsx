"use client";
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db=url&&key?createClient(url,key):null;
type Solicitacao={id:string;funcionario_id:string;nome:string;solicitado_em:string};
type Funcionario={id:string;nome:string;papel:string;ativo:boolean};
export default function RecuperacoesPainel({empresaId}:{empresaId:string}){
 const [aberto,setAberto]=useState(false),[adminId,setAdminId]=useState(''),[pin,setPin]=useState(''),[administradores,setAdministradores]=useState<Funcionario[]>([]),[solicitacoes,setSolicitacoes]=useState<Solicitacao[]>([]),[erro,setErro]=useState(''),[codigo,setCodigo]=useState(''),[ocupado,setOcupado]=useState(false);
 useEffect(()=>{let ativo=true;(async()=>{if(!db)return;const {data:{session}}=await db.auth.getSession();if(!session)return;const r=await fetch('/api/funcionarios?empresaId='+encodeURIComponent(empresaId),{headers:{Authorization:'Bearer '+session.access_token}});if(!r.ok)return;const d=await r.json();if(ativo){const admins=(d.usuarios||[]).filter((u:Funcionario)=>u.papel==='administrador'&&u.ativo);setAdministradores(admins);setAdminId(admins[0]?.id||'')}})();return()=>{ativo=false}},[empresaId]);
 useEffect(()=>{
  if(!db||!empresaId)return;
  let ativo=true;
  async function carregar(){
   if(!db)return;
   const {data:{session}}=await db.auth.getSession();if(!session)return;
   const r=await fetch('/api/funcionarios/recuperacao/admin?empresaId='+encodeURIComponent(empresaId),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   if(!r.ok)return;const d=await r.json();if(ativo)setSolicitacoes(d.solicitacoes||[]);
  }
  void carregar();const intervalo=setInterval(()=>void carregar(),30000);
  return()=>{ativo=false;clearInterval(intervalo)};
 },[empresaId]);
 async function acao(action:'listar'|'decidir',id?:string,decisao?:'aprovar'|'recusar'){
  if(!db||!adminId||!pin){setErro('Selecione o administrador e informe seu PIN');return}
  setOcupado(true);setErro('');setCodigo('');
  try{const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Sessão expirada');const r=await fetch('/api/funcionarios/recuperacao/admin',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,empresaId,adminId,pin,id,decisao})});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha na operação');if(d.codigo)setCodigo(d.codigo);if(action==='listar')setSolicitacoes(d.solicitacoes||[]);else setSolicitacoes(x=>x.filter(s=>s.id!==id));}
  catch(e){setErro(e instanceof Error?e.message:'Falha na operação')}finally{setOcupado(false)}
 }
 return <div style={{maxWidth:1600,margin:'0 auto',padding:'8px 24px'}}><p style={{margin:"8px 0",fontSize:13}}>{solicitacoes.length?`${solicitacoes.length} solicitação(ões) de recuperação de PIN pendente(s).`:"Nenhuma solicitação de PIN pendente."}</p><button type="button" onClick={()=>setAberto(v=>!v)} style={{border:'1px solid #cbd5e1',background:'white',color:'#102c58',borderRadius:9,padding:'9px 14px',cursor:'pointer'}}>Analisar solicitações de PIN</button>{aberto&&<section style={{marginTop:8,background:'white',border:'1px solid #dbe4f1',borderRadius:14,padding:18,color:'#102c58',maxWidth:600}}><h3 style={{marginTop:0}}>Recuperação de PIN — Administrador</h3><p style={{fontSize:13}}>Confirme sua identidade para consultar e autorizar solicitações.</p><select value={adminId} onChange={e=>setAdminId(e.target.value)} style={{padding:10,width:'100%',marginBottom:8}}>{administradores.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select><input type="password" autoComplete="off" name="evolux-autorizacao-pin" placeholder="PIN do administrador" value={pin} onChange={e=>setPin(e.target.value)} style={{padding:10,width:'100%',boxSizing:'border-box',marginBottom:8}}/><button type="button" disabled={ocupado} onClick={()=>void acao('listar')} style={{padding:10}}>Consultar solicitações</button>{erro&&<p role="alert" style={{color:'#b91c1c'}}>{erro}</p>}{solicitacoes.map(s=><div key={s.id} style={{borderTop:'1px solid #e2e8f0',padding:'12px 0'}}><strong>{s.nome}</strong><small style={{display:'block',color:'#64748b'}}>Solicitado em {new Date(s.solicitado_em).toLocaleString('pt-BR')}</small><div style={{display:'flex',gap:8,marginTop:8}}><button disabled={ocupado} onClick={()=>void acao('decidir',s.id,'aprovar')}>Aprovar</button><button disabled={ocupado} onClick={()=>void acao('decidir',s.id,'recusar')}>Recusar</button></div></div>)}{codigo&&<div style={{padding:12,background:'#eff6ff',borderRadius:8,marginTop:12}}><strong>Código de recuperação (válido por 10 minutos):</strong><p style={{overflowWrap:'anywhere',fontFamily:'monospace'}}>{codigo}</p><p style={{fontSize:12}}>Entregue este código somente ao funcionário após confirmar sua identidade. Ele não será exibido novamente.</p></div>}</section>}</div>
}

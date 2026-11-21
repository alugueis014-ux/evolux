"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {createClient} from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Cliente={id:string;codigo:number;tipo:"PF"|"PJ";nome:string;documento:string|null;telefone:string|null;email:string|null;cep:string|null;logradouro:string|null;numero:string|null;complemento:string|null;bairro:string|null;cidade:string|null;uf:string|null;observacoes:string|null;ativo:boolean};
type FormCliente={tipo:"PF"|"PJ";nome:string;documento:string;telefone:string;email:string;cep:string;logradouro:string;numero:string;complemento:string;bairro:string;cidade:string;uf:string;observacoes:string};
const inicial:FormCliente={tipo:"PF",nome:"",documento:"",telefone:"",email:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",uf:"",observacoes:""};
const digitos=(v:string)=>v.replace(/\D/g,"");

// Máscaras visuais brasileiras. CPF/CNPJ e CEP continuam armazenados sem pontuação.
const mascaraCPF=(v:string)=>{const n=digitos(v).slice(0,11);return n.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2");};
const mascaraCNPJ=(v:string)=>{const n=digitos(v).slice(0,14);return n.replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2");};
const mascaraCEP=(v:string)=>digitos(v).slice(0,8).replace(/^(\d{5})(\d)/,"$1-$2");
const mascaraTelefone=(v:string)=>{const n=digitos(v).slice(0,11);if(!n)return "";if(n.length<=2)return "("+n;const d="("+n.slice(0,2)+") "+n.slice(2);return n.length<=6?d:n.length<=10?"("+n.slice(0,2)+") "+n.slice(2,6)+"-"+n.slice(6):"("+n.slice(0,2)+") "+n.slice(2,7)+"-"+n.slice(7);};
const normalizar=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function documentoValido(v:string,tipo:"PF"|"PJ"){
 const n=digitos(v);if(!n)return true;
 if(tipo==="PF"){
  if(n.length!==11||/^(\d)\1+$/.test(n))return false;
  for(let t=9;t<=10;t++){let soma=0;for(let i=0;i<t;i++)soma+=Number(n[i])*(t+1-i);let d=(soma*10)%11;if(d===10)d=0;if(d!==Number(n[t]))return false;}return true;
 }
 if(n.length!==14||/^(\d)\1+$/.test(n))return false;
 const pesos=[[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]];
 for(let t=0;t<2;t++){const soma=pesos[t].reduce((a,p,i)=>a+Number(n[i])*p,0);const r=soma%11;const d=r<2?0:11-r;if(d!==Number(n[12+t]))return false;}return true;
}
export default function ClientesModal({empresaId,onClose,iniciarNovo=false,onSaved,editarId}:{empresaId:string;onClose:()=>void;iniciarNovo?:boolean;onSaved?:()=>void;editarId?:string|null}){
 const [clientes,setClientes]=useState<Cliente[]>([]),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(""),[aviso,setAviso]=useState("");
 const [pesquisa,setPesquisa]=useState(""),[modo,setModo]=useState<"nome"|"documento"|"telefone"|"codigo"|"email"|"cidade">("nome");
 const [selecionado,setSelecionado]=useState<string|null>(null),[formAberto,setFormAberto]=useState(false),[editando,setEditando]=useState<string|null>(null);
 const [form,setForm]=useState<FormCliente>({...inicial}),[salvando,setSalvando]=useState(false),[apagando,setApagando]=useState(false),[formErro,setFormErro]=useState("");
 const carregar=useCallback(async()=>{
  if(!db||!empresaId){setErro("Empresa ou conexão indisponível.");setCarregando(false);return;}
  setCarregando(true);setErro("");
  const {data,error}=await db.from("clientes").select("id,codigo,tipo,nome,documento,telefone,email,cep,logradouro,numero,complemento,bairro,cidade,uf,observacoes,ativo").eq("empresa_id",empresaId).eq("ativo",true).order("nome").limit(2000);
  if(error)setErro("Não foi possível consultar os clientes: "+error.message);
  else setClientes((data||[]) as Cliente[]);
  setCarregando(false);
 },[empresaId]);
 useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{if(iniciarNovo){setEditando(null);setForm({...inicial});setFormErro("");setFormAberto(true);}},[iniciarNovo]);
  useEffect(()=>{
   if(!editarId||carregando)return;
   const c=clientes.find(item=>item.id===editarId);
   if(!c){setErro("Cliente selecionado não encontrado para edição.");return;}
   setSelecionado(c.id);setEditando(c.id);
   setForm({tipo:c.tipo,nome:c.nome,documento:c.documento||"",telefone:c.telefone||"",email:c.email||"",cep:c.cep||"",logradouro:c.logradouro||"",numero:c.numero||"",complemento:c.complemento||"",bairro:c.bairro||"",cidade:c.cidade||"",uf:c.uf||"",observacoes:c.observacoes||""});
   setFormErro("");setFormAberto(true);
  },[editarId,carregando,clientes]);
 const atual=clientes.find(c=>c.id===selecionado)||null;
 const filtrados=useMemo(()=>{const termo=normalizar(pesquisa.trim());if(!termo)return clientes;return clientes.filter(c=>normalizar(modo==="nome"?c.nome:modo==="documento"?c.documento||"":modo==="telefone"?c.telefone||"":modo==="codigo"?String(c.codigo):modo==="email"?c.email||"":c.cidade||"").includes(termo));},[clientes,pesquisa,modo]);
 function novo(){setEditando(null);setForm({...inicial});setFormErro("");setFormAberto(true);}
 function editar(){if(!atual)return;setEditando(atual.id);setForm({tipo:atual.tipo,nome:atual.nome,documento:atual.documento||"",telefone:atual.telefone||"",email:atual.email||"",cep:atual.cep||"",logradouro:atual.logradouro||"",numero:atual.numero||"",complemento:atual.complemento||"",bairro:atual.bairro||"",cidade:atual.cidade||"",uf:atual.uf||"",observacoes:atual.observacoes||""});setFormErro("");setFormAberto(true);}
 async function salvar(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!db||!empresaId||salvando)return;
  if(!form.nome.trim()){setFormErro("Informe o nome ou razão social.");return;}
  if(!documentoValido(form.documento,form.tipo)){setFormErro("CPF ou CNPJ inválido. Confira os dígitos verificadores.");return;}
  if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setFormErro("Informe um e-mail válido.");return;}
  if(form.cep&&digitos(form.cep).length!==8){setFormErro("CEP deve ter 8 dígitos.");return;}
  setSalvando(true);setFormErro("");
  const dados={empresa_id:empresaId,tipo:form.tipo,nome:form.nome.trim(),documento:digitos(form.documento)||null,telefone:digitos(form.telefone)||null,email:form.email.trim()||null,cep:digitos(form.cep)||null,logradouro:form.logradouro.trim()||null,numero:form.numero.trim()||null,complemento:form.complemento.trim()||null,bairro:form.bairro.trim()||null,cidade:form.cidade.trim()||null,uf:form.uf.trim().toUpperCase()||null,observacoes:form.observacoes.trim()||null};
  const {error}=editando?await db.from("clientes").update(dados).eq("empresa_id",empresaId).eq("id",editando):await db.from("clientes").insert(dados);
  setSalvando(false);
  if(error){setFormErro(error.code==="23505"?"Este CPF/CNPJ já está cadastrado nesta empresa.":"Não foi possível salvar: "+error.message);return;}
  setFormAberto(false);setAviso(editando?"Cliente atualizado com sucesso.":"Cliente cadastrado com sucesso.");await carregar();onSaved?.();
 }
 async function apagar(){if(!db||!empresaId||!atual||apagando)return;
  if(!window.confirm(`Desativar o cadastro de ${atual.nome}?\n\nO registro será preservado para manter históricos futuros.`))return;
  setApagando(true);setErro("");const {error}=await db.from("clientes").update({ativo:false}).eq("empresa_id",empresaId).eq("id",atual.id);
  setApagando(false);if(error){setErro("Não foi possível desativar: "+error.message);return;}
  setSelecionado(null);setAviso("Cadastro desativado. Nenhum histórico foi excluído.");await carregar();
 }
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
   if(["Escape","F2","F3","F4","F12","Delete"].includes(e.key))e.stopImmediatePropagation();
  if(e.key==="Escape"){e.preventDefault();if(formAberto&&!salvando)setFormAberto(false);else if(!formAberto)onClose();return;}
  if(formAberto){if(e.key==="F12"){e.preventDefault();(document.getElementById("ev-cliente-form") as HTMLFormElement|null)?.requestSubmit();}return;}
  if(e.key==="F2"){e.preventDefault();novo();}else if(e.key==="F3"){e.preventDefault();document.getElementById("ev-cliente-pesquisa")?.focus();}else if(e.key==="F4"&&atual){e.preventDefault();editar();}else if(e.key==="Delete"&&atual){if((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable='true']"))return;e.preventDefault();void apagar();}
 };window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);});
 return <div className="ev-cli-overlay" onMouseDown={e=>{if(e.target===e.currentTarget && !formAberto && !salvando)onClose();}}><section className="ev-cli-modal" role="dialog" aria-modal="true" aria-label="Cadastro de clientes">
  <header className="ev-cli-header"><div><h2>Cadastro de Clientes</h2><p>Consulte e gerencie os clientes da empresa</p></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>
  <div className="ev-cli-body">
   {erro&&<div className="ev-cli-error" role="alert">{erro}</div>}{aviso&&<div className="ev-cli-ok" role="status">{aviso}</div>}
   <div className="ev-cli-table"><table><thead><tr><th>Tipo</th><th>Código</th><th>Nome / Razão social</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>
   {carregando?<tr><td colSpan={5}>Carregando clientes...</td></tr>:filtrados.map(c=><tr key={c.id} className={selecionado===c.id?"ev-cli-selected":""} onClick={()=>setSelecionado(c.id)} onDoubleClick={()=>{setSelecionado(c.id);setEditando(c.id);setForm({tipo:c.tipo,nome:c.nome,documento:c.documento||"",telefone:c.telefone||"",email:c.email||"",cep:c.cep||"",logradouro:c.logradouro||"",numero:c.numero||"",complemento:c.complemento||"",bairro:c.bairro||"",cidade:c.cidade||"",uf:c.uf||"",observacoes:c.observacoes||""});setFormErro("");setFormAberto(true);}}><td>{c.tipo}</td><td>{c.codigo}</td><td>{c.nome}</td><td>{c.telefone?mascaraTelefone(c.telefone):"—"}</td><td>{c.email||"—"}</td></tr>)}
   {!carregando&&!filtrados.length&&<tr><td colSpan={5} className="ev-cli-empty">Nenhum cadastro foi localizado com a opção informada.</td></tr>}</tbody></table></div>
   <div className="ev-cli-count">Clientes encontrados: {filtrados.length}</div>
   <div className="ev-cli-search"><label>Pesquisar cadastro existente por <strong>{modo}</strong><input id="ev-cliente-pesquisa" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Digite para pesquisar"/></label><label>Modo de pesquisa<select value={modo} onChange={e=>setModo(e.target.value as typeof modo)}><option value="nome">Nome</option><option value="documento">CPF/CNPJ</option><option value="telefone">Telefone</option><option value="codigo">Código</option><option value="email">E-mail</option><option value="cidade">Cidade</option></select></label></div>
  </div>
  <footer className="ev-cli-footer"><div className="ev-cli-actions"><button type="button" onClick={novo}>＋ Novo (F2)</button><button type="button" disabled={!atual||apagando} onClick={()=>void apagar()}>Apagar (Del)</button><button type="button" disabled={!atual} onClick={editar}>Editar (F4)</button><button type="button" onClick={()=>document.getElementById("ev-cliente-pesquisa")?.focus()}>Pesquisar (F3)</button><button type="button" disabled title="Disponível após implementação do PDV">Histórico de compras (F5)</button></div><button type="button" className="ev-cli-close" onClick={onClose}>Fechar (Esc)</button></footer>
 </section>
 {formAberto&&<div className="ev-cli-form-overlay"><section className="ev-cli-form-modal" role="dialog" aria-modal="true" aria-label={editando?"Editar cliente":"Novo cliente"}>
  <header className="ev-cli-header"><div><h2>{editando?"Editar cliente":"Novo cliente"}</h2><p>Preencha os dados do cliente</p></div><button type="button" onClick={()=>setFormAberto(false)} disabled={salvando} aria-label="Fechar cadastro">×</button></header>
  <form id="ev-cliente-form" onSubmit={e=>void salvar(e)} className="ev-cli-form-content"><div className="ev-cli-grid">
   <label>Tipo de pessoa<select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value as "PF"|"PJ",documento:""}))}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label>
   <label>{form.tipo==="PF"?"CPF":"CNPJ"}<input value={form.tipo==="PF"?mascaraCPF(form.documento):mascaraCNPJ(form.documento)} inputMode="numeric" maxLength={form.tipo==="PF"?14:18} placeholder={form.tipo==="PF"?"000.000.000-00":"00.000.000/0000-00"} onChange={e=>setForm(f=>({...f,documento:f.tipo==="PF"?mascaraCPF(e.target.value):mascaraCNPJ(e.target.value)}))}/></label>
   <label className="ev-cli-wide">{form.tipo==="PF"?"Nome completo *":"Razão social *"}<input autoFocus required maxLength={200} value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))}/></label>
   <label>Telefone<input value={mascaraTelefone(form.telefone)} inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" onChange={e=>setForm(f=>({...f,telefone:mascaraTelefone(e.target.value)}))}/></label><label>E-mail<input type="email" value={form.email} maxLength={200} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label>
   <label>CEP<input value={mascaraCEP(form.cep)} inputMode="numeric" maxLength={9} placeholder="00000-000" onChange={e=>setForm(f=>({...f,cep:mascaraCEP(e.target.value)}))}/></label><label>Logradouro<input value={form.logradouro} onChange={e=>setForm(f=>({...f,logradouro:e.target.value}))}/></label>
   <label>Número<input value={form.numero} onChange={e=>setForm(f=>({...f,numero:e.target.value}))}/></label><label>Complemento<input value={form.complemento} onChange={e=>setForm(f=>({...f,complemento:e.target.value}))}/></label>
   <label>Bairro<input value={form.bairro} onChange={e=>setForm(f=>({...f,bairro:e.target.value}))}/></label><label>Cidade<input value={form.cidade} onChange={e=>setForm(f=>({...f,cidade:e.target.value}))}/></label>
   <label>UF<input value={form.uf} maxLength={2} onChange={e=>setForm(f=>({...f,uf:e.target.value.toUpperCase()}))}/></label><label className="ev-cli-wide">Observações<textarea rows={3} value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))}/></label>
  </div>{formErro&&<div className="ev-cli-error" role="alert">{formErro}</div>}</form>
  <footer className="ev-cli-footer"><span>* Campo obrigatório</span><div className="ev-cli-actions"><button type="button" disabled={salvando} onClick={()=>setFormAberto(false)}>Cancelar</button><button type="submit" form="ev-cliente-form" className="ev-cli-close" disabled={salvando}>{salvando?"Salvando...":"Salvar (F12)"}</button></div></footer>
 </section></div>}
 <style jsx>{`
 .ev-cli-overlay,.ev-cli-form-overlay{position:fixed;inset:0;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:18px}.ev-cli-overlay{z-index:3600}.ev-cli-form-overlay{z-index:3610}.ev-cli-modal,.ev-cli-form-modal{background:white;color:#10234b;border-radius:14px;box-shadow:0 25px 70px #07162f66;display:flex;flex-direction:column;overflow:hidden;max-height:calc(100dvh - 36px)}.ev-cli-modal{width:min(1150px,100%);height:min(730px,calc(100dvh - 36px))}.ev-cli-form-modal{width:min(820px,100%)}.ev-cli-header{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:20px 23px;border-bottom:1px solid #dce5f0}.ev-cli-header h2{font-size:22px;margin:0}.ev-cli-header p{font-size:12px;color:#64748b;margin:6px 0 0}.ev-cli-header button{background:#edf3fa;border:0;border-radius:8px;font-size:23px;padding:4px 12px;cursor:pointer}.ev-cli-body{padding:18px 22px;display:flex;flex-direction:column;min-height:0;flex:1}.ev-cli-table{border:1px solid #dce5f0;border-radius:8px;overflow:auto;flex:1;min-height:120px}.ev-cli-table table{border-collapse:collapse;width:100%;min-width:650px;font-size:13px}.ev-cli-table th{background:#edf3fb;color:#1b365c;position:sticky;top:0;text-align:left;padding:12px}.ev-cli-table td{padding:12px;border-bottom:1px solid #e4eaf3}.ev-cli-table tbody tr{cursor:pointer}.ev-cli-table tbody tr:hover{background:#f5f9ff}.ev-cli-selected{background:#e4efff!important}.ev-cli-empty{text-align:center;color:#64748b;padding:80px 10px!important}.ev-cli-count{text-align:right;font-size:12px;color:#64748b;margin:8px 0}.ev-cli-search{display:flex;gap:14px;align-items:end;margin-top:8px}.ev-cli-search label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#344761;font-weight:700;flex:1}.ev-cli-search label:last-child{flex:0 0 210px}.ev-cli-search input,.ev-cli-search select,.ev-cli-grid input,.ev-cli-grid select,.ev-cli-grid textarea{border:1px solid #cbd8e8;border-radius:8px;padding:11px 12px;font-size:14px;background:#fff;color:#10234b;min-width:0;width:100%}.ev-cli-footer{padding:15px 22px;border-top:1px solid #dce5f0;display:flex;justify-content:space-between;gap:10px;align-items:center}.ev-cli-footer span{font-size:12px;color:#64748b}.ev-cli-actions{display:flex;flex-wrap:wrap;gap:8px}.ev-cli-footer button{border:1px solid #cbd8e8;border-radius:8px;background:#fff;color:#10234b;font-weight:700;padding:10px 12px;cursor:pointer}.ev-cli-footer button:disabled{opacity:.45;cursor:not-allowed}.ev-cli-footer .ev-cli-close{background:#0b2454;color:#fff}.ev-cli-form-content{overflow:auto;padding:20px 23px}.ev-cli-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ev-cli-grid label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700}.ev-cli-wide{grid-column:1/-1}.ev-cli-error{background:#fff0ee;color:#a32626;border-radius:8px;padding:12px;margin-bottom:10px}.ev-cli-ok{background:#e5f7e9;color:#166b38;border-radius:8px;padding:10px;margin-bottom:10px}@media(max-width:650px){.ev-cli-overlay,.ev-cli-form-overlay{padding:7px}.ev-cli-modal,.ev-cli-form-modal{max-height:calc(100dvh - 14px)}.ev-cli-search{flex-direction:column;align-items:stretch}.ev-cli-search label:last-child{flex:auto}.ev-cli-grid{grid-template-columns:1fr}.ev-cli-wide{grid-column:auto}.ev-cli-footer{flex-wrap:wrap}}
 `}</style></div>;
}

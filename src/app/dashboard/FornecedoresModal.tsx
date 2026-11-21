"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; inscricao_estadual: string | null; telefone: string | null; email: string | null; cidade: string | null; uf: string | null };
type Form = { razao_social: string; nome_fantasia: string; cnpj: string; inscricao_estadual: string; telefone: string; email: string; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string };
const vazio: Form = { razao_social:"", nome_fantasia:"", cnpj:"", inscricao_estadual:"", telefone:"", email:"", cep:"", logradouro:"", numero:"", complemento:"", bairro:"", cidade:"", uf:"" };
const digitos = (s:string) => s.replace(/\D/g, "");
function cnpjValido(cnpj:string) {
  const s=digitos(cnpj);
  if(s.length!==14 || /^(\d)\1+$/.test(s)) return false;
  const digito=(base:string, pesos:number[])=>{ const soma=[...base].reduce((a,c,i)=>a+Number(c)*pesos[i],0); const resto=soma%11; return resto<2?0:11-resto; };
  return digito(s.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])===Number(s[12]) && digito(s.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(s[13]);
}
export default function FornecedoresModal({empresaId,onClose}:{empresaId:string;onClose:()=>void}) {
  const [lista,setLista]=useState<Fornecedor[]>([]);
  const [pesquisa,setPesquisa]=useState("");
  const [formAberto,setFormAberto]=useState(false);
  const [form,setForm]=useState<Form>({...vazio});
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState("");
  const [erroForm,setErroForm]=useState("");
  const carregar=useCallback(async()=>{
    if(!supabase || !empresaId){setErro("Empresa ou conexão indisponível.");setCarregando(false);return;}
    setCarregando(true);
    const {data,error}=await supabase.from("fornecedores").select("id,razao_social,nome_fantasia,cnpj,inscricao_estadual,telefone,email,cidade,uf").eq("empresa_id",empresaId).order("razao_social").limit(500);
    if(error)setErro("Não foi possível consultar fornecedores: "+error.message);
    else {setErro("");setLista((data??[]) as Fornecedor[]);}
    setCarregando(false);
  },[empresaId]);
  useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{
    const tecla=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){e.preventDefault();if(formAberto && !salvando)setFormAberto(false);else if(!formAberto)onClose();}
      if(e.key==="F2" && !formAberto && empresaId){e.preventDefault();setForm({...vazio});setErroForm("");setFormAberto(true);}
      if(e.key==="F12" && formAberto && !salvando){e.preventDefault();document.getElementById("ev-fornecedor-submit")?.click();}
    };
    window.addEventListener("keydown",tecla);return()=>window.removeEventListener("keydown",tecla);
  },[formAberto,salvando,empresaId,onClose]);
  const alterar=(campo:keyof Form,valor:string)=>setForm(f=>({...f,[campo]:valor}));
  async function salvar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!supabase||!empresaId||salvando)return;
    const cnpj=digitos(form.cnpj);
    if(!form.razao_social.trim()){setErroForm("Informe a razão social.");return;}
    if(!cnpjValido(cnpj)){setErroForm("Informe um CNPJ válido, com 14 dígitos e verificadores corretos.");return;}
    if(form.uf.trim() && !/^[A-Za-z]{2}$/.test(form.uf.trim())){setErroForm("A UF deve conter duas letras.");return;}
    setSalvando(true);setErroForm("");
    const campos=Object.fromEntries(Object.entries(form).map(([k,v])=>[k,k==="cnpj"?cnpj:v.trim()||null]));
    const {error}=await supabase.from("fornecedores").insert({...campos,razao_social:form.razao_social.trim(),empresa_id:empresaId});
    setSalvando(false);
    if(error){setErroForm(error.code==="23505"?"Este CNPJ já está cadastrado nesta empresa.":"Não foi possível salvar: "+error.message);return;}
    setFormAberto(false);setForm({...vazio});await carregar();
  }
  const filtrados=lista.filter(f=>[f.razao_social,f.nome_fantasia??"",f.cnpj].some(v=>v.toLocaleLowerCase("pt-BR").includes(pesquisa.toLocaleLowerCase("pt-BR"))));
  return <div className="ev-supplier-overlay" onMouseDown={e=>{if(e.target===e.currentTarget && !formAberto && !salvando)onClose();}}>
    <section className="ev-supplier-modal" role="dialog" aria-modal="true" aria-label="Cadastro de Fornecedores">
      <header className="ev-supplier-head"><div><h2>Cadastro de Fornecedores</h2><p>Consulte e cadastre fornecedores da sua empresa.</p></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="ev-supplier-search"><label htmlFor="ev-supplier-search">Pesquisar fornecedores</label><input id="ev-supplier-search" autoFocus value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Razão social, fantasia ou CNPJ" /></div>
      <div className="ev-supplier-table"><table><thead><tr><th>Razão social</th><th>CNPJ</th><th>Cidade / UF</th><th>Telefone</th></tr></thead><tbody>{carregando?<tr><td colSpan={4}>Carregando fornecedores...</td></tr>:erro?<tr><td colSpan={4} role="alert">{erro}</td></tr>:filtrados.length?filtrados.map(f=><tr key={f.id}><td>{f.razao_social}{f.nome_fantasia&&<small>{f.nome_fantasia}</small>}</td><td>{f.cnpj}</td><td>{[f.cidade,f.uf].filter(Boolean).join(" / ")||"—"}</td><td>{f.telefone||"—"}</td></tr>):<tr><td colSpan={4}>Nenhum fornecedor encontrado. Clique em Novo (F2) para cadastrar.</td></tr>}</tbody></table></div>
      <footer className="ev-supplier-footer"><button type="button" onClick={()=>{setForm({...vazio});setErroForm("");setFormAberto(true);}} disabled={!empresaId}>+ Novo (F2)</button><button type="button" className="primary" onClick={onClose}>Fechar (Esc)</button></footer>
    </section>
    {formAberto&&<div className="ev-supplier-overlay nested"><section className="ev-supplier-form-modal" role="dialog" aria-modal="true" aria-label="Novo Fornecedor">
      <header className="ev-supplier-head"><div><h2>Novo Fornecedor</h2><p>Dados que poderão ser utilizados na importação de notas fiscais.</p></div><button type="button" onClick={()=>!salvando&&setFormAberto(false)} aria-label="Cancelar">×</button></header>
      <form id="ev-fornecedor-form" onSubmit={salvar} className="ev-supplier-form"><div className="ev-supplier-grid">
        {([['razao_social','Razão social *'],['nome_fantasia','Nome fantasia'],['cnpj','CNPJ *'],['inscricao_estadual','Inscrição estadual'],['telefone','Telefone'],['email','E-mail'],['cep','CEP'],['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro'],['cidade','Cidade'],['uf','UF']] as [keyof Form,string][]).map(([campo,rotulo])=><label key={campo} className={campo==="razao_social"?"wide":""}>{rotulo}<input autoFocus={campo==="razao_social"} required={campo==="razao_social"||campo==="cnpj"} type={campo==="email"?"email":"text"} maxLength={campo==="cnpj"?18:campo==="uf"?2:campo==="cep"?9:campo==="email"?150:200} value={form[campo]} onChange={e=>alterar(campo,e.target.value)} /></label>)}
      </div>{erroForm&&<p role="alert" className="ev-supplier-error">{erroForm}</p>}</form>
      <footer className="ev-supplier-footer"><button type="button" onClick={()=>setFormAberto(false)} disabled={salvando}>Cancelar</button><button type="submit" id="ev-fornecedor-submit" form="ev-fornecedor-form" className="primary" disabled={salvando}>{salvando?"Salvando...":"Salvar (F12)"}</button></footer>
    </section></div>}
    <style jsx global>{`.ev-supplier-overlay{position:fixed;inset:0;z-index:1200;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:16px}.ev-supplier-overlay.nested{z-index:1210}.ev-supplier-modal,.ev-supplier-form-modal{width:min(930px,100%);height:min(690px,calc(100dvh - 32px));background:white;border-radius:15px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px #06152c66}.ev-supplier-form-modal{width:min(760px,100%);height:auto;max-height:calc(100dvh - 32px)}.ev-supplier-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:20px 22px;border-bottom:1px solid #dce5f0}.ev-supplier-head h2{margin:0;color:#10234b;font-size:21px}.ev-supplier-head p{margin:8px 0 0;color:#64748b;font-size:13px}.ev-supplier-head button{border:0;border-radius:8px;background:#edf3fa;color:#18365f;font-size:23px;width:35px;height:35px;cursor:pointer}.ev-supplier-search{padding:18px 22px;display:flex;flex-direction:column;gap:7px}.ev-supplier-search label,.ev-supplier-grid label{font-size:12px;font-weight:bold;color:#344761}.ev-supplier-search input,.ev-supplier-grid input{border:1px solid #cbd8e8;border-radius:8px;padding:11px 12px;font-size:14px;width:100%;color:#10234b}.ev-supplier-table{flex:1;min-height:0;overflow:auto;margin:0 22px;border:1px solid #dce5f0;border-radius:8px}.ev-supplier-table table{border-collapse:collapse;width:100%;font-size:13px;text-align:left}.ev-supplier-table th{background:#f1f5fb;padding:13px;border-bottom:1px solid #dce5f0}.ev-supplier-table td{padding:12px;border-bottom:1px solid #e8edf5}.ev-supplier-table small{display:block;color:#71819a;margin-top:4px}.ev-supplier-footer{display:flex;justify-content:space-between;gap:10px;padding:17px 22px;border-top:1px solid #dce5f0}.ev-supplier-footer button{padding:10px 16px;border:1px solid #cdd8e7;border-radius:8px;background:#fff;color:#15325a;font-weight:bold;cursor:pointer}.ev-supplier-footer button.primary{background:#0b2454;color:#fff;border-color:#0b2454}.ev-supplier-footer button:disabled{opacity:.5}.ev-supplier-form{padding:20px 22px;overflow:auto}.ev-supplier-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.ev-supplier-grid label{display:flex;flex-direction:column;gap:7px}.ev-supplier-grid label.wide{grid-column:1/-1}.ev-supplier-error{background:#fff0ee;color:#9c2f21;padding:12px;border-radius:8px;font-size:13px}@media(max-width:600px){.ev-supplier-grid{grid-template-columns:1fr}.ev-supplier-grid label.wide{grid-column:auto}.ev-supplier-head,.ev-supplier-search,.ev-supplier-footer,.ev-supplier-form{padding:14px}.ev-supplier-table{margin:0 14px}.ev-supplier-table table{min-width:600px}}`}</style>
  </div>;
}

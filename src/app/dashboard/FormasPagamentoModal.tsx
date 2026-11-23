"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Taxa = { id:string; forma:string; bandeira:string|null; parcelas:number; taxa_percentual:number; ativo:boolean };
const nomeBandeira:Record<string,string> = { visa:"Visa", mastercard:"Mastercard", elo:"Elo", amex:"Amex", diners:"Diners" };
const nomeForma:Record<string,string> = { dinheiro:"Dinheiro", pix:"PIX", debito:"Cartão de débito", credito:"Cartão de crédito" };
const fmt=(n:number)=>n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function FormasPagamentoModal({onClose}:{onClose:()=>void}) {
  const [lista,setLista]=useState<Taxa[]>([]);
  const [editando,setEditando]=useState<string|null>(null);
  const [valor,setValor]=useState("");
  const [erro,setErro]=useState("");
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const requisitar=useCallback(async(method:"GET"|"PATCH",body?:unknown)=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error("Sessão expirada. Entre novamente.");
    const res=await fetch("/api/formas-pagamento",{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
    const json=await res.json();
    if(!res.ok)throw new Error(json.error||"Falha ao acessar formas de pagamento.");
    return json;
  },[]);
  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{const r=await requisitar("GET");setLista(r.taxas||[]);}catch(e){setErro(e instanceof Error?e.message:"Falha ao carregar.");}
    finally{setCarregando(false);}
  },[requisitar]);
  useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!salvando){e.stopImmediatePropagation();onClose();}};window.addEventListener("keydown",onKey,true);return()=>window.removeEventListener("keydown",onKey,true);},[onClose,salvando]);
  async function salvar(item:Taxa,ativo:boolean,taxa:number){
    if(salvando)return;
    setSalvando(true);setErro("");
    try{await requisitar("PATCH",{id:item.id,ativo,taxa_percentual:taxa});setEditando(null);await carregar();}
    catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar.");}finally{setSalvando(false);}
  }
  const grupos=["dinheiro","pix","debito","credito"];
  return <div className="ev-fp-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!salvando)onClose();}}>
    <section className="ev-fp-window" role="dialog" aria-modal="true" aria-label="Cadastro de Formas de Pagamento">
      <header className="ev-fp-head"><div><h2>Cadastro de Formas de Pagamento</h2><p>Taxas por bandeira e parcelas • Crédito limitado a 3x</p></div><button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">×</button></header>
      <div className="ev-fp-body">
        <p className="ev-fp-note">Configurações individuais por empresa. Esta etapa cadastra as taxas; a aplicação no PDV e nos recebíveis será integrada após a validação do banco.</p>
        {erro&&<p role="alert" className="ev-fp-error">{erro}</p>}
        {carregando?<p>Carregando configurações...</p>:lista.length===0?<p>Nenhuma configuração encontrada. Execute o SQL de instalação.</p>:grupos.map(grupo=><div key={grupo} className="ev-fp-group"><h3>{nomeForma[grupo]}</h3><div className="ev-fp-table-wrap"><table><thead><tr><th>Bandeira</th><th>Parcelas</th><th>Taxa (%)</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{lista.filter(x=>x.forma===grupo).map(item=><tr key={item.id}><td>{item.bandeira?nomeBandeira[item.bandeira]||item.bandeira:"—"}</td><td>{grupo==="credito"?`${item.parcelas}x`:"À vista"}</td><td>{editando===item.id?<input aria-label="Taxa percentual" inputMode="decimal" value={valor} onChange={e=>setValor(e.target.value)} disabled={salvando}/>:fmt(item.taxa_percentual)+"%"}</td><td><span className={item.ativo?"ev-fp-active":"ev-fp-inactive"}>{item.ativo?"Ativa":"Inativa"}</span></td><td>{editando===item.id?<><button type="button" disabled={salvando} onClick={()=>{const n=Number(valor.replace(",","."));if(!/^\d+(?:[.,]\d{1,2})?$/.test(valor)||n>100){setErro("Informe uma taxa válida, de 0 a 100%, com até duas casas decimais.");return;}void salvar(item,item.ativo,n);}}>Salvar</button><button type="button" disabled={salvando} onClick={()=>setEditando(null)}>Cancelar</button></>:<><button type="button" disabled={salvando} onClick={()=>{setEditando(item.id);setValor(fmt(item.taxa_percentual));setErro("");}}>Editar</button><button type="button" disabled={salvando} onClick={()=>void salvar(item,!item.ativo,item.taxa_percentual)}>{item.ativo?"Desativar":"Ativar"}</button></>}</td></tr>)}</tbody></table></div></div>)}
      </div>
    </section>
    <style jsx global>{` .ev-fp-overlay{position:fixed;inset:0;z-index:9999;background:#0b1835a8;display:flex;align-items:center;justify-content:center;padding:16px}.ev-fp-window{width:min(100%,1040px);max-height:92vh;display:flex;flex-direction:column;background:white;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px #0004;color:#172a48}.ev-fp-head{background:#0d2654;color:white;padding:18px 24px;display:flex;justify-content:space-between;gap:15px;align-items:center}.ev-fp-head h2{margin:0;font-size:21px}.ev-fp-head p{margin:5px 0 0;color:#d5e3fb;font-size:13px}.ev-fp-head button{border:0;background:transparent;color:white;font-size:30px;cursor:pointer}.ev-fp-body{padding:20px;overflow:auto}.ev-fp-note{padding:12px;border-radius:10px;background:#edf4ff;color:#25436d}.ev-fp-error{color:#a21d2b;background:#fff0f0;padding:10px;border-radius:8px}.ev-fp-group{margin:22px 0}.ev-fp-group h3{font-size:17px;margin-bottom:10px}.ev-fp-table-wrap{overflow-x:auto}.ev-fp-table-wrap table{width:100%;border-collapse:collapse;min-width:620px}.ev-fp-table-wrap th,.ev-fp-table-wrap td{padding:10px 12px;border-bottom:1px solid #e4eaf2;text-align:left}.ev-fp-table-wrap th{background:#f1f5fa;font-size:13px}.ev-fp-table-wrap button{padding:7px 10px;border-radius:7px;border:1px solid #b9cbe2;background:white;color:#0d2654;font-weight:600;cursor:pointer;margin-right:5px}.ev-fp-table-wrap button:disabled{opacity:.45}.ev-fp-table-wrap input{width:100px;padding:7px;border:1px solid #b9cbe2;border-radius:7px}.ev-fp-active{color:#17613a;font-weight:600}.ev-fp-inactive{color:#8b3131;font-weight:600}`}</style>
  </div>;
}

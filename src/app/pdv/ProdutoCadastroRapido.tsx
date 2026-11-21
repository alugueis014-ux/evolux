"use client";
import {useEffect,useState,type FormEvent} from "react";
import {createClient} from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase=url&&key?createClient(url,key):null;
type ProdutoForm={descricao:string;codigo_barras:string;unidade:string;preco_custo:string;preco_venda:string;ativo:boolean};
const inicial:ProdutoForm={descricao:"",codigo_barras:"",unidade:"UN",preco_custo:"0",preco_venda:"0",ativo:true};
export default function ProdutoCadastroRapido({empresaId,onClose,onSaved,produtoId}:{empresaId:string;onClose:()=>void;onSaved:()=>void;produtoId?:string|null}){
 const [form,setForm]=useState<ProdutoForm>({...inicial});
 const [salvando,setSalvando]=useState(false);
 const [erro,setErro]=useState("");
 const [carregandoEdicao,setCarregandoEdicao]=useState(Boolean(produtoId));
 useEffect(()=>{
  if(!produtoId)return;
  let ativo=true;
  async function carregar(){
   if(!supabase||!empresaId){setErro("Empresa ou conexão indisponível.");setCarregandoEdicao(false);return;}
   const {data,error}=await supabase.from("produtos").select("descricao,codigo_barras,unidade,preco_custo,preco_venda,ativo").eq("empresa_id",empresaId).eq("id",produtoId).single();
   if(!ativo)return;
   if(error||!data)setErro("Não foi possível carregar o produto para edição: "+(error?.message||"Produto não encontrado."));
   else setForm({descricao:data.descricao||"",codigo_barras:data.codigo_barras||"",unidade:data.unidade||"UN",preco_custo:String(data.preco_custo??0),preco_venda:String(data.preco_venda??0),ativo:Boolean(data.ativo)});
   setCarregandoEdicao(false);
  }
  void carregar();return()=>{ativo=false};
 },[produtoId,empresaId]);
 useEffect(()=>{
  const tecla=(e:KeyboardEvent)=>{
   if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();if(!salvando)onClose();}
   if(e.key==="F12"){e.preventDefault();e.stopImmediatePropagation();document.getElementById("ev-pdv-produto-form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));}
  };
  window.addEventListener("keydown",tecla,true);return()=>window.removeEventListener("keydown",tecla,true);
 },[onClose,salvando]);
 async function salvar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase||!empresaId||salvando||carregandoEdicao)return;
  const descricao=form.descricao.trim();if(!descricao){setErro("Informe a descrição do produto.");return;}
  const numero=(valor:string)=>Number(valor.replace(",","."));
  const custo=numero(form.preco_custo),venda=numero(form.preco_venda);
  if([custo,venda].some(n=>!Number.isFinite(n))||custo<0||venda<0){setErro("Confira os valores: custo e venda não podem ser negativos.");return;}
  setSalvando(true);setErro("");
  const {error}=produtoId
   ? await supabase.from("produtos").update({descricao,codigo_barras:form.codigo_barras.trim()||null,unidade:form.unidade,preco_venda:venda,ativo:form.ativo}).eq("empresa_id",empresaId).eq("id",produtoId)
   : await supabase.from("produtos").insert({empresa_id:empresaId,descricao,codigo_barras:form.codigo_barras.trim()||null,unidade:form.unidade,preco_custo:custo,preco_venda:venda,estoque_atual:0,estoque_minimo:0,ativo:form.ativo});
  setSalvando(false);
  if(error){setErro(error.code==="23505"?"Este código de barras já está cadastrado nesta empresa.":"Não foi possível salvar: "+error.message);return;}
  onSaved();
 }
 return <div className="ev-pdv-cadastro-overlay"><section className="ev-pdv-cadastro" role="dialog" aria-modal="true" aria-label={produtoId?"Editar produto":"Cadastrar produto"}>
 <header><div><h2>{produtoId?"Editar Produto":"Novo Produto"}</h2><p>{produtoId?"Altere os dados comerciais. O estoque e o custo histórico são preservados.":"Cadastro rápido durante a venda · Código interno gerado automaticamente"}</p></div><button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">×</button></header>
 {carregandoEdicao&&<p role="status" className="erro">Carregando dados do produto...</p>}
 <form id="ev-pdv-produto-form" onSubmit={salvar}><div className="ev-pdv-cadastro-grid">
 <label className="wide">Descrição do produto *<input autoFocus required maxLength={200} value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}/></label>
 <label>Código de barras (EAN/GTIN)<input maxLength={40} value={form.codigo_barras} onChange={e=>setForm(f=>({...f,codigo_barras:e.target.value}))}/></label>
 <label>Unidade<select value={form.unidade} onChange={e=>setForm(f=>({...f,unidade:e.target.value}))}>{["UN","CX","KG","G","LT","ML","PCT","PAR","M","M2"].map(u=><option key={u}>{u}</option>)}</select></label>
 <label>Preço de custo (R$) — referência inicial<input type="number" min="0" step="0.01" required disabled={Boolean(produtoId)} value={form.preco_custo} onChange={e=>setForm(f=>({...f,preco_custo:e.target.value}))}/></label>
 <label>Preço de venda (R$)<input type="number" min="0" step="0.01" required value={form.preco_venda} onChange={e=>setForm(f=>({...f,preco_venda:e.target.value}))}/></label>
 <label>Estoque<input type="text" value={produtoId?"Preservado (controle por movimentações)":"0"} disabled title="O estoque é controlado pelas movimentações"/></label>
 <label>Situação <span><input type="checkbox" checked={form.ativo} onChange={e=>setForm(f=>({...f,ativo:e.target.checked}))}/> {form.ativo?"Ativo":"Inativo"}</span></label>
 </div>{erro&&<p role="alert" className="erro">{erro}</p>}</form>
 <footer><small>* Campo obrigatório</small><div><button type="button" disabled={salvando} onClick={onClose}>Cancelar (Esc)</button><button type="submit" form="ev-pdv-produto-form" disabled={salvando||carregandoEdicao} className="salvar">{salvando?"Salvando...":"Salvar (F12)"}</button></div></footer>
 </section><style jsx global>{`.ev-pdv-cadastro-overlay{position:fixed;inset:0;z-index:3600;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:15px}.ev-pdv-cadastro{width:min(760px,100%);max-height:calc(100dvh - 30px);background:#fff;border-radius:13px;display:flex;flex-direction:column;overflow:hidden;color:#10234b;box-shadow:0 20px 70px #0005;font-family:Arial,sans-serif}.ev-pdv-cadastro header,.ev-pdv-cadastro footer{padding:17px 21px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #dce5f0}.ev-pdv-cadastro footer{border-bottom:0;border-top:1px solid #dce5f0}.ev-pdv-cadastro h2{font-size:21px;margin:0}.ev-pdv-cadastro p{font-size:13px}.ev-pdv-cadastro header button{font-size:24px;background:#edf3fa;border:0;border-radius:7px;padding:4px 12px;cursor:pointer}.ev-pdv-cadastro form{overflow:auto;padding:22px}.ev-pdv-cadastro-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ev-pdv-cadastro-grid label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700}.ev-pdv-cadastro-grid .wide{grid-column:1/-1}.ev-pdv-cadastro-grid input,.ev-pdv-cadastro-grid select{width:100%;padding:11px;border:1px solid #cbd8e8;border-radius:8px;color:#10234b;font-size:14px}.ev-pdv-cadastro-grid label span{display:flex;align-items:center;gap:8px}.ev-pdv-cadastro-grid label span input{width:auto}.ev-pdv-cadastro footer>div{display:flex;gap:8px}.ev-pdv-cadastro footer button{padding:11px 16px;border:1px solid #cbd8e8;border-radius:7px;background:#fff;cursor:pointer;font-weight:700}.ev-pdv-cadastro footer button.salvar{background:#0b2454;color:white}.ev-pdv-cadastro .erro{color:#a32626;background:#fff0ee;padding:10px;border-radius:7px}@media(max-width:600px){.ev-pdv-cadastro-grid{grid-template-columns:1fr}.ev-pdv-cadastro-grid .wide{grid-column:auto}}.ev-pdv-cadastro{color:#111827}.ev-pdv-cadastro h2{color:#0b2454;font-weight:800}.ev-pdv-cadastro-grid label{color:#111827;font-size:13px;font-weight:800}.ev-pdv-cadastro-grid input,.ev-pdv-cadastro-grid select{font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;min-height:42px;color:#111827;background:#fff;border-color:#aabfdc}.ev-pdv-cadastro-grid input:focus,.ev-pdv-cadastro-grid select:focus{outline:2px solid #1765d5;outline-offset:1px}.ev-pdv-cadastro footer button.salvar{background:#0b2454;color:#fff}.ev-pdv-cadastro footer button:disabled{opacity:.55}
`}</style><style jsx global>{`
/* EVOLUX 24.7.8: cabeçalhos e cantos padronizados — prioridade explícita */
.ev-dashboard .ev-product-modal,.ev-dashboard .ev-form-modal,.ev-dashboard .ev-caixa-window,.ev-dashboard .ev-empresa-window,
.ev-cli-modal,.ev-cli-form-modal,.ev-supplier-modal,.ev-supplier-form-modal,.ev-xml-modal,.ev-ne-modal,.ev-pdv-cadastro,
.ev-rapida-modal,.ev-caixa .modal{border-radius:16px!important;overflow:hidden!important;box-shadow:0 22px 65px rgba(5,20,48,.22)}
.ev-dashboard .ev-product-heading,.ev-dashboard .ev-caixa-heading,
.ev-cli-header,.ev-supplier-head,.ev-xml-head,.ev-ne-modal>header,.ev-pdv-cadastro>header,
.company-modal-head,.ev-rapida-titulo{background:#0b2454!important;background-image:none!important;color:#fff!important;border-bottom:0!important;}
.ev-dashboard .ev-product-heading h2,.ev-dashboard .ev-product-heading h2 svg,.ev-dashboard .ev-caixa-heading h2,
.ev-cli-header h2,.ev-supplier-head h2,.ev-xml-head h2,.ev-ne-modal>header h2,.ev-pdv-cadastro>header h2,
.company-modal-head strong,.ev-rapida-titulo h2{color:#fff!important}
.ev-dashboard .ev-product-heading p,.ev-dashboard .ev-caixa-heading p,.ev-cli-header p,.ev-supplier-head p,.ev-xml-head p,.ev-ne-modal>header p,.ev-pdv-cadastro>header p{color:#dce7fa!important}
.ev-dashboard .ev-product-heading button,.ev-dashboard .ev-caixa-heading button,
.ev-cli-header button,.ev-supplier-head button,.ev-xml-head button,.ev-ne-modal>header button,.ev-pdv-cadastro>header button,
.company-modal-head button,.ev-rapida-titulo button{background:#ffffff1c!important;color:#fff!important;border:1px solid #ffffff44!important;border-radius:9px!important}
.ev-dashboard .ev-product-modal input,.ev-dashboard .ev-form-modal input,.ev-dashboard .ev-empresa-window input,
.ev-cli-modal input,.ev-cli-form-modal input,.ev-supplier-modal input,.ev-supplier-form-modal input,.ev-xml-modal input,.ev-ne-modal input,
.ev-pdv-cadastro input,.ev-pdv-cadastro select{border-radius:9px!important}
.ev-dashboard .ev-product-actions button,.ev-cli-footer button,.ev-supplier-footer button,.ev-xml-footer button,.ev-ne-modal footer button,.ev-pdv-cadastro footer button{border-radius:9px!important}
`}</style></div>;
}

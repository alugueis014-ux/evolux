"use client";
import {useEffect,useState} from "react";
import {createClient} from "@supabase/supabase-js";
import {temAteDuasCasas} from "@/lib/dinheiro";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Nota={id:string;numero:string;serie:string;chave_acesso:string;emissao:string|null;valor_total:number;created_at:string;fornecedor_id:string};
type Item={id:string;numero_item:number;descricao_xml:string;codigo_fornecedor:string;quantidade:number;custo_unitario:number;valor_total:number};
type PrecoItem={produto_id:string;variacao_id:string|null;atual:number;novo:string;erro?:string};
const reais=(n:number)=>Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export default function NotasEntradaModal({empresaId,onClose}:{empresaId:string;onClose:()=>void}){
 const [notas,setNotas]=useState<Nota[]>([]),[fornecedores,setFornecedores]=useState<Record<string,string>>({});
 const [pesquisa,setPesquisa]=useState(""),[erro,setErro]=useState(""),[carregando,setCarregando]=useState(true);
 const [precos,setPrecos]=useState<Record<string,PrecoItem>>({});
 const [editandoPreco,setEditandoPreco]=useState<string|null>(null);
 const [salvandoPreco,setSalvandoPreco]=useState(false);
 const [avisoPreco,setAvisoPreco]=useState("");
 const [marcada,setMarcada]=useState<Nota|null>(null),[selecionada,setSelecionada]=useState<Nota|null>(null),[itens,setItens]=useState<Item[]>([]),[carregandoItens,setCarregandoItens]=useState(false);
 useEffect(()=>{let ativo=true;async function carregar(){if(!db||!empresaId){setErro("Empresa ou conexão indisponível.");setCarregando(false);return;}
 const [n,f]=await Promise.all([db.from("nfe_entradas").select("id,numero,serie,chave_acesso,emissao,valor_total,created_at,fornecedor_id").eq("empresa_id",empresaId).order("created_at",{ascending:false}).limit(500),db.from("fornecedores").select("id,razao_social").eq("empresa_id",empresaId).limit(1000)]);
 if(!ativo)return;if(n.error||f.error)setErro((n.error||f.error)?.message||"Erro na consulta");else{setNotas(n.data||[]);setFornecedores(Object.fromEntries((f.data||[]).map(x=>[x.id,x.razao_social])));}setCarregando(false);}
 void carregar();return()=>{ativo=false};},[empresaId]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();if(editandoPreco)setEditandoPreco(null);else if(selecionada)setSelecionada(null);else onClose()}if(e.key==="F12"&&editandoPreco){e.preventDefault();document.getElementById("ev-ne-save-price")?.click()}if(e.key==="Delete"&&marcada){const alvo=e.target as HTMLElement|null;if(alvo?.closest("input,textarea,select,[contenteditable=true]"))return;e.preventDefault();solicitarExclusao()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[onClose,selecionada,marcada,editandoPreco]);
 function solicitarExclusao(){setErro("Exclusão ainda não habilitada: precisamos validar a rotina SQL de estorno do estoque, inclusive conversões CX/UN. Nenhum registro foi alterado.");}
 async function abrir(n:Nota){
  setSelecionada(n);setItens([]);setPrecos({});setEditandoPreco(null);setAvisoPreco("");setErro("");setCarregandoItens(true);
  if(!db){setErro("Conexão indisponível.");setCarregandoItens(false);return;}
  const {data,error}=await db.from("nfe_entrada_itens").select("id,numero_item,descricao_xml,codigo_fornecedor,quantidade,custo_unitario,valor_total").eq("empresa_id",empresaId).eq("entrada_id",n.id).order("numero_item");
  if(error){setErro(error.message);setCarregandoItens(false);return;}
  const lista=(data||[]) as Item[];setItens(lista);
  const codigos=[...new Set(lista.map(i=>i.codigo_fornecedor).filter(Boolean))];
  if(!codigos.length){setErro("Não há códigos de fornecedor para localizar os preços dos produtos.");setCarregandoItens(false);return;}
  const {data:links,error:le}=await db.from("produto_fornecedor_vinculos").select("codigo_fornecedor,produto_id,variacao_id").eq("empresa_id",empresaId).eq("fornecedor_id",n.fornecedor_id).in("codigo_fornecedor",codigos);
  if(le){setErro("Não foi possível localizar os vínculos: "+le.message);setCarregandoItens(false);return;}
  const ids=[...new Set((links||[]).map(x=>x.produto_id))];
  const vids=[...new Set((links||[]).map(x=>x.variacao_id).filter((v):v is string=>Boolean(v)))];
  const [p,v]=await Promise.all([
   db.from("produtos").select("id,preco_venda").eq("empresa_id",empresaId).in("id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]),
   db.from("produto_variacoes").select("id,preco_venda").eq("empresa_id",empresaId).in("id",vids.length?vids:["00000000-0000-0000-0000-000000000000"])
  ]);
  if(p.error||v.error){setErro("Não foi possível consultar os preços: "+(p.error||v.error)?.message);setCarregandoItens(false);return;}
  const mapaLinks=new Map((links||[]).map(x=>[x.codigo_fornecedor,x]));
  const mapaP=new Map((p.data||[]).map(x=>[x.id,x]));const mapaV=new Map((v.data||[]).map(x=>[x.id,x]));
  const mapa:Record<string,PrecoItem>={};
  for(const item of lista){const link=mapaLinks.get(item.codigo_fornecedor);if(!link||!mapaP.has(link.produto_id))continue;
   const principal=Number(mapaP.get(link.produto_id)?.preco_venda??0);
   const especifico=link.variacao_id?mapaV.get(link.variacao_id)?.preco_venda:null;
   const atual=Number(especifico??principal);
   mapa[item.id]={produto_id:link.produto_id,variacao_id:link.variacao_id,atual,novo:String(atual)};
  }
  setPrecos(mapa);setCarregandoItens(false);
 }
 async function salvarPreco(item:Item){
  if(!db||!selecionada||salvandoPreco)return;
  const preco=precos[item.id];if(!preco){setErro("Produto sem vínculo cadastrado. Não é possível alterar o preço.");return;}
  const valor=Number(preco.novo.replace(",","."));
  if(!preco.novo.trim()||!Number.isFinite(valor)||valor<=0||!temAteDuasCasas(valor)){setErro("Informe um preço positivo com até duas casas decimais.");return;}
  setSalvandoPreco(true);setErro("");setAvisoPreco("");
  const tabela=preco.variacao_id?"produto_variacoes":"produtos";
  const id=preco.variacao_id||preco.produto_id;
  const {data,error}=await db.from(tabela).update({preco_venda:valor}).eq("empresa_id",empresaId).eq("id",id).select("id");
  setSalvandoPreco(false);
  if(error||!data?.length){setErro("Não foi possível salvar o preço: "+(error?.message||"Verifique as permissões."));return;}
  setPrecos(old=>({...old,[item.id]:{...old[item.id],atual:valor,novo:String(valor)}}));
  setEditandoPreco(null);setAvisoPreco(`Preço de venda de ${item.descricao_xml} atualizado. Estoque, custo e NF-e não foram alterados.`);
 }
 const filtradas=notas.filter(n=>[n.numero,n.serie,n.chave_acesso,fornecedores[n.fornecedor_id]||""].some(v=>v.toLowerCase().includes(pesquisa.toLowerCase())));
 return <div className="ev-ne-overlay"><section className="ev-ne-modal" role="dialog" aria-modal="true" aria-label="Notas fiscais de entrada"><header><div><h2>Notas Fiscais de Entrada</h2><p>Notas importadas e registradas no estoque</p></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></header><div className="ev-ne-content">
 <label>Pesquisar nota<input value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Número, fornecedor ou chave de acesso"/></label>
 {erro&&<p className="ev-ne-error" role="alert">{erro}</p>}{carregando?<p>Consultando notas...</p>:<div className="ev-ne-table"><table><thead><tr><th>NF-e / Série</th><th>Fornecedor</th><th>Data da entrada</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>{filtradas.map(n=><tr key={n.id} onClick={()=>setMarcada(n)} className={marcada?.id===n.id?"ev-ne-selected":""} aria-selected={marcada?.id===n.id}><td>{n.numero} / {n.serie}</td><td>{fornecedores[n.fornecedor_id]||"Fornecedor"}</td><td>{new Date(n.created_at).toLocaleString("pt-BR")}</td><td>{reais(n.valor_total)}</td><td><span className="ev-ne-ok">Importada</span></td><td><button type="button" onClick={()=>{setMarcada(n);void abrir(n)}}>Visualizar</button> <button type="button" className="ev-ne-danger" onClick={()=>{setMarcada(n);solicitarExclusao()}}>Excluir</button></td></tr>)}{!filtradas.length&&<tr><td colSpan={6}>Nenhuma nota encontrada.</td></tr>}</tbody></table></div>}
 {selecionada&&<div className="ev-ne-detail"><div className="ev-ne-detail-head"><strong>NF-e {selecionada.numero} — Itens da entrada</strong><button type="button" onClick={()=>{setSelecionada(null);setEditandoPreco(null)}}>Fechar detalhes</button></div><p>Chave de acesso: {selecionada.chave_acesso}</p>
 {avisoPreco&&<p className="ev-ne-success" role="status">{avisoPreco}</p>}
 {carregandoItens?<p>Carregando itens e preços...</p>:<div className="ev-ne-table"><table><thead><tr><th>Item</th><th>Descrição</th><th>Cód. fornecedor</th><th>Qtd.</th><th>Custo unitário XML</th><th>Total NF-e</th><th>Venda atual</th><th>Ação</th></tr></thead><tbody>{itens.map(i=>{const preco=precos[i.id];const editando=editandoPreco===i.id;return <tr key={i.id}><td>{i.numero_item}</td><td>{i.descricao_xml}</td><td>{i.codigo_fornecedor}</td><td>{i.quantidade}</td><td>{reais(i.custo_unitario)}</td><td>{reais(i.valor_total)}</td><td>{preco?editando?<input className="ev-ne-price-input" type="number" min="0.01" step="0.01" aria-label={`Novo preço de venda de ${i.descricao_xml}`} value={preco.novo} onChange={e=>setPrecos(old=>({...old,[i.id]:{...old[i.id],novo:e.target.value}}))}/>:reais(preco.atual):"Sem vínculo"}</td><td>{preco?(editando?<><button type="button" id="ev-ne-save-price" disabled={salvandoPreco} onClick={()=>void salvarPreco(i)}>{salvandoPreco?"Salvando...":"Salvar (F12)"}</button> <button type="button" disabled={salvandoPreco} onClick={()=>setEditandoPreco(null)}>Cancelar</button></>:<button type="button" disabled={salvandoPreco} onClick={()=>{setErro("");setAvisoPreco("");setEditandoPreco(i.id)}}>Editar preço</button>):"—"}</td></tr>})}</tbody></table></div>}
 <p className="ev-ne-price-hint">A alteração atualiza o preço comercial do produto ou da variação vinculada. O estoque, o custo e os valores fiscais originais permanecem intactos. Cada preço é salvo individualmente.</p></div>}

 </div><footer><span>{marcada?`Selecionada: NF-e ${marcada.numero} · Del para solicitar exclusão`:"Selecione uma nota para visualizar ou solicitar exclusão."}</span><button type="button" onClick={onClose}>Fechar (Esc)</button></footer></section><style jsx>{`
 .ev-ne-overlay{position:fixed;inset:0;z-index:1300;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:18px}.ev-ne-modal{width:min(1100px,100%);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#10234b;border-radius:15px;box-shadow:0 24px 70px #06152c66}.ev-ne-modal header,.ev-ne-modal footer{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #dce5f0}.ev-ne-modal footer{border-bottom:0;border-top:1px solid #dce5f0}.ev-ne-modal h2{font-size:21px;margin:0}.ev-ne-modal header p,.ev-ne-modal footer span{font-size:12px;color:#64748b}.ev-ne-modal button{cursor:pointer;border:1px solid #cbd8e8;border-radius:7px;padding:8px 12px;background:#fff;color:#10234b}.ev-ne-modal header button{font-size:23px}.ev-ne-modal footer button{background:#0b2454;color:white}.ev-ne-content{overflow:auto;padding:20px 22px;display:flex;flex-direction:column;gap:16px}.ev-ne-content>label{display:flex;flex-direction:column;gap:7px;font-weight:700;font-size:12px}.ev-ne-content input{padding:12px;border:1px solid #cbd8e8;border-radius:8px;font-size:14px}.ev-ne-table{overflow:auto;border:1px solid #dce5f0;border-radius:9px}.ev-ne-table table{border-collapse:collapse;width:100%;min-width:700px;font-size:12px}.ev-ne-table th,.ev-ne-table td{padding:11px 12px;text-align:left;border-bottom:1px solid #e5ebf3}.ev-ne-table th{background:#edf3fb}.ev-ne-ok{background:#e5f7e9;color:#166b38;padding:5px 8px;border-radius:15px;font-weight:700}.ev-ne-detail{border:1px solid #dce5f0;border-radius:9px;padding:14px}.ev-ne-detail-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ev-ne-detail p{font-size:12px;overflow-wrap:anywhere}.ev-ne-selected{background:#eaf2ff!important;outline:1px solid #8fb5f0}.ev-ne-table tbody tr{cursor:pointer}.ev-ne-modal .ev-ne-danger{color:#a32626;border-color:#f0c5c5}.ev-ne-price-input{width:110px;max-width:100%;padding:8px!important}.ev-ne-price-hint{color:#64748b;line-height:1.5}.ev-ne-success{background:#e5f7e9;color:#166b38;padding:10px;border-radius:7px}.ev-ne-error{background:#fff0ee;color:#a32626;padding:12px;border-radius:8px}
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
`}</style></div>
}

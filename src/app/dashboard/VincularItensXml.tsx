"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Item={numero:string;codigo:string;descricao:string;ean:string;quantidade:string;unidade?:string;valorUnitario?:string;total?:string};
type Destino={id:string;produto_id:string;variacao_id:string|null;nome:string;ean:string};
type Vinculo={codigo_fornecedor:string;produto_id:string;variacao_id:string|null};
type Escolha={valor:string;origem:"vinculo"|"ean"|"manual"|"pendente"};
const norm=(v:string)=>v.trim().replace(/\s+/g,"");
const chave=(d:Destino)=>d.variacao_id?`v:${d.variacao_id}`:`p:${d.produto_id}`;
export default function VincularItensXml({empresaId,fornecedorId,itens,onStatusChange,fatores,onFatorChange}:{empresaId:string;fornecedorId:string;itens:Item[];onStatusChange?:(ready:boolean)=>void;fatores:Record<string,string>;onFatorChange:(numero:string,valor:string)=>void}){
 const [destinos,setDestinos]=useState<Destino[]>([]);
 const [escolhas,setEscolhas]=useState<Record<string,Escolha>>({});
 const [vinculos,setVinculos]=useState<Vinculo[]>([]);
 const [carregando,setCarregando]=useState(true);
 const [salvando,setSalvando]=useState<string|null>(null);
 const [erro,setErro]=useState("");
 const [mensagem,setMensagem]=useState("");
 const [novoItem,setNovoItem]=useState<string|null>(null);
 const [novoForm,setNovoForm]=useState({descricao:"",ean:"",unidade:"UN",custo:"0"});
 const [criando,setCriando]=useState(false);
 const [mostrarEdicao,setMostrarEdicao]=useState<string|null>(null);
 useEffect(()=>{
  let ativo=true;
  async function carregar(){
   setCarregando(true);setErro("");setMensagem("");setEscolhas({});
   if(!db){setErro("Supabase não configurado.");setCarregando(false);return;}
   const [p,v,l]=await Promise.all([
    db.from("produtos").select("id,codigo,descricao,codigo_barras").eq("empresa_id",empresaId).order("descricao").limit(1000),
    db.from("produto_variacoes").select("id,produto_id,atributos,codigo_barras").eq("empresa_id",empresaId).limit(2000),
    db.from("produto_fornecedor_vinculos").select("codigo_fornecedor,produto_id,variacao_id").eq("empresa_id",empresaId).eq("fornecedor_id",fornecedorId).limit(2000)
   ]);
   if(!ativo)return;
   if(p.error||v.error||l.error){setErro("Não foi possível consultar produtos/vínculos. Execute o SQL da Etapa 21.3. "+(p.error||v.error||l.error)?.message);setCarregando(false);return;}
   const produtos=(p.data||[]) as {id:string;codigo:number;descricao:string;codigo_barras:string|null}[];
   const mapa=new Map(produtos.map(x=>[x.id,x]));
   const grades=new Set((v.data||[]).map(x=>x.produto_id));
   const ds:Destino[]=[
    ...produtos.filter(x=>!grades.has(x.id)).map(x=>({id:`p:${x.id}`,produto_id:x.id,variacao_id:null,nome:`${x.codigo} — ${x.descricao}`,ean:x.codigo_barras||""})),
    ...(v.data||[]).filter(x=>mapa.has(x.produto_id)).map(x=>({id:`v:${x.id}`,produto_id:x.produto_id,variacao_id:x.id,nome:`${mapa.get(x.produto_id)?.descricao} · ${Object.entries(x.atributos||{}).map(([a,b])=>`${a}: ${b}`).join(" · ")}`,ean:x.codigo_barras||""}))
   ];
   const links=(l.data||[]) as Vinculo[];
   setDestinos(ds);setVinculos(links);
   const choices:Record<string,Escolha>={};
   for(const item of itens){
    const id=item.numero;
    const link=links.find(x=>x.codigo_fornecedor===item.codigo);
    const found=link?ds.find(d=>d.produto_id===link.produto_id&&d.variacao_id===link.variacao_id):null;
    if(found){choices[id]={valor:found.id,origem:"vinculo"};continue;}
    const ean=norm(item.ean);
    const candidatos=ean&&!/^(SEM GTIN|SEMGTIN|0+)$/i.test(ean)?ds.filter(d=>norm(d.ean)===ean):[];
    choices[id]=candidatos.length===1?{valor:candidatos[0].id,origem:"ean"}:{valor:"",origem:"pendente"};
   }
   setEscolhas(choices);setCarregando(false);
  }
  void carregar();return()=>{ativo=false;};
 },[empresaId,fornecedorId,itens]);
  function abrirNovo(item:Item){
   setErro("");setMensagem("");setNovoItem(item.numero);
   const ean=norm(item.ean);
   setNovoForm({descricao:item.descricao,ean:/^(SEMGTIN|SEM GTIN|0*)$/i.test(ean)?"":ean,
    unidade:item.unidade||"UN",custo:item.valorUnitario||"0"});
  }
  async function criarProduto(item:Item){
   if(!db||criando)return;
   const desc=novoForm.descricao.trim(),cod=item.codigo.trim(),ean=novoForm.ean.trim();
   const custo=Number(novoForm.custo.replace(",","."));
   if(!desc||!cod){setErro("Informe a descrição e confira o código do fornecedor.");return;}
   if(!Number.isFinite(custo)||custo<0){setErro("Informe preços válidos e não negativos.");return;}
   if(ean&&!/^\d{8,14}$/.test(ean)){setErro("O código de barras deve conter de 8 a 14 dígitos ou ficar vazio.");return;}
   setCriando(true);setErro("");setMensagem("");
   const {data,error}=await db.rpc("evolux_criar_produto_xml_vinculado",{
    p_empresa_id:empresaId,p_fornecedor_id:fornecedorId,p_codigo_fornecedor:cod,
    p_descricao:desc,p_codigo_barras:ean||null,p_unidade:novoForm.unidade.trim()||"UN",
    p_preco_custo:custo,p_preco_venda:0
   });
   setCriando(false);
   if(error){setErro("Não foi possível cadastrar o produto: "+error.message);return;}
   const id=String(data);
   const destino:Destino={id:`p:${id}`,produto_id:id,variacao_id:null,nome:desc,ean};
   setDestinos(old=>[...old,destino]);
   setVinculos(old=>[...old.filter(v=>v.codigo_fornecedor!==cod),{codigo_fornecedor:cod,produto_id:id,variacao_id:null}]);
   setEscolhas(old=>({...old,[item.numero]:{valor:destino.id,origem:"vinculo"}}));
   setNovoItem(null);setMostrarEdicao(null);
   setMensagem(`Produto ${desc} cadastrado e vinculado ao fornecedor. Estoque permanece zero até confirmar a nota.`);
  }
 async function salvar(item:Item){
  const escolhido=escolhas[item.numero];const destino=destinos.find(d=>d.id===escolhido?.valor);
  if(!db||!destino){setErro("Selecione um produto ou variação antes de vincular.");return;}
  if(!item.codigo.trim()){setErro("Item sem código do fornecedor. Não é possível guardar vínculo automático.");return;}
  setSalvando(item.numero);setErro("");setMensagem("");
  const {error}=await db.rpc("evolux_vincular_item_fornecedor",{
   p_empresa_id:empresaId,p_fornecedor_id:fornecedorId,p_codigo_fornecedor:item.codigo.trim(),
   p_produto_id:destino.produto_id,p_variacao_id:destino.variacao_id
  });
  setSalvando(null);
  if(error){setErro("Falha ao vincular: "+error.message);return;}
  setVinculos(old=>[...old.filter(v=>v.codigo_fornecedor!==item.codigo),{codigo_fornecedor:item.codigo,produto_id:destino.produto_id,variacao_id:destino.variacao_id}]);
  setEscolhas(old=>({...old,[item.numero]:{valor:destino.id,origem:"vinculo"}}));
  setMostrarEdicao(null);setMensagem(`Vínculo do item ${item.numero} salvo. O estoque não foi alterado.`);
 }
 const prontos=itens.filter(item=>{const e=escolhas[item.numero];const d=destinos.find(x=>x.id===e?.valor);return !!d&&vinculos.some(v=>v.codigo_fornecedor===item.codigo&&v.produto_id===d.produto_id&&v.variacao_id===d.variacao_id);}).length;
 useEffect(()=>{onStatusChange?.(!carregando&&!erro&&prontos===itens.length&&itens.length>0);},[carregando,erro,prontos,itens.length,onStatusChange]);
 const formatMoney=(n:string|undefined)=>{const v=Number(n??0);return Number.isFinite(v)?v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"—";};
 return <section className="ev-link-section">
  <div className="ev-link-heading"><h3>Produtos da nota</h3><span className={prontos===itens.length?"ev-count-ok":"ev-count-pending"}>{prontos} de {itens.length} produtos vinculados</span></div>
  {carregando?<p>Consultando produtos e vínculos...</p>:<div className="ev-link-table-wrap"><table className="ev-link-table"><thead><tr><th>Item</th><th>Cód. forn.</th><th>Descrição do produto (XML)</th><th>EAN</th><th>Un.</th><th>Qtd.</th><th>Custo un.</th><th>Total</th><th>Vínculo</th><th>Ação</th></tr></thead><tbody>
   {itens.map(item=>{
    const esc=escolhas[item.numero];
    const registrado=vinculos.some(v=>v.codigo_fornecedor===item.codigo&&destinos.some(d=>d.id===esc?.valor&&d.produto_id===v.produto_id&&d.variacao_id===v.variacao_id));
    const editando=mostrarEdicao===item.numero||novoItem===item.numero||!registrado;
    return <React.Fragment key={item.numero}>
      <tr><td>{item.numero}</td><td>{item.codigo||"—"}</td><td className="ev-link-description">{item.descricao}</td><td>{item.ean||"—"}</td><td><select className="ev-unit-select" aria-label={`Apresentação de compra do item ${item.numero}`} value={fatores[item.numero]??"1"} onChange={e=>onFatorChange(item.numero,e.target.value)}>
        <option value="1">{item.unidade&&item.unidade!=="CX"?item.unidade:"UN"} (1)</option>
        {[2,3,4,5,6,10,12,15,20,24,25,30,36,48,50,60,100].map(n=><option key={n} value={String(n)}>CX{n}</option>)}
        {!([1,2,3,4,5,6,10,12,15,20,24,25,30,36,48,50,60,100].includes(Number(fatores[item.numero]??"1")))&&<option value={fatores[item.numero]}>CX{fatores[item.numero]}</option>}
        </select><small className="ev-unit-xml">XML: {item.unidade||"—"}</small></td><td className="ev-num">{item.quantidade}</td><td className="ev-num">{formatMoney(item.valorUnitario)}</td><td className="ev-num">{formatMoney(item.total)}</td><td><span className={registrado?"ev-status-ok":"ev-status-pending"}>{registrado?"✓ Vinculado":"Pendente"}</span></td><td><button type="button" className="ev-edit-btn" onClick={()=>{setMostrarEdicao(editando?null:item.numero);setNovoItem(null);}} aria-label={`Alterar vínculo do item ${item.numero}`}>{editando?"Fechar":"✎ Alterar"}</button></td></tr>
      {editando&&<tr className="ev-editor-row"><td colSpan={10}><div className="ev-link-editor">
       <label>Vincular existente<select value={esc?.valor||""} onChange={e=>setEscolhas(old=>({...old,[item.numero]:{valor:e.target.value,origem:"manual"}}))}><option value="">Selecione um produto ou variação</option>{destinos.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
       <button type="button" className="ev-new-btn" disabled={criando||salvando!==null} onClick={()=>abrirNovo(item)}>+ Novo Produto</button>
       <button type="button" className="ev-confirm-btn" disabled={!esc?.valor||criando||salvando!==null} onClick={()=>void salvar(item)}>{salvando===item.numero?"Salvando...":"Confirmar vínculo"}</button>
      </div>
      {novoItem===item.numero&&<div className="ev-link-new-form"><strong>Cadastrar produto do XML</strong><div className="ev-link-new-grid">
       <label>Descrição *<input value={novoForm.descricao} onChange={e=>setNovoForm(v=>({...v,descricao:e.target.value}))}/></label>
       <label>Código de barras (EAN)<input value={novoForm.ean} onChange={e=>setNovoForm(v=>({...v,ean:e.target.value}))}/></label>
       <label>Unidade<input value={novoForm.unidade} onChange={e=>setNovoForm(v=>({...v,unidade:e.target.value}))}/></label>
       <label>Preço de custo (XML)<input type="number" min="0" step="0.01" value={novoForm.custo} onChange={e=>setNovoForm(v=>({...v,custo:e.target.value}))}/></label>
       <label>Código do fornecedor<input value={item.codigo} readOnly/></label></div>
       <small>O estoque será atualizado somente ao finalizar a entrada da NF-e.</small><div className="ev-link-new-actions"><button type="button" disabled={criando} onClick={()=>void criarProduto(item)}>{criando?"Cadastrando...":"Salvar e vincular"}</button><button type="button" disabled={criando} onClick={()=>setNovoItem(null)}>Cancelar</button></div>
      </div>}
      </td></tr>}
     </React.Fragment>;
   })}
  </tbody></table></div>}
  {erro&&<p className="ev-link-error" role="alert">{erro}</p>}{mensagem&&<p className="ev-link-ok" role="status">{mensagem}</p>}
  <p className="ev-link-hint">Clique na coluna Un. para selecionar a apresentação (ex.: CX12). A conversão será aplicada na próxima etapa. Clique em Alterar para corrigir o vínculo.</p>
  <style jsx>{`
   .ev-unit-select{min-width:88px;width:100%;padding:7px 5px;border:1px solid #c5d6ed;border-radius:7px;background:#fff;color:#10234b;font-size:12px;cursor:pointer}.ev-unit-xml{display:block;margin-top:4px;color:#64748b;font-size:10px;white-space:nowrap}.ev-link-section{margin:18px 0;padding:0;border:0;color:#10234b}.ev-link-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.ev-link-heading h3{font-size:19px;margin:0}.ev-count-ok,.ev-count-pending{padding:8px 12px;border-radius:24px;font-size:12px;font-weight:700}.ev-count-ok{background:#e5f7e9;color:#166b38}.ev-count-pending{background:#fff2d7;color:#986c10}.ev-link-table-wrap{overflow:auto;border:1px solid #d9e4f2;border-radius:10px}.ev-link-table{border-collapse:collapse;width:100%;min-width:1000px;font-size:12px}.ev-link-table th{background:#edf3fb;color:#1c3357;text-align:left;white-space:nowrap;padding:12px 9px}.ev-link-table td{border-top:1px solid #e2eaf4;padding:11px 9px;vertical-align:middle}.ev-link-description{min-width:240px;font-weight:600}.ev-num{text-align:right;white-space:nowrap}.ev-status-ok,.ev-status-pending{font-size:11px;white-space:nowrap;border-radius:20px;padding:6px 9px;font-weight:700}.ev-status-ok{color:#176b3d;background:#e1f5e7}.ev-status-pending{color:#9a6809;background:#fff1d3}.ev-edit-btn{background:white;border:1px solid #c5d6ed;border-radius:7px;color:#173866;cursor:pointer;padding:8px 9px;white-space:nowrap}.ev-editor-row td{background:#f5f8fd!important}.ev-link-editor{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.ev-link-editor label{display:flex;flex-direction:column;gap:6px;font-weight:700;flex:1;min-width:250px}.ev-link-editor select{border:1px solid #cbd8e8;border-radius:7px;padding:10px;background:white;width:100%}.ev-link-editor button,.ev-link-new-actions button{border:1px solid #cbd8e8;border-radius:7px;padding:10px 13px;font-weight:700;cursor:pointer}.ev-new-btn{background:#e7f5eb;color:#17633b}.ev-confirm-btn,.ev-link-new-actions button:first-child{background:#0b2454;color:white}.ev-link-editor button:disabled,.ev-link-new-actions button:disabled{opacity:.5;cursor:not-allowed}.ev-link-new-form{margin-top:12px;border:1px solid #cbd8e8;border-radius:8px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:12px}.ev-link-new-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ev-link-new-grid label{display:flex;flex-direction:column;gap:6px;font-weight:700}.ev-link-new-grid input{border:1px solid #cbd8e8;border-radius:7px;padding:10px;min-width:0}.ev-link-new-actions{display:flex;gap:9px}.ev-link-hint{font-size:12px;color:#60728a;margin:13px 0}.ev-link-error{color:#a32626;background:#fff0ee;padding:10px;border-radius:7px}.ev-link-ok{color:#166b38;font-size:12px}@media(max-width:650px){.ev-link-new-grid{grid-template-columns:1fr}}
  `}</style>
 </section>;
}

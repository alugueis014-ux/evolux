"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

type Variacao = { id: string; atributos: Record<string,string>; codigo_barras: string | null; preco_venda: number | null; estoque_atual: number; ativo: boolean };
type Atributo = { nome: string; valor: string };
export default function GradeProduto({empresaId, produtoId, precoPadrao}: {empresaId:string;produtoId:string;precoPadrao:number}) {
  const [variacoes,setVariacoes] = useState<Variacao[]>([]);
  const [atributos,setAtributos] = useState<Atributo[]>([{nome:"Cor",valor:""}]);
  const [codigo,setCodigo] = useState("");
  const [preco,setPreco] = useState("");
  const [estoque,setEstoque] = useState("0");
  const [erro,setErro] = useState("");
  const [carregando,setCarregando] = useState(false);
  const [salvando,setSalvando] = useState(false);
  const [editando,setEditando] = useState<string|null>(null);
  const [ativo,setAtivo] = useState(true);

  async function carregar() {
    if (!supabase) {setErro("Supabase não configurado.");return;}
    setCarregando(true);
    const {data,error} = await supabase.from("produto_variacoes").select("id,atributos,codigo_barras,preco_venda,estoque_atual,ativo")
      .eq("empresa_id",empresaId).eq("produto_id",produtoId).order("created_at",{ascending:true});
    setCarregando(false);
    if (error) {setErro("Não foi possível carregar a grade: "+error.message);return;}
    setVariacoes((data??[]) as Variacao[]);
  }
  useEffect(()=>{void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */},[empresaId,produtoId]);
  function limpar() {setEditando(null);setAtributos([{nome:"Cor",valor:""}]);setCodigo("");setPreco("");setEstoque("0");setAtivo(true);setErro("");}
  function editar(v:Variacao) {
    setEditando(v.id);setAtributos(Object.entries(v.atributos).map(([nome,valor])=>({nome,valor:String(valor)})));
    setCodigo(v.codigo_barras??"");setPreco(v.preco_venda===null?"":String(v.preco_venda));setEstoque(String(v.estoque_atual));setAtivo(v.ativo);setErro("");
  }
  async function salvar() {
    if (!supabase || salvando) return;
    const pares=atributos.map(a=>({nome:a.nome.trim(),valor:a.valor.trim()}));
    if (!pares.length || pares.some(a=>!a.nome || !a.valor)) {setErro("Preencha o nome e o valor de cada característica.");return;}
    const nomes=pares.map(a=>a.nome.toLocaleLowerCase("pt-BR"));
    if(new Set(nomes).size!==nomes.length){setErro("Não repita a mesma característica.");return;}
    const atributosObj=Object.fromEntries(pares.sort((a,b)=>a.nome.localeCompare(b.nome)).map(a=>[a.nome,a.valor]));
    if(variacoes.some(v=>v.id!==editando && JSON.stringify(Object.entries(v.atributos).sort())===JSON.stringify(Object.entries(atributosObj).sort()))) {
      setErro("Essa combinação já está cadastrada.");return;
    }
    if (!codigo.trim()) {setErro("O código de barras é obrigatório para cada variação.");return;}
    if (variacoes.some(v=>v.id!==editando && v.codigo_barras===codigo.trim())) {setErro("Código de barras já utilizado nesta grade.");return;}
    const quantidade = Number(estoque.replace(",","."));
    if (!estoque.trim() || !Number.isFinite(quantidade) || quantidade < 0 || Math.abs(quantidade*1000-Math.round(quantidade*1000))>0.00001) {
      setErro("Informe uma quantidade válida, com até três casas decimais.");return;
    }
    const valor=preco.trim()===""?null:Number(preco.replace(",","."));
    if(valor!==null && (!Number.isFinite(valor)||valor<0)){setErro("Informe um preço válido.");return;}
    setSalvando(true);setErro("");
    const campos={atributos:atributosObj,codigo_barras:codigo.trim(),preco_venda:valor,ativo};
    // Quantidade e dados da variação são gravados em uma transação no banco.
    const {error}=await supabase.rpc("evolux_salvar_variacao",{
      p_empresa_id:empresaId,p_produto_id:produtoId,p_variacao_id:editando,
      p_atributos:atributosObj,p_codigo_barras:codigo.trim(),
      p_preco_venda:valor,p_estoque:quantidade,p_ativo:ativo
    });
    setSalvando(false);
    if(error){setErro(error.code==="23505"?"Código de barras ou combinação já cadastrada.":error.message);return;}
    limpar();await carregar();
  }
  return <div className="ev-grade">
    <p className="ev-grade-info">Cadastre variações por cor, tamanho, modelo ou qualquer outro atributo. O código de barras é obrigatório. Sem preço próprio, vale o preço do produto principal. Cada variação tem quantidade independente; entradas por XML e saídas por PDV serão integradas futuramente.</p>
    <div className="ev-grade-list"><table><thead><tr><th>Variação</th><th>Código de barras</th><th>Preço</th><th>Estoque</th><th>Editar</th></tr></thead><tbody>
      {variacoes.map(v=><tr key={v.id}><td>{Object.entries(v.atributos).map(([n,x])=>`${n}: ${x}`).join(" · ")}{!v.ativo?" (Inativa)":""}</td><td>{v.codigo_barras||"—"}</td><td>{v.preco_venda===null?`Padrão: R$ ${precoPadrao.toFixed(2)}`:`R$ ${Number(v.preco_venda).toFixed(2)}`}</td><td>{v.estoque_atual}</td><td><button type="button" onClick={()=>editar(v)}>Editar</button></td></tr>)}
      {!carregando && !variacoes.length && <tr><td colSpan={5}>Nenhuma variação cadastrada.</td></tr>}
    </tbody></table></div>
    <strong>{editando?"Editar variação":"Adicionar variação"}</strong>
    {atributos.map((a,i)=><div className="ev-grade-attribute" key={i}>
      <input aria-label="Nome da característica" placeholder="Característica (ex.: Cor)" value={a.nome} onChange={e=>setAtributos(old=>old.map((x,j)=>j===i?{...x,nome:e.target.value}:x))}/>
      <input aria-label="Valor da característica" placeholder="Valor (ex.: Preta)" value={a.valor} onChange={e=>setAtributos(old=>old.map((x,j)=>j===i?{...x,valor:e.target.value}:x))}/>
      <button type="button" disabled={atributos.length===1} onClick={()=>setAtributos(old=>old.filter((_,j)=>j!==i))}>×</button>
    </div>)}
    <button type="button" onClick={()=>setAtributos(old=>[...old,{nome:"",valor:""}])}>+ Adicionar característica</button>
    <div className="ev-grade-attribute"><input aria-label="Código de barras da variação" placeholder="Código de barras *" required value={codigo} onChange={e=>setCodigo(e.target.value)}/><input aria-label="Preço da variação" placeholder="Preço próprio (opcional)" value={preco} onChange={e=>setPreco(e.target.value)}/></div>
    <div className="ev-grade-attribute"><label className="ev-grade-stock-label">Quantidade em estoque *<input type="number" min="0" step="0.001" value={estoque} onChange={e=>setEstoque(e.target.value)}/></label></div>
    <label className="ev-grade-active"><input type="checkbox" checked={ativo} onChange={e=>setAtivo(e.target.checked)}/> Variação ativa</label>
    {erro&&<p role="alert" className="ev-grade-error">{erro}</p>}
    <div className="ev-grade-buttons"><button type="button" disabled={salvando} onClick={()=>void salvar()}>{salvando?"Salvando...":editando?"Salvar variação":"Adicionar variação"}</button>{editando&&<button type="button" onClick={limpar}>Cancelar edição</button>}</div>
    <style jsx>{`
      .ev-grade{display:flex;flex-direction:column;gap:12px;font-size:13px;color:#203859}.ev-grade-info{background:#eff5fd;padding:12px;border-radius:8px;margin:0;line-height:1.5}.ev-grade-list{overflow:auto;max-height:180px;border:1px solid #dce5f0;border-radius:8px}.ev-grade-list table{width:100%;border-collapse:collapse;min-width:560px}.ev-grade-list th,.ev-grade-list td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left}.ev-grade-list th{background:#f2f6fc}.ev-grade-attribute{display:flex;gap:8px}.ev-grade-attribute input{min-width:0;flex:1;border:1px solid #cbd8e8;border-radius:7px;padding:10px}.ev-grade button{border:1px solid #cbd8e8;border-radius:7px;padding:8px 12px;background:white;color:#12305b;font-weight:600;cursor:pointer;align-self:flex-start}.ev-grade button:disabled{opacity:.5;cursor:not-allowed}.ev-grade-buttons{display:flex;gap:9px}.ev-grade-buttons button:first-child{background:#0b2454;color:white}.ev-grade-stock-label{display:flex;flex-direction:column;gap:6px;font-weight:600}.ev-grade-stock-label input{width:220px}.ev-grade-active{display:flex;align-items:center;gap:8px}.ev-grade-error{color:#a32626;margin:0}
    `}</style>
  </div>;
}

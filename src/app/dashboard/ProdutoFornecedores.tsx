"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;

type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null };
type Variacao = { id: string; atributos: Record<string,string> };
type Vinculo = { id: string; fornecedor_id: string; codigo_fornecedor: string; variacao_id: string | null };

export default function ProdutoFornecedores({ empresaId, produtoId }: { empresaId: string; produtoId: string }) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [variacaoId, setVariacaoId] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function carregar() {
    if (!db) { setErro("Supabase não configurado."); setCarregando(false); return; }
    setCarregando(true);
    const [f, v, l] = await Promise.all([
      db.from("fornecedores").select("id,razao_social,nome_fantasia,cnpj").eq("empresa_id",empresaId).order("razao_social").limit(1000),
      db.from("produto_variacoes").select("id,atributos").eq("empresa_id",empresaId).eq("produto_id",produtoId).limit(1000),
      db.from("produto_fornecedor_vinculos").select("id,fornecedor_id,codigo_fornecedor,variacao_id").eq("empresa_id",empresaId).eq("produto_id",produtoId).order("created_at",{ascending:false}).limit(1000)
    ]);
    if (f.error || v.error || l.error) setErro("Falha ao consultar vínculos: " + (f.error || v.error || l.error)?.message);
    else { setFornecedores(f.data ?? []); setVariacoes(v.data ?? []); setVinculos(l.data ?? []); setErro(""); }
    setCarregando(false);
  }
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId,produtoId]);
  function limpar() { setEditando(null); setFornecedorId(""); setCodigo(""); setVariacaoId(""); }
  function editar(v: Vinculo) { setEditando(v.id); setFornecedorId(v.fornecedor_id); setCodigo(v.codigo_fornecedor); setVariacaoId(v.variacao_id ?? ""); setErro(""); setMensagem(""); }
  async function salvar() {
    if (!db || salvando) return;
    const cod = codigo.trim();
    if (!fornecedorId || !cod) { setErro("Selecione o fornecedor e informe o código do produto na nota."); return; }
    const outro = vinculos.find(v => v.fornecedor_id === fornecedorId && v.codigo_fornecedor === cod && v.id !== editando);
    if (outro) { setErro("Esse código já está vinculado a este fornecedor para o produto. Edite o vínculo existente."); return; }
    setSalvando(true); setErro(""); setMensagem("");
    const { error } = await db.rpc("evolux_vincular_item_fornecedor", {
      p_empresa_id:empresaId, p_fornecedor_id:fornecedorId, p_codigo_fornecedor:cod,
      p_produto_id:produtoId, p_variacao_id:variacaoId || null
    });
    setSalvando(false);
    if (error) { setErro("Não foi possível salvar o vínculo: " + error.message); return; }
    limpar(); setMensagem("Fornecedor e código vinculados ao produto."); await carregar();
  }
  const nomeFornecedor = (id: string) => { const f=fornecedores.find(x=>x.id===id); return f ? (f.nome_fantasia || f.razao_social) : "Fornecedor não localizado"; };
  const nomeVariacao = (id: string | null) => {
    if (!id) return "Produto principal";
    const v=variacoes.find(x=>x.id===id);
    return v ? Object.entries(v.atributos ?? {}).map(([a,b])=>`${a}: ${b}`).join(" · ") : "Variação não localizada";
  };
  return <section className="ev-pf">
    <p className="ev-pf-intro">Vincule os códigos usados pelos fornecedores nas notas fiscais. A importação XML reconhecerá esses códigos automaticamente.</p>
    <h3>Fornecedores vinculados</h3>
    <div className="ev-pf-table"><table><thead><tr><th>Fornecedor</th><th>Código na nota</th><th>Destino</th><th>Ação</th></tr></thead><tbody>
      {vinculos.map(v=><tr key={v.id}><td>{nomeFornecedor(v.fornecedor_id)}</td><td>{v.codigo_fornecedor}</td><td>{nomeVariacao(v.variacao_id)}</td><td><button type="button" onClick={()=>editar(v)}>Editar</button></td></tr>)}
      {!carregando && !vinculos.length && <tr><td colSpan={4}>Nenhum fornecedor vinculado a este produto.</td></tr>}
    </tbody></table></div>
    <h3>{editando ? "Alterar vínculo" : "Adicionar fornecedor"}</h3>
    <div className="ev-pf-fields">
      <label>Fornecedor *<select value={fornecedorId} onChange={e=>setFornecedorId(e.target.value)} disabled={Boolean(editando)}><option value="">Selecione um fornecedor</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.razao_social}{f.cnpj ? ` — ${f.cnpj}` : ""}</option>)}</select></label>
      <label>Código do produto na nota *<input value={codigo} onChange={e=>setCodigo(e.target.value)} placeholder="Ex.: 246" maxLength={120} disabled={Boolean(editando)} /></label>
      {variacoes.length > 0 && <label>Destino do vínculo<select value={variacaoId} onChange={e=>setVariacaoId(e.target.value)}><option value="">Produto principal</option>{variacoes.map(v=><option key={v.id} value={v.id}>{nomeVariacao(v.id)}</option>)}</select></label>}
    </div>
    {editando && <p className="ev-pf-note">Na edição, é possível corrigir a variação de destino. Para evitar alterar a identidade de códigos já utilizados em notas, o fornecedor e o código ficam bloqueados.</p>}
    {erro && <p role="alert" className="ev-pf-error">{erro}</p>}
    {mensagem && <p role="status" className="ev-pf-ok">{mensagem}</p>}
    <div className="ev-pf-actions"><button type="button" className="ev-pf-save" disabled={salvando || carregando} onClick={()=>void salvar()}>{salvando ? "Salvando..." : editando ? "Salvar alteração" : "+ Adicionar fornecedor"}</button>{editando && <button type="button" onClick={limpar}>Cancelar edição</button>}</div>
    <style jsx>{`
      .ev-pf{display:flex;flex-direction:column;gap:13px;color:#203859;font-size:13px}.ev-pf-intro{margin:0;background:#eff5fd;border-radius:8px;padding:12px;line-height:1.5}.ev-pf h3{font-size:14px;margin:6px 0 0}.ev-pf-table{border:1px solid #dce5f0;border-radius:8px;overflow:auto;max-height:200px}.ev-pf-table table{width:100%;border-collapse:collapse;min-width:520px}.ev-pf-table th,.ev-pf-table td{padding:10px;text-align:left;border-bottom:1px solid #e5ebf3}.ev-pf-table th{background:#f1f5fb}.ev-pf-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.ev-pf-fields label{display:flex;flex-direction:column;gap:7px;font-weight:700;font-size:12px}.ev-pf-fields input,.ev-pf-fields select{width:100%;min-width:0;border:1px solid #cbd8e8;border-radius:8px;padding:11px;background:#fff;color:#10234b}.ev-pf button{border:1px solid #cbd8e8;background:#fff;color:#15325a;padding:9px 13px;border-radius:7px;font-weight:700;cursor:pointer}.ev-pf button:disabled{opacity:.5;cursor:not-allowed}.ev-pf-actions{display:flex;gap:9px}.ev-pf .ev-pf-save{background:#0b2454;color:#fff;border-color:#0b2454}.ev-pf-error{background:#fff0ee;color:#a32626;padding:10px;border-radius:7px}.ev-pf-ok{background:#eaf8ef;color:#17633b;padding:10px;border-radius:7px}.ev-pf-note{font-size:12px;color:#64748b;line-height:1.5;margin:0}@media(max-width:580px){.ev-pf-fields{grid-template-columns:1fr}}
    `}</style>
  </section>;
}

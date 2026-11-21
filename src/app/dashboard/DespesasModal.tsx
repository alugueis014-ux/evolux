"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Categoria = { id: string; nome: string; ativo: boolean; created_at: string };

export default function DespesasModal({ empresaId, onClose }: { empresaId: string; onClose: () => void }) {
  const [lista, setLista] = useState<Categoria[]>([]);
  const [pesquisa, setPesquisa] = useState("");
  const [mostrarInativas, setMostrarInativas] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [nome, setNome] = useState("");

  const carregar = useCallback(async () => {
    if (!empresaId) { setErro("Empresa não identificada."); setCarregando(false); return; }
    setCarregando(true);
    const { data, error } = await supabase.from("despesa_categorias")
      .select("id,nome,ativo,created_at").eq("empresa_id", empresaId).order("nome").limit(1000);
    setCarregando(false);
    if (error) { setErro("Não foi possível carregar as despesas. Verifique se o SQL foi executado e se você tem permissão. " + error.message); return; }
    setLista((data ?? []) as Categoria[]);
    setErro("");
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    function fecharTecla(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (salvando) return;
      if (formAberto) setFormAberto(false);
      else onClose();
    }
    window.addEventListener("keydown", fecharTecla, true);
    return () => window.removeEventListener("keydown", fecharTecla, true);
  }, [formAberto, salvando, onClose]);

  const filtradas = useMemo(() => lista.filter(item =>
    (mostrarInativas || item.ativo) && item.nome.toLocaleLowerCase("pt-BR").includes(pesquisa.trim().toLocaleLowerCase("pt-BR"))
  ), [lista, pesquisa, mostrarInativas]);

  function abrirFormulario(item: Categoria | null) {
    setEditando(item); setNome(item?.nome ?? ""); setErro(""); setFormAberto(true);
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (salvando || !empresaId) return;
    const valor = nome.trim().replace(/\s+/g, " ");
    if (valor.length < 2 || valor.length > 100) { setErro("Informe uma descrição entre 2 e 100 caracteres."); return; }
    setSalvando(true); setErro("");
    const resultado = editando
      ? await supabase.from("despesa_categorias").update({ nome: valor }).eq("id", editando.id).eq("empresa_id", empresaId)
      : await supabase.from("despesa_categorias").insert({ empresa_id: empresaId, nome: valor, ativo: true });
    setSalvando(false);
    if (resultado.error) {
      setErro(resultado.error.code === "23505" ? "Esta despesa já está cadastrada nesta empresa." : "Não foi possível salvar: " + resultado.error.message);
      return;
    }
    setFormAberto(false); setEditando(null); setNome(""); await carregar();
  }

  async function alternar(item: Categoria) {
    if (salvando) return;
    setSalvando(true); setErro("");
    const { error } = await supabase.from("despesa_categorias").update({ ativo: !item.ativo })
      .eq("empresa_id", empresaId).eq("id", item.id);
    setSalvando(false);
    if (error) { setErro("Não foi possível alterar a situação: " + error.message); return; }
    await carregar();
  }

  return <div className="ev-desp-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !formAberto && !salvando) onClose(); }}>
    <section className="ev-desp-window" role="dialog" aria-modal="true" aria-label="Cadastro de Despesas">
      <header className="ev-desp-head"><div><h2>Cadastro de Despesas</h2><p>Organize as categorias utilizadas nos lançamentos financeiros.</p></div><button type="button" onClick={onClose} aria-label="Fechar janela" disabled={salvando}>×</button></header>
      <div className="ev-desp-controls">
        <label>Pesquisar despesas<input autoFocus value={pesquisa} onChange={e => setPesquisa(e.target.value)} placeholder="Digite o nome da despesa" /></label>
        <label className="ev-desp-checkbox"><input type="checkbox" checked={mostrarInativas} onChange={e => setMostrarInativas(e.target.checked)} /> Mostrar inativas</label>
      </div>
      {erro && <p className="ev-desp-error" role="alert">{erro}</p>}
      <div className="ev-desp-table"><table><thead><tr><th>Descrição</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        {carregando ? <tr><td colSpan={3}>Carregando despesas...</td></tr> : filtradas.length === 0 ? <tr><td colSpan={3}>Nenhuma despesa encontrada.</td></tr> : filtradas.map(item => <tr key={item.id}><td>{item.nome}</td><td><span className={item.ativo ? "ev-desp-active" : "ev-desp-inactive"}>{item.ativo ? "Ativa" : "Inativa"}</span></td><td className="ev-desp-actions"><button type="button" onClick={() => abrirFormulario(item)} disabled={salvando}>Editar</button><button type="button" onClick={() => void alternar(item)} disabled={salvando}>{item.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}
      </tbody></table></div>
      <footer className="ev-desp-footer"><button type="button" onClick={() => abrirFormulario(null)} disabled={salvando || !empresaId}>+ Nova despesa</button><button type="button" className="primary" onClick={onClose} disabled={salvando}>Fechar</button></footer>
    </section>
    {formAberto && <div className="ev-desp-overlay ev-desp-nested"><section className="ev-desp-form-window" role="dialog" aria-modal="true" aria-label={editando ? "Editar Despesa" : "Nova Despesa"}>
      <header className="ev-desp-head"><div><h2>{editando ? "Editar Despesa" : "Nova Despesa"}</h2><p>Informe o nome da categoria.</p></div><button type="button" onClick={() => !salvando && setFormAberto(false)} disabled={salvando} aria-label="Fechar formulário">×</button></header>
      <form id="ev-desp-form" onSubmit={salvar}><label>Descrição da despesa *<input autoFocus required maxLength={100} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Aluguel" /></label>{erro && <p className="ev-desp-error" role="alert">{erro}</p>}</form>
      <footer className="ev-desp-footer"><button type="button" onClick={() => setFormAberto(false)} disabled={salvando}>Cancelar</button><button type="submit" form="ev-desp-form" className="primary" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button></footer>
    </section></div>}
    <style jsx global>{`
      .ev-desp-overlay{position:fixed;inset:0;z-index:2600;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:16px}
      .ev-desp-nested{z-index:2610}.ev-desp-window,.ev-desp-form-window{display:flex;flex-direction:column;width:min(900px,100%);max-height:calc(100dvh - 32px);height:min(670px,calc(100dvh - 32px));overflow:hidden;background:white;border-radius:16px;box-shadow:0 25px 75px #06152c66}
      .ev-desp-form-window{width:min(530px,100%);height:auto}
      .ev-desp-head{background:#0b2454;color:white;padding:19px 23px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .ev-desp-head h2{font-size:20px;font-weight:700;color:white;margin:0}.ev-desp-head p{font-size:12px;color:#dbe8fa;margin:7px 0 0}
      .ev-desp-head button{color:white;border:0;background:transparent;font-size:28px;cursor:pointer;width:35px;height:35px;border-radius:8px}
      .ev-desp-head button:hover{background:#ffffff22}.ev-desp-head button:disabled{opacity:.5}
      .ev-desp-controls{display:flex;align-items:end;gap:20px;padding:18px 22px}.ev-desp-controls label,.ev-desp-form-window label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;color:#344761}
      .ev-desp-controls label:first-child{flex:1}.ev-desp-controls input:not([type=checkbox]),.ev-desp-form-window input{border:1px solid #cbd8e8;border-radius:9px;padding:11px 12px;font-size:14px;color:#10234b;width:100%}
      .ev-desp-controls .ev-desp-checkbox{display:flex;flex-direction:row;align-items:center;gap:8px;padding-bottom:10px;white-space:nowrap}
      .ev-desp-table{margin:0 22px 16px;border:1px solid #dce5f0;border-radius:10px;overflow:auto;flex:1;min-height:0}
      .ev-desp-table table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.ev-desp-table th{background:#eef3fb;color:#1c3658;padding:12px;position:sticky;top:0}.ev-desp-table td{border-top:1px solid #e8edf5;padding:12px;color:#263b55}
      .ev-desp-actions{white-space:nowrap;text-align:right}.ev-desp-actions button{border:1px solid #cbd8e8;background:white;color:#0b2454;padding:7px 10px;border-radius:7px;cursor:pointer;margin-left:7px;font-weight:600}
      .ev-desp-active{color:#17643a;font-weight:700}.ev-desp-inactive{color:#7b8796;font-weight:700}
      .ev-desp-footer{border-top:1px solid #dce5f0;display:flex;justify-content:space-between;padding:15px 22px;gap:12px}.ev-desp-footer button{border:1px solid #cbd8e8;background:white;color:#0b2454;padding:10px 17px;border-radius:8px;font-weight:700;cursor:pointer}.ev-desp-footer button.primary{background:#0b2454;color:white;border-color:#0b2454}.ev-desp-footer button:disabled,.ev-desp-actions button:disabled{opacity:.5;cursor:not-allowed}
      .ev-desp-error{background:#fff1ef;color:#a02b22;border-radius:8px;padding:11px;margin:0 22px 12px;font-size:13px}
      .ev-desp-form-window form{padding:24px 22px}.ev-desp-form-window .ev-desp-error{margin:12px 0 0}
      @media(max-width:580px){.ev-desp-controls{flex-direction:column;align-items:stretch;gap:10px}.ev-desp-controls .ev-desp-checkbox{padding:0}.ev-desp-table{margin:0 12px 12px}.ev-desp-actions button{margin:2px}.ev-desp-head,.ev-desp-footer{padding:15px}}
    `}</style>
  </div>;
}

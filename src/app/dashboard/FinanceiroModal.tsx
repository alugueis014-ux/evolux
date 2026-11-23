"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fechamento = { id: string; caixa_turno_id: string; vendas_dinheiro: number; vendas_pix: number; vendas_cartao: number; diferenca: number; turno_numero: number; fechado_em: string };
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!) : null;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (n: unknown) => Number(n) || 0;
const diaLocal = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export default function FinanceiroModal({ onClose }: { onClose: () => void }) {
  const [mes, setMes] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()));
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!supabase) { setErro("Conexão Supabase indisponível."); return; }
      setCarregando(true); setErro(""); setDetalhe(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão expirada. Faça login novamente.");
        const res = await fetch(`/api/financeiro?mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Não foi possível consultar o Livro-Caixa.");
        if (ativo) setFechamentos(json.fechamentos || []);
      } catch (e) { if (ativo) { setFechamentos([]); setErro(e instanceof Error ? e.message : "Falha na consulta."); } }
      finally { if (ativo) setCarregando(false); }
    }
    void carregar(); return () => { ativo = false; };
  }, [mes]);
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") { if (detalhe) setDetalhe(null); else onClose(); } };
    window.addEventListener("keydown", fechar); return () => window.removeEventListener("keydown", fechar);
  }, [detalhe, onClose]);
  const linhas = useMemo(() => {
    const mapa = new Map<string, Fechamento[]>();
    for (const f of fechamentos) { const dia = diaLocal(f.fechado_em); mapa.set(dia, [...(mapa.get(dia) || []), f]); }
    return [...mapa].sort(([a], [b]) => a.localeCompare(b)).map(([dia, turnos]) => ({
      dia, turnos, dinheiro: turnos.reduce((a, f) => a + numero(f.vendas_dinheiro), 0),
      pix: turnos.reduce((a, f) => a + numero(f.vendas_pix), 0),
      cartao: turnos.reduce((a, f) => a + numero(f.vendas_cartao), 0),
      diferenca: turnos.reduce((a, f) => a + numero(f.diferenca), 0),
    }));
  }, [fechamentos]);
  const totais = linhas.reduce((a, x) => ({ dinheiro: a.dinheiro + x.dinheiro, pix: a.pix + x.pix, cartao: a.cartao + x.cartao, diferenca: a.diferenca + x.diferenca }), { dinheiro: 0, pix: 0, cartao: 0, diferenca: 0 });
  const selecionado = linhas.find(x => x.dia === detalhe);
  return <div className="ev-fin-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="ev-fin-modal" role="dialog" aria-modal="true" aria-label="Financeiro">
      <header className="ev-fin-head"><div><h2>Financeiro</h2><p>Livro-Caixa mensal • fechamentos de caixa aprovados</p></div><button onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="ev-fin-tabs"><strong>Livro-Caixa</strong>{["Contas a Pagar", "Contas a Receber", "Despesas", "Fluxo de Caixa"].map(x => <span key={x} title="Disponível nas próximas etapas">{x}</span>)}</div>
      <div className="ev-fin-controls"><label>Mês de referência <input type="month" value={mes} onChange={e => setMes(e.target.value)} /></label><button onClick={() => window.print()}>Imprimir</button></div>
      <div className="ev-fin-summary"><div><small>Vendas em fechamentos aprovados</small><strong>{brl(totais.dinheiro + totais.pix + totais.cartao)}</strong></div><div><small>Dinheiro</small><strong>{brl(totais.dinheiro)}</strong></div><div><small>PIX + Cartões</small><strong>{brl(totais.pix + totais.cartao)}</strong></div></div>
      <p className="ev-fin-note">Valores de vendas por data de fechamento. PIX e cartões não significam necessariamente valores já liquidados no banco. Despesas pagas e resultado líquido serão integrados na próxima etapa; não são considerados nos totais desta versão.</p>
      {erro && <div className="ev-fin-error" role="alert">{erro}</div>}
      <div className="ev-fin-table"><table><thead><tr><th>Data</th><th>Dinheiro</th><th>PIX / Cartões</th><th>Total (Vendas)</th><th>Despesas</th><th>Resultado (Dia)</th><th>Ações</th></tr></thead><tbody>
        {carregando ? <tr><td colSpan={7}>Consultando fechamentos...</td></tr> : linhas.length === 0 ? <tr><td colSpan={7}>Nenhum fechamento aprovado encontrado neste mês.</td></tr> : linhas.map(x => <tr key={x.dia}><td>{x.dia.split("-").reverse().join("/")}</td><td>{brl(x.dinheiro)}</td><td>{brl(x.pix + x.cartao)}</td><td><b>{brl(x.dinheiro + x.pix + x.cartao)}</b></td><td>—</td><td>—</td><td><button onClick={() => setDetalhe(x.dia)} aria-label={`Ver turnos de ${x.dia}`}>Ver</button></td></tr>)}
      </tbody></table></div>
      <footer className="ev-fin-footer"><span>{fechamentos.length} fechamento(s) aprovado(s) no período</span><button onClick={onClose}>Fechar</button></footer>
      {selecionado && <div className="ev-fin-detail-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDetalhe(null); }}><section className="ev-fin-detail" role="dialog" aria-modal="true" aria-label="Detalhes do dia"><header><h3>Fechamentos de {selecionado.dia.split("-").reverse().join("/")}</h3><button onClick={() => setDetalhe(null)} aria-label="Fechar detalhes">×</button></header><div className="ev-fin-detail-body">{selecionado.turnos.map(t => <article key={t.id}><b>Turno #{t.turno_numero}</b><span>Dinheiro: {brl(numero(t.vendas_dinheiro))}</span><span>PIX: {brl(numero(t.vendas_pix))}</span><span>Cartões: {brl(numero(t.vendas_cartao))}</span><span>Diferença de caixa: {brl(numero(t.diferenca))}</span></article>)}</div><footer><button onClick={() => setDetalhe(null)}>Fechar</button></footer></section></div>}
    </section>
    <style jsx global>{`
      .ev-fin-overlay{position:fixed;inset:0;z-index:2700;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:16px}.ev-fin-modal{width:min(1160px,100%);height:min(780px,calc(100dvh - 32px));display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:16px;box-shadow:0 24px 75px #06152c55;color:#152b4a}.ev-fin-head{background:#0b2454;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:19px 24px}.ev-fin-head h2{font-size:21px;color:#fff;margin:0}.ev-fin-head p{font-size:12px;color:#dce7fa;margin:6px 0 0}.ev-fin-head button,.ev-fin-detail header button{background:transparent;color:#fff;border:0;font-size:28px;cursor:pointer}.ev-fin-tabs{display:flex;gap:8px;overflow-x:auto;padding:12px 20px;border-bottom:1px solid #e1e9f4;white-space:nowrap}.ev-fin-tabs strong,.ev-fin-tabs span{padding:9px 12px;border-radius:8px;font-size:12px}.ev-fin-tabs strong{background:#0b2454;color:white}.ev-fin-tabs span{background:#f0f4fa;color:#8190a4}.ev-fin-controls{display:flex;justify-content:space-between;align-items:end;gap:12px;padding:14px 22px}.ev-fin-controls label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700}.ev-fin-controls input{padding:8px;border:1px solid #cbd8e8;border-radius:8px}.ev-fin-controls button,.ev-fin-footer button,.ev-fin-table button,.ev-fin-detail footer button{background:#0b2454;color:white;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:700}.ev-fin-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 22px 12px}.ev-fin-summary div{border:1px solid #dce5f0;border-radius:10px;padding:13px;background:#f6f9fe;display:flex;flex-direction:column;gap:6px}.ev-fin-summary small{color:#667b94;font-size:11px}.ev-fin-summary strong{font-size:20px;color:#0b2454}.ev-fin-note{font-size:11px;line-height:1.5;color:#5c6f85;margin:0 22px 12px}.ev-fin-error{background:#fff0ee;color:#9d2b20;padding:12px;margin:0 22px 10px;border-radius:8px}.ev-fin-table{overflow:auto;flex:1;min-height:0;margin:0 22px 12px;border:1px solid #dce5f0;border-radius:9px}.ev-fin-table table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}.ev-fin-table th{position:sticky;top:0;background:#eef3fb;color:#263b5b;text-align:right;padding:12px}.ev-fin-table th:first-child,.ev-fin-table td:first-child{text-align:left}.ev-fin-table td{border-top:1px solid #e4ebf4;text-align:right;padding:10px 12px}.ev-fin-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-top:1px solid #e4ebf4;font-size:12px;color:#667b94}.ev-fin-detail-overlay{position:absolute;inset:0;z-index:1;background:#06152ca8;display:flex;align-items:center;justify-content:center;padding:20px}.ev-fin-detail{width:min(580px,100%);max-height:80vh;overflow:hidden;display:flex;flex-direction:column;background:#fff;border-radius:14px}.ev-fin-detail header{background:#0b2454;color:white;display:flex;align-items:center;justify-content:space-between;padding:15px 20px}.ev-fin-detail h3{margin:0;font-size:17px}.ev-fin-detail-body{padding:18px;overflow:auto;display:grid;gap:12px}.ev-fin-detail article{background:#f5f8fc;border:1px solid #dce5f0;border-radius:10px;padding:12px;display:grid;gap:6px;font-size:13px}.ev-fin-detail footer{padding:12px 18px;text-align:right}@media(max-width:680px){.ev-fin-summary{grid-template-columns:1fr}.ev-fin-modal{height:calc(100dvh - 16px)}.ev-fin-head{padding:15px}}
      @media print{body *{visibility:hidden!important}.ev-fin-modal,.ev-fin-modal *{visibility:visible!important}.ev-fin-modal{position:fixed;inset:0;width:100%;height:auto;overflow:visible;box-shadow:none}.ev-fin-overlay{background:white;padding:0}.ev-fin-controls button,.ev-fin-footer button,.ev-fin-table button,.ev-fin-detail-overlay{display:none!important}}
    `}</style>
  </div>;
}

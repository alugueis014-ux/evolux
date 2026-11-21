"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FornecedoresModal from "./FornecedoresModal";
import ImportarXmlModal from "./ImportarXmlModal";
import NotasEntradaModal from "./NotasEntradaModal";
import ClientesModal from "./ClientesModal";
import DespesasModal from "./DespesasModal";
import UsuariosModal from "./UsuariosModal";
import CaixaGestao from "./caixa/page";
import CompletarCadastro from "../completar-cadastro/page";
import GradeProduto from "./GradeProduto";
import ProdutoFornecedores from "./ProdutoFornecedores";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

type Produto = { id: string; codigo: number; codigo_barras: string | null; descricao: string; preco_custo: number; preco_venda: number; estoque_atual: number; ativo: boolean };
type ProdutoForm = { descricao: string; codigo_barras: string; unidade: string; preco_custo: string; preco_venda: string; ativo: boolean; estoque_atual: string };
type Movimento = { id: string; tipo: "entrada" | "saida"; quantidade: number; custo_unitario: number | null; numero_nota: string | null; motivo: string | null; created_at: string };
const formInicial: ProdutoForm = { descricao:"", codigo_barras:"", unidade:"UN", preco_custo:"0", preco_venda:"0", ativo:true, estoque_atual:"0" };
const moeda = (n: number) => Number(n).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

type IconName = "box" | "users" | "layers" | "cart" | "cash" | "wallet" | "truck" | "file" | "cloud" | "logout" | "home" | "bell";
function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    box: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1h-3"/></>,
    layers: <><path d="m3 9 9-5 9 5-9 5-9-5ZM3 14l9 5 9-5M3 19l9 4 9-4"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h3l3 13h12l2-9H6"/></>,
    cash: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V4h10v3M3 11h18"/><circle cx="12" cy="15" r="2"/></>,
    wallet: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M6 6V4h12"/><circle cx="16" cy="15" r="1"/></>,
    truck: <><path d="M2 6h12v11H2zM14 10h4l4 4v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    file: <><path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/></>,
    cloud: <><path d="M7 18H6a4 4 0 0 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 0 9h-1M12 11v10m-4-4 4 4 4-4"/></>,
    logout: <><path d="M10 4H4v16h6M14 8l5 4-5 4M8 12h11"/></>,
    home: <><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const menu: { label: string; icon: IconName; detail: string }[] = [
  { label: "Produtos", icon: "box", detail: "Cadastro de produtos" },
  { label: "Clientes", icon: "users", detail: "Cadastro de clientes" },
  { label: "Vender (PDV)", icon: "cart", detail: "Frente de caixa" },
  { label: "Caixa", icon: "cash", detail: "Abertura e fechamento" },
  { label: "Financeiro", icon: "wallet", detail: "Gestão financeira" },
  { label: "Compras", icon: "truck", detail: "Compras e fornecedores" },
  { label: "Notas Fiscais", icon: "file", detail: "Documentos fiscais" },
  { label: "Backup", icon: "cloud", detail: "Cópias de segurança" },
];

export default function Dashboard() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [pendente, setPendente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aba, setAba] = useState("Cadastros");
  const [cadastrosMenuAberto, setCadastrosMenuAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [produtosAberto, setProdutosAberto] = useState(false);
  const [clientesAberto,setClientesAberto] = useState(false);
  const [caixaAberto,setCaixaAberto] = useState(false);
  const [empresaAberta,setEmpresaAberta] = useState(false);
  const [fornecedoresAberto, setFornecedoresAberto] = useState(false);
  const [despesasAberto, setDespesasAberto] = useState(false);
  const [usuariosAberto, setUsuariosAberto] = useState(false);
  const [importacaoXmlAberta, setImportacaoXmlAberta] = useState(false);
  const [notasEntradaAbertas, setNotasEntradaAbertas] = useState(false);
  const [menuNotasAberto,setMenuNotasAberto]=useState(false);
  const [pesquisaProduto, setPesquisaProduto] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [erroProdutos, setErroProdutos] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [salvandoProduto, setSalvandoProduto] = useState(false);
  const [formErro, setFormErro] = useState("");
  const [formProduto, setFormProduto] = useState<ProdutoForm>({ ...formInicial });
  const [selecionado, setSelecionado] = useState<Produto | null>(null);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [abaHistorico, setAbaHistorico] = useState<"entrada" | "saida">("entrada");
  const [movErro, setMovErro] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [abaProduto, setAbaProduto] = useState<"dados" | "grade" | "fornecedores">("dados");

  // Apenas um cadastro principal por vez; preserva sub-janelas do cadastro ativo.
  function abrirJanela(tipo: "produtos"|"clientes"|"fornecedores"|"empresa"|"caixa"|"notas"|"xml"|"entradas"|"despesas"|"usuarios") {
    if (cadastroAberto || historicoAberto) {
      if (!window.confirm("Existe uma janela de produto em edição ou consulta. Deseja fechá-la para abrir outra função? Alterações não salvas poderão ser perdidas.")) return;
    }
    setCadastrosMenuAberto(false);
    setAviso("");
    setProdutosAberto(false);
    setClientesAberto(false);
    setFornecedoresAberto(false);
    setDespesasAberto(false);
    setUsuariosAberto(false);
    setEmpresaAberta(false);
    setCaixaAberto(false);
    setMenuNotasAberto(false);
    setImportacaoXmlAberta(false);
    setNotasEntradaAbertas(false);
    setCadastroAberto(false);
    setHistoricoAberto(false);
    if (tipo === "produtos") { setPesquisaProduto(""); setProdutosAberto(true); }
    else if (tipo === "clientes") setClientesAberto(true);
    else if (tipo === "fornecedores") setFornecedoresAberto(true);
    else if (tipo === "despesas") setDespesasAberto(true);
    else if (tipo === "usuarios") setUsuariosAberto(true);
    else if (tipo === "empresa") setEmpresaAberta(true);
    else if (tipo === "caixa") setCaixaAberto(true);
    else if (tipo === "notas") setMenuNotasAberto(true);
    else if (tipo === "xml") setImportacaoXmlAberta(true);
    else if (tipo === "entradas") setNotasEntradaAbertas(true);
  }
  function abrirCadastroMenu(acao: string) {
    if (acao === "produtos" || acao === "clientes" || acao === "fornecedores" || acao === "empresa" || acao === "despesas" || acao === "usuarios") abrirJanela(acao);
    else { setCadastrosMenuAberto(false); setAviso(acao === "pagamentos" ? "Cadastro de formas de pagamento: funcionalidade ainda em desenvolvimento." : "Cadastro de administradores e vendedores: funcionalidade ainda em desenvolvimento."); }
  }

  useEffect(() => {
    if (!cadastrosMenuAberto) return;
    const click = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ev-cadastros-anchor")) setCadastrosMenuAberto(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setCadastrosMenuAberto(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [cadastrosMenuAberto]);

  // Atalhos do painel: F2 Venda, F3 Caixa, F4 Financeiro,
  // F5 Compras, F6 Notas Fiscais, F7 Backup.
  // Não interceptar teclas quando houver janelas abertas ou campos em edição.
  useEffect(() => {
    function atalhosPainel(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (empresaAberta || cadastrosMenuAberto || produtosAberto || clientesAberto || fornecedoresAberto || despesasAberto || usuariosAberto || importacaoXmlAberta ||
          notasEntradaAbertas || menuNotasAberto || cadastroAberto || historicoAberto || caixaAberto) return;
      const alvo = event.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return;
      const destinos: Record<string, string> = { F2: "/pdv" };
      if (destinos[event.key]) {
        event.preventDefault();
        window.location.assign(destinos[event.key]);
      } else if (event.key === "F3") {
        event.preventDefault(); abrirJanela("caixa");
      } else if (event.key === "F4" || event.key === "F7") {
        event.preventDefault();
        setAviso(`${event.key === "F4" ? "Financeiro" : "Backup"}: módulo ainda em desenvolvimento. Nenhum dado foi alterado.`);
      } else if (event.key === "F5") {
        event.preventDefault(); abrirJanela("fornecedores");
      } else if (event.key === "F6") {
        event.preventDefault(); abrirJanela("notas");
      }
    }
    window.addEventListener("keydown", atalhosPainel);
    return () => window.removeEventListener("keydown", atalhosPainel);
  }, [empresaAberta, cadastrosMenuAberto, produtosAberto, clientesAberto, fornecedoresAberto, despesasAberto, importacaoXmlAberta,
      notasEntradaAbertas, menuNotasAberto, cadastroAberto, historicoAberto, caixaAberto]);

  useEffect(()=>{
    if(!caixaAberto)return;
    const onEsc=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setCaixaAberto(false)}};
    window.addEventListener("keydown",onEsc);
    return ()=>window.removeEventListener("keydown",onEsc);
  },[caixaAberto]);

  // F3: Gestão de Caixa em janela sobre o painel, sem trocar de rota.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if(event.key!=="F3"||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
      if(produtosAberto||clientesAberto||fornecedoresAberto||importacaoXmlAberta||notasEntradaAbertas||menuNotasAberto||cadastroAberto||historicoAberto||caixaAberto)return;
      if((event.target as HTMLElement|null)?.closest("input, textarea, select, [contenteditable='true']"))return;
      event.preventDefault();setCaixaAberto(true);setAviso("");
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[produtosAberto,clientesAberto,fornecedoresAberto,importacaoXmlAberta,notasEntradaAbertas,menuNotasAberto,cadastroAberto,historicoAberto,caixaAberto]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!supabase) { setErro("Conexão não configurada."); setLoading(false); return; }
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!ativo) return;
      if (error || !user) { window.location.replace("/"); return; }
      // Verificacao de navegacao: autorizacao efetiva exige regras no servidor e RLS.
      if (sessionStorage.getItem("evolux_funcionario_validado") !== user.id) {
        window.location.replace("/selecionar-usuario");
        return;
      }
      const {data: acesso}=await supabase.from("empresa_usuarios").select("papel").eq("usuario_id",user.id).limit(1).maybeSingle();
      if(acesso?.papel!=="administrador") {window.location.replace("/pdv");return;}
      const {data: perfil}=await supabase.from("evolux_usuarios_acesso").select("ativo").eq("usuario_id",user.id).maybeSingle();
      if(perfil?.ativo===false){await supabase.auth.signOut();window.location.replace("/");return;}
      setUsuario(String(user.user_metadata?.nome || user.email || "Usuário"));
      const { data: vinculos, error: ve } = await supabase.from("empresa_usuarios").select("empresa_id").eq("usuario_id", user.id).limit(1);
      if (!ativo) return;
      if (ve || !vinculos?.length) { setErro("Nenhuma empresa vinculada."); setLoading(false); return; }
      const { data: empresa, error: ee } = await supabase.from("empresas").select("razao_social,nome_fantasia,cep,logradouro,numero,bairro,cidade,uf").eq("id", vinculos[0].empresa_id).single();
      if (!ativo) return;
      if (ee || !empresa) { setErro("Não foi possível carregar a empresa."); setLoading(false); return; }
      setEmpresaId(vinculos[0].empresa_id);
      setNome(empresa.nome_fantasia || empresa.razao_social);
      setPendente(![empresa.nome_fantasia, empresa.cep, empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.uf].every(Boolean));
      setLoading(false);
    }
    void carregar();
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!produtosAberto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (cadastroAberto && !salvandoProduto) setCadastroAberto(false);
        else if (historicoAberto) setHistoricoAberto(false);
        else if (!cadastroAberto && !historicoAberto) setProdutosAberto(false);
      }
      if (event.key === "F2" && !cadastroAberto && !historicoAberto && empresaId) {
        event.preventDefault(); abrirNovo();
      }
      if (event.key === "F4" && !cadastroAberto && !historicoAberto && selecionado && !apagando) {
        event.preventDefault(); abrirEdicao();
      }
      if (event.key === "Delete" && !cadastroAberto && !historicoAberto && selecionado && !apagando) {
        const alvo = event.target as HTMLElement | null;
        if (alvo?.closest("input,textarea,select,[contenteditable='true']")) return;
        event.preventDefault(); void apagarProduto();
      }
      if (event.key === "F12" && cadastroAberto && abaProduto === "dados" && !salvandoProduto) {
        event.preventDefault(); document.getElementById("ev-save-product-submit")?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [produtosAberto, cadastroAberto, historicoAberto, empresaId, salvandoProduto, selecionado, apagando, abaProduto]);

  function abrirNovo() {
    setAbaProduto("dados"); setEditandoId(null); setFormProduto({ ...formInicial }); setFormErro(""); setCadastroAberto(true);
  }

  function abrirEdicao(produto?: Produto) {
    const alvo = produto ?? selecionado;
    if (!alvo) return;
    setSelecionado(alvo);
    setAbaProduto("dados"); setEditandoId(alvo.id);
    setFormProduto({ descricao: alvo.descricao, codigo_barras: alvo.codigo_barras ?? "", unidade: "UN", preco_custo: String(alvo.preco_custo), preco_venda: String(alvo.preco_venda), ativo: alvo.ativo, estoque_atual: String(alvo.estoque_atual) });
    setFormErro(""); setCadastroAberto(true);
  }

  async function apagarProduto() {
    if (!supabase || !empresaId || !selecionado || apagando) return;
    const alvo = selecionado;
    if (!window.confirm(`Deseja apagar o produto ${alvo.codigo} — ${alvo.descricao}?\n\nProdutos com histórico não serão excluídos; serão desativados.`)) return;
    setApagando(true); setErroProdutos("");
    const { count, error: consultaErro } = await supabase.from("produto_movimentacoes")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("produto_id", alvo.id);
    if (consultaErro || count === null) {
      setErroProdutos("Não foi possível verificar o histórico. Nenhum produto foi apagado."); setApagando(false); return;
    }
    if (count > 0) {
      const { data, error } = await supabase.from("produtos").update({ ativo: false })
        .eq("empresa_id", empresaId).eq("id", alvo.id).select("id");
      if (error || !data?.length) setErroProdutos("Não foi possível desativar o produto. Verifique suas permissões.");
      else { setSelecionado(null); await carregarProdutos(); window.alert("Produto com histórico desativado para preservar as movimentações."); }
    } else {
      const { data, error } = await supabase.from("produtos").delete()
        .eq("empresa_id", empresaId).eq("id", alvo.id).select("id");
      if (error || !data?.length) setErroProdutos("Não foi possível apagar o produto. Confira a permissão de exclusão no Supabase.");
      else { setSelecionado(null); await carregarProdutos(); }
    }
    setApagando(false);
  }

  async function abrirHistorico(produto: Produto) {
    setSelecionado(produto); setMovErro(""); setHistoricoAberto(true);
    setAbaHistorico("entrada");
    await carregarMovimentos(produto.id);
  }
  async function carregarMovimentos(produtoId: string) {
    if (!supabase || !empresaId) return;
    const {data,error} = await supabase.from("produto_movimentacoes")
      .select("id,tipo,quantidade,custo_unitario,numero_nota,motivo,created_at")
      .eq("empresa_id",empresaId).eq("produto_id",produtoId)
      .order("created_at",{ascending:false}).limit(500);
    if (error) {setMovErro("Não foi possível carregar o histórico: " + error.message); return;}
    setMovimentos((data ?? []) as Movimento[]);
  }
  async function carregarProdutos() {
    if (!supabase || !empresaId) return;
    setCarregandoProdutos(true);
    setErroProdutos("");
    const { data, error } = await supabase.from("produtos")
      .select("id,codigo,codigo_barras,descricao,preco_custo,preco_venda,estoque_atual,ativo")
      .eq("empresa_id", empresaId).order("codigo", { ascending: false }).limit(500);
    if (error) setErroProdutos(`Não foi possível carregar os produtos: ${error.message}`);
    else setProdutos((data ?? []) as Produto[]);
    setCarregandoProdutos(false);
  }

  useEffect(() => {
    if (produtosAberto && empresaId) void carregarProdutos();
  // Atualiza ao abrir a janela ou ao identificar a empresa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosAberto, empresaId]);

  async function salvarProduto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !empresaId || salvandoProduto) return;
    const descricao = formProduto.descricao.trim();
    if (!descricao) { setFormErro("Informe a descrição do produto."); return; }
    const numero = (valor: string) => Number(valor.replace(",", "."));
    const custo = numero(formProduto.preco_custo);
    const venda = numero(formProduto.preco_venda);

    if ([custo, venda].some(n => !Number.isFinite(n)) || custo < 0 || venda < 0) {
      setFormErro("Confira os valores: custo e venda não podem ser negativos."); return;
    }
    const estoqueNovo = numero(formProduto.estoque_atual);
    if (editandoId && (!Number.isFinite(estoqueNovo) || estoqueNovo < 0 || Math.round(estoqueNovo * 1000) !== estoqueNovo * 1000)) {
      setFormErro("Informe um estoque válido, não negativo, com até três casas decimais."); return;
    }
    setSalvandoProduto(true);
    setFormErro("");
    const campos = { descricao, codigo_barras: formProduto.codigo_barras.trim() || null,
      unidade: formProduto.unidade, preco_venda: venda, ativo: formProduto.ativo };
    const { error } = editandoId
      ? await supabase.from("produtos").update(campos).eq("empresa_id", empresaId).eq("id", editandoId)
      : await supabase.from("produtos").insert({ ...campos, empresa_id: empresaId,
          preco_custo: custo, estoque_atual: 0, estoque_minimo: 0 });
    if (error) {
      setSalvandoProduto(false);
      setFormErro(error.code === "23505" ? "Este código de barras já está cadastrado nesta empresa." : `Não foi possível salvar: ${error.message}`);
      return;
    }
    if (editandoId) {
      const anterior = produtos.find(p => p.id === editandoId);
      if (anterior && Math.abs(Number(anterior.estoque_atual) - estoqueNovo) > 0.000001) {
        const { error: ajusteErro } = await supabase.rpc("evolux_ajustar_estoque_produto", {
          p_produto_id: editandoId, p_novo_estoque: estoqueNovo
        });
        if (ajusteErro) {
          setSalvandoProduto(false);
          setFormErro(`Os dados comerciais foram salvos, mas o estoque não foi ajustado: ${ajusteErro.message}. Verifique o SQL da Etapa 16.`);
          await carregarProdutos();
          return;
        }
      }
    }
    setSalvandoProduto(false);
    setCadastroAberto(false); setEditandoId(null); setSelecionado(null);
    setFormProduto({ ...formInicial });
    await carregarProdutos();
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    const { error } = await supabase?.auth.signOut() ?? { error: new Error("Conexão indisponível") };
    if (error) { setAviso("Não foi possível encerrar a sessão. Tente novamente."); setSaindo(false); return; }
    window.location.replace("/");
  }

  return <main className="ev-dashboard">
    <header className="ev-header">
      <div className="ev-header-inner">
        <div className="ev-brand"><img src="/evolux-logo.svg" alt="" width="39" height="39"/><strong>EVOLU<span>X</span></strong><i/><span className="ev-brand-sub">Gestão Empresarial</span></div>
        <div className="ev-company" title={nome || "Empresa"}><Icon name="home" size={20}/><span>{loading ? "Carregando empresa..." : nome || "Empresa"}</span></div>
        <div className="ev-user"><Icon name="users" size={20}/><span>{usuario || "Usuário"}<small>Conta autenticada</small></span></div>
        <button className="ev-top-exit" type="button" onClick={sair} disabled={saindo}><Icon name="logout" size={19}/>{saindo ? "Saindo..." : "Sair"}</button>
      </div>
    </header>
    <nav className="ev-tabs" aria-label="Menu superior">
      <div className="ev-cadastros-anchor">
        <button type="button" className={aba==="Cadastros"?"active":""} aria-expanded={cadastrosMenuAberto} aria-haspopup="menu" onClick={()=>{setAba("Cadastros");setAviso("");setCadastrosMenuAberto(v=>!v)}}>Cadastros <span aria-hidden="true">▾</span></button>
        {cadastrosMenuAberto&&<div className="ev-cadastros-menu" role="menu" aria-label="Cadastros">
          {([["usuarios","Cadastro de administradores e vendedores","♧"],["clientes","Cadastro de clientes","♙"],["despesas","Cadastro de Despesas","▤"],["fornecedores","Cadastro de fornecedores","▤"],["pagamentos","Cadastro de formas de pagamento","▦"],["empresa","Cadastro de informações da empresa","⌂"],["produtos","Cadastro de produtos","▣"]] as const).map(([acao,titulo,icone])=><button key={acao} type="button" role="menuitem" onClick={()=>abrirCadastroMenu(acao)}><span className="ev-cadastros-icone" aria-hidden="true">{icone}</span><span>{titulo}</span>{(acao==="pagamentos")&&<small>Em desenvolvimento</small>}</button>)}
        </div>}
      </div>
      {["Lançamentos", "Relatórios", "Gráficos", "Utilitários", "Ajuda"].map(item => <button type="button" key={item} className={aba === item ? "active" : ""} onClick={() => { setCadastrosMenuAberto(false);setAba(item);setAviso(`A seção ${item} será implementada em uma próxima etapa.`); }}>{item}</button>)}
    </nav>
    <div className="ev-toolbar" role="navigation" aria-label="Acesso rápido">
      <div className="ev-toolbar-scroll">
        {menu.map(item => <button type="button" key={item.label} title={item.detail} onClick={() => { if (item.label === "Produtos") { abrirJanela("produtos"); } else if (item.label === "Clientes") { abrirJanela("clientes"); } else if (item.label === "Vender (PDV)") { router.push("/pdv"); } else if (item.label === "Caixa") { abrirJanela("caixa"); } else if (item.label === "Compras") { abrirJanela("fornecedores"); } else if (item.label === "Notas Fiscais") { abrirJanela("notas"); } else setAviso(`${item.label}: módulo ainda em desenvolvimento. Nenhum dado foi alterado.`); }}><Icon name={item.icon} size={30}/><span>{item.label}</span>{({"Vender (PDV)":"F2","Caixa":"F3","Financeiro":"F4","Compras":"F5","Notas Fiscais":"F6","Backup":"F7"} as Record<string,string>)[item.label] && <small className="ev-toolbar-hotkey">{({"Vender (PDV)":"F2","Caixa":"F3","Financeiro":"F4","Compras":"F5","Notas Fiscais":"F6","Backup":"F7"} as Record<string,string>)[item.label]}</small>}</button>)}
        <button type="button" onClick={sair} disabled={saindo}><Icon name="logout" size={30}/><span>Sair</span></button>
      </div>
    </div>
    <section className="ev-content">
      {erro ? <div className="ev-error" role="alert">{erro}</div> : <>
        <div className="ev-intro"><h1><Icon name="home" size={29}/> Painel de Gestão</h1><p>{loading ? "Carregando dados da empresa..." : `Bem-vindo à ${nome}. Acompanhe os principais recursos da sua empresa.`}</p></div>
        {aviso && <div className="ev-info" role="status"><span>{aviso}</span><button type="button" onClick={() => setAviso("")} aria-label="Fechar aviso">×</button></div>}
        {pendente && <div className="ev-pending"><strong>Cadastro da empresa incompleto.</strong> Complete os dados quando puder. <Link href="/completar-cadastro">Completar cadastro →</Link></div>}
        <div className="ev-kpis">
          <article><span className="ev-kpi-icon blue"><Icon name="cart"/></span><div><span>Vendas (hoje)</span><strong>—</strong><small>Sem módulo de vendas</small></div></article>
          <article><span className="ev-kpi-icon green"><Icon name="wallet"/></span><div><span>Faturamento (mês)</span><strong>—</strong><small>Dados indisponíveis</small></div></article>
          <article><span className="ev-kpi-icon amber"><Icon name="layers"/></span><div><span>Produtos em estoque</span><strong>—</strong><small>Estoque não configurado</small></div></article>
          <article><span className="ev-kpi-icon purple"><Icon name="file"/></span><div><span>Notas fiscais (mês)</span><strong>—</strong><small>Módulo não configurado</small></div></article>
        </div>
        <div className="ev-bottom-grid"><article className="ev-card"><h2><Icon name="layers" size={22}/> Movimentações recentes</h2><div className="ev-table"><div className="ev-table-head"><span>Data</span><span>Descrição</span><span>Valor</span></div><div className="ev-empty"><Icon name="file" size={33}/><p>O histórico de movimentações estará disponível quando os módulos operacionais forem implementados.</p></div></div></article><article className="ev-card"><h2><Icon name="bell" size={22}/> Avisos e pendências</h2><div className="ev-alert-body"><p>{pendente ? "Há informações pendentes no cadastro da empresa." : "Os avisos operacionais aparecerão quando os módulos forem configurados."}</p><Link href="/completar-cadastro">Dados da empresa →</Link></div></article></div>
      </>}
    </section>
    {usuariosAberto && <UsuariosModal empresaId={empresaId} onClose={()=>setUsuariosAberto(false)}/>}
    {empresaAberta && <div className="ev-product-overlay ev-empresa-overlay" ><section className="ev-empresa-window" role="dialog" aria-modal="true" aria-label="Cadastro de Informações da Empresa"><CompletarCadastro embutido onClose={()=>setEmpresaAberta(false)}/></section></div>}
    {caixaAberto && <div className="ev-product-overlay ev-caixa-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCaixaAberto(false)}}>
      <section className="ev-caixa-window" role="dialog" aria-modal="true" aria-labelledby="ev-caixa-title">
        <div className="ev-product-heading ev-caixa-heading"><div><h2 id="ev-caixa-title"><Icon name="cash" size={24}/> Gestão de Caixa — Abertura e Fechamento</h2><p>Confira o turno, registre a contagem e consulte fechamentos anteriores.</p></div><button type="button" className="ev-product-close" onClick={()=>setCaixaAberto(false)} aria-label="Fechar janela de caixa">×</button></div>
        <div className="ev-caixa-window-body"><CaixaGestao embutido /></div>
        <div className="ev-product-actions ev-caixa-footer"><span className="ev-form-hint">Fechar esta janela não encerra o turno.</span><button type="button" className="ev-product-dismiss" onClick={()=>setCaixaAberto(false)}>Fechar (Esc)</button></div>
      </section>
    </div>}
    {produtosAberto && <div className="ev-product-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !cadastroAberto && !historicoAberto) setProdutosAberto(false); }}>
      <section className="ev-product-modal" role="dialog" aria-modal="true" aria-labelledby="ev-product-title">
        <div className="ev-product-heading"><div><h2 id="ev-product-title"><Icon name="box" size={24}/> Cadastro de Produtos</h2><p>Consulte e gerencie os produtos da sua empresa.</p></div><button type="button" className="ev-product-close" onClick={() => {if (!cadastroAberto && !historicoAberto) setProdutosAberto(false);}} aria-label="Fechar janela de produtos">×</button></div>
        <div className="ev-product-search"><label htmlFor="ev-product-search-input">Pesquisar produtos</label><input id="ev-product-search-input" autoFocus value={pesquisaProduto} onChange={e => setPesquisaProduto(e.target.value)} placeholder="Descrição, código ou código de barras" /></div>
        <div className="ev-product-table-wrap"><table className="ev-product-table"><thead><tr><th>Código</th><th>Descrição do item</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>
          {carregandoProdutos ? <tr><td colSpan={6} className="ev-product-empty">Carregando produtos...</td></tr> : erroProdutos ? <tr><td colSpan={6} className="ev-product-empty" role="alert">{erroProdutos}</td></tr> : produtos.filter(p => [p.descricao, String(p.codigo), p.codigo_barras ?? ""].some(v => v.toLowerCase().includes(pesquisaProduto.toLowerCase()))).map(p => <tr key={p.id} className={`ev-product-row ${selecionado?.id === p.id ? "ev-product-selected" : ""}`} onClick={() => setSelecionado(p)} onDoubleClick={(event) => { if ((event.target as HTMLElement).closest("button")) return; abrirEdicao(p); }} title="Clique para selecionar; dois cliques para editar o produto"><td>{p.codigo}</td><td>{p.descricao}{!p.ativo ? " (Inativo)" : ""}</td><td>{moeda(p.preco_custo)}</td><td>{moeda(p.preco_venda)}</td><td className="ev-stock-cell">{p.estoque_atual}</td><td className="ev-actions-cell"><button type="button" className="ev-history-link" onClick={() => void abrirHistorico(p)}>Histórico</button></td></tr>)}
          {!carregandoProdutos && !erroProdutos && !produtos.some(p => [p.descricao, String(p.codigo), p.codigo_barras ?? ""].some(v => v.toLowerCase().includes(pesquisaProduto.toLowerCase()))) && <tr><td colSpan={6} className="ev-product-empty"><Icon name="box" size={32}/><strong>Nenhum produto encontrado</strong><span>Clique em Novo para cadastrar um produto.</span></td></tr>}
        </tbody></table></div>
        <div className="ev-product-actions"><div className="ev-product-actions-left"><button type="button" onClick={abrirNovo} disabled={!empresaId}>+ Novo (F2)</button><button type="button" onClick={() => abrirEdicao()} disabled={!selecionado || apagando}>Editar (F4)</button><button type="button" onClick={() => void apagarProduto()} disabled={!selecionado || apagando}>{apagando ? "Aguarde..." : "Apagar (Del)"}</button><button type="button" disabled title="Disponível após implementar relatórios">Relatório</button></div><button type="button" className="ev-product-dismiss" onClick={() => setProdutosAberto(false)}>Fechar</button></div>
      </section>
    </div>}
    {produtosAberto && cadastroAberto && <div className="ev-product-overlay ev-form-overlay">
      <section className="ev-form-modal" role="dialog" aria-modal="true" aria-labelledby="ev-form-title">
        <div className="ev-product-heading"><div><h2 id="ev-form-title"><Icon name="box" size={23}/> {editandoId ? "Editar Produto" : "Novo Produto"}</h2><p>{editandoId ? "Altere os dados comerciais do produto." : "Preencha os dados do produto para cadastrar na empresa."}</p></div><button type="button" className="ev-product-close" onClick={() => setCadastroAberto(false)} aria-label="Cancelar cadastro">×</button></div>
        <div className="ev-product-form-tabs"><button type="button" className={abaProduto === "dados" ? "active" : ""} onClick={() => setAbaProduto("dados")}>Dados básicos</button><button type="button" className={abaProduto === "grade" ? "active" : ""} onClick={() => setAbaProduto("grade")}>Grade flexível</button><button type="button" className={abaProduto === "fornecedores" ? "active" : ""} onClick={() => setAbaProduto("fornecedores")}>Fornecedores</button></div>
        {abaProduto === "fornecedores" ? <div className="ev-form-content">{editandoId ? <ProdutoFornecedores empresaId={empresaId} produtoId={editandoId} /> : <div className="ev-grade-notice">Salve primeiro o produto em <strong>Dados básicos</strong> (F12). Depois abra a edição para vincular os fornecedores.</div>}</div> : abaProduto === "grade" ? <div className="ev-form-content">{editandoId ? <GradeProduto empresaId={empresaId} produtoId={editandoId} precoPadrao={Number(formProduto.preco_venda) || 0}/> : <div className="ev-grade-notice">Salve primeiro o produto em <strong>Dados básicos</strong> (F12). Depois selecione-o, pressione F4 e abra a aba Grade flexível para adicionar as variações.</div>}</div> : <form onSubmit={salvarProduto} className="ev-form-content" id="ev-new-product-form">
          <div className="ev-form-grid">
            <label className="ev-wide">Descrição do produto *<input required maxLength={200} value={formProduto.descricao} onChange={e => setFormProduto(f => ({...f, descricao:e.target.value}))} autoFocus /></label>
            <label>Código de barras (EAN/GTIN)<input maxLength={40} value={formProduto.codigo_barras} onChange={e => setFormProduto(f => ({...f, codigo_barras:e.target.value}))} /></label>
            <label>Unidade<select value={formProduto.unidade} onChange={e => setFormProduto(f => ({...f, unidade:e.target.value}))}>{["UN","CX","KG","G","LT","ML","PCT","PAR","M","M2"].map(u => <option key={u}>{u}</option>)}</select></label>
            <label>Preço de custo (R$) — {editandoId ? "última compra" : "referência inicial"}<input type="number" min="0" step="0.01" required value={formProduto.preco_custo} disabled={Boolean(editandoId)} onChange={e => setFormProduto(f => ({...f, preco_custo:e.target.value}))} /></label>
            <label>Preço de venda (R$)<input type="number" min="0" step="0.01" required value={formProduto.preco_venda} onChange={e => setFormProduto(f => ({...f, preco_venda:e.target.value}))} /></label>
            <label>Estoque atual {editandoId ? "(editável)" : "(inicial: 0)"}<input type="number" min="0" step="0.001" value={formProduto.estoque_atual} disabled={!editandoId} onChange={e => setFormProduto(f => ({...f, estoque_atual:e.target.value}))} title={editandoId ? "Informe a quantidade real e pressione F12" : "No novo produto o estoque começa em zero"} /></label>
            <label className="ev-active-label">Situação <span><input type="checkbox" checked={formProduto.ativo} onChange={e => setFormProduto(f => ({...f, ativo:e.target.checked}))} /> {formProduto.ativo ? "Ativo" : "Inativo"}</span></label>
          </div>
          {formErro && <div className="ev-error" role="alert">{formErro}</div>}
        </form>}
        <div className="ev-product-actions"><span className="ev-form-hint">* Campo obrigatório · Código interno gerado automaticamente</span><div className="ev-product-actions-left"><button type="button" onClick={() => setCadastroAberto(false)} disabled={salvandoProduto}>Cancelar</button>{abaProduto === "dados" && <button type="submit" form="ev-new-product-form" id="ev-save-product-submit" className="ev-save-product" disabled={salvandoProduto}>{salvandoProduto ? "Salvando..." : "Salvar (F12)"}</button>}</div></div>
      </section>
    </div>}
    {produtosAberto && historicoAberto && selecionado && <div className="ev-product-overlay ev-form-overlay">
      <section className="ev-form-modal ev-history-modal" role="dialog" aria-modal="true" aria-labelledby="ev-history-title">
        <div className="ev-product-heading"><div><h2 id="ev-history-title"><Icon name="box" size={23}/> Histórico — {selecionado.descricao}</h2><p>Entradas e saídas separadas. O custo da última compra aparece em destaque.</p></div><button type="button" className="ev-product-close" onClick={() => setHistoricoAberto(false)}>×</button></div>
        <div className="ev-history-body">
          <div className="ev-history-summary"><div><small>Último custo de compra</small><strong>{(() => {const ultima = movimentos.find(m => m.tipo === "entrada");return ultima && ultima.custo_unitario !== null ? moeda(ultima.custo_unitario) : "Sem compras";})()}</strong></div><div><small>Estoque atual</small><strong>{produtos.find(p=>p.id===selecionado.id)?.estoque_atual ?? selecionado.estoque_atual}</strong></div></div>
          <div className="ev-history-tabs"><button type="button" className={abaHistorico === "entrada" ? "active" : ""} onClick={() => {setAbaHistorico("entrada");setMovErro("");}}>Entradas</button><button type="button" className={abaHistorico === "saida" ? "active" : ""} onClick={() => {setAbaHistorico("saida");setMovErro("");}}>Saídas</button></div>
          <div className="ev-history-list"><table className="ev-product-table"><thead><tr><th>Data</th><th>Quantidade</th><th>{abaHistorico === "entrada" ? "Custo unitário" : "Motivo"}</th><th>{abaHistorico === "entrada" ? "Nota fiscal" : "Operação"}</th></tr></thead><tbody>{movimentos.filter(m=>m.tipo===abaHistorico).map(m=><tr key={m.id} className="ev-product-row"><td>{new Date(m.created_at).toLocaleString("pt-BR")}</td><td>{m.quantidade}</td><td>{m.tipo === "entrada" ? moeda(m.custo_unitario ?? 0) : (m.motivo ?? "Saída")}</td><td>{m.tipo === "entrada" ? (m.numero_nota || "—") : "Saída"}</td></tr>)}{!movimentos.some(m=>m.tipo===abaHistorico)&&<tr><td colSpan={4} className="ev-product-empty">Nenhuma movimentação registrada.</td></tr>}</tbody></table></div>
          <p className="ev-history-readonly">Histórico somente para consulta. Entradas serão geradas pela importação de notas fiscais e saídas pelas vendas do PDV.</p>
        </div>
        <div className="ev-product-actions"><span className="ev-form-hint">O estoque é atualizado automaticamente após cada movimentação.</span><button type="button" onClick={() => setHistoricoAberto(false)}>Fechar</button></div>
      </section>
    </div>}
    {clientesAberto && <ClientesModal empresaId={empresaId} onClose={()=>setClientesAberto(false)} />}
    {fornecedoresAberto && <FornecedoresModal empresaId={empresaId} onClose={() => setFornecedoresAberto(false)} />}
    {despesasAberto && <DespesasModal empresaId={empresaId} onClose={() => setDespesasAberto(false)} />}
    {menuNotasAberto && <div className="ev-product-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setMenuNotasAberto(false)}}><section className="ev-notas-menu" role="dialog" aria-modal="true" aria-label="Notas fiscais"><div className="ev-notas-menu-head"><strong>Notas Fiscais</strong><button type="button" onClick={()=>setMenuNotasAberto(false)} aria-label="Fechar">×</button></div><p>Escolha o que deseja fazer.</p><button type="button" onClick={()=>{abrirJanela("xml")}}>Importar XML de entrada</button><button type="button" onClick={()=>{abrirJanela("entradas")}}>Consultar notas de entrada</button></section></div>}
    {notasEntradaAbertas && <NotasEntradaModal empresaId={empresaId} onClose={()=>setNotasEntradaAbertas(false)} />}
    {importacaoXmlAberta && <ImportarXmlModal onClose={() => setImportacaoXmlAberta(false)} />}
    <style jsx global>{`
      /* A janela sempre acima do menu superior; mesmo enquadramento do Cadastro de Clientes. */
      .ev-dashboard .ev-product-overlay{z-index:2500!important}
      .ev-dashboard .ev-product-overlay.ev-empresa-overlay{z-index:2550!important}
      .ev-dashboard .ev-empresa-window,.ev-dashboard .ev-product-modal,.ev-dashboard .ev-caixa-window{width:min(1100px,calc(100vw - 36px));height:min(700px,calc(100dvh - 40px));max-height:calc(100dvh - 40px);border-radius:16px!important;overflow:hidden!important;box-shadow:0 24px 65px #06152c55!important}
      .ev-dashboard .ev-product-heading{background:#0b2454!important;color:#fff!important;border-radius:16px 16px 0 0!important}
      .ev-dashboard .ev-product-heading h2,.ev-dashboard .ev-product-heading p{color:#fff!important}
      .ev-dashboard .ev-product-heading p{color:#dce7fa!important}
      .ev-dashboard .ev-empresa-window .screen-embedded{height:100%!important;min-height:0!important;padding:0!important;margin:0!important;background:#fff!important;display:flex!important;align-items:stretch!important}
      .ev-dashboard .ev-empresa-window .screen-embedded>.panel{width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;border-radius:16px!important;box-shadow:none!important}
      .ev-dashboard .ev-empresa-window .company-modal-head{height:auto!important;min-height:92px!important;flex-shrink:0!important;background:#0b2454!important;color:#fff!important;padding:18px 22px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-radius:16px 16px 0 0!important}
      .ev-dashboard .ev-empresa-window .company-modal-head strong{font-size:21px!important;color:#fff!important}
      .ev-dashboard .ev-empresa-window .company-inner{min-height:0!important;flex:1!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}
      .ev-dashboard .ev-empresa-window .company-content{min-height:0!important;flex:1!important;overflow-y:auto!important;padding:20px 24px!important}
      .ev-dashboard .ev-empresa-window .company-modal-footer{flex-shrink:0!important;background:#fff!important;border-top:1px solid #dce5f0!important;padding:15px 22px!important;display:flex!important;align-items:center!important;justify-content:space-between!important}
      @media(max-width:650px){.ev-dashboard .ev-empresa-window,.ev-dashboard .ev-product-modal,.ev-dashboard .ev-caixa-window{width:calc(100vw - 16px)!important;height:calc(100dvh - 16px)!important;max-height:calc(100dvh - 16px)!important}}
      .ev-empresa-overlay{z-index:1250}.ev-empresa-window{width:min(920px,100%);height:min(790px,calc(100dvh - 40px));max-height:calc(100dvh - 40px);background:#fff;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 70px #06152c66;isolation:isolate}
      .ev-toolbar-hotkey{font-size:10px;color:#3865a1;background:#edf4ff;border-radius:5px;padding:2px 6px;line-height:1.2}.ev-toolbar-scroll button:hover .ev-toolbar-hotkey{background:#dcecff}
      .ev-caixa-overlay{z-index:1005}.ev-caixa-window{width:min(1020px,100%);height:min(790px,calc(100dvh - 36px));display:flex;flex-direction:column;background:#fff;border-radius:15px;overflow:hidden;box-shadow:0 30px 80px #06152c66}.ev-caixa-heading{flex-shrink:0;background:#fff}.ev-caixa-window-body{flex:1;min-height:0;overflow-y:auto;background:#f7f9fd}.ev-caixa-footer{flex-shrink:0;background:white}.ev-caixa-window button{cursor:pointer}.ev-caixa-window button:disabled{cursor:not-allowed}@media(max-width:650px){.ev-caixa-window{height:calc(100dvh - 16px)}.ev-caixa-heading h2{font-size:17px}}
      .ev-tabs{overflow:visible!important;position:relative;z-index:1100}.ev-cadastros-anchor{position:relative;flex:0 0 auto}.ev-cadastros-menu{position:absolute;top:100%;left:0;z-index:1200;width:min(390px,calc(100vw - 20px));background:#fff;border:1px solid #cbd8e8;border-radius:0 0 12px 12px;box-shadow:0 18px 45px #071c3c36;padding:7px;display:flex;flex-direction:column}.ev-tabs .ev-cadastros-menu button{border:0!important;background:#fff!important;color:#1c3658!important;display:flex;align-items:center;gap:12px;width:100%;text-align:left;white-space:normal;padding:12px 11px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer}.ev-tabs .ev-cadastros-menu button:hover,.ev-tabs .ev-cadastros-menu button:focus-visible{background:#eaf2ff!important;color:#0b2454!important}.ev-cadastros-icone{width:24px;color:#1d518f;font-size:19px;text-align:center;flex-shrink:0}.ev-cadastros-menu small{font-size:10px;color:#8291a5;margin-left:auto;white-space:nowrap}@media(max-width:580px){.ev-cadastros-menu small{display:none}}
      .ev-notas-menu{width:min(440px,100%);background:#fff;padding:24px;border-radius:14px;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px #06152c66}.ev-notas-menu-head{display:flex;justify-content:space-between;align-items:center;font-size:20px}.ev-notas-menu-head button{background:#eef3fa;border:0;border-radius:7px;font-size:24px;cursor:pointer;padding:3px 12px}.ev-notas-menu p{color:#64748b;font-size:13px;margin:0 0 6px}.ev-notas-menu>button{background:#0b2454;border:0;border-radius:9px;padding:15px;color:white;font-weight:700;cursor:pointer;text-align:left}
      .ev-product-form-tabs{display:flex;gap:8px;padding:12px 22px 0;border-bottom:1px solid #e0e7f0}.ev-product-form-tabs button{border:0;background:transparent;padding:10px 14px;border-bottom:3px solid transparent;color:#344761;cursor:pointer;font-weight:700}.ev-product-form-tabs button.active{border-color:#1765d5;color:#0b2454}.ev-grade-notice{background:#eff5fd;border-radius:8px;padding:18px;line-height:1.7;font-size:13px;color:#344761}
      .ev-product-table th:nth-child(5){text-align:right}.ev-product-table th:nth-child(6){text-align:center!important}.ev-product-table-wrap>.ev-product-table thead th:last-child{text-align:center!important}.ev-product-table-wrap>.ev-product-table tbody td:last-child{text-align:center!important}.ev-stock-cell{text-align:right!important;white-space:nowrap}.ev-actions-cell{text-align:center!important;white-space:nowrap}.ev-actions-cell .ev-history-link{margin-left:0}.ev-product-selected{background:#e6f1ff!important;outline:1px solid #b5d3fc}.ev-product-row{cursor:pointer}.ev-history-readonly{font-size:12px;color:#60728a;background:#f3f7fd;padding:12px;border-radius:8px}.ev-history-link{margin-left:12px;padding:5px 8px;border:1px solid #bcd0ed;border-radius:6px;background:#eef5ff;color:#164d98;cursor:pointer;font-size:11px}.ev-active-label span{display:flex;align-items:center;gap:8px;font-size:14px}.ev-active-label input{width:auto!important}.ev-history-modal{width:min(850px,100%)}.ev-history-body{padding:18px;overflow:auto;display:flex;flex-direction:column;gap:14px}.ev-history-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ev-history-summary>div{background:#f0f5fc;padding:15px;border-radius:10px;display:flex;flex-direction:column;gap:7px}.ev-history-summary small{color:#64748b}.ev-history-summary strong{font-size:23px}.ev-history-tabs{display:flex;gap:10px}.ev-history-tabs button{border:1px solid #cdd8e7;background:white;padding:10px 20px;border-radius:8px;cursor:pointer}.ev-history-tabs button.active{background:#0b2454;color:white}.ev-history-list{max-height:220px;overflow:auto;border:1px solid #dce5f0;border-radius:8px}.ev-history-list .ev-product-table td{padding:10px}.ev-movement-form{border-top:1px solid #dce5f0;padding-top:14px;display:flex;flex-direction:column;gap:13px}.ev-movement-form>button{align-self:flex-end;border:0;border-radius:8px;padding:11px 16px;cursor:pointer}.ev-product-overlay.ev-form-overlay{z-index:1010}.ev-form-modal{width:min(760px,100%);max-height:calc(100dvh - 35px);background:white;border-radius:15px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px #06152c66}.ev-form-content{overflow:auto;padding:22px}.ev-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:17px}.ev-form-grid label{font-size:12px;font-weight:700;color:#344761;display:flex;flex-direction:column;gap:7px}.ev-form-grid input,.ev-form-grid select{width:100%;border:1px solid #cbd8e8;border-radius:8px;padding:11px 12px;font-size:14px;color:#10234b;background:white}.ev-form-grid input:focus,.ev-form-grid select:focus{outline:2px solid #a3c9fa}.ev-form-modal{font-family:Arial,Helvetica,sans-serif;color:#111827}.ev-form-grid label{color:#111827;font-size:13px;font-weight:800}.ev-form-grid input,.ev-form-grid select{min-height:42px;font-size:14px;font-weight:600;color:#111827;border-color:#aabfdc}.ev-form-grid input:focus,.ev-form-grid select:focus{outline:2px solid #1765d5;outline-offset:1px}.ev-form-modal .ev-product-heading h2{color:#0b2454;font-weight:800}.ev-wide{grid-column:1/-1}.ev-save-product{background:#0b2454!important;color:white!important}.ev-form-hint{font-size:11px;color:#64748b}.ev-product-row td{padding:11px 12px;border-bottom:1px solid #e7edf5}.ev-product-row td:nth-child(n+3){text-align:right}@media(max-width:580px){.ev-form-grid{grid-template-columns:1fr}.ev-form-modal{max-height:calc(100dvh - 16px)}.ev-form-content{padding:14px}.ev-form-hint{display:none}}
      .ev-product-overlay{position:fixed;inset:0;z-index:1000;background:#07162f9c;display:flex;align-items:center;justify-content:center;padding:20px}.ev-product-modal{width:min(940px,100%);height:min(690px,calc(100dvh - 40px));background:#fff;border-radius:15px;box-shadow:0 30px 80px #06152c66;display:flex;flex-direction:column;overflow:hidden}.ev-product-heading{padding:19px 22px;border-bottom:1px solid #dce5f0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ev-product-heading h2{font-size:21px;display:flex;align-items:center;gap:10px;margin:0}.ev-product-heading p{font-size:13px;color:#64748b;margin:7px 0 0}.ev-product-close{border:0;background:#edf3fa;color:#18365f;border-radius:8px;width:34px;height:34px;font-size:24px;cursor:pointer}.ev-product-search{padding:18px 22px;display:flex;flex-direction:column;gap:7px}.ev-product-search label{font-size:12px;font-weight:700}.ev-product-search input{width:100%;border:1px solid #cbd8e8;border-radius:9px;padding:12px 14px;font-size:14px;outline:none}.ev-product-search input:focus{border-color:#1674e5;box-shadow:0 0 0 3px #1674e51f}.ev-product-table-wrap{margin:0 22px;flex:1;min-height:0;overflow:auto;border:1px solid #dce5f0;border-radius:9px}.ev-product-table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}.ev-product-table-wrap>.ev-product-table{table-layout:fixed}.ev-product-table-wrap>.ev-product-table th:nth-child(1){width:13%}.ev-product-table-wrap>.ev-product-table th:nth-child(2){width:33%}.ev-product-table-wrap>.ev-product-table th:nth-child(3){width:14%}.ev-product-table-wrap>.ev-product-table th:nth-child(4){width:14%}.ev-product-table-wrap>.ev-product-table th:nth-child(5){width:12%}.ev-product-table-wrap>.ev-product-table th:nth-child(6){width:14%}.ev-product-table th{background:#f1f5fb;padding:12px;color:#263b5b;white-space:nowrap;border-bottom:1px solid #dce5f0}.ev-product-table th:nth-child(n+3){text-align:right}.ev-product-empty{text-align:center;padding:70px 16px!important;color:#71819a}.ev-product-empty svg{display:block;margin:0 auto 12px}.ev-product-empty strong,.ev-product-empty span{display:block}.ev-product-empty strong{color:#344761;margin-bottom:7px}.ev-product-empty span{font-size:12px;line-height:1.5}.ev-product-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 22px;border-top:1px solid #dce5f0}.ev-product-actions-left{display:flex;flex-wrap:wrap;gap:9px}.ev-product-actions button{border:1px solid #cdd8e7;background:#fff;color:#15325a;border-radius:8px;padding:10px 15px;font-weight:700;cursor:pointer}.ev-product-actions button:disabled{opacity:.42;cursor:not-allowed}.ev-product-actions .ev-product-dismiss{background:#0b2454;color:white;border-color:#0b2454}@media(max-width:650px){.ev-product-overlay{padding:8px}.ev-product-modal{height:calc(100dvh - 16px)}.ev-product-heading,.ev-product-search,.ev-product-actions{padding:14px}.ev-product-table-wrap{margin:0 14px}.ev-product-actions{align-items:stretch}.ev-product-actions-left{gap:5px}.ev-product-actions button{padding:9px}.ev-product-table{min-width:560px}}*{box-sizing:border-box}html,body{margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#10234b;background:#f5f7fb}.ev-dashboard{min-height:100vh}.ev-header{background:linear-gradient(100deg,#061632,#102b61);color:#fff}.ev-header-inner{min-height:73px;max-width:1600px;margin:auto;display:flex;align-items:center;gap:26px;padding:12px 25px}.ev-brand{display:flex;align-items:center;gap:9px;white-space:nowrap}.ev-brand strong{font-size:24px;letter-spacing:2px}.ev-brand strong span{color:#22b9ff}.ev-brand i{height:27px;width:1px;background:#ffffff55;margin:0 12px}.ev-brand-sub{font-size:16px}.ev-company{display:flex;align-items:center;gap:9px;border:1px solid #ffffff45;background:#ffffff14;border-radius:9px;padding:10px 14px;margin-left:auto;max-width:260px;min-width:140px}.ev-company span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ev-user{display:flex;align-items:center;gap:8px;max-width:205px}.ev-user span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.ev-user small{display:block;color:#bdcbe5;font-size:11px;margin-top:3px}.ev-top-exit{display:flex;align-items:center;gap:7px;background:transparent;border:1px solid #ffffff55;border-radius:8px;padding:10px 13px;color:#fff;cursor:pointer}.ev-top-exit:disabled{opacity:.6}.ev-tabs{display:flex;align-items:center;gap:5px;padding:0 max(20px,calc((100vw - 1600px)/2));background:#fff;border-bottom:1px solid #dce3ed;overflow-x:auto}.ev-tabs button{white-space:nowrap;background:transparent;border:0;border-bottom:3px solid transparent;padding:13px 15px 11px;color:#243653;font-weight:600;cursor:pointer}.ev-tabs button.active{border-color:#1765d5;color:#0b2454}.ev-toolbar{background:#fff;box-shadow:0 4px 13px #0b245410}.ev-toolbar-scroll{display:flex;max-width:1600px;margin:auto;overflow-x:auto;padding:9px 14px 13px}.ev-toolbar-scroll button{display:flex;flex:1 0 110px;min-width:110px;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:0;border-right:1px solid #d9e1ed;background:#fff;color:#25364e;padding:12px 7px;cursor:pointer;font-size:13px;font-weight:700;min-height:86px}.ev-toolbar-scroll button:hover{background:#edf5ff;color:#0758c2}.ev-toolbar-scroll button:last-child{border-right:0}.ev-content{max-width:1600px;margin:0 auto;padding:38px 30px 65px}.ev-intro h1{font-size:27px;display:flex;align-items:center;gap:11px;margin:0 0 8px}.ev-intro p{color:#64748b;margin:0 0 27px;line-height:1.5}.ev-info,.ev-pending,.ev-error{padding:14px 17px;border-radius:10px;margin-bottom:20px}.ev-info{background:#eaf3ff;border:1px solid #bad8ff;display:flex;justify-content:space-between;gap:12px}.ev-info button{background:none;border:0;font-size:22px;cursor:pointer}.ev-pending{background:#fff7e7;border:1px solid #f2d79a}.ev-pending a,.ev-alert-body a{color:#0758c2;font-weight:bold}.ev-error{background:#fff0ee;color:#9c2f21}.ev-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px}.ev-kpis article{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #dbe4f1;border-radius:13px;padding:19px 16px;min-height:132px}.ev-kpis article>div{display:flex;flex-direction:column;gap:5px;min-width:0}.ev-kpis article div>span{font-size:14px;font-weight:bold}.ev-kpis strong{font-size:28px}.ev-kpis small{font-size:11px;color:#7c8ba2}.ev-kpi-icon{height:56px;width:56px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}.ev-kpi-icon.blue{background:#e6f1ff;color:#1465c5}.ev-kpi-icon.green{background:#e6f8ec;color:#168046}.ev-kpi-icon.amber{background:#fff4de;color:#c47a00}.ev-kpi-icon.purple{background:#f0eaff;color:#6842bb}.ev-bottom-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-top:24px}.ev-card{background:#fff;border:1px solid #dbe4f1;border-radius:13px;padding:20px;min-height:255px}.ev-card h2{font-size:19px;display:flex;align-items:center;gap:10px;margin:0 0 20px}.ev-table{border:1px solid #d9e2ee;border-radius:9px;overflow:hidden}.ev-table-head{background:#f0f4fa;display:grid;grid-template-columns:1fr 3fr 1fr;gap:10px;padding:13px;font-size:13px;font-weight:bold}.ev-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#73829b;min-height:138px;padding:18px}.ev-empty p{font-size:13px;max-width:460px;line-height:1.5}.ev-alert-body{border-top:1px solid #e0e7f0;padding-top:22px;color:#60728a;line-height:1.6;font-size:14px}.ev-alert-body a{display:inline-block;margin-top:10px}@media(max-width:1100px){.ev-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ev-brand-sub{display:none}.ev-brand i{display:none}.ev-header-inner{gap:14px}}@media(max-width:700px){.ev-header-inner{flex-wrap:wrap;padding:12px 15px}.ev-brand{width:100%}.ev-company{margin-left:0;flex:1}.ev-user{display:none}.ev-tabs{padding:0 8px}.ev-content{padding:25px 15px}.ev-bottom-grid{grid-template-columns:1fr}.ev-kpis{grid-template-columns:1fr}.ev-toolbar-scroll button{flex-basis:95px;min-width:95px}.ev-intro h1{font-size:23px}}

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

    `}</style>
  </main>;
}

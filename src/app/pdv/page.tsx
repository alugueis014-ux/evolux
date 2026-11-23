"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ClientesModal from "../dashboard/ClientesModal";
import ProdutoCadastroRapido from "./ProdutoCadastroRapido";
import { createClient } from "@supabase/supabase-js";
import {caixaIndividual} from "@/lib/caixa-individual-client";
import {temAteDuasCasas} from "@/lib/dinheiro";
import {carregarProdutosAtivos} from "@/lib/produtos-client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

type Produto = { id: string; preco_custo?: number | null; codigo: number; descricao: string; codigo_barras: string | null; preco_venda: number; estoque_atual: number; ativo: boolean };
type Linha = { produto: Produto; quantidade: number };
const dinheiro = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PDV() {
  const [telaVenda, setTelaVenda] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [turno, setTurno] = useState<{id:string;numero:number;saldo_inicial:number}|null>(null);
  // Bloqueio preventivo da interface; os gatilhos financeiros no banco permanecem obrigatórios.
  const [caixaEmConferencia,setCaixaEmConferencia]=useState(false);
  const [verificandoConferencia,setVerificandoConferencia]=useState(false);
  const avisoConferencia="Caixa em conferência — aguarde a aprovação do supervisor ou realize a recontagem. Não é permitido vender ou movimentar este turno.";
  async function verificarConferencia(turnoId:string):Promise<boolean>{
    if(!supabase)throw new Error("Conexão indisponível para verificar o caixa.");
    const {data,error}=await supabase.rpc("evolux_status_caixa",{p_caixa_turno_id:turnoId});
    if(error)throw new Error("Não foi possível verificar o fechamento do caixa: "+error.message);
    // A existência de uma tentativa, mesmo devolvida, mantém o turno bloqueado.
    const bloqueado=String(data?.status||"")!=="novo";
    setCaixaEmConferencia(bloqueado);
    return bloqueado;
  }
  useEffect(()=>{
    if(!turno){setCaixaEmConferencia(false);return;}
    let ativo=true;
    setVerificandoConferencia(true);
    void verificarConferencia(turno.id).catch(()=>{if(ativo)setCaixaEmConferencia(true);})
      .finally(()=>{if(ativo)setVerificandoConferencia(false);});
    return ()=>{ativo=false;};
  },[turno?.id]);

  const [abertura, setAbertura] = useState<"pergunta"|"formulario"|null>(null);
  const [saldoInicial, setSaldoInicial] = useState("0,00");
  const [processandoCaixa, setProcessandoCaixa] = useState(false);
  const [erroCaixa, setErroCaixa] = useState("");
  const [dataAbertura, setDataAbertura] = useState("");
  // EVOLUX 24.7.1 — Sangria e suprimento diretamente no Caixa Livre.
  const [movCaixaTipo,setMovCaixaTipo]=useState<"sangria"|"suprimento"|null>(null);
  const [movCaixaValor,setMovCaixaValor]=useState("");
  const [movCaixaMotivo,setMovCaixaMotivo]=useState("");
  const [movCaixaErro,setMovCaixaErro]=useState("");
  const [movCaixaSalvando,setMovCaixaSalvando]=useState(false);
  const movCaixaChave=useRef<string|null>(null);
  function abrirMovCaixa(tipo:"sangria"|"suprimento"){
    if(!turno){setErroCaixa("Abra um turno de caixa antes de registrar movimentações.");return;}
    if(caixaEmConferencia||verificandoConferencia){setErroCaixa(avisoConferencia);return;}
    setMovCaixaTipo(tipo);setMovCaixaValor("");setMovCaixaMotivo("");setMovCaixaErro("");movCaixaChave.current=null;
  }
  async function salvarMovCaixa(){
    if(!supabase||!turno||!movCaixaTipo||movCaixaSalvando)return;
    try{if(await verificarConferencia(turno.id)){setMovCaixaErro(avisoConferencia);return;}}catch(e){setMovCaixaErro(e instanceof Error?e.message:"Não foi possível verificar o turno.");return;}
    const texto=movCaixaValor.trim().replace(/\./g,"").replace(",",".");
    if(!/^\d+(?:\.\d{1,2})?$/.test(texto)||Number(texto)<=0){setMovCaixaErro("Informe um valor positivo com até duas casas decimais.");return;}
    if(movCaixaMotivo.trim().length<5){setMovCaixaErro("Informe um motivo com pelo menos 5 caracteres.");return;}
    if(!movCaixaChave.current)movCaixaChave.current=crypto.randomUUID();
    setMovCaixaSalvando(true);setMovCaixaErro("");
    const {error}=await supabase.rpc("evolux_registrar_movimentacao_caixa",{
      p_caixa_turno_id:turno.id,p_tipo:movCaixaTipo,p_valor:Number(texto),p_motivo:movCaixaMotivo.trim(),p_chave_operacao:movCaixaChave.current
    });
    setMovCaixaSalvando(false);
    if(error){setMovCaixaErro(error.message+" Se houve falha de conexão, confira a movimentação antes de repetir.");return;}
    movCaixaChave.current=null;setMovCaixaTipo(null);setErroCaixa("");window.alert("Movimentação registrada com sucesso.");
  }


  const [consultaProdutosAberta,setConsultaProdutosAberta]=useState(false);
  const [consultaProdutosBusca,setConsultaProdutosBusca]=useState("");
  const [consultaProdutosLista,setConsultaProdutosLista]=useState<Produto[]>([]);
  const [consultaProdutosCarregando,setConsultaProdutosCarregando]=useState(false);
  const [consultaProdutosErro,setConsultaProdutosErro]=useState("");
  async function abrirConsultaProdutos(){
    setConsultaProdutosAberta(true);
    setConsultaProdutosBusca("");
    setConsultaProdutosErro("");
    if(!supabase||!empresaId){setConsultaProdutosErro("Empresa ainda não identificada.");return;}
    setConsultaProdutosCarregando(true);
    try{
      const {data,error}=await carregarProdutosAtivos(supabase,empresaId,"id,codigo,descricao,codigo_barras,preco_venda,estoque_atual,ativo");
      if(error)throw new Error(error.message);
      setConsultaProdutosLista((data||[]) as Produto[]);
    }catch(e){setConsultaProdutosErro(e instanceof Error?e.message:"Não foi possível consultar os produtos.");}
    finally{setConsultaProdutosCarregando(false);}
  }
  const consultaProdutosFiltrados=consultaProdutosLista.filter(p=>{
    const termo=consultaProdutosBusca.trim().toLocaleLowerCase("pt-BR");
    return !termo||p.descricao.toLocaleLowerCase("pt-BR").includes(termo)||
      String(p.codigo).includes(termo)||(p.codigo_barras||"").includes(termo);
  }).slice(0,100);
  const [fechamentoAberto,setFechamentoAberto]=useState(false);
  const [fechamentoValores,setFechamentoValores]=useState({dinheiro:"",pix:"",cartao:""});
  const [fechamentoObservacao,setFechamentoObservacao]=useState("");
  const [fechamentoErro,setFechamentoErro]=useState("");
  const [fechamentoStatus,setFechamentoStatus]=useState("");
  const [fechamentoCarregando,setFechamentoCarregando]=useState(false);
  const [fechamentoEnviando,setFechamentoEnviando]=useState(false);
  const parseFechamento=(valor:string)=>{
    const limpo=valor.trim().replace(/\./g,"").replace(",",".");
    return /^\d+(?:\.\d{1,2})?$/.test(limpo)?Math.round(Number(limpo)*100):null;
  };
  async function abrirFechamento(){
    if(!supabase){setErroCaixa("Conexão com o Supabase indisponível.");return;}
    if(!turno){setErroCaixa("Não existe um turno aberto para fechar.");return;}
    if(telaVenda||carrinho.length||vendaConfirmada||modalOperacao||trocaPDVAtiva){
      setErroCaixa("Conclua a operação de venda antes de iniciar o fechamento do caixa.");
      return;
    }
    setFechamentoAberto(true);setFechamentoErro("");setFechamentoStatus("");
    setFechamentoValores({dinheiro:"",pix:"",cartao:""});setFechamentoObservacao("");
    setFechamentoCarregando(true);
    try{
      const {data,error}=await supabase.rpc("evolux_status_caixa",{p_caixa_turno_id:turno.id});
      if(error){setFechamentoErro("Não foi possível consultar a situação do turno: "+error.message);return;}
      if(data?.status==="pendente")setFechamentoStatus("Contagem já enviada. Aguarde a decisão do supervisor.");
    }catch(e){
      setFechamentoErro(e instanceof Error?e.message:"Falha ao consultar a situação do turno.");
    }finally{
      setFechamentoCarregando(false);
    }
  }
  async function enviarFechamento(){
    if(!supabase||!turno||fechamentoEnviando||fechamentoStatus)return;
    const d=parseFechamento(fechamentoValores.dinheiro);
    const p=parseFechamento(fechamentoValores.pix);
    const c=parseFechamento(fechamentoValores.cartao);
    if(d===null||p===null||c===null){setFechamentoErro("Informe os três valores válidos, inclusive zero quando necessário.");return;}
    if(!window.confirm("Enviar a contagem cega para aprovação do supervisor?"))return;
    setFechamentoEnviando(true);setFechamentoErro("");
    try{
      await caixaIndividual("enviar",{turno_id:turno.id,dinheiro:d/100,pix:p/100,cartao:c/100,justificativa:fechamentoObservacao.trim()||null});
      setCaixaEmConferencia(true);
      setFechamentoStatus("Contagem enviada. Aguarde a conferência e aprovação do supervisor.");
    }catch(e){setFechamentoErro(e instanceof Error?e.message:"Falha ao enviar a contagem.");}
    finally{setFechamentoEnviando(false);}
  }
  const [clienteBusca, setClienteBusca] = useState("");
  const [modo, setModo] = useState("1 - VENDA");
  const [hora, setHora] = useState("");
  const [dataAtual, setDataAtual] = useState("");
  const [dataExtenso, setDataExtenso] = useState("");
  // Etapa 24.4.2: consulta somente leitura, sem alterar registros de vendas.
  // Etapa 24.5.8: cancelamento vinculado à venda original.
  // EVOLUX 24.6.5: modo troca no próprio PDV, apenas simulação até integração financeira auditada.
  const [trocaPDVAtiva,setTrocaPDVAtiva]=useState(false);
  const [trocaPDVBuscaAberta,setTrocaPDVBuscaAberta]=useState(false);
  const [trocaPDVBusca,setTrocaPDVBusca]=useState("");
  const [trocaPDVCatalogoAberto,setTrocaPDVCatalogoAberto]=useState(false);
  const [trocaPDVCatalogoFiltro,setTrocaPDVCatalogoFiltro]=useState("");
  const [trocaPDVResultados,setTrocaPDVResultados]=useState<Record<string,unknown>[]>([]);
  const [trocaPDVCarregando,setTrocaPDVCarregando]=useState(false);
  const [trocaPDVErro,setTrocaPDVErro]=useState("");
  const [trocaPDVItem,setTrocaPDVItem]=useState<Record<string,unknown>|null>(null);
  const [trocaPDVVenda,setTrocaPDVVenda]=useState<Record<string,unknown>|null>(null);
  const [trocaPDVQtd,setTrocaPDVQtd]=useState("1");
  const [trocaPDVCondicao,setTrocaPDVCondicao]=useState("bom");
  const [trocaPDVFinalizar,setTrocaPDVFinalizar]=useState(false);
  const [trocaPagamento,setTrocaPagamento]=useState({dinheiro:"",pix:"",cartao:""});
  const trocaPagamentoRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const [trocaErroPagamento,setTrocaErroPagamento]=useState("");

  const [trocaPDVSemVenda,setTrocaPDVSemVenda]=useState(false);
  const [trocaPDVProdutoLivre,setTrocaPDVProdutoLivre]=useState<Produto|null>(null);
  const [trocaPDVMotivo,setTrocaPDVMotivo]=useState("");
  function iniciarTrocaPDV(){
    if(carrinho.length||vendaConfirmada||modalOperacao||trocaPDVAtiva){setErro("Conclua ou cancele a operação atual antes de iniciar uma troca.");return;}
    setTrocaPDVBusca("");setTrocaPDVCatalogoAberto(false);setTrocaPDVCatalogoFiltro("");setTrocaPDVResultados([]);setTrocaPDVErro("");setTrocaPDVItem(null);
    setTrocaPDVVenda(null);setTrocaPDVSemVenda(false);setTrocaPDVProdutoLivre(null);setTrocaPDVMotivo("");setTrocaPDVQtd("1");setTrocaPDVCondicao("bom");setTrocaPDVBuscaAberta(true);
  }
  async function pesquisarProdutoDevolvido(termoInformado?:string){
    if(!supabase||!empresaId||trocaPDVCarregando)return;
    const termo=(termoInformado??trocaPDVBusca).trim().toLocaleLowerCase("pt-BR");
    if(!termo){setTrocaPDVErro("Informe o código, código de barras ou nome do produto.");return;}
    const candidatos=produtos.filter(p=>String(p.codigo)===termo||p.codigo_barras===termo||p.descricao.toLocaleLowerCase("pt-BR").includes(termo)).slice(0,15);
    if(!candidatos.length){setTrocaPDVErro("Produto não encontrado no cadastro.");setTrocaPDVResultados([]);return;}
    setTrocaPDVProdutoLivre(candidatos.length===1?candidatos[0]:null);
    setTrocaPDVCarregando(true);setTrocaPDVErro("");
    try{
      const {data:itens,error}=await supabase.from("venda_itens").select("id,venda_id,produto_id,descricao,quantidade,preco_unitario").in("produto_id",candidatos.map(p=>p.id)).limit(200);
      if(error)throw new Error(error.message);
      const ids=Array.from(new Set((itens||[]).map(i=>String(i.venda_id))));
      if(!ids.length){setTrocaPDVResultados([]);return;}
      const {data:vendas,error:erroVendas}=await supabase.from("vendas").select("id,numero,empresa_id,situacao,criada_em,total,subtotal,cliente_id").eq("empresa_id",empresaId).eq("situacao","concluida").in("id",ids).limit(200);
      if(erroVendas)throw new Error(erroVendas.message);
      const mapa=new Map((vendas||[]).map(v=>[String(v.id),v]));
      setTrocaPDVResultados((itens||[]).filter(i=>mapa.has(String(i.venda_id))).map(i=>({...i,venda:mapa.get(String(i.venda_id))})).sort((a,b)=>new Date(String((b.venda as Record<string,unknown>)?.criada_em)).getTime()-new Date(String((a.venda as Record<string,unknown>)?.criada_em)).getTime()).slice(0,40));
    }catch(e){setTrocaPDVErro(e instanceof Error?e.message:"Não foi possível consultar as vendas.");}
    finally{setTrocaPDVCarregando(false);}
  }
  async function selecionarDevolucaoPDV(item:Record<string,unknown>){
    if(!supabase)return;
    setTrocaPDVCarregando(true);setTrocaPDVErro("");
    try{
      const venda=item.venda as Record<string,unknown>;
      const {data,error}=await supabase.rpc("evolux_saldo_troca",{p_venda_id:String(venda.id)});
      if(error)throw new Error(error.message);
      const saldo=(data||[]).find((i: {venda_item_id: string | number; quantidade_disponivel: number})=>String(i.venda_item_id)===String(item.id));
      if(!saldo||Number(saldo.quantidade_disponivel)<=0)throw new Error("Este item não possui quantidade disponível para devolução.");
      setTrocaPDVItem({...item,saldo:Number(saldo.quantidade_disponivel)});setTrocaPDVVenda(venda);setTrocaPDVSemVenda(false);setTrocaPDVQtd("1");
    }catch(e){setTrocaPDVErro(e instanceof Error?e.message:"Falha ao verificar a devolução.");}
    finally{setTrocaPDVCarregando(false);}
  }
  function selecionarTrocaSemVenda(produto:Produto){
    setTrocaPDVItem({id:produto.id,produto_id:produto.id,descricao:produto.descricao,preco_unitario:produto.preco_venda,saldo:999999});
    setTrocaPDVProdutoLivre(produto);setTrocaPDVVenda(null);setTrocaPDVSemVenda(true);
    setTrocaPDVQtd("1");setTrocaPDVErro("");
  }
  function confirmarDevolucaoPDV(){
    if(!trocaPDVItem||(!trocaPDVVenda&&!trocaPDVSemVenda))return;
    
    const q=Number(trocaPDVQtd.replace(",","."));
    if(!Number.isFinite(q)||q<=0||q>Number(trocaPDVItem.saldo)){setTrocaPDVErro("Quantidade inválida ou superior ao saldo da venda.");return;}
    setTrocaPDVQtd(String(q));setTrocaPDVAtiva(true);setTrocaPDVBuscaAberta(false);setTrocaPDVFinalizar(false);setCarrinho([]);setBusca("");
    window.requestAnimationFrame(()=>buscaRef.current?.focus());
  }
  function cancelarTrocaPDV(){
    if(!window.confirm("Cancelar esta simulação de troca? Nenhum estoque ou caixa será alterado."))return;
    setTrocaPDVAtiva(false);setTrocaPDVFinalizar(false);setTrocaPDVVenda(null);setTrocaPDVItem(null);setTrocaPDVSemVenda(false);setTrocaPDVProdutoLivre(null);setTrocaPDVMotivo("");
    setTrocaPDVBuscaAberta(false);setCarrinho([]);setProdutoPendente(null);setBusca("");
  }
  const [cancelamentoAberto,setCancelamentoAberto]=useState(false);
  const [cancelamentoBusca,setCancelamentoBusca]=useState("");
  const [cancelamentoData,setCancelamentoData]=useState("");
  const [cancelamentoCaixa,setCancelamentoCaixa]=useState("");
  const [cancelamentoTurno,setCancelamentoTurno]=useState("");
  const [cancelamentoTurnos,setCancelamentoTurnos]=useState<Record<string,unknown>[]>([]);
  const [cancelamentoResultados,setCancelamentoResultados]=useState<Record<string,unknown>[]>([]);
  const [cancelamentoPesquisado,setCancelamentoPesquisado]=useState(false);
  const [cancelamentoListaPagamentos,setCancelamentoListaPagamentos]=useState<Record<string,unknown>[]>([]);
  const [cancelamentoLimite,setCancelamentoLimite]=useState(false);

  const [cancelamentoVenda,setCancelamentoVenda]=useState<Record<string,unknown>|null>(null);
  const [cancelamentoItens,setCancelamentoItens]=useState<Record<string,unknown>[]>([]);
  const [cancelamentoPagamentos,setCancelamentoPagamentos]=useState<Record<string,unknown>[]>([]);
  const [cancelamentoMotivo,setCancelamentoMotivo]=useState("");
  const [cancelamentoCarregando,setCancelamentoCarregando]=useState(false);
  const [cancelamentoSalvando,setCancelamentoSalvando]=useState(false);
  const [cancelamentoErro,setCancelamentoErro]=useState("");
  const [cancelamentoSucesso,setCancelamentoSucesso]=useState("");
  const [adminsCancelamento,setAdminsCancelamento]=useState<{id:string;nome:string}[]>([]);
  const [adminCancelamentoId,setAdminCancelamentoId]=useState("");
  const [adminCancelamentoPin,setAdminCancelamentoPin]=useState("");
  const [mostrarPinCancelamento,setMostrarPinCancelamento]=useState(false);
  const [autorizacaoCancelamentoAberta,setAutorizacaoCancelamentoAberta]=useState(false);
  const [cancelamentoAutorizado,setCancelamentoAutorizado]=useState(false);
  const [validandoAdminCancelamento,setValidandoAdminCancelamento]=useState(false);
  async function carregarAdministradoresCancelamento(){
    if(!supabase)return;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setCancelamentoErro("Sessão expirada. Entre novamente.");return;}
    try{
      const resposta=await fetch("/api/funcionarios",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
      const dados=await resposta.json();
      if(!resposta.ok)throw new Error(dados.error||"Falha ao listar administradores");
      const lista=(dados.usuarios||[]).filter((u:{papel:string;ativo:boolean})=>u.papel==="administrador"&&u.ativo);
      setAdminsCancelamento(lista);setAdminCancelamentoId(lista[0]?.id||"");
    }catch(e){setCancelamentoErro(e instanceof Error?e.message:"Falha ao consultar administradores");}
  }
  async function validarAdministradorCancelamento(){
    if(!supabase||!empresaId||!adminCancelamentoId||adminCancelamentoPin.length<3||validandoAdminCancelamento)return;
    setValidandoAdminCancelamento(true);setCancelamentoErro("");
    try{
      const {data,error}=await supabase.rpc("evolux_verificar_pin_funcionario",{
        p_empresa:empresaId,p_funcionario:adminCancelamentoId,p_pin:adminCancelamentoPin
      });
      if(error)throw new Error("Não foi possível validar o PIN do administrador.");
      const resultado=Array.isArray(data)?data[0]:null;
      if(!resultado?.autorizado||resultado.perfil!=="administrador")throw new Error(resultado?.motivo||"Credenciais de administrador inválidas.");
      setCancelamentoAutorizado(true);
      setAutorizacaoCancelamentoAberta(false);
      setCancelamentoErro("");
    }catch(e){setCancelamentoErro(e instanceof Error?e.message:"Autorização negada.");setAdminCancelamentoPin("");}
    finally{setValidandoAdminCancelamento(false);}
  }
  function abrirCancelamentos(){
    setAdminCancelamentoPin("");setCancelamentoAutorizado(false);setAutorizacaoCancelamentoAberta(false);void carregarAdministradoresCancelamento();
    setCancelamentoAberto(true);setCancelamentoBusca("");setCancelamentoData("");
    setCancelamentoCaixa("");setCancelamentoTurno("");setCancelamentoResultados([]);
    setCancelamentoPesquisado(false);setCancelamentoListaPagamentos([]);setCancelamentoLimite(false);
    setCancelamentoVenda(null);setCancelamentoItens([]);setCancelamentoPagamentos([]);
    setCancelamentoMotivo("");setCancelamentoErro("");setCancelamentoSucesso("");resetarTroca();setOperacaoTroca("cancelamento");
    if(supabase&&empresaId){
      void supabase.from("caixa_turnos").select("id,numero,operador_id").eq("empresa_id",empresaId).limit(1000)
        .then(({data,error})=>{if(!error)setCancelamentoTurnos((data||[]) as Record<string,unknown>[]);});
    }
  }
  function fecharCancelamentos(){if(!cancelamentoSalvando&&!trocaSalvando){setCancelamentoAutorizado(false);setAutorizacaoCancelamentoAberta(false);setAdminCancelamentoPin("");setCancelamentoAberto(false);}}
  const cancelamentoCaixas=Array.from(new Set(cancelamentoTurnos.map(t=>String(t.operador_id||"")).filter(Boolean)));
  const cancelamentoTurnosFiltrados=cancelamentoTurnos.filter(t=>!cancelamentoCaixa||String(t.operador_id)===cancelamentoCaixa);
  const nomeFormaCancelamento=(forma:unknown)=>({dinheiro:"Dinheiro",pix:"PIX",cartao:"Cartão"} as Record<string,string>)[String(forma)]||String(forma);
  function formaCancelamento(venda:Record<string,unknown>){
    const pagamentos=cancelamentoListaPagamentos.filter(p=>String(p.venda_id)===String(venda.id)&&Number(p.valor)>0);
    return pagamentos.length?Array.from(new Set(pagamentos.map(p=>nomeFormaCancelamento(p.forma)))).join(" + "):"Não informado";
  }
  async function localizarVendaCancelamento(){
    if(!supabase||!empresaId||cancelamentoCarregando||cancelamentoSalvando)return;
    const numero=cancelamentoBusca.trim();
    setCancelamentoErro("");setCancelamentoSucesso("");setCancelamentoVenda(null);
    setCancelamentoItens([]);setCancelamentoPagamentos([]);setCancelamentoMotivo("");
    setCancelamentoResultados([]);setCancelamentoPesquisado(false);setCancelamentoLimite(false);
    if(numero&&!/^\d+$/.test(numero)){setCancelamentoErro("Informe um número de recibo válido.");return;}
    setCancelamentoCarregando(true);
    try{
      let consulta=supabase.from("vendas").select("*").eq("empresa_id",empresaId);
      if(numero)consulta=consulta.eq("numero",Number(numero));
      if(cancelamentoData){
        const inicio=new Date(cancelamentoData+"T00:00:00-03:00");
        if(Number.isNaN(inicio.getTime()))throw new Error("Data inválida.");
        const fim=new Date(inicio.getTime()+86400000);
        consulta=consulta.gte("criada_em",inicio.toISOString()).lt("criada_em",fim.toISOString());
      }
      if(cancelamentoTurno)consulta=consulta.eq("caixa_turno_id",cancelamentoTurno);
      else if(cancelamentoCaixa){
        const ids=cancelamentoTurnos.filter(t=>String(t.operador_id)===cancelamentoCaixa).map(t=>String(t.id));
        if(!ids.length){setCancelamentoPesquisado(true);return;}
        consulta=consulta.in("caixa_turno_id",ids);
      }
      const {data,error}=await consulta.order("criada_em",{ascending:false}).limit(501);
      if(error)throw new Error(error.message);
      const vendas=((data||[]) as Record<string,unknown>[]).slice(0,500);
      setCancelamentoLimite((data||[]).length>500);
      setCancelamentoResultados(vendas);setCancelamentoPesquisado(true);
      if(vendas.length){
        const {data:pagamentos,error:erroPagamentos}=await supabase.from("venda_pagamentos")
          .select("venda_id,forma,valor").in("venda_id",vendas.map(v=>String(v.id)));
        if(erroPagamentos)throw new Error("Pagamentos: "+erroPagamentos.message);
        setCancelamentoListaPagamentos((pagamentos||[]) as Record<string,unknown>[]);
      }else setCancelamentoListaPagamentos([]);
    }catch(e){setCancelamentoErro(e instanceof Error?e.message:"Falha ao consultar vendas.");}
    finally{setCancelamentoCarregando(false);}
  }
  async function selecionarVendaCancelamento(venda:Record<string,unknown>){
    if(!supabase||cancelamentoCarregando)return;
    setCancelamentoCarregando(true);setCancelamentoErro("");setCancelamentoSucesso("");
    setCancelamentoVenda(null);setCancelamentoItens([]);setCancelamentoPagamentos([]);setCancelamentoMotivo("");setAutorizacaoCancelamentoAberta(false);setCancelamentoAutorizado(false);setAdminCancelamentoPin("");
    try{
      const [vendaAtual,itens,pagamentosVenda]=await Promise.all([
        supabase.from("vendas").select("*").eq("id",String(venda.id)).eq("empresa_id",empresaId).single(),
        supabase.from("venda_itens").select("id,descricao,quantidade,preco_unitario,subtotal").eq("venda_id",String(venda.id)),
        supabase.from("venda_pagamentos").select("id,forma,valor").eq("venda_id",String(venda.id))
      ]);
      if(vendaAtual.error)throw new Error(vendaAtual.error.message);
      if(itens.error)throw new Error("Itens: "+itens.error.message);
      if(pagamentosVenda.error)throw new Error("Pagamentos: "+pagamentosVenda.error.message);
      setCancelamentoVenda(vendaAtual.data as Record<string,unknown>);
      setCancelamentoItens((itens.data||[]) as Record<string,unknown>[]);
      setCancelamentoPagamentos((pagamentosVenda.data||[]) as Record<string,unknown>[]);
      if(operacaoTroca==="cancelamento"&&String(vendaAtual.data.situacao)==="concluida"){setCancelamentoErro("");setAutorizacaoCancelamentoAberta(true);}
      if(operacaoTroca==="troca")void carregarSaldoTroca(vendaAtual.data as Record<string,unknown>);
    }catch(e){setCancelamentoErro(e instanceof Error?e.message:"Falha ao carregar a venda.");}
    finally{setCancelamentoCarregando(false);}
  }
  async function confirmarCancelamentoVenda(autorizadoAgora=false){
    if(!supabase||!cancelamentoVenda||cancelamentoSalvando||cancelamentoMotivo.trim().length<5||!(cancelamentoAutorizado||autorizadoAgora)||!adminCancelamentoId||adminCancelamentoPin.length<3||String(cancelamentoVenda.situacao)!=="concluida")return;
    const numero=String(cancelamentoVenda.numero);

    setCancelamentoSalvando(true);setCancelamentoErro("");
    try{
      const {data,error}=await supabase.rpc("evolux_cancelar_venda_autorizada",{p_venda_id:String(cancelamentoVenda.id),p_motivo:cancelamentoMotivo.trim(),p_administrador:adminCancelamentoId,p_pin:adminCancelamentoPin});
      if(error)throw new Error(error.message);
      if(!data?.sucesso)throw new Error(data?.erro||"O banco não confirmou o cancelamento. Consulte a venda antes de tentar novamente.");
      setCancelamentoVenda(v=>v?{...v,situacao:"cancelada"}:null);
      setCancelamentoResultados(atuais=>atuais.map(v=>String(v.id)===String(cancelamentoVenda.id)?{...v,situacao:"cancelada"}:v));
      setCancelamentoSucesso(`Venda #${numero} cancelada. Estoque devolvido; estorno financeiro pendente.`);setAutorizacaoCancelamentoAberta(false);setCancelamentoAutorizado(false);setCancelamentoVenda(null);
      setHistoricoVendas(atuais=>atuais.map(v=>String(v.id)===String(cancelamentoVenda.id)?{...v,situacao:"cancelada"}:v));
      // Os produtos exibidos na tela de venda devem ser recarregados do banco.
      if(empresaId){const consulta=await carregarProdutosAtivos(supabase,empresaId,"id,codigo,descricao,codigo_barras,preco_custo,preco_venda,estoque_atual,ativo");if(!consulta.error)setProdutos((consulta.data||[]) as Produto[]);}
    }catch(e){setCancelamentoErro(e instanceof Error?e.message:"Falha ao cancelar. Verifique a situação da venda antes de tentar novamente.");}
    finally{setCancelamentoSalvando(false);setAdminCancelamentoPin("");}
  }
  // EVOLUX 24.6 — Trocas / devolução parcial. A RPC faz toda a validação e movimentação.
  const [operacaoTroca,setOperacaoTroca]=useState<"cancelamento"|"troca">("cancelamento");
  const [trocaSaldo,setTrocaSaldo]=useState<Record<string,unknown>[]>([]);
  const [trocaQuantidades,setTrocaQuantidades]=useState<Record<string,string>>({});
  const [trocaCondicoes,setTrocaCondicoes]=useState<Record<string,string>>({});
  const [trocaNovos,setTrocaNovos]=useState<{produto_id:string;quantidade:string}[]>([]);
  const [trocaProdutoEscolhido,setTrocaProdutoEscolhido]=useState("");
  const [trocaBuscaProduto,setTrocaBuscaProduto]=useState("");
  const [trocaSugestoesAbertas,setTrocaSugestoesAbertas]=useState(false);
  const [trocaQuantidadeNova,setTrocaQuantidadeNova]=useState("1");
  const [trocaMotivo,setTrocaMotivo]=useState("");
  const [trocaDestino,setTrocaDestino]=useState<"credito"|"reembolso">("reembolso");
  const [trocaForma,setTrocaForma]=useState<"dinheiro"|"pix"|"cartao">("dinheiro");
  const [trocaCarregando,setTrocaCarregando]=useState(false);
  const [trocaSalvando,setTrocaSalvando]=useState(false);
  const [trocaErro,setTrocaErro]=useState("");
  const [trocaSucesso,setTrocaSucesso]=useState("");
  const trocaChaveRef=useRef<string|null>(null);
  const trocaBloqueadaRef=useRef(false);
  function resetarTroca(){
    setTrocaSaldo([]);setTrocaQuantidades({});setTrocaCondicoes({});setTrocaNovos([]);
    setTrocaProdutoEscolhido("");setTrocaBuscaProduto("");setTrocaSugestoesAbertas(false);setTrocaQuantidadeNova("1");setTrocaMotivo("");
    setTrocaDestino("reembolso");setTrocaForma("dinheiro");setTrocaErro("");setTrocaSucesso("");
    trocaChaveRef.current=null;trocaBloqueadaRef.current=false;
  }
  async function carregarSaldoTroca(venda:Record<string,unknown>){
    if(!supabase)return;
    resetarTroca();setTrocaCarregando(true);
    const {data,error}=await supabase.rpc("evolux_saldo_troca",{p_venda_id:String(venda.id)});
    if(error)setTrocaErro("Não foi possível consultar o saldo para troca: "+error.message);
    else setTrocaSaldo((data||[]) as Record<string,unknown>[]);
    setTrocaCarregando(false);
  }
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const trocaDevolvidos=trocaSaldo.filter(i=>Number(trocaQuantidades[String(i.venda_item_id)]||0)>0).map(i=>({
    venda_item_id:String(i.venda_item_id),quantidade:Number(trocaQuantidades[String(i.venda_item_id)]),
    condicao:trocaCondicoes[String(i.venda_item_id)]||"bom"
  }));
  const trocaNovosValidos=trocaNovos.map(n=>({produto_id:n.produto_id,quantidade:Number(n.quantidade)}));
  const trocaEscala=cancelamentoVenda&&Number(cancelamentoVenda.subtotal)>0?Number(cancelamentoVenda.total)/Number(cancelamentoVenda.subtotal):1;
  const trocaValorDevolvido=trocaDevolvidos.reduce((acc,i)=>{
    return acc+Math.round(i.quantidade*Number(cancelamentoItens.find(x=>String(x.id)===i.venda_item_id)?.preco_unitario||0)*trocaEscala*100)/100;
  },0);
  const trocaValorNovo=trocaNovosValidos.reduce((acc,i)=>acc+Math.round(i.quantidade*Number(produtos.find(p=>p.id===i.produto_id)?.preco_venda||0)*100)/100,0);
  const trocaDiferenca=Math.round((trocaValorNovo-trocaValorDevolvido)*100)/100;
  const trocaValida=trocaDevolvidos.length>0&&trocaMotivo.trim().length>=5&&trocaMotivo.length<=1000&&
    trocaDevolvidos.every(i=>Number.isFinite(i.quantidade)&&i.quantidade>0&&i.quantidade<=Number(trocaSaldo.find(x=>String(x.venda_item_id)===i.venda_item_id)?.quantidade_disponivel||0))&&
    trocaNovosValidos.every(i=>Number.isFinite(i.quantidade)&&i.quantidade>0&&!!produtos.find(p=>p.id===i.produto_id))&&
    !(trocaDiferenca<0&&trocaDestino==="credito"&&!cancelamentoVenda?.cliente_id)&&
    !(trocaDiferenca>0&&!turno)&&!(trocaDiferenca<0&&trocaDestino==="reembolso"&&trocaForma==="dinheiro"&&!turno);
  const trocaBuscaNormalizada=trocaBuscaProduto.trim().toLocaleLowerCase("pt-BR");
  const trocaSugestoes=trocaBuscaNormalizada?produtos.filter(p=>
    String(p.codigo)===trocaBuscaNormalizada || (p.codigo_barras||"").toLowerCase()===trocaBuscaNormalizada ||
    p.descricao.toLocaleLowerCase("pt-BR").includes(trocaBuscaNormalizada) ||
    String(p.codigo).includes(trocaBuscaNormalizada) || (p.codigo_barras||"").includes(trocaBuscaNormalizada)
  ).slice(0,8):[];
  function adicionarProdutoTrocaSelecionado(p:Produto){
    const q=Number(trocaQuantidadeNova);
    if(!Number.isFinite(q)||q<=0){setTrocaErro("Informe uma quantidade válida para o novo produto.");return;}
    const jaAdicionado=trocaNovos.filter(n=>n.produto_id===p.id).reduce((a,n)=>a+Number(n.quantidade),0);
    if(q+jaAdicionado>Number(p.estoque_atual)){setTrocaErro("Estoque insuficiente para adicionar esta quantidade.");return;}
    setTrocaNovos(atuais=>[...atuais,{produto_id:p.id,quantidade:String(q)}]);
    setTrocaProdutoEscolhido("");setTrocaBuscaProduto("");setTrocaSugestoesAbertas(false);setTrocaQuantidadeNova("1");setTrocaErro("");
    trocaChaveRef.current=null;
  }
  function selecionarProdutoTroca(p:Produto){
    // Ao escolher uma sugestão, o item já entra na troca e no cálculo financeiro.
    adicionarProdutoTrocaSelecionado(p);
  }
  function localizarCodigoTroca(){
    const termo=trocaBuscaProduto.trim();
    const exato=produtos.find(p=>String(p.codigo)===termo||(p.codigo_barras||"")===termo);
    if(exato){adicionarProdutoTrocaSelecionado(exato);return;}
    if(trocaSugestoes.length===1){adicionarProdutoTrocaSelecionado(trocaSugestoes[0]);return;}
    setTrocaErro(trocaSugestoes.length?"Selecione o produto nos resultados da pesquisa.":"Produto não encontrado. Confira o código ou a descrição.");
    setTrocaSugestoesAbertas(true);
  }
  function adicionarProdutoTroca(){
    const p=produtos.find(x=>x.id===trocaProdutoEscolhido);
    if(p){adicionarProdutoTrocaSelecionado(p);return;}
    localizarCodigoTroca();
  }
  async function confirmarTroca(){
    if(!supabase||!cancelamentoVenda||!trocaValida||trocaSalvando||trocaBloqueadaRef.current)return;
    if(!window.confirm(`Confirmar a troca da venda #${String(cancelamentoVenda.numero)}?\nDiferença: ${dinheiro(Math.abs(trocaDiferenca))}.\nA operação movimentará o estoque e não poderá ser desfeita nesta tela.`))return;
    if(!trocaChaveRef.current)trocaChaveRef.current=crypto.randomUUID();
    trocaBloqueadaRef.current=true;setTrocaSalvando(true);setTrocaErro("");
    try{
      const {data,error}=await supabase.rpc("evolux_executar_troca",{
        p_venda_id:String(cancelamentoVenda.id),p_devolvidos:trocaDevolvidos,p_novos:trocaNovosValidos,
        p_motivo:trocaMotivo.trim(),p_destino:trocaDiferenca<0?trocaDestino:null,
        p_forma:trocaDiferenca!==0&&(trocaDiferenca>0||trocaDestino==="reembolso")?trocaForma:null,
        p_caixa_turno_id:turno?.id||null,p_chave_operacao:trocaChaveRef.current
      });
      if(error){const erroNovo=new Error(error.message) as Error&{codigo?:string};erroNovo.codigo=error.code;throw erroNovo;}
      if(!data?.sucesso)throw new Error("O banco não confirmou a operação. Consulte as trocas antes de tentar novamente.");
      setTrocaSucesso(`Troca registrada! Código ${String(data.troca_id).slice(0,8)}. ${trocaDiferenca<0?(trocaDestino==="credito"?"Crédito gerado.":"Reembolso pendente de confirmação."):trocaDiferenca>0?"Diferença registrada.":"Sem diferença financeira."}`);
      const consulta=await carregarProdutosAtivos(supabase,empresaId,"id,codigo,descricao,codigo_barras,preco_custo,preco_venda,estoque_atual,ativo");
      if(!consulta.error)setProdutos((consulta.data||[]) as Produto[]);
    }catch(e){
      setTrocaErro(e instanceof Error?e.message:"Não foi possível registrar a troca.");
      if((e as {codigo?:string})?.codigo==="P0001"){trocaChaveRef.current=null;trocaBloqueadaRef.current=false;}
      // Falha de conexão/resposta incerta: manter chave e bloquear nova tentativa para evitar duplicidade.
    }finally{setTrocaSalvando(false);}
  }
  const [historicoAberto,setHistoricoAberto] = useState(false);
  const [historicoPeriodo,setHistoricoPeriodo] = useState<"turno"|"hoje"|"canceladas">("turno");
  const [historicoBusca,setHistoricoBusca] = useState("");
  const [historicoCarregando,setHistoricoCarregando] = useState(false);
  const [historicoErro,setHistoricoErro] = useState("");
  const [historicoVendas,setHistoricoVendas] = useState<Record<string,unknown>[]>([]);
  const [historicoDetalhe,setHistoricoDetalhe] = useState<Record<string,unknown>|null>(null);
  const [historicoItens,setHistoricoItens] = useState<Record<string,unknown>[]>([]);
  const [historicoPagamentos,setHistoricoPagamentos] = useState<Record<string,unknown>[]>([]);
  const [historicoPagamentosLista,setHistoricoPagamentosLista] = useState<Record<string,unknown>[]>([]);
  const [historicoPagamentosErro,setHistoricoPagamentosErro] = useState("");
  const [historicoImprimindo,setHistoricoImprimindo] = useState<string|null>(null);
  const [historicoImpressaoErro,setHistoricoImpressaoErro] = useState("");
  const [historicoDetalheCarregando,setHistoricoDetalheCarregando] = useState(false);
  const [historicoDetalheErro,setHistoricoDetalheErro] = useState("");
  // Etapa 24.4.3.2: correção auditada de pagamentos via RPC segura.
  const [pinAcao,setPinAcao]=useState<"apagar"|"pagamento"|"cancelar_lancamento"|null>(null);
  const [pinAdmins,setPinAdmins]=useState<{id:string;nome:string}[]>([]);
  const [pinAdminId,setPinAdminId]=useState("");
  const [pinValor,setPinValor]=useState("");
  const [pinErro,setPinErro]=useState("");
  const [pinProcessando,setPinProcessando]=useState(false);
  const [pinMostrar,setPinMostrar]=useState(false);
  const [pinItemId,setPinItemId]=useState("");
  const [pagamentoPendente,setPagamentoPendente]=useState<Record<string,unknown>|null>(null);
  const [pagamentoCredencial,setPagamentoCredencial]=useState<{administrador:string;pin:string;vendaId:string}|null>(null);
  async function pedirAutorizacao(acao:"apagar"|"pagamento"|"cancelar_lancamento",produtoId=""){
    if(!supabase||!empresaId)return;
    setPinAcao(acao);setPinItemId(produtoId);setPinValor("");setPinErro("");setPinAdmins([]);setPinAdminId("");setPinMostrar(false);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error("Sessão expirada.");
      const resposta=await fetch("/api/funcionarios",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
      const dados=await resposta.json();
      if(!resposta.ok)throw new Error(dados.error||"Não foi possível consultar administradores.");
      const admins=(dados.usuarios||[]).filter((u:{papel:string;ativo:boolean})=>u.papel==="administrador"&&u.ativo);
      if(!admins.length)throw new Error("Nenhum administrador ativo disponível.");
      setPinAdmins(admins);setPinAdminId(admins[0].id);
    }catch(e){setPinErro(e instanceof Error?e.message:"Falha ao consultar administradores.");}
  }
  async function confirmarAutorizacao(){
    if(!supabase||!pinAcao||!pinAdminId||pinValor.length<3||pinProcessando)return;
    setPinProcessando(true);setPinErro("");
    try{
      if(pinAcao==="apagar"||pinAcao==="cancelar_lancamento"){
        const {data:{session}}=await supabase.auth.getSession();
        if(!session)throw new Error("Sessão expirada.");
        const resposta=await fetch("/api/autorizacao-admin",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({empresaId,administradorId:pinAdminId,pin:pinValor,operacao:pinAcao==="apagar"?"apagar_item":"cancelar_lancamento",produtoId:pinAcao==="apagar"?pinItemId:"carrinho"})
        });
        const dados=await resposta.json();
        if(!resposta.ok||!dados.ok)throw new Error(dados.error||"Autorização negada.");
        if(pinAcao==="apagar"){
          setCarrinho(atual=>atual.filter(l=>l.produto.id!==pinItemId));
          setItemSelecionado(null);
        }else{
          setCarrinho([]);setBusca("");setItemSelecionado(null);setProdutoPendente(null);setTelaVenda(false);
        }
      }else{
        // Primeira etapa: validar PIN, sem alterar pagamentos.
        if(!pagamentoPendente)throw new Error("Venda não selecionada.");
        const {data:validacao,error:erroValidacao}=await supabase.rpc("evolux_verificar_pin_funcionario",{
          p_empresa:empresaId,p_funcionario:pinAdminId,p_pin:pinValor
        });
        if(erroValidacao)throw new Error("Não foi possível validar o PIN.");
        const resultado=Array.isArray(validacao)?validacao[0]:null;
        if(!resultado?.autorizado||resultado.perfil!=="administrador")throw new Error(resultado?.motivo||"PIN de administrador inválido.");
        setPagamentoCredencial({administrador:pinAdminId,pin:pinValor,vendaId:String(pagamentoPendente.id)});
        await abrirCorrecao(pagamentoPendente);
        setPagamentoPendente(null);
      }
      setPinAcao(null);setPinValor("");setPinAdminId("");
    }catch(e){setPinErro(e instanceof Error?e.message:"Autorização negada.");setPinValor("");}
    finally{setPinProcessando(false);}
  }
  const [correcaoVenda,setCorrecaoVenda] = useState<Record<string,unknown>|null>(null);
  const [correcaoAtual,setCorrecaoAtual] = useState<Record<string,unknown>[]>([]);
  const [correcaoValores,setCorrecaoValores] = useState({dinheiro:"",pix:"",cartao:""});
  const [correcaoMotivo,setCorrecaoMotivo] = useState("");
  const [correcaoCarregando,setCorrecaoCarregando] = useState(false);
  const [correcaoSalvando,setCorrecaoSalvando] = useState(false);
  const [correcaoErro,setCorrecaoErro] = useState("");
  const [correcaoSucesso,setCorrecaoSucesso] = useState("");
  const correcaoCentavos = (valor:string) => {
    const limpo=valor.trim();
    if(!limpo)return 0;
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(limpo))return NaN;
    const n=Number(limpo.replace(",","."));
    return Number.isFinite(n)?Math.round(n*100):NaN;
  };
  const correcaoSoma=Object.values(correcaoValores).reduce((a,v)=>a+correcaoCentavos(v),0);
  const correcaoTotal=correcaoVenda?Math.round(Number(correcaoVenda.total||0)*100):0;
  const correcaoValida=!!correcaoVenda&&!correcaoCarregando&&!correcaoSalvando&&Number.isFinite(correcaoSoma)&&correcaoSoma===correcaoTotal&&correcaoTotal>0&&correcaoMotivo.trim().length>=5;
  async function abrirCorrecao(venda:Record<string,unknown>){
    if(!supabase)return;
    setCorrecaoVenda(venda);setCorrecaoAtual([]);setCorrecaoValores({dinheiro:"",pix:"",cartao:""});
    setCorrecaoMotivo("");setCorrecaoErro("");setCorrecaoSucesso("");setCorrecaoCarregando(true);
    const {data,error}=await supabase.from("venda_pagamentos").select("id,forma,valor").eq("venda_id",String(venda.id));
    if(error){setCorrecaoErro("Não foi possível consultar os pagamentos: "+error.message);}
    else{
      const registros=(data||[]) as Record<string,unknown>[];
      setCorrecaoAtual(registros);
      const valores={dinheiro:0,pix:0,cartao:0};
      let desconhecida=false;
      for(const registro of registros){
        const forma=String(registro.forma);
        if(!(forma in valores)){desconhecida=true;continue;}
        valores[forma as keyof typeof valores]+=Math.round(Number(registro.valor||0)*100);
      }
      if(desconhecida)setCorrecaoErro("Esta venda contém uma forma de pagamento ainda não suportada nesta tela. Não é possível corrigi-la aqui.");
      else setCorrecaoValores({dinheiro:valores.dinheiro?(valores.dinheiro/100).toFixed(2).replace(".",","):"",pix:valores.pix?(valores.pix/100).toFixed(2).replace(".",","):"",cartao:valores.cartao?(valores.cartao/100).toFixed(2).replace(".",","):""});
    }
    setCorrecaoCarregando(false);
  }
  async function salvarCorrecao(){
    if(!supabase||!correcaoValida||!correcaoVenda||correcaoErro||correcaoSalvando)return;
    if(!pagamentoCredencial||pagamentoCredencial.vendaId!==String(correcaoVenda.id)){
      setCorrecaoErro("Autorização expirada. Feche e solicite novamente.");return;
    }
    setCorrecaoSalvando(true);setCorrecaoErro("");
    try{
      const {data,error}=await supabase.rpc("evolux_corrigir_pagamento_autorizado",{
        p_venda_id:String(correcaoVenda.id),
        p_pagamentos:{dinheiro:correcaoCentavos(correcaoValores.dinheiro)/100,pix:correcaoCentavos(correcaoValores.pix)/100,cartao:correcaoCentavos(correcaoValores.cartao)/100},
        p_motivo:correcaoMotivo.trim(),
        p_administrador:pagamentoCredencial.administrador,
        p_pin:pagamentoCredencial.pin
      });
      setPagamentoCredencial(null);
      if(error)throw new Error(error.message);
      if(!data?.sucesso)throw new Error(data?.erro||"O banco não confirmou a correção.");
      setCorrecaoSucesso("Pagamento corrigido e auditado com autorização do administrador.");
      const {data:atualizados,error:erroLeitura}=await supabase.from("venda_pagamentos").select("id,forma,valor").eq("venda_id",String(correcaoVenda.id));
      if(!erroLeitura){
        setCorrecaoAtual((atualizados||[]) as Record<string,unknown>[]);
        setHistoricoPagamentosLista(atuais=>[...atuais.filter(p=>String(p.venda_id)!==String(correcaoVenda.id)),...(atualizados||[]).map(p=>({...p,venda_id:String(correcaoVenda.id)}))]);
        if(historicoDetalhe&&String(historicoDetalhe.id)===String(correcaoVenda.id))setHistoricoPagamentos((atualizados||[]) as Record<string,unknown>[]);
      }
    }catch(e){setCorrecaoErro((e instanceof Error?e.message:"Não foi possível corrigir o pagamento.")+" Feche e solicite uma nova autorização.");}
    finally{setCorrecaoSalvando(false);}
  }
  function fecharCorrecao(){
    if(correcaoSalvando)return;
    setCorrecaoVenda(null);setCorrecaoErro("");setCorrecaoSucesso("");setPagamentoCredencial(null);
  }
  const historicoCampo = (registro:Record<string,unknown>,...nomes:string[]) => nomes.map(n=>registro[n]).find(v=>v!==null&&v!==undefined&&String(v)!=="");
  const historicoData = (registro:Record<string,unknown>) => String(historicoCampo(registro,"criada_em","created_at","data_venda","realizada_em","data","vendido_em")||"");
  const historicoValor = (registro:Record<string,unknown>,...nomes:string[]) => Number(historicoCampo(registro,...nomes)||0);
  const historicoNumero = (registro:Record<string,unknown>) => String(historicoCampo(registro,"numero","numero_venda","id")||"—");
  const historicoHorario = (registro:Record<string,unknown>) => {const d=new Date(historicoData(registro));return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});};
  async function carregarHistorico(){
    if(!supabase||!empresaId){setHistoricoErro("Empresa não identificada.");return;}
    setHistoricoCarregando(true);setHistoricoErro("");
    try{
      const {data,error}=await supabase.from("vendas").select("*").eq("empresa_id",empresaId).limit(1000);
      if(error)throw new Error(error.message);
      const vendas=(data||[]) as Record<string,unknown>[];
      setHistoricoVendas(vendas);
      setHistoricoPagamentosErro("");
      if(!vendas.length){setHistoricoPagamentosLista([]);return;}
      const ids=vendas.map(v=>String(v.id||"")).filter(Boolean);
      const consulta=await supabase.from("venda_pagamentos").select("id,venda_id,forma,valor").in("venda_id",ids);
      if(consulta.error){setHistoricoPagamentosLista([]);setHistoricoPagamentosErro("Não foi possível consultar as formas de pagamento: "+consulta.error.message);}
      else setHistoricoPagamentosLista((consulta.data||[]) as Record<string,unknown>[]);
    }catch(e){setHistoricoErro(e instanceof Error?e.message:"Não foi possível consultar as vendas.");}
    finally{setHistoricoCarregando(false);}
  }
  function abrirHistorico(){setHistoricoAberto(true);setHistoricoDetalhe(null);setHistoricoPeriodo(turno?"turno":"hoje");setHistoricoBusca("");void carregarHistorico();}

  async function abrirDetalheHistorico(venda:Record<string,unknown>){
    if(!supabase||!empresaId)return;
    setHistoricoDetalhe(venda);setHistoricoItens([]);setHistoricoPagamentos([]);setHistoricoDetalheErro("");setHistoricoDetalheCarregando(true);
    try{
      const id=String(venda.id||"");
      if(!id)throw new Error("Venda sem identificador para consultar os itens.");
      const [itens,pagamentosVenda]=await Promise.all([
        supabase.from("venda_itens").select("*").eq("venda_id",id),
        supabase.from("venda_pagamentos").select("*").eq("venda_id",id)
      ]);
      if(itens.error)throw new Error("Itens: "+itens.error.message);
      if(pagamentosVenda.error)throw new Error("Pagamentos: "+pagamentosVenda.error.message);
      const lista=(itens.data||[]) as Record<string,unknown>[];
      const ids=Array.from(new Set(lista.map(i=>String(i.produto_id||"")).filter(Boolean)));
      let nomes=new Map<string,string>();
      if(ids.length){
        const consulta=await supabase.from("produtos").select("id,descricao").eq("empresa_id",empresaId).in("id",ids);
        if(!consulta.error)nomes=new Map((consulta.data||[]).map(p=>[String(p.id),String(p.descricao)]));
      }
      setHistoricoItens(lista.map(i=>({...i,descricao_exibicao:String(historicoCampo(i,"descricao","descricao_produto","produto_descricao")||nomes.get(String(i.produto_id))||"Produto")})));
      setHistoricoPagamentos((pagamentosVenda.data||[]) as Record<string,unknown>[]);
    }catch(e){setHistoricoDetalheErro(e instanceof Error?e.message:"Falha ao consultar detalhes.");}
    finally{setHistoricoDetalheCarregando(false);}
  }
  function formaPagamentoHistorico(venda:Record<string,unknown>){
    const registros=historicoPagamentosLista.filter(p=>String(p.venda_id)===String(venda.id)&&Number(p.valor)>0);
    if(!registros.length)return "Não informado";
    const nomes:Record<string,string>={dinheiro:"Dinheiro",pix:"PIX",cartao:"Cartão"};
    return Array.from(new Set(registros.map(p=>nomes[String(p.forma)]||String(p.forma)))).join(" + ");
  }
  async function reimprimirHistorico(venda:Record<string,unknown>){
    if(!supabase||!empresaId||historicoImprimindo)return;
    const id=String(venda.id||"");
    if(!id)return;
    // Abrir na ação do clique evita bloqueio de pop-ups após as consultas assíncronas.
    const janela=window.open("","_blank","width=430,height=720");
    if(!janela){setHistoricoImpressaoErro("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");return;}
    janela.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Preparando segunda via</title></head><body style="font:14px Arial;padding:20px">Preparando segunda via do recibo...</body></html>');
    janela.document.close();
    setHistoricoImprimindo(id);setHistoricoImpressaoErro("");
    try{
      const [itensConsulta,pagamentosConsulta]=await Promise.all([
        supabase.from("venda_itens").select("*").eq("venda_id",id),
        supabase.from("venda_pagamentos").select("*").eq("venda_id",id)
      ]);
      if(itensConsulta.error)throw new Error("Itens: "+itensConsulta.error.message);
      if(pagamentosConsulta.error)throw new Error("Pagamentos: "+pagamentosConsulta.error.message);
      const registros=(itensConsulta.data||[]) as Record<string,unknown>[];
      const pagos=(pagamentosConsulta.data||[]) as Record<string,unknown>[];
      if(!registros.length||!pagos.length)throw new Error("Itens ou pagamentos não encontrados. Não é seguro imprimir a segunda via.");
      const totalVenda=historicoValor(venda,"total","valor_total");
      const somaPagamentos=pagos.reduce((a,p)=>a+Math.round(Number(p.valor||0)*100),0);
      if(somaPagamentos!==Math.round(totalVenda*100))throw new Error("Os pagamentos registrados não conferem com o total da venda.");
      const itensRecibo=registros.map(i=>({
        descricao:String(historicoCampo(i,"descricao","descricao_produto","produto_descricao")||"Produto"),
        quantidade:historicoValor(i,"quantidade","qtd"),
        preco:historicoValor(i,"preco_unitario","preco_venda","preco")
      }));
      const subtotalCalculado=itensRecibo.reduce((a,i)=>a+Math.round(i.preco*100)*i.quantidade,0)/100;
      const subtotalBanco=historicoCampo(venda,"subtotal","valor_subtotal");
      const subtotalRecibo=subtotalBanco===undefined?subtotalCalculado:Number(subtotalBanco);
      if(Math.round(subtotalCalculado*100)!==Math.round(subtotalRecibo*100))throw new Error("Os itens não conferem com o subtotal da venda.");
      const descontoBanco=historicoCampo(venda,"desconto","valor_desconto");
      const descontoRecibo=descontoBanco===undefined?subtotalRecibo-totalVenda:Number(descontoBanco);
      if(Math.round((subtotalRecibo-descontoRecibo)*100)!==Math.round(totalVenda*100))throw new Error("Subtotal, desconto e total não conferem.");
      const dataVendaHistorico=historicoHorario(venda);
      const pagamentosRecibo={dinheiro:0,pix:0,cartao:0};
      for(const p of pagos){
        const forma=String(p.forma);
        if(!(forma in pagamentosRecibo))throw new Error("Forma de pagamento não suportada na impressão: "+forma);
        pagamentosRecibo[forma as keyof typeof pagamentosRecibo]+=Number(p.valor||0);
      }
      const v={
        numero:Number(historicoNumero(venda)),total:totalVenda,troco:0,subtotal:subtotalRecibo,
        desconto:descontoRecibo,data:dataVendaHistorico,itens:itensRecibo,
        cliente:"Consumidor não identificado",pagamentos:pagamentosRecibo
      };
      const turnoHistorico="—";
      const operadorHistorico="Não informado";
    const escapar=(texto:string)=>texto.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    const valor=(n:number)=>dinheiro(n);
    const campo=(...nomes:string[])=>nomes.map(nome=>dadosEmpresaCupom[nome]).find(v=>v!==null&&v!==undefined&&String(v).trim()!=="")?.toString().trim()||"";
    const cnpj=campo("cnpj","cpf_cnpj");
    const telefone=campo("telefone","telefone1","telefone_principal","celular","whatsapp");
    const logradouro=campo("logradouro","endereco","rua");
    const numero=campo("numero","numero_endereco");
    const complemento=campo("complemento");
    const bairro=campo("bairro");
    const cidade=campo("cidade","municipio");
    const uf=campo("uf","estado");
    const cep=campo("cep");
    const enderecoLinha=[logradouro,numero,complemento,bairro].filter(Boolean).join(", ");
    const localLinha=[cidade,uf].filter(Boolean).join("/")+(cep?` • CEP ${cep}`:"");
    const cabecalho=[cnpj?`<div>CNPJ: ${escapar(cnpj)}</div>`:"",enderecoLinha?`<div>${escapar(enderecoLinha)}</div>`:"",localLinha?`<div>${escapar(localLinha)}</div>`:"",telefone?`<div>Tel.: ${escapar(telefone)}</div>`:""].join("");
    const dataHora=v.data.split(", ");
    const dataVenda=dataHora[0]||v.data;
    const horaVenda=dataHora[1]||"";
    const cliente=v.cliente&&v.cliente!=="Consumidor não identificado"?`<div>Cliente: ${escapar(v.cliente)}</div>`:"";
    const itens=v.itens.map((i,indice)=>`<div class="item"><div class="descricao">${String(indice+1).padStart(2,"0")} ${escapar(i.descricao)}</div><div class="calculo">${i.quantidade} UN × ${valor(i.preco)} = ${valor(i.quantidade*i.preco)}</div></div>`).join("");
    const formas=([['Dinheiro',v.pagamentos.dinheiro],['PIX',v.pagamentos.pix],['Cartão crédito/débito',v.pagamentos.cartao]] as const).filter(([,n])=>n>0).map(([nome,n])=>`<div class="linha"><span>${nome}</span><span>${valor(n)}</span></div>`).join("");
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Cupom de venda #${v.numero}</title><style>
      @page{size:80mm auto;margin:2mm}
      *{box-sizing:border-box}
      body{font:12px/1.12 Arial,Helvetica,sans-serif;color:#000;background:#fff;margin:0 auto;padding:0;width:76mm}
      .empresa{text-align:center;line-height:1.12}.empresa h1{font-size:17px;line-height:1.1;margin:0;font-weight:800}
      .separador{border-top:1px dashed #555;margin:3px 0 2px}
      .linha{display:flex;justify-content:space-between;align-items:baseline;gap:5px;margin:0;padding:0;line-height:1.15}
      .linha span:last-child{white-space:nowrap}
      .descricao{font-weight:700;overflow-wrap:anywhere;line-height:1.12}
      .calculo{text-align:right;white-space:nowrap;font-size:11.5px;line-height:1.12}
      .item{margin:0 0 2px}
      .totais{font-size:13px;line-height:1.15}
      .total{font-size:16px;font-weight:800;line-height:1.18}
      .rodape{text-align:center;font-size:11px;font-weight:700;margin-top:2px}
      @media screen{body{margin:12px auto;padding:3mm;box-shadow:0 0 8px #aaa;min-height:150px;width:80mm}}
      @media print{body{width:76mm;margin:0;padding:0}}
      </style></head><body>
      <div class="empresa"><h1>${escapar(empresa)}</h1>${cabecalho}</div>
      <div class="separador"></div>
      <div class="linha"><strong>VENDA ${String(v.numero).padStart(6,"0")}</strong><span>${escapar(dataVenda)}</span></div>
      <div>Terminal 01 | Turno ${turnoHistorico}${horaVenda?` | ${escapar(horaVenda)}`:""}</div>
      <div>Operador: ${escapar(operadorHistorico)}</div>${cliente}
      <div class="separador"></div>${itens}
      <div class="separador"></div>
      <div class="totais"><div class="linha"><span>Subtotal</span><span>${valor(v.subtotal)}</span></div>
      <div class="linha"><span>Desconto</span><span>- ${valor(v.desconto)}</span></div>
      <div class="linha total"><span>TOTAL</span><span>${valor(v.total)}</span></div></div>
      <div class="separador"></div>${formas}
      <div class="separador"></div><div class="rodape">OBRIGADO PELA PREFERÊNCIA!</div>
      <script>window.addEventListener('load',()=>{window.focus();window.print();});<\/script></body></html>`;
      if(janela.closed)throw new Error("A janela de impressão foi fechada.");
      janela.document.open();janela.document.write(html);janela.document.close();
    }catch(e){
      const mensagem=e instanceof Error?e.message:"Não foi possível preparar a segunda via.";
      setHistoricoImpressaoErro(mensagem);
      if(!janela.closed){janela.document.open();janela.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="font:14px Arial;padding:20px"><strong>Não foi possível imprimir.</strong><p>Verifique a mensagem no PDV e tente novamente.</p></body></html>');janela.document.close();}
    }finally{setHistoricoImprimindo(null);}
  }
  const historicoFiltrado = historicoVendas.filter(v=>{
    const d=new Date(historicoData(v));
    if(Number.isNaN(d.getTime()))return false;
    // O banco registra criada_em em UTC; comparar pelo dia civil de Brasília.
    // dataAtual é preenchida no useEffect, evitando new Date() na renderização.
    if(!dataAtual || d.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})!==dataAtual)return false;
    if(historicoPeriodo==="turno"&&(!turno||String(historicoCampo(v,"caixa_turno_id","turno_id")||"")!==turno.id))return false;
    if(historicoPeriodo==="canceladas" ? String(v.situacao)!=="cancelada" : String(v.situacao)!=="concluida")return false;
    const termo=historicoBusca.trim().toLocaleLowerCase("pt-BR");
    return !termo||historicoNumero(v).toLocaleLowerCase("pt-BR").includes(termo)||String(historicoCampo(v,"cliente_nome","nome_cliente")||"").toLocaleLowerCase("pt-BR").includes(termo);
  }).sort((a,b)=>new Date(historicoData(b)).getTime()-new Date(historicoData(a)).getTime());
  const historicoTotal=historicoFiltrado.reduce((a,v)=>a+historicoValor(v,"total","valor_total"),0);

  const [operador, setOperador] = useState("ADMINISTRADOR");
  const [perfilFuncionario, setPerfilFuncionario] = useState<"administrador"|"vendedor"|null>(null);
  const [empresaId, setEmpresaId] = useState("");
  useEffect(()=>{
    if(!empresaId)return;
    const acao=new URLSearchParams(window.location.search).get("acao");
    if(acao==="consulta")abrirHistorico();
    if(acao==="cancelamento")abrirCancelamentos();
    if(acao==="consulta"||acao==="cancelamento")window.history.replaceState(null,"",window.location.pathname);
  // Executar apenas quando a empresa for identificada.
  },[empresaId]);
  const [empresa, setEmpresa] = useState("EVOLUX");
  const [dadosEmpresaCupom,setDadosEmpresaCupom] = useState<Record<string,unknown>>({});
  const [carrinho, setCarrinho] = useState<Linha[]>([]);
  const [modalOperacao,setModalOperacao] = useState<"pagamento"|"devolucao"|null>(null);
  const [pagamentos,setPagamentos] = useState({dinheiro:"",pix:"",cartao:"",debito:"",credito:""});
  const [cartaoModalidade,setCartaoModalidade] = useState<"debito"|"credito">("debito");
  const [cartaoBandeira,setCartaoBandeira] = useState("visa");
  const [bandeiraDebito,setBandeiraDebito] = useState("visa");
  const [bandeiraCredito,setBandeiraCredito] = useState("visa");
  const [cartaoParcelas,setCartaoParcelas] = useState<1|2|3>(1);
  // Janela de configuração de cartão, independente da janela principal de pagamento.
  const [configurandoCartao,setConfigurandoCartao] = useState<"debito"|"credito"|null>(null);
  const [cartoesConfigurados,setCartoesConfigurados] = useState({debito:false,credito:false});
  const [descontoPagamento,setDescontoPagamento] = useState("");
  const [descontoTipo,setDescontoTipo] = useState<"valor"|"percentual">("valor");
  const [finalizandoVenda,setFinalizandoVenda] = useState(false);
  const finalizandoRef = useRef(false);
  const [erroPagamento,setErroPagamento] = useState("");
  const [vendaConfirmada,setVendaConfirmada] = useState<{numero:number;total:number;troco:number;subtotal:number;desconto:number;data:string;itens:{descricao:string;quantidade:number;preco:number}[];cliente:string;pagamentos:{dinheiro:number;pix:number;cartao:number}}|null>(null);
  const chaveVendaRef = useRef<string|null>(null);
  const [operacaoEnviada,setOperacaoEnviada] = useState(false);
  const pagamentoRefs = useRef<Record<string,HTMLInputElement|null>>({});
  const centavos = (valor:string) => {const n=Number(valor.replace(/\./g,"").replace(",","."));return Number.isFinite(n)&&n>0?Math.round(n*100):0;};
  const dinheiroCentavos = (valor:number) => dinheiro(valor/100);

  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState(0);
  const buscaRef = useRef<HTMLInputElement>(null);
  const [tipoBusca, setTipoBusca] = useState<"codigo"|"descricao">("codigo");
  const [itemSelecionado, setItemSelecionado] = useState<string|null>(null);
  const [modalPesquisa, setModalPesquisa] = useState(false);
  const [produtoPendente, setProdutoPendente] = useState<Produto|null>(null);
  const [quantidadePendente, setQuantidadePendente] = useState("1");
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const [modalCliente,setModalCliente] = useState(false);
  const [cadastroRapido,setCadastroRapido] = useState<"produto"|"cliente"|null>(null);
   const [editarRapidoId,setEditarRapidoId] = useState<string|null>(null);
  const [abaBuscaRapida,setAbaBuscaRapida] = useState<"produtos"|"clientes">("produtos");
  const [buscaRapida,setBuscaRapida] = useState("");
  const [indiceRapido,setIndiceRapido] = useState(0);
  const [ordemRapida,setOrdemRapida] = useState("nome");
  const [codigoRapido,setCodigoRapido] = useState("");
  const [clientes,setClientes] = useState<Record<string,unknown>[]>([]);
  const [pesquisaCliente,setPesquisaCliente] = useState("");
  const [erroCliente,setErroCliente] = useState("");
  const [carregandoClientes,setCarregandoClientes] = useState(false);
  const [clienteSelecionado,setClienteSelecionado] = useState<Record<string,unknown>|null>(null);
  const nomeCliente = (c:Record<string,unknown>) => String(c.nome || c.razao_social || c.nome_fantasia || c.nome_completo || "Cliente sem nome");
  const identificacaoCliente = (c:Record<string,unknown>) => String(c.cpf_cnpj || c.cpf || c.cnpj || c.documento || "");
  async function abrirPesquisaCliente(){
    setModalCliente(true);setAbaBuscaRapida("produtos");setBuscaRapida("");setCodigoRapido("");setIndiceRapido(0);setErroCliente("");setPesquisaCliente("");
    if(!supabase||!empresaId){setErroCliente("Empresa ainda não identificada.");return;}
    setCarregandoClientes(true);
    const {data,error}=await supabase.from("clientes").select("*").eq("empresa_id",empresaId).limit(500);
    if(error){setErroCliente("Não foi possível consultar clientes: "+error.message);setClientes([]);}
    else setClientes((data||[]) as Record<string,unknown>[]);
    setCarregandoClientes(false);
  }
  async function atualizarBuscaRapida(){
    if(!supabase||!empresaId)return;
    const [p,c]=await Promise.all([
      carregarProdutosAtivos(supabase,empresaId,"id,codigo,descricao,codigo_barras,preco_custo,preco_venda,estoque_atual,ativo"),
      supabase.from("clientes").select("*").eq("empresa_id",empresaId).eq("ativo",true).limit(500)
    ]);
    if(p.error)setErro("Não foi possível atualizar produtos: "+p.error.message);
    else setProdutos((p.data||[]) as Produto[]);
    if(c.error)setErroCliente("Não foi possível atualizar clientes: "+c.error.message);
    else setClientes((c.data||[]) as Record<string,unknown>[]);
    setBuscaRapida("");setCodigoRapido("");setIndiceRapido(0);
  }
   const produtosRapidos = useMemo(()=>produtos.filter(p=>(!buscaRapida||p.descricao.toLowerCase().includes(buscaRapida.toLowerCase()))&&(!codigoRapido||String(p.codigo).includes(codigoRapido)||(p.codigo_barras||"").includes(codigoRapido))).sort((a,b)=>ordemRapida==="codigo"?a.codigo-b.codigo:a.descricao.localeCompare(b.descricao,"pt-BR")),[produtos,buscaRapida,codigoRapido,ordemRapida]);
   const clientesRapidos = useMemo(()=>clientes.filter(c=>(!buscaRapida||[nomeCliente(c),identificacaoCliente(c),String(c.telefone||""),String(c.email||"")].some(v=>v.toLowerCase().includes(buscaRapida.toLowerCase())))&&(!codigoRapido||String(c.codigo||"").includes(codigoRapido))).sort((a,b)=>ordemRapida==="codigo"?String(a.codigo||"").localeCompare(String(b.codigo||"")):nomeCliente(a).localeCompare(nomeCliente(b),"pt-BR")),[clientes,buscaRapida,codigoRapido,ordemRapida]);
   function confirmarProdutoBuscaRapida(){
     if(abaBuscaRapida!=="produtos")return;
     const p=produtosRapidos[Math.min(indiceRapido,produtosRapidos.length-1)];
     if(!p)return;
     prepararProduto(p);
     setModalCliente(false);
   }
   function editarCadastroRapido(){
     const registro=abaBuscaRapida==="produtos"?produtosRapidos[indiceRapido]:clientesRapidos[indiceRapido];
     if(!registro)return;
     setEditarRapidoId(String(registro.id));setCadastroRapido(abaBuscaRapida==="produtos"?"produto":"cliente");
   }
  function alternarBuscaProduto(){
    setProdutoPendente(null);
    setTipoBusca(atual => atual==="codigo" ? "descricao" : "codigo");
    setModalPesquisa(false);
    setBusca("");
    window.requestAnimationFrame(()=>buscaRef.current?.focus());
  }



  async function iniciarVenda() {
    if (processandoCaixa || abertura) return;
    setErroCaixa("");
    if (!supabase || !empresaId || !usuarioId) {
      setErroCaixa("Aguarde a identificação do operador e da empresa.");
      return;
    }
    setProcessandoCaixa(true);
    let data: {id:string;numero:number;saldo_inicial:number}|null=null;
    try { const resposta=await caixaIndividual("turno");data=resposta.turno; }
    catch(e){setProcessandoCaixa(false);setErroCaixa(e instanceof Error?e.message:"Falha ao consultar o turno");return;}
    setProcessandoCaixa(false);
    if (data) {
      setTurno(data);
      try{
        if(await verificarConferencia(data.id)){setErroCaixa(avisoConferencia);return;}
      }catch(e){setErroCaixa(e instanceof Error?e.message:"Não foi possível verificar o turno.");return;}
      setTelaVenda(true);
    }
    else { setTurno(null); setAbertura("pergunta"); }
  }

  async function abrirCaixa() {
    if (!supabase || !empresaId || !usuarioId || processandoCaixa) return;
    const valor = Number(saldoInicial.trim().replace(/\./g,"").replace(",","."));
    if (!Number.isFinite(valor) || valor < 0 || !temAteDuasCasas(valor)) {
      setErroCaixa("Informe um saldo inicial válido, com até duas casas decimais.");return;
    }
    setProcessandoCaixa(true);setErroCaixa("");
    let data:{id:string;numero:number;saldo_inicial:number};
    try { const resposta=await caixaIndividual("abrir",{saldo_inicial:valor});data=resposta.turno; }
    catch(e){setErroCaixa(e instanceof Error?e.message:"Falha ao abrir o caixa");setProcessandoCaixa(false);return;}
    setTurno(data);setAbertura(null);setProcessandoCaixa(false);setTelaVenda(true);
  }

  useEffect(() => {
    const atualizar = () => {
      const agora = new Date();
      setHora(agora.toLocaleTimeString("pt-BR"));
      setDataAtual(agora.toLocaleDateString("pt-BR"));
      setDataExtenso(agora.toLocaleDateString("pt-BR", {weekday:"long",day:"2-digit",month:"long",year:"numeric"}));
    };
    atualizar();
    const timer = window.setInterval(atualizar, 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Recupera o turno já aberto ao entrar no Caixa Livre, sem abrir outro.
  useEffect(() => {
    if(!supabase || !empresaId || !usuarioId)return;
    let ativo=true;
    async function consultarTurno(){
      try {const resposta=await caixaIndividual("turno");if(ativo)setTurno(resposta.turno);}
      catch {if(ativo)setTurno(null);}
    }
    void consultarTurno();
    return ()=>{ativo=false;};
  },[empresaId,usuarioId]);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if(pinAcao){if(["Escape","F9","Delete"].includes(e.key))e.preventDefault();return;}
      if(e.key==="F10" && !e.repeat){
        // F10 fecha o caixa apenas no painel inicial. Na busca rápida de vendas,
        // F10 continua reservado à aba de produtos.
        if(!telaVenda){
          e.preventDefault();
          if(fechamentoAberto||abertura||cancelamentoAberto||historicoAberto||consultaProdutosAberta||movCaixaTipo)return;
          if(turno)void abrirFechamento();
          else setErroCaixa("Nenhum turno aberto para fechar. Abra o caixa primeiro.");
          return;
        }
      }
      if(!telaVenda && e.key==="F4"){
        e.preventDefault();
        if(!e.repeat&&!fechamentoAberto&&!abertura&&!cancelamentoAberto&&!historicoAberto&&!movCaixaTipo&&!consultaProdutosAberta)void abrirConsultaProdutos();
        return;
      }
      if(consultaProdutosAberta){if(e.key==="Escape"){e.preventDefault();setConsultaProdutosAberta(false);}return;}
            if(fechamentoAberto){if(e.key==="Escape"){e.preventDefault();if(!fechamentoEnviando)setFechamentoAberto(false);}return;}
      if (telaVenda) {
        if(cadastroRapido)return;
        if(trocaPDVBuscaAberta){if(e.key==="F2"){e.preventDefault();if(!e.repeat){setTrocaPDVCatalogoFiltro("");setTrocaPDVCatalogoAberto(true);}return;}if(e.key==="Escape"){e.preventDefault();if(trocaPDVCatalogoAberto)setTrocaPDVCatalogoAberto(false);else setTrocaPDVBuscaAberta(false);}return;}
        if(trocaPDVFinalizar){
          if(e.key==="Escape"){e.preventDefault();setTrocaPDVFinalizar(false);return;}
          if(["F1","F2","F3"].includes(e.key)){
            e.preventDefault();
            if(e.repeat)return;
            const campo=e.key==="F1"?"dinheiro":e.key==="F2"?"pix":"cartao";
            if(trocaPDVDiferenca>0){
              const entrada=trocaPagamentoRefs.current[campo];
              entrada?.focus();entrada?.select();
            }else if(trocaPDVDiferenca<0){
              setTrocaDestino("reembolso");setTrocaForma(campo);
              setTrocaErroPagamento("");
            }
            return;
          }
          if(e.key==="F4"&&trocaPDVDiferenca<0){
            e.preventDefault();if(!e.repeat){setTrocaDestino("credito");setTrocaErroPagamento("");}return;
          }
          if(e.key==="F12"){
            e.preventDefault();
            if(!e.repeat)setTrocaErroPagamento("Modo de teste: a confirmação ainda está bloqueada até a integração segura com o caixa e o estoque.");
            return;
          }
          return;
        }
        if(cancelamentoAberto){
          if(e.key==="Escape"){e.preventDefault();fecharCancelamentos();}
          return;
        }
        if(e.key==="F7"&&!e.repeat&&!modalOperacao&&!modalCliente&&!modalPesquisa&&!produtoPendente){
          e.preventDefault();
          if(carrinho.length||vendaConfirmada){setErro("Conclua ou cancele a venda atual antes de iniciar uma troca pelo F7.");return;}
          iniciarTrocaPDV();return;
        }
        if(modalOperacao){
          if(configurandoCartao){
            if(e.key==="Escape"){e.preventDefault();setConfigurandoCartao(null);}
            if(e.key==="Enter" && (e.target as HTMLElement)?.tagName!=="SELECT"){
              e.preventDefault();concluirConfiguracaoCartao();
            }
            if(e.key.startsWith("F"))e.preventDefault();
            return;
          }
          if(e.key==="Escape"){e.preventDefault();if(vendaConfirmada){novaVendaAposConfirmacao();}else fecharPagamento();return;}
          if(modalOperacao==="pagamento"){
            if(e.key==="F1"){e.preventDefault();focarPagamento("dinheiro");}
            if(e.key==="F2"){e.preventDefault();focarPagamento("pix");}
            if(e.key==="F3"){e.preventDefault();selecionarModalidadeCartao("debito");focarPagamento("cartao_debito");}
            if(e.key==="F4"){e.preventDefault();selecionarModalidadeCartao("credito");focarPagamento("cartao_credito");}
            if(e.key==="F6"){e.preventDefault();focarPagamento("desconto");}
            if(e.key==="F12"){e.preventDefault();if(vendaConfirmada)imprimirCupom();else void confirmarPagamento();}
          }
          return;
        }
        if(!modalCliente&&!modalPesquisa&&e.key==="F9"){e.preventDefault();cancelarLancamento();return;}
        if(!modalCliente&&!modalPesquisa&&e.key==="F12"){e.preventDefault();if(trocaPDVAtiva){setTrocaPDVFinalizar(true);}else if(carrinho.length)abrirPagamento();return;}
        
        if(e.key==="F2"){e.preventDefault();if(!e.repeat&&!modalCliente)alternarBuscaProduto();}
        if(e.key==="F3"){e.preventDefault();if(!modalCliente){setModalPesquisa(false);void abrirPesquisaCliente();}}
        if(!pinAcao&&e.key==="Delete" && !((e.target as HTMLElement)?.closest("input,textarea,select"))){e.preventDefault();removerSelecionado();}
        if(modalCliente&&e.key==="F4"){e.preventDefault();editarCadastroRapido();}
         if(modalCliente&&e.key==="F5"){e.preventDefault();setEditarRapidoId(null);setCadastroRapido(abaBuscaRapida==="produtos"?"produto":"cliente");}
        if(modalCliente&&e.key==="F10"){e.preventDefault();setAbaBuscaRapida("produtos");setIndiceRapido(0);}
        if(modalCliente&&e.key==="F11"){e.preventDefault();setAbaBuscaRapida("clientes");setIndiceRapido(0);}
        if(e.key==="Escape" && (modalCliente||modalPesquisa)){e.preventDefault();setModalCliente(false);setModalPesquisa(false);}
        else if(e.key==="Escape" && produtoPendente){e.preventDefault();setProdutoPendente(null);buscaRef.current?.focus();}
        else if(e.key==="Escape" && document.activeElement !== buscaRef.current) { e.preventDefault(); cancelarLancamento(); }
        return;
      }
      if(cancelamentoAberto){if(e.key==="Escape"){e.preventDefault();fecharCancelamentos();}return;}
       if(historicoAberto){if(e.key==="Escape"){e.preventDefault();if(correcaoVenda){fecharCorrecao();}else if(historicoDetalhe)setHistoricoDetalhe(null);else setHistoricoAberto(false);}return;}
      if (e.key === "F2" && !abertura) { e.preventDefault(); void iniciarVenda(); }
      if (e.key === "Escape") {
         e.preventDefault();
         if (abertura) { setAbertura(null);setErroCaixa(""); }
         else if(perfilFuncionario==="administrador")sairPDV();
       }
      if (abertura) return;
       if (e.key === "F3") { e.preventDefault(); document.getElementById("ev-cliente-inicial")?.focus(); }
      if (e.key === "F11") { e.preventDefault(); document.getElementById("ev-modo-inicial")?.focus(); }
      if (e.key === "F12") { e.preventDefault(); document.getElementById("ev-operador-inicial")?.focus(); }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, [telaVenda, abertura, empresaId, usuarioId, processandoCaixa, carrinho, itemSelecionado, produtoPendente, tipoBusca, modalCliente, modalPesquisa, cadastroRapido, modalOperacao, abaBuscaRapida, indiceRapido, produtosRapidos, clientesRapidos, pagamentos, descontoPagamento, vendaConfirmada, operacaoEnviada, finalizandoVenda, historicoAberto, historicoDetalhe, correcaoVenda, correcaoSalvando, cancelamentoAberto, cancelamentoSalvando, trocaPDVFinalizar, trocaPDVBuscaAberta, trocaPDVCatalogoAberto, turno, fechamentoAberto, fechamentoEnviando, consultaProdutosAberta, movCaixaTipo, trocaPDVAtiva, vendaConfirmada, modalOperacao, perfilFuncionario, configurandoCartao, pinAcao]);

  useEffect(() => {
    let ativo = true;
    async function iniciar() {
      if (!supabase) { setErro("Conexão com o Supabase não configurada."); setCarregando(false); return; }
      const { data: { user }, error: erroAuth } = await supabase.auth.getUser();
      if (!ativo) return;
      if (erroAuth || !user) { window.location.replace("/"); return; }
      const {data: papelAtual}=await supabase.from("empresa_usuarios").select("papel").eq("usuario_id",user.id).limit(1).maybeSingle();
      if(!papelAtual||!["administrador","vendedor"].includes(papelAtual.papel)){window.location.replace("/");return;}
      const {data: perfilAtual}=await supabase.from("evolux_usuarios_acesso").select("ativo").eq("usuario_id",user.id).maybeSingle();
      if(perfilAtual?.ativo===false){await supabase.auth.signOut();window.location.replace("/");return;}
      const funcionarioId=sessionStorage.getItem("evolux_funcionario_validado");
      const empresaSelecionada=sessionStorage.getItem("evolux_empresa_selecionada");
      if(!funcionarioId||!empresaSelecionada){window.location.replace("/selecionar-usuario");return;}
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session)throw new Error("Sessão expirada");
        const resposta=await fetch("/api/funcionarios",{
          headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"
        });
        if(!resposta.ok)throw new Error("Não foi possível identificar o funcionário.");
        const dados=await resposta.json();
        const funcionario=(dados.usuarios||[]).find((f:{id:string;ativo:boolean;nome:string;papel:string})=>f.id===funcionarioId&&f.ativo);
        if(!funcionario||String(dados.empresaId)!==empresaSelecionada){
          window.location.replace("/selecionar-usuario");return;
        }
        if(ativo){
          setOperador(funcionario.nome);
          setPerfilFuncionario(funcionario.papel === "administrador" ? "administrador" : "vendedor");
        }
      }catch(e){
        if(ativo){setErro(e instanceof Error?e.message:"Falha ao identificar operador.");setCarregando(false);}
        return;
      }
      setUsuarioId(user.id);
      const { data: vinculo, error: erroVinculo } = await supabase.from("empresa_usuarios").select("empresa_id").eq("usuario_id", user.id).limit(1);
      if (!ativo) return;
      if (erroVinculo || !vinculo?.length) { setErro("Não foi possível identificar a empresa do usuário."); setCarregando(false); return; }
      const id = vinculo[0].empresa_id;
      setEmpresaId(id);
      const [consulta, dadosEmpresa] = await Promise.all([
        carregarProdutosAtivos(supabase,id,"id,codigo,descricao,codigo_barras,preco_custo,preco_venda,estoque_atual,ativo"),
        supabase.from("empresas").select("*").eq("id", id).single()
      ]);
      if (!ativo) return;
      if (consulta.error) setErro("Não foi possível consultar os produtos: " + consulta.error.message);
      else setProdutos((consulta.data || []) as Produto[]);
      if (dadosEmpresa.data) { setEmpresa(dadosEmpresa.data.nome_fantasia || dadosEmpresa.data.razao_social || "EVOLUX"); setDadosEmpresaCupom(dadosEmpresa.data as Record<string,unknown>); }
      setCarregando(false);
    }
    void iniciar();
    return () => { ativo = false; };
  }, []);

  const encontrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return produtos.slice(0, 40);
    return produtos.filter(p => p.descricao.toLocaleLowerCase("pt-BR").includes(termo) || String(p.codigo).includes(termo) || (p.codigo_barras || "").includes(termo)).slice(0, 40);
  }, [busca, produtos]);
  const total = carrinho.reduce((s, l) => s + Number(l.produto.preco_venda) * l.quantidade, 0);
  const unidades = carrinho.reduce((s, l) => s + l.quantidade, 0);
  const totalCentavos = Math.round(total*100);
  const descontoCentavos = descontoTipo === "percentual"
    ? Math.round(totalCentavos * (Number(descontoPagamento.replace(",",".")) || 0) / 100)
    : centavos(descontoPagamento);
  const totalPagarCentavos = Math.max(0,totalCentavos-descontoCentavos);
  const pagoCentavos = centavos(pagamentos.dinheiro)+centavos(pagamentos.pix)+centavos(pagamentos.debito)+centavos(pagamentos.credito);
  const restanteCentavos = Math.max(0,totalPagarCentavos-pagoCentavos);
  const trocoCentavos = Math.min(centavos(pagamentos.dinheiro),Math.max(0,pagoCentavos-totalPagarCentavos));
  const pagamentosNaoDinheiro = centavos(pagamentos.pix)+centavos(pagamentos.debito)+centavos(pagamentos.credito);
  const valoresValidos = [pagamentos.dinheiro,pagamentos.pix,pagamentos.debito,pagamentos.credito,descontoPagamento].every(v=>!v.trim()||/^(?:\d+)(?:[.,]\d{1,2})?$/.test(v.trim())) && (descontoTipo!=="percentual" || Number(descontoPagamento.replace(",","."))<=100);
  const pagamentoValido = carrinho.length>0 && valoresValidos && descontoCentavos<=totalCentavos && pagoCentavos>=totalPagarCentavos && pagamentosNaoDinheiro<=totalPagarCentavos && trocoCentavos===pagoCentavos-totalPagarCentavos && (centavos(pagamentos.debito)===0||cartoesConfigurados.debito) && (centavos(pagamentos.credito)===0||cartoesConfigurados.credito);
  function alterarPagamento(campo:"dinheiro"|"pix"|"cartao"|"debito"|"credito",valor:string){
    if(operacaoEnviada)return;
    setErroPagamento("");
    if(!/^[\d.,]*$/.test(valor))return;
    setPagamentos(atual=>({...atual,[campo]:valor}));
    // Ao alterar o valor de um cartão, a configuração precisa ser reconfirmada.
    // Evita usar bandeira/parcelas antigas sem revisão do operador.
    if((campo==="debito"||campo==="credito") && valor!==pagamentos[campo]){
      setCartoesConfigurados(atual=>({...atual,[campo]:false}));
    }
  }
  function selecionarModalidadeCartao(modalidade:"debito"|"credito"){
    if(operacaoEnviada)return;
    setCartaoModalidade(modalidade);
    setErroPagamento("");
    // Débito e crédito têm valores e bandeiras independentes.
  }
  function abrirConfiguracaoCartao(tipo:"debito"|"credito"){
    if(operacaoEnviada || centavos(pagamentos[tipo])<=0)return;
    setConfigurandoCartao(tipo);
  }
  function concluirConfiguracaoCartao(){
    if(!configurandoCartao)return;
    setCartoesConfigurados(atual=>({...atual,[configurandoCartao]:true}));
    setConfigurandoCartao(null);
  }
  function focarPagamento(campo:string){window.requestAnimationFrame(()=>pagamentoRefs.current[campo]?.focus());}
  function abrirPagamento(){if(caixaEmConferencia||verificandoConferencia){setErro(avisoConferencia);return;}if(trocaPDVAtiva){setTrocaPDVFinalizar(true);return;}setErroPagamento("");setModalOperacao("pagamento");}
  function fecharPagamento(){if(finalizandoRef.current || operacaoEnviada)return;setConfigurandoCartao(null);setModalOperacao(null);}
  async function confirmarPagamento(){
    if(finalizandoRef.current || configurandoCartao || vendaConfirmada || !pagamentoValido || !supabase || !empresaId || !turno)return;
    try{if(await verificarConferencia(turno.id)){setErroPagamento(avisoConferencia);return;}}catch(e){setErroPagamento(e instanceof Error?e.message:"Não foi possível verificar o turno.");return;}
    if(!chaveVendaRef.current)chaveVendaRef.current=crypto.randomUUID();
    finalizandoRef.current=true;
    setFinalizandoVenda(true);
    setErroPagamento("");
    setOperacaoEnviada(true);
    try{
      const {data,error}=await supabase.rpc("evolux_finalizar_venda",{
        p_empresa_id:empresaId,
        p_caixa_turno_id:turno.id,
        p_cliente_id:clienteSelecionado?.id ? String(clienteSelecionado.id) : null,
        p_chave_operacao:chaveVendaRef.current,
        p_itens:carrinho.map(l=>({produto_id:l.produto.id,quantidade:l.quantidade})),
        p_pagamentos:{dinheiro:centavos(pagamentos.dinheiro)/100,pix:centavos(pagamentos.pix)/100,cartao:0,
          cartoes:{...(centavos(pagamentos.debito)>0?{debito:{valor:centavos(pagamentos.debito)/100,bandeira:bandeiraDebito,parcelas:1}}:{}),
            ...(centavos(pagamentos.credito)>0?{credito:{valor:centavos(pagamentos.credito)/100,bandeira:bandeiraCredito,parcelas:cartaoParcelas}}:{})}},
        p_desconto:descontoCentavos/100
      });
      if(error){
        // Erros de regra de negócio retornam sem gravar a venda: é seguro corrigir.
        const erroBanco = new Error(error.message) as Error & { codigo?: string };
        erroBanco.codigo = error.code;
        throw erroBanco;
      }
      if(!data?.sucesso || !data?.numero)throw new Error("Resposta de confirmação inesperada. Verifique o registro antes de tentar novamente.");
      setVendaConfirmada({
         numero:Number(data.numero),total:Number(data.total ?? totalPagarCentavos/100),
         troco:Number(data.troco ?? trocoCentavos/100),subtotal:Number(data.subtotal ?? total),
         desconto:Number(data.desconto ?? descontoCentavos/100),data:new Date().toLocaleString("pt-BR"),
         itens:carrinho.map(l=>({descricao:l.produto.descricao,quantidade:l.quantidade,preco:Number(l.produto.preco_venda)})),
         cliente:clienteSelecionado?nomeCliente(clienteSelecionado):"Consumidor não identificado",
         pagamentos:{dinheiro:centavos(pagamentos.dinheiro)/100,pix:centavos(pagamentos.pix)/100,cartao:(centavos(pagamentos.debito)+centavos(pagamentos.credito))/100}
       });
    }catch(e){
      const mensagem = e instanceof Error ? e.message : "Falha na finalização";
      // Exceções explícitas do PostgreSQL (P0001) indicam rejeição da transação.
      // Nesse caso, não houve venda: liberar edição e gerar nova chave na próxima tentativa.
      // Falhas de rede ou resposta incerta mantêm a chave e os dados bloqueados,
      // pois a venda pode ter sido registrada mesmo sem resposta ao navegador.
      const codigo = (e as {codigo?:string}|null)?.codigo;
      const rejeicaoConfirmada = codigo === "P0001";
      if(rejeicaoConfirmada){
        setOperacaoEnviada(false);
        chaveVendaRef.current = null;
        setErroPagamento(mensagem + ". Corrija os itens ou valores e tente novamente.");
      }else{
        setErroPagamento(mensagem + ". Se a conexão caiu, tente novamente com a mesma operação; o banco evita duplicidade.");
      }
    }finally{
      finalizandoRef.current=false;
      setFinalizandoVenda(false);
    }
  }
  function imprimirCupom(){
    if(!vendaConfirmada)return;
    const v=vendaConfirmada;
    // Evita imprimir preços divergentes dos totais registrados pelo banco.
    const soma=v.itens.reduce((a,i)=>a+Math.round(i.preco*100)*i.quantidade,0);
    if(Math.round(soma)!==Math.round(v.subtotal*100)){
      setErroPagamento("Os preços registrados no banco diferem dos exibidos na venda. Não é seguro imprimir este cupom; confira o histórico antes de emitir a segunda via.");
      return;
    }
    const janela=window.open("","_blank","width=430,height=720");
    if(!janela){setErroPagamento("O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.");return;}
    const escapar=(texto:string)=>texto.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    const valor=(n:number)=>dinheiro(n);
    const campo=(...nomes:string[])=>nomes.map(nome=>dadosEmpresaCupom[nome]).find(v=>v!==null&&v!==undefined&&String(v).trim()!=="")?.toString().trim()||"";
    const cnpj=campo("cnpj","cpf_cnpj");
    const telefone=campo("telefone","telefone1","telefone_principal","celular","whatsapp");
    const logradouro=campo("logradouro","endereco","rua");
    const numero=campo("numero","numero_endereco");
    const complemento=campo("complemento");
    const bairro=campo("bairro");
    const cidade=campo("cidade","municipio");
    const uf=campo("uf","estado");
    const cep=campo("cep");
    const enderecoLinha=[logradouro,numero,complemento,bairro].filter(Boolean).join(", ");
    const localLinha=[cidade,uf].filter(Boolean).join("/")+(cep?` • CEP ${cep}`:"");
    const cabecalho=[cnpj?`<div>CNPJ: ${escapar(cnpj)}</div>`:"",enderecoLinha?`<div>${escapar(enderecoLinha)}</div>`:"",localLinha?`<div>${escapar(localLinha)}</div>`:"",telefone?`<div>Tel.: ${escapar(telefone)}</div>`:""].join("");
    const dataHora=v.data.split(", ");
    const dataVenda=dataHora[0]||v.data;
    const horaVenda=dataHora[1]||"";
    const cliente=v.cliente&&v.cliente!=="Consumidor não identificado"?`<div>Cliente: ${escapar(v.cliente)}</div>`:"";
    const itens=v.itens.map((i,indice)=>`<div class="item"><div class="descricao">${String(indice+1).padStart(2,"0")} ${escapar(i.descricao)}</div><div class="calculo">${i.quantidade} UN × ${valor(i.preco)} = ${valor(i.quantidade*i.preco)}</div></div>`).join("");
    const formas=([['Dinheiro',v.pagamentos.dinheiro],['PIX',v.pagamentos.pix],['Cartão crédito/débito',v.pagamentos.cartao]] as const).filter(([,n])=>n>0).map(([nome,n])=>`<div class="linha"><span>${nome}</span><span>${valor(n)}</span></div>`).join("");
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Cupom de venda #${v.numero}</title><style>
      @page{size:80mm auto;margin:2mm}
      *{box-sizing:border-box}
      body{font:12px/1.12 Arial,Helvetica,sans-serif;color:#000;background:#fff;margin:0 auto;padding:0;width:76mm}
      .empresa{text-align:center;line-height:1.12}.empresa h1{font-size:17px;line-height:1.1;margin:0;font-weight:800}
      .separador{border-top:1px dashed #555;margin:3px 0 2px}
      .linha{display:flex;justify-content:space-between;align-items:baseline;gap:5px;margin:0;padding:0;line-height:1.15}
      .linha span:last-child{white-space:nowrap}
      .descricao{font-weight:700;overflow-wrap:anywhere;line-height:1.12}
      .calculo{text-align:right;white-space:nowrap;font-size:11.5px;line-height:1.12}
      .item{margin:0 0 2px}
      .totais{font-size:13px;line-height:1.15}
      .total{font-size:16px;font-weight:800;line-height:1.18}
      .rodape{text-align:center;font-size:11px;font-weight:700;margin-top:2px}
      @media screen{body{margin:12px auto;padding:3mm;box-shadow:0 0 8px #aaa;min-height:150px;width:80mm}}
      @media print{body{width:76mm;margin:0;padding:0}}
  
    </style></head><body>
      <div class="empresa"><h1>${escapar(empresa)}</h1>${cabecalho}</div>
      <div class="separador"></div>
      <div class="linha"><strong>VENDA ${String(v.numero).padStart(6,"0")}</strong><span>${escapar(dataVenda)}</span></div>
      <div>Terminal 01 | Turno ${turno?.numero??"—"}${horaVenda?` | ${escapar(horaVenda)}`:""}</div>
      <div>Operador: ${escapar(operador)}</div>${cliente}
      <div class="separador"></div>${itens}
      <div class="separador"></div>
      <div class="totais"><div class="linha"><span>Subtotal</span><span>${valor(v.subtotal)}</span></div>
      <div class="linha"><span>Desconto</span><span>- ${valor(v.desconto)}</span></div>
      <div class="linha total"><span>TOTAL</span><span>${valor(v.total)}</span></div></div>
      <div class="separador"></div>${formas}
      <div class="separador"></div><div class="rodape">OBRIGADO PELA PREFERÊNCIA!</div>
      <script>window.addEventListener('load',()=>{window.focus();window.print();});<\/script></body></html>`;
    janela.document.open();janela.document.write(html);janela.document.close();
    novaVendaAposConfirmacao();
  }

  function novaVendaAposConfirmacao(){
    if(!vendaConfirmada || finalizandoRef.current)return;
    setCarrinho([]);setItemSelecionado(null);setBusca("");setClienteSelecionado(null);setClienteBusca("");
    setConfigurandoCartao(null);setCartoesConfigurados({debito:false,credito:false});setPagamentos({dinheiro:"",pix:"",cartao:"",debito:"",credito:""});setDescontoPagamento("");setDescontoTipo("valor");setCartaoModalidade("debito");setCartaoBandeira("visa");setBandeiraDebito("visa");setBandeiraCredito("visa");setCartaoParcelas(1);
    setVendaConfirmada(null);setErroPagamento("");setOperacaoEnviada(false);chaveVendaRef.current=null;
    setModalOperacao(null);setTelaVenda(false);
  }

  async function cancelarLancamento(){
    if(operacaoEnviada || finalizandoRef.current||pinAcao||pinProcessando)return;
    if(trocaPDVAtiva){cancelarTrocaPDV();return;}
    if(carrinho.length){
      if(perfilFuncionario!=="administrador"){
        await pedirAutorizacao("cancelar_lancamento");
        return;
      }
      if(!window.confirm("Cancelar o lançamento atual? Nenhuma venda será registrada."))return;
    }
    setCarrinho([]);setBusca("");setItemSelecionado(null);setProdutoPendente(null);setTelaVenda(false);
  }
  async function removerSelecionado(){
    if(operacaoEnviada||pinAcao||pinProcessando)return;
    if(!itemSelecionado){setErro("Selecione o produto lançado antes de apagar.");return;}
    const item=carrinho.find(l=>l.produto.id===itemSelecionado);
    if(!item){setErro("Produto não encontrado no lançamento.");return;}
    setErro("");
    // O perfil vem da sessão de funcionário já validada na entrada do PDV.
    // Falha ou perfil desconhecido nunca libera exclusão direta.
    if(perfilFuncionario!=="administrador"){
      await pedirAutorizacao("apagar",itemSelecionado);
      return;
    }
    if(!window.confirm(`Remover ${item.produto.descricao} da venda atual?`))return;
    setCarrinho(atual=>atual.filter(l=>l.produto.id!==itemSelecionado));
    setItemSelecionado(null);
  }

  function prepararProduto(produto: Produto) {
    if(operacaoEnviada)return;
    setErro("");
    setProdutoPendente(produto);
    setQuantidadePendente("1");
    setModalPesquisa(false);
    setBusca("");
    window.requestAnimationFrame(() => quantidadeRef.current?.focus());
  }
  function confirmarProduto() {
    if(operacaoEnviada)return;
    if (!produtoPendente) return;
    const quantidade = Number(quantidadePendente.replace(",", "."));
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 99999) {
      setErro("Informe uma quantidade inteira entre 1 e 99999.");
      quantidadeRef.current?.focus();
      return;
    }
    const produto = produtoPendente;
    if(trocaPDVAtiva){
      const existente=carrinho.find(l=>l.produto.id===produto.id)?.quantidade||0;
      if(existente+quantidade>Number(produto.estoque_atual)){setErro("Estoque insuficiente para o produto novo.");return;}
    }
    setCarrinho(atual => {
      const existente = atual.find(l => l.produto.id === produto.id);
      const novaQuantidade = (existente?.quantidade ?? 0) + quantidade;
      if (novaQuantidade > 99999) return atual;
      if (existente) return atual.map(l => l.produto.id === produto.id ? {...l, quantidade:novaQuantidade} : l);
      return [...atual, {produto, quantidade}];
    });
    setItemSelecionado(produto.id);
    setProdutoPendente(null);
    setQuantidadePendente("1");
    setBusca("");
    setSelecionado(0);
    window.requestAnimationFrame(() => buscaRef.current?.focus());
  }
  function limpar() {
    if (carrinho.length && !window.confirm("Limpar os itens do carrinho? Nenhuma venda foi registrada.")) return;
    setCarrinho([]);
    buscaRef.current?.focus();
  }
  useEffect(() => { setSelecionado(0); }, [busca]);
  // A pesquisa por descrição trata Enter e setas no próprio campo.
  // O listener principal acima mantém os atalhos globais do PDV.


  function sairPDV(){
    if(perfilFuncionario!=="administrador")return;
    if(window.confirm("Deseja sair do PDV e voltar ao painel? O turno de caixa permanecerá aberto."))window.location.assign("/dashboard");
  }

  const trocaPDVValorDevolvido=trocaPDVItem&&(trocaPDVVenda||trocaPDVSemVenda)?Math.round(Number(trocaPDVQtd)*Number(trocaPDVItem.preco_unitario)*(Number(trocaPDVVenda?.subtotal)>0?Number(trocaPDVVenda?.total)/Number(trocaPDVVenda?.subtotal):1)*100)/100:0;
  const trocaPDVDiferenca=Math.round((total-trocaPDVValorDevolvido)*100)/100;
  const trocaAReceber=Math.max(0,Math.round(trocaPDVDiferenca*100));
  const trocaRecebido=Object.values(trocaPagamento).reduce((s,v)=>s+centavos(v),0);
  const trocaPagamentoValido=Object.values(trocaPagamento).every(v=>!v.trim()||/^\d+(?:[.,]\d{1,2})?$/.test(v.trim()));
  const trocaNaoDinheiro=centavos(trocaPagamento.pix)+centavos(trocaPagamento.cartao);
  const trocaRestante=Math.max(0,trocaAReceber-trocaRecebido);
  const trocaTroco=Math.max(0,trocaRecebido-trocaAReceber);

  // Aguarda a inicialização antes de renderizar a interface operacional.
  // O carregamento usa estilos inline para não exibir o PDV sem CSS durante a transição.
  if (carregando) return <main aria-busy="true" aria-label="Carregando PDV" style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f3f6fc",fontFamily:"Arial, Helvetica, sans-serif",color:"#102650"}}>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:28,background:"#fff",border:"1px solid #d9e3f2",borderRadius:16,boxShadow:"0 12px 35px #0b245410"}}>
      <strong style={{fontSize:18}}>Carregando PDV</strong>
      <span style={{fontSize:13,color:"#61718b"}}>Preparando caixa e produtos...</span>
    </div>
  </main>;

  if (!telaVenda) return <main className="ev-caixa-livre">
    {erroCaixa && !abertura && <div role="alert" className="ev-caixa-erro">{erroCaixa}</div>}
    {processandoCaixa && !abertura && <div className="ev-caixa-processando">Consultando situação do caixa...</div>}
    {abertura && <div className="ev-turno-overlay">
      <section className="ev-turno-modal" role="dialog" aria-modal="true" aria-label="Abertura do turno de caixa">
        {abertura==="pergunta" ? <>
          <header><div><h2>Abertura do Turno de Caixa</h2></div><button type="button" className="ev-turno-fechar" onClick={()=>{setAbertura(null);setErroCaixa("")}} aria-label="Fechar">×</button></header>
          <div className="ev-turno-conteudo">
            <div className="ev-turno-pergunta"><p>O turno de caixa ainda não foi aberto. Deseja realizar a abertura agora?</p></div>
            <div className="ev-turno-acoes"><button type="button" autoFocus onClick={()=>{setDataAbertura(new Date().toLocaleString("pt-BR"));setErroCaixa("");setAbertura("formulario")}}>Sim, abrir caixa (Enter)</button><button type="button" onClick={()=>{setAbertura(null);setErroCaixa("")}}>Não (Esc)</button></div>
          </div>
        </> : <>
          <header><div><h2>Abertura do Turno de Caixa</h2></div><button type="button" className="ev-turno-fechar" disabled={processandoCaixa} onClick={()=>{setAbertura(null);setErroCaixa("")}} aria-label="Fechar">×</button></header>
          <div className="ev-turno-conteudo">
            <div className="ev-turno-campos"><div><small>Turno</small><strong>Próximo turno</strong></div><div><small>Data da abertura</small><strong>{dataAbertura}</strong></div><div><small>Operador</small><strong>{operador}</strong></div></div>
            <form onSubmit={e=>{e.preventDefault();void abrirCaixa()}}>
              <label htmlFor="ev-saldo-inicial">Saldo inicial em caixa (R$)</label>
              <input id="ev-saldo-inicial" autoFocus inputMode="decimal" value={saldoInicial} onChange={e=>setSaldoInicial(e.target.value)} placeholder="0,00" disabled={processandoCaixa}/>
              <p className="ev-turno-ajuda">Informe somente o dinheiro disponível na gaveta antes da primeira venda. Se estiver vazia, use 0,00.</p>
              {erroCaixa && <p className="ev-turno-erro" role="alert">{erroCaixa}</p>}
              <div className="ev-turno-acoes"><button type="submit" disabled={processandoCaixa}>{processandoCaixa?"Abrindo caixa...":"Abrir caixa (Enter)"}</button><button type="button" disabled={processandoCaixa} onClick={()=>{setAbertura(null);setErroCaixa("")}}>Cancelar (Esc)</button></div>
            </form>
          </div>
        </>}
      </section>
    </div>}

    <header className="ev-novo-topo">
      <div className="ev-novo-marca"><div className="ev-novo-simbolo">E</div><div><strong>EVOLU<span>X</span></strong><small>GESTÃO EMPRESARIAL • PDV</small></div></div>
      <div className="ev-novo-turno"><button type="button" onClick={()=>{sessionStorage.removeItem('evolux_funcionario_validado');sessionStorage.removeItem('evolux_empresa_selecionada');window.location.assign('/selecionar-usuario')}} style={{background:"#fff",color:"#102c58",border:"1px solid #cbd9e9",borderRadius:9,padding:"9px 12px",fontWeight:700,cursor:"pointer"}}>Trocar usuário</button>{perfilFuncionario==="administrador"&&<button type="button" className="ev-novo-sair ev-novo-sair-topo" onClick={sairPDV} aria-label="Sair do PDV e voltar ao painel"><span aria-hidden="true">↪</span> Sair do PDV <kbd>Esc</kbd></button>}<span className="ev-novo-status"><i/> {turno ? "Caixa aberto" : "Caixa não iniciado"}</span><span>Terminal 01 • {turno ? `Turno ${String(turno.numero).padStart(2,"0")}` : "Sem turno"} • {operador}</span><strong>{hora || "--:--:--"}</strong></div>
    </header>
    <div className="ev-novo-conteudo ev-m2-conteudo">
      <section className="ev-m2-hero" aria-label="Resumo do caixa">
        <div className="ev-m2-hero-title"><span className="ev-m2-hero-icon" aria-hidden="true">▣</span><div><small>PAINEL DO OPERADOR</small><h1>Caixa Livre</h1><p>{dataExtenso}</p></div></div>
        <div className="ev-m2-metrics">
          <div className="ev-m2-metric"><span aria-hidden="true">♙</span><div><small>Operador</small><strong>{operador}</strong></div></div>
          <div className="ev-m2-metric"><span aria-hidden="true">▱</span><div><small>Turno</small><strong>{turno?`Nº ${turno.numero}`:"Não aberto"}</strong></div></div>
          <div className="ev-m2-metric"><span aria-hidden="true">▦</span><div><small>Data</small><strong>{dataAtual||"—"}</strong></div></div>
          <div className="ev-m2-metric"><span aria-hidden="true">◷</span><div><small>Situação</small><strong>{turno?(verificandoConferencia?"Verificando...":caixaEmConferencia?"Em conferência":"Caixa aberto"):"Caixa fechado"}</strong></div></div>
        </div>
      </section>
      
      {turno&&(caixaEmConferencia||verificandoConferencia)&&<p role="alert" style={{padding:"15px 20px",borderRadius:12,background:"#fff0f0",color:"#a31d1d",fontWeight:700,margin:"16px 0"}}>{verificandoConferencia?"Verificando a situação do caixa. Aguarde...":avisoConferencia}</p>}
      <div className="ev-novo-grid ev-m2-grid">
        <section className="ev-novo-principal">
          <div className="ev-novo-card ev-novo-operador">
            <div className="ev-novo-card-titulo"><span>⚙</span><div><strong>Preparar atendimento</strong><small>Configure a venda e identifique o cliente.</small></div></div>
            <div className="ev-novo-campos">
              <label>Modo de lançamento <small>F11</small><select id="ev-modo-inicial" value={modo} onChange={e=>setModo(e.target.value)}><option>1 - VENDA</option></select></label>
              <label>Operador <small>F12</small><select id="ev-operador-inicial" value={operador} disabled><option value={operador}>{operador}</option></select></label>
            </div>
            <label className="ev-novo-busca">Buscar cliente <small>F3 • CPF/CNPJ, código ou telefone</small><div><input id="ev-cliente-inicial" value={clienteBusca} onChange={e=>setClienteBusca(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void iniciarVenda()}}} placeholder="Informe o cliente ou deixe em branco"/><button type="button" onClick={()=>void iniciarVenda()} title="Iniciar venda">Continuar →</button></div></label>
          </div>
          <button type="button" className="ev-m2-action ev-m2-consulta" onClick={()=>void abrirConsultaProdutos()}><span className="ev-m2-action-icon" aria-hidden="true">⌕</span><span className="ev-m2-action-copy"><strong>CONSULTAR PRODUTOS</strong><small>Consultar preço de venda e estoque disponível</small></span><kbd>F4</kbd></button>
          {turno?<button type="button" className="ev-m2-action ev-m2-fechar" disabled={fechamentoCarregando||fechamentoEnviando} onClick={()=>void abrirFechamento()} title="Fechar caixa (F10)"><span className="ev-m2-action-icon" aria-hidden="true">▣</span><span className="ev-m2-action-copy"><strong>FECHAMENTO DE CAIXA</strong><small>Contagem cega do turno {turno.numero} e envio à supervisão</small></span><kbd>F10</kbd></button>:<button type="button" className="ev-m2-action ev-m2-abrir" disabled={processandoCaixa||!!abertura||caixaEmConferencia||verificandoConferencia} onClick={()=>void iniciarVenda()}><span className="ev-m2-action-icon" aria-hidden="true">▣</span><span className="ev-m2-action-copy"><strong>ABRIR CAIXA</strong><small>Informe o saldo inicial para começar o turno</small></span><kbd>↵</kbd></button>}
          <button type="button" className="ev-novo-iniciar ev-m2-action" disabled={processandoCaixa||!!abertura||caixaEmConferencia||verificandoConferencia} onClick={()=>void iniciarVenda()}><span className="ev-novo-carrinho ev-m2-action-icon" aria-hidden="true">🛒</span><span className="ev-m2-action-copy"><strong>INICIAR NOVA VENDA</strong><small>Comece um atendimento no caixa</small></span><kbd>F2</kbd></button>
        </section>
        <section className="ev-novo-lateral"><div className="ev-novo-secao"><div className="ev-m2-side-heading"><span aria-hidden="true">▱</span><div><h2>Gestão do Caixa</h2><p>Operações e consultas do turno</p></div></div></div><div className="ev-novo-acoes">
          <button type="button" onClick={abrirHistorico} title="Consultar vendas registradas"><span className="ev-novo-icone">▤</span><span><strong>Consulta de vendas</strong><small>Consultar turno e vendas do dia</small></span><em>Consultar →</em></button>
          <button type="button" onClick={abrirCancelamentos} title="Localizar venda para cancelamento"><span className="ev-novo-icone">⇄</span><span><strong>Cancelamento de venda</strong><small>Localizar venda original</small></span><em>Acessar →</em></button>
          <button type="button" onClick={()=>abrirMovCaixa("sangria")} title="Retirar dinheiro da gaveta"><span className="ev-novo-icone">−</span><span><strong>Sangria</strong><small>Retirada de dinheiro do turno</small></span><em>Registrar →</em></button>
          <button type="button" onClick={()=>abrirMovCaixa("suprimento")} title="Adicionar dinheiro à gaveta"><span className="ev-novo-icone">+</span><span><strong>Suprimento</strong><small>Entrada de dinheiro no turno</small></span><em>Registrar →</em></button>
        </div></section>
      </div>
      <p className="ev-novo-dica ev-m2-notice"><span aria-hidden="true">ⓘ</span> O fechamento exige contagem cega e aprovação do supervisor. Sair do PDV não encerra o turno.</p>
    </div>
    {movCaixaTipo&&<div className="ev-hist-fundo"><section className="ev-hist-modal" role="dialog" aria-modal="true" aria-label="Movimentação de caixa">
      <header className="ev-hist-topo"><div><small>EVOLUX • GESTÃO DO CAIXA</small><h2>{movCaixaTipo==="sangria"?"Sangria de Caixa":"Suprimento de Caixa"}</h2></div><button type="button" disabled={movCaixaSalvando} onClick={()=>setMovCaixaTipo(null)}>✕ Fechar</button></header>
      <form className="ev-hist-corpo" onSubmit={e=>{e.preventDefault();void salvarMovCaixa()}} style={{padding:24}}>
        <p>Turno nº {turno?.numero||"—"} • {operador}</p>
        <label style={{display:"block",marginBottom:14}}>Valor (R$)<input autoFocus inputMode="decimal" placeholder="0,00" value={movCaixaValor} onChange={e=>{setMovCaixaValor(e.target.value);movCaixaChave.current=null}} disabled={movCaixaSalvando} style={{display:"block",width:"100%",padding:12,marginTop:7,border:"1px solid #c7d5e5",borderRadius:8}}/></label>
        <label style={{display:"block",marginBottom:14}}>Motivo<input placeholder="Descreva a movimentação" maxLength={500} value={movCaixaMotivo} onChange={e=>{setMovCaixaMotivo(e.target.value);movCaixaChave.current=null}} disabled={movCaixaSalvando} style={{display:"block",width:"100%",padding:12,marginTop:7,border:"1px solid #c7d5e5",borderRadius:8}}/></label>
        {movCaixaErro&&<p role="alert" style={{color:"#b42318"}}>{movCaixaErro}</p>}
        <button type="submit" disabled={movCaixaSalvando} style={{background:"#174780",color:"white",padding:"12px 20px",border:0,borderRadius:8,cursor:"pointer"}}>{movCaixaSalvando?"Registrando...":"Confirmar movimentação"}</button>
      </form>
    </section></div>}
    {cancelamentoAberto&&<div className="ev-hist-fundo" role="presentation"><section className="ev-hist-modal" role="dialog" aria-modal="true" aria-label="Cancelamentos, trocas e devoluções">
      <header className="ev-hist-topo"><div><small>EVOLUX • GESTÃO DO CAIXA</small><h2>Cancelamento de venda</h2></div><button type="button" disabled={cancelamentoSalvando||trocaSalvando} onClick={fecharCancelamentos}>✕ Fechar</button></header>
      <div className="ev-hist-corpo ev-canc-corpo">
        <div className="ev-canc-opcoes" style={{display:"none"}}><button type="button" className={`ev-canc-opcao ${operacaoTroca==="cancelamento"?"ativa":""}`} onClick={()=>{setOperacaoTroca("cancelamento");setCancelamentoVenda(null);resetarTroca();}} disabled={cancelamentoSalvando||trocaSalvando}><strong>Cancelar venda</strong><small>Devolução total ao estoque</small></button><button type="button" className={`ev-canc-opcao ${operacaoTroca==="troca"?"ativa":""}`} onClick={()=>{setOperacaoTroca("troca");setCancelamentoVenda(null);resetarTroca();}} disabled={cancelamentoSalvando||trocaSalvando}><strong>Troca</strong><small>Com produto novo ou devolução parcial</small></button><div className="ev-canc-opcao"><strong>Devolução parcial</strong><small>Use Troca sem adicionar novo produto</small></div></div>
        <form className="ev-canc-filtros" onSubmit={e=>{e.preventDefault();void localizarVendaCancelamento();}}>
          <div className="ev-canc-grade">
            <label>Data da venda (opcional)<input type="date" value={cancelamentoData} onChange={e=>setCancelamentoData(e.target.value)} disabled={cancelamentoCarregando||cancelamentoSalvando}/></label>
            <label>Caixa / operador<select value={cancelamentoCaixa} onChange={e=>{setCancelamentoCaixa(e.target.value);setCancelamentoTurno("");}} disabled={cancelamentoCarregando||cancelamentoSalvando}><option value="">Todos os caixas</option>{cancelamentoCaixas.map((id,i)=><option key={id} value={id}>Caixa do operador {i+1} ({id.slice(0,8)})</option>)}</select></label>
            <label>Turno<select value={cancelamentoTurno} onChange={e=>setCancelamentoTurno(e.target.value)} disabled={cancelamentoCarregando||cancelamentoSalvando}><option value="">Todos os turnos</option>{cancelamentoTurnosFiltrados.map(t=><option key={String(t.id)} value={String(t.id)}>Turno {String(t.numero||"—")}</option>)}</select></label>
            <label>Número do recibo (opcional)<input inputMode="numeric" value={cancelamentoBusca} onChange={e=>setCancelamentoBusca(e.target.value)} placeholder="Ex.: 3" disabled={cancelamentoCarregando||cancelamentoSalvando}/></label>
          </div>
          <div className="ev-canc-buscar-acoes"><button type="submit" disabled={cancelamentoCarregando||cancelamentoSalvando}>{cancelamentoCarregando?"Buscando...":"Buscar vendas"}</button></div>
        </form>
        {cancelamentoPesquisado&&!cancelamentoVenda&&<div className="ev-canc-listagem">
          <h3>Resultados da consulta ({cancelamentoResultados.length})</h3>
          {cancelamentoLimite&&<p className="ev-hist-aviso">Exibindo as 500 vendas mais recentes dos filtros. Refine a data, o caixa ou o recibo.</p>}
          {cancelamentoResultados.length?<div className="ev-canc-tabela"><table><thead><tr><th>Recibo</th><th>Data e hora</th><th>Turno</th><th>Valor</th><th>Pagamento</th><th>Situação</th><th></th></tr></thead><tbody>
          {cancelamentoResultados.map(v=>{const t=cancelamentoTurnos.find(t=>String(t.id)===String(v.caixa_turno_id));return <tr key={String(v.id)}><td>#{historicoNumero(v)}{String(v.situacao)==="cancelada"&&<span style={{display:"block",color:"#a21d2b",fontWeight:700,fontSize:11}}>CANCELADA</span>}</td><td>{historicoHorario(v)}</td><td>{t?`Turno ${String(t.numero||"—")}`:"—"}</td><td>{dinheiro(historicoValor(v,"total"))}</td><td>{formaCancelamento(v)}</td><td>{String(v.situacao)==="concluida"?"Concluída":"Cancelada"}</td><td><button type="button" onClick={()=>void selecionarVendaCancelamento(v)} disabled={cancelamentoCarregando||cancelamentoSalvando||trocaSalvando||String(v.situacao)!=="concluida"} style={{background:String(v.situacao)==="concluida"?"#b42318":"#cbd5e1",color:"#fff",border:"1px solid #9f1d16",borderRadius:8,padding:"9px 14px",fontWeight:700,cursor:String(v.situacao)==="concluida"?"pointer":"not-allowed"}} aria-label={`Cancelar venda número ${historicoNumero(v)}`}>{String(v.situacao)==="concluida"?"Cancelar":"Cancelada"}</button></td></tr>;})}
          </tbody></table></div>:<p className="ev-hist-aviso">Nenhuma venda encontrada com esses filtros.</p>}
        </div>}
        {cancelamentoErro&&<p className="ev-hist-erro" role="alert">{cancelamentoErro}</p>}
        {cancelamentoSucesso&&<p className="ev-canc-sucesso" role="status">{cancelamentoSucesso}</p>}
        {cancelamentoVenda&&String(cancelamentoVenda.situacao)==="concluida"&&cancelamentoAutorizado&&!autorizacaoCancelamentoAberta&&!cancelamentoSucesso&&<div role="presentation" style={{position:"fixed",inset:0,zIndex:9998,display:"grid",placeItems:"center",background:"#071a35a8",padding:16}}><section role="dialog" aria-modal="true" aria-label="Motivo do cancelamento" style={{width:"min(480px,100%)",background:"white",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 70px #071a3550"}}>
          <header style={{background:"#102c58",color:"white",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={{margin:0,fontSize:19,color:"white"}}>Motivo do cancelamento</h3><button type="button" onClick={()=>{setCancelamentoVenda(null);setCancelamentoMotivo("");setCancelamentoErro("");setCancelamentoAutorizado(false);setAdminCancelamentoPin("");}} style={{background:"transparent",color:"white",border:"1px solid #ffffff70",borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>✕</button></header>
          <div style={{padding:22,display:"grid",gap:15}}><p style={{margin:0,color:"#334155"}}>Venda #{String(cancelamentoVenda.numero)} · {dinheiro(Number(cancelamentoVenda.total||0))}</p>
            {cancelamentoErro&&<p role="alert" style={{color:"#b42318",margin:0}}>{cancelamentoErro}</p>}
            <label style={{display:"grid",gap:7,color:"#102c58",fontWeight:600}}>Motivo obrigatório<textarea autoFocus rows={4} maxLength={1000} value={cancelamentoMotivo} onChange={e=>setCancelamentoMotivo(e.target.value)} placeholder="Informe o motivo (mínimo de 5 caracteres)" style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #cbd5e1",borderRadius:10,resize:"vertical"}}/></label>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button type="button" onClick={()=>{setCancelamentoVenda(null);setCancelamentoMotivo("");setCancelamentoErro("");setCancelamentoAutorizado(false);setAdminCancelamentoPin("");}} style={{padding:"11px 15px",borderRadius:10,border:"1px solid #cbd5e1",background:"white"}}>Voltar</button><button type="button" disabled={!cancelamentoAutorizado||cancelamentoMotivo.trim().length<5||!cancelamentoItens.length||cancelamentoSalvando} onClick={()=>void confirmarCancelamentoVenda()} style={{padding:"11px 15px",borderRadius:10,border:0,background:"#102c58",color:"white",fontWeight:700,opacity:cancelamentoMotivo.trim().length<5?0.5:1}}>Confirmar cancelamento</button></div>
          </div></section></div>}
        {cancelamentoVenda&&autorizacaoCancelamentoAberta&&!cancelamentoAutorizado&&String(cancelamentoVenda.situacao)==="concluida"&&<div role="presentation" style={{position:"fixed",inset:0,zIndex:9999,display:"grid",placeItems:"center",background:"#071a35a8",padding:16}}><section role="dialog" aria-modal="true" aria-label="Autorização de cancelamento" style={{width:"min(480px,100%)",background:"white",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 70px #071a3550"}}>
          <header style={{background:"#102c58",color:"white",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={{margin:0,fontSize:19,color:"white"}}>Autorização de cancelamento</h3><button type="button" disabled={cancelamentoSalvando} onClick={()=>{setAutorizacaoCancelamentoAberta(false);setAdminCancelamentoPin("");setCancelamentoAutorizado(false);setCancelamentoVenda(null);setCancelamentoErro("");}} style={{background:"transparent",color:"white",border:"1px solid #ffffff70",borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>✕</button></header>
          <div style={{padding:22,display:"grid",gap:15}}><p style={{margin:0,color:"#334155"}}>Venda #{String(cancelamentoVenda.numero)}. O administrador deve autorizar o cancelamento.</p>
            <label style={{display:"grid",gap:7,fontWeight:600,color:"#102c58"}}>Administrador<select value={adminCancelamentoId} onChange={e=>{setAdminCancelamentoId(e.target.value);setAdminCancelamentoPin("");}} disabled={cancelamentoSalvando} style={{width:"100%",padding:12,border:"1px solid #cbd5e1",borderRadius:10,background:"white"}}><option value="">Selecione um administrador</option>{adminsCancelamento.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
            <label style={{display:"grid",gap:7,fontWeight:600,color:"#102c58"}}>PIN do administrador<div style={{display:"flex",gap:8}}><input type={mostrarPinCancelamento?"text":"password"} autoComplete="off" value={adminCancelamentoPin} onChange={e=>setAdminCancelamentoPin(e.target.value)} disabled={cancelamentoSalvando} placeholder="PIN individual" style={{flex:1,minWidth:0,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/><button type="button" onClick={()=>setMostrarPinCancelamento(v=>!v)} style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:10,padding:"0 12px"}}>{mostrarPinCancelamento?"Ocultar":"👁 Mostrar"}</button></div></label>
            {cancelamentoErro&&<p role="alert" style={{color:"#b42318",margin:0}}>{cancelamentoErro}</p>}
            <p style={{fontSize:12,color:"#64748b",margin:0}}>A operação devolve os produtos ao estoque e registra o estorno como pendente.</p>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button type="button" disabled={cancelamentoSalvando} onClick={()=>{setAutorizacaoCancelamentoAberta(false);setAdminCancelamentoPin("");setCancelamentoAutorizado(false);setCancelamentoVenda(null);setCancelamentoErro("");}} style={{padding:"11px 15px",borderRadius:10,border:"1px solid #cbd5e1",background:"white"}}>Voltar</button><button type="button" disabled={cancelamentoSalvando||validandoAdminCancelamento||!adminCancelamentoId||adminCancelamentoPin.length<3} onClick={()=>void validarAdministradorCancelamento()} style={{padding:"11px 15px",borderRadius:10,border:0,background:"#b42318",color:"white",fontWeight:700}}>{validandoAdminCancelamento?"Validando...":"Validar PIN"}</button></div>
          </div></section></div>}
      </div>
    </section></div>}
    {historicoAberto&&<div className="ev-hist-fundo" role="presentation"><section className="ev-hist-modal" role="dialog" aria-modal="true" aria-label="Consulta de vendas">
      <header className="ev-hist-topo"><div><small>EVOLUX • GESTÃO DO CAIXA</small><h2>{historicoDetalhe?`Venda #${historicoNumero(historicoDetalhe)}`:"Consulta de vendas"}</h2></div><button type="button" onClick={()=>historicoDetalhe?setHistoricoDetalhe(null):setHistoricoAberto(false)} aria-label="Voltar ou fechar">{historicoDetalhe?"← Voltar":"✕ Fechar"}</button></header>
      {historicoDetalhe ? <div className="ev-hist-corpo">
        <div className="ev-hist-resumo"><div><small>Data e hora</small><strong>{historicoHorario(historicoDetalhe)}</strong></div><div><small>Total</small><strong>{dinheiro(historicoValor(historicoDetalhe,"total","valor_total"))}</strong></div><div><small>Recibo</small><strong>#{historicoNumero(historicoDetalhe)}</strong></div></div>
        {historicoDetalheCarregando&&<p>Consultando itens e pagamentos...</p>}
        {historicoDetalheErro&&<p role="alert" className="ev-hist-erro">{historicoDetalheErro}</p>}
        {!historicoDetalheCarregando&&!historicoDetalheErro&&<><h3>Produtos vendidos</h3><div className="ev-hist-lista">{historicoItens.map((item,i)=><div className="ev-hist-item" key={String(item.id||i)}><strong>{String(item.descricao_exibicao||"Produto")}</strong><span>{historicoValor(item,"quantidade","qtd")} × {dinheiro(historicoValor(item,"preco_unitario","preco_venda","preco"))} = {dinheiro(historicoValor(item,"subtotal","total","valor_total")||historicoValor(item,"quantidade","qtd")*historicoValor(item,"preco_unitario","preco_venda","preco"))}</span></div>)}{!historicoItens.length&&<p>Nenhum item disponível para esta venda.</p>}</div><h3>Resumo financeiro</h3><div className="ev-hist-lista"><div className="ev-hist-pag"><span>Subtotal dos produtos</span><strong>{dinheiro(historicoValor(historicoDetalhe,"subtotal","valor_subtotal"))}</strong></div>{historicoValor(historicoDetalhe,"desconto","valor_desconto")>0&&<div className="ev-hist-pag"><span>Desconto concedido</span><strong style={{color:"#b42332"}}>− {dinheiro(historicoValor(historicoDetalhe,"desconto","valor_desconto"))}</strong></div>}<div className="ev-hist-pag"><strong>Total da venda</strong><strong>{dinheiro(historicoValor(historicoDetalhe,"total","valor_total"))}</strong></div></div><h3>Formas de pagamento</h3><div className="ev-hist-lista">{historicoPagamentos.map((pag,i)=><div className="ev-hist-pag" key={String(pag.id||i)}><span>{String(historicoCampo(pag,"forma","forma_pagamento","tipo","metodo")||"Pagamento")}</span><strong>{dinheiro(historicoValor(pag,"valor","valor_pago","total"))}</strong></div>)}{!historicoPagamentos.length&&<p>Nenhum pagamento disponível.</p>}</div></>}
        <p className="ev-hist-aviso">Os pagamentos podem ser corrigidos com justificativa e auditoria. Reimpressão e devoluções serão habilitadas nas próximas etapas.</p>
      </div> : <div className="ev-hist-corpo">
        <div className="ev-hist-filtros"><div className="ev-hist-abas"><button type="button" className={historicoPeriodo==="turno"?"ativo":""} onClick={()=>setHistoricoPeriodo("turno")}>Turno atual</button><button type="button" className={historicoPeriodo==="hoje"?"ativo":""} onClick={()=>setHistoricoPeriodo("hoje")}>Hoje (todos os turnos)</button><button type="button" className={historicoPeriodo==="canceladas"?"ativo":""} onClick={()=>setHistoricoPeriodo("canceladas")}>Vendas canceladas</button></div><input aria-label="Buscar número da venda" value={historicoBusca} onChange={e=>setHistoricoBusca(e.target.value)} placeholder="Pesquisar número do recibo"/><button type="button" onClick={()=>void carregarHistorico()} disabled={historicoCarregando}>↻ Atualizar</button></div>
        <div className="ev-hist-resumo"><div><small>Vendas encontradas</small><strong>{historicoFiltrado.length}</strong></div><div><small>Total vendido</small><strong>{dinheiro(historicoTotal)}</strong></div><div><small>Período</small><strong>{historicoPeriodo==="turno"?"Turno atual":historicoPeriodo==="hoje"?"Hoje":"Canceladas hoje"}</strong></div></div>
        {historicoErro&&<p className="ev-hist-erro" role="alert">{historicoErro}. Confira as permissões de leitura (RLS) da tabela vendas.</p>}
        {historicoPagamentosErro&&<p className="ev-hist-erro" role="alert">{historicoPagamentosErro}</p>}
        {historicoImpressaoErro&&<p className="ev-hist-erro" role="alert">Reimpressão: {historicoImpressaoErro}</p>}
        {historicoCarregando?<p>Carregando vendas do Supabase...</p>:<div className="ev-hist-tabela"><table><thead><tr><th>Recibo</th><th>Data e hora</th><th>Valor</th><th>Forma de pagamento</th><th>Ações</th></tr></thead><tbody>{historicoFiltrado.map((v,i)=><tr key={String(v.id||i)}><td>#{historicoNumero(v)}{String(v.situacao)==="cancelada"&&<span style={{display:"block",color:"#a21d2b",fontWeight:700,fontSize:11}}>CANCELADA</span>}</td><td>{historicoHorario(v)}</td><td>{dinheiro(historicoValor(v,"total","valor_total"))}</td><td className="ev-hist-forma">{formaPagamentoHistorico(v)}</td><td><div className="ev-hist-acoes"><button type="button" onClick={()=>void abrirDetalheHistorico(v)}>Detalhes</button><button type="button" className="ev-hist-corrigir" disabled={String(v.situacao)!=="concluida"} onClick={()=>{setPagamentoPendente(v);setPagamentoCredencial(null);void pedirAutorizacao("pagamento");}}>Alterar pagamento</button><button type="button" className="ev-hist-reimprimir" disabled={historicoImprimindo!==null||String(v.situacao)!=="concluida"} onClick={()=>void reimprimirHistorico(v)}>{historicoImprimindo===String(v.id)?"Preparando...":"▣ Reimprimir"}</button></div></td></tr>)}</tbody></table>{!historicoFiltrado.length&&!historicoErro&&<p>Nenhuma venda encontrada para o período selecionado.</p>}</div>}
        {historicoVendas.length===1000&&<p className="ev-hist-aviso">A consulta está limitada aos primeiros 1.000 registros. Use um filtro no banco para relatórios completos.</p>}
      </div>}
      {correcaoVenda&&<div className="ev-correcao-fundo"><section className="ev-correcao-modal" role="dialog" aria-modal="true" aria-label="Corrigir forma de pagamento">
        <header className="ev-correcao-topo"><div><small>EVOLUX • CORREÇÃO AUDITADA</small><h3>Alterar forma de pagamento</h3></div><button type="button" disabled={correcaoSalvando} onClick={fecharCorrecao} aria-label="Fechar correção">✕</button></header>
        <div className="ev-correcao-corpo">
          <div className="ev-correcao-resumo"><span>Venda #{historicoNumero(correcaoVenda)}</span><strong>{dinheiro(correcaoTotal/100)}</strong></div>
          {correcaoCarregando?<p>Consultando pagamentos atuais...</p>:<>
            <h4>Pagamento registrado</h4>
            <div className="ev-correcao-atuais">{correcaoAtual.map((p,i)=><div key={String(p.id||i)}><span>{String(p.forma)}</span><strong>{dinheiro(Number(p.valor||0))}</strong></div>)}{!correcaoAtual.length&&<p>Nenhum pagamento encontrado.</p>}</div>
            {!correcaoSucesso&&<><h4>Nova distribuição de pagamentos</h4>
              <p className="ev-correcao-dica">Preencha as formas utilizadas. Deixe as demais em branco. A soma deve ser exatamente igual ao valor da venda.</p>
              <div className="ev-correcao-campos">{([['dinheiro','Dinheiro'],['pix','PIX'],['cartao','Cartão crédito/débito']] as const).map(([forma,rotulo])=><label key={forma}>{rotulo}<input inputMode="decimal" value={correcaoValores[forma]} onChange={e=>{setCorrecaoValores(a=>({...a,[forma]:e.target.value}));setCorrecaoErro("");}} placeholder="0,00" disabled={correcaoSalvando} /></label>)}</div>
              <div className="ev-correcao-soma"><span>Total informado: <strong>{Number.isFinite(correcaoSoma)?dinheiro(correcaoSoma/100):"Valor inválido"}</strong></span><span>Diferença: <strong>{Number.isFinite(correcaoSoma)?dinheiro((correcaoTotal-correcaoSoma)/100):"—"}</strong></span></div>
              <label className="ev-correcao-motivo">Motivo da correção (obrigatório)<textarea value={correcaoMotivo} onChange={e=>{setCorrecaoMotivo(e.target.value);setCorrecaoErro("");}} rows={3} maxLength={1000} disabled={correcaoSalvando||!!correcaoErro} placeholder="Ex.: Cliente pagou via PIX, mas a venda foi registrada em dinheiro." /></label>
              <p className="ev-correcao-dica">A correção será registrada com usuário, data, hora, justificativa e pagamentos anteriores e novos. Não altera o estoque nem o total da venda.</p></>}
          </>}
          {correcaoErro&&<p role="alert" className="ev-hist-erro">{correcaoErro}</p>}
          {correcaoSucesso&&<p role="status" className="ev-correcao-sucesso">{correcaoSucesso}</p>}
          <div className="ev-correcao-botoes"><button type="button" onClick={fecharCorrecao} disabled={correcaoSalvando}>{correcaoSucesso?"Concluir":"Cancelar"}</button>{!correcaoSucesso&&<button type="button" className="ev-correcao-confirmar" disabled={!correcaoValida||!!correcaoErro} onClick={()=>void salvarCorrecao()}>{correcaoSalvando?"Salvando...":"Confirmar correção"}</button>}</div>
        </div>
      </section></div>}
    </section></div>}
    {pinAcao&&<div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(6,19,43,.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <section role="dialog" aria-modal="true" aria-label="Autorização do administrador" style={{background:"#fff",borderRadius:16,width:"min(440px,100%)",overflow:"hidden",boxShadow:"0 20px 60px #0005"}}>
        <header style={{background:"#102c58",color:"#fff",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <strong>Autorização do administrador</strong>
          <button type="button" aria-label="Fechar" disabled={pinProcessando} onClick={()=>{setPinAcao(null);setPinValor("");setPagamentoPendente(null);}} style={{background:"transparent",border:0,color:"#fff",fontSize:23,cursor:"pointer"}}>×</button>
        </header>
        <div style={{padding:20,display:"grid",gap:14,color:"#14243d"}}>
          <p style={{margin:0}}>{pinAcao==="apagar"?"Autorizar exclusão do produto lançado.":pinAcao==="cancelar_lancamento"?"Autorizar cancelamento do lançamento atual.":"Autorizar alteração do pagamento da venda."}</p>
          <label style={{display:"grid",gap:6}}>Administrador
            <select value={pinAdminId} onChange={e=>setPinAdminId(e.target.value)} disabled={pinProcessando} style={{padding:11,borderRadius:9,border:"1px solid #bdc9d9"}}>
              {pinAdmins.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <label style={{display:"grid",gap:6}}>PIN do administrador
            <div style={{display:"flex",gap:8}}>
              <input autoFocus type={pinMostrar?"text":"password"} autoComplete="off" inputMode="numeric" value={pinValor} onChange={e=>{setPinValor(e.target.value);setPinErro("");}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();void confirmarAutorizacao();}}} maxLength={64} style={{flex:1,minWidth:0,padding:11,borderRadius:9,border:"1px solid #bdc9d9"}}/>
              <button type="button" onClick={()=>setPinMostrar(a=>!a)}>{pinMostrar?"Ocultar":"Mostrar"}</button>
            </div>
          </label>
          {pinErro&&<p role="alert" style={{color:"#b42332",margin:0}}>{pinErro}</p>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button type="button" disabled={pinProcessando} onClick={()=>{setPinAcao(null);setPinValor("");setPagamentoPendente(null);}} style={{padding:"10px 15px",borderRadius:9}}>Cancelar</button>
            <button type="button" disabled={pinProcessando||!pinAdminId||pinValor.length<3} onClick={()=>void confirmarAutorizacao()} style={{padding:"10px 15px",borderRadius:9,background:"#102c58",color:"#fff",border:0}}>{pinProcessando?"Validando...":"Autorizar"}</button>
          </div>
        </div>
      </section>
    </div>}
    <footer className="ev-novo-rodape"><span>EVOLUX • Gestão Empresarial</span><span>PDV • Terminal 01</span></footer>
    <style jsx>{`
    .ev-turno-overlay{position:fixed;inset:0;z-index:2000;background:#07162f55;display:flex;align-items:center;justify-content:center;padding:15px}.ev-turno-modal{width:min(430px,100%);background:#fff;border:1px solid #b7c5d9;border-radius:8px;box-shadow:0 18px 50px #0004;padding:0 18px 18px;color:#142b4d;font-size:14px}.ev-turno-modal header{font-weight:700;font-size:16px;margin:0 -18px 18px;padding:15px 18px;background:#eef3fa;border-bottom:1px solid #dce5f0}.ev-turno-modal p{line-height:1.5}.ev-turno-campos{display:flex;gap:30px;margin-bottom:18px}.ev-turno-campos>div{display:flex;flex-direction:column;gap:5px}.ev-turno-campos small{color:#60728a}.ev-turno-modal form{display:flex;flex-direction:column;gap:10px}.ev-turno-modal input{padding:11px;border:1px solid #aabbd2;border-radius:5px;font-size:17px}.ev-turno-acoes{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}.ev-turno-acoes button{padding:11px 15px;border:1px solid #b5c6dc;border-radius:6px;background:#f3f6fa;cursor:pointer}.ev-turno-acoes button:first-child{background:#0b2454;color:#fff}.ev-turno-acoes button:disabled{opacity:.5}.ev-turno-erro,.ev-caixa-erro{color:#a32626;background:#fff0ee;padding:10px;border-radius:5px}.ev-caixa-erro,.ev-caixa-processando{position:absolute;top:120px;left:18px;max-width:500px;font-size:13px}.ev-caixa-processando{color:#344761}
    .ev-hist-fundo{position:fixed;inset:0;z-index:3500;background:#0b1e3a99;display:flex;align-items:center;justify-content:center;padding:20px}.ev-hist-modal{width:min(930px,100%);max-height:90dvh;background:#fff;border-radius:17px;box-shadow:0 25px 80px #0005;display:flex;flex-direction:column;overflow:hidden}.ev-hist-topo{display:flex;justify-content:space-between;align-items:center;background:#102b55;color:#fff;padding:18px 24px}.ev-hist-topo small{font-size:10px;letter-spacing:1.5px;color:#bdd2ef}.ev-hist-topo h2{margin:4px 0 0;font-size:23px}.ev-hist-topo button{background:#ffffff1c;color:#fff;border:1px solid #ffffff44;border-radius:8px;padding:10px;cursor:pointer}.ev-hist-corpo{padding:22px;overflow:auto}.ev-hist-filtros{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.ev-hist-abas{display:flex;gap:5px}.ev-hist-filtros button,.ev-hist-tabela button{border:1px solid #c9d9ee;border-radius:8px;background:#f0f5fd;padding:10px 12px;color:#163c70;cursor:pointer}.ev-hist-abas .ativo{background:#163e75;color:#fff}.ev-hist-filtros input{border:1px solid #c9d9ee;border-radius:8px;padding:11px;flex:1;min-width:160px}.ev-hist-resumo{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.ev-hist-resumo>div{border:1px solid #dae5f1;border-radius:11px;padding:14px;background:#f8fafd}.ev-hist-resumo small{display:block;color:#627b99;font-size:11px}.ev-hist-resumo strong{display:block;font-size:19px;margin-top:5px}.ev-hist-tabela{overflow:auto}.ev-hist-tabela table{width:100%;border-collapse:collapse}.ev-hist-tabela th{text-align:left;background:#eff4fa;color:#365678;padding:12px}.ev-hist-tabela td{border-bottom:1px solid #e3eaf3;padding:12px}.ev-hist-tabela td:nth-child(3){font-weight:700}.ev-hist-corpo h3{margin:16px 0 8px}.ev-hist-lista{border:1px solid #dce5f1;border-radius:10px;overflow:hidden}.ev-hist-item,.ev-hist-pag{padding:12px;border-bottom:1px solid #e3eaf3;display:flex;justify-content:space-between;gap:12px}.ev-hist-item{flex-direction:column;gap:4px}.ev-hist-item span{text-align:right}.ev-hist-erro{background:#fff0ee;color:#a32626;padding:12px;border-radius:8px}.ev-hist-aviso{font-size:12px;color:#697c96;margin-top:16px}@media(max-width:600px){.ev-hist-fundo{padding:6px}.ev-hist-modal{max-height:97dvh}.ev-hist-corpo{padding:12px}.ev-hist-resumo{gap:5px}.ev-hist-resumo>div{padding:8px}.ev-hist-resumo strong{font-size:14px}}
    .ev-hist-forma{white-space:nowrap;font-weight:600;color:#355576}.ev-hist-tabela .ev-hist-reimprimir{background:#eef2ff;border-color:#c7d3f5;color:#263f86;font-weight:700;white-space:nowrap}.ev-hist-tabela button:disabled{opacity:.55;cursor:not-allowed}    .ev-hist-acoes{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ev-hist-tabela .ev-hist-corrigir{background:#e9f7f0;border-color:#b8dec9;color:#12623e;font-weight:700;white-space:nowrap}
    .ev-correcao-fundo{position:absolute;inset:0;z-index:3;background:#07172dc9;display:flex;align-items:center;justify-content:center;padding:12px}.ev-hist-modal{position:relative}.ev-correcao-modal{width:min(550px,100%);max-height:100%;overflow:auto;background:#fff;color:#183253;border-radius:14px;box-shadow:0 18px 55px #0005}.ev-correcao-topo{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 20px;background:#102b55;color:#fff}.ev-correcao-topo small{color:#bdd2ef;font-size:10px;letter-spacing:1px}.ev-correcao-topo h3{margin:4px 0 0;font-size:19px}.ev-correcao-topo button{background:#ffffff20;border:1px solid #ffffff50;border-radius:8px;color:#fff;padding:8px 12px}.ev-correcao-corpo{padding:20px}.ev-correcao-resumo,.ev-correcao-atuais>div,.ev-correcao-soma{display:flex;justify-content:space-between;gap:10px;align-items:center}.ev-correcao-resumo{padding:13px;border:1px solid #dce5f1;background:#f5f8fc;border-radius:9px}.ev-correcao-resumo strong{font-size:21px}.ev-correcao-corpo h4{margin:18px 0 9px;font-size:14px}.ev-correcao-atuais{border:1px solid #dce5f1;border-radius:8px}.ev-correcao-atuais>div{padding:10px 12px;border-bottom:1px solid #e6edf5}.ev-correcao-atuais>div:last-child{border-bottom:0}.ev-correcao-dica{font-size:12px;line-height:1.5;color:#657a96}.ev-correcao-campos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ev-correcao-campos label,.ev-correcao-motivo{font-size:12px;font-weight:700;color:#2c496e}.ev-correcao-campos input,.ev-correcao-motivo textarea{display:block;width:100%;margin-top:7px;border:1px solid #cbd9ea;border-radius:8px;padding:10px;color:#193555;font:14px Arial,sans-serif}.ev-correcao-soma{margin:13px 0;padding:12px;border-radius:8px;background:#f3f7fc;font-size:12px;flex-wrap:wrap}.ev-correcao-motivo{display:block;margin-top:14px}.ev-correcao-motivo textarea{resize:vertical}.ev-correcao-botoes{display:flex;justify-content:flex-end;gap:10px;margin-top:17px}.ev-correcao-botoes button{padding:11px 15px;border:1px solid #cbd9ea;background:#f5f8fc;color:#193555;border-radius:8px;font-weight:700}.ev-correcao-botoes .ev-correcao-confirmar{background:#137246;color:white;border-color:#137246}.ev-correcao-sucesso{padding:12px;border-radius:8px;background:#e8f7ee;color:#12623e;font-weight:700}.ev-correcao-modal button:not(:disabled){cursor:pointer}.ev-correcao-modal button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:560px){.ev-correcao-campos{grid-template-columns:1fr}.ev-correcao-corpo{padding:12px}.ev-correcao-soma{display:block}.ev-correcao-soma span{display:block;margin:5px 0}}

    /* EVOLUX Modelo 2 — Caixa Livre. Estilos limitados a esta tela. */
    .ev-m2-conteudo{width:min(1560px,calc(100% - 48px));padding:20px 0 42px}
    .ev-m2-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:23px 28px;border-radius:20px;background:linear-gradient(115deg,#0a3b85 0%,#0b2454 75%);color:white;box-shadow:0 12px 26px #0b245421}
    .ev-m2-hero-title{display:flex;align-items:center;gap:18px;min-width:220px}.ev-m2-hero-icon{display:grid;place-items:center;font-size:39px;color:#fff;width:66px;height:66px;border-right:1px solid #ffffff60;padding-right:13px}
    .ev-m2-hero-title small{font-size:11px;font-weight:800;letter-spacing:1.5px;color:#d6e9ff}.ev-m2-hero-title h1{font-size:35px;margin:5px 0;line-height:1.08;color:white}.ev-m2-hero-title p{font-size:13px;color:#dce9fa;margin:0;text-transform:capitalize}
    .ev-m2-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;flex:1;max-width:890px}
    .ev-m2-metric{display:flex;align-items:center;gap:12px;min-height:76px;padding:12px 15px;border-radius:14px;background:linear-gradient(135deg,#ffffff20,#ffffff0d);border:1px solid #ffffff2e;min-width:0}
    .ev-m2-metric>span{font-size:28px;flex:none;color:#e6f4ff}.ev-m2-metric small{display:block;color:#e0edff;font-size:12px}.ev-m2-metric strong{display:block;font-size:15px;margin-top:4px;color:white;overflow-wrap:anywhere}
    .ev-m2-toolbar{display:flex;justify-content:flex-end;margin:13px 0}.ev-m2-toolbar .ev-novo-sair{padding:9px 13px}
    .ev-novo-turno .ev-novo-sair-topo{padding:8px 11px;gap:6px;white-space:nowrap;font-size:12px;box-shadow:none}.ev-novo-turno .ev-novo-sair-topo>span{font-size:16px}.ev-novo-turno .ev-novo-sair-topo kbd{font-size:10px;padding:3px 5px}@media(max-width:550px){.ev-novo-turno .ev-novo-sair-topo{font-size:12px}.ev-novo-turno .ev-novo-sair-topo kbd{display:none}}
    .ev-m2-grid{grid-template-columns:minmax(0,1.18fr) minmax(0,.92fr);gap:20px;align-items:stretch}
    .ev-m2-grid .ev-novo-principal{gap:12px}.ev-m2-grid .ev-novo-card,.ev-m2-grid .ev-novo-lateral{border-radius:20px;border:1px solid #cddff8;box-shadow:0 7px 19px #102b5512;padding:26px}
    .ev-m2-grid .ev-novo-card-titulo{margin-bottom:19px;align-items:center}.ev-m2-grid .ev-novo-card-titulo>span{font-size:25px;padding:12px 15px;background:linear-gradient(135deg,#5daeff,#0863db);color:white}
    .ev-m2-grid .ev-novo-card-titulo strong{font-size:21px;color:#0b2454}.ev-m2-grid .ev-novo-card-titulo small{display:block;font-size:12px;font-weight:400;color:#536e90;margin-top:5px}
    .ev-m2-grid .ev-novo-campos label,.ev-m2-grid .ev-novo-busca{font-size:14px;color:#0b2454}.ev-m2-grid .ev-novo-campos select,.ev-m2-grid .ev-novo-busca input{height:48px;font-size:15px;border-color:#b9d0ed;border-radius:11px}
    .ev-m2-grid .ev-novo-busca button{height:48px;background:linear-gradient(#0864d9,#073a95);color:#fff;border:0;padding:0 21px;font-size:14px}
    .ev-m2-action{width:100%;min-height:82px;display:flex;align-items:center;gap:20px;padding:16px 22px;border:0;border-radius:15px;color:white;text-align:left;cursor:pointer;box-shadow:0 9px 20px #123b7520;transition:transform .15s ease,filter .15s ease}
    .ev-m2-action:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.06)}.ev-m2-action:disabled{opacity:.55;cursor:not-allowed}
    .ev-m2-action-icon{display:grid;place-items:center;flex:none;min-width:59px;height:59px;border-radius:12px;background:#ffffff2b;font-size:29px}
    .ev-m2-action-copy{flex:1;min-width:0}.ev-m2-action-copy strong{display:block;font-size:21px;letter-spacing:.15px}.ev-m2-action-copy small{display:block;margin-top:5px;font-size:12px;color:#fff;opacity:.9}
    .ev-m2-action kbd{font:800 16px Arial,sans-serif;margin-left:auto;color:#fff;border:1px solid #ffffff80;border-radius:8px;padding:7px 10px;background:#ffffff12}
    .ev-m2-consulta{background:linear-gradient(110deg,#0761bd,#082e7a)}.ev-m2-fechar{background:linear-gradient(110deg,#e3151f,#ae0713)}.ev-m2-abrir{background:linear-gradient(110deg,#125eaf,#073a7c)}
    .ev-m2-grid .ev-novo-iniciar{background:linear-gradient(110deg,#008c47,#006132);min-height:82px;padding:16px 22px}
    .ev-m2-grid .ev-novo-iniciar strong{font-size:21px}.ev-m2-grid .ev-novo-iniciar .ev-m2-action-icon{padding:0}.ev-m2-grid .ev-novo-iniciar kbd{font-size:16px}
    .ev-m2-side-heading{display:flex;align-items:center;gap:16px;margin-bottom:19px}.ev-m2-side-heading>span{display:grid;place-items:center;background:linear-gradient(135deg,#5daeff,#0863db);color:#fff;border-radius:13px;width:58px;height:58px;font-size:30px;flex:none}
    .ev-m2-side-heading h2{font-size:24px;color:#0b2454;margin:0}.ev-m2-side-heading p{font-size:13px;color:#496b95;margin:5px 0 0}
    .ev-m2-grid .ev-novo-acoes{gap:12px}.ev-m2-grid .ev-novo-acoes button{min-height:83px;border-color:#c8dcf7;background:linear-gradient(105deg,#f8fbff,#eef5ff);border-radius:14px;cursor:pointer;padding:14px}
    .ev-m2-grid .ev-novo-acoes button:hover{border-color:#4389db;background:#edf5ff}.ev-m2-grid .ev-novo-icone{width:53px;height:53px;font-size:28px;color:#0755ad;background:#e2eeff}
    .ev-m2-grid .ev-novo-acoes strong{font-size:16px;color:#0b2454}.ev-m2-grid .ev-novo-acoes small{font-size:12px;color:#536e90}
    .ev-m2-grid .ev-novo-acoes em{background:#dbeaff;border:1px solid #c3d9f6;color:#0c3b7b;font-size:12px;font-weight:700;padding:9px 12px}
    .ev-m2-notice{display:flex;align-items:center;gap:12px;background:#e1efff;border:1px solid #bdd7ff;border-radius:14px;padding:16px 18px;margin:18px 0 0;color:#153e79;font-size:13px}.ev-m2-notice span{font-size:22px;color:#0759b9}
    @media(max-width:1150px){.ev-m2-hero{flex-direction:column;align-items:stretch}.ev-m2-metrics{max-width:none}.ev-m2-grid{grid-template-columns:1fr}}
    @media(max-width:700px){.ev-m2-conteudo{width:calc(100% - 24px)}.ev-m2-hero{padding:19px}.ev-m2-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ev-m2-grid .ev-novo-card,.ev-m2-grid .ev-novo-lateral{padding:17px}.ev-m2-action-copy strong,.ev-m2-grid .ev-novo-iniciar strong{font-size:16px}.ev-m2-action{gap:10px;padding:12px}.ev-m2-action-icon{min-width:46px;height:46px;font-size:24px}.ev-m2-side-heading h2{font-size:21px}}
    @media(max-width:420px){.ev-m2-metrics{grid-template-columns:1fr}.ev-m2-action kbd{font-size:12px;padding:5px}.ev-m2-grid .ev-novo-acoes em{font-size:10px;padding:6px}}

    /* EVOLUX 24.6.6: alinhamento e catálogo de produtos na localização F7 */
    .ev-troca-pdv-dialog{box-sizing:border-box;padding:24px!important;border-radius:14px!important}
    .ev-troca-pdv-dialog>header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;margin-bottom:16px!important}
    .ev-troca-pdv-dialog>header h2{font-size:19px!important;line-height:1.3!important;margin:0!important}
    .ev-troca-pdv-dialog>header button{width:36px;height:36px;flex-shrink:0;cursor:pointer;border-radius:8px}
    .ev-troca-pdv-dialog>p{line-height:1.55!important;margin:10px 0 16px!important}
    .ev-troca-pdv-campo{margin-top:14px}.ev-troca-pdv-campo>label,.ev-troca-pdv-catalogo-corpo>label{display:block!important;font-size:12px!important;font-weight:700!important;margin:0 0 7px!important}
    .ev-troca-pdv-pesquisa{display:flex!important;align-items:stretch!important;gap:10px!important;width:100%!important}
    .ev-troca-pdv-pesquisa input{box-sizing:border-box!important;display:block!important;flex:1 1 auto!important;width:100%!important;min-width:0!important;height:44px!important;padding:0 13px!important;font-size:14px!important}
    .ev-troca-pdv-pesquisa button{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 112px!important;min-width:112px!important;height:44px!important;font-weight:700!important;white-space:nowrap!important}
    .ev-troca-pdv-abrir-catalogo{display:block!important;width:100%!important;margin-top:10px!important;padding:12px 14px!important;border:1px solid #b6cce5!important;border-radius:8px!important;background:#eef5ff!important;color:#143b72!important;text-align:center!important;font-weight:700!important;cursor:pointer!important}
    .ev-troca-pdv-abrir-catalogo:hover{background:#dfeeff!important}
    .ev-troca-pdv-catalogo-fundo{position:fixed!important;inset:0!important;z-index:99999!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(8,23,48,.65)!important;padding:20px!important}
    .ev-troca-pdv-catalogo{box-sizing:border-box!important;display:flex!important;flex-direction:column!important;width:min(94vw,760px)!important;max-height:85vh!important;background:#fff!important;color:#172b4a!important;border-radius:14px!important;overflow:hidden!important;box-shadow:0 20px 65px #0005!important}
    .ev-troca-pdv-catalogo>header{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;background:#122d56!important;color:#fff!important;padding:18px 22px!important}
    .ev-troca-pdv-catalogo>header h3{margin:4px 0 0!important;font-size:21px!important}.ev-troca-pdv-catalogo>header small{font-size:10px!important;letter-spacing:1px!important}
    .ev-troca-pdv-catalogo>header button{color:#fff!important;background:#ffffff20!important;border:1px solid #ffffff55!important;border-radius:7px!important;padding:8px 12px!important;cursor:pointer!important}
    .ev-troca-pdv-catalogo-corpo{padding:20px 22px!important;overflow:auto!important;min-height:0!important}
    .ev-troca-pdv-catalogo-corpo>input{display:block!important;box-sizing:border-box!important;width:100%!important;height:44px!important;padding:0 12px!important;border:1px solid #b6cce5!important;border-radius:8px!important;font-size:14px!important}
    .ev-troca-pdv-catalogo-corpo>p{font-size:12px!important;color:#526b8c!important;margin:10px 0!important}
    .ev-troca-pdv-catalogo-lista{display:flex!important;flex-direction:column!important;gap:5px!important;max-height:46vh!important;overflow:auto!important}
    .ev-troca-pdv-catalogo-lista button{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;padding:12px!important;text-align:left!important;background:#fff!important;border:1px solid #e1e9f3!important;border-radius:8px!important;cursor:pointer!important;color:#152f52!important}
    .ev-troca-pdv-catalogo-lista button:hover{background:#edf5ff!important;border-color:#8eb6e6!important}
    .ev-troca-pdv-catalogo-lista button span:first-child{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important}.ev-troca-pdv-catalogo-lista small{font-size:11px!important;color:#61738d!important}
    .ev-troca-pdv-catalogo-valor{font-size:13px!important;font-weight:700!important;white-space:nowrap!important}
    .ev-troca-pdv-catalogo>footer{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;padding:12px 22px!important;border-top:1px solid #e1e9f3!important;font-size:11px!important;color:#60738d!important}
    .ev-troca-pdv-catalogo>footer button{cursor:pointer!important;padding:9px 16px!important;border:1px solid #c4d3e6!important;border-radius:7px!important;background:#fff!important;color:#193a6b!important}
    @media(max-width:560px){.ev-troca-pdv-dialog{padding:16px!important}.ev-troca-pdv-pesquisa{flex-wrap:wrap!important}.ev-troca-pdv-pesquisa button{flex:1 1 100%!important}.ev-troca-pdv-catalogo>footer{flex-wrap:wrap!important}}
    .ev-troca-pdv-dialog{max-width:680px!important;width:min(94vw,680px)!important;max-height:88vh;overflow-y:auto}.ev-troca-pdv-dialog p{font-size:13px}.ev-troca-pdv-dialog label{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:13px}.ev-troca-pdv-dialog label input,.ev-troca-pdv-dialog label select{padding:10px;border:1px solid #b9cde4;border-radius:8px}.ev-troca-pdv-pesquisa{display:flex;gap:8px}.ev-troca-pdv-pesquisa input{flex:1;min-width:0;padding:12px;border:1px solid #b9cde4;border-radius:8px}.ev-troca-pdv-pesquisa button,.ev-troca-pdv-confirmar{background:#17427b;color:#fff;border:0;border-radius:8px;padding:11px 16px;cursor:pointer}.ev-troca-pdv-resultados{max-height:290px;overflow:auto;margin-top:10px}.ev-troca-pdv-resultados button{display:flex;flex-direction:column;gap:4px;width:100%;padding:10px;text-align:left;background:white;border:1px solid #e1e9f3;cursor:pointer}.ev-troca-pdv-resultados span{font-size:12px;color:#526b8c}.ev-venda-linha.ev-troca-pdv-devolvido{background:#fff1a6!important;border-left:4px solid #d59a00!important;color:#503700!important;cursor:default}.ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-numero{background:#d49a00;color:#fff}.ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-linha-topo,.ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-linha-baixo{color:#503700}.ev-troca-pdv-valores{display:grid;gap:8px}.ev-troca-pdv-valores>div{display:flex;justify-content:space-between;padding:10px;border:1px solid #e1e9f3;border-radius:8px}.ev-troca-pdv-aviso{color:#98630d}.ev-troca-pdv-dialog button:disabled{cursor:not-allowed;opacity:.6}
    .ev-troca-form{display:flex;flex-direction:column;gap:12px;border-top:1px solid #d7e3f1;padding-top:14px}.ev-troca-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:#294363}.ev-troca-form input,.ev-troca-form select,.ev-troca-form textarea{min-width:0;width:100%;padding:9px;border:1px solid #cbd9e9;border-radius:8px;background:white;color:#193c6b}.ev-troca-item{display:grid;grid-template-columns:minmax(0,2fr) 90px minmax(0,1.5fr);gap:10px;align-items:end;padding:10px;border:1px solid #e0e9f4;border-radius:8px}.ev-troca-item small{display:block;color:#617894;margin-top:4px}.ev-troca-add{display:grid;grid-template-columns:minmax(0,1fr) 85px auto;gap:8px}.ev-troca-add button,.ev-troca-novo button{padding:9px;border:1px solid #a7c4e6;border-radius:8px;background:#e9f2ff;color:#193c6b}.ev-troca-busca{position:relative;min-width:0}.ev-troca-sugestoes{position:absolute;top:100%;left:0;right:0;z-index:50;max-height:230px;overflow-y:auto;background:#fff;border:1px solid #a7c4e6;border-radius:8px;box-shadow:0 8px 20px #193c6b26}.ev-troca-sugestoes button{display:flex;flex-direction:column;align-items:flex-start;width:100%;padding:9px 12px;border:0;border-bottom:1px solid #e6edf7;background:white;text-align:left;cursor:pointer;color:#193c6b}.ev-troca-sugestoes button:hover{background:#e9f2ff}.ev-troca-sugestoes button:disabled{cursor:not-allowed}.ev-troca-sugestoes small,.ev-troca-selecionado{color:#52749a;font-size:11px}.ev-troca-sem-resultado{padding:12px;color:#617894}.ev-troca-novo{display:flex;justify-content:space-between;gap:10px;align-items:center}.ev-canc-opcoes button{text-align:left;cursor:pointer}.ev-canc-opcoes button:disabled{cursor:not-allowed}@media(max-width:600px){.ev-troca-item,.ev-troca-add{grid-template-columns:1fr}}
    .ev-canc-filtros{display:flex;flex-direction:column;gap:12px}.ev-canc-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ev-canc-grade label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700;color:#294363}.ev-canc-grade input,.ev-canc-grade select{width:100%;min-width:0;padding:11px;border:1px solid #cbd9e9;border-radius:8px;background:#fff;color:#193c6b;font:14px Arial,sans-serif}.ev-canc-buscar-acoes{display:flex;justify-content:flex-end}.ev-canc-buscar-acoes button{background:#163e75;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-weight:700}.ev-canc-listagem h3{margin:6px 0 12px}.ev-canc-tabela{overflow-x:auto}.ev-canc-tabela table{border-collapse:collapse;width:100%;font-size:12px}.ev-canc-tabela th{background:#eff4fa;text-align:left;padding:10px;white-space:nowrap}.ev-canc-tabela td{border-bottom:1px solid #e3eaf3;padding:10px;white-space:nowrap}.ev-canc-tabela button,.ev-canc-voltar{background:#edf4ff;color:#163e75;border:1px solid #c9d9ee;border-radius:7px;padding:8px 11px}.ev-canc-buscar-acoes button:disabled,.ev-canc-tabela button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:600px){.ev-canc-grade{grid-template-columns:1fr}}
        .ev-canc-corpo{display:flex;flex-direction:column;gap:14px}.ev-canc-opcoes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ev-canc-opcao{padding:14px;border:1px solid #cadbf0;border-radius:11px;background:#f1f6fd}.ev-canc-opcao strong,.ev-canc-opcao small{display:block}.ev-canc-opcao strong{font-size:13px;color:#193c6b}.ev-canc-opcao small{margin-top:5px;color:#6b7e97;font-size:11px}.ev-canc-opcao.ativa{border-color:#9abce8;background:#e9f2ff}.ev-canc-opcao.indisponivel{opacity:.55}.ev-canc-busca label,.ev-canc-motivo{font-weight:700;color:#294363;font-size:13px}.ev-canc-busca>div{display:flex;gap:10px;margin-top:7px}.ev-canc-busca input{flex:1;min-width:0;border:1px solid #cbd9e9;border-radius:8px;padding:12px;font-size:14px}.ev-canc-busca button{background:#163e75;color:#fff;border:0;border-radius:8px;padding:12px 17px;font-weight:700}.ev-canc-resultado{display:flex;flex-direction:column;gap:9px}.ev-canc-resultado .ev-hist-resumo{margin:0}.ev-canc-resultado h3{margin:9px 0 0}.ev-canc-data{margin:0;color:#60758f;font-size:12px}.ev-canc-motivo{display:flex;flex-direction:column;gap:7px;margin-top:12px}.ev-canc-motivo textarea{resize:vertical;border:1px solid #cbd9e9;border-radius:8px;padding:12px;font:14px Arial,sans-serif}.ev-canc-rodape{display:flex;justify-content:flex-end}.ev-canc-confirmar{background:#a32626;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:700}.ev-canc-confirmar:disabled,.ev-canc-busca button:disabled{opacity:.5;cursor:not-allowed}.ev-canc-sucesso{background:#e9f7f0;color:#12623e;border-radius:8px;padding:13px}.ev-canc-corpo button:not(:disabled){cursor:pointer}@media(max-width:600px){.ev-canc-opcoes{grid-template-columns:1fr}.ev-canc-busca>div{flex-direction:column}}
    /* Padrão EVOLUX: cursor de mão em controles clicáveis. */
    .ev-caixa-livre button:not(:disabled),.ev-caixa-livre select:not(:disabled),.ev-caixa-livre a,.ev-hist-tabela tr:has(button:not(:disabled)){cursor:pointer}
    .ev-caixa-livre input:not([type="radio"]){cursor:text}
    .ev-caixa-livre button:disabled,.ev-caixa-livre select:disabled{cursor:not-allowed}
    .ev-caixa-livre{min-height:100dvh;display:flex;flex-direction:column;background:#f4f7fc;color:#142744;font:14px Arial,Helvetica,sans-serif}.ev-caixa-livre *{box-sizing:border-box}.ev-novo-topo{background:#102b55;color:#fff;min-height:92px;padding:20px clamp(20px,4vw,72px);display:flex;justify-content:space-between;align-items:center;gap:20px}.ev-novo-marca{display:flex;align-items:center;gap:12px}.ev-novo-simbolo{width:45px;height:45px;border-radius:12px;background:#2479d8;display:grid;place-items:center;font-weight:900;font-size:28px}.ev-novo-marca strong{font-size:25px;letter-spacing:1px}.ev-novo-marca strong span{color:#5ac9ff}.ev-novo-marca small{display:block;font-size:10px;letter-spacing:1.6px;color:#b8d2f1;margin-top:3px}.ev-novo-turno{display:flex;align-items:center;gap:15px;font-size:12px;color:#c8d9ef}.ev-novo-turno strong{font:700 20px monospace;color:#fff}.ev-novo-status{display:flex;align-items:center;gap:7px;background:#ffffff19;padding:9px 12px;border-radius:30px;color:#fff}.ev-novo-status i{width:8px;height:8px;background:#48e0a0;border-radius:50%}.ev-novo-conteudo{width:min(1200px,calc(100% - 40px));margin:0 auto;padding:35px 0 50px;flex:1}.ev-novo-titulo{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:28px}.ev-novo-titulo small,.ev-novo-secao small{font-size:11px;color:#4771a6;font-weight:800;letter-spacing:1.3px}.ev-novo-titulo h1{font-size:35px;line-height:1.15;margin:7px 0;color:#132c50}.ev-novo-titulo p{color:#697c96;margin:0;text-transform:capitalize}.ev-novo-sair{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #d6e0ed;color:#233c5e;padding:12px 15px;border-radius:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px #102b5508}.ev-novo-sair:hover{border-color:#93afce;background:#f9fbff}.ev-novo-sair>span{font-size:20px}.ev-novo-sair kbd,.ev-novo-iniciar kbd{font:700 12px Arial,sans-serif;border:1px solid #d8e1ed;border-radius:5px;padding:4px 7px;color:#6c8099}.ev-novo-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:24px;align-items:start}.ev-novo-principal{display:flex;flex-direction:column;gap:18px}.ev-novo-card,.ev-novo-lateral{background:#fff;border:1px solid #dce5f1;border-radius:17px;padding:25px;box-shadow:0 6px 22px #17365b0b}.ev-novo-card-titulo{display:flex;align-items:center;gap:10px;font-size:17px;margin-bottom:22px}.ev-novo-card-titulo>span{background:#edf4ff;color:#1a5da9;padding:9px;border-radius:9px}.ev-novo-campos{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ev-novo-campos label,.ev-novo-busca{display:block;font-weight:700;font-size:12px;color:#294363}.ev-novo-campos small,.ev-novo-busca small{font-weight:400;color:#7b8ca3;margin-left:5px}.ev-novo-campos select,.ev-novo-busca input{display:block;margin-top:9px;width:100%;height:43px;padding:0 12px;border:1px solid #d0ddeb;border-radius:9px;background:#fff;color:#1d3555;font:14px Arial,sans-serif}.ev-novo-busca{margin-top:21px}.ev-novo-busca>div{display:flex;gap:9px}.ev-novo-busca input{flex:1;min-width:0}.ev-novo-busca button{margin-top:9px;background:#edf4ff;color:#154d90;border:1px solid #cbdcf1;border-radius:9px;padding:0 14px;font-weight:700;cursor:pointer}.ev-novo-iniciar{width:100%;min-height:105px;background:#137246;color:#fff;border:0;border-radius:15px;display:flex;align-items:center;gap:18px;text-align:left;padding:22px 25px;cursor:pointer;box-shadow:0 10px 20px #13724620}.ev-novo-iniciar:hover{background:#0f613b}.ev-novo-iniciar:disabled{opacity:.6;cursor:wait}.ev-novo-carrinho{font-size:30px;background:#ffffff24;border-radius:12px;padding:12px}.ev-novo-iniciar strong{display:block;font-size:20px;letter-spacing:.3px}.ev-novo-iniciar small{display:block;font-size:12px;color:#d3f7e3;margin-top:5px}.ev-novo-iniciar kbd{margin-left:auto;border-color:#ffffff77;color:#fff}.ev-novo-dica{font-size:12px;line-height:1.5;color:#6b7e97;margin:0 3px}.ev-novo-secao h2{font-size:20px;margin:7px 0}.ev-novo-secao p{color:#71839c;font-size:12px;line-height:1.5;margin:0 0 18px}.ev-novo-acoes{display:grid;gap:10px}.ev-novo-acoes button{width:100%;display:flex;align-items:center;text-align:left;gap:13px;background:#f8fafd;border:1px solid #e1e8f1;border-radius:12px;padding:15px 13px;color:#334963}.ev-novo-acoes button:disabled{cursor:not-allowed}.ev-novo-icone{display:grid;place-items:center;flex:none;width:40px;height:40px;background:#eaf1fa;border-radius:10px;font-size:24px;color:#47719d}.ev-novo-acoes button>span:nth-child(2){flex:1}.ev-novo-acoes strong{display:block;font-size:13px}.ev-novo-acoes small{display:block;font-size:11px;margin-top:4px;color:#75879c}.ev-novo-acoes em{font-size:10px;font-style:normal;background:#eaf0f7;color:#7b8ca3;border-radius:20px;padding:6px 8px;white-space:nowrap}.ev-novo-rodape{display:flex;justify-content:space-between;padding:14px clamp(20px,4vw,72px);border-top:1px solid #e1e8f1;background:#fff;font-size:11px;color:#8190a3}@media(max-width:900px){.ev-novo-grid{grid-template-columns:1fr}.ev-novo-topo{flex-wrap:wrap}.ev-novo-turno{flex-wrap:wrap}.ev-novo-conteudo{padding-top:25px}}@media(max-width:550px){.ev-novo-titulo{align-items:flex-start}.ev-novo-titulo h1{font-size:28px}.ev-novo-sair{font-size:0}.ev-novo-sair kbd{font-size:11px}.ev-novo-campos{grid-template-columns:1fr}.ev-novo-card,.ev-novo-lateral{padding:18px}.ev-novo-busca>div{flex-direction:column}.ev-novo-busca button{height:40px}.ev-novo-iniciar strong{font-size:15px}.ev-novo-iniciar{padding:15px;gap:10px}.ev-novo-turno>span:nth-child(2){display:none}}
    `}</style>
    {fechamentoAberto&&<div className="ev-venda-overlay" style={{position:"fixed",inset:0,zIndex:3700,background:"rgba(7,22,47,.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,boxSizing:"border-box",overflowY:"auto"}}>
      <section role="dialog" aria-modal="true" aria-label="Fechamento de caixa" style={{width:"min(560px,96vw)",maxHeight:"90dvh",overflowY:"auto",background:"#fff",borderRadius:16,boxShadow:"0 20px 60px #0005"}}>
        <header style={{background:"#102c58",color:"#fff",padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div><small style={{color:"#c5d8f3"}}>CONTAGEM CEGA</small><h2 style={{margin:"4px 0 0",fontSize:21}}>Fechamento do turno {turno?.numero}</h2></div>
          <button type="button" disabled={fechamentoEnviando} onClick={()=>setFechamentoAberto(false)} style={{background:"#ffffff20",border:"1px solid #ffffff55",color:"#fff",borderRadius:8,padding:9,cursor:"pointer"}}>× Fechar</button>
        </header>
        <div style={{padding:22,display:"grid",gap:15,color:"#193354"}}>
          <p style={{margin:0,fontSize:13,lineHeight:1.5,color:"#516782"}}>Informe os valores efetivamente encontrados. Os valores esperados não serão exibidos ao operador. O fechamento definitivo depende de aprovação.</p>
          {fechamentoCarregando?<p>Consultando situação do turno...</p>:fechamentoStatus?<p role="status" style={{background:"#eaf7ef",color:"#176b43",padding:13,borderRadius:9}}>{fechamentoStatus}</p>:<>
            {([ ["dinheiro","Dinheiro contado na gaveta"],["pix","Total dos comprovantes PIX"],["cartao","Total dos comprovantes de cartão"] ] as const).map(([chave,rotulo])=><label key={chave} style={{display:"grid",gap:7,fontWeight:700,fontSize:13}}>{rotulo} (R$)
              <input inputMode="decimal" autoComplete="off" placeholder="0,00" value={fechamentoValores[chave]} onChange={e=>setFechamentoValores(v=>({...v,[chave]:e.target.value}))} disabled={fechamentoEnviando} style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #cbd5e1",borderRadius:9,fontSize:16}}/>
            </label>)}
            <label style={{display:"grid",gap:7,fontWeight:700,fontSize:13}}>Observação (opcional)
              <textarea rows={2} maxLength={1000} value={fechamentoObservacao} onChange={e=>setFechamentoObservacao(e.target.value)} disabled={fechamentoEnviando} style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #cbd5e1",borderRadius:9}}/>
            </label>
          </>}
          {fechamentoErro&&<p role="alert" style={{color:"#b91c1c",margin:0}}>{fechamentoErro}</p>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:9,flexWrap:"wrap"}}>
            <button type="button" disabled={fechamentoEnviando} onClick={()=>setFechamentoAberto(false)} style={{padding:"11px 16px",borderRadius:9,background:"#fff",color:"#193354",border:"1px solid #cbd5e1",cursor:"pointer"}}>Voltar</button>
            {!fechamentoStatus&&!fechamentoCarregando&&<button type="button" disabled={fechamentoEnviando} onClick={()=>void enviarFechamento()} style={{padding:"11px 16px",borderRadius:9,background:"#102c58",color:"#fff",border:0,fontWeight:700,cursor:"pointer"}}>{fechamentoEnviando?"Enviando...":"Enviar para supervisão"}</button>}
          </div>
        </div>
      </section>
    </div>}
    {consultaProdutosAberta&&<div className="ev-venda-overlay" style={{position:"fixed",inset:0,zIndex:3600,background:"rgba(7,22,47,.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,boxSizing:"border-box",overflowY:"auto"}} onKeyDown={e=>{if(e.key==="Escape")setConsultaProdutosAberta(false)}}>
      <section role="dialog" aria-modal="true" aria-label="Consulta de Produtos" style={{width:"min(780px,96vw)",maxHeight:"88dvh",background:"#fff",borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px #0005"}}>
        <header style={{background:"#102c58",color:"#fff",padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <strong style={{fontSize:20}}>Consulta de Produtos</strong>
          <button type="button" onClick={()=>setConsultaProdutosAberta(false)} style={{color:"#fff",background:"#ffffff20",border:"1px solid #ffffff55",borderRadius:8,padding:"8px 12px",cursor:"pointer"}}>× Fechar</button>
        </header>
        <div style={{padding:20,overflowY:"auto"}}>
          <label style={{display:"grid",gap:7,fontWeight:700,color:"#193c6b"}}>Buscar produto
            <input autoFocus value={consultaProdutosBusca} onChange={e=>setConsultaProdutosBusca(e.target.value)} placeholder="Nome, código interno ou código de barras" style={{width:"100%",boxSizing:"border-box",border:"1px solid #cbd9e9",borderRadius:9,padding:13,fontSize:15}}/>
          </label>
          <p style={{fontSize:12,color:"#64748b"}}>Consulta somente leitura • preços de venda e estoque disponível</p>
          {consultaProdutosErro&&<p role="alert" style={{color:"#b91c1c"}}>{consultaProdutosErro}</p>}
          {consultaProdutosCarregando?<p>Carregando produtos...</p>:
            <div style={{display:"grid",gap:9}}>
              {consultaProdutosFiltrados.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",border:"1px solid #dce5f1",borderRadius:10,padding:13}}>
                <div style={{flex:"1 1 240px",minWidth:0}}><strong style={{color:"#102c58"}}>{p.descricao}</strong><small style={{display:"block",color:"#64748b",marginTop:5}}>Código: {p.codigo} • EAN: {p.codigo_barras||"—"}</small></div>
                <div><small style={{display:"block",color:"#64748b"}}>Preço de venda</small><strong style={{color:"#102c58"}}>{dinheiro(Number(p.preco_venda))}</strong></div>
                <div><small style={{display:"block",color:"#64748b"}}>Estoque</small><strong style={{color:"#102c58"}}>{Number(p.estoque_atual).toLocaleString("pt-BR")} un.</strong></div>
              </div>)}
              {!consultaProdutosFiltrados.length&&!consultaProdutosErro&&<p>Nenhum produto encontrado.</p>}
            </div>}
        </div>
      </section>
    </div>}
  </main>;

  return <main className="ev-venda-tela">
    {cancelamentoAberto&&<div className="ev-hist-fundo ev-f7-fundo" role="presentation"><section className="ev-hist-modal ev-f7-modal" role="dialog" aria-modal="true" aria-label="Cancelamentos, trocas e devoluções">
      <header className="ev-hist-topo"><div><small>EVOLUX • GESTÃO DO CAIXA</small><h2>Modo Troca · F7</h2></div><button type="button" disabled={cancelamentoSalvando||trocaSalvando} onClick={fecharCancelamentos}>✕ Fechar</button></header>
      <div className="ev-hist-corpo ev-canc-corpo">
        <p className="ev-f7-aviso">Localize a venda original, selecione os itens devolvidos e bipe os novos produtos. A venda atual permanece preservada.</p>
        <form className="ev-canc-filtros" onSubmit={e=>{e.preventDefault();void localizarVendaCancelamento();}}>
          <div className="ev-canc-grade">
            <label>Data da venda (opcional)<input type="date" value={cancelamentoData} onChange={e=>setCancelamentoData(e.target.value)} disabled={cancelamentoCarregando||cancelamentoSalvando}/></label>
            <label>Caixa / operador<select value={cancelamentoCaixa} onChange={e=>{setCancelamentoCaixa(e.target.value);setCancelamentoTurno("");}} disabled={cancelamentoCarregando||cancelamentoSalvando}><option value="">Todos os caixas</option>{cancelamentoCaixas.map((id,i)=><option key={id} value={id}>Caixa do operador {i+1} ({id.slice(0,8)})</option>)}</select></label>
            <label>Turno<select value={cancelamentoTurno} onChange={e=>setCancelamentoTurno(e.target.value)} disabled={cancelamentoCarregando||cancelamentoSalvando}><option value="">Todos os turnos</option>{cancelamentoTurnosFiltrados.map(t=><option key={String(t.id)} value={String(t.id)}>Turno {String(t.numero||"—")}</option>)}</select></label>
            <label>Número do recibo (opcional)<input inputMode="numeric" value={cancelamentoBusca} onChange={e=>setCancelamentoBusca(e.target.value)} placeholder="Ex.: 3" disabled={cancelamentoCarregando||cancelamentoSalvando}/></label>
          </div>
          <div className="ev-canc-buscar-acoes"><button type="submit" disabled={cancelamentoCarregando||cancelamentoSalvando}>{cancelamentoCarregando?"Buscando...":"Buscar vendas"}</button></div>
        </form>
        {cancelamentoPesquisado&&!cancelamentoVenda&&<div className="ev-canc-listagem">
          <h3>Resultados da consulta ({cancelamentoResultados.length})</h3>
          {cancelamentoLimite&&<p className="ev-hist-aviso">Exibindo as 500 vendas mais recentes dos filtros. Refine a data, o caixa ou o recibo.</p>}
          {cancelamentoResultados.length?<div className="ev-canc-tabela"><table><thead><tr><th>Recibo</th><th>Data e hora</th><th>Turno</th><th>Valor</th><th>Pagamento</th><th>Situação</th><th></th></tr></thead><tbody>
          {cancelamentoResultados.map(v=>{const t=cancelamentoTurnos.find(t=>String(t.id)===String(v.caixa_turno_id));return <tr key={String(v.id)}><td>#{historicoNumero(v)}{String(v.situacao)==="cancelada"&&<span style={{display:"block",color:"#a21d2b",fontWeight:700,fontSize:11}}>CANCELADA</span>}</td><td>{historicoHorario(v)}</td><td>{t?`Turno ${String(t.numero||"—")}`:"—"}</td><td>{dinheiro(historicoValor(v,"total"))}</td><td>{formaCancelamento(v)}</td><td>{String(v.situacao)==="concluida"?"Concluída":"Cancelada"}</td><td><button type="button" onClick={()=>void selecionarVendaCancelamento(v)} disabled={cancelamentoCarregando||cancelamentoSalvando||trocaSalvando||String(v.situacao)!=="concluida"} style={{background:String(v.situacao)==="concluida"?"#b42318":"#cbd5e1",color:"#fff",border:"1px solid #9f1d16",borderRadius:8,padding:"9px 14px",fontWeight:700,cursor:String(v.situacao)==="concluida"?"pointer":"not-allowed"}} aria-label={`Cancelar venda número ${historicoNumero(v)}`}>{String(v.situacao)==="concluida"?"Cancelar":"Cancelada"}</button></td></tr>;})}
          </tbody></table></div>:<p className="ev-hist-aviso">Nenhuma venda encontrada com esses filtros.</p>}
        </div>}
        {cancelamentoVenda&&<button type="button" className="ev-canc-voltar" disabled={cancelamentoSalvando||trocaSalvando} onClick={()=>{setCancelamentoVenda(null);setCancelamentoMotivo("");setCancelamentoSucesso("");setCancelamentoErro("");setCancelamentoAutorizado(false);setAdminCancelamentoPin("");setAutorizacaoCancelamentoAberta(false);resetarTroca();}}>← Voltar aos resultados</button>}
        {cancelamentoErro&&<p className="ev-hist-erro" role="alert">{cancelamentoErro}</p>}
        {cancelamentoSucesso&&<p className="ev-canc-sucesso" role="status">{cancelamentoSucesso}</p>}
        {cancelamentoVenda&&<div className="ev-canc-resultado">
          <div className="ev-hist-resumo"><div><small>Recibo</small><strong>#{historicoNumero(cancelamentoVenda)}</strong></div><div><small>Valor original</small><strong>{dinheiro(historicoValor(cancelamentoVenda,"total"))}</strong></div><div><small>Situação</small><strong>{String(cancelamentoVenda.situacao)==="concluida"?"Concluída":"Cancelada"}</strong></div></div>
          <p className="ev-canc-data">Venda realizada em {historicoHorario(cancelamentoVenda)}</p>
          <h3>Produtos da venda</h3><div className="ev-hist-lista">{cancelamentoItens.map((item,i)=><div className="ev-hist-pag" key={String(item.id||i)}><span>{String(item.descricao||"Produto")} · {Number(item.quantidade)} un.</span><strong>{dinheiro(Number(item.subtotal||0))}</strong></div>)}</div>
          <h3>Pagamentos registrados</h3><div className="ev-hist-lista">{cancelamentoPagamentos.map((pag,i)=><div className="ev-hist-pag" key={String(pag.id||i)}><span>{String(pag.forma)}</span><strong>{dinheiro(Number(pag.valor||0))}</strong></div>)}</div>
          {operacaoTroca==="troca"&&<div className="ev-troca-form">
            {trocaErro&&<p className="ev-hist-erro" role="alert">{trocaErro}</p>}
            {trocaSucesso&&<p className="ev-canc-sucesso" role="status">{trocaSucesso}</p>}
            {String(cancelamentoVenda.situacao)!=="concluida"?<p className="ev-hist-aviso">Venda cancelada: não pode ser trocada.</p>:<>
            <h3>1. Produtos devolvidos</h3>
            {trocaCarregando?<p>Consultando quantidades disponíveis...</p>:trocaSaldo.map(i=><div className="ev-troca-item" key={String(i.venda_item_id)}><div><strong>{String(i.descricao)}</strong><small>Disponível: {Number(i.quantidade_disponivel)} de {Number(i.quantidade_vendida)} unidades</small></div><label>Qtd.<input type="number" min="0" max={Number(i.quantidade_disponivel)} step="0.001" value={trocaQuantidades[String(i.venda_item_id)]||""} onChange={e=>{setTrocaQuantidades(a=>({...a,[String(i.venda_item_id)]:e.target.value}));trocaChaveRef.current=null;}} disabled={trocaSalvando||!!trocaSucesso}/></label><label>Condição<select value={trocaCondicoes[String(i.venda_item_id)]||"bom"} onChange={e=>setTrocaCondicoes(a=>({...a,[String(i.venda_item_id)]:e.target.value}))} disabled={trocaSalvando||!!trocaSucesso}><option value="bom">Bom (volta ao estoque)</option><option value="danificado">Danificado (separado)</option><option value="analise">Em análise (separado)</option></select></label></div>)}
            <h3>2. Produtos novos (opcional)</h3>
            <p className="ev-hist-aviso">Bipe o código e pressione Enter ou clique em um resultado. O produto será incluído imediatamente na troca e no cálculo abaixo.</p>
            <div className="ev-troca-add"><div className="ev-troca-busca"><input type="text" autoComplete="off" aria-label="Buscar produto por código de barras, código interno ou descrição" placeholder="Bipe o código ou digite código / descrição" value={trocaBuscaProduto} onChange={e=>{setTrocaBuscaProduto(e.target.value);setTrocaProdutoEscolhido("");setTrocaSugestoesAbertas(true);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();localizarCodigoTroca();}if(e.key==="Escape")setTrocaSugestoesAbertas(false);}} disabled={trocaSalvando||!!trocaSucesso}/>{trocaProdutoEscolhido&&<small className="ev-troca-selecionado">Produto pronto para adicionar</small>}{trocaSugestoesAbertas&&trocaBuscaNormalizada&&<div className="ev-troca-sugestoes" role="listbox">{trocaSugestoes.length?trocaSugestoes.map(p=><button type="button" role="option" aria-selected={false} key={p.id} onClick={()=>selecionarProdutoTroca(p)} disabled={trocaSalvando||!!trocaSucesso}><strong>{p.codigo} — {p.descricao}</strong><small>{dinheiro(Number(p.preco_venda))} · Estoque {p.estoque_atual}</small></button>):<div className="ev-troca-sem-resultado">Nenhum produto encontrado</div>}</div>}</div><input type="number" aria-label="Quantidade do produto novo" min="0.001" step="0.001" value={trocaQuantidadeNova} onChange={e=>setTrocaQuantidadeNova(e.target.value)} disabled={trocaSalvando||!!trocaSucesso}/><button type="button" onClick={adicionarProdutoTroca} disabled={trocaSalvando||!!trocaSucesso}>Adicionar</button></div>
            {trocaNovos.length===0&&<p className="ev-hist-aviso">Nenhum produto novo adicionado. A conferência abaixo considera apenas os itens já incluídos.</p>}
            {trocaNovos.map((n,i)=><div className="ev-troca-novo" key={i}><span>{produtos.find(p=>p.id===n.produto_id)?.descricao||"Produto"} × {n.quantidade}</span><button type="button" onClick={()=>setTrocaNovos(a=>a.filter((_,j)=>i!==j))} disabled={trocaSalvando||!!trocaSucesso}>Remover</button></div>)}
            <h3>3. Conferência financeira</h3>
            <div className="ev-hist-resumo"><div><small>Produtos devolvidos</small><strong>{dinheiro(trocaValorDevolvido)}</strong></div><div><small>Produtos novos</small><strong>{dinheiro(trocaValorNovo)}</strong></div><div><small>{trocaDiferenca>0?"Cliente paga":trocaDiferenca<0?"Cliente recebe":"Diferença"}</small><strong>{dinheiro(Math.abs(trocaDiferenca))}</strong></div></div>
            {trocaDiferenca<0&&<label>Destino da diferença<select value={trocaDestino} onChange={e=>setTrocaDestino(e.target.value as "credito"|"reembolso")} disabled={trocaSalvando||!!trocaSucesso}><option value="credito">Crédito para compra futura</option><option value="reembolso">Reembolso (pendente de confirmação)</option></select></label>}
            {trocaDiferenca<0&&trocaDestino==="credito"&&!cancelamentoVenda.cliente_id&&<p className="ev-hist-erro">Esta venda não possui cliente cadastrado. Para gerar crédito, é necessário vincular um cliente à venda original; selecione reembolso ou regularize o cadastro.</p>}
            {(trocaDiferenca>0||(trocaDiferenca<0&&trocaDestino==="reembolso"))&&<label>{trocaDiferenca>0?"Forma de recebimento":"Forma de reembolso"}<select value={trocaForma} onChange={e=>setTrocaForma(e.target.value as "dinheiro"|"pix"|"cartao")} disabled={trocaSalvando||!!trocaSucesso}><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="cartao">Cartão</option></select></label>}
            <label>Motivo da troca<textarea rows={3} maxLength={1000} value={trocaMotivo} onChange={e=>setTrocaMotivo(e.target.value)} disabled={trocaSalvando||!!trocaSucesso} placeholder="Informe o motivo (mínimo 5 caracteres)"/></label>
            <p className="ev-hist-aviso">O cálculo mostrado é uma prévia. O banco recalcula e valida os valores, o estoque e as permissões. Reembolsos são registrados como pendentes e não são pagos automaticamente.</p>
            <button type="button" className="ev-canc-confirmar" disabled={!trocaValida||trocaCarregando||trocaSalvando||!!trocaSucesso||trocaBloqueadaRef.current} onClick={()=>void confirmarTroca()}>{trocaSalvando?"Registrando...":"Confirmar troca / devolução parcial"}</button>
            </>}
          </div>}
          {operacaoTroca==="cancelamento"&&String(cancelamentoVenda.situacao)==="concluida"&&!cancelamentoSucesso?<>
            <label className="ev-canc-motivo" htmlFor="ev-canc-motivo">Motivo do cancelamento (obrigatório)<textarea id="ev-canc-motivo" rows={3} maxLength={1000} value={cancelamentoMotivo} onChange={e=>setCancelamentoMotivo(e.target.value)} placeholder="Descreva o motivo com pelo menos 5 caracteres" disabled={cancelamentoSalvando}/></label>
            <p className="ev-hist-aviso">O cancelamento é definitivo. Os produtos retornam automaticamente ao estoque; o estorno financeiro será registrado como pendente, sem devolver dinheiro automaticamente.</p>
            <div className="ev-canc-rodape"><button type="button" className="ev-canc-confirmar" disabled={cancelamentoSalvando||cancelamentoMotivo.trim().length<5||!cancelamentoItens.length||!cancelamentoAutorizado} onClick={()=>void confirmarCancelamentoVenda()}>{cancelamentoSalvando?"Cancelando...":"Confirmar cancelamento"}</button></div>
          </>:operacaoTroca==="cancelamento"?<p className="ev-hist-aviso">Esta venda não pode ser cancelada novamente.</p>:null}
          {autorizacaoCancelamentoAberta&&operacaoTroca==="cancelamento"&&String(cancelamentoVenda.situacao)==="concluida"&&<div role="presentation" style={{position:"fixed",inset:0,zIndex:9999,display:"grid",placeItems:"center",background:"#071a35a8",padding:16}}><section role="dialog" aria-modal="true" aria-label="Autorização de cancelamento" style={{width:"min(480px,100%)",background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 70px #071a3550"}}>
            <header style={{background:"#102c58",color:"white",padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><h3 style={{margin:0,fontSize:19,color:"white"}}>Autorização de cancelamento</h3><button type="button" disabled={cancelamentoSalvando} onClick={()=>{setAutorizacaoCancelamentoAberta(false);setCancelamentoVenda(null);setCancelamentoAutorizado(false);setAdminCancelamentoPin("");}} aria-label="Fechar autorização" style={{background:"transparent",color:"white",border:"1px solid #ffffff70",borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>✕</button></header>
            <div style={{padding:22,display:"grid",gap:15}}><p style={{margin:0,color:"#334155"}}>Para cancelar a venda #{String(cancelamentoVenda.numero)}, informe as credenciais de um administrador.</p>
              <label style={{display:"grid",gap:7,fontWeight:600,color:"#102c58"}}>Administrador<select value={adminCancelamentoId} onChange={e=>setAdminCancelamentoId(e.target.value)} disabled={cancelamentoSalvando} style={{width:"100%",padding:12,border:"1px solid #cbd5e1",borderRadius:10,background:"white"}}><option value="">Selecione um administrador</option>{adminsCancelamento.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
              <label style={{display:"grid",gap:7,fontWeight:600,color:"#102c58"}}>PIN do administrador<div style={{display:"flex",gap:8}}><input type={mostrarPinCancelamento?"text":"password"} autoComplete="off" value={adminCancelamentoPin} onChange={e=>setAdminCancelamentoPin(e.target.value)} disabled={cancelamentoSalvando} placeholder="PIN individual" style={{flex:1,minWidth:0,padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/><button type="button" onClick={()=>setMostrarPinCancelamento(v=>!v)} aria-label={mostrarPinCancelamento?"Ocultar PIN":"Mostrar PIN"} style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:10,padding:"0 12px",cursor:"pointer"}}>{mostrarPinCancelamento?"Ocultar":"👁 Mostrar"}</button></div></label>
              {cancelamentoErro&&<p role="alert" style={{color:"#b42318",margin:0}}>{cancelamentoErro}</p>}
              <div style={{display:"flex",justifyContent:"flex-end",gap:10,flexWrap:"wrap"}}><button type="button" disabled={cancelamentoSalvando} onClick={()=>{setAutorizacaoCancelamentoAberta(false);setCancelamentoVenda(null);setCancelamentoAutorizado(false);setAdminCancelamentoPin("");setCancelamentoErro("");}} style={{padding:"11px 15px",borderRadius:10,border:"1px solid #cbd5e1",background:"white",cursor:"pointer"}}>Voltar</button><button type="button" disabled={cancelamentoSalvando||validandoAdminCancelamento||!adminCancelamentoId||adminCancelamentoPin.length<3} onClick={()=>void validarAdministradorCancelamento()} style={{padding:"11px 15px",borderRadius:10,border:0,background:"#b42318",color:"white",fontWeight:700,cursor:"pointer"}}>{validandoAdminCancelamento?"Validando...":"Validar administrador"}</button></div>
            </div></section></div>}
        </div>}
      </div>
    </section></div>}

    <div className="ev-venda-top">
      <section className="ev-venda-busca">
        <div className="ev-venda-busca-tabs"><button className={tipoBusca==="codigo"?"ativo":""} onClick={()=>{setTipoBusca("codigo");setModalPesquisa(false);setBusca("");buscaRef.current?.focus()}}>▦ BUSCA POR CÓDIGO (F2)</button><button className={tipoBusca==="descricao"?"ativo":""} onClick={()=>{setTipoBusca("descricao");setModalPesquisa(false);setBusca("");buscaRef.current?.focus()}}>⌕ BUSCA POR DESCRIÇÃO (F2)</button></div>
        {produtoPendente ? <>
          <strong>DIGITE A QUANTIDADE E PRESSIONE ENTER</strong>
          <div className="ev-pdv-pendente-nome" title={produtoPendente.descricao}>{produtoPendente.descricao}</div>
          <div className="ev-pdv-quantidade"><label htmlFor="ev-pdv-qtd">QUANTIDADE</label><div><input id="ev-pdv-qtd" ref={quantidadeRef} autoFocus inputMode="numeric" value={quantidadePendente} onFocus={e=>e.currentTarget.select()} onChange={e=>setQuantidadePendente(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();confirmarProduto();}}}/><button type="button" onClick={confirmarProduto} disabled={operacaoEnviada||!produtoPendente} style={{cursor:operacaoEnviada?"not-allowed":"pointer"}}>Adicionar à listagem ↵</button></div></div>
        </> : <>
          <strong>{tipoBusca==="codigo" ? "INFORME O CÓDIGO DO ITEM E PRESSIONE ENTER" : "DIGITE O NOME DO PRODUTO E PRESSIONE ENTER"}</strong>
          <div className="ev-venda-input"><input ref={buscaRef} autoFocus value={busca} onChange={e=>{setBusca(e.target.value);setSelecionado(0)}} placeholder={tipoBusca==="codigo"?"Código / EAN":"Descrição do produto"} onKeyDown={e=>{
            if(e.key==="Enter"){
              e.preventDefault();
              const termo=busca.trim().toLocaleLowerCase("pt-BR");
              const produto=tipoBusca==="codigo"
                ? produtos.find(x=>String(x.codigo)===termo||(x.codigo_barras||"")===termo)
                : encontrados[Math.min(selecionado,encontrados.length-1)];
              if(produto)prepararProduto(produto);
              else setErro("Produto não encontrado.");
            }
            if(tipoBusca==="descricao"&&e.key==="ArrowDown"){e.preventDefault();setSelecionado(n=>Math.min(n+1,Math.max(0,encontrados.length-1)));}
            if(tipoBusca==="descricao"&&e.key==="ArrowUp"){e.preventDefault();setSelecionado(n=>Math.max(0,n-1));}
          }}/><button type="button" onClick={()=>{setModalPesquisa(false);void abrirPesquisaCliente();}} title="Abrir lista de produtos">🔎<small>F2</small></button></div>
          {tipoBusca==="descricao" && busca.trim() && <div className="ev-pdv-sugestoes" role="listbox" aria-label="Produtos encontrados">
            {encontrados.length ? encontrados.slice(0,6).map((p,i)=><button type="button" key={p.id} className={i===selecionado?"ativo":""} onClick={()=>prepararProduto(p)}>
              <span>{p.descricao}</span><strong>{dinheiro(Number(p.preco_venda))}</strong>
            </button>) : <span className="ev-pdv-sem-resultados">Nenhum produto encontrado</span>}
          </div>}
          {erro && <div className="ev-pdv-erro" role="alert">{erro}</div>}
        </>}
      </section>
      <section className="ev-venda-info"><fieldset><legend>INFORMAÇÕES DA VENDA</legend><div className="ev-venda-identificacao"><span>TERMINAL 01</span><strong>{turno ? `${turno.numero}º TURNO` : "TURNO NÃO ABERTO"}</strong></div><div><small>CLIENTE:</small><strong>{clienteSelecionado ? nomeCliente(clienteSelecionado) : "NÃO INFORMADO PARA ESTA VENDA. PARA INFORMAR PRESSIONE F3"}</strong></div><div className="ev-venda-dados"><span>DATA<strong>{dataAtual}</strong></span><span>CONTROLE<strong>EM PREPARAÇÃO</strong></span></div><div className="ev-venda-operador">OPERADOR: {operador}</div></fieldset></section>
    </div>
    <div className="ev-venda-main"><aside className="ev-venda-marca"><div className="ev-venda-logo">EVOLU<span>X</span></div></aside><section className="ev-venda-lancamentos"><div className="ev-venda-abas"><span className="ev-venda-aba-fixa">{trocaPDVAtiva?"⇄ MODO TROCA · F7":"▥ PRODUTOS"}</span></div><div className="ev-venda-itens">{trocaPDVAtiva&&trocaPDVItem&&<div className="ev-venda-linha ev-troca-pdv-devolvido" aria-label="Produto devolvido na troca">
      <div className="ev-venda-linha-topo"><strong>DEVOLUÇÃO — {String(trocaPDVItem.descricao)}</strong><span>{String(produtos.find(p=>p.id===String(trocaPDVItem.produto_id))?.codigo_barras||produtos.find(p=>p.id===String(trocaPDVItem.produto_id))?.codigo||"")}</span></div>
      <div className="ev-venda-linha-baixo"><span className="ev-venda-numero">↩</span><span className="ev-venda-calculo">− {dinheiro(Number(trocaPDVItem.preco_unitario))} <small>UN</small> <b>×</b> <span className="ev-venda-qtd-fixa">{trocaPDVQtd}</span> <b>=</b> <strong>− {dinheiro(trocaPDVValorDevolvido)}</strong></span></div>
    </div>}{carrinho.map((l,i)=><div key={l.produto.id} className={`ev-venda-linha ${itemSelecionado===l.produto.id?"selecionado":""}`} onClick={()=>setItemSelecionado(l.produto.id)}><div className="ev-venda-linha-topo"><strong>{l.produto.descricao}</strong><span>{l.produto.codigo_barras||l.produto.codigo}</span></div><div className="ev-venda-linha-baixo"><span className="ev-venda-numero">{i+1}</span><span className="ev-venda-calculo">{dinheiro(Number(l.produto.preco_venda))} <small>UN</small> <b>×</b> <span className="ev-venda-qtd-fixa" aria-label={`Quantidade de ${l.produto.descricao}: ${l.quantidade}`}>{l.quantidade}</span> <b>=</b> <strong>{dinheiro(l.quantidade*Number(l.produto.preco_venda))}</strong></span></div></div>)}</div></section></div>
    <div className="ev-venda-totais"><div><strong>ITENS & LANÇAMENTOS</strong><span>{carrinho.length} itens • {unidades} unidades</span></div><div><strong>{trocaPDVAtiva?(trocaPDVDiferenca>0?"CLIENTE PAGA":trocaPDVDiferenca<0?"CLIENTE RECEBE":"TROCA SEM DIFERENÇA"):"TOTAL DO LANÇAMENTO"}</strong><b>{dinheiro(trocaPDVAtiva?Math.abs(trocaPDVDiferenca):total)}</b></div></div>
    {pinAcao&&<div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(6,19,43,.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <section role="dialog" aria-modal="true" aria-label="Autorização do administrador" style={{background:"#fff",borderRadius:16,width:"min(440px,100%)",overflow:"hidden",boxShadow:"0 20px 60px #0005"}}>
        <header style={{background:"#102c58",color:"#fff",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <strong>Autorização do administrador</strong>
          <button type="button" aria-label="Fechar" disabled={pinProcessando} onClick={()=>{setPinAcao(null);setPinValor("");setPagamentoPendente(null);}} style={{background:"transparent",border:0,color:"#fff",fontSize:23,cursor:"pointer"}}>×</button>
        </header>
        <div style={{padding:20,display:"grid",gap:14,color:"#14243d"}}>
          <p style={{margin:0}}>{pinAcao==="apagar"?"Autorizar exclusão do produto lançado.":pinAcao==="cancelar_lancamento"?"Autorizar cancelamento do lançamento atual.":"Autorizar alteração do pagamento da venda."}</p>
          <label style={{display:"grid",gap:6}}>Administrador
            <select value={pinAdminId} onChange={e=>setPinAdminId(e.target.value)} disabled={pinProcessando} style={{padding:11,borderRadius:9,border:"1px solid #bdc9d9"}}>
              {pinAdmins.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <label style={{display:"grid",gap:6}}>PIN do administrador
            <div style={{display:"flex",gap:8}}>
              <input autoFocus type={pinMostrar?"text":"password"} autoComplete="off" inputMode="numeric" value={pinValor} onChange={e=>{setPinValor(e.target.value);setPinErro("");}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();void confirmarAutorizacao();}}} maxLength={64} style={{flex:1,minWidth:0,padding:11,borderRadius:9,border:"1px solid #bdc9d9"}}/>
              <button type="button" onClick={()=>setPinMostrar(a=>!a)}>{pinMostrar?"Ocultar":"Mostrar"}</button>
            </div>
          </label>
          {pinErro&&<p role="alert" style={{color:"#b42332",margin:0}}>{pinErro}</p>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button type="button" disabled={pinProcessando} onClick={()=>{setPinAcao(null);setPinValor("");setPagamentoPendente(null);}} style={{padding:"10px 15px",borderRadius:9}}>Cancelar</button>
            <button type="button" disabled={pinProcessando||!pinAdminId||pinValor.length<3} onClick={()=>void confirmarAutorizacao()} style={{padding:"10px 15px",borderRadius:9,background:"#102c58",color:"#fff",border:0}}>{pinProcessando?"Validando...":"Autorizar"}</button>
          </div>
        </div>
      </section>
    </div>}
    <footer className="ev-venda-footer ev-operacoes-rodape"><div className="ev-venda-acoes"><button type="button" className="ev-acao-apagar" onClick={removerSelecionado} disabled={!itemSelecionado}><span aria-hidden="true">🗑️</span><small>APAGAR ITEM (DEL)</small></button><button type="button" className="ev-acao-troca" onClick={iniciarTrocaPDV}><span aria-hidden="true">⇄</span><small>TROCA DE PRODUTOS (F7)</small></button></div><button type="button" className="ev-venda-concluir" disabled={!trocaPDVAtiva&&!carrinho.length} onClick={abrirPagamento}><span aria-hidden="true">✓</span><small>{trocaPDVAtiva?"CONFERIR TROCA (F12)":"CONCLUIR LANÇAMENTO (F12)"}</small></button><button type="button" className="ev-venda-cancelar" onClick={cancelarLancamento} disabled={operacaoEnviada}><span aria-hidden="true">✕</span><small>{trocaPDVAtiva?"CANCELAR TROCA (F9)":"CANCELAR LANÇAMENTO (F9)"}</small></button></footer>
    {trocaPDVBuscaAberta&&<div className="ev-venda-overlay"><section className="ev-operacao-dialog ev-troca-pdv-dialog" role="dialog" aria-modal="true" aria-label="Localizar produto para troca">
      <header><h2>F7 — LOCALIZAR PRODUTO DEVOLVIDO</h2><button type="button" onClick={()=>setTrocaPDVBuscaAberta(false)}>×</button></header>
      {!trocaPDVItem?<><p>Digite ou bipe o código do produto devolvido. Selecione a venda original correspondente.</p>
      <div className="ev-troca-pdv-campo"><label htmlFor="ev-troca-pdv-codigo">Produto para devolução</label><div className="ev-troca-pdv-pesquisa"><input id="ev-troca-pdv-codigo" autoFocus value={trocaPDVBusca} onChange={e=>{setTrocaPDVBusca(e.target.value);setTrocaPDVErro("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void pesquisarProdutoDevolvido();}}} placeholder="Bipe o código e pressione Enter ou use F2 para pesquisar"/><button type="button" className="ev-troca-pdv-buscar" onClick={()=>{setTrocaPDVCatalogoFiltro(trocaPDVBusca.trim());setTrocaPDVCatalogoAberto(true);}} disabled={trocaPDVCarregando}>⌕ Buscar (F2)</button></div></div>
      
      {trocaPDVCatalogoAberto&&<div className="ev-troca-pdv-catalogo-fundo"><section className="ev-troca-pdv-catalogo" role="dialog" aria-modal="true" aria-label="Pesquisar produtos cadastrados"><header><div><small>EVOLUX · CATÁLOGO</small><h3>Pesquisar produtos</h3></div><button type="button" onClick={()=>setTrocaPDVCatalogoAberto(false)} aria-label="Fechar pesquisa">✕</button></header><div className="ev-troca-pdv-catalogo-corpo"><label htmlFor="ev-troca-catalogo-filtro">Nome, código interno ou código de barras</label><input id="ev-troca-catalogo-filtro" autoFocus value={trocaPDVCatalogoFiltro} onChange={e=>setTrocaPDVCatalogoFiltro(e.target.value)} placeholder="Digite para filtrar os produtos..."/><p>Selecione um produto para localizar as vendas originais correspondentes.</p><div className="ev-troca-pdv-catalogo-lista">{produtos.filter(p=>{const t=trocaPDVCatalogoFiltro.trim().toLocaleLowerCase("pt-BR");return !t||p.descricao.toLocaleLowerCase("pt-BR").includes(t)||String(p.codigo).includes(t)||(p.codigo_barras||"").toLocaleLowerCase("pt-BR").includes(t);}).slice(0,80).map(p=><button type="button" key={p.id} onClick={()=>{setTrocaPDVCatalogoAberto(false);setTrocaPDVBusca(String(p.codigo));setTrocaPDVProdutoLivre(p);setTrocaPDVResultados([]);void pesquisarProdutoDevolvido(String(p.codigo));}}><span><strong>{p.descricao}</strong><small>Cód. {p.codigo} · EAN {p.codigo_barras||"não informado"}</small></span><span className="ev-troca-pdv-catalogo-valor">{dinheiro(Number(p.preco_venda))}</span></button>)}</div></div><footer><span>Exibindo até 80 produtos. Refine a pesquisa para localizar outros.</span><button type="button" onClick={()=>setTrocaPDVCatalogoAberto(false)}>Fechar</button></footer></section></div>}
      <div className="ev-troca-pdv-sem-venda" style={{marginTop:14,padding:14,border:"1px solid #c8d8ee",borderRadius:10,background:"#f4f8ff"}}>
        <strong style={{display:"block",marginBottom:6}}>Cliente sem comprovante?</strong>
        <p style={{margin:"0 0 10px",fontSize:13,color:"#435777"}}>Selecione o produto cadastrado e continue sem vincular uma venda anterior. O preço atual será usado apenas como referência.</p>
        {trocaPDVProdutoLivre?<button type="button" style={{width:"100%",padding:12,borderRadius:8,background:"#153967",color:"#fff",cursor:"pointer",border:0,fontWeight:700}} onClick={()=>selecionarTrocaSemVenda(trocaPDVProdutoLivre!)}>Continuar sem venda original — {trocaPDVProdutoLivre.descricao}</button>:<p style={{fontSize:12}}>Pesquise um código exato ou selecione um produto no catálogo para habilitar esta opção.</p>}
      </div>
      <div className="ev-troca-pdv-resultados">{trocaPDVResultados.map(i=><button type="button" key={String(i.id)} onClick={()=>void selecionarDevolucaoPDV(i)} disabled={trocaPDVCarregando}><strong>{String(i.descricao)}</strong><span>Recibo #{String((i.venda as Record<string,unknown>).numero)} · {new Date(String((i.venda as Record<string,unknown>).criada_em)).toLocaleDateString("pt-BR")} · {Number(i.quantidade)} un. · {dinheiro(Number(i.preco_unitario))}/un.</span></button>)}</div>
      {!trocaPDVCarregando&&trocaPDVBusca&&trocaPDVResultados.length===0&&<p>Pesquise para localizar uma venda correspondente.</p>}</>:<><p><strong>{trocaPDVSemVenda?"SEM VENDA ORIGINAL":`Recibo #${String(trocaPDVVenda?.numero)}`}</strong> · {String(trocaPDVItem.descricao)}</p>{trocaPDVSemVenda?<p>Preço atual de referência: {dinheiro(Number(trocaPDVItem.preco_unitario))}. A operação ainda não será gravada.</p>:<p>Disponível para devolução: {String(trocaPDVItem.saldo)} unidade(s).</p>}<label>Quantidade<input type="number" min="0.001" step="0.001" max={Number(trocaPDVItem.saldo)} value={trocaPDVQtd} onChange={e=>setTrocaPDVQtd(e.target.value)}/></label><p className="ev-troca-pdv-aviso">Somente produtos em condições de venda podem ser trocados. O produto devolvido será considerado em boas condições.</p><button type="button" className="ev-troca-pdv-confirmar" onClick={confirmarDevolucaoPDV}>Continuar na tela de vendas</button><button type="button" onClick={()=>{setTrocaPDVItem(null);setTrocaPDVSemVenda(false);}}>← Escolher outro produto</button></>}
      {trocaPDVCarregando&&<p>Consultando vendas...</p>}{trocaPDVErro&&<p className="ev-hist-erro" role="alert">{trocaPDVErro}</p>}
      <p className="ev-troca-pdv-aviso">Modo de teste: nenhuma movimentação será gravada.</p>
    </section></div>}
    {trocaPDVFinalizar&&trocaPDVAtiva&&<div className="ev-venda-overlay"><section className="ev-operacao-dialog ev-pagamento-novo ev-troca-pagamento" role="dialog" aria-modal="true" aria-label="Confirmando troca">
      <header><h2>CONFIRMANDO TROCA</h2><button type="button" onClick={()=>setTrocaPDVFinalizar(false)} aria-label="Fechar">×</button></header>
      <div className="ev-pag-resumo"><span>{trocaPDVDiferenca>0?"DIFERENÇA A PAGAR":trocaPDVDiferenca<0?"DIFERENÇA A DEVOLVER":"TROCA SEM DIFERENÇA"}</span><strong>{dinheiro(Math.abs(trocaPDVDiferenca))}</strong></div>
      <div className="ev-troca-pagamento-origem"><span>Produto devolvido: <strong>{dinheiro(trocaPDVValorDevolvido)}</strong></span><span>Produtos novos: <strong>{dinheiro(total)}</strong></span></div>
      {trocaPDVDiferenca>0?<>
        <p className="ev-pag-instrucao">INFORME OS VALORES RECEBIDOS — PODE UTILIZAR MAIS DE UMA FORMA</p>
        <div className="ev-pag-campos">{([{"campo":"dinheiro","rotulo":"DINHEIRO","tecla":"F1"},{"campo":"pix","rotulo":"PIX","tecla":"F2"},{"campo":"cartao","rotulo":"CARTÃO CRÉDITO/DÉBITO","tecla":"F3"}] as const).map(f=><label key={f.campo} className="ev-pag-linha"><span>{f.rotulo} <small>({f.tecla})</small></span><div className="ev-pag-entrada"><span>R$</span><input ref={el=>{trocaPagamentoRefs.current[f.campo]=el;}} inputMode="decimal" aria-label={f.rotulo} placeholder="0,00" value={trocaPagamento[f.campo]} onChange={e=>{if(/^[\d.,]*$/.test(e.target.value)){setTrocaPagamento(v=>({...v,[f.campo]:e.target.value}));setTrocaErroPagamento("");}}}/></div></label>)}</div>
        <div className="ev-pag-totais"><div><span>TOTAL A PAGAR</span><strong>{dinheiro(trocaAReceber/100)}</strong></div><div><span>TOTAL RECEBIDO</span><strong>{dinheiro(trocaRecebido/100)}</strong></div>{trocaRestante>0&&<div className="ev-pag-restante"><span>RESTANTE</span><strong>{dinheiro(trocaRestante/100)}</strong></div>}<div className="ev-pag-troco"><span>TROCO</span><strong>{dinheiro(trocaTroco/100)}</strong></div></div>
        {!trocaPagamentoValido&&<p className="ev-pag-erro" role="alert">Informe valores com até duas casas decimais.</p>}
        {trocaNaoDinheiro>trocaAReceber&&<p className="ev-pag-erro" role="alert">PIX e cartão não podem ultrapassar a diferença a pagar.</p>}
      </>:trocaPDVDiferenca<0?<>
        <p className="ev-pag-instrucao">ESCOLHA COMO O CLIENTE RECEBERÁ A DIFERENÇA</p>
        <div className="ev-troca-pagamento-escolha"><label>Destino da diferença<select value={trocaDestino} onChange={e=>setTrocaDestino(e.target.value as "credito"|"reembolso")}><option value="reembolso">Reembolso ao cliente</option><option value="credito">Crédito para compra futura</option></select></label>{trocaDestino==="reembolso"&&<label>Forma do reembolso<select value={trocaForma} onChange={e=>setTrocaForma(e.target.value as "dinheiro"|"pix"|"cartao")}><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="cartao">Cartão</option></select></label>}</div>
        <div className="ev-pag-totais"><div><span>VALOR A {trocaDestino==="credito"?"CREDITAR":"REEMBOLSAR"}</span><strong>{dinheiro(Math.abs(trocaPDVDiferenca))}</strong></div></div>
        {trocaDestino==="credito"&&!trocaPDVVenda?.cliente_id&&<p className="ev-pag-erro">Para gerar crédito será necessário identificar um cliente.</p>}
      </>:<div className="ev-pag-totais"><div><span>DIFERENÇA FINANCEIRA</span><strong>R$ 0,00</strong></div></div>}
      {trocaErroPagamento&&<p className="ev-pag-erro" role="alert">{trocaErroPagamento}</p>}
      <p className="ev-pag-nota">MODO DE TESTE — nenhuma movimentação de estoque ou caixa será registrada. A confirmação permanece desabilitada até a integração financeira.</p>
      <footer><button type="button" onClick={()=>setTrocaPDVFinalizar(false)}>Voltar à troca (Esc)</button><button type="button" disabled title="Aguardando integração segura com estoque e fechamento de caixa">Confirmar troca (F12)</button></footer>
    </section></div>}
    {modalOperacao&&<div className="ev-venda-overlay"><section className="ev-operacao-dialog ev-pagamento-novo" role="dialog" aria-modal="true" aria-label={modalOperacao==="pagamento"?"Confirmando pagamento":"Troca ou devolução"}>
      <header><h2>{modalOperacao==="pagamento"?"CONFIRMANDO PAGAMENTO":"Troca ou devolução"}</h2><button type="button" onClick={()=>{if(vendaConfirmada)novaVendaAposConfirmacao();else fecharPagamento();}} disabled={finalizandoVenda} aria-label="Fechar">×</button></header>
      {modalOperacao==="pagamento" ? vendaConfirmada ? <>
        <div className="ev-pag-resumo"><span>VENDA CONFIRMADA</span><strong>#{vendaConfirmada.numero}</strong></div>
        <div className="ev-pag-totais"><div><span>TOTAL</span><strong>{dinheiro(vendaConfirmada.total)}</strong></div><div><span>TROCO</span><strong>{dinheiro(vendaConfirmada.troco)}</strong></div></div>
        <div className="ev-pag-impressao-pergunta" role="status"><strong>VENDA FINALIZADA COM SUCESSO!</strong><span>Deseja imprimir o cupom do cliente?</span><small>Comprovante não fiscal — papel térmico de 80 mm</small></div>
        {erroPagamento&&<p className="ev-pag-erro" role="alert">{erroPagamento}</p>}
        <footer><button type="button" onClick={novaVendaAposConfirmacao}>Não, voltar ao Caixa Livre (Esc)</button><button type="button" onClick={imprimirCupom}>Sim, imprimir cupom (F12)</button></footer>
      </> : <>
        <div className="ev-pag-resumo"><span>TOTAL DA VENDA</span><strong>{dinheiro(total)}</strong></div>
        <div className="ev-pag-desconto" style={{display:"grid",gap:10}}>
          <strong>1. DESCONTO DA VENDA <small>(F6)</small></strong>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button type="button" disabled={operacaoEnviada} aria-pressed={descontoTipo==="valor"} onClick={()=>{setDescontoTipo("valor");setDescontoPagamento("");setErroPagamento("");}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #9eb7db",background:descontoTipo==="valor"?"#dbeafe":"white",color:"#102957",fontWeight:700}}>Valor (R$)</button>
            <button type="button" disabled={operacaoEnviada} aria-pressed={descontoTipo==="percentual"} onClick={()=>{setDescontoTipo("percentual");setDescontoPagamento("");setErroPagamento("");}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #9eb7db",background:descontoTipo==="percentual"?"#dbeafe":"white",color:"#102957",fontWeight:700}}>Percentual (%)</button>
          </div>
          <label className="ev-pag-linha"><span>{descontoTipo==="valor"?"DESCONTO EM REAIS":"DESCONTO EM PORCENTAGEM"}</span><div className="ev-pag-entrada"><span>{descontoTipo==="valor"?"R$":"%"}</span><input ref={el=>{pagamentoRefs.current.desconto=el;}} disabled={operacaoEnviada} inputMode="decimal" aria-label="Desconto" placeholder="0,00" value={descontoPagamento} onChange={e=>{if(!operacaoEnviada&&/^[\d.,]*$/.test(e.target.value)){setErroPagamento("");setDescontoPagamento(e.target.value);}}}/></div></label>
          <small>Desconto comercial: {dinheiroCentavos(descontoCentavos)}. O valor cobrado será atualizado antes dos pagamentos.</small>
          {(descontoCentavos>totalCentavos||(descontoTipo==="percentual"&&Number(descontoPagamento.replace(",","."))>100))&&<p role="alert" className="ev-pag-erro">O desconto não pode ultrapassar o total da venda.</p>}
        </div>
        <div className="ev-pag-resumo" style={{background:"#eaf5ee",border:"1px solid #a4d6b2",color:"#12452c"}}><span>TOTAL COM DESCONTO — VALOR A RECEBER</span><strong>{dinheiroCentavos(totalPagarCentavos)}</strong></div>
        <p className="ev-pag-instrucao">2. INFORME OS PAGAMENTOS SOBRE O TOTAL ATUALIZADO — PODE UTILIZAR MAIS DE UMA FORMA</p>
        <div className="ev-pag-campos">
          {([{"campo":"dinheiro","rotulo":"DINHEIRO","tecla":"F1"},{"campo":"pix","rotulo":"PIX","tecla":"F2"}] as const).map(f=><label key={f.campo} className="ev-pag-linha"><span>{f.rotulo} <small>({f.tecla})</small></span><div className="ev-pag-entrada"><span>R$</span><input ref={el=>{pagamentoRefs.current[f.campo]=el;}} inputMode="decimal" aria-label={f.rotulo} placeholder="0,00" value={pagamentos[f.campo]} onChange={e=>alterarPagamento(f.campo,e.target.value)}/></div></label>)}
          {([{"modalidade":"debito","rotulo":"CARTÃO DE DÉBITO","tecla":"F3"},{"modalidade":"credito","rotulo":"CARTÃO DE CRÉDITO","tecla":"F4"}] as const).map(f=><div key={f.modalidade} style={{display:"grid",gap:5}}>
            <label className="ev-pag-linha"><span>{f.rotulo} <small>({f.tecla})</small></span><div className="ev-pag-entrada"><span>R$</span><input ref={el=>{pagamentoRefs.current["cartao_"+f.modalidade]=el;}} inputMode="decimal" aria-label={f.rotulo} placeholder="0,00" disabled={operacaoEnviada} value={pagamentos[f.modalidade]} onFocus={()=>selecionarModalidadeCartao(f.modalidade)} onChange={e=>alterarPagamento(f.modalidade,e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();if(centavos(e.currentTarget.value)>0&&!operacaoEnviada)abrirConfiguracaoCartao(f.modalidade);}}} onBlur={()=>{if(centavos(pagamentos[f.modalidade])>0&&!cartoesConfigurados[f.modalidade]&&!configurandoCartao&&!operacaoEnviada)abrirConfiguracaoCartao(f.modalidade);}}/></div></label>
            {centavos(pagamentos[f.modalidade])>0&&<div className="ev-cartao-resumo">
              <span>{f.modalidade==="debito"?`Débito · ${{visa:"Visa",mastercard:"Mastercard",elo:"Elo"}[bandeiraDebito]||bandeiraDebito}`:`Crédito · ${{visa:"Visa",mastercard:"Mastercard",elo:"Elo",amex:"Amex",diners:"Diners"}[bandeiraCredito]||bandeiraCredito} · ${cartaoParcelas}x`}</span>
            </div>}
          </div>)}
        </div>
        <div className="ev-pag-totais"><div><span>TOTAL A PAGAR</span><strong>{dinheiroCentavos(totalPagarCentavos)}</strong></div><div><span>TOTAL RECEBIDO</span><strong>{dinheiroCentavos(pagoCentavos)}</strong></div>{restanteCentavos>0&&<div className="ev-pag-restante"><span>RESTANTE</span><strong>{dinheiroCentavos(restanteCentavos)}</strong></div>}<div className="ev-pag-troco"><span>TROCO</span><strong>{dinheiroCentavos(trocoCentavos)}</strong></div></div>
        {!valoresValidos&&<p className="ev-pag-erro" role="alert">Use valores com até duas casas decimais.</p>}
        {pagamentosNaoDinheiro>totalPagarCentavos&&<p className="ev-pag-erro" role="alert">PIX e cartão não podem ultrapassar o total a pagar.</p>}
        {erroPagamento&&<p className="ev-pag-erro" role="alert">{erroPagamento}</p>}
        {operacaoEnviada&&<p className="ev-pag-nota" role="status">Operação enviada. Os valores ficam bloqueados para permitir uma tentativa segura com a mesma chave.</p>}
        <footer><button type="button" disabled={finalizandoVenda||operacaoEnviada} onClick={fecharPagamento}>Voltar à venda (Esc)</button><button type="button" disabled={finalizandoVenda||!pagamentoValido} onClick={()=>void confirmarPagamento()}>{finalizandoVenda?"Registrando venda...":operacaoEnviada?"Consultar / tentar novamente (F12)":"Confirmar pagamento (F12)"}</button></footer>
      </>:<><p>As trocas e devoluções precisam identificar a venda original e seus itens, para registrar corretamente o estorno e a movimentação de estoque.</p><p className="ev-operacao-aviso">A operação será disponibilizada após a criação do histórico de vendas e do procedimento de estorno no Supabase. Nenhum estoque será alterado.</p><footer><button type="button" onClick={()=>setModalOperacao(null)}>Voltar à venda (Esc)</button></footer></>}
    </section></div>}
    {configurandoCartao&&modalOperacao==="pagamento"&&!vendaConfirmada&&<div className="ev-cartao-overlay" onMouseDown={e=>e.stopPropagation()}>
      <section className="ev-cartao-dialog" role="dialog" aria-modal="true" aria-label={`Configurar cartão de ${configurandoCartao}`}>
        <header><h2>Configurar Cartão de {configurandoCartao==="debito"?"Débito":"Crédito"}</h2><button type="button" onClick={()=>setConfigurandoCartao(null)} aria-label="Fechar configuração">×</button></header>
        <div className="ev-cartao-conteudo">
          <p>Valor no cartão: <strong>{dinheiroCentavos(centavos(pagamentos[configurandoCartao]))}</strong></p>
          <label>Bandeira
            {configurandoCartao==="debito"?<select autoFocus value={bandeiraDebito} onChange={e=>setBandeiraDebito(e.target.value)}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="elo">Elo</option></select>
            :<select autoFocus value={bandeiraCredito} onChange={e=>setBandeiraCredito(e.target.value)}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="elo">Elo</option><option value="amex">American Express</option><option value="diners">Diners</option></select>}
          </label>
          {configurandoCartao==="credito"&&<label>Parcelas<select value={cartaoParcelas} onChange={e=>setCartaoParcelas(Number(e.target.value) as 1|2|3)}><option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option></select></label>}
          <footer><button type="button" onClick={()=>setConfigurandoCartao(null)}>Cancelar (Esc)</button><button type="button" onClick={concluirConfiguracaoCartao}>Confirmar configuração</button></footer>
        </div>
      </section>
    </div>}
    {modalCliente&&<div className="ev-venda-overlay"><section className="ev-busca-rapida" role="dialog" aria-modal="true" aria-label="Busca rápida de produtos e clientes" onKeyDown={e=>{if(e.key==="Enter"&&abaBuscaRapida==="produtos"&&!(e.target as HTMLElement).closest("button")){e.preventDefault();confirmarProdutoBuscaRapida();}}}>
      <header className="ev-rapida-titulo"><strong>Busca Rápida</strong><button type="button" onClick={()=>setModalCliente(false)} aria-label="Fechar busca">×</button></header>
      <nav className="ev-rapida-abas"><button type="button" className={abaBuscaRapida==="produtos"?"ativo":""} onClick={()=>{setAbaBuscaRapida("produtos");setIndiceRapido(0)}}>▥ Produtos (F10)</button><button type="button" className={abaBuscaRapida==="clientes"?"ativo":""} onClick={()=>{setAbaBuscaRapida("clientes");setIndiceRapido(0)}}>♙ Clientes (F11)</button><label>Ordenação <select value={ordemRapida} onChange={e=>setOrdemRapida(e.target.value)}><option value="nome">por NOME</option><option value="codigo">por CÓDIGO</option></select></label></nav>
      <div className="ev-rapida-filtros"><label>Digite a descrição ou nome para localizar<input autoFocus value={buscaRapida} onChange={e=>{setBuscaRapida(e.target.value);setIndiceRapido(0)}} placeholder={abaBuscaRapida==="produtos"?"Descrição do produto":"Nome, CPF/CNPJ, telefone ou e-mail"} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();setIndiceRapido(i=>i+1)}if(e.key==="ArrowUp"){e.preventDefault();setIndiceRapido(i=>Math.max(0,i-1))}if(e.key==="Enter"&&abaBuscaRapida==="produtos"){e.preventDefault();confirmarProdutoBuscaRapida();}}}/></label><label>Código<input value={codigoRapido} onChange={e=>{setCodigoRapido(e.target.value);setIndiceRapido(0)}} placeholder="Código"/></label></div>
      <div className="ev-rapida-resultados">{abaBuscaRapida==="produtos" ? <>
        <div className="ev-rapida-colunas" aria-hidden="true"><span>EAN</span><span>DESCRIÇÃO DO PRODUTO</span><span>ESTOQUE</span><span>CUSTO UNIT.</span><span>PREÇO DE VENDA</span></div>
        {produtosRapidos.map((p,i)=><button type="button" key={p.id} className={"ev-rapida-produto-linha "+(i===indiceRapido?"ativo":"")} aria-selected={i===indiceRapido} onClick={()=>setIndiceRapido(i)} onDoubleClick={()=>{setIndiceRapido(i);prepararProduto(p);setModalCliente(false);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();prepararProduto(p);setModalCliente(false);}if(e.key==="ArrowDown"){e.preventDefault();e.stopPropagation();setIndiceRapido(Math.min(i+1,produtosRapidos.length-1));}if(e.key==="ArrowUp"){e.preventDefault();e.stopPropagation();setIndiceRapido(Math.max(0,i-1));}}}><span title={p.codigo_barras||""}>{p.codigo_barras||"—"}</span><span title={p.descricao}>{p.descricao}<small>Cód. {p.codigo}</small></span><span>{Number(p.estoque_atual).toLocaleString("pt-BR")}</span><span>{p.preco_custo==null?"—":dinheiro(Number(p.preco_custo))}</span><strong>{dinheiro(Number(p.preco_venda))}</strong></button>)}
        {!produtosRapidos.length&&<p>Nenhum produto encontrado.</p>}
      </> : <>{erroCliente&&<p role="alert">{erroCliente}</p>}{carregandoClientes?<p>Carregando clientes...</p>:clientesRapidos.map((c,i)=><button type="button" key={String(c.id||i)} className={i===indiceRapido?"ativo":""} onMouseEnter={()=>setIndiceRapido(i)} onFocus={()=>setIndiceRapido(i)} onClick={()=>{setClienteSelecionado(c);setClienteBusca(nomeCliente(c));setModalCliente(false)}}><span>{nomeCliente(c)}<small>{identificacaoCliente(c)} • {String(c.telefone||c.celular||"")}</small></span><strong>{String(c.codigo||"")}</strong></button>)}{!carregandoClientes&&!clientes.length&&!erroCliente&&<p>Nenhum cliente encontrado.</p>}</>}</div>
      <footer className="ev-rapida-rodape"><strong>{abaBuscaRapida==="produtos"?"Produtos":"Clientes"} cadastrados: {abaBuscaRapida==="produtos"?produtos.length:clientes.length}</strong><div className="ev-rapida-acoes"><button type="button" className="ev-rapida-cadastrar" onClick={()=>setCadastroRapido(abaBuscaRapida==="produtos"?"produto":"cliente")}>＋ Cadastrar {abaBuscaRapida==="produtos"?"produto":"cliente"} (F5)</button><button type="button" disabled={abaBuscaRapida==="produtos"?!produtosRapidos[indiceRapido]:!clientesRapidos[indiceRapido]} onClick={editarCadastroRapido}>✎ Editar (F4)</button><button type="button" onClick={()=>setModalCliente(false)}>Fechar (Esc)</button></div></footer>
    </section></div>}
    {cadastroRapido==="produto"&&<ProdutoCadastroRapido produtoId={editarRapidoId} empresaId={empresaId} onClose={()=>setCadastroRapido(null)} onSaved={()=>{setCadastroRapido(null);void atualizarBuscaRapida();}}/>}
    {cadastroRapido==="cliente"&&<ClientesModal empresaId={empresaId} iniciarNovo={!editarRapidoId} editarId={editarRapidoId} onClose={()=>{setCadastroRapido(null);void atualizarBuscaRapida();}} onSaved={()=>{setCadastroRapido(null);void atualizarBuscaRapida();}}/>}
    {modalPesquisa&&<div className="ev-venda-overlay"><section className="ev-venda-dialog"><header><strong>Pesquisar produtos</strong><button onClick={()=>setModalPesquisa(false)}>×</button></header><input autoFocus value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Descrição, código ou EAN"/>{erro&&<p role="alert">{erro}</p>}<div className="ev-venda-resultados">{encontrados.map(p=><button key={p.id} onClick={()=>prepararProduto(p)}><span>{p.codigo} — {p.descricao}</span><strong>{dinheiro(Number(p.preco_venda))}</strong></button>)}{!encontrados.length&&<p>Nenhum produto encontrado.</p>}</div><button onClick={()=>setModalPesquisa(false)}>Fechar</button></section></div>}
    <style jsx>{`
    .ev-hist-fundo{position:fixed;inset:0;z-index:3500;background:#0b1e3a99;display:flex;align-items:center;justify-content:center;padding:20px}.ev-hist-modal{width:min(930px,100%);max-height:90dvh;background:#fff;border-radius:17px;box-shadow:0 25px 80px #0005;display:flex;flex-direction:column;overflow:hidden}.ev-hist-topo{display:flex;justify-content:space-between;align-items:center;background:#102b55;color:#fff;padding:18px 24px}.ev-hist-topo small{font-size:10px;letter-spacing:1.5px;color:#bdd2ef}.ev-hist-topo h2{margin:4px 0 0;font-size:23px}.ev-hist-topo button{background:#ffffff1c;color:#fff;border:1px solid #ffffff44;border-radius:8px;padding:10px;cursor:pointer}.ev-hist-corpo{padding:22px;overflow:auto}.ev-hist-filtros{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.ev-hist-abas{display:flex;gap:5px}.ev-hist-filtros button,.ev-hist-tabela button{border:1px solid #c9d9ee;border-radius:8px;background:#f0f5fd;padding:10px 12px;color:#163c70;cursor:pointer}.ev-hist-abas .ativo{background:#163e75;color:#fff}.ev-hist-filtros input{border:1px solid #c9d9ee;border-radius:8px;padding:11px;flex:1;min-width:160px}.ev-hist-resumo{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.ev-hist-resumo>div{border:1px solid #dae5f1;border-radius:11px;padding:14px;background:#f8fafd}.ev-hist-resumo small{display:block;color:#627b99;font-size:11px}.ev-hist-resumo strong{display:block;font-size:19px;margin-top:5px}.ev-hist-tabela{overflow:auto}.ev-hist-tabela table{width:100%;border-collapse:collapse}.ev-hist-tabela th{text-align:left;background:#eff4fa;color:#365678;padding:12px}.ev-hist-tabela td{border-bottom:1px solid #e3eaf3;padding:12px}.ev-hist-tabela td:nth-child(3){font-weight:700}.ev-hist-corpo h3{margin:16px 0 8px}.ev-hist-lista{border:1px solid #dce5f1;border-radius:10px;overflow:hidden}.ev-hist-item,.ev-hist-pag{padding:12px;border-bottom:1px solid #e3eaf3;display:flex;justify-content:space-between;gap:12px}.ev-hist-item{flex-direction:column;gap:4px}.ev-hist-item span{text-align:right}.ev-hist-erro{background:#fff0ee;color:#a32626;padding:12px;border-radius:8px}.ev-hist-aviso{font-size:12px;color:#697c96;margin-top:16px}@media(max-width:600px){.ev-hist-fundo{padding:6px}.ev-hist-modal{max-height:97dvh}.ev-hist-corpo{padding:12px}.ev-hist-resumo{gap:5px}.ev-hist-resumo>div{padding:8px}.ev-hist-resumo strong{font-size:14px}}
    .ev-troca-form{display:flex;flex-direction:column;gap:12px;border-top:1px solid #d7e3f1;padding-top:14px}.ev-troca-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:#294363}.ev-troca-form input,.ev-troca-form select,.ev-troca-form textarea{min-width:0;width:100%;padding:9px;border:1px solid #cbd9e9;border-radius:8px;background:white;color:#193c6b}.ev-troca-item{display:grid;grid-template-columns:minmax(0,2fr) 90px minmax(0,1.5fr);gap:10px;align-items:end;padding:10px;border:1px solid #e0e9f4;border-radius:8px}.ev-troca-item small{display:block;color:#617894;margin-top:4px}.ev-troca-add{display:grid;grid-template-columns:minmax(0,1fr) 85px auto;gap:8px}.ev-troca-add button,.ev-troca-novo button{padding:9px;border:1px solid #a7c4e6;border-radius:8px;background:#e9f2ff;color:#193c6b}.ev-troca-busca{position:relative;min-width:0}.ev-troca-sugestoes{position:absolute;top:100%;left:0;right:0;z-index:50;max-height:230px;overflow-y:auto;background:#fff;border:1px solid #a7c4e6;border-radius:8px;box-shadow:0 8px 20px #193c6b26}.ev-troca-sugestoes button{display:flex;flex-direction:column;align-items:flex-start;width:100%;padding:9px 12px;border:0;border-bottom:1px solid #e6edf7;background:white;text-align:left;cursor:pointer;color:#193c6b}.ev-troca-sugestoes button:hover{background:#e9f2ff}.ev-troca-sugestoes button:disabled{cursor:not-allowed}.ev-troca-sugestoes small,.ev-troca-selecionado{color:#52749a;font-size:11px}.ev-troca-sem-resultado{padding:12px;color:#617894}.ev-troca-novo{display:flex;justify-content:space-between;gap:10px;align-items:center}.ev-canc-opcoes button{text-align:left;cursor:pointer}.ev-canc-opcoes button:disabled{cursor:not-allowed}@media(max-width:600px){.ev-troca-item,.ev-troca-add{grid-template-columns:1fr}}
    .ev-canc-filtros{display:flex;flex-direction:column;gap:12px}.ev-canc-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ev-canc-grade label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700;color:#294363}.ev-canc-grade input,.ev-canc-grade select{width:100%;min-width:0;padding:11px;border:1px solid #cbd9e9;border-radius:8px;background:#fff;color:#193c6b;font:14px Arial,sans-serif}.ev-canc-buscar-acoes{display:flex;justify-content:flex-end}.ev-canc-buscar-acoes button{background:#163e75;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-weight:700}.ev-canc-listagem h3{margin:6px 0 12px}.ev-canc-tabela{overflow-x:auto}.ev-canc-tabela table{border-collapse:collapse;width:100%;font-size:12px}.ev-canc-tabela th{background:#eff4fa;text-align:left;padding:10px;white-space:nowrap}.ev-canc-tabela td{border-bottom:1px solid #e3eaf3;padding:10px;white-space:nowrap}.ev-canc-tabela button,.ev-canc-voltar{background:#edf4ff;color:#163e75;border:1px solid #c9d9ee;border-radius:7px;padding:8px 11px}.ev-canc-buscar-acoes button:disabled,.ev-canc-tabela button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:600px){.ev-canc-grade{grid-template-columns:1fr}}
        .ev-canc-corpo{display:flex;flex-direction:column;gap:14px}.ev-canc-opcoes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ev-canc-opcao{padding:14px;border:1px solid #cadbf0;border-radius:11px;background:#f1f6fd}.ev-canc-opcao strong,.ev-canc-opcao small{display:block}.ev-canc-opcao strong{font-size:13px;color:#193c6b}.ev-canc-opcao small{margin-top:5px;color:#6b7e97;font-size:11px}.ev-canc-opcao.ativa{border-color:#9abce8;background:#e9f2ff}.ev-canc-opcao.indisponivel{opacity:.55}.ev-canc-busca label,.ev-canc-motivo{font-weight:700;color:#294363;font-size:13px}.ev-canc-busca>div{display:flex;gap:10px;margin-top:7px}.ev-canc-busca input{flex:1;min-width:0;border:1px solid #cbd9e9;border-radius:8px;padding:12px;font-size:14px}.ev-canc-busca button{background:#163e75;color:#fff;border:0;border-radius:8px;padding:12px 17px;font-weight:700}.ev-canc-resultado{display:flex;flex-direction:column;gap:9px}.ev-canc-resultado .ev-hist-resumo{margin:0}.ev-canc-resultado h3{margin:9px 0 0}.ev-canc-data{margin:0;color:#60758f;font-size:12px}.ev-canc-motivo{display:flex;flex-direction:column;gap:7px;margin-top:12px}.ev-canc-motivo textarea{resize:vertical;border:1px solid #cbd9e9;border-radius:8px;padding:12px;font:14px Arial,sans-serif}.ev-canc-rodape{display:flex;justify-content:flex-end}.ev-canc-confirmar{background:#a32626;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:700}.ev-canc-confirmar:disabled,.ev-canc-busca button:disabled{opacity:.5;cursor:not-allowed}.ev-canc-sucesso{background:#e9f7f0;color:#12623e;border-radius:8px;padding:13px}.ev-canc-corpo button:not(:disabled){cursor:pointer}@media(max-width:600px){.ev-canc-opcoes{grid-template-columns:1fr}.ev-canc-busca>div{flex-direction:column}}
.ev-f7-fundo{padding:0;background:#102b55}.ev-f7-modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}.ev-f7-aviso{background:#eaf2fc;border-radius:8px;padding:12px;color:#1b4677;font-size:13px}.ev-f7-modal button:not(:disabled){cursor:pointer}.ev-f7-modal button:disabled{cursor:not-allowed}

      .ev-venda-tela{height:100dvh;min-height:560px;display:flex;flex-direction:column;background:#fff;color:#243448;font:12px Arial,sans-serif;overflow:hidden}.ev-venda-tela *{box-sizing:border-box}.ev-venda-top{display:grid;grid-template-columns:300px 1fr;min-height:115px;gap:3px}.ev-venda-busca{padding:4px;border:1px solid #aaa}.ev-venda-busca-tabs,.ev-venda-abas{display:flex;gap:3px}.ev-venda-busca-tabs button,.ev-venda-abas button{border:1px solid #aaa;background:#f4f4f4;padding:5px;font-size:10px;cursor:pointer}.ev-venda-busca-tabs .ativo,.ev-venda-abas .ativo{background:#fff;border-bottom-color:#fff}.ev-venda-busca>strong{display:block;font-size:10px;margin:5px 0}.ev-venda-input{display:flex;gap:3px;height:50px}.ev-venda-input input{flex:1;min-width:0;background:#e0f48c;border:1px solid #9caa6a;font-size:21px;padding:5px}.ev-venda-input button{width:39px;border:1px solid #999;background:#dff58c;cursor:pointer}.ev-venda-input small{display:block}.ev-venda-info fieldset{height:100%;margin:0;border:1px solid #aaa;position:relative}.ev-venda-info legend{font-size:11px}.ev-venda-info fieldset>div:first-of-type small,.ev-venda-info fieldset>div:first-of-type strong{display:block;font-size:11px}.ev-venda-dados{display:flex;gap:20px;margin-top:8px}.ev-venda-dados span{display:flex;flex-direction:column;font-size:10px}.ev-venda-dados strong{font-size:11px}.ev-venda-operador{position:absolute;right:6px;bottom:4px;font-size:10px}.ev-venda-estoque{height:66px;flex-shrink:0;border:1px solid #aaa;padding:5px;display:flex;flex-direction:column;gap:9px}.ev-venda-estoque small{font-size:10px}.ev-venda-main{display:grid;grid-template-columns:208px minmax(0,1fr);flex:1;min-height:0}.ev-venda-marca{display:flex;align-items:end;border-right:2px solid #ccc;padding:5px}.ev-venda-logo{font-size:28px;font-weight:900;color:#124e90}.ev-venda-logo span{color:#18a8e5}.ev-venda-lancamentos{display:flex;flex-direction:column;min-height:0}.ev-venda-abas{height:24px;align-items:start}.ev-venda-itens{flex:1;overflow:auto}.ev-venda-itens table{width:100%;border-collapse:collapse}.ev-venda-itens thead{background:#b3df00}.ev-venda-itens th{text-align:left;padding:12px 7px;font-size:11px}.ev-venda-itens td{padding:9px 7px;border-bottom:1px solid #e5e5e5}.ev-venda-itens tr.selecionado{background:#e8f7bc}.ev-venda-itens td input{width:60px;padding:5px}.ev-venda-obs{padding:20px;white-space:pre-wrap}.ev-venda-totais{display:flex;justify-content:space-between;border-top:2px solid #aaa;background:#f2f2f2;min-height:43px;padding:3px 10px}.ev-venda-totais>div{display:flex;flex-direction:column}.ev-venda-totais strong{font-size:10px}.ev-venda-totais b{font-size:23px;color:#086c12;text-align:right}.ev-venda-tipo{min-height:22px;display:flex;gap:8px;align-items:center;border-top:1px solid #bbb;font-size:10px;font-weight:bold}.ev-venda-tipo input{vertical-align:middle}.ev-venda-footer{display:flex;align-items:stretch;min-height:59px;background:#f1f1f1;border-top:1px solid #aaa}.ev-venda-acoes{display:flex}.ev-venda-footer button{border:0;border-right:1px solid #bbb;background:transparent;font-size:17px;cursor:pointer;padding:5px 9px}.ev-venda-footer button small{display:block;font-size:9px;max-width:100px}.ev-venda-footer button:disabled{opacity:.4;cursor:not-allowed}.ev-venda-concluir{margin-left:auto;color:#087020;font-weight:bold;font-size:12px!important}.ev-venda-cancelar{margin-left:auto;color:#a82222}.ev-venda-overlay{position:fixed;inset:0;z-index:3000;background:#0005;display:grid;place-items:center}.ev-venda-dialog{background:white;width:min(550px,95vw);max-height:85vh;padding:18px;border-radius:8px;display:flex;flex-direction:column;gap:12px}.ev-venda-dialog header{display:flex;justify-content:space-between}.ev-venda-dialog header button{font-size:20px;border:0;background:none;cursor:pointer}.ev-venda-dialog>input,.ev-venda-dialog textarea{padding:12px;border:1px solid #bbb}.ev-venda-dialog>button{padding:10px;cursor:pointer}.ev-venda-resultados{overflow:auto;max-height:350px;display:flex;flex-direction:column}.ev-venda-resultados button{display:flex;justify-content:space-between;text-align:left;padding:12px;background:white;border:0;border-bottom:1px solid #ddd;cursor:pointer;gap:15px}@media(max-width:900px){.ev-venda-main{grid-template-columns:100px 1fr}.ev-venda-logo{font-size:16px}.ev-venda-footer{overflow-x:auto}.ev-venda-top{grid-template-columns:270px 1fr}}@media(max-width:650px){.ev-venda-main{grid-template-columns:1fr}.ev-venda-marca{display:none}.ev-venda-top{grid-template-columns:1fr}.ev-venda-info{min-height:115px}.ev-venda-estoque{height:45px}.ev-venda-tela{overflow:auto}.ev-venda-main{min-height:300px}}

      /* Etapa 24.3.2.8 — pergunta sobre impressão após confirmação. */
      .ev-pag-impressao-pergunta{display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;padding:18px 10px;background:#eef5ff;border:1px solid #b8cbe6;border-radius:9px;color:#0b2454}
      .ev-pag-impressao-pergunta strong{font-size:16px}
      .ev-pag-impressao-pergunta span{font-size:17px;font-weight:800}
      .ev-pag-impressao-pergunta small{font-size:11px;color:#526580}
            /* Etapa 24.3.1.3 — identificação do terminal e turno na linha do título. */
      .ev-venda-info fieldset{position:relative}
      .ev-venda-identificacao{position:absolute;top:-12px;right:9px;display:flex;align-items:center;gap:12px;background:#fff;padding:1px 6px;font:800 12px Arial,Helvetica,sans-serif;color:#111;white-space:nowrap}
      .ev-venda-identificacao strong{background:#eaf2ff;color:#0b2454;border:1px solid #b8cbe4;border-radius:4px;padding:3px 8px;font-size:12px}
      @media(max-width:680px){.ev-venda-identificacao{position:static;justify-content:flex-end;flex-wrap:wrap;white-space:normal;padding:0 2px 3px}.ev-venda-info fieldset{min-height:120px}}
      /* Etapa 24.3.1 — ações do rodapé e janelas de operação. */
      .ev-operacoes-rodape{gap:8px;padding:8px 12px;min-height:76px;align-items:stretch;background:#eef4fc}
      .ev-operacoes-rodape .ev-venda-acoes{gap:8px}
      .ev-operacoes-rodape button{border:1px solid #b8cbe6!important;border-radius:9px;background:#fff;padding:7px 14px;min-width:135px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;transition:background .15s}
      .ev-operacoes-rodape button span{font-size:22px;line-height:1.1}
      .ev-operacoes-rodape button small{font-size:11px;max-width:none;text-align:center;line-height:1.2}
      .ev-operacoes-rodape .ev-acao-apagar{background:#fff1f1;color:#9f1d2d;border-color:#f1b8bf!important}
      .ev-operacoes-rodape .ev-acao-troca{background:#eaf2ff;border-color:#9cbde9!important}
      .ev-operacoes-rodape .ev-venda-concluir{background:#0b2454;color:white!important;border-color:#0b2454!important;margin-left:auto}
      .ev-operacoes-rodape .ev-venda-concluir small{color:white!important}
      .ev-operacoes-rodape .ev-venda-cancelar{background:#fff;border-color:#e9b4b4!important;color:#a82222;margin-left:0}
      .ev-operacoes-rodape button:disabled{opacity:.45;cursor:not-allowed}
      .ev-operacao-dialog{width:min(540px,94vw);background:#fff;border-radius:12px;padding:22px;color:#111827;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px #0004;font:700 14px Arial,sans-serif}
      .ev-operacao-dialog header{display:flex;justify-content:space-between;align-items:center}.ev-operacao-dialog h2{margin:0;color:#0b2454;font-size:21px}.ev-operacao-dialog header button{background:none;border:0;font-size:28px;cursor:pointer}
      .ev-operacao-dialog p{margin:0;line-height:1.5}.ev-operacao-dialog label{display:flex;flex-direction:column;gap:8px}.ev-operacao-dialog select{padding:12px;border:1px solid #a9bddb;border-radius:7px;background:white;color:#111827}
      .ev-operacao-total{display:flex;justify-content:space-between;padding:14px;background:#eaf2ff;border-radius:8px}.ev-operacao-total strong{font-size:22px;color:#0b2454}
      .ev-operacao-aviso{background:#fff8e6;border:1px solid #ead7a3;padding:12px;border-radius:8px}.ev-operacao-dialog footer{display:flex;justify-content:flex-end}.ev-operacao-dialog footer button{padding:11px 15px;background:#0b2454;color:#fff;border:0;border-radius:7px;cursor:pointer}
      @media(max-width:800px){.ev-operacoes-rodape{overflow-x:auto}.ev-operacoes-rodape button{min-width:120px}}
      /* Etapa 24.2.2 — visual Tag com paleta EVOLUX, sem alterar a lógica */
      .ev-venda-tela{--ev-azul:#1765d5;--ev-escuro:#0b2454;--ev-claro:#eaf2ff;color:var(--ev-escuro)}
      .ev-venda-top{grid-template-columns:300px minmax(0,1fr);min-height:112px}
      .ev-venda-busca,.ev-venda-info fieldset,.ev-venda-estoque{border-color:#a9bddb}
      .ev-venda-busca-tabs button,.ev-venda-abas button{border-color:#b9c9e1;color:var(--ev-escuro);background:#f1f5fb}
      .ev-venda-busca-tabs button.ativo,.ev-venda-abas button.ativo{background:#fff;color:var(--ev-azul);font-weight:700}
      .ev-venda-input input{background:#dbeafe;border-color:#7fa8e9;color:#0b2454;outline-color:var(--ev-azul)}
      .ev-venda-input button{background:#c5dcff;border-color:#7fa8e9;color:var(--ev-escuro)}
      .ev-venda-estoque{height:69px;padding:3px 7px;gap:1px}
      .ev-venda-estoque-corpo{display:flex;justify-content:space-between;align-items:center;min-width:0;gap:10px;flex:1}
      .ev-venda-estoque-nome{display:flex;flex-direction:column;min-width:0}
      .ev-venda-estoque-nome>strong{font-size:20px;line-height:1.1;color:var(--ev-azul);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ev-venda-estoque-nome small{font-size:9px;color:#435978}
      .ev-venda-estoque-nome b{font-size:11px;color:#365c9b;min-width:80px;border:1px solid #afc5e4;text-align:center}
      .ev-venda-equacao{display:flex;align-items:center;gap:22px;white-space:nowrap;font-size:20px;color:var(--ev-azul)}
      .ev-venda-equacao small{font-size:12px}.ev-venda-equacao>strong{color:var(--ev-escuro)}
      .ev-venda-equacao>b{font-size:21px;color:var(--ev-azul)}
      .ev-venda-main{grid-template-columns:208px minmax(0,1fr)}
      .ev-venda-marca{border-right-color:#cbd5e1}.ev-venda-itens{padding:0 12px 0 3px}
      /* F7: o produto devolvido usa a mesma estrutura visual dos lançamentos, mas amarelo. */
      .ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido{background:#ffe48a!important;border-left:4px solid #d69b00!important;border-bottom:1px solid #dbb651!important;color:#1d2533!important;cursor:default!important}
      .ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-linha-topo,.ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-linha-baixo,.ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-calculo,.ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-calculo strong{color:#1d2533!important}
      .ev-venda-itens .ev-venda-linha.ev-troca-pdv-devolvido .ev-venda-numero{color:#805200!important}
      .ev-venda-linha{height:63px;background:#dceaff;border-bottom:1px solid #a7c5f0;color:var(--ev-escuro);padding:5px 8px;cursor:pointer;margin-bottom:2px}
      .ev-venda-linha.selecionado{background:#b9d4ff;box-shadow:inset 3px 0 0 var(--ev-azul)}
      .ev-venda-linha-topo{display:flex;justify-content:space-between;gap:12px;font-size:12px}
      .ev-venda-linha-topo>span{font-weight:700;font-size:11px}
      .ev-venda-linha-baixo{display:flex;align-items:center;justify-content:space-between;margin-top:7px}
      .ev-venda-numero{font-size:10px;color:#456a9f}
      .ev-venda-calculo{display:flex;align-items:center;gap:12px;font-size:13px;color:#245db3}
      .ev-venda-calculo small{font-size:10px}.ev-venda-calculo b{font-size:19px;color:#0b2454}
      .ev-venda-calculo input{width:57px;padding:1px 3px;border:1px solid #9cbbe5;background:#fff;font-size:12px;color:#0b2454}
      .ev-venda-calculo strong{min-width:110px;text-align:right;color:#0b2454;font-size:13px}
      .ev-venda-totais{background:#edf3fc;border-color:#b8cbe4}.ev-venda-totais b{color:var(--ev-azul)}
      .ev-venda-tipo{border-color:#b8cbe4}.ev-venda-footer{background:#f1f5fb;border-color:#b8cbe4}
      .ev-venda-footer button{border-color:#c6d6ed}.ev-venda-concluir{color:var(--ev-azul)}
      @media(max-width:900px){.ev-venda-equacao{gap:8px;font-size:15px}.ev-venda-equacao>b{font-size:16px}}
      @media(max-width:650px){.ev-venda-estoque{height:auto;min-height:70px}.ev-venda-estoque-corpo{flex-wrap:wrap}.ev-venda-equacao{margin-left:auto}.ev-venda-main{grid-template-columns:1fr}.ev-venda-linha{height:auto;min-height:63px}}

      /* Etapa 24.2.3 — acessibilidade visual: preto, negrito e fontes maiores.
         Mantém os fundos azuis, o layout e toda a lógica do PDV. */
      .ev-pdv-pendente-nome{height:25px;background:#dbeafe;border:1px solid #7fa8e9;padding:4px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#111;font-weight:800}
      .ev-pdv-quantidade{display:flex;flex-direction:column;gap:1px}.ev-pdv-quantidade label{font-size:11px;font-weight:900;color:#111}.ev-pdv-quantidade>div{display:flex;gap:5px;height:29px}.ev-pdv-quantidade input{width:90px;min-width:0;background:#dbeafe;border:1px solid #7fa8e9;padding:3px 5px;font-size:17px;color:#111;font-weight:800}.ev-pdv-quantidade button{flex:1;background:#eaf2ff;border:1px solid #a9bddb;font-size:10px!important;color:#111;font-weight:800;cursor:pointer}
      .ev-venda-top{min-height:135px}.ev-venda-busca{min-height:135px}
      .ev-venda-tela{color:#111!important;font-size:14px;font-weight:700}
      .ev-venda-tela button,.ev-venda-tela input,.ev-venda-tela textarea{font-family:Arial,Helvetica,sans-serif;color:#111;font-weight:700}
      .ev-venda-busca>strong{font-size:12px;color:#111}
      .ev-venda-busca-tabs button,.ev-venda-abas button{font-size:12px;font-weight:800;color:#111}
      .ev-venda-busca-tabs button.ativo,.ev-venda-abas button.ativo{color:#111}
      .ev-venda-input input{font-size:24px;color:#111}
      .ev-venda-input button{font-size:15px;color:#111}
      .ev-venda-input small{font-size:12px;color:#111}
      .ev-venda-info legend{font-size:13px;font-weight:800;color:#111}
      .ev-venda-info fieldset>div:first-of-type small,.ev-venda-info fieldset>div:first-of-type strong{font-size:13px;color:#111}
      .ev-venda-dados span,.ev-venda-dados strong,.ev-venda-operador{font-size:12px;color:#111;font-weight:800}
      .ev-venda-estoque>small{font-size:12px;color:#111;font-weight:800}
      .ev-venda-estoque-nome>strong{font-size:23px;color:#111;font-weight:900}
      .ev-venda-estoque-nome small{font-size:11px;color:#111;font-weight:800}
      .ev-venda-estoque-nome b{font-size:13px;color:#111}
      .ev-venda-equacao,.ev-venda-equacao>strong,.ev-venda-equacao>b{color:#111;font-size:22px;font-weight:900}
      .ev-venda-equacao small{font-size:13px;color:#111;font-weight:800}
      .ev-venda-linha,.ev-venda-linha-topo,.ev-venda-linha-topo>span{color:#111;font-size:14px;font-weight:800}
      .ev-venda-linha-topo>span{font-size:12px}
      .ev-venda-numero{color:#111;font-size:12px;font-weight:800}
      .ev-venda-calculo,.ev-venda-calculo strong{color:#111;font-size:15px;font-weight:800}
      .ev-venda-calculo small{color:#111;font-size:12px;font-weight:800}
      .ev-venda-calculo b{color:#111;font-size:21px;font-weight:900}
      .ev-venda-calculo input{color:#111;font-size:15px;font-weight:800}
      .ev-venda-totais strong{font-size:12px;color:#111;font-weight:900}
      .ev-venda-totais span{font-size:13px;color:#111;font-weight:800}
      .ev-venda-totais b{color:#111;font-size:27px;font-weight:900}
      .ev-venda-tipo{font-size:12px;color:#111;font-weight:800}
      .ev-venda-footer button{color:#111;font-weight:800}
      .ev-venda-footer button small{font-size:11px;color:#111;font-weight:800}
      .ev-venda-concluir{color:#111;font-size:13px!important;font-weight:900}
      .ev-venda-cancelar{color:#111}
      .ev-venda-dialog,.ev-venda-dialog button,.ev-venda-resultados button{color:#111;font-size:14px;font-weight:700}
       /* Quantidade somente leitura na listagem. */
       .ev-venda-qtd-fixa{display:inline-block;min-width:42px;text-align:center;color:#111;font-size:17px;font-weight:900}

       .ev-venda-aba-fixa{display:inline-flex;align-items:center;height:24px;padding:4px 9px;border:1px solid #b9c9e1;background:#fff;color:#111;font-size:12px;font-weight:800}
 
      .ev-troca-pagamento{overflow:hidden}
      .ev-troca-pagamento>header{background:#142f58;color:#fff;padding:19px 22px;margin:-18px -18px 18px;border-radius:12px 12px 0 0}
      .ev-troca-pagamento>header h2{color:#fff;font-size:20px;font-weight:800;letter-spacing:.2px}
      .ev-troca-pagamento>header button{color:#fff;background:#2b466e;border:1px solid #6880a3;border-radius:8px;cursor:pointer}
      .ev-troca-pagamento>header button:hover{background:#3b5982}
      /* Etapa 24.2.8: F2 alterna busca no mesmo campo, sem janela. */
       .ev-venda-busca{position:relative;z-index:2}
       .ev-pdv-sugestoes{position:absolute;top:100%;left:4px;right:4px;z-index:20;background:#fff;border:1px solid #7fa8e9;box-shadow:0 8px 18px #0b245433;max-height:270px;overflow-y:auto}
       .ev-pdv-sugestoes button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px 8px;border:0;border-bottom:1px solid #d4e2f7;background:#fff;text-align:left;color:#111;font-size:12px;font-weight:800;cursor:pointer}
       .ev-pdv-sugestoes button.ativo,.ev-pdv-sugestoes button:hover{background:#dbeafe}
       .ev-pdv-sugestoes button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
       .ev-pdv-sugestoes button strong{flex-shrink:0}
       .ev-pdv-sem-resultados,.ev-pdv-erro{display:block;padding:8px;font-size:12px;color:#111;font-weight:800}
       /* Estoque: altura dinâmica para descrições longas sem invadir a lista. */
       .ev-venda-estoque{height:auto!important;min-height:105px!important;flex:0 0 auto;overflow:visible;padding:7px 9px!important;gap:5px!important}
       .ev-venda-estoque-corpo{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;min-height:75px}
       .ev-venda-estoque-nome{flex:1 1 300px;min-width:0;gap:3px}
       .ev-venda-estoque-nome>strong{font-size:21px;line-height:1.22;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;color:#111}
       .ev-venda-estoque-nome small{display:block;line-height:1.2}
       .ev-venda-estoque-nome b{display:block;width:max-content;min-width:95px;padding:3px 8px;line-height:1.3}
       .ev-venda-equacao{flex:0 1 auto;min-width:0;gap:14px;flex-wrap:wrap;justify-content:flex-end;white-space:normal}
       .ev-venda-main{min-height:0;flex:1 1 auto}
       .ev-venda-abas{flex-shrink:0}
       @media(max-width:750px){.ev-venda-estoque{min-height:110px!important}.ev-venda-equacao{font-size:16px;gap:8px}}

      /* Etapa 24.2.11 — campo de descrição legível e Busca Rápida F3 */
      .ev-venda-input{min-width:0}
      .ev-venda-input input{width:0;min-width:0;flex:1;font-size:16px!important;padding:5px 7px!important;text-overflow:clip}
      .ev-venda-input input::placeholder{font-size:15px;color:#475569;opacity:1}
      .ev-venda-input button{flex:0 0 39px}
      .ev-busca-rapida{width:min(900px,96vw);height:min(650px,90vh);background:#fff;border:1px solid #9eb9e2;border-radius:8px;box-shadow:0 20px 60px #0004;display:flex;flex-direction:column;min-height:0;color:#111;font-size:13px;font-weight:700}
      .ev-rapida-titulo{display:flex;justify-content:space-between;align-items:center;background:#0b2454;color:white;padding:12px 16px;font-size:16px}
      .ev-rapida-titulo button{border:0;background:transparent;color:white;font-size:23px;cursor:pointer}
      .ev-rapida-abas{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#eef4ff;border-bottom:1px solid #b4c9e7}
      .ev-rapida-abas button{border:1px solid #b3c9e6;background:#e2edff;padding:9px 13px;cursor:pointer;font-weight:800;color:#111}
      .ev-rapida-abas button.ativo{background:white;border-bottom-color:white}
      .ev-rapida-abas label{margin-left:auto;display:flex;align-items:center;gap:8px}
      .ev-rapida-abas select{padding:5px;border:1px solid #a9bedf;background:white;color:#111}
      .ev-rapida-filtros{display:grid;grid-template-columns:1fr 190px;gap:12px;padding:12px;border-bottom:1px solid #b4c9e7}
      .ev-rapida-filtros label{display:flex;flex-direction:column;gap:5px;min-width:0}
      .ev-rapida-filtros input{width:100%;padding:10px;border:1px solid #a4bde3;background:#f8fbff;color:#111;font-size:14px;font-weight:700}
      .ev-rapida-resultados{flex:1;min-height:0;overflow-y:auto;padding:4px 10px}
      .ev-rapida-resultados>button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:16px;text-align:left;background:white;border:0;border-bottom:1px solid #dce7f7;padding:12px;cursor:pointer;color:#111;font-weight:800}
      .ev-rapida-resultados>button.ativo,.ev-rapida-resultados>button:hover{background:#dbeafe}
      .ev-rapida-resultados>button span{min-width:0;overflow-wrap:anywhere}
      .ev-rapida-resultados>button small{display:block;color:#35455e;font-size:11px;margin-top:4px}
      .ev-rapida-resultados>button strong{flex-shrink:0}
      /* Identidade EVOLUX: tipografia e campos consistentes. */
      .ev-busca-rapida{font-family:Arial,Helvetica,sans-serif;color:#111827}.ev-busca-rapida input,.ev-busca-rapida select{font-family:inherit;color:#111827;font-weight:700;border-color:#aabfdc}.ev-busca-rapida input:focus,.ev-busca-rapida select:focus{outline:2px solid #1765d5;outline-offset:1px}
      .ev-rapida-rodape{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#edf3fc;border-top:1px solid #b4c9e7}
      .ev-rapida-acoes{display:flex;gap:8px;flex-wrap:wrap}.ev-rapida-cadastrar{background:#0b2454!important;color:#fff!important}.ev-rapida-rodape button{padding:9px 15px;border:1px solid #b0c6e5;background:white;color:#111;cursor:pointer;font-weight:800}
      :global(.ev-cli-overlay){z-index:3600!important}:global(.ev-cli-form-overlay){z-index:3610!important}
      @media(max-width:550px){.ev-rapida-filtros{grid-template-columns:1fr}.ev-rapida-abas{flex-wrap:wrap}.ev-rapida-abas label{margin-left:0}}

      /* Etapa 24.3.1.4 — pagamentos combinados e desconto destacado. */
      .ev-pagamento-novo{width:min(590px,96vw);max-height:92dvh;overflow-y:auto;gap:12px;padding:20px}
      .ev-pagamento-novo h2{font-size:20px;text-align:center}

      .ev-troca-pagamento{font-family:Arial,Helvetica,sans-serif;color:#111827}
      .ev-troca-pagamento header{display:flex;align-items:center;justify-content:space-between}
      .ev-troca-pagamento-origem{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:#425573}
      .ev-troca-pagamento-escolha{display:grid;gap:10px}
      .ev-troca-pagamento-escolha label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#1c355a}
      .ev-troca-pagamento-escolha select{width:100%;padding:11px;border:1px solid #b8cbe6;border-radius:7px;background:#fff;color:#142d52;font-weight:700;cursor:pointer}
      .ev-troca-pagamento button{cursor:pointer}.ev-troca-pagamento button:disabled{cursor:not-allowed}
      .ev-pag-resumo,.ev-pag-totais>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;background:#eaf2ff;border:1px solid #b8cbe6;border-radius:8px}
      .ev-pag-resumo strong{font-size:24px;color:#0b2454}
      .ev-pag-instrucao{font-size:11px;color:#35455e}
      .ev-pag-campos{display:flex;flex-direction:column;gap:8px}
      .ev-pag-linha{display:flex!important;flex-direction:row!important;align-items:center;justify-content:space-between;gap:12px;padding:8px 11px;border:1px solid #d3e0f1;border-radius:8px;background:#fff}
      .ev-pag-linha>span{font-size:14px;color:#111827}.ev-pag-linha small{font-size:11px}
      .ev-pag-entrada{display:flex;align-items:center;gap:6px;width:175px;flex-shrink:0}
      .ev-pag-entrada input{width:100%;min-width:0;padding:9px;border:1px solid #9cb8df;border-radius:6px;text-align:right;font:700 18px Arial,sans-serif;color:#111827}
      .ev-pag-entrada input:focus{outline:2px solid #1765d5}
      .ev-pag-desconto{background:#fff5e8;border:1px solid #e8c795;border-radius:10px;padding:12px}
      .ev-pag-desconto .ev-pag-linha{background:#fffaf3;border-color:#e8c795}
      .ev-pag-desconto>small{display:block;margin-top:7px;color:#75521b}
      .ev-pag-erro{color:#a32626!important;font-size:12px}
      .ev-pag-totais{display:flex;flex-direction:column;gap:6px}
      .ev-pag-totais>div{padding:9px 13px;background:#f4f8fe}
      .ev-pag-totais strong{font-size:18px}
      .ev-pag-totais .ev-pag-troco{background:#fff1f1;border-color:#f0c5c5}
      .ev-pagamento-novo footer{gap:9px;flex-wrap:wrap}
      .ev-pagamento-novo footer button:disabled{opacity:.45;cursor:not-allowed}
      /* Etapa 24.3.1.5 — resumo compacto do pagamento */
      .ev-pagamento-novo{gap:8px!important;padding:15px 18px!important;max-height:min(92dvh,760px)}
      .ev-pag-totais{gap:4px!important}
      .ev-pag-totais>div{padding:7px 12px!important;border-radius:6px!important;min-height:36px}
      .ev-pag-totais strong{font-size:17px!important}
      .ev-pag-totais span{font-size:12px;font-weight:800}
      .ev-pag-totais .ev-pag-restante{background:#fff8e9;border-color:#efd79b}
      .ev-pag-totais .ev-pag-troco{background:#fff1f1;border-color:#f0c5c5}
      .ev-pag-nota{font-size:11px!important;line-height:1.35!important;color:#59677a!important;text-align:center;margin:0!important;font-weight:600!important}
      .ev-pagamento-novo footer{margin-top:0!important;gap:7px!important}
      .ev-pagamento-novo footer button{padding:9px 12px!important}

      @media(max-width:500px){.ev-pag-linha>span{font-size:11px}.ev-pag-entrada{width:135px}.ev-pag-entrada input{font-size:15px}}

      /* EVOLUX 24.6.7 — Estilo do F7 no ramo da tela de venda (CSS scoped). */
      .ev-venda-overlay:has(.ev-troca-pdv-dialog){background:rgba(8,22,45,.66)!important;backdrop-filter:blur(3px);padding:18px!important;z-index:6000!important;display:flex!important;align-items:center!important;justify-content:center!important}
      .ev-troca-pdv-dialog{box-sizing:border-box!important;display:flex!important;flex-direction:column!important;width:min(94vw,640px)!important;max-width:640px!important;max-height:88dvh!important;overflow-y:auto!important;padding:0 0 20px!important;background:#fff!important;color:#1b3556!important;border:1px solid #dce5f2!important;border-radius:18px!important;box-shadow:0 28px 85px #071b3d55!important;font:14px/1.5 Arial,Helvetica,sans-serif!important}
      .ev-troca-pdv-dialog *{box-sizing:border-box!important}
      .ev-troca-pdv-dialog>header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:15px!important;background:#112e59!important;color:#fff!important;padding:22px 26px!important;margin:0 0 22px!important;min-height:84px!important}
      .ev-troca-pdv-dialog>header h2{font-size:19px!important;line-height:1.3!important;letter-spacing:.2px!important;font-weight:800!important;color:#fff!important;margin:0!important}
      .ev-troca-pdv-dialog>header button{display:grid!important;place-items:center!important;flex:0 0 36px!important;width:36px!important;height:36px!important;border:1px solid #ffffff55!important;border-radius:9px!important;background:#ffffff18!important;color:#fff!important;font-size:23px!important;cursor:pointer!important}
      .ev-troca-pdv-dialog>p{margin:0 26px 17px!important;font-size:13px!important;line-height:1.55!important;color:#506783!important}
      .ev-troca-pdv-dialog>p strong{color:#173a69!important}
      .ev-troca-pdv-campo{margin:0 26px 12px!important}
      .ev-troca-pdv-campo>label{display:block!important;margin:0 0 8px!important;color:#294566!important;font-size:12px!important;font-weight:800!important}
      .ev-troca-pdv-pesquisa{display:flex!important;align-items:stretch!important;gap:10px!important;width:100%!important}
      .ev-troca-pdv-pesquisa input{display:block!important;flex:1 1 auto!important;min-width:0!important;width:100%!important;height:46px!important;margin:0!important;padding:0 14px!important;background:#fff!important;color:#142d50!important;border:1px solid #c4d4e8!important;border-radius:9px!important;font:14px Arial,sans-serif!important;outline:none!important}
      .ev-troca-pdv-pesquisa input:focus,.ev-troca-pdv-catalogo-corpo>input:focus{border-color:#2b68b6!important;box-shadow:0 0 0 3px #2b68b61c!important}
      .ev-troca-pdv-pesquisa button{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 112px!important;min-width:112px!important;height:46px!important;padding:0 14px!important;margin:0!important;background:#174b8c!important;color:#fff!important;border:0!important;border-radius:9px!important;font-size:13px!important;font-weight:800!important;cursor:pointer!important;white-space:nowrap!important}
      .ev-troca-pdv-abrir-catalogo{display:flex!important;align-items:center!important;justify-content:center!important;width:calc(100% - 52px)!important;margin:0 26px 18px!important;padding:12px 15px!important;background:#eff5fd!important;color:#17467f!important;border:1px solid #cbdcf0!important;border-radius:9px!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important}
      .ev-troca-pdv-abrir-catalogo:hover{background:#e1edfb!important}
      .ev-troca-pdv-aviso{margin:12px 26px 0!important;padding:11px 13px!important;background:#f4f7fc!important;border:1px solid #e0e9f4!important;border-radius:9px!important;color:#637994!important;font-size:12px!important;font-weight:600!important}
      .ev-troca-pdv-resultados{display:flex!important;flex-direction:column!important;gap:7px!important;max-height:260px!important;overflow:auto!important;margin:0 26px 12px!important}
      .ev-troca-pdv-resultados button{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:5px!important;width:100%!important;text-align:left!important;padding:13px 14px!important;background:#fff!important;color:#17385f!important;border:1px solid #dbe6f3!important;border-radius:9px!important;cursor:pointer!important}
      .ev-troca-pdv-resultados button:hover{background:#f0f6fe!important;border-color:#8eb9e9!important}
      .ev-troca-pdv-resultados button span{color:#667e99!important;font-size:12px!important}
      .ev-troca-pdv-dialog>label{display:flex!important;flex-direction:column!important;gap:7px!important;margin:7px 26px!important;font-size:12px!important;font-weight:700!important}
      .ev-troca-pdv-dialog>label input,.ev-troca-pdv-dialog>label select{width:100%!important;padding:11px 12px!important;border:1px solid #cbd9e9!important;border-radius:9px!important;background:white!important;color:#17385f!important}
      .ev-troca-pdv-dialog>.ev-troca-pdv-confirmar,.ev-troca-pdv-dialog>button{margin:7px 26px!important;padding:12px 16px!important;border:1px solid #cbd9e9!important;border-radius:9px!important;background:#f2f6fc!important;color:#17467f!important;font-weight:700!important;cursor:pointer!important}
      .ev-troca-pdv-dialog>.ev-troca-pdv-confirmar{background:#174b8c!important;color:white!important;border-color:#174b8c!important}
      .ev-troca-pdv-dialog button:disabled{opacity:.55!important;cursor:not-allowed!important}
      .ev-troca-pdv-catalogo-fundo{position:fixed!important;inset:0!important;z-index:9999!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(8,22,45,.7)!important;backdrop-filter:blur(3px)}
      .ev-troca-pdv-catalogo{display:flex!important;flex-direction:column!important;box-sizing:border-box!important;width:min(94vw,780px)!important;max-height:85dvh!important;overflow:hidden!important;background:#fff!important;color:#17385f!important;border:1px solid #dce6f3!important;border-radius:17px!important;box-shadow:0 25px 75px #061b3b60!important}
      .ev-troca-pdv-catalogo>header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex-shrink:0!important;padding:21px 25px!important;background:#112e59!important;color:#fff!important}
      .ev-troca-pdv-catalogo>header small{display:block!important;color:#b9d2f2!important;font-size:10px!important;letter-spacing:1.2px!important;font-weight:700!important}
      .ev-troca-pdv-catalogo>header h3{margin:4px 0 0!important;font-size:21px!important;line-height:1.2!important;color:white!important}
      .ev-troca-pdv-catalogo>header button{display:grid!important;place-items:center!important;width:36px!important;height:36px!important;flex-shrink:0!important;border:1px solid #ffffff50!important;border-radius:9px!important;background:#ffffff1a!important;color:white!important;font-size:20px!important;cursor:pointer!important}
      .ev-troca-pdv-catalogo-corpo{display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important;padding:22px 25px!important}
      .ev-troca-pdv-catalogo-corpo>label{display:block!important;margin:0 0 8px!important;font-size:12px!important;font-weight:800!important;color:#294566!important}
      .ev-troca-pdv-catalogo-corpo>input{display:block!important;width:100%!important;height:46px!important;margin:0!important;padding:0 14px!important;background:#fff!important;color:#17385f!important;border:1px solid #c4d4e8!important;border-radius:9px!important;font:14px Arial,sans-serif!important;outline:none!important}
      .ev-troca-pdv-catalogo-corpo>p{margin:12px 0!important;color:#627b99!important;font-size:12px!important}
      .ev-troca-pdv-catalogo-lista{display:flex!important;flex-direction:column!important;gap:7px!important;min-height:0!important;max-height:49dvh!important;overflow-y:auto!important;padding-right:4px!important}
      .ev-troca-pdv-catalogo-lista button{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;flex-shrink:0!important;width:100%!important;padding:13px 15px!important;text-align:left!important;background:#fff!important;color:#18395f!important;border:1px solid #e0e9f4!important;border-radius:10px!important;cursor:pointer!important}
      .ev-troca-pdv-catalogo-lista button:hover{background:#edf5ff!important;border-color:#9ac1ed!important}
      .ev-troca-pdv-catalogo-lista button span:first-child{display:flex!important;flex-direction:column!important;gap:5px!important;min-width:0!important;flex:1!important}
      .ev-troca-pdv-catalogo-lista strong{font-size:13px!important;line-height:1.4!important;font-weight:700!important;overflow-wrap:anywhere!important}
      .ev-troca-pdv-catalogo-lista small{font-size:11px!important;color:#69809b!important;overflow-wrap:anywhere!important}
      .ev-troca-pdv-catalogo-valor{flex-shrink:0!important;font-size:14px!important;font-weight:800!important;color:#153f76!important;white-space:nowrap!important}
      .ev-troca-pdv-catalogo>footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex-shrink:0!important;padding:13px 25px!important;border-top:1px solid #e3ebf5!important;background:#f7f9fd!important;color:#637b98!important;font-size:11px!important}
      .ev-troca-pdv-catalogo>footer button{flex-shrink:0!important;padding:10px 17px!important;border:1px solid #c8d8eb!important;border-radius:8px!important;background:#fff!important;color:#1c467d!important;font-weight:700!important;cursor:pointer!important}
      @media(max-width:580px){.ev-troca-pdv-dialog>header{padding:17px!important}.ev-troca-pdv-dialog>p{margin-left:17px!important;margin-right:17px!important}.ev-troca-pdv-campo{margin-left:17px!important;margin-right:17px!important}.ev-troca-pdv-abrir-catalogo{margin-left:17px!important;margin-right:17px!important;width:calc(100% - 34px)!important}.ev-troca-pdv-pesquisa{flex-wrap:wrap!important}.ev-troca-pdv-pesquisa button{flex:1 1 100%!important}.ev-troca-pdv-catalogo-corpo{padding:16px!important}.ev-troca-pdv-catalogo>header,.ev-troca-pdv-catalogo>footer{padding:14px 16px!important}.ev-troca-pdv-catalogo-lista button{align-items:flex-start!important;flex-direction:column!important;gap:7px!important}}

      /* EVOLUX 24.6.17 — alinhar cabeçalho e valores pela mesma grade */
      .ev-rapida-colunas,.ev-rapida-resultados>.ev-rapida-produto-linha{
        box-sizing:border-box!important;
        grid-template-columns:minmax(125px,1.2fr) minmax(230px,3fr) minmax(75px,.7fr) minmax(115px,1fr) minmax(120px,1.1fr)!important;
        column-gap:12px!important;
        width:100%!important;
        padding-left:14px!important;
        padding-right:14px!important;
      }
      .ev-rapida-colunas>span:nth-child(n+3){text-align:right!important}
      .ev-rapida-colunas>span,.ev-rapida-produto-linha>span,.ev-rapida-produto-linha>strong{min-width:0!important}
      .ev-rapida-colunas>span:last-child,.ev-rapida-produto-linha>strong:last-child{white-space:nowrap}
      /* EVOLUX 24.6.16 — busca rápida em tabela e padrão visual do pagamento */
      .ev-rapida-colunas,.ev-rapida-resultados>.ev-rapida-produto-linha{display:grid!important;grid-template-columns:minmax(125px,1.2fr) minmax(230px,3fr) minmax(75px,.7fr) minmax(115px,1fr) minmax(120px,1.1fr)!important;gap:12px!important;align-items:center!important}
      .ev-rapida-colunas{position:sticky;top:0;z-index:2;padding:12px 14px;background:#e8f0fb;border-bottom:1px solid #bbcee8;color:#17365d;font-size:11px;font-weight:800}
      .ev-rapida-resultados>.ev-rapida-produto-linha{width:100%;text-align:left;padding:13px 14px!important;border:0;border-bottom:1px solid #e1e9f3;background:#fff;cursor:pointer;font-size:12px}
      .ev-rapida-resultados>.ev-rapida-produto-linha.ativo{background:#dceaff!important;box-shadow:inset 3px 0 #1a5bb1}
      .ev-rapida-produto-linha span{min-width:0;overflow-wrap:anywhere}
      .ev-rapida-produto-linha span:nth-child(n+3),.ev-rapida-produto-linha strong{text-align:right}
      .ev-rapida-produto-linha small{display:block;color:#60738d;font-size:10px;margin-top:3px}
      .ev-rapida-produto-linha strong{color:#123765;white-space:nowrap}
      .ev-rapida-resultados{overflow:auto!important}
      .ev-rapida-colunas,.ev-rapida-produto-linha{min-width:760px}
      .ev-pagamento-novo{padding:0!important;gap:9px!important;overflow-y:auto!important}
      .ev-pagamento-novo>header{position:sticky;top:0;z-index:3;display:flex!important;justify-content:space-between!important;align-items:center!important;flex-shrink:0;background:#112e59!important;padding:18px 22px!important;margin:0!important;border:0!important}
      .ev-pagamento-novo>header h2{margin:0!important;font-size:21px!important;font-weight:800!important;text-align:left!important;color:#fff!important}
      .ev-pagamento-novo>header button{width:36px;height:36px;display:grid;place-items:center;border:1px solid #ffffff55!important;border-radius:8px!important;background:#ffffff18!important;color:#fff!important;font-size:25px!important;cursor:pointer}
      .ev-pagamento-novo>.ev-pag-resumo,.ev-pagamento-novo>.ev-pag-instrucao,.ev-pagamento-novo>.ev-pag-campos,.ev-pagamento-novo>.ev-pag-desconto,.ev-pagamento-novo>.ev-pag-totais,.ev-pagamento-novo>.ev-pag-nota,.ev-pagamento-novo>.ev-pag-erro,.ev-pagamento-novo>.ev-troca-pagamento-origem,.ev-pagamento-novo>.ev-troca-pagamento-escolha{margin-left:18px!important;margin-right:18px!important}
      .ev-pagamento-novo>footer{margin:5px 18px 18px!important}
      .ev-pagamento-novo input,.ev-pagamento-novo select{cursor:text}
      .ev-pagamento-novo select{cursor:pointer}
      @media(max-width:640px){.ev-pagamento-novo>header{padding:15px!important}.ev-pagamento-novo>header h2{font-size:18px!important}}

      /* EVOLUX — abertura de caixa, identidade visual unificada */
      .ev-turno-modal{width:min(560px,calc(100vw - 30px))!important;padding:0!important;border:1px solid #c8d8ec!important;border-radius:16px!important;overflow:hidden!important;box-shadow:0 28px 80px #0a1b3855!important}
      .ev-turno-modal>header{margin:0!important;padding:19px 23px!important;background:#132f59!important;color:#fff!important;border:0!important;display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:74px}
      .ev-turno-modal>header small{font-size:10px;letter-spacing:1.3px;color:#bed2ee}
      .ev-turno-modal>header h2{font-size:21px;font-weight:800;margin:4px 0 0;color:#fff;line-height:1.25}
      .ev-turno-modal .ev-turno-fechar{flex-shrink:0;display:grid;place-items:center;background:#ffffff16!important;border:1px solid #ffffff50!important;border-radius:8px!important;color:#fff!important;font-size:25px;width:38px;height:38px;cursor:pointer}
      .ev-turno-conteudo{padding:24px}
      .ev-turno-pergunta{display:flex;align-items:center;gap:16px;background:#f2f6fc;border:1px solid #d8e4f4;border-radius:10px;padding:17px}
      .ev-turno-pergunta p{margin:0;line-height:1.55;color:#233d60}
      .ev-turno-icone{width:38px;height:38px;border-radius:50%;background:#1c4d8c;color:#fff;font-size:24px;font-weight:800;display:grid;place-items:center;flex-shrink:0}
      .ev-turno-campos{display:grid!important;grid-template-columns:1fr 1.2fr 1fr;gap:12px!important;margin-bottom:22px!important}
      .ev-turno-campos>div{min-width:0;background:#f2f6fc;border:1px solid #dbe5f3;border-radius:9px;padding:11px}
      .ev-turno-campos small{font-size:11px}.ev-turno-campos strong{font-size:13px;overflow-wrap:anywhere}
      .ev-turno-modal form label{font-weight:800;font-size:13px;color:#1b355a}
      .ev-turno-modal form input{width:100%;padding:13px;border-radius:8px;font-size:19px;font-weight:700}
      .ev-turno-ajuda{font-size:12px;color:#61758f;margin:0}
      .ev-turno-acoes{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:22px}
      .ev-turno-acoes button{border-radius:8px!important;padding:12px 16px!important;font-weight:700;cursor:pointer}
      .ev-turno-acoes button:first-child{background:#18477f!important;color:#fff!important;border-color:#18477f!important}
      .ev-turno-acoes button:disabled,.ev-turno-fechar:disabled{cursor:not-allowed!important}
      @media(max-width:520px){.ev-turno-conteudo{padding:16px}.ev-turno-campos{grid-template-columns:1fr 1fr}.ev-turno-modal>header h2{font-size:17px}}
      /* Configuração de cartão em janela secundária: não expande o pagamento. */
      .ev-cartao-resumo{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 10px 8px;color:#344e72;font-size:12px;font-weight:700}
      .ev-cartao-resumo button{border:1px solid #b7c9e5;border-radius:8px;background:#eef4ff;color:#102957;padding:7px 12px;font-weight:800;cursor:pointer}
      .ev-cartao-overlay{position:fixed;inset:0;z-index:10000;background:rgba(7,22,47,.62);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
      .ev-cartao-dialog{width:min(430px,96vw);max-height:90dvh;overflow-y:auto;border-radius:17px;background:#fff;box-shadow:0 24px 65px #07152b70;overflow-x:hidden;color:#102957}
      .ev-cartao-dialog>header{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#112e59;padding:18px 20px;color:#fff}
      .ev-cartao-dialog>header h2{font-size:19px;line-height:1.25;margin:0;color:#fff}
      .ev-cartao-dialog>header button{background:#ffffff18;border:1px solid #ffffff55;color:#fff;border-radius:9px;width:36px;height:36px;font-size:26px;cursor:pointer}
      .ev-cartao-conteudo{display:grid;gap:16px;padding:20px}
      .ev-cartao-conteudo p{margin:0;background:#edf3fd;padding:12px;border-radius:9px}
      .ev-cartao-conteudo label{display:grid;gap:7px;font-size:14px;font-weight:800}
      .ev-cartao-conteudo select{width:100%;min-height:46px;padding:10px 12px;border:1px solid #b7c9e5;border-radius:9px;background:#fff;color:#102957;font-size:15px}
      .ev-cartao-conteudo footer{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}
      .ev-cartao-conteudo footer button{border-radius:9px;border:1px solid #b7c9e5;padding:11px 14px;font-weight:800;cursor:pointer;background:#f4f7fc;color:#102957}
      .ev-cartao-conteudo footer button:last-child{background:#112e59;color:#fff;border-color:#112e59}
    `}</style>
  </main>;
}

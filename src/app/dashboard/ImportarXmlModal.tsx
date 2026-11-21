"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import VincularItensXml from "./VincularItensXml";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
type FornecedorDados = { razao_social:string; nome_fantasia:string; cnpj:string; inscricao_estadual:string; telefone:string; email:string; cep:string; logradouro:string; numero:string; complemento:string; bairro:string; cidade:string; uf:string };
type FornecedorStatus = "consultando" | "existente" | "nao_cadastrado" | "salvando" | "indisponivel";
const vazio: FornecedorDados = {razao_social:"",nome_fantasia:"",cnpj:"",inscricao_estadual:"",telefone:"",email:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",uf:""};
type ItemNfe = { numero: string; codigo: string; descricao: string; ean: string; unidade: string; quantidade: string; valorUnitario: string; total: string; ncm: string };
type NotaNfe = { chave: string; numero: string; serie: string; emissao: string; cnpj: string; fornecedor: string; valorTotal: string; itens: ItemNfe[]; modelo: string; tipo: string; fornecedorDados: FornecedorDados };
const texto = (no: Element | null, nome: string) => Array.from(no?.children ?? []).find(el => el.localName === nome)?.textContent?.trim() ?? "";
const filho = (no: Element | null, nome: string) => Array.from(no?.children ?? []).find(el => el.localName === nome) ?? null;
const formatarDocumento = (valor: string) => {
  const n = valor.replace(/\D/g, "").slice(0,14);
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : n;
};
const formatarCep = (valor: string) => {
  const n = valor.replace(/\D/g, "").slice(0,8);
  return n.length > 5 ? `${n.slice(0,5)}-${n.slice(5)}` : n;
};
const formatarTelefone = (valor: string) => {
  const n = valor.replace(/\D/g, "").slice(0,11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  return `(${n.slice(0,2)}) ${n.slice(2, n.length === 11 ? 7 : 6)}-${n.slice(n.length === 11 ? 7 : 6)}`;
};
const reais = (v: string) => { const n=Number(v); return Number.isFinite(n) ? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—"; };

export default function ImportarXmlModal({onClose}:{onClose:()=>void}) {
  const [nota,setNota]=useState<NotaNfe|null>(null);
  const [erro,setErro]=useState("");
  const [nomeArquivo,setNomeArquivo]=useState("");
  const [lendo,setLendo]=useState(false);
  const [empresaId,setEmpresaId]=useState("");
  const [statusFornecedor,setStatusFornecedor]=useState<FornecedorStatus>("indisponivel");
  const [fornecedorDados,setFornecedorDados]=useState<FornecedorDados>({...vazio});
  const [fornecedorErro,setFornecedorErro]=useState("");
  const [fornecedorId,setFornecedorId]=useState("");
  const [editandoFornecedor,setEditandoFornecedor]=useState(false);
  const [itensProntos,setItensProntos]=useState(false);
  const [finalizando,setFinalizando]=useState(false);
  const [finalizado,setFinalizado]=useState(false);
  const [resultado,setResultado]=useState("");
  const [etapa,setEtapa]=useState<1|2>(1);
  const [precos,setPrecos]=useState<Record<string,{produto_id:string;variacao_id:string|null;descricao:string;anterior:number;novo:string}>>({});
  const [carregandoPrecos,setCarregandoPrecos]=useState(false);
  const [erroPrecos,setErroPrecos]=useState("");
  const [checandoDuplicidade,setChecandoDuplicidade]=useState(false);
  const [duplicidadeVerificada,setDuplicidadeVerificada]=useState(false);
  const [notaDuplicada,setNotaDuplicada]=useState<{numero:string;serie:string;created_at:string}|null>(null);
  const [erroConsultaNota,setErroConsultaNota]=useState("");
  const [fatores,setFatores]=useState<Record<string,string>>({});
  

  async function continuarPrecos(){
    if(!supabase||!nota||!empresaId||!fornecedorId||!itensProntos||finalizado||checandoDuplicidade||!duplicidadeVerificada||notaDuplicada||erroConsultaNota||!conversoesValidas)return;
    setCarregandoPrecos(true);setErroPrecos("");
    const codigos=nota.itens.map(i=>i.codigo);
    const {data:links,error:le}=await supabase.from("produto_fornecedor_vinculos")
      .select("codigo_fornecedor,produto_id,variacao_id")
      .eq("empresa_id",empresaId).eq("fornecedor_id",fornecedorId).in("codigo_fornecedor",codigos);
    if(le){setErroPrecos(le.message);setCarregandoPrecos(false);return;}
    const porCodigo=new Map((links||[]).map(l=>[l.codigo_fornecedor,l]));
    const ids=[...new Set((links||[]).map(l=>l.produto_id))];
    const vids=[...new Set((links||[]).map(l=>l.variacao_id).filter(Boolean))] as string[];
    const [p,v]=await Promise.all([
      supabase.from("produtos").select("id,descricao,preco_venda").eq("empresa_id",empresaId).in("id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]),
      supabase.from("produto_variacoes").select("id,preco_venda").eq("empresa_id",empresaId).in("id",vids.length?vids:["00000000-0000-0000-0000-000000000000"])
    ]);
    setCarregandoPrecos(false);
    if(p.error||v.error){setErroPrecos((p.error||v.error)?.message||"Erro na consulta dos preços");return;}
    const pm=new Map((p.data||[]).map(x=>[x.id,x]));const vm=new Map((v.data||[]).map(x=>[x.id,x]));
    const registros:Record<string,{produto_id:string;variacao_id:string|null;descricao:string;anterior:number;novo:string}>={};
    for(const item of nota.itens){
      const link=porCodigo.get(item.codigo);const prod=link&&pm.get(link.produto_id);
      if(!link||!prod){setErroPrecos(`Vínculo do item ${item.numero} não encontrado. Volte à etapa anterior.`);return;}
      const especifico=link.variacao_id?vm.get(link.variacao_id)?.preco_venda:null;
      const anterior=Number(especifico??prod.preco_venda??0);
      registros[item.numero]={produto_id:link.produto_id,variacao_id:link.variacao_id,descricao:item.descricao,anterior,novo:anterior>0?String(anterior):""};
    }
    setPrecos(registros);setEtapa(2);
  }
  const conversoesValidas=nota?.itens.every(i=>{
    const n=Number(fatores[i.numero]??"1");
    return Number.isSafeInteger(n)&&n>=1&&n<=100000;
  })??false;

  const valoresValidos=nota?.itens.every(i=>{
    const valor=Number(precos[i.numero]?.novo?.replace(",","."));
    return precos[i.numero]?.novo?.trim()!=="" && Number.isFinite(valor) && valor>0;
  })??false;

  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==="F12" && nota && itensProntos && statusFornecedor === "existente" && !finalizado && !finalizando && !checandoDuplicidade && duplicidadeVerificada && !notaDuplicada && !erroConsultaNota){e.preventDefault();document.getElementById("ev-xml-finalizar")?.click();}
      if(e.key==="Escape" && !lendo && !finalizando){e.preventDefault();onClose();}
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[onClose,lendo,nota,itensProntos,statusFornecedor,finalizado,finalizando,checandoDuplicidade,duplicidadeVerificada,notaDuplicada,erroConsultaNota]);

  async function abrirArquivo(file:File|undefined) {
    setNota(null);setErro("");setNomeArquivo(file?.name??"");
    setFornecedorErro("");setFornecedorId("");setEmpresaId("");setEditandoFornecedor(false);
    setEtapa(1);setPrecos({});setFatores({});setErroPrecos("");setNotaDuplicada(null);setErroConsultaNota("");setChecandoDuplicidade(false);setDuplicidadeVerificada(false);setStatusFornecedor("indisponivel");setItensProntos(false);setFinalizando(false);setFinalizado(false);setResultado("");
    if(!file)return;
    if(!file.name.toLowerCase().endsWith(".xml")){setErro("Selecione um arquivo .xml de NF-e.");return;}
    if(file.size>12*1024*1024){setErro("O arquivo excede o limite de 12 MB.");return;}
    setLendo(true);
    try {
      const xml=new DOMParser().parseFromString(await file.text(),"application/xml");
      if(xml.getElementsByTagName("parsererror").length){throw new Error("O arquivo XML não pôde ser interpretado.");}
      const nfe=Array.from(xml.getElementsByTagName("*")).find(el=>el.localName==="NFe");
      if(!nfe)throw new Error("Não foi encontrada uma NF-e no XML. Envie o XML completo da nota, não um evento ou DANFE.");
      const inf=filho(nfe,"infNFe");
      const ide=filho(inf,"ide"),emit=filho(inf,"emit"),total=filho(filho(inf,"total"),"ICMSTot");
      if(!inf || !ide || !emit)throw new Error("O XML não contém os dados essenciais da NF-e.");
      const itens=Array.from(inf.children).filter(el=>el.localName==="det").map((det,i)=>{
        const prod=filho(det,"prod");return {
          numero:det.getAttribute("nItem")??String(i+1),codigo:texto(prod,"cProd"),descricao:texto(prod,"xProd"),ean:texto(prod,"cEAN"),unidade:texto(prod,"uCom"),quantidade:texto(prod,"qCom"),valorUnitario:texto(prod,"vUnCom"),total:texto(prod,"vProd"),ncm:texto(prod,"NCM")
        };
      });
      if(!itens.length)throw new Error("A NF-e não possui itens de produto.");
      const chave=(inf.getAttribute("Id")??"").replace(/^NFe/,"");
      const endereco=filho(emit,"enderEmit");
      const dados: FornecedorDados = {
        razao_social:texto(emit,"xNome"),
        nome_fantasia:texto(emit,"xFant"),
        cnpj:texto(emit,"CNPJ").replace(/\D/g,""),
        inscricao_estadual:texto(emit,"IE"),
        telefone:texto(endereco,"fone"),
        email:texto(emit,"email"),
        cep:texto(endereco,"CEP"),
        logradouro:texto(endereco,"xLgr"),
        numero:texto(endereco,"nro"),
        complemento:texto(endereco,"xCpl"),
        bairro:texto(endereco,"xBairro"),
        cidade:texto(endereco,"xMun"),
        uf:texto(endereco,"UF")
      };
      setFornecedorDados(dados);
      setNota({chave,numero:texto(ide,"nNF"),serie:texto(ide,"serie"),emissao:texto(ide,"dhEmi")||texto(ide,"dEmi"),cnpj:texto(emit,"CNPJ")||texto(emit,"CPF"),fornecedor:texto(emit,"xNome"),valorTotal:texto(total,"vNF"),itens,modelo:texto(ide,"mod"),tipo:texto(ide,"tpNF"),fornecedorDados:dados});
    } catch(e) {setErro(e instanceof Error?e.message:"Erro ao ler o XML.");}
    finally{setLendo(false);}
  }
  useEffect(()=>{
    if(!nota)return;
    const dadosEmitente = nota.fornecedorDados;
    let cancelled=false;
    async function consultar(){
      setStatusFornecedor("consultando");setFornecedorErro("");setFornecedorId("");
      if(!supabase){setStatusFornecedor("indisponivel");setFornecedorErro("Supabase não configurado.");return;}
      if(!/^\d{14}$/.test(dadosEmitente?.cnpj ?? "")){
        setStatusFornecedor("indisponivel");setFornecedorErro("O emitente não possui CNPJ válido para cadastro automático.");return;
      }
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(cancelled)return;
      if(authError||!user){setStatusFornecedor("indisponivel");setFornecedorErro("Sessão não autenticada.");return;}
      const {data:vinculos,error:vinculoErro}=await supabase.from("empresa_usuarios")
        .select("empresa_id").eq("usuario_id",user.id).limit(1);
      if(cancelled)return;
      if(vinculoErro||!vinculos?.length){setStatusFornecedor("indisponivel");setFornecedorErro("Empresa não identificada.");return;}
      const id=vinculos[0].empresa_id as string;
      setEmpresaId(id);
      const {data,error}=await supabase.from("fornecedores")
        .select("id,razao_social,cnpj").eq("empresa_id",id)
        .eq("cnpj",dadosEmitente.cnpj).maybeSingle();
      if(cancelled)return;
      if(error){setStatusFornecedor("indisponivel");setFornecedorErro("Não foi possível consultar o fornecedor: "+error.message);return;}
      if(data){setFornecedorId(data.id);setStatusFornecedor("existente");setEditandoFornecedor(false);}
      else {setStatusFornecedor("nao_cadastrado");setEditandoFornecedor(true);}
    }
    void consultar();return()=>{cancelled=true;};
  },[nota]);

  useEffect(()=>{
    if(!nota||!empresaId||!supabase)return;
    let cancelado=false;
    async function verificar(){
      setChecandoDuplicidade(true);setDuplicidadeVerificada(false);setNotaDuplicada(null);setErroConsultaNota("");
      const {data,error}=await supabase!.from("nfe_entradas")
        .select("numero,serie,created_at").eq("empresa_id",empresaId)
        .eq("chave_acesso",nota!.chave).maybeSingle();
      if(cancelado)return;
      if(error)setErroConsultaNota("Não foi possível verificar se a nota já foi importada: "+error.message);
      else if(data)setNotaDuplicada(data);
      else setDuplicidadeVerificada(true);
      setChecandoDuplicidade(false);
    }
    void verificar();return()=>{cancelado=true};
  },[nota,empresaId]);

  async function cadastrarFornecedor(){
    if(!supabase||!empresaId||statusFornecedor!=="nao_cadastrado")return;
    if(!/^\d{14}$/.test(fornecedorDados.cnpj)||!fornecedorDados.razao_social.trim()){
      setFornecedorErro("Informe razão social e CNPJ de 14 dígitos.");return;
    }
    if(fornecedorDados.cnpj!==nota?.fornecedorDados.cnpj){
      setFornecedorErro("O CNPJ deve corresponder ao emitente do XML.");return;
    }
    setStatusFornecedor("salvando");setFornecedorErro("");
    const campos={...fornecedorDados,razao_social:fornecedorDados.razao_social.trim(),empresa_id:empresaId};
    const {data,error}=await supabase.from("fornecedores").insert(campos).select("id").single();
    if(error){
      if(error.code==="23505"){
        const {data:existente}=await supabase.from("fornecedores").select("id")
          .eq("empresa_id",empresaId).eq("cnpj",fornecedorDados.cnpj).maybeSingle();
        if(existente){setFornecedorId(existente.id);setStatusFornecedor("existente");setEditandoFornecedor(false);return;}
      }
      setStatusFornecedor("nao_cadastrado");setFornecedorErro("Não foi possível cadastrar: "+error.message);return;
    }
    setFornecedorId(data.id);setStatusFornecedor("existente");setEditandoFornecedor(false);
  }

  async function finalizarEntrada(){
    if(!supabase||!nota||!empresaId||!fornecedorId||!itensProntos||finalizando||finalizado||etapa!==2||!valoresValidos||checandoDuplicidade||!duplicidadeVerificada||notaDuplicada||erroConsultaNota||!conversoesValidas)return;
    if(nota.modelo!=="55"||!/^[0-9]{44}$/.test(nota.chave)){setErro("NF-e modelo 55 com chave de 44 dígitos é obrigatória.");return;}
    if(!window.confirm(`Finalizar a entrada da NF-e nº ${nota.numero} com os preços de venda conferidos?\n\nEsta operação atualizará o estoque e o custo dos ${nota.itens.length} itens. Não poderá ser repetida.`))return;
    setFinalizando(true);setErro("");setResultado("");
    const {data,error}=await supabase.rpc("evolux_finalizar_entrada_xml_com_precos",{
      p_empresa_id:empresaId,p_fornecedor_id:fornecedorId,p_chave:nota.chave,
      p_numero:nota.numero,p_serie:nota.serie,p_emissao:nota.emissao||null,
      p_valor_total:Number(nota.valorTotal),p_modelo:nota.modelo,
       p_precos:nota.itens.map(i=>({codigo:i.codigo,preco:Number(precos[i.numero].novo.replace(",","."))})),
      p_itens:nota.itens.map(i=>({numero:i.numero,codigo:i.codigo,descricao:i.descricao,
        quantidade:Number(i.quantidade),custo_unitario:Number(i.valorUnitario),
        valor_total:Number(i.total),unidade:i.unidade,ean:i.ean,
         fator_conversao:Number(fatores[i.numero]??"1")}))
    });
    setFinalizando(false);
    if(error){setErro("A entrada não foi finalizada: "+error.message);return;}
    setFinalizado(true);setResultado(`NF-e ${nota.numero} registrada com sucesso. Entrada nº ${data}. Estoques e custos atualizados.`);
    onClose();
  }

  return <div className="ev-xml-overlay" role="presentation">
    <section className="ev-xml-modal" role="dialog" aria-modal="true" aria-labelledby="ev-xml-title">
      <header className="ev-xml-head"><div><h2 id="ev-xml-title">Entrada de Nota Fiscal</h2><p>Etapa {etapa} de 2 · {etapa===1?"Cadastro e vínculo dos produtos":"Conferência dos preços de venda"}</p></div><button type="button" onClick={onClose} aria-label="Fechar importação">×</button></header>
      <div className="ev-xml-content">
        <label className="ev-xml-file" style={{display:etapa===2?"none":undefined}}>Selecionar ou trocar arquivo XML<input type="file" accept=".xml,text/xml,application/xml" onChange={e=>void abrirArquivo(e.target.files?.[0])}/></label>
        {nomeArquivo&&<p className="ev-xml-small">Arquivo: {nomeArquivo}</p>}
        {lendo&&<p>Lendo arquivo...</p>}
        {erro&&<p className="ev-xml-error" role="alert">{erro}</p>}
         {nota&&checandoDuplicidade&&<p className="ev-xml-notice" role="status">Verificando se esta nota fiscal já foi importada...</p>}
         {nota&&notaDuplicada&&<p className="ev-xml-error" role="alert"><strong>XML importado ou nota fiscal já importada.</strong> NF-e nº {notaDuplicada.numero}, série {notaDuplicada.serie}. Selecione outra nota.</p>}
         {nota&&erroConsultaNota&&<p className="ev-xml-error" role="alert">{erroConsultaNota} A importação está bloqueada por segurança.</p>}
        {nota&&duplicidadeVerificada&&!notaDuplicada&&!erroConsultaNota&&<>
          
          {nota.modelo!=="55"&&<p className="ev-xml-error">Atenção: modelo {nota.modelo||"não identificado"}. A importação de entrada será destinada à NF-e modelo 55.</p>}
          <div className="ev-xml-details"><div><small>Fornecedor</small><strong>{nota.fornecedor||"Não informado"}</strong><span>Documento: {nota.cnpj||"—"}</span></div><div><small>Nota fiscal</small><strong>Nº {nota.numero||"—"} · Série {nota.serie||"—"}</strong><span>Emissão: {nota.emissao?new Date(nota.emissao).toLocaleString("pt-BR"):"—"}</span></div><div><small>Valor total da NF-e</small><strong>{reais(nota.valorTotal)}</strong><span>{nota.itens.length} item(ns)</span></div></div>
           <div className="ev-xml-supplier" style={{display:etapa===2?"none":undefined}}>
             <h3>Fornecedor da NF-e</h3>
             {statusFornecedor==="consultando"&&<p>Consultando CNPJ no Supabase...</p>}
             {statusFornecedor==="existente"&&<p className="ev-xml-success">Fornecedor encontrado e vinculado para esta conferência. Código: {fornecedorId}</p>}
             {statusFornecedor==="nao_cadastrado"&&<>
               <p>Fornecedor não cadastrado. Confira os dados extraídos do XML antes de salvar.</p>
               {editandoFornecedor&&<div className="ev-xml-supplier-grid">
                 {([ ["razao_social","Razão social *"],["nome_fantasia","Nome fantasia"],["cnpj","CNPJ *"],["inscricao_estadual","Inscrição estadual"],["telefone","Telefone"],["email","E-mail"],["cep","CEP"],["logradouro","Logradouro"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["uf","UF"] ] as [keyof FornecedorDados,string][]).map(([campo,label])=><label key={campo}>{label}<input
                    value={campo==="cnpj" ? formatarDocumento(fornecedorDados[campo]) : campo==="cep" ? formatarCep(fornecedorDados[campo]) : campo==="telefone" ? formatarTelefone(fornecedorDados[campo]) : fornecedorDados[campo]}
                    readOnly={campo==="cnpj"}
                    inputMode={campo==="cnpj" || campo==="cep" || campo==="telefone" ? "numeric" : "text"}
                    maxLength={campo==="uf"?2:200}
                    onChange={e=>setFornecedorDados(v=>({...v,[campo]:campo==="cep"?e.target.value.replace(/\D/g,"").slice(0,8):campo==="telefone"?e.target.value.replace(/\D/g,"").slice(0,11):campo==="uf"?e.target.value.toUpperCase():e.target.value}))}
                  /></label>)}
               </div>}
               <button type="button" className="ev-xml-confirm-supplier" disabled={!empresaId} onClick={()=>void cadastrarFornecedor()}>Confirmar cadastro do fornecedor</button>
             </>}
             {statusFornecedor==="salvando"&&<p>Salvando fornecedor...</p>}
             {fornecedorErro&&<p className="ev-xml-error" role="alert">{fornecedorErro}</p>}
           </div>
                     {statusFornecedor==="existente" && empresaId && fornecedorId && etapa===1 && <VincularItensXml
             empresaId={empresaId} fornecedorId={fornecedorId}
             itens={nota.itens} onStatusChange={setItensProntos}
              fatores={fatores} onFatorChange={(numero,valor)=>setFatores(old=>({...old,[numero]:valor}))}/>
           }
           {etapa===2&&<section className="ev-price-stage">
             <h3>Conferir preços de venda</h3>
             <p>Confira a conversão das embalagens antes de finalizar. O estoque será movimentado em unidades de venda.</p>
             <div className="ev-price-scroll"><table><thead><tr><th>Produto</th><th>Qtd. XML</th><th>Apresentação</th><th>Entrada (UN)</th><th>Custo/UN</th><th>Venda anterior</th><th>Venda/UN *</th></tr></thead><tbody>
               {nota.itens.map(i=>{const fator=Number(fatores[i.numero]??"1");return <tr key={i.numero}><td>{i.descricao}<small style={{display:"block",color:"#64748b"}}>XML: {i.unidade||"UN"} · Custo embalagem: {reais(i.valorUnitario)}</small></td><td>{i.quantidade} {i.unidade}</td><td><strong>{fator===1?(i.unidade||"UN"):`CX${fator}`}</strong><small style={{display:"block",color:"#64748b"}}>Definida na etapa 1</small></td><td>{Number.isSafeInteger(fator)&&fator>0?(Number(i.quantidade)*fator).toLocaleString("pt-BR"):"—"}</td><td>{fator>0?reais(String(Number(i.valorUnitario)/fator)):"—"}</td><td>{reais(String(precos[i.numero]?.anterior??0))}</td><td><input aria-label={`Preço de venda por unidade do item ${i.numero}`} type="number" min="0.01" step="0.01" value={precos[i.numero]?.novo??""} onChange={e=>setPrecos(old=>({...old,[i.numero]:{...old[i.numero],novo:e.target.value}}))}/></td></tr>})}
             </tbody></table></div>
             <p className="ev-conversion-hint">Exemplo: selecione CX12 na coluna Un. da etapa 1 para converter cada caixa em 12 unidades. Se o XML já estiver em unidades, mantenha UN. O custo unitário é calculado automaticamente. Preço de venda nesta etapa é por unidade; preço de venda da caixa será configurado na próxima etapa.</p>
              {!conversoesValidas&&<p className="ev-xml-error">Informe um número inteiro de unidades por embalagem (mínimo 1).</p>}
              {erroPrecos&&<p className="ev-xml-error" role="alert">{erroPrecos}</p>}
           </section>}
           <p className="ev-xml-key"><strong>Chave de acesso:</strong> {nota.chave||"Não identificada"}</p>
        </>}
      </div>
      <footer className="ev-xml-footer">
        <div className="ev-xml-footer-info">
          <strong>{finalizado ? "Entrada finalizada" : etapa===2 ? "Etapa 2 — preços de venda" : itensProntos && statusFornecedor === "existente" ? "Todos os itens vinculados" : "Etapa 1 — vincule todos os produtos"}</strong>
          <small>{finalizado ? resultado : etapa===1?"Salve os vínculos e continue para os preços. O estoque ainda não será alterado.":"Confira os preços e finalize para atualizar o estoque."}</small>
        </div>
        <div className="ev-xml-footer-buttons">
          {etapa===2&&!finalizado&&<button type="button" className="ev-xml-close" onClick={()=>setEtapa(1)} disabled={finalizando}>Voltar</button>}
          <button type="button" className="ev-xml-close" onClick={onClose} disabled={finalizando}>Fechar (Esc)</button>
          <button type="button" id="ev-xml-finalizar" className="ev-xml-save"
            disabled={!nota || !empresaId || statusFornecedor !== "existente" || !fornecedorId || !itensProntos || finalizando || finalizado || carregandoPrecos || (etapa===2&&(!valoresValidos||!conversoesValidas)) || nota.modelo !== "55" || !/^[0-9]{44}$/.test(nota.chave) || checandoDuplicidade || !duplicidadeVerificada || Boolean(notaDuplicada) || Boolean(erroConsultaNota)}
            onClick={() => etapa===1?void continuarPrecos():void finalizarEntrada()}>
            {finalizando ? "Finalizando..." : finalizado ? "Entrada registrada" : carregandoPrecos?"Carregando preços...":etapa===1?"Salvar e continuar (F12)":"Finalizar entrada (F12)"}
          </button>
        </div>
      </footer>
    </section>
    <style jsx>{`
             
        .ev-conversion-hint{font-size:12px;color:#50637c;background:#eef4fc;padding:11px;border-radius:8px;margin-top:12px}
        .ev-price-stage{margin:20px 0 14px;padding:18px;border:1px solid #dce5f0;border-radius:12px;background:#fff}
        .ev-price-stage h3{margin:0 0 7px;font-size:18px;font-weight:700;color:#10234b}
        .ev-price-stage>p{margin:0 0 16px;font-size:13px;color:#60728a;line-height:1.5}
        .ev-price-scroll{max-height:390px;overflow:auto;border:1px solid #dce5f0;border-radius:9px;background:#fff}
        .ev-price-scroll table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:13px;color:#10234b}
        .ev-price-scroll th{position:sticky;top:0;z-index:1;background:#edf3fb;color:#243c5c;font-size:12px;font-weight:700;text-align:left;padding:13px 12px;border-bottom:1px solid #d8e3f1;white-space:nowrap}
        .ev-price-scroll td{padding:11px 12px;border-bottom:1px solid #e6edf6;vertical-align:middle;line-height:1.4}
        .ev-price-scroll tbody tr:last-child td{border-bottom:0}
        .ev-price-scroll tbody tr:nth-child(even){background:#f8fafd}
        .ev-price-scroll th:nth-child(1){width:30%}.ev-price-scroll th:nth-child(2){width:12%}.ev-price-scroll th:nth-child(3){width:12%}.ev-price-scroll th:nth-child(4){width:12%}.ev-price-scroll th:nth-child(5){width:12%}.ev-price-scroll th:nth-child(6){width:11%}.ev-price-scroll th:nth-child(7){width:11%}
        .ev-price-scroll th:nth-child(2),.ev-price-scroll th:nth-child(4),.ev-price-scroll th:nth-child(5),.ev-price-scroll th:nth-child(6),.ev-price-scroll td:nth-child(2),.ev-price-scroll td:nth-child(4),.ev-price-scroll td:nth-child(5),.ev-price-scroll td:nth-child(6){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
        .ev-price-scroll td:first-child{font-weight:600;overflow-wrap:anywhere}
        .ev-price-scroll td:last-child,.ev-price-scroll td:nth-child(3){padding:7px 9px}
        .ev-price-scroll input{display:block;width:100%;min-width:85px;min-height:40px;box-sizing:border-box;padding:9px 11px;border:1px solid #c4d5ea;border-radius:8px;background:#fff;color:#10234b;font:600 14px Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;text-align:right;outline:none}
        .ev-price-scroll input:focus{border-color:#1765d5;box-shadow:0 0 0 3px #1765d522}
        .ev-price-scroll input::-webkit-inner-spin-button,.ev-price-scroll input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        .ev-price-scroll input[type=number]{-moz-appearance:textfield;appearance:textfield}
        @media(max-width:650px){.ev-price-stage{padding:12px}.ev-price-scroll{max-height:50dvh}}
        .ev-xml-footer-info{display:flex;flex-direction:column;gap:5px}.ev-xml-footer-info strong{font-size:14px}.ev-xml-footer-info small{font-size:11px;color:#60728a}.ev-xml-footer-buttons{display:flex;gap:9px;flex-wrap:wrap}.ev-xml-footer .ev-xml-close{background:white;color:#0b2454;border:1px solid #cbd8e8}.ev-xml-footer .ev-xml-save{background:#0b2454;color:white}.ev-xml-footer button:disabled{opacity:.5;cursor:not-allowed}
        .ev-xml-supplier{margin:18px 0;padding:18px;border:1px solid #dce5f0;border-radius:10px;background:#fff}
       .ev-xml-supplier h3{font-size:16px;margin:0 0 10px;color:#10234b}
       .ev-xml-supplier>p{font-size:13px;color:#536783;line-height:1.5;margin:0 0 14px}
       .ev-xml-supplier-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;margin:16px 0 18px}
       .ev-xml-supplier-grid label{min-width:0;display:flex;flex-direction:column;gap:7px;color:#344761;font-size:12px;font-weight:700}
       .ev-xml-supplier-grid input{display:block;width:100%;min-width:0;border:1px solid #cbd8e8;border-radius:8px;background:#fff;color:#10234b;padding:11px 12px;font-size:14px;font-weight:400;line-height:1.4}
       .ev-xml-supplier-grid input:focus{outline:2px solid #a3c9fa;outline-offset:0}
       .ev-xml-supplier-grid input[readonly]{background:#f3f6fb;color:#4d607a;cursor:default}
       .ev-xml-confirm-supplier{background:#0b2454;border:1px solid #0b2454;border-radius:8px;padding:12px 18px;color:#fff;font-size:13px;font-weight:700;cursor:pointer}
       .ev-xml-confirm-supplier:hover:not(:disabled){background:#143773}
       .ev-xml-confirm-supplier:disabled{opacity:.55;cursor:not-allowed}
       .ev-xml-success{background:#eaf8ef;color:#17633b!important;border-radius:8px;padding:12px}
       @media(max-width:650px){.ev-xml-supplier{padding:14px}.ev-xml-supplier-grid{grid-template-columns:1fr}}
.ev-xml-modal{width:min(1380px,100%)!important}.ev-xml-head{padding:22px 26px!important}.ev-xml-head h2{font-weight:750!important;font-size:25px!important}.ev-xml-file input{background:#f8fbff}.ev-xml-details>div{background:#f3f7fd!important;border:1px solid #e0e9f6}.ev-xml-supplier{padding:13px 17px!important}.ev-xml-supplier h3{font-size:14px!important}.ev-xml-footer{background:#fff;box-shadow:0 -5px 18px #0b24540a}.ev-xml-footer .ev-xml-save{padding:13px 18px!important;font-size:14px}.ev-xml-overlay{position:fixed;inset:0;z-index:1200;background:#07162fa8;display:flex;align-items:center;justify-content:center;padding:18px}.ev-xml-modal{background:#fff;border-radius:15px;width:min(1080px,100%);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;overflow:hidden;color:#10234b;box-shadow:0 24px 70px #06152c66}.ev-xml-head{padding:20px 23px;border-bottom:1px solid #dce5f0;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.ev-xml-head h2{font-size:21px;margin:0}.ev-xml-head p{font-size:13px;color:#60728a;margin:7px 0 0}.ev-xml-head button{border:0;background:#edf3fa;color:#18365f;border-radius:8px;width:34px;height:34px;font-size:24px;cursor:pointer}.ev-xml-content{padding:20px 23px;overflow:auto;min-height:180px}.ev-xml-file{display:flex;flex-direction:column;gap:10px;font-size:13px;font-weight:700}.ev-xml-file input{border:1px dashed #9bb4d8;padding:17px;border-radius:9px;max-width:100%;font-weight:400}.ev-xml-small{font-size:12px;color:#64748b}.ev-xml-error{background:#fff0ee;color:#9c2f21;padding:12px;border-radius:8px}.ev-xml-notice{background:#eff5fd;padding:12px;border-radius:8px;font-size:12px;margin:18px 0}.ev-xml-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ev-xml-details>div{display:flex;flex-direction:column;gap:6px;padding:13px;background:#f3f6fb;border-radius:9px;min-width:0;overflow-wrap:anywhere}.ev-xml-details small,.ev-xml-details span{font-size:12px;color:#60728a}.ev-xml-details strong{font-size:14px}.ev-xml-key{font-size:12px;overflow-wrap:anywhere}.ev-xml-table{overflow:auto;border:1px solid #dce5f0;border-radius:8px}.ev-xml-table table{border-collapse:collapse;width:100%;min-width:790px;font-size:12px}.ev-xml-table th,.ev-xml-table td{padding:10px;border-bottom:1px solid #e5ebf3;text-align:left}.ev-xml-table th{background:#f1f5fb}.ev-xml-footer{padding:15px 23px;border-top:1px solid #dce5f0;display:flex;justify-content:space-between;align-items:center;gap:12px}.ev-xml-footer span{font-size:12px;color:#64748b}.ev-xml-footer button{border:0;border-radius:8px;background:#0b2454;color:#fff;font-weight:700;padding:11px 18px;cursor:pointer}@media(max-width:650px){.ev-xml-overlay{padding:7px}.ev-xml-modal{max-height:calc(100dvh - 14px)}.ev-xml-details{grid-template-columns:1fr}.ev-xml-content{padding:14px}}
    `}</style>
  </div>;
}

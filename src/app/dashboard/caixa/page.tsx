"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {caixaIndividual} from "@/lib/caixa-individual-client";
import {createClient} from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Obj=Record<string,unknown>;
const real=(n:unknown)=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dt=(s:unknown)=>s?new Date(String(s)).toLocaleString("pt-BR"):"—";
const cents=(s:string)=>{const v=s.trim().replace(/\./g,"").replace(",",".");return /^\d+(\.\d{1,2})?$/.test(v)?Math.round(Number(v)*100):null};
const classificacao=(valor:unknown)=>{const n=Number(valor||0);return Math.abs(n)<0.005?"Sem diferença":n>0?`Sobra de ${real(n)}`:`Faltando ${real(Math.abs(n))}`};
function imprimirTermico(dados:Obj){
 const esc=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
 const linhas=(dados.linhas as [string,unknown][])||[];
 const comparativos=(dados.comparativos as {nome:string;esperado:number;contado:number}[]|undefined);
 const detalhe=comparativos?comparativos.map(c=>`<div class="linha"><strong>${esc(c.nome)}</strong></div><div class="linha"><span>Esperado</span><span>${esc(real(c.esperado))}</span></div><div class="linha"><span>Contado</span><span>${esc(real(c.contado))}</span></div><div class="linha"><strong>${esc(classificacao(c.contado-c.esperado))}</strong></div>`).join(""):"";
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>EVOLUX - Resumo de Caixa</title><style>@page{size:80mm auto;margin:2mm}body{font:12px Arial;color:#000;width:76mm;margin:0}h2{text-align:center;margin:4px 0}.linha{display:flex;justify-content:space-between;border-bottom:1px dashed #aaa;padding:4px 0;gap:5px}.linha span:last-child{white-space:nowrap}p{margin:4px 0}.rodape{text-align:center;margin-top:12px}@media screen{body{margin:20px auto;box-shadow:0 0 6px #aaa;padding:10px}}</style></head><body><h2>EVOLUX</h2><p style="text-align:center">${esc(dados.titulo||"RESUMO DE FECHAMENTO")}</p><p style="text-align:center">${esc(dados.situacao||"")}</p><p>Turno: ${esc(dados.numero)}</p><p>Operador: ${esc(dados.operador)}</p><p>Emissão: ${esc(new Date().toLocaleString("pt-BR"))}</p>${dados.aprovador?`<p>Aprovador: ${esc(dados.aprovador)}</p>`:""}${detalhe}${linhas.map(([a,b])=>`<div class="linha"><span>${esc(a)}</span><span>${esc(typeof b==="string"?b:real(b))}</span></div>`).join("")}<p class="rodape">Documento interno de conferência</p><script>window.addEventListener('load',()=>{window.focus();window.print()})<\/script></body></html>`;
 const w=window.open("","_blank","width=430,height=720");if(!w){alert("Permita pop-ups para imprimir");return;}w.document.open();w.document.write(html);w.document.close();
}
export default function CaixaGestao({embutido=false}:{embutido?:boolean}){
 const [empresa,setEmpresa]=useState("");const [usuario,setUsuario]=useState("");const [papel,setPapel]=useState("");const [turno,setTurno]=useState<Obj|null>(null);const [conf,setConf]=useState<Obj|null>(null);
 const [pendentes,setPendentes]=useState<Obj[]>([]);const [status,setStatus]=useState<Obj|null>(null);const [pareceres,setPareceres]=useState<Record<string,string>>({});const [recontagens,setRecontagens]=useState<Record<string,{dinheiro:string;pix:string;cartao:string}>>({});const [motivo,setMotivo]=useState("");const [historico,setHistorico]=useState<Obj[]>([]);const [aba,setAba]=useState<"atual"|"historico"|"supervisao">("atual");const [fase,setFase]=useState<"contagem"|"resultado">("contagem");
 const [ultimoComprovante,setUltimoComprovante]=useState<Obj|null>(null);
 const [ultimaContagem,setUltimaContagem]=useState<Obj|null>(null);
 const [dinheiro,setDinheiro]=useState("");const [pix,setPix]=useState("");const [cartao,setCartao]=useState("");const [obs,setObs]=useState("");const [erro,setErro]=useState("");const [aviso,setAviso]=useState("");const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const carregar=useCallback(async(e:string,u:string,p:string)=>{if(!db)return;setLoading(true);setErro("");try{
  const t={data:(await caixaIndividual("turno")).turno};setTurno(t.data);setConf(null);setFase("contagem");
  if(t.data){const st=await db.rpc("evolux_status_caixa",{p_caixa_turno_id:t.data.id});if(st.error)throw st.error;setStatus(st.data as Obj);if((st.data as Obj)?.status==="pendente")setFase("resultado");}else setStatus(null);
  if(["administrador","supervisor"].includes(p)){const q=await caixaIndividual("pendentes");setPendentes((q.pendentes||[]) as Obj[])}
  if(p==="administrador"){const h=await db.rpc("evolux_historico_fechamentos",{p_empresa_id:e});if(h.error)throw h.error;setHistorico((h.data||[]) as Obj[])}
 }catch(x){setErro(x instanceof Error?x.message:"Falha ao consultar o caixa")}finally{setLoading(false)}},[]);
 useEffect(()=>{let ok=true;(async()=>{if(!db){setErro("Supabase não configurado");setLoading(false);return}const a=await db.auth.getUser();if(!a.data.user){setErro("Faça login");setLoading(false);return}const r=await db.from("empresa_usuarios").select("empresa_id,papel").eq("usuario_id",a.data.user.id).limit(1).maybeSingle();if(!ok)return;if(r.error||!r.data){setErro("Empresa não identificada");setLoading(false);return}setEmpresa(r.data.empresa_id);setUsuario(a.data.user.id);setPapel(r.data.papel);void carregar(r.data.empresa_id,a.data.user.id,r.data.papel)})();return()=>{ok=false}},[carregar]);
 async function conferir(){if(!db||!turno||busy)return;const d=cents(dinheiro),p=cents(pix),c=cents(cartao);if(d===null||p===null||c===null){setErro("Informe valores válidos para dinheiro, PIX e cartão.");return}if(!window.confirm("Enviar a contagem para aprovação do supervisor?"))return;setBusy(true);setErro("");try{await caixaIndividual("enviar",{turno_id:turno.id,dinheiro:d/100,pix:p/100,cartao:c/100,justificativa:motivo.trim()||null});const recibo:Obj={titulo:"COMPROVANTE DE CONTAGEM",situacao:"AGUARDANDO APROVAÇÃO",numero:turno.numero,operador:"Funcionário do turno",linhas:[["Dinheiro informado",d/100],["PIX informado",p/100],["Cartão informado",c/100],["Total informado",(d+p+c)/100],["Observação",motivo.trim()||"Não informada"]]};setUltimaContagem(recibo);imprimirTermico(recibo)}catch(e){setBusy(false);setErro(e instanceof Error?e.message:"Falha ao enviar");return}setBusy(false);setAviso("Contagem enviada. Aguarde a conferência do supervisor.");void carregar(empresa,usuario,papel);}
 async function decidir(id:unknown,aprovar:boolean){
  if(!db||busy)return;
  const registro=pendentes.find(r=>String(r.id)===String(id));
  const revisao=pareceres[String(id)]||"";
  if(!revisao.trim()&&registro&&!registro.funcionario_id){setErro("Justificativa obrigatória para regularização de turno antigo.");return}
  if(!aprovar&&!revisao.trim()){setErro("Informe a justificativa para devolver a contagem.");return}
  if(!window.confirm(aprovar?"Aprovar este fechamento?":"Devolver para recontagem?"))return;
  setBusy(true);setErro("");
  try{
   await caixaIndividual(registro&&!registro.funcionario_id?"regularizar_legado":"decidir",{revisao_id:id,aprovar,parecer:revisao.trim()||null});
   if(aprovar&&registro){
    const comparativos=[
     {nome:"Dinheiro",esperado:Number(registro.dinheiro_esperado||0),contado:Number(registro.dinheiro||0)},
     {nome:"PIX",esperado:Number(registro.pix_esperado||0),contado:Number(registro.pix||0)},
     {nome:"Cartão",esperado:Number(registro.cartao_esperado||0),contado:Number(registro.cartao||0)}
    ];
    const totalEsperado=comparativos.reduce((a,c)=>a+c.esperado,0);
    const totalContado=comparativos.reduce((a,c)=>a+c.contado,0);
    const recibo:Obj={titulo:"FECHAMENTO DE CAIXA",situacao:"APROVADO",numero:registro.numero,operador:registro.operador_nome||"Não identificado",aprovador:"Administrador",comparativos,linhas:[["Total esperado",totalEsperado],["Total contado",totalContado],["Resultado",classificacao(totalContado-totalEsperado)],["Justificativa",revisao.trim()||"Não informada"]]};
    setUltimoComprovante(recibo);
    imprimirTermico(recibo);
   }
  }catch(e){setBusy(false);setErro(e instanceof Error?e.message:"Falha ao decidir");return}
  setBusy(false);setPareceres(v=>({...v,[String(id)]:""}));setAviso(aprovar?"Fechamento aprovado. Comprovante disponível para impressão.":"Contagem devolvida para recontagem.");void carregar(empresa,usuario,papel);
 }
 async function recontarLegado(r:Obj){
  if(busy)return;
  const id=String(r.id);const valores=recontagens[id]||{dinheiro:"",pix:"",cartao:""};
  const d=cents(valores.dinheiro),p=cents(valores.pix),c=cents(valores.cartao);
  const justificativa=(pareceres[id]||"").trim();
  if(d===null||p===null||c===null||!justificativa){setErro("Informe os três valores da recontagem e uma justificativa obrigatória.");return;}
  if(!window.confirm("Registrar nova contagem supervisionada deste turno antigo?"))return;
  setBusy(true);setErro("");
  try{await caixaIndividual("recontar_legado",{turno_id:r.caixa_turno_id,dinheiro:d/100,pix:p/100,cartao:c/100,justificativa});
   setAviso("Nova contagem legada enviada à supervisão.");setPareceres(v=>({...v,[id]:""}));void carregar(empresa,usuario,papel);
  }catch(e){setErro(e instanceof Error?e.message:"Falha na recontagem");}finally{setBusy(false);}
 }
 const resumo=(conf?.resumo||{}) as Obj;
 const px=Number(conf?.pix_esperado||0),cx=Number(conf?.cartao_esperado||0),dx=Number(resumo.saldo_esperado||0);
 const linhas: [string,unknown][]=[["Saldo inicial",resumo.saldo_inicial],["Vendas dinheiro (bruto)",resumo.vendas_dinheiro],["Troco",-Number(resumo.troco||0)],["PIX",resumo.vendas_pix],["Cartão",resumo.vendas_cartao],["Suprimentos",resumo.suprimentos],["Sangrias",-Number(resumo.sangrias||0)],["Entradas de trocas (dinheiro)",resumo.trocas_dinheiro],["Reembolsos (dinheiro)",-Number(resumo.reembolsos_dinheiro||0)],["Dinheiro esperado",dx],["Dinheiro contado",conf?.dinheiro_informado],["Diferença em dinheiro",Number(conf?.dinheiro_informado||0)-dx],["PIX esperado",px],["PIX informado",conf?.pix_informado],["Cartão esperado",cx],["Cartão informado",conf?.cartao_informado]];
  async function imprimirHistorico(h:Obj){
   if(!db||busy)return;
   setErro("");setBusy(true);
   try{
    // A API valida a sessao individual do administrador e recupera a contagem
    // aprovada pelo service_role, sem expor esta tabela diretamente ao navegador.
    const resultado=await caixaIndividual("comprovante_historico",{numero:h.numero}) as Obj;
    const r=resultado.contagem as Obj;
    const v=resultado.resumo as Obj;
    const t=resultado.turno as Obj;
    if(!r||!v||!t)throw new Error("Dados insuficientes para imprimir o fechamento.");
    const numero=(valor:unknown,nome:string)=>{
     if(valor===null||valor===undefined||valor==="")throw new Error(`Valor ausente: ${nome}`);
     const n=Number(valor);
     if(!Number.isFinite(n))throw new Error(`Valor inválido: ${nome}`);
     return n;
    };
    const dinheiroEsperado=numero(v.saldo_esperado,"dinheiro esperado");
    const pixEsperado=numero(v.vendas_pix,"vendas PIX")+numero(v.trocas_pix,"trocas PIX")-numero(v.reembolsos_pix,"reembolsos PIX");
    const cartaoEsperado=numero(v.vendas_cartao,"vendas cartão")+numero(v.trocas_cartao,"trocas cartão")-numero(v.reembolsos_cartao,"reembolsos cartão");
    const comparativos=[
     {nome:"Dinheiro",esperado:dinheiroEsperado,contado:numero(r.dinheiro,"dinheiro contado")},
     {nome:"PIX",esperado:pixEsperado,contado:numero(r.pix,"PIX contado")},
     {nome:"Cartão",esperado:cartaoEsperado,contado:numero(r.cartao,"cartão contado")}
    ];
    const totalEsperado=comparativos.reduce((a,c)=>a+c.esperado,0);
    const totalContado=comparativos.reduce((a,c)=>a+c.contado,0);
    const recibo:Obj={titulo:"FECHAMENTO DE CAIXA",situacao:"APROVADO · REIMPRESSÃO",numero:t.numero,
     operador:resultado.operador_nome||"Não identificado (turno antigo)",
     aprovador:resultado.aprovador_nome||"Administração",comparativos,
     linhas:[["Total esperado",totalEsperado],["Total contado",totalContado],
      ["Resultado",classificacao(totalContado-totalEsperado)],["Justificativa",r.parecer||"Não informada"]]};
    setUltimoComprovante(recibo);imprimirTermico(recibo);
   }catch(e){setErro(e instanceof Error?e.message:"Falha ao reimprimir o fechamento");}
   finally{setBusy(false)}
  }
 const imprimeAtual=()=>{if(!turno||!conf)return;imprimirTermico({numero:turno.numero,operador:usuario,linhas})};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==="F4"&&aba==="atual"&&fase==="resultado"){e.preventDefault();imprimeAtual()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)});
 const campo=(label:string,value:string,change:(s:string)=>void,id:string)=><label className="ev-contagem-campo" htmlFor={id}><span className="ev-contagem-rotulo">{label}</span><input id={id} className="ev-contagem-valor" type="text" value={value} onChange={e=>change(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0,00" disabled={busy}/></label>;
 const comparacao=(label:string,esperado:number,informado:number)=><tr><td>{label}</td><td>{real(esperado)}</td><td>{real(informado)}</td><td className={Math.abs(esperado-informado)<0.005?"ok":"dif"}>{classificacao(informado-esperado)}</td></tr>;
 return <main className={`caixa ${embutido?"caixa-embutido":""}`}>{!embutido&&<header><div><small>EVOLUX · GESTÃO FINANCEIRA</small><h1>Caixa — Abertura e Fechamento</h1></div><Link href="/dashboard">Voltar ao painel</Link></header>}<div className="conteudo"><nav><button onClick={()=>setAba("atual")} className={aba==="atual"?"ativo":""}>Fechar caixa</button><button onClick={()=>setAba("historico")} className={aba==="historico"?"ativo":""}>Histórico de fechamentos</button>{["administrador","supervisor"].includes(papel)&&<button onClick={()=>setAba("supervisao")} className={aba==="supervisao"?"ativo":""}>Conferência do supervisor ({pendentes.length})</button>}<button onClick={()=>void carregar(empresa,usuario,papel)} disabled={loading||!empresa}>Atualizar</button></nav>
 {erro&&<p role="alert" className="erro">{erro}</p>}{ultimaContagem&&<button className="sec" style={{marginBottom:12,marginRight:8}} onClick={()=>imprimirTermico(ultimaContagem)}>Reimprimir contagem enviada</button>}{ultimoComprovante&&<button className="sec" style={{marginBottom:12}} onClick={()=>imprimirTermico(ultimoComprovante)}>Imprimir último comprovante aprovado</button>}{aviso&&<p className="aviso">{aviso}</p>}{loading?<section>Carregando...</section>:aba==="supervisao"?<section><h2>Conferência do supervisor</h2>{pendentes.length===0?<p>Nenhuma contagem aguardando aprovação.</p>:pendentes.map(r=><div key={String(r.id)} className="revisao"><strong>Turno #{String(r.numero)} · Tentativa {String(r.tentativa)}</strong><p>Operador: {String(r.operador_nome||"Não identificado")} · Enviado: {dt(r.criado_em)}</p><div className="scroll"><table><thead><tr><th>Forma</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>{[["Dinheiro",r.dinheiro_esperado,r.dinheiro],["PIX",r.pix_esperado,r.pix],["Cartão",r.cartao_esperado,r.cartao]].map(([nome,esperado,contado])=><tr key={String(nome)}><td>{String(nome)}</td><td>{real(esperado)}</td><td>{real(contado)}</td><td className={Math.abs(Number(contado)-Number(esperado))<0.005?"ok":"dif"}>{classificacao(Number(contado)-Number(esperado))}</td></tr>)}</tbody></table></div><p>Justificativa do operador: {String(r.justificativa||"Não informada")}</p>{!r.funcionario_id&&<p className="legado-alerta" role="status"><strong>Turno anterior aos caixas individuais.</strong> A identidade do operador não foi registrada. A decisão será registrada como regularização supervisionada, com justificativa obrigatória, sem atribuir a autoria original. Os valores e a contagem permanecem preservados.</p>}<label>Parecer / justificativa<textarea rows={2} value={pareceres[String(r.id)]||""} onChange={e=>setPareceres(v=>({...v,[String(r.id)]:e.target.value}))}/></label>{r.legado_devolvido?<div className="recontagem-legado"><p><strong>Contagem devolvida:</strong> informe novamente os valores conferidos, sem liberar movimentações neste turno.</p><div className="ev-contagem-lista">{(["dinheiro","pix","cartao"] as const).map(tipo=><label key={tipo}>{tipo==="dinheiro"?"Dinheiro":tipo==="pix"?"PIX":"Cartão"} (R$)<input inputMode="decimal" placeholder="0,00" value={(recontagens[String(r.id)]||{dinheiro:"",pix:"",cartao:""})[tipo]} onChange={e=>setRecontagens(v=>({...v,[String(r.id)]:{...(v[String(r.id)]||{dinheiro:"",pix:"",cartao:""}),[tipo]:e.target.value}}))}/></label>)}</div><button disabled={busy} onClick={()=>void recontarLegado(r)}>Enviar nova contagem supervisionada</button></div>:<div className="acoes"><button disabled={busy} onClick={()=>void decidir(r.id,true)}>Aprovar fechamento</button><button className="sec" disabled={busy} onClick={()=>void decidir(r.id,false)}>Devolver para recontagem</button></div>}</div>)}</section>:aba==="historico"?<section><h2>Histórico de fechamentos</h2>{papel!=="administrador"?<p>Disponível para administradores.</p>:historico.length===0?<p>Nenhum fechamento registrado.</p>:<div className="scroll"><table><thead><tr><th>Turno</th><th>Abertura</th><th>Fechamento</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th>Resumo</th></tr></thead><tbody>{historico.map((h,i)=><tr key={i}><td>#{String(h.numero)}</td><td>{dt(h.aberto_em)}</td><td>{dt(h.fechado_em)}</td><td>{real(h.saldo_esperado)}</td><td>{real(h.saldo_informado)}</td><td>{classificacao(h.diferenca)}</td><td><button className="sec" onClick={()=>void imprimirHistorico(h)}>Imprimir 80 mm</button></td></tr>)}</tbody></table></div>}</section>:!turno?<section><h2>Nenhum turno aberto</h2><p>Abra o caixa pelo PDV antes de realizar o fechamento.</p></section>:fase==="contagem"&&status?.status!=="pendente"?<section className="modal"><div className="titulo"><small>ETAPA 1 DE 2 · CONFERÊNCIA ÀS CEGAS</small><h2>Contagem do turno nº {String(turno.numero)}</h2></div><div className="interior"><p>Informe os valores efetivamente encontrados. Os totais do sistema serão exibidos somente ao supervisor responsável pela conferência.</p><div className="ev-contagem-lista">{campo("Dinheiro contado na gaveta (R$)",dinheiro,setDinheiro,"ev-contagem-dinheiro")}{campo("Total dos comprovantes PIX (R$)",pix,setPix,"ev-contagem-pix")}{campo("Total dos comprovantes de cartão (R$)",cartao,setCartao,"ev-contagem-cartao")}</div><label>Observação da contagem (opcional)<textarea rows={2} value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength={1000}/></label><div className="ev-contagem-rodape"><button disabled={busy} onClick={()=>void conferir()}>{busy?"Registrando...":"Enviar para supervisão"}</button></div></div></section>:<section className="modal"><div className="titulo"><small>AGUARDANDO SUPERVISÃO</small><h2>Turno nº {String(turno.numero)}</h2></div><div className="interior"><p>A contagem foi enviada. Somente o supervisor pode conferir os valores do sistema e decidir sobre o fechamento.</p><p><strong>Situação:</strong> {String(status?.status||"Pendente")}</p><p>Atualize a tela para verificar a decisão. Em caso de devolução, será liberada uma nova contagem.</p></div></section>}

 </div><style jsx>{`.caixa{min-height:100vh;background:#f3f6fb;color:#193354;font-family:Arial,sans-serif}header{background:#122e56;color:white;padding:24px 34px;display:flex;align-items:center;justify-content:space-between;gap:15px}header small,.titulo small{letter-spacing:1.4px;font-size:11px;color:#b8d1f1}header h1{font-size:24px;margin:7px 0}header a{color:white}.conteudo{max-width:1050px;margin:0 auto;padding:26px 15px}nav{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}button{cursor:pointer;background:#174780;color:white;border:0;border-radius:8px;padding:12px 16px;font-weight:700}button:disabled{cursor:not-allowed;opacity:.55}.ativo{background:#0b2a53}.sec{background:#e9f0fa;color:#18477f}section{background:white;border:1px solid #dbe5f2;border-radius:14px;padding:22px;box-shadow:0 4px 18px #0c2d5009}.revisao{padding:18px;border:1px solid #dbe5f2;border-radius:12px;margin:12px 0}.revisao p{font-size:13px}section.modal{max-width:710px;margin:auto;padding:0;overflow:hidden}.titulo{background:#122e56;color:white;padding:22px 26px}.titulo h2{font-size:23px;margin:6px 0}.interior{padding:25px}.interior>p{color:#5e718b;font-size:14px;line-height:1.5}label{display:block;margin:18px 0;font-size:13px;font-weight:700}input,textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #c7d5e5;border-radius:8px;padding:13px;margin-top:7px;font:inherit;color:#193354}input:focus,textarea:focus{outline:2px solid #6ca3eb}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:right;padding:13px;border-bottom:1px solid #e5ecf5}th:first-child,td:first-child{text-align:left}th{background:#edf3fb}.ok{color:#147047;font-weight:700}.dif{color:#b42318;font-weight:700}.scroll{overflow-x:auto}.acoes{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.linha{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e7edf5;gap:12px}details{margin:20px 0}summary{cursor:pointer;font-weight:700}.legado-alerta{background:#fff5e6;border:1px solid #edcb92;border-radius:9px;padding:14px;color:#754c16!important;line-height:1.5}.erro,.aviso{padding:14px;border-radius:8px}.erro{background:#fff0f0;color:#a31d1d}.aviso{background:#edf8f1;color:#176b43}@media(max-width:600px){header{padding:18px;display:block}.interior{padding:17px}.titulo h2{font-size:19px}}@media print{nav,button,header a{display:none!important}} .caixa-embutido{min-height:0;background:transparent}.caixa-embutido .conteudo{padding:18px 22px 25px;max-width:none}.caixa-embutido nav{margin-bottom:16px}.caixa-embutido section{box-shadow:none}.caixa-embutido section.modal{max-width:760px}.caixa-embutido .interior{padding:20px}.caixa-embutido .titulo{padding:18px 22px}.caixa-embutido nav button{font-size:13px}@media(max-width:650px){.caixa-embutido .conteudo{padding:12px}.caixa-embutido nav button{padding:10px}}
`}</style><style jsx global>{`/* Campos da contagem: isolamento dos estilos globais do Dashboard */
.ev-contagem-lista{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:17px!important;margin:20px 0 22px!important;width:100%!important}
.ev-contagem-lista .ev-contagem-campo{display:flex!important;flex-direction:column!important;align-items:stretch!important;position:static!important;float:none!important;width:100%!important;min-width:0!important;margin:0!important;padding:0!important;gap:8px!important;font-size:13px!important;font-weight:700!important;line-height:1.4!important;color:#193354!important}
.ev-contagem-lista .ev-contagem-rotulo{display:block!important;width:100%!important;margin:0!important;padding:0!important;line-height:1.4!important;white-space:normal!important}
.ev-contagem-lista .ev-contagem-valor{display:block!important;position:static!important;float:none!important;width:100%!important;min-width:0!important;height:47px!important;min-height:47px!important;margin:0!important;padding:11px 14px!important;border:1px solid #b9cce3!important;border-radius:9px!important;box-sizing:border-box!important;background:#fff!important;color:#193354!important;font:600 17px Arial,sans-serif!important;line-height:24px!important;box-shadow:none!important}
.ev-contagem-lista .ev-contagem-valor:focus{outline:2px solid #357bd6!important;outline-offset:1px!important;border-color:#357bd6!important}
.ev-contagem-lista .ev-contagem-valor::placeholder{color:#8b9cb4!important;opacity:1!important}
.ev-contagem-rodape{display:flex!important;justify-content:flex-end!important;align-items:center!important;margin-top:12px!important}
.ev-contagem-rodape button{max-width:100%;min-height:45px!important}
@media(max-width:600px){.ev-contagem-rodape button{width:100%!important}}
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
`}</style></main>
}

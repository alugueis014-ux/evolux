"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type View = "login" | "register" | "forgot";
type PersonType = "PF" | "PJ";

const digits = (value: string) => value.replace(/\D/g, "");
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
function cpfOk(value: string) {
  const s = digits(value);
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  for (let n = 9; n < 11; n++) {
    const sum = [...s.slice(0, n)].reduce((a, x, i) => a + Number(x) * (n + 1 - i), 0);
    if (Number(s[n]) !== ((sum * 10) % 11) % 10) return false;
  }
  return true;
}
function cnpjOk(value: string) {
  const s = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 14 || !/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(.)\1+$/.test(s)) return false;
  const base = (c: string) => /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 48;
  const digit = (part: string, weights: number[]) => {
    const sum = [...part].reduce((acc, c, i) => acc + base(c) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const first = digit(s.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const second = digit(s.slice(0, 12) + first, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return s.endsWith(`${first}${second}`);
}
function maskCpf(value: string) {
  return digits(value).slice(0,11).replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
}
function maskCnpj(value: string) {
  const s = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,14);
  return s.replace(/^(\w{2})(\w)/,"$1.$2").replace(/^(\w{2})\.(\w{3})(\w)/,"$1.$2.$3").replace(/^(\w{2})\.(\w{3})\.(\w{3})(\w)/,"$1.$2.$3/$4").replace(/(\w{4})(\w{1,2})$/,"$1-$2");
}
function maskPhone(value: string) {
  const s = digits(value).slice(0,11);
  return s.replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{4,5})(\d{4})$/,"$1-$2");
}
function identify(value: string) {
  const v = value.trim();
  if (v.includes("@")) return "email";
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^\d{11}$/.test(s)) return "CPF";
  if (s.length === 14) return "CNPJ";
  return "desconhecido";
}
function Eye({ hidden }: { hidden: boolean }) {
  return hidden ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.3A11 11 0 0112 5c5 0 9 5 9 7a12 12 0 01-3 3.8M6 6.7C4.2 8 3 10.3 3 12c0 2 4 7 9 7a10 10 0 004.2-.9"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7S18 19 12 19s-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function PasswordField({label, value, onChange, placeholder, id}: {label:string; value:string; onChange:(v:string)=>void; placeholder:string; id:string}) {
  const [visible,setVisible] = useState(false);
  return <div className="field"><label htmlFor={id}>{label}</label><div className="password"><input id={id} type={visible ? "text":"password"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoComplete={id === "login-pass" ? "current-password" : "new-password"}/><button type="button" className="eye" onClick={()=>setVisible(!visible)} aria-label={visible?"Ocultar senha":"Mostrar senha"}><Eye hidden={!visible}/></button></div></div>;
}
export default function Home() {
  const [view,setView] = useState<View>("login");
  const [kind,setKind] = useState<PersonType>("PJ");
  const [identifier,setIdentifier] = useState("");
  const [password,setPassword] = useState("");
  const [name,setName] = useState("");
  const [doc,setDoc] = useState("");
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");
  const [newPassword,setNewPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [accepted,setAccepted] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [forgotId,setForgotId] = useState("");
  const changeView = (v:View) => {setView(v);setMessage("");};
  const nomeNormalizado = identifier.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '.');
  const loginType = /^[a-z][a-z0-9._-]{2,31}$/i.test(nomeNormalizado) ? "usuario" : identify(identifier);
  const onIdentifier = (value:string) => {
    if (value.includes("@") || /[a-z]/i.test(value)) {setIdentifier(value.slice(0,254));return;}
    const n = digits(value);
    setIdentifier(n.length > 11 ? maskCnpj(value) : n.length === 11 && digits(identifier).length > 11 ? maskCnpj(value) : n.length <= 11 ? maskCpf(value) : maskCnpj(value));
  };
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage("");
    if (!supabase) return setMessage("Conexão não configurada. Verifique as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local.");
    if (view === "login") {
      const valid = loginType === "usuario" || (loginType === "email" && emailOk(identifier)) || (loginType === "CPF" && cpfOk(identifier)) || (loginType === "CNPJ" && cnpjOk(identifier));
      if (!valid) return setMessage("Informe um nome de usuário ou e-mail válido.");
      if (!password) return setMessage("Informe sua senha.");
      if (loginType === "CPF" || loginType === "CNPJ") return setMessage("O acesso por CPF/CNPJ ainda não está disponível. Use nome de usuário ou e-mail.");
      setBusy(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: loginType === "usuario" ? `${nomeNormalizado}@usuarios.evolux.invalid` : identifier.trim(), password });
        if (error) return setMessage(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar: " + error.message);
        window.location.assign("/selecionar-usuario");
      } catch { setMessage("Falha de comunicação. Verifique a internet e tente novamente."); }
      finally { setBusy(false); }
      return;
    }
    if (view === "forgot") {
      if (!emailOk(forgotId)) return setMessage("Informe um e-mail válido para recuperação.");
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(forgotId.trim(), { redirectTo: window.location.origin });
        setMessage(error ? "Não foi possível solicitar a recuperação: " + error.message : "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação. A tela de definição da nova senha será implementada antes do uso definitivo.");
      } catch { setMessage("Falha de comunicação. Tente novamente."); }
      finally { setBusy(false); }
      return;
    }
    if (name.trim().length < 3) return setMessage("Informe o nome completo ou razão social.");
    if (!(kind === "PF" ? cpfOk(doc) : cnpjOk(doc))) return setMessage(`Informe um ${kind === "PF" ? "CPF" : "CNPJ"} válido.`);
    if (!emailOk(email)) return setMessage("Informe um e-mail válido.");
    if (digits(phone).length < 10 || digits(phone).length > 11) return setMessage("Informe um celular com DDD válido.");
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return setMessage("A senha deve ter ao menos 8 caracteres, incluindo letras e números.");
    if (newPassword !== confirm) return setMessage("As senhas não coincidem.");
    if (!accepted) return setMessage("É necessário aceitar os termos para continuar.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(), password: newPassword,
        options: { data: { nome: name.trim(), tipo_cadastro: kind, documento: kind === "PF" ? digits(doc) : doc.replace(/[^A-Z0-9]/gi, "").toUpperCase(), celular: digits(phone) } }
      });
      if (error) return setMessage("Não foi possível criar a conta: " + error.message);
      setMessage("Solicitação de cadastro recebida. Verifique seu e-mail para confirmar a conta, se a confirmação estiver habilitada no Supabase. O cadastro da empresa será implementado na próxima etapa.");
      setNewPassword(""); setConfirm("");
    } catch { setMessage("Falha de comunicação. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="shell"><section className="brand"><div className="brand-inner"><div className="logo"><img className="brand-logo-mark" src="/evolux-logo.svg" alt="" /><span>EVOLU<span className="logo-x">X</span></span></div><div className="brand-copy"><span className="eyebrow">GESTÃO EMPRESARIAL</span><h1>O próximo nível da sua gestão começa aqui.</h1><p>Organize suas operações, conecte sua equipe e tenha mais controle sobre seu negócio.</p><div className="brand-pills"><span>Gestão integrada</span><span>Multiempresa</span><span>Simples e inteligente</span></div></div><div className="brand-foot">EVOLUX • Sua gestão evolui aqui.</div></div></section><section className="auth"><div className="auth-card"><div className="mobile-logo"><img className="brand-logo-mark" src="/evolux-logo.svg" alt="" /><span>EVOLU<span className="logo-x">X</span></span></div><div className="topline"><span className="top-dot"/> AMBIENTE DE DESENVOLVIMENTO</div>{view === "login" ? <><h2>Bem-vindo de volta</h2><p className="subtitle">Entre com seus dados para acessar sua conta.</p><form onSubmit={submit} noValidate><div className="field"><label htmlFor="identifier">Nome de usuário ou e-mail</label><input id="identifier" value={identifier} onChange={e=>onIdentifier(e.target.value)} placeholder="Digite seu nome de usuário ou e-mail" autoComplete="username"/><span className="hint">{loginType === "desconhecido" ? "Identificação automática" : `Identificado como ${loginType}`}</span></div><PasswordField id="login-pass" label="Senha" value={password} onChange={setPassword} placeholder="Digite sua senha"/><div className="right"><button type="button" className="link" onClick={()=>changeView("forgot")}>Esqueceu sua senha?</button></div><button className="primary" disabled={busy}>{busy?"Verificando...":"Entrar"}</button></form><div className="bottom">Ainda não tem uma conta? <button className="link" onClick={()=>changeView("register")}>Criar uma conta</button></div></> : view === "register" ? <><button className="back" onClick={()=>changeView("login")}>← Voltar ao login</button><h2>Crie sua conta</h2><p className="subtitle">Comece a organizar seu negócio com a EVOLUX.</p><form onSubmit={submit} noValidate><div className="field"><label>Tipo de cadastro</label><div className="switch"><button type="button" className={kind === "PF" ? "active":""} onClick={()=>{setKind("PF");setDoc("");}}>Pessoa física</button><button type="button" className={kind === "PJ" ? "active":""} onClick={()=>{setKind("PJ");setDoc("");}}>Pessoa jurídica</button></div></div><div className="field"><label htmlFor="name">{kind === "PF" ? "Nome completo":"Razão social"}</label><input id="name" value={name} onChange={e=>setName(e.target.value)} placeholder={kind === "PF" ? "Seu nome completo":"Nome empresarial"} autoComplete="name"/></div><div className="field"><label htmlFor="doc">{kind === "PF" ? "CPF":"CNPJ"}</label><input id="doc" value={doc} onChange={e=>setDoc(kind === "PF" ? maskCpf(e.target.value):maskCnpj(e.target.value))} placeholder={kind === "PF" ? "000.000.000-00":"00.000.000/0000-00"} inputMode={kind === "PF" ? "numeric":"text"}/></div><div className="grid"><div className="field"><label htmlFor="email">E-mail</label><input id="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com" type="email" autoComplete="email"/></div><div className="field"><label htmlFor="phone">Celular com DDD</label><input id="phone" value={phone} onChange={e=>setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel"/></div></div><div className="grid"><PasswordField id="new-pass" label="Senha" value={newPassword} onChange={setNewPassword} placeholder="Crie uma senha"/><PasswordField id="confirm-pass" label="Confirmar senha" value={confirm} onChange={setConfirm} placeholder="Repita a senha"/></div><p className="hint">Mínimo de 8 caracteres, com letras e números.</p><label className="check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li e aceito os termos de uso e a política de privacidade (documentos a disponibilizar antes do lançamento).</span></label><button className="primary" disabled={busy}>{busy?"Cadastrando...":"Criar minha conta"}</button></form></> : <><button className="back" onClick={()=>changeView("login")}>← Voltar ao login</button><h2>Recuperar senha</h2><p className="subtitle">Informe seu e-mail para iniciar a recuperação de acesso.</p><form onSubmit={submit} noValidate><div className="field"><label htmlFor="forgot-email">E-mail cadastrado</label><input id="forgot-email" type="email" value={forgotId} onChange={e=>setForgotId(e.target.value)} placeholder="voce@empresa.com"/></div><button className="primary" disabled={busy}>{busy ? "Enviando..." : "Continuar"}</button></form></>}{message && <div role="alert" className="notice">{message}</div>}<p className="footnote">Versão beta local • Autenticação conectada ao Supabase • Não utilizar dados reais de clientes neste teste.</p></div></section><style jsx global>{`
.brand-logo-mark{display:block;width:52px;height:52px;object-fit:contain;flex-shrink:0}.logo-x{color:#24b7ff}.mobile-logo .brand-logo-mark{width:44px;height:44px}.mobile-logo .logo-x{color:#0872e9}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;color:#10234b}button,input{font:inherit}button{cursor:pointer}.shell{display:grid;grid-template-columns:48% 52%;min-height:100vh;background:#f7f9fd}.brand{background:linear-gradient(145deg,#06132f,#0b2454 58%,#12418b);color:#fff;padding:52px 8%;position:relative;overflow:hidden}.brand:before,.brand:after{content:"";position:absolute;border:1px solid #ffffff19;border-radius:50%;width:620px;height:620px;right:-340px;bottom:-220px}.brand:after{width:420px;height:420px;right:-220px;bottom:-120px}.brand-inner{height:100%;display:flex;flex-direction:column;position:relative;z-index:1}.logo,.mobile-logo{display:flex;align-items:center;gap:12px;font-size:26px;font-weight:900;letter-spacing:2px}.logo-icon{display:inline-grid;place-items:center;background:linear-gradient(135deg,#1683ff,#0755c8);width:44px;height:44px;border-radius:13px;color:#fff;font-size:27px;font-weight:900;transform:skew(-7deg)}.brand-copy{margin:auto 0;max-width:510px}.eyebrow{letter-spacing:3px;font-size:12px;color:#9ac8ff;font-weight:bold}.brand h1{font-size:clamp(35px,4vw,57px);line-height:1.12;letter-spacing:-1.8px;margin:23px 0}.brand p{color:#c6d7f0;line-height:1.8;font-size:17px}.brand-pills{display:flex;gap:9px;flex-wrap:wrap;margin-top:30px}.brand-pills span{border:1px solid #ffffff35;border-radius:99px;padding:9px 13px;font-size:12px}.brand-foot{color:#a5bad8;font-size:12px}.auth{display:flex;align-items:center;justify-content:center;padding:40px 24px;overflow:auto}.auth-card{width:100%;max-width:510px}.topline{font-size:11px;font-weight:800;letter-spacing:1px;color:#5276aa;display:flex;align-items:center;gap:8px}.top-dot{width:8px;height:8px;border-radius:50%;background:#2b76df}.auth h2{font-size:32px;letter-spacing:-1px;margin:18px 0 8px}.subtitle{color:#73819b;font-size:14px;margin:0 0 28px;line-height:1.5}.field{display:flex;flex-direction:column;gap:8px;margin-bottom:17px}.field label{font-size:13px;font-weight:700}.field input{width:100%;height:48px;border:1px solid #d9e2ef;border-radius:10px;background:#fff;padding:0 14px;outline:none;transition:border-color .2s,box-shadow .2s}.field input:focus{border-color:#2372e6;box-shadow:0 0 0 3px #2372e61b}.field input::placeholder{color:#9aa7b9}.hint{font-size:11px;color:#8190a6}.password{position:relative}.password input{padding-right:49px}.eye{position:absolute;right:8px;top:6px;height:36px;width:36px;border:0;background:transparent;color:#75859c;display:grid;place-items:center}.right{text-align:right;margin:-3px 0 23px}.link,.back{border:0;background:transparent;color:#1265d7;font-weight:700;font-size:13px;padding:0}.link:hover,.back:hover{text-decoration:underline}.primary{width:100%;background:#0b2454;color:#fff;border:0;border-radius:10px;padding:15px 20px;font-weight:800;transition:background .2s}.primary:hover{background:#17417f}.primary:disabled{opacity:.6;cursor:wait}.bottom{border-top:1px solid #e4eaf2;text-align:center;margin-top:27px;padding-top:23px;font-size:13px;color:#687992}.bottom .link{margin-left:5px}.back{margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.switch{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d9e2ef;border-radius:10px;padding:4px;background:#fff}.switch button{border:0;border-radius:7px;padding:10px 4px;background:transparent;color:#677b99;font-weight:700;font-size:12px}.switch button.active{background:#0b2454;color:#fff}.check{display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#62738e;line-height:1.5;margin:15px 0 20px}.check input{margin-top:3px;accent-color:#0b2454}.notice{margin-top:17px;padding:13px;border-radius:9px;background:#fff5e5;border:1px solid #f2d6a3;color:#77501a;font-size:13px;line-height:1.5}.footnote{margin-top:24px;font-size:11px;color:#97a4b6;text-align:center}.mobile-logo{display:none;margin-bottom:32px;color:#0b2454}@media(max-width:850px){.shell{grid-template-columns:1fr}.brand{display:none}.auth{min-height:100vh;padding:28px 18px}.mobile-logo{display:flex}.auth-card{max-width:530px}}@media(max-width:480px){.grid{grid-template-columns:1fr;gap:0}.auth h2{font-size:28px}.auth{align-items:flex-start}.auth-card{padding:14px 0}}
`}</style></main>;
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

export default function RedefinirSenha() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setMessage("Supabase não configurado."); setLoading(false); return; }
    const client = supabase;
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryLink = fragment.get("type") === "recovery" || params.get("type") === "recovery" || !!params.get("code") || !!params.get("token_hash");
    if (!recoveryLink) { setMessage("Abra esta página pelo link de recuperação enviado ao seu e-mail."); setLoading(false); return; }
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") { setReady(true); setLoading(false); setMessage(""); }
    });
    async function initialize() {
      try {
        const tokenHash = params.get("token_hash");
        if (tokenHash) {
          const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
        } else if (params.get("code")) {
          const { error } = await client.auth.exchangeCodeForSession(params.get("code")!);
          if (error) throw error;
        }
        // O cliente Supabase processa automaticamente os tokens no fragmento da URL.
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!active) return;
        if (data.session) { setReady(true); setMessage(""); }
        else setMessage("Link inválido ou expirado. Solicite uma nova recuperação na tela de login.");
      } catch {
        if (active) setMessage("Não foi possível validar o link. Solicite um novo e-mail de recuperação.");
      } finally { if (active) setLoading(false); }
    }
    void initialize();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    if (!ready || !supabase) return setMessage("Link de recuperação não validado.");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setMessage("A senha precisa de 8 caracteres ou mais, com letras e números.");
    if (password !== confirm) return setMessage("As senhas não coincidem.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setMessage("Não foi possível alterar a senha: " + error.message);
      setDone(true); setPassword(""); setConfirm("");
      await supabase.auth.signOut();
    } catch { setMessage("Falha de comunicação. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <main className="reset-shell"><section className="reset-card"><div className="reset-logo"><span className="reset-symbol">E</span> EVOLUX</div><p className="reset-tag">GESTÃO EMPRESARIAL</p><h1>{done ? "Senha alterada!" : "Criar nova senha"}</h1><p className="reset-description">{done ? "Sua senha foi atualizada. Entre novamente com a nova senha." : "Escolha uma nova senha para acessar sua conta com segurança."}</p>
    {loading ? <p role="status">Validando link de recuperação...</p> : done ? <a className="reset-button" href="/">Voltar ao login</a> : ready ? <form onSubmit={submit}>
      <label htmlFor="new-password">Nova senha</label><div className="reset-input"><input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Digite sua nova senha"/><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? "Ocultar" : "Mostrar"}</button></div>
      <label htmlFor="confirm-password">Confirmar nova senha</label><div className="reset-input"><input id="confirm-password" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita sua nova senha"/></div><p className="reset-hint">Mínimo de 8 caracteres, incluindo letras e números.</p><button className="reset-button" disabled={busy} type="submit">{busy ? "Salvando..." : "Salvar nova senha"}</button>
    </form> : <a href="/" className="reset-button">Solicitar novo link</a>}
    {message && <p role="alert" className="reset-alert">{message}</p>}
    <p className="reset-footer">EVOLUX • Sua gestão evolui aqui.</p>
  </section><style jsx global>{`*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif}.reset-shell{min-height:100vh;background:linear-gradient(135deg,#06132f,#0b2454 55%,#12418b);display:grid;place-items:center;padding:24px}.reset-card{width:100%;max-width:470px;background:#fff;border-radius:20px;padding:42px;box-shadow:0 20px 80px #0004;color:#10234b}.reset-logo{display:flex;align-items:center;gap:12px;font-size:25px;letter-spacing:2px;font-weight:900}.reset-symbol{display:grid;place-items:center;background:#0966d9;color:#fff;width:42px;height:42px;border-radius:12px}.reset-tag{font-size:11px;letter-spacing:2px;color:#5176a7;font-weight:bold;margin:18px 0 32px}.reset-card h1{font-size:29px;margin:0 0 10px}.reset-description{font-size:14px;color:#6e7e97;line-height:1.6;margin-bottom:26px}.reset-card label{display:block;font-size:13px;font-weight:bold;margin:18px 0 8px}.reset-input{display:flex;border:1px solid #d9e2ef;border-radius:10px;overflow:hidden}.reset-input:focus-within{border-color:#2372e6}.reset-input input{width:100%;min-width:0;border:0;padding:14px;outline:0}.reset-input button{border:0;background:#f1f5fa;color:#17417f;padding:0 12px;cursor:pointer}.reset-hint{font-size:12px;color:#75849a}.reset-button{display:block;width:100%;background:#0b2454;color:white;text-align:center;border:0;border-radius:10px;padding:15px;font-weight:bold;text-decoration:none;cursor:pointer;margin-top:24px}.reset-button:disabled{opacity:.6}.reset-alert{padding:13px;background:#fff5e5;color:#77501a;border-radius:8px;font-size:13px}.reset-footer{text-align:center;font-size:11px;color:#8a9ab0;margin-top:28px}@media(max-width:480px){.reset-card{padding:26px}}`}</style></main>;
}

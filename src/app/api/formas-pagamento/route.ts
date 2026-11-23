import { NextRequest, NextResponse, connection } from "next/server";
import { company } from "@/lib/funcionarios-server";
import { validarSessaoFuncionario } from "@/lib/sessao-funcionario";

const headers = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function autorizado(req: NextRequest) {
  const c = await company(req);
  if (!c) return null;
  const f = await validarSessaoFuncionario(req, c.user.id, c.admin);
  if (!f || f.papel !== "administrador") return null;
  return { admin: c.admin, empresaId: f.empresaId };
}
export async function GET(req: NextRequest) {
  await connection();
  try {
    const a = await autorizado(req);
    if (!a) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403, headers });
    const { data, error } = await a.admin.from("evolux_formas_pagamento_taxas")
      .select("id,forma,bandeira,parcelas,taxa_percentual,ativo")
      .eq("empresa_id", a.empresaId).order("forma").order("bandeira").order("parcelas");
    if (error) throw error;
    return NextResponse.json({ taxas: data || [] }, { headers });
  } catch (e) {
    console.error("Falha ao consultar taxas", e);
    return NextResponse.json({ error: "Falha ao consultar taxas. Execute o SQL de instalação antes de abrir o cadastro." }, { status: 500, headers });
  }
}
export async function PATCH(req: NextRequest) {
  await connection();
  try {
    const a = await autorizado(req);
    if (!a) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403, headers });
    const body = await req.json();
    if (!body || typeof body.id !== "string" || !uuid.test(body.id) || typeof body.ativo !== "boolean" ||
      typeof body.taxa_percentual !== "number" || !Number.isFinite(body.taxa_percentual) ||
      body.taxa_percentual < 0 || body.taxa_percentual > 100 || Math.round(body.taxa_percentual * 100) !== body.taxa_percentual * 100 && Math.abs(Math.round(body.taxa_percentual * 100) - body.taxa_percentual * 100) > 1e-7)
      return NextResponse.json({ error: "Dados inválidos. Informe uma taxa de 0 a 100%, com até duas casas decimais." }, { status: 400, headers });
    const { data, error } = await a.admin.from("evolux_formas_pagamento_taxas")
      .update({ taxa_percentual: body.taxa_percentual, ativo: body.ativo })
      .eq("id", body.id).eq("empresa_id", a.empresaId)
      .select("id,forma,bandeira,parcelas,taxa_percentual,ativo").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Configuração não encontrada." }, { status: 404, headers });
    return NextResponse.json({ taxa: data }, { headers });
  } catch (e) {
    console.error("Falha ao atualizar taxas", e);
    return NextResponse.json({ error: "Não foi possível salvar a configuração." }, { status: 500, headers });
  }
}

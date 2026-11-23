import { NextRequest, NextResponse, connection } from "next/server";
import { company } from "@/lib/funcionarios-server";
import { validarSessaoFuncionario } from "@/lib/sessao-funcionario";

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  // Esta rota depende dos headers de autenticação e não pode ser pré-renderizada.
  await connection();
  try {
    const c = await company(req);
    if (!c) return NextResponse.json({ error: "Sessão inválida." }, { status: 401, headers });
    const f = await validarSessaoFuncionario(req, c.user.id, c.admin);
    if (!f) return NextResponse.json({ error: "Sessão do funcionário inválida." }, { status: 401, headers });
    // Fase inicial: somente administrador; supervisor dependerá de autorização explícita.
    if (f.papel !== "administrador") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403, headers });
    const mes = new URL(req.url).searchParams.get("mes") || "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Mês inválido." }, { status: 400, headers });
    // Amplia um dia nas bordas para considerar fusos; filtra pelo mês de São Paulo no servidor.
    const inicio = new Date(`${mes}-01T00:00:00-03:00`);
    const [ano, mesNumero] = mes.split("-").map(Number);
    const fim = new Date(Date.UTC(ano, mesNumero, 2, 3, 0, 0));
    const { data: turnos, error: erroTurnos } = await c.admin.from("caixa_turnos")
      .select("id,numero,fechado_em")
      .eq("empresa_id", f.empresaId).eq("situacao", "fechado")
      .gte("fechado_em", new Date(inicio.getTime() - 86400000).toISOString())
      .lt("fechado_em", fim.toISOString());
    if (erroTurnos) throw erroTurnos;
    if (!turnos?.length) return NextResponse.json({ fechamentos: [] }, { headers });
    const ids = turnos.map(t => t.id);
    const todos: Record<string, unknown>[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await c.admin.from("caixa_fechamentos")
        .select("id,caixa_turno_id,vendas_dinheiro,vendas_pix,vendas_cartao,diferenca")
        .eq("empresa_id", f.empresaId).in("caixa_turno_id", ids.slice(i, i + 200));
      if (error) throw error;
      todos.push(...(data || []));
    }
    const mapa = new Map(turnos.map(t => [t.id, t]));
    const fechamentos = todos.flatMap(item => {
      const turno = mapa.get(String(item.caixa_turno_id));
      if (!turno?.fechado_em) return [];
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(turno.fechado_em));
      if (!dia.startsWith(`${mes}-`)) return [];
      return [{ ...item, turno_numero: turno.numero, fechado_em: turno.fechado_em }];
    });
    return NextResponse.json({ fechamentos }, { headers });
  } catch (error) {
    console.error("Financeiro: falha na consulta", error);
    return NextResponse.json({ error: "Não foi possível carregar o financeiro. Confira as permissões e tente novamente." }, { status: 500, headers });
  }
}

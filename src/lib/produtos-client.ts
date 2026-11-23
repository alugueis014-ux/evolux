import type { SupabaseClient } from '@supabase/supabase-js';

// O Supabase devolve no máximo 1000 linhas por requisição. Antes, o PDV usava
// .limit(1000), então produtos além do milésimo ficavam invisíveis na busca e
// no leitor de código de barras. Aqui carregamos todas as páginas.
const TAMANHO_PAGINA = 1000;
const LIMITE_DE_SEGURANCA = 50000; // evita laço infinito em caso de erro inesperado

export async function carregarProdutosAtivos(db: SupabaseClient, empresaId: string, campos: string) {
  const todos: unknown[] = [];
  for (let inicio = 0; inicio < LIMITE_DE_SEGURANCA; inicio += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from('produtos')
      .select(campos)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('descricao')
      .order('id') // desempate estável: sem isso a paginação pode repetir ou pular itens
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) return { data: null, error };
    const pagina = (data || []) as unknown[];
    todos.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return { data: todos, error: null };
}

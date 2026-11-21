-- EVOLUX | 01 - Cadastro de categorias de despesas
-- Executar uma única vez no SQL Editor do Supabase, após backup.
-- Não registra pagamentos, não altera saldos, vendas ou caixa.
BEGIN;

-- Permite supervisor sem modificar os papéis já atribuídos.
ALTER TABLE public.empresa_usuarios
  DROP CONSTRAINT IF EXISTS empresa_usuarios_papel_check;
ALTER TABLE public.empresa_usuarios
  ADD CONSTRAINT empresa_usuarios_papel_check
  CHECK (papel IN ('administrador', 'supervisor', 'funcionario'));

CREATE TABLE IF NOT EXISTS public.despesa_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 100),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Impede duplicação por empresa, ignorando maiúsculas e espaços externos.
CREATE UNIQUE INDEX IF NOT EXISTS despesa_categorias_empresa_nome_uq
  ON public.despesa_categorias (empresa_id, lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS despesa_categorias_empresa_ativo_idx
  ON public.despesa_categorias (empresa_id, ativo);

CREATE OR REPLACE FUNCTION public.evolux_despesa_categoria_atualizar_data()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS evolux_despesa_categoria_atualizar_data ON public.despesa_categorias;
CREATE TRIGGER evolux_despesa_categoria_atualizar_data
BEFORE UPDATE ON public.despesa_categorias
FOR EACH ROW EXECUTE FUNCTION public.evolux_despesa_categoria_atualizar_data();

-- Acesso limitado a administradores e supervisores da mesma empresa.
ALTER TABLE public.despesa_categorias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.despesa_categorias FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.despesa_categorias TO authenticated;

DROP POLICY IF EXISTS despesa_categorias_consultar ON public.despesa_categorias;
CREATE POLICY despesa_categorias_consultar ON public.despesa_categorias
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.empresa_usuarios eu
          WHERE eu.empresa_id = despesa_categorias.empresa_id
            AND eu.usuario_id = (SELECT auth.uid())
            AND eu.papel IN ('administrador', 'supervisor'))
);
DROP POLICY IF EXISTS despesa_categorias_inserir ON public.despesa_categorias;
CREATE POLICY despesa_categorias_inserir ON public.despesa_categorias
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.empresa_usuarios eu
          WHERE eu.empresa_id = despesa_categorias.empresa_id
            AND eu.usuario_id = (SELECT auth.uid())
            AND eu.papel IN ('administrador', 'supervisor'))
);
DROP POLICY IF EXISTS despesa_categorias_editar ON public.despesa_categorias;
CREATE POLICY despesa_categorias_editar ON public.despesa_categorias
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.empresa_usuarios eu
              WHERE eu.empresa_id = despesa_categorias.empresa_id
                AND eu.usuario_id = (SELECT auth.uid())
                AND eu.papel IN ('administrador', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.empresa_usuarios eu
                   WHERE eu.empresa_id = despesa_categorias.empresa_id
                     AND eu.usuario_id = (SELECT auth.uid())
                     AND eu.papel IN ('administrador', 'supervisor')));

-- Cada nova empresa recebe categorias iniciais independentes.
CREATE OR REPLACE FUNCTION public.evolux_criar_despesas_padrao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.despesa_categorias (empresa_id, nome)
  SELECT NEW.id, v.nome
  FROM (VALUES
    ('Aluguel'), ('Salários'), ('Encargos trabalhistas'), ('Energia elétrica'),
    ('Água'), ('Internet'), ('Telefone'), ('Sistema PDV'),
    ('Tarifas bancárias'), ('Taxas de cartão'), ('Contabilidade'),
    ('Material de escritório'), ('Material de limpeza'), ('Água mineral'),
    ('Manutenção e reparos'), ('Impostos'), ('Outras despesas')
  ) AS v(nome)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.evolux_criar_despesas_padrao() FROM PUBLIC;
DROP TRIGGER IF EXISTS evolux_criar_despesas_padrao ON public.empresas;
CREATE TRIGGER evolux_criar_despesas_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.evolux_criar_despesas_padrao();

-- Também popula as empresas que já existem, sem repetir categorias.
INSERT INTO public.despesa_categorias (empresa_id, nome)
SELECT e.id, v.nome FROM public.empresas e
CROSS JOIN (VALUES
  ('Aluguel'), ('Salários'), ('Encargos trabalhistas'), ('Energia elétrica'),
  ('Água'), ('Internet'), ('Telefone'), ('Sistema PDV'),
  ('Tarifas bancárias'), ('Taxas de cartão'), ('Contabilidade'),
  ('Material de escritório'), ('Material de limpeza'), ('Água mineral'),
  ('Manutenção e reparos'), ('Impostos'), ('Outras despesas')
) AS v(nome)
ON CONFLICT DO NOTHING;

COMMIT;

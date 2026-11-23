// Utilitários de dinheiro compartilhados entre cliente e servidor.
// Evita o erro clássico de ponto flutuante: 1.15*100 === 114.99999999999999.

/** true se o valor é finito e tem no máximo duas casas decimais (ex.: 1.15, 19.99, 10). */
export function temAteDuasCasas(valor: number): boolean {
  return Number.isFinite(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/** Converte reais em centavos inteiros, sem acumular erro de ponto flutuante. */
export function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

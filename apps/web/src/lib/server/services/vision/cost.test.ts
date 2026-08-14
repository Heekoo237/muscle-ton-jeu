import { describe, it, expect } from 'vitest';
import { readCostUsd, formatCostLine } from './cost';

describe('readCostUsd — tarif Haiku 4.5 (1 $/M entrée, 5 $/M sortie)', () => {
	it('entrée + sortie', () => {
		// 2000 entrée × 1$/M + 500 sortie × 5$/M = 0.0020 + 0.0025 = 0.0045
		expect(readCostUsd({ input_tokens: 2000, output_tokens: 500 })).toBeCloseTo(0.0045, 6);
	});
	it('compte la lecture de cache à 0,1×', () => {
		const c = readCostUsd({ input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 1000 });
		expect(c).toBeCloseTo(0.0045 + 0.0001, 6);
	});
	it('usage vide → coût nul', () => {
		expect(readCostUsd({})).toBe(0);
	});
});

describe('formatCostLine — ligne de log lisible', () => {
	it('mentionne le nombre de captures, les tokens et les deux devises', () => {
		const line = formatCostLine({ input_tokens: 2000, output_tokens: 500 }, 2);
		expect(line).toContain('2 capture(s)');
		expect(line).toContain('entrée 2000 tok');
		expect(line).toContain('sortie 500 tok');
		expect(line).toContain('$0.00450');
		expect(line).toContain('F CFA');
	});
});

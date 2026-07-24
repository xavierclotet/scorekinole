/**
 * Unit tests de analyticsDay.ts — helpers de fecha de la vista de día
 * de /admin/analytics/[date]. El día se delimita en hora LOCAL.
 */

import { describe, it, expect } from 'vitest';
import { todayLocalStr, isValidDayParam, localDayRange, shiftDay } from './analyticsDay';

describe('todayLocalStr', () => {
	it('formatea en YYYY-MM-DD con ceros a la izquierda', () => {
		expect(todayLocalStr(new Date(2026, 0, 5))).toBe('2026-01-05');
		expect(todayLocalStr(new Date(2026, 11, 31))).toBe('2026-12-31');
	});

	it('usa la fecha local, no la UTC', () => {
		// 23:30 local: toISOString() daría el día siguiente en tz al oeste de
		// Greenwich; el formateo local nunca depende de la tz
		const lateNight = new Date(2026, 6, 23, 23, 30);
		expect(todayLocalStr(lateNight)).toBe('2026-07-23');
	});
});

describe('isValidDayParam', () => {
	it('acepta fechas válidas en formato estricto', () => {
		expect(isValidDayParam('2026-07-23')).toBe(true);
		expect(isValidDayParam('2024-02-29')).toBe(true); // bisiesto
	});

	it('rechaza formatos incorrectos', () => {
		expect(isValidDayParam('2026-7-23')).toBe(false);
		expect(isValidDayParam('23-07-2026')).toBe(false);
		expect(isValidDayParam('2026/07/23')).toBe(false);
		expect(isValidDayParam('hoy')).toBe(false);
		expect(isValidDayParam('')).toBe(false);
	});

	it('rechaza fechas inexistentes aunque el formato sea correcto', () => {
		expect(isValidDayParam('2026-02-31')).toBe(false);
		expect(isValidDayParam('2026-13-01')).toBe(false);
		expect(isValidDayParam('2025-02-29')).toBe(false); // no bisiesto
	});
});

describe('localDayRange', () => {
	it('devuelve [medianoche local, medianoche siguiente)', () => {
		const { start, end } = localDayRange('2026-07-23');
		expect(start).toBe(new Date(2026, 6, 23).getTime());
		expect(end).toBe(new Date(2026, 6, 24).getTime());
	});

	it('cruza límites de mes y año correctamente', () => {
		expect(localDayRange('2026-01-31').end).toBe(new Date(2026, 1, 1).getTime());
		expect(localDayRange('2026-12-31').end).toBe(new Date(2027, 0, 1).getTime());
	});
});

describe('shiftDay', () => {
	it('suma y resta días', () => {
		expect(shiftDay('2026-07-23', 1)).toBe('2026-07-24');
		expect(shiftDay('2026-07-23', -1)).toBe('2026-07-22');
	});

	it('cruza límites de mes y año', () => {
		expect(shiftDay('2026-07-31', 1)).toBe('2026-08-01');
		expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
		expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
	});
});

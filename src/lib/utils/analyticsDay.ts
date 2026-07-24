/**
 * Helpers de fecha de la vista de día de /admin/analytics/[date].
 *
 * El día se delimita en hora LOCAL del admin (00:00–24:00): es lo intuitivo
 * al mirar "qué pasó el martes". Los agregados de /pageViewStats van por día
 * UTC, así que el total de esta vista puede diferir en las visitas nocturnas
 * respecto al punto equivalente de la gráfica histórica — aceptado en el spec.
 */

/** YYYY-MM-DD de hoy en hora local (toISOString daría el día UTC). */
export function todayLocalStr(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Valida el param [date]: formato estricto y fecha real (no '2026-02-31'). */
export function isValidDayParam(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** [inicio, fin) del día en ms epoch, en hora local. */
export function localDayRange(date: string): { start: number; end: number } {
	const [y, m, d] = date.split('-').map(Number);
	// El constructor de Date normaliza el desbordamiento de día/mes
	return {
		start: new Date(y, m - 1, d).getTime(),
		end: new Date(y, m - 1, d + 1).getTime()
	};
}

/** Día anterior/siguiente en formato param. */
export function shiftDay(date: string, delta: number): string {
	const [y, m, d] = date.split('-').map(Number);
	return todayLocalStr(new Date(y, m - 1, d + delta));
}

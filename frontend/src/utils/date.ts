function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString(): string {
  return toLocalDateStr(new Date());
}

export function getDateRange(period: 'today' | 'last7' | 'month' | 'all' | 'custom', customFrom?: string, customTo?: string): { from?: string; to?: string } {
  const now = new Date();
  const to = toLocalDateStr(now);

  if (period === 'today') {
    return { from: to, to };
  }

  if (period === 'last7') {
    const past = new Date();
    past.setDate(now.getDate() - 7);
    return { from: toLocalDateStr(past), to };
  }

  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toLocalDateStr(firstDay), to };
  }

  if (period === 'custom') {
    return { from: customFrom, to: customTo };
  }

  return {};
}

export function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return 'Histórico completo';
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

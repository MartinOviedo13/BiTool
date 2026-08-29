export function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

export function getDateRange(period: 'today' | 'last7' | 'month' | 'all' | 'custom', customFrom?: string, customTo?: string): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];

  if (period === 'today') {
    return { from: to, to };
  }

  if (period === 'last7') {
    const past = new Date();
    past.setDate(now.getDate() - 7);
    return { from: past.toISOString().split('T')[0], to };
  }

  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay.toISOString().split('T')[0], to };
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

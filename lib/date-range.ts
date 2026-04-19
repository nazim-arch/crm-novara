export type DashboardRange = "current_month" | "7d" | "30d" | "last_month" | "ytd" | "custom";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function getMonthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${y}-${m.toString().padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { start, end: `${y}-${m.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}` };
}

function getPrevMonthBounds(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const mm = pm.toString().padStart(2, "0");
  const lastDay = new Date(py, pm, 0).getDate();
  return {
    start: `${py}-${mm}-01`,
    end: `${py}-${mm}-${lastDay.toString().padStart(2, "0")}`,
    label: `${MONTH_NAMES[pm - 1]} ${py}`,
  };
}

export function resolveDateRange(
  range: DashboardRange,
  today: string,
  from?: string,
  to?: string,
): { start: string; end: string; label: string } {
  switch (range) {
    case "7d":
      return { start: subtractDays(today, 6), end: today, label: "Last 7 days" };
    case "30d":
      return { start: subtractDays(today, 29), end: today, label: "Last 30 days" };
    case "last_month":
      return getPrevMonthBounds(today);
    case "ytd":
      return { start: `${today.slice(0, 4)}-01-01`, end: today, label: `YTD ${today.slice(0, 4)}` };
    case "custom": {
      const s = from ?? today;
      const e = to ?? today;
      const sd = new Date(s + "T00:00:00");
      const ed = new Date(e + "T00:00:00");
      return {
        start: s,
        end: e,
        label: `${sd.getDate()} ${MONTH_NAMES[sd.getMonth()]} – ${ed.getDate()} ${MONTH_NAMES[ed.getMonth()]} ${ed.getFullYear()}`,
      };
    }
    default: {
      const { start, end } = getMonthBounds(today.slice(0, 7));
      const d = new Date(start + "T00:00:00");
      return { start, end, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
    }
  }
}

/** Returns array of {year, month} pairs (month=1-12) that overlap a date range */
export function monthsInRange(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const result: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

/** Label for a year+month number pair */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

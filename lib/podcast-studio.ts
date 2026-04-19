// Podcast Studio shared constants and utilities
export type { DashboardRange } from "./date-range";
export { resolveDateRange } from "./date-range";

export const STUDIO_OPEN = "10:00";   // 10:00 AM
export const STUDIO_CLOSE = "20:30";  // 8:30 PM (end time limit)
export const DAILY_CAPACITY_SLOTS = 21;

// All valid session start times (10:00 AM to 8:00 PM in 30-min increments)
export const STUDIO_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 10; h <= 20; h++) {
    const hh = h.toString().padStart(2, "0");
    if (h < 20) {
      slots.push(`${hh}:00`);
      slots.push(`${hh}:30`);
    } else {
      slots.push("20:00"); // last valid start (ends at 20:30)
    }
  }
  return slots;
})();

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

// Returns list of 30-min slot start times covered by a booking
export function getOccupiedSlots(startTime: string, durationMinutes: number): string[] {
  const slots: string[] = [];
  const startMins = timeToMinutes(startTime);
  for (let offset = 0; offset < durationMinutes; offset += 30) {
    const slotTime = minutesToTime(startMins + offset);
    if (STUDIO_SLOTS.includes(slotTime)) slots.push(slotTime);
  }
  return slots;
}

// Duration options in minutes (multiples of 30, max 630 = 10.5 hours)
export const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600, 630];

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

// Get week bounds (Mon-Sun) for a given date string "YYYY-MM-DD"
export function getWeekBounds(dateStr: string): { start: string; end: string } {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(date);
  mon.setDate(date.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end: sun.toISOString().slice(0, 10),
  };
}

// Generate array of dates "YYYY-MM-DD" from start to end inclusive
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Get first and last day of a month "YYYY-MM"
export function getMonthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${y}-${m.toString().padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${m.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;
  return { start, end };
}

// Today in IST as "YYYY-MM-DD"
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Subtract N days from a "YYYY-MM-DD" string
export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Get first and last day of the previous month
export function getPrevMonthBounds(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const mm = prevMonth.toString().padStart(2, "0");
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return {
    start: `${prevYear}-${mm}-01`,
    end: `${prevYear}-${mm}-${lastDay.toString().padStart(2, "0")}`,
    label: `${MONTH_NAMES[prevMonth - 1]} ${prevYear}`,
  };
}

export function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

export function getDayName(dateStr: string): string {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()];
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0; // Sunday only
}

// Count occupied slots from a list of bookings for a given date
export function countOccupiedSlots(
  bookings: { start_time: string; duration_minutes: number; status: string }[],
  date: string
): number {
  const occupied = new Set<string>();
  for (const b of bookings) {
    if (b.status === "Cancelled") continue;
    for (const slot of getOccupiedSlots(b.start_time, b.duration_minutes)) {
      occupied.add(slot);
    }
  }
  return occupied.size;
}

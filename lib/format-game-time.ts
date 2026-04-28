// Friendly formatter for game start times.
//
//   Tonight 7:30pm           — same calendar date, evening
//   Today 1:05pm             — same calendar date, daytime
//   Tomorrow 4:15pm          — next calendar date
//   Mon 10:00pm              — within 7 days
//   Apr 30, 7:00pm           — beyond a week
//   Started                  — already started (rare; usually filtered)
//   ""                       — invalid input

export function formatGameTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";

  const now = new Date();
  if (t.getTime() < now.getTime()) return "Started";

  const sameDay =
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    t.getFullYear() === tomorrow.getFullYear() &&
    t.getMonth() === tomorrow.getMonth() &&
    t.getDate() === tomorrow.getDate();

  const time = t.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).toLowerCase().replace(" ", "");

  if (sameDay) {
    const hour = t.getHours();
    const prefix = hour >= 17 ? "Tonight" : "Today";
    return `${prefix} ${time}`;
  }

  if (isTomorrow) return `Tomorrow ${time}`;

  const diffMs = t.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) {
    const day = t.toLocaleDateString("en-US", { weekday: "short" });
    return `${day} ${time}`;
  }

  const date = t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

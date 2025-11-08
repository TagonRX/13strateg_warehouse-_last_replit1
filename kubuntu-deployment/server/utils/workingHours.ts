/**
 * Рассчитывает количество рабочих часов (в минутах) между двумя датами
 * Рабочие часы: 8 часов в день, 5 дней в неделю (Пн-Пт)
 * @param startDate - Дата начала
 * @param endDate - Дата окончания
 * @returns Количество рабочих минут
 */
export function calculateWorkingMinutes(startDate: Date, endDate: Date): number {
  const WORKING_HOURS_PER_DAY = 8;
  const WORKING_MINUTES_PER_DAY = WORKING_HOURS_PER_DAY * 60;

  let current = new Date(startDate);
  const end = new Date(endDate);
  let totalMinutes = 0;

  // Если даты в одном дне
  if (isSameDay(current, end)) {
    // Проверяем, рабочий ли день
    if (isWorkingDay(current)) {
      const diff = end.getTime() - current.getTime();
      const minutes = Math.floor(diff / (1000 * 60));
      return Math.min(minutes, WORKING_MINUTES_PER_DAY);
    }
    return 0;
  }

  // Если даты в разных днях, считаем по дням
  while (current < end) {
    const nextDay = new Date(current);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    if (isWorkingDay(current)) {
      if (nextDay <= end) {
        // Полный рабочий день
        const remainingMinutesInDay = getRemainingMinutesInDay(current);
        totalMinutes += Math.min(remainingMinutesInDay, WORKING_MINUTES_PER_DAY);
      } else {
        // Последний день (частичный)
        const diff = end.getTime() - current.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        totalMinutes += Math.min(minutes, WORKING_MINUTES_PER_DAY);
      }
    }

    current = nextDay;
  }

  return totalMinutes;
}

/**
 * Проверяет, является ли день рабочим (Пн-Пт)
 */
function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Пн=1, Вт=2, Ср=3, Чт=4, Пт=5
}

/**
 * Проверяет, находятся ли две даты в одном дне
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Получает количество минут до конца дня от указанной даты
 */
function getRemainingMinutesInDay(date: Date): number {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  const diff = endOfDay.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60));
}

/**
 * Форматирует рабочие минуты в читаемый вид (например, "2ч 30м")
 */
export function formatWorkingMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}м`;
  }
  
  if (mins === 0) {
    return `${hours}ч`;
  }
  
  return `${hours}ч ${mins}м`;
}

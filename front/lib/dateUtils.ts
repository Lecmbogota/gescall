import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

export const DATE_FORMATS = {
    DATE: 'yyyy-MM-dd',
    TIME: 'HH:mm:ss',
    DATETIME: 'yyyy-MM-dd HH:mm:ss',
    READABLE: "dd MMM yyyy, HH:mm"
};

/**
 * Format any date object or ISO string strictly into the Global Timezone formatting.
 */
export function formatToGlobalTimezone(dateInput: Date | string, timezone: string, formatStr: string = DATE_FORMATS.DATETIME): string {
    if (!dateInput) return '';
    const dateObj = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(dateObj.getTime())) return '';

    return formatInTimeZone(dateObj, timezone, formatStr, { locale: es });
}

/**
 * Convert a Javascript Date exactly to the strict string format required by the PHP Backend/API endpoints 
 * using the global timezone offset. This avoids JS silently coercing midnight to 5 PM UTC, etc.
 */
export function formatForBackendAPI(dateInput: Date, timezone: string): string {
    return formatInTimeZone(dateInput, timezone, DATE_FORMATS.DATE);
}

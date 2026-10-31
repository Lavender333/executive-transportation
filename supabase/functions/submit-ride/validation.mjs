export const services = ['Airport transfer', 'Corporate travel', 'VIP / event', 'Point-to-point', 'Hourly chauffeur', 'Group coordination'];
export function validateRequest(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request.');
  const string = (key, min, max) => {
    if (typeof input[key] !== 'string') throw new Error(`Invalid ${key.replaceAll('_', ' ')}.`);
    const value = input[key].trim();
    if (value.length < min || value.length > max) throw new Error(`Invalid ${key.replaceAll('_', ' ')}.`);
    return value;
  };
  const id = string('id', 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid request reference.');
  const customer_name = string('customer_name', 1, 100);
  const email = string('email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const phone = string('phone', 7, 40);
  if (phone.replace(/\D/g, '').length < 7 || !/^[+\d\s().x-]+$/i.test(phone)) throw new Error('Enter a valid phone number.');
  const service = string('service', 1, 50);
  if (!services.includes(service)) throw new Error('Choose a valid service.');
  const pickup_date = string('pickup_date', 10, 10), pickup_time = string('pickup_time', 5, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickup_date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(pickup_time)) throw new Error('Choose a valid pickup date and time.');
  const calendar = new Date(pickup_date + 'T12:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== pickup_date) throw new Error('Choose a valid pickup date.');
  const pickup_timezone = string('pickup_timezone', 1, 100);
  let current;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: pickup_timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
    current = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch { throw new Error('Choose a valid pickup time zone.'); }
  if (`${pickup_date}T${pickup_time}` <= current) throw new Error('Choose a pickup time in the future.');
  if (calendar.getTime() > now.getTime() + 366 * 86400000) throw new Error('Choose a pickup date within the next year.');
  if (!Number.isInteger(input.passengers) || input.passengers < 1 || input.passengers > 30) throw new Error('Passengers must be a whole number from 1 to 30.');
  if (input.consent !== true) throw new Error('Please agree to be contacted about your request.');
  if (input.website) throw new Error('Unable to accept this request.');
  return { id, customer_name, email, phone, service, pickup_date, pickup_time, pickup_timezone, passengers: input.passengers, pickup: string('pickup', 1, 150), destination: string('destination', 1, 150), notes: string('notes', 0, 600) };
}

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const advanced = require('dayjs/plugin/advancedFormat');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advanced);

class DateTimeWrapper {
  constructor(d) {
    this.d = d;
  }
  static fromISO(str, opts = {}) {
    return new DateTimeWrapper(dayjs.tz(str, opts.zone));
  }
  static fromJSDate(date) {
    return new DateTimeWrapper(dayjs(date));
  }
  static fromObject(obj, opts = {}) {
    const { year, month, day, hour = 0, minute = 0, second = 0 } = obj;
    const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;
    return new DateTimeWrapper(dayjs.tz(iso, opts.zone));
  }
  static now() {
    return new DateTimeWrapper(dayjs());
  }
  setZone(zone) { return new DateTimeWrapper(this.d.tz(zone)); }
  startOf(unit) { return new DateTimeWrapper(this.d.startOf(unit)); }
  endOf(unit) { return new DateTimeWrapper(this.d.endOf(unit)); }
  plus(obj) {
    let d = this.d;
    if (obj.minutes) d = d.add(obj.minutes, 'minute');
    if (obj.hours) d = d.add(obj.hours, 'hour');
    if (obj.days) d = d.add(obj.days, 'day');
    return new DateTimeWrapper(d);
  }
  diff(other) { return { milliseconds: this.d.diff(other.d) }; }
  toISO() { return this.d.toISOString(); }
  toISODate() { return this.d.format('YYYY-MM-DD'); }
  toFormat(fmt) { return this.d.format(fmt); }
  set(obj) {
    let d = this.d;
    if (obj.year != null) d = d.set('year', obj.year);
    if (obj.month != null) d = d.set('month', obj.month);
    if (obj.day != null) d = d.set('date', obj.day);
    if (obj.hour != null) d = d.set('hour', obj.hour);
    if (obj.minute != null) d = d.set('minute', obj.minute);
    if (obj.second != null) d = d.set('second', obj.second);
    return new DateTimeWrapper(d);
  }
  hasSame(other, unit) { return this.d.isSame(other.d, unit); }
  setLocale() { return this; }
  toJSDate() { return this.d.toDate(); }
  get weekday() { const d = this.d.day(); return d === 0 ? 7 : d; }
  valueOf() { return this.d.valueOf(); }
  [Symbol.toPrimitive](hint) { return this.d.toDate()[Symbol.toPrimitive](hint); }
}

module.exports = { DateTime: DateTimeWrapper };

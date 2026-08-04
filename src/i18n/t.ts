import en from './en.json';
import de from './de.json';

export type Locale = 'en' | 'de';

const dicts = { en, de };

export const t = (locale: Locale) => dicts[locale] as typeof en;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const isValidEmail = (value: string) => {
  const email = normalizeEmail(value);
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return false;
  if (atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!local || !domain) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (/\s/.test(email)) return false;
  return true;
};

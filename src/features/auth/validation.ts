export const minimumPasswordLength = 8;

export function validateEmail(value: FormDataEntryValue | null) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return valid ? email : null;
}

export function validatePassword(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length < minimumPasswordLength) {
    return null;
  }

  return value;
}

export function validateName(value: FormDataEntryValue | null) {
  const name = typeof value === "string" ? value.trim() : "";

  return name.length > 0 && name.length <= 50 ? name : null;
}

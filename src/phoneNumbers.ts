export function normalizePhoneNumber(phoneNumber: string) {
  phoneNumber = phoneNumber.replace(/[^0-9\+]+/g, ""); // no non-numeric characters

  if (phoneNumber === "0") {
    return "";
  }

  // TODO: properly clean country code of phone numbers
  if (phoneNumber.startsWith("00")) {
    phoneNumber = phoneNumber.replace(/^00/, '+');
  }
  if (phoneNumber.startsWith("7")) {
    phoneNumber = "0" + phoneNumber;
  }
  if (phoneNumber.startsWith("44")) {
    phoneNumber = "+" + phoneNumber;
  }
  if (phoneNumber.startsWith("0")) {
    phoneNumber = phoneNumber.replace(/^0/, "+44");
  }
  return phoneNumber;
}

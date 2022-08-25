import { normalizePhoneNumber } from "./phoneNumbers.js";

describe("normalizePhoneNumber", () => {
  test("+44 UK number", () => {
    expect(normalizePhoneNumber("+44 77123 456 789")).toBe("+4477123456789");
  });

  test("number with hyphens", () => {
    expect(normalizePhoneNumber("+44-77123-456-789")).toBe("+4477123456789");
  });

  test("number with brackets", () => {
    expect(normalizePhoneNumber("(+44)77123456789")).toBe("+4477123456789");
  });

  test("07 UK number", () => {
    expect(normalizePhoneNumber("077123 456 789")).toBe("+4477123456789");
  });

  test("assume 7... is a UK number", () => {
    expect(normalizePhoneNumber("77123 456 789")).toBe("+4477123456789");
  });

  test("+1 US/Canada number", () => {
    expect(normalizePhoneNumber("+1 (123) 456 789")).toBe("+1123456789");
  });
});

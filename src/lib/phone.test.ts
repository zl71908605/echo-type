import { describe, expect, it } from 'vitest';
import { isValidPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('appends the country code to a bare national number', () => {
    expect(normalizePhone('13800138000')).toBe('+8613800138000');
  });

  it('strips the domestic trunk prefix', () => {
    expect(normalizePhone('013800138000')).toBe('+8613800138000');
  });

  it('keeps an already-prefixed country code instead of doubling it', () => {
    expect(normalizePhone('+8613800138000')).toBe('+8613800138000');
    expect(normalizePhone('8613800138000')).toBe('+8613800138000');
  });

  it('removes separators and whitespace', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizePhone('138-0013-8000')).toBe('+8613800138000');
    expect(normalizePhone('+86 138 0013 8000')).toBe('+8613800138000');
  });

  it('does not treat a leading 86 as a country code when it is part of an 11-digit number', () => {
    // `86138001380` 只有 11 位，说明 86 是号码本身的开头而不是国家码。
    expect(normalizePhone('86138001380')).toBe('+8686138001380');
  });
});

describe('isValidPhone', () => {
  it('accepts valid mainland numbers in any accepted input format', () => {
    expect(isValidPhone('13800138000')).toBe(true);
    expect(isValidPhone('+86 138 0013 8000')).toBe(true);
    expect(isValidPhone('013800138000')).toBe(true);
  });

  it('rejects numbers that are not 11 digits', () => {
    expect(isValidPhone('1380013800')).toBe(false);
    expect(isValidPhone('138001380000')).toBe(false);
  });

  it('rejects numbers with an unassigned second digit', () => {
    expect(isValidPhone('12800138000')).toBe(false);
    expect(isValidPhone('10800138000')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isValidPhone('')).toBe(false);
  });
});

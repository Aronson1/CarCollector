const kwToHp = 1.35962;

export function parsePowerHp(value?: string): number | undefined {
  if (!value) return undefined;

  const match = value.match(
    /(?:^|[\s(])(\d{2,4}(?:[,.]\d+)?)\s?(KM|kW|HP|PS)(?=[\s),]|$)/,
  );

  if (!match) {
    return undefined;
  }

  const rawPower = Number(match[1].replace(",", "."));

  if (!Number.isFinite(rawPower) || rawPower <= 0) {
    return undefined;
  }

  const unit = match[2].toLowerCase();
  const powerHp = unit === "kw" ? rawPower * kwToHp : rawPower;

  return Math.round(powerHp);
}

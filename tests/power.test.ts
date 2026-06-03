import assert from "node:assert/strict";
import test from "node:test";
import { parsePowerHp } from "../lib/power.ts";

test("parses horsepower from Polish car names", () => {
  assert.equal(parsePowerHp("1.5 T-GDI 160KM 7DCT M 5d"), 160);
  assert.equal(parsePowerHp("1.0 TSI Start&Stop 110 KM Style Auto 5d"), 110);
});

test("converts kilowatts to horsepower", () => {
  assert.equal(parsePowerHp("Combi 2.0 TDI SCR 147 kW Style DSG 5d"), 200);
  assert.equal(parsePowerHp("2.0 TDI SCR 110kW DSG Style 5d"), 150);
});

test("does not read battery capacity as engine power", () => {
  assert.equal(parsePowerHp("Mustang Mach-e 75kWh RWD 5d"), undefined);
});

test("does not read lowercase kilometer values as engine power", () => {
  assert.equal(parsePowerHp("e204KM 64kWh 455km L 5d"), undefined);
});

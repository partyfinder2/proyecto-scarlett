import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fetchWeekPlan, parseWeekPlanContent, WEEK_DAYS } from "./weekPlan";

const SAMPLE = WEEK_DAYS.map((day) => ({ day, idea: `Scene on ${day} in PV` }));

describe("weekPlan parse", () => {
  test("parse JSON válido de 7 días", () => {
    const r = parseWeekPlanContent(JSON.stringify(SAMPLE));
    assert.equal(r.ok, true);
    assert.equal(r.plan?.length, 7);
  });

  test("quita fences markdown", () => {
    const r = parseWeekPlanContent("```json\n" + JSON.stringify(SAMPLE) + "\n```");
    assert.equal(r.ok, true);
  });

  test("rechaza si no son 7 días", () => {
    const r = parseWeekPlanContent(JSON.stringify(SAMPLE.slice(0, 3)));
    assert.equal(r.ok, false);
  });

  test("rechaza día inválido", () => {
    const bad = SAMPLE.map((x, i) => (i === 0 ? { day: "Lunes", idea: "x" } : x));
    const r = parseWeekPlanContent(JSON.stringify(bad));
    assert.equal(r.ok, false);
  });

  test("rechaza JSON roto", () => {
    const r = parseWeekPlanContent("{ not json");
    assert.equal(r.ok, false);
  });
});

describe("fetchWeekPlan", () => {
  test("sin API key devuelve error claro", async () => {
    const r = await fetchWeekPlan("");
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /Ajustes/i);
  });
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const calc = require("./calc.js");
const example = require("./finance-data.example.json");

function job(model, id) {
  return model.jobs.find(function (j) { return j.id === id; });
}

test("plain finance data is not tracked, and the example file is fake", function () {
  const root = path.join(__dirname, "..");
  const tracked = execSync("git ls-files finance-data.json", { cwd: root, encoding: "utf8" });
  assert.equal(tracked.trim(), "");
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /finance-data\.json/);
  const schema = JSON.parse(fs.readFileSync(path.join(root, "finance-data.schema.json"), "utf8"));
  assert.ok(schema.required.indexOf("budgets") >= 0);
  const blob = JSON.stringify(example);
  ["oct-eunice", "Z Brothers", "Karma", "Sanjay", "Eunice", "Mrcela", "Glaze", "World Electric"].forEach(function (s) {
    assert.equal(blob.indexOf(s), -1, s);
  });
  assert.equal(example.budgets.jobs.length > 0, true);
});

test("null is not zero", function () {
  assert.equal(calc.money(null), "not entered");
  assert.equal(calc.money(0), "$0");
  assert.equal(calc.money(14500), "$14,500");
  assert.equal(calc.money(-50), "-$50");
  assert.equal(calc.pct(0.214285714), "21.4%");
  assert.equal(calc.margin(null, 10).reason, "missing");
  assert.equal(calc.margin(0, 10).reason, "zero");
  assert.equal(calc.displayRatio(calc.margin(0, 10)), "—");
  assert.equal(calc.displayRatio(calc.margin(null, 10)), "not entered");
  var partial = calc.divisionBudget({
    lines: [{ division: "electrical", phase: "rough-in", costType: "material", amount: 1500 }]
  }, "electrical");
  assert.equal(partial.complete, false);
  assert.equal(partial.amount, 1500);
  assert.equal(partial.entered, 1);
  assert.equal(partial.missing, 11);
  var zeros = { lines: [] };
  calc.PHASES.forEach(function (p) {
    calc.COST_TYPES.forEach(function (c) {
      zeros.lines.push({ division: "electrical", phase: p, costType: c, amount: 0 });
    });
  });
  var z = calc.divisionBudget(zeros, "electrical");
  assert.equal(z.complete, true);
  assert.equal(z.amount, 0);
  assert.equal(calc.variancePct(0, 100).reason, "zero");
  assert.equal(calc.margin(1000, 0).value, 1);
});

test("HVAC dollars are not added onto an electrical job", function () {
  var b = calc.divisionBudget({
    lines: [
      { division: "hvac", phase: "trim", costType: "material", amount: 999 },
      { division: "electrical", phase: "trim", costType: "labor", amount: 40 }
    ]
  }, "electrical");
  assert.equal(b.amount, 40);
  assert.equal(b.otherDivision.length, 1);
  assert.equal(b.otherDivision[0].division, "hvac");
});

test("invoice matching uses address and client, never the other trade", function () {
  var jobs = [
    { id: "e", division: "electrical", name: "Glaze Residence (Nok) — 50% electrical deposit", detail: "132 Balmy Coast Rd, Groveland · inv #3079" },
    { id: "h", division: "hvac", name: "Glaze Residence (Nok) — HVAC", detail: "132 Balmy Coast Rd, Groveland" },
    { id: "a", division: "electrical", name: "Twin A — 10 River Rd", detail: "10 River Rd" },
    { id: "b", division: "electrical", name: "Twin B — 10 River Rd", detail: "10 River Rd" }
  ];
  var glaze = { trade: "electrical", client: "Nok", jobAddress: "132 Balmy Coast Rd, Groveland FL", number: "3079", amount: 10 };
  var hit = calc.matchInvoices(jobs, [glaze])[0];
  assert.equal(hit.jobId, "e");
  assert.equal(hit.via, "both");
  var hvacOnly = Object.assign({}, glaze, { trade: "hvac" });
  assert.equal(calc.matchInvoices(jobs, [hvacOnly])[0].jobId, "h");
  var numberOnly = { trade: "electrical", client: "Nope", jobAddress: "", number: "3079", amount: 1 };
  assert.equal(calc.matchInvoices(jobs, [numberOnly])[0].jobId, null);
  var clientOnly = { trade: "electrical", client: "Nok", jobAddress: "", number: "", amount: 1 };
  assert.equal(calc.matchInvoices(jobs, [clientOnly])[0].jobId, "e");
  assert.equal(calc.matchInvoices(jobs, [clientOnly])[0].via, "client");
  var tie = calc.matchInvoices(jobs, [{ trade: "electrical", client: "", jobAddress: "10 River Rd", number: "1", amount: 5 }])[0];
  assert.equal(tie.jobId, null);
  assert.equal(tie.tied, true);
});

test("example file: margins, variances, and invoice sums", function () {
  var model = calc.prepare(example);
  assert.equal(model.floor, 0.25);
  var hvac = job(model, "ex-oak-hvac");
  var elec = job(model, "ex-oak-elec");
  var pine = job(model, "ex-pine");
  var elm = job(model, "ex-elm");
  var loose = job(model, "ex-unassigned");

  assert.equal(hvac.below, true);
  assert.equal(hvac.budget.amount, 22000);
  assert.equal(hvac.budget.complete, true);
  assert.equal(hvac.actual, 16800);
  assert.equal(hvac.variance.value, 5200);
  assert.equal(calc.pct(hvac.variancePct.value), "23.6%");
  assert.equal(calc.pct(hvac.projected.value), "21.4%");
  assert.equal(hvac.invoices.length, 1);
  assert.equal(hvac.invoiceSums.billed.amount, 15000);
  assert.equal(hvac.invoiceSums.paid.amount, 0);
  assert.equal(hvac.invoiceSums.outstanding.amount, 15000);
  assert.equal(hvac.invoiceSums.retainage.amount, 1500);
  assert.equal(hvac.totals.find(function (t) { return t.costType === "permit"; }).actual, null);
  assert.equal(hvac.groups[0].rows[0].actual, null);

  assert.equal(elec.below, false);
  assert.equal(elec.budget.amount, 30000);
  assert.equal(elec.variance.value, 15500);
  assert.equal(calc.pct(elec.variancePct.value), "51.7%");
  assert.equal(calc.displayRatio(elec.projected), "40.0%");
  assert.equal(elec.invoices.length, 2);
  assert.equal(elec.invoiceSums.billed.amount, 40000);
  assert.equal(elec.invoiceSums.paid.amount, 18000);
  assert.equal(elec.invoiceSums.outstanding.amount, 22000);
  assert.equal(elec.invoiceSums.retainage.amount, 2200);
  assert.ok(elec.invoices.every(function (m) { return m.invoice.trade === "electrical"; }));

  assert.equal(pine.invoices.length, 1);
  assert.equal(pine.invoices[0].via, "client");
  assert.equal(pine.budget.amount, 5000);
  assert.equal(pine.budget.byPhase.underground.other, 0);
  assert.equal(pine.variance.value, 1800);
  assert.equal(calc.displayRatio(pine.marginToDate), "not entered");
  assert.equal(calc.pct(pine.projected.value), "37.5%");

  assert.equal(elm.budget.complete, false);
  assert.equal(elm.budget.amount, 1500);
  assert.equal(elm.variance.reason, "missing");
  assert.match(elm.budgetText.note, /1 of 12/);
  assert.equal(elm.projected.reason, "missing");
  assert.equal(elm.below, false);

  assert.equal(loose.budget.amount, null);
  assert.equal(loose.actual, 100);
  assert.equal(calc.displayRatio(loose.marginToDate), "—");

  assert.equal(model.divisions.hvac.budget, 22000);
  assert.equal(model.divisions.hvac.below, 1);
  assert.equal(model.divisions.hvac.belowDivision, true);
  assert.equal(model.divisions.electrical.budget, 35000);
  assert.equal(model.divisions.electrical.variance, 17300);
  assert.equal(model.divisions.electrical.actual, 17800);
  assert.equal(model.unmatched.hvac.length, 1);
  assert.equal(model.unmatched.electrical.length, 0);
  assert.equal(model.jobs[0].id, "ex-oak-hvac");
});

test("published data URL ignores the example switch", function () {
  assert.equal(calc.dataUrl("sharmaelechvac.github.io", "?example=1"), "../finance-data.enc.json");
  assert.equal(calc.dataUrl("localhost", "?example=1"), "finance-data.example.json");
  assert.equal(calc.dataUrl("localhost", ""), "../finance-data.enc.json");
  assert.equal(calc.dataUrl("127.0.0.1", "?example=1"), "finance-data.example.json");
  assert.equal(calc.dataUrl("", "?example=1"), "../finance-data.enc.json");
  assert.equal(calc.dataUrl("SHARMAELECHVAC.GITHUB.IO", "?example=1"), "../finance-data.enc.json");
});

test("budget uses lock.js and labels itself Sharma Budget", function () {
  var lock = fs.readFileSync(path.join(__dirname, "../lock.js"), "utf8");
  var budgetAt = lock.indexOf('"/budget"');
  var arAt = lock.indexOf('"/sharma-ar"');
  assert.ok(budgetAt > 0 && budgetAt < arAt);
  assert.match(lock, /Sharma Budget/);
  assert.match(lock, /formspree\.io/);
  var app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(app, /SharmaLock\.load/);
  assert.match(app, /Sharma Budget/);
  assert.equal(app.includes("gate.js"), false);
  assert.equal(app.includes("finance-data.example.json"), false);
  assert.equal(fs.existsSync(path.join(__dirname, "../gate.js")), false);
});

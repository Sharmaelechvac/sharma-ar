/* Sharma Budget — pure math. No DOM. Null stays null; it is never coerced to 0. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SharmaCalc = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PHASES = ["underground", "rough-in", "trim"];
  var COST_TYPES = ["material", "labor", "permit", "other"];
  var DIVISIONS = ["electrical", "hvac"];
  var PHASE_LABEL = { underground: "Underground", "rough-in": "Rough-in", trim: "Trim" };
  var COST_LABEL = { material: "Material", labor: "Labor", permit: "Permit", other: "Other" };
  var DIV_LABEL = { electrical: "Electrical", hvac: "HVAC" };
  var STOP = {
    the: 1, and: 1, of: 1, at: 1, for: 1,
    st: 1, street: 1, rd: 1, road: 1, dr: 1, drive: 1, ct: 1, court: 1,
    ave: 1, avenue: 1, blvd: 1, boulevard: 1, ln: 1, lane: 1, way: 1, pl: 1, place: 1,
    fl: 1, florida: 1, unit: 1, lot: 1, house: 1, houses: 1, apt: 1, suite: 1,
    north: 1, south: 1, east: 1, west: 1
  };
  var LINES_PER_DIVISION = PHASES.length * COST_TYPES.length;

  function isNum(n) {
    return typeof n === "number" && isFinite(n);
  }

  function money(v) {
    if (!isNum(v)) return "not entered";
    var n = Math.round(v * 100) / 100;
    var cents = Math.abs(n % 1) > 0.004;
    return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: 2
    });
  }

  function pct(frac) {
    if (!isNum(frac)) return "not entered";
    var n = Math.round(frac * 1000) / 10;
    return (n < 0 ? "-" : "") + Math.abs(n).toFixed(1) + "%";
  }

  function margin(revenue, cost) {
    if (!isNum(revenue) || !isNum(cost)) return { value: null, reason: "missing" };
    if (revenue === 0) return { value: null, reason: "zero" };
    return { value: (revenue - cost) / revenue, reason: "ok" };
  }

  function displayRatio(r) {
    if (!r || r.reason === "missing") return "not entered";
    if (r.reason === "zero") return "—";
    return pct(r.value);
  }

  function variance(budget, actual) {
    if (!isNum(budget) || !isNum(actual)) return { value: null, reason: "missing" };
    return { value: budget - actual, reason: "ok" };
  }

  function variancePct(budget, actual) {
    if (!isNum(budget) || !isNum(actual)) return { value: null, reason: "missing" };
    if (budget === 0) return { value: null, reason: "zero" };
    return { value: (budget - actual) / budget, reason: "ok" };
  }

  function varianceWord(v) {
    if (!isNum(v)) return "";
    if (v > 0) return "Under budget";
    if (v < 0) return "Over budget";
    return "On budget";
  }

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clientPhrase(client) {
    return norm(client)
      .replace(/\b(llc|inc|incorporated|co|corp|company|ltd)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(s) {
    var n = norm(s);
    return n ? n.split(" ") : [];
  }

  function hasToken(hay, tok) {
    return (" " + hay + " ").indexOf(" " + tok + " ") >= 0;
  }

  function sigTokens(list) {
    return list.filter(function (t) {
      return t.length >= 3 && !STOP[t] && !/^\d+$/.test(t);
    });
  }

  function addressScore(inv, hay) {
    var addr = tokens(inv && inv.jobAddress);
    if (!addr.length) return 0;
    var num = null;
    var i;
    for (i = 0; i < addr.length; i++) {
      if (/^\d{1,6}$/.test(addr[i])) { num = addr[i]; break; }
    }
    var street = sigTokens(addr);
    if (num) {
      if (!hasToken(hay, num)) return 0;
      var hit = false;
      for (i = 0; i < street.length; i++) if (hasToken(hay, street[i])) hit = true;
      return hit ? 10 : 0;
    }
    var hits = 0;
    for (i = 0; i < street.length; i++) if (hasToken(hay, street[i])) hits++;
    return hits >= 2 ? 8 : 0;
  }

  function clientScore(inv, hay) {
    var phrase = clientPhrase(inv && inv.client);
    if (phrase.length < 3) return 0;
    return (" " + hay + " ").indexOf(" " + phrase + " ") >= 0 ? 3 : 0;
  }

  function numberBonus(inv, hay) {
    var num = norm(inv && inv.number);
    if (num.length < 2) return 0;
    return hasToken(hay, num) ? 1 : 0;
  }

  function divisionOf(job) {
    var d = String(job && job.division || "").toLowerCase();
    return d === "electrical" || d === "hvac" ? d : null;
  }

  function scoreInvoice(inv, job) {
    var div = divisionOf(job);
    var trade = String(inv && inv.trade || "").toLowerCase();
    if (!div || trade !== div) return null;
    var hay = norm((job.name || "") + " " + (job.detail || ""));
    var address = addressScore(inv, hay);
    var client = clientScore(inv, hay);
    var base = address + client;
    if (base <= 0) return null;
    return {
      score: base + numberBonus(inv, hay),
      via: address && client ? "both" : address ? "address" : "client"
    };
  }

  function matchInvoices(jobs, invoices) {
    var list = Array.isArray(invoices) ? invoices : [];
    var rows = Array.isArray(jobs) ? jobs : [];
    return list.map(function (inv) {
      var best = null;
      var bestScore = 0;
      var tie = false;
      rows.forEach(function (job) {
        var s = scoreInvoice(inv, job);
        if (!s) return;
        if (s.score > bestScore) {
          best = { job: job, via: s.via };
          bestScore = s.score;
          tie = false;
        } else if (s.score === bestScore) {
          tie = true;
        }
      });
      if (!best || tie) return { invoice: inv, jobId: null, via: null, tied: !!tie };
      return { invoice: inv, jobId: best.job.id, via: best.via, tied: false };
    });
  }

  function indexLines(budget) {
    var map = {};
    var dupes = [];
    var lines = budget && Array.isArray(budget.lines) ? budget.lines : [];
    lines.forEach(function (ln) {
      if (!ln) return;
      var key = String(ln.division || "") + "|" + String(ln.phase || "") + "|" + String(ln.costType || "");
      if (map[key]) dupes.push(key);
      else map[key] = ln;
    });
    return { map: map, dupes: dupes };
  }

  function lineAmount(indexed, division, phase, costType) {
    var ln = indexed.map[division + "|" + phase + "|" + costType];
    if (!ln || !isNum(ln.amount)) return null;
    return ln.amount;
  }

  function sumEntered(values) {
    var sum = 0;
    var entered = 0;
    var missing = 0;
    values.forEach(function (v) {
      if (isNum(v)) { sum += v; entered++; }
      else missing++;
    });
    return {
      amount: entered ? sum : null,
      complete: missing === 0 && entered === values.length && values.length > 0,
      entered: entered,
      missing: missing
    };
  }

  function divisionBudget(budget, division) {
    var indexed = indexLines(budget);
    var phaseAmounts = {};
    var typeAmounts = {};
    PHASES.forEach(function (p) { phaseAmounts[p] = {}; });
    COST_TYPES.forEach(function (c) { typeAmounts[c] = []; });
    var all = [];
    PHASES.forEach(function (p) {
      COST_TYPES.forEach(function (c) {
        var amt = lineAmount(indexed, division, p, c);
        phaseAmounts[p][c] = amt;
        typeAmounts[c].push(amt);
        all.push(amt);
      });
    });
    var total = sumEntered(all);
    var byType = {};
    COST_TYPES.forEach(function (c) { byType[c] = sumEntered(typeAmounts[c]); });
    var otherDivision = [];
    Object.keys(indexed.map).forEach(function (key) {
      var ln = indexed.map[key];
      if (ln.division && ln.division !== division && (ln.division === "electrical" || ln.division === "hvac")) {
        otherDivision.push({
          division: ln.division,
          phase: ln.phase,
          costType: ln.costType,
          amount: isNum(ln.amount) ? ln.amount : null
        });
      }
    });
    return {
      amount: total.amount,
      complete: total.complete,
      entered: total.entered,
      missing: total.missing,
      byPhase: phaseAmounts,
      byType: byType,
      dupes: indexed.dupes,
      otherDivision: otherDivision
    };
  }

  function actualForType(job, costType) {
    if (costType === "material") return isNum(job.material) ? job.material : null;
    if (costType === "labor") return isNum(job.labor) ? job.labor : null;
    if (costType === "permit") return null;
    if (costType === "other") return isNum(job.other) ? job.other : null;
    return null;
  }

  function costWarning(job) {
    if (!isNum(job.material) || !isNum(job.labor) || !isNum(job.other) || !isNum(job.totalCost)) return null;
    var sum = job.material + job.labor + job.other;
    if (Math.abs(sum - job.totalCost) > 0.009) return { sum: sum, total: job.totalCost };
    return null;
  }

  function sumKnown(objs, pick) {
    var sum = 0;
    var known = 0;
    var missing = 0;
    objs.forEach(function (o) {
      var v = pick(o);
      if (isNum(v)) { sum += v; known++; }
      else missing++;
    });
    return { amount: known ? sum : null, known: known, missing: missing };
  }

  function floorOf(pnl) {
    return pnl && isNum(pnl.marginFloor) ? pnl.marginFloor : 0.25;
  }

  function belowFloor(projected, floor) {
    return !!(projected && projected.reason === "ok" && isNum(projected.value) && projected.value < floor);
  }

  function invoiceSums(invs) {
    function pack(list, field) {
      if (!list.length) return { amount: 0, count: 0, missing: 0, empty: true };
      var nums = list.filter(function (i) { return isNum(i[field]); });
      if (!nums.length) return { amount: null, count: 0, missing: list.length, empty: false };
      var sum = 0;
      nums.forEach(function (i) { sum += i[field]; });
      return { amount: sum, count: nums.length, missing: list.length - nums.length, empty: false };
    }
    var paid = invs.filter(function (i) { return i.status === "paid"; });
    var open = invs.filter(function (i) { return i.status !== "paid"; });
    return {
      billed: pack(invs, "amount"),
      paid: pack(paid, "amount"),
      outstanding: pack(open, "amount"),
      retainage: pack(open, "retainage")
    };
  }

  function budgetCaption(b) {
    if (!b || b.amount == null) return { text: "not entered", note: "" };
    if (b.complete) return { text: money(b.amount), note: "" };
    return {
      text: money(b.amount),
      note: b.entered + " of " + LINES_PER_DIVISION + " lines entered"
    };
  }

  function buildJob(job, budget, matched, floor) {
    var div = divisionOf(job);
    var bud = div ? divisionBudget(budget, div) : divisionBudget(null, "electrical");
    var actual = isNum(job.totalCost) ? job.totalCost : null;
    var contract = budget && isNum(budget.contractPrice) ? budget.contractPrice : null;
    var housesBudget = budget && isNum(budget.houses) ? budget.houses : null;
    var useBudget = !!(div && bud.complete);
    var vari = useBudget ? variance(bud.amount, actual) : { value: null, reason: "missing" };
    var variPct = useBudget ? variancePct(bud.amount, actual) : { value: null, reason: "missing" };
    var projected = useBudget ? margin(contract, bud.amount) : { value: null, reason: "missing" };
    var toDate = margin(isNum(job.revenue) ? job.revenue : null, actual);
    var groups = [];
    if (div) {
      PHASES.forEach(function (p) {
        groups.push({
          phase: p,
          label: PHASE_LABEL[p],
          rows: COST_TYPES.map(function (c) {
            var amt = bud.byPhase[p][c];
            return {
              costType: c,
              label: COST_LABEL[c],
              budget: amt,
              actual: null,
              variance: { value: null, reason: "missing" }
            };
          })
        });
      });
    }
    var totals = COST_TYPES.map(function (c) {
      var b = div ? bud.byType[c] : { amount: null, complete: false, entered: 0, missing: LINES_PER_DIVISION };
      var act = div ? actualForType(job, c) : null;
      var ready = b.complete;
      return {
        costType: c,
        label: COST_LABEL[c],
        budget: b,
        actual: act,
        variance: ready ? variance(b.amount, act) : { value: null, reason: "missing" },
        note: c === "permit"
          ? "No permit actual in the finance file."
          : c === "other"
            ? "P&L other is permit and other together."
            : ""
      };
    });
    totals.push({
      costType: "total",
      label: "Total",
      budget: { amount: bud.amount, complete: bud.complete, entered: bud.entered, missing: bud.missing },
      actual: actual,
      variance: vari,
      note: ""
    });
    return {
      id: job.id != null ? String(job.id) : "",
      name: job.name || "Untitled job",
      detail: job.detail || "",
      note: job.note || "",
      flag: job.flag || "",
      division: div,
      divisionLabel: div ? DIV_LABEL[div] : "Division not set",
      housesJob: isNum(job.houses) ? job.houses : null,
      housesBudget: housesBudget,
      contractPrice: contract,
      revenue: isNum(job.revenue) ? job.revenue : null,
      budget: bud,
      budgetText: budgetCaption(bud),
      actual: actual,
      variance: vari,
      variancePct: variPct,
      varianceWord: varianceWord(vari.value),
      projected: projected,
      marginToDate: toDate,
      below: belowFloor(projected, floor),
      groups: groups,
      totals: totals,
      otherLines: bud.otherDivision,
      invoices: matched,
      invoiceSums: invoiceSums(matched.map(function (m) { return m.invoice; })),
      costWarning: costWarning(job),
      lineDupes: bud.dupes
    };
  }

  function indexBudgets(budgets) {
    var map = {};
    var dupes = [];
    var jobs = budgets && Array.isArray(budgets.jobs) ? budgets.jobs : [];
    jobs.forEach(function (b) {
      if (!b || b.jobId == null || b.jobId === "") return;
      var id = String(b.jobId);
      if (map[id]) dupes.push(id);
      else map[id] = b;
    });
    return { map: map, dupes: dupes, list: jobs };
  }

  function rollup(views, floor) {
    var complete = views.filter(function (v) { return v.budget.complete; });
    var withActual = views.filter(function (v) { return isNum(v.actual); });
    var both = views.filter(function (v) { return v.budget.complete && isNum(v.actual); });
    var priced = views.filter(function (v) { return v.budget.complete && isNum(v.contractPrice); });
    var dated = views.filter(function (v) { return isNum(v.revenue) && isNum(v.actual); });
    var budgetSum = sumKnown(complete, function (v) { return v.budget.amount; });
    var actualSum = sumKnown(withActual, function (v) { return v.actual; });
    var variSum = sumKnown(both, function (v) { return v.variance.value; });
    var contractSum = sumKnown(views, function (v) { return v.contractPrice; });
    var contractBoth = sumKnown(priced, function (v) { return v.contractPrice; });
    var budgetBoth = sumKnown(priced, function (v) { return v.budget.amount; });
    var revBoth = sumKnown(dated, function (v) { return v.revenue; });
    var costBoth = sumKnown(dated, function (v) { return v.actual; });
    var projected = margin(contractBoth.amount, budgetBoth.known ? budgetBoth.amount : null);
    if (!priced.length) projected = { value: null, reason: "missing" };
    return {
      jobs: views.length,
      budgetJobs: complete.length,
      partialJobs: views.filter(function (v) { return !v.budget.complete && v.budget.entered > 0; }).length,
      missingBudgetJobs: views.filter(function (v) { return v.budget.entered === 0; }).length,
      budget: budgetSum.known ? budgetSum.amount : null,
      actual: actualSum.amount,
      actualKnown: withActual.length,
      actualMissing: views.length - withActual.length,
      variance: both.length ? variSum.amount : null,
      varianceJobs: both.length,
      contract: contractSum.amount,
      contractKnown: contractSum.known,
      contractMissing: contractSum.missing,
      projected: projected,
      projectedJobs: priced.length,
      below: views.filter(function (v) { return v.below; }).length,
      belowDivision: belowFloor(projected, floor),
      houses: sumKnown(views, function (v) { return v.housesBudget; }),
      revenue: sumKnown(views, function (v) { return v.revenue; }),
      marginToDate: dated.length ? margin(revBoth.amount, costBoth.amount) : { value: null, reason: "missing" },
      marginJobs: dated.length
    };
  }

  var EXAMPLE_FILE = "finance-data.example.json";
  var LIVE_FILE = "../finance-data.enc.json";

  function isLocalHost(hostname) {
    var host = String(hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }

  function dataUrl(hostname, search) {
    var example = false;
    try { example = new URLSearchParams(String(search || "")).get("example") === "1"; }
    catch (e) { example = false; }
    if (isLocalHost(hostname) && example) return EXAMPLE_FILE;
    return LIVE_FILE;
  }

  function prepare(data) {
    data = data && typeof data === "object" ? data : {};
    var pnl = data.pnl && typeof data.pnl === "object" ? data.pnl : {};
    var floor = floorOf(pnl);
    var jobs = Array.isArray(pnl.jobs) ? pnl.jobs : [];
    var budgets = indexBudgets(data.budgets);
    var warnings = [];
    budgets.dupes.forEach(function (id) {
      warnings.push("More than one budget uses job id " + id + ". The first one is shown.");
    });
    var idCount = {};
    jobs.forEach(function (j) {
      if (!j || j.id == null || j.id === "") warnings.push("A P&L job has no id.");
      else {
        var id = String(j.id);
        idCount[id] = (idCount[id] || 0) + 1;
      }
    });
    Object.keys(idCount).forEach(function (id) {
      if (idCount[id] > 1) warnings.push("P&L job id " + id + " is used more than once.");
    });
    var known = {};
    jobs.forEach(function (j) { if (j && j.id != null) known[String(j.id)] = true; });
    Object.keys(budgets.map).forEach(function (id) {
      if (!known[id]) warnings.push("Budget job id " + id + " does not match a P&L job.");
    });

    var matches = matchInvoices(jobs.filter(function (j) { return j && divisionOf(j); }), data.invoices);
    var byJob = {};
    var unmatched = { electrical: [], hvac: [], other: [] };
    matches.forEach(function (m) {
      if (m.jobId) {
        (byJob[m.jobId] || (byJob[m.jobId] = [])).push(m);
      } else {
        var trade = String(m.invoice && m.invoice.trade || "").toLowerCase();
        var bucket = trade === "electrical" || trade === "hvac" ? trade : "other";
        unmatched[bucket].push(m);
      }
    });

    var views = jobs.map(function (job) {
      var id = job && job.id != null ? String(job.id) : "";
      return buildJob(job || {}, budgets.map[id] || null, byJob[id] || [], floor);
    });
    views.sort(function (a, b) {
      if (a.below !== b.below) return a.below ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    var divisions = {};
    DIVISIONS.forEach(function (d) {
      divisions[d] = rollup(views.filter(function (v) { return v.division === d; }), floor);
    });

    return {
      floor: floor,
      warnings: warnings,
      jobs: views,
      divisions: divisions,
      unmatched: unmatched,
      meta: data.meta && typeof data.meta === "object" ? data.meta : {}
    };
  }

  return {
    PHASES: PHASES,
    COST_TYPES: COST_TYPES,
    DIVISIONS: DIVISIONS,
    PHASE_LABEL: PHASE_LABEL,
    COST_LABEL: COST_LABEL,
    DIV_LABEL: DIV_LABEL,
    LINES_PER_DIVISION: LINES_PER_DIVISION,
    isNum: isNum,
    money: money,
    pct: pct,
    margin: margin,
    displayRatio: displayRatio,
    variance: variance,
    variancePct: variancePct,
    varianceWord: varianceWord,
    norm: norm,
    scoreInvoice: scoreInvoice,
    matchInvoices: matchInvoices,
    divisionBudget: divisionBudget,
    prepare: prepare,
    floorOf: floorOf,
    dataUrl: dataUrl,
    isLocalHost: isLocalHost,
    EXAMPLE_FILE: EXAMPLE_FILE,
    LIVE_FILE: LIVE_FILE
  };
});

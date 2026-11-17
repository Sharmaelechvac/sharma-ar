/* Sharma Budget — unlocks ../finance-data.enc.json with lock.js.
   The example file loads only on localhost with ?example=1. */
(function () {
  "use strict";
  var calc = window.SharmaCalc;
  var state = { screen: "jobs", division: "all", data: null, example: false, error: "" };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fig(text) {
    if (text === "not entered" || text === "not on file" || text === "—") return '<span class="word">' + text + "</span>";
    return '<span class="num">' + esc(text) + "</span>";
  }
  // Square feet line for a job view or a raw invoice: "not on file" when absent/null. Never invented.
  function sfTextOf(livingSF, underRoofSF) {
    return "Living SF: " + calc.sfText(livingSF) + " · Under Roof SF: " + calc.sfText(underRoofSF);
  }
  function sfLineView(view) { return sfTextOf(view.livingSF, view.underRoofSF); }
  function sfLineInv(inv) { return sfTextOf(inv && inv.livingSF, inv && inv.underRoofSF); }
  function moneyFig(n) { return fig(calc.money(n)); }
  function ratioFig(r) { return fig(calc.displayRatio(r)); }
  function parseDate(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }
  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function floorLabel(model) { return Math.round(model.floor * 100) + "%"; }
  var JOB_FLAG = { tbd: "Cost TBD", unassigned: "Unassigned", costOnly: "Cost only" };

  function budgetBits(b, ofN) {
    if (!b || b.amount == null) return { text: "not entered", note: "" };
    if (b.complete) return { text: calc.money(b.amount), note: "" };
    return { text: calc.money(b.amount), note: b.entered + " of " + ofN + " lines entered" };
  }
  function withNote(text, note) {
    return fig(text) + (note ? '<span class="hint">' + esc(note) + "</span>" : "");
  }
  function housesText(n) {
    if (!calc.isNum(n)) return "not entered";
    return n + (n === 1 ? " house" : " houses");
  }
  function metaLine(view) {
    var bits = [view.divisionLabel];
    if (view.housesJob != null) bits.push(housesText(view.housesJob));
    if (JOB_FLAG[view.flag]) bits.push(JOB_FLAG[view.flag]);
    return bits.join(" · ");
  }
  function variHtml(view) {
    if (view.variance.reason !== "ok") return ratioFig(view.variance);
    return fig(calc.money(view.variance.value)) + " · " + ratioFig(view.variancePct) +
      (view.varianceWord ? '<span class="hint">' + esc(view.varianceWord) + "</span>" : "");
  }
  function belowHtml(view, model) {
    if (!view.below) return "";
    return '<span class="below-flag">Below ' + esc(floorLabel(model)) + " floor</span>";
  }

  function readHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    if (h === "divisions") return { screen: "divisions", jobId: null };
    var m = /^job\/(.+)$/.exec(h);
    if (m) return { screen: "job", jobId: decodeURIComponent(m[1]) };
    return { screen: "jobs", jobId: null };
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function asOf(meta) {
    var asOf = meta && meta.asOf ? String(meta.asOf) : "";
    var d = parseDate(asOf);
    return "Data as of: <b>" + esc(asOf ? (d ? fmtDate(d) : asOf) : "not set") + "</b>" +
      (meta && meta.updatedBy ? " · Updated by " + esc(meta.updatedBy) : "");
  }

  function jobButton(view, model) {
    return '<button type="button" class="b-job' + (view.below ? " flagged" : "") + '" data-job="' + esc(view.id) + '">' +
      '<span class="b-top"><span class="b-name">' + esc(view.name) + '</span><span class="b-meta">' + esc(metaLine(view)) + '</span><span class="b-sf">' + esc(sfLineView(view)) + "</span></span>" +
      '<span class="b-stats">' +
        statSpan("Budget", withNote(view.budgetText.text, view.budgetText.note)) +
        statSpan("Actual cost", moneyFig(view.actual)) +
        statSpan("Variance", variHtml(view)) +
        statSpan("Projected margin", ratioFig(view.projected)) +
      "</span>" + belowHtml(view, model) + "</button>";
  }
  function stat(k, vHtml) {
    return '<div class="stat"><span class="b-k">' + esc(k) + '</span><span class="b-v">' + vHtml + "</span></div>";
  }
  function statSpan(k, vHtml) {
    return '<span class="stat"><span class="b-k">' + esc(k) + '</span><span class="b-v">' + vHtml + "</span></span>";
  }

  function chip(id, label, on) {
    return '<button type="button" class="chip' + (on ? " on" : "") + '" id="' + id + '" role="tab" aria-selected="' + (on ? "true" : "false") + '">' + label + "</button>";
  }
  function divBtn(id, label) {
    var on = state.division === id;
    return '<button type="button" class="chip' + (on ? " on" : "") + '" data-div="' + id + '" aria-pressed="' + (on ? "true" : "false") + '">' + label + "</button>";
  }
  function chipRow() {
    var jobsOn = state.screen !== "divisions";
    return '<div class="chips" role="tablist" aria-label="Jobs and divisions">' +
      chip("tab-jobs", "Jobs", jobsOn) +
      chip("tab-div", "Divisions", !jobsOn) +
      divBtn("all", "All") +
      divBtn("electrical", "Electrical") +
      divBtn("hvac", "HVAC") +
      "</div>";
  }
  function howToggle(text) {
    return '<details class="how"><summary>How this is figured</summary><p>' + esc(text) + "</p></details>";
  }

  function jobsHtml(model) {
    var shown = model.jobs.filter(function (j) {
      return state.division === "all" || j.division === state.division;
    });
    var how = howToggle("Projected margin = (contract price − budget) / contract price. Variance = budget − actual cost. Flagged under " + floorLabel(model) + ".");
    var warn = warningsHtml(model.warnings);
    if (!model.jobs.length) {
      return warn + chipRow() + '<p class="empty">No jobs in the finance file yet.</p>' + how;
    }
    var cards = shown.length
      ? shown.map(function (j) { return jobButton(j, model); }).join("")
      : '<p class="empty">No jobs in this division.</p>';
    var table = '<table class="sheet"><thead><tr><th class="mark"></th><th>Job</th><th>Division</th>' +
      '<th class="r">Budget</th><th class="r">Actual cost</th><th class="r">Variance</th><th class="r">Projected margin</th></tr></thead><tbody>' +
      shown.map(function (j) {
        return '<tr class="' + (j.below ? "flagged" : "") + '"><td class="mark"></td><td>' +
          '<button type="button" class="linkish" data-job="' + esc(j.id) + '">' + esc(j.name) + "</button>" +
          '<span class="hint">' + esc(metaLine(j)) + '</span><span class="hint">' + esc(sfLineView(j)) + "</span></td><td>" + esc(j.divisionLabel) + "</td>" +
          '<td class="r">' + withNote(j.budgetText.text, j.budgetText.note) + "</td>" +
          '<td class="r">' + moneyFig(j.actual) + "</td>" +
          '<td class="r">' + variHtml(j) + "</td>" +
          '<td class="r">' + ratioFig(j.projected) + belowHtml(j, model) + "</td></tr>";
      }).join("") + "</tbody></table>";
    return warn + chipRow() + '<div class="phone">' + cards + "</div>" + table + how;
  }

  function warningsHtml(list) {
    if (!list || !list.length) return "";
    return '<div class="warn"><b>Check the file</b><br>' + list.map(esc).join("<br>") + "</div>";
  }

  function cell(label, html, right) {
    return '<td data-label="' + esc(label) + '"' + (right ? ' class="r"' : "") + ">" + html + "</td>";
  }
  function linesTable(view) {
    var body = "";
    view.groups.forEach(function (g) {
      body += '<tr class="phase-h"><td colspan="4">' + esc(g.label) + "</td></tr>";
      g.rows.forEach(function (r) {
        body += "<tr>" +
          cell("Cost", esc(r.label)) +
          cell("Budget", moneyFig(r.budget), true) +
          cell("Actual", moneyFig(r.actual), true) +
          cell("Variance", ratioFig(r.variance), true) +
          "</tr>";
      });
    });
    body += '<tr class="phase-h"><td colspan="4">All phases</td></tr>';
    view.totals.forEach(function (t) {
      var ofN = t.costType === "total" ? calc.LINES_PER_DIVISION : 3;
      var bits = budgetBits(t.budget, ofN);
      var vari = t.variance.reason === "ok"
        ? fig(calc.money(t.variance.value)) + (calc.varianceWord(t.variance.value) ? '<span class="hint">' + esc(calc.varianceWord(t.variance.value)) + "</span>" : "")
        : ratioFig(t.variance);
      body += '<tr class="sum"><td data-label="Cost">' + esc(t.label) +
        (t.note ? '<span class="hint">' + esc(t.note) + "</span>" : "") + "</td>" +
        cell("Budget", withNote(bits.text, bits.note), true) +
        cell("Actual", moneyFig(t.actual), true) +
        cell("Variance", vari, true) + "</tr>";
    });
    return '<div class="lines-wrap"><table class="lines"><thead><tr><th>Cost</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">Variance</th></tr></thead><tbody>' +
      body + "</tbody></table></div>";
  }

  function matchLabel(via) {
    if (via === "both") return "Matched on address and client";
    if (via === "address") return "Matched on address";
    if (via === "client") return "Matched on client";
    return "Not matched";
  }
  function statusLabel(inv) {
    var status = String(inv.status || "").toLowerCase();
    if (status === "paid") return "Paid";
    if (status === "undelivered") return "Not delivered";
    if (status === "overdue") return "Overdue";
    var sent = parseDate(inv.dateSent);
    var terms = parseInt(inv.dueTerms, 10);
    if (!isFinite(terms) || terms < 0) terms = 0;
    var today = new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (status === "sent" && sent && t > sent.getTime() + terms * 86400000) return "Overdue";
    return "Sent";
  }
  function sumTile(label, pack, emptyText) {
    var value = pack.amount == null ? fig("not entered") : moneyFig(pack.amount);
    var sub = pack.empty ? emptyText : (pack.missing ? pack.missing + " amount not entered" : pack.count + (pack.count === 1 ? " invoice" : " invoices"));
    return '<div class="tile"><div class="t-label">' + esc(label) + '</div><div class="t-num">' + value + '</div><div class="t-sub">' + esc(sub) + "</div></div>";
  }

  function detailHtml(model, view) {
    if (!view) return '<p class="empty">That job is not in the finance file.</p><button type="button" class="btn back" id="back">Back to jobs</button>';
    var warns = [];
    if (!view.division) warns.push("This job has no electrical or HVAC division, so it is left out of both totals.");
    if (view.lineDupes.length) warns.push("A budget line is repeated. The first amount is used.");
    if (view.costWarning) warns.push("Stored total cost does not equal material + labor + other (" + calc.money(view.costWarning.sum) + " vs " + calc.money(view.costWarning.total) + ").");
    var other = "";
    if (view.otherLines.length) {
      other = '<section class="panel"><h2>Other trade on this budget</h2><p class="note">These lines are not added to the ' +
        esc(view.divisionLabel) + " total. A job with both trades is two jobs.</p>" +
        view.otherLines.map(function (ln) {
          return "<p>" + esc(calc.DIV_LABEL[ln.division] || ln.division) + " · " + esc(calc.PHASE_LABEL[ln.phase] || ln.phase) +
            " · " + esc(calc.COST_LABEL[ln.costType] || ln.costType) + " · " + moneyFig(ln.amount) + "</p>";
        }).join("") + "</section>";
    }
    var inv = view.invoices.map(function (m) {
      var row = m.invoice;
      return '<div class="inv"><div class="i-top"><span class="i-no">#' + esc(row.number || "—") + '</span><span class="i-amt">' +
        moneyFig(calc.isNum(row.amount) ? row.amount : null) + "</span></div>" +
        '<div class="i-addr">' + esc(row.client || "") + (row.jobAddress ? " · " + esc(row.jobAddress) : "") + "</div>" +
        '<div class="i-meta">' + esc(sfLineInv(row)) + "</div>" +
        '<div class="i-meta">' + esc(statusLabel(row)) + " · " + esc(matchLabel(m.via)) +
        (calc.isNum(row.retainage) && row.retainage > 0 ? " · Retainage " + esc(calc.money(row.retainage)) : "") + "</div></div>";
    }).join("");
    var sums = view.invoiceSums;
    return '<button type="button" class="btn back" id="back">Back to jobs</button>' +
      '<section class="panel' + (view.below ? " flagged div-block" : "") + '">' +
      "<h2 id=\"job-title\" tabindex=\"-1\">" + esc(view.name) + "</h2>" +
      '<p class="note">' + esc(view.detail || metaLine(view)) + "</p>" +
      (view.below ? belowHtml(view, model) : "") +
      (view.note ? "<p>" + esc(view.note) + "</p>" : "") +
      warningsHtml(warns) +
      '<div class="stat-list">' +
        stat("Contract price", moneyFig(view.contractPrice)) +
        stat("Budget", withNote(view.budgetText.text, view.budgetText.note)) +
        stat("Actual cost", moneyFig(view.actual)) +
        stat("Variance", variHtml(view)) +
        stat("Projected margin", ratioFig(view.projected)) +
        stat("Margin to date", ratioFig(view.marginToDate)) +
        stat("Houses on budget", fig(housesText(view.housesBudget))) +
        stat("Houses on job", fig(housesText(view.housesJob))) +
        stat("Living SF", fig(calc.sfText(view.livingSF))) +
        stat("Under Roof SF", fig(calc.sfText(view.underRoofSF))) +
        stat("Billed revenue", moneyFig(view.revenue)) +
      "</div></section>" +
      '<section class="panel"><h2>Budget and actual</h2>' +
      '<p class="note">Each phase actual is not entered — the finance file has no phase split. Material, labor, and other on the total rows are the P&amp;L job. Permit has no actual of its own. Variance = budget − actual.</p>' +
      linesTable(view) + "</section>" + other +
      '<section class="panel"><h2>Invoices</h2>' +
      '<p class="note">Same trade only. Then the street address or the client name on the job. A tie is left unmatched.</p>' +
      '<div class="tiles">' +
        sumTile("Billed", sums.billed, "No matched invoices") +
        sumTile("Paid", sums.paid, "No paid invoices") +
        sumTile("Outstanding", sums.outstanding, "No unpaid invoices") +
        sumTile("Retainage", sums.retainage, "No unpaid invoices") +
      "</div>" +
      (inv || '<p class="empty">No invoice matched this job.</p>') +
      "</section>";
  }

  function countNote(known, total, what) {
    return known + " of " + total + " " + what;
  }
  function divisionHtml(model) {
    var divs = calc.DIVISIONS.filter(function (d) {
      return state.division === "all" || state.division === d;
    });
    var blocks = divs.map(function (d) {
      var r = model.divisions[d];
      var budgetNote = countNote(r.budgetJobs, r.jobs, "jobs fully budgeted");
      if (r.partialJobs) budgetNote += ". " + r.partialJobs + " partial, not included";
      var actualNote = countNote(r.actualKnown, r.jobs, "jobs have a cost");
      var variNote = countNote(r.varianceJobs, r.jobs, "jobs have a full budget and a cost");
      var projNote = countNote(r.projectedJobs, r.jobs, "jobs have a contract and a full budget");
      var marginNote = countNote(r.marginJobs, r.jobs, "jobs have billed revenue and cost");
      return '<section class="panel div-block' + (r.belowDivision ? " flagged" : "") + '"><h2>' + esc(calc.DIV_LABEL[d]) + "</h2>" +
        (r.belowDivision ? '<p class="below-flag">Below ' + esc(floorLabel(model)) + " floor</p>" : "") +
        '<div class="stat-list">' +
          stat("Jobs", fig(String(r.jobs))) +
          stat("Budget", withNote(r.budget == null ? "not entered" : calc.money(r.budget), budgetNote)) +
          stat("Actual cost", withNote(r.actual == null ? "not entered" : calc.money(r.actual), actualNote)) +
          stat("Variance", withNote(r.variance == null ? "not entered" : calc.money(r.variance), variNote)) +
          stat("Contract price", withNote(r.contract == null ? "not entered" : calc.money(r.contract), countNote(r.contractKnown, r.jobs, "contracts entered"))) +
          stat("Projected margin", withNote(calc.displayRatio(r.projected), projNote)) +
          stat("Margin to date", withNote(calc.displayRatio(r.marginToDate), marginNote)) +
          stat("Below floor", fig(String(r.below))) +
          stat("Houses on budgets", withNote(r.houses.amount == null ? "not entered" : String(r.houses.amount), countNote(r.houses.known, r.jobs, "budgets have houses"))) +
        "</div></section>";
    }).join("");
    var looseKeys = (state.division === "all" ? calc.DIVISIONS.concat(["other"]) : [state.division]);
    var loose = looseKeys.map(function (d) {
      var rows = model.unmatched[d] || [];
      if (!rows.length) return "";
      var title = d === "other" ? "Unmatched, no trade" : "Unmatched " + calc.DIV_LABEL[d];
      return "<h2>" + esc(title) + "</h2>" + rows.map(function (m) {
        var row = m.invoice;
        return '<div class="inv"><div class="i-top"><span class="i-no">#' + esc(row.number || "—") + '</span><span class="i-amt">' +
          moneyFig(calc.isNum(row.amount) ? row.amount : null) + "</span></div>" +
          '<div class="i-addr">' + esc(row.client || "") + (row.jobAddress ? " · " + esc(row.jobAddress) : "") + "</div>" +
          '<div class="i-meta">' + esc(sfLineInv(row)) + "</div>" +
          '<div class="i-meta">' + (m.tied ? "Tied two jobs, left unmatched" : "No job matched") + "</div></div>";
      }).join("");
    }).join("");
    return warningsHtml(model.warnings) + chipRow() + blocks +
      (loose ? '<section class="panel"><h2>Invoices not on a job</h2><p class="note">Same trade, then address or client. Ties stay here so they are not counted twice.</p>' + loose + "</section>" : "") +
      howToggle("Electrical and HVAC are totaled apart. A partial budget is not added in as zero. Projected margin uses only jobs with a contract price and a full budget.");
  }

  function render() {
    if (state.error) {
      $("asof").textContent = state.example ? "Example data" : "Data as of: —";
      $("view").innerHTML = '<p class="warn">Could not load the finance file (' + esc(state.error) + ").</p>";
      return;
    }
    if (!state.data) {
      $("view").innerHTML = "";
      return;
    }
    var model = calc.prepare(state.data);
    $("asof").innerHTML = state.example ? "Example data" : asOf(model.meta);
    var route = readHash();
    state.screen = route.screen;
    if (route.screen === "divisions") $("view").innerHTML = divisionHtml(model);
    else if (route.screen === "job") $("view").innerHTML = detailHtml(model, model.jobs.filter(function (j) { return j.id === route.jobId; })[0]);
    else $("view").innerHTML = jobsHtml(model);
    var title = $("job-title");
    if (title) title.focus();
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
    if (!t || !t.closest) return;
    if (t.closest("#tab-jobs")) { go("#jobs"); return; }
    if (t.closest("#tab-div")) { go("#divisions"); return; }
    if (t.closest("#back")) { go("#jobs"); return; }
    var div = t.closest("[data-div]");
    if (div) { state.division = div.getAttribute("data-div"); render(); return; }
    var job = t.closest("[data-job]");
    if (job) go("#job/" + encodeURIComponent(job.getAttribute("data-job")));
  });
  window.addEventListener("hashchange", function () { if (state.data || state.error) render(); });

  function showData(d) {
    state.data = d;
    state.error = "";
    render();
  }
  function fail(err) {
    state.error = err && err.message ? err.message : "unknown error";
    render();
  }
  function bootExample() {
    state.example = true;
    fetch(calc.EXAMPLE_FILE + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(showData)
      .catch(fail);
  }
  function bootLive() {
    state.example = false;
    if (!window.SharmaLock) { fail(new Error("The lock did not load.")); return; }
    window.SharmaLock.load(calc.LIVE_FILE, { appName: "Sharma Finance", logo: "../assets/logo.png" })
      .then(showData)
      .catch(fail);
  }
  if (calc.isLocalHost(location.hostname) && calc.dataUrl(location.hostname, location.search) === calc.EXAMPLE_FILE) bootExample();
  else bootLive();
})();

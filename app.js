/* Sharma AR — reads ./finance-data.enc.json at load (encrypted; unlocked by lock.js). No numbers live in this file. */
(function () {
  "use strict";
  var DATA_URL = "finance-data.enc.json";
  var DAY = 86400000;
  var BUCKETS = [
    { key: "b0", label: "0–30", min: 0, max: 30 },
    { key: "b1", label: "31–60", min: 31, max: 60 },
    { key: "b2", label: "61–90", min: 61, max: 90 },
    { key: "b3", label: "90+", min: 91, max: Infinity }
  ];
  var STATUSES = ["sent", "paid", "overdue", "undelivered"];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, "")); return isFinite(n) ? n : 0; }
  function money(v) {
    var n = Math.round(num(v) * 100) / 100;
    var cents = Math.abs(n % 1) > 0.004;
    return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }
  // Square feet: optional livingSF / underRoofSF. Only a real number counts;
  // absent, null, or non-numeric stays null and renders as "not on file". Never invented.
  function sfVal(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") {
      var n = parseFloat(v.replace(/,/g, ""));
      return isFinite(n) ? n : null;
    }
    return null;
  }
  function fmtSF(v) {
    return v == null ? "not on file" : Math.round(v).toLocaleString("en-US");
  }
  // Local-calendar dates only (no UTC drift). Returns ms at local midnight or null.
  function parseDate(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d.getTime();
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function fmtDate(ms) {
    if (ms == null) return "—";
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  // Normalize one invoice; never throws on missing or odd fields.
  function normalize(raw, i, T) {
    raw = raw && typeof raw === "object" ? raw : {};
    var status = String(raw.status || "").toLowerCase().trim();
    if (STATUSES.indexOf(status) < 0) status = "sent";
    var sent = parseDate(raw.dateSent);
    var paid = parseDate(raw.datePaid);
    var terms = parseInt(raw.dueTerms, 10);
    if (!isFinite(terms) || terms < 0) terms = 0;
    var due = sent == null ? null : sent + terms * DAY;
    var age = sent == null ? 0 : Math.max(0, daysBetween(sent, T));
    var daysLate = due == null ? 0 : Math.max(0, daysBetween(due, T));
    var isPaid = status === "paid";
    var isUnd = status === "undelivered";
    var isOver = !isPaid && !isUnd && (status === "overdue" || (due != null && T > due));
    var trade = String(raw.trade || "").toLowerCase();
    return {
      id: raw.id != null ? String(raw.id) : "row-" + i,
      number: raw.number != null && raw.number !== "" ? String(raw.number) : "—",
      client: String(raw.client || "").trim() || "No client name",
      jobAddress: String(raw.jobAddress || "").trim(),
      trade: trade === "hvac" ? "HVAC" : trade === "electrical" ? "Electrical" : "",
      livingSF: sfVal(raw.livingSF),
      underRoofSF: sfVal(raw.underRoofSF),
      amount: num(raw.amount),
      retainage: num(raw.retainage),
      terms: terms, sent: sent, due: due, paid: paid,
      status: status, isPaid: isPaid, isUnd: isUnd, isOver: isOver,
      age: age, daysLate: daysLate,
      payDays: isPaid && sent != null && paid != null ? Math.max(0, daysBetween(sent, paid)) : null
    };
  }

  function flag(inv) {
    if (inv.isPaid) return '<span class="flag flag-paid">Paid ' + esc(fmtDate(inv.paid)) + "</span>";
    if (inv.isUnd) return '<span class="flag flag-und">Not delivered</span>';
    if (inv.isOver) {
      return inv.daysLate > 0
        ? '<span class="flag flag-over">Overdue — <span class="num">' + inv.daysLate + "</span> " + (inv.daysLate === 1 ? "day" : "days") + "</span>"
        : '<span class="flag flag-over">Overdue</span>';
    }
    var left = inv.due == null ? null : daysBetween(today(), inv.due);
    return '<span class="flag flag-open">' + (left == null ? "Open" : left === 0 ? "Due today" : "Due in " + plural(left, "day")) + "</span>";
  }

  function row(inv) {
    var meta = [];
    if (inv.trade) meta.push(esc(inv.trade));
    meta.push("Sent " + esc(fmtDate(inv.sent)));
    meta.push(inv.terms === 0 ? "Due on receipt" : "Net <span class=\"num\">" + inv.terms + "</span>");
    if (!inv.isPaid && inv.sent != null) meta.push("<span class=\"num\">" + inv.age + "</span> days out");
    if (inv.isPaid && inv.payDays != null) meta.push("Paid in <span class=\"num\">" + inv.payDays + "</span> days");
    if (inv.retainage > 0) meta.push("Retainage <span class=\"num\">" + money(inv.retainage) + "</span>");
    return '<div class="inv' + (inv.isOver ? " over" : "") + '">' +
      '<div class="i-top"><span class="i-no">' + (inv.number === "—" ? "No invoice #" : "#" + esc(inv.number)) + '</span><span class="i-amt">' + money(inv.amount) + "</span></div>" +
      (inv.jobAddress ? '<div class="i-addr">' + esc(inv.jobAddress) + "</div>" : "") +
      '<div class="i-sf">Living SF: <span class="num">' + esc(fmtSF(inv.livingSF)) + '</span> · Under Roof SF: <span class="num">' + esc(fmtSF(inv.underRoofSF)) + "</span></div>" +
      '<div class="i-meta">' + meta.join(" · ") + "</div>" + flag(inv) + "</div>";
  }

  var DATA = null;
  var VIEW = "total"; // "total" | "electrical" | "hvac" — separate ELEC & HVAC money, plus a Total tab (Sanjay, 2026-11-17)

  function render(data, loadError) {
    var T = today();
    var meta = data && data.meta && typeof data.meta === "object" ? data.meta : {};
    var list = data && Array.isArray(data.invoices) ? data.invoices : [];
    var invs = list.map(function (r, i) { return normalize(r, i, T); });
    // Trade filter for the active tab. Invoices with no trade stay on Total only.
    if (VIEW === "electrical") invs = invs.filter(function (x) { return x.trade === "Electrical"; });
    else if (VIEW === "hvac") invs = invs.filter(function (x) { return x.trade === "HVAC"; });
    document.querySelectorAll("#tabs .tab").forEach(function (b) {
      var on = b.getAttribute("data-view") === VIEW;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var open = invs.filter(function (x) { return !x.isPaid; });
    var paid = invs.filter(function (x) { return x.isPaid; });
    var over = open.filter(function (x) { return x.isOver; });
    var und = open.filter(function (x) { return x.isUnd; });
    var sum = function (a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x.amount); }, 0); };

    // Data as of
    var asOf = meta.asOf ? String(meta.asOf) : "";
    var asOfMs = parseDate(asOf);
    $("asof").innerHTML = loadError
      ? "Data as of: <b>—</b>"
      : "Data as of: <b>" + esc(asOf ? (asOfMs != null ? fmtDate(asOfMs) : asOf) : "not set") + "</b>" +
        (meta.updatedBy ? " · Updated by " + esc(meta.updatedBy) : "");

    // Tiles
    $("t-out").textContent = money(sum(open));
    $("t-out-sub").textContent = plural(open.length, "invoice");
    $("t-over").textContent = money(sum(over));
    $("t-over-sub").textContent = plural(over.length, "invoice");
    $("t-ret").textContent = money(sum(open, function (x) { return x.retainage; }));
    $("t-und").textContent = money(sum(und));
    $("t-und-sub").textContent = plural(und.length, "invoice");

    // Aging
    var total = sum(open);
    var tb = document.querySelector("#aging tbody");
    var bar = "";
    tb.innerHTML = BUCKETS.map(function (b) {
      var inB = open.filter(function (x) { return x.age >= b.min && x.age <= b.max; });
      var amt = sum(inB);
      if (total > 0 && amt > 0) bar += '<span class="' + b.key + '" style="width:' + (amt / total * 100).toFixed(2) + '%"></span>';
      return "<tr><td><span class=\"key " + b.key + "\"></span><span class=\"num\">" + b.label + "</span></td>" +
        '<td class="r num">' + inB.length + '</td><td class="r num">' + money(amt) + "</td></tr>";
    }).join("");
    $("aging-bar").innerHTML = bar;

    // Group by client (open invoices). Avg days to pay uses that client's paid history.
    var groups = {};
    invs.forEach(function (x) {
      var g = groups[x.client] || (groups[x.client] = { name: x.client, open: [], paid: [] });
      (x.isPaid ? g.paid : g.open).push(x);
    });
    var gl = Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.open.length; })
      .map(function (g) {
        g.owed = sum(g.open);
        g.overAmt = sum(g.open.filter(function (x) { return x.isOver; }));
        g.oldest = g.open.reduce(function (m, x) { return x.sent != null && x.age > m ? x.age : m; }, -1);
        var pd = g.paid.filter(function (x) { return x.payDays != null; });
        g.avgPay = pd.length ? Math.round(sum(pd, function (x) { return x.payDays; }) / pd.length) : null;
        g.open.sort(function (a, b) { return (b.isOver - a.isOver) || (b.age - a.age); });
        return g;
      })
      .sort(function (a, b) { return (b.overAmt - a.overAmt) || (b.owed - a.owed) || a.name.localeCompare(b.name); });

    document.querySelector(".tools").hidden = !gl.length || !!loadError;
    var host = $("clients");
    if (loadError) {
      host.innerHTML = '<p class="warn">Could not load the finance data (' + esc(loadError) + "). Numbers above show zero until the file loads.</p>";
    } else if (!invs.length) {
      host.innerHTML = '<p class="empty">No invoices entered yet.</p>';
    } else if (!gl.length) {
      host.innerHTML = '<p class="empty">No open invoices. Everything in the data file is marked paid.</p>';
    } else {
      host.innerHTML = gl.map(function (g, i) {
        var id = "c-" + i;
        var overTxt = g.overAmt > 0 ? " · <span class=\"num\">" + money(g.overAmt) + "</span> overdue" : "";
        return '<div class="client' + (g.overAmt > 0 ? " has-over" : "") + '">' +
          '<button type="button" class="c-head" aria-expanded="false" aria-controls="' + id + '">' +
            '<span><span class="c-name">' + esc(g.name) + '</span><span class="c-count">' + plural(g.open.length, "open invoice") + overTxt + "</span></span>" +
            '<span class="c-total">' + money(g.owed) + '</span><span class="chev" aria-hidden="true">+</span>' +
          "</button>" +
          '<div class="c-sum">' +
            '<div><span class="k">Owed</span><span class="v">' + money(g.owed) + "</span></div>" +
            '<div><span class="k">Oldest</span><span class="v">' + (g.oldest >= 0 ? g.oldest + " days" : "—") + "</span></div>" +
            '<div><span class="k">Avg to pay</span><span class="v">' + (g.avgPay != null ? g.avgPay + " days" : "—") + "</span></div>" +
          "</div>" +
          '<div class="c-body" id="' + id + '" hidden>' + g.open.map(row).join("") + "</div></div>";
      }).join("");
    }

    // Paid section (collapsed)
    var ph = $("paid");
    if (!paid.length) {
      ph.innerHTML = '<p class="empty">No paid invoices in the data file.</p>';
    } else {
      paid.sort(function (a, b) { return (b.paid || 0) - (a.paid || 0); });
      ph.innerHTML = '<div class="client"><button type="button" class="c-head" aria-expanded="false" aria-controls="paid-body">' +
        '<span><span class="c-name">Paid invoices</span><span class="c-count">' + plural(paid.length, "invoice") + "</span></span>" +
        '<span class="c-total">' + money(sum(paid)) + '</span><span class="chev" aria-hidden="true">+</span></button>' +
        '<div class="c-body" id="paid-body" hidden>' +
        paid.map(function (x) { return row(x).replace('<div class="i-top">', '<div class="i-client">' + esc(x.client) + '</div><div class="i-top">'); }).join("") +
        "</div></div>";
    }
  }

  function setOpen(btn, open) {
    var body = document.getElementById(btn.getAttribute("aria-controls"));
    if (!body) return;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var ch = btn.querySelector(".chev"); if (ch) ch.textContent = open ? "−" : "+";
  }
  document.addEventListener("click", function (e) {
    var tab = e.target.closest ? e.target.closest("#tabs .tab") : null;
    if (tab) {
      var v = tab.getAttribute("data-view");
      if (v && v !== VIEW) { VIEW = v; if (DATA) render(DATA, null); }
      return;
    }
    var btn = e.target.closest ? e.target.closest(".c-head") : null;
    if (btn) { setOpen(btn, btn.getAttribute("aria-expanded") !== "true"); return; }
    if (e.target.id === "expand-all" || e.target.id === "collapse-all") {
      var open = e.target.id === "expand-all";
      document.querySelectorAll("#clients .c-head").forEach(function (b) { setOpen(b, open); });
    }
  });

  render({}, null);
  window.SharmaLock.load(DATA_URL, { appName: "Accounts Receivable", logo: "assets/logo.png" })
    .then(function (d) { DATA = d; render(d, null); })
    .catch(function (err) { render({}, err && err.message ? err.message : "unknown error"); });
})();

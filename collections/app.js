/* Sharma Finance, Collections tab — reads ../finance-data.enc.json (unlocked by ../lock.js).
   Uses invoices[] (AR record) + the optional collections section (follow-ups, notes, contacts,
   crew links, payment log, We owe). No numbers live in this file. Nothing is guessed:
   a Collections amount that differs from AR is shown as a mismatch, never copied over. */
(function () {
  "use strict";
  var DATA_URL = "../finance-data.enc.json";
  var DAY = 86400000;
  var VIEW = "total", DATA = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, "")); return isFinite(n) ? n : 0; }
  function money(v) {
    if (v == null || v === "") return "not on file";
    var n = Math.round(num(v) * 100) / 100;
    var cents = Math.abs(n % 1) > 0.004;
    return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }
  function parseDate(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d.getTime();
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function fmtDate(ms) { return ms == null ? "—" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function key(client, number) { return norm(client) + "|" + String(number || "").trim().toLowerCase(); }
  function telHref(p) { var d = String(p || "").replace(/[^\d+]/g, ""); return d.length >= 7 ? "tel:" + d : ""; }
  function mailHref(e) { e = String(e || "").trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? "mailto:" + e : ""; }
  function safeUrl(u) { u = String(u || "").trim(); return /^https:\/\//i.test(u) ? u : ""; }

  function tradeOf(raw) { var t = String(raw.trade || "").toLowerCase(); return t === "hvac" ? "hvac" : t === "electrical" ? "electrical" : ""; }
  function inView(t) { return VIEW === "total" || t === VIEW; }

  function build(d) {
    var T = today();
    var col = d && typeof d.collections === "object" && d.collections ? d.collections : {};
    var cInv = Array.isArray(col.invoices) ? col.invoices : [];
    var crew = {};
    (Array.isArray(col.crewLinks) ? col.crewLinks : []).forEach(function (c) { if (c && c.client && safeUrl(c.url)) crew[norm(c.client)] = safeUrl(c.url); });

    var byId = {}, byKey = {}, byNum = {};
    var ar = (Array.isArray(d.invoices) ? d.invoices : []).map(function (raw, i) {
      raw = raw || {};
      var status = String(raw.status || "").toLowerCase();
      var sent = parseDate(raw.dateSent);
      var terms = parseInt(raw.dueTerms, 10); if (!isFinite(terms) || terms < 0) terms = 0;
      var due = sent == null ? null : sent + terms * DAY;
      var isPaid = status === "paid", isUnd = status === "undelivered";
      var isOver = !isPaid && !isUnd && (status === "overdue" || (due != null && T > due));
      var x = {
        id: raw.id != null ? String(raw.id) : "row-" + i, number: String(raw.number || "—"),
        client: String(raw.client || "").trim() || "No client name", jobAddress: String(raw.jobAddress || ""),
        trade: tradeOf(raw), amount: raw.amount, sent: sent, due: due, isPaid: isPaid, isUnd: isUnd, isOver: isOver,
        daysLate: due == null ? 0 : Math.max(0, Math.round((T - due) / DAY)), extra: null
      };
      byId[x.id] = x; byKey[key(x.client, x.number)] = x; (byNum[x.number] = byNum[x.number] || []).push(x);
      return x;
    });

    var only = [], mism = [];
    cInv.forEach(function (c) {
      if (!c) return;
      var m = (c.matchedInvoiceId && byId[c.matchedInvoiceId]) || byKey[key(c.client, c.number)] || null;
      if (!m) {
        var sameNum = byNum[String(c.number || "")] || [];
        only.push({ c: c, note: sameNum.length ? "Same number in AR under " + sameNum.map(function (s) { return s.client; }).join(", ") + " (different builder)" : "" });
        return;
      }
      m.extra = c;
      if (isNum(c.amount) && isNum(m.amount) && Math.abs(c.amount - m.amount) > 0.004) {
        mism.push({ inv: m, text: "Amount: AR " + money(m.amount) + " · Collections " + money(c.amount) });
      }
      var cs = String(c.status || "").toLowerCase();
      if (cs === "paid" && !m.isPaid) mism.push({ inv: m, text: "Collections says Paid; AR says not paid" });
      if (m.isPaid && (cs === "open" || cs === "partial")) mism.push({ inv: m, text: "AR says Paid; Collections says " + c.status });
    });

    ar.forEach(function (x) {
      var e = x.extra || {};
      x.followUp = parseDate(e.followUpDate);
      x.fuDue = !x.isPaid && x.followUp != null && x.followUp <= T;
      x.crew = safeUrl(e.crewLink) || crew[norm(x.client)] || "";
    });
    return { ar: ar, only: only, mism: mism, col: col, T: T };
  }

  function contactHtml(e, crewUrl) {
    e = e || {};
    var tel = telHref(e.contactPhone), mail = mailHref(e.contactEmail), b = [];
    if (tel) b.push('<a class="act primary" href="' + esc(tel) + '">Call ' + esc(e.contactPhone) + "</a>");
    if (mail) b.push('<a class="act" href="' + esc(mail) + '">Email</a>');
    if (crewUrl) b.push('<a class="act" href="' + esc(crewUrl) + '" target="_blank" rel="noopener">Crew app</a>');
    var out = b.length ? '<div class="acts">' + b.join("") + "</div>" : "";
    if (!tel && !mail) out += '<div class="nofile">Phone and email not on file</div>';
    return out;
  }
  function notesHtml(e) {
    e = e || {};
    var h = "";
    var n = Array.isArray(e.notes) ? e.notes.filter(function (x) { return x && x.body; }) : [];
    if (n.length) h += '<ul class="cnotes">' + n.map(function (x) {
      return "<li>" + (x.date ? '<span class="d">' + esc(fmtDate(parseDate(x.date))) + "</span>" : "") + esc(x.body) + "</li>";
    }).join("") + "</ul>";
    var p = Array.isArray(e.payments) ? e.payments.filter(function (x) { return x && isNum(x.amount); }) : [];
    if (p.length) h += '<div class="paylog">Payments logged: ' + p.map(function (x) {
      return '<span class="num">' + esc(money(x.amount)) + "</span> " + esc(fmtDate(parseDate(x.date))) + (x.note ? " (" + esc(x.note) + ")" : "");
    }).join(" · ") + "</div>";
    return h;
  }
  function flags(x, M) {
    var f = "";
    if (x.isOver) f += '<span class="flag flag-over">Overdue' + (x.daysLate > 0 ? ' — <span class="num">' + x.daysLate + "</span> " + (x.daysLate === 1 ? "day" : "days") : "") + "</span> ";
    if (x.fuDue) f += '<span class="flag flag-fu">Follow up ' + (x.followUp === M.T ? "today" : "since " + esc(fmtDate(x.followUp))) + "</span> ";
    else if (x.followUp != null && !x.isPaid) f += '<span class="flag flag-open">Follow up ' + esc(fmtDate(x.followUp)) + "</span> ";
    if (x.isUnd) f += '<span class="flag flag-und">Not delivered</span> ';
    if (!x.isOver && !x.isUnd && !x.fuDue && !x.isPaid) {
      var left = x.due == null ? null : Math.round((x.due - M.T) / DAY);
      f += '<span class="flag flag-open">' + (left == null ? "Open" : left <= 0 ? "Due today" : "Due in " + plural(left, "day")) + "</span> ";
    }
    if (M.mism.some(function (m) { return m.inv === x; })) f += '<span class="flag flag-mis">Mismatch</span>';
    return f;
  }
  function invRow(x, M) {
    var tr = x.trade === "hvac" ? "HVAC" : x.trade === "electrical" ? "Electrical" : "Trade not stated";
    return '<div class="inv' + (x.isOver || x.fuDue ? " over" : "") + '">' +
      '<div class="i-client">' + esc(x.client) + "</div>" +
      '<div class="i-top"><span class="i-no">#' + esc(x.number) + '</span><span class="i-amt">' + esc(money(x.amount)) + "</span></div>" +
      (x.jobAddress ? '<div class="i-addr">' + esc(x.jobAddress) + "</div>" : "") +
      '<div class="i-meta">' + tr + " · Sent " + esc(fmtDate(x.sent)) + (x.due != null ? " · Due " + esc(fmtDate(x.due)) : "") + "</div>" +
      "<div>" + flags(x, M) + "</div>" + contactHtml(x.extra, x.crew) + notesHtml(x.extra) + "</div>";
  }

  function render(d, err) {
    d = d || {};
    var M = build(d);
    var meta = d.meta || {};
    var asof = parseDate(meta.asOf), exp = parseDate(M.col.exportedAt);
    $("asof").innerHTML = err ? '<span class="warn" style="display:block">Could not load the data: ' + esc(err) + "</span>" :
      (DATA ? "Data as of <b>" + esc(fmtDate(asof)) + "</b>" + (exp != null ? " · Collections folded in <b>" + esc(fmtDate(exp)) + "</b>" : "") : "Loading…");
    document.querySelectorAll("#tabs .tab").forEach(function (b) {
      var on = b.getAttribute("data-view") === VIEW; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (!DATA) { ["fu", "open", "check", "owe"].forEach(function (id) { $(id).innerHTML = ""; }); $("fu-note").textContent = ""; return; }

    var unpaid = M.ar.filter(function (x) { return !x.isPaid && inView(x.trade); });
    var fu = unpaid.filter(function (x) { return x.isOver || x.fuDue; })
      .sort(function (a, b) { return (b.daysLate - a.daysLate) || (num(b.amount) - num(a.amount)); });
    var rest = unpaid.filter(function (x) { return fu.indexOf(x) < 0; });
    var fuSum = fu.reduce(function (s, x) { return s + num(x.amount); }, 0);
    $("fu-note").innerHTML = fu.length ? plural(fu.length, "invoice") + ' · <span class="num">' + esc(money(fuSum)) + "</span>. Oldest first." : "";
    $("fu").innerHTML = fu.length ? fu.map(function (x) { return invRow(x, M); }).join("") : '<p class="empty">Nothing to follow up today.</p>';
    $("open").innerHTML = rest.length ? rest.map(function (x) { return invRow(x, M); }).join("") : '<p class="empty">No other open invoices.</p>';

    // Check panel: Collections-only invoices + mismatches, shown as-is.
    var ch = "";
    if (!M.mism.length && !M.only.length) {
      ch = '<p class="okline">No mismatches. Every invoice in Collections matches AR' +
        (Array.isArray(M.col.invoices) && !M.col.invoices.length ? " (the Collections app had no invoices of its own when it was folded in)." : ".") + "</p>";
    }
    M.mism.forEach(function (m) {
      ch += '<div class="mis"><b>' + esc(m.inv.client) + " #" + esc(m.inv.number) + "</b><br>" + esc(m.text) + "</div>";
    });
    if (M.only.length) {
      ch += '<p class="note" style="margin-top:6px">Only in Collections — shown as Collections had them. Not in AR totals.</p>';
      M.only.forEach(function (o) {
        var c = o.c;
        ch += '<div class="inv over"><div class="i-client">' + esc(c.client) + '</div><div class="i-top"><span class="i-no">#' + esc(c.number) +
          '</span><span class="i-amt">' + esc(money(c.amount)) + "</span></div>" +
          (c.jobAddress ? '<div class="i-addr">' + esc(c.jobAddress) + "</div>" : "") +
          '<div class="i-meta">' + esc(c.status || "") + (c.invoiceDate ? " · Invoice " + esc(fmtDate(parseDate(c.invoiceDate))) : "") + (c.dueDate ? " · Due " + esc(fmtDate(parseDate(c.dueDate))) : "") + "</div>" +
          (o.note ? '<div class="i-meta">' + esc(o.note) + "</div>" : "") +
          contactHtml(c, safeUrl(c.crewLink)) + notesHtml(c) + "</div>";
      });
    }
    $("check").innerHTML = ch;

    var owe = Array.isArray(M.col.weOwe) ? M.col.weOwe.filter(Boolean) : [];
    if (!owe.length) { $("owe").innerHTML = '<p class="empty">Nothing on the We owe list.</p>'; }
    else {
      var tot = owe.reduce(function (s, v) { return s + (isNum(v.amount) ? v.amount : 0); }, 0);
      var sorted = owe.slice().sort(function (a, b) { return num(b.amount) - num(a.amount); });
      $("owe").innerHTML = '<div class="owe-total"><span class="k">Total · ' + plural(owe.length, "line") + '</span><span class="v">' + esc(money(tot)) + "</span></div>" +
        sorted.map(function (v) {
          return '<div class="owe"><div class="o-top"><span class="o-name">' + esc(v.vendor) + '</span><span class="o-amt">' + esc(money(v.amount)) + "</span></div>" +
            (v.status ? '<div class="o-st">' + esc(v.status) + "</div>" : "") +
            (v.asOf ? '<div class="o-asof">As of ' + esc(fmtDate(parseDate(v.asOf))) + "</div>" : "") +
            (v.note ? "<details><summary>Details</summary><p>" + esc(v.note) + "</p></details>" : "") + "</div>";
        }).join("");
    }
  }

  document.addEventListener("click", function (e) {
    var tab = e.target.closest ? e.target.closest("#tabs .tab") : null;
    if (tab) { var v = tab.getAttribute("data-view"); if (v && v !== VIEW) { VIEW = v; render(DATA, null); } }
  });

  render({}, null);
  window.SharmaLock.load(DATA_URL, { appName: "Sharma Finance", logo: "../assets/logo.png" })
    .then(function (d) { DATA = d || {}; render(DATA, null); })
    .catch(function (err) { render({}, err && err.message ? err.message : "unknown error"); });
})();

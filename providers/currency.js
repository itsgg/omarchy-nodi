.pragma library
.import "math.js" as Calc
.import "../lib/Score.js" as Score

// Currency converter. Rates (USD-based) come from the "rates" source below
// through ctx.request as { rates, updated, next, stale }: read from the API
// only for a query that is a conversion, kept in ~/.cache/nodi/rates.json
// (which Nodi.qml loads at start, so they work offline), and read again
// after the API's own next-update time, or ten minutes after a failure.
//
//   100 usd to lkr, 100usd in eur, $50, €20 to inr, 50 eur, usd lkr, 12*50 usd

var SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "රු": "LKR", "₩": "KRW", "₽": "RUB", "₺": "TRY", "฿": "THB", "₱": "PHP", "₫": "VND", "₪": "ILS" }

var NAMES = {
  dollar: "USD", dollars: "USD", bucks: "USD", euro: "EUR", euros: "EUR",
  pound: "GBP", pounds: "GBP", quid: "GBP", yen: "JPY", yuan: "CNY", rmb: "CNY",
  rs: "RUPEE", rupee: "RUPEE", rupees: "RUPEE", dirham: "AED", dirhams: "AED",
  ringgit: "MYR", baht: "THB", won: "KRW", franc: "CHF", francs: "CHF"
}

// Used before the first rates download so the parser still recognises codes.
// Every code open.er-api.com gives a rate for (its USD list, read
// 2026-10-05), so a conversion asked before any rates are saved is read as
// one and fetches them: "100 usd to rub" once read as nothing, as RUB was
// not among the common codes this list replaces, and nothing was fetched
// (codex 2026-10-05). A code the rates turn out to lack converts to nothing.
var CODES = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN " +
  "BZD CAD CDF CHF CLF CLP CNH CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP FOK " +
  "GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS IMP INR IQD IRR ISK JEP JMD JOD " +
  "JPY KES KGS KHR KID KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU " +
  "MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB " +
  "RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TVD " +
  "TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF YER ZAR ZMW ZWG ZWL"
).split(" ")

// "rupee"/"rs" mean your home currency when it's a rupee, else INR.
var RUPEES = ["INR", "LKR", "PKR", "NPR", "MUR", "SCR"]
var homeCurrency = "USD"

var TARGET_SEP = /\s+(?:to|in|into|as|->|=>|=)\s*$/

function knownCode(word, rates) {
  if (!word) return null
  var w = word.toLowerCase()
  // Own keys only: "constructor" names no currency.
  var has = function(table, k) { return Object.prototype.hasOwnProperty.call(table, k) }
  if (has(SYMBOLS, word)) return SYMBOLS[word]
  if (has(NAMES, w) && NAMES[w] === "RUPEE") return RUPEES.indexOf(homeCurrency) !== -1 ? homeCurrency : "INR"
  if (has(NAMES, w)) return NAMES[w]
  var up = word.toUpperCase()
  if (!/^[A-Z]{3}$/.test(up)) return null
  if (CODES.indexOf(up) !== -1 || (rates && rates[up] !== undefined)) return up
  return null
}

// Pull a currency token off the start or end of `text`.
// Returns { code, rest } or null.
function takeCurrency(text, fromEnd, rates) {
  var m
  if (fromEnd) m = text.match(/^(.*?)\s*([A-Za-z]{2,8}|[$€£¥₹₩₽₺฿₱₫₪]|රු)$/)
  else m = text.match(/^([A-Za-z]{2,8}(?![A-Za-z])|[$€£¥₹₩₽₺฿₱₫₪]|රු)\s*(.*)$/)
  if (!m) return null
  var word = fromEnd ? m[2] : m[1]
  var rest = fromEnd ? m[1] : m[2]
  var code = knownCode(word, rates)
  if (!code) return null
  return { code: code, rest: rest.trim() }
}

function parse(query, rates) {
  var text = query.trim()
  var target = null

  // Explicit target: "... to lkr"
  var t = takeCurrency(text, true, rates)
  if (t && TARGET_SEP.test(" " + t.rest)) {
    target = t.code
    text = (" " + t.rest).replace(TARGET_SEP, "").trim()
  }

  // Source currency: "$50", "usd 50", "50 usd", "50usd".
  var source = null
  var amountText = text
  var s = takeCurrency(text, false, rates)
  if (s) { source = s.code; amountText = s.rest }
  else {
    s = takeCurrency(text, true, rates)
    if (s) { source = s.code; amountText = s.rest }
  }
  if (!source) return null

  // "usd lkr": two bare codes, an implied amount of 1.
  if (!target && amountText) {
    var bare = takeCurrency(amountText, true, rates)
    if (bare && !bare.rest) { target = bare.code; amountText = "" }
  }

  var amount = 1
  if (amountText) {
    var r = Calc.evaluate(amountText)
    if (!r || !isFinite(r.value)) return null
    amount = r.value
  } else if (!target) {
    return null   // a lone "usd" is too ambiguous to answer
  }
  return { amount: amount, from: source, to: target }
}

function convert(amount, from, to, rates) {
  if (!rates || rates[from] === undefined || rates[to] === undefined) return null
  return amount / rates[from] * rates[to]
}

var RATES_URL = "https://open.er-api.com/v6/latest/USD"
var RATES_MAX_BYTES = 256 * 1024

// The response, or the saved file: { rates, updated, next, stale }. An
// error body never parses, so it never replaces good rates.
function parseRates(text, ok) {
  if (!ok) throw "Could not reach open.er-api.com"
  var data = JSON.parse(text)
  if (!data || data.result !== "success" || !data.rates || typeof data.rates !== "object") throw "unexpected response"
  return { rates: data.rates, updated: data.time_last_update_unix, next: data.time_next_update_unix }
}

var provider = {
  id: "currency",
  sources: {
    // Size-capped: curl aborts past the limit, head cuts a stream without a
    // length, and only a body jq confirms as a success replaces rates.json,
    // which is then printed for the parse.
    rates: {
      argv: function(param, env) {
        return ["/usr/bin/bash", "-c",
          "set -o pipefail; t=\"$1/rates.json.tmp\"; " +
          "mkdir -p \"$1\" && curl -q -fsS --max-time 8 --max-filesize \"$3\" \"$2\" | head -c \"$(($3 + 1))\" > \"$t\" " +
          "&& [ \"$(stat -c %s \"$t\")\" -le \"$3\" ] " +
          "&& jq -e '.result == \"success\" and (.rates | type == \"object\")' \"$t\" >/dev/null " +
          "&& mv \"$t\" \"$1/rates.json\" && cat \"$1/rates.json\" || { rm -f \"$t\"; exit 1; }",
          "nodi-rates", env.cacheDir, RATES_URL, String(RATES_MAX_BYTES)]
      },
      parse: parseRates,
      fresh: function(value, now) { return !!value && !!value.next && now < value.next * 1000 },
      retryMs: 10 * 60 * 1000,
      timeoutMs: 12000,
      maxBytes: RATES_MAX_BYTES + 1024
    }
  },
  name: "Currency",
  icon: "󰁰",
  commands: function(ctx) {
    var home = String((ctx.settings && ctx.settings.home) || "USD").toLowerCase()
    var example = home === "usd" ? "100 eur to usd" : "100 usd to " + home
    return [{ title: "Convert currency", keywords: "currency exchange rate rates money forex fx", text: "Daily rates, saved for offline use", complete: example, select: true }]
  },
  help: [
    { id: "currency", title: "Currency", about: "Daily exchange rates, saved for offline use",
      examples: ["100 usd to eur", "$50", "50 eur"] }
  ],
  match: function(query, ctx) {
    var settings = ctx.settings || {}
    homeCurrency = String(settings.home || "USD").toUpperCase()
    // Look first: the codes the rates know help read the query.
    var held = ctx.request ? ctx.request("rates", "", { fetch: false }) : { state: "pending" }
    var q = parse(query, held.value && held.value.rates)
    if (!q) return []
    // The only place the exchange-rate API is asked: a query that is a
    // conversion, and only when the saved rates are past their date.
    var got = ctx.request ? ctx.request("rates") : held
    var data = got.value
    var rates = data && data.rates

    if (!rates) {
      return [{ title: got.state === "error" ? "Could not fetch exchange rates" : "Fetching exchange rates...",
                subtitle: got.state === "error" ? got.error : "No saved rates yet", score: 40, copy: "" }]
    }

    var targets = []
    if (q.to) targets.push(q.to)
    else {
      if (q.from !== homeCurrency) targets.push(homeCurrency)
      var favs = settings.favorites || []
      for (var i = 0; i < favs.length; i++) {
        var f = String(favs[i]).toUpperCase()
        if (f !== q.from && targets.indexOf(f) === -1) targets.push(f)
      }
    }

    var asOf = data.updated ? "rates as of " + ctx.formatDate(data.updated) : ""
    // Stale by the clock now: a session long open keeps rates read days ago,
    // and a flag set when they were read never turned (codex 2026-10-05).
    if (data.next && ctx.now().getTime() > (data.next + 86400) * 1000) asOf += " (stale)"

    var out = []
    for (var j = 0; j < targets.length; j++) {
      var value = convert(q.amount, q.from, targets[j], rates)
      if (value === null) continue
      var rounded = Math.round(value * 100) / 100
      if (Math.abs(value) < 1 && value !== 0) rounded = Number(value.toPrecision(4))
      out.push({
        title: ctx.format(rounded) + " " + targets[j],
        subtitle: ctx.format(q.amount) + " " + q.from + " to " + targets[j] + (asOf ? ", " + asOf : ""),
        score: 99 - j,
        copy: ctx.plain(rounded)
      })
    }
    return Score.answers(out)
  }
}

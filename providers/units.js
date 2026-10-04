.pragma library
.import "../lib/Score.js" as Score

// Unit conversion, offline.
//
//   5 km to mi, 180 lb in kg, 72f, 5 ft 11 in to cm, 90 min to hours
// Ported from omarchy-commandbar (Saikomantisu, MIT).
//
// With a target unit you get that one answer; without one, the usual
// counterparts (km to mi, °F to °C, and so on). Durations only convert with an explicit
// target, so "in 2 weeks" and "5 min" stay with the date provider.

// [dimension, factor to the dimension's base unit, display name, aliases...]
// Bases: m, kg, l, m², m/s, byte, s. Temperatures are handled separately.
var UNITS = [
  ["length", 1e3, "km", "km", "kilometer", "kilometers", "kilometre", "kilometres"],
  ["length", 1, "m", "m", "meter", "meters", "metre", "metres"],
  ["length", 0.01, "cm", "cm", "centimeter", "centimeters", "centimetre", "centimetres"],
  ["length", 0.001, "mm", "mm", "millimeter", "millimeters", "millimetre", "millimetres"],
  ["length", 1609.344, "mi", "mi", "mile", "miles"],
  ["length", 0.9144, "yd", "yd", "yard", "yards"],
  ["length", 0.3048, "ft", "ft", "foot", "feet", "'"],
  ["length", 0.0254, "in", "in", "inch", "inches", "\""],
  ["length", 1852, "nmi", "nmi", "nautical mile", "nautical miles"],

  ["mass", 1000, "t", "t", "tonne", "tonnes", "metric ton", "metric tons"],
  ["mass", 1, "kg", "kg", "kilo", "kilos", "kilogram", "kilograms", "kgs"],
  ["mass", 0.001, "g", "g", "gram", "grams", "gm"],
  ["mass", 1e-6, "mg", "mg", "milligram", "milligrams"],
  ["mass", 0.45359237, "lb", "lb", "lbs", "pound", "pounds"],
  ["mass", 0.028349523125, "oz", "oz", "ounce", "ounces"],
  ["mass", 6.35029318, "st", "st", "stone", "stones"],

  ["volume", 1, "L", "l", "liter", "liters", "litre", "litres", "ltr"],
  ["volume", 0.001, "mL", "ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  ["volume", 3.785411784, "gal", "gal", "gallon", "gallons", "us gal"],
  ["volume", 4.54609, "imp gal", "imp gal", "imperial gallon", "imperial gallons", "uk gal"],
  ["volume", 0.946352946, "qt", "qt", "quart", "quarts"],
  ["volume", 0.473176473, "pt", "pt", "pint", "pints"],
  ["volume", 0.2365882365, "cup", "cup", "cups"],
  ["volume", 0.0295735295625, "fl oz", "fl oz", "floz", "fluid ounce", "fluid ounces"],
  ["volume", 0.01478676478125, "tbsp", "tbsp", "tablespoon", "tablespoons"],
  ["volume", 0.00492892159375, "tsp", "tsp", "teaspoon", "teaspoons"],

  ["area", 1e6, "km²", "km2", "km²", "sq km", "square kilometer", "square kilometers", "square kilometre", "square kilometres"],
  ["area", 1, "m²", "m2", "m²", "sq m", "square meter", "square meters", "square metre", "square metres"],
  ["area", 0.09290304, "ft²", "ft2", "ft²", "sq ft", "sqft", "square foot", "square feet"],
  ["area", 1e4, "ha", "ha", "hectare", "hectares"],
  ["area", 4046.8564224, "acre", "acre", "acres", "ac"],
  ["area", 2589988.110336, "mi²", "mi2", "mi²", "sq mi", "square mile", "square miles"],

  ["speed", 1 / 3.6, "km/h", "km/h", "kmh", "kph", "kmph"],
  ["speed", 0.44704, "mph", "mph", "mi/h"],
  ["speed", 1, "m/s", "m/s", "mps"],
  ["speed", 1852 / 3600, "kn", "kn", "knot", "knots", "kt"],

  ["data", 1, "B", "b", "byte", "bytes"],
  ["data", 1e3, "KB", "kb", "kilobyte", "kilobytes"],
  ["data", 1e6, "MB", "mb", "megabyte", "megabytes"],
  ["data", 1e9, "GB", "gb", "gigabyte", "gigabytes"],
  ["data", 1e12, "TB", "tb", "terabyte", "terabytes"],
  ["data", 1024, "KiB", "kib", "kibibyte", "kibibytes"],
  ["data", 1048576, "MiB", "mib", "mebibyte", "mebibytes"],
  ["data", 1073741824, "GiB", "gib", "gibibyte", "gibibytes"],
  ["data", 1099511627776, "TiB", "tib", "tebibyte", "tebibytes"],

  ["duration", 1, "s", "s", "sec", "secs", "second", "seconds"],
  ["duration", 60, "min", "min", "mins", "minute", "minutes"],
  ["duration", 3600, "h", "h", "hr", "hrs", "hour", "hours"],
  ["duration", 86400, "days", "d", "day", "days"],
  ["duration", 604800, "weeks", "wk", "wks", "week", "weeks"]
]

var TEMPS = [
  { name: "°C", aliases: ["c", "°c", "celsius", "centigrade", "degc"], toK: function(v) { return v + 273.15 }, fromK: function(k) { return k - 273.15 } },
  { name: "°F", aliases: ["f", "°f", "fahrenheit", "degf"], toK: function(v) { return (v - 32) * 5 / 9 + 273.15 }, fromK: function(k) { return (k - 273.15) * 9 / 5 + 32 } },
  { name: "K", aliases: ["k", "kelvin"], toK: function(v) { return v }, fromK: function(k) { return k } }
]

// Where a unit converts to when you don't say.
var COUNTERPARTS = {
  km: ["mi"], m: ["ft", "yd"], cm: ["in"], mm: ["in"], mi: ["km"], yd: ["m"], ft: ["m", "cm"], in: ["cm"], nmi: ["km", "mi"],
  t: ["lb"], kg: ["lb"], g: ["oz"], mg: ["g"], lb: ["kg"], oz: ["g"], st: ["kg", "lb"],
  L: ["gal", "fl oz"], mL: ["fl oz"], gal: ["L"], "imp gal": ["L"], qt: ["L"], pt: ["mL"], cup: ["mL"], "fl oz": ["mL"], tbsp: ["mL"], tsp: ["mL"],
  "km²": ["mi²"], "m²": ["ft²"], "ft²": ["m²"], ha: ["acre"], acre: ["ha", "m²"], "mi²": ["km²"],
  "km/h": ["mph"], mph: ["km/h"], "m/s": ["km/h"], kn: ["km/h", "mph"],
  B: ["KB"], KB: ["KiB"], MB: ["MiB"], GB: ["GiB", "MB"], TB: ["TiB", "GB"], KiB: ["KB"], MiB: ["MB"], GiB: ["GB"], TiB: ["TB"],
  "°C": ["°F"], "°F": ["°C"], K: ["°C"]
}

// Each result shows what kind of quantity it is.
var DIMENSION_ICONS = { length: "󰑭", mass: "󰖢", volume: "󰆫", area: "󰀁", speed: "󰓅", data: "󰋊", duration: "󰔛", temperature: "󰔏" }

var DIMENSION_NAMES = { length: "Length", mass: "Weight", volume: "Volume", area: "Area", speed: "Speed", data: "Data", duration: "Duration", temperature: "Temperature" }

var byAlias = null
var byName = null

function index() {
  if (byAlias) return
  byAlias = {}
  byName = {}
  for (var i = 0; i < UNITS.length; i++) {
    var u = { dim: UNITS[i][0], factor: UNITS[i][1], name: UNITS[i][2] }
    byName[u.name] = u
    for (var j = 3; j < UNITS[i].length; j++) byAlias[UNITS[i][j]] = u
  }
  for (var t = 0; t < TEMPS.length; t++) {
    var temp = { dim: "temperature", name: TEMPS[t].name, temp: TEMPS[t] }
    byName[temp.name] = temp
    for (var a = 0; a < TEMPS[t].aliases.length; a++) byAlias[TEMPS[t].aliases[a]] = temp
  }
}

function unitFor(text) {
  index()
  var key = String(text || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^degrees? /, "")
  return key ? byAlias[key] || null : null
}

function convert(value, from, to) {
  if (from.dim !== to.dim) return null
  if (from.dim === "temperature") return to.temp.fromK(from.temp.toK(value))
  return value * from.factor / to.factor
}

// Readable, not falsely precise: 3.10686 mi, 0.000123 g, 1,609.34 m.
function round(n) {
  if (n === 0 || !isFinite(n)) return n
  var abs = Math.abs(n)
  if (abs >= 1) return Math.round(n * 1e4) / 1e4
  return Number(n.toPrecision(4))
}

var NUMBER = "(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|-?\\.\\d+)"
var CONNECTOR = /\s+(?:to|in|into|as)\s+|\s*(?:->|→|=)\s*/g

function num(text) { return parseFloat(String(text).replace(/,/g, "")) }

// "5 ft 11 in", "5'11\"", "6 lb 4 oz": two parts of one dimension.
function parseAmount(text) {
  var t = text.trim()
  var m = t.match(new RegExp("^" + NUMBER + "\\s*([a-z°'\"/²2 ]+?)\\s*" + NUMBER + "\\s*([a-z°'\"/²2 ]+)$", "i"))
  if (m) {
    var a = unitFor(m[2]), b = unitFor(m[4])
    if (a && b && a !== b && a.dim === b.dim && a.dim !== "temperature")
      return { value: num(m[1]) + convert(num(m[3]), b, a), unit: a, label: m[1] + " " + a.name + " " + m[3] + " " + b.name }
  }
  m = t.match(new RegExp("^" + NUMBER + "\\s*([a-z°'\"/²2][a-z°'\"/²2 ]*)$", "i"))
  if (!m) return null
  var u = unitFor(m[2])
  return u ? { value: num(m[1]), unit: u, label: m[1] + " " + u.name } : null
}

function parse(query) {
  var q = query.trim()
  if (!/^-?[\d.]/.test(q)) return null
  // Try each connector position: "5 in to cm" has "in" as a unit, not a connector.
  var re = new RegExp(CONNECTOR.source, "gi")
  var m
  while ((m = re.exec(q)) !== null) {
    var amount = parseAmount(q.slice(0, m.index))
    var target = unitFor(q.slice(m.index + m[0].length))
    if (amount && target && amount.unit.dim === target.dim) return { amount: amount, targets: [target], explicit: true }
    re.lastIndex = m.index + 1   // overlapping tries: "11 in to cm" must still reach " to "
  }
  var only = parseAmount(q)
  if (!only || only.unit.dim === "duration") return null
  index()
  var names = COUNTERPARTS[only.unit.name] || []
  return { amount: only, targets: names.map(function(n) { return byName[n] }), explicit: false }
}

var provider = {
  id: "units",
  name: "Units",
  icon: "󰭍",
  commands: [
    { title: "Convert units", keywords: "unit units convert conversion length distance weight mass temperature volume speed area data", text: "km, lb, °F, cups, mph, GB and more", complete: "5 km to mi", select: true }
  ],
  help: [
    { id: "units", title: "Units", about: "Length, weight, temperature, volume, speed, data and time",
      examples: ["5 km to mi", "72f", "5 ft 11 in to cm", "2 cups in ml", "1 tb in gib"] }
  ],
  match: function(query, ctx) {
    var p = parse(query)
    if (!p) return []
    var out = []
    for (var i = 0; i < p.targets.length; i++) {
      var to = p.targets[i]
      var value = round(convert(p.amount.value, p.amount.unit, to))
      if (value === null || !isFinite(value)) continue
      out.push({
        title: ctx.format(value) + " " + to.name,
        subtitle: p.amount.label + " to " + to.name + ", " + DIMENSION_NAMES[to.dim],
        icon: DIMENSION_ICONS[to.dim],
        score: 99 - i,
        copy: ctx.plain(value)
      })
    }
    return Score.answers(out)
  }
}

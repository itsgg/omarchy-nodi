import QtQuick
import "../../lib/Match.js" as Match
import "../../lib/Score.js" as Score
import "../../lib/Placeholders.js" as Placeholders

// lib/Match.js in Qt's own engine, where the bar runs it: String.normalize,
// the separator classes and the surrogate pairs behave there as in node
// (tests/js/match.test.mjs). Qt's engine has no \p{L}, and a regex written
// with it fails there without a word, so this runs the folded matching
// where it lives. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }
  function same(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + ": " + JSON.stringify(a)) }

  function start() {
    same(Match.fold("Résumé"), "resume", "accents off")
    same(Match.fold("Straße Øre"), "strasse ore", "letters NFD keeps whole")
    same(Match.words("Résumé 2026.pdf"), ["resume", "2026", "pdf"], "one word, not r and sum")
    same(Match.words("தமிழ் விக்கிப்பீடியா - Chromium"), ["தமிழ்".normalize("NFD"), "விக்கிப்பீடியா".normalize("NFD"), "chromium"], "Tamil has words")
    same(Match.words("Москва - Википедия"), ["москва", "википедия"], "Cyrillic has words")
    same(Match.words("\ud83d\udd25 Hot \u201cquoted\u201d stuff\u2026"), ["hot", "quoted", "stuff"], "emoji and punctuation separate")
    same(Score.tier("beyonce", { name: "Beyoncé - CUFF IT" }), "prefix", "an accent-free query finds the accented name")
    same(Score.tier("விக்கி", { name: "தமிழ் விக்கிப்பீடியா" }), "words", "a Tamil query finds a Tamil word")
    same(Score.tier("pass", { name: "1Password" }), "prefix", "a leading numeral skipped")
    same(Placeholders.fill("{cursor}நன்றி \ud83d\udc4d\ud83c\udffd").cursorBack, 5, "the cursor's Left keys by cluster, in Qt's engine")
    same(Placeholders.fill("{cursor}\u0915\u094d\u0937 \u0b85\u0b83\u0ba4\u0bc1 \uac01").cursorBack, 7, "the generated table read there: a conjunct, aytham, Hangul")
    test.done(test.failures.length === 0, test.failures.join("; "))
  }
}

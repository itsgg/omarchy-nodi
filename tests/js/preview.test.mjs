// A file's preview (ROADMAP 82): code coloured in the theme's colours, a
// PDF's first page, a folder's entries; the script run on real files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, plain } from "./load.mjs";

const A = load("lib/Ansi.js");
const F = load("providers/files.js");
const Rows = load("lib/Rows.js");
const ESC = "\u001b";

test("the theme's sixteen colours, by name or by number", () => {
  const named = A.paletteFrom('red = "#f7768e"\ngreen = "#9ece6a"\nbright_red = "#ff7a93"\nforeground = "#a9b1d6"\n');
  assert.deepEqual(plain(named), { red: "#f7768e", green: "#9ece6a", bright_red: "#ff7a93", bright_green: "#9ece6a" });
  const numbered = A.paletteFrom('color1  = "#BF878C"\ncolor9 = "#E9AEB3"\ncolor2 = "#7B9F7E"\n# color3 = "#000000"\n');
  assert.deepEqual(plain(numbered), { red: "#BF878C", green: "#7B9F7E", bright_red: "#E9AEB3", bright_green: "#7B9F7E" },
                   "a bright colour the theme lacks is its plain one");
  assert.equal(A.paletteFrom('red = "#111111"\ncolor1 = "#222222"').red, "#111111", "a name wins over a number");
  assert.deepEqual(plain(A.paletteFrom("")), {});
});

test("coloured text as rich text: the theme's colours, nothing else let through", () => {
  const pal = { red: "#aa0000", blue: "#0000aa", bright_black: "#555555" };
  const t = ESC + "[34mconst" + ESC + "[0m x = " + ESC + "[31m\"<b>&amp;\"" + ESC + "[0m;\n\t" + ESC + "[90m// c" + ESC + "[39m\r\n";
  assert.equal(A.html(t, pal), '<div style="white-space: pre-wrap"><span style="color:#0000aa">const</span> x = '
    + '<span style="color:#aa0000">"&lt;b&gt;&amp;amp;"</span>;\n\t<span style="color:#555555">// c</span>\n</div>');
  assert.equal(A.plain(t), "const x = \"<b>&amp;\";\n\t// c\n");
  // A colour the theme has none of is the text's own; 256 and 24-bit colours too.
  assert.equal(A.html(ESC + "[35mm" + ESC + "[0m", pal), '<div style="white-space: pre-wrap">m</div>');
  assert.equal(A.html(ESC + "[38;5;1mr" + ESC + "[38;2;1;2;300mt", pal), '<div style="white-space: pre-wrap"><span style="color:#aa0000">r</span><span style="color:#0102ff">t</span></div>');
  // Escapes that are not colours, and stray control characters, are dropped.
  assert.equal(A.plain("a" + ESC + "[2Kb" + ESC + "]0;title\u0007c\u0000d"), "ab0;titlecd");
  // A first line left empty survives: Qt drops the break that opens a block.
  assert.equal(A.html("\nx", {}), '<div style="white-space: pre-wrap">\n\nx</div>');
});

test("what the read says, as the pane shows it", () => {
  const p = { title: "x", subtitle: "~/x", read: { source: "file-head", param: "/x" } };
  const at = () => "2026-10-04 07:31";
  const code = Rows.withRead(p, { state: "ready", value: F.parseHead("12147\t1791079693\ntext/javascript\nansi\n" + ESC + "[35mimport" + ESC + "[0m x\n", true) }, at);
  assert.deepEqual(plain([code.code, code.text, code.mono, code.labels]),
    [ESC + "[35mimport" + ESC + "[0m x", "import x", true, [["Size", "11.9 KB"], ["Modified", "2026-10-04 07:31"], ["Type", "text/javascript"]]]);
  const text = Rows.withRead(p, { state: "ready", value: F.parseHead("5\t1\ntext/plain\ntext\nhello\n", true) }, at);
  assert.deepEqual([text.code, text.text], [undefined, "hello"]);
  const pdf = Rows.withRead(p, { state: "ready", value: F.parseHead("901608\t1\napplication/pdf\nimage\t/home/u/.cache/nodi/thumbs/ab.jpg\n", true) }, at);
  assert.deepEqual([pdf.image, pdf.text], ["/home/u/.cache/nodi/thumbs/ab.jpg", undefined]);
  // Only a picture the read named as made: nothing else is drawn as one.
  assert.equal(F.parseHead("1\t1\napplication/pdf\nimage\tfile:///etc/passwd\n", true).image, undefined);
  const dir = Rows.withRead(p, { state: "ready", value: F.parseHead("4096\t1\ninode/directory\nlist\nsrc/\nREADME.md\n", true) }, at);
  assert.deepEqual(plain([dir.labels, dir.text]), [[["Modified", "2026-10-04 07:31"], ["Holds", "2 items"]], "src/\nREADME.md"]);
  const empty = Rows.withRead(p, { state: "ready", value: F.parseHead("4096\t1\ninode/directory\nlist\n", true) }, at);
  assert.deepEqual(plain(empty.labels[1]), ["Holds", "Nothing"]);
  assert.equal(empty.text, undefined);
  const bin = Rows.withRead(p, { state: "ready", value: F.parseHead("1195144\t1781065932\napplication/x-pie-executable\nnone\n", true) }, at);
  assert.ok(!bin.text && !bin.image && !bin.code, "a binary: its labels alone");
  assert.throws(() => F.parseHead("", false));
});

// The smallest PDF with one page, its cross-reference offsets counted.
function tinyPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>",
                "<< /Length 35 >>\nstream\n0 0 1 rg 20 20 160 60 re f\nendstream"];
  let out = "%PDF-1.4\n";
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
  const xref = out.length;
  out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + at.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("");
  return out + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
}

test("the read itself, on real files: code, a PDF, a folder, a binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-preview-"));
  try {
    const home = join(dir, "home");
    mkdirSync(home);
    writeFileSync(join(dir, "sizes.js"), "// sizes\nconst a = 1;\n");
    writeFileSync(join(dir, "guide.pdf"), tinyPdf());
    mkdirSync(join(dir, "folder"));
    mkdirSync(join(dir, "folder", "sub"));
    writeFileSync(join(dir, "folder", "b.txt"), "");
    writeFileSync(join(dir, "folder", "two\nlines"), "");
    writeFileSync(join(dir, "folder", "a b.txt"), "");
    symlinkSync(join(dir, "guide.pdf"), join(dir, "link.pdf"));
    writeFileSync(join(dir, "blob"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0]));
    const read = p => {
      const argv = F.provider.sources["file-head"].argv(p);
      return F.parseHead(execFileSync(argv[0], argv.slice(1), { env: { HOME: home, PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" } }).toString(), true);
    };
    const code = read(join(dir, "sizes.js"));
    assert.equal(code.kind, "ansi", "bat colours it");
    assert.ok(code.ansi.includes(ESC + "["), "with colours");
    assert.equal(code.text, "// sizes\nconst a = 1;");
    const pdf = read(join(dir, "guide.pdf"));
    assert.equal(pdf.kind, "image", "pdftoppm makes its first page");
    assert.ok(existsSync(pdf.image) && pdf.image.startsWith(join(home, ".cache/nodi/thumbs/")));
    const made = statSync(pdf.image).ino;
    assert.equal(read(join(dir, "guide.pdf")).image, pdf.image);
    assert.equal(statSync(pdf.image).ino, made, "made once, kept by path, size and time: the second read made none");
    assert.deepEqual(readdirSync(join(home, ".cache/nodi/thumbs")), [pdf.image.split("/").pop()], "no half-made picture left");
    const folder = read(join(dir, "folder"));
    assert.deepEqual(plain([folder.type, folder.kind, folder.entries]), ["inode/directory", "list", ["sub/", "a b.txt", "b.txt", "two?lines"]],
                     "folders first, a space as it is, a newline in a name written as ?");
    const link = read(join(dir, "link.pdf"));
    assert.deepEqual(plain([link.type, link.kind, link.size]), ["application/pdf", "image", pdf.size], "a link is read as what it points to");
    assert.equal(read(join(dir, "blob")).kind, "none");
    // A folder it may not read is not an empty one: the read fails, and the
    // pane says it cannot read it (Fable 2026-10-07).
    mkdirSync(join(dir, "closed"), { mode: 0o000 });
    assert.throws(() => read(join(dir, "closed")));
    chmodSync(join(dir, "closed"), 0o700);
    assert.equal(F.provider.sources["file-head"].argv("relative/path"), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a code that sets no colour (bold) leaves the colour as it was", () => {
  const A = load("lib/Ansi.js");
  const ESC = "\x1b";
  assert.equal(A.html(ESC + "[1mbold" + ESC + "[0m", {}), '<div style="white-space: pre-wrap">bold</div>');
});

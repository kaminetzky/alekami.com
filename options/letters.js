// Two hand-made fonts for options that write the name with flight paths or dots.
// DOTS: a 5x7 dot matrix, rows top to bottom. STROKES: single-stroke polylines on a 4 x 6 grid, y up, the way a plane would fly them.
window.LETTERS = (function () {
  const D = {
    A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110", C: "01110100011000010000100001000101110",
    D: "11110100011000110001100011000111110", E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
    G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001", I: "01110001000010000100001000010001110",
    J: "00111000100001000010000101001001100", K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
    M: "10001110111010110101100011000110001", N: "10001100011100110101100111000110001", O: "01110100011000110001100011000101110",
    P: "11110100011000111110100001000010000", Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
    S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110",
    V: "10001100011000110001100010101000100", W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
    Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111", " ": "00000000000000000000000000000000000",
  };
  // Columns of a line of text: each column is 7 booleans, top to bottom, with one blank column between letters.
  function dots(text) {
    const cols = [];
    [...text.toUpperCase()].forEach((ch, i) => {
      const g = D[ch] || D[" "];
      if (i) cols.push(Array(7).fill(false));
      for (let c = 0; c < 5; c++) cols.push(Array.from({ length: 7 }, (_, r) => g[r * 5 + c] === "1"));
    });
    return cols;
  }

  const O = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], P = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
  const S = {
    A: [[[0, 0], [2, 6], [4, 0]], [[.8, 2.4], [3.2, 2.4]]],
    B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
    C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
    D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
    E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
    F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
    G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
    H: [[[0, 6], [0, 0]], [[4, 6], [4, 0]], [[0, 3], [4, 3]]],
    I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
    J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
    K: [[[0, 6], [0, 0]], [[4, 6], [0, 2]], [[1.3, 3.3], [4, 0]]],
    L: [[[0, 6], [0, 0], [4, 0]]],
    M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
    N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
    O: [O],
    P: [P],
    Q: [O, [[2.5, 1.5], [4, 0]]],
    R: [P, [[2, 3], [4, 0]]],
    S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
    U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    V: [[[0, 6], [2, 0], [4, 6]]],
    W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
    X: [[[0, 6], [4, 0]], [[4, 6], [0, 0]]],
    Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
    Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  };
  // Polylines for lines of text, centred on the origin, y up. Letters advance 5.6 units, lines are 9 apart.
  function strokes(lines) {
    const out = [], ADV = 5.6, LINE = 9;
    let width = 0;
    lines.forEach((text, li) => {
      const w = text.length * ADV - 1.6, y0 = (lines.length - 1) / 2 * LINE - li * LINE - 3;
      width = Math.max(width, w);
      [...text.toUpperCase()].forEach((ch, i) => {
        for (const poly of S[ch] || []) out.push(poly.map(([x, y]) => [x + i * ADV - w / 2, y + y0]));
      });
    });
    return { strokes: out, width, height: lines.length * LINE - 3 };
  }
  // One continuous path through every stroke, as a pen would draw it: pen-up moves join the strokes.
  // Resampled every `step` units. Each point is [x, y, penDown].
  function path(lines, step) {
    const { strokes: st, width, height } = strokes(lines), pts = [];
    const push = (a, b, down) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = pts.length ? 1 : 0; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, down]);
    };
    let at = null;
    for (const poly of st) {
      if (at) push(at, poly[0], false);
      for (let i = 1; i < poly.length; i++) push(poly[i - 1], poly[i], true);
      at = poly[poly.length - 1];
    }
    return { pts, width, height };
  }
  return { dots, strokes, path };
})();

// Line art shared by the options that merge aviation, drones and electronics.
// Each shape is an SVG path with the size of the box it was drawn in.
window.SHAPES = {
  plane: {
    w: 300, h: 110,
    d: "M10 68Q30 52 70 50L108 43L168 43Q205 52 240 60L282 62L288 34L298 34L297 70L240 78Q150 90 70 88Q30 86 10 68Z" +
       "M92 36H192V43H92Z M145 43L116 82 M4 42V96 M72 52H104V66H72Z M110 48H150V66H110Z" +
       "M86 88V98 M76 104a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M206 82V98 M196 104a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
  },
  // A fighter jet seen from above, nose to the right: chined nose, swept wings with wingtip missiles, twin canted tails.
  jet: {
    w: 300, h: 170,
    d: "M296 85L250 76L196 68L112 14L96 14L102 60L68 62L30 32L16 32L18 66L4 70V100L18 104L16 138L30 138L68 108L102 110L96 156L112 156L196 102L250 94Z" +
       "M206 85a24 6 0 1 0 48 0a24 6 0 1 0-48 0 M98 8H134 M98 162H134 M74 70L44 56 M74 100L44 114",
  },
  opamp: {
    w: 320, h: 110,
    d: "M130 20V90L200 55Z M136 38H146 M136 72H146 M141 67V77" +
       "M10 38H52l3-7 6 14 6-14 6 14 6-14 3 7H130" +
       "M100 38V8H140l3-7 6 14 6-14 6 14 6-14 3 7H230V55" +
       "M200 55H310 M115 72H130 M115 72V92 M105 92H125 M109 97H121 M113 102H117" +
       "M8 38a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M308 55a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  },
  drone: {
    w: 200, h: 200,
    d: "M80 80H120V120H80Z M80 80L42 42 M120 80L158 42 M80 120L42 158 M120 120L158 158" +
       "M4 42a38 38 0 1 0 76 0a38 38 0 1 0-76 0 M120 42a38 38 0 1 0 76 0a38 38 0 1 0-76 0" +
       "M4 158a38 38 0 1 0 76 0a38 38 0 1 0-76 0 M120 158a38 38 0 1 0 76 0a38 38 0 1 0-76 0" +
       "M92 100a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
  },
  chip: {
    w: 200, h: 200,
    d: "M40 40H160V160H40Z M70 70H130V130H70Z" +
       "M60 40V14 M85 40V14 M115 40V14 M140 40V14 M60 160V186 M85 160V186 M115 160V186 M140 160V186" +
       "M40 60H14 M40 85H14 M40 115H14 M40 140H14 M160 60H186 M160 85H186 M160 115H186 M160 140H186",
  },
  net: {
    w: 240, h: 170,
    d: (function () {
      const layers = [[20, [45, 85, 125]], [90, [20, 62, 108, 150]], [160, [20, 62, 108, 150]], [225, [62, 108]]];
      let s = "";
      for (let l = 0; l < layers.length; l++) {
        const [x, ys] = layers[l];
        for (const y of ys) {
          s += "M" + (x - 8) + " " + y + "a8 8 0 1 0 16 0a8 8 0 1 0-16 0";
          if (l < layers.length - 1) for (const y2 of layers[l + 1][1]) s += "M" + (x + 8) + " " + y + "L" + (layers[l + 1][0] - 8) + " " + y2;
        }
      }
      return s;
    })(),
  },
};

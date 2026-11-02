/*
 * 🏝 Остров подписчиков — общий строитель острова для сайта-карты и видео.
 *
 *   const isl = OstrovIsland.build(THREE, residents, { seed: 0 });
 *   scene.add(isl.group);
 *   isl.houses.get("neex_yt")  // { no, nick, level, pos: Vector3, top: Vector3 }
 *
 * Каждый номер жителя навсегда закреплён за своим участком: участки идут от центра
 * по кругу, остров расширяется сам. Дома никогда не переезжают — человек находит себя
 * в одном и том же месте на сайте и в любом видео.
 */
(function (root) {
  const PLOT = 6;          // шаг сетки участков
  const TERRAIN = 2;       // размер колонки рельефа
  const LEVELS = [
    { name: "Шалаш", emoji: "⛺" },
    { name: "Хижина", emoji: "🛖" },
    { name: "Домик", emoji: "🏠" },
    { name: "Коттедж", emoji: "🏡" },
    { name: "Особняк", emoji: "🏘" },
    { name: "Вилла", emoji: "🏰" },
    { name: "Маяк", emoji: "🗼" },
  ];
  const C = {
    grass: "#6CC24A", grass2: "#5DB03F", soil: "#8B5A2B", sand: "#F4D58D", sand2: "#E8C574",
    trunk: "#A9733F", leaf: "#3FA34D", leaf2: "#2F8C3E", white: "#FFFFFF", red: "#E2483D", lamp: "#FFD93B",
    straw: "#E0B04E", straw2: "#C8933A", log: "#8A5530", log2: "#6E4123", door: "#4A2F17", glass: "#9FE3FF",
    cream: "#F1D3A1", roof: "#D9452F", roof2: "#2E86AB", navy: "#0B3954", teal: "#2EC4B6", stone: "#9AA0A6",
    pool: "#3FC1E0", pad: "#E9D7A0", flower: "#FF7AA8", fl2: "#FFE066", path: "#D8C08A",
  };

  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  // plot order: grid cells sorted by distance from the centre, ties broken by angle; centre cell is the plaza.
  // Only cells inside the full circle of radius k are kept, so growing k never reorders earlier plots.
  let PLOTS = [];
  function plotCell(no) {
    const idx = no - 2; // №1 — сам остров (площадь в центре)
    let k = 8;
    while (PLOTS.length <= idx) {
      k *= 2;
      const cells = [];
      for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
        const d = Math.hypot(i, j);
        if ((i === 0 && j === 0) || d > k) continue;
        cells.push([i, j, d, Math.atan2(j, i)]);
      }
      cells.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
      PLOTS = cells;
    }
    return PLOTS[idx];
  }

  function Builder(THREE) { this.T = THREE; this.pos = []; this.nor = []; this.col = []; }
  Builder.prototype.box = function (x, y, z, w, h, d, top, side, rotZ, rotY) {
    const T = this.T;
    const g = new T.BoxGeometry(w, h, d).toNonIndexed();
    const m = new T.Matrix4().makeRotationFromEuler(new T.Euler(0, rotY || 0, rotZ || 0));
    m.setPosition(x, y, z);
    g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const ct = new T.Color(top), cs = new T.Color(side || top), cb = cs.clone().multiplyScalar(0.82);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      const c = n[i + 1] > 0.5 ? ct : Math.abs(n[i]) > 0.5 ? cb : cs;
      this.col.push(c.r, c.g, c.b);
    }
    g.dispose();
    return this;
  };
  Builder.prototype.mesh = function () {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.col, 3));
    const mesh = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // ── house models, origin at the ground centre, footprint about 4×4
  function shalash(b, x, y, z, s) {
    b.box(x - 0.62 * s, y + 0.9 * s, z, 1.6 * s, 0.22 * s, 2.6 * s, C.straw, C.straw2, 0.95);
    b.box(x + 0.62 * s, y + 0.9 * s, z, 1.6 * s, 0.22 * s, 2.6 * s, C.straw, C.straw2, -0.95);
    b.box(x, y + 1.62 * s, z, 0.25 * s, 0.25 * s, 2.8 * s, C.log2);
    b.box(x, y + 0.45 * s, z + 1.25 * s, 0.6 * s, 0.9 * s, 0.1 * s, C.door);
  }
  function gable(b, x, y, z, w, d, color, rise) {
    const half = w / 2 + 0.25, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    b.box(x - half / 2, y + rise / 2, z, len, 0.22, d + 0.4, color, color, ang);
    b.box(x + half / 2, y + rise / 2, z, len, 0.22, d + 0.4, color, color, -ang);
  }
  const MODELS = [
    // 1 Шалаш
    (b, x, y, z) => shalash(b, x, y, z, 1.15),
    // 2 Хижина: brown logs, small vegetable bed
    (b, x, y, z) => {
      for (let i = 0; i < 4; i++) b.box(x, y + 0.22 + i * 0.4, z, 2.6, 0.38, 2.4, i % 2 ? C.log : C.log2);
      gable(b, x, y + 1.62, z, 2.6, 2.4, C.log2, 0.9);
      b.box(x, y + 0.6, z + 1.22, 0.6, 1.1, 0.06, C.door).box(x + 0.85, y + 1.0, z + 1.22, 0.45, 0.45, 0.06, C.glass);
      b.box(x - 1.9, y + 0.12, z + 0.6, 0.9, 0.24, 1.6, C.soil).box(x - 1.9, y + 0.3, z + 0.3, 0.7, 0.2, 0.2, C.grass).box(x - 1.9, y + 0.3, z + 0.9, 0.7, 0.2, 0.2, C.grass);
    },
    // 3 Домик: cream walls, coloured roof, fence
    (b, x, y, z) => {
      b.box(x, y + 0.9, z, 2.6, 1.8, 2.4, C.cream);
      gable(b, x, y + 1.8, z, 2.6, 2.4, C.roof, 1.0);
      b.box(x, y + 0.55, z + 1.22, 0.6, 1.1, 0.06, C.door).box(x - 0.8, y + 1.1, z + 1.22, 0.5, 0.5, 0.06, C.glass).box(x + 0.8, y + 1.1, z + 1.22, 0.5, 0.5, 0.06, C.glass);
      for (let i = -3; i <= 3; i++) b.box(x + i * 0.5, y + 0.3, z + 1.9, 0.12, 0.6, 0.12, C.white);
      b.box(x, y + 0.45, z + 1.9, 3.2, 0.08, 0.08, C.white);
    },
    // 4 Коттедж: bigger, chimney, pet (a little dog) in the yard
    (b, x, y, z) => {
      b.box(x, y + 1.0, z - 0.2, 3.0, 2.0, 2.6, C.cream);
      gable(b, x, y + 2.0, z - 0.2, 3.0, 2.6, C.roof, 1.1);
      b.box(x + 0.8, y + 2.7, z - 0.8, 0.4, 0.9, 0.4, "#A0522D");
      b.box(x, y + 0.6, z + 1.12, 0.6, 1.2, 0.06, C.door).box(x - 0.9, y + 1.25, z + 1.12, 0.55, 0.55, 0.06, C.glass).box(x + 0.9, y + 1.25, z + 1.12, 0.55, 0.55, 0.06, C.glass);
      b.box(x + 1.6, y + 0.3, z + 1.6, 0.6, 0.35, 0.3, "#E8A33D").box(x + 1.85, y + 0.55, z + 1.6, 0.3, 0.3, 0.28, "#E8A33D");
      for (let i = -3; i <= 3; i++) b.box(x + i * 0.55, y + 0.3, z + 2.0, 0.12, 0.6, 0.12, C.white);
    },
    // 5 Особняк: two floors, flag, pool
    (b, x, y, z) => {
      b.box(x - 0.3, y + 0.9, z - 0.3, 3.0, 1.8, 2.6, C.cream).box(x - 0.3, y + 2.5, z - 0.3, 2.4, 1.4, 2.2, C.cream);
      gable(b, x - 0.3, y + 3.2, z - 0.3, 2.4, 2.2, C.roof2, 0.9);
      b.box(x - 0.3, y + 0.6, z + 1.02, 0.7, 1.2, 0.06, C.door).box(x - 1.2, y + 1.2, z + 1.02, 0.5, 0.6, 0.06, C.glass).box(x + 0.6, y + 1.2, z + 1.02, 0.5, 0.6, 0.06, C.glass).box(x - 0.3, y + 2.6, z + 0.82, 1.4, 0.6, 0.06, C.glass);
      b.box(x + 1.55, y + 0.08, z + 1.3, 1.1, 0.16, 1.2, C.pool, "#CFE7EE");
      b.box(x - 1.7, y + 1.8, z + 1.5, 0.08, 3.6, 0.08, C.white).box(x - 1.35, y + 3.35, z + 1.5, 0.6, 0.4, 0.04, C.teal);
    },
    // 6 Вилла: white modern blocks, glass, big pool, pier deck
    (b, x, y, z) => {
      b.box(x - 0.3, y + 0.85, z - 0.2, 3.2, 1.7, 2.6, C.white).box(x + 0.2, y + 2.35, z - 0.4, 2.4, 1.3, 2.0, C.white);
      b.box(x - 0.3, y + 1.75, z - 0.2, 3.4, 0.12, 2.8, "#D7DEE2").box(x + 0.2, y + 3.05, z - 0.4, 2.6, 0.12, 2.2, "#D7DEE2");
      b.box(x - 0.3, y + 0.95, z + 1.12, 2.6, 0.9, 0.06, C.glass).box(x + 0.2, y + 2.35, z + 0.62, 1.8, 0.7, 0.06, C.glass);
      b.box(x + 0.4, y + 0.08, z + 1.9, 2.8, 0.16, 1.0, C.pool, "#CFE7EE");
      b.box(x - 1.9, y + 0.1, z + 1.9, 0.9, 0.2, 1.0, "#B98552");
    },
    // 7 Маяк
    (b, x, y, z) => {
      for (let i = 0; i < 8; i++) b.box(x, y + 0.45 + i * 0.9, z, 1.4 - i * 0.04, 0.9, 1.4 - i * 0.04, i % 2 ? C.white : C.red);
      b.box(x, y + 7.55, z, 1.3, 0.8, 1.3, C.lamp, C.lamp).box(x, y + 8.15, z, 1.6, 0.4, 1.6, C.red);
      b.box(x, y + 0.05, z, 2.6, 0.1, 2.6, C.stone);
    },
  ];
  const HEIGHT = [2.2, 2.6, 3.0, 3.3, 4.2, 3.4, 8.6];

  function palm(b, x, y, z, h, lean) {
    for (let i = 0; i < h; i++) b.box(x + lean * i * 0.12, y + 0.5 + i, z, 0.6, 1, 0.6, C.trunk);
    const tx = x + lean * h * 0.12, ty = y + h + 0.3;
    b.box(tx, ty, z, 1.2, 0.6, 1.2, C.leaf);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, c]) => {
      b.box(tx + a * 1.3, ty - 0.1, z + c * 1.3, a ? 1.6 : 1, 0.5, c ? 1.6 : 1, C.leaf);
      b.box(tx + a * 2.5, ty - 0.6, z + c * 2.5, a ? 1.2 : 0.9, 0.45, c ? 1.2 : 0.9, C.leaf2);
    });
  }

  function signTexture(THREE, residentsCount) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 384;
    const g = c.getContext("2d");
    g.fillStyle = "#9C6B3C"; g.fillRect(0, 0, 512, 384);
    g.fillStyle = "#8A5C31";
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 96 + 92, 512, 6);
    g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 74px Montserrat, sans-serif"; g.fillText("ОСТРОВ", 256, 96); g.fillText("ПОДПИСЧИКОВ", 256, 176);
    g.fillStyle = "#0B3954"; g.fillRect(40, 262, 432, 92);
    g.fillStyle = "#FFFFFF"; g.font = "800 48px Montserrat, sans-serif"; g.fillText("ЖИТЕЛЕЙ: " + residentsCount, 256, 310);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * residents: [{ no, nick, level }] — no ≥ 2, level 1..7
   * returns { group, houses: Map, radius, plaza: Vector3, sign: Mesh }
   */
  function build(THREE, residents, opts) {
    opts = opts || {};
    const group = new THREE.Group();
    const houses = new Map();
    const rows = residents.filter((r) => r.no >= 2).sort((a, b) => a.no - b.no);

    // occupied cells decide the island size
    let far = 1;
    const cells = rows.map((r) => { const c = plotCell(r.no); far = Math.max(far, c[2]); return c; });
    const R = Math.max(14, (far + 1) * PLOT + 6);
    const grassR = R - 5;

    // terrain columns
    const terrain = new Builder(THREE);
    const tops = new Map();
    const n = Math.ceil(R / TERRAIN) + 1;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = i * TERRAIN, z = j * TERRAIN;
      const r = Math.hypot(x, z) + (hash(i, j) - 0.5) * 2.4;
      if (r > R) continue;
      const grass = r < grassR;
      const top = grass ? 2 : 1;
      const ct = grass ? (hash(i * 3, j) < 0.5 ? C.grass : C.grass2) : (hash(i, j * 2) < 0.5 ? C.sand : C.sand2);
      terrain.box(x, (top - 3) / 2, z, TERRAIN, top + 3, TERRAIN, ct, grass ? C.soil : C.sand2);
      tops.set(i + "," + j, top);
    }
    const topAt = (x, z) => tops.get(Math.round(x / TERRAIN) + "," + Math.round(z / TERRAIN)) || 2;
    group.add(terrain.mesh());

    const shallows = new THREE.Mesh(new THREE.CircleGeometry(R + 6, 64), new THREE.MeshLambertMaterial({ color: "#46C4DE" }));
    shallows.rotation.x = -Math.PI / 2;
    shallows.position.y = 0.02;
    shallows.receiveShadow = true;
    group.add(shallows);

    // houses, pads and the plaza
    const b = new Builder(THREE);
    const occupied = new Set();
    rows.forEach((r, k) => {
      const [i, j] = cells[k];
      occupied.add(i + "," + j);
      const x = i * PLOT, z = j * PLOT, y = 2;
      const lvl = Math.min(7, Math.max(1, r.level || 1));
      b.box(x, y + 0.03, z, 4.6, 0.06, 4.6, C.pad);
      MODELS[lvl - 1](b, x, y, z);
      houses.set(r.nick, { no: r.no, nick: r.nick, level: lvl, pos: new THREE.Vector3(x, y, z), top: new THREE.Vector3(x, y + HEIGHT[lvl - 1] + 0.6, z) });
    });
    // plaza: the founder's hut and paths
    b.box(0, 2.03, 0, 5.4, 0.06, 5.4, C.path);
    shalash(b, -0.6, 2, -0.8, 1.25);

    // palms and flowers in the gaps between plots, never on a plot
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = (i + 0.5) * PLOT, z = (j + 0.5) * PLOT;
      const d = Math.hypot(x, z);
      if (d > R - 2 || d < 5) continue;
      const h = hash(i + 7, j - 3);
      if (h < (d > grassR ? 0.35 : 0.05)) palm(b, x, topAt(x, z), z, 5 + Math.floor(hash(j, i) * 3), hash(i, j + 9) < 0.5 ? 1 : -1);
      else if (d < grassR && h < 0.3) b.box(x, 2.2, z, 0.4, 0.4, 0.4, hash(j, i) < 0.5 ? C.flower : C.fl2);
    }
    group.add(b.mesh());

    // the sign on the plaza
    const sign = new THREE.Group();
    const post = new Builder(THREE);
    post.box(-1.4, 1.2, 0, 0.35, 2.4, 0.35, C.log).box(1.4, 1.2, 0, 0.35, 2.4, 0.35, C.log).box(0, 2.45, -0.12, 3.4, 2.5, 0.2, "#7A4F2A");
    sign.add(post.mesh());
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.45), new THREE.MeshLambertMaterial({ map: signTexture(THREE, rows.length + 1) }));
    face.position.set(0, 2.45, 0.01);
    sign.add(face);
    sign.position.set(1.4, 2, 2.2);
    sign.rotation.y = -0.3;
    group.add(sign);

    return { group, houses, radius: R, plaza: new THREE.Vector3(0, 2, 0), sign, levels: LEVELS };
  }

  root.OstrovIsland = { build, plotCell, LEVELS, PLOT };
})(typeof window !== "undefined" ? window : globalThis);

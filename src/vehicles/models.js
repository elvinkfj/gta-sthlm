'use strict';

  /* ================= vehicles ================= */
  // Each model is a real car: size, wheelbase and the body lines come from it. gears: number of forward gears;
  // idle/red: engine speed range in rpm; eng: which engine sound it has.
  // shape (metres, z forwards from the middle of the car, +x the driver's side):
  //   sill/belt/roof: the bottom edge, the bonnet-waist-boot line and the roof line, as [z, y] points
  //   cab: [rear window foot, roof rear, roof front, windscreen foot]; rc/p: how far and how squarely the ends round off
  //   shoulder/tumble: how far the glasshouse steps in from the body side and leans in towards the roof
  //   crown: [boot, bonnet, roof] camber; glass: where the side windows run; pillars: [z, width] of the B/C pillars
  //   head/tail/grille/intake: lamp and opening bands; y < 0 means below the waist line, y > 0 is height above the road
  const MODELS = [
    { id: 'halvkombi', name: 'VW Golf', kind: 'Halvkombi', def: 'Golfen', W: 1.79, L: 4.28, R: 0.32, wb: 2.63, max: 41, zero: [100, 8.5], brake: 24, rev: 9, mass: 1.0, grip: 1.0,
      colors: [0xc8102e, 0x1f4f8f, 0xeeeeea, 0x5b6066, 0x111316], gears: 5, idle: 850, red: 6300, eng: 'i4', rim: 'alloy',
      shape: {
        sill: [[-2.14, 0.44], [-1.92, 0.33], [-1.6, 0.29], [1.6, 0.29], [1.9, 0.31], [2.14, 0.4]],
        belt: [[-2.14, 0.84], [-2.06, 0.98], [-1.85, 1.0], [-0.4, 0.97], [0.9, 0.94], [1.55, 0.86], [1.95, 0.78], [2.14, 0.66]],
        roof: [[-1.72, 1.41], [-0.9, 1.46], [0.3, 1.45]], cab: [-2.04, -1.72, 0.3, 1.18], rc: [0.26, 0.42], p: [3, 2.6],
        shoulder: 0.1, tumble: 0.17, crown: [0.03, 0.035, 0.03], glass: [-1.42, 1.12], pillars: [[-0.08, 0.1]], trim: 'gloss',
        doors: [1.12, -0.12, -1.25], head: { y: [-0.15, -0.05], x: 0.32, d: 0.32 }, grille: { y: [-0.13, -0.07], x: 0.32, d: 0.2 },
        intake: { y: [0.36, 0.5], x: 0.55, d: 0.15 }, tail: { y: [-0.14, -0.02], x: 0.45, d: 0.28, rev: [0.45, 0.53] }, plate: [0.47, 0.6]
      } },
    { id: 'sedan', name: 'Tesla Model 3', kind: 'Elbil', def: 'Teslan', ev: true, W: 1.85, L: 4.69, R: 0.34, wb: 2.875, max: 47, zero: [100, 6.1], brake: 26, rev: 9, mass: 1.3, grip: 1.0,
      colors: [0xf2f2f0, 0x0e0f11, 0x4a4f55, 0x1c3f7a, 0xa3121c], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'aero',
      shape: {
        sill: [[-2.345, 0.46], [-2.1, 0.33], [-1.8, 0.28], [1.8, 0.28], [2.1, 0.3], [2.345, 0.38]],
        belt: [[-2.345, 0.86], [-2.25, 0.99], [-2.0, 1.02], [-1.0, 0.98], [0.6, 0.92], [1.45, 0.82], [2.0, 0.71], [2.345, 0.56]],
        roof: [[-0.95, 1.36], [-0.4, 1.43], [0.15, 1.42]], cab: [-1.95, -0.95, 0.15, 1.32], rc: [0.3, 0.45], p: [2.8, 2.4],
        shoulder: 0.11, tumble: 0.19, crown: [0.03, 0.04, 0.03], glass: [-1.62, 1.26], pillars: [[-0.3, 0.1]], trim: 'gloss',
        roofGlass: true, roofBars: [[-0.35, 0.08]], doors: [1.24, -0.3, -1.55], handles: 'paint',
        head: { y: [-0.09, -0.035], x: 0.5, d: 0.3 }, intake: { y: [0.36, 0.45], x: 0.42, d: 0.12 },
        tail: { y: [-0.12, -0.03], x: 0.38, d: 0.32, rev: [0.38, 0.46] }, plate: [0.45, 0.66]
      } },
    { id: 'kombi', name: 'Volvo V60', kind: 'Kombi', def: 'Volvon', W: 1.85, L: 4.76, R: 0.35, wb: 2.87, max: 44, zero: [100, 7.6], brake: 24, rev: 9, mass: 1.45, grip: 1.0,
      colors: [0x3d5a80, 0xeeeeea, 0x111316, 0x5d6266, 0x8e1b22], gears: 5, idle: 800, red: 6100, eng: 'i5', rim: 'alloy',
      shape: {
        sill: [[-2.38, 0.46], [-2.15, 0.33], [-1.85, 0.3], [1.8, 0.3], [2.1, 0.32], [2.38, 0.4]],
        belt: [[-2.38, 0.92], [-2.3, 1.0], [-2.0, 1.0], [0.0, 0.97], [1.0, 0.94], [1.6, 0.87], [2.1, 0.8], [2.38, 0.68]],
        roof: [[-2.05, 1.37], [-1.0, 1.42], [0.25, 1.43]], cab: [-2.3, -2.05, 0.25, 1.25], rc: [0.2, 0.42], p: [3.5, 2.8],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.035, 0.03], glass: [-2.02, 1.2], pillars: [[0.0, 0.1], [-1.2, 0.1]], trim: 'chrome',
        doors: [1.18, -0.02, -1.22], head: { y: [-0.14, -0.06], x: 0.4, d: 0.27 }, grille: { y: [0.52, -0.06], x: 0.36, d: 0.15 },
        intake: { y: [0.38, 0.47], x: 0.6, d: 0.15 }, tail: { y: [-0.2, -0.02], x: 0.55, d: 0.2, up: 0.3, rev: [0.55, 0.63] },
        rails: true, iron: true, plate: [0.45, 0.66]
      } },
    { id: 'taxi', name: 'Taxi', kind: 'Toyota Prius', def: 'taxin', W: 1.76, L: 4.54, R: 0.33, wb: 2.7, max: 47, zero: [100, 10.6], brake: 26, rev: 9, mass: 1.35, grip: 1.0,
      colors: [0x111316, 0xeeeeea, 0xb9bec4, 0x2f3338], gears: 6, idle: 750, red: 5800, eng: 'i4', rim: 'aero',
      shape: {
        sill: [[-2.27, 0.46], [-2.05, 0.33], [-1.75, 0.29], [1.7, 0.29], [2.0, 0.31], [2.27, 0.37]],
        belt: [[-2.27, 0.9], [-2.18, 1.0], [-1.95, 1.03], [-0.5, 0.97], [0.8, 0.9], [1.5, 0.8], [2.0, 0.68], [2.27, 0.55]],
        roof: [[-1.5, 1.33], [-0.6, 1.46], [0.05, 1.47]], cab: [-2.15, -1.5, 0.05, 1.32], rc: [0.24, 0.45], p: [3, 2.4],
        shoulder: 0.1, tumble: 0.18, crown: [0.03, 0.04, 0.03], glass: [-1.8, 1.26], pillars: [[-0.38, 0.1], [-1.45, 0.08]], trim: 'gloss',
        doors: [1.22, -0.35, -1.48], head: { y: [-0.1, -0.03], x: 0.45, d: 0.42 }, intake: { y: [0.34, 0.5], x: 0.5, d: 0.14 },
        tail: { y: [-0.12, -0.02], x: 0.3, d: 0.3, rev: [0.3, 0.38] }, plate: [0.43, 0.62], taxi: true
      } },
    { id: 'suv', name: 'Volvo XC90', kind: 'SUV', def: 'XC90:n', W: 2.0, L: 4.95, R: 0.4, wb: 2.98, max: 45, zero: [100, 7.8], brake: 24, rev: 9, mass: 2.0, grip: 0.95,
      colors: [0x111316, 0xeeeeea, 0x4d5a52, 0x3d5a80, 0xb7b8b4], gears: 6, idle: 750, red: 4600, eng: 'diesel', rim: 'alloy',
      shape: {
        sill: [[-2.475, 0.62], [-2.25, 0.47], [-1.95, 0.43], [1.9, 0.43], [2.2, 0.47], [2.475, 0.56]],
        belt: [[-2.475, 1.12], [-2.4, 1.2], [-2.1, 1.22], [0.0, 1.2], [1.1, 1.16], [1.7, 1.1], [2.2, 1.04], [2.475, 0.92]],
        roof: [[-2.12, 1.7], [-1.0, 1.75], [0.35, 1.76]], cab: [-2.38, -2.12, 0.35, 1.38], rc: [0.2, 0.4], p: [3.5, 3],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.04, 0.03], glass: [-2.08, 1.33], pillars: [[0.1, 0.1], [-1.25, 0.1]], trim: 'chrome',
        doors: [1.3, 0.08, -1.25], head: { y: [-0.16, -0.06], x: 0.48, d: 0.35 }, grille: { y: [0.64, -0.07], x: 0.42, d: 0.15 },
        intake: { y: [0.5, 0.6], x: 0.65, d: 0.15 }, tail: { y: [-0.22, -0.02], x: 0.62, d: 0.2, up: 0.4, rev: [0.62, 0.7] },
        cladding: 0.56, rails: true, iron: true, plate: [0.68, 0.8]
      } },
    { id: 'skapbil', name: 'Mercedes Sprinter', kind: 'Skåpbil', def: 'Sprintern', W: 2.02, L: 5.9, R: 0.38, wb: 3.66, max: 36, zero: [100, 13.5], brake: 20, rev: 7, mass: 2.3, grip: 0.9,
      colors: [0xf1f1ef, 0xd9dde0, 0x2b4f86], gears: 6, idle: 750, red: 4200, eng: 'diesel', rim: 'steel',
      shape: {
        sill: [[-2.95, 0.55], [-2.8, 0.42], [-2.4, 0.4], [2.3, 0.4], [2.7, 0.43], [2.95, 0.5]],
        belt: [[-2.95, 1.05], [-2.9, 1.12], [1.5, 1.14], [2.2, 1.06], [2.7, 0.98], [2.95, 0.82]],
        roof: [[-2.95, 2.4], [1.45, 2.42]], cab: [-2.95, -2.95, 1.45, 2.22], rc: [0.08, 0.4], p: [4, 2.8], bulge: 0.02,
        shoulder: 0.05, tumble: 0.07, crown: [0.02, 0.04, 0.03], glass: [0.62, 2.18], trim: 'gloss',
        doors: [2.18, 0.62, -0.75], head: { y: [-0.14, -0.03], x: 0.5, d: 0.35 }, grille: { y: [0.62, -0.06], x: 0.45, d: 0.12 },
        intake: { y: [0.44, 0.56], x: 1.0, d: 0.2 }, tail: { y: [0.62, -0.04], x: 0.8, d: 0.1, up: 0.32, rev: [0.8, 0.86] },
        rearWin: { d: 0.1, y: [1.5, 2.05], x: [0.08, 0.86] }, glassLevels: [1.5, 2.05], cladding: 0.6, plate: [0.5, 0.62]
      } },
    { id: 'buss', name: 'SL-buss', kind: 'Stadsbuss', def: 'bussen', W: 2.55, L: 12, R: 0.5, wb: 6.2, max: 25, zero: [50, 12], brake: 14, rev: 5, mass: 6, grip: 0.85,
      colors: [0xc8102e, 0x1f5fae], bus: true, gears: 4, idle: 600, red: 2300, eng: 'bus', rim: 'steel',
      shape: {
        sill: [[-6, 0.5], [-5.85, 0.36], [5.8, 0.33], [6, 0.42]], belt: [[-6, 1.1], [-5.9, 1.16], [5.6, 1.15], [5.95, 1.0], [6, 0.92]],
        roof: [[-6, 3.0], [6, 3.0]], cab: [-6, -6, 6, 6], rc: [0.25, 0.35], p: [3, 2.6], bulge: 0.01,
        shoulder: 0.04, tumble: 0.06, crown: [0.03, 0.03, 0.05], glass: [-5.3, 6.01], trim: 'gloss', pillarCol: 'gloss',
        pillars: [[-4.6, 0.12], [-3.85, 0.12], [-2.55, 0.12], [-1.25, 0.12], [0.05, 0.12], [1.55, 0.12], [2.85, 0.12], [4.15, 0.12]],
        busDoors: [[4.5, 5.55], [0.2, 1.4], [-3.75, -2.6]], sign: { y: 2.56, d: 0.4 }, rearWin: { d: 0.3, y: [2.0, 2.85], x: [0.1, 1.2] },
        glassLevels: [2.0, 2.56], head: { y: [0.62, 0.8], x: 0.75, d: 0.25 }, tail: { y: [0.72, -0.04], x: 0.95, d: 0.2, up: 0.6, rev: [0.95, 1.05] },
        plate: [0.55, 0.62], roofPack: true
      } },
    { id: 'sport', name: 'Porsche 911', kind: 'Sportbil', def: 'Porschen', sport: true, rearEngine: true, W: 1.85, L: 4.52, R: 0.35, wb: 2.45, max: 70, zero: [100, 4.2], brake: 32, rev: 10, mass: 1.25, grip: 1.15,
      colors: [0xf2c80f, 0xd0121b, 0xb5b8bb, 0x1f3d8f, 0xf06a14], gears: 6, idle: 950, red: 8000, eng: 'flat6', rim: 'sport',
      shape: {
        sill: [[-2.26, 0.42], [-2.05, 0.28], [-1.65, 0.24], [1.55, 0.24], [1.95, 0.26], [2.26, 0.32]],
        belt: [[-2.26, 0.8], [-2.12, 0.93], [-1.6, 0.97], [-0.6, 0.93], [0.4, 0.86], [1.3, 0.79], [1.85, 0.7], [2.26, 0.5]],
        roof: [[-0.88, 1.18], [-0.45, 1.27], [0.05, 1.28]], cab: [-1.75, -0.88, 0.05, 0.95], rc: [0.32, 0.5], p: [2.6, 2.2],
        shoulder: 0.13, tumble: 0.24, crown: [0.04, -0.05, 0.03], glass: [-1.25, 0.9], pillars: [[-0.5, 0.08]], trim: 'gloss',
        doors: [0.9, -0.55], intake: { y: [0.28, 0.42], x: 0.85, d: 0.12 }, tail: { y: [-0.1, -0.045], x: 0, d: 0.36, rev: [0.22, 0.3] },
        louvre: { z: [-2.0, -1.82], x: 0.42 }, diffuser: 0.4, lamps: [{ type: 'round', x: 0.6, z: 1.93, r: 0.115, tilt: 0.8 }], plate: [0.42, 0.55]
      } },
    { id: 'superbil', name: 'Lamborghini Huracán', kind: 'Superbil', def: 'Lamborghinin', sport: true, group: 'super', rearEngine: true, W: 1.93, L: 4.52, R: 0.35, wb: 2.62, max: 86, zero: [100, 3.2], brake: 36, rev: 10, mass: 1.3, grip: 1.25,
      colors: [0x7bd23a, 0xe8e8e8, 0xf06a14, 0xf2c80f, 0x6b2bd2], gears: 7, idle: 1050, red: 8800, eng: 'v10', rim: 'black',
      shape: {
        sill: [[-2.26, 0.4], [-2.05, 0.25], [-1.7, 0.2], [1.7, 0.2], [2.0, 0.21], [2.26, 0.25]],
        belt: [[-2.26, 0.86], [-2.05, 0.95], [-1.0, 0.95], [-0.25, 0.86], [0.6, 0.75], [1.4, 0.63], [2.0, 0.5], [2.26, 0.34]],
        roof: [[-0.55, 1.1], [-0.3, 1.155], [-0.12, 1.16]], cab: [-1.6, -0.55, -0.12, 1.05], rc: [0.25, 0.5], p: [3, 2.2],
        shoulder: 0.12, tumble: 0.26, crown: [0.02, -0.01, 0.02], glass: [-0.5, 1.0], trim: 'gloss', rearCol: 'under',
        doors: [1.0, -0.45], head: { y: [-0.075, -0.025], x: 0.42, d: 0.38 }, intake: { y: [0.24, 0.4], x: 0.95, d: 0.2 },
        sideIntake: { z: [-1.05, -0.5], y: [0.46, 0.78] }, tail: { y: [-0.12, -0.05], x: 0.3, d: 0.25, rev: [0.3, 0.38] },
        diffuser: 0.5, wing: true, plate: [0.33, 0.55]
      } },
    { id: 'muskel', name: 'Ford Mustang', kind: 'Muskelbil', def: 'Mustangen', sport: true, W: 1.92, L: 4.79, R: 0.36, wb: 2.72, max: 66, zero: [100, 4.6], brake: 28, rev: 9, mass: 1.55, grip: 1.0,
      colors: [0x1b3f8f, 0x111316, 0xa31919, 0xeeeeea, 0xf2c80f], gears: 6, idle: 700, red: 6600, eng: 'v8', rim: 'black',
      shape: {
        sill: [[-2.395, 0.46], [-2.15, 0.31], [-1.8, 0.28], [1.8, 0.28], [2.1, 0.31], [2.395, 0.37]],
        belt: [[-2.395, 0.92], [-2.3, 0.99], [-1.7, 1.01], [-0.5, 0.98], [0.8, 0.95], [1.7, 0.91], [2.2, 0.85], [2.395, 0.74]],
        roof: [[-0.78, 1.26], [-0.4, 1.35], [-0.05, 1.36]], cab: [-1.9, -0.78, -0.05, 0.88], rc: [0.22, 0.32], p: [3.5, 3.2],
        shoulder: 0.12, tumble: 0.22, crown: [0.03, 0.05, 0.03], glass: [-1.1, 0.82], pillars: [[-0.62, 0.07]], trim: 'gloss',
        doors: [0.82, -0.62], head: { y: [-0.12, -0.05], x: 0.5, d: 0.3 }, grille: { y: [0.48, -0.07], x: 0.52, d: 0.2 },
        intake: { y: [0.33, 0.43], x: 0.62, d: 0.15 }, tail: { y: [-0.17, -0.02], x: 0.36, d: 0.12, col: 'gloss' },
        lamps: [{ type: 'bars', xs: [0.48, 0.6, 0.72], w: 0.075, y: [-0.15, -0.04] }], stripes: [0.1, 0.25], plate: [0.42, 0.6]
      } },
    // the Swedish classics: the boxy Volvo 240 estate (1974–93) and the Saab 900 Turbo with its wrap-round windscreen
    { id: 'v240', name: 'Volvo 240', kind: 'Klassisk kombi', def: 'Volvo 240:n', W: 1.71, L: 4.79, R: 0.31, wb: 2.64, max: 47, zero: [100, 13.5], brake: 21, rev: 8, mass: 1.35, grip: 0.92,
      colors: [0x7a1f22, 0x2f4a6b, 0xd9d4c6, 0x1d1f22, 0x5f6a4e], gears: 4, idle: 800, red: 5800, eng: 'i4', rim: 'alloy', classic: true,
      shape: {
        sill: [[-2.395, 0.48], [-2.25, 0.34], [-1.95, 0.31], [1.95, 0.31], [2.25, 0.33], [2.395, 0.44]],
        belt: [[-2.395, 0.95], [-2.33, 1.0], [-2.0, 1.01], [0.0, 1.0], [0.95, 0.97], [1.6, 0.93], [2.2, 0.9], [2.395, 0.84]],
        roof: [[-2.3, 1.44], [-1.0, 1.46], [0.3, 1.46]], cab: [-2.36, -2.3, 0.3, 0.95], rc: [0.12, 0.16], p: [6, 6], bulge: 0.03,
        shoulder: 0.07, tumble: 0.1, crown: [0.015, 0.02, 0.02], glass: [-2.26, 0.9], pillars: [[-0.28, 0.1], [-1.4, 0.13]], trim: 'chrome',
        doors: [0.9, -0.3, -1.42], head: { y: [-0.17, -0.05], x: 0.42, d: 0.2 }, grille: { y: [0.6, -0.05], x: 0.4, d: 0.12 },
        intake: { y: [0.33, 0.45], x: 0.8, d: 0.1 }, tail: { y: [-0.42, -0.03], x: 0.6, d: 0.12, up: 0.4, rev: [0.6, 0.625] },
        cladding: 0.44, rails: true, iron: true, plate: [0.45, 0.62]
      } },
    { id: 'saab', name: 'Saab 900 Turbo', kind: 'Klassisk halvkombi', def: 'Saaben', W: 1.69, L: 4.74, R: 0.31, wb: 2.52, max: 55, zero: [100, 8.5], brake: 23, rev: 9, mass: 1.25, grip: 1.0,
      colors: [0x9b1b1b, 0x141517, 0xa8adb2, 0xe9e6dc, 0x274a3a], gears: 5, idle: 850, red: 6000, eng: 'i4t', rim: 'aero', classic: true,
      shape: {
        sill: [[-2.37, 0.45], [-2.15, 0.33], [-1.85, 0.29], [1.8, 0.29], [2.1, 0.31], [2.37, 0.38]],
        belt: [[-2.37, 0.86], [-2.25, 0.95], [-1.9, 0.98], [-0.5, 0.95], [0.6, 0.9], [1.4, 0.82], [2.0, 0.72], [2.37, 0.58]],
        roof: [[-1.25, 1.33], [-0.6, 1.4], [0.2, 1.4]], cab: [-2.2, -1.25, 0.2, 1.05], rc: [0.3, 0.4], p: [2.8, 2.4],
        shoulder: 0.1, tumble: 0.2, crown: [0.03, 0.04, 0.035], glass: [-1.75, 0.98], pillars: [[-0.32, 0.1], [-1.3, 0.12]], trim: 'gloss',
        doors: [1.0, -0.35, -1.45], head: { y: [-0.13, -0.05], x: 0.36, d: 0.3 }, grille: { y: [-0.13, -0.06], x: 0.3, d: 0.2 },
        intake: { y: [0.33, 0.45], x: 0.6, d: 0.15 }, tail: { y: [-0.16, -0.03], x: 0.4, d: 0.25, rev: [0.4, 0.48] }, plate: [0.42, 0.6]
      } },
    // Polestar 2, the electric fastback from Göteborg, with its light bar across the tail
    { id: 'polestar', name: 'Polestar 2', kind: 'Elbil', def: 'Polestaren', ev: true, W: 1.86, L: 4.61, R: 0.35, wb: 2.735, max: 57, zero: [100, 4.7], brake: 28, rev: 9, mass: 1.6, grip: 1.05,
      colors: [0xe9ecec, 0x5a5f63, 0x101113, 0x1c2a44, 0xb4b6b3], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'aero',
      shape: {
        sill: [[-2.305, 0.5], [-2.05, 0.37], [-1.75, 0.33], [1.7, 0.33], [2.0, 0.35], [2.305, 0.44]],
        belt: [[-2.305, 0.95], [-2.2, 1.04], [-1.9, 1.06], [-0.6, 1.02], [0.8, 0.97], [1.5, 0.9], [2.0, 0.82], [2.305, 0.68]],
        roof: [[-1.2, 1.42], [-0.5, 1.48], [0.15, 1.48]], cab: [-2.05, -1.2, 0.15, 1.3], rc: [0.25, 0.45], p: [3, 2.6],
        shoulder: 0.1, tumble: 0.18, crown: [0.03, 0.04, 0.03], glass: [-1.7, 1.24], pillars: [[-0.3, 0.1]], trim: 'gloss',
        roofGlass: true, roofBars: [[-0.3, 0.08]], doors: [1.22, -0.3, -1.5], handles: 'paint',
        head: { y: [-0.09, -0.04], x: 0.5, d: 0.3 }, intake: { y: [0.36, 0.48], x: 0.45, d: 0.12 },
        tail: { y: [-0.1, -0.04], x: 0, d: 0.32, rev: [0.26, 0.33] }, cladding: 0.47, plate: [0.47, 0.68]
      } },
    // Koenigsegg Jesko, the hypercar from Ängelholm: the fastest car in town by far
    { id: 'jesko', name: 'Koenigsegg Jesko', kind: 'Hyperbil', def: 'Koenigseggen', sport: true, group: 'super', rearEngine: true, W: 2.03, L: 4.61, R: 0.36, wb: 2.7, max: 105, zero: [100, 2.5], brake: 40, rev: 10, mass: 1.4, grip: 1.32,
      colors: [0xf2f2f0, 0xff6a13, 0x1d4fd8, 0x111316, 0x8a1b1b], gears: 9, idle: 1000, red: 8500, eng: 'v8', rim: 'black',
      shape: {
        sill: [[-2.305, 0.38], [-2.1, 0.24], [-1.75, 0.19], [1.75, 0.19], [2.05, 0.2], [2.305, 0.24]],
        belt: [[-2.305, 0.85], [-2.1, 0.95], [-1.1, 0.96], [-0.3, 0.88], [0.6, 0.76], [1.4, 0.64], [2.0, 0.5], [2.305, 0.34]],
        roof: [[-0.6, 1.14], [-0.3, 1.21], [-0.05, 1.21]], cab: [-1.65, -0.6, -0.05, 1.05], rc: [0.25, 0.55], p: [3, 2.1],
        shoulder: 0.14, tumble: 0.28, crown: [0.02, -0.01, 0.02], glass: [-0.55, 1.0], trim: 'gloss', rearCol: 'under',
        doors: [1.0, -0.5], head: { y: [-0.07, -0.02], x: 0.45, d: 0.4 }, intake: { y: [0.22, 0.4], x: 1.0, d: 0.2 },
        sideIntake: { z: [-1.2, -0.55], y: [0.42, 0.78] }, tail: { y: [-0.1, -0.04], x: 0.25, d: 0.25, rev: [0.25, 0.32] },
        diffuser: 0.55, wing: true, plate: [0.32, 0.55]
      } },
    // more cars from the streets of Stockholm, each to the real one's size, wheelbase, wheels, colours and lines.
    // BMW X5 (G05, 2023): the big kidney grille with chrome surrounds, slim lamps above it, the kink in the last window
    { id: 'x5', name: 'BMW X5', kind: 'SUV', def: 'BMW:n', W: 2.0, L: 4.92, R: 0.378, wb: 2.975, max: 52, zero: [100, 5.5], brake: 28, rev: 9, mass: 2.2, grip: 0.98,
      colors: [0xe8e8e4, 0x0e1013, 0x2d4a6e, 0x8d9196, 0x1a2230, 0x4c5a48], gears: 8, idle: 650, red: 6500, eng: 'i6', rim: 'alloy',
      shape: {
        sill: [[-2.46, 0.6], [-2.25, 0.47], [-1.95, 0.42], [1.9, 0.42], [2.2, 0.47], [2.46, 0.56]],
        belt: [[-2.46, 1.06], [-2.39, 1.17], [-2.1, 1.22], [-1.2, 1.22], [0.0, 1.2], [1.1, 1.18], [1.7, 1.14], [2.2, 1.08], [2.46, 0.99]],
        roof: [[-2.15, 1.67], [-1.0, 1.705], [0.35, 1.705]], cab: [-2.38, -2.15, 0.35, 1.36], rc: [0.22, 0.4], p: [3.4, 3],
        shoulder: 0.1, tumble: 0.17, crown: [0.03, 0.045, 0.04], glass: [-2.1, 1.31], pillars: [[0.05, 0.1], [-1.28, 0.12]], trim: 'chrome',
        doors: [1.31, 0.05, -1.26], handles: 'paint', head: { y: [-0.13, -0.05], x: 0.5, d: 0.3 }, kidney: { x0: 0.035, x1: 0.34, y0: 0.62, y1: 0.95 },
        intake: { y: [0.4, 0.52], x: 0.72, d: 0.15 }, tail: { y: [-0.19, -0.06], x: 0.42, d: 0.22, rev: [0.42, 0.5] }, rails: true, plate: [0.47, 0.92]
      } },
    // MG5 Electric (2021): the electric estate from MG, a closed nose with the octagon badge over a honeycomb mouth
    { id: 'mg5', name: 'MG5 Electric', kind: 'Elkombi', def: 'MG:n', ev: true, W: 1.82, L: 4.6, R: 0.323, wb: 2.665, max: 50, zero: [100, 7.7], brake: 25, rev: 9, mass: 1.55, grip: 0.98,
      colors: [0xf0f0ec, 0x1f4f9e, 0x15161a, 0xb3121b, 0xb7babd], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'alloy',
      shape: {
        sill: [[-2.3, 0.48], [-2.07, 0.35], [-1.77, 0.31], [1.72, 0.31], [2.02, 0.33], [2.3, 0.42]],
        belt: [[-2.3, 0.94], [-2.22, 1.0], [-1.92, 1.02], [0.0, 0.99], [0.9, 0.96], [1.5, 0.89], [2.02, 0.81], [2.3, 0.69]],
        roof: [[-2.02, 1.47], [-1.0, 1.5], [0.25, 1.5]], cab: [-2.22, -2.02, 0.25, 1.22], rc: [0.22, 0.44], p: [3.2, 2.6],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.035, 0.03], glass: [-1.97, 1.17], pillars: [[-0.05, 0.1], [-1.25, 0.1]], trim: 'chrome',
        doors: [1.17, -0.05, -1.22], head: { y: [-0.14, -0.06], x: 0.44, d: 0.3 }, grille: { y: [0.42, 0.56], x: 0.36, d: 0.15 },
        intake: { y: [0.34, 0.42], x: 0.6, d: 0.14 }, tail: { y: [-0.17, -0.04], x: 0.46, d: 0.22, up: 0.18, rev: [0.46, 0.53] },
        rails: true, badge: { kind: 'mg', y: 0.62 }, plate: [0.48, 0.7]
      } },
    // Tesla Model Y: the Model 3's taller crossover sister with a glass roof, Sweden's best-selling car
    { id: 'modely', name: 'Tesla Model Y', kind: 'Elbil', def: 'Model Y:n', ev: true, W: 1.92, L: 4.75, R: 0.356, wb: 2.89, max: 54, zero: [100, 5.0], brake: 27, rev: 9, mass: 1.95, grip: 1.0,
      colors: [0xf2f2f0, 0x0e0f11, 0x4a4f55, 0x1c3f7a, 0xa3121c], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'aero',
      shape: {
        sill: [[-2.375, 0.5], [-2.12, 0.38], [-1.82, 0.34], [1.82, 0.34], [2.12, 0.37], [2.375, 0.45]],
        belt: [[-2.375, 0.94], [-2.28, 1.06], [-2.0, 1.1], [-1.0, 1.07], [0.6, 1.01], [1.45, 0.91], [2.0, 0.79], [2.375, 0.64]],
        roof: [[-1.25, 1.53], [-0.5, 1.595], [0.15, 1.595]], cab: [-2.12, -1.25, 0.15, 1.36], rc: [0.3, 0.46], p: [2.8, 2.4],
        shoulder: 0.11, tumble: 0.19, crown: [0.03, 0.04, 0.03], glass: [-1.75, 1.3], pillars: [[-0.28, 0.1], [-1.44, 0.07]], trim: 'gloss',
        roofGlass: true, roofBars: [[-0.3, 0.08]], doors: [1.3, -0.28, -1.6], handles: 'paint',
        head: { y: [-0.1, -0.04], x: 0.52, d: 0.32 }, intake: { y: [0.38, 0.47], x: 0.42, d: 0.12 },
        tail: { y: [-0.12, -0.03], x: 0.36, d: 0.34, rev: [0.36, 0.44] }, plate: [0.47, 0.66]
      } },
    // Volvo XC60 (2017): Thor's hammer in the lamps, the iron mark in the grille, tail lamps up the pillars
    { id: 'xc60', name: 'Volvo XC60', kind: 'SUV', def: 'XC60:n', W: 1.9, L: 4.69, R: 0.37, wb: 2.865, max: 50, zero: [100, 7.1], brake: 26, rev: 9, mass: 1.9, grip: 0.97,
      colors: [0xeeeeea, 0x111316, 0x3d5a80, 0x5d6266, 0xb5b8b6], gears: 8, idle: 750, red: 6200, eng: 'i4t', rim: 'alloy',
      shape: {
        sill: [[-2.345, 0.6], [-2.13, 0.46], [-1.85, 0.42], [1.8, 0.42], [2.1, 0.46], [2.345, 0.54]],
        belt: [[-2.345, 1.06], [-2.28, 1.14], [-2.0, 1.16], [0.0, 1.13], [1.0, 1.1], [1.6, 1.04], [2.1, 0.97], [2.345, 0.86]],
        roof: [[-2.0, 1.6], [-0.95, 1.63], [0.3, 1.635]], cab: [-2.25, -2.0, 0.3, 1.3], rc: [0.2, 0.4], p: [3.4, 3],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.04, 0.03], glass: [-1.95, 1.25], pillars: [[0.05, 0.1], [-1.2, 0.1]], trim: 'chrome',
        doors: [1.25, 0.05, -1.2], head: { y: [-0.15, -0.06], x: 0.46, d: 0.33 }, grille: { y: [0.6, -0.07], x: 0.4, d: 0.15 },
        intake: { y: [0.46, 0.56], x: 0.62, d: 0.15 }, tail: { y: [-0.22, -0.02], x: 0.6, d: 0.2, up: 0.38, rev: [0.6, 0.68] },
        cladding: 0.52, rails: true, iron: true, plate: [0.62, 0.8]
      } },
    // Volvo XC40 Recharge: the small electric Volvo, its grille closed in the body colour, the roof black
    { id: 'xc40', name: 'Volvo XC40 Recharge', kind: 'Elbil', def: 'XC40:n', ev: true, W: 1.86, L: 4.43, R: 0.36, wb: 2.702, max: 50, zero: [100, 4.9], brake: 27, rev: 9, mass: 2.0, grip: 1.0,
      colors: [0xa31919, 0x4d5a52, 0xeeeeea, 0x8ea3b0, 0x5d6266], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'alloy',
      shape: {
        sill: [[-2.215, 0.6], [-2.0, 0.46], [-1.75, 0.42], [1.7, 0.42], [1.98, 0.46], [2.215, 0.54]],
        belt: [[-2.215, 1.08], [-2.15, 1.16], [-1.95, 1.2], [-1.42, 1.2], [-1.2, 1.13], [0.0, 1.11], [0.9, 1.08], [1.5, 1.02], [1.95, 0.96], [2.215, 0.86]],
        roof: [[-1.95, 1.6], [-0.9, 1.62], [0.25, 1.62]], cab: [-2.12, -1.95, 0.25, 1.22], rc: [0.18, 0.4], p: [3.6, 3],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.04, 0.03], glass: [-1.9, 1.17], pillars: [[0.0, 0.1], [-1.22, 0.14]], trim: 'gloss',
        roofTone: 0x111316, doors: [1.17, 0.0, -1.2], head: { y: [-0.15, -0.06], x: 0.44, d: 0.3 }, grille: { y: [0.62, -0.07], x: 0.38, d: 0.15, tone: 'body' },
        intake: { y: [0.44, 0.54], x: 0.6, d: 0.15 }, tail: { y: [-0.24, -0.02], x: 0.55, d: 0.2, up: 0.4, rev: [0.55, 0.63] },
        cladding: 0.55, rails: true, iron: true, plate: [0.6, 0.78]
      } },
    // Volkswagen ID.4: the electric family car, a light strip right across the nose and the tail
    { id: 'id4', name: 'Volkswagen ID.4', kind: 'Elbil', def: 'ID.4:an', ev: true, W: 1.85, L: 4.58, R: 0.365, wb: 2.766, max: 44, zero: [100, 8.5], brake: 25, rev: 9, mass: 2.1, grip: 0.96,
      colors: [0xeeeeea, 0x9e1a1e, 0x7d8186, 0x2a3f66, 0x111316], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'aero',
      shape: {
        sill: [[-2.29, 0.56], [-2.08, 0.43], [-1.8, 0.39], [1.78, 0.39], [2.06, 0.42], [2.29, 0.52]],
        belt: [[-2.29, 1.0], [-2.2, 1.08], [-1.95, 1.11], [-0.8, 1.08], [0.6, 1.04], [1.4, 0.96], [1.95, 0.86], [2.29, 0.72]],
        roof: [[-1.85, 1.57], [-0.8, 1.6], [0.2, 1.6]], cab: [-2.12, -1.85, 0.2, 1.3], rc: [0.24, 0.46], p: [3, 2.6],
        shoulder: 0.1, tumble: 0.17, crown: [0.03, 0.04, 0.03], glass: [-1.82, 1.25], pillars: [[-0.15, 0.1], [-1.3, 0.16]], trim: 'gloss',
        doors: [1.25, -0.15, -1.38], handles: 'paint', head: { y: [-0.12, -0.06], x: 0.0, d: 0.3 }, badge: { kind: 'vw', y: 0.76 },
        intake: { y: [0.37, 0.5], x: 0.55, d: 0.15 }, tail: { y: [-0.13, -0.05], x: 0.0, d: 0.3, rev: [0.3, 0.36] },
        cladding: 0.5, rails: true, plate: [0.5, 0.7]
      } },
    // Toyota RAV4 hybrid (2019): square arches in black plastic and a big trapezoid grille
    { id: 'rav4', name: 'Toyota RAV4', kind: 'SUV', def: 'RAV4:an', W: 1.86, L: 4.6, R: 0.363, wb: 2.69, max: 50, zero: [100, 8.1], brake: 25, rev: 9, mass: 1.7, grip: 0.96,
      colors: [0xf2f2ef, 0x111316, 0xb9bcbf, 0x6b6b55, 0xb8201c, 0x2a3e5e], gears: 6, idle: 900, red: 5800, eng: 'i4', rim: 'alloy',
      shape: {
        sill: [[-2.3, 0.62], [-2.08, 0.47], [-1.8, 0.43], [1.75, 0.43], [2.05, 0.47], [2.3, 0.58]],
        belt: [[-2.3, 1.08], [-2.22, 1.16], [-1.95, 1.18], [0.0, 1.14], [0.95, 1.1], [1.5, 1.05], [2.0, 0.98], [2.3, 0.88]],
        roof: [[-2.0, 1.63], [-0.9, 1.655], [0.25, 1.655]], cab: [-2.2, -2.0, 0.25, 1.22], rc: [0.2, 0.36], p: [3.6, 3.2],
        shoulder: 0.1, tumble: 0.15, crown: [0.03, 0.04, 0.03], glass: [-1.95, 1.17], pillars: [[0.0, 0.1], [-1.25, 0.12]], trim: 'gloss',
        doors: [1.17, 0.0, -1.22], head: { y: [-0.15, -0.05], x: 0.5, d: 0.3 }, grille: { y: [0.6, -0.08], x: 0.46, d: 0.15 },
        intake: { y: [0.42, 0.56], x: 0.75, d: 0.15 }, tail: { y: [-0.2, -0.04], x: 0.5, d: 0.22, rev: [0.5, 0.58] },
        cladding: 0.62, rails: true, badge: { kind: 'disc', y: 0.82 }, plate: [0.56, 0.8]
      } },
    // Volkswagen Passat Sportscombi (B8): the estate half the company cars in Sweden are
    { id: 'passat', name: 'VW Passat Sportscombi', kind: 'Kombi', def: 'Passaten', W: 1.83, L: 4.77, R: 0.334, wb: 2.791, max: 52, zero: [100, 8.9], brake: 25, rev: 9, mass: 1.55, grip: 0.99,
      colors: [0xeeeeea, 0x111316, 0xb9bcbf, 0x2a3e5e, 0x5a5e63], gears: 7, idle: 800, red: 4800, eng: 'diesel', rim: 'alloy',
      shape: {
        sill: [[-2.385, 0.47], [-2.15, 0.34], [-1.85, 0.3], [1.8, 0.3], [2.1, 0.32], [2.385, 0.41]],
        belt: [[-2.385, 0.9], [-2.3, 0.98], [-2.0, 0.99], [0.0, 0.96], [1.0, 0.93], [1.6, 0.86], [2.1, 0.77], [2.385, 0.66]],
        roof: [[-2.05, 1.42], [-1.0, 1.45], [0.25, 1.45]], cab: [-2.3, -2.05, 0.25, 1.22], rc: [0.2, 0.42], p: [3.5, 2.8],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.035, 0.03], glass: [-2.0, 1.17], pillars: [[0.0, 0.1], [-1.2, 0.1]], trim: 'chrome',
        doors: [1.17, 0.0, -1.22], head: { y: [-0.12, -0.05], x: 0.44, d: 0.27 }, grille: { y: [0.54, -0.05], x: 0.44, d: 0.15 }, badge: { kind: 'vw', y: 0.62 },
        intake: { y: [0.34, 0.44], x: 0.6, d: 0.15 }, tail: { y: [-0.18, -0.04], x: 0.5, d: 0.22, rev: [0.5, 0.58] }, rails: true, plate: [0.45, 0.66]
      } },
    // Hyundai Ioniq 5: square lamps made of pixels front and back, a very long wheelbase, a sharp crease down the doors
    { id: 'ioniq5', name: 'Hyundai Ioniq 5', kind: 'Elbil', def: 'Ioniqen', ev: true, W: 1.89, L: 4.635, R: 0.369, wb: 3.0, max: 51, zero: [100, 7.4], brake: 26, rev: 9, mass: 2.0, grip: 0.98,
      colors: [0xb5a684, 0x2f5d63, 0x7e9fc0, 0xeeeeea, 0x111316, 0x5c6066], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'aero',
      shape: {
        sill: [[-2.3175, 0.52], [-2.15, 0.4], [-1.85, 0.36], [1.85, 0.36], [2.15, 0.39], [2.3175, 0.47]],
        belt: [[-2.3175, 1.0], [-2.28, 1.07], [-2.05, 1.08], [-0.5, 1.05], [0.8, 1.02], [1.6, 0.95], [2.1, 0.86], [2.3175, 0.74]],
        roof: [[-2.1, 1.55], [-1.0, 1.58], [0.3, 1.58]], cab: [-2.28, -2.1, 0.3, 1.45], rc: [0.12, 0.3], p: [5, 3.6],
        shoulder: 0.1, tumble: 0.15, crown: [0.025, 0.035, 0.025], glass: [-2.05, 1.4], pillars: [[-0.1, 0.1], [-1.55, 0.18]], trim: 'gloss',
        doors: [1.4, -0.1, -1.6], handles: 'paint', head: { y: [-0.14, -0.04], x: 0.5, d: 0.25 }, intake: { y: [0.36, 0.47], x: 0.6, d: 0.14 },
        tail: { y: [-0.16, -0.04], x: 0.0, d: 0.3, col: 'gloss' }, cladding: 0.47,
        lamps: [{ type: 'pixel', front: { x: [0.56, 0.82], y: [0.68, 0.76] }, rear: { x: [0.5, 0.86], y: [0.88, 0.96] } }], plate: [0.5, 0.7]
      } },
    // Fiat 500 (2007): round as a pebble, round headlamps, a chrome moustache under the bonnet
    { id: 'fiat500', name: 'Fiat 500', kind: 'Småbil', def: 'Fiaten', W: 1.63, L: 3.57, R: 0.292, wb: 2.3, max: 44, zero: [100, 12.9], brake: 23, rev: 8, mass: 0.9, grip: 0.95,
      colors: [0xf0ece0, 0xc0181e, 0x6fa8c8, 0x15161a, 0xa8d5b5], gears: 5, idle: 850, red: 6400, eng: 'i4', rim: 'alloy',
      shape: {
        sill: [[-1.785, 0.42], [-1.6, 0.32], [-1.35, 0.29], [1.35, 0.29], [1.6, 0.31], [1.785, 0.4]],
        belt: [[-1.785, 0.86], [-1.72, 0.95], [-1.5, 0.98], [-0.5, 0.97], [0.5, 0.94], [1.1, 0.86], [1.5, 0.77], [1.785, 0.63]],
        roof: [[-1.4, 1.43], [-0.7, 1.46], [0.25, 1.46]], cab: [-1.72, -1.4, 0.25, 1.04], rc: [0.36, 0.55], p: [2.4, 2.2], bulge: 0.08,
        shoulder: 0.1, tumble: 0.18, crown: [0.03, 0.04, 0.03], glass: [-1.33, 0.99], pillars: [[-0.42, 0.08]], trim: 'chrome',
        doors: [0.99, -0.42], head: { y: [-0.09, -0.04], x: 0.5, d: 0.25 }, intake: { y: [0.36, 0.46], x: 0.45, d: 0.12 },
        lamps: [{ type: 'face', x: 0.56, y: 0.64, r: 0.1, ring: 'paint' }], badge: { kind: 'bar', y: 0.72, w: 0.46 },
        tail: { y: [-0.2, -0.04], x: 0.5, d: 0.2, rev: [0.5, 0.56] }, plate: [0.44, 0.7]
      } },
    // Mini Cooper S (F56): round lamps, a hexagonal grille, black pillars under a roof in a contrasting colour
    { id: 'mini', name: 'Mini Cooper S', kind: 'Småbil', def: 'Minin', W: 1.73, L: 3.85, R: 0.308, wb: 2.495, max: 56, zero: [100, 6.8], brake: 27, rev: 9, mass: 1.0, grip: 1.06,
      colors: [0xb5121b, 0x1f3d2c, 0xe8e6dc, 0x15171a, 0x2a5fb0], gears: 7, idle: 800, red: 6500, eng: 'i4t', rim: 'alloy',
      shape: {
        sill: [[-1.925, 0.42], [-1.72, 0.31], [-1.45, 0.27], [1.45, 0.27], [1.7, 0.3], [1.925, 0.38]],
        belt: [[-1.925, 0.86], [-1.85, 0.96], [-1.6, 0.99], [-0.5, 0.98], [0.6, 0.96], [1.2, 0.9], [1.6, 0.8], [1.925, 0.66]],
        roof: [[-1.76, 1.37], [-0.8, 1.39], [0.35, 1.39]], cab: [-1.84, -1.76, 0.35, 1.0], rc: [0.2, 0.42], p: [3.4, 2.6],
        shoulder: 0.09, tumble: 0.12, crown: [0.02, 0.04, 0.02], glass: [-1.72, 0.95], pillars: [[-0.38, 0.1], [-1.42, 0.16]], trim: 'gloss',
        roofTone: 'contrast', doors: [0.95, -0.38], grille: { y: [0.42, -0.08], x: 0.38, d: 0.14 },
        lamps: [{ type: 'face', x: 0.56, y: 0.73, r: 0.125, ring: 'gloss', ind: true }], badge: { kind: 'disc', y: 0.62 },
        intake: { y: [0.3, 0.4], x: 0.6, d: 0.12 }, tail: { y: [-0.2, -0.05], x: 0.45, d: 0.2, rev: [0.45, 0.5] }, plate: [0.36, 0.66]
      } },
    // Volvo V70 (2000–2007): the estate of the 2000s, its tail lamps all the way up the back
    { id: 'v70', name: 'Volvo V70', kind: 'Kombi', def: 'V70:n', W: 1.8, L: 4.71, R: 0.316, wb: 2.755, max: 54, zero: [100, 7.8], brake: 24, rev: 9, mass: 1.5, grip: 0.97,
      colors: [0xb3b6b8, 0x111316, 0x2a3d58, 0x7a1f22, 0x5a6146], gears: 5, idle: 800, red: 6200, eng: 'i5', rim: 'alloy', classic: true,
      shape: {
        sill: [[-2.355, 0.46], [-2.15, 0.34], [-1.85, 0.3], [1.8, 0.3], [2.1, 0.32], [2.355, 0.4]],
        belt: [[-2.355, 0.93], [-2.29, 1.0], [-2.0, 1.01], [0.0, 0.98], [1.0, 0.95], [1.6, 0.89], [2.1, 0.82], [2.355, 0.7]],
        roof: [[-2.1, 1.43], [-1.0, 1.46], [0.25, 1.46]], cab: [-2.3, -2.1, 0.25, 1.2], rc: [0.18, 0.38], p: [3.8, 3],
        shoulder: 0.09, tumble: 0.14, crown: [0.025, 0.03, 0.03], glass: [-2.05, 1.15], pillars: [[0.0, 0.1], [-1.22, 0.12]], trim: 'chrome',
        doors: [1.15, 0.0, -1.24], head: { y: [-0.16, -0.06], x: 0.45, d: 0.26 }, grille: { y: [0.56, -0.06], x: 0.36, d: 0.15 },
        intake: { y: [0.36, 0.46], x: 0.6, d: 0.15 }, tail: { y: [-0.3, -0.02], x: 0.55, d: 0.2, up: 0.42, rev: [0.55, 0.62] },
        cladding: 0.42, rails: true, iron: true, plate: [0.45, 0.66]
      } },
    // Saab 9-5 SportCombi (2006): the estate from Trollhättan, the three-hole nose
    { id: 'saab95', name: 'Saab 9-5 SportCombi', kind: 'Kombi', def: 'Saab 9-5:an', W: 1.79, L: 4.84, R: 0.321, wb: 2.703, max: 55, zero: [100, 8.9], brake: 24, rev: 9, mass: 1.55, grip: 0.98,
      colors: [0x5c6166, 0xb3b6b8, 0x111316, 0xa01a1a, 0x1e2c4c], gears: 5, idle: 850, red: 6200, eng: 'i4t', rim: 'alloy', classic: true,
      shape: {
        sill: [[-2.42, 0.46], [-2.2, 0.34], [-1.85, 0.3], [1.8, 0.3], [2.1, 0.32], [2.42, 0.4]],
        belt: [[-2.42, 0.92], [-2.35, 1.0], [-2.05, 1.01], [0.0, 0.97], [1.0, 0.94], [1.65, 0.87], [2.15, 0.79], [2.42, 0.66]],
        roof: [[-2.15, 1.43], [-1.0, 1.46], [0.2, 1.46]], cab: [-2.35, -2.15, 0.2, 1.18], rc: [0.22, 0.42], p: [3.4, 2.7],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.035, 0.03], glass: [-2.1, 1.12], pillars: [[-0.02, 0.1], [-1.25, 0.12]], trim: 'chrome',
        doors: [1.12, -0.02, -1.26], head: { y: [-0.14, -0.05], x: 0.42, d: 0.3 }, grille: { y: [0.56, -0.05], x: 0.3, d: 0.15 }, badge: { kind: 'disc', y: 0.64 },
        intake: { y: [0.34, 0.45], x: 0.6, d: 0.15 }, tail: { y: [-0.16, -0.03], x: 0.5, d: 0.22, rev: [0.5, 0.56] }, rails: true, plate: [0.45, 0.66]
      } },
    // Mercedes-AMG G 63 (2018): the square G-Class, round lamps, upright grille bars, indicators on top of the wings,
    // the spare wheel on the back door and the pipes out of the sides
    { id: 'g63', name: 'Mercedes-AMG G 63', kind: 'Terrängbil', def: 'G-klassen', sport: true, W: 1.98, L: 4.66, R: 0.39, wb: 2.89, max: 61, zero: [100, 4.5], brake: 30, rev: 9, mass: 2.55, grip: 0.95,
      colors: [0x0e0f11, 0xf2f2ef, 0x5a5e62, 0x7d8186, 0x4a4f3c], gears: 9, idle: 650, red: 6500, eng: 'v8', rim: 'black',
      shape: {
        sill: [[-2.33, 0.56], [-2.2, 0.5], [-1.85, 0.46], [1.85, 0.46], [2.2, 0.5], [2.33, 0.6]],
        belt: [[-2.33, 1.22], [-2.27, 1.26], [-1.9, 1.27], [0.0, 1.27], [1.3, 1.26], [1.95, 1.25], [2.33, 1.18]],
        roof: [[-2.22, 1.925], [-1.0, 1.935], [0.62, 1.935]], cab: [-2.28, -2.22, 0.62, 0.86], rc: [0.08, 0.1], p: [8, 8], bulge: 0,
        shoulder: 0.05, tumble: 0.05, crown: [0.01, 0.01, 0.02], glass: [-2.18, 0.82], pillars: [[-0.35, 0.12], [-1.42, 0.12]], trim: 'chrome',
        doors: [0.82, -0.35, -1.42], grille: { y: [0.66, -0.05], x: 0.46, d: 0.1 }, grilleBars: { n: 14, x: 0.44, y: [0.7, 1.12] }, badge: { kind: 'star', y: 0.92 },
        lamps: [{ type: 'face', x: 0.66, y: 0.98, r: 0.12, ring: 'gloss' }, { type: 'pod', x: 0.82, z: 2.1 }],
        intake: { y: [0.46, 0.62], x: 0.78, d: 0.12 }, tail: { y: [0.72, 1.08], x: 0.8, d: 0.12, rev: [0.8, 0.86] },
        spare: { y: 1.08, col: 'paint' }, sidePipes: true, plate: [0.52, 0.62]
      } },
    // Porsche Taycan Turbo S: the electric Porsche, low and wide, four points of light in each lamp, a bar across the tail
    { id: 'taycan', name: 'Porsche Taycan', kind: 'Elsportbil', def: 'Taycanen', sport: true, ev: true, W: 1.97, L: 4.96, R: 0.36, wb: 2.9, max: 72, zero: [100, 2.8], brake: 36, rev: 10, mass: 2.3, grip: 1.2,
      colors: [0xeceae4, 0x8fb6cf, 0x1f3c74, 0x2f4a3c, 0x6d6a65, 0x6b1422], gears: 1, idle: 0, red: 16000, eng: 'ev', rim: 'sport',
      shape: {
        sill: [[-2.48, 0.4], [-2.25, 0.28], [-1.9, 0.24], [1.9, 0.24], [2.2, 0.26], [2.48, 0.32]],
        belt: [[-2.48, 0.84], [-2.35, 0.94], [-2.0, 0.97], [-0.6, 0.92], [0.5, 0.86], [1.4, 0.78], [2.0, 0.69], [2.48, 0.5]],
        roof: [[-1.05, 1.31], [-0.45, 1.355], [0.1, 1.355]], cab: [-2.0, -1.05, 0.1, 1.15], rc: [0.32, 0.5], p: [2.6, 2.2],
        shoulder: 0.13, tumble: 0.23, crown: [0.04, -0.04, 0.03], glass: [-1.7, 1.1], pillars: [[-0.35, 0.08]], trim: 'gloss',
        roofGlass: true, doors: [1.1, -0.35, -1.5], handles: 'paint', head: { y: [-0.1, -0.035], x: 0.62, d: 0.3 },
        lamps: [{ type: 'dots', x: 0.75, y: 0.6, s: 0.035 }], intake: { y: [0.28, 0.4], x: 0.85, d: 0.12 },
        tail: { y: [-0.1, -0.04], x: 0, d: 0.34, rev: [0.25, 0.32] }, diffuser: 0.38, plate: [0.4, 0.55]
      } },
    // Ferrari F8 Tributo: the mid-engined V8 Ferrari, louvres over the engine and two round tail lamps a side
    { id: 'f8', name: 'Ferrari F8 Tributo', kind: 'Superbil', def: 'Ferrarin', sport: true, group: 'super', rearEngine: true, W: 1.98, L: 4.61, R: 0.345, wb: 2.65, max: 94, zero: [100, 2.9], brake: 38, rev: 10, mass: 1.35, grip: 1.28,
      colors: [0xd40000, 0xf6d000, 0xf2f2ee, 0x111214, 0x1d3c7c], gears: 7, idle: 1000, red: 8000, eng: 'v8flat', rim: 'sport',
      shape: {
        sill: [[-2.305, 0.38], [-2.1, 0.24], [-1.75, 0.18], [1.75, 0.18], [2.05, 0.2], [2.305, 0.25]],
        belt: [[-2.305, 0.88], [-2.1, 0.97], [-1.2, 0.98], [-0.3, 0.88], [0.5, 0.74], [1.3, 0.62], [1.95, 0.5], [2.305, 0.34]],
        roof: [[-0.6, 1.14], [-0.3, 1.2], [-0.1, 1.205]], cab: [-1.75, -0.6, -0.1, 1.0], rc: [0.26, 0.5], p: [3, 2.2],
        shoulder: 0.13, tumble: 0.27, crown: [0.02, -0.02, 0.02], glass: [-0.55, 0.95], trim: 'gloss', rearCol: 'under',
        doors: [0.95, -0.45], head: { y: [-0.07, -0.025], x: 0.5, d: 0.36 }, intake: { y: [0.24, 0.38], x: 0.9, d: 0.2 },
        sideIntake: { z: [-0.95, -0.45], y: [0.45, 0.75] }, louvre: { z: [-2.0, -1.8], x: 0.5 },
        lamps: [{ type: 'tailRound', xs: [0.6, 0.8], y: 0.8, r: 0.065 }], tail: { y: [-0.1, -0.05], x: 2, d: 0.2 }, diffuser: 0.45, plate: [0.3, 0.55]
      } },
    // Ferrari F40 (1987): the last Ferrari Enzo Ferrari saw built, a 2.9-litre twin-turbo V8 behind the seats in a body
    // of kevlar and carbon, 1 100 kg, 324 km/h. Only ever in rosso corsa: a low flat nose with the lamps behind clear
    // covers at its corners and two NACA ducts in the bonnet, a duct in the rear wing behind each door, the slotted Lexan
    // engine cover, the full-width wing carried on the rear wings, four round lamps in the black mesh of the tail, three
    // pipes in the middle of it and five-spoke Speedline wheels with a centre nut. Red cloth seats inside, five gears.
    { id: 'f40', name: 'Ferrari F40', kind: 'Superbil', def: 'F40:n', sport: true, group: 'super', rearEngine: true, W: 1.97, L: 4.358, R: 0.325, wb: 2.45, max: 90, zero: [100, 4.1], brake: 34, rev: 10, mass: 1.1, grip: 1.18,
      colors: [0xc8100c], gears: 5, idle: 1000, red: 7750, eng: 'f40', rim: 'f40', lag: true,
      shape: {
        sill: [[-2.179, 0.36], [-2.02, 0.24], [-1.65, 0.16], [1.6, 0.15], [1.98, 0.16], [2.179, 0.2]],
        belt: [[-2.179, 0.93], [-2.06, 0.96], [-1.5, 0.98], [-1.0, 0.95], [-0.55, 0.88], [0.0, 0.83], [0.55, 0.79], [1.0, 0.745], [1.5, 0.685], [1.95, 0.6], [2.179, 0.5]],
        roof: [[-0.78, 1.075], [-0.45, 1.118], [-0.1, 1.124]], cab: [-1.95, -0.78, -0.1, 0.55], rc: [0.14, 0.36], p: [4.5, 3], bulge: 0.04,
        shoulder: 0.14, tumble: 0.25, crown: [0.015, -0.025, 0.02], glass: [-0.74, 0.52], pillars: [[-0.36, 0.06]], trim: 'gloss', rearCol: 'lexan',
        doors: [0.84, -0.42], handles: 'paint', head: { y: [0.42, 0.51], x: 0.44, d: 0.32 }, intake: { y: [0.19, 0.35], x: 0.74, d: 0.22 },
        sideIntake: { z: [-0.94, -0.62], y: [0.54, 0.72] }, tail: { y: [0.64, 0.9], x: 0, d: 0.14, col: 'under' }, cladding: 0.22, diffuser: 0.4,
        f40: { tail: [[0.31, 'red'], [0.53, 'amber']], lampY: 0.77, lampR: 0.075, wingY: 1.13 }, seatCol: 0xa8141a, plate: [0.3, 0.79]
      } },
    // Audi RS 6 Avant (C8): the 600-horsepower estate, wide arches, a black grille with the four rings
    { id: 'rs6', name: 'Audi RS 6 Avant', kind: 'Sportkombi', def: 'RS 6:an', sport: true, W: 1.95, L: 5.0, R: 0.365, wb: 2.928, max: 75, zero: [100, 3.6], brake: 34, rev: 9, mass: 2.1, grip: 1.12,
      colors: [0x8b8c88, 0x101113, 0xeeeeea, 0x1c2a44, 0xb3121b], gears: 8, idle: 750, red: 6800, eng: 'v8', rim: 'black',
      shape: {
        sill: [[-2.5, 0.45], [-2.27, 0.32], [-1.95, 0.27], [1.9, 0.27], [2.2, 0.29], [2.5, 0.37]],
        belt: [[-2.5, 0.92], [-2.42, 0.99], [-2.1, 1.0], [0.0, 0.97], [1.0, 0.94], [1.65, 0.87], [2.2, 0.78], [2.5, 0.64]],
        roof: [[-2.15, 1.4], [-1.0, 1.43], [0.25, 1.435]], cab: [-2.35, -2.15, 0.25, 1.3], rc: [0.22, 0.42], p: [3.4, 2.8],
        shoulder: 0.11, tumble: 0.17, crown: [0.03, 0.035, 0.025], glass: [-2.1, 1.25], pillars: [[0.02, 0.1], [-1.25, 0.12]], trim: 'gloss',
        doors: [1.25, 0.02, -1.25], head: { y: [-0.12, -0.05], x: 0.5, d: 0.3 }, grille: { y: [0.42, -0.06], x: 0.46, d: 0.15 }, badge: { kind: 'rings', y: 0.66 },
        intake: { y: [0.3, 0.42], x: 0.85, d: 0.15 }, tail: { y: [-0.14, -0.04], x: 0, d: 0.25, rev: [0.3, 0.36] }, diffuser: 0.4, rails: true, plate: [0.47, 0.62]
      } },
    // Twenty more sports cars, each to the real one's size, wheelbase, weight, power and lines. The supercars first:
    // Ferrari LaFerrari (2013), the hybrid V12 hypercar from Maranello: 963 hp, its nose sharp and low, its tail a wide
    // black diffuser under two round lamps a side
    { id: 'laferrari', name: 'Ferrari LaFerrari', kind: 'Hyperbil', def: 'LaFerrarin', sport: true, group: 'super', rearEngine: true, W: 1.99, L: 4.702, R: 0.345, wb: 2.65, max: 97, zero: [100, 2.4], brake: 40, rev: 10, mass: 1.4, grip: 1.3,
      colors: [0xc8100c, 0xf6d000, 0x111214, 0xf2f2ee], gears: 7, idle: 1000, red: 9250, eng: 'v12', rim: 'black',
      shape: {
        sill: [[-2.351, 0.36], [-2.15, 0.22], [-1.8, 0.17], [1.8, 0.17], [2.1, 0.19], [2.351, 0.24]],
        belt: [[-2.351, 0.86], [-2.15, 0.95], [-1.25, 0.96], [-0.35, 0.86], [0.45, 0.72], [1.25, 0.6], [1.95, 0.47], [2.351, 0.3]],
        roof: [[-0.62, 1.06], [-0.3, 1.1], [-0.08, 1.1]], cab: [-1.85, -0.62, -0.08, 1.02], rc: [0.25, 0.55], p: [3, 2.1],
        shoulder: 0.14, tumble: 0.28, crown: [0.02, -0.01, 0.015], glass: [-0.6, 0.98], trim: 'gloss', rearCol: 'under',
        doors: [0.98, -0.5], head: { y: [-0.07, -0.02], x: 0.5, d: 0.36 }, intake: { y: [0.22, 0.38], x: 1.0, d: 0.2 },
        sideIntake: { z: [-1.1, -0.55], y: [0.4, 0.74] }, lamps: [{ type: 'tailRound', xs: [0.62, 0.82], y: 0.78, r: 0.07 }], tail: { y: [-0.1, -0.05], x: 2, d: 0.2 },
        diffuser: 0.5, pipes: [[-0.1, 0.5], [0.1, 0.5]], plate: [0.3, 0.5]
      } },
    // Porsche 911 GT3 RS (992, 2023): the track 911 with 525 hp from a flat six that revs to 9 000, vents on the wings and
    // a huge wing on swan necks
    { id: 'gt3rs', name: 'Porsche 911 GT3 RS', kind: 'Banbil', def: 'GT3 RS:en', sport: true, group: 'super', rearEngine: true, W: 1.9, L: 4.572, R: 0.36, wb: 2.457, max: 82, zero: [100, 3.2], brake: 38, rev: 10, mass: 1.3, grip: 1.32,
      colors: [0x9fcf3a, 0xf2f2ee, 0xd0121b, 0x1e6ec8, 0x111214], gears: 7, idle: 950, red: 9000, eng: 'flat6', rim: 'black',
      shape: {
        sill: [[-2.286, 0.4], [-2.07, 0.26], [-1.67, 0.22], [1.57, 0.22], [1.97, 0.24], [2.286, 0.3]],
        belt: [[-2.286, 0.8], [-2.14, 0.93], [-1.62, 0.97], [-0.6, 0.93], [0.4, 0.86], [1.31, 0.79], [1.87, 0.7], [2.286, 0.5]],
        roof: [[-0.88, 1.2], [-0.45, 1.29], [0.05, 1.3]], cab: [-1.75, -0.88, 0.05, 0.95], rc: [0.32, 0.5], p: [2.6, 2.2],
        shoulder: 0.13, tumble: 0.24, crown: [0.04, -0.05, 0.03], glass: [-1.25, 0.9], pillars: [[-0.5, 0.08]], trim: 'gloss',
        doors: [0.9, -0.55], intake: { y: [0.25, 0.42], x: 0.9, d: 0.12 }, tail: { y: [-0.1, -0.045], x: 0, d: 0.36, rev: [0.22, 0.3] },
        louvre: { z: [1.15, 1.55], x: 0.55 }, diffuser: 0.42, wing: { h: 0.46, z: 0.34, chord: 0.42, posts: 0.3 },
        lamps: [{ type: 'round', x: 0.6, z: 1.95, r: 0.115, tilt: 0.8 }], plate: [0.42, 0.55]
      } },
    // Lamborghini Aventador (LP 700-4): the V12 wedge, Y-shaped lamps, the big intakes in its flanks, a wing on the tail
    { id: 'aventador', name: 'Lamborghini Aventador', kind: 'Superbil', def: 'Aventadoren', sport: true, group: 'super', rearEngine: true, W: 2.03, L: 4.78, R: 0.36, wb: 2.7, max: 97, zero: [100, 2.9], brake: 40, rev: 10, mass: 1.55, grip: 1.28,
      colors: [0xf06a14, 0x7bd23a, 0xf2c80f, 0xe8e8e8, 0x111316], gears: 7, idle: 1000, red: 8500, eng: 'v12', rim: 'black',
      shape: {
        sill: [[-2.39, 0.38], [-2.18, 0.24], [-1.8, 0.19], [1.8, 0.19], [2.1, 0.2], [2.39, 0.24]],
        belt: [[-2.39, 0.88], [-2.15, 0.96], [-1.05, 0.96], [-0.3, 0.86], [0.6, 0.72], [1.45, 0.6], [2.05, 0.47], [2.39, 0.3]],
        roof: [[-0.6, 1.08], [-0.32, 1.12], [-0.12, 1.12]], cab: [-1.7, -0.6, -0.12, 1.1], rc: [0.25, 0.5], p: [3.2, 2.0],
        shoulder: 0.12, tumble: 0.28, crown: [0.02, -0.01, 0.015], glass: [-0.55, 1.05], trim: 'gloss', rearCol: 'under',
        doors: [1.05, -0.5], head: { y: [-0.08, -0.03], x: 0.45, d: 0.36 }, intake: { y: [0.22, 0.4], x: 1.0, d: 0.22 },
        sideIntake: { z: [-1.2, -0.55], y: [0.42, 0.82] }, tail: { y: [-0.12, -0.05], x: 0.3, d: 0.25, rev: [0.3, 0.38] },
        louvre: { z: [-1.9, -1.6], x: 0.55 }, diffuser: 0.5, wing: true, pipes: [[0, 0.62]], plate: [0.33, 0.55]
      } },
    // McLaren 720S: the twin-turbo V8 from Woking, the lamps set in deep sockets, a teardrop of glass over the cabin
    { id: 'mclaren720', name: 'McLaren 720S', kind: 'Superbil', def: 'McLarenen', sport: true, group: 'super', rearEngine: true, W: 1.93, L: 4.543, R: 0.35, wb: 2.67, max: 95, zero: [100, 2.9], brake: 40, rev: 10, mass: 1.3, grip: 1.28,
      colors: [0xf28b1c, 0xb5b8bb, 0x1f4fae, 0xf2f2ee, 0x111316], gears: 7, idle: 950, red: 8200, eng: 'v8flat', rim: 'sport',
      shape: {
        sill: [[-2.27, 0.38], [-2.06, 0.23], [-1.75, 0.18], [1.75, 0.18], [2.03, 0.2], [2.27, 0.25]],
        belt: [[-2.27, 0.86], [-2.06, 0.95], [-1.2, 0.96], [-0.35, 0.86], [0.5, 0.73], [1.3, 0.61], [1.9, 0.49], [2.27, 0.33]],
        roof: [[-0.75, 1.14], [-0.4, 1.18], [-0.1, 1.18]], cab: [-2.0, -0.75, -0.1, 1.05], rc: [0.28, 0.55], p: [2.8, 2.0],
        shoulder: 0.16, tumble: 0.3, crown: [0.02, -0.01, 0.02], glass: [-1.2, 1.0], pillars: [[-0.6, 0.1]], trim: 'gloss', rearCol: 'gloss',
        doors: [1.0, -0.4], head: { y: [-0.09, -0.02], x: 0.55, d: 0.32 }, intake: { y: [0.22, 0.36], x: 0.95, d: 0.2 },
        sideIntake: { z: [-0.95, -0.5], y: [0.42, 0.7] }, tail: { y: [-0.09, -0.04], x: 0.25, d: 0.22, rev: [0.25, 0.32] }, diffuser: 0.5, plate: [0.3, 0.5]
      } },
    // Bugatti Chiron: the W16 with four turbos, 1 500 hp, 420 km/h, the fastest thing in town; the horseshoe grille
    // in the middle of the nose and a light bar across the whole tail
    { id: 'chiron', name: 'Bugatti Chiron', kind: 'Hyperbil', def: 'Chironen', sport: true, group: 'super', rearEngine: true, W: 2.04, L: 4.544, R: 0.37, wb: 2.711, max: 117, zero: [100, 2.4], brake: 42, rev: 10, mass: 2.0, grip: 1.3,
      colors: [0x1d3c7c, 0x111214, 0xf2f2ee, 0x8a1b1b, 0xb5b8bb], gears: 7, idle: 900, red: 6800, eng: 'w16', rim: 'sport',
      shape: {
        sill: [[-2.272, 0.4], [-2.06, 0.25], [-1.75, 0.2], [1.75, 0.2], [2.04, 0.22], [2.272, 0.28]],
        belt: [[-2.272, 0.92], [-2.08, 0.98], [-1.2, 0.99], [-0.4, 0.9], [0.5, 0.78], [1.3, 0.68], [1.9, 0.56], [2.272, 0.42]],
        roof: [[-0.8, 1.15], [-0.45, 1.19], [-0.1, 1.19]], cab: [-1.65, -0.8, -0.1, 1.0], rc: [0.3, 0.5], p: [2.6, 2.2],
        shoulder: 0.15, tumble: 0.27, crown: [0.02, 0.0, 0.02], glass: [-0.75, 0.95], trim: 'chrome', rearCol: 'under',
        doors: [0.95, -0.55], head: { y: [-0.1, -0.03], x: 0.55, d: 0.3 }, grille: { y: [0.62, -0.06], x: 0.22, d: 0.12 },
        intake: { y: [0.25, 0.45], x: 1.0, d: 0.18 }, sideIntake: { z: [-0.95, -0.5], y: [0.5, 0.85] }, tail: { y: [-0.1, -0.05], x: 0, d: 0.18, rev: [0.2, 0.28] },
        badge: { kind: 'bar', y: 0.5, w: 0.0001 }, diffuser: 0.5, pipes: [[-0.12, 0.42], [0.12, 0.42], [-0.12, 0.54], [0.12, 0.54]], plate: [0.3, 0.6]
      } },
    // Aston Martin DBS Superleggera: the V12 grand tourer, a long bonnet, the wide grille, a short fastback
    { id: 'dbs', name: 'Aston Martin DBS', kind: 'Sportcoupé', def: 'Aston Martin:en', sport: true, group: 'super', W: 1.97, L: 4.712, R: 0.37, wb: 2.805, max: 94, zero: [100, 3.4], brake: 38, rev: 10, mass: 1.85, grip: 1.18,
      colors: [0x1f4a37, 0xb5b8bb, 0x111214, 0xf2f2ee, 0x8a1b1b], gears: 8, idle: 800, red: 7000, eng: 'v12t', rim: 'sport',
      shape: {
        sill: [[-2.356, 0.42], [-2.15, 0.28], [-1.85, 0.24], [1.8, 0.24], [2.1, 0.26], [2.356, 0.33]],
        belt: [[-2.356, 0.86], [-2.25, 0.94], [-1.8, 0.97], [-0.8, 0.92], [0.3, 0.86], [1.2, 0.8], [1.9, 0.72], [2.356, 0.55]],
        roof: [[-0.95, 1.22], [-0.5, 1.26], [-0.1, 1.27]], cab: [-1.75, -0.95, -0.1, 0.65], rc: [0.25, 0.45], p: [3, 2.6],
        shoulder: 0.13, tumble: 0.24, crown: [0.03, 0.02, 0.02], glass: [-1.15, 0.6], pillars: [[-0.75, 0.06]], trim: 'chrome',
        doors: [0.6, -0.55], head: { y: [-0.12, -0.05], x: 0.5, d: 0.3 }, grille: { y: [0.55, -0.08], x: 0.5, d: 0.16 },
        intake: { y: [0.25, 0.4], x: 0.85, d: 0.12 }, tail: { y: [-0.12, -0.04], x: 0.25, d: 0.2, rev: [0.25, 0.32] }, diffuser: 0.4, plate: [0.4, 0.58]
      } },
    // Chevrolet Corvette Z06 (C8, 2023): the mid-engined Corvette, a flat-plane V8 of 670 hp, four pipes in the middle
    { id: 'z06', name: 'Corvette Z06', kind: 'Superbil', def: 'Corvetten', sport: true, group: 'super', rearEngine: true, W: 2.03, L: 4.685, R: 0.36, wb: 2.722, max: 87, zero: [100, 2.6], brake: 38, rev: 10, mass: 1.6, grip: 1.25,
      colors: [0xc8102e, 0xf2c80f, 0xeeeeea, 0x111316, 0x1f4fae], gears: 8, idle: 900, red: 8600, eng: 'v8flat', rim: 'black',
      shape: {
        sill: [[-2.34, 0.4], [-2.13, 0.25], [-1.8, 0.2], [1.8, 0.2], [2.1, 0.21], [2.34, 0.26]],
        belt: [[-2.34, 0.9], [-2.15, 0.98], [-1.25, 0.98], [-0.35, 0.88], [0.5, 0.76], [1.3, 0.65], [1.95, 0.52], [2.34, 0.36]],
        roof: [[-0.7, 1.17], [-0.35, 1.21], [-0.08, 1.21]], cab: [-1.7, -0.7, -0.08, 1.0], rc: [0.22, 0.5], p: [3.5, 2.3],
        shoulder: 0.14, tumble: 0.27, crown: [0.02, -0.01, 0.02], glass: [-0.65, 0.95], trim: 'gloss', rearCol: 'gloss',
        doors: [0.95, -0.45], head: { y: [-0.08, -0.03], x: 0.5, d: 0.35 }, intake: { y: [0.22, 0.4], x: 0.95, d: 0.2 },
        sideIntake: { z: [-1.1, -0.5], y: [0.42, 0.78] }, tail: { y: [-0.11, -0.04], x: 0.3, d: 0.22, rev: [0.3, 0.38] }, diffuser: 0.45, wing: true,
        pipes: [[-0.28, 0.42], [-0.16, 0.42], [0.16, 0.42], [0.28, 0.42]], plate: [0.3, 0.55]
      } },
    // Pagani Huayra, my first own pick: the hand-built hypercar with an AMG twin-turbo V12, gullwing doors, round curves, and four pipes in a
    // cluster in the middle of the tail
    { id: 'huayra', name: 'Pagani Huayra', kind: 'Hyperbil', def: 'Huayran', sport: true, group: 'super', rearEngine: true, W: 2.04, L: 4.605, R: 0.36, wb: 2.795, max: 106, zero: [100, 3.0], brake: 40, rev: 10, mass: 1.35, grip: 1.3,
      colors: [0x2b2e33, 0x1d4fd8, 0xb5b8bb, 0xf2f2ee, 0x8a1b1b], gears: 7, idle: 900, red: 6500, eng: 'v12t', rim: 'sport',
      shape: {
        sill: [[-2.3, 0.38], [-2.1, 0.24], [-1.8, 0.19], [1.8, 0.19], [2.08, 0.21], [2.3, 0.26]],
        belt: [[-2.3, 0.88], [-2.1, 0.96], [-1.2, 0.97], [-0.4, 0.88], [0.4, 0.76], [1.2, 0.64], [1.85, 0.52], [2.3, 0.36]],
        roof: [[-0.75, 1.12], [-0.4, 1.15], [-0.1, 1.15]], cab: [-1.75, -0.75, -0.1, 1.0], rc: [0.3, 0.6], p: [2.6, 1.9], bulge: 0.08,
        shoulder: 0.16, tumble: 0.3, crown: [0.02, -0.01, 0.02], glass: [-0.7, 0.95], trim: 'chrome', rearCol: 'gloss',
        doors: [0.95, -0.45], head: { y: [-0.07, -0.02], x: 0.5, d: 0.4 }, intake: { y: [0.22, 0.38], x: 0.9, d: 0.2 },
        sideIntake: { z: [-1.1, -0.6], y: [0.45, 0.75] }, lamps: [{ type: 'tailRound', xs: [0.75], y: 0.72, r: 0.06 }], tail: { y: [-0.1, -0.05], x: 2, d: 0.2 },
        diffuser: 0.5, pipes: [[-0.07, 0.58], [0.07, 0.58], [-0.07, 0.7], [0.07, 0.7]], plate: [0.3, 0.45]
      } },
    // The classics. Lamborghini Countach (LP5000 QV): the wedge off every bedroom wall of the 1980s, its lamps hidden,
    // the NACA ducts in its flanks, the slatted engine cover and the big wing
    { id: 'countach', name: 'Lamborghini Countach', kind: 'Klassiker', def: 'Countachen', sport: true, classic: true, group: 'classic', rearEngine: true, W: 2.0, L: 4.14, R: 0.34, wb: 2.45, max: 82, zero: [100, 4.9], brake: 32, rev: 9, mass: 1.45, grip: 1.12,
      colors: [0xc8102e, 0xf2f2ee, 0x111316, 0xf2c80f], gears: 5, idle: 950, red: 7600, eng: 'v12', rim: 'sport',
      shape: {
        sill: [[-2.07, 0.4], [-1.87, 0.25], [-1.55, 0.2], [1.55, 0.2], [1.85, 0.21], [2.07, 0.24]],
        belt: [[-2.07, 0.86], [-1.9, 0.94], [-1.0, 0.94], [-0.4, 0.86], [0.4, 0.72], [1.2, 0.58], [1.8, 0.47], [2.07, 0.38]],
        roof: [[-0.65, 1.03], [-0.35, 1.05], [-0.15, 1.05]], cab: [-1.2, -0.65, -0.15, 1.05], rc: [0.12, 0.22], p: [5, 4],
        shoulder: 0.16, tumble: 0.32, crown: [0.01, 0.0, 0.01], glass: [-0.6, 1.0], trim: 'gloss', rearCol: 'under',
        doors: [1.0, -0.4], head: { y: [-0.1, -0.06], x: 0.55, d: 0.15 }, intake: { y: [0.22, 0.32], x: 0.7, d: 0.12 },
        sideIntake: { z: [-0.55, -0.1], y: [0.5, 0.84] }, tail: { y: [-0.22, -0.08], x: 0.3, d: 0.18, rev: [0.3, 0.4] },
        louvre: { z: [-1.95, -1.3], x: 0.6 }, wing: { h: 0.3, z: 0.3, chord: 0.4 }, plate: [0.3, 0.45]
      } },
    // Porsche 911 Carrera RS 2.7 (1973): the lightweight 911 with the ducktail on its engine lid, upright round lamps on
    // its wings, Carrera down its sides, five-spoke Fuchs wheels
    { id: 'rs27', name: 'Porsche 911 Carrera RS 2.7', kind: 'Klassiker', def: 'Carrera RS:en', sport: true, classic: true, group: 'classic', rearEngine: true, W: 1.652, L: 4.147, R: 0.31, wb: 2.271, max: 68, zero: [100, 5.8], brake: 26, rev: 9, mass: 0.98, grip: 1.02,
      colors: [0xf2f0e6, 0xf2c80f, 0xf06a14, 0xc8102e], gears: 5, idle: 900, red: 7300, eng: 'flat6', rim: 'f40',
      shape: {
        sill: [[-2.07, 0.4], [-1.85, 0.29], [-1.5, 0.26], [1.4, 0.26], [1.8, 0.28], [2.07, 0.34]],
        belt: [[-2.07, 0.84], [-1.98, 0.95], [-1.86, 0.92], [-1.55, 0.96], [-0.6, 0.93], [0.4, 0.86], [1.2, 0.78], [1.7, 0.7], [2.07, 0.52]],
        roof: [[-0.8, 1.27], [-0.4, 1.31], [0.0, 1.31]], cab: [-1.55, -0.8, 0.0, 0.88], rc: [0.32, 0.5], p: [2.4, 2.2],
        shoulder: 0.12, tumble: 0.24, crown: [0.04, -0.05, 0.03], glass: [-1.15, 0.85], pillars: [[-0.45, 0.06]], trim: 'chrome',
        doors: [0.85, -0.5], tail: { y: [-0.12, -0.04], x: 0.35, d: 0.15 }, sideStripe: { y: [0.3, 0.38], z: [-1.2, 0.95], col: 0xc8102e },
        bumper: { y: [0.4, 0.42], col: 'gloss' }, lamps: [{ type: 'round', x: 0.55, z: 1.72, r: 0.09, tilt: 1.05 }], plate: [0.36, 0.45]
      } },
    // Jaguar E-Type (Series 1 coupé, 1961): the one Enzo Ferrari called the most beautiful car in the world; the endless
    // bonnet, the lamps under glass covers, a little oval mouth, thin chrome bumpers and wire wheels
    { id: 'etype', name: 'Jaguar E-Type', kind: 'Klassiker', def: 'E-Typen', sport: true, classic: true, group: 'classic', W: 1.657, L: 4.453, R: 0.33, wb: 2.438, max: 67, zero: [100, 7.1], brake: 24, rev: 8, mass: 1.25, grip: 0.98,
      colors: [0x1f4a37, 0xa31919, 0x8fa3b5, 0xe8dfc6, 0x111316], gears: 4, idle: 750, red: 5500, eng: 'i6', rim: 'wire',
      shape: {
        sill: [[-2.2265, 0.36], [-2.0, 0.27], [-1.65, 0.24], [1.65, 0.24], [2.0, 0.26], [2.2265, 0.34]],
        belt: [[-2.2265, 0.66], [-2.1, 0.74], [-1.8, 0.8], [-1.2, 0.84], [-0.6, 0.84], [0.2, 0.83], [1.0, 0.81], [1.7, 0.74], [2.1, 0.62], [2.2265, 0.52]],
        roof: [[-1.0, 1.16], [-0.6, 1.21], [-0.3, 1.21]], cab: [-1.95, -1.0, -0.3, 0.18], rc: [0.4, 0.45], p: [2.0, 1.8], bulge: 0.08,
        shoulder: 0.14, tumble: 0.25, crown: [0.04, 0.06, 0.03], glass: [-1.05, 0.15], trim: 'chrome',
        doors: [0.15, -0.85], grille: { y: [0.36, 0.5], x: 0.3, d: 0.1 }, tail: { y: [-0.1, -0.04], x: 0.55, d: 0.12 },
        bumper: { y: [0.4, 0.44], col: 'chrome', w: 0.7 }, lamps: [{ type: 'round', x: 0.5, z: 1.92, r: 0.09, tilt: 0.55 }], plate: [0.42, 0.48]
      } },
    // Shelby Cobra 427 (1965): a 7-litre Ford V8 in the little AC roadster from England, open, wide hips, side pipes, the
    // round lamps either side of its oval mouth and stripes over the top
    { id: 'cobra', name: 'Shelby Cobra 427', kind: 'Klassisk roadster', def: 'Cobran', sport: true, classic: true, group: 'classic', W: 1.73, L: 3.96, R: 0.34, wb: 2.286, max: 74, zero: [100, 4.2], brake: 26, rev: 8, mass: 1.05, grip: 1.0,
      colors: [0x1f3d8f, 0x111316, 0xc8102e, 0xb5b8bb], gears: 4, idle: 800, red: 6500, eng: 'v8', rim: 'alloy',
      shape: {
        sill: [[-1.98, 0.32], [-1.75, 0.24], [-1.4, 0.22], [1.4, 0.22], [1.75, 0.24], [1.98, 0.3]],
        belt: [[-1.98, 0.72], [-1.82, 0.82], [-1.5, 0.9], [-1.1, 0.92], [-0.7, 0.88], [0.0, 0.86], [0.7, 0.86], [1.25, 0.88], [1.7, 0.8], [1.98, 0.62]],
        roof: [[-1.0, 0.95], [0.3, 0.95]], cab: [-1.15, -1.0, 0.25, 0.45], rc: [0.45, 0.5], p: [1.9, 1.8], bulge: 0.1, open: { z: [-1.15, 0.45], screen: 0.3 },
        shoulder: 0.12, tumble: 0.2, crown: [0.04, 0.05, 0.03], glass: [-1.1, 0.4], trim: 'chrome',
        doors: [0.4, -0.55], grille: { y: [0.28, 0.48], x: 0.36, d: 0.1 }, tail: { y: [-0.12, -0.05], x: 0.45, d: 0.12 },
        lamps: [{ type: 'face', x: 0.55, y: 0.62, r: 0.085, ring: 'chrome', ind: true }], stripes: [0.09, 0.22], sidePipes: true,
        bumper: { y: [0.3, 0.32], col: 'chrome', w: 0.6 }, plate: [0.32, 0.4]
      } },
    // Ford GT40 (1966): built to beat Ferrari at Le Mans, and it did; barely a metre tall, the doors cut into the roof
    { id: 'gt40', name: 'Ford GT40', kind: 'Klassiker', def: 'GT40:n', sport: true, classic: true, group: 'classic', rearEngine: true, W: 1.78, L: 4.18, R: 0.34, wb: 2.42, max: 89, zero: [100, 4.2], brake: 30, rev: 9, mass: 1.0, grip: 1.1,
      colors: [0x8fc3e6, 0x1f3d8f, 0xc8102e, 0x111316], gears: 5, idle: 900, red: 6500, eng: 'v8', rim: 'sport',
      shape: {
        sill: [[-2.09, 0.36], [-1.9, 0.24], [-1.55, 0.2], [1.5, 0.2], [1.85, 0.21], [2.09, 0.26]],
        belt: [[-2.09, 0.78], [-1.9, 0.86], [-1.0, 0.86], [-0.35, 0.8], [0.4, 0.72], [1.1, 0.64], [1.7, 0.56], [2.09, 0.42]],
        roof: [[-0.55, 0.98], [-0.25, 1.01], [0.0, 1.01]], cab: [-1.35, -0.55, 0.0, 0.95], rc: [0.2, 0.55], p: [3.5, 2.0],
        shoulder: 0.18, tumble: 0.32, crown: [0.02, 0.01, 0.015], glass: [-0.4, 0.9], trim: 'gloss', rearCol: 'under',
        doors: [0.9, -0.35], intake: { y: [0.25, 0.36], x: 0.6, d: 0.1 }, tail: { y: [-0.16, -0.06], x: 0.45, d: 0.12 },
        lamps: [{ type: 'round', x: 0.62, z: 1.62, r: 0.085, tilt: 0.45 }], stripes: [0.12, 0.26], stripeCol: { [0x8fc3e6]: 0xf06a14 }, plate: [0.32, 0.42]
      } },
    // Volvo P1800 (1961), my second own pick: the Swedish sports coupé that The Saint drove, round lamps in chrome rings, the
    // egg-crate grille with the iron mark, little fins at the back and chrome bumpers
    { id: 'p1800', name: 'Volvo P1800', kind: 'Klassiker', def: 'P1800:an', sport: true, classic: true, group: 'classic', W: 1.7, L: 4.35, R: 0.31, wb: 2.45, max: 51, zero: [100, 10.5], brake: 22, rev: 8, mass: 1.12, grip: 0.95,
      colors: [0xeeeeea, 0xa31919, 0x1c2a44, 0xe8dfc6, 0x111316], gears: 4, idle: 750, red: 6000, eng: 'i4', rim: 'alloy',
      shape: {
        sill: [[-2.175, 0.4], [-1.95, 0.3], [-1.6, 0.27], [1.6, 0.27], [1.95, 0.29], [2.175, 0.36]],
        belt: [[-2.175, 0.8], [-2.05, 0.88], [-1.7, 0.92], [-1.2, 0.9], [-0.4, 0.86], [0.4, 0.85], [1.2, 0.84], [1.8, 0.79], [2.175, 0.68]],
        roof: [[-0.85, 1.24], [-0.45, 1.27], [-0.05, 1.27]], cab: [-1.45, -0.85, -0.05, 0.6], rc: [0.3, 0.4], p: [2.4, 2.4],
        shoulder: 0.12, tumble: 0.2, crown: [0.04, 0.05, 0.03], glass: [-1.0, 0.55], pillars: [[-0.55, 0.05]], trim: 'chrome',
        doors: [0.55, -0.6], grille: { y: [0.42, 0.56], x: 0.45, d: 0.1 }, iron: true, tail: { y: [-0.12, -0.04], x: 0.45, d: 0.12 },
        lamps: [{ type: 'face', x: 0.6, y: 0.62, r: 0.085, ring: 'chrome', ind: true }], bumper: { y: [0.38, 0.4], col: 'chrome' }, plate: [0.3, 0.45]
      } },
    // The compact sports cars. Mazda MX-5 (ND): the world's best-selling two-seater, here with the roof down
    { id: 'mx5', name: 'Mazda MX-5', kind: 'Roadster', def: 'MX-5:an', sport: true, W: 1.735, L: 3.915, R: 0.32, wb: 2.31, max: 61, zero: [100, 6.5], brake: 28, rev: 9, mass: 1.05, grip: 1.08,
      colors: [0xa1131d, 0xeeeeea, 0x5b6066, 0x1f4f8f, 0x111316], gears: 6, idle: 750, red: 7500, eng: 'i4', rim: 'sport',
      shape: {
        sill: [[-1.9575, 0.38], [-1.75, 0.28], [-1.4, 0.25], [1.35, 0.25], [1.7, 0.27], [1.9575, 0.33]],
        belt: [[-1.9575, 0.78], [-1.82, 0.86], [-1.45, 0.88], [-1.0, 0.86], [-0.5, 0.84], [0.3, 0.82], [1.0, 0.78], [1.6, 0.7], [1.9575, 0.56]],
        roof: [[-0.8, 0.9], [0.2, 0.9]], cab: [-0.85, -0.8, 0.15, 0.35], rc: [0.35, 0.45], p: [2.4, 2.0], open: { z: [-0.85, 0.35], screen: 0.32, hoop: true },
        shoulder: 0.12, tumble: 0.2, crown: [0.03, 0.03, 0.02], glass: [-0.8, 0.3], trim: 'gloss',
        doors: [0.3, -0.75], head: { y: [-0.09, -0.03], x: 0.5, d: 0.3 }, grille: { y: [0.32, 0.46], x: 0.42, d: 0.12 },
        tail: { y: [-0.09, -0.04], x: 0.45, d: 0.2, rev: [0.45, 0.52] }, plate: [0.36, 0.42]
      } },
    // Toyota GR Supra (A90): the Japanese legend back, a BMW straight six, a ducktail and a double-bubble roof
    { id: 'supra', name: 'Toyota GR Supra', kind: 'Sportcoupé', def: 'Supran', sport: true, W: 1.854, L: 4.379, R: 0.355, wb: 2.47, max: 70, zero: [100, 4.3], brake: 32, rev: 9, mass: 1.5, grip: 1.12,
      colors: [0xc8102e, 0xeeeeea, 0xf2c80f, 0x111316, 0x5b6066], gears: 8, idle: 750, red: 6500, eng: 'i6', rim: 'black',
      shape: {
        sill: [[-2.19, 0.42], [-1.98, 0.28], [-1.65, 0.24], [1.6, 0.24], [1.95, 0.26], [2.19, 0.32]],
        belt: [[-2.19, 0.86], [-2.08, 0.96], [-1.85, 0.98], [-1.3, 0.94], [-0.4, 0.9], [0.4, 0.84], [1.2, 0.76], [1.8, 0.66], [2.19, 0.5]],
        roof: [[-0.75, 1.24], [-0.4, 1.28], [-0.05, 1.28]], cab: [-1.45, -0.75, -0.05, 0.75], rc: [0.3, 0.5], p: [2.8, 2.2],
        shoulder: 0.15, tumble: 0.26, crown: [0.03, -0.02, 0.02], glass: [-1.0, 0.72], trim: 'gloss',
        doors: [0.72, -0.5], head: { y: [-0.1, -0.03], x: 0.5, d: 0.32 }, intake: { y: [0.24, 0.42], x: 0.75, d: 0.18 },
        tail: { y: [-0.1, -0.04], x: 0.45, d: 0.2, rev: [0.45, 0.52] }, diffuser: 0.42, plate: [0.32, 0.5]
      } },
    // Alpine A110 (2017): the light little Frenchman with its engine behind the seats, four round lamps in its nose
    { id: 'a110', name: 'Alpine A110', kind: 'Sportbil', def: 'Alpinen', sport: true, rearEngine: true, W: 1.798, L: 4.18, R: 0.33, wb: 2.42, max: 70, zero: [100, 4.5], brake: 32, rev: 9, mass: 1.1, grip: 1.15,
      colors: [0x1f5fb0, 0xeeeeea, 0x111316, 0xf06a14], gears: 7, idle: 800, red: 6800, eng: 'i4t', rim: 'sport',
      shape: {
        sill: [[-2.09, 0.4], [-1.88, 0.27], [-1.55, 0.24], [1.5, 0.24], [1.85, 0.26], [2.09, 0.33]],
        belt: [[-2.09, 0.82], [-1.95, 0.9], [-1.5, 0.93], [-0.8, 0.9], [0.0, 0.84], [0.8, 0.78], [1.5, 0.7], [1.9, 0.6], [2.09, 0.5]],
        roof: [[-0.6, 1.21], [-0.3, 1.25], [0.0, 1.25]], cab: [-1.4, -0.6, 0.0, 0.85], rc: [0.3, 0.55], p: [2.6, 2.0],
        shoulder: 0.15, tumble: 0.27, crown: [0.03, 0.0, 0.02], glass: [-0.65, 0.82], trim: 'gloss',
        doors: [0.82, -0.45], intake: { y: [0.25, 0.4], x: 0.6, d: 0.15 }, tail: { y: [-0.12, -0.04], x: 0.4, d: 0.2, rev: [0.4, 0.48] }, diffuser: 0.4,
        lamps: [{ type: 'face', x: 0.6, y: 0.6, r: 0.085, ring: 'gloss', ind: true }, { type: 'face', x: 0.36, y: 0.5, r: 0.055, ring: 'gloss', noInd: true }], plate: [0.3, 0.5]
      } },
    // BMW M4 (G82): the 510-horsepower coupé, the tall kidney grille, a carbon roof
    { id: 'm4', name: 'BMW M4', kind: 'Sportcoupé', def: 'M4:an', sport: true, W: 1.887, L: 4.794, R: 0.36, wb: 2.857, max: 81, zero: [100, 3.9], brake: 34, rev: 9, mass: 1.75, grip: 1.15,
      colors: [0x1f6b44, 0xe8c700, 0xb3121b, 0xeeeeea, 0x111316], gears: 8, idle: 750, red: 7200, eng: 'i6', rim: 'black',
      shape: {
        sill: [[-2.397, 0.44], [-2.17, 0.31], [-1.85, 0.27], [1.85, 0.27], [2.15, 0.29], [2.397, 0.36]],
        belt: [[-2.397, 0.9], [-2.3, 0.98], [-2.0, 1.0], [-0.5, 0.97], [0.6, 0.94], [1.5, 0.88], [2.05, 0.79], [2.397, 0.66]],
        roof: [[-0.95, 1.34], [-0.4, 1.38], [0.15, 1.38]], cab: [-1.8, -0.95, 0.15, 0.95], rc: [0.22, 0.42], p: [3.4, 2.8],
        shoulder: 0.12, tumble: 0.2, crown: [0.03, 0.03, 0.025], glass: [-1.4, 0.92], pillars: [[-0.15, 0.1]], trim: 'gloss', roofTone: 0x15171a,
        doors: [0.92, -0.4], head: { y: [-0.12, -0.05], x: 0.5, d: 0.3 }, intake: { y: [0.28, 0.42], x: 0.85, d: 0.15 },
        kidney: { x0: 0.04, x1: 0.3, y0: 0.4, y1: 0.78 }, tail: { y: [-0.13, -0.04], x: 0.35, d: 0.25, rev: [0.35, 0.42] }, diffuser: 0.42,
        pipes: [[-0.62, 0.36], [-0.5, 0.36], [0.5, 0.36], [0.62, 0.36]], plate: [0.34, 0.55]
      } },
    // Nissan GT-R (R35), "Godzilla": the twin-turbo V6 and four-wheel drive that beat far dearer cars, four round tail
    // lamps and a wing on the boot
    { id: 'gtr', name: 'Nissan GT-R', kind: 'Sportcoupé', def: 'GT-R:en', sport: true, W: 1.895, L: 4.71, R: 0.36, wb: 2.78, max: 87, zero: [100, 2.8], brake: 36, rev: 9, mass: 1.75, grip: 1.25,
      colors: [0xb5b8bb, 0xeeeeea, 0x111316, 0xf06a14, 0x1f4fae], gears: 6, idle: 800, red: 7100, eng: 'v6', rim: 'black',
      shape: {
        sill: [[-2.355, 0.44], [-2.13, 0.3], [-1.8, 0.27], [1.8, 0.27], [2.1, 0.29], [2.355, 0.35]],
        belt: [[-2.355, 0.92], [-2.25, 1.0], [-1.95, 1.01], [-0.6, 0.98], [0.5, 0.93], [1.4, 0.86], [2.0, 0.76], [2.355, 0.6]],
        roof: [[-0.95, 1.31], [-0.45, 1.36], [0.1, 1.36]], cab: [-1.7, -0.95, 0.1, 0.9], rc: [0.22, 0.42], p: [3.6, 2.6],
        shoulder: 0.13, tumble: 0.2, crown: [0.03, 0.02, 0.025], glass: [-1.3, 0.88], pillars: [[-0.3, 0.12]], trim: 'gloss',
        doors: [0.88, -0.45], head: { y: [-0.12, -0.04], x: 0.5, d: 0.32 }, grille: { y: [0.38, 0.6], x: 0.4, d: 0.15 },
        intake: { y: [0.25, 0.38], x: 0.85, d: 0.15 }, lamps: [{ type: 'tailRound', xs: [0.5, 0.72], y: 0.86, r: 0.08 }], tail: { y: [-0.1, -0.04], x: 2, d: 0.2 },
        diffuser: 0.42, wing: { h: 0.2, z: 0.3 }, plate: [0.36, 0.5]
      } },
    // Lotus Elise (S2): "simplify, then add lightness", 860 kg, the engine behind the seats, the roof off and a hoop
    { id: 'elise', name: 'Lotus Elise', kind: 'Roadster', def: 'Elisen', sport: true, rearEngine: true, W: 1.719, L: 3.785, R: 0.31, wb: 2.3, max: 65, zero: [100, 4.6], brake: 32, rev: 9, mass: 0.9, grip: 1.18,
      colors: [0xf2c80f, 0x1f6b44, 0xeeeeea, 0x111316, 0xf06a14], gears: 6, idle: 900, red: 7800, eng: 'i4', rim: 'sport',
      shape: {
        sill: [[-1.8925, 0.36], [-1.7, 0.24], [-1.4, 0.2], [1.35, 0.2], [1.68, 0.22], [1.8925, 0.28]],
        belt: [[-1.8925, 0.76], [-1.75, 0.85], [-1.3, 0.86], [-0.85, 0.82], [-0.3, 0.78], [0.4, 0.74], [1.0, 0.68], [1.55, 0.6], [1.8925, 0.48]],
        roof: [[-0.7, 0.8], [0.3, 0.8]], cab: [-0.75, -0.7, 0.25, 0.45], rc: [0.3, 0.55], p: [2.4, 1.9], open: { z: [-0.75, 0.45], screen: 0.3, hoop: true },
        shoulder: 0.12, tumble: 0.22, crown: [0.02, 0.02, 0.02], glass: [-0.7, 0.4], trim: 'gloss',
        doors: [0.4, -0.55], head: { y: [-0.08, -0.02], x: 0.45, d: 0.32 }, intake: { y: [0.22, 0.34], x: 0.55, d: 0.12 },
        sideIntake: { z: [-0.95, -0.6], y: [0.36, 0.6] }, lamps: [{ type: 'tailRound', xs: [0.48, 0.65], y: 0.66, r: 0.06 }], tail: { y: [-0.1, -0.05], x: 2, d: 0.2 },
        diffuser: 0.36, plate: [0.3, 0.45]
      } },
    // Gilera Stalker (2003): the naked 50 cc scooter in grey, its frame tube out in the open, twin headlamps under a
    // little screen and the exhaust curling up on the right. A two-stroke with a variator, 45 km/h like every class I
    // moped. (It has a shape of its own: see mopedGeometry)
    { id: 'stalker', name: 'Gilera Stalker', kind: 'Moped 50 cc', def: 'Gileran', moped: true, cvt: true, W: 0.74, L: 1.78, R: 0.24, wb: 1.225, max: 12.5, zero: [30, 4.2], brake: 7.5, rev: 1.5, mass: 0.2, grip: 0.9,
      colors: [0x9ea3a8], gears: 1, idle: 1800, red: 9500, eng: 'twostroke', rim: 'scooter', shape: {} },
    { id: 'polis', name: 'Polisbil', kind: 'Volvo V90', def: 'polisbilen', police: true, W: 1.88, L: 4.94, R: 0.36, wb: 2.94, max: 64, zero: [100, 6.0], brake: 30, rev: 9, mass: 1.9, grip: 1.08,
      colors: [0xf4f5f2], gears: 6, idle: 800, red: 6500, eng: 'i4t', rim: 'alloy',
      shape: {
        sill: [[-2.47, 0.46], [-2.22, 0.33], [-1.9, 0.3], [1.85, 0.3], [2.15, 0.32], [2.47, 0.4]],
        belt: [[-2.47, 0.92], [-2.38, 1.0], [-2.05, 1.0], [0.0, 0.97], [1.05, 0.94], [1.65, 0.87], [2.15, 0.8], [2.47, 0.68]],
        roof: [[-2.12, 1.4], [-1.0, 1.45], [0.3, 1.46]], cab: [-2.38, -2.12, 0.3, 1.32], rc: [0.2, 0.42], p: [3.5, 2.8],
        shoulder: 0.1, tumble: 0.16, crown: [0.03, 0.035, 0.03], glass: [-2.1, 1.27], pillars: [[0.05, 0.1], [-1.25, 0.1]], trim: 'chrome',
        doors: [1.25, 0.03, -1.27], head: { y: [-0.14, -0.06], x: 0.4, d: 0.27 }, grille: { y: [0.52, -0.06], x: 0.36, d: 0.15 },
        intake: { y: [0.38, 0.47], x: 0.6, d: 0.15 }, tail: { y: [-0.2, -0.02], x: 0.55, d: 0.2, up: 0.3, rev: [0.55, 0.63] },
        livery: { rows: [0.42, 0.6, 0.78], z: [-2.0, 1.98], block: 0.44 }, iron: true, police: true, plate: [0.45, 0.66]
      } }
  ];
  // the piket: the police's Mercedes Sprinter with windows down the sides, in the blue and yellow checks, sent from four stars
  {
    const S = MODELS.find((m) => m.id === 'skapbil').shape;
    MODELS.push({ id: 'piket', name: 'Piketbuss', kind: 'Mercedes Sprinter', def: 'piketen', police: true, W: 2.02, L: 5.93, R: 0.38, wb: 3.66, max: 44, zero: [100, 11], brake: 24, rev: 8, mass: 2.6, grip: 0.95,
      colors: [0xf4f5f2], gears: 7, idle: 750, red: 4600, eng: 'diesel', rim: 'steel',
      shape: Object.assign({}, S, { glass: [-2.75, 2.18], pillars: [[0.62, 0.12], [-0.62, 0.1], [-1.82, 0.1]], glassLevels: [1.45, 2.05], doors: [2.18, 0.62, -0.62],
        livery: { rows: [0.62, 0.88, 1.12], z: [-2.85, 2.55], block: 0.5 }, police: true, rearWin: { d: 0.1, y: [1.45, 2.05], x: [0.08, 0.86] } }) });
  }
  const MODEL_JET_HULL = [[-1.63, 0.56, -0.2, 0.36], [-1.2, 0.62, -0.28, 0.4], [-0.3, 0.635, -0.32, 0.44], [0.5, 0.6, -0.3, 0.48], [1.1, 0.47, -0.2, 0.5], [1.45, 0.28, -0.05, 0.48], [1.63, 0.06, 0.12, 0.42]];
  // On the water: the Sea-Doo RXP-X jet ski (supercharged three-cylinder, 300 hp, 108 km/h), an Anytec 622 SPD, the
  // aluminium boat from Kristinehamn that half of Stockholm drives, with a 250 hp V8 outboard, and the Riva Aquarama,
  // the varnished mahogany runabout with two V8s. They are driven like the cars, stay on the water and go under the
  // bridges, and are boarded from a quay. (Their shapes are their own: see boatGeometry)
  MODELS.push(
    { id: 'jetski', name: 'Sea-Doo RXP-X', kind: 'Vattenskoter', def: 'vattenskotern', boat: 'jetski', engine: 'Kompressor, 300 hk', hull: MODEL_JET_HULL, W: 1.27, L: 3.27, R: 0.3, wb: 2, max: 30, zero: [50, 2.4], brake: 7, rev: 3, mass: 0.45, grip: 1,
      colors: [0xf2c200, 0x1d1f22, 0xe8e8e4, 0xd8203a, 0x1f6bd8], gears: 1, idle: 1500, red: 8000, eng: 'jetski', shape: {} },
    { id: 'anytec', name: 'Anytec 622 SPD', kind: 'Motorbåt', def: 'Anytec-båten', boat: 'console', engine: 'Utombordare, 250 hk', hull: [[-3.11, 1.1, -0.36, 0.7], [-2.2, 1.17, -0.42, 0.72], [-0.6, 1.175, -0.46, 0.76], [0.9, 1.12, -0.45, 0.82], [2.0, 0.86, -0.32, 0.9], [2.7, 0.5, -0.1, 0.96], [3.11, 0.06, 0.24, 0.98]], W: 2.35, L: 6.22, R: 0.3, wb: 4, max: 24, zero: [50, 4.6], brake: 4.5, rev: 3, mass: 1.6, grip: 1,
      colors: [0x8d9297, 0x2a2d31, 0xe8e8e4], gears: 1, idle: 700, red: 6000, eng: 'outboard', shape: {} },
    { id: 'riva', name: 'Riva Aquarama', kind: 'Motorbåt', def: 'Rivan', boat: 'riva', engine: 'Två V8, 2 × 350 hk', hull: [[-4.01, 1.15, -0.32, 0.6], [-3.0, 1.27, -0.4, 0.64], [-1.0, 1.3, -0.48, 0.7], [1.0, 1.22, -0.48, 0.76], [2.5, 0.92, -0.33, 0.82], [3.5, 0.5, -0.08, 0.84], [4.01, 0.06, 0.24, 0.8]], W: 2.6, L: 8.02, R: 0.3, wb: 5, max: 22, zero: [50, 5.8], brake: 3.5, rev: 2.5, mass: 2.4, grip: 1,
      colors: [0x7a3b1c], gears: 1, idle: 650, red: 4800, eng: 'v8', shape: {} }
  );
  // The sjöpolis, out after you when you run from the police on the water: a white patrol boat with a wheelhouse, the blue
  // and yellow checks down its sides and blue lights on the roof, and a Sea-Doo in the same colours. At five stars the
  // navy sends Stridsbåt 90 (CB90), the 16-metre combat boat on two water jets with a heavy machine gun on its wheelhouse.
  // Not in the car picker, and they can't be taken. (Their shapes are in boatGeometry)
  MODELS.push(
    { id: 'polisbat', name: 'Polisbåt', kind: 'Targa 31', def: 'polisbåten', boat: 'patrol', police: true, engine: 'Två dieslar, 2 × 370 hk', hull: [[-4.7, 1.45, -0.45, 0.95], [-3.4, 1.5, -0.55, 0.98], [-1.0, 1.5, -0.6, 1.03], [1.4, 1.44, -0.58, 1.1], [3.0, 1.12, -0.42, 1.2], [4.1, 0.66, -0.14, 1.28], [4.7, 0.08, 0.3, 1.3]], W: 3.0, L: 9.4, R: 0.3, wb: 6, max: 23, zero: [50, 6], brake: 4.5, rev: 3, mass: 5, grip: 1,
      colors: [0xf4f5f2], gears: 1, idle: 650, red: 3800, eng: 'outboard', shape: {} },
    { id: 'polisjet', name: 'Polisens vattenskoter', kind: 'Sea-Doo GTX', def: 'polisvattenskotern', boat: 'jetski', police: true, engine: 'Kompressor, 300 hk', hull: MODEL_JET_HULL, W: 1.27, L: 3.27, R: 0.3, wb: 2, max: 29, zero: [50, 2.6], brake: 7, rev: 3, mass: 0.5, grip: 1,
      colors: [0xf4f5f2], gears: 1, idle: 1500, red: 8000, eng: 'jetski', shape: {} },
    { id: 'strb90', name: 'Stridsbåt 90', kind: 'Stridsbåt 90 H', def: 'stridsbåten', boat: 'cb90', mil: 'boat', engine: 'Två dieslar med vattenjet, 2 × 625 hk', hull: [[-7.95, 1.85, -0.55, 1.25], [-6.0, 1.9, -0.65, 1.3], [-2.0, 1.9, -0.72, 1.33], [2.0, 1.88, -0.7, 1.36], [5.0, 1.62, -0.52, 1.42], [6.9, 1.2, -0.22, 1.5], [7.95, 0.72, 0.28, 1.55]], W: 3.8, L: 15.9, R: 0.3, wb: 10, max: 20.5, zero: [50, 9], brake: 5, rev: 3, mass: 20, grip: 1.1,
      colors: [0x5b6b45], gears: 1, idle: 600, red: 2300, eng: 'bus', shape: {} }
  );
  // Försvarsmakten, called in at five stars: Stridsvagn 122 (the Swedish Leopard 2A5, 62 tonnes, 72 km/h, the arrowhead
  // armour on the turret and the long 120 mm gun), Pansarterrängbil 360 (Patria AMV, eight wheels, a remote weapon
  // station on the roof) and a six-wheeled Scania lastterrängbil with soldiers under the tarpaulin, all in the M90
  // splinter camouflage. Not in the car picker, but they can be taken. (Their shapes are their own: see militaryGeometry)
  MODELS.push(
    { id: 'strv122', name: 'Stridsvagn 122', kind: 'Stridsvagn', def: 'stridsvagnen', mil: 'tank', W: 3.7, L: 7.7, R: 0.35, wb: 2.2, max: 20, zero: [50, 10], brake: 14, rev: 6, mass: 60, grip: 1.5,
      axles: [2.85, 1.9, 0.95, 0, -0.95, -1.9, -2.85], steers: 0, colors: [0x5b6b45], gears: 4, idle: 650, red: 2600, eng: 'tank', rim: 'tank', shape: {} },
    { id: 'patgb360', name: 'Pansarterrängbil 360', kind: 'Patria AMV', def: 'pansarbilen', mil: 'patria', W: 2.8, L: 7.7, R: 0.6, wb: 4.5, max: 28, zero: [50, 8], brake: 16, rev: 7, mass: 22, grip: 1.15,
      axles: [2.5, 1.15, -0.6, -1.95], steers: 2, colors: [0x5b6b45], gears: 7, idle: 600, red: 2500, eng: 'bus', rim: 'mil', shape: {} },
    { id: 'miltruck', name: 'Lastterrängbil', kind: 'Scania 6×6', def: 'lastbilen', mil: 'truck', W: 2.55, L: 8.5, R: 0.6, wb: 5.6, max: 25, zero: [50, 11], brake: 14, rev: 6, mass: 15, grip: 1.0,
      axles: [3.0, -1.35, -2.75], steers: 1, colors: [0x5b6b45], gears: 8, idle: 600, red: 2400, eng: 'bus', rim: 'mil', shape: {} }
  );
  const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));
  const PICKABLE = MODELS.filter((m) => !m.police && !m.mil);
  // on the picker's secret page: everything the police and then the army drive, each with the boats last
  const SECRET = MODELS.filter((m) => m.police || m.mil).sort((a, b) => (a.mil ? 2 : 0) + (a.boat ? 1 : 0) - (b.mil ? 2 : 0) - (b.boat ? 1 : 0));
  const REGULARS = MODELS.filter((m) => !m.sport && !m.bus && !m.police && !m.moped && !m.boat && !m.mil), SPORTS = MODELS.filter((m) => m.sport);
  const MILITARY = MODELS.filter((m) => m.mil);
  const BOATS = MODELS.filter((m) => m.boat);

  /* ---------- gearbox and engine ---------- */
  // Each gear tops out on the rev limiter at gearTop[i]; the last gear reaches the model's top speed. The gears are
  // spread like real ones, first gear good for 50–60 km/h in an ordinary car, so the engine takes its time climbing
  // through the revs in each gear. Low gears multiply the engine's torque, so they pull harder but run out of revs sooner.
  for (const M of MODELS) {
    M.gearTop = [];
    for (let i = 1; i <= M.gears; i++) M.gearTop.push(M.max * Math.pow(i / M.gears, 0.62));
  }
  // share of peak torque at a fraction of the rev range: soft off idle, strongest in the middle, fading towards the limiter
  const torqueAt = (r) => 0.62 + 0.38 * Math.sin(Math.PI * clamp(r, 0, 1) * 0.92);
  function driveAccel(M, v, gear, power) {
    const top = M.gearTop[gear], r = v / top;
    if (r >= 1) return -1.5; // fuel cut on the rev limiter
    // an electric motor pulls with full torque from a standstill and then runs out of power, all in one gear
    if (M.ev) return M.accel * 0.72 * Math.min(1, 0.4 / Math.max(r, 1e-3)) * (1 - 0.25 * v / M.max) * power;
    // a scooter's variator keeps the engine at its best revs and changes the ratio instead
    if (M.cvt) return M.accel * 0.72 * (1 - 0.55 * Math.pow(v / M.max, 2)) * power;
    // a boat's propeller or jet pushes hardest from rest and the water holds it back more and more as it speeds up
    if (M.boat) return M.accel * 0.72 * (1 - Math.pow(v / M.max, 2)) * power;
    // first gear slips the clutch from a standstill; a gear that is too high makes the engine lug
    let k = torqueAt(gear === 0 ? Math.max(r, 0.38) : r);
    if (gear > 0 && r < 0.3) k *= 0.3 + (r / 0.3) * 0.7;
    // turbo lag (the F40's): little below the boost, then it all comes in at once
    if (M.lag) { const b = clamp((r - 0.35) / 0.25, 0, 1); k *= 0.7 + 0.45 * b * b * (3 - 2 * b); }
    return M.accel * 0.72 * k * Math.pow(M.max / top, 0.3) * (1 - 0.25 * v / M.max) * power;
  }
  // the automatic changes up at these shares of the rev range: flat out, and when you drive gently
  const SHIFT_TIME = 0.24, UP_HARD = 0.8, UP_SOFT = 0.5;
  const sprintOf = (M, kmh) => {
    let v = 0, t = 0, g = 0, sh = 0;
    while (v < kmh / 3.6 && t < 60) {
      if (sh > 0) sh -= 0.01;
      else if (g < M.gears - 1 && v / M.gearTop[g] > UP_HARD) { g++; sh = SHIFT_TIME; }
      else v += driveAccel(M, v, g, 1) * 0.01;
      t += 0.01;
    }
    return t;
  };
  // Every model accelerates like the real car: its pull is set so that 0–100 km/h (0–50 for the bus, 0–30 for the
  // moped) takes the real time, a touch quicker for the game (ZIP)
  const ZIP = 0.85;
  for (const M of MODELS) {
    const [kmh, real] = M.zero;
    let lo = 0.5, hi = 80;
    for (let i = 0; i < 26; i++) { M.accel = (lo + hi) / 2; if (sprintOf(M, kmh) > real * ZIP) lo = M.accel; else hi = M.accel; }
    const t = sprintOf(M, kmh), target = kmh / 3.6;
    M.sprint = { kmh: Math.round(target * 3.6), t };
  }

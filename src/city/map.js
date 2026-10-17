'use strict';

  /* ================= Stockholm: land, water and streets ================= */
  // Metres at real scale, measured from the middle of the Royal Palace (Kungliga slottet): x points east, z south.
  // Shores, streets and landmarks follow the real map, simplified so that every street runs straight between junctions.
  // WATER_Y: the water surface, low enough under the bridges for a boat to pass beneath them
  const FLOOR_H = 3.2, CELL_W = 3.0, LANE = 2.5, WATER_Y = -2.8;
  const BOUNDS = { x0: -2700, x1: 3300, z0: -2400, z1: 3000 };

  function pointInPoly(P, x, z) {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  /* ---------- land ---------- */
  // Birger Jarlsgatan is roughly where Norrmalm ends and Östermalm begins
  const birgerJarl = (z) => (z > -968 ? 310 + (z + 675) * 0.614 : 130 + (z + 968) * 0.32);
  const LANDS = [
    {
      name: (x, z) => (x > 150 && x < 450 && z > -640 ? 'Blasieholmen' : x > 1450 && z < -560 ? 'Gärdet' : z < -1690 && x > -60 ? 'Norra Djurgården'
        : x > birgerJarl(z) ? 'Östermalm' : z < -2090 ? 'Hagastaden' : z < -1160 ? 'Vasastan' : 'Norrmalm'),
      poly: [[-2700, -2400], [-2700, -1248], [-1700, -1252], [-1200, -1247], [-850, -1242], [-850, -240], [-760, -245], [-650, -275], [-540, -288], [-462, -284], [-300, -278], [-200, -276], [-160, -268], [-60, -262], [60, -256],
        [140, -250], [200, -255], [270, -245], [340, -205], [395, -150], [428, -160], [432, -260], [425, -420], [400, -560], [365, -628], [420, -632], [600, -617],
        [800, -598], [1000, -580], [1120, -570], [1400, -575], [1700, -580], [2000, -615], [2300, -660], [2600, -690], [2780, -665], [2920, -650],
        [3020, -760], [3060, -1100], [3010, -1500], [2950, -1900], [2900, -2400]]
    },
    {
      name: 'Kungsholmen',
      poly: [[-910, -1190], [-905, -900], [-900, -560], [-905, -260], [-900, -150], [-915, -60], [-960, -15], [-1100, -20], [-1400, -35], [-1700, -50],
        [-1900, -45], [-2100, -60], [-2400, -80], [-2700, -90], [-2700, -1192], [-1700, -1194]]
    },
    { name: 'Helgeandsholmen', poly: [[-300, -228], [-55, -232], [-40, -180], [-55, -120], [-290, -118], [-310, -170]] },
    {
      name: 'Gamla stan',
      poly: [[-300, -98], [-120, -100], [40, -102], [160, -98], [205, -62], [245.8, 29.1], [258.5, 188.6], [240, 214], [226, 330], [192, 430], [142, 505], [60, 528], [-40, 528],
        [-140, 518], [-215, 480], [-270, 400], [-310, 280], [-330, 140], [-335, 20], [-320, -60]]
    },
    { name: 'Riddarholmen', poly: [[-360, -20], [-450, -55], [-540, -10], [-590, 110], [-570, 260], [-480, 350], [-395, 370], [-362, 300], [-358, 120]] },
    { name: 'Skeppsholmen', poly: [[455, -70], [560, -118], [700, -100], [820, -30], [905, 80], [880, 220], [780, 322], [640, 330], [520, 260], [458, 150], [445, 40]] },
    { name: 'Kastellholmen', poly: [[640, 380], [760, 360], [820, 430], [760, 500], [660, 490]] },
    {
      name: 'Djurgården',
      poly: [[1020, -475], [1500, -485], [1700, -495], [2000, -525], [2300, -570], [2600, -630], [2780, -625], [2920, -600], [3080, -470], [3170, -250],
        [3130, 0], [2980, 160], [2700, 290], [2400, 360], [2100, 470], [1800, 610], [1550, 660], [1350, 640], [1150, 420], [1060, 150], [1000, -150]]
    },
    { name: 'Långholmen', poly: [[-1700, 600], [-1500, 562], [-1250, 575], [-1120, 630], [-1160, 712], [-1450, 722], [-1670, 690]] },
    {
      name: 'Södermalm',
      poly: [[-1650, 792], [-1200, 772], [-850, 742], [-550, 722], [-260, 680], [-120, 655], [-20, 640], [60, 632], [160, 645], [400, 682], [700, 718],
        [1000, 758], [1300, 795], [1600, 830], [1820, 880], [1950, 990], [1990, 1200], [1975, 1450], [1930, 1700], [1800, 1880], [1550, 1970], [800, 1985],
        [0, 1990], [-800, 1988], [-1250, 1960], [-1500, 1860], [-1640, 1650], [-1700, 1350], [-1720, 1050]]
    },
    // across Hammarby sjö and Årstaviken: Liljeholmen, Johanneshov with Globen, Hammarby sjöstad, and Nacka beyond
    // Danvikskanalen
    {
      name: (x, z) => (x > 2000 ? 'Nacka' : x < -1000 ? 'Liljeholmen' : x > 700 && z < 2720 ? 'Hammarby sjöstad' : 'Johanneshov'),
      poly: [[-2700, 2050], [-2000, 2030], [-1600, 2080], [-1300, 2140], [-600, 2160], [200, 2155], [900, 2150], [1500, 2130], [1850, 2080], [2010, 1950],
        [2030, 1700], [2040, 1450], [2060, 1250], [2250, 1150], [2700, 1100], [3300, 1080], [3300, 3000], [-2700, 3000]]
    }
  ];
  function landName(x, z) {
    for (const L of LANDS) if (pointInPoly(L.poly, x, z)) return typeof L.name === 'function' ? L.name(x, z) : L.name;
    return null;
  }
  function waterName(x, z) {
    if (x < -850 && x > -910 && z < -150 && z > -1190) return 'Klara sjö';
    if (z < -1180 && z > -1260 && x < -850) return 'Karlbergssjön';
    if (z > 480 && z < 690 && x > -280 && x < 260) return 'Söderström';
    if (x > 330 && x < 1100 && z < -150 && z > -650) return 'Nybroviken';
    if (z < -90 && z > -300 && x > -340 && x < 450) return 'Strömmen';
    if (x > 1080 && x < 2950 && z < -450 && z > -700) return 'Djurgårdsbrunnsviken';
    if (x > 2900 && z < -300) return 'Lilla Värtan';
    if (x > 1900 && x < 2150 && z > 1150 && z < 2000) return 'Danvikskanalen';
    if (z > 1900 && z < 2200 && x > -1000) return 'Hammarby sjö';
    if (z > 1700 && x < -1000) return 'Årstaviken';
    if (z > 690 && z < 800 && x < -1100 && x > -1750) return 'Pålsundet';
    if (x < -1600) return 'Mälaren';
    return x < -300 ? 'Riddarfjärden' : 'Saltsjön';
  }

  /* ---------- streets ---------- */
  // Named junctions, then streets as chains of junctions. kind: 'street' (cars), 'lane' (Gamla stan's narrow cobbled
  // lanes) or 'ped' (pedestrian streets). hw is half the carriageway width, walk the pavement width.
  const PTS = {
    // Norrmalm
    TB: [-540, -305], VB: [-462, -298], D0: [-200, -290], GA: [-110, -282], OP: [-20, -274], KT0: [105, -266],
    GH: [250, -268], NM: [345, -222], BT: [400, -170], NK1: [405, -420], NP: [310, -675], BH1: [265, -470],
    KT1: [110, -470], KT2: [115, -650], NT: [168, -655], VT0: [-50, -362], VT1: [-50, -470], VT2: [-45, -648],
    R0: [-125, -366], R1: [-122, -470], R2: [-118, -646], R3: [-130, -762], R4: [-150, -925], R45: [-162, -1035], R5: [-175, -1150],
    D1: [-229, -352], D2: [-284, -470], D3: [-351, -612], D4: [-405, -727], D5: [-475, -878], D6: [-538, -1012], D7: [-600, -1145],
    ST: [-270, -652], S1: [-303, -722], S2: [-379, -884], S3: [-441, -1016], S4: [-503, -1148],
    V2: [-585, -430], V3: [-620, -545], V4: [-655, -684], V5: [-700, -852], V6: [-735, -1008], V7: [-768, -1142],
    TBw: [-720, -280], SHB: [-838, -262], KB1: [-838, -855],
    // Östermalm
    BB1: [150, -810], BJr: [264, -750], BJs: [190, -870], SP: [130, -968], BJ2: [62, -1180], LN0: [175, -1012], KA1: [240, -1180],
    NYr: [338, -748], NYs: [345, -868], NY2: [355, -1006], NY3: [365, -1180],
    SV1: [500, -650], SIr: [510, -745], SIs: [522, -866], SI2: [538, -1002], SI3: [550, -1180],
    SV2: [700, -630], GRr: [705, -735], GRs: [712, -862], GR2: [718, -998], GR3: [725, -1180],
    SV3: [900, -612], BAr: [905, -725], BAs: [910, -858], BA2: [916, -994], BA3: [925, -1180], SV4: [1072, -596],
    // Kungsholmen
    SHk: [-925, -238], KG0: [-928, -640], KB2: [-925, -860], NM0: [-1090, -48], NM1: [-1380, -58],
    SC1: [-1110, -372], SC2: [-1115, -642], SC3: [-1120, -868], PH1: [-1380, -582], PH2: [-1380, -646], PH3: [-1380, -885],
    // Helgeandsholmen and Gamla stan
    RB1: [-195, -208], RB2: [-190, -140], MT: [-180, -76], NB1: [-100, -205], NB2: [-95, -140], LB: [-90, -78],
    SBs: [165, -82], SK1: [210, 40], SK2: [222, 190], SK3: [212, 330], SK4: [175, 430], SL0: [60, 500],
    SBk: [75, 80], STK: [-80, 84], gSB1: [105, 71],
    RT: [-270, -30], MB1: [-312, 110], MB2: [-292, 260], MB3: [-245, 390], KH: [-130, 492], gMBg: [-277.5, 300],
    // Gamla stan, lane by lane. West to east the long streets are Munkbron, Lilla Nygatan, Stora Nygatan,
    // Västerlånggatan, Prästgatan, Stortorget with Skomakargatan, Svartmangatan, Österlånggatan and Skeppsbron;
    // the gränder cross between them. Västerlånggatan (Vx):
    gMT2: [-140, -77], gV0: [-142, -10], gV2: [-144, 78], gV3: [-148, 118], gV3b: [-149, 165], gV4: [-149, 200], gV4b: [-147, 245],
    gV5: [-138, 290], gV6: [-118, 345], gV6b: [-102, 372], gV7: [-88, 398], gV8: [-58, 425], gJT: [-20, 440], gJT2: [8, 444], gJG: [34, 472],
    gHV0: [-100, -10], gHV: [-70, 0], gRHN: [-194, -18], gRHT: [-194, 22],
    // Prästgatan (P), Stora Nygatan (N), Lilla Nygatan (L) and Kornhamnstorg
    gP0: [-108, 80], gP1: [-114, 118], gP1b: [-116, 165], gP2: [-116, 200], gP2b: [-113, 242], gP3: [-103, 290], gP4: [-85, 348], gP4b: [-73, 370],
    gN0: [-174, 44], gN1: [-186, 118], gN1b: [-190, 165], gN2: [-192, 200], gN2b: [-190, 245], gN3: [-182, 290], gN4: [-165, 345], gN5: [-145, 400], gKHT: [-115, 458],
    gL0: [-208, 40], gL1: [-226, 118], gL2: [-232, 200], gL2a: [-231, 245], gL3: [-222, 300], gL4: [-205, 355], gL5: [-180, 415],
    // Stortorget's corners, Källargränd, Bollhusgränd, Köpmangatan, Skomakargatan, Svartmangatan and the lanes off them
    gTNW: [-92, 190], gTNE: [-36, 190], gTE: [-36, 212], gTSE: [-52, 240], gTSW: [-98, 236], gKG0: [14, 84], gKG1: [12, 150], gBH0: [48, 82], gBH1: [52, 213],
    gSM0: [30, 213], gSM1: [32, 262], gSM1b: [33, 280], gSKo1: [-47, 280], gTB3: [-46, 350], gTB5: [38, 352], gTB6: [64, 352], gTB7: [100, 350],
    gBG0: [60, 264], gBT: [85, 265], gSJ1: [93, 300],
    // Österlånggatan (O), and where each gränd meets Skeppsbron (Sz, z the distance south of the palace). The gränder
    // between them are placed from their real coordinates (hitta.se and Wikidata), scaled to the game's Gamla stan:
    // z = 232 + (59.325111 − latitude) × 118 700, Köpmantorget being at z = 232
    gO1: [118, 136], gO1b: [122, 156], gO2: [125, 184], gO2k: [126.8, 206], gKT: [128, 220], gO2b: [131, 245], gO3: [134, 268], gO3b: [134, 294],
    gO3c: [133, 312], gO5: [130, 345], gO6: [122, 370], gO6b: [110, 392], gO7: [88, 415], gO8: [50, 436],
    gS136: [217.7, 136], gS156: [219.3, 156], gS206: [220.9, 206], gS245: [218.1, 245], gS268: [216.4, 268], gS294: [214.6, 294],
    gS312: [213.3, 312], gS370: [197.2, 370], gS392: [189.1, 392], gS415: [180.6, 415], gS475: [100.3, 475.5],
    RH1: [-385, -15], RH2: [-470, 50], RH3: [-480, 240], RH4: [-400, 200],
    // Södermalm
    SL1: [50, 665], SMT: [30, 725], CB1: [-260, 705], SMS2: [-550, 745], SMS3: [-850, 768], KV1: [260, 695], KV2: [520, 735],
    HG1: [-150, 800], BM1: [-245, 847], HG2: [-330, 890], HG3: [-490, 1010], SW0: [-560, 1040], HG4: [-700, 1100], HG5: [-950, 1200],
    GG1: [45, 860], GG2: [60, 1000], GG3: [70, 1142], GG4: [78, 1290], MP: [85, 1380], GG5: [100, 1500],
    OG0: [330, 880], OG1: [335, 1152], OG2: [345, 1368], OG3: [350, 1488], RG0: [570, 900], RG1: [580, 1160], RG2: [590, 1362], RG3: [600, 1480],
    SW1: [-560, 1140], SWh: [-557, 1250], SW3: [-552, 1510], HB1: [-180, 1165], HB2: [-380, 1205], SP1: [-180, 1040], BM2: [-255, 1052], SP2: [-390, 1075], FW1: [-200, 1508],
    // Skeppsholmen and Djurgården
    SH0: [478, -52], SH1: [610, -80], SH2: [780, 5], SH3: [850, 170], SH4: [720, 290], SH5: [545, 225],
    DJ0: [1078, -455], DJ1: [1170, -330], DJ2: [1220, -90], DJ3: [1260, 170], DJ5: [1110, 130], DJ6: [1060, -180],
    // further out: Norrtull, Roslagstull, Sankt Eriksplan and Odenplan, Karlaplan and Gärdet, the far end of Djurgården,
    // Danvikstull and Skanstull on Söder, and the bridges to Långholmen and Liljeholmen
    NTL: [-870, -2060], RTU: [-8, -1700], SEP: [-1560, -1440], ODP: [-795.3, -1420], KPL: [1100, -1205], LVV: [1450, -1500],
    DHN: [2650, -742], DBS: [2665, -575], RDL: [2800, -450], BHU: [3080, -150], GLU: [1330, 400],
    DVT: [1900, 1250], NAK: [2125, 1255], SIK: [1950, 2150], SKT: [125, 1955], SKS: [140, 2190],
    VBN: [-1760, -72.27], LHJ: [-1440, 640], VBS: [-1350, 815], LJS: [-1150, 1890], LJH: [-1300, 2200]
  };
  const STREETS = [
    // Norrmalm
    ['Strömgatan', 'TB VB D0 GA OP KT0', { hw: 7, walk: 6 }],
    ['Vasagatan', 'TB V2 V3 V4 V5 V6 V7', { hw: 8 }],
    ['Drottninggatan', 'D0 D1 D2 D3 D4 D5 D6 D7', { kind: 'ped', hw: 6 }],
    ['Sveavägen', 'ST S1 S2 S3 S4', { hw: 9, trees: 'both' }],
    ['Regeringsgatan', 'GA R0 R1 R2 R3 R4 R45 R5', { hw: 5.5 }],
    ['Västra Trädgårdsgatan', 'VT0 VT1 VT2', { hw: 5 }],
    ['Kungsträdgårdsgatan', 'KT0 KT1 KT2', { hw: 6 }],
    ['Fredsgatan', 'D1 R0 VT0', { hw: 5 }],
    ['Jakobsgatan', 'D2 R1 VT1', { hw: 5 }],
    ['Klarabergsgatan', 'V3 D3 ST', { hw: 7 }],
    ['Hamngatan', 'ST R2 VT2 KT2 NT NP', { hw: 7, walk: 5 }],
    ['Mäster Samuelsgatan', 'V4 D4 S1 R3', { hw: 5 }],
    ['Kungsgatan', 'V5 D5 S2 R4 SP', { hw: 7.5, walk: 5 }],
    ['Olof Palmes gata', 'V6 D6 S3 R45', { hw: 6 }],
    ['Tegnérgatan', 'V7 D7 S4 R5 BJ2', { hw: 6 }],
    ['Tegelbacken', 'TB TBw SHB', { hw: 7 }],
    ['Stadshusbron', 'SHB SHk', { hw: 7, bridge: true }],
    ['Kungsbron', 'V5 KB1', { hw: 7 }],
    ['Kungsbron', 'KB1 KB2', { hw: 7, bridge: true }],
    ['Södra Blasieholmshamnen', 'KT0 GH NM BT', { hw: 7, walk: 9 }],
    ['Arsenalsgatan', 'KT1 BH1', { hw: 5 }],
    ['Blasieholmsgatan', 'GH BH1 NP', { hw: 5 }],
    ['Nybrokajen', 'BT NK1 NP', { hw: 6 }],
    // Östermalm
    ['Birger Jarlsgatan', 'NP BJr BJs SP BJ2', { hw: 7.5, walk: 5 }],
    ['Biblioteksgatan', 'NT BB1 SP', { kind: 'ped', hw: 4.5 }],
    ['Sturegatan', 'SP LN0 KA1', { hw: 6.5 }],
    ['Strandvägen', 'NP SV1 SV2 SV3 SV4', { hw: 9, walk: 10, trees: 'both' }],
    ['Riddargatan', 'BJr NYr SIr GRr BAr', { hw: 5.5 }],
    ['Storgatan', 'BJs NYs SIs GRs BAs', { hw: 5.5 }],
    ['Linnégatan', 'LN0 NY2 SI2 GR2 BA2', { hw: 6.5 }],
    ['Karlavägen', 'BJ2 KA1 NY3 SI3 GR3 BA3', { hw: 9, median: true }],
    ['Nybrogatan', 'NP NYr NYs NY2 NY3', { hw: 6 }],
    ['Sibyllegatan', 'SV1 SIr SIs SI2 SI3', { hw: 5.5 }],
    ['Grevgatan', 'SV2 GRr GRs GR2 GR3', { hw: 5.5 }],
    ['Banérgatan', 'SV3 BAr BAs BA2 BA3', { hw: 6 }],
    // Kungsholmen
    ['Hantverkargatan', 'SHk SC1 PH1', { hw: 7 }],
    ['Kungsholmsgatan', 'KG0 SC2 PH2', { hw: 6 }],
    ['Fleminggatan', 'KB2 SC3 PH3', { hw: 7 }],
    ['Norr Mälarstrand', 'NM0 NM1', { hw: 7, walk: 8, trees: 'left' }],
    ['Scheelegatan', 'NM0 SC1 SC2 SC3', { hw: 6 }],
    ['Polhemsgatan', 'NM1 PH1 PH2 PH3', { hw: 5.5 }],
    ['Kungsbro strand', 'SHk KG0 KB2', { hw: 5.5 }],
    // Helgeandsholmen and Gamla stan
    ['Riksbron', 'D0 RB1', { hw: 5, bridge: true }],
    ['Riksgatan', 'RB1 RB2', { hw: 4.5, walk: 2.5 }],
    ['Stallbron', 'RB2 MT', { hw: 4.5, bridge: true }],
    ['Norrbro', 'GA NB1', { hw: 6, bridge: true }],
    ['Norrbro', 'NB1 NB2', { hw: 6, walk: 2.5 }],
    ['Norrbro', 'NB2 LB', { hw: 6, bridge: true }],
    ['Strömbron', 'KT0 SBs', { hw: 6.5, bridge: true }],
    ['Mynttorget', 'MT gMT2 LB', { hw: 5 }],
    ['Slottskajen', 'LB SBs', { hw: 6, walk: 5 }],
    ['Skeppsbron', 'SBs SK1 gS136 gS156 SK2 gS206 gS245 gS268 gS294 gS312 SK3 gS370 gS392 gS415 SK4 gS475 SL0', { hw: 8, walk: 7 }],
    ['Slottsbacken', 'SK1 gSB1 SBk', { hw: 6 }],
    ['Storkyrkobrinken', 'SBk gBH0 gKG0 STK gP0 gV2 gN0 gRHT', { hw: 4, walk: 1.5 }],
    ['Myntgatan', 'MT gRHN', { hw: 4.5, walk: 2 }],
    ['Riddarhustorget', 'RT gRHN gRHT', { hw: 5, walk: 2 }],
    ['Stora Nygatan', 'gN0 gN1 gN1b gN2 gN2b gN3 gN4 gN5 gKHT', { hw: 4, walk: 1.5 }],
    ['Kornhamnstorg', 'gKHT KH', { hw: 5, walk: 2 }],
    ['Kornhamnstorg', 'KH SL0', { hw: 6 }],
    ['Munkbroleden', 'RT MB1 MB2 gMBg MB3 KH', { hw: 7, walk: 6 }],
    // the lanes: cobbles, no through traffic (the police on blue lights take them anyway)
    ['Västerlånggatan', 'gMT2 gV0 gV2 gV3 gV3b gV4 gV4b gV5 gV6 gV6b gV7 gV8 gJT', { kind: 'lane', hw: 3.2 }],
    ['Högvaktsterrassen', 'gV0 gHV0', { kind: 'lane', hw: 3.5 }],
    ['Yttre borggården', 'gHV0 gHV', { kind: 'lane', hw: 6, walk: 0 }],
    ['Prästgatan', 'gP0 gP1 gP1b gP2 gP2b gP3 gP4 gP4b gV8', { kind: 'lane', hw: 2.4, walk: 0.4 }],
    ['Lilla Nygatan', 'gRHT gL0 gL1 gL2 gL2a gL3 gL4 gL5 gKHT', { kind: 'lane', hw: 3 }],
    ['Trångsund', 'STK gTNW', { kind: 'lane', hw: 2.6, walk: 0.5 }],
    ['Källargränd', 'gKG0 gKG1 gTNE', { kind: 'lane', hw: 1.9, walk: 0.3 }],
    ['Bollhusgränd', 'gBH0 gBH1', { kind: 'lane', hw: 1.8, walk: 0.3 }],
    ['Stortorget', 'gTNW gTNE gTE gTSE gTSW gTNW', { kind: 'lane', hw: 2.6, walk: 0.4 }],
    ['Köpmangatan', 'gTE gSM0 gBH1', { kind: 'lane', hw: 2.5, walk: 0.4 }],
    ['Köpmanbrinken', 'gBH1 gKT', { kind: 'lane', hw: 2.5, walk: 0.4 }],
    ['Skomakargatan', 'gTSE gSKo1 gTB3', { kind: 'lane', hw: 2.4, walk: 0.4 }],
    ['Svartmangatan', 'gSM0 gSM1 gSM1b gTB5', { kind: 'lane', hw: 2.6, walk: 0.4 }],
    ['Kåkbrinken', 'gV4b gP2b gTSW', { kind: 'lane', hw: 2, walk: 0.3 }],
    ['Tyska brinken', 'gV6 gP4 gTB3 gTB5 gTB6 gTB7 gO5', { kind: 'lane', hw: 2.8, walk: 0.5 }],
    ['Tyska skolgränd', 'gSKo1 gSM1b', { kind: 'lane', hw: 1.5, walk: 0.3 }],
    ['Kindstugatan', 'gSM1 gBG0 gBT gO3', { kind: 'lane', hw: 2.2, walk: 0.3 }],
    ['Baggensgatan', 'gBG0 gTB6', { kind: 'lane', hw: 2, walk: 0.3 }],
    ['Själagårdsgatan', 'gBT gSJ1 gTB7', { kind: 'lane', hw: 2.2, walk: 0.3 }],
    ['Brunnsgränd', 'gSJ1 gO3b', { kind: 'lane', hw: 1.6, walk: 0.3 }],
    ['Österlånggatan', 'gSB1 gO1 gO1b gO2 gO2k gKT gO2b gO3 gO3b gO3c gO5 gO6 gO6b gO7 gO8 gJT2', { kind: 'lane', hw: 3 }],
    ['Järntorget', 'gJT gJT2', { kind: 'lane', hw: 5, walk: 0.5 }],
    ['Järntorget', 'gKHT gJT', { kind: 'lane', hw: 3.5 }],
    ['Järntorgsgatan', 'gJT2 gJG SL0', { kind: 'lane', hw: 3 }],
    // between Västerlånggatan and Prästgatan, north to south
    ['Helga Lekamens gränd', 'gV3 gP1', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Peder Fredags gränd', 'gV3b gP1b', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Didrik Ficks gränd', 'gV4 gP2', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Schönfeldts gränd', 'gV5 gP3', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Mårten Trotzigs gränd', 'gV6b gP4b', { kind: 'lane', hw: 0.55, walk: 0.1, stairs: true }],
    // west of Västerlånggatan, down to Stora and Lilla Nygatan and the quay at Munkbron
    ['Sven Vintappares gränd', 'gV3 gN1', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Gåsgränd', 'gV3b gN1b', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Göran Hälsinges gränd', 'gV4 gN2 gL2', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Ignatiigränd', 'gV4b gN2b', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Funckens gränd', 'gN2b gL2a', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Yxsmedsgränd', 'gV7 gN5', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Munkbrogatan', 'gL3 gMBg', { kind: 'lane', hw: 2.6, walk: 0.4 }],
    // from Österlånggatan down to Skeppsbron, north to south, in the real order: Telegrafgränd by Slottsbacken, then
    // Skeppar Karls gränd, Bredgränd, Kråkgränd, Nygränd (across from Köpmanbrinken), Skottgränd, Stora Hoparegränd,
    // Drakens gränd, Ferkens gränd, Gaffelgränd, Johannesgränd, Packhusgränd and Tullgränd down by Slussen
    ['Telegrafgränd', 'gO1 gS136', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Skeppar Karls gränd', 'gO1b gS156', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Bredgränd', 'gO2 SK2', { kind: 'lane', hw: 2.1, walk: 0.2 }],
    ['Kråkgränd', 'gO2k gS206', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Nygränd', 'gO2b gS245', { kind: 'lane', hw: 1.6, walk: 0.2 }],
    ['Skottgränd', 'gO3 gS268', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Stora Hoparegränd', 'gO3b gS294', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    // named after the tavern Draken that stood at its western end (75 m, 59.32444 N 18.07475 E)
    ['Drakens gränd', 'gO3c gS312', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Ferkens gränd', 'gO5 SK3', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Gaffelgränd', 'gO6 gS370', { kind: 'lane', hw: 1.4, walk: 0.2 }],
    ['Johannesgränd', 'gO6b gS392', { kind: 'lane', hw: 1.5, walk: 0.2 }],
    ['Packhusgränd', 'gO7 gS415', { kind: 'lane', hw: 1.6, walk: 0.2 }],
    ['Tullgränd', 'gJG gS475', { kind: 'lane', hw: 1.8, walk: 0.2 }],
    ['Vasabron', 'VB RT', { hw: 6.5, bridge: true }],
    ['Riddarholmsbron', 'RT RH1', { hw: 5, bridge: true }],
    ['Birger jarls torg', 'RH1 RH2', { hw: 5 }],
    ['Evert Taubes terrass', 'RH2 RH3', { hw: 5 }],
    ['Riddarholmen', 'RH3 RH4 RH1', { hw: 5 }],
    ['Slussen', 'SL0 SL1', { hw: 9, bridge: true }],
    ['Centralbron', 'MB3 CB1', { hw: 8, bridge: true, limit: 90 }],
    // Södermalm
    ['Slussen', 'SL1 SMT', { hw: 8 }],
    ['Söder Mälarstrand', 'SL1 CB1 SMS2 SMS3', { hw: 7.5, walk: 8, trees: 'right' }],
    ['Katarinavägen', 'SL1 KV1 KV2', { hw: 7 }],
    ['Hornsgatan', 'SMT HG1 BM1 HG2 HG3 SW0 HG4 HG5', { hw: 7.5, walk: 5 }],
    ['Götgatan', 'SMT GG1 GG2 GG3 GG4 MP GG5', { hw: 6.5 }],
    ['Hökens gata', 'GG1 OG0 RG0', { hw: 5.5 }],
    ['Renstiernas gata', 'KV2 RG0 RG1 RG2 RG3', { hw: 6 }],
    ['Östgötagatan', 'OG0 OG1 OG2 OG3', { hw: 6 }],
    ['Swedenborgsgatan', 'SW0 SW1 SWh SW3', { hw: 5.5 }],
    ['Högbergsgatan', 'SWh HB2 HB1 GG3 OG1 RG1', { hw: 5.5 }],
    ['Sankt Paulsgatan', 'GG2 SP1 BM2 SP2 SW1', { hw: 5.5 }],
    ['Bellmansgatan', 'CB1 BM1 BM2', { hw: 5 }],
    ['Tjärhovsgatan', 'MP OG2 RG2', { hw: 6 }],
    ['Folkungagatan', 'GG5 OG3 RG3', { hw: 7 }],
    ['Rosenlundsgatan', 'SW3 FW1 GG5', { hw: 6.5 }],
    ['Ludvigsbergsgatan', 'SMS3 HG5', { hw: 5.5 }],
    ['Torkel Knutssonsgatan', 'SMS2 SW0', { hw: 6 }],
    // Skeppsholmen and Djurgården
    ['Skeppsholmsbron', 'BT SH0', { hw: 5.5, bridge: true }],
    ['Skeppsholmen', 'SH0 SH1 SH2 SH3 SH4 SH5 SH0', { hw: 5 }],
    ['Djurgårdsbron', 'SV4 DJ0', { hw: 6, bridge: true }],
    ['Djurgårdsvägen', 'DJ0 DJ1 DJ2 DJ3', { hw: 5.5 }],
    ['Galärvarvsvägen', 'DJ3 DJ5 DJ6 DJ1', { hw: 5 }]
  ];


  // The rest of the inner city: streets drawn through real points rather than between named junctions. Wherever one
  // crosses another, or ends on it, a junction is made there, so the network stays joined up however it was drawn.
  const MORE = [
    ['Karduansmakargatan', [[-562.7, -368], [-241.2, -378]], { hw: 4.5 }],
    ['Klara Södra Kyrkogata', [[-594.7, -462], 'D2'], { hw: 4.5 }],
    ['Klara Östra Kyrkogata', [[-333.7, -375.1], [-434.7, -591.1]], { hw: 4.5 }],
    ['Klara Västra Kyrkogata', [[-431.6, -372.1], [-523.7, -569.0]], { hw: 4.5 }],
    ['Klara Norra Kyrkogata', [[-635.1, -605.1], [-377.5, -669.3]], { hw: 4.5 }],
    ['Vattugatan', [[-678.8, -772.8], [-444.7, -813.0]], { hw: 4 }],
    ['Bryggargatan', [[-412.0, -596.8], [-540.0, -870.5]], { hw: 4.5 }],
    ['Gamla Brogatan', [[-489.1, -577.6], [-621.7, -861.0]], { hw: 4.5 }],
    ['Barnhusgatan', [[-751.5, -1075.0], [-569.0, -1078.7]], { hw: 4.5 }],
    ['Kammakargatan', [[-569.0, -1078.7], [-168.3, -1090.6]], { hw: 5 }],
    ['Malmtorgsgatan', [[-182, -358.3], [-176, -648.3]], { hw: 4.5 }],
    ['Sergelgatan', [[-316.6, -629.0], [-434.8, -880.5]], { kind: 'ped', hw: 5 }],
    ['Holländargatan', [[-488.7, -1014.0], [-550.9, -1146.5]], { hw: 4.5 }],
    ['Luntmakargatan', [[-332.1, -892.4], [-452.3, -1148.3]], { hw: 4.5 }],
    ['Döbelnsgatan', [[-333.9, -1023.3], [-392.8, -1148.7]], { hw: 5 }],
    ['Malmskillnadsgatan', [[-192, -766], [-248, -1150]], { hw: 5 }],
    ['Lästmakargatan', ['VT2', [-44, -722], [-56, -939.4]], { hw: 4.5 }],
    ['Norrlandsgatan', [[40, -649.1], [56, -956.6]], { hw: 5 }],
    ['Smålandsgatan', [[-48, -711], [285.5, -715]], { hw: 5 }],
    ['Mäster Samuelsgatan', ['R3', 'BB1', [229.5, -806]], { hw: 5 }],
    ['Jakobsbergsgatan', [[-141.8, -858], [183.9, -880]], { hw: 4.5 }],
    ['Stallgatan', [[259.2, -392], [404.4, -392]], { hw: 4.5 }],
    ['Upplandsgatan', ['V7', [-800, -1468]], { hw: 6 }],
    ['Drottninggatan', ['D7', [-685.6, -1328.0]], { kind: 'ped', hw: 5 }],
    ['Sveavägen', ['S4', [-653.3, -1468]], { hw: 9, trees: 'both' }],
    ['Holländargatan', [[-550.9, -1146.5], [-701.9, -1468]], { hw: 4.5 }],
    ['Luntmakargatan', [[-452.3, -1148.3], [-602.5, -1468]], { hw: 4.5 }],
    ['Döbelnsgatan', [[-392.8, -1148.7], [-542.8, -1468]], { hw: 4.5 }],
    ['Tulegatan', [[-300, -1149.2], [-338, -1468]], { hw: 4.5 }],
    ['Regeringsgatan', ['R5', [-196.4, -1342.9]], { hw: 5.5 }],
    ['Birger Jarlsgatan', ['BJ2', [24, -1468]], { hw: 7.5, walk: 5 }],
    ['Rådmansgatan', [[-777.1, -1235], [51.4, -1260]], { hw: 5.5 }],
    ['Kungstensgatan', [[-786.0, -1325], [39.6, -1350]], { hw: 5 }],
    ['Odengatan', [[-795.3, -1420], [27.0, -1445]], { hw: 7 }],
    ['Grev Turegatan', [[300, -749.0], [300, -1180.0]], { hw: 5 }],
    ['Skeppargatan', [[615, -638.5], [615, -1180.0]], { hw: 5 }],
    ['Jungfrugatan', [[782, -622.6], [782, -1180.0]], { hw: 5 }],
    ['Artillerigatan', [[848, -616.7], [848, -1180.0]], { hw: 5 }],
    ['Humlegårdsgatan', [[150.2, -935], [350.0, -937]], { hw: 5.5 }],
    ['Kommendörsgatan', [[205.2, -1090], [920.6, -1090]], { hw: 5.5 }],
    ['Bergsgatan', [[-927.4, -560], [-1351.7, -560]], { hw: 5 }],
    ['Pipersgatan', [[-1280, -504.2], [-1280, -644.5]], { hw: 4.5 }],
    ['Parmmätargatan', [[-1200, -442.0], [-1200, -643.3]], { hw: 4.5 }],
    ['Pilgatan', [[-1250, -53.5], [-1250, -480.9]], { hw: 4.5 }],
    ['Garvargatan', [[-1099.7, -205], [-1380, -205]], { hw: 4.5 }],
    ['Sankt Eriksgatan', [[-1560, -62.8], [-1560, -1100]], { hw: 7 }],
    ['Fridhemsgatan', [[-1470, -60.4], [-1470, -900]], { hw: 5 }],
    ['Hantverkargatan', ['PH1', [-1560, -720]], { hw: 7 }],
    ['Kungsholmsgatan', ['PH2', [-1560, -652]], { hw: 6 }],
    ['Fleminggatan', ['PH3', [-1560, -900]], { hw: 7 }],
    ['Norr Mälarstrand', ['NM1', [-1680, -66]], { hw: 7, walk: 8, trees: 'left' }],
    ['Brännkyrkagatan', [[-252.1, 780.0], [-943.6, 1172.6]], { hw: 4.5 }],
    ['Långholmsgatan', ['HG5', [-945, 1640]], { hw: 7 }],
    ['Krukmakargatan', [[-560.0, 1140.0], [-948.2, 1360.3]], { hw: 4.5 }],
    ['Timmermansgatan', [[-650, 1078.6], [-650, 1640]], { hw: 4.5 }],
    ['Ringvägen', [[-945, 1640], [1000, 1630]], { hw: 8, median: true }],
    ['Götgatan', ['GG5', [112, 1634.6]], { hw: 6.5 }],
    ['Östgötagatan', ['OG3', [356, 1633.3]], { hw: 6 }],
    ['Renstiernas gata', ['RG3', [606, 1632.0]], { hw: 6 }],
    ['Swedenborgsgatan', ['SW3', [-550, 1638.0]], { hw: 5.5 }],
    ['Wollmar Yxkullsgatan', [[81.1, 1330], [-554.7, 1372]], { hw: 5 }],
    ['Folkungagatan', ['RG3', [930, 1474]], { hw: 7 }],
    ['Tjärhovsgatan', ['RG2', [930, 1356]], { hw: 6 }],
    ['Högbergsgatan', ['RG1', [930, 1162]], { hw: 5.5 }],
    ['Åsögatan', [[338.4, 1226], [930, 1226]], { hw: 5 }],
    ['Skånegatan', [[341.9, 1300], [930, 1300]], { hw: 5.5 }],
    ['Bondegatan', [[347.5, 1428], [930, 1428]], { hw: 5 }],
    ['Södermannagatan', [[462, 1156.1], [462, 1484.4]], { hw: 5 }],
    ['Nytorgsgatan', [[762, 1162], [762, 1474]], { hw: 5 }],
    ['Gotlandsgatan', [[255, 1372.2], [255, 1492.6]], { hw: 4.5 }],
    // two gränder that really are on the other side of Gamla stan: Ankargränd between Trångsund and Prästgatan just
    // west of Storkyrkan, and Triewaldsgränd from Järntorget down to Kornhamnstorg
    ['Ankargränd', [[-90.4, 176], [-116, 176]], { kind: 'lane', hw: 1.3, walk: 0.2 }],
    ['Triewaldsgränd', ['gJT', [-24, 496.4]], { kind: 'lane', hw: 1.6, walk: 0.2 }],
    // Vasastan's north: Sankt Eriksbron over Karlbergssjön, Karlbergsvägen to Odenplan, Sveavägen and Norrtullsgatan up
    // to Norrtull, Vanadisvägen across to Roslagstull
    ['Sankt Eriksgatan', [[-1560, -1100], [-1560, -1172]], { hw: 7 }],
    ['Sankt Eriksbron', [[-1560, -1172], [-1560, -1268]], { hw: 7, bridge: true }],
    ['Sankt Eriksgatan', [[-1560, -1268], 'SEP', [-1560, -2073.4]], { hw: 7 }],
    ['Karlbergsvägen', [[-2400, -1460], 'SEP', 'ODP'], { hw: 6.5 }],
    ['Norrtullsgatan', [[-800, -1468], 'NTL'], { hw: 6 }],
    ['Sveavägen', [[-653.3, -1468], 'NTL'], { hw: 9, trees: 'both' }],
    ['Uppsalavägen', ['NTL', [-905, -2375]], { hw: 9, limit: 90 }],
    ['Norra Stationsgatan', [[-1900, -2080], 'NTL', [-32.02, -2045]], { hw: 6 }],
    ['Vanadisvägen', [[-1560, -1775], 'RTU'], { hw: 6 }],
    ['Dalagatan', [[-1300, -1433.2], [-1310, -2068.54]], { hw: 5.5 }],
    ['Tulegatan', [[-338, -1468], [-367.7, -1717.4]], { hw: 4.5 }],
    ['Birger Jarlsgatan', [[24, -1468], 'RTU'], { hw: 7.5, walk: 5 }],
    ['Roslagsvägen', ['RTU', [-55, -2375]], { hw: 8, limit: 90 }],
    // Östermalm up to Valhallavägen, Karlaplan, Narvavägen down to Strandvägen, and Lidingövägen out over Gärdet
    ['Valhallavägen', ['RTU', [1150, -1640], 'LVV'], { hw: 9, median: true }],
    ['Grev Turegatan', [[300, -1180], [300, -1684.04]], { hw: 5 }],
    ['Nybrogatan', ['NY3', [370, -1680.42]], { hw: 6 }],
    ['Sibyllegatan', ['SI3', [555, -1670.83]], { hw: 5.5 }],
    ['Skeppargatan', [[615, -1180], [615, -1667.72]], { hw: 5 }],
    ['Grevgatan', ['GR3', [730, -1661.76]], { hw: 5.5 }],
    ['Banérgatan', ['BA3', [930, -1651.4]], { hw: 6 }],
    ['Östermalmsgatan', [[43.53, -1320], [1236.44, -1320]], { hw: 5.5 }],
    ['Karlavägen', ['BA3', 'KPL'], { hw: 9, median: true }],
    ['Narvavägen', ['SV4', 'KPL'], { hw: 8, median: true }],
    ['Riddargatan', ['BAr', [1078.16, -730]], { hw: 5.5 }],
    ['Storgatan', ['BAs', [1084.23, -862]], { hw: 5.5 }],
    ['Linnégatan', ['BA2', [1090.48, -998]], { hw: 6.5 }],
    ['Lidingövägen', ['KPL', 'LVV', [1800, -1800], [2300, -1900], [2900, -2000]], { hw: 8 }],
    ['Dag Hammarskjölds väg', ['SV4', [1500, -610], [1950, -655], [2350, -712], 'DHN'], { hw: 6 }],
    ['Kaknäsvägen', ['DHN', [2600, -1100], [2550, -1941.67]], { hw: 6 }],
    // Djurgården: over the canal at Djurgårdsbrunn, Rosendal, Gröna Lund, Skansen and out to Blockhusudden
    ['Djurgårdsbrunnsbron', ['DHN', 'DBS'], { hw: 5, bridge: true }],
    ['Djurgårdsbrunnsvägen', ['DBS', 'RDL', 'BHU'], { hw: 5 }],
    ['Rosendalsvägen', ['DJ2', [1600, -160], [2200, -300], 'RDL'], { hw: 5 }],
    ['Djurgårdsvägen', ['DJ3', 'GLU', [1550, 520], [1850, 540], [2150, 400], [2450, 300], [2750, 200], [3000, 50], 'BHU'], { hw: 5.5 }],
    // Söder: Stadsgårdsleden along the water to Danvikstull and over Danviksbron to Nacka, Götgatan over Skanstullsbron
    // to Johanneshov, Globen and Hammarby sjöstad
    ['Stadsgårdsleden', ['KV2', [1000, 790], [1300, 825], [1600, 860], [1820, 925], 'DVT'], { hw: 8 }],
    ['Folkungagatan', [[930, 1474], 'DVT'], { hw: 7 }],
    ['Danviksbron', ['DVT', 'NAK'], { hw: 7, bridge: true }],
    ['Värmdövägen', ['NAK', [2600, 1330], [3270, 1360]], { hw: 7 }],
    ['Sicklavägen', [[1870, 2360], 'SIK', [2140, 1720], 'NAK'], { hw: 6 }],
    ['Götgatan', [[112, 1634.6], 'SKT'], { hw: 6.5 }],
    ['Skanstullsbron', ['SKT', 'SKS'], { hw: 8, bridge: true, limit: 90 }],
    ['Nynäsvägen', ['SKS', [300, 2400], [380, 2700], [420, 2970]], { hw: 8, limit: 90 }],
    ['Hammarby Sjöväg', [[159.05, 2215], 'SIK'], { hw: 6 }],
    ['Hammarby allé', [[261.9, 2350], [1870, 2360]], { hw: 7, trees: 'both' }],
    ['Lugnets allé', [[800, 2191.74], [800, 2690]], { hw: 5.5 }],
    ['Sickla kanalgata', [[1350, 2171.78], [1350, 2690]], { hw: 5 }],
    ['Arenavägen', [[332, 2520], [800, 2525]], { hw: 7 }],
    ['Palmfeltsvägen', [[377.33, 2690], [1350, 2690]], { hw: 6 }],
    ['Erstagatan', [[930, 781.98], [930, 1630.36]], { hw: 5 }],
    // west: Långholmsgatan up to Västerbron, which lands on Långholmen on its way over to Kungsholmen, Pålsundsbron, and
    // Liljeholmsbron over Årstaviken
    ['Långholmsgatan', ['HG5', 'VBS'], { hw: 7 }],
    ['Västerbron', ['VBN', 'LHJ'], { hw: 7, bridge: true, limit: 90 }],
    ['Västerbron', ['LHJ', 'VBS'], { hw: 7, bridge: true, limit: 90 }],
    ['Långholmsmuren', [[-1290, 690], 'LHJ', [-1620, 655]], { hw: 4.5 }],
    ['Pålsundsbron', [[-1300, 863.13], [-1290, 690]], { hw: 4.5, bridge: true }],
    ['Långholmsgatan', [[-945, 1640], 'LJS'], { hw: 7 }],
    ['Liljeholmsbron', ['LJS', 'LJH'], { hw: 7, bridge: true }],
    ['Södertäljevägen', ['LJH', [-2680, 2480]], { hw: 8 }],
    // Kungsholmen's west: Rålambshov, Marieberg, Drottningholmsvägen from Fridhemsplan, and Kungsholms strand
    ['Norr Mälarstrand', [[-1680, -66], 'VBN', [-2050, -95], [-2400, -130]], { hw: 7, walk: 8, trees: 'left' }],
    ['Rålambsvägen', [[-2050, -95], [-2080, -939.46]], { hw: 6 }],
    ['Drottningholmsvägen', [[-1560, -900], [-2680, -985]], { hw: 8 }],
    ['Gjörwellsgatan', [[-1560, -420], [-2400, -450]], { hw: 5.5 }],
    ['Lindhagensgatan', [[-2400, -1160], [-2400, -130]], { hw: 6.5 }],
    ['Kungsbro strand', ['KB2', [-935, -1150]], { hw: 5.5 }],
    ['Kungsholms strand', [[-935, -1150], [-2400, -1160]], { hw: 5.5 }]
  ];
  {
    const SNAP = 2.5, pt = (x, z, id) => ({ x, z, id: id || null });
    const named = new Map(), named1 = (id) => named.get(id) || (named.set(id, pt(PTS[id][0], PTS[id][1], id)), named.get(id));
    const chains = STREETS.map(([name, chain, o]) => ({ name, o, pts: chain.split(' ').map(named1) }))
      .concat(MORE.map(([name, list, o]) => ({ name, o, pts: list.map((p) => (typeof p === 'string' ? named1(p) : pt(p[0], p[1]))) })));
    const segs = [];
    for (const ch of chains) for (let i = 0; i < ch.pts.length - 1; i++) {
      const a = ch.pts[i], b = ch.pts[i + 1];
      segs.push({ ch, a, b, ins: [], x0: Math.min(a.x, b.x) - SNAP, x1: Math.max(a.x, b.x) + SNAP, z0: Math.min(a.z, b.z) - SNAP, z1: Math.max(a.z, b.z) + SNAP });
    }
    const along = (p, s) => {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, t = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / (dx * dx + dz * dz);
      return { t, d: Math.hypot(s.a.x + dx * t - p.x, s.a.z + dz * t - p.z) };
    };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], q = segs[j];
      if (s.x1 < q.x0 || q.x1 < s.x0 || s.z1 < q.z0 || q.z1 < s.z0) continue;
      if (s.a === q.a || s.a === q.b || s.b === q.a || s.b === q.b) continue;
      // one street ending on another
      let tee = false;
      for (const [u, v] of [[s, q], [q, s]]) for (const p of [u.a, u.b]) {
        const r = along(p, v);
        if (r.d < SNAP && r.t > 0 && r.t < 1) { v.ins.push({ t: r.t, p }); tee = true; }
      }
      // two streets crossing (never in the middle of a bridge)
      if (tee || s.ch.o.bridge || q.ch.o.bridge) continue;
      const dx1 = s.b.x - s.a.x, dz1 = s.b.z - s.a.z, dx2 = q.b.x - q.a.x, dz2 = q.b.z - q.a.z, den = dx1 * dz2 - dz1 * dx2;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.a.x - s.a.x) * dz2 - (q.a.z - s.a.z) * dx2) / den, u = ((q.a.x - s.a.x) * dz1 - (q.a.z - s.a.z) * dx1) / den;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      const p = pt(s.a.x + dx1 * t, s.a.z + dz1 * t);
      s.ins.push({ t, p }); q.ins.push({ t: u, p });
    }
    // points a few metres apart are one junction (a named one wins, two named ones never merge)
    const all = new Set();
    for (const ch of chains) for (const p of ch.pts) all.add(p);
    for (const s of segs) for (const r of s.ins) all.add(r.p);
    const list = [...all], root = new Map(list.map((p) => [p, p]));
    const find = (p) => { let r = p; while (root.get(r) !== r) r = root.get(r); root.set(p, r); return r; };
    const cell = new Map(), key = (x, z) => Math.floor(x / SNAP) + ',' + Math.floor(z / SNAP);
    for (const p of list) {
      const cx = Math.floor(p.x / SNAP), cz = Math.floor(p.z / SNAP);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) for (const q of cell.get(ix + ',' + iz) || []) {
        const a = find(p), b = find(q);
        if (a === b || Math.hypot(p.x - q.x, p.z - q.z) >= SNAP || (a.id && b.id)) continue;
        if (b.id) root.set(a, b); else root.set(b, a);
      }
      const k = key(p.x, p.z);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(p);
    }
    let made = 0;
    const idOf = (p) => { const r = find(p); if (!r.id) { r.id = 'w' + made++; PTS[r.id] = [Math.round(r.x * 10) / 10, Math.round(r.z * 10) / 10]; } return r.id; };
    const segsOf = new Map();
    for (const s of segs) { if (!segsOf.has(s.ch)) segsOf.set(s.ch, []); segsOf.get(s.ch).push(s); }
    STREETS.length = 0;
    for (const ch of chains) {
      const ids = [];
      for (const s of segsOf.get(ch) || []) {
        for (const p of [s.a, ...s.ins.sort((m, n) => m.t - n.t).map((r) => r.p), s.b]) { const id = idOf(p); if (ids[ids.length - 1] !== id) ids.push(id); }
      }
      if (ids.length > 1) STREETS.push([ch.name, ids.join(' '), ch.o]);
    }
  }

  const nodes = [], edges = [], nodeIndex = new Map();
  function nodeOf(id) {
    if (nodeIndex.has(id)) return nodeIndex.get(id);
    const p = PTS[id];
    if (!p) throw new Error('unknown junction ' + id);
    nodes.push({ id, x: p[0], z: p[1], nb: [], nbE: [], nbW: [], all: [], r: 0 });
    nodeIndex.set(id, nodes.length - 1);
    return nodes.length - 1;
  }
  const edgeKey = new Map();
  for (const [name, chain, o] of STREETS) {
    const ids = chain.split(' ');
    for (let i = 0; i < ids.length - 1; i++) {
      const a = nodeOf(ids[i]), b = nodeOf(ids[i + 1]), A = nodes[a], B = nodes[b];
      const kind = o.kind || 'street', hw = o.hw || (kind === 'lane' ? 3.2 : 6);
      const e = {
        a, b, name, kind, hw, len: Math.hypot(B.x - A.x, B.z - A.z),
        walk: o.walk !== undefined ? o.walk : kind === 'lane' ? 0.8 : kind === 'ped' ? 0.6 : hw >= 8 ? 6 : 4,
        bridge: !!o.bridge, stairs: !!o.stairs, drive: kind === 'street', trees: o.trees || null, median: !!o.median,
        // speed limits, raised for the game: 50 in the lanes, 70 on ordinary streets, 80 on the big streets and the
        // bridges, 30 where people walk
        limit: o.limit || (o.bridge ? 80 : kind === 'lane' ? 50 : kind === 'ped' ? 30 : hw >= 7 ? 80 : 70)
      };
      // where cars drive: the right-hand lane, the inner lane for overtaking, and the kerb lane for parking
      e.lane = e.median ? hw * 0.62 : hw >= 8 ? hw * 0.6 : Math.min(LANE, hw * 0.5);
      e.pass = hw >= 8 ? hw * 0.26 : -e.lane;
      e.park = hw >= 6 && !e.bridge ? hw - 1.1 : null;
      // police on blue lights may also take the lanes, the pedestrian streets and the squares, if a car fits
      e.emerg = e.drive || (!e.stairs && hw >= 1.35);
      e.i = edges.length;
      edges.push(e);
      A.all.push(e.i); B.all.push(e.i);
      if (e.drive) { A.nb.push(b); B.nb.push(a); }
      if (e.emerg) { A.nbE.push(b); B.nbE.push(a); }
      A.nbW.push(b); B.nbW.push(a); // on foot every street, lane and stair goes
      edgeKey.set(a + ',' + b, e); edgeKey.set(b + ',' + a, e);
    }
  }
  for (const n of nodes) n.r = Math.max(...n.all.map((i) => edges[i].hw)) + 1;
  const edgeBetween = (a, b) => edgeKey.get(a + ',' + b);

  // edges by area, for finding the nearest street quickly
  const EG = 64, egCells = new Map();
  const egKey = (ix, iz) => ix * 10007 + iz;
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], m = e.hw + e.walk + 30;
    for (let ix = Math.floor((Math.min(A.x, B.x) - m) / EG); ix <= Math.floor((Math.max(A.x, B.x) + m) / EG); ix++)
      for (let iz = Math.floor((Math.min(A.z, B.z) - m) / EG); iz <= Math.floor((Math.max(A.z, B.z) + m) / EG); iz++) {
        const k = egKey(ix, iz);
        if (!egCells.has(k)) egCells.set(k, []);
        egCells.get(k).push(e);
      }
  }
  const edgeDist = (e, x, z) => { const A = nodes[e.a], B = nodes[e.b]; return segDist(x, z, A.x, A.z, B.x, B.z); };
  // every street closer than 30 m to a point is listed in that point's cell, so a hit under 30 m is final
  function nearestEdge(x, z, filter) {
    const scan = (list) => {
      let best = null, bd = Infinity;
      for (const e of list) { if (filter && !filter(e)) continue; const d = edgeDist(e, x, z); if (d < bd) { bd = d; best = e; } }
      return { e: best, d: bd };
    };
    const cell = egCells.get(egKey(Math.floor(x / EG), Math.floor(z / EG)));
    const r = cell ? scan(cell) : null;
    return r && r.e && r.d < 30 ? r : scan(edges);
  }
  function edgesNear(x0, z0, x1, z1) {
    const out = new Set();
    for (let ix = Math.floor(x0 / EG); ix <= Math.floor(x1 / EG); ix++) for (let iz = Math.floor(z0 / EG); iz <= Math.floor(z1 / EG); iz++) {
      const c = egCells.get(egKey(ix, iz));
      if (c) for (const e of c) out.add(e);
    }
    return out;
  }
  // the first stretch from a towards b along the same street, if a junction was put between them
  function edgeToward(a, b) {
    const A = nodes[a], B = nodes[b], len = Math.hypot(B.x - A.x, B.z - A.z);
    for (const i of A.all) {
      const e = edges[i], o = nodes[e.a === a ? e.b : e.a];
      if (segDist(o.x, o.z, A.x, A.z, B.x, B.z) < 1 && (o.x - A.x) * (B.x - A.x) + (o.z - A.z) * (B.z - A.z) > 0 && Math.hypot(o.x - A.x, o.z - A.z) < len + 1) return e;
    }
    return undefined;
  }
  function edgeFrame(a, b) {
    const A = nodes[a], B = nodes[b], e = edgeBetween(a, b) || edgeToward(a, b);
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    // (rx, rz) is the right-hand side when driving from A to B
    return { A, B, ux, uz, rx: -uz, rz: ux, len, e, lane: e ? e.lane : LANE, pass: e ? e.pass : -LANE, park: e ? e.park : null };
  }

  /* ---------- where you can stand: a 1 m raster of land and bridges ---------- */
  const RW = BOUNDS.x1 - BOUNDS.x0, RH = BOUNDS.z1 - BOUNDS.z0;
  const ground = new Uint8Array(RW * RH); // 1 land, 2 bridge deck
  // a bridge deck covers its street from bank to bank, as wide as street plus pavements
  const bridgeRects = edges.filter((e) => e.bridge).map((e) => {
    const A = nodes[e.a], B = nodes[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len;
    return { e, A, B, ux, uz, hw: e.hw + e.walk };
  });
  {
    const T = 1024, cv = document.createElement('canvas');
    cv.width = cv.height = T;
    const g = cv.getContext('2d', { willReadFrequently: true });
    for (let ty = 0; ty < RH; ty += T) for (let tx = 0; tx < RW; tx += T) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, T, T);
      g.setTransform(1, 0, 0, 1, -tx - BOUNDS.x0, -ty - BOUNDS.z0);
      g.fillStyle = '#f00';
      for (const L of LANDS) { g.beginPath(); L.poly.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.fill(); }
      g.fillStyle = '#0f0';
      for (const b of bridgeRects) {
        const px = -b.uz * b.hw, pz = b.ux * b.hw;
        g.beginPath(); g.moveTo(b.A.x + px, b.A.z + pz); g.lineTo(b.B.x + px, b.B.z + pz); g.lineTo(b.B.x - px, b.B.z - pz); g.lineTo(b.A.x - px, b.A.z - pz); g.closePath(); g.fill();
      }
      const w = Math.min(T, RW - tx), h = Math.min(T, RH - ty), d = g.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        ground[(ty + y) * RW + tx + x] = (d[i] > 127 ? 1 : 0) | (d[i + 1] > 127 ? 2 : 0);
      }
    }
  }
  const groundAt = (x, z) => {
    const ix = Math.floor(x - BOUNDS.x0), iz = Math.floor(z - BOUNDS.z0);
    return ix < 0 || iz < 0 || ix >= RW || iz >= RH ? 0 : ground[iz * RW + ix];
  };
  const walkable = (x, z) => groundAt(x, z) !== 0;
  const solidLand = (x, z) => groundAt(x, z) === 1; // land that is not a bridge deck
  function districtAt(x, z) {
    const gnd = groundAt(x, z);
    if (gnd & 2) for (const b of bridgeRects) if (segDist(x, z, b.A.x, b.A.z, b.B.x, b.B.z) <= b.hw + 0.5 && !(gnd & 1)) return b.e.name;
    return landName(x, z) || waterName(x, z);
  }

  /* ---------- obstacle grid: boxes (also rotated) and circles ---------- */
  const GRID = 16, GOFF = 3000, GN = 400;
  const grid = new Array(GN * GN);
  let stamp = 0;
  const gcell = (v) => clamp(Math.floor((v + GOFF) / GRID), 0, GN - 1);
  function addObstacle(o, x0, z0, x1, z1) {
    o.stamp = 0;
    for (let ix = gcell(x0); ix <= gcell(x1); ix++) for (let iz = gcell(z0); iz <= gcell(z1); iz++) {
      const k = ix * GN + iz; (grid[k] || (grid[k] = [])).push(o);
    }
  }
  const addBox = (x0, z0, x1, z1, h = 99) => addObstacle({ t: 0, x0, z0, x1, z1, h }, x0, z0, x1, z1);
  const addCircle = (x, z, r, h = 6) => addObstacle({ t: 1, x, z, r, h }, x - r, z - r, x + r, z + r);
  // rotated box: centre, axis (c, s) for its local x, half sizes hx along it and hz across it
  function addOBox(cx, cz, c, s, hx, hz, h = 99, y0) {
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz, o = { t: 2, cx, cz, c, s, hx, hz, h };
    if (y0 !== undefined) o.y0 = y0;
    addObstacle(o, cx - ex, cz - ez, cx + ex, cz + ez);
    return o;
  }
  function forNear(x0, z0, x1, z1, fn) {
    stamp++;
    for (let ix = gcell(x0); ix <= gcell(x1); ix++) for (let iz = gcell(z0); iz <= gcell(z1); iz++) {
      const cell = grid[ix * GN + iz];
      if (!cell) continue;
      // an obstacle can be switched off (an open cell door)
      for (let i = 0; i < cell.length; i++) { const o = cell[i]; if (o.stamp === stamp || o.off) continue; o.stamp = stamp; fn(o); }
    }
  }
  // push a circle of radius r out of a box given in its own frame; returns [push x, push z] in that frame or null
  function boxPush(lx, lz, x0, z0, x1, z1, r) {
    const cx = clamp(lx, x0, x1), cz = clamp(lz, z0, z1), dx = lx - cx, dz = lz - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); return [(dx / d) * (r - d), (dz / d) * (r - d)]; }
    const e = [lx - x0, x1 - lx, lz - z0, z1 - lz], m = Math.min(e[0], e[1], e[2], e[3]);
    return m === e[0] ? [-(m + r), 0] : m === e[1] ? [m + r, 0] : m === e[2] ? [0, -(m + r)] : [0, m + r];
  }
  // an obstacle with y0 (walls indoors) only stands between y0 and h, so it blocks someone standing at height y
  // only on that storey; anything without a height (cars, spawn checks) counts as standing on the street
  const outOfReach = (o, y = 0) => o.y0 !== undefined && (y + 1.8 <= o.y0 || y + 0.3 >= o.h);
  function resolveWorld(x, z, r, y) {
    let nx = 0, nz = 0, hit = false;
    forNear(x - r, z - r, x + r, z + r, (o) => {
      if (outOfReach(o, y)) return;
      let px, pz;
      if (o.t === 1) {
        const rr2 = r + o.r, dx = x - o.x, dz = z - o.z, d2 = dx * dx + dz * dz;
        if (d2 >= rr2 * rr2) return;
        const d = Math.sqrt(d2) || 1e-4, pen = rr2 - d;
        px = (dx / d) * pen; pz = (dz / d) * pen;
      } else if (o.t === 0) {
        const p = boxPush(x, z, o.x0, o.z0, o.x1, o.z1, r);
        if (!p) return;
        px = p[0]; pz = p[1];
      } else {
        const dx = x - o.cx, dz = z - o.cz, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
        const p = boxPush(lx, lz, -o.hx, -o.hz, o.hx, o.hz, r);
        if (!p) return;
        px = p[0] * o.c - p[1] * o.s; pz = p[0] * o.s + p[1] * o.c;
      }
      const l = Math.hypot(px, pz) || 1;
      x += px; z += pz; nx += px / l; nz += pz / l; hit = true;
    });
    return { x, z, nx, nz, hit };
  }
  const blockedAt = (x, z, r) => resolveWorld(x, z, r).hit;
  // where a ray from (ax, az) along (dx, dz) first enters a box obstacle, as a fraction 0..1 of the ray (1: never)
  function rayBox(o, ax, az, dx, dz, pad = 0) {
    let px = ax, pz = az, vx = dx, vz = dz, x0, z0, x1, z1;
    if (o.t === 0) { x0 = o.x0 - pad; z0 = o.z0 - pad; x1 = o.x1 + pad; z1 = o.z1 + pad; }
    else if (o.t === 2) {
      const ox = ax - o.cx, oz = az - o.cz;
      px = ox * o.c + oz * o.s; pz = -ox * o.s + oz * o.c; vx = dx * o.c + dz * o.s; vz = -dx * o.s + dz * o.c;
      x0 = -o.hx - pad; z0 = -o.hz - pad; x1 = o.hx + pad; z1 = o.hz + pad;
    } else return 1;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[px, vx, x0, x1], [pz, vz, z0, z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return 1; continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return 1;
    }
    return t0;
  }

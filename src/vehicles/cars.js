'use strict';

  /* ---------- car materials ---------- */
  // Each car has one PBR material. The vertex attribute "surf" says how rough, metallic and lacquered each part is,
  // and which light it belongs to: 1 headlights, 2 tail/brake lights, 3 and 4 the blue lights left/right, 5 reversing lights.
  // Below zero it marks the parts the shader adds detail to: -1 the paint (metal flakes under the clear coat), -2 the tyres.
  // The paint is a base coat under a thin clear coat: glossy enough to catch the sun and the sky, thin enough that the
  // colour and the car's lines still show through it; chrome and the rims are bare polished metal, sharp enough to
  // mirror the street; the tyres are matte rubber.
  const SURF = {
    paint: [0.45, 0.03, 0.4, -1], trim: [0.62, 0.1, 0, 0], gloss: [0.1, 0.2, 1, 0], chrome: [0.05, 1, 0, 0], plate: [0.4, 0, 0, 0], tyre: [0.86, 0, 0, -2],
    alloy: [0.2, 1, 0.45, 0], under: [0.85, 0, 0, 0],
    head: [0.08, 0, 1, 1], tail: [0.12, 0, 1, 2], blueL: [0.08, 0, 1, 3], blueR: [0.08, 0, 1, 4], rev: [0.08, 0, 1, 5],
    indL: [0.1, 0, 1, 6], indR: [0.1, 0, 1, 7]
  };
  const COL = {
    head: 0xfff4d0, tail: 0xb3121b, rev: 0xf6f6f6, blueL: 0x2a5cff, blueR: 0x2a5cfe, plate: 0xf4f4f4, euBlue: 0x1f4fae,
    hub: 0x3a3d41, chrome: 0xc6cbd1, tyre: 0x17191c, busSign: 0xffa21a, doors: 0x2a3540, polBlue: 0x163d8c, polYellow: 0xd4e01c,
    rim: 0xb9bec4, rimDark: 0x2b2e33, aero: 0x8d9399, disc: 0x8b8f94, caliper: 0xb3131c, caliperGrey: 0x55595e, amber: 0xe8901c, rimLight: 0xdcdfe2,
    // the indicators, left (+x, the driver's side) and right: the same amber, told apart so that each side blinks on its own
    indL: 0xff7400, indR: 0xff7401
  };
  // LEXAN: the F40's smoked engine cover
  const CAR_GLASS = -2, UNDER = 0x0e0f11, CLAD = 0x26282b, GLOSS = 0x111215, CHROME = COL.chrome, STRIPE = 0xf2f2ef, LEXAN = 0x4c535a;
  const TRIM = { gloss: GLOSS, chrome: CHROME, dark: 0x1f2226, under: UNDER, lexan: LEXAN };
  function carSurf(paint) {
    return (col) => (col === paint || col === COL.polBlue || col === COL.polYellow || col === STRIPE ? SURF.paint
      : col === GLOSS || col === 0xf2c200 || col === COL.caliper || col === LEXAN || col === COL.amber ? SURF.gloss
        : col === COL.rim || col === COL.rimDark || col === COL.aero || col === COL.disc || col === COL.rimLight ? SURF.alloy : col === UNDER || col === CLAD ? SURF.under
      : col === COL.head || col === COL.busSign ? SURF.head : col === COL.tail ? SURF.tail : col === COL.rev ? SURF.rev
        : col === COL.blueL ? SURF.blueL : col === COL.blueR ? SURF.blueR : col === COL.indL ? SURF.indL : col === COL.indR ? SURF.indR : col === COL.chrome ? SURF.chrome
          : col === COL.plate || col === COL.euBlue ? SURF.plate : col === COL.tyre ? SURF.tyre : col === COL.doors ? SURF.gloss : SURF.trim);
  }
  // Reflections of the street: a small cube map caught round the camera (see POST) is mirrored in the cars near it,
  // over the sky they reflect everywhere else. It holds the finished picture (tone mapped, sRGB), so it is turned back
  // into light here, and a little of what the tone curve squeezed out of the bright sky and the sun is given back.
  const CAR_PROBE = { tProbe: { value: null }, uProbeOn: { value: 0 }, uProbePos: { value: new THREE.Vector3() }, uProbeMip: { value: 8 } };
  const PROBE_PARS = [
    'uniform samplerCube tProbe;\nuniform float uProbeOn, uProbeMip;\nuniform vec3 uProbePos;\nvarying vec3 vCarW;',
    '#ifdef USE_ENVMAP',
    'vec3 probeRadiance( const in vec3 viewDir, const in vec3 n, const in float rough ) {',
    '\tvec3 r = reflect( -viewDir, n );',
    '\tr = inverseTransformDirection( normalize( mix( r, n, rough * rough ) ), viewMatrix );',
    '\tfloat lod = clamp( uProbeMip + log2( PI * rough * rough / ( 1.0 + rough ) ), 0.0, uProbeMip );',
    '\t#ifdef TEXTURE_LOD_EXT',
    '\t\tvec3 c = textureCubeLodEXT( tProbe, r, lod ).rgb;',
    '\t#else',
    '\t\tvec3 c = textureCube( tProbe, r, lod ).rgb;',
    '\t#endif',
    '\tc = sRGBToLinear( vec4( c, 1.0 ) ).rgb;',
    '\treturn c / max( vec3( 1.0 ) - c * 0.5, vec3( 0.5 ) ) * envMapIntensity;',
    '}',
    '#endif'
  ].join('\n');
  // (how much of the probe a point gets: all of it within 25 m of where it was caught, none beyond 60 m)
  const PROBE_MIX = [
    '#include <lights_fragment_maps>',
    '#ifdef USE_ENVMAP',
    '\tfloat probeK = uProbeOn * ( 1.0 - smoothstep( 25.0, 60.0, distance( vCarW, uProbePos ) ) );',
    '\tif ( probeK > 0.0 ) {',
    '\t\tradiance = mix( radiance, probeRadiance( geometry.viewDir, geometry.normal, material.specularRoughness ), probeK );',
    '\t\t#ifdef CLEARCOAT',
    '\t\t\tclearcoatRadiance = mix( clearcoatRadiance, probeRadiance( geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness ), probeK );',
    '\t\t#endif',
    '\t}',
    '#endif'
  ].join('\n');
  function probeShader(shader) {
    Object.assign(shader.uniforms, CAR_PROBE);
    shader.vertexShader = 'varying vec3 vCarW;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvCarW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', '#include <envmap_physical_pars_fragment>\n' + PROBE_PARS)
      .replace('#include <lights_fragment_maps>', PROBE_MIX);
  }
  // The detail the shader adds up close, and fades out with distance so it never shimmers: the paint's metal flakes
  // (tiny mirrors tilted every which way under the clear coat, so the sun glints in the base coat) and the tyres' tread,
  // grooves round the running surface and blocks across it, with the sidewall a shade smoother than the tread
  // (only on the wheels, whose middle is their origin: not the spare wheel on a tailgate).
  const CAR_DETAIL = [
    '#include <normal_fragment_maps>',
    '\tfloat carDist = length( vViewPosition );',
    '\tif ( vSurf.w < -0.5 && vSurf.w > -1.5 && carDist < 7.0 ) {',
    '\t\tvec3 fl = fract( floor( vCarO * 420.0 ) * vec3( 0.1031, 0.1030, 0.0973 ) );',
    '\t\tfl += dot( fl, fl.yxz + 33.33 );',
    '\t\tfl = fract( ( fl.xxy + fl.yxx ) * fl.zyx ) - 0.5;',
    '\t\tnormal = normalize( normal + fl * 0.07 * ( 1.0 - smoothstep( 1.5, 7.0, carDist ) ) );',
    '\t} else if ( vSurf.w < -1.5 && dot( vCarO.yz, vCarO.yz ) < 0.5 ) {',
    '\t\tfloat side = smoothstep( 0.55, 0.85, abs( vCarN.x ) );',
    '\t\troughnessFactor = mix( roughnessFactor, 0.72, side );',
    '\t\tdiffuseColor.rgb *= mix( 1.0, 1.25, side );',
    '\t\tif ( carDist < 22.0 && side < 0.5 ) {',
    '\t\t\tfloat u = abs( vCarO.x ) * 9.0, a = atan( vCarO.z, vCarO.y ) * 9.549;',
    '\t\t\tfloat groove = 1.0 - smoothstep( 0.05, 0.12, abs( fract( u ) - 0.5 ) );',
    '\t\t\tgroove = max( groove, 1.0 - smoothstep( 0.04, 0.1, abs( fract( a + u * 0.35 ) - 0.5 ) ) );',
    '\t\t\tgroove *= ( 1.0 - side * 2.0 ) * ( 1.0 - smoothstep( 8.0, 22.0, carDist ) );',
    '\t\t\tdiffuseColor.rgb *= 1.0 - 0.45 * groove;',
    '\t\t\troughnessFactor = min( 1.0, roughnessFactor + 0.1 * groove );',
    '\t\t}',
    '\t}'
  ].join('\n');
  function carShader(shader) {
    shader.uniforms.uGlow = { value: this.userData.glow };
    shader.uniforms.uRev = this.userData.rev;
    shader.uniforms.uInd = { value: this.userData.ind };
    shader.vertexShader = 'attribute vec4 surf;\nvarying vec4 vSurf;\nvarying vec3 vCarO, vCarN;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurf = surf;\n\tvCarO = position;\n\tvCarN = normal;');
    shader.fragmentShader = 'varying vec4 vSurf;\nvarying vec3 vCarO, vCarN;\nuniform vec4 uGlow;\nuniform float uRev;\nuniform vec2 uInd;\n' + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = vSurf.y;')
      .replace('#include <normal_fragment_maps>', CAR_DETAIL)
      .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * vSurf.z;'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '\tfloat lightCh = vSurf.w;',
        '\tfloat glow = lightCh < 0.5 ? 0.0 : lightCh < 1.5 ? uGlow.x : lightCh < 2.5 ? uGlow.y : lightCh < 3.5 ? uGlow.z : lightCh < 4.5 ? uGlow.w : lightCh < 5.5 ? uRev : lightCh < 6.5 ? uInd.x : uInd.y;',
        '\ttotalEmissiveRadiance += diffuseColor.rgb * glow;'
      ].join('\n'));
    probeShader(shader);
  }
  const HEAD_GLOW = 0.6, TAIL_GLOW = 0.3, BRAKE_GLOW = 2.6, IND_GLOW = 2.6;
  const IND = (s) => (s > 0 ? COL.indL : COL.indR);
  function carMaterial() {
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.5 });
    m.userData.glow = new THREE.Vector4(HEAD_GLOW, TAIL_GLOW, 0, 0);
    m.userData.rev = { value: 0 };
    m.userData.ind = new THREE.Vector2(0, 0);
    m.onBeforeCompile = carShader;
    return m;
  }
  const wheelMat = carMaterial();
  // Car windows: tinted glass you see the seats and the driver through head on, turning into a mirror of the sky and the
  // street at a glancing angle (Fresnel), and as solid as its reflection is bright, as real glass looks
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x15222a, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 1.1 });
  glassMat.onBeforeCompile = (shader) => {
    probeShader(shader);
    shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', [
      'float glassF = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 4.0 );',
      '\tfloat glassA = saturate( mix( diffuseColor.a, 1.0, glassF ) + linearToRelativeLuminance( reflectedLight.directSpecular + reflectedLight.indirectSpecular ) );',
      '\tgl_FragColor = vec4( outgoingLight, glassA );'
    ].join('\n'));
  };
  const crackedMat = new THREE.MeshStandardMaterial({ color: 0xa9b6bd, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.92 });
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  // POLIS in the top half, the yellow TAXI sign in the bottom half
  const polisTex = canvasTex(256, 128, (g, w, h) => {
    g.font = '900 52px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#163d8c'; g.fillText('POLIS', w / 2, h / 4 + 3, w - 12);
    g.fillStyle = '#f2c200'; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = '#15171a'; g.font = '900 50px Overpass, "Arial Black", Arial, sans-serif'; g.fillText('TAXI', w / 2, (h * 3) / 4 + 3, w - 30);
  });
  const decalMat = std({ map: polisTex, transparent: true, alphaTest: 0.35, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });


  // The body is lofted: a cross-section ("ring") at each station along the car, from the sill up the side, over the
  // glasshouse and the roof to the middle, mirrored for the other side. Rings share their row count, so neighbouring
  // rings join into quads; every quad gets a colour from where it sits (lamp, grille, window, pillar, livery ...).
  function carShape(M) {
    if (M._shape) return M._shape;
    const S = M.shape, hl = M.L / 2, hw = M.W / 2;
    const sill = curve(S.sill), beltRaw = curve(S.belt), roof = curve(S.roof);
    const [r0, r1, r2, r3] = S.cab, [rcR, rcF] = S.rc, [pR, pF] = S.p || [3, 3], bulge = S.bulge ?? 0.06;
    const halfW = (z) => {
      let d, p;
      if (z > hl - rcF) { d = (z - hl + rcF) / rcF; p = pF; } else if (z < -hl + rcR) { d = (-hl + rcR - z) / rcR; p = pR; } else return hw;
      return hw * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, d), p)), 1 / p);
    };
    // where the rounded end is at lateral offset x (s = 1 front, -1 rear)
    const endZ = (x, s) => {
      const rc = s > 0 ? rcF : rcR, p = s > 0 ? pF : pR, a = Math.min(1, Math.abs(x) / hw);
      return s * (hl - rc + rc * Math.pow(Math.max(0, 1 - Math.pow(a, p)), 1 / p));
    };
    const wz = M.wb / 2, rA = M.R + 0.1, cA = M.R * 0.85;
    const archTop = cA + rA;
    // The waist line has to clear the wheel arch with a few centimetres of metal to spare. Where the drawn line is too
    // low for that (the low noses of the Lamborghini, the Ferraris and the Porsches) it is lifted across the whole
    // bonnet: a broad, even rise over the wheel that fades out towards the nose and the windscreen, never a hump
    const FADE = 0.8, fade = (d) => (d <= rA ? 1 : d >= rA + FADE ? 0 : 0.5 + 0.5 * Math.cos(((d - rA) / FADE) * Math.PI));
    const lifts = [wz, -wz].map((az) => {
      let L = 0;
      for (let i = -12; i <= 12; i++) { const dz = (rA * i) / 12; L = Math.max(L, cA + Math.sqrt(Math.max(0, rA * rA - dz * dz)) + 0.08 - beltRaw(az + dz)); }
      return L;
    });
    const belt = (z) => beltRaw(z) + lifts[0] * fade(Math.abs(z - wz)) + lifts[1] * fade(Math.abs(z + wz));
    const sillAt = (z) => {
      let y = sill(z);
      for (const az of [wz, -wz]) { const dz = z - az; if (Math.abs(dz) < rA) y = Math.max(y, cA + Math.sqrt(rA * rA - dz * dz)); }
      return Math.min(y, belt(z) - 0.075);
    };
    // (an open car, a roadster, has no glasshouse: the body runs at the waist line all along, open over the cockpit)
    const topAt = (z) => {
      if (S.open || z < r0 - 1e-6 || z > r3 + 1e-6) return belt(z);
      let t;
      if (z < r1) t = lerp(belt(r0), roof(r1), (z - r0) / (r1 - r0));
      else if (z > r2) t = lerp(roof(r2), belt(r3), (z - r2) / (r3 - r2));
      else t = roof(z);
      return Math.max(t, belt(z));
    };
    const prof = (u) => (u < 0.5 ? 1 - bulge + bulge * Math.sin((Math.max(0, u) / 0.5) * Math.PI / 2) : 1 - bulge * 0.5 * Math.pow((Math.min(1, u) - 0.5) / 0.5, 2));
    const lv = (o, yt) => (o < 0 ? yt + o : o);
    const sideLv = [];
    for (const k of ['head', 'tail', 'grille', 'intake']) if (S[k]) sideLv.push(...S[k].y);
    if (S.sideIntake) sideLv.push(...S.sideIntake.y);
    if (S.livery) sideLv.push(...S.livery.rows);
    if (S.sideStripe) sideLv.push(...S.sideStripe.y);
    if (S.cladding) sideLv.push(S.cladding);
    if (S.diffuser) sideLv.push(S.diffuser);
    const glassLv = S.glassLevels || [], topXs = S.stripes ? [S.stripes[1], S.stripes[0]] : [];

    // stations: the rounded ends sampled by angle, the middle evenly, plus every edge a colour change needs
    const zs = [], NR = 9;
    for (let i = 0; i <= NR; i++) {
      const t = (i / NR) * Math.PI / 2;
      zs.push(-hl + rcR - rcR * Math.pow(Math.sin(t), 2 / pR), hl - rcF + rcF * Math.pow(Math.sin(t), 2 / pF));
    }
    const m0 = -hl + rcR, m1 = hl - rcF, nm = Math.max(1, Math.ceil((m1 - m0) / 0.22));
    for (let i = 1; i < nm; i++) zs.push(m0 + ((m1 - m0) * i) / nm);
    zs.push(r0, r1, r2, r3, ...S.glass);
    for (const [pz, pw] of S.pillars || []) zs.push(pz - pw / 2, pz + pw / 2);
    for (const az of [wz, -wz]) for (let i = 0; i <= 12; i++) zs.push(az + rA * Math.sin((i / 12 - 0.5) * Math.PI));
    for (const z of S.doors || []) zs.push(z - 0.009, z + 0.009);
    for (const k of ['head', 'grille', 'intake']) if (S[k]) zs.push(hl - S[k].d);
    if (S.tail) zs.push(-hl + S.tail.d);
    if (S.rearWin) zs.push(-hl + S.rearWin.d);
    if (S.sign) zs.push(hl - S.sign.d);
    if (S.sideIntake) zs.push(...S.sideIntake.z);
    if (S.sideStripe) zs.push(...S.sideStripe.z);
    if (S.open) zs.push(...S.open.z);
    if (S.louvre) zs.push(...S.louvre.z);
    for (const [bz, bw] of S.roofBars || []) zs.push(bz - bw / 2, bz + bw / 2);
    for (const [a, b] of S.busDoors || []) zs.push(a, b, (a + b) / 2 - 0.02, (a + b) / 2 + 0.02);
    if (S.livery) {
      const [a, b] = S.livery.z, n = Math.max(1, Math.round((b - a) / S.livery.block));
      for (let i = 0; i <= n; i++) zs.push(a + ((b - a) * i) / n);
    }
    const Z = [...new Set(zs.filter((z) => z >= -hl - 1e-6 && z <= hl + 1e-6).map((z) => Math.round(clamp(z, -hl, hl) * 1000) / 1000))].sort((a, b) => a - b);

    function ring(z) {
      const yb = sillAt(z), yt = Math.max(belt(z), yb + 0.15), w = halfW(z), top = Math.max(topAt(z), yt), h = top - yt;
      const k = clamp(h / 0.25, 0, 1);
      const gB = Math.max(0, w - S.shoulder), gT = Math.max(0, gB - S.tumble * clamp(h / 0.45, 0, 1));
      const xs = (y) => w * prof((y - yb) / (yt - yb));
      const pts = [[0, yb, 'under'], [Math.max(0, xs(yb) - 0.06), yb, 'rocker']];
      const ys = [yb + 0.06, yt - 0.07];
      for (const o of sideLv) ys.push(clamp(lv(o, yt), yb + 0.06, yt - 0.07));
      ys.sort((a, b) => a - b);
      for (const y of ys) pts.push([xs(y), y, 'side']);
      pts.push([Math.max(gB, xs(yt) - 0.035), yt - 0.02, 'ledge']);
      const edge = Math.min(0.07, h * 0.3), yg = yt + Math.max(0, h - edge);
      pts.push([gB, yt, 'glass']);
      for (const y of glassLv) { const yy = clamp(y, yt, yg); pts.push([lerp(gB, gT, (yy - yt) / Math.max(1e-6, yg - yt)), yy, 'glass']); }
      pts.push([gT, yg, 'rail']);
      const crown = lerp(z > 0 ? S.crown[1] : S.crown[0], S.crown[2], k);
      const xe = Math.max(0, gT - 0.1 * k - gB * 0.18 * (1 - k));
      const cy = (x) => top + crown * (1 - (xe > 0 ? (x / xe) * (x / xe) : 0));
      // (the crown of the bonnet, roof and boot sampled across, so it is a smooth curve and not a ridge down the middle)
      const tx = [xe, xe * 0.75, xe * 0.5, xe * 0.25, ...topXs.map((x) => Math.min(x, xe))].sort((a, b) => b - a);
      for (const x of tx) pts.push([x, cy(x), 'roof']);
      pts.push([0, top + crown, 'end']);
      return { pts, yb, yt, top, h, w, gB, gT, crown, xe };
    }
    const sideX = (z, y) => { const r = ring(z); return r.w * prof((y - r.yb) / (r.yt - r.yb)); };
    const surfY = (z, x) => { const r = ring(z); return r.top + r.crown * (1 - (r.xe > 0 ? Math.min(1, (x / r.xe) ** 2) : 1)); };
    const zone = (z) => (z > r2 && z < r3 ? 'wind' : z > r0 && z < r1 ? 'back' : z >= r1 && z <= r2 ? 'roof' : 'hood');
    // the underside of the shell at (x, z): the roof and glass inside the glasshouse, the waist line elsewhere
    const shellY = (x, z) => {
      const r = ring(z), ax = Math.abs(x);
      if (z < r0 || z > r3 || r.h <= 0.02) return r.yt;
      const yg = r.yt + Math.max(0, r.h - Math.min(0.07, r.h * 0.3));
      if (ax <= r.xe) return r.top + r.crown * (1 - (r.xe > 0 ? (ax / r.xe) ** 2 : 0));
      if (ax <= r.gT) return yg;
      if (ax <= r.gB) return r.yt + ((yg - r.yt) * (r.gB - ax)) / Math.max(1e-3, r.gB - r.gT);
      return r.yt;
    };
    M._shape = { S, hl, hw, Z, ring, sill, belt, roof, sillAt, topAt, halfW, endZ, sideX, surfY, shellY, zone, lv, rA, cA, archTop, r0, r1, r2, r3 };
    return M._shape;
  }

  // the colour of one quad of the loft
  function bodyColour(sh, q, paint) {
    const S = sh.S, { tag, z, x, y, yt } = q, hl = sh.hl;
    const inY = (r) => y > sh.lv(r[0], yt) && y < sh.lv(r[1], yt);
    if (tag === 'under') return UNDER;
    if (tag === 'side' || tag === 'ledge' || tag === 'rocker') {
      if (tag !== 'rocker') {
        if (S.head && z > hl - S.head.d && x > S.head.x && inY(S.head.y)) return COL.head;
        if (S.tail && z < -hl + S.tail.d && x > S.tail.x && inY(S.tail.y)) {
          if (S.tail.rev && x > S.tail.rev[0] && x < S.tail.rev[1]) return COL.rev;
          return S.tail.col ? TRIM[S.tail.col] : COL.tail;
        }
        if (S.grille && z > hl - S.grille.d && x < S.grille.x && inY(S.grille.y)) return S.grille.tone === 'body' ? q.grilleBody : GLOSS;
        if (S.intake && z > hl - S.intake.d && x < S.intake.x && inY(S.intake.y)) return UNDER;
        if (S.sideIntake && z > S.sideIntake.z[0] && z < S.sideIntake.z[1] && inY(S.sideIntake.y)) return UNDER;
      }
      if (S.diffuser && z < -hl + 0.25 && y < S.diffuser) return UNDER;
      if (S.busDoors && q.side < 0) for (const [a, b] of S.busDoors) if (z > a && z < b) return Math.abs(z - (a + b) / 2) < 0.02 ? GLOSS : COL.doors;
      if (S.cladding && y < S.cladding) return CLAD;
      if (tag === 'rocker') return paint;
      if (S.livery && z > S.livery.z[0] && z < S.livery.z[1] && y > S.livery.rows[0] && y < S.livery.rows[2]) {
        const [a, b] = S.livery.z, n = Math.max(1, Math.round((b - a) / S.livery.block)), i = Math.floor(((z - a) / (b - a)) * n);
        return (i + (y > S.livery.rows[1] ? 1 : 0)) % 2 ? COL.polBlue : COL.polYellow;
      }
      for (const d of S.doors || []) if (Math.abs(z - d) < 0.009 && y > q.yb + 0.04 && y < yt - 0.03) return q.seam;
      // a stripe down the side (the 911 RS's Carrera script)
      if (S.sideStripe && z > S.sideStripe.z[0] && z < S.sideStripe.z[1] && y > S.sideStripe.y[0] && y < S.sideStripe.y[1]) return S.sideStripe.col;
      if (tag === 'ledge' && z > S.glass[0] && z < S.glass[1] && q.h > 0.08) return TRIM[S.trim || 'gloss'];
      return paint;
    }
    if (tag === 'glass') {
      if (S.sign && z > hl - S.sign.d && y > S.sign.y) return COL.busSign;
      if (S.rearWin && z < -hl + S.rearWin.d) return y > S.rearWin.y[0] && y < S.rearWin.y[1] && x > S.rearWin.x[0] && x < S.rearWin.x[1] ? CAR_GLASS : paint;
      if (z > S.glass[0] && z < S.glass[1] && q.h > 0.06) {
        for (const [pz, pw] of S.pillars || []) if (Math.abs(z - pz) < pw / 2) return TRIM[S.pillarCol || 'gloss'];
        if (S.busDoors && q.side < 0) for (const [a, b] of S.busDoors) if (z > a && z < b && Math.abs(z - (a + b) / 2) < 0.02) return GLOSS;
        return CAR_GLASS;
      }
      if (S.tail && S.tail.up && z < -hl + S.tail.d && x > S.tail.x && y < yt + S.tail.up) return COL.tail;
      return paint;
    }
    if (tag === 'rail') return q.roofTone !== null && z > sh.r1 && z < sh.r2 ? q.roofTone : paint;
    // the top: bonnet, windscreen, roof, rear window, boot (an open car has none of the glass; see its windscreen)
    const zn = S.open ? 'hood' : sh.zone(z);
    if (zn === 'wind') return CAR_GLASS;
    if (zn === 'back') return S.rearCol ? TRIM[S.rearCol] : CAR_GLASS;
    if (zn === 'roof' && q.roofTone !== null) return q.roofTone;
    if (zn === 'roof' && S.roofGlass) {
      for (const [bz, bw] of S.roofBars || []) if (Math.abs(z - bz) < bw / 2) return GLOSS;
      return CAR_GLASS;
    }
    if (S.louvre && z > S.louvre.z[0] && z < S.louvre.z[1] && x < S.louvre.x) return UNDER;
    if (S.stripes && x > S.stripes[0] && x < S.stripes[1]) return q.stripe;
    return paint;
  }
  function loftBody(M, paint, mg, gl) {
    const sh = carShape(M), Z = sh.Z, rings = Z.map(sh.ring), ns = Z.length, H = rings[0].pts.length, N = 2 * H - 2;
    const P = new Float32Array(ns * N * 3), NN = new Float32Array(ns * N * 3);
    for (let i = 0; i < ns; i++) {
      const pts = rings[i].pts;
      for (let q = 0; q < N; q++) {
        const p = q < H ? pts[q] : pts[2 * H - 2 - q], o = (i * N + q) * 3;
        P[o] = q < H ? p[0] : -p[0]; P[o + 1] = p[1]; P[o + 2] = Z[i];
      }
    }
    const vi = (i, q) => (i * N + (q % N)) * 3;
    // smooth normals: each quad's normal (cross of its diagonals, so weighted by area) goes to its four corners
    for (let i = 0; i < ns - 1; i++) for (let s = 0; s < N; s++) {
      const a0 = vi(i, s), b0 = vi(i, s + 1), b1 = vi(i + 1, s + 1), a1 = vi(i + 1, s);
      const ux = P[b1] - P[a0], uy = P[b1 + 1] - P[a0 + 1], uz = P[b1 + 2] - P[a0 + 2];
      const wx = P[a1] - P[b0], wy = P[a1 + 1] - P[b0 + 1], wz = P[a1 + 2] - P[b0 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const o of [a0, b0, b1, a1]) { NN[o] += nx; NN[o + 1] += ny; NN[o + 2] += nz; }
    }
    for (let o = 0; o < NN.length; o += 3) {
      const l = Math.hypot(NN[o], NN[o + 1], NN[o + 2]);
      if (l > 1e-9) { NN[o] /= l; NN[o + 1] /= l; NN[o + 2] /= l; } else NN[o + 1] = 1;
    }
    const tagOf = (s) => (s < H - 1 ? rings[0].pts[s][2] : rings[0].pts[2 * H - 3 - s][2]);
    const light = (paint >> 16 & 255) + (paint >> 8 & 255) + (paint & 255) > 560;
    // (a contrasting roof: white over a dark car, black over a light one, or always the colour given)
    const roofTone = M.shape.roofTone === 'contrast' ? (light ? 0x15171a : 0xf2f2ef) : M.shape.roofTone ?? null;
    // (the racing stripes: black on a light car, white on a dark one, or the colour the model gives for this paint)
    const stripe = (M.shape.stripeCol && M.shape.stripeCol[paint]) ?? (light ? 0x15171a : STRIPE);
    const q = { tag: '', z: 0, x: 0, y: 0, yt: 0, yb: 0, h: 0, side: 1, seam: shade(paint, 0.45), stripe, grilleBody: shade(paint, 0.78), roofTone };
    const open = M.shape.open, cockpit = (tag, z) => open && z > open.z[0] && z < open.z[1] && (tag === 'rail' || tag === 'roof' || tag === 'end');
    const pt = (o) => [P[o], P[o + 1], P[o + 2]], nm = (o) => [NN[o], NN[o + 1], NN[o + 2]];
    const area2 = (a, b, c) => {
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    };
    for (let i = 0; i < ns - 1; i++) {
      const A = rings[i], B = rings[i + 1];
      q.z = (Z[i] + Z[i + 1]) / 2; q.yt = (A.yt + B.yt) / 2; q.yb = (A.yb + B.yb) / 2; q.h = (A.h + B.h) / 2;
      for (let s = 0; s < N; s++) {
        const a0 = vi(i, s), b0 = vi(i, s + 1), b1 = vi(i + 1, s + 1), a1 = vi(i + 1, s);
        const mx = (P[a0] + P[b0] + P[b1] + P[a1]) / 4;
        q.tag = tagOf(s); q.side = s < H - 1 ? 1 : -1; q.x = Math.abs(mx);
        if (cockpit(q.tag, q.z)) continue;
        q.y = (P[a0 + 1] + P[b0 + 1] + P[b1 + 1] + P[a1 + 1]) / 4;
        const col = bodyColour(sh, q, paint), tgt = col === CAR_GLASS ? gl : mg, cc = col === CAR_GLASS ? 0xffffff : col;
        if (area2(a0, b0, b1) > 1e-7) tgt.triN(pt(a0), pt(b0), pt(b1), nm(a0), nm(b0), nm(b1), cc);
        if (area2(a0, b1, a1) > 1e-7) tgt.triN(pt(a0), pt(b1), pt(a1), nm(a0), nm(b1), nm(a1), cc);
      }
    }
    return sh;
  }

  const wheelX = (M) => (M.moped ? 0 : M.W / 2 - (M.mil === 'tank' ? 0.33 : M.mil ? 0.3 : M.bus ? 0.24 : 0.17));
  // a chain of tubes through the points
  const tubePath = (m, pts, r, col, r2 = r) => { for (let i = 0; i < pts.length - 1; i++) tubeTo(m, pts[i], pts[i + 1], lerp(r, r2, i / (pts.length - 1)), col, lerp(r, r2, (i + 1) / (pts.length - 1))); };
  // a body loft through cross-sections [z, half width, bottom, top], each pair of sections a closed block
  function sectionLoft(m, secs, col) {
    for (let i = 0; i < secs.length - 1; i++) {
      const [z0, w0, b0, t0] = secs[i], [z1, w1, b1, t1] = secs[i + 1];
      m.hexa([[-w1, b1, z1], [w1, b1, z1], [w0, b0, z0], [-w0, b0, z0], [-w1, t1, z1], [w1, t1, z1], [w0, t0, z0], [-w0, t0, z0]], col);
    }
  }
  // The Gilera Stalker, modelled in parts: what stands still (frame, body, seat, engine, exhaust) and what turns with the
  // handlebars (fork, front mudguard, bars, mirrors, the lamp mask with its screen). The steering axis leans back 26°.
  // Its own frame: z forwards, +x the rider's left, y up; the front assembly is returned in the frame of the steering
  // head, y along the steering axis.
  function mopedGeometry(M, paint) {
    const mg = new Merger(carSurf(paint)), front = new Merger(carSurf(paint)), gl = new Merger(), plateB = new Builder();
    const R = M.R, az = M.wb / 2, rake = 26 * Math.PI / 180, ca = Math.cos(rake), sa = Math.sin(rake);
    const BLACK = 0x1c1d20, FRAME = 0xaeb3b8, ALU = 0x8a8f94, SEAT = 0x16171a;
    // the steering head sits where a 0.7 m fork with 3 cm of offset puts the front axle
    const off = 0.03, Lf = (0.86 - R + off * sa) / ca, head = [0, 0.86, az - Lf * sa - off * ca], up = [0, ca, -sa];
    const along = (t) => [head[0], head[1] + up[1] * t, head[2] + up[2] * t];
    // frame: the big tube down from the head to the floor, out in the open, and the rails under the floor and the seat
    tubePath(mg, [along(-0.06), [0, 0.62, head[2] - 0.05], [0, 0.45, head[2] - 0.11], [0, 0.34, head[2] - 0.2], [0, 0.3, 0.0]], 0.028, FRAME);
    for (const s of [1, -1]) tubePath(mg, [[s * 0.1, 0.29, 0.06], [s * 0.1, 0.29, -0.2], [s * 0.1, 0.5, -0.38], [s * 0.09, 0.66, -0.72]], 0.014, FRAME);
    // a cover round the steering head, the floor with its black mat, and the belly pan under it
    mg.hexa([[-0.075, 0.66, head[2] - 0.06], [0.075, 0.66, head[2] - 0.06], [0.075, 0.66, head[2] + 0.08], [-0.075, 0.66, head[2] + 0.08], [-0.065, 0.84, head[2] - 0.02], [0.065, 0.84, head[2] - 0.02], [0.065, 0.84, head[2] + 0.08], [-0.065, 0.84, head[2] + 0.08]], paint);
    mg.box(0.32, 0.04, 0.32, BLACK, 0, 0.32, -0.05);
    for (let z = -0.18; z < 0.1; z += 0.05) mg.box(0.28, 0.006, 0.012, 0x2a2c30, 0, 0.343, z);
    mg.box(0.26, 0.09, 0.36, BLACK, 0, 0.255, -0.04);
    // the body under the seat, narrowing and rising to a sharp tail
    sectionLoft(mg, [[0.05, 0.11, 0.34, 0.6], [-0.15, 0.16, 0.36, 0.71], [-0.42, 0.165, 0.42, 0.75], [-0.68, 0.12, 0.52, 0.79], [-0.88, 0.05, 0.66, 0.82]], paint);
    for (const s of [1, -1]) {
      // vents along the sides and a black stripe low down
      for (let i = 0; i < 3; i++) mg.box(0.006, 0.025, 0.16, 0x2a2c30, s * 0.166, 0.6 - i * 0.045, -0.36);
      mg.box(0.006, 0.05, 0.28, BLACK, s * 0.164, 0.43, -0.28);
    }
    // the seat: the rider's part, then a step up for the passenger
    sectionLoft(mg, [[0.06, 0.09, 0.6, 0.66], [-0.05, 0.14, 0.68, 0.79], [-0.36, 0.15, 0.72, 0.81], [-0.46, 0.14, 0.74, 0.86], [-0.74, 0.1, 0.77, 0.87]], SEAT);
    for (const s of [1, -1]) mg.box(0.004, 0.01, 0.42, 0x5a5d61, s * 0.148, 0.79, -0.2);
    // the grab rail round the back of the seat, the tail lamp and indicators, the plate on its black flap
    for (const s of [1, -1]) tubePath(mg, [[s * 0.15, 0.8, -0.44], [s * 0.13, 0.84, -0.66], [s * 0.08, 0.85, -0.84]], 0.012, ALU);
    tubeTo(mg, [0.08, 0.85, -0.84], [-0.08, 0.85, -0.84], 0.012, ALU);
    mg.box(0.11, 0.045, 0.04, COL.tail, 0, 0.78, -0.885);
    for (const s of [1, -1]) mg.box(0.05, 0.035, 0.05, IND(s), s * 0.1, 0.74, -0.85);
    mg.hexa([[-0.1, 0.46, -0.93], [0.1, 0.46, -0.93], [0.1, 0.46, -0.9], [-0.1, 0.46, -0.9], [-0.06, 0.68, -0.86], [0.06, 0.68, -0.86], [0.06, 0.68, -0.83], [-0.06, 0.68, -0.83]], BLACK);
    mg.box(0.21, 0.11, 0.012, GLOSS, 0, 0.53, -0.928);
    plateB.quad([0.095, 0.48, -0.936], [-0.095, 0.48, -0.936], [-0.095, 0.58, -0.936], [0.095, 0.58, -0.936], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    // the engine: an air-cooled cylinder lying forwards with its fins, the fan cowl on the right, the long belt case of
    // the variator down the left to the rear axle, the air box on top of it
    mg.add(new THREE.CylinderGeometry(0.062, 0.062, 0.2, 14), ALU, 0, 0.22, 0.06, Math.PI / 2, 0, 0);
    for (let z = -0.02; z < 0.15; z += 0.024) mg.add(new THREE.CylinderGeometry(0.088, 0.088, 0.008, 14), 0x6a6f75, 0, 0.22, z, Math.PI / 2, 0, 0);
    mg.add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), 0x2a2c30, 0, 0.3, 0.12);
    mg.box(0.09, 0.2, 0.2, BLACK, -0.115, 0.26, -0.02);
    mg.hexa([[0.07, 0.14, 0.02], [0.165, 0.14, 0.02], [0.165, 0.12, -0.66], [0.07, 0.12, -0.66], [0.07, 0.4, 0.02], [0.165, 0.4, 0.02], [0.165, 0.35, -0.66], [0.07, 0.35, -0.66]], ALU);
    mg.add(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 18), 0x6a6f75, 0.168, 0.25, -0.5, 0, 0, Math.PI / 2);
    mg.box(0.1, 0.08, 0.26, BLACK, 0.09, 0.4, -0.47);
    // the exhaust on the right: down under the engine, out through the fat belly of the expansion chamber and up to the
    // silencer alongside the back wheel
    tubePath(mg, [[-0.02, 0.18, 0.13], [-0.03, 0.1, 0.06], [-0.06, 0.1, -0.06]], 0.025, 0x3a3d41);
    tubePath(mg, [[-0.06, 0.1, -0.06], [-0.11, 0.12, -0.2], [-0.15, 0.18, -0.34], [-0.17, 0.26, -0.44]], 0.04, 0x3a3d41, 0.065);
    tubePath(mg, [[-0.17, 0.26, -0.44], [-0.18, 0.3, -0.5]], 0.065, 0x3a3d41, 0.03);
    tubeTo(mg, [-0.18, 0.3, -0.5], [-0.2, 0.44, -0.84], 0.055, 0x2a2c30);
    tubeTo(mg, [-0.199, 0.43, -0.82], [-0.2, 0.445, -0.86], 0.058, CHROME);
    mg.add(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), UNDER, -0.2, 0.445, -0.875, Math.PI / 2 - 0.4, 0, 0);
    // the rear shock on the right, a red spring round it
    tubeTo(mg, [-0.12, 0.3, -0.62], [-0.12, 0.58, -0.5], 0.016, BLACK);
    tubeTo(mg, [-0.12, 0.36, -0.6], [-0.12, 0.54, -0.52], 0.032, 0xb3131c);
    // what turns with the bars, built where it stands and then moved into the frame of the steering head
    const crown = along(-0.05), axle = [0, R, az];
    for (const s of [1, -1]) {
      const top = [s * 0.1, crown[1], crown[2]], bot = [s * 0.1, axle[1], axle[2]], mid = [s * 0.1, lerp(top[1], bot[1], 0.55), lerp(top[2], bot[2], 0.55)];
      tubeTo(front, top, mid, 0.019, 0xc6cbd1);
      tubeTo(front, mid, bot, 0.028, BLACK);
    }
    front.box(0.26, 0.05, 0.08, BLACK, 0, crown[1], crown[2]);
    tubeTo(front, crown, along(0.17), 0.02, BLACK);
    // the brake calliper on the left leg, the front mudguard over the wheel
    front.box(0.03, 0.08, 0.06, 0x2a2c30, 0.085, R + 0.08, az - 0.06);
    for (let i = 0; i < 12; i++) {
      const p = (-60 + i * 10) * Math.PI / 180, q = p + 10 * Math.PI / 180, rr0 = R + 0.045, pm = (p + q) / 2;
      front.add(new THREE.BoxGeometry(0.15, 0.012, rr0 * 0.18), paint, 0, axle[1] + Math.cos(pm) * rr0, axle[2] + Math.sin(pm) * rr0, pm, 0, 0);
    }
    // the handlebars, bare: grips, levers, mirrors on stalks
    const bar = along(0.17), bars = [[0.37, bar[1] + 0.02, bar[2] - 0.1], [0.2, bar[1] + 0.01, bar[2] - 0.03], [0, bar[1], bar[2]], [-0.2, bar[1] + 0.01, bar[2] - 0.03], [-0.37, bar[1] + 0.02, bar[2] - 0.1]];
    tubePath(front, bars, 0.011, 0x2a2c30);
    for (const s of [1, -1]) {
      tubeTo(front, [s * 0.25, bar[1] + 0.015, bar[2] - 0.06], [s * 0.37, bar[1] + 0.02, bar[2] - 0.1], 0.018, BLACK);
      tubeTo(front, [s * 0.18, bar[1] + 0.02, bar[2] - 0.0], [s * 0.33, bar[1] + 0.0, bar[2] + 0.02], 0.006, ALU);
      front.box(0.05, 0.03, 0.04, BLACK, s * 0.17, bar[1] + 0.035, bar[2] - 0.03);
      tubeTo(front, [s * 0.23, bar[1] + 0.03, bar[2] - 0.04], [s * 0.3, bar[1] + 0.28, bar[2] - 0.09], 0.006, BLACK);
      front.box(0.12, 0.07, 0.025, BLACK, s * 0.31, bar[1] + 0.3, bar[2] - 0.09);
      front.box(0.105, 0.055, 0.004, 0xb9c6cd, s * 0.31, bar[1] + 0.3, bar[2] - 0.103);
    }
    // the mask in front of the bars: two round lamps side by side, indicators at its corners, a little tinted screen
    const mk = [0, bar[1] - 0.1, bar[2] + 0.17];
    front.hexa([[-0.16, mk[1] - 0.08, mk[2] - 0.12], [0.16, mk[1] - 0.08, mk[2] - 0.12], [0.13, mk[1] - 0.07, mk[2] + 0.05], [-0.13, mk[1] - 0.07, mk[2] + 0.05], [-0.16, mk[1] + 0.07, mk[2] - 0.14], [0.16, mk[1] + 0.07, mk[2] - 0.14], [0.13, mk[1] + 0.06, mk[2] + 0.02], [-0.13, mk[1] + 0.06, mk[2] + 0.02]], paint);
    for (const s of [1, -1]) {
      front.add(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 18), GLOSS, s * 0.068, mk[1], mk[2] + 0.04, Math.PI / 2 - 0.12, 0, 0);
      front.add(new THREE.CylinderGeometry(0.048, 0.044, 0.045, 18), COL.head, s * 0.068, mk[1], mk[2] + 0.05, Math.PI / 2 - 0.12, 0, 0);
      front.box(0.04, 0.03, 0.05, IND(s), s * 0.16, mk[1] - 0.02, mk[2] - 0.04);
    }
    front.box(0.16, 0.06, 0.05, BLACK, 0, mk[1] + 0.09, mk[2] - 0.1);
    gl.hexa([[-0.13, mk[1] + 0.06, mk[2] - 0.12], [0.13, mk[1] + 0.06, mk[2] - 0.12], [0.13, mk[1] + 0.065, mk[2] - 0.1], [-0.13, mk[1] + 0.065, mk[2] - 0.1], [-0.1, mk[1] + 0.2, mk[2] - 0.2], [0.1, mk[1] + 0.2, mk[2] - 0.2], [0.1, mk[1] + 0.205, mk[2] - 0.18], [-0.1, mk[1] + 0.205, mk[2] - 0.18]], 0xffffff);
    // into the frame of the steering head
    const toHead = new THREE.Matrix4().makeRotationX(rake).multiply(new THREE.Matrix4().makeTranslation(-head[0], -head[1], -head[2]));
    const frontGeo = front.build(), glassGeo = gl.build();
    frontGeo.applyMatrix4(toHead); glassGeo.applyMatrix4(toHead);
    frontGeo.computeBoundingSphere(); glassGeo.computeBoundingSphere();
    const frontAxle = new THREE.Vector3(...axle).applyMatrix4(toHead);
    return {
      body: mg.build(), glass: glassGeo, front: frontGeo, decal: null, plates: plateB.build(), flashers: null, head, rake, frontAxle,
      driver: { x: 0, y: 0.8, z: -0.16 }, rear: null, parts: [{ cz: -0.05, hw: 0.26, hl: 0.86, top: 0.86 }]
    };
  }
  // A hull lofted through stations [z, half beam, keel y, gunwale y] (y = 0 is the waterline): a vee from the keel out to
  // the chine, the topsides up to the gunwale, a rail capping it, then either a closed deck with some camber or an open
  // cockpit with a floor at floorY. cols: { bottom (the vee and the chine), side (the topsides), rail, deck, inner (the
  // cockpit's walls), floor }
  function hullLoft(m, st, cols, floorY) {
    const ring = ([z, w, k, t]) => {
      const pts = [[0, k, 'bottom'], [w * 0.9, lerp(k, t, 0.3), 'bottom'], [w, lerp(k, t, 0.42), 'bottom'], [w, t, 'side']];
      if (floorY !== undefined && w > 0.25) pts.push([w - 0.07, t + 0.02, 'rail'], [w - 0.1, floorY, 'inner'], [0, floorY, 'floor']);
      else pts.push([w - Math.min(0.05, w * 0.2), t + 0.012, 'rail'], [w * 0.55, t + 0.025, 'deck'], [0, t + 0.035, 'deck']);
      return pts.map(([x, y, tag]) => [x, y, z, tag]);
    };
    // each strip has the colour and faces the way of the point it ends at: the vee and the chine down, the topsides out,
    // the rail, the floor and the deck up, the cockpit's walls in
    const hint = { bottom: [0, -1, 0], side: [1, 0, 0], rail: [0, 1, 0], inner: [-1, 0, 0], floor: [0, 1, 0], deck: [0, 1, 0] };
    // (each of its two triangles is wound to face along the strip's normal, also where the strip is twisted)
    const quad = (a, b, c, d, col, h) => {
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-9) return;
      n = n.map((v) => v / l);
      if (n[0] * h[0] + n[1] * h[1] + n[2] * h[2] < 0) n = n.map((v) => -v);
      const tri = (p, q, r) => {
        const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2], fx = r[0] - p[0], fy = r[1] - p[1], fz = r[2] - p[2];
        if ((ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2] < 0) m.triN(p, r, q, n, n, n, col);
        else m.triN(p, q, r, n, n, n, col);
      };
      tri(a, b, c); tri(a, c, d);
    };
    const rings = st.map(ring);
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], n = Math.min(A.length, B.length);
      for (let j = 0; j < n - 1; j++) {
        const tag = A[j + 1][3], col = cols[tag] ?? cols.side;
        for (const s of [1, -1]) {
          const P = (p) => [p[0] * s, p[1], p[2]], h = hint[tag].slice();
          h[0] *= s;
          quad(P(A[j]), P(A[j + 1]), P(B[j + 1]), P(B[j]), col, h);
        }
      }
    }
    // the ends, so that neither can be seen through: the transom across the stern (on an open boat also its inside,
    // facing into the cockpit) and the stem across the bow, each fans of triangles at z from a point on the middle line
    // to the outline pts, facing aft (dir -1) or forwards (dir 1)
    const fan = (z, pts, apexY, dir, col) => {
      const c = [0, apexY, z], n = [0, 0, dir];
      for (let j = 0; j < pts.length - 1; j++) for (const s of [1, -1]) {
        const a = [pts[j][0] * s, pts[j][1], z], b = [pts[j + 1][0] * s, pts[j + 1][1], z];
        const cr = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * dir;
        if (Math.abs(cr) < 1e-9) continue;
        if (cr > 0) m.triN(a, b, c, n, n, n, col); else m.triN(a, c, b, n, n, n, col);
      }
    };
    // (in the bottom's colour up to the chine and the topsides' above it, up to the deck or on an open boat the rail)
    const end = (R, top, dir) => {
      const z = R[0][2], chine = R[2][1];
      fan(z, R.slice(0, 3), chine, dir, cols.bottom);
      fan(z, [[0, chine], ...R.slice(2, top + 1)], R[top][1], dir, cols.side);
    };
    const T = rings[0], S = rings[rings.length - 1], open = T[5][3] === 'inner';
    end(T, open ? 4 : T.length - 1, -1);
    if (open) fan(T[0][2], T.slice(4), T[4][1], 1, cols.inner);
    end(S, S.length - 1, 1);
  }
  // The boats, in their own frame: z forwards, +x the driver's left, y = 0 at the waterline. The jet ski's handlebars turn
  // with the steering like the moped's (front, about head).
  function boatGeometry(M, paint) {
    const mg = new Merger(carSurf(paint)), gl = new Merger(), front = new Merger(carSurf(paint));
    const BLACK = 0x1c1d20, GREY = 0x3a3d41, WHITE = 0xeeeeea, SEAT = 0x16171a;
    let driver, head = null, rake = 0, frontGeo = null, parts, flashers = null, decal = null;
    // the hull's half width and rail height at z, between its stations
    const hullAt = (z) => {
      const st = M.hull;
      let i = 0;
      while (i < st.length - 2 && z > st[i + 1][0]) i++;
      const t = clamp((z - st[i][0]) / (st[i + 1][0] - st[i][0]), 0, 1);
      return { w: lerp(st[i][1], st[i + 1][1], t), top: lerp(st[i][3], st[i + 1][3], t) };
    };
    // a strip w x h on side s of the hull from za to zb, out from the topsides and down from the rail, turned to follow
    // them as they narrow and rise (in pieces between the hull's stations, where they bend)
    const onHull = (w, h, za, zb, s, out, down, col) => {
      const cut = M.hull.find((st) => st[0] > za + 0.01 && st[0] < zb - 0.01);
      if (cut) { onHull(w, h, za, cut[0], s, out, down, col); onHull(w, h, cut[0], zb, s, out, down, col); return; }
      const a = hullAt(za), b = hullAt(zb), dx = s * (b.w - a.w), dy = b.top - a.top, dz = zb - za, l = Math.hypot(dx, dy, dz);
      mg.add(new THREE.BoxGeometry(w, h, l), col, s * ((a.w + b.w) / 2 + out), (a.top + b.top) / 2 - down, (za + zb) / 2, Math.atan2(-dy, dz), Math.asin(dx / l), 0);
    };
    // the police's blue and yellow checks, a row of them down each side just under the rail
    const checks = (z0, z1, n, h, below) => {
      for (let i = 0; i < n; i++) {
        const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
        for (const s of [1, -1]) onHull(0.02, h, za, zb, s, 0.012, below + h / 2, i % 2 ? COL.polYellow : COL.polBlue);
      }
    };
    if (M.boat === 'jetski') {
      // Sea-Doo RXP-X: a deep-vee hull in white, the deck and hood in the colour, a black saddle for one, the handlebars
      // on a column in front of it, the jet nozzle under the stern, footwells either side
      const hull = paint === WHITE ? 0xd9dcdf : WHITE;
      hullLoft(mg, M.hull, { bottom: hull, side: hull, rail: BLACK, deck: GREY });
      // the hood over the bow and the console up to the handlebars, a tinted screen on it
      sectionLoft(mg, [[0.05, 0.36, 0.45, 0.72], [0.45, 0.44, 0.47, 0.8], [0.95, 0.38, 0.49, 0.74], [1.35, 0.2, 0.47, 0.6]], paint);
      gl.hexa([[-0.2, 0.8, 0.42], [0.2, 0.8, 0.42], [0.18, 0.76, 0.6], [-0.18, 0.76, 0.6], [-0.18, 0.96, 0.3], [0.18, 0.96, 0.3], [0.16, 0.92, 0.36], [-0.16, 0.92, 0.36]], 0xffffff);
      // the saddle, the grab strap and the stern with its reboarding step
      sectionLoft(mg, [[0.05, 0.16, 0.5, 0.78], [-0.3, 0.21, 0.5, 0.86], [-0.9, 0.22, 0.5, 0.86], [-1.3, 0.2, 0.48, 0.8]], SEAT);
      sectionLoft(mg, [[-0.6, 0.3, 0.44, 0.58], [-1.45, 0.32, 0.42, 0.56], [-1.6, 0.3, 0.4, 0.5]], paint);
      mg.box(0.5, 0.05, 0.24, BLACK, 0, 0.37, -1.66);
      for (const s of [1, -1]) mg.box(0.03, 0.03, 0.9, 0xd8203a, s * 0.62, 0.38, -0.2);
      mg.add(new THREE.CylinderGeometry(0.11, 0.13, 0.36, 12), BLACK, 0, -0.02, -1.62, Math.PI / 2, 0, 0);
      // the handlebars, turning about the column
      head = [0, 0.8, 0.2]; rake = 0.45;
      tubeTo(front, [0, -0.05, 0], [0, 0.22, 0], 0.03, BLACK);
      tubePath(front, [[0.34, 0.24, -0.06], [0.16, 0.24, 0], [-0.16, 0.24, 0], [-0.34, 0.24, -0.06]], 0.016, GREY);
      for (const s of [1, -1]) tubeTo(front, [s * 0.24, 0.24, -0.04], [s * 0.36, 0.24, -0.07], 0.024, BLACK);
      front.box(0.14, 0.06, 0.1, BLACK, 0, 0.25, 0.02);
      const toHead = new THREE.Matrix4().makeRotationX(rake).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
      frontGeo = front.build(); frontGeo.applyMatrix4(toHead); frontGeo.computeBoundingSphere();
      driver = { x: 0, y: 0.86, z: -0.48, rider: true };
      parts = [{ cz: 0, hw: M.W / 2, hl: M.L / 2, top: 0.9 }];
      if (M.police) {
        // the police's: the checks down the sides, and blue lights on a short mast behind the saddle
        checks(-1.15, 0.55, 6, 0.1, 0.02);
        tubeTo(mg, [0, 0.42, -1.42], [0, 1.12, -1.5], 0.022, BLACK);
        mg.box(0.44, 0.06, 0.1, BLACK, 0, 1.14, -1.5);
        mg.box(0.18, 0.07, 0.09, COL.blueL, -0.11, 1.2, -1.5);
        mg.box(0.18, 0.07, 0.09, COL.blueR, 0.11, 1.2, -1.5);
        flashers = [[-0.11, 1.25, -1.5], [0.11, 1.25, -1.5]];
      }
    } else if (M.boat === 'console') {
      // Anytec 622 SPD: a grey aluminium deep vee with a black rail, open from bow to stern round a centre console with a
      // screen and a wheel, a leaning post behind it, cushions in the bow, the big black outboard on the transom
      hullLoft(mg, M.hull, { bottom: 0x5d6266, side: paint, rail: BLACK, inner: 0xb9bdc2, floor: 0x2d3034, deck: 0x2d3034 }, 0.22);
      mg.box(0.66, 0.84, 0.7, WHITE, 0, 0.64, 0.45);
      mg.box(0.62, 0.06, 0.5, BLACK, 0, 1.08, 0.4);
      gl.hexa([[-0.36, 1.06, 0.68], [0.36, 1.06, 0.68], [0.36, 1.06, 0.74], [-0.36, 1.06, 0.74], [-0.33, 1.42, 0.52], [0.33, 1.42, 0.52], [0.33, 1.42, 0.58], [-0.33, 1.42, 0.58]], 0xffffff);
      mg.add(new THREE.TorusGeometry(0.16, 0.02, 6, 18), BLACK, 0, 1.12, 0.08, -0.9, 0, 0);
      mg.box(0.9, 0.5, 0.45, SEAT, 0, 0.47, -0.45);
      mg.box(0.9, 0.5, 0.12, SEAT, 0, 0.95, -0.66);
      mg.box(1.2, 0.3, 0.9, 0xd9d4c6, 0, 0.37, 1.8);
      mg.box(1.9, 0.32, 0.5, 0xd9d4c6, 0, 0.38, -2.7);
      // the outboard: the cowl high on the transom, the leg down into the water
      mg.box(0.62, 0.78, 0.7, BLACK, 0, 1.05, -3.42);
      mg.box(0.66, 0.08, 0.74, 0xc8102e, 0, 0.95, -3.42);
      mg.box(0.2, 0.9, 0.32, BLACK, 0, 0.25, -3.45);
      mg.box(0.5, 0.06, 0.3, BLACK, 0, -0.18, -3.45);
      driver = { x: 0, y: 0.6, z: -0.35 };
      parts = [{ cz: 0, hw: M.W / 2, hl: M.L / 2, top: 1.0 }];
    } else if (M.boat === 'patrol') {
      // Polisen's patrol boat: a white deep vee with a dark bottom, the blue and yellow checks down its sides, a wheelhouse
      // with windows all round and POLIS on its sides, the blue light bar, a radar dome and a searchlight on its roof
      hullLoft(mg, M.hull, { bottom: 0x2e3338, side: paint, rail: paint, inner: 0xdadde0, floor: 0x3a3f44, deck: 0x3a3f44 }, 0.3);
      checks(-4.2, 3.6, 18, 0.2, 0.08);
      const z0 = -0.95, z1 = 1.5, zt = 1.12, w = 1.05, top = 2.25;
      mg.box(2 * w, 0.92, z1 - z0, paint, 0, 0.76, (z0 + z1) / 2);
      // the frame round the windows: corner posts, the slanted front ones, and the roof
      for (const sx of [1, -1]) {
        mg.box(0.08, top - 1.22, 0.08, paint, sx * (w - 0.04), (top + 1.22) / 2, z0 + 0.04);
        tubeTo(mg, [sx * (w - 0.05), 1.22, z1 - 0.05], [sx * (w - 0.08), top, zt], 0.045, paint);
        mg.box(0.06, top - 1.22, 0.06, paint, sx * (w - 0.04), (top + 1.22) / 2, (z0 + zt) / 2);
      }
      mg.box(2 * w + 0.1, 0.1, zt - z0 + 0.25, paint, 0, top + 0.05, (z0 + zt) / 2 + 0.05);
      // the windows: down both sides, at the back, and the screen leaning back at the front
      for (const sx of [1, -1]) gl.box(0.02, top - 1.25, zt - z0 - 0.1, 0xffffff, sx * (w - 0.02), (top + 1.25) / 2, (z0 + zt) / 2);
      gl.box(2 * w - 0.12, top - 1.3, 0.02, 0xffffff, 0, (top + 1.3) / 2, z0 + 0.02);
      gl.hexa([[-w + 0.08, 1.22, z1 - 0.06], [w - 0.08, 1.22, z1 - 0.06], [w - 0.08, 1.22, z1 - 0.03], [-w + 0.08, 1.22, z1 - 0.03], [-w + 0.1, top - 0.02, zt - 0.02], [w - 0.1, top - 0.02, zt - 0.02], [w - 0.1, top - 0.02, zt + 0.01], [-w + 0.1, top - 0.02, zt + 0.01]], 0xffffff);
      // inside: the helm on the right, a seat behind it, a bench for the other constable
      mg.box(0.7, 0.55, 0.3, GREY, 0.45, 0.85, z1 - 0.35);
      mg.add(new THREE.TorusGeometry(0.17, 0.022, 6, 18), BLACK, 0.45, 1.25, z1 - 0.52, -0.9, 0, 0);
      mg.box(0.5, 0.45, 0.5, SEAT, 0.45, 0.52, 0.3);
      mg.box(0.5, 0.45, 0.5, SEAT, -0.45, 0.52, 0.3);
      // on the roof: the light bar, the radar dome, the searchlight and the aerials
      mg.box(1.1, 0.07, 0.3, BLACK, 0, top + 0.13, 0.6);
      mg.box(0.48, 0.1, 0.26, COL.blueL, -0.3, top + 0.21, 0.6);
      mg.box(0.48, 0.1, 0.26, COL.blueR, 0.3, top + 0.21, 0.6);
      flashers = [[-0.3, top + 0.28, 0.6], [0.3, top + 0.28, 0.6]];
      mg.add(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 18), WHITE, 0, top + 0.2, -0.4);
      mg.add(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 14), CHROME, 0.75, top + 0.16, 0.9, Math.PI / 2, 0, 0);
      for (const sx of [0.85, -0.85]) tubeTo(mg, [sx, top + 0.1, -0.7], [sx * 1.05, top + 1.4, -0.85], 0.012, BLACK);
      // the swim platform across the transom, and the rubbing strake round the hull
      mg.box(2.6, 0.08, 0.6, 0x3a3f44, 0, 0.32, -M.L / 2 - 0.25);
      for (const sx of [1, -1]) for (let z = -4.3; z < 3.9; z += 0.6) onHull(0.06, 0.06, z - 0.01, z + 0.61, sx, 0.03, 0.02, BLACK);
      // POLIS on both sides of the wheelhouse
      const db = new Builder(), POL = [[0, 0.5], [1, 0.5], [1, 1], [0, 1]], zf = 1.25, zr = -0.55, y0 = 0.58, y1 = 1.02, X = w + 0.006;
      db.quad([X, y0, zf], [X, y0, zr], [X, y1, zr], [X, y1, zf], 0xffffff, POL, [1, 0, 0]);
      db.quad([-X, y0, zr], [-X, y0, zf], [-X, y1, zf], [-X, y1, zr], 0xffffff, POL, [-1, 0, 0]);
      decal = db.build();
      driver = { x: 0.45, y: 0.72, z: 0.3 };
      parts = [{ cz: 0, hw: M.W / 2, hl: M.L / 2, top: top + 0.1 }];
    } else if (M.boat === 'cb90') {
      // Stridsbåt 90 H: 16 metres of aluminium on two water jets, a low troop deck forward that ends in the bow ramp, the
      // angular wheelhouse with its band of windows, the radar mast, and the heavy machine gun on a ring on the roof,
      // which turns on its own (front, about head). All in the navy's camouflage
      const DARK = 0x2a2c2e, DECK = 0x4a5240;
      hullLoft(mg, M.hull, { bottom: 0x2f3330, side: paint, rail: DARK, deck: DECK });
      const hx = (y, x0, x1, y0, y1) => lerp(x0, x1, (y - y0) / (y1 - y0));
      // the troop deck's roof, sloping down to the bow ramp
      mg.hexa([[-1.55, 1.36, 1.5], [1.55, 1.36, 1.5], [1.4, 1.42, 6.4], [-1.4, 1.42, 6.4], [-1.38, 1.98, 1.65], [1.38, 1.98, 1.65], [1.15, 1.72, 6.1], [-1.15, 1.72, 6.1]], paint);
      mg.hexa([[-0.95, 1.5, 6.4], [0.95, 1.5, 6.4], [0.62, 1.56, 7.85], [-0.62, 1.56, 7.85], [-0.92, 1.62, 6.4], [0.92, 1.62, 6.4], [0.6, 1.62, 7.85], [-0.6, 1.62, 7.85]], DECK);
      // the wheelhouse: slanted all round
      const yb = 1.36, yt = 3.0;
      mg.hexa([[-1.62, yb, -1.7], [1.62, yb, -1.7], [1.62, yb, 1.6], [-1.62, yb, 1.6], [-1.25, yt, -1.45], [1.25, yt, -1.45], [1.25, yt, 0.92], [-1.25, yt, 0.92]], paint);
      // its windows: a band across the front and down the sides, leaning in with the walls
      const fz = (y) => hx(y, 1.6, 0.92, yb, yt) + 0.02, sxw = (y) => hx(y, 1.62, 1.25, yb, yt) + 0.02;
      const ya = 2.3, yc = 2.78;
      gl.hexa([[-sxw(ya) + 0.12, ya, fz(ya) - 0.02], [sxw(ya) - 0.12, ya, fz(ya) - 0.02], [sxw(ya) - 0.12, ya, fz(ya) + 0.01], [-sxw(ya) + 0.12, ya, fz(ya) + 0.01], [-sxw(yc) + 0.12, yc, fz(yc) - 0.02], [sxw(yc) - 0.12, yc, fz(yc) - 0.02], [sxw(yc) - 0.12, yc, fz(yc) + 0.01], [-sxw(yc) + 0.12, yc, fz(yc) + 0.01]], 0xffffff);
      for (const s of [1, -1]) gl.hexa([[s * sxw(ya), ya, -1.2], [s * (sxw(ya) + 0.02), ya, -1.2], [s * (sxw(ya) + 0.02), ya, 1.0], [s * sxw(ya), ya, 1.0], [s * sxw(yc), yc, -1.05], [s * (sxw(yc) + 0.02), yc, -1.05], [s * (sxw(yc) + 0.02), yc, 0.75], [s * sxw(yc), yc, 0.75]], 0xffffff);
      // the radar mast and its aerials, the engine deck aft with its grilles, the two jets in the transom
      tubeTo(mg, [0, yt, -0.8], [0, yt + 1.5, -0.95], 0.06, DARK);
      mg.box(1.3, 0.09, 0.22, DARK, 0, yt + 1.45, -0.95);
      for (const sx of [0.9, -0.9]) tubeTo(mg, [sx, yt, -1.2], [sx * 1.1, yt + 2.0, -1.35], 0.015, DARK);
      for (let i = 0; i < 4; i++) mg.box(2.2, 0.04, 0.5, DARK, 0, 1.37, -3.0 - i * 0.9);
      for (const sx of [0.8, -0.8]) mg.add(new THREE.CylinderGeometry(0.3, 0.34, 0.5, 14), DARK, sx, 0.1, -M.L / 2 - 0.1, Math.PI / 2, 0, 0);
      // the navy's red and green sidelights on the wheelhouse
      mg.box(0.05, 0.1, 0.18, 0xb3121b, 1.5, 1.9, 1.2); mg.box(0.05, 0.1, 0.18, 0x1f8a3a, -1.5, 1.9, 1.2);
      // the gun: a ring on the roof, a shield and the 12.7 mm barrel
      head = [0, yt, 0.25];
      front.add(new THREE.CylinderGeometry(0.42, 0.45, 0.14, 16), paint, 0, 0.07, 0);
      front.box(0.75, 0.42, 0.06, paint, 0, 0.4, 0.32);
      front.box(0.2, 0.2, 0.5, DARK, 0.06, 0.38, 0.1);
      front.add(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 8), DARK, 0.06, 0.4, 0.85, Math.PI / 2, 0, 0);
      camouflage(front, paint);
      frontGeo = front.build(); frontGeo.computeBoundingSphere();
      camouflage(mg, paint);
      driver = { x: 0.6, y: 1.75, z: 0.75 };
      parts = [{ cz: 0, hw: M.W / 2, hl: M.L / 2, top: yt + 0.1 }];
    } else {
      // Riva Aquarama: the varnished mahogany hull and deck with pale seams between the planks, a white bottom, the
      // chrome-framed screen, two rows of aquamarine leather seats and the sun pad over the engines
      const wood = paint, seam = 0xe9dfc6, leather = 0x7fb8b0;
      hullLoft(mg, M.hull, { bottom: 0xf0f0ec, side: wood, rail: CHROME, deck: wood });
      // the seams lie on the deck (as hullLoft cambers it), from the sun pad to the bow, round the cockpit and inside the rail
      const deckY = (x, z) => {
        const H = hullAt(z), a = H.w * 0.55, r = H.w - Math.min(0.05, H.w * 0.2);
        return x < a ? lerp(H.top + 0.035, H.top + 0.025, x / a) : lerp(H.top + 0.025, H.top + 0.012, (x - a) / (r - a));
      };
      // (in pieces, cut also at the hull's stations where the deck bends, so that no piece sinks into it)
      const cuts = M.hull.map((st) => st[0]).filter((z) => z > -3.0 && z < 3.9);
      for (let z = -3.0; z < 3.9; z += 0.45) cuts.push(z);
      cuts.push(3.9); cuts.sort((p, q) => p - q);
      for (let x = -1.0; x <= 1.01; x += 0.25) for (let i = 0; i < cuts.length - 1; i++) {
        const za = cuts[i], zb = cuts[i + 1], ax = Math.abs(x);
        if (ax > Math.min(hullAt(za).w, hullAt(zb).w) - 0.1 || (za < 0.85 && zb > -1.8 && ax < 1.1)) continue;
        const ya = deckY(ax, za) + 0.005, yb = deckY(ax, zb) + 0.005;
        mg.add(new THREE.BoxGeometry(0.015, 0.008, Math.hypot(yb - ya, zb - za)), seam, x, (ya + yb) / 2, (za + zb) / 2, -Math.atan2(yb - ya, zb - za), 0, 0);
      }
      // the cockpit: a well with two benches, the dashboard, the wheel
      mg.box(2.1, 0.12, 2.6, 0x5a2a12, 0, 0.66, -0.5);
      for (const z of [0.15, -1.25]) { mg.box(2.0, 0.28, 0.7, leather, 0, 0.88, z); mg.box(2.0, 0.42, 0.14, leather, 0, 1.12, z - 0.35); }
      mg.box(2.1, 0.22, 0.2, 0x5a2a12, 0, 0.95, 0.75);
      mg.add(new THREE.TorusGeometry(0.19, 0.022, 6, 22), 0xf2f2ee, -0.45, 1.12, 0.6, -0.5, 0, 0);
      gl.hexa([[-1.05, 0.92, 0.92], [1.05, 0.92, 0.92], [1.05, 0.92, 0.97], [-1.05, 0.92, 0.97], [-0.98, 1.25, 0.82], [0.98, 1.25, 0.82], [0.98, 1.25, 0.87], [-0.98, 1.25, 0.87]], 0xffffff);
      mg.box(2.12, 0.03, 0.06, CHROME, 0, 1.26, 0.84);
      for (const s of [1, -1]) mg.box(0.03, 0.36, 0.06, CHROME, s * 1.05, 1.08, 0.9);
      // the sun pad over the engine hatch, the flag at the stern
      mg.box(2.0, 0.12, 1.4, leather, 0, 0.92, -2.6);
      tubeTo(mg, [0, 0.8, -3.95], [0, 1.9, -4.05], 0.015, CHROME);
      mg.box(0.01, 0.3, 0.45, 0x1f4fae, 0, 1.72, -4.3);
      mg.box(0.012, 0.06, 0.45, 0xf2c200, 0, 1.72, -4.3);
      mg.box(0.012, 0.3, 0.06, 0xf2c200, 0, 1.72, -4.24);
      driver = { x: -0.45, y: 0.62, z: 0.1 };
      parts = [{ cz: 0, hw: M.W / 2, hl: M.L / 2, top: 1.0 }];
    }
    return { body: mg.build(), glass: gl.build(), front: frontGeo, decal, plates: new Builder().build(), flashers, head, rake, frontAxle: null, driver, rear: null, parts };
  }
  // The army's vehicles, in their own frame (z forwards, y up from the road, +x the driver's left), painted in M90: the
  // Swedish splinter camouflage of light and dark green, black and pale green in sharp-edged patches. The tank's turret
  // with its gun and the Patria's weapon station turn on their own (front, about head).
  const M90 = [0x5b6b45, 0x34402b, 0x1e2119, 0x7d8b5e];
  function camouflage(m, base) {
    const b = new THREE.Color(base), cols = M90.map((c) => new THREE.Color(c)), P = m.p, C = m.c;
    const hash = (u, v) => { const h = Math.sin(u * 127.1 + v * 311.7) * 43758.5453; return h - Math.floor(h); };
    for (let i = 0; i < P.length; i += 9) {
      if (Math.abs(C[i] - b.r) > 1e-4 || Math.abs(C[i + 1] - b.g) > 1e-4 || Math.abs(C[i + 2] - b.b) > 1e-4) continue;
      const x = (P[i] + P[i + 3] + P[i + 6]) / 3, y = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, z = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      const h = hash(Math.floor(x * 0.9 + z * 0.55 + y * 0.5), Math.floor(z * 0.8 - x * 0.6 + y * 0.9));
      const c = cols[h < 0.4 ? 0 : h < 0.68 ? 1 : h < 0.84 ? 2 : 3];
      for (let k = 0; k < 9; k += 3) { C[i + k] = c.r; C[i + k + 1] = c.g; C[i + k + 2] = c.b; }
    }
  }
  function militaryGeometry(M, paint) {
    const surf = (col) => (col === COL.head ? SURF.head : col === COL.tail ? SURF.tail : col === COL.rev ? SURF.rev : col === COL.indL ? SURF.indL : col === COL.indR ? SURF.indR : col === GLOSS ? SURF.gloss : [0.82, 0.05, 0, 0]);
    const mg = new Merger(surf), gl = new Merger(), front = new Merger(surf);
    // a box cut into pieces about half a metre across, so the camouflage has room for its patches
    const cbox = (m, w, h, d, col, x, y, z) => m.add(new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 0.55)), Math.max(1, Math.round(h / 0.55)), Math.max(1, Math.round(d / 0.55))), col, x, y, z);
    const DARK = 0x2a2c2e, OLIVE = 0x4f5a3c, hw = M.W / 2, hl = M.L / 2;
    let driver, head = null, parts;
    if (M.mil === 'tank') {
      const tw = 0.62;
      for (const s of [1, -1]) {
        const xc = s * (hw - tw / 2);
        // the track: the top and bottom runs and the slanted ends, the sprocket at the back and the idler at the front
        mg.box(tw, 0.09, 7.1, DARK, xc, 0.92, 0); mg.box(tw, 0.09, 6.7, DARK, xc, 0.05, 0);
        mg.hexa([[xc - tw / 2, 0.01, 3.35], [xc + tw / 2, 0.01, 3.35], [xc + tw / 2, 0.86, 3.86], [xc - tw / 2, 0.86, 3.86], [xc - tw / 2, 0.1, 3.35], [xc + tw / 2, 0.1, 3.35], [xc + tw / 2, 0.97, 3.55], [xc - tw / 2, 0.97, 3.55]], DARK);
        mg.hexa([[xc - tw / 2, 0.01, -3.35], [xc + tw / 2, 0.01, -3.35], [xc + tw / 2, 0.86, -3.86], [xc - tw / 2, 0.86, -3.86], [xc - tw / 2, 0.1, -3.35], [xc + tw / 2, 0.1, -3.35], [xc + tw / 2, 0.97, -3.55], [xc - tw / 2, 0.97, -3.55]], DARK);
        for (const z of [3.45, -3.45]) mg.add(new THREE.CylinderGeometry(0.34, 0.34, tw * 0.8, 14), 0x3a3d38, xc, 0.55, z, 0, 0, Math.PI / 2);
        // the armoured skirt over the top of the track, the lower half of the road wheels showing under it
        cbox(mg, 0.08, 0.55, 7.2, paint, s * (hw + 0.02), 0.76, -0.05);
      }
      // the hull between the tracks, the deck over them, the sloped glacis plate, the engine deck with its grilles
      cbox(mg, M.W - 2 * tw, 0.75, 7.2, paint, 0, 0.72, 0);
      cbox(mg, M.W + 0.04, 0.3, 6.5, paint, 0, 1.18, -0.45);
      mg.hexa([[-hw, 1.03, 2.8], [hw, 1.03, 2.8], [hw, 0.85, 3.85], [-hw + 0.1, 0.85, 3.85], [-hw, 1.33, 2.8], [hw, 1.33, 2.8], [hw - 0.1, 0.98, 3.85], [-hw + 0.1, 0.98, 3.85]], paint);
      for (let z = -3.4; z < -1.6; z += 0.36) mg.box(2.2, 0.03, 0.18, DARK, 0, 1.345, z);
      for (const s of [1, -1]) {
        mg.box(0.22, 0.12, 0.06, COL.head, s * 1.35, 1.02, 3.66);
        mg.box(0.2, 0.1, 0.05, COL.tail, s * 1.5, 1.15, -3.72);
        mg.box(0.1, 0.06, 0.06, IND(s), s * 1.35, 1.12, 3.66); mg.box(0.1, 0.06, 0.05, IND(s), s * 1.5, 1.24, -3.72);
      }
      // the driver's hatch at the front left, the driver's head out of it
      mg.add(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14), DARK, 0.75, 1.38, 2.35);
      driver = { x: 0.75, y: 0.8, z: 2.3 };
      // the turret: the box with its bustle behind, the arrowhead armour on the front, the mantlet and the 120 mm gun with
      // its thermal sleeve, the commander's cupola and the gunner's sight, smoke dischargers on the sides
      head = [0, 1.33, -0.45];
      cbox(front, 3.0, 0.78, 3.4, paint, 0, 0.39, -0.1);
      cbox(front, 2.6, 0.62, 1.1, paint, 0, 0.42, -2.3);
      for (const s of [1, -1]) {
        front.hexa([[s * 0.36, 0.04, 1.6], [s * 1.5, 0.04, 1.6], [s * 1.0, 0.04, 2.55], [s * 0.62, 0.04, 2.55], [s * 0.36, 0.76, 1.6], [s * 1.5, 0.76, 1.6], [s * 1.0, 0.66, 2.45], [s * 0.62, 0.66, 2.45]], paint);
        for (let k = 0; k < 4; k++) front.add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), DARK, s * 1.56, 0.62, -0.9 - k * 0.16, 0.3, 0, s * 0.9);
      }
      cbox(front, 0.7, 0.62, 0.5, paint, 0, 0.42, 1.85);
      front.add(new THREE.CylinderGeometry(0.085, 0.09, 5.2, 12), paint, 0, 0.46, 4.6, Math.PI / 2, 0, 0);
      front.add(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 12), DARK, 0, 0.46, 3.2, Math.PI / 2, 0, 0);
      front.add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), 0x1a1c19, 0, 0.46, 7.2, Math.PI / 2, 0, 0);
      front.add(new THREE.CylinderGeometry(0.36, 0.38, 0.28, 14), paint, 0.62, 0.92, -0.75);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; front.box(0.1, 0.08, 0.06, GLOSS, 0.62 + Math.cos(a) * 0.3, 1.02, -0.75 + Math.sin(a) * 0.3); }
      cbox(front, 0.45, 0.4, 0.55, paint, -0.75, 0.95, 0.75);
      front.box(0.32, 0.22, 0.04, GLOSS, -0.75, 0.98, 1.03);
      tubeTo(front, [-1.2, 0.78, -2.4], [-1.25, 3.0, -2.5], 0.015, DARK);
      tubeTo(front, [1.2, 0.78, -2.4], [1.25, 2.6, -2.5], 0.015, DARK);
      camouflage(front, paint);
      parts = [{ cz: 0, hw, hl, top: 2.15 }];
    } else if (M.mil === 'patria') {
      // Patria AMV: the lower hull between the wheels, the upper hull leaning in, the long sloped glacis, the driver's
      // hatch with its vision blocks, the rear door, and a remote weapon station on the roof
      const lo = 0.55, mid = 1.12, top = 2.25;
      mg.hexa([[-hw + 0.22, lo, -hl + 0.1], [hw - 0.22, lo, -hl + 0.1], [hw - 0.22, lo, hl - 0.45], [-hw + 0.22, lo, hl - 0.45], [-hw + 0.12, mid, -hl], [hw - 0.12, mid, -hl], [hw - 0.12, mid, hl], [-hw + 0.12, mid, hl]], paint);
      cbox(mg, 2 * hw - 0.24, mid - lo, M.L - 0.4, paint, 0, (lo + mid) / 2, -0.15);
      mg.hexa([[-hw, mid, -hl], [hw, mid, -hl], [hw, mid, 2.85], [-hw, mid, 2.85], [-hw + 0.26, top, -hl + 0.08], [hw - 0.26, top, -hl + 0.08], [hw - 0.26, top, 2.2], [-hw + 0.26, top, 2.2]], paint);
      mg.hexa([[-hw, mid, 2.85], [hw, mid, 2.85], [hw - 0.08, mid, hl], [-hw + 0.08, mid, hl], [-hw + 0.26, top, 2.2], [hw - 0.26, top, 2.2], [hw - 0.16, mid + 0.2, hl], [-hw + 0.16, mid + 0.2, hl]], paint);
      for (let i = 0; i < 5; i++) { const z = -hl + 0.6 + i * 1.3; cbox(mg, 2 * hw - 0.6, 0.06, 0.9, paint, 0, top + 0.03, z); }
      for (const s of [1, -1]) {
        mg.box(0.24, 0.13, 0.05, COL.head, s * (hw - 0.35), mid + 0.12, hl + 0.01);
        mg.box(0.2, 0.12, 0.05, COL.tail, s * (hw - 0.3), mid + 0.4, -hl - 0.01);
        mg.box(0.12, 0.06, 0.05, IND(s), s * (hw - 0.35), mid + 0.23, hl + 0.01); mg.box(0.12, 0.06, 0.05, IND(s), s * (hw - 0.3), mid + 0.51, -hl - 0.01);
        // the wheel stations, dark behind the tyres
        for (const az of M.axles) mg.box(0.08, 0.85, 1.3, DARK, s * (hw - 0.2), 0.95, az);
        tubeTo(mg, [s * (hw - 0.4), top, -hl + 0.4], [s * (hw - 0.45), top + 2.2, -hl + 0.35], 0.012, DARK);
      }
      mg.box(1.2, 1.1, 0.04, OLIVE, 0, 1.55, -hl - 0.02);
      mg.add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 14), DARK, 0.75, top + 0.06, 2.0);
      for (let k = 0; k < 3; k++) gl.box(0.16, 0.08, 0.04, 0xffffff, 0.52 + k * 0.23, top - 0.02, 2.24 + 0.002 * k);
      driver = { x: 0.75, y: 1.53, z: 1.95 };
      head = [0, top + 0.06, 0.2];
      front.add(new THREE.CylinderGeometry(0.45, 0.5, 0.25, 16), paint, 0, 0.12, 0);
      cbox(front, 0.62, 0.45, 0.75, paint, 0, 0.47, 0.05);
      front.add(new THREE.CylinderGeometry(0.035, 0.04, 1.3, 8), DARK, 0.12, 0.5, 0.95, Math.PI / 2, 0, 0);
      front.box(0.22, 0.2, 0.28, DARK, -0.28, 0.55, 0.22);
      front.box(0.14, 0.1, 0.03, GLOSS, -0.28, 0.56, 0.37);
      camouflage(front, paint);
      parts = [{ cz: 0, hw, hl, top: top + 0.6 }];
    } else {
      // the Scania: a forward cab with its windscreen and grille, the chassis, and the cargo body under an arched olive
      // tarpaulin on its hoops, mudguards over the wheels
      const cab0 = 2.3, cab1 = hl - 0.1;
      cbox(mg, M.W, 1.55, cab1 - cab0, paint, 0, 1.92, (cab0 + cab1) / 2);
      cbox(mg, M.W - 0.2, 0.32, cab1 - cab0 - 0.4, paint, 0, 2.86, (cab0 + cab1) / 2 - 0.15);
      gl.hexa([[-hw + 0.12, 2.12, cab1 + 0.01], [hw - 0.12, 2.12, cab1 + 0.01], [hw - 0.12, 2.12, cab1 + 0.04], [-hw + 0.12, 2.12, cab1 + 0.04], [-hw + 0.14, 2.62, cab1 - 0.04], [hw - 0.14, 2.62, cab1 - 0.04], [hw - 0.14, 2.62, cab1 - 0.01], [-hw + 0.14, 2.62, cab1 - 0.01]], 0xffffff);
      for (const s of [1, -1]) {
        gl.box(0.03, 0.5, 0.75, 0xffffff, s * (hw + 0.005), 2.38, cab1 - 0.55);
        mg.box(0.26, 0.16, 0.05, COL.head, s * (hw - 0.3), 1.08, cab1 + 0.12);
        mg.box(0.18, 0.12, 0.05, COL.tail, s * (hw - 0.25), 1.05, -hl - 0.02);
        mg.box(0.12, 0.07, 0.05, IND(s), s * (hw - 0.3), 1.21, cab1 + 0.12); mg.box(0.12, 0.07, 0.05, IND(s), s * (hw - 0.25), 1.16, -hl - 0.02);
        tubeTo(mg, [s * hw, 2.6, cab1 - 0.3], [s * (hw + 0.35), 2.5, cab1 - 0.2], 0.025, DARK);
        mg.box(0.06, 0.38, 0.22, GLOSS, s * (hw + 0.38), 2.35, cab1 - 0.2);
        for (const az of M.axles) mg.box(0.5, 0.06, 1.35, DARK, s * (hw - 0.3), 1.32, az);
        mg.box(0.12, 0.45, 1.0, DARK, s * 0.62, 1.0, 0.8);
      }
      mg.box(M.W - 0.3, 0.6, 0.06, DARK, 0, 1.45, cab1 + 0.02);
      mg.box(M.W + 0.1, 0.32, 0.25, DARK, 0, 0.9, cab1 + 0.12);
      for (const s of [1, -1]) mg.box(0.18, 0.3, M.L - 0.4, DARK, s * 0.5, 0.95, -0.1);
      // the cargo body: a floor, low sides in the camouflage, the tarpaulin over its hoops
      const b0 = -hl + 0.1, b1 = cab0 - 0.15, bl = b1 - b0, bz = (b0 + b1) / 2;
      cbox(mg, M.W, 0.15, bl, DARK, 0, 1.22, bz);
      cbox(mg, M.W, 0.55, bl, paint, 0, 1.57, bz);
      mg.box(M.W - 0.02, 1.0, bl - 0.02, OLIVE, 0, 2.35, bz);
      sectionLoft(mg, Array.from({ length: 2 }, (_, i) => [b0 + i * bl, hw - 0.05, 2.84, 3.2]), OLIVE);
      for (let z = b0 + 0.4; z < b1; z += 1.1) mg.box(M.W + 0.02, 1.4, 0.06, 0x434c33, 0, 2.5, z);
      mg.box(1.9, 1.2, 0.04, 0x434c33, 0, 2.35, b0 - 0.02);
      driver = { x: 0.6, y: 1.72, z: 3.35 };
      parts = [{ cz: 0, hw, hl, top: 3.25 }];
    }
    camouflage(mg, paint);
    let frontGeo = null;
    if (head) { frontGeo = front.build(); frontGeo.computeBoundingSphere(); }
    return { body: mg.build(), glass: gl.build(), front: frontGeo, decal: null, plates: new Builder().build(), flashers: null, head, rake: 0, frontAxle: null, driver, rear: null, parts };
  }
  // someone riding the moped: sitting upright on the seat, feet on the floor, hands on the grips, a full-face helmet
  function riderGeometry(id) {
    if (id.riderGeo) return id.riderGeo;
    const m = new Merger(), helmet = id === playerId ? 0xf7c600 : id.hatColor, sl = id.sleeves ? id.shirt : id.skin;
    m.add(squash(cyl(0.16, 0.16, 0.18, 12), 1.15, 1, 0.8), id.pants, 0, 0.07, 0);
    tubeTo(m, [0, 0.14, 0.0], [0, 0.42, 0.05], 0.17, id.shirt, 0.165);
    m.add(squash(ball(0.175, 12, 8), 1.22, 0.42, 0.76), id.shirt, 0, 0.48, 0.06);
    tubeTo(m, [0, 0.53, 0.07], [0, 0.6, 0.08], 0.05, id.skin);
    // the helmet, its visor and a strip of colour round it
    m.add(ball(0.152, 16, 12), helmet, 0, 0.71, 0.08);
    m.add(squash(ball(0.153, 16, 6, Math.PI * 0.32), 1, 1, 1), 0x15171a, 0, 0.71, 0.08, Math.PI / 2 - 0.1, 0, 0);
    m.add(squash(cyl(0.135, 0.15, 0.05, 16), 1, 1, 1.05), shade(helmet, 0.7), 0, 0.6, 0.07);
    for (const s of [1, -1]) {
      // legs: the thigh forwards along the seat, the shin down to the foot on the floor
      tubeTo(m, [s * 0.09, 0.02, 0.0], [s * 0.14, -0.04, 0.4], 0.075, id.pants, 0.06);
      tubeTo(m, [s * 0.14, -0.04, 0.4], [s * 0.13, -0.42, 0.22], 0.06, id.pants, 0.048);
      m.box(0.1, 0.07, 0.24, 0x1c1c1c, s * 0.13, -0.44, 0.28);
      // arms: from the shoulder down to the elbow and forwards to the grip
      tubeTo(m, [s * 0.2, 0.5, 0.04], [s * 0.29, 0.31, 0.11], 0.052, id.shirt, 0.045);
      tubeTo(m, [s * 0.29, 0.31, 0.11], [s * 0.31, 0.24, 0.3], 0.044, sl, 0.038);
      m.add(ball(0.045, 8, 6), id.skin, s * 0.31, 0.24, 0.31);
    }
    id.riderGeo = m.build();
    return id.riderGeo;
  }
  function carGeometry(M, paint) {
    if (M.moped) return mopedGeometry(M, paint);
    if (M.boat) return boatGeometry(M, paint);
    if (M.mil) return militaryGeometry(M, paint);
    const mg = new Merger(carSurf(paint)), gl = new Merger();
    const sh = loftBody(M, paint, mg, gl), S = M.shape, { hl, hw, r0, r1, r2, r3 } = sh;
    const roofMid = sh.ring((r1 + r2) / 2), gT = roofMid.gT;
    // wheel wells: dark liners behind the arches
    for (const az of [M.wb / 2, -M.wb / 2]) {
      const x = wheelX(M) - 0.17, y0 = sh.sill(az) + 0.02, y1 = Math.min(sh.archTop, sh.belt(az) - 0.15) - 0.01;
      mg.box(2 * x, y1 - y0, sh.rA * 1.7, UNDER, 0, (y0 + y1) / 2, az);
    }
    // interior: a dark tub up to the waist, seats and a steering wheel, seen through the windows
    let seatZ = M.bus ? hl - 1.3 : r3 - (M.sport ? 0.98 : 0.92);
    // a long raked windscreen (the Lamborghini's) would come down on the driver's head: sit further back, against the
    // bulkhead in front of the engine
    if (M.sport && seatZ > r2 + 0.05) seatZ = Math.max(r1 + 0.35, r2 - 0.2);
    const driver = { x: M.bus ? hw - 0.62 : Math.max(0.3, hw - S.shoulder - 0.42), y: (M.bus ? 2.3 : sh.roof(seatZ)) - 0.92, z: seatZ };
    // whoever sits there has to fit under the roof: sink the seat, and in the lowest cars slide it inboard, until the
    // head and the cap or beanie clear the glass and the roof all round (and the cap's peak the windscreen)
    const HEAD = [[-0.17, 0.92, -0.17], [0.17, 0.92, -0.17], [-0.17, 0.92, 0.17], [0.17, 0.92, 0.17], [-0.16, 0.83, 0.31], [0.16, 0.83, 0.31], [0, 0.93, 0]];
    const headRoom = (x, y, z) => Math.max(...HEAD.map(([hx, hy, hz]) => y + hy - (sh.shellY(x + hx, z + hz) - 0.035)));
    const fitSeat = (x, y, z, minX) => {
      // sinking is cheap (the doors hide the body) until the head drops below the window line; sliding inboard costs
      // a little more. Take the cheapest mix that fits
      let best = null;
      const sill = sh.belt(z) + 0.2;
      for (let xx = x; xx >= minX - 1e-6; xx -= 0.02) {
        const d = Math.max(0, headRoom(xx, y, z)), cost = d + 1.5 * (x - xx) + 4 * Math.max(0, sill - (y - d + 0.8));
        if (!best || cost < best.cost) best = { x: xx, d, cost };
      }
      return { x: best.x, y: y - best.d, z };
    };
    if (S.open) driver.y = sh.belt(seatZ) - 0.4;
    else if (!M.bus) Object.assign(driver, fitSeat(driver.x, driver.y, driver.z, 0.22));
    // the back seat, where an arrested driver is put (behind the driver, as the police do)
    const rear = M.sport || M.bus ? null : fitSeat(driver.x, driver.y, seatZ - 0.88, 0.2);
    // (where the tub, the seats and the wheel are, for the inside seen in first person: INTERIOR in src/vehicles/interior.js)
    const cabin = { z0: 0, z1: 0, y1: 0, xi: 0, seat: null, rear: null, wheel: null };
    {
      const z0 = Math.max(r0, -hl + S.rc[0] * 0.7) + 0.05, z1 = Math.min(r3, hl - S.rc[1]) - 0.05;
      let yMin = 9;
      for (let z = z0; z <= z1; z += 0.1) yMin = Math.min(yMin, sh.belt(z));
      const xi = hw - S.shoulder - 0.05, y0 = sh.sill(0) + 0.08, y1 = yMin - 0.03;
      // (the tub's vertices are kept, so that first person can take it away from your own car: INTERIOR)
      const t0 = mg.p.length / 3;
      if (z1 > z0) mg.box(2 * xi, y1 - y0, z1 - z0, 0x1a1b1e, 0, (y0 + y1) / 2, (z0 + z1) / 2);
      cabin.tub = [t0, mg.p.length / 3];
      const seat = S.seatCol || 0x2b2d31, sy = y1 + 0.2;
      Object.assign(cabin, { z0, z1, y1, xi });
      if (M.bus) {
        for (let z = hl - 3.2; z > -hl + 1.2; z -= 0.85) for (const sx of [1, -1]) if (!S.busDoors.some(([a, b]) => z > a - 0.3 && z < b + 0.3)) mg.box(0.9, 0.5, 0.1, 0x2f4f7a, sx * (hw - 0.6), y1 + 0.25, z);
      } else {
        // the seats follow the roof: a low or sloping roof gets a shorter backrest, and the headrest goes if there's no room
        const ceil = (z) => Math.min(sh.topAt(z - 0.08), sh.topAt(z), sh.topAt(z + 0.08)) - 0.08;
        const inner = (z, y) => { const r = sh.ring(z); return lerp(r.gB, r.gT, clamp((y - r.yt) / Math.max(1e-3, r.top - r.yt), 0, 1)) - 0.06; };
        const bz = seatZ - 0.32, bot = sy - 0.275, top = Math.min(sy + 0.275, ceil(bz)), roomTop = ceil(bz - 0.02);
        const sx = Math.min(driver.x, xi - 0.28, inner(bz, top) - 0.25);
        cabin.seat = { sx, bz, bot, top, hBot: top + 0.02, hTop: Math.min(sy + 0.465, roomTop) };
        for (const s of [1, -1]) {
          mg.box(0.5, top - bot, 0.12, seat, s * sx, (top + bot) / 2, bz);
          const hTop = Math.min(sy + 0.465, roomTop), hBot = top + 0.02;
          if (hTop - hBot > 0.08) mg.box(0.26, hTop - hBot, 0.1, seat, s * sx, (hTop + hBot) / 2, seatZ - 0.34);
        }
        const rz = seatZ - 1.2;
        if (!M.sport && rz > z0) {
          const rBot = sy - 0.28, rTop = Math.min(sy + 0.22, ceil(rz));
          if (rTop - rBot > 0.25) {
            mg.box(2 * Math.min(xi, inner(rz, rTop)) - 0.1, rTop - rBot, 0.12, seat, 0, (rTop + rBot) / 2, rz);
            cabin.rear = { rz, rBot, rTop, rW: 2 * Math.min(xi, inner(rz, rTop)) - 0.1, ceil: ceil(rz) };
          }
        }
        // (the wheel a little under the eyes, as in a real car, but never down in the tub)
        cabin.wheel = [driver.x, clamp(driver.y + 0.6, y1 + 0.08, y1 + 0.16), seatZ + 0.42];
        mg.add(new THREE.TorusGeometry(0.17, 0.025, 6, 18), 0x15171a, ...cabin.wheel, 0.45, 0, 0);
      }
    }
    // mirrors on the doors at the foot of the windscreen
    if (!M.bus) for (const s of [1, -1]) {
      const z = r3 - 0.28, y = sh.belt(z) + 0.1, x = sh.ring(z).gB;
      mg.box(0.07, 0.04, 0.07, GLOSS, s * (x + 0.035), y - 0.03, z);
      mg.add(new THREE.BoxGeometry(0.16, 0.09, 0.07), paint, s * (x + 0.13), y, z, 0, s * 0.15, 0);
      mg.box(0.13, 0.07, 0.01, GLOSS, s * (x + 0.13), y, z - 0.04);
      // (the indicator repeater in the outer end of the mirror)
      mg.add(new THREE.BoxGeometry(0.014, 0.024, 0.062), IND(s), s * (x + 0.211), y - 0.022, z - 0.012, 0, s * 0.15, 0);
    } else for (const s of [1, -1]) {
      mg.box(0.06, 0.06, 0.5, GLOSS, s * (hw + 0.03), 2.55, hl - 0.25);
      mg.box(0.06, 0.4, 0.2, GLOSS, s * (hw + 0.06), 2.3, hl + 0.05);
    }
    // door handles near the rear edge of each door
    const doors = (S.doors || []).slice().sort((a, b) => b - a);
    for (let k = 1; k < doors.length; k++) for (const s of [1, -1]) {
      const z = doors[k] + 0.22, y = sh.belt(z) - 0.1, x = sh.sideX(z, y);
      mg.box(0.03, 0.035, 0.15, S.handles === 'paint' ? shade(paint, 0.9) : S.trim === 'chrome' ? CHROME : GLOSS, s * (x + 0.006), y, z);
    }
    // number plates: a frame on the body and the plate itself, a quad that shows this car's registration from the atlas
    const plateB = new Builder();
    for (const [s, y] of [[1, S.plate[0]], [-1, S.plate[1]]]) {
      const z = sh.endZ(0.26, s) + s * 0.014, f = z + s * 0.0135, x0 = 0.25 * s, x1 = -0.25 * s;
      mg.box(0.53, 0.12, 0.025, GLOSS, 0, y, z);
      plateB.quad([x1, y - 0.052, f], [x0, y - 0.052, f], [x0, y + 0.052, f], [x1, y + 0.052, f], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, s]);
    }
    // special lamps
    for (const L of S.lamps || []) {
      if (L.type === 'round') for (const s of [1, -1]) {
        const y = sh.belt(L.z) + 0.012, rx = Math.PI / 2 - L.tilt;
        mg.add(new THREE.CylinderGeometry(L.r + 0.018, L.r + 0.018, 0.05, 20), CHROME, s * L.x, y, L.z, rx, 0, 0);
        mg.add(new THREE.CylinderGeometry(L.r, L.r, 0.07, 20), COL.head, s * L.x, y, L.z + 0.004, rx, 0, 0);
      } else if (L.type === 'bars') for (const s of [1, -1]) for (const x of L.xs) {
        const zr = sh.endZ(x + L.w / 2, -1), yt = sh.belt(zr + 0.05), y0 = yt + L.y[0], y1 = yt + L.y[1];
        mg.box(L.w, y1 - y0, 0.05, COL.tail, s * x, (y0 + y1) / 2, zr - 0.005);
      }
    }
    if (S.lamps && S.lamps.some((L) => L.type === 'bars')) for (const s of [1, -1]) mg.box(0.12, 0.05, 0.04, COL.rev, s * 0.3, S.plate[1] + 0.13, sh.endZ(0.3, -1) - 0.005);
    for (const L of S.lamps || []) {
      if (L.type === 'face') for (const s of [1, -1]) {
        // a round lamp set into the front (the Mini's, the Fiat 500's, the G-Class's): a ring, then the glass
        const z = sh.endZ(Math.min(L.x + L.r, hw - 0.02), 1) - 0.012;
        mg.add(new THREE.CylinderGeometry(L.r + 0.024, L.r + 0.024, 0.05, 24), L.ring === 'paint' ? paint : L.ring === 'gloss' ? GLOSS : CHROME, s * L.x, L.y, z, Math.PI / 2, 0, 0);
        mg.add(new THREE.CylinderGeometry(L.r, L.r * 0.92, 0.06, 24), COL.head, s * L.x, L.y, z + 0.012, Math.PI / 2, 0, 0);
        if (!L.noInd && (L.ind || !S.lamps.some((K) => K.type === 'pod'))) mg.box(0.07, 0.05, 0.03, IND(s), s * (L.x + L.r + 0.08), L.y - L.r * 0.5, sh.endZ(L.x + L.r + 0.08, 1) - 0.005);
      } else if (L.type === 'pod') for (const s of [1, -1]) mg.box(0.08, 0.055, 0.13, IND(s), s * L.x, sh.belt(L.z) + 0.026, L.z);
      else if (L.type === 'pixel') for (const [end, R, col] of [[1, L.front, COL.head], [-1, L.rear, COL.tail]]) {
        // square "pixels" in a grid, as on the Hyundai Ioniq 5
        if (!R) continue;
        const n = Math.max(1, Math.round((R.x[1] - R.x[0]) / 0.05)), m = Math.max(1, Math.round((R.y[1] - R.y[0]) / 0.05));
        for (const s of [1, -1]) {
          const zb = sh.endZ((R.x[0] + R.x[1]) / 2, end) + end * 0.004;
          mg.box(R.x[1] - R.x[0] + 0.03, R.y[1] - R.y[0] + 0.03, 0.02, GLOSS, s * (R.x[0] + R.x[1]) / 2, (R.y[0] + R.y[1]) / 2, zb);
          for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) mg.box(0.032, 0.032, 0.02, col, s * (R.x[0] + ((i + 0.5) * (R.x[1] - R.x[0])) / n), R.y[0] + ((j + 0.5) * (R.y[1] - R.y[0])) / m, zb + end * 0.008);
        }
      } else if (L.type === 'dots') for (const s of [1, -1]) {
        // four points of light in a square inside each headlamp (Porsche's)
        const z = sh.endZ(L.x, 1) - 0.004;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mg.box(0.03, 0.022, 0.03, COL.head, s * (L.x + dx * L.s), L.y + dy * L.s * 0.7, z);
      } else if (L.type === 'tailRound') for (const s of [1, -1]) for (const x of L.xs) {
        // round tail lamps, two a side (Ferrari's)
        const z = sh.endZ(Math.min(x + L.r, hw - 0.02), -1) + 0.01;
        mg.add(new THREE.CylinderGeometry(L.r + 0.02, L.r + 0.02, 0.05, 20), GLOSS, s * x, L.y, z, Math.PI / 2, 0, 0);
        mg.add(new THREE.CylinderGeometry(L.r, L.r, 0.06, 20), COL.tail, s * x, L.y, z - 0.012, Math.PI / 2, 0, 0);
      }
    }
    // Indicators, amber: on the outer corners of the nose and the tail, and a repeater in each door mirror. Each lamp
    // lies flat on the curve of the corner it sits on (the cars with their own lamps keep theirs: the Mini's and the
    // Fiat's round ones, the G-Class's on the wings, the F40's)
    {
      // where the rounded end (1 the nose, -1 the tail) is at lateral offset x and height y
      const endAt = (x, y, end) => {
        let a = end * (hl - (end > 0 ? S.rc[1] : S.rc[0])), b = end * hl;
        for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (sh.sideX(m, y) >= x) a = m; else b = m; }
        return a;
      };
      const cornerLamp = (x, y, w, h, end) => {
        const zIn = endAt(Math.max(0, x - w / 2), y, end), zOut = endAt(x + w / 2, y, end), L = Math.hypot(w, zOut - zIn);
        const nx = (end * (zIn - zOut)) / L, nz = (end * w) / L, ang = Math.atan2(zOut - zIn, w), d = 0.022, o = d / 2 - 0.004;
        for (const s of [1, -1]) mg.add(new THREE.BoxGeometry(w, h, d), IND(s), s * (x + nx * o), y, (zIn + zOut) / 2 + nz * o, 0, -s * ang, 0);
      };
      const lamps = S.lamps || [];
      if (!S.f40 && !lamps.some((L) => L.type === 'face')) {
        // under the outer end of the headlamp (or, with the lamps up on the wings, beside the plate)
        const zh = hl - (S.head ? S.head.d / 2 : 0.15), yt = sh.ring(zh).yt;
        const y = S.head ? sh.lv(S.head.y[0], yt) - 0.037 : S.plate[0] + 0.02;
        cornerLamp(Math.max(S.head ? S.head.x + 0.09 : 0, hw - 0.18), y, 0.14, 0.05, 1);
      }
      const tr = lamps.find((L) => L.type === 'tailRound');
      if (S.f40) { /* its outer round tail lamps are the indicators */ }
      else if (tr) cornerLamp(Math.max(...tr.xs), tr.y - tr.r - 0.05, 0.12, 0.045, -1);
      else if (S.tail) {
        // in the bottom outer corner of the tail lamp
        const zt = -hl + S.tail.d / 2, yt = sh.ring(zt).yt;
        cornerLamp(Math.max(S.tail.x + 0.07, hw - 0.17), sh.lv(S.tail.y[0], yt) + 0.035, 0.12, 0.055, -1);
      }
      // the bus has its repeaters on the sides, just behind the front corners
      if (M.bus) for (const s of [1, -1]) mg.box(0.012, 0.05, 0.14, IND(s), s * (hw + 0.004), 1.2, hl - 0.5);
    }
    // BMW's kidney grille: two tall openings with chrome surrounds and slats, either side of the middle of the nose
    if (S.kidney) {
      const K = S.kidney, w = K.x1 - K.x0, h = K.y1 - K.y0, cy = (K.y0 + K.y1) / 2, z = sh.endZ((K.x0 + K.x1) / 2, 1) - 0.035;
      for (const s of [1, -1]) {
        const cx = s * (K.x0 + K.x1) / 2;
        mg.box(w + 0.05, h + 0.05, 0.05, CHROME, cx, cy, z);
        mg.box(w, h, 0.05, GLOSS, cx, cy, z + 0.012);
        for (let i = 1; i < 7; i++) mg.box(0.014, h - 0.02, 0.02, 0x4a4f55, cx - w / 2 + (i * w) / 7, cy, z + 0.04);
      }
    }
    // the G-Class's grille: upright chrome bars across it
    if (S.grilleBars) {
      const G = S.grilleBars, h = G.y[1] - G.y[0];
      for (let i = 0; i <= G.n; i++) { const x = -G.x + (2 * G.x * i) / G.n; mg.box(0.02, h, 0.02, CHROME, x, (G.y[0] + G.y[1]) / 2, sh.endZ(Math.abs(x), 1) + 0.004); }
      mg.box(2 * G.x + 0.04, 0.03, 0.02, CHROME, 0, G.y[1] + 0.015, sh.endZ(G.x, 1) + 0.004);
    }
    // the maker's badge on the nose
    if (S.badge) {
      const B = S.badge, z = sh.endZ(0.03, 1) + 0.01, y = B.y;
      if (B.kind === 'star') {
        mg.add(new THREE.TorusGeometry(0.075, 0.009, 6, 24), CHROME, 0, y, z);
        for (let i = 0; i < 3; i++) mg.add(new THREE.BoxGeometry(0.012, 0.075, 0.01), CHROME, Math.sin((i / 3) * TAU) * 0.037, y + Math.cos((i / 3) * TAU) * 0.037, z, 0, 0, -(i / 3) * TAU);
      } else if (B.kind === 'rings') for (let i = 0; i < 4; i++) mg.add(new THREE.TorusGeometry(0.045, 0.007, 6, 20), CHROME, (i - 1.5) * 0.068, y, z);
      else if (B.kind === 'mg') { mg.add(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 8), CHROME, 0, y, z, Math.PI / 2, Math.PI / 8, 0); mg.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), 0x8c1a1a, 0, y, z + 0.003, Math.PI / 2, Math.PI / 8, 0); }
      else if (B.kind === 'vw') { mg.add(new THREE.TorusGeometry(0.07, 0.009, 6, 24), CHROME, 0, y, z); for (const sx of [-1, 1]) mg.add(new THREE.BoxGeometry(0.012, 0.09, 0.01), CHROME, sx * 0.022, y + 0.005, z, 0, 0, sx * 0.35); }
      else if (B.kind === 'bar') { mg.box(B.w || 0.5, 0.025, 0.02, CHROME, 0, y, z - 0.004); mg.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), 0x8c1a1a, 0, y, z + 0.004, Math.PI / 2, 0, 0); }
      else mg.add(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), CHROME, 0, y, z, Math.PI / 2, 0, 0);
    }
    // a spare wheel on the back door, under a hard cover
    if (S.spare) {
      const z = sh.endZ(0.1, -1) - 0.14, y = S.spare.y;
      mg.add(new THREE.CylinderGeometry(M.R, M.R, 0.26, 28), COL.tyre, S.spare.x || 0, y, z, Math.PI / 2, 0, 0);
      mg.add(new THREE.CylinderGeometry(M.R * 0.97, M.R * 0.97, 0.28, 28), S.spare.col === 'paint' ? paint : CHROME, S.spare.x || 0, y, z - 0.01, Math.PI / 2, 0, 0);
      mg.add(new THREE.TorusGeometry(M.R * 0.97, 0.012, 6, 28), CHROME, S.spare.x || 0, y, z - 0.155);
    }
    if (S.iron) {
      const z = sh.endZ(0.05, 1) + 0.006, yt = sh.belt(hl - 0.05), y = lerp(sh.lv(S.grille.y[0], yt), sh.lv(S.grille.y[1], yt), 0.5);
      mg.add(new THREE.TorusGeometry(0.06, 0.012, 6, 16), CHROME, 0, y, z, 0, 0, 0);
      mg.add(new THREE.BoxGeometry(0.34, 0.022, 0.02), CHROME, 0, y, z + 0.004, 0, 0, 0.62);
    }
    // wipers parked at the foot of the windscreen
    if (!M.bus) {
      const z = r3 - 0.06, y = sh.belt(r3) + 0.025, x0 = sh.ring(r3).gT * 0.85;
      for (const sx of [-0.08, -x0 * 0.92]) mg.add(new THREE.BoxGeometry(x0 * 0.9, 0.018, 0.022), GLOSS, sx + x0 * 0.45, y, z, 0, 0.12, 0.03);
    } else for (const sx of [0.55, -0.55]) mg.add(new THREE.BoxGeometry(0.9, 0.03, 0.03), GLOSS, sx, 1.25, hl + 0.02, 0, 0, 0.5 * Math.sign(sx));
    // exhausts: twin pipes in the middle on the sports cars, one at the side on the rest, none on the electric ones
    if (!M.ev) {
      const zr = -hl + 0.06, yb = sh.sill(-hl + 0.3) + 0.06;
      const pipes = S.sidePipes || S.f40 || S.pipes ? [] : M.sport ? [-0.2, 0.2] : M.bus ? [-hw + 0.4] : [-hw + 0.45];
      // (pipes of its own: the Huayra's cluster of four in the middle of the tail, the Corvette's two pairs)
      for (const [x, y] of S.pipes || []) {
        mg.add(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 12), CHROME, x, y, zr, Math.PI / 2, 0, 0);
        mg.add(new THREE.CylinderGeometry(0.034, 0.034, 0.01, 12), UNDER, x, y, zr - 0.112, Math.PI / 2, 0, 0);
      }
      // (the G 63's come out at the sides, in front of the rear wheels)
      if (S.sidePipes) for (const s of [1, -1]) for (const dz of [0, 0.11]) mg.add(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 12), CHROME, s * (hw - 0.03), sh.sill(-M.wb / 2 + 0.6) + 0.05, -M.wb / 2 + 0.55 + dz, 0, 0, Math.PI / 2);
      for (const x of pipes) {
        mg.add(new THREE.CylinderGeometry(M.sport ? 0.048 : 0.035, M.sport ? 0.048 : 0.035, 0.22, 12), CHROME, x, M.sport ? Math.max(yb, (S.diffuser || 0.3) - 0.1) : yb, zr, Math.PI / 2, 0, 0);
        mg.add(new THREE.CylinderGeometry(M.sport ? 0.036 : 0.025, M.sport ? 0.036 : 0.025, 0.01, 12), UNDER, x, M.sport ? Math.max(yb, (S.diffuser || 0.3) - 0.1) : yb, zr - 0.112, Math.PI / 2, 0, 0);
      }
    }
    // the aerial fin on the roof of the newer cars
    if (!M.bus && !M.sport && !M.classic && !S.roofGlass && !S.taxi && !S.police && r2 - r1 > 0.6) {
      const z = r1 + 0.18, y = sh.surfY(z, 0);
      mg.add(new THREE.BoxGeometry(0.045, 0.06, 0.16), GLOSS, 0, y + 0.025, z, 0.25, 0, 0);
    }
    // the third brake light at the top of the rear window
    if (!M.bus && !M.sport && r1 > r0 + 0.04) {
      const z = r1 - 0.03, y = sh.topAt(r1) - 0.035;
      mg.box(0.32, 0.03, 0.02, COL.tail, 0, y, z);
    }
    // fog lamps low in the front
    if (S.intake && !M.sport && !M.bus) for (const s of [1, -1]) {
      const x = Math.min(hw - 0.28, S.intake.x + 0.08), y = S.intake.y[0] - 0.01, z = sh.endZ(x, 1) - 0.02;
      if (y > sh.sill(hl - 0.2) + 0.03) mg.add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), COL.head, s * x, y, z, Math.PI / 2, 0, 0);
    }
    // roof rails, taxi sign, police light bar, rear wing, the bus's roof pack
    const roofY = (z, x = 0) => sh.surfY(z, x);
    if (S.rails) for (const s of [1, -1]) {
      const x = gT - 0.14, za = r1 + 0.15, zb = r2 - 0.1, n = Math.max(2, Math.round((zb - za) / 0.35));
      for (let i = 0; i < n; i++) {
        const a = za + ((zb - za) * i) / n, b = za + ((zb - za) * (i + 1)) / n, y = (roofY(a, x) + roofY(b, x)) / 2 + 0.06;
        mg.box(0.045, 0.035, b - a + 0.01, GLOSS, s * x, y, (a + b) / 2);
      }
      for (const z of [za, zb]) mg.box(0.05, 0.06, 0.12, GLOSS, s * x, roofY(z, x) + 0.03, z);
    }
    const roofZ = (r1 + r2) / 2;
    let flashers = null;
    if (S.taxi) {
      const y = roofY(roofZ) + 0.02;
      mg.box(0.66, 0.04, 0.26, GLOSS, 0, y + 0.02, roofZ);
      mg.box(0.62, 0.17, 0.22, 0xf2c200, 0, y + 0.125, roofZ);
    }
    if (S.police) {
      const z = roofZ + 0.25, y = roofY(z) + 0.02;
      mg.box(1.2, 0.07, 0.3, GLOSS, 0, y + 0.035, z);
      mg.box(0.5, 0.1, 0.26, COL.blueL, -0.33, y + 0.12, z);
      mg.box(0.5, 0.1, 0.26, COL.blueR, 0.33, y + 0.12, z);
      const fz = sh.endZ(0.2, 1) + 0.01, fy = sh.lv(S.grille.y[1], sh.belt(hl - 0.1)) - 0.03;
      mg.box(0.12, 0.05, 0.03, COL.blueL, -0.2, fy, fz);
      mg.box(0.12, 0.05, 0.03, COL.blueR, 0.2, fy, fz);
      flashers = [[-0.33, y + 0.15, z], [0.33, y + 0.15, z]];
    }
    if (S.wing) {
      // the rear wing on two posts: h high above the tail, z in from the end, w across, chord deep
      const Wg = S.wing === true ? {} : S.wing, wz = -hl + (Wg.z ?? 0.32), wy = sh.belt(wz), h = Wg.h ?? 0.28, span = Wg.w ?? M.W - 0.2, ch = Wg.chord ?? 0.36;
      for (const s of [-1, 1]) mg.box(0.05, h, 0.12, GLOSS, s * (Wg.posts ?? 0.55), wy + h / 2 - 0.01, wz);
      mg.box(span, 0.04, ch, GLOSS, 0, wy + h + 0.01, wz - 0.04);
      for (const s of [-1, 1]) mg.box(0.03, 0.16, ch + 0.06, GLOSS, s * (span / 2 - 0.02), wy + h - 0.01, wz - 0.04);
    }
    if (S.open) {
      // an open car: the windscreen leaning back from the front of the cockpit in a thin frame, and roll hoops behind the seats
      const zf = S.open.z[1], yb = sh.belt(zf), ws = S.open.screen ?? 0.3, back = ws * 0.55, w = sh.ring(zf).gB - 0.03, frame = M.classic ? CHROME : GLOSS;
      gl.hexa([[-w, yb, zf - 0.02], [w, yb, zf - 0.02], [w, yb, zf + 0.005], [-w, yb, zf + 0.005], [-w + 0.05, yb + ws, zf - back - 0.02], [w - 0.05, yb + ws, zf - back - 0.02], [w - 0.05, yb + ws, zf - back + 0.005], [-w + 0.05, yb + ws, zf - back + 0.005]], 0xffffff);
      for (const s of [1, -1]) tubeTo(mg, [s * w, yb, zf - 0.01], [s * (w - 0.05), yb + ws, zf - back - 0.01], 0.016, frame);
      tubeTo(mg, [-(w - 0.05), yb + ws, zf - back - 0.01], [w - 0.05, yb + ws, zf - back - 0.01], 0.016, frame);
      if (S.open.hoop) {
        const hz = seatZ - 0.55, hy = sh.belt(hz), hx = Math.min(hw - S.shoulder - 0.08, driver.x + 0.28);
        tubePath(mg, [[-hx, hy - 0.05, hz], [-hx + 0.05, hy + 0.32, hz], [hx - 0.05, hy + 0.32, hz], [hx, hy - 0.05, hz]], 0.028, GLOSS);
      }
    }
    // chrome (or black) bumper bars round the nose and the tail, following the curve of the ends
    if (S.bumper) {
      const B = S.bumper, col = TRIM[B.col || 'chrome'], xm = hw * (B.w || 0.86), n = 8;
      for (const [end, y] of [[1, B.y[0]], [-1, B.y[1]]]) for (let i = 0; i < n; i++) {
        const xa = -xm + (2 * xm * i) / n, xb = -xm + (2 * xm * (i + 1)) / n;
        const za = sh.endZ(Math.abs(xa), end) + end * 0.035, zb = sh.endZ(Math.abs(xb), end) + end * 0.035, len = Math.hypot(xb - xa, zb - za);
        mg.add(new THREE.BoxGeometry(len + 0.012, 0.065, 0.05), col, (xa + xb) / 2, y, (za + zb) / 2, 0, -Math.atan2(zb - za, xb - xa), 0);
      }
    }
    if (S.f40) {
      const F = S.f40, up = [0, 1, 0];
      // a flat patch of four corners lying just above the body (ducts, slots, panel gaps), facing up
      const patch = (q, col) => {
        const ux = q[1][0] - q[0][0], uz = q[1][2] - q[0][2], vx = q[2][0] - q[0][0], vz = q[2][2] - q[0][2];
        if (uz * vx - ux * vz < 0) q = [q[0], q[3], q[2], q[1]];
        mg.triN(q[0], q[1], q[2], up, up, up, col); mg.triN(q[0], q[2], q[3], up, up, up, col);
      };
      const onTop = (x, z, lift = 0.006) => [x, sh.surfY(z, Math.abs(x)) + lift, z];
      // (in short pieces, so that it follows the curve of the body instead of cutting under it)
      const line = (xa, za, xb, zb, w, col) => {
        const l = Math.hypot(xb - xa, zb - za), nx = (-(zb - za) / l) * w, nz = ((xb - xa) / l) * w, n = Math.max(1, Math.ceil(l / 0.06));
        for (let i = 0; i < n; i++) {
          const x0 = lerp(xa, xb, i / n), z0 = lerp(za, zb, i / n), x1 = lerp(xa, xb, (i + 1) / n), z1 = lerp(za, zb, (i + 1) / n);
          patch([onTop(x0 + nx, z0 + nz, 0.005), onTop(x1 + nx, z1 + nz, 0.005), onTop(x1 - nx, z1 - nz, 0.005), onTop(x0 - nx, z0 - nz, 0.005)], col);
        }
      };
      for (const s of [1, -1]) {
        // the two NACA ducts in the bonnet, narrow at the front and opening out towards the windscreen
        for (let i = 0; i < 10; i++) {
          const t0 = i / 10, t1 = (i + 1) / 10, za = lerp(1.72, 1.12, t0), zb = lerp(1.72, 1.12, t1);
          patch([onTop(s * lerp(0.175, 0.09, t0), za), onTop(s * lerp(0.225, 0.31, t0), za), onTop(s * lerp(0.225, 0.31, t1), zb), onTop(s * lerp(0.175, 0.09, t1), zb)], UNDER);
        }
        // the lids of the pop-up headlamps at the front corners, shut, seen by their panel gaps
        const xa = s * 0.47, xb = s * 0.83, za = 1.5, zb = 1.86;
        line(xa, za, xb, za, 0.005, UNDER); line(xa, zb, xb, zb, 0.005, UNDER); line(xa, za, xa, zb, 0.005, UNDER);
        // the amber indicator at the outer end of each lamp, behind the clear cover
        mg.box(0.12, 0.05, 0.02, IND(s), s * 0.79, 0.455, sh.endZ(0.86, 1) - 0.006);
        // the yellow Ferrari shield on each front wing, behind the wheel
        const zs = M.wb / 2 - sh.rA - 0.13, ys = 0.62, xs = sh.sideX(zs, ys);
        mg.box(0.008, 0.08, 0.06, 0xf2c200, s * (xs + 0.002), ys, zs);
        // the fog and reversing lamps low in the corners of the tail
        mg.box(0.09, 0.045, 0.03, s > 0 ? COL.tail : COL.rev, s * 0.72, 0.47, sh.endZ(0.77, -1) - 0.008);
        // four round lamps in the black mesh of the tail: red inside, amber outside
        for (const [x, kind] of F.tail) {
          const z = sh.endZ(Math.min(x + F.lampR, hw - 0.02), -1) - 0.004;
          mg.add(new THREE.CylinderGeometry(F.lampR + 0.016, F.lampR + 0.016, 0.03, 22), GLOSS, s * x, F.lampY, z, Math.PI / 2, 0, 0);
          mg.add(new THREE.CylinderGeometry(F.lampR, F.lampR * 0.94, 0.04, 22), kind === 'red' ? COL.tail : IND(s), s * x, F.lampY, z - 0.012, Math.PI / 2, 0, 0);
        }
      }
      // the Lexan engine cover: a window behind the roof, then rows of slots either side of a spine down the middle
      for (let z = r0 + 0.1; z < r1 - 0.35; z += 0.075) {
        const xe = sh.ring(z).xe - 0.05;
        for (const s of [1, -1]) line(s * 0.07, z, s * xe, z, 0.014, UNDER);
      }
      line(0, r0 + 0.04, 0, r1 - 0.3, 0.035, paint);
      // the wing across the whole tail, carried on the rear wings swept up into it
      const wy = F.wingY, wa = -hl + 0.03, wb = -hl + 0.4, ex = hw - 0.03;
      mg.add(new THREE.BoxGeometry(2 * ex, 0.035, wb - wa), paint, 0, wy - 0.02, (wa + wb) / 2, 0.07, 0, 0);
      mg.box(2 * ex - 0.1, 0.012, 0.02, GLOSS, 0, wy - 0.01, wa + 0.005);
      for (const s of [1, -1]) {
        const x0 = s * (ex - 0.055), x1 = s * ex, zf = -1.55, yb = (z) => sh.belt(z) - 0.03;
        mg.hexa([[x0, yb(wa), wa], [x1, yb(wa), wa], [x1, yb(zf), zf], [x0, yb(zf), zf], [x0, wy + 0.02, wa], [x1, wy + 0.02, wa], [x1, wy + 0.01, wb], [x0, wy + 0.01, wb]], paint);
      }
      // three pipes in an oval in the middle of the tail, the middle one for the wastegates
      const ye = 0.46;
      mg.box(0.44, 0.13, 0.05, GLOSS, 0, ye, sh.endZ(0.22, -1) + 0.01);
      for (const [x, r] of [[-0.125, 0.046], [0, 0.036], [0.125, 0.046]]) {
        mg.add(new THREE.CylinderGeometry(r, r, 0.16, 14), CHROME, x, ye, -hl + 0.02, Math.PI / 2, 0, 0);
        mg.add(new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.01, 14), UNDER, x, ye, -hl - 0.062, Math.PI / 2, 0, 0);
      }
    }
    if (S.roofPack) {
      mg.box(1.9, 0.26, 3.6, 0xd8dadc, 0, 3.13, -2.9);
      mg.box(1.5, 0.18, 1.6, 0xd8dadc, 0, 3.09, 2.6);
    }
    // POLIS on the doors and the bonnet, TAXI on the roof sign (the decal texture holds both words)
    let decal = null;
    if (S.police || S.taxi) {
      const db = new Builder(), POL = [[0, 0.5], [1, 0.5], [1, 1], [0, 1]], TAX = [[0, 0], [1, 0], [1, 0.5], [0, 0.5]];
      if (S.police) {
        const zf = r3 - 0.3, zr = zf - 0.7, yt = sh.belt((zf + zr) / 2), y0 = yt - 0.165, y1 = yt - 0.045;
        const X = (z, y) => sh.sideX(z, y) + 0.008;
        db.quad([X(zf, y0), y0, zf], [X(zr, y0), y0, zr], [X(zr, y1), y1, zr], [X(zf, y1), y1, zf], 0xffffff, POL, [1, 0, 0]);
        db.quad([-X(zr, y0), y0, zr], [-X(zf, y0), y0, zf], [-X(zf, y1), y1, zf], [-X(zr, y1), y1, zr], 0xffffff, POL, [-1, 0, 0]);
        const hz0 = hl - S.rc[1] - 0.05, hz1 = hz0 - 0.3, Y = (z, x) => sh.surfY(z, Math.abs(x)) + 0.02;
        db.quad([-0.5, Y(hz0, -0.5), hz0], [0.5, Y(hz0, 0.5), hz0], [0.5, Y(hz1, 0.5), hz1], [-0.5, Y(hz1, -0.5), hz1], 0xffffff, POL, [0, 1, 0]);
      }
      if (S.taxi) {
        const y = roofY(roofZ) + 0.04, y0 = y + 0.02, y1 = y + 0.19, zf = roofZ + 0.112, zr = roofZ - 0.112;
        db.quad([-0.3, y0, zf], [0.3, y0, zf], [0.3, y1, zf], [-0.3, y1, zf], 0xffffff, TAX, [0, 0, 1]);
        db.quad([0.3, y0, zr], [-0.3, y0, zr], [-0.3, y1, zr], [0.3, y1, zr], 0xffffff, TAX, [0, 0, -1]);
      }
      decal = db.build();
    }
    const beltMax = Math.max(...sh.Z.filter((z) => Math.abs(z) < hl * 0.7).map(sh.belt)), roofMax = Math.max(...sh.Z.map(sh.topAt));
    const parts = M.bus ? [{ cz: 0, hw, hl, top: roofMax }]
      : [{ cz: 0, hw, hl, top: beltMax }, { cz: (Math.max(r1, -hl + 0.3) + r2) / 2, hw: hw - 0.12, hl: (r2 - Math.max(r1, -hl + 0.3)) / 2, top: roofMax + 0.03 }];
    return { body: mg.build(), glass: gl.build(), decal, plates: plateB.build(), flashers, driver, rear, parts, cabin };
  }
  // one geometry per model and colour, shared by every car like it until a crash dents one (see ownGeometry)
  const carGeoCache = new Map();
  function sharedCarGeometry(M, paint) {
    const key = M.id + ':' + paint;
    if (!carGeoCache.has(key)) carGeoCache.set(key, carGeometry(M, paint));
    return carGeoCache.get(key);
  }
  const wheelCache = new Map();
  function wheelGeometry(R, style) {
    const key = R + style;
    if (wheelCache.has(key)) return wheelCache.get(key);
    if (style === 'mil' || style === 'tank') {
      // the army's: a fat cross-country tyre on a plain olive rim with a big hub, or a tank's rubber-tyred road wheel
      const m = new Merger(carSurf(-1)), tank = style === 'tank', tw = tank ? 0.62 : 0.42, rim = R * (tank ? 0.82 : 0.55);
      m.add(new THREE.CylinderGeometry(R, R, tw * 0.9, 24, 1, true), tank ? 0x2a2c2e : COL.tyre, 0, 0, 0, 0, 0, Math.PI / 2);
      m.add(new THREE.CylinderGeometry(R * 0.96, R * 0.96, tw, 24), tank ? 0x2a2c2e : COL.tyre, 0, 0, 0, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        const fx = sx * (tw / 2 + 0.004);
        m.add(new THREE.CylinderGeometry(rim, rim * 0.92, 0.03, 20), tank ? 0x4a5240 : 0x4f5a3c, fx, 0, 0, 0, 0, Math.PI / 2);
        m.add(new THREE.CylinderGeometry(rim * 0.32, rim * 0.32, 0.06, 10), 0x2b2e2a, fx + sx * 0.02, 0, 0, 0, 0, Math.PI / 2);
        if (!tank) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; m.add(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6), 0x8a8f94, fx + sx * 0.02, Math.cos(a) * rim * 0.48, Math.sin(a) * rim * 0.48, 0, 0, Math.PI / 2); }
      }
      const g = m.build();
      wheelCache.set(key, g);
      return g;
    }
    if (style === 'scooter') {
      // a 12-inch scooter wheel: a fat tyre, round in profile, on five spokes, the brake disc on the left
      const m = new Merger(carSurf(-1)), tube = 0.064, rim = 0.155;
      m.add(new THREE.TorusGeometry(R - tube, tube, 10, 32), COL.tyre, 0, 0, 0, 0, Math.PI / 2, 0);
      m.add(new THREE.CylinderGeometry(rim, rim, 0.1, 24, 1, true), COL.hub, 0, 0, 0, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        m.add(new THREE.TorusGeometry(rim - 0.008, 0.012, 4, 20), COL.rim, sx * 0.05, 0, 0, 0, Math.PI / 2, 0);
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; m.add(new THREE.BoxGeometry(0.018, rim * 0.95, 0.04), COL.rim, sx * 0.045, Math.cos(a) * rim * 0.48, Math.sin(a) * rim * 0.48, a, 0, 0); }
        m.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), CHROME, sx * 0.05, 0, 0, 0, 0, Math.PI / 2);
      }
      m.add(new THREE.CylinderGeometry(0.11, 0.11, 0.004, 22), COL.disc, 0.062, 0, 0, 0, 0, Math.PI / 2);
      const g = m.build();
      wheelCache.set(key, g);
      return g;
    }
    const m = new Merger(carSurf(-1)), big = style === 'sport' || style === 'black' || style === 'f40', tw = style === 'steel' ? 0.3 : big ? 0.3 : 0.27;
    const rim = R * (big ? 0.74 : style === 'steel' ? 0.6 : 0.68), face = style === 'black' ? COL.rimDark : style === 'aero' ? COL.aero : style === 'steel' ? 0x6a6e73 : style === 'f40' ? COL.rimLight : style === 'wire' ? CHROME : COL.rim;
    m.add(new THREE.CylinderGeometry(R, R, tw * 0.84, 30, 1, true), COL.tyre, 0, 0, 0, 0, 0, Math.PI / 2);
    m.add(new THREE.CylinderGeometry(R * 0.95, R * 0.95, tw, 30), COL.tyre, 0, 0, 0, 0, 0, Math.PI / 2);
    m.add(new THREE.CylinderGeometry(rim, rim, tw + 0.004, 24, 1, false), COL.hub, 0, 0, 0, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      const fx = sx * (tw / 2 + 0.004);
      // the brake disc, seen between the spokes
      if (style !== 'aero' && style !== 'steel') m.add(new THREE.CylinderGeometry(rim * 0.8, rim * 0.8, 0.003, 26), COL.disc, sx * (tw / 2 + 0.0045), 0, 0, 0, 0, Math.PI / 2);
      m.add(new THREE.TorusGeometry(rim - 0.012, 0.016, 3, 18), face, fx, 0, 0, 0, Math.PI / 2, 0);
      if (style === 'aero') {
        m.add(new THREE.CylinderGeometry(rim - 0.02, rim - 0.02, 0.012, 18), face, fx, 0, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; m.add(new THREE.BoxGeometry(0.016, rim * 0.5, 0.05), COL.hub, fx + sx * 0.004, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, a, 0, 0); }
      } else if (style === 'steel') {
        m.add(new THREE.CylinderGeometry(rim - 0.03, rim * 0.5, 0.03, 18), face, fx, 0, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; m.add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6), COL.hub, fx, Math.cos(a) * rim * 0.68, Math.sin(a) * rim * 0.68, 0, 0, Math.PI / 2); }
      } else if (style === 'wire') {
        // wire wheels: forty spokes laced from the hub to the chrome rim, crossing, and the eared knock-off in the middle
        for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU; m.add(new THREE.CylinderGeometry(0.0045, 0.0045, rim * 0.9, 4), CHROME, fx, Math.cos(a) * rim * 0.47, Math.sin(a) * rim * 0.47, a + (k % 2 ? 0.12 : -0.12), 0, 0); }
        m.add(new THREE.CylinderGeometry(rim * 0.2, rim * 0.24, 0.05, 12), CHROME, fx + sx * 0.01, 0, 0, 0, 0, Math.PI / 2);
        for (const a of [0.4, 0.4 + Math.PI / 2]) m.add(new THREE.BoxGeometry(0.025, rim * 0.6, 0.03), CHROME, fx + sx * 0.04, 0, 0, a, 0, 0);
      } else if (style === 'f40') {
        // Speedline's five-spoke star, each spoke broad at the hub and narrowing out to the rim, and the centre-lock nut
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU, g = new THREE.CylinderGeometry(0.022, 0.05, rim * 0.86, 4, 1);
          g.rotateY(Math.PI / 4); g.scale(0.5, 1, 1);
          m.add(g, face, fx, Math.cos(a) * rim * 0.47, Math.sin(a) * rim * 0.47, a, 0, 0);
        }
        m.add(new THREE.CylinderGeometry(rim * 0.3, rim * 0.34, 0.03, 20), face, fx, 0, 0, 0, 0, Math.PI / 2);
        m.add(new THREE.CylinderGeometry(rim * 0.16, rim * 0.16, 0.05, 6), CHROME, fx + sx * 0.018, 0, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 3; k++) m.add(new THREE.BoxGeometry(0.03, rim * 0.48, 0.03), CHROME, fx + sx * 0.03, 0, 0, (k / 3) * Math.PI, 0, 0);
      } else {
        const n = style === 'sport' ? 10 : 5, wdt = style === 'sport' ? 0.035 : 0.075;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          if (style === 'alloy') for (const da of [-0.13, 0.13]) m.add(new THREE.BoxGeometry(0.02, rim * 0.92, 0.04), face, fx, Math.cos(a + da) * rim * 0.48, Math.sin(a + da) * rim * 0.48, a + da, 0, 0);
          else m.add(new THREE.BoxGeometry(0.02, rim * 0.95, wdt), face, fx, Math.cos(a) * rim * 0.48, Math.sin(a) * rim * 0.48, a, 0, 0);
        }
      }
      if (style !== 'f40' && style !== 'wire') m.add(new THREE.CylinderGeometry(rim * 0.2, rim * 0.2, 0.024, 8), style === 'black' ? COL.rimDark : CHROME, fx + sx * 0.004, 0, 0, 0, 0, Math.PI / 2);
    }
    const g = m.build();
    wheelCache.set(key, g);
    return g;
  }

  // brake callipers sit on the hub, so they stay put while the wheel turns: red on the sports cars
  const caliperCache = new Map();
  function caliperGeometry(R, style) {
    const key = R + style;
    if (caliperCache.has(key)) return caliperCache.get(key);
    let g = null;
    if (style !== 'aero' && style !== 'steel' && style !== 'scooter' && style !== 'mil' && style !== 'tank') {
      const m = new Merger(carSurf(-1)), big = style === 'sport' || style === 'black' || style === 'f40', tw = big ? 0.3 : 0.27, rim = R * (big ? 0.74 : 0.68);
      for (const sx of [-1, 1]) m.add(new THREE.BoxGeometry(0.014, rim * 0.34, rim * 0.42), big ? COL.caliper : COL.caliperGrey, sx * (tw / 2 + 0.0075), rim * 0.47, -rim * 0.3, 0.55, 0, 0);
      g = m.build();
    }
    caliperCache.set(key, g);
    return g;
  }
  // number plates: one atlas of Swedish registrations (white, and yellow for the taxis), each car showing its own
  const PLATE_LETTERS = 'ABCDEFGHJKLMNOPRSTUWXYZ', PLATE_N = 32, PLATE_TAXI = 28;
  const plateLetter = () => PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)];
  const PLATE_REGS = Array.from({ length: PLATE_N }, () => plateLetter() + plateLetter() + plateLetter() + ' ' + String(Math.floor(Math.random() * 100)).padStart(2, '0') + (Math.random() < 0.5 ? Math.floor(Math.random() * 10) : plateLetter()));
  const plateTex = canvasTex(1024, 512, (g) => {
    PLATE_REGS.forEach((reg, i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 64, taxi = i >= PLATE_TAXI;
      g.fillStyle = '#1b1c1e'; g.fillRect(x, y, 256, 64);
      g.fillStyle = taxi ? '#f2c200' : '#f4f4f1'; roundRect(g, x + 3, y + 3, 250, 58, 6); g.fill();
      g.fillStyle = '#1f4fae'; roundRect(g, x + 3, y + 3, 30, 58, 6); g.fill(); g.fillRect(x + 20, y + 3, 13, 58);
      g.fillStyle = '#f2c200';
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.fillRect(x + 18 + Math.cos(a) * 8 - 1, y + 21 + Math.sin(a) * 8 - 1, 2.2, 2.2); }
      g.fillStyle = '#ffffff'; g.font = '700 17px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', x + 18, y + 47);
      g.fillStyle = '#121314'; g.font = '700 44px "Arial Narrow", Arial, sans-serif'; g.fillText(reg, x + 144, y + 35, 204);
    });
  });
  function plateMaterial(slot) {
    const m = std({ map: plateTex, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const u = { value: new THREE.Vector2((slot % 4) * 0.25, 1 - (Math.floor(slot / 4) + 1) * 0.125) };
    m.onBeforeCompile = (sh) => { sh.uniforms.uSlot = u; sh.vertexShader = 'uniform vec2 uSlot;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvUv = uSlot + uv * vec2( 0.25, 0.125 );'); };
    return m;
  }

  const cars = [];
  let driving = null, spawnedCar = null;
  // who sits astride rather than in a seat: on the moped and the jet ski
  const rides = (M) => M.moped || M.boat === 'jetski';
  function makeCar(M, color) {
    const geo = sharedCarGeometry(M, color);
    const group = new THREE.Group(), body = new THREE.Group();
    group.add(body);
    const mat = carMaterial();
    const bodyMesh = new THREE.Mesh(geo.body, mat); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; body.add(bodyMesh);
    const glass = new THREE.Mesh(geo.glass, glassMat);
    // a moped's handlebars, fork and front wheel turn about its steering head, which leans back
    let steerGroup = null;
    if (M.moped || geo.front) {
      steerGroup = new THREE.Group();
      steerGroup.rotation.order = 'XYZ'; steerGroup.position.set(geo.head[0], geo.head[1], geo.head[2]); steerGroup.rotation.x = -geo.rake;
      const fm = new THREE.Mesh(geo.front, mat); fm.castShadow = true; fm.receiveShadow = true;
      steerGroup.add(fm); body.add(steerGroup);
      // (the moped's lamp mask and screen turn with its bars; the jet ski's screen stays on the hull)
      if (M.moped) steerGroup.add(glass); else body.add(glass);
    } else body.add(glass);
    const decal = geo.decal ? new THREE.Mesh(geo.decal, decalMat) : null;
    if (decal) body.add(decal);
    const plateSlot = M.shape.taxi ? PLATE_TAXI + Math.floor(Math.random() * (PLATE_N - PLATE_TAXI)) : Math.floor(Math.random() * PLATE_TAXI);
    const plateMat = plateMaterial(plateSlot), plates = new THREE.Mesh(geo.plates, plateMat);
    body.add(plates);
    // (boats have no plates, and no shadow on the road under them)
    plates.visible = !M.boat;
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.scale.set(M.W * 1.35, 1, M.L * 1.12); blob.position.y = 0.045; blob.renderOrder = 1; blob.visible = !M.boat;
    group.add(blob);
    const driver = new THREE.Mesh(rides(M) ? riderGeometry(playerId) : playerId.driverGeo, personMat);
    driver.position.set(geo.driver.x, geo.driver.y, geo.driver.z);
    driver.visible = false;
    body.add(driver);
    // someone in the back seat (you, after an arrest)
    let rearSeat = null;
    if (geo.rear) { rearSeat = new THREE.Mesh(playerId.driverGeo, personMat); rearSeat.position.set(geo.rear.x, geo.rear.y, geo.rear.z); rearSeat.visible = false; body.add(rearSeat); }
    const spins = [], pivots = [], wheels = [], calipers = [], wg = wheelGeometry(M.R, M.rim), cg = caliperGeometry(M.R, M.rim);
    const wx = wheelX(M), wz = M.wb / 2;
    // (a moped's two wheels lean with its body; the front one is in the steering. The army's vehicles run on more axles,
    // the front M.steers of them steering, and the tank's road wheels inside its tracks steer none)
    const axles = M.boat ? [] : M.axles || [wz, -wz];
    axles.forEach((az, ai) => { for (const sx of M.moped ? [0] : [1, -1]) {
      const sz = az > 0 ? 1 : -1, steers = M.axles ? ai < M.steers : sz === 1;
      const pivot = new THREE.Group(); pivot.position.set(sx * wx, M.R, az);
      if (M.moped) {
        if (sz === 1) pivot.position.copy(geo.frontAxle);
        (sz === 1 ? steerGroup : body).add(pivot);
      }
      const spin = new THREE.Group(); pivot.add(spin);
      const w = new THREE.Mesh(wg, wheelMat); w.castShadow = true; spin.add(w);
      // (the callipers are only shown on your own car, to keep the number of things drawn down)
      if (cg) { const cm = new THREE.Mesh(cg, wheelMat); cm.visible = false; pivot.add(cm); calipers.push(cm); }
      if (!M.moped) group.add(pivot);
      spins.push(spin);
      wheels.push({ pivot, sx, sz, z: az, steers, toe: 0, camber: 0 });
      if (steers) pivots.push(pivot);
    } });
    const flashers = geo.flashers ? geo.flashers.map(([x, y, z]) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4d7bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.position.set(x, y, z); s.scale.setScalar(2.2); body.add(s);
      return s;
    }) : null;
    scene.add(group);
    const r = M.W / 2 + 0.04, span = M.L / 2 - r, n = Math.max(2, Math.ceil((2 * span) / (r * 1.2)) + 1);
    const offs = [];
    for (let i = 0; i < n; i++) offs.push(-span + (2 * span * i) / (n - 1));
    const c = {
      M, color, group, body, driver, rearSeat, spins, pivots, wheels, calipers, geo, mat, bodyMesh, glass, decal, flashers, plateSlot, plateMat, plates, steerGroup, fallen: 0,
      geoShared: true, x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, wheelRot: 0, roll: 0, pitch: 0,
      prevVf: 0, throttle: 0, r, offs, parts: geo.parts, bot: null, occupant: null, keep: false, input: null, px: 0, pz: 0,
      // gearbox
      gear: 0, rpm: M.idle, shiftT: 0, auto: true, limiter: false, reversing: false, braking: false,
      // damage
      health: 100, power: 1, align: 0, dented: false, glassBroken: false, dead: false, hitT: 0, smokeT: 0, slip: 0,
      police: null
    };
    cars.push(c);
    return c;
  }
  function setOccupant(c, id) {
    c.occupant = id;
    if (id) c.driver.geometry = rides(c.M) ? riderGeometry(id) : id.driverGeo;
    c.driver.visible = !!id;
  }
  function removeCar(c) {
    scene.remove(c.group);
    if (!c.geoShared) { c.geo.body.dispose(); c.geo.glass.dispose(); if (c.geo.decal) c.geo.decal.dispose(); }
    c.mat.dispose(); c.plateMat.dispose();
    if (c.flashers) for (const s of c.flashers) s.material.dispose();
    const i = cars.indexOf(c);
    if (i >= 0) cars.splice(i, 1);
    if (c === spawnedCar) spawnedCar = null;
  }
  function fitsM(M, x, z, h) {
    const co = Math.cos(h), si = Math.sin(h), hw = M.W / 2 - 0.05, hl = M.L / 2 - 0.05;
    const n = Math.max(1, Math.ceil((2 * hl) / 3));
    for (let i = 0; i <= n; i++) {
      const lz = -hl + (2 * hl * i) / n;
      for (const lx of [-hw, hw]) if (!walkable(x + lx * co + lz * si, z - lx * si + lz * co)) return false;
    }
    return true;
  }
  function spotFree(M, x, z, h, ignore) {
    if (!fitsM(M, x, z, h)) return false;
    const r = M.W / 2 + 0.04, span = M.L / 2 - r, fx = Math.sin(h), fz = Math.cos(h);
    for (const o of [-span, 0, span]) if (blockedAt(x + fx * o, z + fz * o, r)) return false;
    for (const o of cars) if (o !== ignore && Math.hypot(o.x - x, o.z - z) < (o.M.L + M.L) / 2 + 0.6) return false;
    return true;
  }

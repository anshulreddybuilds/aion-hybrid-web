/* AION — "The Seam" light field. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * One small WebGL fragment shader behind the page, no models, no textures,
 * no libraries. A slow sky of light over a dot-matrix landscape (the same
 * dots as the numerals). Every line of the landscape runs into the seam of
 * the border on screen: the left side is the device (jade); the right side
 * stays grey until characters have really crossed, then warms to ember in
 * proportion to the measured counts. Purely visual: it reads the page,
 * never changes it.
 *
 * Renders at reduced resolution, about 30 frames a second, and stops when
 * the tab is hidden. With reduced motion, or on low-power devices, it draws
 * one still frame. Without WebGL the page keeps its CSS background.
 */
(function () {
  "use strict";
  try {
    var doc = document, body = doc.body;
    var cv = doc.createElement("canvas");
    cv.className = "field-fx"; cv.setAttribute("aria-hidden", "true");
    var gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return;
    body.insertBefore(cv, body.firstChild);
    body.setAttribute("data-field", "on");

    var VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
    var FS = [
      "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif",
      "uniform vec2 uRes;uniform float uT;uniform float uSeam;uniform float uCross;uniform float uDown;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
      " return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}",
      "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
      "void main(){",
      " vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;",
      " vec2 p=vec2((uv.x-uSeam)*asp,uv.y);",
      " vec3 jade=vec3(.357,.89,.659),ember=vec3(1.,.478,.239),grey=vec3(.43,.45,.5),base=vec3(.027,.031,.039);",
      " float side=smoothstep(-.015,.015,p.x);",
      " vec3 right=mix(grey,ember,uCross)*(1.-.6*uDown);",
      " vec3 tint=mix(jade*vec3(.8,1.,1.15),right,side);",
      /* sky: a domain-warped field drifting slowly upward */
      " vec2 q=p*1.4+vec2(0.,-uT*.025);",
      " float w=fbm(q+1.6*fbm(q*1.2+vec2(uT*.04,0.)));",
      " float hz=.34;",
      " float sky=smoothstep(hz-.02,hz+.5,uv.y);",
      " float aur=smoothstep(.42,.78,w);vec3 teal=vec3(.20,.62,.75);",
      " vec3 col=base+(tint*aur*.30+(tint*.5+teal*.5)*w*w*.12)*sky;",
      " col+=vec3(.08,.12,.2)*pow(fbm(q*.6+3.),2.)*.25*sky;",
      /* the seam as a beam of light */
      " float d=abs(p.x);",
      " float beam=(.09*exp(-d*34.)+.035*exp(-d*7.))*smoothstep(hz-.05,hz+.55,uv.y)*(1.-.5*uDown);",
      " col+=vec3(.78,.93,1.)*beam;",
      /* horizon glow */
      " col+=tint*.07*exp(-abs(uv.y-hz)*55.);",
      /* the ground: a dot-matrix landscape in perspective */
      " if(uv.y<hz){",
      "  float y=hz-uv.y;float z=.11/y;",
      "  vec2 g=vec2(p.x*z*1.15,z+uT*.09);",
      "  vec2 c=floor(g*26.),f=fract(g*26.)-.5;",
      "  float ht=fbm(c*.045+vec2(0.,uT*.02));",
      "  float r=.06+.20*smoothstep(.3,.75,ht);",
      "  float dotv=1.-smoothstep(r*.35,r,length(f));",
      "  float fade=(1.-smoothstep(.45,3.2,z))*smoothstep(0.,.06,y);",
      "  float b=(.05+1.5*smoothstep(.38,.72,ht))*fade;",
      "  col+=tint*dotv*b;",
      "  col+=vec3(.78,.93,1.)*exp(-d*45.)*.12*fade;",
      "  col*=.75+.25*smoothstep(0.,.3,y);",
      " }",
      /* vignette */
      " vec2 v=uv-.5;col*=1.-.55*dot(v,v);",
      " gl_FragColor=vec4(col,1.);",
      "}"
    ].join("\n");

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ["uRes", "uT", "uSeam", "uCross", "uDown"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });

    var reduceQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    function motionOK() { return !reduceQ.matches && (body.getAttribute("data-motion") || "full") === "full"; }
    function val(id) { var el = doc.getElementById(id); var v = el ? (el.getAttribute("data-value") || "").replace(/[^\d]/g, "") : ""; return v ? parseInt(v, 10) : 0; }

    var W = 0, H = 0, seam = .5, seamT = .5, cross = 0, crossT = 0, down = 0, t0 = performance.now(), raf = 0, lastDraw = 0;
    function size() {
      var s = Math.min(1, 960 / Math.max(1, innerWidth)) * Math.min(window.devicePixelRatio || 1, 1.5) * .6;
      W = Math.max(2, Math.round(innerWidth * s)); H = Math.max(2, Math.round(innerHeight * s));
      cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
    }
    function read() {
      var inst = doc.getElementById("instrument"), rule = inst && inst.querySelector(".rule");
      seamT = .5;
      if (rule && rule.offsetParent !== null) {
        var r = rule.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) seamT = Math.min(.92, Math.max(.08, (r.left + r.width / 2) / innerWidth));
      }
      var held = val("heldNum"), cr = val("crossNum");
      crossT = cr > 0 ? Math.min(1, .45 + .55 * cr / Math.max(1, held + cr)) : 0;
      down = inst && inst.getAttribute("data-cloud") === "down" ? 1 : 0;
    }
    function frame(now, still) {
      raf = 0;
      read();
      var k = still ? 1 : .06;
      seam += (seamT - seam) * k; cross += (crossT - cross) * k;
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uT, still ? 12.0 : ((now - t0) / 1000) % 600);
      gl.uniform1f(U.uSeam, seam); gl.uniform1f(U.uCross, cross); gl.uniform1f(U.uDown, down);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      lastDraw = now;
      if (!still) loop();
    }
    function loop() {
      if (raf || doc.hidden) return;
      if (!motionOK()) { frame(performance.now(), true); return; }
      raf = requestAnimationFrame(function (now) {
        raf = 0;
        if (now - lastDraw < 31) { loop(); return; }
        frame(now, false);
      });
    }
    size(); loop();
    addEventListener("resize", function () { size(); if (!motionOK()) frame(performance.now(), true); }, { passive: true });
    addEventListener("scroll", function () { if (!motionOK()) frame(performance.now(), true); }, { passive: true });
    doc.addEventListener("visibilitychange", loop);
    if (reduceQ.addEventListener) reduceQ.addEventListener("change", loop);
    if (window.MutationObserver) {
      new MutationObserver(function () { if (!motionOK()) frame(performance.now(), true); else loop(); })
        .observe(body, { subtree: true, attributes: true, attributeFilter: ["data-motion", "data-value", "data-cloud", "data-step"] });
    }
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); body.removeAttribute("data-field"); cv.remove(); });
  } catch (e) { /* decorative only: the page keeps its CSS background */ }
})();

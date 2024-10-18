@group(${bindGroup_scene}) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> time: f32;

// https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39
// MIT License. © Stefan Gustavson, Munrocket
fn permute4(x: vec4f) -> vec4f { return ((x * 34. + 1.) * x) % vec4f(289.); }
fn fade2(t: vec2f) -> vec2f { return t * t * t * (t * (t * 6. - 15.) + 10.); }

fn perlin(P: vec2f) -> f32 {
    var Pi: vec4f = floor(P.xyxy) + vec4f(0., 0., 1., 1.);
    let Pf = fract(P.xyxy) - vec4f(0., 0., 1., 1.);
    Pi = Pi % vec4f(289.); // To avoid truncation effects in permutation
    let ix = Pi.xzxz;
    let iy = Pi.yyww;
    let fx = Pf.xzxz;
    let fy = Pf.yyww;
    let i = permute4(permute4(ix) + iy);
    var gx: vec4f = 2. * fract(i * 0.0243902439) - 1.; // 1/41 = 0.024...
    let gy = abs(gx) - 0.5;
    let tx = floor(gx + 0.5);
    gx = gx - tx;
    var g00: vec2f = vec2f(gx.x, gy.x);
    var g10: vec2f = vec2f(gx.y, gy.y);
    var g01: vec2f = vec2f(gx.z, gy.z);
    var g11: vec2f = vec2f(gx.w, gy.w);
    let norm = 1.79284291400159 - 0.85373472095314 *
        vec4f(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
    g00 = g00 * norm.x;
    g01 = g01 * norm.y;
    g10 = g10 * norm.z;
    g11 = g11 * norm.w;
    let n00 = dot(g00, vec2f(fx.x, fy.x));
    let n10 = dot(g10, vec2f(fx.y, fy.y));
    let n01 = dot(g01, vec2f(fx.z, fy.z));
    let n11 = dot(g11, vec2f(fx.w, fy.w));
    let fade_xy = fade2(Pf.xy);
    let n_x = mix(vec2f(n00, n01), vec2f(n10, n11), vec2f(fade_xy.x));
    let n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
}

fn perlin3(lightIdx: u32, scaledTime: f32) -> vec3f {
    let seedPos = vec2f(f32(lightIdx) * 163.81f, scaledTime);
    return vec3f(perlin(seedPos), perlin(seedPos + 110.93), perlin(seedPos + 350.51));
}

const bboxMin = vec3f(-10, 0, -5);
const bboxMax = vec3f(10, 8, 5);

// CHECKITOUT: this is an example of a compute shader entry point function
@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let lightIdx = globalIdx.x;
    if (lightIdx >= lightSet.numLights) {
        return;
    }

    let scaledTime = time / 20000.f;

    let noise = perlin3(lightIdx, scaledTime);
    // perlin noise rarely reaches the extremes (-1 and 1), so scale accordingly here to ensure lights reach
    // the bounding box's sides
    let scaledNoise = (noise + 0.5) * 0.8;
    lightSet.lights[lightIdx].pos = mix(bboxMin, bboxMax, scaledNoise);
}

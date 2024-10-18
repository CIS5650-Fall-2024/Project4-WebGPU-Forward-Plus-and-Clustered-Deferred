// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f,
    idx: u32
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

struct ZBinArray {
    bins: array<u32>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    lights : array<u32, ${maxLightsPerTile}>
}

struct ClusterSet {
    width: u32,
    height: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProj: mat4x4f,
    view: mat4x4f,
    projInv: mat4x4f,
    screenSize: vec2i,
    tanHalfFov: f32,
    aspectRatio: f32
}

const INV_PI = 0.31830988618;

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

// ref: https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/
// octahedron normal vector encoding
fn outctWrap(v : vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * vec2f(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
}

fn encodeNormal(n: vec3f) -> vec2f {
    var nor = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    nor = select(outctWrap(nor), nor, n.z >= 0.0);
    return nor * 0.5 + 0.5;
}

fn decodeNormal(v: vec2f) -> vec3f {
    let f = v * 2.0 - 1.0;
    var n = vec3f(f.xy, 1.0 - abs(f.x) - abs(f.y));
    let t = saturate(-n.z);
    n.x += select(t, -t, n.x >= 0.0);
    n.y += select(t, -t, n.y >= 0.0);
    return normalize(n);
}
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

struct ZArray {
    arr: array<u32>
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
    viewProj: mat4x4f,
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    view: mat4x4f,
    projInv: mat4x4f,
    screenSize: vec2i,
    tanHalfFov: f32,
    aspectRatio: f32
}

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

fn wrap(v : vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * vec2f(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
}

fn normalEncode(n: vec3f) -> vec2f {
    var res = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    res = select(wrap(res), res, n.z >= 0.0);
    return res * 0.5 + 0.5;
}

fn normalDecode(v: vec2f) -> vec3f {
    let f = v * 2.0 - 1.0;
    var n = vec3f(f.xy, 1.0 - abs(f.x) - abs(f.y));
    let t = saturate(-n.z);
    n.x += select(t, -t, n.x >= 0.0);
    n.y += select(t, -t, n.y >= 0.0);
    return normalize(n);
}
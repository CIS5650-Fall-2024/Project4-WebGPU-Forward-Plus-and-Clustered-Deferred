// CHECKITOUT: code that you add here will be prepended to all shaders
struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

struct ClusterAABB {
    min: vec3f,
    max: vec3f
}

struct TileInfo {
    numTilesX: u32,
    numTilesY: u32,
    numTilesZ: u32
}
// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    invProj: mat4x4<f32>,
    view: mat4x4<f32>,
    near: f32,
    far: f32,
    padding: vec2<f32>
}

struct Resolution {
    width: u32,
    height: u32
};

const INFINITE: f32 = 3.40282346638528859812e+38f;


fn square(x: f32) -> f32 {
    return x * x;
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

fn calculateLightIntersection(lightPos: vec3f, minb: vec3f, maxb: vec3f) -> bool {
    // calculate distance of light to the bounding box
    var lightDist = 0.0;
    for (var i = 0u; i < 3u; i = i + 1u) {
        if (lightPos[i] < maxb[i] && lightPos[i] > minb[i]) {
            continue;
        }
        lightDist += square(min(abs(lightPos[i] - maxb[i]), abs(lightPos[i] - minb[i])));
    }

    return lightDist < square(${lightRadius}); // assume light radius is 0.1 in ndc
}

fn clipToWorld(clipPos: vec4f, invViewProj: mat4x4f) -> vec3f {
    var worldPos = invViewProj * clipPos;
    return worldPos.xyz / worldPos.w;
}

fn clipToView(clipPos: vec4f, invProj: mat4x4f) -> vec3f {
    var viewPos = invProj * clipPos;
    viewPos /= viewPos.w;
    return viewPos.xyz;
}

fn screanToView(screePos: vec3f, invProj: mat4x4f) -> vec3f {
    var clipPos = vec4<f32>(screePos, 1.0);
    return clipToView(clipPos, invProj);
}

fn lineIntersectionToZPlane(dir: vec3f, z: f32) -> vec3f {
    return z * normalize(dir);
}

fn lerp(a: vec3f, b: vec3f, t: f32) -> vec3f {
    return a + (b - a) * t;
}

fn hash13(i: u32) -> vec3<f32> {
    let p: f32 = f32(i);
    let q: vec3<f32> = fract(sin(vec3(p, p + 1.0, p + 2.0)) * 43758.5453);
    return fract(q);
}

fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}
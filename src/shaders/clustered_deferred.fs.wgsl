// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

//https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/
fn OctWrap(v: vec2<f32>) -> vec2<f32> {
    var mult = -1.0;
    if (v.x >= 0.0 && v.y >= 0.0) {
        mult = 1.0;
    }
    return (1.0 - abs(v.yx)) * mult;
}
 
fn Encode(n: vec3<f32>) -> vec2<f32> {
    var encoded = n;
    encoded /= (abs(n.x) + abs(n.y) + abs(n.z));
    if (encoded.z < 0.0) {
        var newXY = OctWrap(encoded.xy);
        encoded.x = newXY.x;
        encoded.y = newXY.y;
    }
    encoded.x = encoded.x * 0.5 + 0.5;
    encoded.y = encoded.y * 0.5 + 0.5;
    return encoded.xy;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4u
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var octahedron_nor = Encode(in.nor);
    var uint_nor = pack2x16unorm(octahedron_nor);
    var depth = in.pos.z;
    var packed_col = pack4x8unorm(diffuseColor);

    return vec4u(uint_nor, packed_col, bitcast<u32>(depth), 1);
}

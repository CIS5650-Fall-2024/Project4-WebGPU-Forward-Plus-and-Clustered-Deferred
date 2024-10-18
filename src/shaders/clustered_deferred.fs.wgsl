// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(2) @binding(0) var diffuseTex: texture_2d<f32>;
@group(2) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOutput {
    @location(0) out : vec4u
}

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4u {

    let color = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (color.a < 0.5f) {
        discard;
    }

    let resColor = pack4x8unorm(color);
    let depth : u32 = bitcast<u32>(in.fragPos.z);
    let resNorm = pack2x16unorm(normalEncode(in.nor));

    return vec4u(resColor, resNorm, depth, 0);
}